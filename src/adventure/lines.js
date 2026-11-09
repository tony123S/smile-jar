// lines.js: things Momo says. Momo is cheeky, a bit clumsy and always on your side.

export const LINES = Object.freeze({
  oops: {
    jump: [
      'Oops. I meant to land on my face. Totally on purpose.',
      'Ow, my bouncy bits! One more smile and I’ve got it.',
      'That fence just jumped at me. Smile again!',
    ],
    magic: [
      'My magic fizzled. Give me your best "whoa!" face!',
      'Abraca... nope. Try a big surprised face!',
    ],
    dodge: [
      'Bonk! Right on the nose. Blink and I’ll duck!',
      'I’m a snowman now. A quick blink, please!',
    ],
    sneak: [
      'They heard my giggle! Straight face, straight face...',
      'Shh. Guards hate fun. Calm face and we tiptoe.',
    ],
  },
  ready: {
    jump: ['Is that a smile? My legs are already bouncing!', 'Smile and I hop!', 'Ready... set... smile!'],
    magic: ['Whoa, magic eyebrows! Do that again!', 'Look surprised and I’ll go zap!'],
    dodge: ['Incoming! Blink and I’ll dodge!', 'A blink is all I need!'],
    sneak: ['Shh. Straight face. Guards hate fun.', 'Super serious face... we’re ninjas now.'],
  },
  help: 'No rush! I’ll wait right here. Take your time.',
  complete: [
    'We did it! Listen... the laughter is coming back!',
    'Victory dance! Wiggle wiggle wiggle!',
  ],
});

/** Pick a line from a list without repeating the last one. */
export function pick(list, rand = Math.random, last = null) {
  if (!list?.length) return '';
  if (list.length === 1) return list[0];
  let i = Math.floor(rand() * list.length) % list.length;
  if (list[i] === last) i = (i + 1) % list.length;
  return list[i];
}
