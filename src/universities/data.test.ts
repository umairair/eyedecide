import { describe, expect, it } from "vitest";
import { UNIVERSITIES, find, fold } from "./data";

describe("ontario universities", () => {
  it("lists all 23 publicly funded universities once each", () => {
    expect(UNIVERSITIES).toHaveLength(23);
    expect(new Set(UNIVERSITIES.map((u) => u.name)).size).toBe(23);
    expect(new Set(UNIVERSITIES.map((u) => u.site)).size).toBe(23);
  });

  it("has complete, sane facts for every one", () => {
    for (const u of UNIVERSITIES) {
      expect(u.cities.length, u.name).toBeGreaterThan(0);
      expect(u.founded, u.name).toBeGreaterThanOrEqual(1827);
      expect(u.founded, u.name).toBeLessThanOrEqual(2018);
      expect(u.site, u.name).toMatch(/^[a-z0-9-]+\.ca$/);
      expect(u.about, u.name).toMatch(/^[A-Z].*\.$/);
      expect(u.about, u.name).not.toMatch(/[–—]/);
    }
  });

  it("searches names, cities and languages, ignoring case and accents", () => {
    expect(find("", "name")).toHaveLength(23);
    expect(find("waterloo", "name").map((u) => u.name)).toEqual([
      "University of Waterloo",
      "Wilfrid Laurier University",
    ]);
    expect(find("universite francais", "name").map((u) => u.name)).toEqual(["Université de l'Ontario français"]);
    expect(find("FRENCH", "name").map((u) => u.language)).toContain("French");
    expect(find("thunder bay", "name")).toHaveLength(2);
    expect(find("zzz", "name")).toEqual([]);
    expect(fold("Université")).toBe("universite");
  });

  it("sorts by the name people look for, and by age", () => {
    const names = find("", "name").map((u) => u.name);
    expect(names[0]).toBe("Algoma University");
    expect(names.indexOf("University of Guelph")).toBeLessThan(names.indexOf("Lakehead University"));
    expect(names.at(-1)).toBe("York University");
    expect(find("", "oldest")[0].name).toBe("University of Toronto");
    expect(find("", "newest")[0].name).toBe("Université de l'Ontario français");
  });
});
