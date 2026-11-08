// signals.js: reads the real SmartSpectra signals out of a decoded Metrics slice and keeps a
// record of which ones have actually arrived. The app's "Live signals" panel shows this, so
// nobody (including us) has to guess whether blinking or breathing data is really flowing.

import { tsToMs } from './smile-detector.js';

export const SIGNALS = Object.freeze([
  { key: 'expressions', label: 'Expressions' },
  { key: 'blinking', label: 'Blinking' },
  { key: 'talking', label: 'Talking' },
  { key: 'breathing', label: 'Breathing' },
  { key: 'pulse', label: 'Pulse' },
]);

export class SignalMonitor {
  constructor({ liveMs = 3000 } = {}) {
    this.liveMs = liveMs;
    this.last = {};
    this.count = {};
  }

  mark(key, now = Date.now(), n = 1) {
    this.last[key] = now;
    this.count[key] = (this.count[key] || 0) + n;
  }

  /** { key: { seen, live, count } } */
  status(now = Date.now()) {
    const out = {};
    for (const { key } of SIGNALS) {
      const t = this.last[key];
      out[key] = { seen: t != null, live: t != null && now - t <= this.liveMs, count: this.count[key] || 0 };
    }
    return out;
  }

  /** Record every signal present in a decoded Metrics slice. */
  observe(m, now = Date.now()) {
    const f = m?.face;
    if (f?.expression?.length) this.mark('expressions', now, f.expression.length);
    if (f?.blinking?.length) this.mark('blinking', now, f.blinking.length);
    if (f?.talking?.length) this.mark('talking', now, f.talking.length);
    const br = m?.breathing;
    if (br?.upperTrace?.length || br?.lowerTrace?.length) this.mark('breathing', now, (br.upperTrace || br.lowerTrace).length);
    if (m?.cardio?.pulseRate?.length) this.mark('pulse', now, m.cardio.pulseRate.length);
  }
}

/** Counts blinks as rising edges of the SDK's blinking.detected flag. */
export class BlinkTracker {
  constructor() { this.prev = false; this.blinks = 0; this.lastT = -Infinity; }

  /** Returns how many new blinks started in this slice. */
  push(statuses) {
    let n = 0;
    for (const s of statuses || []) {
      const t = tsToMs(s.timestamp);
      if (t < this.lastT) continue;
      this.lastT = t;
      const d = !!s.detected;
      if (d && !this.prev) n += 1;
      this.prev = d;
    }
    this.blinks += n;
    return n;
  }

  get closed() { return this.prev; }
}

/** Latest talking state from the SDK's talking.detected flag. */
export function talkingNow(statuses) {
  if (!statuses?.length) return null;
  return !!statuses[statuses.length - 1].detected;
}

/**
 * Normalises the SDK's chest breathing trace (arbitrary units) to 0..1 over a rolling window,
 * so the monster's belly can rise and fall with the user's real breathing.
 */
export class BreathNormalizer {
  constructor(windowSize = 300) { this.size = windowSize; this.values = []; this.latest = null; }

  push(measurements) {
    for (const m of measurements || []) {
      const v = Number(m.value);
      if (!Number.isFinite(v)) continue;
      this.values.push(v);
      if (this.values.length > this.size) this.values.shift();
      this.latest = v;
    }
    return this.level();
  }

  level() {
    if (this.latest == null || this.values.length < 10) return null;
    let lo = Infinity, hi = -Infinity;
    for (const v of this.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) return 0.5;
    return (this.latest - lo) / (hi - lo);
  }
}
