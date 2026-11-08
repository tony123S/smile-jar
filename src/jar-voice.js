// jar-voice.js: what the jar says, and when. Pure logic so it can be unit tested.
//
// JarVoice turns session events (and the live HAPPY level) into short speech-bubble lines.
// Reactions to counted smiles always speak; ambient lines (teasing as the meter rises,
// streak milestones, nudges when it's quiet) are rate-limited so the jar isn't annoying.

const LINES = {
  start: ['Feed me smiles!', 'Ready when you are.', 'I\u2019m sooo hungry...'],
  pokerStart: ['Straight face. Go.', 'Let’s see how tough you are.', 'Don’t. You. Dare.'],
  smile: ['Clink!', 'Delicious.', 'Ooh, that one counts!', 'More please!', 'That’s the stuff.'],
  combo: ['Combo! Keep going!', 'You’re on a roll!', 'Unstoppable!'],
  golden: ['GOLDEN GRIN!', 'Now THAT is a smile.', 'Shiny!'],
  wow: ['Whoa!', 'Didn’t see that coming, huh?'],
  nudge: ['Psst. Read the card.', 'I’m getting hungry...', 'Is that a smile I almost see?'],
  pokerNear: ['I see that lip twitching...', 'Don’t you dare...', 'Careful...', 'Almost got you...'],
  pokerCrack: ['GOTCHA!', 'Cracked! Pay up, sponsors.', 'Ha! I knew it.', 'Weak. Lovely, but weak.'],
  pokerMilestone: ['Impressive. Suspiciously impressive.', 'Are you even human?', 'Okay, stone face.'],
  learned: ['I think I know what you like.', 'Found your weak spot.'],
  evolve: ['I\u2019M EVOLVING!', 'Something is happening to me!', 'Look at me now!'],
  snack: ['A snack from a sponsor!', 'Ooh, this one\u2019s from a friend.'],
  talking: ['Shh, I\u2019m listening...', 'Are you talking to me?'],
};

export class JarVoice {
  constructor({ rand = Math.random, ambientGapMs = 4000, nudgeAfterMs = 20000, nearAt = 40 } = {}) {
    this.rand = rand;
    this.ambientGapMs = ambientGapMs;
    this.nudgeAfterMs = nudgeAfterMs;
    this.nearAt = nearAt;
    this.lastSpokeAt = -Infinity;
    this.lastLines = {};
    this.lastEventAt = 0;
    this.milestonesHit = new Set();
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

  start(mode, now) { this.lastEventAt = now; return this.say(mode === 'poker' ? 'pokerStart' : 'start', now); }

  /** A counted smile. Always speaks. */
  onSmile({ mode, golden, combo }, now) {
    this.lastEventAt = now;
    if (mode === 'poker') return this.say('pokerCrack', now);
    if (golden) return this.say('golden', now);
    if (combo > 1) return this.say('combo', now);
    return this.say('smile', now);
  }

  /** Called on every metrics update. May return a line, or null to stay quiet. */
  onTick({ mode, happy, face, streakMs = 0 }, now) {
    if (now - this.lastSpokeAt < this.ambientGapMs) return null;
    if (mode === 'poker') {
      if (happy >= this.nearAt) return this.say('pokerNear', now);
      for (const m of [30000, 60000, 90000]) {
        if (streakMs >= m && !this.milestonesHit.has(m)) { this.milestonesHit.add(m); return this.say('pokerMilestone', now); }
      }
      return null;
    }
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

  resetStreak() { this.milestonesHit.clear(); }
}
