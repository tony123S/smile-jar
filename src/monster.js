// monster.js: the Smile Monster. Pure functions only, so it can be tested and drawn both in the
// app and on the Smile Receipt (all styling is inline SVG attributes).
//
// Growth comes from qualifying smiles. Appearance comes from *what* made you smile (its "diet"),
// so every monster ends up different. Live mirroring (face, blink, breathing, talking) is passed
// in from real SDK signals by the renderer; this module never invents a signal.
//
// The monster is the same round, squishy character at every level. It just grows up: a bit of
// eggshell on its head as a baby, a sprout when it wakes, little arms, sparkle wings, then a
// flower crown. Stage keys are kept from earlier versions so old saves still load.

export const STAGES = Object.freeze([
  { key: 'egg', label: 'Baby', chapter: 'The First Smile', at: 0, mood: 'shy' },
  { key: 'blob', label: 'Sleepyhead', chapter: 'The Awakening', at: 3, mood: 'sleepy' },
  { key: 'hatchling', label: 'Joyling', chapter: 'The Power of Joy', at: 8, mood: 'happy' },
  { key: 'sprite', label: 'Sparkler', chapter: 'Spread the Happiness', at: 15, mood: 'playful' },
  { key: 'final', label: 'Smile Monster', chapter: 'The World of Smiles', at: 25, mood: 'proud' },
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
  return { index: i, level: i + 1, ...STAGES[i], next, toNext: next ? next.at - smiles : 0, progress: Math.max(0, Math.min(1, progress)) };
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
    stone: tier(monster?.pokerSessions || 0),
    patches: sponsors.filter((s) => (s.snackSmiles || 0) > 0).slice(0, 5).map((s) => s.color || '#c792ea'),
  };
}

const ADJ = { 'Pun': 'Giggly', 'Animal fact': 'Fluffy', 'Memory': 'Glowy', 'Picture this': 'Dreamy', 'Sponsor snack': 'Sweetie' };
const NOUN = { 'Pun': 'Puffhorn', 'Animal fact': 'Furbun', 'Memory': 'Glimmer', 'Picture this': 'Starbean', 'Sponsor snack': 'Snackling' };

export function monsterName(traits, stageKey) {
  if (!traits.dominant) return stageKey === 'egg' ? 'Little Mochi' : 'Mochi';
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
  if (live.face === 'grin') return 'grin';
  if (live.talking) return live.talkOpen ? 'talk-open' : 'talk';
  return STAGES.find((s) => s.key === stageKey)?.mood || 'happy';
}

function eyes({ cx, cy, gap, rx, ry, expr, closed, body }) {
  if (expr === 'sleepy' && !closed) {
    return `<g class="m-eyes">${[-gap, gap].map((dx) => `<path d="M${f1(cx + dx - rx)} ${f1(cy - 1)} q${f1(rx)} ${f1(ry * 0.9)} ${f1(rx * 2)} 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`).join('')}</g>`;
  }
  if (closed || expr === 'proud') {
    // happy closed eyes: little upside-down arcs
    return `<g class="m-eyes">${[-gap, gap].map((dx) => `<path d="M${f1(cx + dx - rx)} ${f1(cy + 2)} q${f1(rx)} ${f1(-ry * 1.1)} ${f1(rx * 2)} 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`).join('')}</g>`;
  }
  const big = expr === 'wow' ? 1.25 : 1;
  const erx = rx * big, ery = ry * big;
  let out = '';
  for (const dx of [-gap, gap]) {
    const x = cx + dx;
    out += `<ellipse cx="${f1(x)}" cy="${f1(cy)}" rx="${f1(erx)}" ry="${f1(ery)}" fill="${INK}"/>`;
    out += `<ellipse cx="${f1(x - erx * 0.32)}" cy="${f1(cy - ery * 0.38)}" rx="${f1(erx * 0.36)}" ry="${f1(ery * 0.32)}" fill="#fff"/>`;
    out += `<circle cx="${f1(x + erx * 0.35)}" cy="${f1(cy + ery * 0.35)}" r="${f1(Math.max(1.5, erx * 0.16))}" fill="#fff" opacity="0.9"/>`;
  }
  return `<g class="m-eyes">${out}</g>`;
}

function mouth({ cx, cy, expr, s }) {
  const w = 7 * s;
  switch (expr) {
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

/**
 * Draw the monster.
 * @param {object} o
 * @param {string} o.stage      'egg' | 'blob' | 'hatchling' | 'sprite' | 'final'
 * @param {object} o.traits     from traitsFor()
 * @param {object} [o.live]     { face: 'flat'|'grin'|'wow', eyesClosed, breath: 0..1 | null, talking, talkOpen }
 * @param {boolean} [o.standalone] add xmlns/size for use as an image
 * @param {boolean} [o.backdrop]   draw a soft pastel circle behind it (receipt)
 */
export function monsterSvg({ stage, traits, live = {}, standalone = false, backdrop = false, uid = 'm' }) {
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
  const traitScale = lvl >= 2 ? 0.55 + 0.15 * (lvl - 2) : 0; // diet traits show from Joyling up
  const head = standalone ? 'xmlns="http://www.w3.org/2000/svg" width="240" height="240"' : '';

  let back = '';
  if (backdrop) back += `<circle cx="120" cy="124" r="112" fill="#fff0f6"/><circle cx="120" cy="124" r="96" fill="#f3edff"/>`;
  back += `<ellipse cx="${cx}" cy="${floor + 2}" rx="${f1(rx * 0.85)}" ry="${f1(7 * s + 2)}" fill="#7a6aa8" opacity="0.16"/>`;
  // aura: memories make it glow; the final form always shines a little
  const glow = Math.max(t.glow && traitScale ? t.glow : 0, lvl === 4 ? 1 : 0);
  if (glow) back += `<circle cx="${cx}" cy="${f1(cy)}" r="${f1(rx + 14 + glow * 7)}" fill="#fff3a8" opacity="${f1(0.18 + glow * 0.1)}"/>`;

  // sparkle wings from Sparkler up
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
  const armUp = expr === 'grin' || expr === 'proud';
  for (const side of [-1, 1]) {
    const ax = cx + side * rx * 0.94, ay = cy + ry * 0.15;
    const rot = side * (armUp ? -50 : 20);
    b += `<ellipse cx="${f1(ax)}" cy="${f1(ay)}" rx="${f1(9 * s)}" ry="${f1(15 * s)}" fill="${body}" stroke="${INK}" stroke-width="2.6" transform="rotate(${rot} ${f1(ax)} ${f1(ay - 8 * s)})"/>`;
  }

  // face
  const ey = cy - ry * 0.12;
  const erx = (9.5 + t.bigEyes * 1.2) * s * 1.15, ery = (11.5 + t.bigEyes * 1.3) * s * 1.15;
  const blushOn = expr === 'grin' || expr === 'shy' || expr === 'proud' || expr === 'playful';
  b += `<ellipse cx="${f1(cx - rx * 0.52)}" cy="${f1(ey + ery + 5 * s)}" rx="${f1(11 * s)}" ry="${f1(6.5 * s)}" fill="${BLUSH}" opacity="${blushOn ? 0.75 : 0.45}"/>`;
  b += `<ellipse cx="${f1(cx + rx * 0.52)}" cy="${f1(ey + ery + 5 * s)}" rx="${f1(11 * s)}" ry="${f1(6.5 * s)}" fill="${BLUSH}" opacity="${blushOn ? 0.75 : 0.45}"/>`;
  b += eyes({ cx, cy: ey, gap: rx * 0.34, rx: erx, ry: ery, expr, closed: !!live.eyesClosed, body });
  b += mouth({ cx, cy: ey + ery + 9 * s, expr, s });

  // growing-up accessories, same character every level
  if (key === 'egg') {
    // a little eggshell cap from hatching
    b += `<path d="M${f1(cx - rx * 0.62)} ${f1(cy - ry * 0.66)} q${f1(rx * 0.62)} ${f1(-ry * 0.72)} ${f1(rx * 1.24)} 0 l${f1(-rx * 0.2)} ${f1(ry * 0.14)} l${f1(-rx * 0.2)} ${f1(-ry * 0.14)} l${f1(-rx * 0.22)} ${f1(ry * 0.16)} l${f1(-rx * 0.22)} ${f1(-ry * 0.16)} l${f1(-rx * 0.2)} ${f1(ry * 0.14)} z" fill="#fffaf0" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
  } else if (key === 'blob' || key === 'hatchling') {
    // a sprout that gets a bud as it grows
    const top = cy - ry;
    b += `<path d="M${cx} ${f1(top + 2)} q-2 ${f1(-14 * s)} ${f1(4 * s)} ${f1(-22 * s)}" fill="none" stroke="#5fae6e" stroke-width="3" stroke-linecap="round"/>`;
    b += `<path d="M${f1(cx + 3 * s)} ${f1(top - 16 * s)} q${f1(14 * s)} ${f1(-10 * s)} ${f1(20 * s)} ${f1(2 * s)} q${f1(-12 * s)} ${f1(6 * s)} ${f1(-20 * s)} ${f1(-2 * s)} z" fill="#9ee0a8" stroke="${INK}" stroke-width="2"/>`;
    if (key === 'hatchling') b += `<circle cx="${f1(cx + 4 * s)}" cy="${f1(top - 24 * s)}" r="${f1(6 * s)}" fill="#ffb3c9" stroke="${INK}" stroke-width="2"/>`;
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
  if (expr === 'grin') g += star(cx + rx * 0.95, cy - ry * 0.85, 7, '#ffe27a', `stroke="${INK}" stroke-width="1.2"`) + star(cx - rx * 1.0, cy - ry * 0.7, 5, '#ffb3c9', `stroke="${INK}" stroke-width="1.2"`);

  return `<svg ${head} viewBox="0 0 240 240" class="monster-svg" role="img" aria-label="Smile Monster, level ${lvl + 1}">
    ${back}<g id="${uid}-body">${g}</g>
  </svg>`;
}
