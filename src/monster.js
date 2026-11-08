// monster.js: the Smile Monster that lives in the jar. Pure functions only, so it can be tested
// and drawn both in the app and on the Smile Receipt (all styling is inline SVG attributes).
//
// Growth comes from qualifying smiles. Appearance comes from *what* made you smile (its "diet"),
// so every monster ends up different. Live mirroring (face, blink, breathing, talking) is passed
// in from real SDK signals by the renderer; this module never invents a signal.

export const STAGES = Object.freeze([
  { key: 'egg', label: 'Egg', at: 0 },
  { key: 'blob', label: 'Sleepy Blob', at: 3 },
  { key: 'hatchling', label: 'Hatchling', at: 10 },
  { key: 'final', label: 'Final Monster', at: 20 },
]);

export const DIET_KINDS = Object.freeze(['Pun', 'Animal fact', 'Memory', 'Picture this', 'Sponsor snack']);

export function emptyMonster() {
  return {
    smiles: 0, // qualifying smiles fed to this monster (a new monster starts again from 0)
    bornAt: null,
    diet: Object.fromEntries(DIET_KINDS.map((k) => [k, 0])),
    snackBy: {}, // sponsor id -> smiles their snack joke earned for this monster
    surprises: 0,
    pokerSessions: 0,
  };
}

/** Which stage a monster with `smiles` qualifying smiles is in, and progress to the next one. */
export function stageFor(smiles) {
  let i = 0;
  for (let j = 0; j < STAGES.length; j++) if (smiles >= STAGES[j].at) i = j;
  const next = STAGES[i + 1] || null;
  const from = STAGES[i].at;
  const progress = next ? (smiles - from) / (next.at - from) : 1;
  return { index: i, ...STAGES[i], next, toNext: next ? next.at - smiles : 0, progress: Math.max(0, Math.min(1, progress)) };
}

export function tier(n) {
  return n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
}

const BODY_COLOURS = {
  'Pun': '#8bd17c',
  'Animal fact': '#f2a65a',
  'Memory': '#f28fb0',
  'Picture this': '#8fa8f2',
  'Sponsor snack': '#c792ea',
};

/** Derive visible traits from the monster's diet. */
export function traitsFor(monster, sponsors = []) {
  const d = monster?.diet || {};
  const ranked = DIET_KINDS.map((k) => [k, d[k] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return {
    dominant: ranked[0]?.[0] || null,
    second: ranked[1]?.[0] || null,
    body: BODY_COLOURS[ranked[0]?.[0]] || '#bfe3d0',
    horns: tier(d['Pun'] || 0),
    fur: tier(d['Animal fact'] || 0),
    glow: tier(d['Memory'] || 0),
    stars: tier(d['Picture this'] || 0),
    bigEyes: tier(monster?.surprises || 0),
    stone: tier(monster?.pokerSessions || 0),
    patches: sponsors.filter((s) => (s.snackSmiles || 0) > 0).slice(0, 5).map((s) => s.color || '#c792ea'),
  };
}

const ADJ = { 'Pun': 'Punny', 'Animal fact': 'Fluffy', 'Memory': 'Glowing', 'Picture this': 'Dreamy', 'Sponsor snack': 'Snack-fed' };
const NOUN = { 'Pun': 'Hornbeast', 'Animal fact': 'Furball', 'Memory': 'Glowmoth', 'Picture this': 'Stargazer', 'Sponsor snack': 'Gobbler' };

export function monsterName(traits, stageKey) {
  if (stageKey === 'egg') return 'Mystery Egg';
  if (!traits.dominant) return stageKey === 'final' ? 'Plain Smilemonster' : 'Little Blob';
  const adj = traits.stone >= 2 ? 'Stony' : ADJ[traits.dominant];
  const noun = NOUN[traits.second || traits.dominant];
  return `${adj} ${noun}`;
}

function darker(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

const INK = '#2b2118';

function eyes({ cx, cy, gap, r, closed, wow }) {
  if (closed) {
    return `<path d="M${cx - gap - r} ${cy} q${r} ${r * 0.8} ${r * 2} 0 M${cx + gap - r} ${cy} q${r} ${r * 0.8} ${r * 2} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const rr = wow ? r + 3 : r;
  return [-gap, gap].map((dx) => `<circle cx="${cx + dx}" cy="${cy}" r="${rr + 3}" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    + `<circle cx="${cx + dx}" cy="${cy + 1}" r="${rr * 0.62}" fill="${INK}"/>`
    + `<circle cx="${cx + dx - rr * 0.25}" cy="${cy - rr * 0.3}" r="${Math.max(1.4, rr * 0.2)}" fill="#fff"/>`).join('');
}

function mouth({ cx, cy, face, w }) {
  if (face === 'grin') return `<path d="M${cx - w} ${cy} h${w * 2} q-2 ${w * 1.3} -${w} ${w * 1.3} q-${w - 2} 0 -${w} -${w * 1.3} z" fill="${INK}"/><path d="M${cx - w * 0.5} ${cy + w * 0.95} q${w * 0.5} ${w * 0.35} ${w} 0" fill="#ef6f5e"/>`;
  if (face === 'wow') return `<ellipse cx="${cx}" cy="${cy + 6}" rx="${w * 0.45}" ry="${w * 0.6}" fill="${INK}"/>`;
  if (face === 'sleep') return `<ellipse cx="${cx}" cy="${cy + 3}" rx="3" ry="2.5" fill="${INK}"/>`;
  return `<path d="M${cx - w * 0.5} ${cy + 4} q${w * 0.5} ${w * 0.25} ${w} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
}

function star(x, y, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

const JAR = 'M46 54 h148 v150 a26 26 0 0 1 -26 26 h-96 a26 26 0 0 1 -26 -26 z';

/**
 * Draw the monster in its jar.
 * @param {object} o
 * @param {string} o.stage      'egg' | 'blob' | 'hatchling' | 'final'
 * @param {object} o.traits     from traitsFor()
 * @param {number} [o.progress] 0..1 progress within the stage (egg cracks)
 * @param {object} [o.live]     { face: 'flat'|'grin'|'wow', eyesClosed, breath: 0..1 | null, talking }
 * @param {boolean} [o.standalone] add xmlns/size for use as an image
 */
export function monsterSvg({ stage, traits, progress = 0, live = {}, standalone = false, uid = 'm' }) {
  const t = traits;
  const face = live.face || 'flat';
  const breath = typeof live.breath === 'number' ? live.breath : null;
  const sy = breath == null ? 1 : 0.95 + breath * 0.1; // belly rises and falls with real breathing
  const cx = 120, floor = 222;
  const parts = [];
  const head = standalone ? 'xmlns="http://www.w3.org/2000/svg" width="240" height="250"' : '';
  const scale = { egg: 1, blob: 0.8, hatchling: 0.9, final: 1.08 }[stage] || 1;
  const traitScale = stage === 'final' ? 1 : stage === 'hatchling' ? 0.6 : 0;

  // environment changes with stage
  const ground = { egg: '#f3d9a0', blob: '#e9dcf5', hatchling: '#cfeec1', final: '#ffe2a8' }[stage];
  parts.push(`<rect x="40" y="196" width="160" height="40" fill="${ground}"/>`);
  if (stage === 'egg') parts.push(`<path d="M70 206 q50 -22 100 0" fill="none" stroke="#c9a25a" stroke-width="4" stroke-linecap="round"/><path d="M64 212 q56 -18 112 0" fill="none" stroke="#b88f45" stroke-width="3" stroke-linecap="round"/>`);
  if (stage === 'final') for (let i = 0; i < 6; i++) parts.push(star(62 + i * 24, 72 + (i % 2) * 14, 4, '#f4a72a'));

  if (stage === 'egg') {
    const wob = face === 'grin' ? -6 : face === 'wow' ? 6 : 0;
    const cracks = Math.floor(progress * 3);
    let egg = `<ellipse cx="${cx}" cy="160" rx="38" ry="48" fill="#fffaf0" stroke="${INK}" stroke-width="3"/>`
      + `<circle cx="104" cy="140" r="6" fill="#f6d6a8"/><circle cx="134" cy="170" r="8" fill="#f6d6a8"/><circle cx="114" cy="182" r="4" fill="#f6d6a8"/>`;
    if (cracks >= 1) egg += `<path d="M98 128 l8 8 l-6 6 l10 8" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (cracks >= 2) egg += `<path d="M140 136 l-7 9 l7 5 l-8 9" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (cracks >= 2 && !live.eyesClosed) egg += `<circle cx="113" cy="152" r="3" fill="${INK}"/><circle cx="127" cy="152" r="3" fill="${INK}"/>`;
    parts.push(`<g transform="rotate(${wob} ${cx} 208) translate(${cx} 208) scale(1 ${sy}) translate(-${cx} -208)">${egg}</g>`);
  } else {
    const rx = 52 * scale, ry = (stage === 'blob' ? 34 : 46) * scale;
    const cy = floor - 18 - ry;
    const body = t.body;
    const shade = darker(body);
    let g = '';
    if (t.glow && traitScale) g += `<circle cx="${cx}" cy="${cy}" r="${rx + 16 + t.glow * 6}" fill="#ffd1e3" opacity="${0.25 + t.glow * 0.12}"/>`;
    // ears (animal facts)
    if (t.fur && traitScale) {
      const e = (14 + t.fur * 4) * traitScale;
      g += `<path d="M${cx - rx * 0.75} ${cy - ry * 0.55} l-${e * 0.4} -${e * 1.4} l${e * 1.3} ${e * 0.7} z" fill="${shade}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
      g += `<path d="M${cx + rx * 0.75} ${cy - ry * 0.55} l${e * 0.4} -${e * 1.4} l-${e * 1.3} ${e * 0.7} z" fill="${shade}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    // horns (puns)
    for (let i = 0; i < Math.round(t.horns * (traitScale ? 1 : 0)); i++) {
      const dx = [-15, 15, 0][i] * scale, hh = (16 + t.horns * 5) * traitScale;
      g += `<path d="M${cx + dx - 8} ${cy - ry + 10} q${8} -${hh * 1.6} ${16} 0 z" fill="#fff3c4" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    // body (breathing scales it from the floor up)
    let b = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${body}" stroke="${INK}" stroke-width="3"/>`;
    if (t.fur && traitScale) {
      for (let i = 0; i < 4 + t.fur * 2; i++) {
        const a = Math.PI * (0.15 + (0.7 * i) / (3 + t.fur * 2));
        b += `<circle cx="${(cx - Math.cos(a) * rx).toFixed(1)}" cy="${(cy + Math.sin(a) * ry * 0.98).toFixed(1)}" r="${5 * traitScale + 2}" fill="${body}" stroke="${INK}" stroke-width="2"/>`;
      }
    }
    b += `<ellipse cx="${cx}" cy="${cy + ry * 0.35}" rx="${rx * 0.55}" ry="${ry * 0.45}" fill="#fff" opacity="0.35"/>`;
    if (t.stone && traitScale) for (let i = 0; i < t.stone + 1; i++) b += `<rect x="${cx - 16 + (i % 2) * 14}" y="${cy + ry * 0.15 + i * 9}" width="18" height="8" rx="3" fill="#a9a39b" stroke="${INK}" stroke-width="1.5"/>`;
    if (t.stars && traitScale) for (let i = 0; i < t.stars * 2; i++) b += star(cx - rx * 0.6 + (i * 23) % (rx * 1.2), cy - ry * 0.1 + ((i * 17) % 20) - 4, 5 * traitScale + 2, '#fff6a8');
    t.patches.forEach((col, i) => {
      if (!traitScale) return;
      const px = cx + rx * (i % 2 ? 0.55 : -0.6), py = cy + ry * (0.05 + (i * 0.18));
      b += `<path d="M${px} ${py + 5} l-6 -6 a3.5 3.5 0 0 1 6 -4 a3.5 3.5 0 0 1 6 4 z" fill="${col}" stroke="${INK}" stroke-width="1.5"/>`;
    });
    if (stage === 'hatchling') b += `<path d="M${cx - 30} ${cy - ry + 8} l10 -12 l10 10 l10 -12 l10 12 l10 -10 l10 12 z" fill="#fffaf0" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    // feet
    if (stage !== 'blob') g += `<ellipse cx="${cx - rx * 0.45}" cy="${floor - 14}" rx="14" ry="7" fill="${shade}" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${cx + rx * 0.45}" cy="${floor - 14}" rx="14" ry="7" fill="${shade}" stroke="${INK}" stroke-width="2.5"/>`;
    // face
    const sleepy = stage === 'blob' && face !== 'grin' && face !== 'wow' && !live.talking;
    const er = 5 + t.bigEyes * 1.6 * (traitScale || 0.5);
    const ey = cy - ry * 0.2;
    b += eyes({ cx, cy: ey, gap: rx * 0.36, r: er, closed: !!live.eyesClosed || sleepy, wow: face === 'wow' });
    b += mouth({ cx, cy: ey + er + 10, face: sleepy ? 'sleep' : face, w: 14 * scale });
    if (face === 'grin') b += `<ellipse cx="${cx - rx * 0.6}" cy="${ey + er + 8}" rx="7" ry="4" fill="#ef6f5e" opacity=".45"/><ellipse cx="${cx + rx * 0.6}" cy="${ey + er + 8}" rx="7" ry="4" fill="#ef6f5e" opacity=".45"/>`;
    g += `<g transform="translate(${cx} ${floor - 16}) scale(1 ${sy.toFixed(3)}) translate(-${cx} -${floor - 16})">${b}</g>`;
    if (sleepy) g += `<text x="${cx + rx * 0.7}" y="${cy - ry - 4}" font-family="system-ui,sans-serif" font-weight="800" font-size="18" fill="#7b4cd8">z</text><text x="${cx + rx * 0.7 + 14}" y="${cy - ry - 18}" font-family="system-ui,sans-serif" font-weight="800" font-size="13" fill="#7b4cd8">z</text>`;
    if (live.talking) g += `<text x="${cx - rx + 2}" y="${cy - ry + 6}" font-family="system-ui,sans-serif" font-weight="900" font-size="22" fill="#2f8fd8">?</text>`;
    parts.push(g);
  }

  return `<svg ${head} viewBox="0 0 240 250" role="img" aria-label="Smile Monster, ${stage} stage">
    <defs><clipPath id="${uid}-jar"><path d="${JAR}"/></clipPath></defs>
    <rect x="62" y="16" width="116" height="26" rx="7" fill="#f4a72a" stroke="${INK}" stroke-width="3"/>
    <path d="${JAR}" fill="#fffdf8"/>
    <g clip-path="url(#${uid}-jar)">${parts.join('')}</g>
    <path d="${JAR}" fill="none" stroke="${INK}" stroke-width="3.5"/>
    <path d="M60 70 v60" stroke="#fff" stroke-opacity=".8" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}
