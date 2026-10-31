/** Local energy is a fallback onset hint, not semantic VAD or an echo canceller. */
export class BargeInGate {
  private floor = 0.005;
  private lastSample: number | undefined;
  private onset: number | undefined;
  private quiet: number | undefined;
  private active = false;

  reset() {
    this.onset = undefined;
    this.quiet = undefined;
    this.active = false;
  }

  isElevated(input: number): boolean {
    return Number.isFinite(input) && input > Math.max(0.02, this.floor * 2.4);
  }

  sample(input: number, outputActive: boolean, asrActive: boolean, now: number): 'start' | 'end' | null {
    if (!Number.isFinite(input) || input < 0 || !Number.isFinite(now)) return null;
    const elapsed = this.lastSample === undefined ? 0 : Math.max(0, Math.min(100, now - this.lastSample));
    this.lastSample = now;
    // Never learn the agent's playback or a recognized visitor as room noise.
    if (!outputActive && !asrActive && !this.active) {
      const weight = 1 - Math.exp(-elapsed / 600);
      this.floor += (Math.min(input, 0.05) - this.floor) * weight;
    }
    if (this.isElevated(input)) {
      this.quiet = undefined;
      if (outputActive && !this.active) {
        this.onset ??= now;
        if (now - this.onset >= 140) {
          this.active = true;
          return 'start';
        }
      } else if (!this.active) this.onset = undefined;
    } else {
      this.onset = undefined;
      this.quiet ??= now;
      if (this.active && now - this.quiet >= 350) {
        this.active = false;
        return 'end';
      }
    }
    return null;
  }
}
