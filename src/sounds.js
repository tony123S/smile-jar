// sounds.js: tiny synthesized sound effects with Web Audio. No audio files, no network.
// They play on the sound-effects bus from audio.js, so the SFX toggle and the volume apply,
// and they never touch the background music (except evolve(), which briefly ducks it).

import { audioContext, bus, setAudioPrefs, audioPrefs, duckMusic } from './audio.js';

function tone(freq, start, dur, { type = 'sine', gain = 0.18, slideTo } = {}) {
  const a = audioContext();
  const out = bus('sfx');
  if (!a || !out) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const arp = (notes, step, dur, opts) => notes.forEach((f, i) => tone(f, i * step, dur, opts));

// Each level's evolution fanfare is different (and climbs higher), so it feels earned.
const EVOLVE = [
  [523, 659, 784, 1047],
  [440, 554, 659, 880, 1109],
  [587, 740, 880, 1175, 1480],
  [659, 831, 988, 1319, 1661, 1976],
  [523, 659, 784, 1047, 1319, 1568, 2093],
];

export const sfx = {
  /** A qualifying smile was counted. */
  smile() { tone(1320, 0, 0.12, { type: 'triangle' }); tone(1980, 0.07, 0.22, { type: 'triangle', gain: 0.14 }); },
  coin() { sfx.smile(); },
  /** The monster's happy little squeak. */
  happy() { tone(880, 0.05, 0.12, { type: 'sine', gain: 0.1, slideTo: 1320 }); tone(1175, 0.16, 0.1, { type: 'sine', gain: 0.08, slideTo: 1568 }); },
  /** XP ticking into the bar. */
  xp() { tone(1568, 0.18, 0.06, { type: 'square', gain: 0.035 }); tone(2093, 0.24, 0.08, { type: 'square', gain: 0.03 }); },
  golden() { arp([1047, 1319, 1568, 2093], 0.07, 0.28, { type: 'triangle', gain: 0.15 }); },
  combo(n) { tone(660 + Math.min(n, 8) * 90, 0, 0.12, { type: 'square', gain: 0.06 }); },
  crack() { tone(520, 0, 0.35, { type: 'sawtooth', gain: 0.08, slideTo: 140 }); tone(1320, 0.05, 0.12, { type: 'triangle' }); },
  wow() { tone(300, 0, 0.3, { type: 'sine', gain: 0.12, slideTo: 900 }); },
  snack() { tone(880, 0, 0.1, { type: 'square', gain: 0.05 }); tone(1175, 0.08, 0.16, { type: 'triangle', gain: 0.12 }); },
  /** Flowers popping open in the world. */
  bloom() { arp([784, 988, 1175, 1568], 0.06, 0.35, { type: 'sine', gain: 0.07 }); },
  /** Generic level up chime. */
  levelUp() { arp([659, 784, 1047, 1319], 0.08, 0.3, { type: 'triangle', gain: 0.12 }); },
  /** Magical rising melody when the monster evolves into `level` (1..5). */
  evolve(level = 2) {
    duckMusic(2.6);
    const notes = EVOLVE[Math.max(0, Math.min(EVOLVE.length - 1, level - 1))];
    tone(220, 0, 0.9, { type: 'sine', gain: 0.1, slideTo: 880 });
    arp(notes, 0.1, 0.45, { type: 'triangle', gain: 0.13 });
    notes.slice(-2).forEach((f) => tone(f, notes.length * 0.1 + 0.05, 0.9, { type: 'sine', gain: 0.09 }));
  },
  /** A chapter of the story is complete. */
  chapter() {
    [[523, 659, 784], [587, 740, 880], [659, 831, 988, 1319]].forEach((ch, i) => ch.forEach((f) => tone(f, 1.4 + i * 0.22, i === 2 ? 0.9 : 0.25, { type: 'triangle', gain: 0.06 })));
  },
  start() { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); },
  click() { tone(990, 0, 0.05, { type: 'triangle', gain: 0.05 }); },
};

/** Kept for older callers: muting sound effects only. */
export function setMuted(m) { setAudioPrefs({ sfx: !m }); }
export function isMuted() { return !audioPrefs().sfx; }
