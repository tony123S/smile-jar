---
title: Smile Monster - your smiles help a little monster bring its world back to life
published: false
tags: presagechallenge, devchallenge, electron, javascript
cover_image:
---

<!--
  BEFORE YOU PUBLISH (delete this comment):
  1. Run the real app (npm start) with your camera and API key.
  2. Turn on My world > Settings > "Show the signal check during games", then look at
     the chips during a game. If any chip stays on "waiting"
     (for example Breathing or Talking), remove that row from the table in
     "How It Responds to Human Signals", or say it didn't arrive for you.
  3. Upload docs/cover.png as the cover image.
  4. Replace VIDEO_URL with your demo video, and AGENT_SESSION_URL with your public transcript link.
-->

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built

> A mysterious egg is waiting in a world without happiness. Every smile helps it hatch, and helps the little monster inside bring that world back to life.

**Smile Monster** is a small, cute story game for your laptop. You open it and get a short story: a colourful world that lost all its smiles, and a mysterious egg waiting in the last grey meadow. Then it's your turn. Every real smile the SmartSpectra SDK sees through your camera gives the monster happiness energy, and slowly its grey world gets its colours back.

There are five chapters:

1. **The Mysterious Egg** - it starts as an egg in a grey world. Every smile makes it glow and wiggle and adds a crack. When it's one smile away it starts to shake, and two little eyes peek out of the crack. On the third smile it hatches.
2. **The Awakening** - a Baby Monster with a bit of eggshell still on its head, and flowers and grass come back.
3. **The Power of Joy** - it becomes a Growing Monster with a sprout, and trees, a warm sun and twinkling stars return.
4. **Spread the Happiness** - a Happy Monster with sparkle wings, and the sky fills with colour and a rainbow.
5. **The World of Smiles** - the Guardian of Joy, with a flower crown, a soft glow, mushroom houses and floating hearts.

Once it hatches it has a little life of its own: it waddles around, sniffs the flowers, and falls asleep if you ignore it. When you smile it stops and turns to look at you. It's always the same round, squishy monster with big sparkly eyes and tiny arms, it just grows up. Every smile is +10 XP, and every level-up has its own little animation and fanfare.

What it looks like also depends on what made you smile. Puns give it tiny horns, animal facts give it fluffy ears, memories make it glow, daydream cards give it star freckles. So your monster might be a "Fluffy Furbun" and your friend's a "Dreamy Starbean".

And there's a real-world side too. Walking can donate your steps, recycling can earn you points, so why can't a smile raise money? Friends or family can pledge a few cents per smile to a charity, with a cap so nobody gets a surprise bill. Each smile counts twice: once for the monster's world, and once for the charity.

It's meant to be easy: the home screen shows one goal, a 3-step "How to play" guide shows up before your first game, and during a game a big banner just says "Smile if this makes you happy!".

Other bits:

- **Sponsor Snacks**: sponsors can add their own joke. The monster serves it as "A snack from Grandma Lee", and if it gets you, Grandma gets the credit and a heart on the monster.
- **Music**: original background music made right in the app, a dreamy tune for the story, soft piano and bells at home, something bouncy while you play. Music, sounds and volume can be turned on and off separately.
- **Smile Receipt**: a picture with your monster, your smiles, each sponsor's pledge and the charity, to send to your sponsors. Never your face.

## Demo

{% embed VIDEO_URL %}

## Code

{% github tony123S/smile-jar %}

To run it: `npm install`, put your SmartSpectra API key in a `.env` file, then `npm start`. The README has the full steps and a short testing guide for judges. There's no login.

## How It Responds to Human Signals

I'm using the SmartSpectra Node.js/Electron SDK. I ask for the face bundle (expressions, blinking, talking), plus breathing if "Monster breathes with you" is on:

```js
const requestedMetrics = [...faceMetrics];
if (settings.breathMirror) requestedMetrics.push(...breathingMetrics);
if (settings.showPulse) requestedMetrics.push(...cardioMetrics);

const sdk = new SmartSpectraSDK({ apiKey, requestedMetrics, enableTelemetry: false });
sdk.on('metrics', (buf) => handleMetrics(decodeMetrics(buf)));
```

Then each signal drives one thing:

| You | SDK signal | The monster |
| --- | --- | --- |
| Smile | Expressions (HAPPY score) | grins and waves its little arms, and gets +10 XP when the smile counts. Keep smiling for 3 seconds and it gets extra happy |
| Look surprised | Expressions (SURPRISE score) | opens its eyes and mouth wide and does a little jump |
| Blink | Blinking | blinks back at you, and every fifth blink it winks |
| Talk | Talking | moves its mouth along with you |
| Breathe | Breathing trace | its body gently rises and falls with yours |

The HAPPY score jumps around a lot, so not every twitch counts. A smile only counts if the score stays above 60% for half a second, and then you have to relax your face before the next one. One long grin is one smile. XP and the charity pledge both come from that same smile count, so a smile can't be rewarded twice.

The monster's face uses the same scores, but copying them straight across made it flicker. So they go through a small mood filter first. It smooths the scores and only changes the face when an expression has held for a moment. When you stop smiling, the monster fades back to calm through a soft smile instead of snapping. I only mirror happy and surprised. The SDK also gives sad and angry, but I couldn't check how reliable those are, so I left them out.

Each smile is also matched to the joke that was on screen when it started. That's how the monster knows you're an animal lover, and how the joke cards learn to show you more of what works on you.

I really didn't want to fake anything, so there's a **signal check** panel that shows which SDK signals are actually coming in. It's hidden for normal players and you turn it on in the settings. If one never shows up, the monster just doesn't use it. (When you're not doing anything, the monster walks around, sniffs flowers and naps on its own. That's just animation, not your signals.)

There's also a simulate mode (`npm run simulate`) so I could build the game without using up API credits. It uses keyboard keys instead of the camera, and a big yellow "SIMULATED SIGNALS" banner stays on screen the whole time.

## Prize Categories

I'm entering both: **Most Creative or Delightful Use** and **Best Thoughtful Real-World Use**.

### Most Creative or Delightful Use

Most camera demos measure you. Here your face *brings a world back to life*. The monster blinks when you blink, talks when you talk and breathes with you, so it feels like it's really looking at you. It grows into a different creature depending on your sense of humour, and you can watch grey hills turn into flowers, trees and rainbows because you smiled. I wanted the first reaction to be "awww, I want to help it".

### Best Thoughtful Real-World Use

Small fundraisers, like a class, an office team or a family raising money for a food bank, usually do runs, walks or bake sales. Those take planning, and not everyone can run. This is a sponsored challenge you can do in a couple of minutes at your desk, and it's fun enough that people actually want to.

I tried to keep the money part honest:

- The player never pays anything. The app only tracks what sponsors promised, and sponsors donate to the charity themselves.
- **Pledged** and **confirmed donated** are shown separately everywhere: the home screen, the receipt and the CSV.
- Every sponsor sets a cap.
- The game stuff (XP, levels) and the charity stuff are kept apart, so a level-up never looks like money was paid.
- The camera only turns on when you start a game, and nothing is recorded.
- It's a game. It doesn't say anything about your health or feelings.

## Consent and Data Handling

- **Camera consent:** after the story, a consent screen explains how the camera is used, and you have to tick a box before you can play. The camera is never on during the story, the consent screen or the home screen. It only turns on when you press PLAY and turns off when the game ends. A "Live, not recorded" label shows while it's on. The app only asks for the camera, never the microphone. (Talking is detected from the video.)
- **Only with people who agree:** the consent screen asks you to only count your own smiles, or smiles of people who know and agree. It must not be used to watch anyone secretly.
- **What's processed:** camera frames go to the SmartSpectra SDK inside the app, get analysed on your computer, and are thrown away. Smile Monster reads the expression scores, blink and talking flags, the breathing trace (if on) and pulse (if on), and only uses them in memory to animate the monster and count smiles.
- **What's saved on your computer:** whether you've seen the story, your consent date, settings (including music and volume), the charity and goal, sponsor names, rates, caps, their snack jokes and the donations you marked as confirmed, the monster (how many smiles it got and of which joke type), and a total for each game (date, length, number of smiles, amount pledged).
- **What's never saved:** video, photos, face data, expression scores, blink, talking or breathing data, or pulse values.
- **What leaves your computer:** nothing, unless you save the Smile Receipt or the pledge CSV and send it to someone yourself. There's no server, account, analytics or ads. The music and art are made inside the app, so nothing is downloaded for them either.
- **SDK telemetry:** the SDK connects to Presage to check the API key. It can also send an anonymous diagnostics summary (no video, no measurements, no identifiers, according to Presage's docs). That's on by default in the SDK, but Smile Monster turns it off unless you choose to share it.
- **Keeping and deleting:** your data stays until you delete it. "Delete all my data" in Privacy & data wipes everything, including your consent. You can also throw away one game from its summary screen, which also undoes what it gave the monster.
- **AI services:** none. The "learns your humour" bit is simple counting inside the app. The SDK's optional LLM Insights feature isn't used.
- **Not medical:** no diagnosis, no treatment, no health or emotion claims. It's just a game.

## Agent Session

I used Claude Code as a coding helper along the way, mainly for digging through the SDK docs, the smile-counting and monster logic, the music, tests and the UI. Here's the session (keys and personal info removed): AGENT_SESSION_URL
