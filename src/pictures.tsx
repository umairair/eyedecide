import { useState } from "react";
import type { Item } from "./core/questions";
import type { Deck, Picture as Kind } from "./data/modes";
import { flagUrl } from "./flags";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Warm the browser cache so the next card's picture is there when it's dealt. */
export function preload(kind: Kind, ...items: Item[]) {
  for (const it of items) {
    const src = kind === "flag" ? it.code && flagUrl(it.code) : (it.images?.[0] ?? it.image);
    if (!src) continue;
    const img = new Image();
    img.referrerPolicy = "no-referrer"; // the same request the card will make
    img.src = src;
  }
}

/** The picture for an item. Always fills its container; the container decides size. */
export function Picture({ kind, item }: { kind: Kind; item: Item }) {
  const flag = kind === "flag" && item.code ? flagUrl(item.code) : undefined;
  if (flag) {
    return (
      <div className="pic pic--flag">
        <img src={flag} alt="" draggable={false} />
      </div>
    );
  }
  if (kind === "emoji" && item.emoji) {
    return (
      <div className="pic pic--emoji">
        <span>{item.emoji}</span>
      </div>
    );
  }
  const sources = item.images ?? (item.image ? [item.image] : []);
  if ((kind === "photo" || kind === "wide") && sources.length) {
    return <Photo key={item.name} sources={sources} name={item.name} wide={kind === "wide"} />;
  }
  return <Cover name={item.name} />;
}

/** Tries each source in turn; if all fail, falls back to a generated cover. */
function Photo({ sources, name, wide }: { sources: string[]; name: string; wide: boolean }) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  if (i >= sources.length) return <Cover name={name} />;
  return (
    <div className={`pic pic--photo ${wide ? "pic--wide" : ""} ${loaded ? "is-loaded" : ""}`}>
      <img
        src={sources[i]}
        alt=""
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setI((n) => n + 1)}
      />
    </div>
  );
}

/** Initials on a flat colour, for things without a picture (artist photos are copyrighted). */
function Cover({ name }: { name: string }) {
  const hue = hash(name) % 360;
  const initials = name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="pic pic--cover" style={{ background: `hsl(${hue} 55% 42%)` }}>
      {initials}
    </div>
  );
}

/** A mode's face on the menu: one big picture, or a 2×2 grid when given four. */
export function Collage({ entries }: { entries: { deck: Deck; item: Item }[] }) {
  return (
    <div className={`collage ${entries.length > 1 ? "collage--grid" : ""}`}>
      {entries.map(({ deck, item }) => (
        <div key={deck.id + item.name}>
          <Picture kind={deck.picture} item={item} />
        </div>
      ))}
    </div>
  );
}
