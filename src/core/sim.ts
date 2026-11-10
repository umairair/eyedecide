/**
 * A simulated player for tests: a head, two eyes and a laptop camera that
 * all move, producing the same feature vector `extractFeatures` does.
 *
 * Geometry is in "appearance" degrees as the camera sees it (+x = player's
 * right, +y = down). The screen is bolted to the camera, so a player fixating
 * a screen point keeps a constant total gaze no matter how the laptop moves;
 * whatever the head doesn't cover, the eyes do.
 */
import type { GazeInput } from "./gaze";

export interface Breath {
  hz: number;
  /** camera nod, degrees of line of sight */
  tilt: number;
  /** sideways camera sway, degrees */
  sway: number;
  /** camera roll, degrees */
  roll: number;
  /** toward/away bob, cm */
  bob: number;
}

export const HEAVY_BREATHING: Breath = { hz: 0.3, tilt: 5, sway: 1.2, roll: 2, bob: 2 };

/** injected sensor faults (each can be switched on and off mid-run) */
export interface Faults {
  /** glare on the left lens: that iris reading turns to noise */
  irisL?: "glare" | "stuck";
  /** the blendshape model stops reporting eye direction */
  look?: "dead";
  /** the 3D pose solver glitches, or jumps to a wrong offset */
  yaw?: "spikes" | "bias";
  /** both head readings shift by this many degrees (the laptop got turned on the lap) */
  headOffset?: number;
}

export interface PlayerOpts {
  seed?: number;
  /** share of each look done by turning the head (0 = eyes only) */
  headShare?: number;
  breath?: Breath | null;
  /** slow natural head wander, degrees */
  wander?: number;
  /** landmark noise multiplier */
  jitter?: number;
  /** resting eyelid "closed" score (heavy lids read high) */
  lids?: number;
  blinkEveryMs?: number;
  /** chance per frame of a mangled landmark frame */
  glitch?: number;
  /** how much up/down motion leaks into the left/right readings (real trackers aren't clean) */
  crosstalk?: number;
}

/** the screen centre sits this far below the lens (camera on the top bezel) */
const SCREEN_BELOW = 12;

export class Player {
  t = 0;
  posture = { ax: 2, ay: 10, dist: 48, pitch: 0 };
  breath: Breath | null;
  fault: Faults = {};
  /** mutable mid-run: e.g. switch from turning the head to moving the eyes */
  o: Required<Omit<PlayerOpts, "breath">>;
  private seed: number;
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private moveAt = 0;
  private nextBlink: number;
  private ph: number[];

  constructor(opts: PlayerOpts = {}) {
    this.o = { seed: 1, headShare: 0.4, wander: 1.5, jitter: 1, lids: 0.15, blinkEveryMs: 3500, glitch: 0.01, crosstalk: 0.08, ...opts };
    this.breath = opts.breath === undefined ? null : opts.breath;
    this.seed = this.o.seed * 7919 + 13;
    this.nextBlink = 1000 + this.rand() * this.o.blinkEveryMs;
    this.ph = Array.from({ length: 6 }, () => this.rand() * Math.PI * 2);
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  /** roughly normal, sd 1 */
  gauss() {
    return (this.rand() + this.rand() + this.rand() + this.rand() - 2) * 1.732;
  }

  /** start looking at a new screen point (degrees from centre); reacts like a person, not instantly */
  lookAt(x: number, y = 0) {
    const g = this.target(this.t, 1);
    this.from = g;
    this.to = { x, y };
    this.moveAt = this.t + 250 + this.rand() * 200;
  }

  private target(t: number, lag: number) {
    const k = Math.min(1, Math.max(0, (t - this.moveAt) / (180 * lag)));
    const e = k * k * (3 - 2 * k);
    return { x: this.from.x + (this.to.x - this.from.x) * e, y: this.from.y + (this.to.y - this.from.y) * e };
  }

  /** advance to time t and read one camera frame */
  frame(t: number): GazeInput {
    this.t = t;
    const o = this.o;
    const j = o.jitter;
    const n = (sd: number) => this.gauss() * sd * j;
    const b = this.breath;
    const phi = b ? 2 * Math.PI * b.hz * (t / 1000) : 0;
    const sway = b ? b.sway * Math.sin(phi) : 0;
    const tilt = b ? b.tilt * Math.sin(phi) : 0;
    const roll = b ? b.roll * Math.sin(phi + 0.7) : 0;
    const bob = b ? b.bob * Math.sin(phi) : 0;
    const w = o.wander;
    const wx = w * (0.6 * Math.sin(t / 1160 + this.ph[0]) + 0.4 * Math.sin(t / 493 + this.ph[1]));
    const wy = 0.6 * w * (0.6 * Math.sin(t / 1370 + this.ph[2]) + 0.4 * Math.sin(t / 611 + this.ph[3]));

    const gaze = this.target(t, 1); // eyes are quick
    const aim = this.target(t, 2.5); // heads are slow
    const gx = gaze.x;
    const gy = gaze.y + SCREEN_BELOW;
    // the head points part of the way; the camera's motion changes how it looks
    const hy = SCREEN_BELOW * 0.5 + o.headShare * aim.y + wy + tilt + this.posture.pitch;
    const hx = o.headShare * aim.x + wx + sway + (roll * Math.PI * hy) / 180;
    const ex = gx - hx;
    const ey = gy - hy;
    const leak = o.crosstalk * (hy - SCREEN_BELOW * 0.5);
    const leakE = o.crosstalk * (ey - SCREEN_BELOW * 0.5);

    let blink = Math.max(0, o.lids + n(0.03));
    const blinking = t >= this.nextBlink && t < this.nextBlink + 140;
    if (t >= this.nextBlink + 140) this.nextBlink = t + o.blinkEveryMs * (0.6 + this.rand() * 0.8);
    if (blinking) blink = 0.92;

    const dist = this.posture.dist + bob;
    const f = [
      -hx + leak + n(0.35), // yaw: + = player's left, as MediaPipe's camera frame has it
      -hx * 1.08 + 1.5 + 0.5 * leak + n(0.6), // yaw2: same head turn, own scale, offset and noise
      -(ex + leakE) * 0.011 + n(0.006),
      -(ex - leakE) * 0.0105 + n(0.006),
      Math.max(-1, Math.min(1, ex / 28 + n(0.03))),
      this.posture.ax - sway + 0.15 * hx + n(0.05),
      this.posture.ay + tilt + n(0.05),
      hy + n(0.4),
      roll + n(0.2),
      30 * Math.log(dist) + n(0.02),
      ey / 30 + n(0.03),
    ];
    if (blinking) {
      f[2] += (this.rand() - 0.5) * 0.16;
      f[3] += (this.rand() - 0.5) * 0.16;
      f[4] = 0;
      f[10] += 0.4;
    }
    if (this.rand() < o.glitch) {
      f[0] += (this.rand() - 0.5) * 50;
      f[2] += (this.rand() - 0.5) * 0.2;
      f[3] += (this.rand() - 0.5) * 0.2;
    }
    const fault = this.fault;
    if (fault.irisL === "glare") f[3] = (this.rand() - 0.5) * 0.6;
    if (fault.irisL === "stuck") f[3] = 0.12;
    if (fault.look === "dead") f[4] = 0;
    if (fault.yaw === "spikes" && this.rand() < 0.3) f[0] += (this.rand() < 0.5 ? -1 : 1) * (15 + this.rand() * 25);
    if (fault.yaw === "bias") f[0] += 14;
    if (fault.headOffset) {
      f[0] += fault.headOffset;
      f[1] += fault.headOffset * 1.08;
    }
    return { t, features: f, blink, framed: true };
  }
}
