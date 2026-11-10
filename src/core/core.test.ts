import { describe, expect, it } from "vitest";
import { DwellMachine } from "./dwell";
import { DriftCorrector } from "./drift";
import { EyeCloseDetector } from "./eyes";
import { OneEuroFilter } from "./oneEuro";
import { difficulty, pickChallenger, pickPair, ranking, type Item } from "./questions";
import { ALL_MODES, coverItems } from "../data/modes";
import { firstRound, MAX_REIGN, nextRound, pointsFor, Recent, type Round } from "./rounds";

/** deterministic noise */
function rng(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe("dwell", () => {
  const run = (m: DwellMachine, s: number | null, ms: number, step = 33) => {
    let last = m.update(s, 0);
    for (let t = 0; t < ms; t += step) {
      last = m.update(s, step);
      if (last.committed) return last;
    }
    return last;
  };

  it("commits only after the full dwell time", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    expect(run(m, -0.8, 900).committed).toBeNull();
    expect(run(m, -0.8, 200).committed).toBe("left");
  });

  it("with requireCenter, ignores a look that's already on a side until it passes the middle", () => {
    const m = new DwellMachine({ dwellMs: 300, deadZone: 0.3, requireCenter: true, cooldownMs: 0 });
    expect(run(m, 0.9, 2000).committed).toBeNull();
    run(m, 0, 100);
    expect(run(m, 0.9, 400).committed).toBe("right");
    // and again after a choice
    expect(run(m, 0.9, 2000).committed).toBeNull();
  });

  it("supports a faster dwell on one side", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3, scale: { left: 0.5 } });
    expect(run(m, -0.8, 560).committed).toBe("left");
    const m2 = new DwellMachine({ dwellMs: 1000, deadZone: 0.3, scale: { left: 0.5 } });
    expect(run(m2, 0.8, 560).committed).toBeNull();
  });

  it("is frame-rate independent", () => {
    const fast = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    const slow = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    expect(run(fast, 0.9, 500, 8).right).toBeCloseTo(run(slow, 0.9, 500, 66).right, 1);
  });

  it("never picks anything while you look at the middle", () => {
    const m = new DwellMachine({ dwellMs: 500, deadZone: 0.3 });
    const r = rng(3);
    for (let i = 0; i < 300; i++) expect(m.update((r() - 0.5) * 0.5, 33).committed).toBeNull();
  });

  it("freezes progress when the face is lost", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    const before = run(m, 0.9, 500).right;
    const during = run(m, null, 2000);
    expect(during.committed).toBeNull();
    expect(during.right).toBeCloseTo(before, 5);
  });

  it("drains progress when you look away", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    run(m, 0.9, 600);
    expect(run(m, 0, 800).right).toBe(0);
  });

  it("pauses instead of draining when you slip out for a moment", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    const before = run(m, 0.9, 600).right;
    expect(run(m, 0.1, 180).right).toBeCloseTo(before, 5);
    expect(run(m, 0.9, 450).committed).toBe("right");
  });

  it("looking at the other side drains at once", () => {
    const m = new DwellMachine({ dwellMs: 1000, deadZone: 0.3 });
    const before = run(m, 0.9, 600).right;
    expect(run(m, -0.9, 150).right).toBeLessThan(before);
  });

  it("cools down after a choice so one long look doesn't fire twice", () => {
    const m = new DwellMachine({ dwellMs: 300, deadZone: 0.3, cooldownMs: 700 });
    expect(run(m, -1, 400).committed).toBe("left");
    expect(run(m, -1, 600).committed).toBeNull();
  });
});

describe("drift correction", () => {
  it("re-centres slow posture drift while resting", () => {
    const d = new DriftCorrector();
    let s = 0;
    // player slowly slumps: resting reading creeps to 0.15 over a minute
    for (let t = 0; t < 60000; t += 33) s = d.update((0.15 * t) / 60000, 33);
    expect(Math.abs(s)).toBeLessThan(0.05);
  });

  it("never cancels a deliberate look", () => {
    const d = new DriftCorrector();
    let s = 0;
    for (let t = 0; t < 30000; t += 33) s = d.update(-0.9, 33);
    expect(s).toBeCloseTo(-0.9, 5);
  });

  it("is clamped", () => {
    const d = new DriftCorrector();
    let raw = 0;
    for (let t = 0; t < 600000; t += 33) d.update((raw += 0.0002), 33);
    expect(Math.abs(d.bias)).toBeLessThanOrEqual(0.3);
  });
});

describe("eyes-closed pause gesture", () => {
  it("ignores normal blinks", () => {
    const d = new EyeCloseDetector(1400, 350);
    let fired = false;
    for (let t = 0; t <= 200; t += 33) fired ||= d.update(true, t).fired;
    expect(fired).toBe(false);
    expect(d.update(true, 230).suppress).toBe(false);
  });

  it("fires once after a long close, and re-arms when eyes open", () => {
    const d = new EyeCloseDetector(1400, 350);
    let count = 0;
    for (let t = 0; t <= 3000; t += 33) count += d.update(true, t).fired ? 1 : 0;
    expect(count).toBe(1);
    d.update(false, 3100);
    for (let t = 3200; t <= 4700; t += 33) count += d.update(true, t).fired ? 1 : 0;
    expect(count).toBe(2);
  });

  it("suppresses gaze once the eyes have been shut longer than a blink", () => {
    const d = new EyeCloseDetector(1400, 350);
    d.update(true, 0);
    expect(d.update(true, 400).suppress).toBe(true);
  });
});

describe("one euro filter", () => {
  it("smooths jitter but follows a real move", () => {
    const f = new OneEuroFilter(1, 0.4);
    const r = rng(11);
    let t = 0;
    let out = 0;
    let maxDev = 0;
    for (let i = 0; i < 60; i++) {
      out = f.filter((r() - 0.5) * 0.2, (t += 33));
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(out));
    }
    expect(maxDev).toBeLessThan(0.07);
    for (let i = 0; i < 30; i++) out = f.filter(1, (t += 33));
    expect(out).toBeGreaterThan(0.9);
  });
});

describe("questions", () => {
  const pool: Item[] = Array.from({ length: 200 }, (_, i) => ({ name: `n${i}`, value: Math.round(10 * 1.05 ** i) }));
  const rankOf = (x: Item) => ranking(pool).rank(x);

  it("starts obvious and ends close, in rank terms", () => {
    expect(difficulty(0).lo).toBeGreaterThan(0.3);
    expect(difficulty(25).hi).toBeLessThan(0.15);
    const champ = pool[100];
    const r = rng(5);
    for (let i = 0; i < 50; i++) {
      const c = pickChallenger(pool, champ, difficulty(0), null, new Set(), r)!;
      expect(Math.abs(rankOf(c) - rankOf(champ))).toBeGreaterThanOrEqual(difficulty(0).lo);
    }
  });

  it("is a sawtooth: a close call, then a breather, every five rounds", () => {
    const kinds = Array.from({ length: 30 }, (_, i) => difficulty(i, i).kind);
    expect(kinds.slice(0, 8).every((k) => k === "normal")).toBe(true);
    expect(kinds[8]).toBe("close");
    expect(kinds[9]).toBe("breather");
    expect(kinds[13]).toBe("close");
    expect(difficulty(9).lo).toBeGreaterThan(difficulty(7).lo); // the breather really is easier
  });

  it("asks for the side it's told", () => {
    const champ = pool[100];
    for (const higher of [true, false]) {
      const c = pickChallenger(pool, champ, difficulty(5), higher, new Set(), rng(3))!;
      expect(c.value > champ.value).toBe(higher);
    }
  });

  it("gives up instead of faking it when the top card can't be beaten", () => {
    expect(pickChallenger(pool, pool[199], difficulty(5), true, new Set(), rng(1))).toBeNull();
  });

  it("never pairs an item with itself or an equal value", () => {
    const r = rng(9);
    for (let i = 0; i < 200; i++) {
      const [a, b] = pickPair(pool, difficulty(i % 30), new Set(), r);
      expect(a.name).not.toBe(b.name);
      expect(a.value).not.toBe(b.value);
    }
  });

  it("avoids repeats while unused items remain", () => {
    const used = new Set(pool.slice(0, 150).map((x) => x.name));
    const c = pickChallenger(pool, pool[160], difficulty(10), null, used, rng(2))!;
    expect(used.has(c.name)).toBe(false);
  });
});

describe("game logic, simulated perfect player", () => {
  const memory = () => {
    const box = new Map<string, string>();
    return { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
  };
  /** plays `n` rounds always answering right */
  const playRun = (modeId: string, n: number, seed: number) => {
    const mode = ALL_MODES.find((m) => m.id === modeId)!;
    const recent = new Recent(memory(), modeId);
    const r = rng(seed);
    const rounds: Round[] = [firstRound(mode, recent, r)];
    let score = 0;
    for (let i = 1; i < n; i++) {
      score += pointsFor(rounds[i - 1]);
      rounds.push(nextRound(mode, rounds[i - 1], score, recent, r));
    }
    return rounds;
  };
  const single = ALL_MODES.filter((m) => !m.mixed);

  it.each(single.map((m) => m.id))("%s: no card ever hogs the game", (id) => {
    for (const seed of [1, 2, 3]) {
      const rounds = playRun(id, 60, seed);
      let holder = "";
      let run = 0;
      for (const rd of rounds) {
        const k = rd.known ? rd[rd.known].name : "";
        run = k && k === holder ? run + 1 : 1;
        holder = k;
        expect(run, `${id}: ${k}`).toBeLessThanOrEqual(MAX_REIGN + 1);
      }
    }
  });

  it.each(single.map((m) => m.id))("%s: 'higher' and 'lower' come up about equally, never 3 times running", (id) => {
    let higher = 0;
    let total = 0;
    let longest = 0;
    for (const seed of [4, 5, 6]) {
      let streak = 0;
      let last: boolean | null = null;
      for (const rd of playRun(id, 60, seed)) {
        if (!rd.known || rd.retired) {
          last = null;
          streak = 0;
          continue;
        }
        const known = rd[rd.known];
        const other = rd.known === "left" ? rd.right : rd.left;
        const up = other.value > known.value;
        higher += up ? 1 : 0;
        total++;
        streak = up === last ? streak + 1 : 1;
        last = up;
        longest = Math.max(longest, streak);
      }
    }
    expect(higher / total, id).toBeGreaterThan(0.35);
    expect(higher / total, id).toBeLessThan(0.65);
    expect(longest, id).toBeLessThanOrEqual(2);
  });

  it("the biggest thing in a deck retires instead of winning forever", () => {
    const mode = ALL_MODES.find((m) => m.id === "billionaires")!;
    const deck = mode.decks[0];
    const top = [...deck.items].sort((a, b) => b.value - a.value)[0];
    const second = [...deck.items].sort((a, b) => b.value - a.value)[5];
    let rd: Round = { deck, left: top, right: second, known: "left", kind: "normal", reign: 1, trend: [false, false], seen: [], n: 3 };
    const recent = new Recent(memory(), "b");
    rd = nextRound(mode, rd, 3, recent, rng(1));
    // asked for "higher" after two "lowers", and nothing beats the top: it retires
    expect(rd.retired).toBe(top.name);
    expect([rd.left.name, rd.right.name]).not.toContain(top.name);
  });

  it.each(ALL_MODES.map((m) => m.id))("%s: gets harder as the score climbs", (id) => {
    const gaps: number[][] = [[], []];
    for (const seed of [7, 8, 9, 10]) {
      const rounds = playRun(id, 30, seed);
      let score = 0;
      for (const rd of rounds) {
        const rk = ranking(rd.deck.items);
        const g = Math.abs(rk.rank(rd.left) - rk.rank(rd.right));
        if (score <= 3) gaps[0].push(g);
        else if (score >= 20 && rd.kind === "normal") gaps[1].push(g);
        score += pointsFor(rd);
      }
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(gaps[0]), id).toBeGreaterThan(avg(gaps[1]) * 2);
  });

  it.each(ALL_MODES.filter((m) => m.decks.every((d) => d.items.length >= 40)).map((m) => m.id))(
    "%s: no repeats in a 25-round game",
    (id) => {
      const rounds = playRun(id, 25, 11);
      const dealt = rounds.flatMap((rd, i) => (i === 0 || rd.retired || !rd.known ? [rd.left, rd.right] : [rd.known === "left" ? rd.right : rd.left]));
      const keys = dealt.map((x) => x.name);
      const deckKeys = rounds.flatMap((rd, i) => (i === 0 || rd.retired || !rd.known ? [rd, rd] : [rd]).map((r) => r.deck.id));
      const pairs = keys.map((k, i) => `${deckKeys[i]}|${k}`);
      expect(new Set(pairs).size, id).toBe(pairs.length);
    },
  );
});

describe("game data", () => {
  const decks = ALL_MODES.flatMap((m) => m.decks.map((d) => ({ m, d })));

  it("has 13 modes, each playable, and no mountains", () => {
    expect(ALL_MODES).toHaveLength(13);
    expect(ALL_MODES.map((m) => m.id)).not.toContain("mountains");
    for (const m of ALL_MODES) {
      expect(m.decks.length, m.id).toBeGreaterThan(0);
      expect(m.decks.reduce((n, d) => n + d.items.length, 0), m.id).toBeGreaterThan(20);
    }
  });

  it.each(decks.map(({ m, d }) => [`${m.id}/${d.id}`, d] as const))("%s: clean, unique, positive", (_, d) => {
    expect(d.items.length).toBeGreaterThanOrEqual(10);
    expect(new Set(d.items.map((x) => x.name)).size).toBe(d.items.length);
    for (const it of d.items) {
      expect(Number.isFinite(it.value) && it.value > 0, it.name).toBe(true);
      expect(d.format(it.value).length, it.name).toBeGreaterThan(0);
    }
    // the question has to be answerable: not everything can be one value
    expect(new Set(d.items.map((x) => x.value)).size).toBeGreaterThan(5);
  });

  it("gives every photo deck a picture for (nearly) every item", () => {
    for (const { m, d } of decks) {
      if (d.picture !== "photo" && d.picture !== "wide") continue;
      const missing = d.items.filter((x) => !x.image && !x.images?.length);
      expect(missing.length / d.items.length, `${m.id}/${d.id}`).toBeLessThan(0.1);
    }
  });

  it("formats the tricky units", () => {
    const year = ALL_MODES.find((m) => m.id === "knowledge")!.decks.find((d) => d.id === "knowledge-landmarks")!;
    expect(year.format(year.items.find((x) => x.name === "Great Pyramid")!.value)).toBe("2560 BC");
    expect(year.format(year.items.find((x) => x.name === "Eiffel Tower")!.value)).toBe("1889");
    const hot = ALL_MODES.find((m) => m.id === "knowledge")!.decks.find((d) => d.id === "knowledge-hot")!;
    expect(hot.format(310)).toBe("37°C");
    expect(hot.format(77)).toBe("-196°C");
    const older = ALL_MODES.find((m) => m.id === "older")!.decks[0];
    expect(older.format(older.items.find((x) => x.name === "Keanu Reeves")!.value)).toBe("Sep 2, 1964");
  });

  it("has a cover collage of 4 pictures for every mode", () => {
    for (const m of ALL_MODES) expect(coverItems(m), m.id).toHaveLength(4);
  });
});

describe("rounds", () => {
  const memory = () => {
    const box = new Map<string, string>();
    return { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
  };
  const steam = ALL_MODES.find((m) => m.id === "steam")!;
  const countries = ALL_MODES.find((m) => m.id === "countries")!;

  it("never deals a tie or the same item twice", () => {
    const recent = new Recent(memory(), "t");
    for (const m of ALL_MODES) {
      let r = firstRound(m, recent, rng(4));
      for (let i = 0; i < 25; i++) {
        expect(r.left.name, m.id).not.toBe(r.right.name);
        expect(r.left.value, m.id).not.toBe(r.right.value);
        r = nextRound(m, r, i, recent, rng(i + 9));
      }
    }
  });

  it("keeps the winner in single-deck modes", () => {
    const r = firstRound(steam, new Recent(memory(), "s"), rng(2));
    const next = nextRound(steam, r, 1, new Recent(memory(), "s"), rng(3));
    const winner = r.left.value > r.right.value ? r.left : r.right;
    expect([next.left.name, next.right.name]).toContain(winner.name);
    expect(next.known).not.toBeNull();
  });

  it("switches stat every round in Country Wars", () => {
    const recent = new Recent(memory(), "c");
    let r = firstRound(countries, recent, rng(5));
    for (let i = 0; i < 10; i++) {
      const next = nextRound(countries, r, i, recent, rng(i + 20));
      expect(next.deck.id).not.toBe(r.deck.id);
      expect(next.known).toBeNull();
      r = next;
    }
  });

  it("Shuffle gives every mode a fair share", () => {
    const shuffle = ALL_MODES.find((m) => m.id === "shuffle")!;
    const recent = new Recent(memory(), "sh");
    const counts = new Map<string, number>();
    const rand = rng(3);
    let r = firstRound(shuffle, recent, rand);
    for (let i = 0; i < 600; i++) {
      const g = r.deck.id.split("-")[0];
      counts.set(g, (counts.get(g) ?? 0) + 1);
      r = nextRound(shuffle, r, i % 20, recent, rand);
    }
    const shares = [...counts.values()].map((c) => c / 600);
    expect(counts.size).toBe(12);
    expect(Math.max(...shares)).toBeLessThan(0.16);
  });

  it("remembers recent items across games", () => {
    const store = memory();
    const a = new Recent(store, "x");
    const deck = steam.decks[0];
    a.add(deck, deck.items[0], deck.items[1]);
    const b = new Recent(store, "x");
    expect(b.names(deck).has(deck.items[0].name)).toBe(true);
  });

  it("survives broken storage", () => {
    const bad = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } };
    const r = new Recent(bad, "z");
    expect(() => r.add(steam.decks[0], steam.decks[0].items[0])).not.toThrow();
  });
});
