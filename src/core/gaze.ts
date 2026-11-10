import { adapt, type LearnEvent } from "./adapt";
import { FEATURE_COUNT, med, PRIMARY, project, vertical, type CalibrationModel, type Features, type TrainSet } from "./calibration";
import type { Side } from "./dwell";
import { DriftCorrector } from "./drift";
import { EyeCloseDetector } from "./eyes";
import { FusionState } from "./fusion";
import { OneEuroFilter } from "./oneEuro";
import { CalibrationWatchdog, type RecalReason } from "./watchdog";

export interface GazeInput {
  t: number;
  features: Features;
  /** 0 … 1 eye-closed score */
  blink: number;
  /** eyes and nose fully inside the picture */
  framed: boolean;
}

/** ok: nominal · degraded: a sensor is out or the signal is shaky, so picks wait until sure */
export type Health = "ok" | "degraded";

export interface GazeOutput {
  /** ≈-1 left … +1 right, or null when it shouldn't drive a choice */
  s: number | null;
  /** one standard deviation of uncertainty on `s` right now */
  sigma: number;
  /** this frame's features are unusable (blink, eye half out of frame) */
  closed: boolean;
  /** looking well above or below the screen (keyboard, phone, someone in the room) */
  away: boolean;
  health: Health;
  /** the calibration no longer fits (the player moved, or the signal drifted): set up again */
  recal: RecalReason | null;
  /** eyes just held shut on purpose: the hands-free "pause". True for one frame per closure. */
  hold: boolean;
}

/** nuisance readings cancel wobble around their recent average (breathing ≈ 0.2–0.5 Hz passes) */
const NUISANCE_TAU = 6000;
/** iris landmarks are smeared for a moment after the lids reopen */
const REOPEN_MS = 90;
/** degrees beyond the centre gaze that count as off the screen; screen edges sit at ~12° */
const AWAY_ENTER = 28;
const AWAY_EXIT = 20;
const AWAY_MS = 150;
/** frames kept for turning a pick into training data */
const KEEP_MS = 3000;
/** live noise estimate time constant */
const NOISE_TAU = 1500;
/** extra uncertainty while a sensor group can't settle which sensor is wrong */
const DEGRADED_SIGMA = 1.6;

interface Kept {
  t: number;
  reduced: number[];
  s: number;
}

export interface GazeStats {
  updates: number;
  rejected: number;
  lastReason: string;
  faulted: number[];
  liveNoise: number;
}

/**
 * Per-frame signal chain, free of camera/DOM so it can be tested with a
 * simulated player: raw sensors → fault-tolerant fusion → calibrated axis →
 * spike filter → drift correction → One Euro smoothing, with an uncertainty
 * estimate, blink and look-away gating, and learning from picks.
 */
export class GazeProcessor {
  model: CalibrationModel | null = null;
  readonly filter = new OneEuroFilter(1.2, 0.4);
  stats: GazeStats = { updates: 0, rejected: 0, lastReason: "", faulted: [], liveNoise: 0 };
  /** called whenever learning deploys a refined model */
  onModel?: (m: CalibrationModel) => void;

  private fusion = new FusionState();
  private watch = new CalibrationWatchdog();
  private drift = new DriftCorrector();
  private eyes = new EyeCloseDetector();
  private blinkBase = 0.25;
  private closedAt = -Infinity;
  private held: number | null = null;
  private last3: number[] = [];
  private base: number[] | null = null;
  private vBase = 0;
  private awaySince: number | null = null;
  private away = false;
  private lastT: number | null = null;
  private lastRaw: number | null = null;
  private hfVar = 0;
  private kept: Kept[] = [];
  private events: LearnEvent[] = [];
  /** everything learned so far, deployed or not */
  private data: TrainSet | null = null;
  private learnedAt = -Infinity;
  private sigma = 0;
  private health: Health = "ok";

  setModel(m: CalibrationModel | null) {
    this.model = m;
    this.drift.reset();
    this.fusion.reset();
    this.vBase = m?.vCenter ?? 0;
    this.base = null;
    this.watch.reset(m?.center ?? null);
    this.away = false;
    this.awaySince = null;
    this.events = [];
    this.data = m?.train ?? null;
    this.kept = [];
    this.hfVar = 0;
    this.stats = { updates: 0, rejected: 0, lastReason: "", faulted: [], liveNoise: 0 };
    this.reset();
  }

  /** face lost: forget short-term state, keep what was learned about posture */
  reset() {
    this.filter.reset();
    this.eyes.reset();
    this.last3 = [];
    this.held = null;
    this.lastT = null;
    this.lastRaw = null;
  }

  /** how closed the eyes must look to count as a blink; follows heavy-lidded players */
  get blinkThreshold() {
    return Math.min(0.85, Math.max(0.5, this.blinkBase + 0.3));
  }

  update({ t, features: f, blink, framed }: GazeInput): GazeOutput {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(100, t - this.lastT));
    this.lastT = t;
    const quiet = (closed: boolean): GazeOutput => ({
      s: null,
      sigma: this.sigma,
      closed,
      away: this.away,
      health: this.health,
      recal: this.watch.reason,
      hold: false,
    });

    // Lids that sit low (looking down at a laptop in your lap) read as half
    // closed all the time. Track the resting level instead of a fixed cut-off.
    if (blink < this.blinkBase + 0.3) this.blinkBase += (blink - this.blinkBase) * Math.min(1, dt / 3000);
    const closed = blink > this.blinkThreshold || !framed || f.length < FEATURE_COUNT;
    const lids = this.eyes.update(closed, t);
    if (closed || t - this.closedAt < REOPEN_MS) {
      if (closed) this.closedAt = t;
      // hold through a normal blink, go quiet if they stay shut
      const hold = !lids.suppress && !this.away;
      // only real lids count as the gesture, not a face sliding out of frame
      return { ...quiet(true), s: hold ? this.held : null, hold: lids.fired && blink > this.blinkThreshold };
    }

    const m = this.model;
    if (!m) return { s: null, sigma: 0, closed: false, away: false, health: "ok", recal: null, hold: false };

    // 1. redundant sensors → head and eye estimates, with faulty sensors voted out
    const fu = this.fusion.update(m.fusion, f, t);
    const r = fu.reduced;
    this.stats.faulted = fu.faulted;

    if (!this.base) this.base = [...r];
    else {
      const k = Math.min(1, dt / NUISANCE_TAU);
      for (let i = PRIMARY; i < r.length; i++) this.base[i] += (r[i] - this.base[i]) * k;
    }

    // 2. off-screen? (sustained, with hysteresis; the baseline follows slow posture changes)
    const dv = vertical(f) - this.vBase;
    if (Math.abs(dv) < AWAY_EXIT / 2) this.vBase += dv * Math.min(1, dt / 30000);
    if (this.away) {
      if (Math.abs(dv) < AWAY_EXIT) this.away = false;
    } else if (Math.abs(dv) > AWAY_ENTER) {
      this.awaySince ??= t;
      if (t - this.awaySince >= AWAY_MS) this.away = true;
    } else this.awaySince = null;
    if (this.away) this.awaySince = null;

    // 3. calibrated axis; median of 3 so a single mangled frame can't fling it
    const projected = project(m, r, this.base);
    this.last3.push(projected);
    if (this.last3.length > 3) this.last3.shift();
    const raw = [...this.last3].sort((a, b) => a - b)[this.last3.length >> 1];

    // 4. live noise: frame-to-frame scatter (capped so a deliberate look barely counts)
    if (this.lastRaw !== null) {
      const d = Math.min(Math.abs(raw - this.lastRaw), 0.2);
      this.hfVar += ((d * d) / 2 - this.hfVar) * Math.min(1, dt / NOISE_TAU);
    }
    this.lastRaw = raw;
    // smoothing removes most frame-to-frame scatter; ~0.45 of it survives
    const live = 0.45 * Math.sqrt(this.hfVar);
    this.stats.liveNoise = live;

    // narrow, so a weak but real look isn't mistaken for a drifting middle
    this.drift.window = Math.max(0.15, 2 * m.noise);
    const s = this.filter.filter(this.drift.update(raw, dt, !this.away), t);
    this.held = s;

    this.sigma = Math.hypot(m.noise, live) * (fu.degraded ? DEGRADED_SIGMA : 1);
    this.health = fu.degraded || fu.faulted.length > 0 || live > 2.5 * m.noise ? "degraded" : "ok";

    if (!this.away) {
      this.kept.push({ t, reduced: r, s });
      while (this.kept.length && this.kept[0].t < t - KEEP_MS) this.kept.shift();
      this.watch.update(t, r, s, this.drift.bias);
    }
    return {
      s: this.away ? null : s,
      sigma: this.sigma,
      closed: false,
      away: this.away,
      health: this.health,
      recal: this.watch.reason,
      hold: false,
    };
  }

  /** "not now" on the re-setup prompt: accept the current posture and stay quiet a while */
  snoozeRecal(t: number) {
    this.watch.snooze(t);
  }

  /**
   * The player just picked `side`. Turn the look that led to it into training
   * data and try to refine the calibration. `gaze`: picked by looking (only
   * confident picks commit). `manual`: clicked or pressed a key, usually while
   * looking at what they click; skipped if they were clearly looking at the
   * other side. Returns whether the model was updated.
   */
  learn(side: Side, t: number, source: "gaze" | "manual"): boolean {
    const m = this.model;
    if (!m || t - this.learnedAt < 400) return false;
    const [from, to] = source === "gaze" ? [t - 800, t - 80] : [t - 700, t - 50];
    const look = this.kept.filter((k) => k.t >= from && k.t <= to);
    if (look.length < 8) return false;
    const sign = side === "left" ? -1 : 1;
    const s = med(look.map((k) => k.s)) * sign;
    // a click only teaches if the eyes already lean that way: clicking one card
    // while reading the other mustn't teach the tracker that's what "right" looks like
    if (source === "manual" && s <= 0) return false;
    if (source === "gaze" && s < 0.2) return false;
    this.learnedAt = t;

    const ev: LearnEvent = { side, rows: look.map((k) => k.reduced), source, t };
    const res = adapt(m, this.data ?? m.train, ev, this.events);
    this.data = res.train;
    this.events.push(ev);
    if (this.events.length > 8) this.events.shift();
    if (!res.ok) {
      this.stats.rejected++;
      this.stats.lastReason = res.reason;
      return false;
    }
    this.model = res.model;
    this.watch.validated();
    this.stats.updates++;
    this.stats.lastReason = "";
    this.onModel?.(res.model);
    return true;
  }
}
