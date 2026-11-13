import { difficulty, pickPair, type Item, type Rng, type RoundKind } from "./questions";
import type { Deck } from "../data/decks";

export interface Round {
  deck: Deck;
  left: Item;
  right: Item;
  kind: RoundKind;
  /** names dealt this game */
  seen: string[];
  /** rounds played before this one */
  n: number;
}

/** points for getting a round right */
export const pointsFor = (r: Round) => (r.kind === "close" ? 2 : 1);

/** Remembers recently seen items per deck (across games) so matchups don't repeat too soon. */
export class Recent {
  private keys: string[];
  constructor(
    private store: Pick<Storage, "getItem" | "setItem"> | null,
    private cap = 150,
  ) {
    try {
      this.keys = JSON.parse(store?.getItem(KEY) ?? "[]");
      if (!Array.isArray(this.keys)) this.keys = [];
    } catch {
      this.keys = [];
    }
  }
  names(deck: Deck) {
    const p = `${deck.id}|`;
    return new Set(this.keys.filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)));
  }
  add(deck: Deck, ...items: Item[]) {
    const add = items.map((i) => `${deck.id}|${i.name}`);
    this.keys = [...this.keys.filter((k) => !add.includes(k)), ...add].slice(-this.cap);
    try {
      this.store?.setItem(KEY, JSON.stringify(this.keys));
    } catch {
      /* storage full or blocked: memory just won't persist */
    }
  }
}
const KEY = "eyedecide.recent";

/** decks on one subject share an id prefix ("countries-pop", "countries-gdp") */
export const subjectOf = (d: Deck) => d.id.split("-")[0];

/**
 * A different subject from last time. Picks the subject first, so one with
 * ten stats (countries) comes up as often as one with a single deck.
 */
function pickDeck(decks: Deck[], avoid: Deck | null, rng: Rng) {
  const playable = decks.filter((d) => d.items.length >= 2);
  const subjects = [...new Set(playable.map(subjectOf))];
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  if (subjects.length > 1) {
    const s = pick(avoid ? subjects.filter((x) => x !== subjectOf(avoid)) : subjects);
    return pick(playable.filter((d) => subjectOf(d) === s));
  }
  return pick(playable.length > 1 && avoid ? playable.filter((d) => d.id !== avoid.id) : playable);
}

/** Avoid anything seen this game or recently; once a deck runs dry, allow repeats again. */
function usedSet(deck: Deck, recent: Recent, seen: string[]) {
  const used = new Set([...recent.names(deck), ...seen]);
  return used.size >= deck.items.length - 2 ? new Set(seen.slice(-Math.floor(deck.items.length / 2))) : used;
}

/** a new question and a new pair, at the difficulty the score has earned */
function deal(decks: Deck[], score: number, recent: Recent, prev: Round | null, rng: Rng): Round {
  const deck = pickDeck(decks, prev?.deck ?? null, rng);
  const n = prev ? prev.n + 1 : 0;
  const d = difficulty(score, n);
  const seen = prev?.seen ?? [];
  // neither of the last round's cards comes straight back
  const out = new Set(prev && prev.deck.id === deck.id ? [prev.left.name, prev.right.name] : []);
  const pool = deck.items.filter((x) => !out.has(x.name));
  const [a, b] = pickPair(pool, d, usedSet(deck, recent, seen), rng);
  recent.add(deck, a, b);
  const aLeft = rng() < 0.5;
  return { deck, left: aLeft ? a : b, right: aLeft ? b : a, kind: d.kind, seen: [...seen, a.name, b.name], n };
}

export function firstRound(decks: Deck[], recent: Recent, rng: Rng = Math.random): Round {
  return deal(decks, 0, recent, null, rng);
}

/** Every round asks something new: a different subject from the last, and a fresh pair. */
export function nextRound(decks: Deck[], prev: Round, score: number, recent: Recent, rng: Rng = Math.random): Round {
  return deal(decks, score, recent, prev, rng);
}
