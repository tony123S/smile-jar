// renderer.js: Smile Monster. Bundled to dist/renderer.bundle.js by build.mjs.
//
// Flow: opening story (once) -> camera consent -> home (the monster's world) -> PLAY ->
// camera starts. The camera is only ever started inside startSession().
//
// SmartSpectra integration lives in buildSdk()/wireSdk(): we request the SDK's face bundle
// (EXPRESSIONS, BLINKING, TALKING), optionally the breathing bundle (for the breathing mirror)
// and the cardio bundle (pulse). Each `metrics` event is decoded and:
//   - face.expression[]  -> SmileDetector (qualifying smiles) + the monster's face
//   - face.blinking[]    -> BlinkTracker  (the monster blinks when you blink)
//   - face.talking[]     -> talkingNow    (the monster "talks" along)
//   - breathing trace    -> BreathNormalizer (the monster's body rises and falls with yours)
// SignalMonitor records which of these actually arrive, and the "Live signals" chips show it.
// Nothing is invented: if a signal never arrives, its chip says so and the monster ignores it.
//
// One qualifying smile = +10 XP (game) and the sponsors' per-smile pledge (real world).
// XP is derived from the smile count, so a smile can never be rewarded twice.

'use strict';

import { SmileDetector, DEFAULTS as SMILE, happyScore } from './src/smile-detector.js';
import { MoodMirror } from './src/mood.js';
import {
  pledgeFor, sessionPledge, marginalRate, formatCents, pledgeStatementCsv, sponsorOwes, confirmedTotal, pledgeLedger,
} from './src/pledges.js';
import * as store from './src/store.js';
import { JOY_REEL } from './src/joy-reel.js';
import { HumourModel, personaFor } from './src/humour.js';
import { MonsterVoice } from './src/monster-voice.js';
import { sfx } from './src/sounds.js';
import { unlockAudio, setAudioPrefs } from './src/audio.js';
import { music } from './src/music.js';
import { drawReceipt } from './src/receipt.js';
import { SimulatedSDK } from './src/simulator.js';
import {
  STAGES, stageFor, eggState, traitsFor, monsterName, monsterSvg, emptyMonster, DIET_KINDS, xpFor, worldTier, XP_PER_SMILE,
} from './src/monster.js';
import { worldSvg } from './src/world.js';
import { SIGNALS, SignalMonitor, BlinkTracker, talkingNow, BreathNormalizer } from './src/signals.js';

const {
  SmartSpectraSDK, ProcessingStatus, ValidationCode, faceMetrics, cardioMetrics, breathingMetrics,
} = require('@smartspectra/node-sdk/renderer');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

/* global __SMARTSPECTRA_API_KEY__, __SIMULATE__ */
const API_KEY = __SMARTSPECTRA_API_KEY__;
const SIMULATE = __SIMULATE__;

const $ = (id) => document.getElementById(id);
let state = store.load();

// ---------------------------------------------------------------- helpers
const VIEWS = ['story', 'consent', 'home', 'campaign', 'session', 'summary'];
let currentView = null;

function musicFor(view) {
  if (view === 'story') return 'story';
  if (view === 'session') return 'play';
  const finalForm = stageFor(state.monster.smiles).key === 'final';
  return finalForm ? 'final' : 'home';
}

function show(view) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  $('topbar').hidden = view === 'story';
  currentView = view;
  document.body.dataset.view = view;
  music.request(musicFor(view));
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}

function persist() {
  if (!store.save(state)) toast('Could not save on this device; progress will reset when the app closes.');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtSecs(ms) {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- audio
// Music and sound start only after the player has interacted with the app.
function applyAudioSettings() {
  const st = state.settings;
  setAudioPrefs({ volume: Number(st.volume ?? 0.7), music: st.music !== false, sfx: st.sound !== false });
  music.sync();
  const mBtn = $('btn-music'), sBtn = $('btn-sfx');
  mBtn.setAttribute('aria-pressed', String(st.music !== false));
  mBtn.textContent = st.music !== false ? '♫ Music on' : '♫ Music off';
  sBtn.setAttribute('aria-pressed', String(st.sound !== false));
  sBtn.textContent = st.sound !== false ? '✦ Sounds on' : '✦ Sounds off';
  const vol = Math.round(Number(st.volume ?? 0.7) * 100);
  $('vol').value = vol;
  $('f-volume').value = vol;
  $('f-music').checked = st.music !== false;
  $('f-sfx').checked = st.sound !== false;
  document.body.dataset.music = st.music !== false ? (music.current || 'waiting') : 'off';
}

function onFirstGesture() {
  if (unlockAudio()) {
    applyAudioSettings();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
  }
}
window.addEventListener('pointerdown', onFirstGesture, true);
window.addEventListener('keydown', onFirstGesture, true);
setInterval(() => { document.body.dataset.music = state.settings.music !== false ? (music.current || 'waiting') : 'off'; }, 1000);

function setSetting(k, v) { state.settings[k] = v; persist(); applyAudioSettings(); }
$('btn-music').addEventListener('click', () => setSetting('music', state.settings.music === false));
$('btn-sfx').addEventListener('click', () => { setSetting('sound', state.settings.sound === false); sfx.click(); });
$('vol').addEventListener('input', (e) => setSetting('volume', Number(e.target.value) / 100));
$('f-volume').addEventListener('input', (e) => setSetting('volume', Number(e.target.value) / 100));
$('f-music').addEventListener('change', (e) => setSetting('music', e.target.checked));
$('f-sfx').addEventListener('change', (e) => setSetting('sound', e.target.checked));
document.addEventListener('visibilitychange', () => {
  // Pause the music while the window is hidden; it resumes where the screen wants it.
  music.request(document.hidden ? null : musicFor(currentView));
});

// ---------------------------------------------------------------- monster
// The saved monster plus whatever the running session has fed it (committed when the session ends).
function liveMonster(s = session) {
  const m = { ...state.monster, diet: { ...state.monster.diet }, snackBy: { ...(state.monster.snackBy || {}) } };
  if (!s) return m;
  m.smiles += s.smiles;
  for (const [k, n] of Object.entries(s.diet)) m.diet[k] = (m.diet[k] || 0) + n;
  for (const [id, n] of Object.entries(s.snack)) m.snackBy[id] = (m.snackBy[id] || 0) + n;
  m.surprises += s.surprises;
  return m;
}

function monsterLook(m) {
  // Heart patches come from sponsors whose snack made *this* monster smile.
  const sponsors = state.campaign.sponsors.map((sp) => ({ ...sp, snackSmiles: m.snackBy?.[sp.id] || 0 }));
  const stage = stageFor(m.smiles);
  const traits = traitsFor(m, sponsors);
  return { stage, traits, name: monsterName(traits, stage.key), xp: xpFor(m.smiles), tier: worldTier(m.smiles) };
}

let uidSeq = 0;
function drawMonster(el, m, live = {}, opts = {}) {
  const { stage, traits } = monsterLook(m);
  const o = { stage: stage.key, traits, live, uid: `m${++uidSeq}`, egg: eggState(m.smiles), ...opts };
  const svg = monsterSvg(o);
  if (el) {
    el.innerHTML = svg;
    // The egg's rocking and shaking live on the wrapper, which is never redrawn, so they don't
    // restart every time a live signal redraws the egg.
    const isEgg = o.stage === 'egg';
    el.classList.toggle('egg', isEgg);
    el.classList.toggle('shake', isEgg && !!o.egg?.shake);
    el.classList.toggle('hatching', isEgg && !!o.egg?.hatching);
  }
  return svg;
}

const drawnTier = {};
function drawWorld(id, tier, { fade = false } = {}) {
  const el = $(id);
  if (drawnTier[id] === tier) return;
  drawnTier[id] = tier;
  el.innerHTML = worldSvg({ tier, uid: `${id}-${tier}` });
  if (fade) { el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade'); }
}

function chapterLine(stage) { return `Chapter ${stage.level} · ${stage.chapter}`; }

function nextLine(stage) {
  if (stage.key === 'egg') return `${plural(stage.toNext, 'more smile', 'more smiles')} until the egg hatches`;
  return stage.next
    ? `${plural(stage.toNext, 'more smile', 'more smiles')} until it grows into a ${stage.next.label}`
    : 'Fully grown, and the whole world is smiling again!';
}

function xpText(xp) {
  return xp.levelSize == null ? `${xp.xp} XP · max level` : `${xp.intoLevel} / ${xp.levelSize} XP`;
}

// Before it hatches, the bar is the egg's happiness bar.
function barText(look, m) {
  if (look.stage.key === 'egg') return `\u{1F497} Happiness ${m.smiles} / ${look.stage.next.at}`;
  return xpText(look.xp);
}
function markBar(fillId, look) { $(fillId).parentElement.classList.toggle('happiness', look.stage.key === 'egg'); }

function xpWidth(xp) { return xp.levelSize == null ? 100 : (xp.intoLevel / xp.levelSize) * 100; }

const TRAIT_HINT = {
  'Pun': 'puns grow tiny horns',
  'Animal fact': 'animal facts grow fluffy ears',
  'Memory': 'memories make it glow',
  'Picture this': 'daydreams give it star freckles',
  'Sponsor snack': 'sponsor snacks add hearts in their colour',
};

function dietLine(m) {
  const eaten = DIET_KINDS.filter((k) => (m.diet[k] || 0) > 0).map((k) => `${k} ${m.diet[k]}`);
  return eaten.length
    ? `What makes it happy: ${eaten.join(' · ')}`
    : `What you smile at shapes how it grows: ${Object.values(TRAIT_HINT).join(', ')}.`;
}

// ---------------------------------------------------------------- story
const SCENES = [
  {
    title: 'A World Without Happiness',
    text: 'Once upon a time, there was a world full of colours. Until one day, all the smiles disappeared...',
    tier: 0, monster: null,
  },
  {
    title: 'The Mysterious Egg',
    text: 'In the very last grey meadow, a mysterious egg was waiting. Something inside was asleep.',
    tier: 0, monster: { face: 'flat', tiny: true },
  },
  {
    title: 'A New Friend',
    text: 'Then, someone came along and smiled. The egg began to glow, and gave a tiny wiggle!',
    tier: 0, spark: true, monster: { face: 'grin', tiny: true },
  },
  {
    title: 'Your Adventure Begins',
    text: 'Every smile fills the egg with happiness. Can you help it hatch, and bring the world back to life?',
    tier: 1, monster: { face: 'grin', cracks: 1 },
  },
];
let sceneIdx = 0;
let storyReturn = 'consent';

function renderScene(i, animate = true) {
  const sc = SCENES[i];
  const apply = () => {
    $('story-world').innerHTML = worldSvg({ tier: sc.tier, spark: !!sc.spark, uid: `story${i}` });
    const mon = $('story-monster');
    mon.hidden = !sc.monster;
    if (sc.monster) {
      mon.classList.toggle('tiny', !!sc.monster.tiny);
      mon.innerHTML = monsterSvg({ stage: 'egg', traits: traitsFor(emptyMonster()), live: { face: sc.monster.face }, egg: { cracks: sc.monster.cracks || 0 }, uid: `sm${i}` });
    }
    $('story-title').textContent = sc.title;
    const t = $('story-text');
    t.textContent = sc.text;
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    $('story-dots').innerHTML = SCENES.map((_, j) => `<span class="${j <= i ? 'on' : ''}"></span>`).join('');
    const last = i === SCENES.length - 1;
    $('btn-story-next').textContent = last ? 'LET’S BEGIN!' : 'Continue';
    $('btn-story-skip').hidden = last;
    $('view-story').classList.remove('leaving');
  };
  if (!animate) { apply(); return; }
  $('view-story').classList.add('leaving');
  setTimeout(apply, 550);
}

function startStory(returnTo) {
  storyReturn = returnTo;
  sceneIdx = 0;
  show('story');
  renderScene(0, false);
}

function finishStory() {
  state.storySeen = true; // only this flag is saved; it holds no personal data
  persist();
  if (storyReturn === 'home' && store.hasConsent(state)) { renderHome(); show('home'); } else { renderConsent(); show('consent'); }
}

$('btn-story-next').addEventListener('click', () => {
  sfx.click();
  if (sceneIdx >= SCENES.length - 1) { sfx.bloom(); finishStory(); return; }
  sceneIdx += 1;
  if (sceneIdx === SCENES.length - 1) setTimeout(() => sfx.bloom(), 600);
  renderScene(sceneIdx);
});
$('btn-story-skip').addEventListener('click', finishStory);
$('btn-replay-story').addEventListener('click', () => startStory('home'));
$('btn-replay-story-2').addEventListener('click', () => startStory('home'));

// ---------------------------------------------------------------- consent
function renderConsent() {
  $('consent-agree').checked = false;
  $('consent-telemetry').checked = false;
  $('consent-accept').disabled = true;
}
$('consent-agree').addEventListener('change', (e) => { $('consent-accept').disabled = !e.target.checked; });
$('consent-accept').addEventListener('click', () => {
  state.consent = { version: store.CONSENT_VERSION, acceptedAt: new Date().toISOString() };
  state.settings.telemetry = $('consent-telemetry').checked;
  if (!state.monster.bornAt) state.monster.bornAt = new Date().toISOString();
  persist();
  renderHome();
  show('home');
});

// ---------------------------------------------------------------- home
function campaignTotals() {
  const smiles = store.totalSmiles(state);
  const { total, lines } = pledgeFor(state.campaign.sponsors, smiles);
  return { smiles, total, lines };
}

function renderChapters(stageIndex, el) {
  el.innerHTML = STAGES.map((s, i) => `<li class="${i < stageIndex ? 'done' : i === stageIndex ? 'now' : ''}" title="${esc(s.chapter)}">${i < stageIndex ? '✓ ' : ''}${i + 1}. ${esc(s.chapter)}</li>`).join('');
}

function renderImpact() {
  const c = state.campaign;
  const { smiles, total } = campaignTotals();
  const goal = Math.max(100, c.goalCents || 0);
  $('home-cause').textContent = c.cause || 'a good cause';
  $('home-total').textContent = formatCents(total);
  $('home-confirmed').textContent = formatCents(confirmedTotal(c.sponsors));
  $('home-smiles').textContent = smiles;
  $('home-goal').textContent = formatCents(goal);
  $('home-progress').style.width = `${Math.min(100, (total / goal) * 100)}%`;
  const rate = marginalRate(c.sponsors, smiles);
  $('home-rate').textContent = c.sponsors.length === 0
    ? 'add a sponsor so your smiles count for charity'
    : rate > 0 ? `your next smile adds ${rate}¢ in pledges` : 'every sponsor has reached their cap';
}

function renderHome() {
  const m = liveMonster(null);
  const look = monsterLook(m);
  drawWorld('home-world', look.tier);
  drawMonster($('home-monster'), m, {});
  $('home-level').textContent = `Lv ${look.stage.level}`;
  $('home-name').textContent = look.name;
  $('home-stage').textContent = chapterLine(look.stage);
  $('home-stage-fill').style.width = `${look.stage.key === 'egg' ? eggState(m.smiles).happiness * 100 : xpWidth(look.xp)}%`;
  $('home-xp').textContent = barText(look, m);
  markBar('home-stage-fill', look);
  $('home-next').textContent = nextLine(look.stage);
  const eaten = DIET_KINDS.some((k) => (m.diet[k] || 0) > 0);
  $('home-diet').hidden = !eaten;
  $('home-diet').textContent = eaten ? dietLine(m) : '';
  $('home-goal-line').textContent = look.stage.key === 'egg'
    ? `\u{1F95A} Press PLAY and smile ${plural(look.stage.toNext, 'time', 'times')} to hatch the egg`
    : look.stage.next
    ? `\u{1F60A} Press PLAY and smile ${plural(look.stage.toNext, 'time', 'times')} to finish Chapter ${look.stage.level}`
    : '\u{1F308} You restored the whole world! Keep playing to raise more for charity.';
  renderChapters(look.stage.index, $('chapter-dots'));
  renderImpact();
}

// ---------------------------------------------------------------- charity & settings
function renderCampaign() {
  const c = state.campaign;
  const { smiles } = campaignTotals();
  const goal = Math.max(100, c.goalCents || 0);
  $('f-cause').value = c.cause;
  $('f-goal').value = Math.round(goal / 100);
  $('f-minutes').value = state.settings.sessionMinutes;
  $('f-pulse').checked = !!state.settings.showPulse;
  $('f-breath').checked = !!state.settings.breathMirror;
  applyAudioSettings();

  const ledger = pledgeLedger(c.sponsors, smiles);
  const body = $('sponsor-rows');
  body.innerHTML = '';
  for (const s of c.sponsors) {
    const l = ledger.find((x) => x.id === s.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="swatch" style="background:${esc(s.color)}"></span><input data-k="name" maxlength="40" aria-label="Sponsor name"></td>
      <td><input data-k="centsPerSmile" type="number" min="0" max="500" step="1" aria-label="Cents per smile"></td>
      <td><input data-k="cap" type="number" min="0" step="1" placeholder="none" aria-label="Cap in dollars"></td>
      <td><input data-k="snack" maxlength="160" placeholder="Optional joke or memory" aria-label="Snack joke"></td>
      <td class="owes">${formatCents(l.pledged)}${l.snackSmiles ? `<div class="muted small">${plural(l.snackSmiles, 'snack smile', 'snack smiles')}</div>` : ''}</td>
      <td><input data-k="confirmed" type="number" min="0" step="0.01" aria-label="Confirmed donated in dollars">
        <div class="small ${l.outstanding ? 'muted' : 'ok-text'}">${l.pledged === 0 ? '' : l.outstanding ? `${formatCents(l.outstanding)} to go` : 'Donated'}</div></td>
      <td><button type="button" class="link danger-link" aria-label="Remove sponsor">Remove</button></td>`;
    tr.querySelector('[data-k=name]').value = s.name;
    tr.querySelector('[data-k=centsPerSmile]').value = s.centsPerSmile;
    tr.querySelector('[data-k=cap]').value = s.capCents ? Math.round(s.capCents / 100) : '';
    tr.querySelector('[data-k=snack]').value = s.snack || '';
    tr.querySelector('[data-k=confirmed]').value = s.confirmedCents ? (s.confirmedCents / 100).toFixed(2) : '';
    tr.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      const v = e.target.value;
      if (k === 'name') s.name = v.trim() || 'Sponsor';
      if (k === 'centsPerSmile') s.centsPerSmile = Math.max(0, Math.round(Number(v) || 0));
      if (k === 'cap') s.capCents = v === '' ? 0 : Math.max(0, Math.round(Number(v) * 100));
      if (k === 'snack') s.snack = v.trim();
      if (k === 'confirmed') s.confirmedCents = v === '' ? 0 : Math.max(0, Math.round(Number(v) * 100));
      persist();
      renderCampaign();
    });
    tr.querySelector('button').addEventListener('click', () => {
      c.sponsors = c.sponsors.filter((x) => x !== s);
      persist();
      renderCampaign();
    });
    body.appendChild(tr);
  }

  const hist = $('history');
  hist.innerHTML = '';
  $('history-empty').hidden = state.sessions.length > 0;
  for (const s of state.sessions.slice().reverse().slice(0, 20)) {
    const li = document.createElement('li');
    const d = new Date(s.endedAt);
    li.innerHTML = `<span>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span>${plural(s.smiles, 'smile', 'smiles')}</span><span>${(s.durationMs / 60000).toFixed(1)} min</span><strong>${formatCents(s.pledgedCents)}</strong>`;
    hist.appendChild(li);
  }
  for (const p of state.pastMonsters.slice().reverse().slice(0, 5)) {
    const li = document.createElement('li');
    li.className = 'past';
    li.innerHTML = `<span>Retired ${new Date(p.retiredAt).toLocaleDateString()}</span><span>${esc(p.name)}</span><span>${esc(p.stage)}</span><strong>${plural(p.smiles, 'smile', 'smiles')}</strong>`;
    hist.appendChild(li);
  }
}

function openCampaign() { renderCampaign(); show('campaign'); }
$('btn-settings').addEventListener('click', () => { if (store.hasConsent(state) && !session) openCampaign(); });
$('btn-open-campaign').addEventListener('click', openCampaign);
$('btn-back-home').addEventListener('click', () => { renderHome(); show('home'); });
$('btn-open-privacy').addEventListener('click', () => { renderPrivacy(); dlg.showModal(); });

$('f-cause').addEventListener('change', (e) => { state.campaign.cause = e.target.value.trim() || 'a good cause'; persist(); renderCampaign(); });
$('f-goal').addEventListener('change', (e) => { state.campaign.goalCents = Math.max(1, Math.round(Number(e.target.value) || 25)) * 100; persist(); renderCampaign(); });
$('f-minutes').addEventListener('change', (e) => { state.settings.sessionMinutes = Math.min(15, Math.max(1, Math.round(Number(e.target.value) || 2))); persist(); renderCampaign(); });
$('f-pulse').addEventListener('change', (e) => { state.settings.showPulse = e.target.checked; persist(); });
$('f-breath').addEventListener('change', (e) => { state.settings.breathMirror = e.target.checked; persist(); });
$('btn-add-sponsor').addEventListener('click', () => {
  const i = state.campaign.sponsors.length;
  state.campaign.sponsors.push(store.normalizeSponsor({ id: `s${Date.now()}`, name: 'New sponsor', centsPerSmile: 5 }, i));
  persist();
  renderCampaign();
});
$('btn-export').addEventListener('click', () => {
  const csv = pledgeStatementCsv(state.campaign, state.sessions);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `smile-monster-pledges-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('btn-reset-monster').addEventListener('click', () => {
  const m = liveMonster(null);
  const look = monsterLook(m);
  if (!confirm(`Say goodbye to ${look.name} and raise a new baby monster? Pledges and game totals are kept.`)) return;
  if (m.smiles > 0) state.pastMonsters.push({ name: look.name, stage: look.stage.label, smiles: m.smiles, retiredAt: new Date().toISOString() });
  state.monster = { ...emptyMonster(), bornAt: new Date().toISOString() };
  persist();
  renderCampaign();
  toast('A new little monster was born.');
});

// ---------------------------------------------------------------- play
// PLAY starts the game. The first time, a 3-step "How to play" guide comes first; it can be
// reopened any time from the home screen.
const howto = $('howto');
let playAfterHowTo = false;
function openHowTo(thenPlay = false) {
  playAfterHowTo = thenPlay;
  $('btn-howto-go').textContent = thenPlay ? 'Got it, let\u2019s play!' : 'Got it!';
  howto.showModal();
}
$('btn-howto').addEventListener('click', () => { sfx.click(); openHowTo(false); });
$('btn-howto-go').addEventListener('click', () => {
  howto.close();
  state.settings.howToSeen = true;
  persist();
  const play = playAfterHowTo;
  playAfterHowTo = false;
  if (play) startSession();
});
$('btn-play').addEventListener('click', () => {
  sfx.click();
  if (!state.settings.howToSeen) openHowTo(true); else startSession();
});

// ---------------------------------------------------------------- session
const STATUS = Object.fromEntries(Object.entries(ProcessingStatus).map(([k, v]) => [v, k]));
const HINTS = {
  [ValidationCode.kOk]: 'Looking good. Smile away!',
  [ValidationCode.kNoFaceFound]: 'I can’t see a face. Sit in front of the camera.',
  [ValidationCode.kMultipleFacesFound]: 'More than one face. One smiler at a time, please.',
  [ValidationCode.kFaceNotCentered]: 'Move to the middle of the frame.',
  [ValidationCode.kFaceSizeOutOfRange]: 'Adjust your distance from the camera.',
  [ValidationCode.kTooDark]: 'It’s a bit dark. Add some light.',
  [ValidationCode.kTooBright]: 'Too bright. Avoid light behind or right on you.',
  [ValidationCode.kChestNotVisible]: 'Sit back a little so your chest is in view (for breathing).',
  [ValidationCode.kCameraTuning]: 'Tuning the camera...',
  [ValidationCode.kFrameRateTooLow]: 'Camera frame rate is low. Close other camera apps.',
  [ValidationCode.kExcessiveMotion]: 'Hold still for a moment.',
  [ValidationCode.kFaceTooClose]: 'A little further back.',
  [ValidationCode.kFaceTooFar]: 'Come a little closer.',
  [ValidationCode.kFaceTooHigh]: 'Move down a little.',
  [ValidationCode.kFaceTooLow]: 'Move up a little.',
  [ValidationCode.kFaceNotForward]: 'Face the camera.',
};

let sdk = null;
let detector = null;
let session = null;
let lastSummary = null;
let lastReceipt = null;

function setHint(text, kind = '') {
  const h = $('hint');
  h.textContent = text;
  h.className = `hint ${kind}`;
}

function showError(msg) {
  const e = $('error');
  e.textContent = msg;
  e.hidden = !msg;
}

function reelCards() {
  const snacks = state.campaign.sponsors
    .filter((s) => (s.snack || '').trim())
    .map((s) => ({ kind: 'Sponsor snack', text: s.snack.trim(), sponsorId: s.id, from: s.name }));
  return [...JOY_REEL, ...snacks];
}

function nextCard() {
  if (!session) return;
  const now = Date.now();
  const card = session.humour.next(now);
  $('reel-kind').textContent = card.kind;
  const rt = $('reel-text');
  rt.textContent = card.text;
  rt.classList.remove('in'); void rt.offsetWidth; rt.classList.add('in');
  $('reel-from').hidden = !card.sponsorId;
  $('reel-from').textContent = card.sponsorId ? `A snack from ${card.from}` : '';
  const fav = session.humour.favourite();
  const learned = session.humour.lastPickWasLearned && fav === card.kind;
  $('reel-why').textContent = learned
    ? `Picked for you: you smile at ${card.kind.toLowerCase()}s`
    : '';
  if (card.sponsorId) {
    const line = session.voice.onSnack(now);
    if (line) speak(line.text);
  } else if (learned && !session.toldLearned) {
    const line = session.voice.onLearned(now);
    if (line) { session.toldLearned = true; speak(line.text); }
  }
  renderTaste();
}

function renderTaste() {
  const rows = session.humour.summary().filter((r) => r.smiles > 0);
  $('s-taste').textContent = rows.length
    ? `What makes you smile: ${rows.map((r) => `${r.kind} ${r.smiles}`).join(' · ')}`
    : '';
}

function speak(text) {
  const b = $('s-speech');
  b.textContent = text;
  b.hidden = false;
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
  clearTimeout(speak.t);
  speak.t = setTimeout(() => { b.hidden = true; }, 2600);
}

$('btn-next-card').addEventListener('click', () => { nextCard(); restartReelTimer(); });
function restartReelTimer() {
  clearInterval(session?.reelTimer);
  if (session) session.reelTimer = setInterval(nextCard, 9000);
}

$('clip-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  const clip = $('clip');
  if (clip.src) URL.revokeObjectURL(clip.src);
  if (!file) { clip.hidden = true; return; }
  clip.src = URL.createObjectURL(file); // stays local; never uploaded
  clip.hidden = false;
  $('reel-text').hidden = true;
  clip.play().catch(() => {});
});

function updateMeter(level) {
  const pct = Math.round(Math.max(0, Math.min(100, level)));
  $('meter-fill').style.width = `${pct}%`;
  $('meter-fill').classList.toggle('hot', pct >= SMILE.onThreshold);
  $('meter-value').textContent = `${pct}%`;
}

/** Floating "+10 XP" / "+15¢" / heart pops above the monster. */
function popAt(text, cls, dx = 0, delay = 0) {
  setTimeout(() => {
    const box = $('s-monster').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${box.left + box.width / 2 - 30 + dx}px`;
    el.style.top = `${box.top + box.height * 0.25}px`;
    $('pop-layer').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }, delay);
}

// Live mirror state, filled only from real SDK signals (or the labelled simulator).
function liveFace() {
  const s = session;
  if (!s) return {};
  const now = Date.now();
  return {
    face: s.face,
    // a wink keeps one eye open, so it takes over from the blink that triggered it
    eyesClosed: now >= s.winkUntil && (s.blink.closed || now < s.eyesClosedUntil),
    wink: now < s.winkUntil,
    breath: state.settings.breathMirror ? s.breath.level() : null,
    talking: !!s.talking,
    talkOpen: !!s.talking && Math.floor(now / 170) % 2 === 0,
  };
}

function renderMonsterNow() {
  if (!session) return;
  const m = liveMonster();
  const look = monsterLook(m);
  const hatching = session.hatching ? { stage: 'egg', egg: { cracks: 3, shake: true, hatching: true } } : {};
  drawMonster($('s-monster'), m, liveFace(), hatching);
  drawWorld('s-world', look.tier, { fade: true });
  $('s-level').textContent = `Lv ${look.stage.level}`;
  $('s-name').textContent = look.name;
  $('s-stage').textContent = chapterLine(look.stage);
  $('s-stage-fill').style.width = `${look.stage.key === 'egg' ? eggState(m.smiles).happiness * 100 : xpWidth(look.xp)}%`;
  markBar('s-stage-fill', look);
  $('s-xp').textContent = look.stage.key === 'egg'
    ? `${barText(look, m)} \u00b7 ${plural(look.stage.toNext, 'smile', 'smiles')} to hatch`
    : look.stage.next
    ? `${xpText(look.xp)} \u00b7 ${plural(look.stage.toNext, 'smile', 'smiles')} to grow`
    : xpText(look.xp);
}

// Metrics arrive many times a second; redraw the monster at most once per frame.
let monsterDirty = false;
function scheduleMonster() {
  if (monsterDirty) return;
  monsterDirty = true;
  requestAnimationFrame(() => { monsterDirty = false; renderMonsterNow(); });
}

function renderSignals() {
  if (!session) return;
  const st = session.signals.status(Date.now());
  const requested = {
    expressions: true, blinking: true, talking: true,
    breathing: !!state.settings.breathMirror, pulse: !!state.settings.showPulse,
  };
  $('signal-chips').innerHTML = SIGNALS.map(({ key, label }) => {
    const s = st[key];
    const cls = !requested[key] ? 'off' : s.live ? 'live' : s.seen ? 'stale' : 'wait';
    const word = !requested[key] ? 'off' : s.live ? 'live' : s.seen ? 'paused' : 'waiting';
    return `<span class="chip ${cls}" title="${s.count} samples received">${label}: ${word}</span>`;
  }).join('');
  $('s-blinks').textContent = st.blinking.seen
    ? `Blinks seen: ${session.blink.blinks}${session.talking ? ' · you’re talking' : ''}`
    : '';
}

function renderSession() {
  if (!session) return;
  const calm = session.mood.tick(Date.now()); // relax if the face has gone quiet
  applyMood(calm, new Set(calm.events), Date.now());
  const cents = sessionPledge(state.campaign.sponsors, session.before, session.smiles);
  $('s-smiles').textContent = session.smiles;
  $('s-money').textContent = formatCents(cents);
  renderSignals();
  const left = Math.max(0, session.deadline - Date.now());
  $('s-timer').textContent = fmtSecs(left + 999);
  if (left <= 0) endSession();
}

function popBadge(text, kind) {
  const b = $('s-badge');
  b.textContent = text;
  b.className = `badge ${kind}`;
  b.hidden = false;
  void b.offsetWidth; // restart the pop animation
  b.classList.add('pop');
  clearTimeout(popBadge.t);
  popBadge.t = setTimeout(() => { b.hidden = true; }, 2200);
}

function bounceClass(cls, ms) {
  const card = $('monster-card');
  card.classList.remove(cls);
  void card.offsetWidth;
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), ms);
}

const HATCH_SHAKE_MS = 1300;

// The egg shakes hard for a moment, the shell bursts, and the baby pops out.
function hatchEgg(to) {
  const s = session;
  s.hatching = true;
  sfx.eggShake();
  setTimeout(() => sfx.eggShake(), 420);
  setTimeout(() => sfx.eggShake(), 840);
  popBadge('The egg is hatching!', 'evolve');
  scheduleMonster();
  setTimeout(() => {
    if (session !== s) return;
    s.hatching = false;
    sfx.hatch();
    bounceClass('hatched', 1400);
    shellBurst();
    popBadge(`It hatched! Say hi to your ${to.label}!`, 'evolve');
    speak(s.voice.onEvolve(Date.now()).text);
    for (let i = 0; i < 6; i++) popAt('♥', 'heart', (i - 2.5) * 34, 200 + i * 120);
    renderMonsterNow();
  }, HATCH_SHAKE_MS);
  s.evolutions.push(to);
}

function shellBurst() {
  const box = $('s-monster').getBoundingClientRect();
  for (const side of ['left', 'right']) {
    const el = document.createElement('div');
    el.className = `shell ${side}`;
    el.innerHTML = `<svg viewBox="0 0 60 50" width="60" height="50"><path d="${side === 'left' ? 'M4 46 C4 22 18 4 40 4 l-6 12 l10 8 l-8 10 l8 12 z' : 'M56 46 C56 22 42 4 20 4 l6 12 l-10 8 l8 10 l-8 12 z'}" fill="#fffaf0" stroke="#4a3b5c" stroke-width="3" stroke-linejoin="round"/></svg>`;
    el.style.left = `${box.left + box.width / 2 - 30}px`;
    el.style.top = `${box.top + box.height * 0.45}px`;
    $('pop-layer').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

function celebrateEvolution(from, to) {
  if (from.key === 'egg') { hatchEgg(to); return; }
  bounceClass('evolving', 1700);
  sfx.evolve(to.level);
  sfx.chapter();
  popBadge(`Chapter ${from.level} complete! Now: ${to.chapter}`, 'evolve');
  speak(session.voice.onEvolve(Date.now()).text);
  for (let i = 0; i < 6; i++) popAt('♥', 'heart', (i - 2.5) * 34, 200 + i * 120);
  session.evolutions.push(to);
}

const COMBO_WINDOW_MS = 8000;
const GOLDEN_AT = 92;

function onSmile(peakHappy = 0) {
  const s = session;
  const sponsors = state.campaign.sponsors;
  const worth = marginalRate(sponsors, s.before + s.smiles);
  const before = stageFor(liveMonster().smiles);
  const tierBefore = worldTier(liveMonster().smiles);
  s.smiles += 1; // the single place a qualifying smile is counted; XP and pledges both derive from it
  const now = Date.now();
  s.combo = now - s.lastSmileAt <= COMBO_WINDOW_MS ? s.combo + 1 : 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.lastSmileAt = now;
  const golden = peakHappy >= GOLDEN_AT;
  if (golden) s.golden += 1;

  // Feed the monster whatever was on screen when the smile started.
  const card = s.humour.creditSmile(now);
  const kind = card?.kind || 'Pun';
  s.diet[kind] = (s.diet[kind] || 0) + 1;
  let snackFrom = null;
  if (card?.sponsorId) {
    s.snack[card.sponsorId] = (s.snack[card.sponsorId] || 0) + 1;
    snackFrom = sponsors.find((x) => x.id === card.sponsorId) || null;
  }
  renderTaste();

  // Game world: happiness energy and XP. Real world: the sponsors' pledge.
  popAt(`+${XP_PER_SMILE} XP`, golden ? 'xp gold' : 'xp', -40);
  if (worth > 0) popAt(`+${worth}¢ for charity`, 'cents', 40, 180);
  const xpBar = $('s-stage-fill').parentElement;
  xpBar.classList.remove('gain'); void xpBar.offsetWidth; xpBar.classList.add('gain');
  if (before.key === 'egg') bounceClass('egg-wiggle', 650);
  else bounceClass('happy', 520);

  if (golden) sfx.golden();
  else { sfx.smile(); if (s.combo > 1) sfx.combo(s.combo); }
  if (before.key === 'egg') sfx.eggShake(); else sfx.happy();
  sfx.xp();
  if (snackFrom) sfx.snack();
  speak(s.voice.onSmile({ golden, combo: s.combo }, now).text);

  const after = stageFor(liveMonster().smiles);
  const tierAfter = worldTier(liveMonster().smiles);
  if (tierAfter !== tierBefore && tierAfter >= 1) setTimeout(() => sfx.bloom(), 450); // the world comes back a little
  if (after.index > before.index) celebrateEvolution(before, after);
  else if (tierBefore === 0) popBadge('The egg is glowing!', 'evolve');
  else if (after.key === 'egg') popBadge('Crack! Something is moving inside...', 'evolve');
  else if (snackFrom) popBadge(`${snackFrom.name}’s snack got you!`, 'snack');
  else if (golden) popBadge(s.combo > 1 ? `Golden grin! Combo x${s.combo}` : 'Golden grin!', 'gold');
  else if (s.combo > 1) popBadge(`Combo x${s.combo}!`, 'combo');
  renderSession();
  scheduleMonster();
}

// Show the smoothed mood on the monster, and react to its one-off moments.
function applyMood(mood, events, now) {
  const s = session;
  if (!mood || !s) return;
  if (events.has('jump')) {
    s.surprises += 1; // big sparkly eyes grow with surprise moments
    bounceClass('jump', 700);
    popBadge('Whoa!', 'wow');
    sfx.wow();
  }
  if (events.has('extra')) {
    popBadge('Extra happy!', 'gold');
    speak(s.voice.onExtra(now).text);
    sfx.happy();
    for (let i = 0; i < 4; i++) popAt('♥', 'heart', (i - 1.5) * 40, i * 140);
  }
  if (mood.face !== s.face) { s.face = mood.face; scheduleMonster(); }
}

function handleMetrics(m) {
  const s = session;
  if (!s || !detector) return;
  const now = Date.now();
  s.signals.observe(m, now);
  const f = m.face;

  const expressions = f?.expression;
  if (expressions?.length) {
    // Process sample by sample so each counted smile is rewarded exactly once.
    for (const e of expressions) {
      const before = detector.count;
      detector.pushExpressions([e]);
      if (detector.count > before) onSmile(happyScore(e));
      if (!session) return; // the session may have ended inside onSmile
    }
    updateMeter(detector.level);
    // The monster's face comes from the smoothed mood, not the raw latest score, so it doesn't flicker.
    let mood;
    const events = new Set();
    for (const e of expressions) { mood = s.mood.push(e, now); mood.events.forEach((x) => events.add(x)); }
    applyMood(mood, events, now);
    const face = s.face;
    const line = s.voice.onTick({ face }, now);
    if (line) speak(line.text);
  }

  if (f?.blinking?.length) {
    const wasClosed = s.blink.closed;
    if (s.blink.push(f.blinking) > 0) {
      // it blinks back, and every few blinks it winks instead
      if (s.mood.blink() === 'wink') { s.winkUntil = now + 500; setTimeout(scheduleMonster, 510); }
      else { s.eyesClosedUntil = now + 160; setTimeout(scheduleMonster, 170); } // keep very short blinks visible
    }
    if (s.blink.closed !== wasClosed || s.eyesClosedUntil > now) scheduleMonster();
  }

  if (f?.talking?.length) {
    const t = talkingNow(f.talking);
    if (t !== s.talking) {
      s.talking = t;
      clearInterval(s.talkTimer);
      if (t) {
        s.talkTimer = setInterval(scheduleMonster, 170); // mouth moves while the SDK says you're talking
        const line = s.voice.onTalking(now);
        if (line) speak(line.text);
      }
      scheduleMonster();
    }
  }

  if (state.settings.breathMirror) {
    const br = m.breathing;
    const trace = br?.upperTrace?.length ? br.upperTrace : br?.lowerTrace;
    if (trace?.length) { s.breath.push(trace); scheduleMonster(); }
  }

  const pr = m.cardio?.pulseRate;
  if (pr?.length && state.settings.showPulse) {
    const v = pr[pr.length - 1].value;
    if (v > 0) $('pulse-value').textContent = Math.round(v);
  }
}

function buildSdk() {
  const requestedMetrics = [...faceMetrics];
  if (state.settings.breathMirror) requestedMetrics.push(...breathingMetrics);
  if (state.settings.showPulse) requestedMetrics.push(...cardioMetrics);

  if (SIMULATE) return new SimulatedSDK({ requestPulse: state.settings.showPulse });

  if (!API_KEY) throw new Error('No SmartSpectra API key in this build. Add SMARTSPECTRA_API_KEY to .env and run npm start again.');
  return new SmartSpectraSDK({
    apiKey: API_KEY,
    requestedMetrics,
    enableAccumulatedOutput: false,
    enableTelemetry: !!state.settings.telemetry, // opt-in from the consent screen
  });
}

function wireSdk(s) {
  s.on('processingStatus', (status) => {
    const name = STATUS[status] || String(status);
    if (status === ProcessingStatus.kStarting) setHint('Starting the SDK...');
    if (status === ProcessingStatus.kRunning) setHint('Running. Smile when something makes you happy!', 'ok');
    if (status === ProcessingStatus.kError) setHint(`SDK error (${name}).`, 'err');
  });
  s.on('validationStatus', (code, _ts, hint) => {
    let text = HINTS[code] || hint || 'Adjusting...';
    setHint(text, code === ValidationCode.kOk ? 'ok' : code === ValidationCode.kCameraTuning ? 'warn' : 'err');
  });
  s.on('metrics', (buf) => {
    try {
      handleMetrics(SIMULATE ? buf : decodeMetrics(buf));
    } catch (err) {
      console.error('[smile-monster] could not handle metrics', err);
    }
  });
  s.on('error', (code, message, retryable) => {
    const extra = code === 2 ? ' Check SMARTSPECTRA_API_KEY in .env.'
      : code === 4 ? ' Your Presage account is out of credits.' : '';
    showError(`SmartSpectra error ${code}: ${message}${retryable ? ' (retryable)' : ''}.${extra}`);
  });
  s.on('streamAvailable', (stream) => {
    const v = $('preview');
    v.srcObject = stream;
    v.play().catch(() => {});
    $('cam-placeholder').hidden = true;
    $('cam-live').hidden = false;
  });
}

async function startSession() {
  if (!store.hasConsent(state)) { renderConsent(); show('consent'); return; }
  showError('');
  detector = new SmileDetector();
  const now = Date.now();
  session = {
    startedAt: now,
    deadline: now + state.settings.sessionMinutes * 60000,
    smiles: 0,
    before: store.totalSmiles(state),
    stageAtStart: stageFor(state.monster.smiles),
    humour: new HumourModel(reelCards()),
    voice: new MonsterVoice(),
    signals: new SignalMonitor(),
    blink: new BlinkTracker(),
    breath: new BreathNormalizer(),
    eyesClosedUntil: 0,
    winkUntil: 0,
    mood: new MoodMirror(),
    talking: false,
    talkTimer: null,
    toldLearned: false,
    face: 'flat',
    combo: 0,
    bestCombo: 0,
    lastSmileAt: -Infinity,
    golden: 0,
    diet: {},
    snack: {},
    surprises: 0,
    evolutions: [],
  };
  $('s-badge').hidden = true;
  $('s-speech').hidden = true;
  $('s-blinks').textContent = '';
  sfx.start();
  $('pulse-row').hidden = !state.settings.showPulse;
  $('pulse-value').textContent = '--';
  $('reel-text').hidden = false;
  $('clip').hidden = true;
  $('meter-mark').style.left = `${SMILE.onThreshold}%`;
  updateMeter(0);
  setHint('Starting the SDK...');
  delete drawnTier['s-world'];
  nextCard();
  restartReelTimer();
  show('session');
  renderMonsterNow();
  renderSession();
  speak(session.voice.start(now).text);
  session.timer = setInterval(renderSession, 500);

  try {
    sdk = buildSdk();
    wireSdk(sdk);
    if (SIMULATE) { $('cam-placeholder').textContent = 'Simulated camera'; }
    await sdk.start(); // the SDK acquires the camera here: after consent, and only when a game starts
  } catch (err) {
    showError(err.message || String(err));
    setHint('Could not start.', 'err');
  }
}

async function stopSdk() {
  const s = sdk;
  sdk = null;
  if (s) {
    try { await s.stop(); } catch (err) { console.warn('[smile-monster] stop failed', err); }
    try { s.destroy(); } catch { /* already destroyed */ }
  }
  const v = $('preview');
  v.srcObject = null;
  $('cam-placeholder').hidden = false;
  $('cam-placeholder').textContent = 'Camera off';
  $('cam-live').hidden = true;
}

let ending = false;
async function endSession() {
  if (!session || ending) return;
  ending = true;
  clearInterval(session.timer);
  clearInterval(session.reelTimer);
  clearInterval(session.talkTimer);
  const s = session;
  const now = Date.now();
  const signalStatus = s.signals.status(now);
  session = null;
  await stopSdk();
  const clip = $('clip');
  clip.pause();
  if (clip.src) { URL.revokeObjectURL(clip.src); clip.removeAttribute('src'); }
  $('clip-file').value = '';

  // Commit what the session fed the monster, remembering the deltas so "Don't save" can undo them.
  const delta = { smiles: s.smiles, diet: { ...s.diet }, snack: { ...s.snack }, surprises: s.surprises };
  applyMonsterDelta(delta, 1);

  const sponsors = state.campaign.sponsors;
  const record = {
    id: `x${s.startedAt}`,
    endedAt: new Date().toISOString(),
    durationMs: now - s.startedAt,
    smiles: s.smiles,
    pledgedCents: sessionPledge(sponsors, s.before, s.smiles),
  };
  state.sessions.push(record);
  persist();
  lastSummary = { record, delta };

  const m = liveMonster(null);
  const look = monsterLook(m);
  drawWorld('sum-world', look.tier);
  drawMonster($('summary-monster'), m, { face: s.smiles > 0 ? 'grin' : 'flat' });
  $('sum-level').textContent = `Lv ${look.stage.level}`;
  $('sum-stage').textContent = chapterLine(look.stage);
  $('sum-name').textContent = look.name;
  $('sum-evolved').hidden = s.evolutions.length === 0;
  $('sum-evolved').textContent = s.evolutions.length
    ? `It grew up this game: ${[s.stageAtStart.label, ...s.evolutions.map((x) => x.label)].join(' → ')}`
    : '';
  $('sum-xp').textContent = `+${s.smiles * XP_PER_SMILE} XP · ${xpText(look.xp)} · ${nextLine(look.stage)}`;

  const unit = record.smiles === 1 ? 'qualifying smile' : 'qualifying smiles';
  $('sum-smiles').textContent = record.smiles;
  $('sum-unit').textContent = unit;
  $('sum-money').textContent = formatCents(record.pledgedCents);
  $('sum-cause').textContent = state.campaign.cause;

  // Per sponsor: what this game added to their pledge, and credit for their snack.
  const sponsorLines = sponsors.map((sp) => {
    const cents = sponsorOwes(sp, s.before + s.smiles) - sponsorOwes(sp, s.before);
    const capped = sp.capCents > 0 && sponsorOwes(sp, s.before + s.smiles) >= sp.capCents;
    return { name: sp.name, color: sp.color, cents, capped, snack: s.snack[sp.id] || 0 };
  });
  $('sum-sponsors').innerHTML = sponsorLines.map((l) => `<li><span class="swatch" style="background:${esc(l.color)}"></span>
    <strong>${esc(l.name)}</strong> pledged ${formatCents(l.cents)}${l.capped ? ' (cap reached)' : ''}${l.snack ? ` · their snack earned ${plural(l.snack, 'smile', 'smiles')}` : ''}</li>`).join('');

  const extras = [];
  if (s.bestCombo > 1) extras.push(`Best combo: x${s.bestCombo}`);
  if (s.golden > 0) extras.push(`Golden grins: ${s.golden}`);
  if (s.surprises > 0) extras.push(`Surprise moments: ${s.surprises}`);
  if (signalStatus.blinking.seen) extras.push(`Blinks mirrored: ${s.blink.blinks}`);
  const fav = s.humour.favourite();
  const persona = fav
    ? `You're ${personaFor(fav)}`
    : '';
  $('sum-extras').textContent = extras.join(' · ');
  $('sum-persona').textContent = persona;

  const totalSmiles = store.totalSmiles(state);
  lastReceipt = {
    title: 'Smile Monster',
    monsterSvg: drawMonster(null, m, { face: 'grin' }, { standalone: true, backdrop: true }),
    monsterName: look.name,
    stageLabel: `Level ${look.stage.level} · ${look.stage.chapter}`,
    headline: `${record.smiles} ${unit}`,
    pledged: formatCents(record.pledgedCents),
    cause: state.campaign.cause,
    sponsors: sponsorLines.map((l) => ({ name: l.name, color: l.color, amount: formatCents(l.cents), note: l.snack ? `snack: ${plural(l.snack, 'smile', 'smiles')}` : l.capped ? 'cap reached' : '' })),
    campaignPledged: formatCents(pledgeFor(sponsors, totalSmiles).total),
    campaignConfirmed: formatCents(confirmedTotal(sponsors)),
    lines: extras,
    persona,
    date: new Date(),
  };
  $('receipt-preview').hidden = true;
  show('summary');
  if (s.evolutions.length) sfx.levelUp();
  ending = false;
}
$('btn-end').addEventListener('click', endSession);

function applyMonsterDelta(d, sign) {
  const m = state.monster;
  m.smiles = Math.max(0, m.smiles + sign * d.smiles);
  for (const [k, n] of Object.entries(d.diet)) m.diet[k] = Math.max(0, (m.diet[k] || 0) + sign * n);
  m.snackBy ||= {};
  for (const [id, n] of Object.entries(d.snack)) {
    m.snackBy[id] = Math.max(0, (m.snackBy[id] || 0) + sign * n);
    const sp = state.campaign.sponsors.find((x) => x.id === id);
    if (sp) sp.snackSmiles = Math.max(0, (sp.snackSmiles || 0) + sign * n);
  }
  m.surprises = Math.max(0, m.surprises + sign * d.surprises);
}

$('btn-receipt').addEventListener('click', async () => {
  if (!lastReceipt) return;
  const blob = await drawReceipt(lastReceipt);
  if (!blob) { toast('Could not draw the receipt.'); return; }
  const url = URL.createObjectURL(blob);
  const img = $('receipt-preview');
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.src = url;
  img.dataset.url = url;
  img.hidden = false;
  const a = document.createElement('a');
  a.href = url;
  a.download = `smile-receipt-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  toast('Smile Receipt saved. Send it to your sponsors!');
});
$('btn-done').addEventListener('click', () => { renderHome(); show('home'); });
$('btn-discard').addEventListener('click', () => {
  if (lastSummary) {
    state.sessions = state.sessions.filter((x) => x.id !== lastSummary.record.id);
    applyMonsterDelta(lastSummary.delta, -1);
  }
  lastSummary = null;
  lastReceipt = null;
  persist();
  renderHome();
  show('home');
  toast('Game removed. Your monster forgot it ever happened.');
});

// ---------------------------------------------------------------- privacy
const dlg = $('privacy');
function renderPrivacy() {
  $('pv-telemetry').textContent = state.settings.telemetry ? 'on (you opted in)' : 'off';
  $('pv-telemetry-toggle').checked = !!state.settings.telemetry;
}
$('nav-privacy').addEventListener('click', () => { renderPrivacy(); dlg.showModal(); });
$('btn-close-privacy').addEventListener('click', () => dlg.close());
$('pv-telemetry-toggle').addEventListener('change', (e) => {
  state.settings.telemetry = e.target.checked;
  persist();
  renderPrivacy();
  toast('Applies from your next game.');
});
$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('Delete your consent, monster, campaign, sponsors and every game total from this device?')) return;
  if (session) { clearInterval(session.timer); clearInterval(session.reelTimer); clearInterval(session.talkTimer); session = null; await stopSdk(); }
  state = store.wipe();
  lastSummary = null;
  lastReceipt = null;
  dlg.close();
  applyAudioSettings();
  startStory('consent');
  toast('All Smile Monster data deleted.');
});

window.addEventListener('beforeunload', () => { if (sdk) { try { sdk.destroy(); } catch { /* ignore */ } } });

// ---------------------------------------------------------------- boot
$('sim-banner').hidden = !SIMULATE;
applyAudioSettings();
if (!state.storySeen) startStory(store.hasConsent(state) ? 'home' : 'consent');
else if (store.hasConsent(state)) { renderHome(); show('home'); }
else { renderConsent(); show('consent'); }
