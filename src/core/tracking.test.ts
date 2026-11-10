import { describe, expect, it } from "vitest";
import { buildCalibration, project, settle, type CalibrationModel, type CalibrationSamples, type Dot } from "./calibration";
import { DwellMachine, type Side } from "./dwell";
import { GazeProcessor } from "./gaze";
import { HEAVY_BREATHING, Player, type PlayerOpts } from "./sim";

const FRAME = 33;
/** the calibration dots and the game's two cards, in degrees from screen centre */
const DOT: Record<Dot, number> = { center: 0, left: -18, right: 18 };
const CARD = 9;

/** runs the calibration screen's flow: 250 ms settle, 1.4 s capture per dot */
function calibrate(p: Player, g: GazeProcessor, dots: Dot[] = ["center", "left", "right"], samples?: CalibrationSamples) {
  const out = samples ?? { center: [], left: [], right: [] };
  for (const d of dots) {
    out[d] = [];
    p.lookAt(DOT[d]);
    const start = p.t;
    while (p.t - start < 1650) {
      const f = p.frame(p.t + FRAME);
      const r = g.update(f);
      if (p.t - start >= 250 && !r.closed) out[d].push(f.features);
    }
  }
  return out;
}

function setup(opts: PlayerOpts, playOpts: { breatheAfter?: boolean } = {}) {
  const p = new Player({ ...opts, breath: playOpts.breatheAfter ? null : opts.breath });
  const g = new GazeProcessor();
  for (let i = 0; i < 20; i++) g.update(p.frame(p.t + FRAME)); // face found
  const res = buildCalibration(calibrate(p, g));
  if (!res.ok) throw new Error(`calibration failed: ${res.reason}`);
  g.setModel(res.model);
  if (playOpts.breatheAfter) p.breath = opts.breath ?? null;
  return { p, g, model: res.model };
}

/** like useBinaryChoice */
function dwell(model: CalibrationModel) {
  return new DwellMachine({
    dwellMs: 1100,
    deadZone: Math.max(0.3, Math.min(0.45, 2.5 * model.noise)),
    requireCenter: true,
    cooldownMs: 700,
  });
}

/** plays for `ms` looking at x; returns the picks made and the signal seen */
function play(p: Player, g: GazeProcessor, m: DwellMachine, ms: number, x?: number, y = 0) {
  if (x !== undefined) p.lookAt(x, y);
  const picks: { side: Side; at: number }[] = [];
  /** signal once the eyes/head have arrived (after the first second) */
  const s: number[] = [];
  const start = p.t;
  while (p.t - start < ms) {
    const out = g.update(p.frame(p.t + FRAME));
    if (out.s !== null && p.t - start > 1000) s.push(out.s);
    const r = m.update(out.s, FRAME, out.sigma);
    if (r.committed) {
      g.learn(r.committed, p.t, "gaze"); // like the app: every pick refines the calibration
      picks.push({ side: r.committed, at: p.t - start });
    }
  }
  return { picks, s };
}

const sd = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** a full round: settle at the middle, then pick a card */
function pick(p: Player, g: GazeProcessor, m: DwellMachine, side: Side) {
  play(p, g, m, 900, 0);
  return play(p, g, m, 2600, side === "left" ? -CARD : CARD).picks;
}

const PLAYERS: [string, PlayerOpts][] = [
  ["a head-turner", { headShare: 0.8 }],
  ["a typical player", { headShare: 0.4 }],
  ["an eyes-only player", { headShare: 0.05 }],
];

describe("tracking, simulated players", () => {
  for (const [who, base] of PLAYERS) {
    for (const [how, extra] of [
      ["sitting still", {}],
      ["with a laptop on a heaving belly", { breath: HEAVY_BREATHING }],
    ] as [string, PlayerOpts][]) {
      it(`${who} ${how}: never picks while resting, picks every card asked for`, () => {
        for (const seed of [1, 2, 3]) {
          const { p, g, model } = setup({ ...base, ...extra, seed });
          const m = dwell(model);
          const rest = play(p, g, m, 30000, 0);
          expect(rest.picks).toEqual([]);
          expect(sd(rest.s)).toBeLessThan(0.1);
          for (const side of ["left", "right", "right", "left", "left", "right"] as Side[]) {
            const picks = pick(p, g, m, side);
            expect(picks.map((x) => x.side)).toEqual([side]);
            expect(picks[0].at).toBeLessThan(2000); // reaction + head movement + 1.1 s hold
          }
        }
      });
    }
  }

  it("holds up under extreme conditions", () => {
    const WILD = { hz: 0.5, tilt: 12, sway: 4, roll: 6, bob: 5 };
    const cases: PlayerOpts[] = [
      { headShare: 0.4, breath: WILD },
      { headShare: 0.05, breath: WILD },
      { headShare: 0.4, breath: HEAVY_BREATHING, jitter: 2.5 }, // dim room, grainy webcam
      { headShare: 0.4, breath: HEAVY_BREATHING, glitch: 0.05 },
      { headShare: 0.4, breath: HEAVY_BREATHING, wander: 4 }, // fidgety
      { headShare: 0.4, breath: HEAVY_BREATHING, blinkEveryMs: 1000 },
    ];
    for (const [k, o] of cases.entries()) {
      const { p, g, model } = setup({ ...o, seed: 30 + k });
      const m = dwell(model);
      expect(play(p, g, m, 30000, 0).picks).toEqual([]);
      for (const side of ["left", "right", "left", "right"] as Side[]) {
        expect(pick(p, g, m, side).map((x) => x.side)).toEqual([side]);
      }
    }
  });

  it("cancels breathing it saw during calibration", () => {
    const { p, g, model } = setup({ headShare: 0.4, breath: { ...HEAVY_BREATHING, sway: 2.5, roll: 3 }, seed: 4 });
    const rest = play(p, g, dwell(model), 20000, 0);
    expect(sd(rest.s)).toBeLessThan(0.08);
    expect(model.noise).toBeLessThan(0.1);
  });

  it("copes when the heavy breathing only starts after calibration", () => {
    for (const seed of [5, 6, 7]) {
      const { p, g, model } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed }, { breatheAfter: true });
      const m = dwell(model);
      expect(play(p, g, m, 60000, 0).picks).toEqual([]);
      expect(pick(p, g, m, "left").map((x) => x.side)).toEqual(["left"]);
      expect(pick(p, g, m, "right").map((x) => x.side)).toEqual(["right"]);
    }
  });

  it("survives slumping, scooting and leaning back mid-game", () => {
    const { p, g, model } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed: 8 });
    const m = dwell(model);
    expect(pick(p, g, m, "left").length).toBe(1);
    // over two seconds: slide 8° sideways in the frame, sink, sit 6 cm further back
    for (let k = 0; k < 60; k++) {
      p.posture.ax += 8 / 60;
      p.posture.ay -= 4 / 60;
      p.posture.dist += 6 / 60;
      play(p, g, m, FRAME);
    }
    expect(play(p, g, m, 20000, 0).picks).toEqual([]);
    expect(pick(p, g, m, "right").map((x) => x.side)).toEqual(["right"]);
    expect(pick(p, g, m, "left").map((x) => x.side)).toEqual(["left"]);
  });

  it("looking down at the keyboard or a phone never picks", () => {
    const { p, g, model } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed: 9 });
    const m = dwell(model);
    play(p, g, m, 1000, 0);
    const down = play(p, g, m, 6000, CARD * 1.5, 40);
    expect(down.picks).toEqual([]);
    play(p, g, m, 1500, 0);
    expect(pick(p, g, m, "right").length).toBe(1);
  });

  it("a quick glance at the other card doesn't lose the pick or pick the other card", () => {
    const { p, g, model } = setup({ headShare: 0.4, seed: 10 });
    const m = dwell(model);
    play(p, g, m, 900, 0);
    const a = play(p, g, m, 1200, -CARD);
    const b = play(p, g, m, 250, CARD);
    const c = play(p, g, m, 1500, -CARD);
    expect([...a.picks, ...b.picks, ...c.picks].map((x) => x.side)).toEqual(["left"]);
  });

  it("works with heavy eyelids that always look half shut", () => {
    const { p, g, model } = setup({ headShare: 0.3, lids: 0.5, breath: HEAVY_BREATHING, seed: 11 });
    const m = dwell(model);
    expect(play(p, g, m, 15000, 0).picks).toEqual([]);
    expect(pick(p, g, m, "left").map((x) => x.side)).toEqual(["left"]);
  });

  it("maps the cards to about halfway and the dots to about ±1", () => {
    const { p, g, model } = setup({ headShare: 0.4, seed: 12 });
    const m = dwell(model);
    const at = (x: number) => mean(play(p, g, m, 2500, x).s.slice(-30));
    expect(at(-18)).toBeCloseTo(-1, 0);
    expect(at(18)).toBeCloseTo(1, 0);
    expect(at(-CARD)).toBeLessThan(-0.35);
    expect(at(CARD)).toBeGreaterThan(0.35);
    expect(Math.abs(at(0))).toBeLessThan(0.15);
  });
});

describe("calibration, human error", () => {
  const fresh = (opts: PlayerOpts = {}) => {
    const p = new Player({ headShare: 0.4, ...opts });
    const g = new GazeProcessor();
    for (let i = 0; i < 20; i++) g.update(p.frame(p.t + FRAME));
    return { p, g };
  };

  it("trims the late, slow move onto each dot", () => {
    const { p, g } = fresh({ seed: 20 });
    const s = calibrate(p, g);
    // the first ~0.5 s of each side dot is still travelling
    expect(settle(s.left).length).toBeLessThan(s.left.length);
    const res = buildCalibration(s);
    expect(res.ok).toBe(true);
  });

  it("shrugs off a glance away in the middle of a dot", () => {
    const { p, g } = fresh({ seed: 21 });
    const s = calibrate(p, g, ["center"]);
    p.lookAt(DOT.left);
    const left: number[][] = [];
    const start = p.t;
    while (p.t - start < 1650) {
      if (Math.abs(p.t - start - 900) < FRAME / 2) p.lookAt(DOT.right); // oops, something on the right
      if (Math.abs(p.t - start - 1150) < FRAME / 2) p.lookAt(DOT.left);
      const f = p.frame(p.t + FRAME);
      if (!g.update(f).closed && p.t - start >= 250) left.push(f.features);
    }
    s.left = left;
    calibrate(p, g, ["right"], s);
    const res = buildCalibration(s);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const gp = new GazeProcessor();
    gp.setModel(res.model);
    p.lookAt(DOT.left);
    let last = 0;
    for (let i = 0; i < 80; i++) last = gp.update(p.frame(p.t + FRAME)).s ?? last;
    expect(last).toBeLessThan(-0.7);
  });

  it("asks to redo only the dot the player barely looked at", () => {
    const { p, g } = fresh({ seed: 22 });
    const s = calibrate(p, g, ["center", "right"]);
    p.lookAt(-1.5); // stopped way short of the left dot
    s.left = [];
    const start = p.t;
    while (p.t - start < 1650) {
      const f = p.frame(p.t + FRAME);
      if (!g.update(f).closed && p.t - start >= 250) s.left.push(f.features);
    }
    const res = buildCalibration(s);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.retry).toEqual(["left"]);
    // redoing just that dot fixes it
    expect(buildCalibration(calibrate(p, g, ["left"], s)).ok).toBe(true);
  });

  it("asks for both sides when left and right look the same", () => {
    const { p, g } = fresh({ seed: 23, headShare: 0 });
    const s = calibrate(p, g, ["center"]);
    for (const d of ["left", "right"] as Dot[]) {
      p.lookAt(d === "left" ? -0.5 : 0.5);
      s[d] = [];
      const start = p.t;
      while (p.t - start < 1650) {
        const f = p.frame(p.t + FRAME);
        if (!g.update(f).closed && p.t - start >= 250) s[d].push(f.features);
      }
    }
    const res = buildCalibration(s);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retry).toEqual(["left", "right"]);
  });

  it("redoes a dot where the face kept dropping out", () => {
    const { p, g } = fresh({ seed: 24 });
    const s = calibrate(p, g);
    s.right = s.right.slice(0, 4);
    const res = buildCalibration(s);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retry).toEqual(["right"]);
  });

  it("nuisance features can't add signal, only cancel wobble", () => {
    const { p, g, model } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed: 25 });
    void p;
    void g;
    // shove every nuisance feature far outside anything seen: the signal barely moves
    const still = [...model.center];
    const shoved = still.map((v, i) => (i >= 4 ? v + 50 * model.scale[i] : v));
    const delta = Math.abs(project(model, shoved, still) - project(model, still, still));
    expect(delta).toBeLessThan(0.6);
  });
});

describe("calibration watchdog", () => {
  /** plays for ms looking at x; returns when (ms into the run) a re-setup was first asked for */
  const until = (p: Player, g: GazeProcessor, ms: number, x = 0) => {
    p.lookAt(x);
    const start = p.t;
    while (p.t - start < ms) {
      const o = g.update(p.frame(p.t + FRAME));
      if (o.recal) return { reason: o.recal, at: p.t - start };
    }
    return null;
  };

  it("asks for a new setup within seconds when you sit up", () => {
    for (const seed of [1, 2, 3]) {
      const { p, g } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed });
      expect(until(p, g, 8000)).toBeNull();
      // sit up straight: further from the laptop, face higher in the frame, head tipped back
      Object.assign(p.posture, { dist: p.posture.dist + 16, ay: p.posture.ay - 12, pitch: -10 });
      const hit = until(p, g, 10000);
      expect(hit?.reason, `seed ${seed}`).toBe("moved");
      expect(hit!.at).toBeLessThan(6000);
    }
  });

  it("notices when the laptop gets turned and the signal stops centring", () => {
    for (const seed of [4, 5, 6]) {
      const { p, g } = setup({ headShare: 0.4, seed });
      expect(until(p, g, 6000)).toBeNull();
      p.fault.headOffset = 10;
      const hit = until(p, g, 20000);
      expect(hit?.reason, `seed ${seed}`).toBe("drifted");
      expect(hit!.at).toBeLessThan(15000);
    }
  });

  it("stays quiet for a minute after 'not now', and accepts the new posture", () => {
    const { p, g } = setup({ headShare: 0.4, seed: 7 });
    Object.assign(p.posture, { dist: p.posture.dist + 16, ay: p.posture.ay - 12 });
    expect(until(p, g, 10000)?.reason).toBe("moved");
    g.snoozeRecal(p.t);
    expect(until(p, g, 70000)).toBeNull();
  });

  it("after the new setup, everything works again in the new posture", () => {
    const { p, g } = setup({ headShare: 0.4, breath: HEAVY_BREATHING, seed: 8 });
    Object.assign(p.posture, { dist: p.posture.dist + 16, ay: p.posture.ay - 12, pitch: -10 });
    expect(until(p, g, 10000)?.reason).toBe("moved");
    const res = buildCalibration(calibrate(p, g));
    if (!res.ok) throw new Error(res.reason);
    g.setModel(res.model);
    const m = dwell(res.model);
    expect(play(p, g, m, 20000, 0).picks).toEqual([]);
    for (const side of ["left", "right", "left"] as Side[]) expect(pick(p, g, m, side).map((x) => x.side)).toEqual([side]);
    expect(until(p, g, 10000)).toBeNull();
  });
});
