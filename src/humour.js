// humour.js: learns, within one session, which kind of card makes you smile, and serves more of it.
//
// Every counted smile is credited to the card that was on screen when the smile *started*.
// A smile is only counted after it has been held for a moment, so we look back LEAD_MS. The next card's kind is chosen by
// Thompson-style sampling over (smiles + 1) / (shown + 2), so it explores early and exploits once
// it has evidence.
// Nothing here is saved: the model lives in memory and is discarded when the session ends.

import { shuffled } from './joy-reel.js';

export const LEAD_MS = 800; // detector hold time (500 ms) plus a little SDK latency

export class HumourModel {
  constructor(cards, { rand = Math.random, explore = 0.2 } = {}) {
    this.rand = rand;
    this.explore = explore;
    this.queues = {};
    this.stats = {};
    this.kinds = [...new Set(cards.map((c) => c.kind))];
    for (const k of this.kinds) {
      this.queues[k] = shuffled(cards.filter((c) => c.kind === k), rand);
      this.stats[k] = { shown: 0, smiles: 0 };
    }
    this.current = null;
    this.previous = null;
    this.shownAt = 0;
    this.lastPickWasLearned = false;
  }

  rate(kind) {
    const s = this.stats[kind];
    return (s.smiles + 1) / (s.shown + 2);
  }

  /** The kind with the best smile rate so far, or null before any smile. */
  favourite() {
    let best = null;
    for (const k of this.kinds) {
      if (this.stats[k].smiles === 0) continue;
      if (!best || this.rate(k) > this.rate(best)) best = k;
    }
    return best;
  }

  pickKind() {
    const kinds = this.kinds.filter((k) => this.queues[k].length > 0 || this.stats[k].shown > 0);
    const anyEvidence = kinds.some((k) => this.stats[k].smiles > 0);
    if (!anyEvidence || this.rand() < this.explore) {
      this.lastPickWasLearned = false;
      // explore: least-shown kind first, ties broken randomly
      const min = Math.min(...kinds.map((k) => this.stats[k].shown));
      const pool = kinds.filter((k) => this.stats[k].shown === min);
      return pool[Math.floor(this.rand() * pool.length)];
    }
    // exploit with a little noise so a lucky first smile doesn't lock the reel forever
    let best = null, bestScore = -1;
    for (const k of kinds) {
      const score = this.rate(k) * (0.75 + this.rand() * 0.5);
      if (score > bestScore) { best = k; bestScore = score; }
    }
    this.lastPickWasLearned = true;
    return best;
  }

  /** Returns the next card to show. Reshuffles a kind once all its cards were used. */
  next(now = Date.now()) {
    const kind = this.pickKind();
    if (this.queues[kind].length === 0) return this.next(now); // unreachable in practice
    const card = this.queues[kind].shift();
    this.queues[kind].push(card); // cycle, so long sessions never run dry
    this.previous = this.current;
    this.current = card;
    this.shownAt = now;
    this.stats[kind].shown += 1;
    return card;
  }

  /** Credit a counted smile to whichever card caused it. Returns the credited card. */
  creditSmile(now = Date.now(), leadMs = LEAD_MS) {
    let card = this.current;
    if (this.previous && now - leadMs < this.shownAt) card = this.previous;
    if (!card) return null;
    this.stats[card.kind].smiles += 1;
    return card;
  }

  /** e.g. [{ kind: 'Pun', smiles: 3, shown: 4 }, ...] sorted by smiles. */
  summary() {
    return this.kinds.map((k) => ({ kind: k, ...this.stats[k] }))
      .filter((r) => r.shown > 0)
      .sort((a, b) => b.smiles - a.smiles || a.shown - b.shown);
  }
}

const PERSONAS = {
  'Pun': 'a pun person',
  'Animal fact': 'an animal lover',
  'Memory': 'a nostalgic soul',
  'Picture this': 'a daydreamer',
  'Sponsor snack': 'a sucker for your sponsors\u2019 jokes',
};

export function personaFor(kind) {
  return PERSONAS[kind] || 'full of surprises';
}
