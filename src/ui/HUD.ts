import { ExperimentDrawer } from './ExperimentDrawer';
import { ParameterPanel } from './ParameterPanel';
import { PerfOverlay } from './PerfOverlay';
import { PlatformBridge } from '../core/platform/PlatformBridge';
import type { ComputeBridge } from '../core/platform/ComputeBridge';
import type { IExperiment, ExperimentContext } from '../core/types';

export class HUD {
  public drawer: ExperimentDrawer;
  public parameterPanel: ParameterPanel;
  public perfOverlay: PerfOverlay;
  private platform = PlatformBridge.getInstance();
  private topBarEl: HTMLElement;
  private transitionToast: HTMLElement;

  constructor(
    private computeBridge: ComputeBridge,
    private onSwitchExperiment: (id: string) => Promise<void>
  ) {
    this.initTopBar();
    this.initTransitionToast();

    this.drawer = new ExperimentDrawer(document.body, this.onSwitchExperiment);
    this.parameterPanel = new ParameterPanel(document.body);
    this.perfOverlay = new PerfOverlay(this.computeBridge, this.platform, document.body);
  }

  private initTopBar(): void {
    this.topBarEl = document.createElement('div');
    this.topBarEl.id = 'hud-topbar';
    this.topBarEl.className = 'hud-interactive';

    this.topBarEl.innerHTML = `
      <div class="topbar-left">
        <div class="logo-group">
          <span class="logo-glyph"></span>
          <span class="logo-title">Virtual Lab</span>
        </div>
        <button class="topbar-btn drawer-toggle-btn" id="topbar-drawer-btn" title="选择实验 (E)">
          <svg class="sf-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          <span class="btn-text">实验</span>
        </button>
      </div>

      <div class="topbar-center">
        <span class="current-exp-title" id="topbar-exp-title">量子波包与双缝干涉实验</span>
      </div>

      <div class="topbar-right">
        <button class="topbar-icon-btn" id="topbar-perf-btn" title="性能监控 (P)">
          <svg class="sf-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </button>
        <button class="topbar-icon-btn" id="topbar-fullscreen-btn" title="切换全屏">
          <svg class="sf-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.topBarEl);

    // Bind drawer open
    this.topBarEl.querySelector('#topbar-drawer-btn')!.addEventListener('click', () => {
      this.drawer.toggle();
    });

    // Bind perf HUD toggle
    this.topBarEl.querySelector('#topbar-perf-btn')?.addEventListener('click', () => {
      this.perfOverlay.toggle();
    });

    // Bind fullscreen
    this.topBarEl.querySelector('#topbar-fullscreen-btn')!.addEventListener('click', () => {
      this.platform.toggleFullscreen();
    });
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
    this.parameterPanel.bindExperiment(experiment, context);
  }

  public update(delta: number): void {
    this.perfOverlay.update(delta);
  }
}
