// scenes.js: the drawings for the adventure. Plain SVG strings, made in the app (nothing downloaded).
// Each level starts grey because the Grumpy Shadow stole its laughter; the renderer brings the
// colour back as you clear steps.

const INK = '#4a3b5c';
const f = (n) => Math.round(n * 10) / 10;

function house(x, w, h, wall, roof, door = '#b07a52') {
  const y = 300 - h;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${wall}" stroke="${INK}" stroke-width="3"/>
    <path d="M${x - 12} ${y + 4} L${x + w / 2} ${y - h * 0.55} L${x + w + 12} ${y + 4} Z" fill="${roof}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="${x + w / 2 - 13}" y="${300 - 42}" width="26" height="42" rx="10" fill="${door}" stroke="${INK}" stroke-width="3"/>
    <rect x="${x + 12}" y="${y + 18}" width="22" height="20" rx="4" fill="#fff6c8" stroke="${INK}" stroke-width="2.5"/>
    <rect x="${x + w - 34}" y="${y + 18}" width="22" height="20" rx="4" fill="#fff6c8" stroke="${INK}" stroke-width="2.5"/>
  </g>`;
}

function tree(x, s, leaf) {
  return `<g><rect x="${x - 7 * s}" y="${300 - 60 * s}" width="${14 * s}" height="${60 * s}" rx="5" fill="#a97852" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="${x}" cy="${300 - 78 * s}" r="${34 * s}" fill="${leaf}" stroke="${INK}" stroke-width="3"/>
    <circle cx="${x - 22 * s}" cy="${300 - 62 * s}" r="${20 * s}" fill="${leaf}" stroke="${INK}" stroke-width="3"/></g>`;
}

/** Silent Village: little houses, a well, bunting. */
export function villageSvg() {
  const bunting = Array.from({ length: 14 }, (_, i) => {
    const x = 40 + i * 64, y = 92 + Math.sin((i / 13) * Math.PI) * 26;
    const c = ['#ff9fb2', '#ffd36e', '#9fd4f2', '#a9e3a0'][i % 4];
    return `<path d="M${x} ${f(y)} l18 0 l-9 22 z" fill="${c}" stroke="${INK}" stroke-width="2"/>`;
  }).join('');
  return `<svg viewBox="0 0 960 400" preserveAspectRatio="xMidYMax slice" class="scene-svg" aria-hidden="true">
    <rect width="960" height="400" fill="#bfe6ff"/>
    <circle cx="820" cy="80" r="44" fill="#ffe27a" stroke="${INK}" stroke-width="3"/>
    <g fill="#fff" stroke="${INK}" stroke-width="2.5"><ellipse cx="180" cy="70" rx="56" ry="20"/><ellipse cx="520" cy="54" rx="70" ry="22"/></g>
    <path d="M0 250 Q160 190 320 240 T640 230 T960 240 V400 H0 Z" fill="#a9dd8f" stroke="${INK}" stroke-width="3"/>
    <path d="M20 92 Q480 150 940 92" fill="none" stroke="${INK}" stroke-width="2"/>${bunting}
    ${house(70, 110, 96, '#ffd9c2', '#e9786a')}
    ${tree(250, 1, '#7cc77a')}
    ${house(330, 130, 120, '#fff0b8', '#7b8fe0')}
    ${tree(530, 0.8, '#92d47e')}
    <g><rect x="590" y="248" width="70" height="52" rx="8" fill="#c9c3d8" stroke="${INK}" stroke-width="3"/><path d="M580 248 h90 M598 248 v-50 M652 248 v-50 M588 198 h78" stroke="${INK}" stroke-width="4" fill="none"/></g>
    ${house(720, 120, 104, '#e3d4ff', '#f4a72a')}
    <rect y="300" width="960" height="100" fill="#e9c995" stroke="${INK}" stroke-width="3"/>
    <g class="ground-dashes" stroke="#c99d63" stroke-width="5" stroke-linecap="round">${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 64 + 10} 340 h26"/>`).join('')}</g>
  </svg>`;
}


const dashes = (col) => `<g class="ground-dashes" stroke="${col}" stroke-width="5" stroke-linecap="round">${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 64 + 10} 340 h26"/>`).join('')}</g>`;

/** Crazy Forest: tall wobbly trees, mushrooms, fireflies. */
export function forestSvg() {
  const trees = [[60, 1.5, '#5fae6e'], [220, 1.9, '#7cc77a'], [400, 1.4, '#4f9e62'], [600, 2, '#6bbd70'], [800, 1.6, '#5fae6e'], [930, 1.3, '#7cc77a']].map(([x, sc, c]) => tree(x, sc, c)).join('');
  const shrooms = [[140, '#ef6f5e'], [500, '#f4a72a'], [720, '#e05aa8']].map(([x, c]) => `<g><rect x="${x - 6}" y="282" width="12" height="18" rx="4" fill="#fff6d6" stroke="${INK}" stroke-width="2.5"/><path d="M${x - 20} 284 q20 -26 40 0 z" fill="${c}" stroke="${INK}" stroke-width="2.5"/><circle cx="${x - 6}" cy="276" r="3" fill="#fff"/><circle cx="${x + 7}" cy="279" r="2.5" fill="#fff"/></g>`).join('');
  return `<svg viewBox="0 0 960 400" preserveAspectRatio="xMidYMax slice" class="scene-svg" aria-hidden="true">
    <rect width="960" height="400" fill="#cdeccf"/>
    <path d="M0 230 Q240 170 480 220 T960 210 V400 H0 Z" fill="#9fd89a" stroke="${INK}" stroke-width="3"/>
    ${trees}${shrooms}
    ${[[120, 140], [340, 90], [560, 160], [760, 110], [880, 170]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff59a" opacity=".9"/>`).join('')}
    <rect y="300" width="960" height="100" fill="#b98a5a" stroke="${INK}" stroke-width="3"/>${dashes('#94683f')}
  </svg>`;
}

/** Frozen Mountain: snowy peaks, pine trees, a pale sky. */
export function mountainSvg() {
  const pines = [80, 300, 520, 860].map((x) => `<g><rect x="${x - 5}" y="270" width="10" height="30" fill="#a97852" stroke="${INK}" stroke-width="2"/><path d="M${x - 30} 275 L${x} 200 L${x + 30} 275 Z" fill="#5fae8e" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M${x - 12} 222 L${x} 200 L${x + 12} 222 q-6 6 -12 0 q-6 6 -12 0 z" fill="#fff"/></g>`).join('');
  return `<svg viewBox="0 0 960 400" preserveAspectRatio="xMidYMax slice" class="scene-svg" aria-hidden="true">
    <rect width="960" height="400" fill="#dff1fb"/>
    <path d="M-20 280 L200 80 L380 280 Z M260 280 L520 40 L760 280 Z M640 280 L840 110 L1000 280 Z" fill="#b8cde6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M200 80 l-40 36 l22 -6 l18 14 l18 -14 l22 6 z M520 40 l-46 42 l24 -6 l22 16 l22 -16 l24 6 z M840 110 l-34 30 l18 -4 l16 12 l16 -12 l18 4 z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${pines}
    ${Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 97) % 960}" cy="${(i * 53) % 260 + 10}" r="${2 + (i % 3)}" fill="#fff"/>`).join('')}
    <rect y="300" width="960" height="100" fill="#f4fbff" stroke="${INK}" stroke-width="3"/>${dashes('#cfe3f1')}
  </svg>`;
}

/** Silly Castle: stone walls, banners, windows. */
export function castleSvg() {
  const tower = (x, h) => `<g><rect x="${x}" y="${300 - h}" width="90" height="${h}" fill="#d9d2ea" stroke="${INK}" stroke-width="3"/>${[0, 1, 2].map((k) => `<rect x="${x + k * 34 - 2}" y="${300 - h - 18}" width="24" height="20" fill="#d9d2ea" stroke="${INK}" stroke-width="3"/>`).join('')}<rect x="${x + 32}" y="${300 - h + 30}" width="26" height="36" rx="13" fill="#5a4b7a" stroke="${INK}" stroke-width="2.5"/></g>`;
  const banner = (x, c) => `<path d="M${x} 120 h34 v60 l-17 -12 l-17 12 z" fill="${c}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 960 400" preserveAspectRatio="xMidYMax slice" class="scene-svg" aria-hidden="true">
    <rect width="960" height="400" fill="#efe6ff"/>
    <circle cx="140" cy="80" r="36" fill="#fff6d6" stroke="${INK}" stroke-width="3"/>
    <rect x="0" y="150" width="960" height="150" fill="#c9bfe0" stroke="${INK}" stroke-width="3"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 110} 190 h60 M${i * 110 + 40} 230 h60 M${i * 110} 270 h60" stroke="#ab9fc8" stroke-width="3"/>`).join('')}
    ${tower(40, 200)}${tower(430, 230)}${tower(820, 190)}
    ${banner(250, '#ef6f5e')}${banner(330, '#f4a72a')}${banner(620, '#2f8fd8')}${banner(700, '#e05aa8')}
    <rect y="300" width="960" height="100" fill="#b4a6d0" stroke="${INK}" stroke-width="3"/>
    <rect y="308" width="960" height="26" fill="#ef6f5e" opacity=".8"/>${dashes('#9a8bbf')}
  </svg>`;
}

/** Final Laugh: the Shadow's purple hideout, with jars of stolen laughs. */
export function finaleSvg() {
  const jar = (x, c) => `<g><rect x="${x}" y="226" width="44" height="56" rx="12" fill="#ffffff" fill-opacity=".55" stroke="${INK}" stroke-width="3"/><rect x="${x + 6}" y="216" width="32" height="12" rx="4" fill="#b07a52" stroke="${INK}" stroke-width="2.5"/><circle cx="${x + 22}" cy="256" r="12" fill="${c}"/><path d="M${x + 15} 254 q7 7 14 0" stroke="${INK}" stroke-width="2.4" fill="none"/></g>`;
  return `<svg viewBox="0 0 960 400" preserveAspectRatio="xMidYMax slice" class="scene-svg" aria-hidden="true">
    <rect width="960" height="400" fill="#3d2f5c"/>
    ${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 131) % 960}" cy="${(i * 71) % 200 + 10}" r="${1.5 + (i % 3)}" fill="#fff3a8" opacity=".85"/>`).join('')}
    <circle cx="800" cy="90" r="42" fill="#fff6d6" stroke="${INK}" stroke-width="3"/>
    <path d="M0 240 Q200 160 420 230 T960 220 V400 H0 Z" fill="#6a5596" stroke="${INK}" stroke-width="3"/>
    <rect x="60" y="282" width="840" height="18" rx="6" fill="#8d77b8" stroke="${INK}" stroke-width="3"/>
    ${jar(120, '#ffe27a')}${jar(300, '#ffb3c9')}${jar(520, '#9fd4f2')}${jar(700, '#a9e3a0')}
    <rect y="300" width="960" height="100" fill="#55447a" stroke="${INK}" stroke-width="3"/>${dashes('#6f5c9a')}
  </svg>`;
}

const SCENES = { village: villageSvg, forest: forestSvg, mountain: mountainSvg, castle: castleSvg, finale: finaleSvg };
export const sceneSvg = (levelId) => (SCENES[levelId] || villageSvg)();

/** Things in Momo's way. Drawn on a 120 x 120 box, standing on the bottom edge. */
const THINGS = {
  root: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M4 118 q20 -50 56 -40 q36 10 56 40 z" fill="#a97852"/><path d="M30 96 q14 -10 30 -6 M70 92 q14 2 24 12" fill="none" stroke-width="2.4"/></g>`,
  vines: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round">${[18, 46, 74, 100].map((x, i) => `<path d="M${x} 0 q${i % 2 ? 12 : -12} 30 0 60 q${i % 2 ? -12 : 12} 30 0 58" fill="none" stroke="#3f8e4e" stroke-width="9"/>`).join('')}${[[18, 30], [46, 70], [74, 40], [100, 90]].map(([x, y]) => `<ellipse cx="${x + 9}" cy="${y}" rx="10" ry="6" fill="#7cc77a"/>`).join('')}</g>`,
  mushroom: `<g stroke="${INK}" stroke-width="3"><rect x="46" y="76" width="28" height="42" rx="8" fill="#fff6d6"/><path d="M8 82 q52 -70 104 0 z" fill="#ef6f5e"/><circle cx="40" cy="62" r="7" fill="#fff" stroke="none"/><circle cx="76" cy="58" r="9" fill="#fff" stroke="none"/></g>`,
  log: `<g stroke="${INK}" stroke-width="3"><rect x="6" y="80" width="100" height="38" rx="18" fill="#b98a5a"/><ellipse cx="102" cy="99" rx="14" ry="19" fill="#e9c995"/><path d="M98 99 a5 6 0 1 0 8 0" fill="none" stroke-width="2"/><path d="M30 96 q4 3 8 0 M48 96 q4 3 8 0" fill="none" stroke-width="2.4"/></g>`,
  icegap: `<g stroke="${INK}" stroke-width="3"><path d="M0 104 h34 l8 14 h36 l8 -14 h34 v14 h-120 z" fill="#bfe6ff"/><path d="M42 118 l6 -16 l8 10 l6 -12 l8 12 l8 -8" fill="#5a7fb0"/></g>`,
  snowball: `<g stroke="${INK}" stroke-width="3"><circle cx="60" cy="60" r="26" fill="#fff"/><path d="M48 54 q4 -4 8 0 M64 54 q4 -4 8 0" fill="none" stroke-width="2.4"/><path d="M50 72 q10 -6 20 0" fill="none" stroke-width="2.4"/><path d="M88 52 h22 M90 64 h26 M88 76 h18" stroke="#bfe6ff" stroke-width="4" stroke-linecap="round"/></g>`,
  snowman: `<g stroke="${INK}" stroke-width="3"><circle cx="60" cy="96" r="22" fill="#fff"/><circle cx="60" cy="58" r="16" fill="#fff"/><path d="M60 60 l14 3 l-14 3 z" fill="#f4a72a" stroke-width="2"/><path d="M50 50 l8 3 M70 50 l-8 3" stroke-width="3" stroke-linecap="round"/><rect x="44" y="34" width="32" height="8" fill="#4a3b5c"/><rect x="50" y="18" width="20" height="18" fill="#4a3b5c"/></g>`,
  icicle: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M40 10 h40 l-20 90 z" fill="#d6f0ff"/><path d="M52 20 l6 40" stroke="#fff" stroke-width="4"/></g>`,
  guard: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><rect x="34" y="56" width="52" height="62" rx="14" fill="#7b8fe0"/><circle cx="60" cy="44" r="22" fill="#ffd9c2"/><path d="M36 34 q24 -30 48 0 z" fill="#c9c3d8"/><path d="M50 46 q4 3 8 0 M64 46 q4 3 8 0" fill="none" stroke-width="2.4"/><rect x="90" y="20" width="6" height="98" fill="#b07a52"/><path d="M84 22 l9 -18 l9 18 z" fill="#c9c3d8"/><text class="zz" x="78" y="20" font-family="system-ui,sans-serif" font-weight="800" font-size="16" fill="#9a86d6" stroke="none">z</text><text class="alert" x="52" y="16" font-family="system-ui,sans-serif" font-weight="900" font-size="24" fill="#ef6f5e" stroke="none">!</text></g>`,
  pot: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M34 50 h52 l-8 50 h-36 z" fill="#e9786a"/><rect x="30" y="44" width="60" height="12" rx="4" fill="#d9603f"/><path d="M60 44 q-6 -20 -18 -26 M60 44 q4 -22 18 -28" fill="none" stroke="#5fae6e" stroke-width="4"/><circle cx="42" cy="16" r="8" fill="#ffb3c9"/><circle cx="78" cy="14" r="8" fill="#ffe27a"/></g>`,
  door: `<g stroke="${INK}" stroke-width="3"><path d="M18 118 v-70 q42 -50 84 0 v70 z" fill="#a97852"/><path d="M60 26 v92 M18 70 h84" stroke="#7d5638"/><circle cx="74" cy="82" r="5" fill="#ffe27a"/><rect x="48" y="86" width="24" height="20" rx="4" fill="#c9c3d8"/></g>`,
  bubble: `<g stroke="${INK}" stroke-width="3"><circle cx="60" cy="60" r="34" fill="#c7a4f0" fill-opacity=".55"/><ellipse cx="48" cy="46" rx="8" ry="5" fill="#fff" stroke="none"/><path d="M50 66 q10 -8 20 0" fill="none" stroke-width="2.4"/></g>`,
  rock: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M10 118 l12 -50 l30 -20 l40 10 l18 60 z" fill="#8d86a3"/><path d="M42 82 q4 -4 8 0 M62 82 q4 -4 8 0" fill="none" stroke-width="2.4"/><path d="M48 98 q10 -6 20 0" fill="none" stroke-width="2.4"/></g>`,
  cloud: `<g stroke="${INK}" stroke-width="3"><path d="M20 76 q-4 -26 22 -26 q10 -24 36 -10 q28 -6 26 22 q14 12 -2 24 h-74 q-16 -2 -8 -10 z" fill="#8d86a3"/><path d="M36 92 l-4 12 M60 92 l-4 12 M84 92 l-4 12" stroke="#8fb8e8" stroke-width="4" stroke-linecap="round"/><path d="M46 66 l10 4 M76 66 l-10 4" stroke-linecap="round"/></g>`,
  grump: `<g stroke="${INK}" stroke-width="3"><circle cx="60" cy="60" r="24" fill="#4a3b5c"/><path d="M46 52 l10 5 M74 52 l-10 5" stroke="#fff" stroke-linecap="round"/><path d="M50 72 q10 -6 20 0" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M86 50 h22 M88 62 h26 M86 74 h18" stroke="#8d77b8" stroke-width="4" stroke-linecap="round"/></g>`,
  fence: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><rect x="14" y="70" width="92" height="12" rx="3" fill="#d9a066"/><rect x="14" y="94" width="92" height="12" rx="3" fill="#d9a066"/>${[20, 50, 80].map((x) => `<path d="M${x} 118 v-62 l10 -12 l10 12 v62 z" fill="#f0c088"/>`).join('')}</g>`,
  puddle: `<g stroke="${INK}" stroke-width="3"><ellipse cx="60" cy="106" rx="54" ry="13" fill="#8fb8e8"/><ellipse cx="44" cy="103" rx="14" ry="4" fill="#d6ecff" stroke="none"/><path d="M48 104 q4 -6 8 0 M64 104 q4 -6 8 0" fill="none" stroke-width="2.4"/><path d="M50 112 q10 -6 20 0" fill="none" stroke-width="2.4"/></g>`,
  cat: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><ellipse cx="62" cy="100" rx="40" ry="18" fill="#f2b880"/><circle cx="30" cy="88" r="17" fill="#f2b880"/><path d="M18 78 l4 -14 l9 10 M34 72 l8 -10 l3 14" fill="#f2b880"/><path d="M22 88 q4 3 8 0 M33 88 q4 3 8 0" fill="none" stroke-width="2.4"/><path d="M100 100 q18 -4 12 -22" fill="none" stroke-width="6" stroke="#f2b880"/><path d="M100 100 q18 -4 12 -22" fill="none" stroke-width="2.4"/><text x="58" y="66" font-family="system-ui,sans-serif" font-weight="800" font-size="18" fill="#9a86d6" stroke="none">z</text></g>`,
  hay: `<g stroke="${INK}" stroke-width="3"><rect x="10" y="52" width="100" height="66" rx="14" fill="#f4d06f"/><path d="M22 66 h76 M22 84 h76 M22 102 h76" stroke="#c9a03f" stroke-width="3"/><path d="M40 52 v66 M80 52 v66" stroke="#b6552f" stroke-width="5"/></g>`,
  sign: `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><rect x="54" y="60" width="12" height="58" fill="#b07a52"/><rect x="12" y="22" width="96" height="44" rx="6" fill="#fff6d6"/><text x="60" y="51" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="17" fill="#d24c4c" stroke="none">NO FUN</text></g>`,
};

export function thingSvg(thing) {
  const body = THINGS[thing] || THINGS.fence;
  return `<svg viewBox="0 0 120 120" class="thing-svg" aria-hidden="true">${body}</svg>`;
}

/**
 * The Grumpy Chicken. `cheer` goes from 0 (very grumpy) to 1 (laughing its head off).
 * It sits on a hay bale, which is what Momo bounces on.
 */
export function chickenSvg(cheer = 0) {
  const c = Math.max(0, Math.min(1, cheer));
  const brow = f(8 - c * 12); // angry brows slope down, then lift
  const mouth = c >= 1
    ? `<path d="M88 92 q12 14 24 0 z" fill="#ff8a5c" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><text x="132" y="44" font-family="system-ui,sans-serif" font-weight="900" font-size="18" fill="#ef6f5e">HA!</text>`
    : c > 0.3
      ? `<path d="M90 92 l10 -6 l10 6 l-10 6 z" fill="#ffb347" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`
      : `<path d="M90 90 l10 -4 l10 4 l-10 8 z" fill="#ffb347" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const cloud = c < 0.5 ? `<g opacity="${f(1 - c * 2)}"><ellipse cx="100" cy="18" rx="30" ry="12" fill="#8d86a3" stroke="${INK}" stroke-width="2.4"/><path d="M88 32 l-4 10 M100 32 l-4 10 M112 32 l-4 10" stroke="#8fb8e8" stroke-width="3" stroke-linecap="round"/></g>` : '';
  return `<svg viewBox="0 0 200 220" class="boss-svg" aria-hidden="true">
    <rect x="30" y="150" width="140" height="66" rx="16" fill="#f4d06f" stroke="${INK}" stroke-width="3"/>
    <path d="M44 168 h112 M44 186 h112 M44 204 h112" stroke="#c9a03f" stroke-width="3"/>
    ${cloud}
    <path d="M70 150 q-34 -10 -26 -50 q20 18 30 10" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="100" cy="112" rx="50" ry="44" fill="#fff" stroke="${INK}" stroke-width="3.2"/>
    <path d="M86 58 q6 -16 14 -4 q6 -16 14 0 q8 -10 10 6" fill="#ef6f5e" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="86" cy="80" r="6" fill="${INK}"/><circle cx="114" cy="80" r="6" fill="${INK}"/>
    <path d="M76 ${f(70 + brow / 2)} L94 ${f(70 - brow / 2)} M106 ${f(70 - brow / 2)} L124 ${f(70 + brow / 2)}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    ${mouth}
    <path d="M100 100 q-4 10 -2 16" fill="none" stroke="#ef6f5e" stroke-width="5" stroke-linecap="round"/>
    <path d="M144 112 q18 -8 16 14 q-10 -4 -16 4" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${c > 0.3 ? `<ellipse cx="74" cy="96" rx="9" ry="5" fill="#ffb3c9" opacity="${f(c)}"/><ellipse cx="126" cy="96" rx="9" ry="5" fill="#ffb3c9" opacity="${f(c)}"/>` : ''}
  </svg>`;
}

const face = (cx, cy, c, k = 1) => {
  const brow = f((8 - c * 12) * k);
  const mouth = c >= 1
    ? `<path d="M${cx - 14 * k} ${cy + 14 * k} q${14 * k} ${18 * k} ${28 * k} 0 z" fill="#ff8a9a" stroke="${INK}" stroke-width="2.6"/>`
    : c > 0.3 ? `<path d="M${cx - 10 * k} ${cy + 16 * k} q${10 * k} ${8 * k} ${20 * k} 0" fill="none" stroke="${INK}" stroke-width="3"/>`
      : `<path d="M${cx - 10 * k} ${cy + 20 * k} q${10 * k} ${-8 * k} ${20 * k} 0" fill="none" stroke="${INK}" stroke-width="3"/>`;
  return `<circle cx="${cx - 13 * k}" cy="${cy}" r="${5 * k}" fill="${INK}"/><circle cx="${cx + 13 * k}" cy="${cy}" r="${5 * k}" fill="${INK}"/>
    <path d="M${cx - 22 * k} ${f(cy - 10 * k + brow / 2)} L${cx - 6 * k} ${f(cy - 10 * k - brow / 2)} M${cx + 6 * k} ${f(cy - 10 * k - brow / 2)} L${cx + 22 * k} ${f(cy - 10 * k + brow / 2)}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    ${mouth}${c > 0.3 ? `<ellipse cx="${cx - 24 * k}" cy="${cy + 12 * k}" rx="${8 * k}" ry="${4 * k}" fill="#ffb3c9" opacity="${f(c)}"/><ellipse cx="${cx + 24 * k}" cy="${cy + 12 * k}" rx="${8 * k}" ry="${4 * k}" fill="#ffb3c9" opacity="${f(c)}"/>` : ''}
    ${c >= 1 ? `<text x="${cx + 30 * k}" y="${cy - 30 * k}" font-family="system-ui,sans-serif" font-weight="900" font-size="18" fill="#ef6f5e">HA!</text>` : ''}`;
};
const rainCloud = (x, c) => (c < 0.5 ? `<g opacity="${f(1 - c * 2)}"><ellipse cx="${x}" cy="18" rx="30" ry="12" fill="#8d86a3" stroke="${INK}" stroke-width="2.4"/><path d="M${x - 12} 32 l-4 10 M${x} 32 l-4 10 M${x + 12} 32 l-4 10" stroke="#8fb8e8" stroke-width="3" stroke-linecap="round"/></g>` : '');

export function treeBossSvg(cheer = 0) {
  const c = Math.max(0, Math.min(1, cheer));
  const sway = f(c * 14);
  return `<svg viewBox="0 0 200 220" class="boss-svg" aria-hidden="true">
    <rect x="76" y="110" width="48" height="106" rx="14" fill="#a97852" stroke="${INK}" stroke-width="3"/>
    <path d="M76 140 q-30 ${-10 - sway} -46 ${-30 - sway} M124 140 q30 ${-10 + sway} 46 ${-30 + sway}" fill="none" stroke="#a97852" stroke-width="12" stroke-linecap="round"/>
    <path d="M76 140 q-30 ${-10 - sway} -46 ${-30 - sway} M124 140 q30 ${-10 + sway} 46 ${-30 + sway}" fill="none" stroke="${INK}" stroke-width="2"/>
    <circle cx="100" cy="76" r="58" fill="${c > 0.5 ? '#7cc77a' : '#8fa88f'}" stroke="${INK}" stroke-width="3"/>
    <circle cx="56" cy="96" r="26" fill="${c > 0.5 ? '#6bbd70' : '#85a085'}" stroke="${INK}" stroke-width="3"/><circle cx="146" cy="96" r="26" fill="${c > 0.5 ? '#6bbd70' : '#85a085'}" stroke="${INK}" stroke-width="3"/>
    ${face(100, 160, c)}
    ${c > 0.3 ? `<circle cx="70" cy="50" r="6" fill="#ffb3c9" stroke="${INK}" stroke-width="1.5"/><circle cx="130" cy="44" r="6" fill="#ffe27a" stroke="${INK}" stroke-width="1.5"/>` : ''}
    ${rainCloud(150, c)}
  </svg>`;
}

export function penguinSvg(cheer = 0) {
  const c = Math.max(0, Math.min(1, cheer));
  return `<svg viewBox="0 0 200 220" class="boss-svg" aria-hidden="true">
    <rect x="30" y="176" width="140" height="40" rx="10" fill="#d6f0ff" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="100" cy="116" rx="56" ry="66" fill="#3d4a6a" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="100" cy="128" rx="38" ry="50" fill="#fff"/>
    <path d="M46 110 q-24 ${f(20 - c * 40)} -14 ${f(44 - c * 40)} M154 110 q24 ${f(20 - c * 40)} 14 ${f(44 - c * 40)}" stroke="#3d4a6a" stroke-width="14" stroke-linecap="round" fill="none"/>
    <circle cx="86" cy="86" r="6" fill="${INK}"/><circle cx="114" cy="86" r="6" fill="${INK}"/>
    <path d="M74 ${f(76 + (8 - c * 12) / 2)} L94 ${f(76 - (8 - c * 12) / 2)} M106 ${f(76 - (8 - c * 12) / 2)} L126 ${f(76 + (8 - c * 12) / 2)}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M90 98 l10 ${c >= 1 ? 14 : 8} l10 ${c >= 1 ? -14 : -8} z" fill="#f4a72a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M80 182 h16 M104 182 h16" stroke="#f4a72a" stroke-width="8" stroke-linecap="round"/>
    ${c > 0.3 ? `<ellipse cx="72" cy="104" rx="8" ry="4" fill="#ffb3c9" opacity="${f(c)}"/><ellipse cx="128" cy="104" rx="8" ry="4" fill="#ffb3c9" opacity="${f(c)}"/>` : ''}
    ${c >= 1 ? `<text x="140" y="44" font-family="system-ui,sans-serif" font-weight="900" font-size="18" fill="#ef6f5e">HA!</text>` : ''}
    ${rainCloud(100, c)}
  </svg>`;
}

export function ghostSvg(cheer = 0) {
  const c = Math.max(0, Math.min(1, cheer));
  return `<svg viewBox="0 0 200 220" class="boss-svg" aria-hidden="true">
    <path d="M30 200 v-90 q0 -80 70 -80 q70 0 70 80 v90 l-17 -14 l-18 14 l-17 -14 l-18 14 l-17 -14 l-18 14 l-17 -14 z" fill="#f4f0ff" fill-opacity="${f(0.95 - c * 0.3)}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30 120 q-22 ${f(10 - c * 30)} -14 ${f(-10 - c * 30)} M170 120 q22 ${f(10 - c * 30)} 14 ${f(-10 - c * 30)}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${face(100, 96, c, 1.2)}
    ${c < 1 ? `<circle cx="170" cy="60" r="14" fill="#c7a4f0" fill-opacity=".5" stroke="${INK}" stroke-width="2"/><circle cx="184" cy="34" r="8" fill="#c7a4f0" fill-opacity=".5" stroke="${INK}" stroke-width="2"/>` : ''}
    ${rainCloud(60, c)}
  </svg>`;
}

export function shadowSvg(cheer = 0) {
  const c = Math.max(0, Math.min(1, cheer));
  const laughs = Math.round(c * 4);
  return `<svg viewBox="0 0 200 220" class="boss-svg" aria-hidden="true">
    <path d="M24 214 q-6 -90 30 -140 q20 -40 46 -40 q26 0 46 40 q36 50 30 140 z" fill="${c >= 1 ? '#8d77b8' : '#2b2140'}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M60 50 l-10 -26 l22 16 M140 50 l10 -26 l-22 16" fill="${c >= 1 ? '#8d77b8' : '#2b2140'}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <g>
      <circle cx="84" cy="96" r="8" fill="#fff3a8"/><circle cx="116" cy="96" r="8" fill="#fff3a8"/>
      <path d="M70 ${f(82 + (8 - c * 12) / 2)} L92 ${f(82 - (8 - c * 12) / 2)} M108 ${f(82 - (8 - c * 12) / 2)} L130 ${f(82 + (8 - c * 12) / 2)}" stroke="#fff3a8" stroke-width="4" stroke-linecap="round"/>
      ${c >= 1 ? `<path d="M80 118 q20 26 40 0 z" fill="#ff8a9a" stroke="#fff3a8" stroke-width="2.6"/>` : c > 0.3 ? `<path d="M84 122 q16 10 32 0" fill="none" stroke="#fff3a8" stroke-width="3"/>` : `<path d="M84 126 q16 -10 32 0" fill="none" stroke="#fff3a8" stroke-width="3"/>`}
    </g>
    ${Array.from({ length: laughs }, (_, i) => `<text x="${20 + i * 44}" y="${30 + (i % 2) * 18}" font-family="system-ui,sans-serif" font-weight="900" font-size="16" fill="${['#ffe27a', '#ffb3c9', '#9fd4f2', '#a9e3a0'][i]}">ha!</text>`).join('')}
  </svg>`;
}

const BOSSES = { chicken: chickenSvg, tree: treeBossSvg, penguin: penguinSvg, ghost: ghostSvg, shadow: shadowSvg };
export const bossSvg = (thing, cheer) => (BOSSES[thing] || chickenSvg)(cheer);
