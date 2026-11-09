import test from 'node:test';
import assert from 'node:assert/strict';
import { HumourModel, LEAD_MS } from '../src/humour.js';
import { MonsterVoice } from '../src/monster-voice.js';
import { JOY_REEL, KINDS } from '../src/joy-reel.js';

function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

test('every reel card has a known kind, and each kind has cards', () => {
  for (const c of JOY_REEL) assert.ok(KINDS.includes(c.kind), c.text);
  for (const k of KINDS) assert.ok(JOY_REEL.filter((c) => c.kind === k).length >= 5, k);
});

test('humour model learns to serve the kind you smile at', () => {
  const m = new HumourModel(JOY_REEL, { rand: seeded(7) });
  let t = 0;
  const served = [];
  for (let i = 0; i < 80; i++) {
    t += 9000;
    const card = m.next(t);
    served.push(card.kind);
    if (card.kind === 'Animal fact') m.creditSmile(t + 3000); // only animal facts make this user smile
  }
  const late = served.slice(40);
  const animal = late.filter((k) => k === 'Animal fact').length;
  assert.ok(animal > late.length / 2, `animal facts were ${animal}/${late.length} of late cards`);
  assert.equal(m.favourite(), 'Animal fact');
});

test('a smile is credited to the card on screen when it started', () => {
  const m = new HumourModel(JOY_REEL, { rand: seeded(3) });
  const first = m.next(0);
  const second = m.next(10000);
  // counted 300 ms after the change: it began on the previous card
  assert.equal(m.creditSmile(10300).kind, first.kind);
  // counted well after the change: it belongs to the new card
  assert.equal(m.creditSmile(10000 + LEAD_MS + 100).kind, second.kind);
});

test('monster voice always reacts to a smile, but rate-limits ambient lines', () => {
  const v = new MonsterVoice({ rand: seeded(5), ambientGapMs: 4000 });
  assert.equal(v.onSmile({ golden: false, combo: 1 }, 0).pool, 'smile');
  assert.equal(v.onTick({ face: 'wow' }, 1000), null); // too soon
  assert.equal(v.onTick({ face: 'wow' }, 5000).pool, 'wow');
  assert.equal(v.onSmile({ golden: false, combo: 2 }, 5500).pool, 'combo');
  assert.equal(v.onSmile({ golden: true, combo: 3 }, 16000).pool, 'golden');
});

test('monster voice nudges when nothing has happened for a while', () => {
  const v = new MonsterVoice({ rand: seeded(9), nudgeAfterMs: 20000 });
  assert.equal(v.start(0).pool, 'start');
  assert.equal(v.onTick({ face: 'flat' }, 10000), null);
  assert.equal(v.onTick({ face: 'flat' }, 21000).pool, 'nudge');
});

test('the monster never says anything from the removed Try Not to Smile mode', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/monster-voice.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(src, /poker|straight face|weak spot/i);
});
