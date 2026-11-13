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

/** One kind of question: what's asked, how it's shown, and the pool to draw from. */
export interface Deck {
  /** decks on one subject share the part before the dash ("countries-pop", "countries-gdp") */
  id: string;
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

interface Snapshot {
  source: string;
  asOf: string;
  decks: { id: string; question?: string; unit?: string; format?: string; source?: string; items: Item[] }[];
}
const credit = (s: Snapshot, src = s.source) => [src, s.asOf].filter(Boolean).join(" · ");
const items = (s: Snapshot) => s.decks[0].items;
const fmt = (name?: string) => FORMATS[(name ?? "big") as FormatName] ?? FORMATS.big;

/** every question the game can ask; a round draws one of these, then a pair from it */
export const DECKS: Deck[] = [
  {
    id: "billionaires",
    question: "Richer?",
    unit: "net worth",
    picture: "photo",
    format: FORMATS.usd,
    source: credit(billionaires, "Forbes"),
    items: items(billionaires),
  },
  {
    id: "older",
    question: "Who's older?",
    unit: "born",
    picture: "photo",
    format: FORMATS.born,
    countUp: false,
    source: "Wikidata",
    items: items(older as Snapshot),
  },
  ...(social as Snapshot).decks.map((d) => ({
    id: `social-${d.id}`,
    question: d.question!,
    unit: d.unit!,
    picture: "photo" as const,
    format: FORMATS.big,
    source: credit(social as Snapshot, d.source),
    items: d.items,
  })),
  {
    id: "youtube",
    question: "More views?",
    unit: "views",
    picture: "wide",
    format: FORMATS.big,
    source: credit(youtube),
    items: items(youtube),
  },
  {
    id: "steam",
    question: "Bigger peak?",
    unit: "players at once",
    picture: "wide",
    format: FORMATS.big,
    source: credit(steam),
    items: items(steam),
  },
  {
    id: "spotify",
    question: "More listeners?",
    unit: "monthly listeners",
    picture: "photo",
    format: FORMATS.big,
    source: credit(spotify as Snapshot),
    items: items(spotify as Snapshot),
  },
  {
    id: "wikipedia",
    question: "More popular?",
    unit: "views a month",
    picture: "photo",
    format: FORMATS.big,
    source: credit(wikipedia, "Wikipedia"),
    items: items(wikipedia),
  },
  {
    id: "deadliest",
    question: "Deadlier?",
    unit: "deaths a year",
    picture: "photo",
    format: FORMATS.big,
    items: items(deadliest),
  },
  {
    id: "prices",
    question: "Pricier?",
    unit: "",
    picture: "photo",
    format: FORMATS.usd,
    items: items(prices),
  },
  ...(animals as Snapshot).decks.map((d) => ({
    id: `animals-${d.id}`,
    question: d.question!,
    unit: d.unit!,
    picture: "photo" as const,
    format: ANIMAL_FORMATS[d.format!] ?? FORMATS.big,
    countUp: false,
    items: d.items,
  })),
  ...(countries as Snapshot).decks.map((d) => ({
    id: `countries-${d.id}`,
    question: d.question!,
    unit: d.unit!,
    picture: "flag" as const,
    format: fmt(d.format),
    source: "World Bank",
    datedSub: true,
    items: d.items,
  })),
  ...(knowledge as Snapshot).decks.map((d) => ({
    id: `knowledge-${d.id}`,
    question: d.question!,
    unit: d.unit!,
    picture: "photo" as const,
    format: fmt(d.format),
    countUp: d.format !== "year" && d.format !== "celsius",
    items: d.items,
  })),
];
