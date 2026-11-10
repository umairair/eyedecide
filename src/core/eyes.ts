/**
 * Turns "eyes closed" readings into two things:
 *  - suppress: eyes have been shut long enough that this isn't a normal blink,
 *    so stop feeding a (stale) gaze signal into dwell
 *  - fired: eyes held shut for `holdMs` → the hands-free pause gesture.
 *    Fires once per closure.
 */
export class EyeCloseDetector {
  private since: number | null = null;
  private done = false;

  constructor(
    public holdMs = 1400,
    public suppressMs = 350,
  ) {}

  reset() {
    this.since = null;
    this.done = false;
  }

  update(closed: boolean, t: number): { suppress: boolean; fired: boolean; closedMs: number } {
    if (!closed) {
      this.reset();
      return { suppress: false, fired: false, closedMs: 0 };
    }
    this.since ??= t;
    const closedMs = t - this.since;
    let fired = false;
    if (!this.done && closedMs >= this.holdMs) {
      this.done = true;
      fired = true;
    }
    return { suppress: closedMs >= this.suppressMs, fired, closedMs };
  }
}
