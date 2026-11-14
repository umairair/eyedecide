# eyedecide

Trivia game played with your eyes. One game, no modes and no menu: setup goes straight into the first question, and every round asks something new. Vite + React + TypeScript, MediaPipe face tracking.

## Git

This folder is a clone of `github.com/umairair/eyedecide`. Use git for everything.

- Check `git status` before starting. Pull first.
- Commit after each working change, small and often. Never leave a session with uncommitted work.
- Push to `origin` when a piece of work is done.
- Run `npm test` and `npm run build` before pushing.

## Deploy

Vercel builds from GitHub. There is no other way to ship.

- Every change is committed and pushed. A push to `main` is a production deploy.
- Any other branch or pull request gets its own preview URL.
- Never deploy from the laptop with the Vercel CLI: what is live must always be what is on GitHub.
- Build settings live in `vercel.json`. No server, no environment variables: it is static files.

## Commands

- `npm run dev` dev server on 5173
- `npm test` unit tests, simulated players, tracking qualification
- `npm run build` typecheck and build into `dist/`

## Rules that are easy to break

- A look takes 1.1 s to pick (`DWELL_MS` in `src/hooks.tsx`) and the tracking tests are tuned to it: they failed at 850 and 750 ms. Make the game faster with the clock and the reveal (`src/core/pace.ts`), not the dwell.
- The two choices must each fill exactly half the screen. The tracker is tuned and tested for choices a quarter in from each edge (`CARD` in `src/core/adapt.ts`). Moving them makes the tracking tests fail.
- Everything you look at or read is centred on the eye line (`--eye` in `src/styles.css`, the height of the setup dots): words at 25% and 75% across, the plate at 50%. Keep readable things off the bottom edge.

## Style

Umair's taste. Get this right the first time.

**Look**
- Pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone.
- No colour except green and red for right and wrong, and heat (below). No emoji. No icons where a word will do. No sharp rectangles.
- Heat is the one splash of colour, and only inside a game: a single gradient whose hue is the streak multiplier (blue, violet, pink, gold). It is drawn on the clock line round the plate, the line a look draws, a glow behind the plate and the points as they land, and nowhere else. It never uses green or plain red. See "heat" in `src/styles.css`.
- Nothing decorative. If it doesn't help someone play, it goes.

**Words in the game**
- Lowercase, one or two plain words: `play`, `again`, `resume`, `recalibrate`, `info`.
- No taglines, no helper sentences, no reassurance copy, no hints. If a control needs explaining, redesign it.
- Say what is happening, plainly. `recalibrating`, not `lost track`.

**Sentences (the info page, anything longer)**
- Write like a person talking, in full flowing sentences. Sentence case, real names capitalised (`cuHacking 6`, `Wolfram Award`, `Umair`).
- Join related thoughts with a comma instead of chopping them into short sentences. One period at the end.
- Never: clipped fragments ("two things. one question."), haiku-style line lists, labelled feature rows (`pick`, `pause`, `local`), salesy or techbro phrasing, em-dashes.
- Humble. "to showcase it", not "to show it off". State facts and stop.
- Don't explain what should be obvious. Clicking works everywhere and is never mentioned.
- Signed `- Umair`. Links: devpost and linkedin, not github.

**Controls**
- As few as possible. There is no settings screen and no sound. `info` floats at the bottom middle. When a game is over the two choices are `recalibrate` on the left, which redoes the camera setup, and `again` on the right.
- Never make the player configure anything.
- Phones and tablets don't get the game (`handheld` in `src/device.ts`): the front door says `play on a laptop or desktop` and `info` is the one button, so the info page still opens for anyone on a phone.
