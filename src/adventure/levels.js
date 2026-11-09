// levels.js: the five levels of the Laughing Kingdom, as data. The engine plays them.
//
// A step is one thing Momo has to get past. `need` is the action it takes:
//   'jump'  smile          'magic' look surprised
//   'dodge' blink          'sneak' keep a straight face
// A boss is a few steps in a row with its own lines, and nobody gets hurt: bosses get
// tickled, cheered up or made to laugh.

export const LEVELS = [
  {
    id: 'village',
    n: 1,
    name: 'Silent Village',
    colour: '#f7c873',
    mission: 'The Grumpy Shadow stole every laugh in the Silent Village. Smile to make Momo jump over everything in the way, then cheer up the Grumpy Chicken.',
    teaches: ['jump'],
    intro: [
      "Hi! I'm Momo. This village used to giggle all day. Now? Not a single chuckle.",
      'Your smile is my jump button. Smile and I hop. Easy!',
    ],
    steps: [
      { need: 'jump', thing: 'fence', label: 'a wobbly fence', win: 'Boing! Over the fence!' },
      { need: 'jump', thing: 'puddle', label: 'a grumpy puddle', win: 'Not even a splash. Nice!' },
      { need: 'jump', thing: 'cat', label: 'a sleeping cat', win: 'Shh. The cat didn’t even wake up.' },
      { need: 'jump', thing: 'hay', label: 'a big hay bale', win: 'I’m basically a kangaroo now.' },
      { need: 'jump', thing: 'sign', label: 'a "NO FUN" sign', win: 'No fun? Not on my watch!' },
    ],
    boss: {
      name: 'Grumpy Chicken',
      thing: 'chicken',
      intro: 'Uh oh. The Grumpy Chicken hasn’t laughed in a hundred years. Smile so I can bounce on its hay bale!',
      steps: [
        { need: 'jump', label: 'bounce 1', win: 'Bounce! It’s trying not to smile...' },
        { need: 'jump', label: 'bounce 2', win: 'Bounce! Was that a giggle?' },
        { need: 'jump', label: 'bounce 3', win: 'BAWK-HA-HA! The chicken is laughing!' },
      ],
      outro: 'The Grumpy Chicken is laughing so hard it laid a golden egg. The village is giggling again!',
    },
  },
  {
    id: 'forest',
    n: 2,
    name: 'Crazy Forest',
    colour: '#7cc77a',
    mission: 'Vines block the Crazy Forest. Smile to jump the roots, look surprised to zap the vines with magic, and dance with the Dancing Tree.',
    teaches: ['jump', 'magic'],
    boss: { name: 'Dancing Tree', thing: 'tree' },
  },
  {
    id: 'mountain',
    n: 3,
    name: 'Frozen Mountain',
    colour: '#9fd4f2',
    mission: 'Snowballs everywhere! Blink to dodge them, smile to jump the ice, and melt the Ice Penguin’s frown.',
    teaches: ['jump', 'dodge'],
    boss: { name: 'Ice Penguin', thing: 'penguin' },
  },
  {
    id: 'castle',
    n: 4,
    name: 'Silly Castle',
    colour: '#c7a4f0',
    mission: 'Guards are napping in the Silly Castle. Keep a straight face to sneak past, then pop the Giant Grumpy Ghost’s bubbles with magic.',
    teaches: ['sneak', 'dodge', 'magic'],
    boss: { name: 'Giant Grumpy Ghost', thing: 'ghost' },
  },
  {
    id: 'finale',
    n: 5,
    name: 'Final Laugh',
    colour: '#f59ac0',
    mission: 'The Grumpy Shadow is hiding every stolen laugh. Use every face you’ve learned to give them all back.',
    teaches: ['jump', 'magic', 'dodge', 'sneak'],
    boss: { name: 'Grumpy Shadow', thing: 'shadow' },
  },
];

/** A level can be played once it has its steps written. */
export const isPlayable = (level) => Array.isArray(level?.steps) && level.steps.length > 0 && !!level.boss?.steps?.length;

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;

/** The prompt shown in big letters for a step, using the backup face when a signal is missing. */
export function promptFor(need, { blinkLive = true } = {}) {
  if (need === 'jump') return 'Smile to jump!';
  if (need === 'magic') return 'Look surprised for magic!';
  if (need === 'dodge') return blinkLive ? 'Blink to dodge!' : 'Look surprised to dodge!';
  if (need === 'sneak') return 'Straight face... sneak!';
  return '';
}

/** Adventure progress in the save: which levels are open and the best result in each. */
export function emptyProgress() {
  return { unlocked: 1, best: {} };
}

export function normalizeProgress(p) {
  const base = emptyProgress();
  if (!p || typeof p !== 'object') return base;
  const unlocked = Math.max(1, Math.min(LEVELS.length, Math.round(Number(p.unlocked) || 1)));
  const best = {};
  for (const l of LEVELS) {
    const b = p.best?.[l.id];
    if (b) best[l.id] = { stars: Math.max(0, Math.min(3, Math.round(Number(b.stars) || 0))), score: Math.max(0, Math.round(Number(b.score) || 0)) };
  }
  return { unlocked, best };
}

/** Record a finished level: keeps the best stars and score, and opens the next level. */
export function recordLevel(progress, levelId, { stars, score }) {
  const p = normalizeProgress(progress);
  const level = levelById(levelId);
  if (!level) return p;
  const prev = p.best[levelId] || { stars: 0, score: 0 };
  p.best[levelId] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
  p.unlocked = Math.max(p.unlocked, Math.min(LEVELS.length, level.n + 1));
  return p;
}
