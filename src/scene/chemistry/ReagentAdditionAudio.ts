import { ChemistryEngine, type ChemicalReagent } from '../../chemistry/ChemistryEngine.ts';

type AdditionKind = 'drop' | 'solid';
const RECORDINGS: Record<AdditionKind, URL> = {
  drop: new URL('../../assets/audio/reagent-drop.wav', import.meta.url),
  solid: new URL('../../assets/audio/solid-drop.wav', import.meta.url),
};

class ReagentAdditionAudio {
  private context: AudioContext | null = null;
  private recordings = new Map<AdditionKind, Promise<AudioBuffer | null>>();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private generation = 0;
  private listening = false;

  public prepare(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioContextClass = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      this.context ??= new AudioContextClass({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      for (const kind of Object.keys(RECORDINGS) as AdditionKind[]) this.load(kind, this.context);
      if (!this.listening) {
        this.listening = true;
        window.addEventListener('blur', () => this.stop());
        window.addEventListener('pagehide', () => {
          this.stop();
          if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
          this.context = null;
          this.recordings.clear();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) this.stop();
        });
      }
      return this.context;
    } catch {
      return null;
    }
  }

  private load(kind: AdditionKind, context: AudioContext): Promise<AudioBuffer | null> {
    const cached = this.recordings.get(kind);
    if (cached) return cached;
    const pending = fetch(RECORDINGS[kind])
      .then(async response => {
        if (!response.ok) throw new Error('Recording unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      })
      .catch(() => {
        if (this.recordings.get(kind) === pending) this.recordings.delete(kind);
        return null;
      });
    this.recordings.set(kind, pending);
    return pending;
  }

  public async play(reagent: ChemicalReagent, quantity: number): Promise<void> {
    const context = this.prepare();
    if (!context) return;
    this.stop();
    const generation = this.generation;
    const requestedAt = performance.now();
    const kind: AdditionKind = reagent.state === 'solid' ? 'solid' : 'drop';
    const buffer = await this.load(kind, context);
    if (!buffer || this.context !== context || context.state !== 'running' ||
        generation !== this.generation || document.hidden || performance.now() - requestedAt > 750) return;

    const count = kind === 'drop' ? Math.min(5, Math.max(1, Math.round(quantity))) : Math.min(3, Math.ceil(quantity));
    const duration = buffer.duration;
    const level = kind === 'drop' ? 0.32 : 0.48;
    for (let i = 0; i < count; i++) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const start = context.currentTime + i * (kind === 'drop' ? 0.16 : 0.09);
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.008);
      gain.gain.setValueAtTime(level, start + duration - 0.06);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      source.connect(gain);
      gain.connect(context.destination);
      this.voices.set(source, gain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(source);
      };
      source.start(start);
      source.stop(start + duration);
    }
  }

  private stop(): void {
    this.generation++;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const [source, gain] of this.voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.01);
      source.stop(now + 0.04);
    }
    this.voices.clear();
  }
}

const additionAudio = new ReagentAdditionAudio();

export function prepareReagentAudio(): void {
  additionAudio.prepare();
}

/** Only drops and solid additions have audio; beaker pouring has its own sound. */
export function addReagentWithAudio(engine: ChemistryEngine, reagentId: string, amount?: number) {
  const reagent = ChemistryEngine.REAGENTS[ChemistryEngine.REAGENT_ALIASES[reagentId] || reagentId];
  const volumeBefore = engine.state.volume;
  const reaction = engine.addReagent(reagentId, amount);
  if (!reagent || (reagent.state === 'liquid' && reagent.unit !== '滴')) return reaction;
  const requestedQuantity = amount ?? reagent.defaultAmount;
  const addedVolume = Math.max(0, engine.state.volume - volumeBefore);
  const quantity = reagent.state === 'solid' ? requestedQuantity : addedVolume / ChemistryEngine.DROP_VOLUME_ML;
  if (Number.isFinite(quantity) && quantity > 0) {
    void additionAudio.play(reagent, quantity).catch(() => {});
  }
  return reaction;
}
