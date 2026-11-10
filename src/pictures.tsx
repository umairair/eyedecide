import { useState } from "react";
import type { Item } from "./core/questions";
import type { Deck, Picture as Kind } from "./data/modes";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The picture for an item. Always fills its container; the container decides size. */
export function Picture({ kind, item }: { kind: Kind; item: Item }) {
  if (kind === "flag" && item.code) {
    return (
      <div className="pic pic--flag">
        <span className={`fi fi-${item.code}`} />
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

/** Generated art for things without a picture (artist photos are copyrighted). */
function Cover({ name }: { name: string }) {
  const h = hash(name);
  const a = h % 360;
  const b = (a + 30 + ((h >> 9) % 90)) % 360;
  const initials = name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="pic pic--cover" style={{ background: `linear-gradient(135deg, hsl(${a} 75% 55%), hsl(${b} 70% 30%))` }}>
      <span className="cover__ring" />
      <span className="cover__initials">{initials}</span>
    </div>
  );
}

/** 2×2 grid of a mode's pictures: its identity on the menu. */
export function Collage({ entries }: { entries: { deck: Deck; item: Item }[] }) {
  return (
    <div className="collage">
      {entries.map(({ deck, item }) => (
        <div className="collage__cell" key={deck.id + item.name}>
          <Picture kind={deck.picture} item={item} />
        </div>
      ))}
    </div>
  );
}
