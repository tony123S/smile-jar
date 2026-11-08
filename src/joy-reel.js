// joy-reel.js: the built-in "uplifting clip" reel, as quick cards that need no network.
// Each card has a kind so the humour model (humour.js) can learn which kind makes you smile.
// Users can also load their own local video in the session screen.

export const KINDS = Object.freeze(['Pun', 'Animal fact', 'Memory', 'Picture this']);

export const JOY_REEL = [
  { kind: 'Pun', text: 'Why did the scarecrow win an award? He was outstanding in his field.' },
  { kind: 'Pun', text: 'I told my cat a joke about dogs. She did not find it a-mew-sing.' },
  { kind: 'Pun', text: 'What do you call a sleeping dinosaur? A dino-snore.' },
  { kind: 'Pun', text: 'Why do bees have sticky hair? They use honeycombs.' },
  { kind: 'Pun', text: 'What did the ocean say to the beach? Nothing, it just waved.' },
  { kind: 'Pun', text: 'I am reading a book about anti-gravity. It is impossible to put down.' },
  { kind: 'Pun', text: 'Why did the cookie go to the doctor? It was feeling crummy.' },
  { kind: 'Pun', text: 'What do you call cheese that is not yours? Nacho cheese.' },
  { kind: 'Pun', text: 'How does a penguin build its house? Igloos it together.' },
  { kind: 'Pun', text: 'Why are frogs so happy? They eat whatever bugs them.' },
  { kind: 'Pun', text: 'What do you call a fake noodle? An impasta.' },
  { kind: 'Pun', text: 'I used to hate facial hair, but then it grew on me.' },

  { kind: 'Animal fact', text: 'Sea otters hold hands while they sleep so they do not drift apart.' },
  { kind: 'Animal fact', text: 'Cows have best friends and get a little stressed when they are apart.' },
  { kind: 'Animal fact', text: 'Baby elephants sometimes suck their trunks for comfort, like a thumb.' },
  { kind: 'Animal fact', text: 'Squirrels forget where they bury some nuts, and that plants new trees.' },
  { kind: 'Animal fact', text: 'Rats laugh when they are tickled, at a pitch too high for us to hear.' },
  { kind: 'Animal fact', text: 'Wombats do cube-shaped poops. Nobody fully knows why they bother.' },
  { kind: 'Animal fact', text: 'Puffins mate for life and greet each other by tapping beaks.' },
  { kind: 'Animal fact', text: 'Goats have accents that change depending on who they hang out with.' },

  { kind: 'Memory', text: 'Remember the last time you laughed so hard you could not breathe.' },
  { kind: 'Memory', text: 'Recall your favourite smell from childhood.' },
  { kind: 'Memory', text: 'Think of someone who would be thrilled to get a text from you right now.' },
  { kind: 'Memory', text: 'Remember the best meal you ever had, and who you shared it with.' },
  { kind: 'Memory', text: 'Think of the most ridiculous thing you did as a kid.' },
  { kind: 'Memory', text: 'Remember a time a stranger was unexpectedly kind to you.' },

  { kind: 'Picture this', text: 'Picture a golden retriever seeing snow for the very first time.' },
  { kind: 'Picture this', text: 'Imagine a penguin in a tiny knitted sweater waddling toward you.' },
  { kind: 'Picture this', text: 'Smile at the camera like you just spotted an old friend across the street.' },
  { kind: 'Picture this', text: 'Imagine a hamster trying very seriously to carry a whole strawberry.' },
  { kind: 'Picture this', text: 'Picture your boss sliding into a meeting on roller skates.' },
  { kind: 'Picture this', text: 'Imagine a duckling following a very confused cat in a line.' },
];

export function shuffled(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
