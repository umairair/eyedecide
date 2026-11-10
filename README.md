# eyedecide

A higher-or-lower game you play with your eyes. Two pictures, one question ("Richer?", "Who's older?", "More views?"). Look at your answer and hold until it fills up. No mouse needed, though the mouse and arrow keys work too.

Rebuilt from the [cuHacking 2025 original](https://github.com/umairair/cuhacking2025).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, press Start, allow the camera, follow the 3 dots. Everything runs in the browser; video never leaves the computer.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm test` | Unit tests, simulated-player tests and the tracking qualification suite |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run data` | Refresh the game data snapshots from their live sources (`npm run data steam` for one) |
| `npm run fetch-model` | Bundle the face model locally instead of loading it from Google |

## Game modes

Billionaire Battles (Forbes), Who's Older? (Wikidata), Follower Wars (Instagram and TikTok), YouTube Legends, Steam Wars (SteamCharts), Spotify Showdown, The Internet Is Weird (Wikipedia pageviews), Deadliest Things, The Price Is Insane, Animal Kingdom, Country Wars (World Bank), The Knowledge Test, and Shuffle.

Data ships as snapshots in `src/data/*.json`, built by `scripts/build-data.mjs` from the sources listed in `scripts/sources.mjs`.

Rounds get harder as your score climbs (measured by rank, so it feels the same in every mode), with a close call worth double points and a breather every five rounds. A card can win at most three times before it retires, and higher and lower answers come up about equally often.

## How the tracking works

Webcam frames go through MediaPipe Face Landmarker, then a pipeline in `src/core` that has no browser dependencies, so all of it is tested against a simulated player.

| Stage | File | Job |
| --- | --- | --- |
| Features | `tracking/faceFeatures.ts` | Head turn (3D pose, and an independent 2D estimate), both irises, eye blendshapes, plus posture readings |
| Fusion | `core/fusion.ts` | Redundant sensors vote; a sensor that disagrees is masked and flagged |
| Calibration | `core/calibration.ts` | 3 dots, Fisher discriminant that cancels body and camera wobble |
| Signal | `core/gaze.ts` | Spike filter, drift correction, smoothing, uncertainty estimate, blink and look-away gating |
| Picking | `core/dwell.ts` | Fills only as fast as the tracker is sure; commits only once it has been sure for 250 ms |
| Learning | `core/adapt.ts` | Every pick refines the calibration, behind acceptance checks |
| Watchdog | `core/watchdog.ts` | Notices when the calibration no longer fits (you sat up, moved the laptop) and asks for a quick re-setup |

`src/core/qualification.test.ts` states the requirements (no wrong picks, no picks while resting, faults isolated, no needless re-setups…) and checks them over simulated missions with faults injected mid-game. The simulations aren't a substitute for real webcams; real-world reports are welcome as issues.
