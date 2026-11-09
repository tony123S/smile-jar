// engine.js: plays one level of the adventure. Pure logic, no drawing, so it can be tested.
//
// The loop for every level:
//   intro (Momo explains the mission) -> for each step: run, then a challenge window where you
//   make the face -> success (points) or a funny oops and a retry -> the boss -> outro -> complete.
// There is no game over. Missing a window just means Momo tumbles, says something silly and you
// try again with a longer window, so it stays forgiving.
//
// tick(now, input) takes the actions fired by ExpressionControls ('jump', 'magic', 'dodge'),
// whether you are sneaking, and the control scheme (so dodge can fall back to a surprised face
// when the blink signal isn't arriving). It returns what happened, for the renderer to show.

import { LINES, pick } from './lines.js';
import { promptFor } from './levels.js';
import { controlScheme } from './controls.js';

export const ENGINE = Object.freeze({
  introLineMs: 3400,   // each intro line stays up this long
  runMs: 1500,         // Momo runs this long between challenges
  windowMs: 3000,      // time to make the face once a challenge appears
  sneakWindowMs: 4500, // sneaking needs a held straight face, so it gets longer
  retryGrow: 1.35,     // each retry of the same step gives more time ...
  maxWindowMs: 7000,   // ... up to this
  successMs: 1100,     // the jump / zap / dodge animation
  oopsMs: 1600,        // the tumble and getting back up
  bossIntroMs: 3600,
  outroMs: 4200,
  earlyMs: 500,        // a face made just before the window opens still counts
  sneakHoldMs: 900,    // the straight face has to be held this long inside the window
  points: { step: 100, firstTry: 50, boss: 200 },
});

export class AdventureLevel {
  constructor(level, { now = 0, rand = Math.random, ...opts } = {}) {
    this.o = { ...ENGINE, ...opts, points: { ...ENGINE.points, ...(opts.points || {}) } };
    this.level = level;
    this.rand = rand;
    const boss = level.boss || {};
    this.steps = [
      ...(level.steps || []).map((s) => ({ ...s, boss: false })),
      ...(boss.steps || []).map((s) => ({ ...s, boss: true, thing: s.thing || boss.thing })),
    ];
    this.introLines = level.intro?.length ? level.intro : [level.mission];
    this.i = 0;          // current step
    this.tries = 0;      // misses on the current step
    this.score = 0;
    this.misses = 0;
    this.cleared = 0;
    this.lastLine = null;
    this.phase = null;
    this.phaseAt = now;
    this.phaseEnds = now;
    this.introIdx = 0;
    this.lastResult = null;
    this.events = [];
    this.recent = {};    // when each action last fired, for the early-face grace
    this.pausedAt = null; // set while the game is on hold (face out of view, window hidden)
    this.enter('intro', now, this.o.introLineMs);
    this.say(this.introLines[0]);
  }

  get step() { return this.steps[this.i] || null; }
  get done() { return this.phase === 'complete'; }
  get paused() { return this.pausedAt != null; }

  /**
   * Put the game on hold, or carry on. While on hold the clock stands still, so stepping away
   * from the camera (or hiding the window) never runs a challenge out and costs a star.
   */
  setPaused(paused, now) {
    if (paused && this.pausedAt == null) {
      this.pausedAt = now;
      this.events.push({ type: 'pause', paused: true });
    } else if (!paused && this.pausedAt != null) {
      const d = Math.max(0, now - this.pausedAt);
      this.phaseAt += d;
      if (this.phaseEnds !== Infinity) this.phaseEnds += d;
      this.pausedAt = null;
      this.recent = {}; // faces from before the break don't count
      this.events.push({ type: 'pause', paused: false });
    }
  }

  say(text) { if (text) { this.lastLine = text; this.events.push({ type: 'say', text }); } }

  enter(phase, now, ms) {
    this.phase = phase;
    this.phaseAt = now;
    this.phaseEnds = ms == null ? Infinity : now + ms;
    this.events.push({ type: 'phase', phase });
  }

  windowFor(step) {
    const base = step.need === 'sneak' ? this.o.sneakWindowMs : this.o.windowMs;
    return Math.min(this.o.maxWindowMs, Math.round(base * this.o.retryGrow ** this.tries));
  }

  openChallenge(now, scheme) {
    const step = this.step;
    this.enter('challenge', now, this.windowFor(step));
    this.events.push({ type: 'challenge', step, prompt: promptFor(step.need, { blinkLive: scheme.dodge === 'dodge' }), retry: this.tries > 0 });
    if (this.tries === 0) this.say(pick(LINES.ready[step.need], this.rand, this.lastLine));
    else if (this.tries >= 3) this.say(LINES.help);
  }

  /** The step after a success: the next run, the boss intro, or the outro. */
  advance(now) {
    this.i += 1;
    this.tries = 0;
    if (this.i >= this.steps.length) {
      this.enter('outro', now, this.o.outroMs);
      this.say(this.level.boss?.outro || pick(LINES.complete, this.rand));
      return;
    }
    if (this.step.boss && !this.steps[this.i - 1].boss) {
      this.enter('bossIntro', now, this.o.bossIntroMs);
      this.events.push({ type: 'boss', name: this.level.boss?.name });
      this.say(this.level.boss?.intro);
      return;
    }
    this.enter('run', now, this.o.runMs);
  }

  /** Did the input do what this step needs? */
  satisfied(step, { actions = [], calmMs = 0 }, scheme) {
    // Sneaking counts only once the straight face has been held inside this window, so a face
    // that was already calm when the guard appeared still has to hold it for a moment.
    if (step.need === 'sneak') return this.sneakProgress(this.lastNow, calmMs) >= 1;
    const want = scheme[step.need];
    if (actions.includes(want)) return true;
    const early = this.recent[want];
    if (early != null && early >= this.phaseAt - this.o.earlyMs) { delete this.recent[want]; return true; }
    return false;
  }

  tick(now, input = {}) {
    const scheme = input.scheme || controlScheme();
    if (this.paused) { const out = this.events; this.events = []; return out; }
    this.lastNow = now;
    for (const a of input.actions || []) this.recent[a] = now;
    // A challenge can be won on this very tick, before any timeout is looked at.
    this.trySucceed(now, input, scheme);
    // Move through any phases whose time is up (a big gap between ticks can cover several).
    let guard = 0;
    while (now >= this.phaseEnds && guard++ < 50) {
      const at = this.phaseEnds;
      switch (this.phase) {
        case 'intro':
          this.introIdx += 1;
          if (this.introIdx < this.introLines.length) { this.enter('intro', at, this.o.introLineMs); this.say(this.introLines[this.introIdx]); }
          else this.enter('run', at, this.o.runMs);
          break;
        case 'run':
        case 'bossIntro':
          this.openChallenge(at, scheme);
          break;
        case 'challenge': {
          const step = this.step;
          this.tries += 1;
          this.misses += 1;
          this.lastResult = 'oops';
          this.enter('oops', at, this.o.oopsMs);
          this.events.push({ type: 'oops', step, tries: this.tries });
          this.say(pick(LINES.oops[step.need], this.rand, this.lastLine));
          break;
        }
        case 'oops':
          this.openChallenge(at, scheme); // same step again, with a little more time
          break;
        case 'success':
          this.advance(at);
          break;
        case 'outro':
          this.enter('complete', at, null);
          this.events.push({ type: 'complete', summary: this.summary() });
          break;
        default:
          this.phaseEnds = Infinity;
      }
    }
    // A window that just opened can be won straight away by a face made a moment earlier.
    this.trySucceed(now, {}, scheme);
    const out = this.events;
    this.events = [];
    return out;
  }

  trySucceed(now, input, scheme) {
    if (this.phase !== 'challenge' || !this.satisfied(this.step, input, scheme)) return false;
    const step = this.step;
    const firstTry = this.tries === 0;
    const pts = (step.boss ? this.o.points.boss : this.o.points.step) + (firstTry ? this.o.points.firstTry : 0);
    this.score += pts;
    this.cleared += 1;
    this.lastResult = 'success';
    this.enter('success', now, this.o.successMs);
    this.events.push({ type: 'success', step, points: pts, firstTry });
    this.say(step.win);
    this.recent = {};
    return true;
  }

  /** 0..1 of the straight face needed for a sneak step, counted from when its window opened. */
  sneakProgress(now, calmMs = 0) {
    if (this.phase !== 'challenge') return 0;
    return Math.min(1, Math.min(calmMs, now - this.phaseAt) / this.o.sneakHoldMs);
  }

  /** 3 stars for no misses, 2 for a few, and always at least 1 for finishing. */
  stars() {
    if (!this.done && this.phase !== 'outro') return 0;
    return this.misses === 0 ? 3 : this.misses <= 3 ? 2 : 1;
  }

  /** What the renderer needs to draw this moment. */
  view(now) {
    const step = this.step;
    const span = this.phaseEnds === Infinity ? 1 : Math.max(1, this.phaseEnds - this.phaseAt);
    const t = Math.max(0, Math.min(1, ((this.pausedAt ?? now) - this.phaseAt) / span));
    const pose = {
      intro: 'idle', run: 'run', bossIntro: 'idle', outro: 'dance', complete: 'dance', oops: 'oops',
      challenge: step?.need === 'sneak' ? 'sneak' : 'ready',
      success: { jump: 'jump', magic: 'magic', dodge: 'dodge', sneak: 'sneak' }[step?.need] || 'jump',
    }[this.phase] || 'idle';
    return {
      phase: this.phase,
      paused: this.paused,
      t,
      pose,
      step,
      stepIndex: this.i,
      total: this.steps.length,
      boss: !!step?.boss,
      progress: this.cleared / this.steps.length, // how much laughter is back in the level
      score: this.score,
      misses: this.misses,
      line: this.lastLine,
    };
  }

  summary() {
    return { level: this.level.id, score: this.score, stars: this.stars(), misses: this.misses, cleared: this.cleared };
  }
}
