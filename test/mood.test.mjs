import test from 'node:test';
import assert from 'node:assert/strict';
import { MoodMirror, MOOD } from '../src/mood.js';
import { ExpressionType } from '../src/smile-detector.js';
import { monsterSvg, traitsFor, emptyMonster, faceFor } from '../src/monster.js';

const expr = (happy = 0, surprise = 0) => ({
  stable: true,
  scores: [{ type: ExpressionType.HAPPY, confidence: happy }, { type: ExpressionType.SURPRISE, confidence: surprise }],
});

// Feed a sequence of [happy, surprise] samples 50 ms apart; return the face after each one.
function play(m, samples, start = 0, step = 50) {
  return samples.map(([h, s], i) => m.push(expr(h, s), start + i * step).face);
}

test('a steady smile becomes a grin, then extra happy if it is held', () => {
  const m = new MoodMirror();
  const faces = play(m, Array(30).fill([90, 0]));
  assert.equal(faces[0], 'flat', 'one sample is not enough');
  assert.ok(faces.includes('grin'));
  const r = play(m, Array(60).fill([90, 0]), 1500);
  assert.equal(r[r.length - 1], 'extra', 'held for over 3 s');
});

test('a jumpy HAPPY score near the threshold does not make the face flicker', () => {
  const m = new MoodMirror();
  // alternate wildly between 70 and 20 for 3 seconds
  const faces = play(m, Array.from({ length: 60 }, (_, i) => [i % 2 ? 70 : 20, 0]));
  const changes = faces.filter((f, i) => i > 0 && f !== faces[i - 1]).length;
  assert.ok(changes <= 1, `face changed ${changes} times`);
});

test('after a smile it eases back through a soft smile, never snapping to neutral', () => {
  const m = new MoodMirror();
  play(m, Array(20).fill([90, 0]));
  assert.equal(m.face, 'grin');
  const after = play(m, Array(60).fill([0, 0]), 1000);
  const firstChange = after.find((f) => f !== 'grin');
  assert.equal(firstChange, 'soft');
  assert.equal(after[after.length - 1], 'flat', 'and then it relaxes');
  // the soft smile lasts a while
  assert.ok(after.filter((f) => f === 'soft').length * 50 >= MOOD.softMs - 100);
});

test('surprise opens its eyes wide and jumps once, with a cooldown', () => {
  const m = new MoodMirror();
  let jumps = 0;
  for (let i = 0; i < 20; i++) jumps += m.push(expr(0, 90), i * 50).events.filter((e) => e === 'jump').length;
  assert.equal(m.face, 'wow');
  assert.equal(jumps, 1, 'one jump for one surprise');
  // calm down, then be surprised again straight away: no second jump inside the cooldown
  for (let i = 0; i < 12; i++) m.push(expr(0, 0), 1000 + i * 50);
  assert.equal(m.face, 'flat', 'calm again');
  let again = 0;
  for (let i = 0; i < 20; i++) again += m.push(expr(0, 90), 1700 + i * 50).events.filter((e) => e === 'jump').length;
  assert.equal(again, 0);
});

test('smiling wins over surprise, so a delighted gasp still reads as happy', () => {
  const m = new MoodMirror();
  const faces = play(m, Array(20).fill([90, 90]));
  assert.equal(faces[faces.length - 1], 'grin');
});

test('if the face goes out of view the monster relaxes on its own', () => {
  const m = new MoodMirror();
  play(m, Array(20).fill([90, 0]));
  let face = m.face;
  for (let t = 1500; t < 8000; t += 500) face = m.tick(t).face;
  assert.equal(face, 'flat');
});

test('it winks back every few blinks', () => {
  const m = new MoodMirror();
  const r = Array.from({ length: 10 }, () => m.blink());
  assert.deepEqual(r.map((x, i) => (x === 'wink' ? i + 1 : 0)).filter(Boolean), [5, 10]);
});

test('the drawn monster shows the new moods', () => {
  const t = traitsFor(emptyMonster());
  assert.equal(faceFor('final', { face: 'extra' }), 'extra');
  assert.equal(faceFor('final', { face: 'soft' }), 'happy');
  assert.equal(faceFor('final', { face: 'soft', talking: true, talkOpen: true }), 'talk-open', 'talking shows over the soft smile');
  const grin = monsterSvg({ stage: 'sprite', traits: t, live: { face: 'grin' } });
  const extra = monsterSvg({ stage: 'sprite', traits: t, live: { face: 'extra' } });
  assert.notEqual(grin, extra);
  assert.ok((extra.match(/<path d="M[^"]* l/g) || []).length >= 2, 'extra happy has hearts');
  const open = monsterSvg({ stage: 'sprite', traits: t, live: {} });
  const wink = monsterSvg({ stage: 'sprite', traits: t, live: { wink: true } });
  assert.notEqual(open, wink);
  const pupils = (svg) => (svg.match(/<ellipse[^>]*fill="#4a3b5c"/g) || []).length;
  assert.equal(pupils(open) - pupils(wink), 1, 'one eye closes for a wink');
});
