/**
 * How fast a game runs and what a streak is worth.
 *
 * Every round is on a clock. Right answers build heat, quick ones twice as
 * fast, and heat sets the multiplier every point is scored at. One miss, or
 * the clock running out, and the heat is gone.
 */

/** heat needed for ×1, ×2, ×3 … */
export const TIERS = [0, 3, 7, 12, 18];
export const MAX_MULT = TIERS.length;

export const multiplier = (heat: number) => Math.max(1, TIERS.filter((t) => heat >= t).length);

/** an answer with at least this much of the clock left counts as quick */
export const QUICK = 0.5;

/** heat for a right answer, given the fraction of the clock that was left */
export const heatFor = (left: number) => (left >= QUICK ? 2 : 1);

/**
 * Milliseconds on the clock for round `n` (0 = first). It tightens as the run
 * goes on. Mixed modes ask a new question every round, so they get longer to read it.
 */
export function clockFor(n: number, mixed = false) {
  const [start, floor] = mixed ? [8000, 4500] : [7000, 3500];
  return Math.max(floor, start - 250 * n);
}

/** how long the answer stays up before the next round */
export const REVEAL_MS = { right: 850, wrong: 1400 } as const;
