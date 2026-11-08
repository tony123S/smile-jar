---
title: Smile Jar: every smile you crack puts money in a charity jar
published: false
tags: presagechallenge, devchallenge, electron, javascript
cover_image:
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built

**Smile Jar** is a desktop fundraiser powered by your face. Friends, family or coworkers pledge an amount per smile, like 10¢ a smile capped at $10. You sit down for a two-minute Smile Session of jokes, tiny happy facts or an uplifting clip of your own, and the SmartSpectra SDK's live facial-expression signal counts every real smile into a jar for the cause you picked. When you're done, you export a pledge statement and send it to your sponsors, who donate directly to the cause.

It's like a sponsored fun run, except the only thing you have to stretch is your cheeks.

There are two ways to play:

- **Smile Session:** smile at jokes and happy facts, and every smile drops a coin.
- **Try Not to Smile:** keep a straight face while the jokes roll. Every time you crack, your sponsors pay up. Losing is how you win.

- Pick a cause and set a goal
- Add sponsors with a rate per smile and an optional cap
- Run a session: a live smile meter, a coin drops into the jar for each smile, and the total updates as you go
- Export a CSV pledge statement for your sponsors

No login, no payments, no server.

## Demo

<!-- Embed your demo video. Suggested flow: consent screen → home → session with the live smile signal bar and SDK hint → coins dropping → summary → export CSV → Privacy & data → Delete all my data. -->

{% embed VIDEO_URL %}

## Code

{% github tony123S/smile-jar %}

Setup takes three steps: `npm install`, add your SmartSpectra API key to `.env`, then `npm start`. The README has full setup instructions and a step-by-step testing guide for judges. No login is needed.

## How It Responds to Human Signals

**Signal used: expressions.** Smile Jar uses the SmartSpectra Node.js/Electron SDK (`@smartspectra/node-sdk`). The renderer-side `SmartSpectraSDK` opens the camera, and the main process runs the analysis on-device through `bindSmartSpectraIpc`. I request the SDK's face bundle (which includes `EXPRESSIONS`) and decode every `metrics` event:

```js
const sdk = new SmartSpectraSDK({
  apiKey: API_KEY,
  requestedMetrics: [...faceMetrics],   // + cardioMetrics if pulse is switched on
  enableTelemetry: false,               // opt-in only, see Consent and Data Handling
});

sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  for (const e of m.face?.expression ?? []) {
    // e = { stable, timestamp, scores: [{ type, confidence }] }
    if (detector.pushExpressions([e])) dropCoinIntoJar();
  }
});
```

**How the experience responds in real time:**

- **Smile meter.** A bar shows the live HAPPY score from the SDK, with a marker at the counting threshold. You can watch it climb as a joke lands.
- **A jar that copies your face.** The jar mascot grins when your HAPPY score is high and drops its jaw when the SDK sees SURPRISE, live, so you can literally see the signal.
- **Combos and golden coins.** Smiles within a few seconds of each other build a combo, and a huge grin (HAPPY at 92% or more) drops a golden coin. These are just for fun; every smile is worth the same pledge.
- **Try Not to Smile.** The same signal flips into a game: a "straight face" timer runs until the SDK catches you smiling, then resets with a "You cracked!" badge.
- **A jar that talks back.** Every smile clinks into the jar with a speech-bubble reaction. In Try Not to Smile, the jar watches your live HAPPY score and teases you as it creeps toward the threshold ("Don't you dare..."), then gloats "GOTCHA!" the moment the SDK catches you.
- **Jokes that learn your humour.** Cards come in four kinds: puns, animal facts, memories and picture-this. Each counted smile is credited to the card that was on screen when the smile *started*, and the reel samples the next card from what's working, so it shows "Picked for you: you smile at animal facts". In Try Not to Smile it uses the same model to hunt for your weak spot. The live signal is literally choosing the content.
- **A shareable Smile Receipt.** At the end you can save a PNG receipt with the jar, your total, best combo and humour type ("You're an animal lover") to send to sponsors. It never contains a picture of you.
- **Coins in the jar.** When a smile counts, a coin showing what that smile was worth ("+15¢") drops into the jar, and the session total and jar fill update immediately. Once a sponsor hits their cap, the next smile is worth less, and the app tells you.
- **Counting only real smiles.** The raw score jumps around, so `SmileDetector` adds hysteresis. A smile counts when HAPPY stays at or above 60% for half a second on stable samples. The detector re-arms only after HAPPY falls below 35% for 0.7 seconds. One long grin counts once, a flicker doesn't count, and you can't farm the jar by holding a smile. The detector is plain JavaScript with unit tests that feed it SDK-shaped expression samples.
- **Coaching from the SDK.** `validationStatus` codes (no face, too dark, face too far, and so on) become friendly hints over the camera preview, so you know when the signal is reliable.
- **Optional pulse.** With a cardio-enabled key you can switch on live `PULSE_RATE` next to the smile meter, just for fun. It's never stored.

## Prize Categories

**Most Creative or Delightful Use.**

Most camera-vitals demos point the camera at you to measure something. Smile Jar flips that around and makes your smile the thing that does good. The inspiration was sponsored fun runs: people love backing a friend's effort, but running isn't for everyone. Smiling is something almost anyone can do from their desk, and it's contagious. The playful parts are a jar that pulls the same face as you and trash-talks you, a joke reel that figures out your sense of humour from your smiles, golden coins and combos, a Smile Receipt to brag with, and the Try Not to Smile mode, where your sponsors are rooting for you to fail. Smiling for charity turns out to be hard to do with a straight face.

## Consent and Data Handling

- **Camera consent:** the app opens on a consent screen that explains how the camera is used and requires an explicit tick before anything else works. The camera opens only when you press Start a Smile Session and is released when the session ends. A "Camera on, nothing recorded" badge shows while it's live. Electron grants video only (never the microphone) and only to the app's own page.
- **Only consenting people:** the consent text asks you to count only your own smiles or those of people who knowingly agreed. Smile Jar isn't designed for, and must not be used for, covert or non-consensual monitoring.
- **Processing:** frames go from the camera to the SmartSpectra SDK inside the app, are analysed on-device, and are discarded. Smile Jar reads the expression scores (and pulse, if enabled) in memory only.
- **Storage:** one local record on your device with your consent date, settings, cause, sponsor names/rates and per-session totals (date, length, smile count, pledged amount). No video, images, face data, expression scores or pulse values are ever saved.
- **Sharing:** none. There's no backend, account, analytics or ads. The only thing that leaves the app is the CSV pledge statement, and only when you export and send it yourself.
- **Humour profile and receipt:** which kind of card made you smile is kept in memory for the current session only. The Smile Receipt image is made on your device only when you click Save and contains totals, never a picture of you.
- **Retention and deletion:** data is kept until you delete it. Privacy & data → Delete all my data wipes everything, including consent. Any single session can be discarded from its summary screen.
- **SDK telemetry:** the SDK connects to Presage to validate the API key. Its aggregate diagnostics summary (no video, no measurements, no identifiers, per Presage's docs) is on by default in the SDK, but Smile Jar turns it off unless you opt in.
- **AI services:** none. The SDK's optional LLM Insights feature isn't used.
- **Not medical:** Smile Jar makes no diagnosis, treatment or health or emotion assessment. It's a game.

## Agent Session

<!-- Upload the curated Claude Code transcript at https://dev.to/agent_sessions/new, remove anything sensitive (API keys, emails), press Make Public, and embed it here. -->

Smile Jar was built with Claude Code: researching the SmartSpectra SDK's expression output, designing the smile-counting logic and its tests, and building the consent-first UI.

<!-- Add a cover image. Reminder: one entry per participant, no team submissions. -->
