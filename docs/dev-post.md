---
title: Smile Jar - every smile puts money in a charity jar
published: false
tags: presagechallenge, devchallenge, electron, javascript
cover_image:
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built

Walking can donate your steps. Recycling can earn you points. So why can't a smile raise money too?

That's the idea behind **Smile Jar**. Your friends or family pledge some money for every smile, say 10 cents a smile up to $10. Then you sit in front of your laptop for two minutes while the app shows you jokes and cute animal facts. Every time you smile, the SmartSpectra SDK picks it up from the camera and a coin drops into the jar. At the end you get a pledge list to send to your sponsors, and they donate straight to the charity.

Basically a sponsored fun run, but the only thing you exercise is your cheeks 😄

You can play it two ways:

- **Smile Session** - smile at the jokes and fill the jar.
- **Try Not to Smile** - keep a straight face while the jokes keep coming. Every time you crack, your sponsors pay. You win by losing!

No login, no payments, no server. Everything runs on your own computer.

## Demo

{% embed VIDEO_URL %}

## Code

{% github tony123S/smile-jar %}

To run it: `npm install`, put your SmartSpectra API key in a `.env` file, then `npm start`. The README has the full steps and a short testing guide for judges. There's no login.

## How It Responds to Human Signals

Smile Jar uses the **expressions** signal from the SmartSpectra Node.js/Electron SDK. The SDK gives a live score for each expression, and I mostly use the HAPPY score (plus SURPRISE for one fun effect).

The setup is pretty small:

```js
const sdk = new SmartSpectraSDK({
  apiKey: API_KEY,
  requestedMetrics: [...faceMetrics],   // add cardioMetrics if pulse is on
  enableTelemetry: false,               // only on if the user opts in
});

sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  for (const e of m.face?.expression ?? []) {
    if (detector.pushExpressions([e])) dropCoinIntoJar();
  }
});
```

The HAPPY score jumps around a lot, so I didn't want every little twitch to count. A smile only counts if the score stays above 60% for half a second. Then you have to relax your face before the next one can count. So one long grin is one coin, and you can't cheat by holding a smile forever.

Here's what happens on screen while you play:

- **Smile meter** - a bar shows your live HAPPY score, so you can watch it go up as a joke lands.
- **The jar copies your face** - it grins when you smile and drops its jaw when you look surprised.
- **The jar talks** - it says things when you smile, and in Try Not to Smile it teases you as your score creeps up ("Don't you dare..."), then yells "GOTCHA!" when you crack.
- **Jokes that learn what you like** - there are puns, animal facts, memories and "picture this" cards. The app notices which kind made you smile and shows you more of those. In Try Not to Smile it uses this to find your weak spot.
- **Combos and golden coins** - smile a few times in a row for a combo, or give a really big grin for a golden coin. These are just for fun, every smile is worth the same.
- **Smile Receipt** - at the end you can save a picture with your score, best combo and humour type ("You're an animal lover") to send to your sponsors. It never includes your face.
- **Helpful hints** - if the SDK can't see you well, the app tells you in plain words, like "It's a bit dark. Add some light."
- **Pulse (optional)** - if your API key supports it, you can show your live pulse next to the smile meter, just for fun.

## Prize Categories

I'm entering both: **Most Creative or Delightful Use** and **Best Thoughtful Real-World Use**.

### Most Creative or Delightful Use

Most camera demos measure you. I wanted to flip that so your smile is what does something good. There are already apps that donate for your steps or reward you for recycling, and smiling felt like the obvious missing one. It's free, almost anyone can do it, and it spreads.

The fun parts are the jar that copies your face and talks back, the jokes that figure out your sense of humour, and Try Not to Smile, where your sponsors are hoping you fail. It's surprisingly hard to keep a straight face when you know it's for charity.

### Best Thoughtful Real-World Use

Small fundraisers, like a school class, an office team or a family raising money for a food bank, usually do runs, walks or bake sales. Those take time, planning and money, and not everyone can run. Smile Jar is a sponsored challenge you can do in two minutes at your desk, and it works for people who can't do a fun run.

I tried to keep it simple for those people:

- No account and no payments. Pick a cause, add sponsors, press Start. Sponsors donate to the charity themselves, so the app never handles money.
- Sponsors set an amount per smile and a limit, so nobody gets a surprise bill.
- Hints are in plain language instead of error codes.
- The camera can't turn on until you agree to how it's used, and nothing is recorded.
- It's a game. It doesn't say anything about your health or feelings.

## Consent and Data Handling

- **Camera consent:** the first screen explains how the camera is used, and you have to tick a box before you can do anything. The camera only turns on when you start a session and turns off when it ends. A "Camera on, nothing recorded" label shows while it's on. The app only asks for the camera, never the microphone.
- **Only with people who agree:** the consent screen asks you to only count your own smiles, or smiles of people who know and agree. It must not be used to watch anyone secretly.
- **Processing:** camera frames go to the SmartSpectra SDK inside the app, get analysed on your computer, and are thrown away. Smile Jar only reads the expression scores (and pulse if you turn it on), and only in memory.
- **What's saved:** one small record on your computer with your consent date, settings, cause, sponsor names and amounts, and a total for each session (date, length, number of smiles, amount pledged). No video, photos, face data, expression scores or pulse values are ever saved.
- **Sharing:** nothing is shared. There's no server, account, analytics or ads. The only thing that leaves the app is the pledge list or Smile Receipt, and only if you save and send it yourself.
- **Humour profile and receipt:** which kind of joke made you smile is only kept until the session ends. The Smile Receipt is made on your computer when you click Save, and it has your totals, never a picture of you.
- **Keeping and deleting:** your data stays until you delete it. "Delete all my data" in Privacy & data wipes everything, including your consent. You can also throw away a single session from its summary screen.
- **SDK telemetry:** the SDK connects to Presage to check the API key. It can also send an anonymous diagnostics summary (no video, no measurements, no identifiers, according to Presage's docs). That's on by default in the SDK, but Smile Jar turns it off unless you choose to share it.
- **AI services:** none. The SDK's optional LLM Insights feature isn't used.
- **Not medical:** no diagnosis, no treatment, no health or emotion claims. It's just a game.

## Agent Session

<!-- Optional: embed your agent session here, or delete this section. -->

I used Claude Code as a coding helper along the way, mainly for digging through the SDK docs, the smile-counting logic and tests, and the UI.
