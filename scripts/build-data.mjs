// Builds the data snapshots in src/data/*.json for the newer game modes.
//
//   npm run data            all modes
//   npm run data steam      just one (steam, billionaires, youtube, wikipedia, countries,
//                           deadliest, prices, knowledge, social, spotify, older, animals)
//
// The game ships these snapshots instead of calling the APIs live, so a slow or
// failing API can never break a round. Re-run to refresh the numbers.
// If a source fails completely, the previous snapshot is kept.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANIMALS, COUNTRY_STATS, DEADLIEST, KNOWLEDGE, OLDER, PRICES, STEAM_APPS, WIKI_PAGES, YOUTUBE,
} from "./sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "data");
const FLAGS = join(ROOT, "node_modules", "flag-icons", "flags", "4x3");
const UA = { "User-Agent": "eyedecide-data-script/1.0 (higher-or-lower game data snapshot)" };
const MONTH = new Date().toLocaleString("en", { month: "short", year: "numeric" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, as = "json", tries = 5) {
  for (let i = 1; ; i++) {
    let wait = 800 * i;
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) wait = Math.max(wait, (+r.headers.get("retry-after") || 5) * 1000);
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 120)}`);
      return as === "json" ? await r.json() : await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(wait);
    }
  }
}

function save(file, data) {
  const count = data.decks.reduce((n, d) => n + d.items.length, 0);
  const path = join(DATA, `${file}.json`);
  if (count === 0) {
    console.warn(`  ! ${file}: no items, keeping ${existsSync(path) ? "previous snapshot" : "nothing"}`);
    return;
  }
  writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
  console.log(`  ✓ ${file}.json  ${data.decks.length} deck(s), ${count} items`);
}

// ---------- Wikipedia pictures (batched) ----------
const imageCache = new Map();
/** title → { title (canonical), image } */
async function wiki(titles) {
  const todo = [...new Set(titles)].filter((t) => !imageCache.has(t));
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const q = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "pageimages|pageprops", ppprop: "wikibase_item", piprop: "thumbnail", pithumbsize: "640", titles: chunk.join("|"),
    });
    const res = await get(`https://en.wikipedia.org/w/api.php?${q}`);
    const hop = (t) => {
      const n = res.query.normalized?.find((x) => x.from === t);
      const a = n ? n.to : t;
      const r = res.query.redirects?.find((x) => x.from === a);
      return r ? r.to : a;
    };
    for (const t of chunk) {
      const page = res.query.pages.find((p) => p.title === hop(t));
      imageCache.set(t, page && !page.missing ? { title: page.title, image: page.thumbnail?.source?.split("?")[0], qid: page.pageprops?.wikibase_item } : null);
    }
    await sleep(1000); // be polite to the Wikipedia API
  }
  return (t) => imageCache.get(t);
}

/** Wikidata portrait (P18) for people: an article's lead image is often a group or event photo. */
async function portraits(qids) {
  const out = new Map();
  const ids = [...new Set(qids.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 45) {
    const q = new URLSearchParams({ action: "wbgetentities", format: "json", props: "claims", ids: ids.slice(i, i + 45).join("|") });
    const res = await get(`https://www.wikidata.org/w/api.php?${q}`);
    for (const [id, e] of Object.entries(res.entities ?? {})) {
      const human = e.claims?.P31?.some((c) => c.mainsnak.datavalue?.value?.id === "Q5");
      const file = e.claims?.P18?.[0]?.mainsnak.datavalue?.value;
      if (human && file) out.set(id, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=640`);
    }
    await sleep(800);
  }
  return out;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

// ---------- Steam: all-time peak players (SteamCharts) + art (Steam store) ----------
const STEAM_NAMES = {
  578080: "PUBG", 1245620: "Elden Ring", 2358720: "Black Myth: Wukong", 1623730: "Palworld",
  1091500: "Cyberpunk 2077", 271590: "GTA V", 292030: "The Witcher 3", 1172470: "Apex Legends",
  381210: "Dead by Daylight", 359550: "Rainbow Six Siege", 489830: "Skyrim Special Edition",
  72850: "Skyrim", 8930: "Civilization V", 289070: "Civilization VI", 1174180: "Red Dead Redemption 2",
  582010: "Monster Hunter: World", 2246340: "Monster Hunter Wilds", 2399830: "ARK: Survival Ascended",
  346110: "ARK: Survival Evolved", 594650: "Hunt: Showdown", 2507950: "Delta Force", 1203220: "Naraka: Bladepoint",
  1240440: "Halo Infinite", 2073850: "The Finals", 3241660: "R.E.P.O.", 1808500: "ARC Raiders",
};
async function steam() {
  const items = [];
  for (const id of STEAM_APPS) {
    try {
      const html = await get(`https://steamcharts.com/app/${id}`, "text");
      const peak = +(html.match(/<span class="num">([\d,]+)<\/span>\s*<br>\s*all-time peak/i)?.[1] ?? "").replace(/,/g, "");
      if (!peak) throw new Error("no peak");
      let month;
      for (const m of html.matchAll(/<td class="month-cell left[^"]*">\s*([^<]+?)\s*<\/td>[\s\S]*?<td class="right num">([\d,]+)<\/td>/g)) {
        if (+m[2].replace(/,/g, "") === peak) month = m[1].trim();
      }
      const info = (await get(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`))[id];
      if (!info?.success) throw new Error("no store data");
      const name = STEAM_NAMES[id] ?? info.data.name.replace(/[™®©]/g, "").trim();
      items.push(clean({ name, value: peak, image: info.data.header_image?.split("?")[0], sub: `Peak ${month && month !== "Last 30 Days" ? month : MONTH}` }));
      process.stdout.write(".");
    } catch (e) {
      console.warn(`\n  - steam ${id}: ${e.message}`);
    }
    await sleep(400);
  }
  console.log();
  save("steam", { source: "SteamCharts", asOf: MONTH, decks: [{ id: "steam", items }] });
}

// ---------- Billionaires: Forbes real-time list + Wikipedia photos ----------
async function billionaires() {
  const res = await get("https://www.forbes.com/forbesapi/person/rtb/0/position/true.json?fields=personName,finalWorth,source&limit=150");
  const people = res.personList.personsLists.map((p) => ({
    name: p.personName.replace(/\s*&\s*family$/i, "").replace(/\s+/g, " ").trim(),
    value: Math.round(p.finalWorth * 1e6),
    sub: p.source?.split(/[,;]/)[0]?.trim(),
  }));
  const look = await wiki(people.map((p) => p.name));
  const faces = await portraits(people.map((p) => look(p.name)?.qid));
  // a redirect can land on a relative's page (e.g. a spouse): the article must carry their first name
  const samePerson = (p) => look(p.name)?.title.toLowerCase().includes(p.name.split(" ")[0].toLowerCase());
  const items = people
    .filter(samePerson)
    .map((p) => clean({ ...p, image: faces.get(look(p.name)?.qid) }))
    .filter((p) => p.image)
    .slice(0, 90);
  save("billionaires", { source: "Forbes Real-Time Billionaires", asOf: MONTH, decks: [{ id: "billionaires", items }] });
}

// ---------- YouTube: live view counts + thumbnails ----------
// channel handles → the name people know
const YT_CREDIT = {"LuisFonsi": "Luis Fonsi", "officialpsy": "PSY", "Wiz Khalifa Music": "Wiz Khalifa", "MarkRonson": "Mark Ronson", "KatyPerry": "Katy Perry", "JustinBieber": "Justin Bieber", "Maroon5": "Maroon 5", "shakira": "Shakira", "jawed": "Jawed Karim", "HDCYT": "Viral, 2007", "GunsNRoses": "Guns N' Roses", "ProtoOfSnagem": "Viral, 2005", "SmashMouth": "Smash Mouth", "RealPapaPit": "Eduard Khil", "BackstreetBoys": "Backstreet Boys", "TheKillers": "The Killers", "PharrellWilliams": "Pharrell Williams", "Chainsmokers": "The Chainsmokers", "michaeljackson": "Michael Jackson", "Ultra Records": "Pikotaro", "Get Movies": "Animaccord", "Cocomelon": "CoComelon", "johnlegend": "John Legend", "CarlyRaeJepsen": "Carly Rae Jepsen", "Fueled By Ramen": "twenty one pilots", "ImagineDragons": "Imagine Dragons", "TVNorge": "Ylvis", "Baby Shark": "Pinkfong"};
async function youtube() {
  const items = [];
  for (const [id, name] of YOUTUBE) {
    try {
      const meta = await get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      const html = await get(`https://www.youtube.com/watch?v=${id}`, "text");
      const views = +(html.match(/"viewCount":"(\d+)"/)?.[1] ?? 0);
      if (!views) throw new Error("no view count");
      const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
      const hasMax = (await fetch(maxres, { method: "HEAD", headers: UA })).ok;
      const channel = YT_CREDIT[meta.author_name.split(/ [-|] /)[0]] ?? meta.author_name.split(/ [-|] /)[0].replace(/\s*(VEVO|Official)$/i, "").trim();
      items.push({
        name, value: views, sub: channel,
        images: [hasMax ? maxres : null, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`].filter(Boolean),
      });
      console.log(`    ${name.padEnd(28)} ← "${meta.title.slice(0, 60)}"`);
    } catch (e) {
      console.warn(`  - youtube ${id} (${name}): ${e.message}`);
    }
    await sleep(300);
  }
  save("youtube", { source: "YouTube", asOf: MONTH, decks: [{ id: "youtube", items }] });
}

// ---------- Wikipedia: average monthly page views over the last 12 months ----------
async function wikipedia() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const look = await wiki(WIKI_PAGES);
  const items = [];
  for (const t of WIKI_PAGES) {
    const page = look(t);
    if (!page) {
      console.warn(`  - wiki missing: ${t}`);
      continue;
    }
    try {
      const art = encodeURIComponent(page.title.replace(/ /g, "_"));
      const res = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${art}/monthly/${ymd(start)}00/${ymd(end)}00`);
      const months = res.items.map((x) => x.views);
      const avg = Math.round(months.reduce((a, b) => a + b, 0) / months.length);
      if (page.image) items.push({ name: page.title.replace(/\s*\([^)]*\)$/, ""), value: avg, image: page.image });
      else console.warn(`  - no free picture: ${t}`);
    } catch (e) {
      console.warn(`  - pageviews ${t}: ${e.message}`);
    }
    await sleep(120);
  }
  const mon = (d) => d.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
  const range = `${mon(start)} to ${mon(end)}`;
  save("wikipedia", { source: "Wikimedia Pageviews", asOf: range, decks: [{ id: "wikipedia", items }] });
}

// ---------- curated lists: attach Wikipedia pictures ----------
async function curated(file, source, list) {
  // `img` points at a related article when the subject's own picture isn't free (paintings, logos)
  const look = await wiki(list.map((x) => x.img ?? x.wiki));
  const items = list.map(({ wiki: w, img, ...x }) => {
    const page = look(img ?? w);
    if (!page) console.warn(`  - ${file}: no Wikipedia page "${w}"`);
    else if (!page.image) console.warn(`  - ${file}: no picture for "${w}"`);
    return clean({ ...x, image: page?.image });
  });
  save(file, { source, asOf: "", decks: [{ id: file, items }] });
}

async function knowledge() {
  const look = await wiki(KNOWLEDGE.flatMap((d) => d.items.map((x) => x[1])));
  const decks = KNOWLEDGE.map(({ items, ...deck }) => ({
    ...deck,
    items: items.map(([name, w, value]) => {
      const page = look(w);
      if (!page?.image) console.warn(`  - knowledge/${deck.id}: no picture for "${w}"`);
      return clean({ name, value, image: page?.image });
    }),
  }));
  save("knowledge", { source: "Wikipedia", asOf: "", decks });
}

// ---------- Country Wars: World Bank, most recent value per country ----------
async function countries() {
  const meta = (await get("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1];
  const flags = new Set(existsSync(FLAGS) ? (await import("node:fs")).readdirSync(FLAGS).map((f) => f.slice(0, 2)) : []);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const real = new Map(
    meta
      .filter((c) => c.region.id !== "NA" && /^[A-Z]{2}$/.test(c.iso2Code) && flags.has(c.iso2Code.toLowerCase()))
      .map((c) => [c.id, { code: c.iso2Code.toLowerCase(), name: names.of(c.iso2Code) ?? c.name }]),
  );
  const decks = [];
  for (const stat of COUNTRY_STATS) {
    const [, rows] = await get(`https://api.worldbank.org/v2/country/all/indicator/${stat.indicator}?format=json&mrnev=1&per_page=500`);
    const items = (rows ?? [])
      .filter((r) => real.has(r.countryiso3code) && r.value > 0 && +r.date >= 2015)
      .map((r) => {
        const c = real.get(r.countryiso3code);
        return { name: c.name, code: c.code, value: +r.value.toPrecision(4), sub: r.date };
      });
    const { indicator, ...rest } = stat;
    decks.push({ ...rest, source: `World Bank ${indicator}`, items });
    console.log(`    ${stat.id.padEnd(7)} ${items.length} countries`);
  }
  save("countries", { source: "World Bank", asOf: "", decks });
}

// ---------- Wikipedia list tables (social media, Spotify) ----------
async function wikitext(page) {
  const q = new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json", formatversion: "2" });
  return (await get(`https://en.wikipedia.org/w/api.php?${q}`)).parse.wikitext;
}

/** The first table after `marker`, as rows of cleaned cells. Each cell keeps its first [[link]]. */
function table(text, marker) {
  const from = text.indexOf(marker);
  if (from < 0) throw new Error(`no "${marker}"`);
  // the table that holds the marker, or the first one after it
  const before = text.lastIndexOf("{|", from);
  const start = before >= 0 && text.indexOf("\n|}", before) > from ? before : text.indexOf("{|", from);
  const end = text.indexOf("\n|}", start);
  const body = text
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "");
  return body.split(/\n\|-[^\n]*/).slice(1).map((row) =>
    row
      .split(/\n[|!]|\|\||!!/)
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        // drop a leading attribute block: style="…" | content
        const cell = c.replace(/^(?:[a-z-]+\s*=\s*"[^"]*"\s*)+\|(?!\|)/i, "").trim();
        const link = cell.match(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/)?.[1]?.trim();
        const plain = cell
          .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
          .replace(/\{\{[^}]*\}\}/g, "")
          .replace(/'{2,}/g, "")
          .trim();
        return { link, plain, raw: cell };
      }),
  );
}

/** Rows → items: name from the linked cell, value from the first number after it (scaled). */
function fromTable(rows, { scale, skip = () => false }) {
  const out = [];
  for (const cells of rows) {
    const i = cells.findIndex((c) => c.link && !/^(File|Image):/i.test(c.link));
    if (i < 0 || skip(cells)) continue;
    const num = cells.slice(i + 1).map((c) => c.plain.replace(/,/g, "").match(/^\d+(?:\.\d+)?$/)?.[0]).find(Boolean);
    if (!num) continue;
    out.push({ wiki: cells[i].link, name: cells[i].plain.replace(/\s*\(.*\)$/, ""), value: Math.round(+num * scale) });
  }
  return out;
}

/** People (and bands) get their Wikidata portrait; anything else its article's lead picture. */
async function withFaces(list) {
  const look = await wiki(list.map((x) => x.wiki));
  const faces = await portraits(list.map((x) => look(x.wiki)?.qid));
  return list
    .map(({ wiki: w, ...x }) => {
      const page = look(w);
      return clean({ ...x, image: faces.get(page?.qid) ?? page?.image });
    })
    .filter((x) => x.image);
}

async function social() {
  const decks = [];
  const brand = (cells) => cells.some((c) => /dagger|F3E7FF/i.test(c.raw)) || cells.some((c) => /^yes$/i.test(c.plain));
  for (const [id, page, marker, topic] of [
    ["instagram", "List_of_most-followed_Instagram_accounts", "! Followers", "Instagram"],
    ["tiktok", "List_of_most-followed_TikTok_accounts", "== Most-followed accounts ==", "TikTok"],
  ]) {
    const rows = table(await wikitext(page), marker);
    const items = await withFaces(fromTable(rows, { scale: 1e6, skip: brand }));
    console.log(`    ${id.padEnd(9)} ${items.length} accounts`);
    decks.push({ id, topic, question: "More followers?", unit: `${topic} followers`, source: `Wikipedia, most-followed ${topic} accounts`, items });
  }
  save("social", { source: "Wikipedia", asOf: MONTH, decks });
}

async function spotify() {
  const rows = table(await wikitext("List_of_most-streamed_artists_on_Spotify"), "==Most monthly listeners==");
  const items = await withFaces(fromTable(rows, { scale: 1e6 }));
  save("spotify", { source: "Spotify via Wikipedia", asOf: MONTH, decks: [{ id: "spotify", items }] });
}

// ---------- Who's Older? ----------
async function older() {
  const look = await wiki(OLDER);
  const ids = OLDER.map((t) => look(t)?.qid).filter(Boolean);
  const born = new Map();
  for (let i = 0; i < ids.length; i += 45) {
    const q = new URLSearchParams({ action: "wbgetentities", format: "json", props: "claims", ids: ids.slice(i, i + 45).join("|") });
    const res = await get(`https://www.wikidata.org/w/api.php?${q}`);
    for (const [id, e] of Object.entries(res.entities ?? {})) {
      const t = e.claims?.P569?.[0]?.mainsnak.datavalue?.value;
      // only day-precise dates (precision 11), so nobody ties on a year
      if (t?.precision === 11) born.set(id, t.time.slice(1, 11));
    }
    await sleep(800);
  }
  const faces = await portraits(ids);
  const DAY = 86400000;
  const base = Date.UTC(2026, 0, 1);
  const items = OLDER.flatMap((t) => {
    const page = look(t);
    const date = born.get(page?.qid);
    if (!date || !faces.get(page.qid)) {
      console.warn(`  - older: skipped "${t}"`);
      return [];
    }
    const name = page.title.replace(/\s*\(.*\)$/, "");
    // value = days old on 1 Jan 2026, so higher means older
    return [{ name, value: Math.round((base - Date.parse(date)) / DAY), image: faces.get(page.qid) }];
  });
  save("older", { source: "Wikidata", asOf: "", decks: [{ id: "older", items }] });
}

// ---------- Animal Kingdom: existing figures + photos ----------
async function animals() {
  const look = await wiki(Object.values(ANIMALS).flat().map((x) => x[1]));
  const decks = [];
  for (const [id, question, unit, format] of [
    ["weight", "Heavier?", "typical adult", "kg"],
    ["speed", "Faster?", "top speed", "kmh"],
  ]) {
    const items = ANIMALS[id].map(([name, w, value]) => {
      const image = look(w)?.image;
      if (!image) console.warn(`  - animals/${id}: no picture for "${name}"`);
      return clean({ name, value, image });
    });
    decks.push({ id, question, unit, format, items });
  }
  save("animals", { source: "Wikipedia", asOf: "", decks });
}

const JOBS = {
  steam, billionaires, youtube, wikipedia, countries, knowledge,
  deadliest: () => curated("deadliest", "WHO, UNAIDS, Gates Notes and others", DEADLIEST),
  prices: () => curated("prices", "Auction and press records", PRICES),
  social, spotify, older, animals,
};

const only = process.argv.slice(2);
for (const [name, job] of Object.entries(JOBS)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n${name}`);
  try {
    await job();
  } catch (e) {
    console.warn(`  ! ${name} failed: ${e.message}. Previous snapshot kept.`);
  }
}
