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

const SCENES = { village: villageSvg };
export const sceneSvg = (levelId) => (SCENES[levelId] || villageSvg)();

/** Things in Momo's way. Drawn on a 120 x 120 box, standing on the bottom edge. */
const THINGS = {
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

const BOSSES = { chicken: chickenSvg };
export const bossSvg = (thing, cheer) => (BOSSES[thing] || chickenSvg)(cheer);
