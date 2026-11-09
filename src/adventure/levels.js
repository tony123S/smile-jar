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
    intro: [
      'The Crazy Forest! The trees used to tell jokes. Now they just... stand there. Rude.',
      'New trick: look surprised, like "WHOA!", and I zap things with magic.',
    ],
    steps: [
      { need: 'jump', thing: 'root', label: 'a twisty root', win: 'Hop! Roots can’t catch me.' },
      { need: 'magic', thing: 'vines', label: 'a wall of vines', win: 'ZAP! Vines, be gone!' },
      { need: 'jump', thing: 'mushroom', label: 'a bouncy mushroom', win: 'Boing boing! Free trampoline.' },
      { need: 'magic', thing: 'vines', label: 'more vines', win: 'Zap zap! I’m basically a wizard.' },
      { need: 'jump', thing: 'log', label: 'a sleepy log', win: 'Sorry, log. Didn’t mean to step on your nose.' },
    ],
    boss: {
      name: 'Dancing Tree',
      thing: 'tree',
      intro: 'The Dancing Tree forgot how to dance! Copy its moves: smile, surprise, smile, surprise!',
      steps: [
        { need: 'jump', label: 'step', win: 'Step! Its branches are wiggling...' },
        { need: 'magic', label: 'spin', win: 'Spin! Leaves everywhere!' },
        { need: 'jump', label: 'step', win: 'Hop! It’s tapping its roots!' },
        { need: 'magic', label: 'twirl', win: 'TWIRL! The Dancing Tree is dancing again!' },
      ],
      outro: 'The Dancing Tree is doing the cha-cha. The whole forest is giggling!',
    },
  },
  {
    id: 'mountain',
    n: 3,
    name: 'Frozen Mountain',
    colour: '#9fd4f2',
    mission: 'Snowballs everywhere! Blink to dodge them, smile to jump the ice, and melt the Ice Penguin’s frown.',
    teaches: ['jump', 'dodge'],
    intro: [
      'Brrr. Frozen Mountain. Even the snowmen look grumpy up here.',
      'Snowballs incoming! When one flies at me, blink and I duck. Quick blink, that’s all.',
    ],
    steps: [
      { need: 'jump', thing: 'icegap', label: 'an icy gap', win: 'Whee! Over the ice!' },
      { need: 'dodge', thing: 'snowball', label: 'a snowball', win: 'Ducked it! Missed me!' },
      { need: 'jump', thing: 'snowman', label: 'a grumpy snowman', win: 'Hop! Cheer up, snowman!' },
      { need: 'dodge', thing: 'icicle', label: 'a falling icicle', win: 'Whoosh! That was close.' },
      { need: 'dodge', thing: 'snowball', label: 'another snowball', win: 'Ha! Too slow, snowball!' },
    ],
    boss: {
      name: 'Ice Penguin',
      thing: 'penguin',
      intro: 'The Ice Penguin throws snowballs when it’s grumpy. Dodge them, then melt its frown with a big smile!',
      steps: [
        { need: 'dodge', thing: 'snowball', label: 'snowball 1', win: 'Dodged! It looks confused.' },
        { need: 'dodge', thing: 'snowball', label: 'snowball 2', win: 'Dodged again! Its beak is wobbling...' },
        { need: 'jump', label: 'melt', win: 'Your smile melted its frown! It’s sliding on its belly!' },
      ],
      outro: 'The Ice Penguin is belly-sliding and giggling. The mountain is sparkling again!',
    },
  },
  {
    id: 'castle',
    n: 4,
    name: 'Silly Castle',
    colour: '#c7a4f0',
    mission: 'Guards are napping in the Silly Castle. Keep a straight face to sneak past, then pop the Giant Grumpy Ghost’s bubbles with magic.',
    teaches: ['sneak', 'dodge', 'magic'],
    intro: [
      'Shh! The Silly Castle. The guards are asleep, and they HATE giggles.',
      'Keep a straight face and I tiptoe. Just a second or so. No smiling... I know, it’s hard.',
    ],
    steps: [
      { need: 'sneak', thing: 'guard', label: 'a sleeping guard', win: 'Tiptoe tiptoe... made it!' },
      { need: 'dodge', thing: 'pot', label: 'a falling flower pot', win: 'Ducked! Who keeps pots up there?' },
      { need: 'magic', thing: 'door', label: 'a locked door', win: 'ZAP! The door giggled open.' },
      { need: 'sneak', thing: 'guard', label: 'another guard', win: 'Not a peep. We’re ninjas.' },
      { need: 'dodge', thing: 'pot', label: 'another pot', win: 'Missed me! Nice blink.' },
    ],
    boss: {
      name: 'Giant Grumpy Ghost',
      thing: 'ghost',
      intro: 'The Giant Grumpy Ghost blows grumpy bubbles. Look surprised to pop them!',
      steps: [
        { need: 'magic', label: 'bubble 1', win: 'POP! It went "boo-hoo-hoo"... no, wait, "hoo-hoo-HA"!' },
        { need: 'dodge', thing: 'bubble', label: 'a big bubble', win: 'Ducked the big one!' },
        { need: 'magic', label: 'bubble 2', win: 'POP! The ghost is smiling!' },
        { need: 'magic', label: 'bubble 3', win: 'POP POP! The ghost is laughing so hard it’s see-through!' },
      ],
      outro: 'The Giant Grumpy Ghost is giggling and doing loop-the-loops. The castle is silly again!',
    },
  },
  {
    id: 'finale',
    n: 5,
    name: 'Final Laugh',
    colour: '#f59ac0',
    mission: 'The Grumpy Shadow is hiding every stolen laugh. Use every face you’ve learned to give them all back.',
    teaches: ['jump', 'magic', 'dodge', 'sneak'],
    intro: [
      'This is it. The Grumpy Shadow’s hideout. All the stolen laughs are in there.',
      'Every face you’ve learned, we’ll need it. Smile, surprise, blink, straight face. Let’s go!',
    ],
    steps: [
      { need: 'jump', thing: 'rock', label: 'a gloomy rock', win: 'Hop! Not so gloomy now.' },
      { need: 'magic', thing: 'cloud', label: 'a grumpy cloud', win: 'ZAP! Sunshine!' },
      { need: 'dodge', thing: 'grump', label: 'a flying grump', win: 'Dodged! Grumps can’t catch us.' },
      { need: 'sneak', thing: 'guard', label: 'a shadow guard', win: 'Sneaky sneaky. It didn’t see a thing.' },
      { need: 'jump', thing: 'rock', label: 'one more rock', win: 'Almost there!' },
    ],
    boss: {
      name: 'Grumpy Shadow',
      thing: 'shadow',
      intro: 'The Grumpy Shadow! It’s not scary, just VERY grumpy. Every face you make gives back a stolen laugh!',
      steps: [
        { need: 'jump', label: 'laugh 1', win: 'A giggle flew out!' },
        { need: 'magic', label: 'laugh 2', win: 'A chuckle flew out!' },
        { need: 'dodge', thing: 'grump', label: 'a grump', win: 'Dodged its grump!' },
        { need: 'sneak', label: 'laugh 3', win: 'Shh... we sneaked a snicker back!' },
        { need: 'jump', label: 'laugh 4', win: 'The last laugh! And... the Shadow is laughing too!' },
      ],
      outro: 'The Grumpy Shadow just wanted someone to make it laugh. Now it’s the giggliest shadow in the kingdom!',
    },
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
