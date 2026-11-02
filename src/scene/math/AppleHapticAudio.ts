/**
 * AppleHapticAudio - 模拟苹果原生 Taptic Engine 线性马达震感与精密微交互声效
 * 结合 Web Audio API 合成音与硬件 navigator.vibrate 震动，营造极具质感的力学触感反馈。
 */
export class AppleHapticAudio {
  private static audioCtx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * 按下起点微触感：轻微清脆的高频玻璃点按音（类似 iOS 3D Touch 接触初态）
   */
  public static playTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.016);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.020);
    } catch {
      // Ignore audio error
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    } catch {
      // Ignore vibration error
    }
  }

  /**
   * 长按达成消散 Pop：苹果标志性两段式触觉脉冲
   * 1. 135Hz -> 42Hz 超低频次重音，模拟线性马达物理弹片回击
   * 2. 2600Hz -> 850Hz 晶体微爆破高频泛音，营造空气感与科技感
   */
  public static playPop(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 段 1：超低频冲击核心（重感与弹性）
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(145, now);
      subOsc.frequency.exponentialRampToValueAtTime(38, now + 0.045);

      subGain.gain.setValueAtTime(0.32, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.050);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.052);

      // 段 2：高频水晶质感泛音（清脆度）
      const sparkOsc = ctx.createOscillator();
      const sparkGain = ctx.createGain();

      sparkOsc.type = 'triangle';
      sparkOsc.frequency.setValueAtTime(2800, now);
      sparkOsc.frequency.exponentialRampToValueAtTime(650, now + 0.018);

      sparkGain.gain.setValueAtTime(0.14, now);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.020);

      sparkOsc.connect(sparkGain);
      sparkGain.connect(ctx.destination);

      sparkOsc.start(now);
      sparkOsc.stop(now + 0.022);
    } catch {
      // Ignore audio error
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        // iOS / Android 级进式触感震动反馈
        navigator.vibrate([16, 32, 22]);
      }
    } catch {
      // Ignore vibration error
    }
  }

  /**
   * 取消蓄力回弹音：柔和微降频回缩
   */
  public static playCancel(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.025);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.030);
    } catch {}
  }
}
