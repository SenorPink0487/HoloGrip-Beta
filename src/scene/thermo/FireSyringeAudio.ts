/** Short air-pop and crackle accompanying the tinder's ignition flash. */
export class FireSyringeAudio {
  private context: AudioContext | null = null;
  private disposed = false;

  /** Called during direct interaction so the browser can enable audio. */
  public unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;

    try {
      const AudioContextClass = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ??= new AudioContextClass({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => {});
      }
    } catch {
      // Audio is optional when unavailable or blocked by the browser.
    }
  }

  public playIgnition(): void {
    const context = this.context;
    // Never queue a delayed sound that would miss the visible flash.
    if (!context || context.state !== 'running' || this.disposed) return;

    const now = context.currentTime;
    const duration = 0.12;

    // A low, rapidly falling pressure pulse gives the small air-pop its body.
    const pulse = context.createOscillator();
    const pulseGain = context.createGain();
    pulse.type = 'sine';
    pulse.frequency.setValueAtTime(190, now);
    pulse.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    pulseGain.gain.setValueAtTime(0, now);
    pulseGain.gain.linearRampToValueAtTime(0.18, now + 0.002);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    pulse.connect(pulseGain);
    pulseGain.connect(context.destination);
    pulse.onended = () => {
      pulse.disconnect();
      pulseGain.disconnect();
    };

    // Filtered noise adds a brief tinder crackle without a long explosion tail.
    const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.random() * 2 - 1;
    }
    const crackle = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const crackleGain = context.createGain();
    crackle.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(0.7, now);
    crackleGain.gain.setValueAtTime(0, now);
    crackleGain.gain.linearRampToValueAtTime(0.24, now + 0.001);
    crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    crackle.connect(filter);
    filter.connect(crackleGain);
    crackleGain.connect(context.destination);
    crackle.onended = () => {
      crackle.disconnect();
      filter.disconnect();
      crackleGain.disconnect();
    };

    pulse.start(now);
    pulse.stop(now + duration);
    crackle.start(now);
    crackle.stop(now + duration);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => {});
    }
    this.context = null;
  }
}
