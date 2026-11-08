import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageFor, traitsFor, monsterName, monsterSvg, emptyMonster, tier } from '../src/monster.js';
import { SignalMonitor, BlinkTracker, talkingNow, BreathNormalizer } from '../src/signals.js';
import { confirmedTotal, pledgeLedger, pledgeStatementCsv } from '../src/pledges.js';
import { normalizeSponsor, defaultState } from '../src/store.js';
import { HumourModel } from '../src/humour.js';
import { JOY_REEL } from '../src/joy-reel.js';
import { wrapText } from '../src/receipt.js';

test('four stages in order: Egg, Sleepy Blob, Hatchling, Final Monster', () => {
  assert.deepEqual(STAGES.map((s) => s.label), ['Egg', 'Sleepy Blob', 'Hatchling', 'Final Monster']);
  assert.equal(stageFor(0).key, 'egg');
  assert.equal(stageFor(2).key, 'egg');
  assert.equal(stageFor(3).key, 'blob');
  assert.equal(stageFor(10).key, 'hatchling');
  assert.equal(stageFor(20).key, 'final');
  assert.equal(stageFor(500).key, 'final');
  assert.equal(stageFor(1).toNext, 2);
  assert.equal(stageFor(20).next, null);
  assert.equal(stageFor(20).progress, 1);
});

test('joke categories change the monster', () => {
  const m = emptyMonster();
  m.diet.Pun = 6;
  m.diet['Animal fact'] = 2;
  const t = traitsFor(m);
  assert.equal(t.dominant, 'Pun');
  assert.equal(t.second, 'Animal fact');
  assert.equal(t.horns, 3);
  assert.equal(t.fur, 1);
  assert.equal(t.glow, 0);
  assert.equal(monsterName(t, 'final'), 'Punny Furball');
  assert.equal(monsterName(t, 'egg'), 'Mystery Egg');
  assert.equal(monsterName(traitsFor(emptyMonster()), 'blob'), 'Little Blob');

  const other = emptyMonster();
  other.diet.Memory = 4;
  assert.notEqual(traitsFor(other).body, t.body);
  assert.equal(monsterName(traitsFor(other), 'final'), 'Glowing Glowmoth');
  assert.deepEqual([0, 1, 3, 6].map(tier), [0, 1, 2, 3]);
});

test('sponsors whose snack made you smile add a heart in their colour', () => {
  const t = traitsFor(emptyMonster(), [
    { id: 'a', color: '#ff0000', snackSmiles: 2 },
    { id: 'b', color: '#00ff00', snackSmiles: 0 },
  ]);
  assert.deepEqual(t.patches, ['#ff0000']);
  const svg = monsterSvg({ stage: 'final', traits: t });
  assert.match(svg, /#ff0000/);
  assert.doesNotMatch(svg, /#00ff00/);
});

test('monster SVG reflects stage and live signals', () => {
  const t = traitsFor(emptyMonster());
  const egg = monsterSvg({ stage: 'egg', traits: t, uid: 'x' });
  assert.match(egg, /<svg/);
  assert.match(egg, /x-jar/);
  const open = monsterSvg({ stage: 'hatchling', traits: t, live: { face: 'flat' } });
  const shut = monsterSvg({ stage: 'hatchling', traits: t, live: { face: 'flat', eyesClosed: true } });
  assert.notEqual(open, shut);
  assert.ok((open.match(/fill="#fff" stroke/g) || []).length >= 2, 'open eyes drawn');
  const breatheIn = monsterSvg({ stage: 'final', traits: t, live: { breath: 1 } });
  const breatheOut = monsterSvg({ stage: 'final', traits: t, live: { breath: 0 } });
  assert.match(breatheIn, /scale\(1 1\.050\)/);
  assert.match(breatheOut, /scale\(1 0\.950\)/);
  const noBreath = monsterSvg({ stage: 'final', traits: t, live: { breath: null } });
  assert.match(noBreath, /scale\(1 1\.000\)/);
  assert.match(monsterSvg({ stage: 'final', traits: t, live: { talking: true } }), />\?</);
  assert.match(monsterSvg({ stage: 'blob', traits: t }), />z</); // sleepy blob snoozes
  assert.match(monsterSvg({ stage: 'egg', traits: t, standalone: true }), /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
});

test('signal monitor only reports signals that actually arrived', () => {
  const mon = new SignalMonitor({ liveMs: 3000 });
  let st = mon.status(0);
  assert.equal(st.blinking.seen, false);
  mon.observe({ face: { expression: [{}], blinking: [{ detected: false }] } }, 1000);
  st = mon.status(1500);
  assert.equal(st.expressions.live, true);
  assert.equal(st.blinking.live, true);
  assert.equal(st.talking.seen, false);
  assert.equal(st.breathing.seen, false);
  assert.equal(st.pulse.seen, false);
  st = mon.status(5000);
  assert.equal(st.expressions.seen, true);
  assert.equal(st.expressions.live, false);
  mon.observe({ breathing: { upperTrace: [{ value: 1 }, { value: 2 }] }, cardio: { pulseRate: [{ value: 70 }] } }, 6000);
  st = mon.status(6000);
  assert.equal(st.breathing.count, 2);
  assert.equal(st.pulse.live, true);
});

test('blink tracker counts rising edges of the SDK blinking flag', () => {
  const b = new BlinkTracker();
  const s = (detected, timestamp) => ({ detected, timestamp });
  assert.equal(b.push([s(false, 1000), s(true, 2000), s(true, 3000)]), 1);
  assert.equal(b.closed, true);
  assert.equal(b.push([s(false, 4000), s(true, 5000), s(false, 6000), s(true, 7000)]), 2);
  assert.equal(b.push([s(true, 6500)]), 0, 'out-of-order samples are ignored');
  assert.equal(b.blinks, 3);
  assert.equal(b.push([]), 0);
});

test('talking state is the latest SDK flag', () => {
  assert.equal(talkingNow([]), null);
  assert.equal(talkingNow([{ detected: true }, { detected: false }]), false);
  assert.equal(talkingNow([{ detected: false }, { detected: true }]), true);
});

test('breath normaliser maps the trace to 0..1 and waits for enough data', () => {
  const n = new BreathNormalizer(50);
  assert.equal(n.push([{ value: 1 }]), null);
  const wave = Array.from({ length: 40 }, (_, i) => ({ value: Math.sin(i / 3) * 5 + 100 }));
  const lvl = n.push(wave);
  assert.ok(lvl >= 0 && lvl <= 1);
  n.push([{ value: 1000 }]);
  assert.equal(n.level(), 1);
  n.push([{ value: -1000 }]);
  assert.equal(n.level(), 0);
  n.push([{ value: 'junk' }]);
  assert.equal(n.level(), 0);
});

test('pledged and confirmed donations are tracked separately', () => {
  const sponsors = [
    { id: 'a', name: 'A', centsPerSmile: 10, capCents: 100, confirmedCents: 50, snackSmiles: 2 },
    { id: 'b', name: 'B', centsPerSmile: 5, capCents: 0, confirmedCents: 0 },
  ];
  assert.equal(confirmedTotal(sponsors), 50);
  const l = pledgeLedger(sponsors, 20);
  assert.deepEqual(l[0], { id: 'a', name: 'A', pledged: 100, confirmed: 50, outstanding: 50, snackSmiles: 2 });
  assert.equal(l[1].pledged, 100);
  assert.equal(l[1].outstanding, 100);
  const csv = pledgeStatementCsv({ cause: 'Shelter', sponsors }, [{ endedAt: 0, smiles: 20, durationMs: 60000 }]);
  assert.match(csv, /does not process payments/);
  assert.match(csv, /Confirmed donated/);
  assert.match(csv, /A,10,\$1\.00,\$1\.00,\$0\.50,\$0\.50,2/);
});

test('old sponsor records get colours, snack fields and confirmed amounts', () => {
  const s = normalizeSponsor({ id: 'old', name: 'Gran', centsPerSmile: '7', capCents: 500 }, 2);
  assert.equal(s.centsPerSmile, 7);
  assert.equal(s.snack, '');
  assert.equal(s.snackSmiles, 0);
  assert.equal(s.confirmedCents, 0);
  assert.match(s.color, /^#/);
  const d = defaultState();
  assert.ok(d.campaign.sponsors.every((x) => x.snack && x.color));
  assert.equal(d.monster.smiles, 0);
  assert.equal(d.settings.telemetry, false);
});

test('a smile at a sponsor snack is credited to that sponsor', () => {
  const cards = [...JOY_REEL, { kind: 'Sponsor snack', text: 'joke', sponsorId: 's9', from: 'Gran' }];
  const m = new HumourModel(cards, { rand: () => 0 });
  let card;
  let t = 0;
  for (let i = 0; i < 6 && card?.sponsorId !== 's9'; i++) { t += 9000; card = m.next(t); }
  assert.equal(card.sponsorId, 's9', 'snack card is served while exploring');
  const credited = m.creditSmile(t + 2000);
  assert.equal(credited.sponsorId, 's9');
  assert.equal(credited.kind, 'Sponsor snack');
});

test('receipt text wrapping', () => {
  const lines = wrapText((s) => s.length * 10, 'for the local animal shelter downtown', 120);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.length * 10 <= 120 || !l.includes(' ')));
});
