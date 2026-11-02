/** A single clock owns scripted actions and captions. Physics is advanced by Engine. */
export interface DemonstrationStep {
  duration: number;
  caption: string;
  enter?: () => void;
  update?: (progress: number) => void;
  /** Gates departure, so the next caption cannot claim a result not yet observed. */
  complete?: () => boolean;
  maxWait?: number;
  simulationSpeed?: number;
}
export interface ExperimentDemonstration {
  steps: readonly DemonstrationStep[];
  dispose?: () => void;
}
export type DemonstrationState = 'idle' | 'playing' | 'paused' | 'manual' | 'completed' | 'failed';
export class DemonstrationPlayer {
  state: DemonstrationState = 'idle';
  caption = '';
  private demo: ExperimentDemonstration | null = null;
  private index = 0;
  private time = 0;
  private entered = false;
  private cleaned = false;
  private listeners = new Set<() => void>();
  get available(): boolean { return !!this.demo?.steps.length; }
  get simulationSpeed(): number { return this.demo?.steps[this.index]?.simulationSpeed ?? 1; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  load(demo: ExperimentDemonstration | null): void {
    this.cleanup(); this.demo = demo; this.cleaned = false; this.index = 0; this.time = 0; this.entered = false;
    this.state = 'idle'; this.caption = ''; this.emit();
  }
  play(): void {
    if (!this.available || !['idle', 'paused'].includes(this.state)) return;
    this.state = 'playing'; this.emit();
  }
  pause(): void { if (this.state === 'playing') { this.state = 'paused'; this.emit(); } }
  takeOver(): void {
    if (this.state === 'playing' || this.state === 'idle' || this.state === 'manual') return;
    this.cleanup(); this.state = 'manual'; this.caption = ''; this.emit();
  }
  beforeFrame(delta: number): void {
    if (this.state !== 'playing' || !this.demo) return;
    try {
      const step = this.demo.steps[this.index];
      if (!this.entered) {
        this.entered = true; this.caption = step.caption; step.enter?.(); this.emit();
      }
      this.time += Math.max(0, delta);
      step.update?.(Math.min(1, this.time / step.duration));
    } catch (error) { this.fail(error); }
  }
  afterFrame(): void {
    if (this.state !== 'playing' || !this.demo) return;
    try {
      const step = this.demo.steps[this.index];
      if (this.time < step.duration) return;
      if (step.complete && !step.complete()) {
        if (this.time > step.duration + (step.maxWait ?? 8)) this.fail(new Error(`Step condition timed out: ${step.caption}`));
        return;
      }
      if (++this.index === this.demo.steps.length) {
        this.state = 'completed'; this.emit();
      } else { this.time = 0; this.entered = false; }
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void {
    console.error('[Demonstration]', error);
    this.cleanup(); this.state = 'failed'; this.caption = '演示暂时中止，可以重新演示或自行操作器材。'; this.emit();
  }
  private cleanup(): void {
    if (!this.cleaned) { this.cleaned = true; this.demo?.dispose?.(); }
  }
  private emit(): void { for (const fn of this.listeners) fn(); }
}
