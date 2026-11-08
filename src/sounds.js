// sounds.js: tiny synthesized sound effects with Web Audio. No audio files, no network.

let ctx = null;
let muted = false;

function audio() {
  if (muted) return null;
  try {
    ctx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18, slideTo } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  coin() { tone(1320, 0, 0.12, { type: 'triangle' }); tone(1980, 0.07, 0.22, { type: 'triangle', gain: 0.14 }); },
  golden() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.28, { type: 'triangle', gain: 0.15 })); },
  combo(n) { tone(660 + Math.min(n, 8) * 90, 0, 0.12, { type: 'square', gain: 0.06 }); },
  crack() { tone(520, 0, 0.35, { type: 'sawtooth', gain: 0.08, slideTo: 140 }); tone(1320, 0.05, 0.12, { type: 'triangle' }); },
  wow() { tone(300, 0, 0.3, { type: 'sine', gain: 0.12, slideTo: 900 }); },
  start() { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); },
};

export function setMuted(m) { muted = !!m; }
export function isMuted() { return muted; }
