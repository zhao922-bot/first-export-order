/** 只累计可见、允许写入且最近交互后两分钟内的时间；每个区间只结算一次。 */
export class ActiveClock {
  private last: number;
  private interaction = Number.NEGATIVE_INFINITY;
  private visible = false;
  private now: () => number;
  private idleMs: number;
  constructor(now: () => number, idleMs = 120000) {
    this.now = now;
    this.idleMs = idleMs;
    this.last = now();
  }
  tick(): number {
    const now = Math.max(this.last, this.now());
    const elapsed = this.visible
      ? Math.max(0, Math.min(now, this.interaction + this.idleMs) - this.last)
      : 0;
    this.last = now;
    return elapsed;
  }
  interact(): number {
    const elapsed = this.tick();
    this.interaction = this.last;
    return elapsed;
  }
  visibility(visible: boolean): number {
    const elapsed = this.tick();
    this.visible = visible;
    return elapsed;
  }
}
