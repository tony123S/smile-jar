// mood.js: turns the jumpy live expression scores into a calm, readable face for the monster.
//
// The SDK's HAPPY and SURPRISE scores can jump around from one sample to the next. Copying
// them straight onto the monster makes its face flicker. MoodMirror smooths the scores,
// only changes face once a new expression has held for a moment, keeps each face on screen
// for a minimum time, and eases back to calm through a soft smile instead of snapping.
//
// Faces it can return:
//   'flat'  relaxed / neutral (the monster's own resting look)
//   'grin'  you are smiling
//   'extra' you have kept smiling for a while: extra happy
//   'wow'   you look surprised (also fires a one-off 'jump' event)
//   'soft'  on the way back to calm after a smile
//
// Only HAPPY and SURPRISE are mirrored. The SDK also reports sad, angry and others, but
// they're left out on purpose until they can be checked on real faces.
// This is cosmetic only. It never counts smiles (SmileDetector does that) and nothing is saved.

import { scoreOf, ExpressionType } from './smile-detector.js';

export const MOOD = Object.freeze({
  smoothMs: 120,       // time constant of the running average, so it behaves the same at any frame rate
  grinOn: 55,          // smoothed HAPPY needed to start grinning ...
  grinOff: 38,         // ... and below which the grin ends (gap = no flicker at the edge)
  wowOn: 50,           // smoothed SURPRISE needed for the surprised face
  wowOff: 30,
  enterMs: 220,        // a new expression must hold this long before the face changes
  minShowMs: 450,      // once shown, a face stays at least this long
  softMs: 900,         // after a smile, a soft smile lingers this long before relaxing
  extraAfterMs: 3000,  // smiling continuously this long makes it extra happy
  jumpCooldownMs: 2500,
  lostMs: 1500,        // no samples for this long (face out of view): ease back to calm
  winkEvery: 5,        // every 5th blink it winks back instead
});

export class MoodMirror {
  constructor(opts = {}) {
    this.o = { ...MOOD, ...opts };
    this.reset();
  }

  reset() {
    this.happy = 0;
    this.surprise = 0;
    this.face = 'flat';
    this.shownAt = -Infinity;
    this.want = 'flat';
    this.wantSince = 0;
    this.grinSince = null;
    this.softUntil = 0;
    this.lastJumpAt = -Infinity;
    this.lastSampleAt = -Infinity;
    this.lastSampleT = null;
    this.blinks = 0;
  }

  /** The expression the smoothed scores point at right now, with hysteresis on each edge. */
  target(now) {
    const o = this.o;
    const smiling = this.face === 'grin' || this.face === 'extra' ? this.happy >= o.grinOff : this.happy >= o.grinOn;
    if (smiling) {
      if (this.grinSince == null) this.grinSince = now;
      return now - this.grinSince >= o.extraAfterMs ? 'extra' : 'grin';
    }
    this.grinSince = null;
    const surprised = this.face === 'wow' ? this.surprise >= o.wowOff : this.surprise >= o.wowOn;
    if (surprised) return 'wow';
    if (now < this.softUntil) return 'soft';
    return 'flat';
  }

  /**
   * Feed one Expression sample. Returns { face, changed, events } where events can hold
   * 'jump' (a fresh surprise) and 'extra' (just became extra happy).
   */
  push(expression, now) {
    // Use the SDK's own sample time when there is one (a batch can hold several samples).
    const t = Number(expression?.timestamp) > 0 ? Number(expression.timestamp) / 1000 : now;
    const dt = this.lastSampleT == null ? 1e9 : Math.max(0, t - this.lastSampleT);
    this.lastSampleT = t;
    const a = dt >= 1e9 ? 1 : 1 - Math.exp(-dt / this.o.smoothMs);
    this.happy += (scoreOf(expression, ExpressionType.HAPPY) - this.happy) * a;
    this.surprise += (scoreOf(expression, ExpressionType.SURPRISE) - this.surprise) * a;
    this.lastSampleAt = now;
    return this.settle(now);
  }

  /** Call regularly even without samples, so the face relaxes if the person looks away. */
  tick(now) {
    if (now - this.lastSampleAt >= this.o.lostMs) {
      this.happy *= 0.5;
      this.surprise *= 0.5;
    }
    return this.settle(now);
  }

  settle(now) {
    const o = this.o;
    const events = [];
    const t = this.target(now);
    if (t !== this.want) { this.want = t; this.wantSince = now; }
    const held = now - this.wantSince;
    // Going calmer (soft or flat) needs no extra hold: the hysteresis gap already did that work.
    const ready = t === 'soft' || t === 'flat' || t === 'extra' ? true : held >= o.enterMs;
    let changed = false;
    if (t !== this.face && ready && now - this.shownAt >= o.minShowMs) {
      const was = this.face;
      if ((was === 'grin' || was === 'extra') && t === 'flat') {
        // ease out through a soft smile rather than dropping straight to neutral
        this.softUntil = now + o.softMs;
        this.face = 'soft';
      } else {
        this.face = t;
      }
      this.shownAt = now;
      changed = true;
      if (this.face === 'wow' && now - this.lastJumpAt >= o.jumpCooldownMs) { this.lastJumpAt = now; events.push('jump'); }
      if (this.face === 'extra') events.push('extra');
    }
    return { face: this.face, changed, events };
  }

  /** A real blink arrived. Returns 'wink' every few blinks, otherwise 'blink'. */
  blink() {
    this.blinks += 1;
    return this.blinks % this.o.winkEvery === 0 ? 'wink' : 'blink';
  }
}
