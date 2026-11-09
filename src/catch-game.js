// catch-game.js: "Catch the Joy", the part of a game where your face is the controller.
//
// Things drift down from the sky towards the monster:
//   joy orbs     smile while one reaches the monster and it jumps up and catches it
//   golden orbs  rarer, worth more, and need a big smile
//   wow stars    look surprised as it arrives for a super jump
//   gloom clouds keep a straight face, or the monster swallows the gloom and loses its combo
// So it isn't enough to grin the whole time: you smile for the orbs and relax for the clouds.
//
// This is only the score layer on top of the game. Counting smiles for XP and pledges is still
// done by SmileDetector, so this can't change anything about the charity. Pure logic with an
// injectable random source, so it can be unit tested; the renderer draws `items`.

export const CATCH = Object.freeze({
  fallMs: 4200,        // how long something takes to fall from the top to the monster
  zoneFrom: 0.72,      // the catch zone is the bottom part of the fall (0 = top, 1 = monster)
  spawnEveryMs: 2100,  // average gap between new things
  firstAtMs: 2500,     // a moment to get ready before the first one
  points: { joy: 100, gold: 300, wow: 200, gloom: 50 },
  mix: { joy: 0.55, gold: 0.12, wow: 0.13, gloom: 0.2 },
  stars: [0.4, 0.65, 0.85], // share of the best possible score for 1, 2 and 3 stars
});

const SMILING = new Set(['grin', 'extra']);

export class CatchGame {
  constructor({ rand = Math.random, now = 0, ...opts } = {}) {
    this.o = { ...CATCH, ...opts, points: { ...CATCH.points, ...(opts.points || {}) }, mix: { ...CATCH.mix, ...(opts.mix || {}) } };
    this.rand = rand;
    this.items = [];
    this.nextId = 1;
    this.nextSpawnAt = now + this.o.firstAtMs;
    this.score = 0;
    this.best = 0; // the most this round could have scored, for the stars
    this.combo = 0;
    this.bestCombo = 0;
    this.caught = 0;
    this.missed = 0;
    this.dodged = 0;
    this.gloomed = 0;
  }

  pickKind() {
    let r = this.rand();
    for (const [kind, p] of Object.entries(this.o.mix)) { if ((r -= p) < 0) return kind; }
    return 'joy';
  }

  spawn(now) {
    const kind = this.pickKind();
    // x: where it falls, -1 (left) .. 1 (right); the renderer leans the monster towards it
    this.items.push({ id: this.nextId++, kind, x: Math.round((this.rand() * 1.6 - 0.8) * 100) / 100, born: now, y: 0, done: null });
    this.best += kind === 'gloom' ? this.o.points.gloom : this.o.points[kind] * 2; // a combo roughly doubles
  }

  /**
   * Advance to `now` with the monster's current mirrored face ('grin', 'extra', 'wow', ...)
   * and whether this is a big smile (for golden orbs). Returns the events that happened.
   */
  tick(now, { face = 'flat', bigSmile = false } = {}) {
    const events = [];
    while (now >= this.nextSpawnAt) {
      this.spawn(this.nextSpawnAt);
      this.nextSpawnAt += this.o.spawnEveryMs * (0.7 + this.rand() * 0.6);
    }
    for (const it of this.items) {
      if (it.done) continue;
      it.y = Math.min(1, (now - it.born) / this.o.fallMs);
      const inZone = it.y >= this.o.zoneFrom;
      const landed = it.y >= 1;
      if (it.kind === 'gloom') {
        if (inZone && SMILING.has(face)) { it.done = 'gloom'; this.combo = 0; this.gloomed += 1; events.push({ type: 'gloom', item: it }); }
        else if (landed) { it.done = 'dodged'; this.dodged += 1; this.addPoints(this.o.points.gloom); events.push({ type: 'dodge', item: it }); }
        continue;
      }
      const catches = it.kind === 'wow' ? face === 'wow'
        : it.kind === 'gold' ? SMILING.has(face) && (bigSmile || face === 'extra')
        : SMILING.has(face);
      if (inZone && catches) {
        it.done = 'caught';
        this.caught += 1;
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const pts = this.addPoints(this.o.points[it.kind]);
        events.push({ type: 'catch', item: it, points: pts, combo: this.combo });
      } else if (landed) {
        it.done = 'missed';
        this.missed += 1;
        this.combo = 0;
        events.push({ type: 'miss', item: it });
      }
    }
    // keep finished items around briefly so the renderer can animate them away
    this.items = this.items.filter((it) => !it.done || now - it.born < this.o.fallMs + 900);
    return events;
  }

  addPoints(base) {
    const mult = 1 + Math.min(4, Math.floor(this.combo / 3)) * 0.25; // x1.25 every 3 in a row, up to x2
    const pts = Math.round(base * mult);
    this.score += pts;
    return pts;
  }

  /** 0 to 3 stars for this round. */
  stars() {
    if (this.best <= 0) return 0;
    const share = this.score / this.best;
    return this.o.stars.filter((t) => share >= t).length;
  }

  summary() {
    return { score: this.score, stars: this.stars(), caught: this.caught, missed: this.missed, dodged: this.dodged, gloomed: this.gloomed, bestCombo: this.bestCombo };
  }
}
