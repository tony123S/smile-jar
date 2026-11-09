// controls.js: your face is the controller. Turns the real SmartSpectra signals into four actions.
//
//   HAPPY score     -> 'jump'   (fires once as a smile starts, not again until you relax)
//   SURPRISE score  -> 'magic'  (same idea, with its own thresholds)
//   blink flag      -> 'dodge'  (a rising edge of face.blinking[].detected)
//   NEUTRAL score   -> sneaking (a calm, straight face held for a moment)
//
// Only signals the SDK really sends are used: Expression samples
// { stable, timestamp (µs), scores: [{ type, confidence 0-100 }] } and blink statuses
// { detected, stable, timestamp }. There is no "big smile" signal, so nothing here invents one.
//
// Every action fires on an edge, then has to re-arm (the score must drop back for a moment)
// and wait out a cooldown, so holding one expression can never repeat it.
// This only drives the game. Qualifying smiles for XP and charity are counted separately by
// SmileDetector, so nothing here can change a pledge.

import { scoreOf, ExpressionType, tsToMs } from '../smile-detector.js';

export const CONTROLS = Object.freeze({
  smoothMs: 120,        // time constant of the running average
  happyOn: 55,          // smoothed HAPPY needed to jump ...
  happyOff: 35,         // ... and it must fall below this to re-arm
  surpriseOn: 50,
  surpriseOff: 25,
  rearmMs: 300,         // relaxed this long before the same action can fire again
  jumpCooldownMs: 600,
  magicCooldownMs: 1000,
  dodgeCooldownMs: 500,
  neutralOn: 60,        // NEUTRAL score that counts as a straight face ...
  calmBelow: 25,        // ... or HAPPY and SURPRISE both below this
  sneakHoldMs: 900,     // a straight face held this long means you're sneaking (never asks for more)
  lostMs: 1500,         // no samples this long (face out of view): everything relaxes
});

class EdgeTrigger {
  constructor(on, off, rearmMs, cooldownMs) {
    Object.assign(this, { on, off, rearmMs, cooldownMs });
    this.armed = true;
    this.lowSince = null;
    this.lastFired = -Infinity;
  }

  /** Feed a smoothed value at time t. Returns true on the one sample where it fires. */
  push(v, t) {
    if (!this.armed) {
      if (v < this.off) {
        if (this.lowSince == null) this.lowSince = t;
        if (t - this.lowSince >= this.rearmMs) { this.armed = true; this.lowSince = null; }
      } else this.lowSince = null;
      return false;
    }
    if (v >= this.on && t - this.lastFired >= this.cooldownMs) {
      this.armed = false;
      this.lowSince = null;
      this.lastFired = t;
      return true;
    }
    return false;
  }

  reset() { this.armed = true; this.lowSince = null; }
}

export class ExpressionControls {
  constructor(opts = {}) {
    this.o = { ...CONTROLS, ...opts };
    const o = this.o;
    this.jump = new EdgeTrigger(o.happyOn, o.happyOff, o.rearmMs, o.jumpCooldownMs);
    this.magic = new EdgeTrigger(o.surpriseOn, o.surpriseOff, o.rearmMs, o.magicCooldownMs);
    this.happy = 0;
    this.surprise = 0;
    this.neutral = 0;
    this.calmSince = null;
    this.lastT = null;
    this.lastSampleAt = -Infinity;
    this.blinkPrev = false;
    this.blinkT = -Infinity;
    this.lastDodge = -Infinity;
  }

  /**
   * Feed one Expression sample. `now` is the app clock (ms); the SDK timestamp is used for
   * smoothing when present. Returns the actions it fired: [] or ['jump'] or ['magic'] or both.
   */
  push(expression, now) {
    const sdkT = Number(expression?.timestamp) > 0 ? tsToMs(expression.timestamp) : null;
    const t = sdkT ?? now;
    const dt = this.lastT == null ? 1e9 : Math.max(0, t - this.lastT);
    this.lastT = t;
    this.lastSampleAt = now;
    const a = 1 - Math.exp(-dt / this.o.smoothMs);
    this.happy += (scoreOf(expression, ExpressionType.HAPPY) - this.happy) * a;
    this.surprise += (scoreOf(expression, ExpressionType.SURPRISE) - this.surprise) * a;
    this.neutral += (scoreOf(expression, ExpressionType.NEUTRAL) - this.neutral) * a;

    const calm = this.neutral >= this.o.neutralOn || (this.happy < this.o.calmBelow && this.surprise < this.o.calmBelow);
    if (calm) { if (this.calmSince == null) this.calmSince = now; } else this.calmSince = null;

    const out = [];
    if (this.jump.push(this.happy, now)) out.push('jump');
    if (this.magic.push(this.surprise, now)) out.push('magic');
    return out;
  }

  /** Feed the SDK's blink statuses. Returns ['dodge'] when a new blink starts (with a cooldown). */
  pushBlinks(statuses, now) {
    const out = [];
    for (const s of statuses || []) {
      const t = tsToMs(s.timestamp);
      if (t && t < this.blinkT) continue;
      if (t) this.blinkT = t;
      const d = !!s.detected;
      if (d && !this.blinkPrev && now - this.lastDodge >= this.o.dodgeCooldownMs) {
        this.lastDodge = now;
        out.push('dodge');
      }
      this.blinkPrev = d;
    }
    return out;
  }

  /** Call regularly. If the face has gone (no samples), relax everything so nothing fires by itself. */
  tick(now) {
    if (now - this.lastSampleAt > this.o.lostMs) {
      this.happy = 0;
      this.surprise = 0;
      this.neutral = 0;
      this.calmSince = null;
      this.jump.reset();
      this.magic.reset();
    }
  }

  /** True while a straight face has been held long enough to sneak. */
  sneaking(now) {
    return this.calmSince != null && now - this.calmSince >= this.o.sneakHoldMs && now - this.lastSampleAt <= this.o.lostMs;
  }

  /** 0..1, how close the straight face is to counting (for a little meter). */
  sneakProgress(now) {
    if (this.calmSince == null) return 0;
    return Math.min(1, (now - this.calmSince) / this.o.sneakHoldMs);
  }
}

/**
 * Which face does each action need right now? If the blink signal isn't arriving (some cameras,
 * glasses, bad light), dodging switches to a surprised face so the game can still be played.
 */
export function controlScheme({ blinkLive = true } = {}) {
  return {
    jump: 'jump',
    magic: 'magic',
    dodge: blinkLive ? 'dodge' : 'magic',
    sneak: 'sneak',
  };
}

export const HOW_TO = Object.freeze({
  jump: 'Smile',
  magic: 'Look surprised',
  dodge: 'Blink',
  dodgeBackup: 'Look surprised',
  sneak: 'Keep a straight face',
});
