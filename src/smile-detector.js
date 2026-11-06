// smile-detector.js: turns the SmartSpectra expression stream into counted smiles.
//
// The SDK emits Expression samples: { stable, timestamp (µs), scores: [{ type, confidence 0-100 }] }.
// A smile is counted when the HAPPY score stays at or above `onThreshold` for `holdMs`
// on stable samples. After a count, the detector re-arms only once HAPPY has dropped below
// `offThreshold` for `rearmMs`, so one long grin counts once, not thirty times a second.
// This is a fun counter, not an emotion or health assessment.

export const ExpressionType = Object.freeze({
  UNSPECIFIED: 0, ANGRY: 1, CONTEMPT: 2, DISGUST: 3, FEAR: 4,
  HAPPY: 5, NEUTRAL: 6, SAD: 7, SURPRISE: 8,
});

export const DEFAULTS = Object.freeze({
  onThreshold: 60,     // HAPPY confidence (%) needed to start a smile
  offThreshold: 35,    // HAPPY confidence (%) below which the smile has ended
  holdMs: 500,         // a smile must be held this long to count
  rearmMs: 700,        // and fully relaxed for this long before the next one can count
  minIntervalMs: 1500, // hard floor between two counted smiles
  faceLostMs: 2000,    // a gap with no samples this long resets the detector
});

export function happyScore(expression) {
  const s = expression?.scores?.find((x) => x.type === ExpressionType.HAPPY);
  return s ? Number(s.confidence) || 0 : 0;
}

export function tsToMs(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts / 1000;
  if (typeof ts === 'bigint') return Number(ts) / 1000;
  if (typeof ts.toNumber === 'function') return ts.toNumber() / 1000; // protobufjs Long
  return Number(ts) / 1000;
}

export class SmileDetector {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.state = 'armed'; // armed -> rising -> counted -> armed
    this.riseStart = null;
    this.belowSince = null;
    this.lastSmileAt = -Infinity;
    this.lastSampleAt = null;
    this.count = 0;
    this.level = 0;
  }

  /**
   * Feed one sample. Returns true when this sample completes a counted smile.
   * @param {{ t: number, happy: number, stable: boolean }} sample  t in ms
   */
  push({ t, happy, stable }) {
    const o = this.opts;
    if (this.lastSampleAt != null && t < this.lastSampleAt) return false; // out of order
    if (this.lastSampleAt != null && t - this.lastSampleAt > o.faceLostMs) {
      // Face left the frame or the stream paused: start fresh, keep the count.
      this.state = 'armed';
      this.riseStart = null;
      this.belowSince = null;
    }
    this.lastSampleAt = t;
    this.level = happy;
    if (!stable) return false;

    switch (this.state) {
      case 'armed':
        if (happy >= o.onThreshold) { this.state = 'rising'; this.riseStart = t; }
        return false;
      case 'rising':
        if (happy < o.onThreshold) { this.state = 'armed'; this.riseStart = null; return false; }
        if (t - this.riseStart >= o.holdMs && t - this.lastSmileAt >= o.minIntervalMs) {
          this.state = 'counted';
          this.lastSmileAt = t;
          this.belowSince = null;
          this.count += 1;
          return true;
        }
        return false;
      case 'counted':
        if (happy < o.offThreshold) {
          if (this.belowSince == null) this.belowSince = t;
          if (t - this.belowSince >= o.rearmMs) { this.state = 'armed'; this.belowSince = null; }
        } else {
          this.belowSince = null;
        }
        return false;
      default:
        return false;
    }
  }

  /** Feed every Expression in a decoded Metrics slice. Returns how many smiles it completed. */
  pushExpressions(expressions) {
    let n = 0;
    for (const e of expressions || []) {
      if (this.push({ t: tsToMs(e.timestamp), happy: happyScore(e), stable: !!e.stable })) n += 1;
    }
    return n;
  }
}
