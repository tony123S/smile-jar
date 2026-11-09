# Smile Monster 👾🌈

![Smile Monster cover](docs/cover.png)

*"A mysterious egg is waiting in a world without happiness. Every smile helps it hatch, and helps the little monster inside bring that world back to life."*

**Smile Monster** is a cute, story-driven desktop game. Your real smiles, picked up live from the camera by the [Presage SmartSpectra SDK](https://github.com/Presage-Security/SmartSpectra), give a little pastel monster happiness energy. It grows up over five chapters, and its grey, faded world comes back to life with each one. At the same time, friends, family or coworkers pledge an amount per smile to a charity you pick, so your smiles also do some good in the real world.

Built for the DEV Presage SmartSpectra SDK Challenge (`#presagechallenge`).

> Smile Monster is a game. It does not diagnose, treat or assess anyone's health or emotional state. It tracks pledges; it never processes payments.

*Screenshots in `docs/screenshots` were taken with `npm run simulate` (note the yellow banner), because the build machine has no camera.*

## The game

**Opening story.** Four short full-screen scenes tell the story: a world that lost its smiles, a mysterious egg in the last grey meadow, a first smile that makes it glow and wiggle, and the egg starting to crack. There's a **Continue** button, **Skip story**, and a final **LET'S BEGIN!**. The story plays once (it's remembered on this device) and can be replayed from the home screen or settings. The camera is never on during the story.

**Five chapters, five levels.** Every qualifying smile gives **+10 XP**. The monster is the same round, squishy character at every level; it just grows up:

| Level | Chapter | Smiles | The monster | The world |
| --- | --- | --- | --- | --- |
| 1 | The Mysterious Egg | 0 | Mysterious Egg: it glows and wiggles when you smile, cracks a little with each smile, shakes when it's nearly ready, and eyes peek out of the crack | grey; the first smile brings back glowing lights |
| 2 | The Awakening | 3 | Baby Monster, just hatched, with a bit of eggshell on its head, shy | flowers and grass return |
| 3 | The Power of Joy | 8 | Growing Monster with a sprout and a little bud, cheerful | trees, a warm sun and twinkling stars |
| 4 | Spread the Happiness | 15 | Happy Monster with sparkle wings, playful | a colourful sky and a rainbow |
| 5 | The World of Smiles | 25 | Guardian of Joy with a flower crown and a glow, proud | the full magical world: mushroom houses, floating hearts |

Each level-up plays an evolution animation, a fanfare that's different for every level, a chapter-complete chime and a line from the monster.

**Humour shapes how it looks.** Each counted smile is credited to the card that was on screen when the smile started, and that category becomes part of the monster's diet. Puns grow tiny horns, animal facts grow fluffy ears, memories make it glow, daydreams give it star freckles, sponsor snacks add hearts in the sponsor's colour, and surprise moments make its sparkly eyes bigger. The top two categories set its colour and name (for example "Fluffy Furbun" or "Dreamy Starbean"). The joke reel also learns, within a game, which category works on you.

**A monster that mirrors your real signals.** During a game:

| You | SDK signal | The monster |
| --- | --- | --- |
| Smile | `EXPRESSIONS` (HAPPY score) | grins and waves its arms (the egg glows and wiggles), and earns energy when the smile counts. Keep smiling for 3 seconds and it gets extra happy, with hearts. When you stop, it eases back to calm through a soft smile |
| Look surprised | `EXPRESSIONS` (SURPRISE score) | opens its eyes and mouth wide and does a little jump |
| Blink | `BLINKING` (`detected` flag) | blinks back, and every fifth blink it winks instead |
| Talk | `TALKING` (`detected` flag) | moves its mouth along with you |
| Breathe | breathing bundle (chest trace, optional) | its body rises and falls with yours |

**No flickering faces.** The live scores jump around, so the monster's face goes through a small mood filter (`src/mood.js`). It smooths the scores, only changes face when an expression has held for about a fifth of a second, keeps each face on screen for at least half a second, and uses separate on and off thresholds so a score hovering at the edge can't make it flicker. Only happy and surprised are mirrored. The SDK also reports sad, angry and others, but they aren't used until they can be checked on real faces. Faces take priority over the monster's own idle animation.

A **Live signals** panel shows which signals are actually arriving (`live`), stopped (`paused`), never seen (`waiting`) or not requested (`off`). If a signal never arrives, the monster simply doesn't use it. On the home screen the monster has its own idle bounce and blink; those are animations, not signals.

**Easy to pick up.** The home screen shows one goal ("Press PLAY and smile 3 times to hatch the egg"). Before the first game a 3-step **How to play** guide explains it: read the joke, smile for real, your monster grows. In a game a big banner says what to do, and the HUD shows how many smiles until the monster grows.

**One simple game.** Press PLAY, read the jokes and happy facts, and smile when something makes you happy.

**Music and sound.** Original background music is generated live in the app with Web Audio (no audio files): a dreamy track for the story, soft piano and bells at home, an upbeat track for games, and an uplifting one once the world is fully restored. It loops seamlessly, starts only after you interact with the app, crossfades between screens and pauses when the window is hidden. Smiles never restart it. Sound effects cover smiles, the monster's happy squeak, XP, blooming flowers, level-ups, evolution and chapter completion. **Music** and **Sounds** have separate on/off buttons, plus a volume slider.

## Real-world impact

A qualifying smile counts in two separate places:

- **The game:** happiness energy, XP, evolution and the world coming back.
- **Charity:** each sponsor's per-smile pledge, up to their cap.

The home screen has a small **Real-world impact** card: total qualifying smiles, total pledged by sponsors, confirmed donations and progress toward the goal. **Pledged** (promised, worked out from smiles and caps) and **Confirmed donated** (what you record after a sponsor actually donates) are always shown separately. The player never pays anything; sponsors donate to the charity themselves.

Everything administrative lives in **Charity & settings**: sponsors with rates, caps and their **snack jokes**, confirmed donation amounts, the cause and goal, game length, breathing and pulse options, sound settings, the game history, replaying the story and starting a new monster. A sponsor's snack joke is served in the game as "A snack from Grandma Lee"; if it makes you smile, that sponsor gets the credit.

**Smile Receipt.** After a game, save a PNG with the monster, its name and level, the qualifying smiles, each sponsor's pledge for the game, the campaign's pledged and confirmed totals, and the charity. It says plainly that pledged means promised, not paid, and it contains no camera image. A CSV pledge statement can be exported from settings.

## How it works

```
camera ──► SmartSpectra SDK (renderer captures frames, main process analyses them on-device)
                │  'metrics' event (protobuf) → decodeMetrics(buf)
                ▼
   face.expression[] ──► SmileDetector ──► +1 qualifying smile ──► pledges.js (caps)
          │                                    │
          │                                    └─► HumourModel.creditSmile() ──► monster diet ──► traits
          ├─► mascotFace()      (grin / wow)  ─┐
   face.blinking[]  ──► BlinkTracker          ├─► monsterSvg() redrawn once per frame
   face.talking[]   ──► talkingNow()          │
   breathing trace  ──► BreathNormalizer     ─┘
   all of the above ──► SignalMonitor ──► "Live signals" chips

   qualifying smiles ──► xpFor() (10 XP each) ──► stageFor() level ──► worldTier() ──► worldSvg()
```

`SmileDetector` uses hysteresis: HAPPY ≥ 60% held for 0.5 s counts one smile, then HAPPY must drop below 35% for 0.7 s before the next can count. One long grin counts once and a flicker doesn't count. We don't claim to tell real from fake smiles beyond that.

The SDK integration is in [`renderer.js`](renderer.js) (`buildSdk`, `wireSdk`, `handleMetrics`) and [`main.js`](main.js) (`bindSmartSpectraIpc`). The app requests `faceMetrics` (landmarks, blinking, talking, expressions), adds `breathingMetrics` when "Monster breathes with you" is on, and `cardioMetrics` when pulse is on.

## Setup

**You need:** Node.js 22.12 or newer (24 LTS recommended; older 22.x fails to install Electron with `ERR_REQUIRE_ESM`), a webcam, and a free SmartSpectra API key from <https://physiology.presagetech.com/>.

```bash
git clone https://github.com/tony123S/smile-jar.git
cd smile-jar
npm install                 # pulls @smartspectra/node-sdk and its native runtime (a few hundred MB)
cp .env.example .env        # then paste your key: SMARTSPECTRA_API_KEY=...
npm start                   # bundles the renderer and launches Electron
```

On Windows PowerShell you can copy the file with `Copy-Item .env.example .env`. If the app closes straight away from a VS Code terminal, run `$env:ELECTRON_RUN_AS_NODE=$null; npm start` (PowerShell) or `env -u ELECTRON_RUN_AS_NODE npm start` (macOS/Linux).

The key is read at build time from `.env` (or the `SMARTSPECTRA_API_KEY` environment variable) and baked into `dist/`, which is git-ignored. Don't commit `.env` or `dist/`.

### Testing guide for judges

1. `npm start`. The opening story plays first. Click **Continue** through the four scenes (or **Skip story**), then **LET'S BEGIN!**. Music starts after your first click.
2. The camera consent screen comes next. Tick the agreement and press **Meet my monster**. (The diagnostics box is optional and off by default.) The camera has not been touched yet.
3. The home screen shows the Mysterious Egg in its grey world, the happiness bar, the five chapters and the Real-world impact card. Try the **Music**, **Sounds** and volume controls at the top.
4. Press **PLAY**. Before your first game a 3-step **How to play** guide appears (you can open it again from the home screen). Only after that does the SDK open the camera (the OS may ask for permission). The hint on the preview tells you when it's running and how to sit.
5. Look at the **Live signals** chips. They show which SmartSpectra signals your key and setup are really delivering.
6. Smile at the cards. Each counted smile pops "+10 XP" and the sponsors' pledge. Your first smile makes the egg glow and brings back the first lights. Each smile adds a crack, and the third one hatches the egg into a Baby Monster. Blink, talk, look surprised and breathe, and watch the monster copy you.
7. Smile at a "Sponsor snack" card to see that sponsor get the credit.
8. Press **End game**. The camera turns off and the summary shows XP, the monster, sponsor pledges and the charity. Press **Save Smile Receipt**.
9. Open **Charity & settings**, type an amount in **Donated ($)** for a sponsor and go back: Pledged and Confirmed donated update separately. Try **Export pledge statement (CSV)** and **Replay the story**.
10. Open **Privacy & data** and press **Delete all my data** to see the wipe (it starts again from the story).

Breathing needs your chest in view (sit back a little). Pulse needs an API key provisioned for cardio metrics; leave it off if yours isn't.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests: smile detector, pledges and confirmed donations, monster levels, XP and traits, world restoration, music loops, signal tracking, humour model, moving saves from earlier versions safely |
| `npm run simulate` | Launches the UI with a **fake** signal for UI work (Space = smile, G = big grin, W = surprise, B = blink, T = talk, breathing is a sine wave). A yellow banner says so on every screen. The real build never uses it |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Packaged installers via electron-builder |

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No SmartSpectra API key in this build" | Create `.env` from `.env.example` and run `npm start` again |
| SmartSpectra error 2 (authentication) | Key is wrong or revoked. Check it at physiology.presagetech.com |
| SmartSpectra error 4 (credits) | Your Presage plan is out of credits |
| A signal chip stays on "waiting" | That signal isn't arriving with your key or setup. Breathing needs the chest visible; pulse needs a cardio-enabled key |
| Hint says "can't see a face" / "too dark" | These come straight from the SDK's validation status. Face the camera with light in front of you |
| Smiles not counting | The bar must pass the marker (60%) for half a second, then drop back down before the next smile |

## Consent and Data Handling

**Camera consent.** After the opening story (which never uses the camera), the app shows a consent screen that explains the points below and requires the user to tick an agreement before anything else is available. The camera is never opened during the story, on the consent screen or on the home screen. It is opened by the SDK only when the user presses PLAY (after the How to play guide the first time), and released when the game ends, the timer runs out, the user deletes their data, or the window closes. A "Live, not recorded" badge is shown while it's on, alongside the OS camera indicator. The Electron main process grants only video (never the microphone) and only to the app's own bundled page. Talking detection comes from the video, not from audio. The consent text asks users to count only their own smiles or those of people who knowingly agreed to take part; the app must not be used for covert monitoring.

**What is processed.** Camera frames go from the renderer to the SmartSpectra SDK running inside the app's main process, are analysed on the device, and are discarded. Smile Monster reads expression scores, blink and talking flags, the breathing trace (if "Monster breathes with you" is on) and pulse (if turned on). It uses them in memory to animate the monster, update the meter and count smiles, then drops them.

**What is stored.** One record in the app's local storage on this device (`smilemonster.v1`; a save from an earlier version of the app is moved to this name the first time it opens, and the old copy is removed only after the move worked): whether the opening story has been seen; the consent version and time; settings (game length, breathing mirror, pulse, music, sound effects, volume, diagnostics); the cause and goal; sponsor names, rates, caps, colours, snack jokes, snack-smile counts and the confirmed donation amounts the user typed; the monster (qualifying smiles, from which XP and level are worked out; smiles per joke category; surprise-moment count; snack smiles per sponsor); names of retired monsters; and per-game totals (end time, duration, number of smiles, pledged amount).

**What is never stored or sent by Smile Monster.** Video, images, screenshots, face landmarks, expression scores, blink, talking or breathing data, pulse values, or any other biometric data. The blink count on the summary is a number for that screen only. The in-game humour model is discarded when the game ends. A video clip the user plays is opened from their disk through a temporary local URL and never copied or uploaded.

**Smile Receipt and CSV.** Both are generated on the device only when the user clicks to save or export. The receipt has the monster drawing, totals, sponsor names and amounts, and the charity, never a camera image. The CSV has the cause, sponsor names, rates, caps, pledged and confirmed amounts, snack smile counts, and session dates and smile counts. They leave the device only if the user sends them to someone.

**Sharing.** None. Smile Monster has no backend, no account, no analytics and no ads. The music, sounds and artwork are generated inside the app, so nothing is downloaded for them.

**Retention and deletion.** Local data is kept until the user deletes it. **Privacy & data → Delete all my data** erases the whole record, including consent, and starts over from the story. **Don't save this game** on the summary removes that game and undoes what it fed the monster. **Start a new monster** resets the monster but keeps pledges. Uninstalling the app (and clearing its app-data folder) also removes everything.

**SDK network use and telemetry.** The SmartSpectra SDK connects to Presage over TLS to validate the API key and meter usage. It can also send an aggregate, per-session diagnostic summary (SDK version, OS/device model, frame-rate and quality counters, error codes) that by Presage's documentation contains no video, no measured values and no user or device identifiers ([SDK Telemetry & Privacy](https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md)). The SDK turns this on by default; **Smile Monster turns it off** (`enableTelemetry: false`) unless the user opts in on the consent screen or in Privacy & data. See [Presage's Privacy Policy](https://api.physiology.presagetech.com/privacypolicy).

**AI services.** None. The "learns your humour" feature is a small counting model in the app, not an AI service. The SDK's optional LLM Insights feature is not used.

**Payments.** None. The player never pays anything. Smile Monster records pledges and the donations the user marks as confirmed. Sponsors donate to the charity directly.

## Project structure

```
main.js                 Electron main: window, SmartSpectra IPC bridge, camera-only permission
renderer.js             Screens (story, home, game, summary, settings), SmartSpectra wiring, live mirroring
src/monster.js          Five levels, XP, traits from the joke diet, names, the monster SVG
src/world.js            The world SVG, from grey (tier 0) to fully restored (tier 5)
src/music.js            Original looping background music (Web Audio scheduler)
src/audio.js            Shared audio context with separate music and sound-effect buses
src/signals.js          Signal monitor, blink edges, talking flag, breathing normaliser
src/smile-detector.js   Expression stream → qualifying smiles (hysteresis)
src/pledges.js          Sponsor caps, session pledge, confirmed donations, CSV statement
src/store.js            The single local record, migration of older saves, wipe
src/joy-reel.js         Built-in cards, grouped by kind
src/humour.js           Learns which kind of card makes you smile (in memory only)
src/monster-voice.js    What the monster says, and when
src/sounds.js           Sound effects (no files)
src/receipt.js          Draws the Smile Receipt PNG
src/simulator.js        UI-only fake signal for `npm run simulate`
test/                   node:test unit tests
```

## License

MIT for the Smile Monster code. The SmartSpectra SDK is licensed separately by Presage Technologies; see its package's LICENSE.
