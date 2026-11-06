// joy-reel.js: the built-in "uplifting clip" reel, as quick cards that need no network.
// Users can also load their own local video in the session screen.

export const JOY_REEL = [
  { kind: 'Joke', text: 'Why did the scarecrow win an award? He was outstanding in his field.' },
  { kind: 'Try this', text: 'Picture a golden retriever seeing snow for the very first time.' },
  { kind: 'Joke', text: 'I told my cat a joke about dogs. She did not find it a-mew-sing.' },
  { kind: 'Tiny fact', text: 'Sea otters hold hands while they sleep so they do not drift apart.' },
  { kind: 'Joke', text: 'What do you call a sleeping dinosaur? A dino-snore.' },
  { kind: 'Try this', text: 'Remember the last time you laughed so hard you could not breathe.' },
  { kind: 'Joke', text: 'Why do bees have sticky hair? They use honeycombs.' },
  { kind: 'Tiny fact', text: 'Cows have best friends and get a little stressed when they are apart.' },
  { kind: 'Joke', text: 'What did the ocean say to the beach? Nothing, it just waved.' },
  { kind: 'Try this', text: 'Think of someone who would be thrilled to get a text from you right now.' },
  { kind: 'Joke', text: 'I am reading a book about anti-gravity. It is impossible to put down.' },
  { kind: 'Tiny fact', text: 'Baby elephants sometimes suck their trunks for comfort, like a thumb.' },
  { kind: 'Joke', text: 'Why did the cookie go to the doctor? It was feeling crummy.' },
  { kind: 'Try this', text: 'Imagine a penguin in a tiny knitted sweater waddling toward you.' },
  { kind: 'Joke', text: 'What do you call cheese that is not yours? Nacho cheese.' },
  { kind: 'Tiny fact', text: 'Squirrels forget where they bury some nuts, and that plants new trees.' },
  { kind: 'Joke', text: 'How does a penguin build its house? Igloos it together.' },
  { kind: 'Try this', text: 'Recall your favourite smell from childhood.' },
  { kind: 'Joke', text: 'Why are frogs so happy? They eat whatever bugs them.' },
  { kind: 'Tiny fact', text: 'Rats laugh when they are tickled, at a pitch too high for us to hear.' },
  { kind: 'Joke', text: 'What do you call a fake noodle? An impasta.' },
  { kind: 'Try this', text: 'Smile at the camera like you just spotted an old friend across the street.' },
];

export function shuffled(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
