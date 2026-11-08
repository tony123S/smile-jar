// renderer.js: Smile Jar UI. Bundled to dist/renderer.bundle.js by build.mjs.
//
// SmartSpectra integration lives in startSdk(): we request the SDK's face bundle
// (which includes EXPRESSIONS), decode each `metrics` event, and feed
// metrics.face.expression[] into SmileDetector. Pulse (cardio bundle) is optional.

'use strict';

import { SmileDetector, DEFAULTS as SMILE, happyScore, mascotFace } from './src/smile-detector.js';
import { pledgeFor, sessionPledge, marginalRate, formatCents, pledgeStatementCsv } from './src/pledges.js';
import * as store from './src/store.js';
import { JOY_REEL } from './src/joy-reel.js';
import { HumourModel, personaFor } from './src/humour.js';
import { JarVoice } from './src/jar-voice.js';
import { sfx, setMuted, isMuted } from './src/sounds.js';
import { drawReceipt } from './src/receipt.js';
import { SimulatedSDK } from './src/simulator.js';

const {
  SmartSpectraSDK, ProcessingStatus, ValidationCode, faceMetrics, cardioMetrics,
} = require('@smartspectra/node-sdk/renderer');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

/* global __SMARTSPECTRA_API_KEY__, __SIMULATE__ */
const API_KEY = __SMARTSPECTRA_API_KEY__;
const SIMULATE = __SIMULATE__;

const $ = (id) => document.getElementById(id);
let state = store.load();

// ---------------------------------------------------------------- views
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
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function persist() {
  if (!store.save(state)) toast('Could not save on this device; totals will reset when the app closes.');
}

// ---------------------------------------------------------------- jar SVG
let jarSeq = 0;
const STANDALONE_JAR_CSS = '.jar-lid{fill:#f4a72a;stroke:#2b2118;stroke-width:2.5}.jar-glass{fill:none;stroke:#2b2118;stroke-width:3}.jar-fill{fill:#ffe2a8}.jar-coin{fill:#f4a72a;stroke:#b77610;stroke-width:1.5}.jar-shine{stroke:#fff;stroke-opacity:.7;stroke-width:5;stroke-linecap:round}.jar-smile{fill:none;stroke:#2b2118;stroke-width:3;stroke-linecap:round}.jar-grin,.jar-eye{fill:#2b2118}';
const MOUTHS = {
  smile: '<path d="M78 120 q22 22 44 0" class="jar-smile"/>',
  flat: '<path d="M84 128 h32" class="jar-smile"/>',
  grin: '<path d="M72 114 h56 q-4 34 -28 34 q-24 0 -28 -34 z" class="jar-grin"/>',
  wow: '<ellipse cx="100" cy="132" rx="11" ry="15" class="jar-grin"/>',
};
function jarSvg(fraction, coins, face = 'smile', standalone = false) {
  const clipId = `jarclip${++jarSeq}`;
  const f = Math.max(0, Math.min(1, fraction));
  const top = 40, bottom = 196, h = bottom - top;
  const level = bottom - h * f;
  const coinDots = [];
  const n = Math.min(coins, 60);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 6), col = i % 6;
    const y = bottom - 10 - row * 12;
    if (y < top + 14) break;
    const x = 52 + col * 16 + (row % 2 ? 8 : 0);
    coinDots.push(`<circle cx="${x}" cy="${y}" r="6" class="jar-coin"/>`);
  }
  return `
  <svg ${standalone ? 'xmlns="http://www.w3.org/2000/svg" width="200" height="220"' : ''} viewBox="0 0 200 220" class="jar" role="img" aria-label="Jar ${Math.round(f * 100)} percent full">
    ${standalone ? `<style>${STANDALONE_JAR_CSS}</style>` : ''}
    <defs><clipPath id="${clipId}"><path d="M40 44 h120 v132 a24 24 0 0 1 -24 24 h-72 a24 24 0 0 1 -24 -24 z"/></clipPath></defs>
    <rect x="52" y="10" width="96" height="22" rx="6" class="jar-lid"/>
    <g clip-path="url(#${clipId})">
      <rect x="30" y="${level}" width="140" height="${bottom + 10 - level}" class="jar-fill"/>
      ${coinDots.join('')}
    </g>
    <path d="M40 44 h120 v132 a24 24 0 0 1 -24 24 h-72 a24 24 0 0 1 -24 -24 z" class="jar-glass"/>
    <path d="M56 60 v80" class="jar-shine"/>
    <g class="jar-face face-${face}">
      <circle cx="82" cy="96" r="${face === 'wow' ? 7 : 5}" class="jar-eye"/>
      <circle cx="118" cy="96" r="${face === 'wow' ? 7 : 5}" class="jar-eye"/>
      ${MOUTHS[face] || MOUTHS.smile}
    </g>
  </svg>`;
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
  const { smiles, total, lines } = campaignTotals();
  const goal = Math.max(100, c.goalCents || 0);
  $('home-jar').innerHTML = jarSvg(total / goal, smiles);
  $('home-cause').textContent = c.cause || 'a good cause';
  $('home-total').textContent = formatCents(total);
  $('home-smiles').textContent = smiles;
  $('home-goal').textContent = formatCents(goal);
  $('home-progress').style.width = `${Math.min(100, (total / goal) * 100)}%`;
  const rate = marginalRate(c.sponsors, smiles);
  $('home-rate').textContent = c.sponsors.length === 0
    ? 'Add a sponsor so your smiles are worth something.'
    : rate > 0 ? `Your next smile is worth ${rate}¢.` : 'Every sponsor has reached their cap. Add another to keep going!';

  $('f-cause').value = c.cause;
  $('f-goal').value = Math.round(goal / 100);
  $('f-minutes').value = state.settings.sessionMinutes;
  $('f-pulse').checked = !!state.settings.showPulse;

  const body = $('sponsor-rows');
  body.innerHTML = '';
  for (const s of c.sponsors) {
    const owes = lines.find((l) => l.id === s.id)?.cents || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-k="name" maxlength="40" aria-label="Sponsor name"></td>
      <td><input data-k="centsPerSmile" type="number" min="0" max="500" step="1" aria-label="Cents per smile"></td>
      <td><input data-k="cap" type="number" min="0" step="1" placeholder="none" aria-label="Cap in dollars"></td>
      <td class="owes">${formatCents(owes)}</td>
      <td><button type="button" class="link danger-link" aria-label="Remove sponsor">Remove</button></td>`;
    tr.querySelector('[data-k=name]').value = s.name;
    tr.querySelector('[data-k=centsPerSmile]').value = s.centsPerSmile;
    tr.querySelector('[data-k=cap]').value = s.capCents ? Math.round(s.capCents / 100) : '';
    tr.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'name') s.name = e.target.value.trim() || 'Sponsor';
      if (k === 'centsPerSmile') s.centsPerSmile = Math.max(0, Math.round(Number(e.target.value) || 0));
      if (k === 'cap') s.capCents = e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value) * 100));
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
}

$('f-cause').addEventListener('change', (e) => { state.campaign.cause = e.target.value.trim() || 'a good cause'; persist(); renderHome(); });
$('f-goal').addEventListener('change', (e) => { state.campaign.goalCents = Math.max(1, Math.round(Number(e.target.value) || 25)) * 100; persist(); renderHome(); });
$('f-minutes').addEventListener('change', (e) => { state.settings.sessionMinutes = Math.min(15, Math.max(1, Math.round(Number(e.target.value) || 2))); persist(); renderHome(); });
$('f-pulse').addEventListener('change', (e) => { state.settings.showPulse = e.target.checked; persist(); });
$('btn-add-sponsor').addEventListener('click', () => {
  state.campaign.sponsors.push({ id: `s${Date.now()}`, name: 'New sponsor', centsPerSmile: 5, capCents: 0 });
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
let session = null; // { startedAt, smiles, before, timer, deadline, reel, reelIdx }
let lastSummary = null;

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

function nextCard() {
  if (!session) return;
  const card = session.humour.next(Date.now());
  $('reel-kind').textContent = card.kind;
  $('reel-text').textContent = card.text;
  const fav = session.humour.favourite();
  const learned = session.humour.lastPickWasLearned && fav === card.kind;
  $('reel-why').textContent = learned
    ? (session.mode === 'poker' ? `Picked to crack you: ${card.kind.toLowerCase()}s got you before` : `Picked for you: you smile at ${card.kind.toLowerCase()}s`)
    : '';
  if (learned && !session.toldLearned) {
    const line = session.voice.onLearned(Date.now());
    if (line) { session.toldLearned = true; speak(line.text); }
  }
  renderTaste();
}

function renderTaste() {
  const rows = session.humour.summary().filter((r) => r.smiles > 0);
  $('s-taste').textContent = rows.length
    ? `${session.mode === 'poker' ? 'Your weak spots' : 'What makes you smile'}: ${rows.map((r) => `${r.kind} ${r.smiles}`).join(' \u00b7 ')}`
    : '';
}

function speak(text) {
  const b = $('s-speech');
  b.textContent = text;
  b.hidden = false;
  void b.offsetWidth;
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

function dropCoin(cents, golden = false) {
  const layer = $('coin-layer');
  const coin = document.createElement('div');
  coin.className = golden ? 'coin golden' : 'coin';
  coin.textContent = cents > 0 ? `+${cents}¢` : '☺';
  const jar = $('session-jar').getBoundingClientRect();
  coin.style.left = `${jar.left + jar.width / 2 - 22}px`;
  coin.style.top = `${jar.top - 40}px`;
  layer.appendChild(coin);
  setTimeout(() => coin.remove(), 1200);
}

function renderSession() {
  if (!session) return;
  const sponsors = state.campaign.sponsors;
  const cents = sessionPledge(sponsors, session.before, session.smiles);
  $('s-smiles').textContent = session.smiles;
  $('s-money').textContent = `${formatCents(cents)} pledged`;
  renderSessionJar();
  if (session.mode === 'poker') {
    const streak = Date.now() - session.straightSince;
    session.bestStreakMs = Math.max(session.bestStreakMs, streak);
    $('s-streak').textContent = `Straight face: ${fmtSecs(streak)} \u00b7 best ${fmtSecs(session.bestStreakMs)}`;
  }
  const left = Math.max(0, session.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  $('s-timer').textContent = `${m}:${String(s).padStart(2, '0')} left`;
  if (left <= 0) endSession();
}

function fmtSecs(ms) {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function renderSessionJar() {
  const goal = Math.max(100, state.campaign.goalCents);
  const total = pledgeFor(state.campaign.sponsors, session.before + session.smiles).total;
  $('session-jar').innerHTML = jarSvg(total / goal, session.before + session.smiles, session.face);
}

function popBadge(text, kind) {
  const b = $('s-badge');
  b.textContent = text;
  b.className = `badge ${kind}`;
  b.hidden = false;
  void b.offsetWidth; // restart the pop animation
  b.classList.add('pop');
  clearTimeout(popBadge.t);
  popBadge.t = setTimeout(() => { b.hidden = true; }, 1800);
}

const COMBO_WINDOW_MS = 8000;
const GOLDEN_AT = 92;

function onSmile(peakHappy = 0) {
  const sponsors = state.campaign.sponsors;
  const worth = marginalRate(sponsors, session.before + session.smiles);
  session.smiles += 1;
  const now = Date.now();
  session.combo = now - session.lastSmileAt <= COMBO_WINDOW_MS ? session.combo + 1 : 1;
  session.bestCombo = Math.max(session.bestCombo, session.combo);
  session.lastSmileAt = now;
  const golden = peakHappy >= GOLDEN_AT;
  if (golden) session.golden += 1;
  if (session.mode === 'poker') {
    session.bestStreakMs = Math.max(session.bestStreakMs, now - session.straightSince);
    session.straightSince = now;
  }
  dropCoin(worth, golden);
  session.humour.creditSmile(now);
  renderTaste();
  if (session.mode === 'poker') { sfx.crack(); session.voice.resetStreak(); }
  else if (golden) sfx.golden();
  else { sfx.coin(); if (session.combo > 1) sfx.combo(session.combo); }
  speak(session.voice.onSmile({ mode: session.mode, golden, combo: session.combo }, now).text);
  if (session.mode === 'poker') popBadge(session.combo > 1 ? `Cracked again! x${session.combo}` : 'You cracked!', 'crack');
  else if (golden) popBadge(session.combo > 1 ? `Golden grin! Combo x${session.combo}` : 'Golden grin!', 'gold');
  else if (session.combo > 1) popBadge(`Combo x${session.combo}!`, 'combo');
  renderSession();
}

function handleMetrics(m) {
  if (!session || !detector) return;
  const expressions = m.face?.expression;
  if (expressions?.length) {
    // Process sample by sample so each counted smile gets its own coin.
    for (const e of expressions) {
      const before = detector.count;
      detector.pushExpressions([e]);
      if (detector.count > before) onSmile(happyScore(e));
    }
    updateMeter(detector.level);
    const face = mascotFace(expressions[expressions.length - 1]);
    if (face !== session.face) {
      if (face === 'wow' && session.mode !== 'poker') { popBadge('Whoa!', 'wow'); sfx.wow(); }
      session.face = face;
      renderSessionJar();
    }
    const now = Date.now();
    const line = session.voice.onTick({
      mode: session.mode, happy: detector.level, face, streakMs: now - session.straightSince,
    }, now);
    if (line) speak(line.text);
  }
  const pr = m.cardio?.pulseRate;
  if (pr?.length && state.settings.showPulse) {
    const v = pr[pr.length - 1].value;
    if (v > 0) $('pulse-value').textContent = Math.round(v);
  }
}

function buildSdk() {
  const requestedMetrics = [...faceMetrics];
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
    if (code === ValidationCode.kOk && session?.mode === 'poker') text = 'Looking good. Don\u2019t you dare smile.';
    setHint(text, code === ValidationCode.kOk ? 'ok' : code === ValidationCode.kCameraTuning ? 'warn' : 'err');
  });
  s.on('metrics', (buf) => {
    try {
      handleMetrics(SIMULATE ? buf : decodeMetrics(buf));
    } catch (err) {
      console.error('[smile-jar] could not decode metrics', err);
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
  session = {
    startedAt: Date.now(),
    deadline: Date.now() + state.settings.sessionMinutes * 60000,
    smiles: 0,
    before: store.totalSmiles(state),
    humour: new HumourModel(JOY_REEL),
    voice: new JarVoice(),
    toldLearned: false,
    mode,
    face: 'flat',
    combo: 0,
    bestCombo: 0,
    lastSmileAt: -Infinity,
    golden: 0,
    straightSince: Date.now(),
    bestStreakMs: 0,
  };
  const poker = mode === 'poker';
  $('s-mode').textContent = poker ? 'Try Not to Smile' : 'Smile Session';
  $('s-mode-help').textContent = poker
    ? 'Keep a straight face. Every time you crack, your sponsors pay up.'
    : 'Smile when something makes you happy. Every smile drops a coin.';
  $('s-unit').textContent = poker ? 'cracks' : 'smiles';
  $('s-streak').hidden = !poker;
  $('s-badge').hidden = true;
  $('s-speech').hidden = true;
  syncMute();
  sfx.start();
  $('pulse-row').hidden = !state.settings.showPulse;
  $('pulse-value').textContent = '--';
  $('reel-text').hidden = false;
  $('clip').hidden = true;
  $('meter-mark').style.left = `${SMILE.onThreshold}%`;
  updateMeter(0);
  nextCard();
  restartReelTimer();
  show('session');
  renderSession();
  speak(session.voice.start(mode, Date.now()).text);
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

let ending = false;
async function endSession() {
  if (!session || ending) return;
  ending = true;
  clearInterval(session.timer);
  clearInterval(session.reelTimer);
  const s = session;
  session = null;
  await stopSdk();
  const clip = $('clip');
  clip.pause();
  if (clip.src) { URL.revokeObjectURL(clip.src); clip.removeAttribute('src'); }
  $('clip-file').value = '';

  const record = {
    id: `x${s.startedAt}`,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - s.startedAt,
    smiles: s.smiles,
    mode: s.mode,
    pledgedCents: sessionPledge(state.campaign.sponsors, s.before, s.smiles),
  };
  state.sessions.push(record);
  persist();
  lastSummary = record;

  const goal = Math.max(100, state.campaign.goalCents);
  const { total } = campaignTotals();
  $('summary-jar').innerHTML = jarSvg(total / goal, store.totalSmiles(state), 'grin');
  if (s.mode === 'poker') s.bestStreakMs = Math.max(s.bestStreakMs, Date.now() - s.straightSince);
  $('sum-smiles').textContent = record.smiles;
  $('sum-unit').textContent = s.mode === 'poker' ? (record.smiles === 1 ? 'crack' : 'cracks') : (record.smiles === 1 ? 'smile' : 'smiles');
  const extras = [];
  if (s.mode === 'poker') extras.push(`Longest straight face: ${fmtSecs(s.bestStreakMs)}`);
  if (s.bestCombo > 1) extras.push(`Best combo: x${s.bestCombo}`);
  if (s.golden > 0) extras.push(`Golden grins: ${s.golden}`);
  const fav = s.humour.favourite();
  const persona = fav
    ? (s.mode === 'poker' ? `Your weak spot: ${fav.toLowerCase()}s` : `You're ${personaFor(fav)}`)
    : (s.mode === 'poker' ? 'Unbreakable. Nothing cracked you.' : '');
  $('sum-extras').textContent = extras.join(' \u00b7 ');
  $('sum-persona').textContent = persona;
  lastReceipt = {
    title: s.mode === 'poker' ? 'Try Not to Smile' : 'Smile Session',
    headline: `${record.smiles} ${$('sum-unit').textContent}`,
    pledged: formatCents(record.pledgedCents),
    cause: state.campaign.cause,
    lines: extras,
    persona,
    jarSvg: jarSvg(total / goal, store.totalSmiles(state), 'grin', true),
    date: new Date(),
  };
  $('receipt-preview').hidden = true;
  $('sum-money').textContent = formatCents(record.pledgedCents);
  $('sum-cause').textContent = state.campaign.cause;
  $('sum-detail').textContent = `The jar now holds ${formatCents(total)} of your ${formatCents(goal)} goal.`;
  show('summary');
  ending = false;
}
$('btn-end').addEventListener('click', endSession);

let lastReceipt = null;
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
  if (lastSummary) state.sessions = state.sessions.filter((x) => x.id !== lastSummary.id);
  lastSummary = null;
  persist();
  renderHome();
  show('home');
  toast('Session removed.');
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
  if (!confirm('Delete your consent, campaign, sponsors and every session total from this device?')) return;
  if (session) { clearInterval(session.timer); clearInterval(session.reelTimer); session = null; await stopSdk(); }
  state = store.wipe();
  dlg.close();
  renderConsent();
  show('consent');
  toast('All Smile Jar data deleted.');
});

window.addEventListener('beforeunload', () => { if (sdk) { try { sdk.destroy(); } catch { /* ignore */ } } });

// ---------------------------------------------------------------- boot
$('sim-banner').hidden = !SIMULATE;
if (store.hasConsent(state)) { renderHome(); show('home'); } else { renderConsent(); show('consent'); }
