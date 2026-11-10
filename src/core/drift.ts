/**
 * Slowly re-centres the signal while the player rests near the middle.
 * People slouch, lean back and shift in their chair; without this, a
 * calibration from two minutes ago gradually starts leaning to one side.
 * Only learns from near-centre samples and is clamped, so it can never
 * cancel out a deliberate look.
 */
export class DriftCorrector {
  bias = 0;

  constructor(
    public tauMs = 8000,
    public window = 0.18,
    public maxBias = 0.3,
  ) {}

  reset() {
    this.bias = 0;
  }

  /** @param learn false while the reading is unreliable (looking away) */
  update(raw: number, dtMs: number, learn = true): number {
    const s = raw - this.bias;
    if (learn && Math.abs(s) < this.window) {
      this.bias += (raw - this.bias) * Math.min(1, dtMs / this.tauMs);
      this.bias = Math.max(-this.maxBias, Math.min(this.maxBias, this.bias));
    }
    return s;
  }
}
