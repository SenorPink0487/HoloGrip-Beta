import type { DemonstrationPlayer } from '../experiments/demonstrations/DemonstrationPlayer.ts';
/** Normal-flow footer. The WebGL viewport ends above it. */
export class DemonstrationBar {
  readonly element = document.createElement('section');
  private caption = document.createElement('p');
  private play = document.createElement('button');
  private replay = document.createElement('button');
  private busy = false;
  private unsubscribe: () => void;
  private observer: ResizeObserver;
  private player: DemonstrationPlayer;
  private resize: () => void;
  constructor(player: DemonstrationPlayer, start: () => Promise<void>, select: () => void, resize: () => void) {
    this.player = player; this.resize = resize;
    this.element.id = 'demonstration-bar';
    this.element.hidden = true;
    this.element.addEventListener('keydown', event => event.stopPropagation());
    this.caption.className = 'demonstration-caption';
    this.caption.setAttribute('aria-live', 'polite');
    const controls = document.createElement('div'); controls.className = 'demonstration-controls';
    const choose = document.createElement('button'); choose.textContent = '选择实验';
    choose.type = this.play.type = this.replay.type = 'button';
    choose.addEventListener('click', select);
    this.replay.textContent = '重播';
    const run = async () => {
      if (this.busy) return;
      this.busy = true; this.render();
      try { await start(); } finally { this.busy = false; this.render(); }
    };
    this.play.addEventListener('click', () => {
      if (player.state === 'playing') player.pause();
      else if (player.state === 'paused') player.play();
      else void run();
    });
    this.replay.addEventListener('click', () => void run());
    controls.append(choose, this.play, this.replay);
    this.element.append(this.caption, controls); document.body.appendChild(this.element);
    this.unsubscribe = player.subscribe(() => this.render()); this.render();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.element);
  }
  setVisible(visible: boolean): void {
    if (this.element.hidden === !visible) return;
    this.element.hidden = !visible; document.body.classList.toggle('laboratory-lite', visible); this.resize();
  }
  private render(): void {
    this.caption.textContent = this.player.caption;
    const state = this.player.state;
    this.play.textContent = this.busy ? '准备中…' : state === 'playing' ? '暂停' : state === 'paused' ? '继续演示' : ['manual', 'failed', 'completed'].includes(state) ? '重新演示' : '一键演示';
    this.play.disabled = this.busy || !this.player.available;
    this.replay.disabled = this.busy || !this.player.available || state === 'idle';
  }
  dispose(): void { this.observer.disconnect(); this.unsubscribe(); this.element.remove(); }
}
