// renderer.js: Smile Jar, The Smile Monster. Bundled to dist/renderer.bundle.js by build.mjs.
//
// SmartSpectra integration lives in buildSdk()/wireSdk(): we request the SDK's face bundle
// (EXPRESSIONS, BLINKING, TALKING), optionally the breathing bundle (for the breathing mirror)
// and the cardio bundle (pulse). Each `metrics` event is decoded and:
//   - face.expression[]  -> SmileDetector (qualifying smiles) + the monster's face
//   - face.blinking[]    -> BlinkTracker  (the monster blinks when you blink)
//   - face.talking[]     -> talkingNow    (the monster listens when you talk)
//   - breathing trace    -> BreathNormalizer (the monster's belly rises and falls with yours)
// SignalMonitor records which of these actually arrive, and the "Live signals" chips show it.
// Nothing is invented: if a signal never arrives, its chip says so and the monster ignores it.

'use strict';

import { SmileDetector, DEFAULTS as SMILE, happyScore, mascotFace } from './src/smile-detector.js';
import {
  pledgeFor, sessionPledge, marginalRate, formatCents, pledgeStatementCsv, sponsorOwes, confirmedTotal, pledgeLedger,
} from './src/pledges.js';
import * as store from './src/store.js';
import { JOY_REEL } from './src/joy-reel.js';
import { HumourModel, personaFor } from './src/humour.js';
import { JarVoice } from './src/jar-voice.js';
import { sfx, setMuted } from './src/sounds.js';
import { drawReceipt } from './src/receipt.js';
import { SimulatedSDK } from './src/simulator.js';
import { stageFor, traitsFor, monsterName, monsterSvg, emptyMonster, DIET_KINDS } from './src/monster.js';
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
const VIEWS = ['consent', 'home', 'session', 'summary'];
function show(view) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
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
  if (!store.save(state)) toast('Could not save on this device; totals will reset when the app closes.');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtSecs(ms) {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
  return { stage, traits, name: monsterName(traits, stage.key) };
}

let uidSeq = 0;
function drawMonster(el, m, live = {}, standalone = false) {
  const { stage, traits } = monsterLook(m);
  const svg = monsterSvg({ stage: stage.key, traits, progress: stage.progress, live, standalone, uid: `m${++uidSeq}` });
  if (el) el.innerHTML = svg;
  return svg;
}

function stageLine(stage) {
  return stage.next ? `${plural(stage.toNext, 'more smile', 'more smiles')} until ${stage.next.label}` : 'Fully grown. It keeps eating, though.';
}

const TRAIT_HINT = {
  'Pun': 'puns grow horns',
  'Animal fact': 'animal facts grow fur and ears',
  'Memory': 'memories make it glow',
  'Picture this': 'daydreams grow stars',
  'Sponsor snack': 'sponsor snacks add hearts in their colour',
};

function dietLine(m) {
  const eaten = DIET_KINDS.filter((k) => (m.diet[k] || 0) > 0).map((k) => `${k} ${m.diet[k]}`);
  return eaten.length
    ? `Diet: ${eaten.join(' · ')}`
    : `What it eats shapes how it looks: ${Object.values(TRAIT_HINT).join(', ')}.`;
}

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

function renderHome() {
  const c = state.campaign;
  const { smiles, total } = campaignTotals();
  const goal = Math.max(100, c.goalCents || 0);
  const m = liveMonster(null);
  const look = monsterLook(m);

  drawMonster($('home-monster'), m, { face: 'flat' });
  $('home-stage').textContent = `Stage ${look.stage.index + 1} of 4 · ${look.stage.label}`;
  $('home-name').textContent = look.name;
  $('home-stage-fill').style.width = `${look.stage.progress * 100}%`;
  $('home-next').textContent = `${plural(m.smiles, 'smile', 'smiles')} eaten. ${stageLine(look.stage)}`;
  $('home-diet').textContent = dietLine(m);

  const confirmed = confirmedTotal(c.sponsors);
  $('home-cause').textContent = c.cause || 'a good cause';
  $('home-total').textContent = formatCents(total);
  $('home-confirmed').textContent = formatCents(confirmed);
  $('home-smiles').textContent = smiles;
  $('home-goal').textContent = formatCents(goal);
  $('home-progress').style.width = `${Math.min(100, (total / goal) * 100)}%`;
  const rate = marginalRate(c.sponsors, smiles);
  $('home-rate').textContent = c.sponsors.length === 0
    ? 'Add a sponsor so your smiles are worth something.'
    : rate > 0 ? `your next smile is worth ${rate}¢` : 'every sponsor has reached their cap';

  $('f-cause').value = c.cause;
  $('f-goal').value = Math.round(goal / 100);
  $('f-minutes').value = state.settings.sessionMinutes;
  $('f-pulse').checked = !!state.settings.showPulse;
  $('f-breath').checked = !!state.settings.breathMirror;

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
      renderHome();
    });
    tr.querySelector('button').addEventListener('click', () => {
      c.sponsors = c.sponsors.filter((x) => x !== s);
      persist();
      renderHome();
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
      <span>${s.smiles} ${s.mode === 'poker' ? 'cracks' : 'smiles'}</span><span>${(s.durationMs / 60000).toFixed(1)} min</span><strong>${formatCents(s.pledgedCents)}</strong>`;
    hist.appendChild(li);
  }
  for (const p of state.pastMonsters.slice().reverse().slice(0, 5)) {
    const li = document.createElement('li');
    li.className = 'past';
    li.innerHTML = `<span>Retired ${new Date(p.retiredAt).toLocaleDateString()}</span><span>${esc(p.name)}</span><span>${esc(p.stage)}</span><strong>${plural(p.smiles, 'smile', 'smiles')}</strong>`;
    hist.appendChild(li);
  }
}

$('f-cause').addEventListener('change', (e) => { state.campaign.cause = e.target.value.trim() || 'a good cause'; persist(); renderHome(); });
$('f-goal').addEventListener('change', (e) => { state.campaign.goalCents = Math.max(1, Math.round(Number(e.target.value) || 25)) * 100; persist(); renderHome(); });
$('f-minutes').addEventListener('change', (e) => { state.settings.sessionMinutes = Math.min(15, Math.max(1, Math.round(Number(e.target.value) || 2))); persist(); renderHome(); });
$('f-pulse').addEventListener('change', (e) => { state.settings.showPulse = e.target.checked; persist(); });
$('f-breath').addEventListener('change', (e) => { state.settings.breathMirror = e.target.checked; persist(); });
$('btn-add-sponsor').addEventListener('click', () => {
  const i = state.campaign.sponsors.length;
  state.campaign.sponsors.push(store.normalizeSponsor({ id: `s${Date.now()}`, name: 'New sponsor', centsPerSmile: 5 }, i));
  persist();
  renderHome();
});
$('btn-export').addEventListener('click', () => {
  const csv = pledgeStatementCsv(state.campaign, state.sessions);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `smile-jar-pledges-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('btn-reset-monster').addEventListener('click', () => {
  const m = liveMonster(null);
  const look = monsterLook(m);
  if (!confirm(`Retire ${look.name} and start a new egg? Pledges and session totals are kept.`)) return;
  if (m.smiles > 0) state.pastMonsters.push({ name: look.name, stage: look.stage.label, smiles: m.smiles, retiredAt: new Date().toISOString() });
  state.monster = { ...emptyMonster(), bornAt: new Date().toISOString() };
  persist();
  renderHome();
  toast('A new egg appeared in the jar.');
});
$('btn-new-session').addEventListener('click', () => startSession('smile'));
$('btn-poker-session').addEventListener('click', () => startSession('poker'));

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
  $('reel-text').textContent = card.text;
  $('reel-from').hidden = !card.sponsorId;
  $('reel-from').textContent = card.sponsorId ? `A snack from ${card.from}` : '';
  const fav = session.humour.favourite();
  const learned = session.humour.lastPickWasLearned && fav === card.kind;
  $('reel-why').textContent = learned
    ? (session.mode === 'poker' ? `Picked to crack you: ${card.kind.toLowerCase()}s got you before` : `Picked for you: you smile at ${card.kind.toLowerCase()}s`)
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
    ? `${session.mode === 'poker' ? 'Your weak spots' : 'What makes you smile'}: ${rows.map((r) => `${r.kind} ${r.smiles}`).join(' · ')}`
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

function syncMute() {
  setMuted(!state.settings.sound);
  const btn = $('btn-mute');
  btn.textContent = state.settings.sound ? 'Sound on' : 'Sound off';
  btn.setAttribute('aria-pressed', String(!state.settings.sound));
}
$('btn-mute').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  persist();
  syncMute();
});
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

function dropCoin(cents, golden = false, color = null) {
  const layer = $('coin-layer');
  const coin = document.createElement('div');
  coin.className = golden ? 'coin golden' : 'coin';
  if (color) coin.style.boxShadow = `0 0 0 4px ${color}`;
  coin.textContent = cents > 0 ? `+${cents}¢` : '☺';
  const box = $('s-monster').getBoundingClientRect();
  coin.style.left = `${box.left + box.width / 2 - 22}px`;
  coin.style.top = `${box.top + 10}px`;
  layer.appendChild(coin);
  setTimeout(() => coin.remove(), 1200);
}

// Live mirror state, filled only from real SDK signals (or the labelled simulator).
function liveFace() {
  const s = session;
  if (!s) return {};
  const now = Date.now();
  return {
    face: s.face,
    eyesClosed: s.blink.closed || now < s.eyesClosedUntil,
    breath: state.settings.breathMirror ? s.breath.level() : null,
    talking: !!s.talking,
  };
}

function renderMonsterNow() {
  if (!session) return;
  const m = liveMonster();
  const look = monsterLook(m);
  drawMonster($('s-monster'), m, liveFace());
  $('s-name').textContent = look.name;
  $('s-stage').textContent = `${look.stage.label} · ${stageLine(look.stage)}`;
  $('s-stage-fill').style.width = `${look.stage.progress * 100}%`;
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
  const blinks = session.blink.blinks;
  $('s-blinks').textContent = st.blinking.seen
    ? `Blinks seen: ${blinks}${session.talking ? ' · you’re talking' : ''}`
    : '';
}

function renderSession() {
  if (!session) return;
  const sponsors = state.campaign.sponsors;
  const cents = sessionPledge(sponsors, session.before, session.smiles);
  $('s-smiles').textContent = session.smiles;
  $('s-money').textContent = `${formatCents(cents)} pledged`;
  if (session.mode === 'poker') {
    const streak = Date.now() - session.straightSince;
    session.bestStreakMs = Math.max(session.bestStreakMs, streak);
    $('s-streak').textContent = `Straight face: ${fmtSecs(streak)} · best ${fmtSecs(session.bestStreakMs)}`;
  }
  renderSignals();
  const left = Math.max(0, session.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  $('s-timer').textContent = `${m}:${String(s).padStart(2, '0')} left`;
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
  popBadge.t = setTimeout(() => { b.hidden = true; }, 1900);
}

function celebrateEvolution(stage) {
  const card = $('monster-card');
  card.classList.remove('evolving');
  void card.offsetWidth;
  card.classList.add('evolving');
  setTimeout(() => card.classList.remove('evolving'), 1400);
  sfx.evolve();
  popBadge(stage.key === 'blob' ? 'It hatched!' : `Evolved: ${stage.label}!`, 'evolve');
  speak(session.voice.onEvolve(Date.now()).text);
  session.evolutions.push(stage.label);
}

const COMBO_WINDOW_MS = 8000;
const GOLDEN_AT = 92;

function onSmile(peakHappy = 0) {
  const s = session;
  const sponsors = state.campaign.sponsors;
  const worth = marginalRate(sponsors, s.before + s.smiles);
  const stageBefore = stageFor(liveMonster().smiles);
  s.smiles += 1;
  const now = Date.now();
  s.combo = now - s.lastSmileAt <= COMBO_WINDOW_MS ? s.combo + 1 : 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  s.lastSmileAt = now;
  const golden = peakHappy >= GOLDEN_AT;
  if (golden) s.golden += 1;
  if (s.mode === 'poker') {
    s.bestStreakMs = Math.max(s.bestStreakMs, now - s.straightSince);
    s.straightSince = now;
  }

  // Feed the monster whatever was on screen when the smile started.
  const card = s.humour.creditSmile(now);
  const kind = card?.kind || 'Pun';
  s.diet[kind] = (s.diet[kind] || 0) + 1;
  let snackFrom = null;
  if (card?.sponsorId) {
    s.snack[card.sponsorId] = (s.snack[card.sponsorId] || 0) + 1;
    snackFrom = sponsors.find((x) => x.id === card.sponsorId) || null;
  }
  dropCoin(worth, golden, snackFrom?.color);
  renderTaste();

  if (s.mode === 'poker') { sfx.crack(); s.voice.resetStreak(); }
  else if (golden) sfx.golden();
  else { sfx.coin(); if (s.combo > 1) sfx.combo(s.combo); }
  if (snackFrom) sfx.snack();
  speak(s.voice.onSmile({ mode: s.mode, golden, combo: s.combo }, now).text);

  const stageAfter = stageFor(liveMonster().smiles);
  if (stageAfter.index > stageBefore.index) celebrateEvolution(stageAfter);
  else if (snackFrom) popBadge(`${snackFrom.name}’s snack got you!`, 'snack');
  else if (s.mode === 'poker') popBadge(s.combo > 1 ? `Cracked again! x${s.combo}` : 'You cracked!', 'crack');
  else if (golden) popBadge(s.combo > 1 ? `Golden grin! Combo x${s.combo}` : 'Golden grin!', 'gold');
  else if (s.combo > 1) popBadge(`Combo x${s.combo}!`, 'combo');
  renderSession();
  scheduleMonster();
}

const SURPRISE_COOLDOWN_MS = 3000;

function handleMetrics(m) {
  const s = session;
  if (!s || !detector) return;
  const now = Date.now();
  s.signals.observe(m, now);
  const f = m.face;

  const expressions = f?.expression;
  if (expressions?.length) {
    // Process sample by sample so each counted smile gets its own coin.
    for (const e of expressions) {
      const before = detector.count;
      detector.pushExpressions([e]);
      if (detector.count > before) onSmile(happyScore(e));
      if (!session) return; // the session may have ended inside onSmile
    }
    updateMeter(detector.level);
    const face = mascotFace(expressions[expressions.length - 1]);
    if (face !== s.face) {
      if (face === 'wow' && now - s.lastSurpriseAt > SURPRISE_COOLDOWN_MS) {
        s.lastSurpriseAt = now;
        s.surprises += 1; // big surprised eyes grow with surprise moments
        if (s.mode !== 'poker') { popBadge('Whoa!', 'wow'); sfx.wow(); }
      }
      s.face = face;
      scheduleMonster();
    }
    const line = s.voice.onTick({ mode: s.mode, happy: detector.level, face, streakMs: now - s.straightSince }, now);
    if (line) speak(line.text);
  }

  if (f?.blinking?.length) {
    const wasClosed = s.blink.closed;
    if (s.blink.push(f.blinking) > 0) {
      s.eyesClosedUntil = now + 160; // keep very short blinks visible
      setTimeout(scheduleMonster, 170);
    }
    if (s.blink.closed !== wasClosed || s.eyesClosedUntil > now) scheduleMonster();
  }

  if (f?.talking?.length) {
    const t = talkingNow(f.talking);
    if (t !== s.talking) {
      s.talking = t;
      if (t) { const line = s.voice.onTalking(now); if (line) speak(line.text); }
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
    if (status === ProcessingStatus.kRunning) setHint(session?.mode === 'poker' ? 'Running. Keep a straight face...' : 'Running. Smile when something makes you happy!', 'ok');
    if (status === ProcessingStatus.kError) setHint(`SDK error (${name}).`, 'err');
  });
  s.on('validationStatus', (code, _ts, hint) => {
    let text = HINTS[code] || hint || 'Adjusting...';
    if (code === ValidationCode.kOk && session?.mode === 'poker') text = 'Looking good. Don’t you dare smile.';
    setHint(text, code === ValidationCode.kOk ? 'ok' : code === ValidationCode.kCameraTuning ? 'warn' : 'err');
  });
  s.on('metrics', (buf) => {
    try {
      handleMetrics(SIMULATE ? buf : decodeMetrics(buf));
    } catch (err) {
      console.error('[smile-jar] could not handle metrics', err);
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

async function startSession(mode = 'smile') {
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
    voice: new JarVoice(),
    signals: new SignalMonitor(),
    blink: new BlinkTracker(),
    breath: new BreathNormalizer(),
    eyesClosedUntil: 0,
    talking: false,
    toldLearned: false,
    mode,
    face: 'flat',
    combo: 0,
    bestCombo: 0,
    lastSmileAt: -Infinity,
    golden: 0,
    straightSince: now,
    bestStreakMs: 0,
    diet: {},
    snack: {},
    surprises: 0,
    lastSurpriseAt: -Infinity,
    evolutions: [],
  };
  const poker = mode === 'poker';
  $('s-mode').textContent = poker ? 'Try Not to Smile' : 'Feed the monster';
  $('s-mode-help').textContent = poker
    ? 'Keep a straight face. Every crack still feeds the monster, and your sponsors pay.'
    : 'Smile when something makes you happy. Every smile feeds the monster and drops a coin.';
  $('s-unit').textContent = poker ? 'cracks' : 'smiles';
  $('s-streak').hidden = !poker;
  $('s-badge').hidden = true;
  $('s-speech').hidden = true;
  $('s-blinks').textContent = '';
  syncMute();
  sfx.start();
  $('pulse-row').hidden = !state.settings.showPulse;
  $('pulse-value').textContent = '--';
  $('reel-text').hidden = false;
  $('clip').hidden = true;
  $('meter-mark').style.left = `${SMILE.onThreshold}%`;
  updateMeter(0);
  setHint('Starting the SDK...');
  nextCard();
  restartReelTimer();
  show('session');
  renderMonsterNow();
  renderSession();
  speak(session.voice.start(mode, now).text);
  session.timer = setInterval(renderSession, 500);

  try {
    sdk = buildSdk();
    wireSdk(sdk);
    if (SIMULATE) { $('cam-placeholder').textContent = 'Simulated camera'; }
    await sdk.start(); // SDK acquires the camera here, after consent
  } catch (err) {
    showError(err.message || String(err));
    setHint('Could not start.', 'err');
  }
}

async function stopSdk() {
  const s = sdk;
  sdk = null;
  if (s) {
    try { await s.stop(); } catch (err) { console.warn('[smile-jar] stop failed', err); }
    try { s.destroy(); } catch { /* already destroyed */ }
  }
  const v = $('preview');
  v.srcObject = null;
  $('cam-placeholder').hidden = false;
  $('cam-placeholder').textContent = 'Camera off';
  $('cam-live').hidden = true;
}

const STONE_FACE_MS = 15000; // a Try Not to Smile session with a 15 s straight face adds a stone patch

let ending = false;
async function endSession() {
  if (!session || ending) return;
  ending = true;
  clearInterval(session.timer);
  clearInterval(session.reelTimer);
  const s = session;
  const now = Date.now();
  if (s.mode === 'poker') s.bestStreakMs = Math.max(s.bestStreakMs, now - s.straightSince);
  const signalStatus = s.signals.status(now);
  session = null;
  await stopSdk();
  const clip = $('clip');
  clip.pause();
  if (clip.src) { URL.revokeObjectURL(clip.src); clip.removeAttribute('src'); }
  $('clip-file').value = '';

  // Commit what the session fed the monster, remembering the deltas so "Don't save" can undo them.
  const stoneFace = s.mode === 'poker' && s.bestStreakMs >= STONE_FACE_MS ? 1 : 0;
  const delta = { smiles: s.smiles, diet: { ...s.diet }, snack: { ...s.snack }, surprises: s.surprises, pokerSessions: stoneFace };
  applyMonsterDelta(delta, 1);

  const sponsors = state.campaign.sponsors;
  const record = {
    id: `x${s.startedAt}`,
    endedAt: new Date().toISOString(),
    durationMs: now - s.startedAt,
    smiles: s.smiles,
    mode: s.mode,
    pledgedCents: sessionPledge(sponsors, s.before, s.smiles),
  };
  state.sessions.push(record);
  persist();
  lastSummary = { record, delta };

  const m = liveMonster(null);
  const look = monsterLook(m);
  drawMonster($('summary-monster'), m, { face: 'grin' });
  $('sum-stage').textContent = `Stage ${look.stage.index + 1} of 4 · ${look.stage.label}`;
  $('sum-name').textContent = look.name;
  $('sum-evolved').hidden = s.evolutions.length === 0;
  $('sum-evolved').textContent = s.evolutions.length
    ? `It evolved this session: ${[s.stageAtStart.label, ...s.evolutions].join(' → ')}`
    : '';

  const unit = s.mode === 'poker' ? (record.smiles === 1 ? 'crack' : 'cracks') : (record.smiles === 1 ? 'qualifying smile' : 'qualifying smiles');
  $('sum-smiles').textContent = record.smiles;
  $('sum-unit').textContent = unit;
  $('sum-money').textContent = formatCents(record.pledgedCents);
  $('sum-cause').textContent = state.campaign.cause;

  // Per sponsor: what this session added to their pledge, and credit for their snack.
  const sponsorLines = sponsors.map((sp) => {
    const cents = sponsorOwes(sp, s.before + s.smiles) - sponsorOwes(sp, s.before);
    const capped = sp.capCents > 0 && sponsorOwes(sp, s.before + s.smiles) >= sp.capCents;
    return { name: sp.name, color: sp.color, cents, capped, snack: s.snack[sp.id] || 0 };
  });
  $('sum-sponsors').innerHTML = sponsorLines.map((l) => `<li><span class="swatch" style="background:${esc(l.color)}"></span>
    <strong>${esc(l.name)}</strong> pledged ${formatCents(l.cents)}${l.capped ? ' (cap reached)' : ''}${l.snack ? ` · their snack earned ${plural(l.snack, 'smile', 'smiles')}` : ''}</li>`).join('');

  const extras = [];
  if (s.mode === 'poker') extras.push(`Longest straight face: ${fmtSecs(s.bestStreakMs)}`);
  if (s.bestCombo > 1) extras.push(`Best combo: x${s.bestCombo}`);
  if (s.golden > 0) extras.push(`Golden grins: ${s.golden}`);
  if (s.surprises > 0) extras.push(`Surprise moments: ${s.surprises}`);
  if (signalStatus.blinking.seen) extras.push(`Blinks mirrored: ${s.blink.blinks}`);
  const fav = s.humour.favourite();
  const persona = fav
    ? (s.mode === 'poker' ? `Your weak spot: ${fav.toLowerCase()}s` : `You're ${personaFor(fav)}`)
    : (s.mode === 'poker' ? 'Unbreakable. Nothing cracked you.' : '');
  $('sum-extras').textContent = extras.join(' · ');
  $('sum-persona').textContent = persona;

  const totalSmiles = store.totalSmiles(state);
  lastReceipt = {
    title: s.mode === 'poker' ? 'Try Not to Smile' : 'Feed the monster',
    monsterSvg: drawMonster(null, m, { face: 'grin' }, true),
    monsterName: look.name,
    stageLabel: `${look.stage.label} (stage ${look.stage.index + 1} of 4)`,
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
  if (s.evolutions.length) sfx.evolve();
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
  m.pokerSessions = Math.max(0, m.pokerSessions + sign * d.pokerSessions);
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
  toast('Session removed. The monster spat it out.');
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
  toast('Applies from your next session.');
});
$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('Delete your consent, monster, campaign, sponsors and every session total from this device?')) return;
  if (session) { clearInterval(session.timer); clearInterval(session.reelTimer); session = null; await stopSdk(); }
  state = store.wipe();
  lastSummary = null;
  lastReceipt = null;
  dlg.close();
  renderConsent();
  show('consent');
  toast('All Smile Jar data deleted.');
});

window.addEventListener('beforeunload', () => { if (sdk) { try { sdk.destroy(); } catch { /* ignore */ } } });

// ---------------------------------------------------------------- boot
$('sim-banner').hidden = !SIMULATE;
if (store.hasConsent(state)) { renderHome(); show('home'); } else { renderConsent(); show('consent'); }
