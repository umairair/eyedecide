export type Side = "left" | "right";

export interface DwellConfig {
  /** how long you must keep looking at a side to choose it */
  dwellMs: number;
  /** |signal| below this counts as looking at the middle (no choice) */
  deadZone: number;
  /** once in a zone, you can drift this far back toward center before leaving it */
  hysteresis?: number;
  /** how much faster progress drains than it fills when you look away */
  decay?: number;
  /**
   * slipping out of a side for less than this pauses its progress instead of
   * draining it: a breath, a blink-shaped wobble or a glance at the score
   * shouldn't cost you the look
   */
  graceMs?: number;
  /** pause after a choice so one long look doesn't fire twice */
  cooldownMs?: number;
  /** per-side multiplier on dwellMs, e.g. a quick "next" and a deliberate "play" */
  scale?: Partial<Record<Side, number>>;
  /**
   * Only start listening once the gaze has passed through the middle, and
   * again after every choice. Stops the look that picked something on the
   * previous screen from instantly picking on the next one.
   */
  requireCenter?: boolean;
}

/** standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7) */
export function phi(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** below this certainty a look fills nothing; at FULL_P and above it fills at full speed */
const MIN_P = 0.5;
const FULL_P = 0.9;
/** to commit, the look must have been at least this certain for SURE_MS straight */
const COMMIT_P = 0.8;
const SURE_MS = 250;

export interface DwellState {
  zone: Side | null;
  left: number;
  right: number;
  committed: Side | null;
  armed: boolean;
  /** probability the look really is past the middle zone on the focused side */
  certainty: number;
}

/**
 * Turns a continuous left/right signal into deliberate choices.
 * Time-based, so it behaves the same at 15 fps or 60 fps (the original
 * version added a fixed amount per detected frame and had no neutral zone,
 * so any jitter drifted toward a side).
 */
export class DwellMachine {
  private zone: Side | null = null;
  private progress = { left: 0, right: 0 };
  private out = { left: Infinity, right: Infinity };
  private sureMs = 0;
  private certainty = 0;
  private cooldown = 0;
  private armed: boolean;

  constructor(private cfg: DwellConfig) {
    this.armed = !cfg.requireCenter;
  }

  reset() {
    this.zone = null;
    this.progress = { left: 0, right: 0 };
    this.out = { left: Infinity, right: Infinity };
    this.sureMs = 0;
    this.cooldown = 0;
    this.armed = !this.cfg.requireCenter;
  }

  /**
   * @param s calibrated signal (-1 left … +1 right), or null if no face is visible
   * @param sigma current uncertainty of `s`. With it, progress fills only as
   *   fast as the tracker is sure the look is past the middle zone, and a
   *   choice commits only once it has been sure for a moment. Unsure means
   *   slower, never wrong. 0 = trust `s` as is.
   */
  update(s: number | null, dtMs: number, sigma = 0): DwellState {
    const { dwellMs, deadZone } = this.cfg;
    const hyst = this.cfg.hysteresis ?? 0.08;
    const decay = this.cfg.decay ?? 1.5;
    const grace = this.cfg.graceMs ?? 220;

    if (s === null) {
      // Face lost: freeze progress rather than punishing the player.
      this.zone = null;
      return this.snapshot(null);
    }

    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dtMs);
      this.zone = null;
      return this.snapshot(null);
    }

    if (!this.armed) {
      if (Math.abs(s) < deadZone) this.armed = true;
      else return this.snapshot(null);
    }

    const exit = Math.max(0, deadZone - hyst);
    if (this.zone === "left" && s > -exit) this.zone = null;
    else if (this.zone === "right" && s < exit) this.zone = null;
    if (this.zone === null) {
      if (s <= -deadZone) this.zone = "left";
      else if (s >= deadZone) this.zone = "right";
    }

    // how sure is it that the eyes really are on this side?
    let gain = 1;
    this.certainty = this.zone ? 1 : 0;
    if (this.zone && sigma > 0) {
      const past = (this.zone === "left" ? -s : s) - deadZone;
      this.certainty = phi(past / sigma);
      gain = Math.min(1, Math.max(0, (this.certainty - MIN_P) / (FULL_P - MIN_P)));
    }
    this.sureMs = this.zone && this.certainty >= COMMIT_P ? this.sureMs + dtMs : 0;

    for (const side of ["left", "right"] as const) {
      const fill = dtMs / (dwellMs * (this.cfg.scale?.[side] ?? 1));
      if (side === this.zone) {
        this.out[side] = 0;
        this.progress[side] = Math.min(1, this.progress[side] + fill * gain);
      } else {
        // looking at the other side ends the grace at once
        this.out[side] = this.zone ? Infinity : this.out[side] + dtMs;
        if (this.out[side] > grace) this.progress[side] = Math.max(0, this.progress[side] - fill * decay);
      }
    }

    if (this.zone && this.progress[this.zone] >= 1 && (sigma <= 0 || this.sureMs >= SURE_MS)) {
      const chosen = this.zone;
      this.progress = { left: 0, right: 0 };
      this.zone = null;
      this.cooldown = this.cfg.cooldownMs ?? 700;
      if (this.cfg.requireCenter) this.armed = false;
      return this.snapshot(chosen);
    }
    return this.snapshot(null);
  }

  private snapshot(committed: Side | null): DwellState {
    return {
      zone: this.zone,
      left: this.progress.left,
      right: this.progress.right,
      committed,
      armed: this.armed,
      certainty: this.certainty,
    };
  }
}
