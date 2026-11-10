/**
 * One Euro filter (Casiez et al. 2012): heavy smoothing when the signal is still,
 * light smoothing when it moves fast. Removes landmark jitter without adding lag
 * to deliberate head/eye movements.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.3,
    public dCutoff = 1.0,
  ) {}

  reset() {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }

  /** @param value new sample  @param tMs timestamp in milliseconds */
  filter(value: number, tMs: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.lastT = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
    this.lastT = tMs;

    const rawDx = (value - this.x) / dt;
    const aD = alpha(this.dCutoff, dt);
    this.dx = aD * rawDx + (1 - aD) * this.dx;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
}

function alpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
