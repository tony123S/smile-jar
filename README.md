# Smile Jar 🫙😊

**Turn smiles into donations.** Friends, family or coworkers pledge an amount per smile (say 10¢, capped at $10). You sit down for a two-minute Smile Session of jokes, tiny happy facts or your own uplifting clip, and the [Presage SmartSpectra SDK](https://github.com/Presage-Security/SmartSpectra)'s **live facial-expression signal** counts each real smile into a jar for the cause you picked. At the end you export a pledge statement and send it to your sponsors.

Built for the DEV Presage Challenge (`#presagechallenge`).

- **Live Presage signal used:** facial expressions (`EXPRESSIONS`, the HAPPY score), from the SDK's face bundle.
- **Optional second signal:** live pulse rate (`PULSE_RATE`, cardio bundle), shown just for fun.
- **Platform:** desktop Electron app (macOS Apple Silicon, Windows x64, Linux x64/arm64) using `@smartspectra/node-sdk`.
- **No login, no payments, no server.** Smile Jar tracks pledges; sponsors donate directly to the cause.

> Smile Jar is a game. It does not diagnose, treat or assess anyone's health or emotional state.

## How it works

```
camera ──► SmartSpectra SDK (renderer captures frames, main process analyses them on-device)
                │  'metrics' event (protobuf)
                ▼
        decodeMetrics(buf).face.expression[]   ← { stable, timestamp, scores[{type, confidence}] }
                │
                ▼
        SmileDetector (src/smile-detector.js)
          HAPPY ≥ 60% held 0.5 s  → +1 smile
          then HAPPY < 35% for 0.7 s before the next one can count
                │
                ▼
        pledges.js  → coin drops into the jar, sponsor caps applied
```

The SDK integration is in [`renderer.js`](renderer.js) (`buildSdk`, `wireSdk`, `handleMetrics`) and [`main.js`](main.js) (`bindSmartSpectraIpc`). The hysteresis in `SmileDetector` means one long grin counts once, a flicker doesn't count, and you have to actually relax and smile again to add another coin. That's what makes a smile "genuine" here: sustained and deliberate, not a single noisy frame. (We don't claim to tell real from fake smiles beyond that.)

## Setup

**You need:** Node.js 22.12+ (24 LTS recommended), a webcam, and a free SmartSpectra API key from <https://physiology.presagetech.com/>.

```bash
git clone <this repo>
cd smile-jar
npm install                 # pulls @smartspectra/node-sdk and its native runtime (a few hundred MB, all platforms)
cp .env.example .env        # then paste your key: SMARTSPECTRA_API_KEY=...
npm start                   # bundles the renderer and launches Electron
```

The key is read at build time from `.env` (or the `SMARTSPECTRA_API_KEY` environment variable) and baked into `dist/`, which is git-ignored. Don't commit `.env` or `dist/`.

### Testing guide for judges

1. `npm start`. The consent screen appears first. Tick the agreement box and press **Open the jar**. (The diagnostics box is optional and off by default.)
2. On the home screen the campaign is pre-filled with a cause and two example sponsors. Edit anything you like.
3. Press **Start a Smile Session**. The OS may ask for camera permission. The hint at the bottom of the preview tells you when the SDK is running and whether your face is well placed.
4. Read the cards and smile. Watch the **Live smile signal** bar (the raw HAPPY score from the SDK) cross the marker, and a coin drop into the jar for each counted smile.
5. Press **End session** (or wait for the timer). The camera turns off and you see the summary. Back on the home screen, try **Export pledge statement (CSV)**.
6. Open **Privacy & data** and press **Delete all my data** to see the wipe.

Want to see pulse too? Tick **Also show live pulse** on the home screen before starting. This needs an API key provisioned for cardio metrics. If yours isn't, leave it off; smiles work without it.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the smile detector and pledge math (no camera needed) |
| `npm run simulate` | Launches the UI with a **fake** expression signal (hold Space to smile). A yellow banner says so. For UI work only; the real app never uses it |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Packaged installers via electron-builder |

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No SmartSpectra API key in this build" | Create `.env` from `.env.example` and run `npm start` again |
| SmartSpectra error 2 (authentication) | Key is wrong or revoked. Check it at physiology.presagetech.com |
| SmartSpectra error 4 (credits) | Your Presage plan is out of credits |
| App exits instantly from a VS Code terminal | Run `env -u ELECTRON_RUN_AS_NODE npm start` |
| Hint says "can't see a face" / "too dark" | These come straight from the SDK's validation status. Face the camera with light in front of you |
| Smiles not counting | Watch the signal bar: it needs to pass the marker (60%) for half a second, then drop back down before the next smile |

## Consent and Data Handling

**Camera consent.** The app opens on a consent screen that explains the points below and requires the user to tick an agreement before anything else is available. The camera is never opened on that screen or on the home screen. It is opened by the SDK only when the user presses **Start a Smile Session**, and it is released when the session ends, the timer runs out, the user deletes their data, or the window closes. A "Camera on, nothing recorded" badge is shown while it's live, alongside the OS camera indicator. The Electron main process grants only video (never the microphone) and only to the app's own bundled page. The consent text asks users to count only their own smiles or those of people who knowingly agreed to take part; the app is not designed for, and must not be used for, covert monitoring.

**What is processed.** Camera frames are passed from the renderer to the SmartSpectra SDK running inside the app's main process, analysed on the device, and discarded. Smile Jar reads only the expression scores (and the pulse value if the user turned pulse on), uses them in memory to update the meter and the smile counter, and then drops them.

**What is stored.** One record in the app's local storage on this device (`smilejar.v1`), containing: the consent version and the time it was given; settings (session length, pulse on/off, diagnostics on/off); the cause name and goal; sponsor names, rates and caps as typed by the user; and per-session totals (end time, duration, number of smiles, pledged amount).

**What is never stored or sent by Smile Jar.** Video, images, screenshots, face landmarks, expression scores, pulse values, or any biometric data. A video clip the user chooses to play is opened from their disk through a temporary local URL and is never copied or uploaded.

**Sharing.** None. Smile Jar has no backend, no account, no analytics and no ads. The only data that leaves the app is the pledge statement CSV, and only when the user exports it and sends it to someone themselves. It contains the cause, sponsor names and amounts, and session dates and smile counts.

**Retention and deletion.** Local data is kept until the user deletes it. **Privacy & data → Delete all my data** erases the whole record, including consent, and returns to the consent screen. A single session can be discarded from its summary screen with **Don't save this session**. Uninstalling the app (and clearing its app-data folder) also removes it.

**SDK network use and telemetry.** The SmartSpectra SDK connects to Presage over an authenticated TLS channel to validate the API key and meter usage. It can also send an aggregate, per-session diagnostic summary (SDK version, OS/device model, frame-rate and quality counters, error codes) that by Presage's documentation contains no video, no measured values and no user or device identifiers ([SDK Telemetry & Privacy](https://github.com/Presage-Security/SmartSpectra/blob/main/docs/telemetry-and-privacy.md)). The SDK turns this on by default; **Smile Jar turns it off** (`enableTelemetry: false`) unless the user opts in on the consent screen or in Privacy & data. See [Presage's Privacy Policy](https://api.physiology.presagetech.com/privacypolicy).

**AI services.** None. The SDK's optional LLM Insights feature is not used.

**Payments.** None. Smile Jar never handles money. Sponsors donate to the cause directly.

## Project structure

```
main.js                 Electron main: window, SmartSpectra IPC bridge, camera-only permission
renderer.js             UI + SmartSpectra renderer SDK wiring
src/smile-detector.js   Expression stream → counted smiles (hysteresis)
src/pledges.js          Sponsor caps, per-session pledge, CSV statement
src/store.js            The single local record (and wipe)
src/joy-reel.js         Built-in jokes, facts and prompts
src/simulator.js        UI-only fake signal for `npm run simulate`
test/                   node:test unit tests
```

## License

MIT for the Smile Jar code. The SmartSpectra SDK is licensed separately by Presage Technologies; see its package's LICENSE.
