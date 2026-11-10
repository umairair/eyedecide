/**
 * Flag pictures: one SVG per country, fetched only when a card shows it.
 *
 * (The flag-icons stylesheet ships every flag twice, 4:3 and square, and the
 * build inlined most of them into it: 440 kB of render-blocking CSS on a page
 * that opens with no flags at all.)
 */
const FILES = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
});

const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".svg".length), url]));

/** URL of the flag for an ISO 3166 code ("ca", "gb-sct"), if there is one */
export const flagUrl = (code: string) => URLS.get(code.toLowerCase());
