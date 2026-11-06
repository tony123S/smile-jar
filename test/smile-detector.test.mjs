import test from 'node:test';
import assert from 'node:assert/strict';
import { SmileDetector, ExpressionType, happyScore, tsToMs } from '../src/smile-detector.js';

// Feed `happy` at 10 Hz for `ms`, starting at t0. Returns [smilesCounted, nextT].
function run(d, t0, ms, happy, stable = true) {
  let n = 0, t = t0;
  for (; t < t0 + ms; t += 100) if (d.push({ t, happy, stable })) n++;
  return [n, t];
}

test('a held smile counts once', () => {
  const d = new SmileDetector();
  let [n, t] = run(d, 0, 1000, 5);
  assert.equal(n, 0);
  [n, t] = run(d, t, 4000, 90);
  assert.equal(n, 1);
  assert.equal(d.count, 1);
});

test('a flicker shorter than holdMs does not count', () => {
  const d = new SmileDetector();
  let [n, t] = run(d, 0, 300, 90);
  assert.equal(n, 0);
  [n] = run(d, t, 1000, 5);
  assert.equal(d.count, 0);
});

test('two smiles separated by a full relax count twice', () => {
  const d = new SmileDetector();
  let t = 0, n;
  [n, t] = run(d, t, 1000, 90);
  [n, t] = run(d, t, 1500, 10);
  [n, t] = run(d, t, 1000, 90);
  assert.equal(d.count, 2);
});

test('a dip that stays above offThreshold does not re-arm', () => {
  const d = new SmileDetector();
  let t = 0, n;
  [n, t] = run(d, t, 1000, 90);
  [n, t] = run(d, t, 2000, 50); // between off (35) and on (60)
  [n, t] = run(d, t, 1000, 90);
  assert.equal(d.count, 1);
});

test('unstable samples are ignored', () => {
  const d = new SmileDetector();
  run(d, 0, 3000, 95, false);
  assert.equal(d.count, 0);
});

test('minIntervalMs limits rapid smiles', () => {
  const d = new SmileDetector({ rearmMs: 100, holdMs: 100, minIntervalMs: 5000 });
  let t = 0, n;
  [n, t] = run(d, t, 300, 90);
  [n, t] = run(d, t, 300, 0);
  [n, t] = run(d, t, 300, 90);
  assert.equal(d.count, 1);
});

test('reads HAPPY score and µs timestamps from SDK-shaped expressions', () => {
  const e = { stable: true, timestamp: 2_000_000, scores: [
    { type: ExpressionType.NEUTRAL, confidence: 20 },
    { type: ExpressionType.HAPPY, confidence: 77 },
  ] };
  assert.equal(happyScore(e), 77);
  assert.equal(tsToMs(e.timestamp), 2000);
  assert.equal(tsToMs({ toNumber: () => 5_000_000 }), 5000);
  assert.equal(happyScore({ scores: [] }), 0);
});

test('pushExpressions counts from a decoded metrics slice', () => {
  const d = new SmileDetector();
  const slice = [];
  for (let i = 0; i < 20; i++) slice.push({ stable: true, timestamp: i * 100_000, scores: [{ type: 5, confidence: 92 }] });
  assert.equal(d.pushExpressions(slice), 1);
});

test('mascotFace grins on HAPPY, jaw-drops on SURPRISE, else flat', async () => {
  const { mascotFace } = await import('../src/smile-detector.js');
  assert.equal(mascotFace({ scores: [{ type: 5, confidence: 80 }] }), 'grin');
  assert.equal(mascotFace({ scores: [{ type: 8, confidence: 70 }, { type: 5, confidence: 10 }] }), 'wow');
  assert.equal(mascotFace({ scores: [{ type: 6, confidence: 90 }] }), 'flat');
  assert.equal(mascotFace(undefined), 'flat');
});
