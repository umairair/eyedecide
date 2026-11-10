# eyedecide

Higher-or-lower game played with your eyes. Vite + React + TypeScript, MediaPipe face tracking.

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

- The two choices must each fill exactly half the screen. The tracker is tuned and tested for choices a quarter in from each edge (`CARD` in `src/core/adapt.ts`). Moving them makes the tracking tests fail.
- Everything you look at or read is centred on the eye line (`--eye` in `src/styles.css`, the height of the setup dots): words at 25% and 75% across, the plate at 50%. Keep readable things off the bottom edge.

## Style

Umair's taste. Get this right the first time.

**Look**
- Pitch black, white text, grey for anything secondary. System font. Rounded, soft, frosted. Think ChatGPT on an iPhone.
- No colour except green and red for right and wrong. No emoji. No icons where a word will do. No sharp rectangles.
- Nothing decorative. If it doesn't help someone play, it goes.

**Words in the game**
- Lowercase, one or two plain words: `play`, `next`, `menu`, `again`, `recalibrate`, `about`.
- No taglines, no helper sentences, no reassurance copy, no hints. If a control needs explaining, redesign it.
- Say what is happening, plainly. `recalibrating`, not `lost track`.

**Sentences (the about page, anything longer)**
- Write like a person talking, in full flowing sentences. Sentence case, real names capitalised (`cuHacking 6`, `Wolfram Award`, `Umair`).
- Join related thoughts with a comma instead of chopping them into short sentences. One period at the end.
- Never: clipped fragments ("two things. one question."), haiku-style line lists, labelled feature rows (`pick`, `pause`, `local`), salesy or techbro phrasing, em-dashes.
- Humble. "to showcase it", not "to show it off". State facts and stop.
- Don't explain what should be obvious. Clicking works everywhere and is never mentioned.
- Signed `- Umair`. Links: devpost and linkedin, not github.

**Controls**
- As few as possible. There is no settings screen and no sound. One floating bar at the bottom middle: `menu` (in a game), `recalibrate`, `about`.
- Never make the player configure anything.
