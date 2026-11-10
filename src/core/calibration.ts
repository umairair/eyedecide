/**
 * Three-dot calibration that learns how *this person* looks left and right,
 * and what their body does that isn't looking.
 *
 * Raw sensors are first fused into two redundant estimates (see fusion.ts):
 * head direction and eye direction. Together with the "nuisance" readings
 * (where the head sits, how far, how tilted) they form the reduced vector
 * [head, eyes, ...nuisance].
 *
 * We fit a Fisher discriminant on it: the direction that best separates left
 * from right *relative to how much everything wobbles while the target stays
 * put*. Wobble that moves several readings together (breathing tilts the
 * camera, the head appears to turn, the eyes counter-rotate to stay on the
 * dot) gets cancelled instead of read as a look. Nuisance readings can only
 * cancel wobble, never add signal.
 *
 * The same fit runs again during play (adapt.ts) on what the player has
 * picked since, which is how the calibration keeps up with them.
 */
import { fitFusion, fuseStatic, type FusionModel } from "./fusion";
import { F, FEATURE_COUNT, FLOOR_RAW, LOOKV_DEG, SENSORS, vertical } from "./layout";

export { F, FEATURE_COUNT, LOOKV_DEG, SENSORS, vertical };
export type Features = number[];
export type Dot = "center" | "left" | "right";

/** reduced vector: [head, eyes, ...nuisance] */
export const PRIMARY = 2;
export const REDUCED = PRIMARY + FEATURE_COUNT - SENSORS;

/**
 * Shrinkage toward independent readings guards against learning noise from
 * a few seconds of data. Anything involving a nuisance reading is shrunk
 * harder: those should only cancel wobble that clearly moved with the signal.
 */
const SHRINK = 0.25;
const SHRINK_NUISANCE = 0.5;

/** Labelled frames the model is fitted on: calibration dots, then picks made during play. */
export interface TrainSet {
  rows: number[][];
  label: Dot[];
  /** where that look sits on the signal axis: dots ±1, the game's cards about ±0.6 */
  target: number[];
  /** frames from one look (one dot, one pick) share an id; noise is measured within a look */
  group: number[];
}

/** The left/right axis: where it points, where its middle is, how far each side reaches. */
export interface Axis {
  center: number[];
  scale: number[];
  /** weights on standardised reduced readings */
  w: number[];
  /** pooled within-target covariance of the standardised readings */
  cov: number[][];
  origin: number;
  leftSpan: number;
  rightSpan: number;
  /** separation between left and right in noise units; higher = more reliable */
  quality: number;
  /** typical wobble of the signal while holding still (signal units, ±1 = the dots) */
  noise: number;
}

export interface CalibrationModel extends Axis {
  fusion: FusionModel;
  /** vertical gaze at the center dot, for spotting glances down at the keyboard */
  vCenter: number;
  train: TrainSet;
  /** how many times it has refined itself during play */
  updates: number;
}

export type CalibrationSamples = Record<Dot, Features[]>;

export type CalibrationResult =
  | { ok: true; model: CalibrationModel }
  | { ok: false; reason: string; retry: Dot[] };

/** Minimum left↔right separation (in noise standard deviations) we accept. */
export const MIN_QUALITY = 6;
const MIN_SAMPLES = 8;

export function buildCalibration(s: CalibrationSamples, minQuality = MIN_QUALITY): CalibrationResult {
  const dots: Dot[] = ["center", "left", "right"];
  const lost = dots.filter((d) => s[d].length < MIN_SAMPLES);
  if (lost.length) return { ok: false, reason: "lost your face. stay in frame.", retry: lost };

  // 1. drop the eye movement onto each dot, and any glance away while on it
  const rows = {} as Record<Dot, Features[]>;
  const unsteady: Dot[] = [];
  for (const d of dots) {
    rows[d] = settle(s[d]);
    if (rows[d].length < Math.max(MIN_SAMPLES, s[d].length * 0.35)) unsteady.push(d);
  }
  if (unsteady.length) return { ok: false, reason: "hold your look on the dot.", retry: unsteady };

  // 2. learn how the redundant sensors relate, then fuse every frame
  const fusion = fitFusion([...rows.center, ...rows.left, ...rows.right]);
  const train: TrainSet = { rows: [], label: [], target: [], group: [] };
  dots.forEach((d, g) => {
    for (const r of rows[d]) {
      train.rows.push(fuseStatic(fusion, r));
      train.label.push(d);
      train.target.push(d === "center" ? 0 : d === "left" ? -1 : 1);
      train.group.push(g);
    }
  });

  // 3. the discriminant
  const axis = fitModel(train, fusion);
  const retryBoth: CalibrationResult = { ok: false, reason: "look further toward each dot.", retry: ["left", "right"] };
  if (!axis || !(axis.quality >= minQuality)) return retryBoth;

  // each side has to be clearly away from the middle (the dots sit symmetrically)
  const sd = axis.noise * Math.min(axis.leftSpan, axis.rightSpan);
  const weak: Dot[] = [];
  const mid = axis.leftSpan / (axis.leftSpan + axis.rightSpan);
  if (axis.leftSpan / sd < minQuality * 0.3 || mid < 0.2) weak.push("left");
  if (axis.rightSpan / sd < minQuality * 0.3 || mid > 0.8) weak.push("right");
  if (weak.length) return { ok: false, reason: "look further toward the dot.", retry: weak };

  return {
    ok: true,
    model: { ...axis, fusion, vCenter: med(rows.center.map(vertical)), train, updates: 0 },
  };
}

/** floors for the reduced readings: each group in its reference sensor's units */
const floors = (fusion: FusionModel) => [FLOOR_RAW[fusion.head.ref], FLOOR_RAW[fusion.eyes.ref], ...FLOOR_RAW.slice(SENSORS)];

const rowsOf = (t: TrainSet, d: Dot) => t.rows.filter((_, k) => t.label[k] === d);

/** Fisher discriminant + axis from a training set. Null if a side has too little data. */
export function fitModel(train: TrainSet, fusion: FusionModel): Axis | null {
  const L = rowsOf(train, "left");
  const R = rowsOf(train, "right");
  const C = rowsOf(train, "center");
  if (L.length < 6 || R.length < 6) return null;
  const ml = median(L);
  const mr = median(R);
  const mc = C.length >= 6 ? median(C) : ml.map((v, i) => (v + mr[i]) / 2);
  const dims = REDUCED;

  // robust per-reading noise, pooled over looks (each dot, each pick)
  const byLook = new Map<number, number[][]>();
  train.rows.forEach((r, k) => {
    if (train.label[k] === "center" && C.length < 6) return;
    const g = byLook.get(train.group[k]) ?? [];
    g.push(r);
    byLook.set(train.group[k], g);
  });
  const groups = [...byLook.values()].filter((g) => g.length >= 3);
  const resid = groups.flatMap((g) => {
    const m = median(g);
    return g.map((r) => r.map((v, i) => v - m[i]));
  });
  const fl = floors(fusion);
  const scale = Array.from({ length: dims }, (_, i) =>
    Math.max(1.4826 * med(resid.map((r) => Math.abs(r[i]))), fl[i], i < PRIMARY ? 0.04 * Math.abs(mr[i] - ml[i]) : 0),
  );

  // pooled within-class covariance, standardised; each group of frames centred
  // on its own mean (a pick's frames, a dot's frames)
  const cov = Array.from({ length: dims }, () => new Array(dims).fill(0));
  let n = 0;
  for (const g of groups) {
    const mean = g[0].map((_, i) => g.reduce((a, r) => a + r[i], 0) / g.length);
    for (const r of g) {
      const z = r.map((v, i) => clamp((v - mean[i]) / scale[i], -6, 6));
      for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) cov[i][j] += z[i] * z[j];
      n++;
    }
  }
  for (const row of cov) for (let j = 0; j < dims; j++) row[j] /= Math.max(1, n - groups.length);
  const shrunk = cov.map((row, i) =>
    row.map((v, j) => (i === j ? v + 1e-3 : (1 - (i < PRIMARY && j < PRIMARY ? SHRINK : SHRINK_NUISANCE)) * v)),
  );

  // signal only from the head and eye readings
  const diff = mr.map((v, i) => (i < PRIMARY ? (v - ml[i]) / scale[i] : 0));
  const w = solve(shrunk, diff);
  if (!w || !w.every(Number.isFinite)) return null;
  return fitAxis(train, mc, scale, cov, w);
}

/**
 * Given a direction, place the axis: its middle (the center frames, or halfway
 * between the sides) and how far each side reaches, from each frame's target.
 * Uses only the head and eye readings: the nuisance part averages out.
 */
export function fitAxis(train: TrainSet, center: number[], scale: number[], cov: number[][], w: number[]): Axis | null {
  const p = (r: number[]) => {
    let acc = 0;
    for (let i = 0; i < PRIMARY; i++) acc += (w[i] * (r[i] - center[i])) / scale[i];
    return acc;
  };
  const side = (d: Dot) => train.rows.flatMap((r, k) => (train.label[k] === d ? [{ p: p(r), t: Math.abs(train.target[k]) }] : []));
  const L = side("left");
  const R = side("right");
  const C = side("center");
  if (L.length < 6 || R.length < 6) return null;
  const origin = C.length >= 6 ? med(C.map((x) => x.p)) : (med(L.map((x) => x.p)) + med(R.map((x) => x.p))) / 2;
  const leftSpan = med(L.map((x) => (origin - x.p) / (x.t || 1)));
  const rightSpan = med(R.map((x) => (x.p - origin) / (x.t || 1)));
  if (!(leftSpan > 0 && rightSpan > 0)) return null;
  let v = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) v += w[i] * cov[i][j] * w[j];
  const sd = Math.sqrt(Math.max(v, 1e-12));
  return {
    center,
    scale,
    w,
    cov,
    origin,
    leftSpan,
    rightSpan,
    quality: (leftSpan + rightSpan) / sd,
    noise: sd / Math.min(leftSpan, rightSpan),
  };
}

/**
 * Maps a reduced vector to the calibrated axis: ≈-1 left dot, 0 center, ≈+1 right dot.
 * `base` is the recent average of the nuisance readings: they only cancel
 * fast wobble around it, so slumping or scooting over can't shift the signal.
 */
export function project(m: Axis, r: number[], base?: number[]): number {
  let p = -m.origin;
  for (let i = 0; i < m.w.length; i++) {
    if (i < PRIMARY) p += (m.w[i] * (r[i] - m.center[i])) / m.scale[i];
    else p += m.w[i] * clamp((r[i] - (base?.[i] ?? m.center[i])) / m.scale[i], -4, 4);
  }
  return p < 0 ? p / m.leftSpan : p / m.rightSpan;
}

/**
 * Keeps the part of a dot where the player was actually on it: skips the
 * leading eye/head movement (people are late, and heads are slow) and any
 * blink-shaped or glance-shaped junk in the middle.
 */
export function settle(rows: Features[]): Features[] {
  if (rows.length < 4) return rows;
  const tail = rows.slice(Math.floor(rows.length * 0.4));
  const mid = median(tail);
  const sd = mid.map((m, i) => Math.max(1.4826 * med(tail.map((r) => Math.abs(r[i] - m))), 2 * FLOOR_RAW[i]));
  const dist = (r: Features) => {
    let acc = 0;
    for (let i = 0; i < SENSORS; i++) acc += ((r[i] - mid[i]) / sd[i]) ** 2;
    return Math.sqrt(acc / SENSORS);
  };
  let start = 0;
  while (start < rows.length && dist(rows[start]) > 3.5) start++;
  return rows.slice(start).filter((r) => dist(r) <= 5);
}

/** Gaussian elimination with partial pivoting; null if singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = m[r][c] / m[c][c];
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function med(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function median(rows: number[][]) {
  return rows[0].map((_, i) => med(rows.map((r) => r[i])));
}
