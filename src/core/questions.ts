export interface Item {
  name: string;
  value: number;
  /** ISO 3166 code, for flags */
  code?: string;
  emoji?: string;
  /** picture URL */
  image?: string;
  /** picture URLs to try in order (e.g. a 4K thumbnail, then a smaller one) */
  images?: string[];
  /** short context line: channel, peak month, source and year… */
  sub?: string;
}

export type Rng = () => number;

/**
 * What kind of round this is. The curve is a sawtooth, not a ramp: it climbs,
 * spikes with a close call, then gives a breather before climbing again.
 */
export type RoundKind = "normal" | "close" | "breather";

export interface Difficulty {
  kind: RoundKind;
  /** how far apart the two cards sit, as a fraction of the deck's ranking (0 = neighbours, 1 = top vs bottom) */
  lo: number;
  hi: number;
}

/**
 * Difficulty is measured in *rank*, not raw ratio, so it means the same in
 * every deck: two people a year apart in age are as close as two videos 5%
 * apart in views, even though the ratios differ wildly.
 *
 *   score 0   cards ~35-90% of the deck apart (obvious, builds confidence)
 *   score 10  ~9-23%
 *   score 25+ ~4-11% (genuinely hard)
 * every 5 rounds: a close call (≤4% apart) then a breather (easier for one round)
 */
export function difficulty(score: number, round = score): Difficulty {
  // `round` counts rounds played: close calls are worth 2, so the score skips
  const phase = round % 5;
  if (round >= 8 && phase === 3) return { kind: "close", lo: 0, hi: 0.04 };
  if (round >= 9 && phase === 4) return { ...band(Math.max(0, score - 8)), kind: "breather" };
  return { ...band(score), kind: "normal" };
}

function band(score: number) {
  const lo = 0.04 + 0.31 * Math.exp(-score / 5);
  return { lo, hi: Math.min(0.95, lo + 0.07 + 0.5 * Math.exp(-score / 6)) };
}

/** Ranking of a deck's items, smallest first, shared between rounds. */
export class Ranking {
  readonly items: Item[];
  private pos = new Map<string, number>();
  constructor(pool: Item[]) {
    this.items = [...pool].sort((a, b) => a.value - b.value);
    this.items.forEach((x, i) => this.pos.set(x.name, i));
  }
  /** 0 (smallest) … 1 (largest) */
  rank(it: Item) {
    return (this.pos.get(it.name) ?? 0) / Math.max(1, this.items.length - 1);
  }
}

const cache = new WeakMap<Item[], Ranking>();
export const ranking = (pool: Item[]) => {
  let r = cache.get(pool);
  if (!r) cache.set(pool, (r = new Ranking(pool)));
  return r;
};

/** values this close are a coin flip on rounded source data: never ask them */
const MIN_RATIO = 1.01;
const distinct = (a: Item, b: Item) => Math.max(a.value, b.value) / Math.min(a.value, b.value) >= MIN_RATIO;

/**
 * Picks an opponent for `champion` at the given difficulty, on the requested
 * side of it (`higher` true = the challenger should be bigger). Returns null
 * when nothing fits: the caller retires the champion instead of falling back
 * to a predictable matchup.
 */
export function pickChallenger(
  pool: Item[],
  champion: Item,
  d: Difficulty,
  higher: boolean | null,
  used: Set<string>,
  rng: Rng = Math.random,
  allowUsed = true,
): Item | null {
  const r = ranking(pool);
  const at = r.rank(champion);
  const fits = (x: Item, widen: number) => {
    if (x.name === champion.name || !distinct(x, champion)) return false;
    const gap = r.rank(x) - at;
    if (higher !== null && gap > 0 !== higher) return false;
    const g = Math.abs(gap);
    return g >= d.lo / widen && g <= Math.min(1, d.hi * widen);
  };
  // A card you've already seen this game is worse than a slightly easier one:
  // widen the band for fresh cards first, repeat only as a last resort.
  const steps: [number, boolean][] = [[1, false], [1.5, false], [2.2, false], [3.5, false], [1, true], [2.2, true]];
  for (const [widen, repeat] of steps) {
    if (repeat && !allowUsed) break;
    const c = r.items.filter((x) => (repeat || !used.has(x.name)) && fits(x, widen));
    if (c.length) return c[Math.floor(rng() * c.length)];
  }
  return null;
}

/**
 * A fresh pair at the given difficulty. The first card comes from the middle
 * of the ranking, so the second can land on either side of it.
 */
export function pickPair(pool: Item[], d: Difficulty, used: Set<string>, rng: Rng = Math.random): [Item, Item] {
  const r = ranking(pool);
  const n = r.items.length;
  const middle = r.items.filter((x) => {
    const k = r.rank(x);
    return k >= 0.12 && k <= 0.88;
  });
  const starters = [middle.filter((x) => !used.has(x.name)), middle, r.items].find((c) => c.length >= 1)!;
  for (let tries = 0; tries < 12; tries++) {
    const a = starters[Math.floor(rng() * starters.length)];
    const b = pickChallenger(pool, a, d, rng() < 0.5, used, rng) ?? pickChallenger(pool, a, d, null, used, rng);
    if (b) return [a, b];
  }
  // tiny or degenerate deck: any two different values
  const a = r.items[0];
  return [a, r.items.find((x) => distinct(x, a)) ?? r.items[n - 1]];
}
