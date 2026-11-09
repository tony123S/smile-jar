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
import { Wanderer } from './src/behaviour.js';
import {
  pledgeFor, sessionPledge, marginalRate, formatCents, pledgeStatementCsv, sponsorOwes, confirmedTotal, pledgeLedger,
} from './src/pledges.js';
import * as store from './src/store.js';
import { JOY_REEL } from './src/joy-reel.js';
import { HumourModel, personaFor } from './src/humour.js';
import { MonsterVoice } from './src/monster-voice.js';
import { sfx } from './src/sounds.js';
import { unlockAudio, setAudioPrefs, holdDuck } from './src/audio.js';
import { MomoVoice } from './src/adventure/voice.js';
import { music } from './src/music.js';
import { drawReceipt } from './src/receipt.js';
import { SimulatedSDK } from './src/simulator.js';
import {
  STAGES, stageFor, eggState, traitsFor, monsterName, monsterSvg, emptyMonster, DIET_KINDS, xpFor, worldTier, XP_PER_SMILE,
} from './src/monster.js';
import { worldSvg } from './src/world.js';
import { SIGNALS, SignalMonitor, BlinkTracker, talkingNow, BreathNormalizer } from './src/signals.js';
import { ExpressionControls, controlScheme } from './src/adventure/controls.js';
import { AdventureLevel } from './src/adventure/engine.js';
import { LEVELS, isPlayable, levelById, recordLevel } from './src/adventure/levels.js';
import { sceneSvg, thingSvg, bossSvg } from './src/adventure/scenes.js';

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
const VIEWS = ['story', 'consent', 'home', 'world', 'session', 'summary'];
let currentView = null;

function musicFor(view) {
  if (view === 'story') return 'story';
  if (view === 'session') return session?.adv ? 'adventure' : 'play';
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
const momoVoice = new MomoVoice({
  synth: globalThis.speechSynthesis || null,
  Utterance: globalThis.SpeechSynthesisUtterance || null,
  onTalk: (talking) => holdDuck(talking), // the music dips while Momo talks
});

function applyAudioSettings() {
  const st = state.settings;
  momoVoice.setEnabled(st.voice !== false);
  momoVoice.setVolume(Number(st.volume ?? 0.7));
  const vBtn = $('btn-voice');
  vBtn.setAttribute('aria-pressed', String(st.voice !== false));
  vBtn.textContent = st.voice !== false ? '\u{1F4AC} Voice on' : '\u{1F4AC} Voice off';
  $('f-voice').checked = st.voice !== false;
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
$('f-voice').addEventListener('change', (e) => setSetting('voice', e.target.checked));
$('btn-voice').addEventListener('click', () => setSetting('voice', state.settings.voice === false));
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
  const stage = stageFor(m.smiles);
  // The hero of the adventure is always Momo. The kingdom gets its colour back level by level.
  return { stage, traits: MOMO_TRAITS, name: 'Momo', xp: xpFor(m.smiles), tier: kingdomTier() };
}

/** How many levels have been finished (each gives the kingdom its laughter back). */
function levelsDone() { return LEVELS.filter((l) => state.adventure.best[l.id]).length; }
/** 0..4: the home world brightens as levels are finished (0 = grey, 4 = full colour). */
function kingdomTier() { return Math.min(4, levelsDone()); }

const MOMO_TRAITS = traitsFor(emptyMonster());
let uidSeq = 0;
function drawMonster(el, m, live = {}, opts = {}) {
  // Every screen shows Momo: the round pastel monster in its red adventure scarf.
  const o = { traits: MOMO_TRAITS, live, uid: `m${++uidSeq}`, ...opts, stage: 'hatchling', egg: null, scarf: '#ef6f5e' };
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
    title: 'The Laughing Kingdom',
    text: 'Once upon a time, there was a kingdom where everybody giggled all day long. Even the chickens.',
    tier: 4, monster: null,
  },
  {
    title: 'The Grumpy Shadow',
    text: 'Then the Grumpy Shadow crept in and stole every single laugh. The colours faded, and the kingdom went quiet.',
    tier: 0, monster: null,
  },
  {
    title: 'A Mysterious Egg',
    text: 'But in the very last grey meadow, a little egg was waiting. Someone came along and smiled... and it began to wiggle!',
    tier: 0, spark: true, monster: { egg: true, face: 'grin', cracks: 3 },
  },
  {
    title: 'Hello, Momo!',
    text: '"Hi! I\u2019m Momo! Your face is my controller: smile to jump, look surprised for magic, blink to dodge, straight face to sneak. Let\u2019s get the laughs back!"',
    tier: 1, spark: true, monster: { face: 'extra' },
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
      mon.classList.toggle('tiny', !!sc.monster.egg);
      mon.innerHTML = sc.monster.egg
        ? monsterSvg({ stage: 'egg', traits: MOMO_TRAITS, live: { face: sc.monster.face }, egg: { cracks: sc.monster.cracks || 0, shake: true }, uid: `sm${i}` })
        : monsterSvg({ stage: 'hatchling', traits: MOMO_TRAITS, live: { face: sc.monster.face }, scarf: '#ef6f5e', uid: `sm${i}` });
    }
    $('story-title').textContent = sc.title;
    momoVoice.stop();
    momoVoice.say(sc.text.replace(/[\u201c\u201d"]/g, '')); // read aloud when a voice is available
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
  momoVoice.stop();
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

// One card per chapter: done, the one you're on (with progress), or still to come.
function renderChapters(m, look, el) {
  el.innerHTML = STAGES.map((s, i) => {
    const done = i < look.stage.index;
    const now = i === look.stage.index;
    const need = STAGES[i + 1]?.at;
    const status = done ? '\u2713 Restored'
      : now ? (need ? `${m.smiles - s.at} / ${need - s.at} smiles` : 'Fully restored!')
      : `Unlocks at ${plural(s.at, 'smile', 'smiles')}`;
    return `<li class="${done ? 'done' : now ? 'now' : 'locked'}">
      <span class="ch-num">${i + 1}</span>
      <strong>${esc(s.chapter)}</strong>
      <span class="ch-who">${esc(s.label)}</span>
      <span class="ch-brings">Brings back ${esc(s.brings)}</span>
      <span class="ch-status">${status}</span></li>`;
  }).join('');
}

// One card per level: finished (with stars), open, or still locked.
function renderLevelCards(el) {
  el.innerHTML = LEVELS.map((l) => {
    const best = state.adventure.best[l.id];
    const open = l.n <= state.adventure.unlocked;
    const status = best ? `${'\u2605'.repeat(best.stars)}${'\u2606'.repeat(3 - best.stars)} \u00b7 best ${best.score} points` : open ? 'Open: ready to play' : `Finish Level ${l.n - 1} to open`;
    return `<li class="${best ? 'done' : open ? 'now' : 'locked'}">
      <span class="ch-num">${l.n}</span>
      <strong>${esc(l.name)}</strong>
      <span class="ch-who">Boss: ${esc(l.boss.name)}</span>
      <span class="ch-brings">${esc(l.mission)}</span>
      <span class="ch-status">${status}</span></li>`;
  }).join('');
}

function renderWorld() {
  const m = liveMonster(null);
  const look = monsterLook(m);
  $('world-hero-art').innerHTML = worldSvg({ tier: look.tier, uid: 'whero' });
  drawMonster($('world-monster'), m, { face: m.smiles > 0 ? 'grin' : 'flat' });
  const done = levelsDone();
  $('world-pct').textContent = `${Math.round((done / LEVELS.length) * 100)}%`;
  $('world-next').textContent = done < LEVELS.length
    ? `Next: Level ${currentLevel().n}, ${currentLevel().name}.`
    : 'Every land is laughing again. Replay any level to raise more for charity.';
  $('world-diet').hidden = true;
  renderLevelCards($('world-chapters'));
  const { smiles, total } = campaignTotals();
  $('w-smiles').textContent = smiles;
  $('w-total').textContent = formatCents(total);
  $('w-confirmed').textContent = formatCents(confirmedTotal(state.campaign.sponsors));
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

// ---------------------------------------------------------------- the monster's own life
// It wanders, sniffs flowers, naps and celebrates by itself (src/behaviour.js). Your face always
// wins: when the mood filter shows a smile or surprise it stops and looks at you.
const reducedMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const homeWalk = new Wanderer({ now: Date.now() });
let homeAct = { action: 'idle', look: 0 };

function walkWorld(w, look, extra = false) {
  w.setWorld({ canWalk: !extra && !reducedMotion, flowers: look.tier >= 2 });
}

function drawHomeMonster() {
  drawMonster($('home-monster'), liveMonster(null), { sleeping: homeAct.action === 'sleep', look: homeAct.look });
}

// Move the walker, and redraw the monster only when what it's doing actually changes.
function driveWalker(w, walkerId, face, last, redraw) {
  const now = Date.now();
  const r = w.tick(now, { face });
  const el = $(walkerId);
  const wrap = el.firstElementChild;
  const range = Math.max(30, ((el.parentElement?.clientWidth || 0) - (wrap?.clientWidth || 0)) / 2 + 60);
  el.style.translate = `${Math.round(r.x * range)}px 0`;
  for (const a of ['walk', 'sniff', 'sleep', 'celebrate', 'look']) el.classList.toggle(`is-${a}`, r.action === a);
  if (r.action !== last.action || r.look !== last.look) { last.action = r.action; last.look = r.look; redraw(); }
}

function walkFrame() {
  requestAnimationFrame(walkFrame);
  const view = document.body.dataset.view;
  if (view === 'session' && session) driveWalker(session.walk, 's-walker', session.hatching ? 'flat' : session.face, session.act, scheduleMonster);
  else if (view === 'home') driveWalker(homeWalk, 'home-walker', 'flat', homeAct, drawHomeMonster);
}
requestAnimationFrame(walkFrame);

$('home-monster').addEventListener('click', () => {
  // a tap wakes it up and makes it happy
  homeWalk.poke(Date.now());
  const w = $('home-monster');
  w.classList.remove('hi'); void w.offsetWidth; w.classList.add('hi');
  sfx.happy();
});

function renderHome() {
  const m = liveMonster(null);
  const look = monsterLook(m);
  drawWorld('home-world', look.tier);
  walkWorld(homeWalk, look);
  homeWalk.poke(Date.now());
  drawHomeMonster();
  const done = levelsDone();
  const stars = LEVELS.reduce((a, l) => a + (state.adventure.best[l.id]?.stars || 0), 0);
  $('home-level').textContent = `\u2605 ${stars} / ${LEVELS.length * 3}`;
  $('home-name').textContent = 'Momo';
  $('home-stage').textContent = 'Expression Adventure \u00b7 Your face is the controller!';
  $('home-stage-fill').style.width = `${(done / LEVELS.length) * 100}%`;
  $('home-xp').textContent = `Laughs returned: ${done} / ${LEVELS.length} lands`;
  $('home-stage-fill').parentElement.classList.remove('happiness');
  $('home-next').textContent = done < LEVELS.length ? currentLevel().mission : 'The Grumpy Shadow is laughing too. The whole Laughing Kingdom is happy again!';
  const next = currentLevel();
  const allDone = LEVELS.every((l) => state.adventure.best[l.id]);
  $('home-goal-line').textContent = allDone
    ? '\u{1F308} Every laugh is back in the Laughing Kingdom! Replay any level to raise more for charity.'
    : `\u{1F60A} Next: Level ${next.n}, ${next.name}`;
  renderLevelMap();
  renderImpact();
}

function renderLevelMap() {
  $('level-map').innerHTML = LEVELS.map((l) => {
    const open = isPlayable(l) && l.n <= state.adventure.unlocked;
    const best = state.adventure.best[l.id];
    const stars = best ? '\u2605'.repeat(best.stars) + '\u2606'.repeat(3 - best.stars) : open ? 'New!' : '\u{1F512}';
    return `<button type="button" class="level-chip${open ? '' : ' locked'}" data-level="${l.id}" ${open ? '' : 'disabled'} style="--lc:${l.colour}" title="${esc(open ? l.mission : `Finish Level ${l.n - 1} to open`)}">
      <span class="lc-n">${l.n}</span><span class="lc-name">${esc(l.name)}</span><span class="lc-stars">${stars}</span></button>`;
  }).join('');
}
$('level-map').addEventListener('click', (e) => {
  const b = e.target.closest('.level-chip');
  if (!b || b.disabled) return;
  playLevelId = b.dataset.level;
  if (!state.settings.howToSeen) openHowTo(true); else startSession(playLevelId);
});

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
  $('f-diag').checked = !!state.settings.diagnostics;
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

function openCampaign(section) {
  renderWorld();
  renderCampaign();
  show('world');
  if (section) $(section)?.scrollIntoView({ block: 'start' });
}
$('btn-settings').addEventListener('click', () => { if (store.hasConsent(state) && !session) openCampaign(); });
$('btn-open-campaign').addEventListener('click', () => openCampaign('w-charity'));
$('btn-open-world').addEventListener('click', () => { sfx.click(); openCampaign(); });
$('btn-back-home').addEventListener('click', () => { renderHome(); show('home'); });
$('btn-open-privacy').addEventListener('click', () => { renderPrivacy(); dlg.showModal(); });

$('f-cause').addEventListener('change', (e) => { state.campaign.cause = e.target.value.trim() || 'a good cause'; persist(); renderCampaign(); });
$('f-goal').addEventListener('change', (e) => { state.campaign.goalCents = Math.max(1, Math.round(Number(e.target.value) || 25)) * 100; persist(); renderCampaign(); });
$('f-minutes').addEventListener('change', (e) => { state.settings.sessionMinutes = Math.min(15, Math.max(1, Math.round(Number(e.target.value) || 2))); persist(); renderCampaign(); });
$('f-pulse').addEventListener('change', (e) => { state.settings.showPulse = e.target.checked; persist(); });
$('f-breath').addEventListener('change', (e) => { state.settings.breathMirror = e.target.checked; persist(); });
$('f-diag').addEventListener('change', (e) => { state.settings.diagnostics = e.target.checked; persist(); });
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
  if (!confirm('Start the adventure again from Level 1? Your stars are cleared. Pledges, sponsors and game totals are kept.')) return;
  state.adventure = { unlocked: 1, best: {} };
  persist();
  renderCampaign();
  renderWorld();
  toast('Momo is back at the Silent Village, ready to go!');
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


function updateMeter(level) {
  const pct = Math.round(Math.max(0, Math.min(100, level)));
  $('meter-fill').style.width = `${pct}%`;
  $('meter-fill').classList.toggle('hot', pct >= SMILE.onThreshold);
  $('meter-value').textContent = `${pct}%`;
}

/** Floating "+10 XP" / "+15¢" / heart pops above the monster. */
function popAt(text, cls, dx = 0, delay = 0, anchor = 's-monster') {
  setTimeout(() => {
    const box = $(anchor).getBoundingClientRect();
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
    sleeping: s.act.action === 'sleep',
    look: s.act.look,
    breath: state.settings.breathMirror ? s.breath.level() : null,
    talking: !!s.talking,
    talkOpen: !!s.talking && Math.floor(now / 170) % 2 === 0,
  };
}

function renderMonsterNow() {
  if (!session) return;
  if (session.adv) { drawMomo(); return; }
  const m = liveMonster();
  const look = monsterLook(m);
  const hatching = session.hatching ? { stage: 'egg', egg: { cracks: 3, shake: true, hatching: true } } : {};
  walkWorld(session.walk, look, !!session.hatching);
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
  // The signal check is for judges and developers; players can turn it on in My world > Settings.
  $('diag').hidden = !state.settings.diagnostics;
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
  if (session.adv) { renderAdvHud(); return; }
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
  session.walk.celebrate(Date.now(), from.key === 'egg' ? HATCH_SHAKE_MS : 0);
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
  if (s.adv) {
    // In the adventure a qualifying smile still counts once for the charity, exactly as before.
    s.smiles += 1; // the single place a qualifying smile is counted
    if (worth > 0) popAt(`+${worth}\u00a2 for charity`, 'cents', 30, 250, 'adv-momo');
    if (s.adv.snack && Date.now() < s.adv.snackUntil) {
      s.snack[s.adv.snack.id] = (s.snack[s.adv.snack.id] || 0) + 1;
      s.adv.snackUntil = 0; // one credit per joke
      sfx.snack();
      advSay(`${s.adv.snack.name}\u2019s joke got you! Thanks, ${s.adv.snack.name}!`);
    }
    renderSession();
    return;
  }
  const before = stageFor(liveMonster().smiles);
  const tierBefore = worldTier(liveMonster().smiles);
  s.walk.poke(Date.now());
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
  if (s.adv) { if (mood.face !== s.face) { s.face = mood.face; scheduleMonster(); } return; }
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
    if (s.adv) {
      // Your face is the controller: real HAPPY / SURPRISE / NEUTRAL scores become actions.
      for (const e of expressions) s.adv.pending.push(...s.adv.controls.push(e, now));
    } else {
      const line = s.voice.onTick({ face: s.face }, now);
      if (line) speak(line.text);
    }
  }

  if (f?.blinking?.length) {
    if (s.adv) s.adv.pending.push(...s.adv.controls.pushBlinks(f.blinking, now));
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
      if (t) s.walk.poke(now);
      clearInterval(s.talkTimer);
      if (t) {
        s.talkTimer = setInterval(scheduleMonster, 170); // mouth moves while the SDK says you're talking
        const line = s.adv ? null : s.voice.onTalking(now);
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


// ---------------------------------------------------------------- Expression Adventure
// Momo's levels. ExpressionControls turns the real SDK signals into jump / magic / dodge / sneak,
// AdventureLevel decides what happens, and this part only draws it.

/** The level PLAY starts: the furthest one that is open and finished being built. */
function currentLevel() {
  const open = LEVELS.filter((l) => isPlayable(l) && l.n <= state.adventure.unlocked);
  return open[open.length - 1] || LEVELS[0];
}

let momoKey = '';
function drawMomo() {
  const s = session;
  if (!s?.adv) return;
  const now = Date.now();
  const pose = s.adv.pose;
  const live = liveFace();
  live.sleeping = false;
  live.look = 0.4; // Momo faces the way it is running
  if (pose === 'dance' || pose === 'magic') live.face = 'extra';
  else if (pose === 'oops' || pose === 'dodge') live.face = 'wow';
  const key = JSON.stringify([live.face, live.eyesClosed, live.wink, live.talkOpen, live.breath != null ? Math.round(live.breath * 20) : null]);
  if (key === momoKey) return;
  momoKey = key;
  $('adv-momo-svg').innerHTML = monsterSvg({ stage: 'hatchling', traits: MOMO_TRAITS, live, uid: `momo${now % 1000}`, scarf: '#ef6f5e' });
}

function advSay(text) {
  const b = $('adv-speech');
  b.textContent = text;
  b.hidden = false;
  b.classList.remove('say-in'); void b.offsetWidth; b.classList.add('say-in');
  clearTimeout(advSay.t);
  advSay.t = setTimeout(() => { b.hidden = true; }, Math.max(2600, text.length * 60));
  momoVoice.say(text); // spoken too, when the computer has a voice and voice is on
}

function renderAdvHud() {
  const a = session.adv;
  const v = a.game.view(Date.now());
  $('s-level').textContent = `Level ${a.level.n}`;
  $('s-name').textContent = a.level.name;
  $('s-stage').textContent = v.boss || v.phase === 'bossIntro' ? `Boss: ${a.level.boss.name}` : `Mission: get past ${a.level.steps.length} things, then the boss`;
  $('s-stage-fill').style.width = `${Math.round(v.progress * 100)}%`;
  $('s-xp').textContent = `Laughter back: ${Math.round(v.progress * 100)}%`;
  $('s-timer').textContent = v.score;
  $('s-timer-label').textContent = 'points';
}

function setPose(pose) {
  const a = session.adv;
  if (a.pose === pose) return;
  a.pose = pose;
  const el = $('adv-momo-pose');
  el.className = 'adv-momo-pose';
  void el.offsetWidth; // restart the animation even when the same pose comes back
  el.classList.add(`pose-${pose}`);
  drawMomo();
}

function onAdvEvent(e, now) {
  const s = session;
  const a = s.adv;
  const thing = $('adv-thing');
  switch (e.type) {
    case 'say':
      advSay(e.text);
      // A real smile while (or just after) the sponsor's joke is up gives that sponsor the credit.
      if (a.snack && e.text === a.snack.text) a.snackUntil = Date.now() + 5500;
      break;
    case 'challenge': {
      const p = $('adv-prompt');
      $('adv-prompt-text').textContent = e.prompt;
      p.hidden = false;
      p.classList.toggle('retry', !!e.retry);
      p.classList.remove('say-in'); void p.offsetWidth; p.classList.add('say-in');
      if (!e.step.boss || e.step.need === 'dodge') {
        thing.innerHTML = thingSvg(e.step.thing);
        thing.className = `adv-thing need-${e.step.need}`;
        thing.style.left = '95%';
        thing.hidden = false;
      }
      sfx.click();
      break;
    }
    case 'success': {
      $('adv-prompt').hidden = true;
      if (e.step.need === 'magic') sfx.wow();
      if (!thing.hidden) {
        // jump: it slides under Momo; magic: it gets zapped; dodge: it flies over; sneak: Momo tiptoes past
        const how = { jump: 'gone', magic: 'zapped', dodge: 'flown', sneak: 'passed' }[e.step.need] || 'gone';
        thing.classList.add(how);
        thing.style.left = how === 'flown' || how === 'passed' ? '-12%' : how === 'gone' ? '24%' : thing.style.left;
      }
      if (e.step.boss) {
        a.bossHits += 1;
        const boss = $('adv-boss');
        boss.innerHTML = bossSvg(a.level.boss.thing, a.bossHits / a.bossTotal);
        boss.classList.remove('hit'); void boss.offsetWidth; boss.classList.add('hit');
        sfx.golden();
      } else if (e.step.need !== 'magic') sfx.happy();
      sfx.xp();
      popAt(`+${e.points}`, e.firstTry ? 'xp gold' : 'xp', -20, 0, 'adv-momo');
      setTimeout(() => sfx.bloom(), 380); // a little colour comes back to the village
      break;
    }
    case 'oops':
      $('adv-prompt').hidden = true;
      if (e.step.need === 'sneak') thing.classList.add('awake'); // the guard wakes up: "!"
      setTimeout(() => thing.classList.add('gone'), e.step.need === 'sneak' ? 900 : 0);
      sfx.crack();
      break;
    case 'boss': {
      const boss = $('adv-boss');
      boss.innerHTML = bossSvg(a.level.boss.thing, 0);
      boss.hidden = false;
      boss.className = 'adv-boss enter';
      $('adv').classList.add('boss-fight');
      sfx.chapter();
      break;
    }
    case 'phase':
      if (e.phase === 'bossIntro') music.request('boss');
      if (e.phase === 'outro') music.request('victory');
      if (e.phase === 'outro') {
        $('adv-boss').className = 'adv-boss won';
        sfx.levelUp();
        for (let i = 0; i < 6; i++) popAt('♥', 'heart', (i - 2.5) * 34, 200 + i * 140, 'adv-momo');
      }
      break;
    case 'complete': {
      const sum = e.summary;
      a.result = sum;
      state.adventure = recordLevel(state.adventure, a.level.id, sum);
      persist();
      $('adv-stars').innerHTML = [1, 2, 3].map((n) => `<span class="${n <= sum.stars ? '' : 'off'}">★</span>`).join('');
      $('adv-done-title').textContent = `${a.level.name} is laughing again!`;
      $('adv-done-line').textContent = sum.misses === 0
        ? 'Not a single tumble. Momo is doing a very proud wiggle.'
        : `Momo tumbled ${plural(sum.misses, 'time', 'times')} and got back up every time.`;
      $('adv-done-score').textContent = sum.score;
      $('adv-done-smiles').textContent = s.smiles;
      $('adv-done').hidden = false;
      break;
    }
    default:
  }
  void now;
}

function advFrame() {
  const s = session;
  if (!s?.adv) return;
  const a = s.adv;
  const now = Date.now();
  a.controls.tick(now);
  const st = s.signals.status(now);
  // If the SDK isn't sending blinks (after a few seconds of face data), dodging uses a surprised face.
  const blinkLive = st.blinking.live || !st.expressions.live || now - s.startedAt < 6000;
  const scheme = controlScheme({ blinkLive });
  const input = { actions: a.pending.splice(0), calmMs: a.controls.calmFor(now), scheme };
  for (const e of a.game.tick(now, input)) onAdvEvent(e, now);

  const v = a.game.view(now);
  setPose(v.pose);
  const stage = $('adv');
  stage.classList.toggle('is-running', v.phase === 'run');
  stage.style.setProperty('--grey', (1 - v.progress * 0.95).toFixed(3));
  const inWindow = v.phase === 'challenge';
  if (inWindow) {
    $('adv-window-fill').style.width = `${Math.round((1 - v.t) * 100)}%`;
    if (!$('adv-thing').hidden) $('adv-thing').style.left = `${(95 - v.t * 62).toFixed(1)}%`;
  }
  const sneak = inWindow && v.step?.need === 'sneak';
  $('adv-sneak').hidden = !sneak;
  if (sneak) $('adv-sneak-fill').style.width = `${Math.round(a.game.sneakProgress(now, a.controls.calmFor(now)) * 100)}%`;
  $('adv-backup').hidden = !(inWindow && v.step?.need === 'dodge' && !blinkLive);
  if (v.phase === 'run' || v.phase === 'intro' || v.phase === 'bossIntro') $('adv-thing').hidden = true;
  a.raf = requestAnimationFrame(advFrame);
}

/** A sponsor's snack joke, told by Momo at the start of a level (taking turns between sponsors). */
function snackFor(level) {
  const withSnack = state.campaign.sponsors.filter((sp) => (sp.snack || '').trim());
  if (!withSnack.length) return null;
  const sp = withSnack[(state.sessions.length + level.n) % withSnack.length];
  return { id: sp.id, name: sp.name, text: `Snack time! ${sp.name} sent you a joke: ${sp.snack.trim()}` };
}

function startAdventure(level, now) {
  const snack = snackFor(level);
  const played = snack ? { ...level, intro: [...level.intro, snack.text] } : level;
  const a = {
    level,
    snack,
    snackUntil: 0,
    game: new AdventureLevel(played, snack ? { now, introLineMs: 4200 } : { now }),
    controls: new ExpressionControls(),
    pending: [],
    pose: null,
    bossHits: 0,
    bossTotal: level.boss.steps.length,
    result: null,
    raf: 0,
  };
  session.adv = a;
  session.advBefore = JSON.parse(JSON.stringify(state.adventure));
  momoKey = '';
  $('adv-scene').innerHTML = sceneSvg(level.id);
  for (const id of ['adv-thing', 'adv-boss', 'adv-prompt', 'adv-done', 'adv-speech', 'adv-sneak', 'adv-backup']) $(id).hidden = true;
  $('adv-boss').className = 'adv-boss';
  $('adv').classList.remove('boss-fight', 'is-running');
  for (const e of a.game.tick(now)) onAdvEvent(e, now);
  a.raf = requestAnimationFrame(advFrame);
}
$('btn-adv-next').addEventListener('click', () => endSession());

let playLevelId = null; // a level picked on the level map; PLAY uses the next open level
async function startSession(levelId = playLevelId) {
  playLevelId = null;
  if (!store.hasConsent(state)) { renderConsent(); show('consent'); return; }
  showError('');
  detector = new SmileDetector();
  const now = Date.now();
  const level = levelById(levelId) || currentLevel();
  session = {
    startedAt: now,
    adv: null,
    deadline: level ? Infinity : now + state.settings.sessionMinutes * 60000, // a level ends when it's done
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
    walk: new Wanderer({ now }),
    act: { action: 'idle', look: 0 },
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
  $('meter-mark').style.left = `${SMILE.onThreshold}%`;
  updateMeter(0);
  setHint('Starting the SDK...');
  delete drawnTier['s-world'];
  $('adv').hidden = !level;
  $('adv').closest('.stage').classList.toggle('is-adv', !!level);
  $('s-timer-label').textContent = level ? 'points' : 'left';
  if (level) startAdventure(level, now);
  else { nextCard(); restartReelTimer(); }
  show('session');
  renderMonsterNow();
  renderSession();
  if (!level) speak(session.voice.start(now).text);
  session.timer = setInterval(renderSession, 500);

  try {
    sdk = buildSdk();
    wireSdk(sdk);
    if (SIMULATE) { $('cam-placeholder').textContent = 'Simulated camera'; }
    await sdk.start(); // the SDK acquires the camera here: after consent, and only when a game starts
  } catch (err) {
    showError(err.message || String(err));
    setHint('Could not start.', 'err');
    // Without the camera there are no face controls, so the level waits instead of running on.
    if (session?.adv) { cancelAnimationFrame(session.adv.raf); momoVoice.stop(); $('adv-prompt').hidden = true; }
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
  if (s.adv) { cancelAnimationFrame(s.adv.raf); momoVoice.stop(); }
  session = null;
  await stopSdk();

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
  lastSummary = { record, delta, advBefore: s.advBefore || null };

  const m = liveMonster(null);
  const look = monsterLook(m);
  drawWorld('sum-world', look.tier);
  drawMonster($('summary-monster'), m, { face: s.smiles > 0 ? 'grin' : 'flat' });
  // Growth: a hatch or an evolution gets a before -> after moment.
  const grew = s.evolutions.length > 0;
  const hatched = grew && s.stageAtStart.key === 'egg';
  $('sum-title').textContent = s.adv
    ? (s.adv.result ? `${s.adv.level.name} complete! ${'\u2605'.repeat(s.adv.result.stars)}` : `You left ${s.adv.level.name} early. Momo will wait for you!`)
    : hatched ? 'Your egg hatched!' : grew ? `Your monster grew into a ${look.stage.label}!` : s.smiles > 0 ? 'Great game!' : 'Nice try!';
  $('sum-before').hidden = !grew;
  $('sum-arrow').hidden = !grew;
  if (grew) {
    $('sum-before').innerHTML = monsterSvg({ stage: s.stageAtStart.key, traits: look.traits, live: { face: 'flat' }, egg: { cracks: hatched ? 3 : 0 }, uid: `before${++uidSeq}` });
    const row = $('summary-monster').parentElement;
    row.classList.remove('grow'); void row.offsetWidth; row.classList.add('grow');
  }
  $('sum-xp-gain').textContent = `+${s.smiles * XP_PER_SMILE}`;
  $('sum-smiles-big').textContent = s.smiles;
  $('sum-pledge-big').textContent = formatCents(record.pledgedCents);
  $('sum-level').textContent = `Lv ${look.stage.level}`;
  $('sum-stage').textContent = chapterLine(look.stage);
  $('sum-name').textContent = look.name;
  $('sum-evolved').hidden = s.evolutions.length === 0;
  $('sum-evolved').textContent = s.evolutions.length
    ? `It grew up this game: ${[s.stageAtStart.label, ...s.evolutions.map((x) => x.label)].join(' → ')}`
    : '';
  $('sum-xp').textContent = `${barText(look, m)} · ${nextLine(look.stage)}`;

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
  if (s.adv) extras.push(`Level ${s.adv.level.n}: ${s.adv.game.score} points`, `Tumbles: ${s.adv.game.misses}`);
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
  $('sum-xp-label').textContent = 'XP';
  $('sum-charity-end').hidden = true;
  if (s.adv) showAdventureSummary(s, record, look, m);
  $('receipt-preview').hidden = true;
  show('summary');
  if (s.evolutions.length) sfx.levelUp();
  ending = false;
}
$('btn-end').addEventListener('click', endSession);

// The results screen for a level: stars, points, smiles for charity and, after the Final Laugh,
// Momo explains where the pledges go.
function showAdventureSummary(s, record, look, m) {
  const a = s.adv;
  const res = a.result;
  $('sum-level').textContent = `Level ${a.level.n}`;
  $('sum-stage').textContent = a.level.name;
  $('sum-name').textContent = 'Momo';
  $('sum-xp-gain').textContent = a.game.score;
  $('sum-xp-label').textContent = 'points';
  $('sum-evolved').hidden = !res;
  $('sum-evolved').textContent = res ? `${'\u2605'.repeat(res.stars)}${'\u2606'.repeat(3 - res.stars)}  ${res.misses === 0 ? 'A perfect run!' : `Momo tumbled ${plural(res.misses, 'time', 'times')} and got back up every time.`}` : '';
  const next = LEVELS.find((l) => l.n === a.level.n + 1);
  $('sum-xp').textContent = !res ? 'Momo saved your spot. Press PLAY to try again.'
    : next ? `Level ${next.n}, ${next.name}, is open!` : 'You gave back every stolen laugh!';
  $('sum-persona').textContent = '';
  drawMonster($('summary-monster'), m, { face: res ? 'extra' : 'soft' });
  lastReceipt.stageLabel = `Level ${a.level.n} \u00b7 ${a.level.name}${res ? ` \u00b7 ${'\u2605'.repeat(res.stars)}` : ''}`;

  if (res && a.level.id === 'finale') {
    const sponsors = state.campaign.sponsors;
    const { total } = campaignTotals();
    const confirmed = confirmedTotal(sponsors);
    const cause = state.campaign.cause || 'your charity';
    const text = `You did it! And here's a secret: every real smile you made on this adventure also counted for ${cause}. `
      + `Your sponsors have promised ${formatCents(total)} so far. `
      + `That's a promise, not money yet: they give it to ${cause} themselves, and you never pay anything. `
      + (confirmed > 0 ? `${formatCents(confirmed)} has already been donated. ` : '')
      + 'Save your Smile Receipt and send it to them. Thank you for making the whole kingdom laugh again!';
    $('sum-charity-text').textContent = text;
    $('sum-charity-momo').innerHTML = drawMonster(null, m, { face: 'grin' });
    $('sum-charity-end').hidden = false;
    setTimeout(() => momoVoice.say(text), 900);
  }
}

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
    if (lastSummary.advBefore) state.adventure = lastSummary.advBefore; // stars and unlocks from this game go too
  }
  lastSummary = null;
  lastReceipt = null;
  persist();
  renderHome();
  show('home');
  toast('Game removed, as if it never happened.');
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
