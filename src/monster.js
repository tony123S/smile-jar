// monster.js: the Smile Monster. Pure functions only, so it can be tested and drawn both in the
// app and on the Smile Receipt (all styling is inline SVG attributes).
//
// Growth comes from qualifying smiles. Appearance comes from *what* made you smile (its "diet"),
// so every monster ends up different. Live mirroring (face, blink, breathing, talking) is passed
// in from real SDK signals by the renderer; this module never invents a signal.
//
// It starts as a Mysterious Egg that glows, wiggles and cracks as you smile, then hatches.
// After that it is the same round, squishy character at every level. It just grows up: a bit of
// eggshell on its head as a baby, a sprout, sparkle wings, then a flower crown. Stage keys are
// kept from earlier versions so old saves still load on the same level.

export const STAGES = Object.freeze([
  { key: 'egg', label: 'Mysterious Egg', chapter: 'The Mysterious Egg', at: 0, mood: 'egg' },
  { key: 'blob', label: 'Baby Monster', chapter: 'The Awakening', at: 3, mood: 'shy' },
  { key: 'hatchling', label: 'Growing Monster', chapter: 'The Power of Joy', at: 8, mood: 'happy' },
  { key: 'sprite', label: 'Happy Monster', chapter: 'Spread the Happiness', at: 15, mood: 'playful' },
  { key: 'final', label: 'Guardian of Joy', chapter: 'The World of Smiles', at: 25, mood: 'proud' },
]);

export const XP_PER_SMILE = 10;

export const DIET_KINDS = Object.freeze(['Pun', 'Animal fact', 'Memory', 'Picture this', 'Sponsor snack']);

export function emptyMonster() {
  return {
    smiles: 0, // qualifying smiles fed to this monster (a new monster starts again from 0)
    bornAt: null,
    diet: Object.fromEntries(DIET_KINDS.map((k) => [k, 0])),
    snackBy: {}, // sponsor id -> smiles their snack joke earned for this monster
    surprises: 0,
  };
}

/** Which stage a monster with `smiles` qualifying smiles is in, and progress to the next one. */
export function stageFor(smiles) {
  let i = 0;
  for (let j = 0; j < STAGES.length; j++) if (smiles >= STAGES[j].at) i = j;
  const next = STAGES[i + 1] || null;
  const from = STAGES[i].at;
  const progress = next ? (smiles - from) / (next.at - from) : 1;
  return { index: i, level: i + 1, ...STAGES[i], next, toNext: next ? next.at - smiles : 0, progress: Math.max(0, Math.min(1, progress)) };
}

/**
 * How the egg looks before it hatches: each smile adds a crack, and it starts to shake when
 * it is one smile away. `happiness` (0..1) is what the happiness bar shows.
 */
export function eggState(smiles) {
  const hatchAt = STAGES[1].at;
  const n = Math.max(0, Math.min(hatchAt, smiles || 0));
  return {
    hatched: n >= hatchAt,
    cracks: Math.min(3, Math.floor((n / hatchAt) * 3)),
    shake: n >= hatchAt - 1,
    happiness: n / hatchAt,
    toHatch: hatchAt - n,
  };
}

/** XP is just qualifying smiles x 10, so a smile can never be rewarded twice. */
export function xpFor(smiles) {
  const st = stageFor(smiles);
  const xp = smiles * XP_PER_SMILE;
  const from = st.at * XP_PER_SMILE;
  const to = st.next ? st.next.at * XP_PER_SMILE : null;
  return { xp, level: st.level, intoLevel: xp - from, levelSize: to == null ? null : to - from, toNext: to == null ? 0 : to - xp };
}

/** How restored the world is: 0 grey, 1 first lights ... 5 fully alive. */
export function worldTier(smiles) {
  return smiles <= 0 ? 0 : stageFor(smiles).level;
}

export function tier(n) {
  return n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
}

const BODY_COLOURS = {
  'Pun': '#b9ecc9', // mint
  'Animal fact': '#ffd3b5', // peach
  'Memory': '#ffc6dc', // baby pink
  'Picture this': '#bfe2ff', // sky blue
  'Sponsor snack': '#dccbff', // lavender
};
const DEFAULT_BODY = '#d9ccff';

/** Derive visible traits from the monster's diet. */
export function traitsFor(monster, sponsors = []) {
  const d = monster?.diet || {};
  const ranked = DIET_KINDS.map((k) => [k, d[k] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return {
    dominant: ranked[0]?.[0] || null,
    second: ranked[1]?.[0] || null,
    body: BODY_COLOURS[ranked[0]?.[0]] || DEFAULT_BODY,
    horns: tier(d['Pun'] || 0),
    fur: tier(d['Animal fact'] || 0),
    glow: tier(d['Memory'] || 0),
    stars: tier(d['Picture this'] || 0),
    bigEyes: tier(monster?.surprises || 0),
    // Soft speckles from an earlier game mode. No longer earned, but monsters that have them keep them.
    stone: tier(monster?.pokerSessions || 0),
    patches: sponsors.filter((s) => (s.snackSmiles || 0) > 0).slice(0, 5).map((s) => s.color || '#c792ea'),
  };
}

const ADJ = { 'Pun': 'Giggly', 'Animal fact': 'Fluffy', 'Memory': 'Glowy', 'Picture this': 'Dreamy', 'Sponsor snack': 'Sweetie' };
const NOUN = { 'Pun': 'Puffhorn', 'Animal fact': 'Furbun', 'Memory': 'Glimmer', 'Picture this': 'Starbean', 'Sponsor snack': 'Snackling' };

export function monsterName(traits, stageKey) {
  if (!traits.dominant) return stageKey === 'egg' || stageKey === 'blob' ? 'Little Mochi' : 'Mochi';
  const adj = traits.stone >= 2 ? 'Steady' : ADJ[traits.dominant];
  const noun = NOUN[traits.second || traits.dominant];
  return `${adj} ${noun}`;
}

function darker(hex, f = 0.82) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

const INK = '#4a3b5c'; // soft plum instead of black keeps it friendly
const BLUSH = '#ff9fb8';
const f1 = (n) => Number(n.toFixed(1));

function star(x, y, r, fill, extra = '') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.48 : r;
    pts.push(`${f1(x + rr * Math.cos(a))},${f1(y + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke-linejoin="round" ${extra}/>`;
}

function heart(x, y, s, fill, stroke = INK) {
  return `<path d="M${f1(x)} ${f1(y + 5 * s)} l${f1(-6 * s)} ${f1(-6 * s)} a${f1(3.6 * s)} ${f1(3.6 * s)} 0 0 1 ${f1(6 * s)} ${f1(-4.4 * s)} a${f1(3.6 * s)} ${f1(3.6 * s)} 0 0 1 ${f1(6 * s)} ${f1(4.4 * s)} z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>`;
}

/** The facial expression to draw: live signals win, otherwise the level's personality. */
export function faceFor(stageKey, live = {}) {
  if (live.face === 'wow') return 'wow';
  if (live.face === 'extra') return 'extra';
  if (live.face === 'grin') return 'grin';
  if (live.talking) return live.talkOpen ? 'talk-open' : 'talk';
  if (live.face === 'soft') return 'happy'; // easing back to calm after a smile
  if (live.sleeping) return 'sleepy';
  return STAGES.find((s) => s.key === stageKey)?.mood || 'happy';
}

function eyes({ cx, cy, gap, rx, ry, expr, closed, wink, look = 0 }) {
  if (expr === 'sleepy' && !closed) {
    return `<g class="m-eyes">${[-gap, gap].map((dx) => `<path d="M${f1(cx + dx - rx)} ${f1(cy - 1)} q${f1(rx)} ${f1(ry * 0.9)} ${f1(rx * 2)} 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`).join('')}</g>`;
  }
  if (closed || expr === 'proud' || expr === 'extra') {
    // happy closed eyes: little upside-down arcs
    return `<g class="m-eyes">${[-gap, gap].map((dx) => `<path d="M${f1(cx + dx - rx)} ${f1(cy + 2)} q${f1(rx)} ${f1(-ry * 1.1)} ${f1(rx * 2)} 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`).join('')}</g>`;
  }
  const big = expr === 'wow' ? 1.25 : 1;
  const erx = rx * big, ery = ry * big;
  let out = '';
  for (const dx of [-gap, gap]) {
    const x = cx + dx + look * rx * 0.35; // its eyes look the way it's walking
    if (wink && dx > 0) {
      // a wink back: the right eye closes in a happy arc
      out += `<path d="M${f1(x - rx)} ${f1(cy + 2)} q${f1(rx)} ${f1(-ry * 1.1)} ${f1(rx * 2)} 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
      continue;
    }
    out += `<ellipse cx="${f1(x)}" cy="${f1(cy)}" rx="${f1(erx)}" ry="${f1(ery)}" fill="${INK}"/>`;
    out += `<ellipse cx="${f1(x - erx * 0.32)}" cy="${f1(cy - ery * 0.38)}" rx="${f1(erx * 0.36)}" ry="${f1(ery * 0.32)}" fill="#fff"/>`;
    out += `<circle cx="${f1(x + erx * 0.35)}" cy="${f1(cy + ery * 0.35)}" r="${f1(Math.max(1.5, erx * 0.16))}" fill="#fff" opacity="0.9"/>`;
  }
  return `<g class="m-eyes">${out}</g>`;
}

function mouth({ cx, cy, expr, s }) {
  const w = 7 * s;
  switch (expr) {
    case 'extra':
      return mouth({ cx, cy, expr: 'grin', s: s * 1.2 });
    case 'grin':
      return `<path d="M${f1(cx - w * 1.6)} ${f1(cy - 1)} q${f1(w * 1.6)} ${f1(w * 2.6)} ${f1(w * 3.2)} 0 z" fill="${INK}"/><path d="M${f1(cx - w * 0.8)} ${f1(cy + w * 1.05)} q${f1(w * 0.8)} ${f1(w * 0.6)} ${f1(w * 1.6)} 0" fill="#ff8aa6"/>`;
    case 'wow':
      return `<ellipse cx="${f1(cx)}" cy="${f1(cy + w * 0.5)}" rx="${f1(w * 0.6)}" ry="${f1(w * 0.8)}" fill="${INK}"/>`;
    case 'talk-open':
      return `<ellipse cx="${f1(cx)}" cy="${f1(cy + w * 0.3)}" rx="${f1(w * 0.75)}" ry="${f1(w * 0.55)}" fill="${INK}"/>`;
    case 'talk':
      return `<path d="M${f1(cx - w * 0.6)} ${f1(cy + 1)} h${f1(w * 1.2)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'sleepy':
      return `<ellipse cx="${f1(cx)}" cy="${f1(cy + 2)}" rx="${f1(w * 0.32)}" ry="${f1(w * 0.28)}" fill="${INK}"/>`;
    case 'shy':
      // tiny "w" cat mouth
      return `<path d="M${f1(cx - w * 0.8)} ${f1(cy)} q${f1(w * 0.4)} ${f1(w * 0.6)} ${f1(w * 0.8)} 0 q${f1(w * 0.4)} ${f1(w * 0.6)} ${f1(w * 0.8)} 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'playful':
      return `<path d="M${f1(cx - w)} ${f1(cy)} q${f1(w)} ${f1(w * 1.2)} ${f1(w * 2)} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M${f1(cx + w * 0.1)} ${f1(cy + w * 0.45)} q${f1(w * 0.35)} ${f1(w * 0.9)} ${f1(w * 0.7)} 0" fill="#ff8aa6" stroke="${INK}" stroke-width="1.6"/>`;
    case 'proud':
      return `<path d="M${f1(cx - w * 1.1)} ${f1(cy)} q${f1(w * 1.1)} ${f1(w * 1.7)} ${f1(w * 2.2)} 0 z" fill="${INK}"/>`;
    default: // happy
      return `<path d="M${f1(cx - w * 0.8)} ${f1(cy)} q${f1(w * 0.8)} ${f1(w)} ${f1(w * 1.6)} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

const SIZE = { egg: 0.6, blob: 0.72, hatchling: 0.84, sprite: 0.94, final: 1.04 };

const EGG_PATH = 'M120 96 C150 96 170 150 170 178 C170 206 148 222 120 222 C92 222 70 206 70 178 C70 150 90 96 120 96 Z';
const CRACKS = [
  'M71 166 l14 -6 l7 9 l12 -8 l6 7',
  'M169 158 l-13 6 l-6 -8 l-11 9 l-7 -6',
  'M86 190 l12 -7 l9 8 l12 -9 l11 8 l12 -8 l13 6',
];

/** The Mysterious Egg. Live signals still apply: it glows when you smile, and once it has
 *  cracked open a little, two eyes peek out and blink with you. */
function eggSvg({ traits, live, egg, uid, expr, sy }) {
  const spot = traits.body || DEFAULT_BODY;
  const glee = live.face === 'grin' || live.face === 'extra';
  const cracks = egg?.cracks || 0;
  let back = `<ellipse cx="120" cy="224" rx="46" ry="7" fill="#7a6aa8" opacity="0.16"/>`;
  back += `<radialGradient id="${uid}-glow"><stop offset="0.55" stop-color="#fff3a8" stop-opacity="${glee ? 0.85 : 0.5}"/><stop offset="1" stop-color="#fff3a8" stop-opacity="0"/></radialGradient>`;
  back += `<ellipse cx="120" cy="158" rx="${glee ? 82 : 70}" ry="${glee ? 82 : 72}" fill="url(#${uid}-glow)"/>`;
  let b = `<clipPath id="${uid}-egg"><path d="${EGG_PATH}"/></clipPath>`;
  b += `<path d="${EGG_PATH}" fill="#fffaf0"/>`;
  b += `<g clip-path="url(#${uid}-egg)">`;
  for (const [x, y, r] of [[98, 132, 11], [142, 122, 8], [150, 172, 13], [92, 186, 9], [124, 206, 10], [118, 150, 6]]) {
    b += `<circle cx="${x}" cy="${y}" r="${r}" fill="${spot}"/>`;
  }
  b += `<path d="M70 196 q25 -12 50 0 t50 0 v30 h-100 z" fill="${spot}" opacity="0.55"/></g>`;
  b += `<path d="${EGG_PATH}" fill="none" stroke="${INK}" stroke-width="3.2"/>`;
  b += `<ellipse cx="100" cy="124" rx="9" ry="16" fill="#fff" opacity="0.8" transform="rotate(24 100 124)"/>`;
  for (let i = 0; i < cracks; i++) b += `<path d="${CRACKS[i]}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (cracks >= 2) {
    // a little opening, with two eyes peeking out (they mirror your blinks)
    b += `<path d="M98 160 q22 -12 44 0 q-22 14 -44 0 z" fill="#3b2f4f" stroke="${INK}" stroke-width="2.4"/>`;
    const big = expr === 'wow' ? 1.35 : 1;
    b += `<g class="m-eyes">${[110, 130].map((x) => (live.eyesClosed || (live.wink && x === 130)
      ? `<path d="M${x - 4} 161 h8" stroke="#fff7a8" stroke-width="2.4" stroke-linecap="round"/>`
      : `<ellipse cx="${x}" cy="160" rx="${f1(3.6 * big)}" ry="${f1(4.4 * big)}" fill="#fff7a8"/><circle cx="${x - 1}" cy="158.5" r="1.3" fill="#fff"/>`)).join('')}</g>`;
  }
  let fx = '';
  if (glee) fx += star(172, 104, 7, '#ffe27a', `stroke="${INK}" stroke-width="1.2"`) + star(64, 124, 5, '#ffb3c9', `stroke="${INK}" stroke-width="1.2"`) + heart(178, 150, 0.9, '#ffb3c9');
  if (live.face === 'extra') fx += heart(66, 168, 1, '#ff9fc0') + heart(120, 86, 0.8, '#ffb3c9') + star(176, 196, 6, '#fff3a0', `stroke="${INK}" stroke-width="1.2"`);
  if (egg?.hatching) fx += star(120, 84, 9, '#fff3a0', `stroke="${INK}" stroke-width="1.2"`);
  return `${back}<g class="egg-body"><g transform="translate(120 222) scale(1 ${sy.toFixed(3)}) translate(-120 -222)">${b}</g>${fx}</g>`;
}

/**
 * Draw the monster.
 * @param {object} o
 * @param {string} o.stage      'egg' | 'blob' | 'hatchling' | 'sprite' | 'final'
 * @param {object} o.traits     from traitsFor()
 * @param {object} [o.live]     { face: 'flat'|'grin'|'wow', eyesClosed, breath: 0..1 | null, talking, talkOpen }
 * @param {boolean} [o.standalone] add xmlns/size for use as an image
 * @param {boolean} [o.backdrop]   draw a soft pastel circle behind it (receipt)
 * @param {object} [o.egg]      eggState() for the egg stage ({ cracks, hatching })
 */
export function monsterSvg({ stage, traits, live = {}, standalone = false, backdrop = false, uid = 'm', egg = null }) {
  const t = traits;
  const key = SIZE[stage] ? stage : 'egg';
  const s = SIZE[key];
  const lvl = STAGES.findIndex((x) => x.key === key);
  const expr = faceFor(key, live);
  const breath = typeof live.breath === 'number' ? live.breath : null;
  const sy = breath == null ? 1 : 0.95 + breath * 0.1; // body rises and falls with the real breathing trace
  const cx = 120, floor = 222;
  const rx = 74 * s, ry = 64 * s;
  const cy = floor - 10 * s - ry;
  const body = t.body || DEFAULT_BODY;
  const shade = darker(body);
  const traitScale = lvl >= 2 ? 0.55 + 0.15 * (lvl - 2) : 0; // diet traits show from Growing Monster up
  const head = standalone ? 'xmlns="http://www.w3.org/2000/svg" width="240" height="240"' : '';
  if (key === 'egg') {
    const pad = backdrop ? `<circle cx="120" cy="124" r="112" fill="#fff0f6"/><circle cx="120" cy="124" r="96" fill="#f3edff"/>` : '';
    return `<svg ${head} viewBox="0 0 240 240" class="monster-svg egg-svg" role="img" aria-label="Smile Monster, a mysterious egg">
    ${pad}<g id="${uid}-body">${eggSvg({ traits: t, live, egg, uid, expr, sy })}</g>
  </svg>`;
  }

  let back = '';
  if (backdrop) back += `<circle cx="120" cy="124" r="112" fill="#fff0f6"/><circle cx="120" cy="124" r="96" fill="#f3edff"/>`;
  back += `<ellipse cx="${cx}" cy="${floor + 2}" rx="${f1(rx * 0.85)}" ry="${f1(7 * s + 2)}" fill="#7a6aa8" opacity="0.16"/>`;
  // aura: memories make it glow; the final form always shines a little
  const glow = Math.max(t.glow && traitScale ? t.glow : 0, lvl === 4 ? 1 : 0);
  if (glow) back += `<circle cx="${cx}" cy="${f1(cy)}" r="${f1(rx + 14 + glow * 7)}" fill="#fff3a8" opacity="${f1(0.18 + glow * 0.1)}"/>`;

  // sparkle wings from Happy Monster up
  if (lvl >= 3) {
    for (const side of [-1, 1]) {
      const wx = cx + side * rx * 0.92, wy = cy - ry * 0.15;
      back += `<path d="M${f1(wx)} ${f1(wy)} q${f1(side * 28 * s)} ${f1(-38 * s)} ${f1(side * 40 * s)} ${f1(-10 * s)} q${f1(side * -5 * s)} ${f1(24 * s)} ${f1(side * -40 * s)} ${f1(22 * s)} z" fill="#e9f6ff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" opacity="0.95"/>`;
      back += star(wx + side * 25 * s, wy - 13 * s, 4.5 * s, '#ffe27a');
    }
  }

  let g = '';
  // fluffy ears (animal facts)
  if (t.fur && traitScale) {
    const e = (16 + t.fur * 4) * traitScale * s;
    for (const side of [-1, 1]) {
      const ex = cx + side * rx * 0.55, ey = cy - ry * 0.78;
      g += `<path d="M${f1(ex - side * e * 0.7)} ${f1(ey + e * 0.5)} q${f1(side * e * 0.1)} ${f1(-e * 1.6)} ${f1(side * e * 1.2)} ${f1(-e * 0.9)} q${f1(side * e * 0.1)} ${f1(e * 0.9)} ${f1(-side * e * 0.2)} ${f1(e * 1.4)} z" fill="${body}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`;
      g += `<path d="M${f1(ex - side * e * 0.35)} ${f1(ey + e * 0.25)} q${f1(side * e * 0.1)} ${f1(-e * 0.9)} ${f1(side * e * 0.75)} ${f1(-e * 0.55)}" fill="none" stroke="${BLUSH}" stroke-width="${f1(3 * s)}" stroke-linecap="round"/>`;
    }
  }
  // tiny rounded horns (puns)
  if (t.horns && traitScale) {
    const n = Math.min(3, t.horns);
    const xs = n === 1 ? [0] : n === 2 ? [-0.3, 0.3] : [-0.36, 0, 0.36];
    for (const k of xs) {
      const hx = cx + k * rx, hy = cy - ry * (k === 0 ? 0.98 : 0.9), hh = (13 + t.horns * 4) * s * (0.6 + traitScale * 0.5);
      g += `<path d="M${f1(hx - 7 * s)} ${f1(hy + 4)} q${f1(7 * s)} ${f1(-hh * 2)} ${f1(14 * s)} 0 z" fill="#fff6d6" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
    }
  }

  // tiny feet
  for (const side of [-1, 1]) g += `<ellipse cx="${f1(cx + side * rx * 0.42)}" cy="${f1(floor - 4 * s)}" rx="${f1(15 * s)}" ry="${f1(8 * s)}" fill="${shade}" stroke="${INK}" stroke-width="2.6"/>`;

  // body (breathing scales it from the floor up)
  let b = `<ellipse cx="${cx}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${body}" stroke="${INK}" stroke-width="3.2"/>`;
  b += `<ellipse cx="${f1(cx - rx * 0.38)}" cy="${f1(cy - ry * 0.52)}" rx="${f1(rx * 0.22)}" ry="${f1(ry * 0.12)}" fill="#fff" opacity="0.6" transform="rotate(-24 ${f1(cx - rx * 0.38)} ${f1(cy - ry * 0.52)})"/>`;
  b += `<ellipse cx="${cx}" cy="${f1(cy + ry * 0.42)}" rx="${f1(rx * 0.5)}" ry="${f1(ry * 0.36)}" fill="#fff" opacity="0.4"/>`;
  // fluffy tufts along the bottom (animal facts)
  if (t.fur && traitScale) {
    const n = 3 + t.fur * 2;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.18 + (0.64 * i) / (n - 1));
      b += `<circle cx="${f1(cx - Math.cos(a) * rx * 0.96)}" cy="${f1(cy + Math.sin(a) * ry * 0.96)}" r="${f1((5 + t.fur) * s)}" fill="${body}"/>`;
    }
  }
  // freckles: little star freckles from daydreams, soft speckles from straight-face sessions
  if (t.stars && traitScale) for (let i = 0; i < t.stars * 2; i++) b += star(cx + (i % 2 ? 1 : -1) * rx * (0.5 + (i >> 1) * 0.1), cy + ry * (0.05 + (i >> 1) * 0.16), 4.5 * s, '#fff3a0', `stroke="${INK}" stroke-width="1"`);
  if (t.stone && traitScale) {
    for (const side of [-1, 1]) for (let i = 0; i < t.stone; i++) b += `<circle cx="${f1(cx + side * (rx * 0.52 + (i - 1) * 5 * s))}" cy="${f1(cy - ry * 0.12 + 22 * s + (i % 2) * 3 * s)}" r="${f1(1.8 * s)}" fill="${shade}"/>`;
  }
  t.patches.forEach((col, i) => {
    if (!traitScale) return;
    b += heart(cx + (i % 2 ? 1 : -1) * rx * (0.62 - (i >> 1) * 0.08), cy + ry * (0.28 + (i >> 1) * 0.16), s * 1.1, col);
  });

  // tiny arms, waving up when grinning
  const armUp = expr === 'grin' || expr === 'proud' || expr === 'extra';
  for (const side of [-1, 1]) {
    const ax = cx + side * rx * 0.94, ay = cy + ry * 0.15;
    const rot = side * (armUp ? -50 : 20);
    b += `<ellipse cx="${f1(ax)}" cy="${f1(ay)}" rx="${f1(9 * s)}" ry="${f1(15 * s)}" fill="${body}" stroke="${INK}" stroke-width="2.6" transform="rotate(${rot} ${f1(ax)} ${f1(ay - 8 * s)})"/>`;
  }

  // face
  const ey = cy - ry * 0.12;
  const erx = (9.5 + t.bigEyes * 1.2) * s * 1.15, ery = (11.5 + t.bigEyes * 1.3) * s * 1.15;
  const blushOn = expr === 'grin' || expr === 'extra' || expr === 'shy' || expr === 'proud' || expr === 'playful';
  b += `<ellipse cx="${f1(cx - rx * 0.52)}" cy="${f1(ey + ery + 5 * s)}" rx="${f1(11 * s)}" ry="${f1(6.5 * s)}" fill="${BLUSH}" opacity="${blushOn ? 0.75 : 0.45}"/>`;
  b += `<ellipse cx="${f1(cx + rx * 0.52)}" cy="${f1(ey + ery + 5 * s)}" rx="${f1(11 * s)}" ry="${f1(6.5 * s)}" fill="${BLUSH}" opacity="${blushOn ? 0.75 : 0.45}"/>`;
  b += eyes({ cx, cy: ey, gap: rx * 0.34, rx: erx, ry: ery, expr, closed: !!live.eyesClosed, wink: !!live.wink, look: Number(live.look) || 0 });
  b += mouth({ cx, cy: ey + ery + 9 * s, expr, s });

  // growing-up accessories, same character every level
  if (key === 'blob') {
    // a little eggshell cap, it only just hatched
    b += `<path d="M${f1(cx - rx * 0.62)} ${f1(cy - ry * 0.66)} q${f1(rx * 0.62)} ${f1(-ry * 0.72)} ${f1(rx * 1.24)} 0 l${f1(-rx * 0.2)} ${f1(ry * 0.14)} l${f1(-rx * 0.2)} ${f1(-ry * 0.14)} l${f1(-rx * 0.22)} ${f1(ry * 0.16)} l${f1(-rx * 0.22)} ${f1(-ry * 0.16)} l${f1(-rx * 0.2)} ${f1(ry * 0.14)} z" fill="#fffaf0" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
  } else if (key === 'hatchling') {
    // a sprout with a little bud
    const top = cy - ry;
    b += `<path d="M${cx} ${f1(top + 2)} q-2 ${f1(-14 * s)} ${f1(4 * s)} ${f1(-22 * s)}" fill="none" stroke="#5fae6e" stroke-width="3" stroke-linecap="round"/>`;
    b += `<path d="M${f1(cx + 3 * s)} ${f1(top - 16 * s)} q${f1(14 * s)} ${f1(-10 * s)} ${f1(20 * s)} ${f1(2 * s)} q${f1(-12 * s)} ${f1(6 * s)} ${f1(-20 * s)} ${f1(-2 * s)} z" fill="#9ee0a8" stroke="${INK}" stroke-width="2"/>`;
    b += `<circle cx="${f1(cx + 4 * s)}" cy="${f1(top - 24 * s)}" r="${f1(6 * s)}" fill="#ffb3c9" stroke="${INK}" stroke-width="2"/>`;
  } else if (key === 'final') {
    // flower crown
    const top = cy - ry * 0.9;
    const cols = ['#ffb3c9', '#ffe27a', '#bfe2ff', '#c9f2c7', '#dccbff'];
    for (let i = 0; i < 5; i++) {
      const fx = cx + (i - 2) * rx * 0.24, fy = top - Math.abs(i - 2) * -3 * s + 2;
      for (let p = 0; p < 5; p++) {
        const a = (Math.PI * 2 * p) / 5;
        b += `<circle cx="${f1(fx + Math.cos(a) * 5 * s)}" cy="${f1(fy + Math.sin(a) * 5 * s)}" r="${f1(4.2 * s)}" fill="${cols[i]}" stroke="${INK}" stroke-width="1.2"/>`;
      }
      b += `<circle cx="${f1(fx)}" cy="${f1(fy)}" r="${f1(3 * s)}" fill="#fff6d6" stroke="${INK}" stroke-width="1.2"/>`;
    }
  }

  g += `<g transform="translate(${cx} ${floor}) scale(1 ${sy.toFixed(3)}) translate(-${cx} -${floor})">${b}</g>`;
  if (expr === 'sleepy') g += `<text x="${f1(cx + rx * 0.8)}" y="${f1(cy - ry * 0.7)}" font-family="system-ui,sans-serif" font-weight="800" font-size="18" fill="#9a86d6">z</text><text x="${f1(cx + rx * 0.8 + 13)}" y="${f1(cy - ry * 0.7 - 14)}" font-family="system-ui,sans-serif" font-weight="800" font-size="13" fill="#9a86d6">z</text>`;
  if (live.talking) g += `<text x="${f1(cx - rx - 10)}" y="${f1(cy - ry * 0.55)}" font-family="system-ui,sans-serif" font-weight="900" font-size="22" fill="#6fb6f0">♪</text>`;
  if (expr === 'extra') g += heart(cx - rx * 1.05, cy - ry * 0.9, 1.1, '#ffb3c9') + heart(cx + rx * 1.1, cy - ry * 0.2, 0.9, '#ff9fc0') + star(cx + rx * 0.9, cy - ry * 1.05, 8, '#ffe27a', `stroke="${INK}" stroke-width="1.2"`) + star(cx - rx * 1.15, cy - ry * 0.15, 6, '#fff3a0', `stroke="${INK}" stroke-width="1.2"`);
  if (expr === 'grin') g += star(cx + rx * 0.95, cy - ry * 0.85, 7, '#ffe27a', `stroke="${INK}" stroke-width="1.2"`) + star(cx - rx * 1.0, cy - ry * 0.7, 5, '#ffb3c9', `stroke="${INK}" stroke-width="1.2"`);

  return `<svg ${head} viewBox="0 0 240 240" class="monster-svg" role="img" aria-label="Smile Monster, level ${lvl + 1}">
    ${back}<g id="${uid}-body">${g}</g>
  </svg>`;
}
