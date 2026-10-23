import { ExperimentDrawer } from './ExperimentDrawer.ts';
import { PerfOverlay } from './PerfOverlay.ts';
import { PlatformBridge } from '../core/platform/PlatformBridge.ts';
import { isTextInputActive } from '../core/focus.ts';
import type { ComputeBridge } from '../core/platform/ComputeBridge.ts';
import type { IExperiment, ExperimentContext } from '../core/types.ts';

export class HUD {
  public drawer: ExperimentDrawer;
  public perfOverlay: PerfOverlay;
  private platform = PlatformBridge.getInstance();
  private topBarEl: HTMLElement;
  private transitionToast: HTMLElement;
  private computeBridge: ComputeBridge;
  private onSwitchExperiment: (id: string) => Promise<void>;

  constructor(
    computeBridge: ComputeBridge,
    onSwitchExperiment: (id: string) => Promise<void>
  ) {
    this.computeBridge = computeBridge;
    this.onSwitchExperiment = onSwitchExperiment;
    this.initTopBar();
    this.initTransitionToast();

    this.drawer = new ExperimentDrawer(document.body, this.onSwitchExperiment);
    this.perfOverlay = new PerfOverlay(this.computeBridge, this.platform, document.body);
    // 根据需求默认显示左上角性能浮层（显示实时帧数，可通过按键 P 切换显示）
    this.perfOverlay.toggle(true);

    // 绑定 F 键切换全屏
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !isTextInputActive()) {
        this.platform.toggleFullscreen();
      }
    });
  }

  private initTopBar(): void {
    // 顶栏按需求隐藏（"删掉上方这一行"）
    this.topBarEl = document.createElement('div');
    this.topBarEl.id = 'hud-topbar';
    this.topBarEl.style.display = 'none';
    this.topBarEl.innerHTML = `<span id="topbar-exp-title" style="display:none"></span>`;
    document.body.appendChild(this.topBarEl);
  }

  private initTransitionToast(): void {
    this.transitionToast = document.createElement('div');
    this.transitionToast.id = 'transition-toast';
    this.transitionToast.innerHTML = `
      <div class="toast-spinner"></div>
      <span class="toast-msg">正在载入实验...</span>
    `;
    document.body.appendChild(this.transitionToast);
  }

  public showTransition(show: boolean, message = '全息量子重构中...'): void {
    if (show) {
      this.transitionToast.querySelector('.toast-msg')!.textContent = message;
      this.transitionToast.classList.add('visible');
    } else {
      this.transitionToast.classList.remove('visible');
    }
  }

  public setActiveExperiment(experiment: IExperiment, context: ExperimentContext): void {
    const titleEl = this.topBarEl.querySelector('#topbar-exp-title');
    if (titleEl) {
      titleEl.textContent = experiment.metadata.name;
    }
    this.drawer.setActiveExperiment(experiment.metadata.id);
  }

  public clearActiveExperiment(): void {
    const titleEl = this.topBarEl.querySelector('#topbar-exp-title');
    if (titleEl) {
      titleEl.textContent = '';
    }
    this.drawer.setActiveExperiment('');
  }

  public update(delta: number, renderDuration = 0): void {
    this.perfOverlay.update(delta, renderDuration);
  }
}
