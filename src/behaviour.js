// behaviour.js: what the monster does on its own, so it feels alive.
//
// Left alone, it idles, wanders across its world, stops to sniff the flowers (once there are
// flowers), and falls asleep if nothing happens for a while. Your face always comes first:
// when you smile or look surprised it stops, turns to look at you and reacts. It celebrates
// when it grows. The egg can't walk yet, so before hatching it only rocks in place.
//
// Pure logic with an injectable random source, so it can be unit tested. Positions are
// normalised: x runs from -1 (far left) to 1 (far right), and the renderer turns that into pixels.

export const WALK = Object.freeze({
  speed: 0.32,          // normalised units per second
  idleMinMs: 1500,
  idleMaxMs: 4000,
  sniffMs: 1600,
  sleepAfterMs: 20000,  // no smiles or expressions for this long: it dozes off
  celebrateMs: 1800,
  minStep: 0.35,        // each walk goes at least this far, so it reads as a walk
});

// Faces that mean "you're doing something": the monster stops and looks at you.
const ATTENTION = new Set(['grin', 'extra', 'wow', 'soft']);

export class Wanderer {
  constructor({ rand = Math.random, canWalk = true, flowers = false, now = 0, ...opts } = {}) {
    this.o = { ...WALK, ...opts };
    this.rand = rand;
    this.canWalk = canWalk;
    this.flowers = flowers;
    this.x = 0;
    this.dir = 1;
    this.mode = 'idle';
    this.until = now + this.o.idleMinMs;
    this.target = 0;
    this.sniffAtEnd = false;
    this.lastActive = now;
    this.celebrateFrom = -Infinity;
    this.celebrateUntil = -Infinity;
    this.lastT = now;
  }

  /** The stage or world changed (hatched, flowers came back). */
  setWorld({ canWalk, flowers }) {
    if (canWalk != null) this.canWalk = canWalk;
    if (flowers != null) this.flowers = flowers;
    if (!this.canWalk) { this.x = 0; this.mode = 'idle'; }
  }

  /** Something happened (a smile, talking, a click): wake up and pay attention. */
  poke(now) { this.lastActive = now; }

  /** Celebrate (growing up), optionally after a delay such as the egg's hatching shake. */
  celebrate(now, delayMs = 0) {
    this.lastActive = now + delayMs;
    this.celebrateFrom = now + delayMs;
    this.celebrateUntil = now + delayMs + this.o.celebrateMs;
  }

  pickIdle(now) {
    this.mode = 'idle';
    this.until = now + this.o.idleMinMs + this.rand() * (this.o.idleMaxMs - this.o.idleMinMs);
  }

  pickWalk(now) {
    let t = this.rand() * 2 - 1;
    if (Math.abs(t - this.x) < this.o.minStep) t = this.x > 0 ? this.x - this.o.minStep - 0.2 : this.x + this.o.minStep + 0.2;
    this.target = Math.max(-1, Math.min(1, t));
    this.dir = this.target >= this.x ? 1 : -1;
    this.sniffAtEnd = this.flowers && this.rand() < 0.5;
    this.mode = 'walk';
    this.until = Infinity;
  }

  /**
   * Advance to `now`. `face` is the mirrored face from MoodMirror ('flat' when you're calm).
   * Returns { x, look, action } where action is idle | walk | sniff | look | sleep | celebrate,
   * and look is where its eyes point (-1 left, 0 at you, 1 right).
   */
  tick(now, { face = 'flat' } = {}) {
    const dt = Math.min(200, Math.max(0, now - this.lastT));
    this.lastT = now;
    if (ATTENTION.has(face)) this.lastActive = now;

    // Priority: celebrating, then your face, then sleep, then its own wandering.
    if (now >= this.celebrateFrom && now < this.celebrateUntil) return this.out('celebrate', 0);
    if (ATTENTION.has(face)) {
      if (this.mode !== 'idle') this.pickIdle(now); // it stops walking to look at you
      this.until = Math.max(this.until, now + 800);
      return this.out('look', 0);
    }
    if (now - this.lastActive >= this.o.sleepAfterMs) return this.out('sleep', 0);

    if (this.mode === 'walk') {
      const step = (this.o.speed * dt) / 1000;
      const left = this.target - this.x;
      if (Math.abs(left) <= step) {
        this.x = this.target;
        if (this.sniffAtEnd) { this.mode = 'sniff'; this.until = now + this.o.sniffMs; } else this.pickIdle(now);
      } else {
        this.x += Math.sign(left) * step;
      }
      if (this.mode === 'walk') return this.out('walk', this.dir);
    }
    if (this.mode === 'sniff') {
      if (now < this.until) return this.out('sniff', this.dir * 0.5);
      this.pickIdle(now);
    }
    if (now >= this.until) {
      if (this.canWalk) this.pickWalk(now); else this.pickIdle(now);
      if (this.mode === 'walk') return this.out('walk', this.dir);
    }
    return this.out('idle', 0);
  }

  out(action, look) {
    return { x: this.x, look, action };
  }
}
