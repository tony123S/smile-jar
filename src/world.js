// world.js: the monster's world, drawn as one SVG that comes back to life as the monster grows.
// tier 0 = a grey world without smiles, 1 = first glowing lights, 2 = flowers and grass,
// 3 = trees, sun and stars, 4 = colourful sky and a rainbow, 5 = the full magical world.
// Pure function, no images or network, so it works offline and in tests.

const SKY = [
  ['#aeadb8', '#d9d8de'],
  ['#9e97c0', '#ddd6e8'],
  ['#bcd3f6', '#fbe4ee'],
  ['#97cbff', '#ffe0ea'],
  ['#ffc6dc', '#c9e6ff'],
  ['#ffb8d6', '#bfe4ff'],
];
const HILL_BACK = ['#b2b1b8', '#b8b2c8', '#bfe8c6', '#b3e6c0', '#b6ecd0', '#b9f0d4'];
const HILL_FRONT = ['#a3a2a9', '#aaa4b9', '#a3dcb0', '#97d9a8', '#9ee3b4', '#a6eabc'];
const CLOUD = ['#98979f', '#b7b2c7', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];

function rnd(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const f1 = (n) => Number(n.toFixed(1));

function cloud(x, y, s, fill, cls) {
  return `<g class="${cls}" opacity="${fill === '#ffffff' ? 0.95 : 0.8}"><ellipse cx="${x}" cy="${y}" rx="${44 * s}" ry="${18 * s}" fill="${fill}"/><circle cx="${f1(x - 18 * s)}" cy="${f1(y - 10 * s)}" r="${f1(18 * s)}" fill="${fill}"/><circle cx="${f1(x + 12 * s)}" cy="${f1(y - 16 * s)}" r="${f1(23 * s)}" fill="${fill}"/></g>`;
}

function starShape(x, y, r, fill, cls = '') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${f1(x + rr * Math.cos(a))},${f1(y + rr * Math.sin(a))}`);
  }
  return `<polygon class="${cls}" points="${pts.join(' ')}" fill="${fill}"/>`;
}

function flower(x, y, h, petal, alive) {
  if (!alive) {
    // wilted: drooping grey stem and a hanging head
    return `<path d="M${x} ${y} q2 ${-h * 0.7} ${h * 0.35} ${-h * 0.8}" fill="none" stroke="#8f8e96" stroke-width="3" stroke-linecap="round"/><circle cx="${f1(x + h * 0.38)}" cy="${f1(y - h * 0.68)}" r="5" fill="#a2a1a8"/>`;
  }
  let p = `<g class="w-bloom" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y} v${-h}" stroke="#5fae6e" stroke-width="3" stroke-linecap="round"/><path d="M${x} ${f1(y - h * 0.45)} q10 -8 14 2 q-8 6 -14 -2" fill="#7cc98a"/>`;
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5;
    p += `<circle cx="${f1(x + Math.cos(a) * 6)}" cy="${f1(y - h + Math.sin(a) * 6)}" r="5.5" fill="${petal}"/>`;
  }
  return `${p}<circle cx="${x}" cy="${y - h}" r="4" fill="#fff3b0"/></g>`;
}

function tree(x, y, s, crown) {
  return `<g class="w-sway" style="transform-origin:${x}px ${y}px"><rect x="${f1(x - 7 * s)}" y="${f1(y - 60 * s)}" width="${f1(14 * s)}" height="${f1(60 * s)}" rx="6" fill="#c99a7a"/><circle cx="${x}" cy="${f1(y - 78 * s)}" r="${f1(34 * s)}" fill="${crown}"/><circle cx="${f1(x - 24 * s)}" cy="${f1(y - 60 * s)}" r="${f1(22 * s)}" fill="${crown}"/><circle cx="${f1(x + 24 * s)}" cy="${f1(y - 62 * s)}" r="${f1(24 * s)}" fill="${crown}"/><circle cx="${f1(x - 10 * s)}" cy="${f1(y - 88 * s)}" r="${f1(8 * s)}" fill="#fff" opacity=".35"/></g>`;
}

function mushroomHouse(x, y, cap) {
  return `<g><rect x="${x - 16}" y="${y - 34}" width="32" height="34" rx="10" fill="#fff6e6" stroke="#8a6f9e" stroke-width="2"/><rect x="${x - 6}" y="${y - 18}" width="12" height="18" rx="6" fill="#c99a7a"/><path d="M${x - 32} ${y - 32} q32 -46 64 0 z" fill="${cap}" stroke="#8a6f9e" stroke-width="2"/><circle cx="${x - 12}" cy="${y - 44}" r="4" fill="#fff"/><circle cx="${x + 10}" cy="${y - 50}" r="5" fill="#fff"/></g>`;
}

/**
 * @param {object} o
 * @param {number} o.tier     0..5, see top of file
 * @param {boolean} [o.spark] draw the glowing spark of happiness (story scene 3)
 * @param {string} [o.uid]    unique id prefix for gradients
 */
export function worldSvg({ tier = 0, spark = false, uid = 'w' } = {}) {
  const t = Math.max(0, Math.min(5, Math.round(tier)));
  const r = rnd(7);
  const [skyTop, skyBottom] = SKY[t];
  const parts = [];
  parts.push(`<defs>
    <linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBottom}"/></linearGradient>
    <radialGradient id="${uid}-glow"><stop offset="0" stop-color="#fff7b0" stop-opacity="1"/><stop offset="1" stop-color="#fff7b0" stop-opacity="0"/></radialGradient>
  </defs>`);
  parts.push(`<rect width="800" height="450" fill="url(#${uid}-sky)"/>`);

  // stars: dim and grey until tier 3, then twinkling gold
  for (let i = 0; i < 14; i++) {
    const x = 30 + r() * 740, y = 20 + r() * 130;
    parts.push(t >= 3 ? starShape(f1(x), f1(y), 4 + r() * 4, '#fff2a0', 'w-twinkle') : `<circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="#ecebf0" opacity="${t ? 0.5 : 0.3}"/>`);
  }
  // sun: a pale disc that warms up
  parts.push(`<circle cx="650" cy="88" r="${t >= 3 ? 46 : 38}" fill="${t >= 3 ? '#ffe58a' : t === 2 ? '#fff1c8' : '#e7e6ea'}" opacity="${t >= 3 ? 1 : 0.7}"/>`);
  if (t >= 3) parts.push(`<circle cx="650" cy="88" r="80" fill="url(#${uid}-glow)" opacity=".55" class="w-pulse"/>`);
  // rainbow
  if (t >= 4) {
    const cols = ['#ffb3c9', '#ffd7a8', '#fff3a0', '#c9f2c7', '#bfe2ff', '#dccbff'];
    cols.forEach((c, i) => parts.push(`<path d="M120 330 a${280 - i * 14} ${210 - i * 14} 0 0 1 ${2 * (280 - i * 14)} 0" fill="none" stroke="${c}" stroke-width="14" opacity=".75"/>`));
  }
  // clouds drift slowly
  parts.push(cloud(140, 80, 1, CLOUD[t], 'w-cloud'));
  parts.push(cloud(420, 54, 0.8, CLOUD[t], 'w-cloud slow'));
  parts.push(cloud(720, 150, 0.7, CLOUD[t], 'w-cloud'));
  if (t === 0) parts.push(cloud(300, 120, 1.1, '#8c8b93', 'w-cloud slow'));

  // hills
  parts.push(`<path d="M0 300 q120 -70 260 -20 t300 -10 t240 10 v170 h-800 z" fill="${HILL_BACK[t]}"/>`);
  if (t >= 3) {
    parts.push(tree(110, 300, 0.85, '#9ee0b0'));
    parts.push(tree(700, 296, 1, '#ffc6dc'));
    parts.push(tree(560, 300, 0.7, '#b9ecc9'));
  }
  if (t >= 5) {
    parts.push(mushroomHouse(230, 300, '#ff9fb8'));
    parts.push(mushroomHouse(470, 296, '#bfa8ff'));
  }
  parts.push(`<path d="M0 340 q160 -40 330 -6 t280 0 t190 -10 v126 h-800 z" fill="${HILL_FRONT[t]}"/>`);

  // grass tufts from tier 2
  if (t >= 2) {
    for (let i = 0; i < 18; i++) {
      const x = f1(20 + i * 44 + r() * 20), y = f1(360 + r() * 70);
      parts.push(`<path d="M${x} ${y} l-4 -12 M${x} ${y} l0 -15 M${x} ${y} l5 -12" stroke="#6fbf7e" stroke-width="2.5" stroke-linecap="round"/>`);
    }
  }
  // flowers: wilted until tier 2, then more bloom each level
  const petals = ['#ffb3c9', '#ffe27a', '#bfe2ff', '#dccbff', '#ffd3b5'];
  const nFlowers = t <= 1 ? 7 : 5 + (t - 2) * 5;
  for (let i = 0; i < nFlowers; i++) {
    const x = f1(30 + ((i * 97) % 740) + r() * 20), y = f1(375 + ((i * 37) % 60));
    parts.push(flower(x, y, 22 + r() * 14, petals[i % petals.length], t >= 2));
  }
  // first glowing lights (tier 1+), more each level
  if (t >= 1) {
    const n = 4 + t * 3;
    for (let i = 0; i < n; i++) {
      const x = f1(40 + r() * 720), y = f1(170 + r() * 200);
      parts.push(`<g class="w-firefly" style="animation-delay:${f1(r() * 4)}s"><circle cx="${x}" cy="${y}" r="12" fill="url(#${uid}-glow)"/><circle cx="${x}" cy="${y}" r="2.6" fill="#fffbe0"/></g>`);
    }
  }
  // floating hearts in the full world
  if (t >= 5) {
    for (let i = 0; i < 6; i++) {
      const x = f1(80 + i * 120 + r() * 30), y = f1(200 + r() * 60);
      parts.push(`<path class="w-float" style="animation-delay:${i * 0.7}s" d="M${x} ${y + 6} l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5 z" fill="#ff9fb8" opacity=".85"/>`);
    }
  }
  if (spark) {
    parts.push(`<g class="w-spark"><circle cx="470" cy="250" r="60" fill="url(#${uid}-glow)"/><path d="M470 266 l-16 -16 a10 10 0 0 1 16 -12 a10 10 0 0 1 16 12 z" fill="#ff8fb1" stroke="#fff" stroke-width="2"/></g>`);
  }
  return `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" class="world-svg tier-${t}" aria-hidden="true">${parts.join('')}</svg>`;
}
