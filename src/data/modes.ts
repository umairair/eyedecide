import type { Item } from "../core/questions";
import { FORMATS, kg, kmh, type FormatName } from "../core/format";

const ANIMAL_FORMATS: Record<string, (v: number) => string> = { kg, kmh };
// snapshots made by `npm run data` (see scripts/build-data.mjs)
import spotify from "./spotify.json";
import social from "./social.json";
import older from "./older.json";
import animals from "./animals.json";
import steam from "./steam.json";
import billionaires from "./billionaires.json";
import youtube from "./youtube.json";
import wikipedia from "./wikipedia.json";
import countries from "./countries.json";
import deadliest from "./deadliest.json";
import prices from "./prices.json";
import knowledge from "./knowledge.json";

export type Picture = "flag" | "emoji" | "cover" | "photo" | "wide";

/** One kind of comparison: what's asked, how it's shown, and the pool to draw from. */
export interface Deck {
  id: string;
  /** label in the HUD chip for modes that mix topics */
  topic?: string;
  question: string;
  /** small line under the number; empty to hide */
  unit: string;
  picture: Picture;
  format: (v: number) => string;
  countUp?: boolean;
  /** credit line, e.g. "SteamCharts · Nov 2026" */
  source?: string;
  /** item.sub is a data year: show it on the unit line instead of under the name */
  datedSub?: boolean;
  items: Item[];
}

export interface Mode {
  id: string;
  title: string;
  /** 2-4 words for the menu */
  tagline: string;
  color: string;
  decks: Deck[];
  /** every round picks a random deck and a fresh pair (otherwise the winner stays) */
  mixed?: boolean;
  /** names of items shown in the menu collage */
  cover: string[];
}

interface Snapshot {
  source: string;
  asOf: string;
  decks: { id: string; topic?: string; question?: string; unit?: string; format?: string; source?: string; items: Item[] }[];
}
const credit = (s: Snapshot, src = s.source) => [src, s.asOf].filter(Boolean).join(" · ");
const items = (s: Snapshot) => s.decks[0].items;
const fmt = (name?: string) => FORMATS[(name ?? "big") as FormatName] ?? FORMATS.big;

const single = (d: Omit<Deck, "format"> & { format?: Deck["format"] }): Deck[] => [{ format: FORMATS.big, ...d }];

/** in menu order: the most instantly fun first */
export const MODES: Mode[] = [
  {
    id: "billionaires",
    title: "Billionaire Battles",
    tagline: "Net worth",
    color: "#eab308",
    cover: ["Elon Musk", "Jeff Bezos", "Warren Buffett", "Bernard Arnault"],
    decks: single({
      id: "billionaires",
      question: "Richer?",
      unit: "net worth",
      picture: "photo",
      format: FORMATS.usd,
      source: credit(billionaires, "Forbes"),
      items: items(billionaires),
    }),
  },
  {
    id: "older",
    title: "Who's Older?",
    tagline: "Celebrity birthdays",
    color: "#f97316",
    cover: ["Keanu Reeves", "Taylor Swift", "Jennifer Aniston", "Cristiano Ronaldo"],
    decks: single({
      id: "older",
      question: "Who's older?",
      unit: "born",
      picture: "photo",
      format: FORMATS.born,
      countUp: false,
      source: "Wikidata",
      items: items(older as Snapshot),
    }),
  },
  {
    id: "social",
    title: "Follower Wars",
    tagline: "Instagram and TikTok",
    color: "#e1306c",
    mixed: true,
    cover: ["Cristiano Ronaldo", "Selena Gomez", "Khaby Lame", "MrBeast"],
    decks: (social as Snapshot).decks.map((d) => ({
      id: `social-${d.id}`,
      topic: d.topic,
      question: d.question!,
      unit: d.unit!,
      picture: "photo" as const,
      format: FORMATS.big,
      source: credit(social as Snapshot, d.source),
      items: d.items,
    })),
  },
  {
    id: "youtube",
    title: "YouTube Legends",
    tagline: "Total views",
    color: "#ef4444",
    cover: ["Gangnam Style", "Despacito", "Never Gonna Give You Up", "Baby Shark Dance"],
    decks: single({
      id: "youtube",
      question: "More views?",
      unit: "views",
      picture: "wide",
      source: credit(youtube),
      items: items(youtube),
    }),
  },
  {
    id: "steam",
    title: "Steam Wars",
    tagline: "All-time peak players",
    color: "#3b82f6",
    cover: ["PUBG", "Black Myth: Wukong", "Counter-Strike 2", "Elden Ring"],
    decks: single({
      id: "steam",
      question: "Bigger peak?",
      unit: "players at once",
      picture: "wide",
      source: credit(steam),
      items: items(steam),
    }),
  },
  {
    id: "spotify",
    title: "Spotify Showdown",
    tagline: "Monthly listeners",
    color: "#1db954",
    cover: ["Bruno Mars", "The Weeknd", "Taylor Swift", "Bad Bunny"],
    decks: single({
      id: "spotify",
      question: "More listeners?",
      unit: "monthly listeners",
      picture: "photo",
      source: credit(spotify as Snapshot),
      items: items(spotify as Snapshot),
    }),
  },
  {
    id: "wikipedia",
    title: "The Internet Is Weird",
    tagline: "Wikipedia views a month",
    color: "#d946ef",
    cover: ["Emu War", "Capybara", "Axolotl", "Tardigrade"],
    decks: single({
      id: "wikipedia",
      question: "More popular?",
      unit: "views a month",
      picture: "photo",
      source: credit(wikipedia, "Wikipedia"),
      items: items(wikipedia),
    }),
  },
  {
    id: "deadliest",
    title: "Deadliest Things",
    tagline: "Deaths per year",
    color: "#84cc16",
    cover: ["Mosquito", "Shark", "Hippo", "Snakes"],
    decks: single({
      id: "deadliest",
      question: "Deadlier?",
      unit: "deaths a year",
      picture: "photo",
      items: items(deadliest),
    }),
  },
  {
    id: "prices",
    title: "The Price Is Insane",
    tagline: "What it cost",
    color: "#10b981",
    cover: ["Salvator Mundi", "Azzam superyacht", "Bugatti Chiron", "Burj Khalifa"],
    decks: single({
      id: "prices",
      question: "Pricier?",
      unit: "",
      picture: "photo",
      format: FORMATS.usd,
      items: items(prices),
    }),
  },
  {
    id: "animals",
    title: "Animal Kingdom",
    tagline: "Weight and speed",
    color: "#22c55e",
    mixed: true,
    cover: ["Blue whale", "Cheetah", "Hippo", "Garden snail"],
    decks: (animals as Snapshot).decks.map((d) => ({
      id: `animals-${d.id}`,
      topic: d.id === "weight" ? "Weight" : "Speed",
      question: d.question!,
      unit: d.unit!,
      picture: "photo" as const,
      format: ANIMAL_FORMATS[d.format!] ?? FORMATS.big,
      countUp: false,
      items: d.items,
    })),
  },
  {
    id: "countries",
    title: "Country Wars",
    tagline: "New stat every round",
    color: "#14b8a6",
    mixed: true,
    cover: ["Japan", "Brazil", "Canada", "Kenya"],
    decks: (countries as Snapshot).decks.map((d) => ({
      id: `countries-${d.id}`,
      question: d.question!,
      unit: d.unit!,
      picture: "flag" as const,
      format: fmt(d.format),
      source: "World Bank",
      datedSub: true,
      items: d.items,
    })),
  },
  {
    id: "knowledge",
    title: "The Knowledge Test",
    tagline: "New topic every round",
    color: "#8b5cf6",
    mixed: true,
    cover: ["Saturn", "Eiffel Tower", "Usain Bolt", "Taj Mahal"],
    decks: (knowledge as Snapshot).decks.map((d) => ({
      id: `knowledge-${d.id}`,
      topic: d.topic,
      question: d.question!,
      unit: d.unit!,
      picture: "photo" as const,
      format: fmt(d.format),
      countUp: d.format !== "year" && d.format !== "celsius",
      items: d.items,
    })),
  },
];

export const SHUFFLE: Mode = {
  id: "shuffle",
  title: "Shuffle",
  tagline: "Everything, mixed",
  color: "#a855f7",
  mixed: true,
  cover: [],
  decks: MODES.flatMap((m) => m.decks),
};

export const ALL_MODES: Mode[] = [...MODES, SHUFFLE];

/** picture kind + item for the menu collage of a mode */
export function coverItems(mode: Mode, n = 4): { deck: Deck; item: Item }[] {
  if (mode.id === "shuffle") {
    return MODES.slice(0, n).flatMap((m) => coverItems(m, 1));
  }
  const all = mode.decks.flatMap((deck) => deck.items.map((item) => ({ deck, item })));
  const named = mode.cover.map((n) => all.find((x) => x.item.name === n)).filter(Boolean) as { deck: Deck; item: Item }[];
  const extra = all.filter((x) => (x.item.image || x.item.images || x.item.code || x.item.emoji) && !named.includes(x));
  return [...named, ...extra].slice(0, n);
}

const DECK_MODE = new Map(MODES.flatMap((m) => m.decks.map((d) => [d.id, m] as const)));
/** which mode a deck belongs to (Shuffle borrows decks from every mode) */
export const modeOfDeck = (d: Deck) => DECK_MODE.get(d.id);
