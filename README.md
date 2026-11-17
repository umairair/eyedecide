# eyedecide

**3rd place overall and the Wolfram Award at cuHacking 6 (2025).** Built solo in 36 hours, competing against 350+ participants, mostly in teams of four.

[Devpost](https://devpost.com/software/eyedecide-4dwxhn) · [Play it](https://eyedecide.vercel.app) (laptop or desktop with a webcam) · [Original hackathon code](https://github.com/umairair/cuhacking2025)

[![CI](https://github.com/umairair/eyedecide/actions/workflows/ci.yml/badge.svg)](https://github.com/umairair/eyedecide/actions/workflows/ci.yml)

eyedecide is a higher-or-lower trivia game you play with your eyes. Two cards, one question ("Richer?", "Who's older?", "More views?"): look at your answer and hold until the line closes around it. It runs on an eye and head tracking pipeline I wrote that works entirely in the browser with an ordinary webcam. No server is involved and no video leaves the machine.

This repository is a rebuild of the hackathon version, with the tracker split out into a framework-free, tested core.

## Stack

React 18 · TypeScript (strict) · Vite · MediaPipe Face Landmarker (WASM, GPU with CPU fallback) · Vitest · GitHub Actions · Vercel

## How the tracking works

Webcam frames go through MediaPipe Face Landmarker. Everything after that lives in `src/core`, which has no browser dependencies, so the whole pipeline runs under test against a simulated player.

| Stage | File | Job |
| --- | --- | --- |
| Features | `tracking/faceFeatures.ts` | Head turn from the 3D pose and an independent 2D estimate, both irises, eye-look blendshapes, plus posture readings (position, distance, tilt) |
| Fusion | `core/fusion.ts` | The five left/right sensors vote in two groups (head, eyes). An outlier is masked that frame and flagged as faulted if it stays out of line |
| Calibration | `core/calibration.ts` | Three dots, then a Fisher discriminant over fused signal plus posture, so motion that moves several readings together (breathing, a wobbling laptop) cancels instead of reading as a look |
| Signal | `core/gaze.ts` | Spike rejection, drift correction (`drift.ts`), One Euro smoothing (`oneEuro.ts`), a per-frame uncertainty estimate, and blink and look-away gating |
| Picking | `core/dwell.ts` | A look fills at a rate scaled by how certain the tracker is, and only commits after 250 ms of being sure |
| Learning | `core/adapt.ts` | Every pick is a labelled example. The model is refitted during play, but a refit only goes live if it passes rate-limit, quality and regression checks against recent picks |
| Watchdog | `core/watchdog.ts` | Notices when the calibration no longer fits (you sat up, moved the laptop) and asks for a quick re-setup |

Holding your eyes shut for 1.4 s pauses the game (`core/eyes.ts`).

## Testing

`npm test` runs three suites:

- **`core.test.ts`**: unit tests for dwell, drift correction, filtering, question generation, round dealing, scoring pace and the shipped data.
- **`tracking.test.ts`**: a simulated player (`core/sim.ts`) with a head, two eyes and a laptop camera that all move, put through heavy breathing, slumping mid-game, glances at the keyboard and heavy eyelids.
- **`qualification.test.ts`**: eight written requirements (R1 to R8: no wrong picks, no picks while resting, faults isolated rather than obeyed, learning that contradicting clicks can't poison, no needless re-setups, and latency bounds) checked by Monte Carlo over missions with sensor faults injected mid-game. The current run prints 968 picks with 0 wrong, 0 false, a median of 1.68 s and a p95 of 1.81 s.

The simulation is a model of a real webcam, not a substitute for one, so the tests guard against regressions rather than prove real-world accuracy.

## Engineering notes

- **Frames never re-render React.** The tracker runs on its own `requestAnimationFrame` loop in `tracking/InputHub.ts`. Dwell progress is written straight to a CSS variable on each card (`useBinaryChoice` in `hooks.tsx`), and React only hears about it when the focused side changes.
- **One input everywhere.** Every screen is a left/right choice through the same hook, fed by gaze, the arrow keys or a click, so the mouse and keyboard work on every screen without separate code paths.
- **Camera start is race-safe.** Each start gets a session number, so a start overtaken by the player switching to the mouse mid permission prompt or mid model load never turns the camera on behind their back.
- **Load only what's needed.** MediaPipe is a dynamic import preloaded in the background, its WASM runtime is copied into `public/` on install instead of coming from a CDN, and flag images are emitted as separate files fetched on demand rather than inlined into the bundle.
- **No live APIs at runtime.** Question data ships as JSON snapshots built offline by `scripts/build-data.mjs` from the sources in `scripts/sources.mjs` (Forbes, Wikidata, Wikipedia pageviews, SteamCharts, World Bank and others). A source that fails keeps its previous snapshot.
- **Difficulty by rank.** Pairs are chosen by how far apart they rank within a deck, not by raw value, so the difficulty curve feels the same whether the question is about net worth or animal speed. Rounds get harder as the score climbs, with a close call worth double points and a breather every five rounds.

### Constraints the tests depend on

- A look takes 1.1 s to pick (`DWELL_MS` in `src/hooks.tsx`). The tracking tests failed at 850 and 750 ms, so the game speeds up through the clock and reveal timing in `core/pace.ts` instead.
- Each choice fills exactly half the screen. The tracker is tuned for cards a quarter in from each edge (`CARD` in `core/adapt.ts`).
- Everything you read is centred on the calibration height (`--eye` in `src/styles.css`) and kept off the bottom edge, where lowered lids hide the eyes from the camera.

## Run it

Developed and tested on Node 22, the version CI uses.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 on a laptop or desktop, press play, allow the camera and follow the three dots. Phones and tablets only get the info page.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm test` | All three test suites |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run data` | Refresh every data snapshot from its live source (`npm run data steam` for one) |
| `npm run fetch-model` | Bundle the face model into `public/models` instead of loading it from Google's model storage |

## Deployment

The app is static files with no backend and no environment variables. Vercel builds from GitHub using `vercel.json`: a push to `main` deploys to production and pull requests get preview URLs. GitHub Actions runs typecheck, tests and the build on every push and pull request, and Dependabot keeps npm packages and Actions current.

## Project layout

```
src/
  core/        tracking pipeline and game logic, pure TypeScript, plus tests
  tracking/    webcam, MediaPipe and the per-frame loop (InputHub)
  screens/     start, calibration, practice, game, pause, game over, info
  data/        question data snapshots and the decks built from them
  ui.tsx       shared layout pieces (stage, plate, halves)
  hooks.tsx    camera status, face-lost, recalibration and the left/right choice hook
scripts/       data snapshot builder, MediaPipe WASM copy, model download
```
