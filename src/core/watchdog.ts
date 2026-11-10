/**
 * Calibration watchdog: notices when the calibration no longer fits the player
 * and asks for a fresh one.
 *
 * Two independent symptoms:
 *   moved    the posture (where the head sits in the frame, how far away, how
 *            it's tilted) has left the range the calibration was validated in.
 *            Sitting up, leaning back in the chair, moving the laptop.
 *   drifted  the signal no longer centres: the drift corrector has run out of
 *            range, or for 7-10 s nearly every reading has fallen on one side.
 * A posture change or a maxed-out drift corrector has to hold for 3 s, so
 * reaching for a drink or a sneeze doesn't count (the one-sided check already
 * spans several seconds on its own).
 *
 * Small changes are absorbed elsewhere (nuisance cancelling, drift correction,
 * learning from picks), and each pick that teaches the model in a new posture
 * moves the "validated" posture a little toward it. Only a change bigger than
 * those can handle trips the watchdog.
 */
import { PRIMARY } from "./calibration";

export type RecalReason = "moved" | "drifted";

/** how far each nuisance reading may wander from the validated posture (reduced-vector index → limit) */
const LIMITS: [index: number, limit: number][] = [
  [PRIMARY + 0, 10], // sideways in the frame, degrees
  [PRIMARY + 1, 10], // up/down in the frame, degrees
  [PRIMARY + 2, 15], // nod, degrees
  [PRIMARY + 3, 15], // tilt, degrees
  [PRIMARY + 4, 7], // distance: 7 units ≈ 26% closer or further
];
const HOLD_MS = 3000;
/** the drift corrector tops out at 0.3; this close to it means it can't keep up */
const DRIFT_LIMIT = 0.25;
/** with a working tracker you can't sit on one side this long without it getting picked */
const LOPSIDED_WINDOW = 10000;
const LOPSIDED_MIN = 7000;
const LOPSIDED_FRAC = 0.92;
/** after "not now", stay quiet this long and accept the new posture */
const SNOOZE_MS = 60000;
/** each validated pick moves the reference this far toward the current posture */
const FOLLOW = 0.3;
/** posture is smoothed over about a second: quick enough to notice sitting up, slow enough to ignore a sneeze */
const POSTURE_TAU = 800;

export class CalibrationWatchdog {
  reason: RecalReason | null = null;
  private ref: number[] | null = null;
  private offSince: number | null = null;
  private sides: { t: number; side: -1 | 0 | 1 }[] = [];
  private quietUntil = -Infinity;
  private cur: number[] | null = null;
  private lastT: number | null = null;

  /** a new calibration: its posture is the reference */
  reset(ref: number[] | null) {
    this.ref = ref ? [...ref] : null;
    this.cur = null;
    this.lastT = null;
    this.offSince = null;
    this.sides = [];
    this.reason = null;
    this.quietUntil = -Infinity;
  }

  /** the model was just shown to work in this posture (a deployed learning update) */
  validated() {
    if (!this.ref || !this.cur) return;
    for (const [i] of LIMITS) this.ref[i] += FOLLOW * (this.cur[i] - this.ref[i]);
  }

  /** the player said "not now": accept where they are, and stay quiet for a while */
  snooze(t: number) {
    if (this.cur) this.ref = [...this.cur];
    this.offSince = null;
    this.sides = [];
    this.reason = null;
    this.quietUntil = t + SNOOZE_MS;
  }

  /** worst posture deviation as a fraction of its limit (above 1 = out of range) */
  shift(base: number[]) {
    if (!this.ref) return 0;
    return Math.max(...LIMITS.map(([i, lim]) => Math.abs(base[i] - this.ref![i]) / lim));
  }

  private lopsided(t: number) {
    const s = this.sides;
    if (!s.length || t - s[0].t < LOPSIDED_MIN) return false;
    const left = s.filter((x) => x.side < 0).length / s.length;
    const right = s.filter((x) => x.side > 0).length / s.length;
    return Math.max(left, right) > LOPSIDED_FRAC;
  }

  /** call with every usable frame (reduced vector); returns why a recalibration is needed, once it's sure */
  update(t: number, r: number[], s: number, driftBias: number): RecalReason | null {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(100, t - this.lastT));
    this.lastT = t;
    if (!this.cur) this.cur = [...r];
    else for (const [i] of LIMITS) this.cur[i] += (r[i] - this.cur[i]) * Math.min(1, dt / POSTURE_TAU);
    if (this.reason) return this.reason;
    this.sides.push({ t, side: s < -0.15 ? -1 : s > 0.15 ? 1 : 0 });
    while (this.sides.length && this.sides[0].t < t - LOPSIDED_WINDOW) this.sides.shift();
    if (t < this.quietUntil) return null;

    if (this.lopsided(t)) return (this.reason = "drifted");
    const moved = this.shift(this.cur) > 1;
    const drifted = Math.abs(driftBias) >= DRIFT_LIMIT;
    if (moved || drifted) {
      this.offSince ??= t;
      if (t - this.offSince >= HOLD_MS) this.reason = moved ? "moved" : "drifted";
    } else this.offSince = null;
    return this.reason;
  }
}
