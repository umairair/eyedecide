# eyedecide

Higher-or-lower game played with your eyes. Vite + React + TypeScript, MediaPipe face tracking.

## Git

This folder is a clone of `github.com/umairair/eyedecide`. Use git for everything.

- Check `git status` before starting. Pull first.
- Commit after each working change, small and often. Never leave a session with uncommitted work.
- Push to `origin` when a piece of work is done.
- Run `npm test` and `npm run build` before pushing.

## Commands

- `npm run dev` dev server on 5173
- `npm test` unit tests, simulated players, tracking qualification
- `npm run build` typecheck and build into `dist/`

## Rules that are easy to break

- The two choices must each fill exactly half the screen. The tracker is tuned and tested for choices a quarter in from each edge (`CARD` in `src/core/adapt.ts`). Moving them makes the tracking tests fail.
- Everything you look at or read is centred on the eye line (`--eye` in `src/styles.css`, the height of the setup dots): words at 25% and 75% across, the plate at 50%. Keep readable things off the bottom edge.
- UI copy: lowercase, one to three words, no emoji, no helper sentences.
- Look: black, white, rounded, system font. No colour except green and red for right and wrong.
