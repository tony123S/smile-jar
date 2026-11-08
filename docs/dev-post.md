---
title: Smile Monster - a jar monster that eats your smiles and turns them into charity pledges
published: false
tags: presagechallenge, devchallenge, electron, javascript
cover_image:
---

<!--
  BEFORE YOU PUBLISH (delete this comment):
  1. Run the real app (npm start) with your camera and API key.
  2. Look at the "Live signals" chips during a session. If any chip stays on "waiting"
     (for example Breathing or Talking), remove that row from the table in
     "How It Responds to Human Signals" and the matching bullet, or say it didn't arrive.
  3. Replace VIDEO_URL with your demo video, and AGENT_SESSION_URL with your public transcript link.
-->

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)*

## What I Built

Walking can donate your steps. Recycling can earn you points. So why can't a smile raise money too?

**Smile Monster** is a little monster that lives in a jar on your laptop, and it only eats smiles. Your friends or family pledge some money to a charity for every smile, like 10 cents a smile up to $10. Then you sit down for two minutes while the monster serves you jokes and funny animal facts. Every real smile the SmartSpectra SDK picks up from your camera feeds the monster, drops a coin in the jar and adds to the pledge.

The monster starts as an **Egg**. Three smiles and it hatches into a **Sleepy Blob**. At 10 smiles it's a **Hatchling**, and at 20 it becomes its **Final Monster** form. Each time it evolves you get a little animation, a sound and the monster yelling something like "I’M EVOLVING!".

The fun part is that what it looks like depends on *what* made you smile:

- Puns grow horns
- Animal facts grow fur and ears
- Memories make it glow
- "Picture this" daydreams give it stars
- Jokes from your sponsors give it hearts in that sponsor's colour

Your top two joke types also pick its colour and name, so you might end up with a "Fluffy Hornbeast" while your friend gets a "Glowing Stargazer".

It also copies you while you play. Smile and it grins. Look surprised and its eyes go wide. Blink and it blinks. Talk and it gives you a curious "?" face. And if you turn on breathing, its belly goes up and down with yours.

Some other things in there:

- **Sponsor Snacks** - each sponsor can add their own joke or memory. The monster serves it as "A snack from Grandma Lee", and if it makes you smile, Grandma gets the credit.
- **Pledges with caps** - every sponsor sets a rate and a limit, so nobody gets a surprise bill.
- **Pledged vs donated** - the app shows what was promised and, separately, what you've marked as actually donated. It never touches money. Sponsors donate to the charity themselves.
- **Smile Receipt** - at the end you can save a picture with your monster, your smiles, what each sponsor pledged and the charity, to send to your sponsors. It never has your face on it.
- **Try Not to Smile** - keep a straight face while the monster teases you ("I see that lip twitching..."). Every time you crack it still eats, and your sponsors still pay.

## Demo

{% embed VIDEO_URL %}

## Code

{% github tony123S/smile-jar %}

To run it: `npm install`, put your SmartSpectra API key in a `.env` file, then `npm start`. The README has the full steps and a short testing guide for judges. There's no login.

## How It Responds to Human Signals

Smile Monster uses the SmartSpectra Node.js/Electron SDK. I ask for the face bundle (expressions, blinking, talking), plus the breathing bundle if "Monster breathes with you" is on:

```js
const requestedMetrics = [...faceMetrics];
if (settings.breathMirror) requestedMetrics.push(...breathingMetrics);
if (settings.showPulse) requestedMetrics.push(...cardioMetrics);

const sdk = new SmartSpectraSDK({ apiKey, requestedMetrics, enableTelemetry: false });
sdk.on('metrics', (buf) => handleMetrics(decodeMetrics(buf)));
```

Then each signal drives one thing:

| You | SDK signal | What happens |
| --- | --- | --- |
| Smile | Expressions (HAPPY score) | counts as a smile, the monster grins and eats it |
| Look surprised | Expressions (SURPRISE score) | its eyes and mouth go wide, and it gets bigger eyes over time |
| Blink | Blinking | it blinks with you |
| Talk | Talking | it makes a "?" listening face |
| Breathe | Breathing trace | its belly rises and falls with yours |

The HAPPY score jumps around a lot, so not every twitch counts. A smile only counts if the score stays above 60% for half a second, and then you have to relax your face before the next one counts. One long grin is one smile, and you can't cheat by holding it forever.

Each smile is also matched to the joke that was on screen when it started. That's how the monster knows you're a pun person, and it's how the joke reel learns to show you more of what works on you.

I really didn't want to fake anything, so there's a **Live signals** panel under the smile meter. It shows which SDK signals are actually coming in right now. If one never shows up, the monster just doesn't use it.

There's also a simulate mode (`npm run simulate`) so I could build the UI without burning API credits. It uses keyboard keys instead of the camera, and a big yellow banner says "SIMULATED SIGNALS" the whole time so it can't be mistaken for the real thing.

## Prize Categories

I'm entering both: **Most Creative or Delightful Use** and **Best Thoughtful Real-World Use**.

### Most Creative or Delightful Use

Most camera demos measure you. I wanted your smile to *grow* something. The monster copies your face and your blinks, and becomes a different creature depending on your sense of humour, so no two monsters look the same. Sponsor Snacks turn sponsors into part of the game too: Grandma's banana joke can literally leave a heart on your monster. And Try Not to Smile is a fundraiser where your sponsors are hoping you lose.

### Best Thoughtful Real-World Use

Small fundraisers, like a class, an office team or a family raising money for a food bank, usually do runs, walks or bake sales. Those take planning, and not everyone can run. This is a sponsored challenge you can do in two minutes at your desk.

I tried to keep the money part honest and simple:

- No account and no payments. The app tracks pledges, and sponsors donate to the charity themselves.
- Pledged and donated are shown separately everywhere: home screen, receipt and the CSV statement.
- Every sponsor sets a cap, so nobody gets a surprise bill.
- Hints from the SDK are turned into plain words, like "It's a bit dark. Add some light."
- The camera can't turn on until you agree to how it's used, and nothing is recorded.
- It's a game. It doesn't say anything about your health or feelings.

## Consent and Data Handling

- **Camera consent:** the first screen explains how the camera is used, and you have to tick a box before you can do anything. The camera only turns on when you start a session and turns off when it ends. A "Live, not recorded" label shows while it's on. The app only asks for the camera, never the microphone. (Talking is detected from the video.)
- **Only with people who agree:** the consent screen asks you to only count your own smiles, or smiles of people who know and agree. It must not be used to watch anyone secretly.
- **What's processed:** camera frames go to the SmartSpectra SDK inside the app, get analysed on your computer, and are thrown away. Smile Monster reads the expression scores, blink and talking flags, the breathing trace (if you turned it on) and pulse (if you turned it on), and only uses them in memory to draw the monster and count smiles.
- **What's saved on your computer:** your consent date, settings, the charity and goal, sponsor names, rates, caps, their snack jokes and the donations you marked as confirmed, the monster (how many smiles it ate and of which joke type), and a total for each session (date, length, number of smiles, amount pledged).
- **What's never saved:** video, photos, face data, expression scores, blink, talking or breathing data, or pulse values.
- **What leaves your computer:** nothing, unless you save the Smile Receipt or the pledge CSV and send it to someone yourself. There's no server, account, analytics or ads.
- **SDK telemetry:** the SDK connects to Presage to check the API key. It can also send an anonymous diagnostics summary (no video, no measurements, no identifiers, according to Presage's docs). That's on by default in the SDK, but Smile Monster turns it off unless you choose to share it.
- **Keeping and deleting:** your data stays until you delete it. "Delete all my data" in Privacy & data wipes everything, including your consent. You can also throw away one session from its summary screen, which also undoes what it fed the monster.
- **AI services:** none. The "learns your humour" bit is simple counting inside the app. The SDK's optional LLM Insights feature isn't used.
- **Not medical:** no diagnosis, no treatment, no health or emotion claims. It's just a game.

## Agent Session

I used Claude Code as a coding helper along the way, mainly for digging through the SDK docs, the smile-counting and monster logic, tests and the UI. Here's the session (keys and personal info removed): AGENT_SESSION_URL
