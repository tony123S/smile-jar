import test from 'node:test';
import assert from 'node:assert/strict';
import { sponsorOwes, pledgeFor, sessionPledge, marginalRate, formatCents, pledgeStatementCsv } from '../src/pledges.js';

const sponsors = [
  { id: 'a', name: 'Grandma', centsPerSmile: 10, capCents: 1000 },
  { id: 'b', name: 'Office, Inc', centsPerSmile: 5, capCents: 0 },
];

test('rate times smiles, respecting caps', () => {
  assert.equal(sponsorOwes(sponsors[0], 50), 500);
  assert.equal(sponsorOwes(sponsors[0], 500), 1000);
  assert.equal(sponsorOwes(sponsors[1], 500), 2500);
  assert.equal(pledgeFor(sponsors, 10).total, 150);
});

test('session pledge accounts for caps reached in earlier sessions', () => {
  assert.equal(sessionPledge(sponsors, 95, 10), 50 + 50);
  assert.equal(sessionPledge(sponsors, 100, 10), 50);
});

test('marginal rate drops when a cap is hit', () => {
  assert.equal(marginalRate(sponsors, 0), 15);
  assert.equal(marginalRate(sponsors, 100), 5);
});

test('formats cents and quotes CSV fields', () => {
  assert.equal(formatCents(1234), '$12.34');
  const csv = pledgeStatementCsv({ cause: 'Food bank', sponsors }, [{ endedAt: '2026-11-06T00:00:00Z', smiles: 12, durationMs: 120000 }]);
  assert.match(csv, /"Office, Inc",5,none,\$0\.60/);
  assert.match(csv, /Total pledged,\$1\.80/);
});
