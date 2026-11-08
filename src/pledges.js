// pledges.js: pure pledge math. Amounts are integer cents to avoid float drift.

export function sponsorOwes(sponsor, smiles) {
  const rate = Math.max(0, Math.round(Number(sponsor.centsPerSmile) || 0));
  const raw = rate * Math.max(0, smiles | 0);
  const cap = Number(sponsor.capCents);
  return Number.isFinite(cap) && cap > 0 ? Math.min(raw, Math.round(cap)) : raw;
}

/** Total pledged for `smiles` given each sponsor's cap, and the per-sponsor breakdown. */
export function pledgeFor(sponsors, smiles) {
  const lines = (sponsors || []).map((s) => ({ id: s.id, name: s.name, cents: sponsorOwes(s, smiles) }));
  return { total: lines.reduce((a, l) => a + l.cents, 0), lines };
}

/** Cents the next smile is worth, ignoring sponsors whose cap is already reached. */
export function marginalRate(sponsors, smiles) {
  return (sponsors || []).reduce((a, s) => a + (sponsorOwes(s, smiles + 1) - sponsorOwes(s, smiles)), 0);
}

/**
 * Sponsor caps apply across the whole campaign, so a session's pledge is the
 * difference between the campaign total after and before it.
 */
export function sessionPledge(sponsors, smilesBefore, sessionSmiles) {
  return pledgeFor(sponsors, smilesBefore + sessionSmiles).total - pledgeFor(sponsors, smilesBefore).total;
}

/** Donations the user has marked as actually made. Pledges are promises; these are confirmed. */
export function confirmedTotal(sponsors) {
  return (sponsors || []).reduce((a, s) => a + Math.max(0, Math.round(Number(s.confirmedCents) || 0)), 0);
}

/** Per sponsor: pledged so far, confirmed donated, and still to confirm. */
export function pledgeLedger(sponsors, smiles) {
  return (sponsors || []).map((s) => {
    const pledged = sponsorOwes(s, smiles);
    const confirmed = Math.max(0, Math.round(Number(s.confirmedCents) || 0));
    return { id: s.id, name: s.name, pledged, confirmed, outstanding: Math.max(0, pledged - confirmed), snackSmiles: s.snackSmiles || 0 };
  });
}

export function formatCents(cents) {
  const n = Math.round(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/** Pledge statement a user can send to sponsors: one line per sponsor plus the session log. */
export function pledgeStatementCsv(campaign, sessions) {
  const totalSmiles = sessions.reduce((a, s) => a + s.smiles, 0);
  const { total } = pledgeFor(campaign.sponsors, totalSmiles);
  const ledger = pledgeLedger(campaign.sponsors, totalSmiles);
  const rows = [
    ['Smile Jar pledge statement'],
    ['Note', 'Pledged amounts are promises tracked by Smile Jar. Smile Jar does not process payments. Please donate directly to the charity.'],
    ['Cause', campaign.cause],
    ['Total qualifying smiles', totalSmiles],
    ['Total pledged', formatCents(total)],
    ['Confirmed donated (recorded by the user)', formatCents(confirmedTotal(campaign.sponsors))],
    [],
    ['Sponsor', 'Cents per smile', 'Cap', 'Pledged', 'Confirmed donated', 'Still to donate', 'Smiles from their snack jokes'],
    ...campaign.sponsors.map((s) => {
      const l = ledger.find((x) => x.id === s.id);
      return [s.name, s.centsPerSmile, s.capCents ? formatCents(s.capCents) : 'none', formatCents(l.pledged), formatCents(l.confirmed), formatCents(l.outstanding), l.snackSmiles];
    }),
    [],
    ['Session ended', 'Smiles', 'Minutes'],
    ...sessions.map((s) => [new Date(s.endedAt).toISOString(), s.smiles, (s.durationMs / 60000).toFixed(1)]),
  ];
  return toCsv(rows);
}
