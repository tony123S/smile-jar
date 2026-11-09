// monster-voice.js: what the monster says, and when. Pure logic so it can be unit tested.
//
// MonsterVoice turns game events (and the live expression) into short speech-bubble lines.
// Reactions to counted smiles always speak; ambient lines (surprise, nudges when it's quiet)
// are rate-limited so the monster isn't annoying.

const LINES = {
  start: ['Smile at the jokes to help me grow!', 'Make me smile and I\u2019ll grow!', 'Smile at the card, I\u2019ll get stronger!'],
  smile: ['Sparkle!', 'I feel warmer!', 'Ooh, that one counts!', 'More please!', 'The flowers felt that!'],
  combo: ['Combo! Keep going!', 'You’re on a roll!', 'Unstoppable!'],
  golden: ['GOLDEN GRIN!', 'Now THAT is a smile.', 'Shiny!'],
  wow: ['Whoa!', 'Didn’t see that coming, huh?'],
  nudge: ['Psst. Read the card.', 'The world feels a bit grey...', 'Is that a smile I almost see?'],
  learned: ['I think I know what you like.', 'I know what makes you smile!'],
  evolve: ['I\u2019M GROWING!', 'Something is happening to me!', 'Look at me now!', 'The world is waking up!'],
  snack: ['A snack from a sponsor!', 'Ooh, this one\u2019s from a friend.'],
  talking: ['Shh, I\u2019m listening...', 'Are you talking to me?'],
};

export class MonsterVoice {
  constructor({ rand = Math.random, ambientGapMs = 4000, nudgeAfterMs = 20000 } = {}) {
    this.rand = rand;
    this.ambientGapMs = ambientGapMs;
    this.nudgeAfterMs = nudgeAfterMs;
    this.lastSpokeAt = -Infinity;
    this.lastLines = {};
    this.lastEventAt = 0;
  }

  pick(pool) {
    const lines = LINES[pool];
    let line = lines[Math.floor(this.rand() * lines.length)];
    if (lines.length > 1 && line === this.lastLines[pool]) line = lines[(lines.indexOf(line) + 1) % lines.length];
    this.lastLines[pool] = line;
    return line;
  }

  say(pool, now) {
    this.lastSpokeAt = now;
    return { pool, text: this.pick(pool) };
  }

  start(now) { this.lastEventAt = now; return this.say('start', now); }

  /** A counted smile. Always speaks. */
  onSmile({ golden, combo }, now) {
    this.lastEventAt = now;
    if (golden) return this.say('golden', now);
    if (combo > 1) return this.say('combo', now);
    return this.say('smile', now);
  }

  /** Called on every metrics update. May return a line, or null to stay quiet. */
  onTick({ face }, now) {
    if (now - this.lastSpokeAt < this.ambientGapMs) return null;
    if (face === 'wow') return this.say('wow', now);
    if (now - this.lastEventAt >= this.nudgeAfterMs) { this.lastEventAt = now; return this.say('nudge', now); }
    return null;
  }

  onEvolve(now) { this.lastEventAt = now; return this.say('evolve', now); }

  onSnack(now) {
    if (now - this.lastSpokeAt < this.ambientGapMs) return null;
    return this.say('snack', now);
  }

  onTalking(now) {
    if (now - this.lastSpokeAt < this.ambientGapMs * 2) return null;
    return this.say('talking', now);
  }

  onLearned(now) {
    if (now - this.lastSpokeAt < this.ambientGapMs) return null;
    return this.say('learned', now);
  }
}
