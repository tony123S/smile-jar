import test from 'node:test';
import assert from 'node:assert/strict';
import { Wanderer, WALK } from '../src/behaviour.js';
import { monsterSvg, traitsFor, emptyMonster, faceFor } from '../src/monster.js';

// A fixed sequence of "random" numbers, so the walks are repeatable.
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

function run(w, from, to, face = 'flat', step = 50) {
  const out = [];
  for (let t = from; t <= to; t += step) out.push(w.tick(t, { face }));
  return out;
}

test('left alone it idles, then walks somewhere, then idles again', () => {
  const w = new Wanderer({ rand: seq(0.5, 0.9, 0.9, 0.2), now: 0 });
  const r = run(w, 0, 12000);
  const actions = new Set(r.map((x) => x.action));
  assert.ok(actions.has('idle'));
  assert.ok(actions.has('walk'));
  const xs = r.map((x) => x.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= WALK.minStep - 0.01, 'it actually moved');
  assert.ok(xs.every((x) => x >= -1 && x <= 1), 'stays inside its world');
  // while walking, its eyes look the way it's going
  const walking = r.find((x) => x.action === 'walk');
  assert.notEqual(walking.look, 0);
});

test('it stops at the flowers to sniff them, but only once there are flowers', () => {
  const noFlowers = new Wanderer({ rand: seq(0.1), flowers: false, now: 0 });
  assert.ok(!run(noFlowers, 0, 15000).some((x) => x.action === 'sniff'));
  const flowers = new Wanderer({ rand: seq(0.1), flowers: true, now: 0 });
  assert.ok(run(flowers, 0, 15000).some((x) => x.action === 'sniff'));
});

test('your face comes first: it stops walking and looks at you', () => {
  const w = new Wanderer({ rand: seq(0.9, 0.1), now: 0 });
  const r = run(w, 0, 8000);
  const walkAt = r.findIndex((x) => x.action === 'walk');
  assert.ok(walkAt >= 0);
  const t = walkAt * 50 + 50;
  const xBefore = w.x;
  for (const face of ['grin', 'extra', 'wow']) {
    const seen = w.tick(t, { face });
    assert.equal(seen.action, 'look');
    assert.equal(seen.look, 0, 'looking straight at you');
  }
  const later = w.tick(t + 300, { face: 'grin' });
  assert.equal(later.x, xBefore, 'no walking while you smile');
});

test('it falls asleep when nothing happens, and wakes when you smile', () => {
  const w = new Wanderer({ rand: seq(0.5), now: 0 });
  const r = run(w, 0, WALK.sleepAfterMs + 500, 'flat', 250);
  assert.equal(r[r.length - 1].action, 'sleep');
  assert.equal(w.tick(WALK.sleepAfterMs + 600, { face: 'grin' }).action, 'look');
  assert.notEqual(w.tick(WALK.sleepAfterMs + 1000, { face: 'flat' }).action, 'sleep');
});

test('it celebrates when it grows, after the hatching shake if there is one', () => {
  const w = new Wanderer({ now: 0 });
  w.celebrate(1000, 1300);
  assert.notEqual(w.tick(1200).action, 'celebrate', 'not during the shake');
  assert.equal(w.tick(2400).action, 'celebrate');
  assert.equal(w.tick(2400, { face: 'grin' }).action, 'celebrate', 'celebration wins over looking');
  assert.notEqual(w.tick(1000 + 1300 + WALK.celebrateMs + 10).action, 'celebrate');
});

test('the egg cannot walk yet', () => {
  const w = new Wanderer({ rand: seq(0.9, 0.1), canWalk: false, now: 0 });
  const r = run(w, 0, 15000);
  assert.ok(r.every((x) => x.x === 0 && x.action !== 'walk'));
  w.setWorld({ canWalk: true });
  assert.ok(run(w, 15000, 25000).some((x) => x.action === 'walk'), 'after hatching it can');
});

test('sleeping and looking show on the drawn monster', () => {
  const t = traitsFor(emptyMonster());
  assert.equal(faceFor('final', { sleeping: true }), 'sleepy');
  assert.equal(faceFor('final', { sleeping: true, face: 'grin' }), 'grin', 'a smile wins over sleep');
  assert.match(monsterSvg({ stage: 'final', traits: t, live: { sleeping: true } }), />z</);
  const ahead = monsterSvg({ stage: 'sprite', traits: t, live: { look: 0 } });
  const right = monsterSvg({ stage: 'sprite', traits: t, live: { look: 1 } });
  assert.notEqual(ahead, right, 'eyes follow where it walks');
});
