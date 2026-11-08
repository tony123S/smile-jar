// music.js: original background music, generated live with Web Audio. No audio files.
//
// Each track is a short chord progression with a melody, written out below in MIDI note numbers.
// A small look-ahead scheduler plays it step by step (eighth notes) and wraps around at the end,
// so it loops seamlessly and never "restarts". Switching tracks crossfades. Smiles never touch
// the music; only screen changes do.

import { audioContext, musicNode, audioPrefs } from './audio.js';

const _ = 0; // rest

export const TRACKS = Object.freeze({
  // Opening story: gentle, dreamy, a little mysterious. A minor, slow pad and sparse bells.
  story: {
    bpm: 62,
    chords: [[57, 60, 64], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62]],
    melody: [
      [76, _, _, 72, _, _, 71, _],
      [72, _, _, 69, _, _, _, _],
      [67, _, _, 72, _, _, 76, _],
      [74, _, _, 71, _, _, _, _],
    ],
    lead: 'bell', arp: null, bass: false, drums: false,
  },
  // Home: soft piano, bells and warm ambience.
  home: {
    bpm: 84,
    chords: [[48, 52, 55, 60], [45, 52, 57, 60], [41, 53, 57, 60], [43, 55, 59, 62]],
    melody: [
      [72, _, 76, _, 79, _, 76, _],
      [76, _, 72, _, 69, _, _, _],
      [69, _, 72, _, 77, _, 76, _],
      [74, _, 71, _, 67, _, _, _],
    ],
    lead: 'bell', arp: 'piano', bass: false, drums: false,
  },
  // Gameplay: cheerful, playful and upbeat.
  play: {
    bpm: 116,
    chords: [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]],
    melody: [
      [72, 74, 76, _, 79, _, 76, 74],
      [74, _, 71, _, 67, 69, 71, _],
      [72, _, 76, 72, 69, _, 72, _],
      [77, 76, 74, _, 72, _, _, _],
    ],
    lead: 'pluck', arp: null, bass: true, drums: true,
  },
  // Final chapter: emotional, uplifting.
  final: {
    bpm: 72,
    chords: [[41, 53, 57, 60], [43, 55, 59, 62], [40, 55, 59, 64], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62], [48, 55, 60, 64], [48, 55, 60, 67]],
    melody: [
      [77, _, 76, _, 72, _, _, _],
      [74, _, 76, _, 79, _, _, _],
      [79, _, 76, _, 71, _, 72, _],
      [76, _, _, _, 72, _, _, _],
      [77, _, 79, _, 81, _, 77, _],
      [79, _, 81, _, 83, _, _, _],
      [84, _, _, 79, _, 76, _, _],
      [79, _, _, _, 72, _, _, _],
    ],
    lead: 'bell', arp: 'piano', bass: false, drums: false,
  },
});

export const STEPS_PER_BAR = 8;

export function loopLength(name) {
  return TRACKS[name].chords.length * STEPS_PER_BAR;
}

/** The notes to play at a step. Pure, so the loop can be tested. */
export function notesAt(name, step) {
  const tr = TRACKS[name];
  const len = loopLength(name);
  const s = ((step % len) + len) % len;
  const bar = Math.floor(s / STEPS_PER_BAR), pos = s % STEPS_PER_BAR;
  const chord = tr.chords[bar];
  const out = [];
  if (pos === 0) for (const n of chord) out.push({ inst: 'pad', midi: n, steps: STEPS_PER_BAR, gain: 0.05 });
  const m = tr.melody[bar][pos];
  if (m) out.push({ inst: tr.lead, midi: m, steps: 2, gain: tr.lead === 'pluck' ? 0.07 : 0.06 });
  if (tr.arp) {
    const tones = [...chord.slice(1), chord[1] + 12];
    out.push({ inst: tr.arp, midi: tones[pos % tones.length] + 12, steps: 1, gain: 0.035 });
  }
  if (tr.bass && pos % 4 === 0) out.push({ inst: 'bass', midi: chord[0] - 12, steps: 3, gain: 0.12 });
  if (tr.drums) {
    if (pos % 4 === 0) out.push({ inst: 'kick', midi: 0, steps: 1, gain: 0.18 });
    if (pos % 2 === 1) out.push({ inst: 'shaker', midi: 0, steps: 1, gain: 0.03 });
    if (pos === 2 || pos === 6) for (const n of chord) out.push({ inst: 'pluck', midi: n + 12, steps: 1, gain: 0.022 });
  }
  return out;
}

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

let noise = null;
function noiseBuffer(ctx) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function envGain(ctx, out, t, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out);
  return g;
}

function osc(ctx, type, freq, t, end, dest, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  o.connect(dest);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function voice(ctx, out, ev, t, stepSec) {
  const f = hz(ev.midi);
  const dur = ev.steps * stepSec;
  switch (ev.inst) {
    case 'pad': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      const g = envGain(ctx, out, t, ev.gain, 0.6, Math.max(0.1, dur - 0.6), 0.9);
      lp.connect(g);
      osc(ctx, 'triangle', f, t, t + dur + 0.9, lp, -5);
      osc(ctx, 'sine', f, t, t + dur + 0.9, lp, 6);
      break;
    }
    case 'bell': {
      const g = envGain(ctx, out, t, ev.gain, 0.005, 0, 1.8);
      osc(ctx, 'sine', f, t, t + 1.9, g);
      const g2 = envGain(ctx, out, t, ev.gain * 0.25, 0.005, 0, 0.6);
      osc(ctx, 'sine', f * 2.76, t, t + 0.7, g2);
      break;
    }
    case 'piano': {
      const g = envGain(ctx, out, t, ev.gain, 0.008, 0, 0.9);
      osc(ctx, 'triangle', f, t, t + 1, g);
      osc(ctx, 'sine', f * 2, t, t + 1, g);
      break;
    }
    case 'pluck': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
      const g = envGain(ctx, out, t, ev.gain, 0.004, Math.min(dur, 0.12), 0.22);
      lp.connect(g);
      osc(ctx, 'square', f, t, t + dur + 0.3, lp);
      break;
    }
    case 'bass': {
      const g = envGain(ctx, out, t, ev.gain, 0.01, Math.min(dur, 0.3), 0.25);
      osc(ctx, 'sine', f, t, t + dur + 0.3, g);
      break;
    }
    case 'kick': {
      const g = envGain(ctx, out, t, ev.gain, 0.002, 0, 0.16);
      const o = osc(ctx, 'sine', 140, t, t + 0.2, g);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      break;
    }
    case 'shaker': {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 6000;
      const g = envGain(ctx, out, t, ev.gain, 0.002, 0, 0.05);
      src.connect(bp).connect(g);
      src.start(t);
      src.stop(t + 0.08);
      break;
    }
    default:
  }
}

const LOOKAHEAD = 0.3;

class MusicPlayer {
  constructor() {
    this.want = null; // the track the current screen asks for
    this.playing = null;
    this.gain = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  /** Ask for a track. It starts once audio is unlocked by a user gesture, and only if music is on. */
  request(name) {
    this.want = name && TRACKS[name] ? name : null;
    this.sync();
  }

  /** Re-check what should be playing (after unlocking audio or toggling music). */
  sync() {
    const ctx = audioContext();
    const target = ctx && audioPrefs().music ? this.want : null;
    if (target === this.playing) return;
    this.fadeOut();
    if (!target) { this.stopTimer(); return; }
    const out = musicNode();
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    this.gain.connect(out);
    this.playing = target;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 60);
    this.tick();
  }

  fadeOut() {
    const ctx = audioContext();
    if (this.gain && ctx) {
      const g = this.gain;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 2600);
    }
    this.gain = null;
    this.playing = null;
  }

  stopTimer() { clearInterval(this.timer); this.timer = null; }

  tick() {
    const ctx = audioContext();
    if (!ctx || !this.playing || !this.gain) return;
    const tr = TRACKS[this.playing];
    const stepSec = 60 / tr.bpm / 2;
    // If the app was in the background, don't try to catch up on missed notes.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const ev of notesAt(this.playing, this.step)) voice(ctx, this.gain, ev, this.nextTime, stepSec);
      this.nextTime += stepSec;
      this.step = (this.step + 1) % loopLength(this.playing);
    }
  }

  /** For the UI and tests: what is playing right now (null when silent). */
  get current() { return this.playing; }
}

export const music = new MusicPlayer();
