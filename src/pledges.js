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
  const { lines, total } = pledgeFor(campaign.sponsors, totalSmiles);
  const rows = [
    ['Smile Jar pledge statement'],
    ['Cause', campaign.cause],
    ['Total smiles', totalSmiles],
    ['Total pledged', formatCents(total)],
    [],
    ['Sponsor', 'Cents per smile', 'Cap', 'Owes'],
    ...campaign.sponsors.map((s) => {
      const l = lines.find((x) => x.id === s.id);
      return [s.name, s.centsPerSmile, s.capCents ? formatCents(s.capCents) : 'none', formatCents(l ? l.cents : 0)];
    }),
    [],
    ['Session ended', 'Smiles', 'Minutes'],
    ...sessions.map((s) => [new Date(s.endedAt).toISOString(), s.smiles, (s.durationMs / 60000).toFixed(1)]),
  ];
  return toCsv(rows);
}
