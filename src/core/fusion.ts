/**
 * Redundant sensor fusion with fault detection and isolation.
 *
 * Head direction is measured twice (3D pose, 2D nose geometry); eye direction
 * three times (each iris, the eye-look blendshapes). Each sensor is mapped
 * onto its group's reference scale during calibration. Every frame:
 *   - a sensor far from the others is excluded from that frame (instant masking)
 *   - one that stays out of line is declared faulted until it's back in line
 *   - with three eye sensors, the vote isolates the bad one (2 out of 3)
 *   - with two head sensors, the one that jumped away from its own recent
 *     history is the suspect; if that can't be told, the group is "degraded"
 * The group estimate is the inverse-variance weighted mean of the sensors
 * that pass, so a glare on one lens or a pose glitch can't move the answer.
 */
import { EYE_SENSORS, FLOOR_RAW, HEAD_SENSORS, SENSORS } from "./layout";

export interface SensorMap {
  /** raw feature index */
  i: number;
  /** mapped = a·raw + b, on the group reference's scale */
  a: number;
  b: number;
  /** expected scatter of the mapped value around the group estimate */
  sd: number;
  usable: boolean;
}
export interface Group {
  ref: number;
  sensors: SensorMap[];
}
export interface FusionModel {
  head: Group;
  eyes: Group;
}

/** a sensor this many expected-noise widths from the group is out of line */
const FAULT_K = 6;
/** out of line for this long = faulted; back in line this long = recovered */
const FAULT_MS = 150;
const RECOVER_MS = 600;
const HISTORY = 10;

const med = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
};
/** frame-to-frame noise, robust to the few big jumps between dots */
const diffNoise = (xs: number[]) => {
  const d = xs.slice(1).map((v, k) => Math.abs(v - xs[k]));
  return d.length ? (1.4826 * med(d)) / Math.SQRT2 : 0;
};
function corr(x: number[], y: number[]) {
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < x.length; k++) {
    sxy += (x[k] - mx) * (y[k] - my);
    sxx += (x[k] - mx) ** 2;
    syy += (y[k] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1e-12);
}

function fitGroup(rows: number[][], idx: number[]): Group {
  const cols = idx.map((i) => rows.map((r) => r[i]));
  // reference = the sensor with the most signal for its noise
  const snr = cols.map((x, j) => (quantile(x, 0.9) - quantile(x, 0.1)) / Math.max(diffNoise(x), FLOOR_RAW[idx[j]]));
  const k = snr.indexOf(Math.max(...snr));
  const ref = idx[k];
  const y = cols[k];
  const iqrY = quantile(y, 0.75) - quantile(y, 0.25);
  const sensors = idx.map((i, j): SensorMap => {
    if (j === k) return { i, a: 1, b: 0, sd: Math.max(diffNoise(y), FLOOR_RAW[i]), usable: true };
    const x = cols[j];
    const r = corr(x, y);
    const iqrX = quantile(x, 0.75) - quantile(x, 0.25);
    // a sensor that doesn't track the reference can't vote
    if (!(Math.abs(r) >= 0.5) || iqrX < 1e-9 || iqrY < 1e-9) return { i, a: 0, b: 0, sd: Infinity, usable: false };
    const a = (Math.sign(r) * iqrY) / iqrX; // symmetric (geometric-mean) regression
    const b = med(y) - a * med(x);
    const resid = x.map((v, n) => a * v + b - y[n]);
    return { i, a, b, sd: Math.max(1.4826 * med(resid.map(Math.abs)), FLOOR_RAW[ref]), usable: true };
  });
  return { ref, sensors };
}

/** Learns each group's sensor mapping from calibration frames (all three dots, in time order). */
export function fitFusion(rows: number[][]): FusionModel {
  return { head: fitGroup(rows, HEAD_SENSORS), eyes: fitGroup(rows, EYE_SENSORS) };
}

const mapped = (s: SensorMap, f: number[]) => s.a * f[s.i] + s.b;

function weighted(vals: number[], sds: number[]) {
  let num = 0;
  let den = 0;
  vals.forEach((v, k) => {
    const w = 1 / (sds[k] * sds[k]);
    num += v * w;
    den += w;
  });
  return num / den;
}

/** Stateless fusion (for calibration and training): median vote per group. */
export function fuseStatic(m: FusionModel, f: number[]): number[] {
  const group = (g: Group) => {
    const v = g.sensors.filter((s) => s.usable).map((s) => mapped(s, f));
    return v.length ? med(v) : f[g.ref];
  };
  return [group(m.head), group(m.eyes), ...f.slice(SENSORS)];
}

export interface FusionOutput {
  /** [head, eyes, ...nuisance] */
  reduced: number[];
  /** a group couldn't settle which sensor is wrong: trust this frame less */
  degraded: boolean;
  /** raw indices of sensors currently declared faulted */
  faulted: number[];
}

/** Runtime fusion with debounced fault flags. */
export class FusionState {
  private outSince = new Map<number, number>();
  private inSince = new Map<number, number>();
  private faults = new Set<number>();
  private history = new Map<number, number[]>();

  reset() {
    this.outSince.clear();
    this.inSince.clear();
    this.faults.clear();
    this.history.clear();
  }

  private judge(i: number, out: boolean, t: number) {
    if (out) {
      this.inSince.delete(i);
      if (!this.outSince.has(i)) this.outSince.set(i, t);
      if (t - this.outSince.get(i)! >= FAULT_MS) this.faults.add(i);
    } else {
      this.outSince.delete(i);
      if (!this.faults.has(i)) return;
      if (!this.inSince.has(i)) this.inSince.set(i, t);
      if (t - this.inSince.get(i)! >= RECOVER_MS) this.faults.delete(i);
    }
  }

  /** how far a sensor's mapped value is from its own recent past (in its noise units) */
  private jump(s: SensorMap, v: number) {
    const h = this.history.get(s.i);
    return h && h.length >= 3 ? Math.abs(v - med(h)) / s.sd : 0;
  }

  private remember(s: SensorMap, v: number) {
    const h = this.history.get(s.i) ?? [];
    h.push(v);
    if (h.length > HISTORY) h.shift();
    this.history.set(s.i, h);
  }

  private group(g: Group, f: number[], t: number): { value: number; degraded: boolean } {
    const live = g.sensors.filter((s) => s.usable);
    const v = live.map((s) => mapped(s, f));
    if (live.length === 1) {
      this.remember(live[0], v[0]);
      return { value: v[0], degraded: false };
    }

    let keep: boolean[];
    let degraded = false;
    if (live.length >= 3) {
      // vote: distance from the median of all
      const mid = med(v);
      const typical = med(live.map((s) => s.sd));
      keep = live.map((s, k) => {
        const out = Math.abs(v[k] - mid) > FAULT_K * Math.max(s.sd, typical);
        this.judge(s.i, out, t);
        return !out && !this.faults.has(s.i);
      });
    } else {
      // two sensors: if they disagree, blame the one that jumped from its own history
      const [s0, s1] = live;
      const out = Math.abs(v[0] - v[1]) > FAULT_K * Math.hypot(s0.sd, s1.sd);
      const j0 = this.jump(s0, v[0]);
      const j1 = this.jump(s1, v[1]);
      const blame0 = out && j0 > 3 * Math.max(j1, 1);
      const blame1 = out && j1 > 3 * Math.max(j0, 1);
      this.judge(s0.i, blame0, t);
      this.judge(s1.i, blame1, t);
      keep = [!blame0 && !this.faults.has(s0.i), !blame1 && !this.faults.has(s1.i)];
      if (out && !blame0 && !blame1) degraded = true;
    }

    // keep history only of values we believed, so a fault can't become "normal"
    live.forEach((s, k) => keep[k] && this.remember(s, v[k]));
    const vals = v.filter((_, k) => keep[k]);
    const sds = live.filter((_, k) => keep[k]).map((s) => s.sd);
    if (!vals.length) return { value: med(v), degraded: true };
    return { value: weighted(vals, sds), degraded };
  }

  update(m: FusionModel, f: number[], t: number): FusionOutput {
    const head = this.group(m.head, f, t);
    const eyes = this.group(m.eyes, f, t);
    return {
      reduced: [head.value, eyes.value, ...f.slice(SENSORS)],
      degraded: head.degraded || eyes.degraded,
      faulted: [...this.faults],
    };
  }
}
