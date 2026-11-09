import test from 'node:test';
import assert from 'node:assert/strict';
import { CatchGame, CATCH } from '../src/catch-game.js';

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// Only one kind of thing falls, so each test is about one rule.
const only = (kind) => ({ mix: { joy: 0, gold: 0, wow: 0, gloom: 0, [kind]: 1 } });

// Play from `from` to `to`, choosing the face from the falling items each step.
function play(g, from, to, faceFor, step = 50) {
  const ev = [];
  for (let t = from; t <= to; t += step) {
    const near = g.items.filter((it) => !it.done && it.y >= CATCH.zoneFrom);
    ev.push(...g.tick(t, faceFor(near, t)));
  }
  return ev;
}

test('smile as an orb reaches the monster and it catches it', () => {
  const g = new CatchGame({ rand: seq(0.3), ...only('joy') });
  const ev = play(g, 0, 8000, (near) => ({ face: near.length ? 'grin' : 'flat' }));
  assert.ok(ev.some((e) => e.type === 'catch'));
  assert.equal(g.missed, 0);
  assert.ok(g.score >= CATCH.points.joy);
});

test('smiling too early does not count: it has to be in the catch zone', () => {
  const g = new CatchGame({ rand: seq(0.3), ...only('joy') });
  const first = CATCH.firstAtMs;
  // smile only while the orb is high up, then relax
  const ev = play(g, 0, first + CATCH.fallMs + 200, (_n, t) => ({ face: t < first + CATCH.fallMs * 0.5 ? 'grin' : 'flat' }));
  assert.ok(!ev.some((e) => e.type === 'catch'));
  assert.ok(ev.some((e) => e.type === 'miss'));
});

test('gloom clouds punish a non-stop grin, and a straight face dodges them', () => {
  const grinning = new CatchGame({ rand: seq(0.3), ...only('gloom') });
  const ev = play(grinning, 0, 9000, () => ({ face: 'grin' }));
  assert.ok(ev.some((e) => e.type === 'gloom'));
  assert.equal(grinning.combo, 0);
  const calm = new CatchGame({ rand: seq(0.3), ...only('gloom') });
  const ev2 = play(calm, 0, 9000, () => ({ face: 'flat' }));
  assert.ok(ev2.some((e) => e.type === 'dodge'));
  assert.ok(calm.score > 0);
});

test('golden orbs need a big smile, wow stars need a surprised face', () => {
  const small = new CatchGame({ rand: seq(0.3), ...only('gold') });
  play(small, 0, 8000, () => ({ face: 'grin', bigSmile: false }));
  assert.equal(small.caught, 0);
  const big = new CatchGame({ rand: seq(0.3), ...only('gold') });
  play(big, 0, 8000, () => ({ face: 'grin', bigSmile: true }));
  assert.ok(big.caught > 0);
  const wow = new CatchGame({ rand: seq(0.3), ...only('wow') });
  play(wow, 0, 8000, (near) => ({ face: near.length ? 'wow' : 'flat' }));
  assert.ok(wow.caught > 0);
});

test('combos raise the points, and a miss resets the combo', () => {
  const g = new CatchGame({ rand: seq(0.3), ...only('joy') });
  const ev = play(g, 0, 40000, (near) => ({ face: near.length ? 'grin' : 'flat' }));
  const catches = ev.filter((e) => e.type === 'catch');
  assert.ok(catches.length >= 6);
  assert.ok(catches[catches.length - 1].points > CATCH.points.joy, 'later catches in a streak are worth more');
  assert.equal(g.bestCombo, catches.length);
  play(g, 40050, 50000, () => ({ face: 'flat' }));
  assert.equal(g.combo, 0);
});

test('stars: a perfect run gets 3, doing nothing gets 0', () => {
  const good = new CatchGame({ rand: seq(0.1, 0.4, 0.7, 0.95) });
  play(good, 0, 60000, (near) => {
    const kinds = new Set(near.map((x) => x.kind));
    if (kinds.has('gloom')) return { face: 'flat' };
    if (kinds.has('wow')) return { face: 'wow' };
    if (kinds.size) return { face: 'extra', bigSmile: true };
    return { face: 'flat' };
  });
  assert.equal(good.summary().stars, 3);
  const idle = new CatchGame({ rand: seq(0.1, 0.4, 0.7, 0.95), ...only('joy') });
  play(idle, 0, 60000, () => ({ face: 'flat' }));
  assert.equal(idle.summary().stars, 0);
});
