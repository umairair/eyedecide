/** Number formats used by the decks. Keep them short: they're read at a glance. */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en");
const one = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** the year values are measured from (ages are stored so "higher" means older) */
export const AGE_BASE = 2026;

export type FormatName = "big" | "usd" | "years" | "pct" | "dec" | "km" | "m" | "km2" | "celsius" | "year" | "count" | "born";

/** ages are stored as days old on this date, so "higher" means older */
const BORN_BASE = Date.UTC(2026, 0, 1);
const bornFmt = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export const FORMATS: Record<FormatName, (v: number) => string> = {
  big: (v) => (v >= 100_000 ? compact.format(v) : whole.format(Math.round(v))),
  usd: (v) => (v >= 100_000 ? `$${compact.format(v)}` : v >= 100 ? `$${whole.format(Math.round(v))}` : `$${v.toFixed(2)}`),
  years: (v) => `${one.format(v)} yrs`,
  pct: (v) => `${one.format(v)}%`,
  dec: (v) => one.format(v),
  km: (v) => `${whole.format(Math.round(v))} km`,
  m: (v) => `${whole.format(Math.round(v))} m`,
  km2: (v) => `${v >= 100_000 ? compact.format(v) : whole.format(Math.round(v))} km²`,
  celsius: (v) => `${whole.format(Math.round(v - 273.15))}°C`,
  year: (v) => {
    const y = Math.round(AGE_BASE - v);
    return y < 0 ? `${-y} BC` : String(y); // sources write 2560 BC as -2560
  },
  count: (v) => whole.format(Math.round(v)),
  born: (v) => bornFmt.format(new Date(BORN_BASE - Math.round(v) * 86400000)),
};

/** animal weights hop between units (mg → t), so they skip the count-up */
export function kg(v: number) {
  if (v >= 1000) return `${+(v / 1000).toFixed(1)} t`;
  if (v >= 1) return `${+v.toFixed(1)} kg`;
  if (v >= 0.001) return `${Math.round(v * 1000)} g`;
  return `${+(v * 1_000_000).toFixed(1)} mg`;
}
export const kmh = (v: number) => `${v < 1 ? +v.toFixed(2) : Math.round(v)} km/h`;
