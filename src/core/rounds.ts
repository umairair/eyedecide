import type { Side } from "./dwell";
import { difficulty, pickChallenger, pickPair, type Item, type Rng, type RoundKind } from "./questions";
import type { Deck, Mode } from "../data/modes";

export interface Round {
  deck: Deck;
  left: Item;
  right: Item;
  /** this side's number is showing from the start */
  known: Side | null;
  kind: RoundKind;
  /** how many rounds in a row the known card has survived */
  reign: number;
  /** was the new card higher, in recent rounds (newest last): keeps the answer from being guessable */
  trend: boolean[];
  /** the champion that just retired to make room for this pair */
  retired?: string;
  /** names dealt this game */
  seen: string[];
  /** rounds played before this one */
  n: number;
}

/** a card can defend its spot this many times, then it retires */
export const MAX_REIGN = 3;

/** points for getting a round right */
export const pointsFor = (r: Round) => (r.kind === "close" ? 2 : 1);

/** Remembers recently seen items per deck (across games) so matchups don't repeat too soon. */
export class Recent {
  private keys: string[];
  constructor(
    private store: Pick<Storage, "getItem" | "setItem"> | null,
    private modeId: string,
    private cap = 150,
  ) {
    try {
      this.keys = JSON.parse(store?.getItem(this.key) ?? "[]");
      if (!Array.isArray(this.keys)) this.keys = [];
    } catch {
      this.keys = [];
    }
  }
  private get key() {
    return `eyedecide.recent.${this.modeId}`;
  }
  names(deck: Deck) {
    const p = `${deck.id}|`;
    return new Set(this.keys.filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)));
  }
  add(deck: Deck, ...items: Item[]) {
    const add = items.map((i) => `${deck.id}|${i.name}`);
    this.keys = [...this.keys.filter((k) => !add.includes(k)), ...add].slice(-this.cap);
    try {
      this.store?.setItem(this.key, JSON.stringify(this.keys));
    } catch {
      /* storage full or blocked: memory just won't persist */
    }
  }
}

const playable = (mode: Mode) => mode.decks.filter((d) => d.items.length >= 2);

/** decks from one mode share an id prefix ("countries-pop", "countries-gdp") */
const groupOf = (d: Deck) => d.id.split("-")[0];

/**
 * A different deck from last time. Picks the group first, so in Shuffle a
 * mode with ten stats (Country Wars) comes up as often as one with a single deck.
 */
function pickDeck(mode: Mode, avoid: Deck | null, rng: Rng) {
  const decks = playable(mode);
  const groups = [...new Set(decks.map(groupOf))];
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  if (groups.length > 1) {
    const g = pick(avoid ? groups.filter((x) => x !== groupOf(avoid)) : groups);
    return pick(decks.filter((d) => groupOf(d) === g));
  }
  const options = decks.length > 1 && avoid ? decks.filter((d) => d.id !== avoid.id) : decks;
  return pick(options);
}

/** Avoid anything seen this game or recently; once a deck runs dry, allow repeats again. */
function usedSet(deck: Deck, recent: Recent, seen: string[]) {
  const used = new Set([...recent.names(deck), ...seen]);
  return used.size >= deck.items.length - 2 ? new Set(seen.slice(-Math.floor(deck.items.length / 2))) : used;
}

/** a new pair; single-deck modes show the first card's number, like the classic */
function freshPair(
  mode: Mode,
  deck: Deck,
  score: number,
  recent: Recent,
  prev: Round | null,
  rng: Rng,
  retired?: string,
): Round {
  const n = prev ? prev.n + 1 : 0;
  const d = difficulty(score, n);
  const seen = prev?.seen ?? [];
  // a fresh pair is fresh: neither of the last round's cards (including a retiree) comes straight back
  const out = new Set(prev && prev.deck.id === deck.id ? [prev.left.name, prev.right.name, retired] : [retired]);
  const pool = deck.items.filter((x) => !out.has(x.name));
  const [a, b] = pickPair(pool, d, usedSet(deck, recent, seen), rng);
  recent.add(deck, a, b);
  const aLeft = rng() < 0.5;
  return {
    deck,
    left: aLeft ? a : b,
    right: aLeft ? b : a,
    known: mode.mixed ? null : aLeft ? "left" : "right",
    kind: d.kind,
    reign: 0,
    trend: [...(prev?.trend ?? []), b.value > a.value].slice(-4),
    seen: [...seen, a.name, b.name],
    n,
  };
}

export function firstRound(mode: Mode, recent: Recent, rng: Rng = Math.random): Round {
  return freshPair(mode, pickDeck(mode, null, rng), 0, recent, null, rng);
}

/**
 * What to ask for next: higher or lower. A coin flip, except it never lets
 * the same answer come up three times running, so "the new one is always
 * bigger" can't become a strategy.
 */
function direction(trend: boolean[], rng: Rng) {
  const [a, b] = trend.slice(-2);
  if (trend.length >= 2 && a === b) return !a;
  return rng() < 0.5;
}

/**
 * Single-deck modes: the winner stays and gets a fresh challenger, with
 * three rules that stop it turning into a loop:
 *  - the challenger is equally likely to be higher or lower (balanced, see `direction`)
 *  - a champion near the top or bottom that can't be challenged both ways retires
 *  - any champion retires after MAX_REIGN defences
 * Mixed modes deal a new deck and pair every round.
 */
export function nextRound(mode: Mode, prev: Round, score: number, recent: Recent, rng: Rng = Math.random): Round {
  if (mode.mixed) return freshPair(mode, pickDeck(mode, prev.deck, rng), score, recent, prev, rng);
  const { deck } = prev;
  const winner: Side = prev.left.value > prev.right.value ? "left" : "right";
  const champ = prev[winner];
  const reign = prev.known === winner ? prev.reign + 1 : 1;
  const retire = (name: string) => ({ ...freshPair(mode, deck, score, recent, prev, rng, name), retired: name });
  if (reign > MAX_REIGN) return retire(champ.name);

  const d = difficulty(score, prev.n + 1);
  const higher = direction(prev.trend, rng);
  // nothing fresh on the side we need (an extreme champion): bring in someone new instead of a rerun
  const next = pickChallenger(deck.items, champ, d, higher, usedSet(deck, recent, prev.seen), rng, false);
  if (!next) return retire(champ.name);

  recent.add(deck, next);
  const round: Omit<Round, "left" | "right" | "known"> = {
    deck,
    kind: d.kind,
    reign,
    trend: [...prev.trend, next.value > champ.value].slice(-4),
    seen: [...prev.seen, next.name],
    n: prev.n + 1,
  };
  return winner === "left"
    ? { ...round, left: champ, right: next, known: "left" }
    : { ...round, left: next, right: champ, known: "right" };
}

/** Warm the browser cache so the next card's picture is there when it's dealt. */
export function preload(...items: Item[]) {
  for (const it of items) {
    const src = it.images?.[0] ?? it.image;
    if (src) new Image().src = src;
  }
}
