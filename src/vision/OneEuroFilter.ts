/**
 * 1€ (One Euro) 滤波器：兼顾超低延迟与消除抖动的自适应信号平滑算法。
 * 参考：Casiez, G., Roussel, N. and Vogel, D. (2012).
 * 1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in HCI.
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = value;
    this.s = alpha * value + (1.0 - alpha) * (this.s as number);
    return this.s;
  }

  public lastValue(): number {
    return this.s ?? 0;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  /**
   * @param minCutoff 最小截止频率（Hz），数值越小在静止状态下的防抖效果越强。
   * @param beta 速度系数，数值越大在快速运动时的跟踪延迟越低。
   * @param dCutoff 导数滤波器的截止频率（Hz）。
   */
  constructor(minCutoff = 1.2, beta = 0.008, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  public filter(val: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(val, 1.0);
    }

    const dt = Math.max((timestampMs - this.lastTime) / 1000.0, 1e-4);
    this.lastTime = timestampMs;

    const prevValue = this.xFilter.lastValue();
    const dx = (val - prevValue) / dt;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(val, this.alpha(cutoff, dt));
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class PointFilter2D {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public filter(x: number, y: number, timestampMs: number): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestampMs),
      y: this.filterY.filter(y, timestampMs),
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}
