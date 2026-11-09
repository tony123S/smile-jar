import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionControls, CONTROLS, controlScheme } from '../src/adventure/controls.js';
import { AdventureLevel, ENGINE } from '../src/adventure/engine.js';
import { LEVELS, isPlayable, promptFor, recordLevel, normalizeProgress, emptyProgress } from '../src/adventure/levels.js';
import { ExpressionType } from '../src/smile-detector.js';

// One SDK Expression sample, shaped exactly like the SDK's: timestamp in microseconds, scores 0-100.
const sample = (t, { happy = 0, surprise = 0, neutral = 0 } = {}) => ({
  stable: true,
  timestamp: t * 1000,
  scores: [
    { type: ExpressionType.HAPPY, confidence: happy },
    { type: ExpressionType.SURPRISE, confidence: surprise },
    { type: ExpressionType.NEUTRAL, confidence: neutral },
  ],
});

// Feed a face for a stretch of time at ~30 fps and collect the actions it fires.
function feed(c, from, to, face, step = 33) {
  const out = [];
  for (let t = from; t < to; t += step) out.push(...c.push(sample(t, face), t).map((a) => ({ a, t })));
  return out;
}

test('a smile fires one jump, and holding it never jumps again', () => {
  const c = new ExpressionControls();
  const fired = feed(c, 0, 5000, { happy: 90 });
  assert.equal(fired.filter((x) => x.a === 'jump').length, 1);
  assert.ok(fired[0].t < 300, 'it reacts quickly');
});

test('relaxing re-arms the jump, so a second smile jumps again', () => {
  const c = new ExpressionControls();
  let n = feed(c, 0, 800, { happy: 90 }).length;
  n += feed(c, 800, 1100, { neutral: 90 }).length; // too short to re-arm? relaxed for ~300ms after smoothing
  n += feed(c, 1100, 1800, { neutral: 90 }).length;
  n += feed(c, 1800, 2600, { happy: 90 }).length;
  assert.equal(n, 2);
});

test('a quick flicker of a smile while relaxing does not double-jump', () => {
  const c = new ExpressionControls();
  let n = feed(c, 0, 600, { happy: 90 }).length;
  // drop just below the re-arm line for a moment, then back up: no re-arm yet
  n += feed(c, 600, 700, { happy: 20 }).length;
  n += feed(c, 700, 1400, { happy: 90 }).length;
  assert.equal(n, 1);
});

test('surprise has its own trigger and cooldown', () => {
  const c = new ExpressionControls();
  const a = feed(c, 0, 600, { surprise: 85 });
  assert.deepEqual(a.map((x) => x.a), ['magic']);
  feed(c, 600, 1000, { neutral: 90 });
  // re-armed, but still inside the 1000 ms magic cooldown from the first zap
  const t0 = a[0].t;
  const tooSoon = feed(c, 1000, t0 + CONTROLS.magicCooldownMs - 50, { surprise: 85 });
  assert.equal(tooSoon.length, 0);
});

test('happy and surprise are separate: a smile never fires magic', () => {
  const c = new ExpressionControls();
  const fired = feed(c, 0, 3000, { happy: 95, surprise: 10 });
  assert.ok(!fired.some((x) => x.a === 'magic'));
});

test('blinks dodge on the rising edge, with a cooldown', () => {
  const c = new ExpressionControls();
  const b = (t, detected) => ({ detected, stable: true, timestamp: t * 1000 });
  assert.deepEqual(c.pushBlinks([b(0, false), b(33, true), b(66, true)], 66), ['dodge']);
  assert.deepEqual(c.pushBlinks([b(100, false), b(133, true)], 200), [], 'a second blink inside the cooldown');
  assert.deepEqual(c.pushBlinks([b(700, false), b(733, true)], 800), ['dodge']);
});

test('a straight face held for a moment means sneaking, and a smile breaks it', () => {
  const c = new ExpressionControls();
  feed(c, 0, 500, { neutral: 90 });
  assert.equal(c.sneaking(500), false, 'not instantly');
  feed(c, 500, 1200, { neutral: 90 });
  assert.equal(c.sneaking(1200), true);
  feed(c, 1200, 1500, { happy: 90 });
  assert.equal(c.sneaking(1500), false);
});

test('when the face goes out of view, nothing stays pressed', () => {
  const c = new ExpressionControls();
  feed(c, 0, 1200, { neutral: 90 });
  c.tick(1200 + CONTROLS.lostMs + 10);
  assert.equal(c.sneaking(1200 + CONTROLS.lostMs + 10), false);
  assert.equal(c.happy, 0);
});

test('if blinking is not arriving, dodge switches to a surprised face', () => {
  assert.equal(controlScheme({ blinkLive: true }).dodge, 'dodge');
  assert.equal(controlScheme({ blinkLive: false }).dodge, 'magic');
  assert.equal(promptFor('dodge', { blinkLive: false }), 'Look surprised to dodge!');
});

// ---- the level engine

// Play a level, doing the right thing as soon as each challenge opens (or never, if `lazy`).
function playLevel(level, { lazy = () => false, step = 50, until = 120000 } = {}) {
  const g = new AdventureLevel(level, { now: 0, rand: () => 0 });
  const events = [];
  for (let t = 0; t <= until && !g.done; t += step) {
    const v = g.view(t);
    const input = {};
    if (g.phase === 'challenge' && !lazy(v, t)) {
      if (v.step.need === 'sneak') input.calmMs = 60000;
      else input.actions = [controlScheme()[v.step.need]];
    }
    events.push(...g.tick(t, input));
  }
  return { g, events };
}

test('Level 1 is playable and teaches only smiling', () => {
  const l1 = LEVELS[0];
  assert.equal(l1.name, 'Silent Village');
  assert.equal(l1.boss.name, 'Grumpy Chicken');
  assert.ok(isPlayable(l1));
  assert.ok([...l1.steps, ...l1.boss.steps].every((s) => s.need === 'jump'));
  assert.equal(LEVELS.length, 5);
});

test('a level runs intro -> challenges -> boss -> outro -> complete', () => {
  const { g, events } = playLevel(LEVELS[0]);
  assert.ok(g.done);
  const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
  assert.equal(phases[0], 'intro');
  assert.ok(phases.indexOf('bossIntro') > phases.indexOf('challenge'));
  assert.equal(phases.at(-1), 'complete');
  const wins = events.filter((e) => e.type === 'success');
  assert.equal(wins.length, LEVELS[0].steps.length + LEVELS[0].boss.steps.length);
  assert.equal(g.summary().stars, 3);
  const { step, firstTry, boss } = ENGINE.points;
  assert.equal(g.score, LEVELS[0].steps.length * (step + firstTry) + LEVELS[0].boss.steps.length * (boss + firstTry));
});

test('actions outside a challenge do nothing', () => {
  const g = new AdventureLevel(LEVELS[0], { now: 0, rand: () => 0 });
  const ev = g.tick(100, { actions: ['jump'] });
  assert.ok(!ev.some((e) => e.type === 'success'));
  assert.equal(g.phase, 'intro');
});

test('missing a window is never game over: a funny oops, then a retry with more time', () => {
  let missed = 0;
  const { g, events } = playLevel(LEVELS[0], { lazy: (v) => v.stepIndex === 0 && missed++ < 400 });
  const oops = events.filter((e) => e.type === 'oops');
  assert.ok(oops.length >= 1);
  assert.ok(oops.every((e) => e.step === g.steps[0]));
  assert.ok(g.done, 'still finishes');
  assert.ok(g.summary().stars >= 1 && g.summary().stars < 3);
  const challenges = events.filter((e) => e.type === 'challenge' && e.step === g.steps[0]);
  assert.ok(challenges.length >= 2 && challenges[1].retry);
  assert.ok(g.windowFor(g.steps[0]) >= ENGINE.windowMs);
});

test('a smile made just before the window opens still counts', () => {
  const g = new AdventureLevel(LEVELS[0], { now: 0, rand: () => 0 });
  let t = 0;
  while (g.phase !== 'run') g.tick((t += 50));
  const opensAt = g.phaseEnds;
  g.tick(opensAt - 200, { actions: ['jump'] });
  const ev = g.tick(opensAt + 10);
  assert.ok(ev.some((e) => e.type === 'success'));
});

test('a wrong face does not count, and sneaking needs the straight face', () => {
  const sneaky = { id: 't', n: 9, name: 'T', mission: 'm', steps: [{ need: 'sneak', win: 'ok' }], boss: { name: 'B', steps: [{ need: 'magic', win: 'ok' }] } };
  const g = new AdventureLevel(sneaky, { now: 0, rand: () => 0 });
  let t = 0;
  while (g.phase !== 'challenge') g.tick((t += 50));
  g.tick((t += 50), { actions: ['jump'] });
  assert.equal(g.phase, 'challenge');
  const opened = g.phaseAt;
  g.tick((t = opened + 300), { calmMs: 5000 });
  assert.equal(g.phase, 'challenge', 'calm from before the guard appeared still has to be held in the window');
  g.tick((t = opened + ENGINE.sneakHoldMs + 10), { calmMs: 5000 });
  assert.equal(g.phase, 'success');
  while (g.phase !== 'challenge') g.tick((t += 50));
  assert.ok(g.step.boss);
  g.tick((t += 50), { actions: ['dodge'] });
  assert.equal(g.phase, 'challenge');
  g.tick((t += 50), { actions: ['magic'] });
  assert.equal(g.phase, 'success');
});

test('finishing a level opens the next and keeps the best result', () => {
  let p = emptyProgress();
  p = recordLevel(p, 'village', { stars: 2, score: 900 });
  assert.equal(p.unlocked, 2);
  p = recordLevel(p, 'village', { stars: 1, score: 1200 });
  assert.deepEqual(p.best.village, { stars: 2, score: 1200 });
  p = recordLevel(p, 'finale', { stars: 3, score: 10 });
  assert.equal(p.unlocked, 5, 'never past the last level');
  assert.deepEqual(normalizeProgress({ unlocked: 99, best: { village: { stars: 7 } } }), { unlocked: 5, best: { village: { stars: 3, score: 0 } } });
  assert.deepEqual(normalizeProgress(null), emptyProgress());
});

test('all five levels are playable, each with its boss, and can be finished', () => {
  const bosses = ['Grumpy Chicken', 'Dancing Tree', 'Ice Penguin', 'Giant Grumpy Ghost', 'Grumpy Shadow'];
  LEVELS.forEach((l, i) => {
    assert.ok(isPlayable(l), `${l.name} is playable`);
    assert.equal(l.boss.name, bosses[i]);
    const { g } = playLevel(l);
    assert.ok(g.done, `${l.name} finishes`);
    assert.equal(g.summary().stars, 3);
  });
});

test('each level only asks for the faces it teaches, and the finale uses all four', () => {
  for (const l of LEVELS) {
    const needs = new Set([...l.steps, ...l.boss.steps].map((s) => s.need));
    for (const n of needs) assert.ok(l.teaches.includes(n), `${l.name} asks for ${n}`);
  }
  const finale = new Set([...LEVELS[4].steps, ...LEVELS[4].boss.steps].map((s) => s.need));
  assert.deepEqual([...finale].sort(), ['dodge', 'jump', 'magic', 'sneak']);
  assert.ok(LEVELS.slice(0, 3).every((l) => !l.teaches.includes('sneak')), 'sneaking waits for the castle');
});

test('dodging still works without blinks, using a surprised face', () => {
  const g = new AdventureLevel(LEVELS[2], { now: 0, rand: () => 0 });
  const scheme = controlScheme({ blinkLive: false });
  let t = 0;
  while (!(g.phase === 'challenge' && g.step.need === 'dodge')) {
    const input = g.phase === 'challenge' ? { actions: [scheme[g.step.need]], scheme } : { scheme };
    g.tick((t += 50), input);
  }
  g.tick((t += 50), { actions: ['dodge'], scheme });
  assert.equal(g.phase, 'challenge', 'a blink is not what this scheme asks for');
  g.tick((t += 50), { actions: ['magic'], scheme });
  assert.equal(g.phase, 'success');
});

// ---- Momo's voice

import { MomoVoice, pickVoice } from '../src/adventure/voice.js';
import { TRACKS, notesAt, loopLength } from '../src/music.js';

function fakeSynth(voices = [{ name: 'Samantha', lang: 'en-US', default: true }]) {
  const spoken = [];
  const synth = { spoken, getVoices: () => voices, speak: (u) => spoken.push(u), cancel: () => { synth.cancelled = (synth.cancelled || 0) + 1; } };
  class Utterance { constructor(text) { this.text = text; } }
  return { synth, Utterance };
}

test('Momo speaks one line at a time and keeps only the newest waiting line', () => {
  const { synth, Utterance } = fakeSynth();
  let t = 0;
  const talk = [];
  const v = new MomoVoice({ synth, Utterance, now: () => t, onTalk: (x) => talk.push(x) });
  assert.equal(v.say('one'), true);
  v.say('two');
  v.say('three');
  assert.deepEqual(synth.spoken.map((u) => u.text), ['one'], 'no overlapping voices');
  t = 1000;
  synth.spoken[0].onend();
  assert.deepEqual(synth.spoken.map((u) => u.text), ['one', 'three'], '"two" was dropped for the newer line');
  synth.spoken[1].onend();
  assert.deepEqual(talk, [true, true, false], 'music dips while talking and comes back after');
});

test('a line that waited too long is skipped', () => {
  const { synth, Utterance } = fakeSynth();
  let t = 0;
  const v = new MomoVoice({ synth, Utterance, now: () => t });
  v.say('first');
  v.say('late');
  t = 10000;
  synth.spoken[0].onend();
  assert.equal(synth.spoken.length, 1);
});

test('no voices, no synth or voice off: nothing is spoken (the bubble still shows the line)', () => {
  const none = fakeSynth([]);
  assert.equal(new MomoVoice({ synth: none.synth, Utterance: none.Utterance }).say('hi'), false);
  assert.equal(new MomoVoice().say('hi'), false);
  const { synth, Utterance } = fakeSynth();
  const v = new MomoVoice({ synth, Utterance });
  v.setEnabled(false);
  assert.equal(v.say('hi'), false);
  assert.equal(synth.spoken.length, 0);
  assert.equal(pickVoice([{ name: 'Thomas', lang: 'fr-FR' }]), null, 'only English voices, since the lines are English');
  assert.equal(pickVoice([{ name: 'Google US English', lang: 'en-US', localService: false }]), null, 'never an online voice');
});

test('the adventure has its own level, boss and victory music', () => {
  for (const name of ['adventure', 'boss', 'victory']) {
    assert.ok(TRACKS[name]);
    const len = loopLength(name);
    assert.equal(TRACKS[name].melody.length, TRACKS[name].chords.length);
    assert.ok(notesAt(name, 0).length > 0);
    assert.deepEqual(notesAt(name, len), notesAt(name, 0), 'loops seamlessly');
  }
});

test('stepping away pauses the level, so the window never runs out and no star is lost', () => {
  const g = new AdventureLevel(LEVELS[0], { now: 0 });
  let t = 0;
  while (g.phase !== 'challenge') { t += 50; g.tick(t); }
  const left = g.phaseEnds - t;
  g.setPaused(true, t);
  const ev = g.tick(t + 30000, { actions: ['jump'] }); // a face from while away doesn't count either
  assert.equal(g.misses, 0);
  assert.equal(g.phase, 'challenge');
  assert.ok(!ev.some((e) => e.type === 'success'));
  g.setPaused(false, t + 30000);
  assert.equal(g.phaseEnds - (t + 30000), left); // the same time left as before the break
  g.tick(t + 30050, { actions: ['jump'] });
  assert.equal(g.phase, 'success');
  assert.equal(g.misses, 0);
});

test('pausing twice or resuming when not paused does nothing odd', () => {
  const g = new AdventureLevel(LEVELS[0], { now: 0 });
  g.setPaused(false, 100);
  g.setPaused(true, 200);
  g.setPaused(true, 900);
  const ends = g.phaseEnds;
  g.setPaused(false, 1200);
  assert.equal(g.phaseEnds, ends + 1000);
  assert.ok(!g.paused);
});
