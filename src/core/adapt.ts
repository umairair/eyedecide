/**
 * On-the-fly recalibration.
 *
 * Every pick is a labelled example: the player was looking at that side for
 * the second before it. Those frames go into the training set (oldest of that
 * side dropped first, so calibration data is slowly replaced by fresh data)
 * and the discriminant is refitted. People change how they look as they play
 * (more eyes, less head; sitting back; getting tired); this follows them.
 *
 * The data always accumulates; a refit is only a candidate. Like a
 * flight-software update it has to pass acceptance checks against the live
 * model before it's deployed:
 *   - rate limit: the new direction is at most halfway from the old one
 *   - it must still separate left from right well (quality floor)
 *   - this pick must read on the right side, and no weaker than before
 *   - regression: every recent pick the live model read correctly must still
 *     read correctly, and no pick's reading may change by more than 2×
 * Fail any check and the live model stays as it was (the evidence is kept,
 * so a real change in how the player looks wins out over a few picks).
 */
import { fitAxis, fitModel, med, project, type CalibrationModel, type TrainSet } from "./calibration";
import type { Side } from "./dwell";

/** where the game's cards sit on the axis (calibration dots are ±1) */
export const CARD = 0.6;
/** frames kept per side; a pick adds ~25, so this remembers the last ~8 picks per side */
const CAP_PER_SIDE = 200;
/** how far one update may turn the axis toward the refit */
const ETA = 0.5;
const MAX_SPAN_CHANGE = 2;
const QUALITY_FLOOR = 3.5;

export interface LearnEvent {
  side: Side;
  /** reduced vectors from the look that made the pick */
  rows: number[][];
  source: "gaze" | "manual";
  t: number;
}

export type AdaptResult = ({ ok: true; model: CalibrationModel } | { ok: false; reason: string }) & {
  /** the training set with this pick added: keep it whether or not the update was deployed */
  train: TrainSet;
};

export function withEvent(train: TrainSet, ev: LearnEvent): TrainSet {
  const group = Math.max(-1, ...train.group) + 1;
  const t: TrainSet = {
    rows: [...train.rows, ...ev.rows],
    label: [...train.label, ...ev.rows.map(() => ev.side)],
    target: [...train.target, ...ev.rows.map(() => (ev.side === "left" ? -CARD : CARD))],
    group: [...train.group, ...ev.rows.map(() => group)],
  };
  // evict the oldest frames of this side beyond the cap
  let extra = t.label.filter((l) => l === ev.side).length - CAP_PER_SIDE;
  if (extra <= 0) return t;
  const keep = t.label.map((l) => {
    if (l !== ev.side || extra <= 0) return true;
    extra--;
    return false;
  });
  const pick = <T,>(xs: T[]) => xs.filter((_, k) => keep[k]);
  return { rows: pick(t.rows), label: pick(t.label), target: pick(t.target), group: pick(t.group) };
}

const unit = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

/** median signal of an event under a model, with its own nuisance as the baseline */
export function eventSignal(m: CalibrationModel, ev: LearnEvent) {
  const base = ev.rows[0].map((_, i) => med(ev.rows.map((r) => r[i])));
  return med(ev.rows.map((r) => project(m, r, base)));
}

/**
 * @param m the live model
 * @param data everything learned so far (starts as the calibration's training set)
 * @param recent recent picks, oldest first, for the regression check
 */
export function adapt(m: CalibrationModel, data: TrainSet, ev: LearnEvent, recent: LearnEvent[]): AdaptResult {
  if (ev.rows.length < 6) return { ok: false, reason: "too few frames", train: data };
  const train = withEvent(data, ev);
  const no = (reason: string): AdaptResult => ({ ok: false, reason, train });
  const cand = fitModel(train, m.fusion);
  if (!cand) return no("refit failed");

  // rate limit: blend directions in raw units, then re-place the axis
  const rawOld = unit(m.w.map((v, i) => v / m.scale[i]));
  const rawNew = unit(cand.w.map((v, i) => v / cand.scale[i]));
  const blended = unit(rawOld.map((v, i) => (1 - ETA) * v + ETA * rawNew[i])).map((v, i) => v * cand.scale[i]);
  const axis = fitAxis(train, cand.center, cand.scale, cand.cov, blended);
  if (!axis) return no("axis failed");
  if (axis.quality < Math.max(QUALITY_FLOOR, 0.6 * m.quality)) return no("quality dropped");

  const next: CalibrationModel = { ...m, ...axis, train, updates: m.updates + 1 };
  const read = (model: CalibrationModel, e: LearnEvent) => eventSignal(model, e) * (e.side === "left" ? -1 : 1);

  // this pick: on the right side, and no weaker than the live model reads it
  const now = read(next, ev);
  if (!(now > 0) || now < read(m, ev) - 0.02) return no("doesn't help this pick");

  // regression: nothing that read correctly may stop doing so, nothing may jump
  for (const e of recent.slice(-8)) {
    const before = read(m, e);
    const after = read(next, e);
    if (before >= 0.25 && after < 0.2) return no("would misread an earlier pick");
    if (before > 0.2 && (after / before > MAX_SPAN_CHANGE || after / before < 1 / MAX_SPAN_CHANGE)) return no("too big a jump");
  }
  return { ok: true, model: next, train };
}
