/**
 * Qualification: requirements, verified by Monte Carlo over simulated
 * missions with faults injected mid-flight.
 *
 *   R1  never pick the side the player isn't looking at          (0 wrong picks)
 *   R2  never pick while the player rests in the middle          (0 false picks)
 *   R3  a deliberate look is picked within 3 s                   (≤ 2% misses; strategy change: see R5)
 *   R4  picks are quick                                          (median ≤ 1.9 s, p95 ≤ 2.6 s from the start of the look)
 *   R5  it relearns a player who changes how they look           (after the change, the second half has ≤ 1 miss per run)
 *   R6  single sensor faults are isolated, not obeyed            (the faulty sensor is flagged; R1-R4 hold under each fault)
 *   R7  learning can't be poisoned by clicks that contradict the eyes
 *   R8  no needless "set up again" prompts in any of these missions
 */
import { describe, expect, it } from "vitest";
import { buildCalibration, type CalibrationSamples, type Dot } from "./calibration";
import { DwellMachine, type Side } from "./dwell";
import { GazeProcessor } from "./gaze";
import { F } from "./layout";
import { HEAVY_BREATHING, Player, type Faults, type PlayerOpts } from "./sim";

const FRAME = 33;
const DOT: Record<Dot, number> = { center: 0, left: -18, right: 18 };
const CARD = 9;
const WILD = { hz: 0.5, tilt: 12, sway: 4, roll: 6, bob: 5 };

interface Mission {
  name: string;
  opts: PlayerOpts;
  /** faults active during calibration */
  setupFaults?: Faults;
  /** runs before pick k (change faults, strategy, posture…) */
  before?: (p: Player, k: number) => void;
  picks?: number;
  restMs?: number;
  /** the player clicks when a look doesn't pick (like the app's "just click it") */
  clicksWhenStuck?: boolean;
  /** pick index from which R5 is judged */
  judgeFrom?: number;
  /** R6: this raw sensor must get flagged as faulted */
  isolates?: number;
}

interface Result {
  wrong: number;
  falsePicks: number;
  missed: number;
  missedLate: number;
  latencies: number[];
  updates: number;
  rejected: number;
  faultsSeen: number[];
  recal: string | null;
}

function fly(mission: Mission, seed: number): Result {
  const p = new Player({ ...mission.opts, seed });
  p.fault = { ...(mission.setupFaults ?? {}) };
  const g = new GazeProcessor();
  for (let i = 0; i < 20; i++) g.update(p.frame(p.t + FRAME));

  // calibration, exactly like the setup screen (redo failed dots, relax after retries)
  const samples: CalibrationSamples = { center: [], left: [], right: [] };
  let queue: Dot[] = ["center", "left", "right"];
  for (let attempt = 0; ; attempt++) {
    for (const d of queue) {
      samples[d] = [];
      p.lookAt(DOT[d]);
      const start = p.t;
      while (p.t - start < 1650) {
        const f = p.frame(p.t + FRAME);
        if (!g.update(f).closed && p.t - start >= 250) samples[d].push(f.features);
      }
    }
    const res = buildCalibration(samples, attempt < 2 ? 6 : attempt < 4 ? 4.5 : 3.5);
    if (res.ok) {
      g.setModel(res.model);
      break;
    }
    if (attempt > 8) throw new Error(`${mission.name}: calibration never passed (${res.reason})`);
    queue = res.retry;
  }
  p.fault = {};

  const out: Result = { wrong: 0, falsePicks: 0, missed: 0, missedLate: 0, latencies: [], updates: 0, rejected: 0, faultsSeen: [], recal: null };
  const seen = new Set<number>();
  const machine = () =>
    new DwellMachine({
      dwellMs: 1100,
      deadZone: Math.max(0.3, Math.min(0.45, 2.5 * (g.model?.noise ?? 0))),
      requireCenter: true,
      cooldownMs: 700,
    });
  /** look at x for up to ms; returns the first pick and when */
  const look = (m: DwellMachine, ms: number, x: number) => {
    p.lookAt(x);
    const start = p.t;
    while (p.t - start < ms) {
      const o = g.update(p.frame(p.t + FRAME));
      g.stats.faulted.forEach((i) => seen.add(i));
      if (o.recal && !out.recal) out.recal = `${o.recal} at pick ${picksDone}`;
      const r = m.update(o.s, FRAME, o.sigma);
      if (r.committed) {
        g.learn(r.committed, p.t, "gaze");
        return { side: r.committed, at: p.t - start };
      }
    }
    return null;
  };

  let picksDone = 0;
  let m = machine();
  if (look(m, mission.restMs ?? 20000, 0)) out.falsePicks++;
  const n = mission.picks ?? 16;
  for (let k = 0; k < n; k++) {
    mission.before?.(p, k);
    m = machine(); // a fresh round, like a new card pair
    const rest = look(m, 900, 0);
    if (rest) out.falsePicks++;
    const side: Side = p.rand() < 0.5 ? "left" : "right";
    const got = look(m, 3000, side === "left" ? -CARD : CARD);
    if (!got) {
      out.missed++;
      if (k >= (mission.judgeFrom ?? n)) out.missedLate++;
      if (mission.clicksWhenStuck) g.learn(side, p.t, "manual");
    } else if (got.side !== side) out.wrong++;
    else out.latencies.push(got.at);
    picksDone++;
  }
  out.updates = g.stats.updates;
  out.rejected = g.stats.rejected;
  out.faultsSeen = [...seen];
  return out;
}

const MISSIONS: Mission[] = [
  { name: "nominal", opts: { headShare: 0.4 } },
  { name: "head-turner", opts: { headShare: 0.85 } },
  { name: "eyes only", opts: { headShare: 0.05 } },
  { name: "laptop on a heaving belly", opts: { headShare: 0.4, breath: HEAVY_BREATHING } },
  { name: "wild bouncing + dim room", opts: { headShare: 0.4, breath: WILD, jitter: 2 } },
  { name: "fidgety + blinks every second", opts: { headShare: 0.4, wander: 4, blinkEveryMs: 1000, breath: HEAVY_BREATHING } },
  { name: "glare on one lens mid-game", opts: { headShare: 0.4 }, isolates: F.irisL, before: (p, k) => k === 3 && (p.fault.irisL = "glare") },
  { name: "glare on one lens from setup", opts: { headShare: 0.4 }, setupFaults: { irisL: "glare" }, before: (p, k) => k === 0 && (p.fault.irisL = "glare") },
  { name: "stuck iris reading", opts: { headShare: 0.3 }, isolates: F.irisL, before: (p, k) => k === 2 && (p.fault.irisL = "stuck") },
  { name: "blendshapes die mid-game", opts: { headShare: 0.2 }, isolates: F.look, before: (p, k) => k === 4 && (p.fault.look = "dead") },
  { name: "pose solver glitching", opts: { headShare: 0.6 }, before: (p, k) => k === 3 && (p.fault.yaw = "spikes") },
  { name: "pose solver jumps 14°", opts: { headShare: 0.6 }, isolates: F.yaw, before: (p, k) => k === 3 && (p.fault.yaw = "bias") },
  {
    name: "slumps, scoots and sits back",
    opts: { headShare: 0.4, breath: HEAVY_BREATHING },
    before: (p, k) => {
      if (k === 5) Object.assign(p.posture, { ax: p.posture.ax + 8, ay: p.posture.ay - 5, dist: p.posture.dist + 8 });
    },
  },
  {
    name: "head-turner gets lazy, uses eyes only",
    opts: { headShare: 0.85 },
    picks: 24,
    clicksWhenStuck: true,
    judgeFrom: 16,
    before: (p, k) => k === 6 && (p.o.headShare = 0.1),
  },
  {
    name: "everything at once",
    opts: { headShare: 0.4, breath: HEAVY_BREATHING, wander: 3, glitch: 0.03 },
    before: (p, k) => {
      if (k === 2) p.fault.irisL = "glare";
      if (k === 6) p.fault.yaw = "spikes";
    },
  },
];

const SEEDS = [1, 2, 3, 4];

describe("qualification (Monte Carlo, fault injection)", () => {
  const all: { name: string; r: Result }[] = [];
  for (const mission of MISSIONS) {
    it(mission.name, () => {
      for (const seed of SEEDS) {
        const r = fly(mission, seed);
        all.push({ name: mission.name, r });
        expect(r.wrong, `${mission.name} #${seed}: wrong picks`).toBe(0); // R1
        expect(r.falsePicks, `${mission.name} #${seed}: false picks`).toBe(0); // R2
        if (mission.judgeFrom !== undefined) expect(r.missedLate, `${mission.name} #${seed}: misses after relearning`).toBeLessThanOrEqual(1); // R5
        if (mission.isolates !== undefined) expect(r.faultsSeen, `${mission.name} #${seed}: isolation`).toContain(mission.isolates); // R6
        expect(r.recal, `${mission.name} #${seed}: needless re-setup`).toBeNull(); // R8
      }
    });
  }

  it("R7: clicking one side while looking at the other teaches it nothing", () => {
    for (const seed of SEEDS) {
      const p = new Player({ headShare: 0.4, seed });
      const g = new GazeProcessor();
      for (let i = 0; i < 20; i++) g.update(p.frame(p.t + FRAME));
      const samples: CalibrationSamples = { center: [], left: [], right: [] };
      for (const d of ["center", "left", "right"] as Dot[]) {
        p.lookAt(DOT[d]);
        const start = p.t;
        while (p.t - start < 1650) {
          const f = p.frame(p.t + FRAME);
          if (!g.update(f).closed && p.t - start >= 250) samples[d].push(f.features);
        }
      }
      const res = buildCalibration(samples);
      if (!res.ok) throw new Error("calibration");
      g.setModel(res.model);
      // ten times: reads the left card, clicks the right one
      for (let k = 0; k < 10; k++) {
        p.lookAt(-CARD);
        for (let i = 0; i < 45; i++) g.update(p.frame(p.t + FRAME));
        g.learn("right", p.t, "manual");
      }
      expect(g.stats.updates, `seed ${seed}`).toBe(0);
      // and looking left still picks left
      const m = new DwellMachine({ dwellMs: 1100, deadZone: 0.3, requireCenter: true });
      p.lookAt(0);
      for (let i = 0; i < 30; i++) m.update(g.update(p.frame(p.t + FRAME)).s, FRAME);
      p.lookAt(-CARD);
      let got: Side | null = null;
      for (let i = 0; i < 90 && !got; i++) {
        const o = g.update(p.frame(p.t + FRAME));
        got = m.update(o.s, FRAME, o.sigma).committed;
      }
      expect(got, `seed ${seed}`).toBe("left");
    }
  });

  it("meets the fleet-wide numbers (R3, R4) and prints the report", () => {
    const judged = all.filter((x) => !MISSIONS.find((m) => m.name === x.name)?.judgeFrom);
    const picks = judged.reduce((n, x) => n + x.r.latencies.length + x.r.missed + x.r.wrong, 0);
    const missed = judged.reduce((n, x) => n + x.r.missed, 0);
    const lat = all.flatMap((x) => x.r.latencies).sort((a, b) => a - b);
    const q = (k: number) => lat[Math.floor(k * (lat.length - 1))];
    const rows = MISSIONS.map((m) => {
      const rs = all.filter((x) => x.name === m.name).map((x) => x.r);
      const sum = (f: (r: Result) => number) => rs.reduce((a, r) => a + f(r), 0);
      const l = rs.flatMap((r) => r.latencies).sort((a, b) => a - b);
      return [
        m.name.padEnd(38),
        String(sum((r) => r.latencies.length)).padStart(4),
        String(sum((r) => r.wrong)).padStart(5),
        String(sum((r) => r.falsePicks)).padStart(5),
        String(sum((r) => r.missed)).padStart(5),
        `${(l[Math.floor(l.length / 2)] / 1000).toFixed(2)}s`.padStart(7),
        String(sum((r) => r.updates)).padStart(7),
        String(sum((r) => r.rejected)).padStart(7),
      ].join(" ");
    });
    console.log(
      [
        `${"mission".padEnd(38)} pick wrong false  miss  median  learned rejected`,
        ...rows,
        `total picks ${lat.length}, wrong ${all.reduce((n, x) => n + x.r.wrong, 0)}, false ${all.reduce((n, x) => n + x.r.falsePicks, 0)}, miss rate ${((100 * missed) / picks).toFixed(2)}% (excl. strategy change), median ${(q(0.5) / 1000).toFixed(2)}s, p95 ${(q(0.95) / 1000).toFixed(2)}s`,
      ].join("\n"),
    );
    expect(missed / picks).toBeLessThanOrEqual(0.02); // R3
    expect(q(0.5)).toBeLessThanOrEqual(1900); // R4
    expect(q(0.95)).toBeLessThanOrEqual(2600);
  });
});
