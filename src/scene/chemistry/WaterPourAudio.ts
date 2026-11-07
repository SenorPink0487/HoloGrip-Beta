/** Recorded water pouring into glass, controlled by actual liquid transfer. */
export class WaterPourAudio {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private loading = false;
  private loadAbort: AbortController | null = null;
  private flow = 0;
  private disposed = false;

  /** Prepare the recording while the operator grabs a beaker. */
  public unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ??= new AudioContextClass({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') {
        void this.context.resume().then(() => this.startIfReady()).catch(() => {});
      }
      if (!this.buffer && !this.loading) void this.loadRecording(this.context);
    } catch {
      // Sound is optional on devices without usable Web Audio.
    }
  }

  private async loadRecording(context: AudioContext): Promise<void> {
    this.loading = true;
    this.loadAbort = new AbortController();
    try {
      const response = await fetch(new URL('../../assets/audio/water-pour.wav', import.meta.url), {
        signal: this.loadAbort.signal,
      });
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (this.disposed) return;
      this.buffer = buffer;
      // A completed download must not play a pour that has already stopped.
      this.startIfReady();
    } catch {
      // Keep pouring usable offline or if decoding is unavailable.
    } finally {
      this.loading = false;
      this.loadAbort = null;
    }
  }

  public setFlow(millilitresPerSecond: number): void {
    if (this.disposed) return;
    this.flow = Number.isFinite(millilitresPerSecond) ? Math.max(0, millilitresPerSecond) : 0;
    if (this.flow <= 0) {
      this.stop();
      return;
    }
    this.startIfReady();
    this.updateLevel();
  }

  private startIfReady(): void {
    const context = this.context;
    if (this.disposed || this.source || !this.buffer || !context ||
        context.state !== 'running' || this.flow <= 0 ||
        (typeof document !== 'undefined' && document.hidden)) return;

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, context.currentTime);
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    this.source = source;
    this.gain = gain;
    source.start(context.currentTime);
    this.updateLevel();
  }

  private updateLevel(): void {
    if (!this.source || !this.gain || !this.context) return;
    const now = this.context.currentTime;
    const strength = Math.sqrt(Math.min(1, this.flow / 60));
    // Keep the recording's original speed and pitch; only follow the real flow's loudness.
    this.gain.gain.setTargetAtTime(0.35 + strength * 0.5, now, 0.035);
  }

  public stop(): void {
    this.flow = 0;
    if (!this.source || !this.gain || !this.context) return;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0, now, 0.025);
    this.source.stop(now + 0.12);
    this.source = null;
    this.gain = null;
  }

  public dispose(): void {
    this.stop();
    this.disposed = true;
    this.loadAbort?.abort();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => {});
    }
    this.context = null;
    this.buffer = null;
  }
}
