import { DisciplineSelector } from './DisciplineSelector';
import { PeriodicTableModal } from './PeriodicTableModal';
import { ExperimentStatusCard } from './ExperimentStatusCard';
import { PhysicsDisciplineModal } from './PhysicsDisciplineModal';
import { ThermoStatusCard } from './ThermoStatusCard';
import type { ChemistryEngine } from '../../chemistry/ChemistryEngine';

export type VisionTab = 'disciplines' | 'chemistry' | 'beaker' | 'physics' | 'math' | 'thermo';

export interface VisionModalCallbacks {
  onClose: () => void;
  onOpen: () => void;
  onSelectPhysicsExperiment?: (id: string) => Promise<void>;
  onSelectChemistry?: () => void;
  onStirBeaker?: () => void;
  onRecenter?: () => void;
  onScaleChange?: (scaleMultiplier: number) => void;
  onSelectBeaker?: (beakerId: 'left' | 'right') => void;
  onThermoTemperatureChange?: (tempK: number) => void;
  onThermoVolumeChange?: (volL: number) => void;
}

export class VisionModal {
  public element: HTMLElement;
  public floatingLauncher: HTMLElement;

  private activeTab: VisionTab = 'disciplines';
  private isOpen = false;
  private currentScale = 1.0;
  private readonly DEFAULT_SCALE = 1.0;
  private readonly MIN_SCALE = 0.5;
  private readonly MAX_SCALE = 2.0;
  private readonly SCALE_STEP = 0.1;

  private disciplineSelector: DisciplineSelector;
  private periodicTableModal: PeriodicTableModal;
  private statusCard: ExperimentStatusCard;
  private physicsModal: PhysicsDisciplineModal;
  private thermoStatusCard: ThermoStatusCard;

  private bodyContainer: HTMLElement;
  private statusCardSlot: HTMLElement;
  private btnBack: HTMLElement | null = null;
  private scaleIndicatorEl: HTMLElement | null = null;
  private scaleIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private engine: ChemistryEngine,
    private callbacks: VisionModalCallbacks,
    parent: HTMLElement = document.body
  ) {
    this.createUI();
    this.createFloatingLauncher(parent);
    this.bindKeyboardShortcuts();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.id = 'vision-spatial-window';
    this.element.className = 'vision-spatial-window hidden';

    this.element.innerHTML = `
      <div class="vision-window-frame">
        <!-- Top Apple Vision Pro Glass Window Bar -->
        <div class="vision-window-header">
          <div class="header-left">
            <button class="vision-window-btn btn-back hidden" id="btn-window-back" title="返回">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>

          <div class="header-center">
            <div class="vision-drag-indicator"></div>
            <span class="vision-window-title" id="vision-window-title">全息实验视窗</span>
          </div>

          <div class="header-right">
            <button class="vision-window-btn btn-close" id="btn-window-close" title="关闭 (ESC)">
              <svg class="apple-sf-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Dynamic Content Slot -->
        <div class="vision-window-body" id="vision-body-content"></div>

        <!-- VisionOS Floating Scale Indicator -->
        <div class="vision-scale-indicator" id="vision-scale-indicator">100%</div>

        <!-- Docked Status Card Slot (reserved if needed) -->
        <div class="vision-status-slot" id="vision-status-slot" style="display: none;"></div>
      </div>

      <!-- Bottom VisionOS Window Mover Handle Bar -->
      <div class="vision-window-mover-bar" id="vision-window-mover-bar" title="校准朝向 (R) · 缩放 (+/-)"></div>
    `;

    this.bodyContainer = this.element.querySelector('#vision-body-content') as HTMLElement;
    this.statusCardSlot = this.element.querySelector('#vision-status-slot') as HTMLElement;
    this.btnBack = this.element.querySelector('#btn-window-back');
    this.scaleIndicatorEl = this.element.querySelector('#vision-scale-indicator');

    // Sub-components
    this.disciplineSelector = new DisciplineSelector({
      onSelectChemistry: () => this.switchTab('chemistry'),
      onSelectPhysics: () => this.switchTab('physics'),
      onSelectMath: () => this.switchTab('math'),
    });

    this.periodicTableModal = new PeriodicTableModal(
      this.engine,
      () => {
        this.switchTab('disciplines');
      },
      () => {
        this.switchTab('beaker');
      },
      (beakerId) => {
        this.setActiveBeaker(beakerId);
      }
    );

    this.statusCard = new ExperimentStatusCard(this.engine, {
      onStir: () => {
        this.callbacks.onStirBeaker?.();
      },
      onOpenPeriodicTable: () => {
        this.switchTab('chemistry');
      },
      onSelectBeaker: (beakerId) => {
        this.setActiveBeaker(beakerId);
      },
    });

    this.thermoStatusCard = new ThermoStatusCard({
      onTemperatureChange: (tempK) => {
        this.callbacks.onThermoTemperatureChange?.(tempK);
      },
      onVolumeChange: (volL) => {
        this.callbacks.onThermoVolumeChange?.(volL);
      },
    });

    this.physicsModal = new PhysicsDisciplineModal({
      onBackToDisciplines: () => this.switchTab('disciplines'),
      onSelectExperiment: async (id: string) => {
        await this.callbacks.onSelectPhysicsExperiment?.(id);
        if (id.startsWith('thermo-')) {
          this.switchTab('thermo');
        } else {
          this.close();
        }
      },
      onLevelChange: (level) => {
        const titleEl = this.element.querySelector('#vision-window-title');
        if (titleEl && this.activeTab === 'physics') {
          titleEl.textContent = '物理学';
        }
      },
    });

    // Mount initial view
    this.switchTab('disciplines');

    this.bindHeaderEvents();
  }

  private createFloatingLauncher(parent: HTMLElement): void {
    this.floatingLauncher = document.createElement('div');
    this.floatingLauncher.id = 'vision-floating-launcher';
    this.floatingLauncher.style.display = 'none';
  }

  private createMathView(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vision-sector-page';
    el.innerHTML = `
      <div class="sector-display-container">
        <div class="vision-empty-state">
          <div class="empty-state-icon">
            <svg class="vision-empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
              <line x1="12" y1="22" x2="12" y2="15.5"/>
              <polyline points="22 8.5 12 15.5 2 8.5"/>
              <polyline points="2 15.5 12 8.5 22 15.5"/>
            </svg>
          </div>
          <h3 class="empty-state-title">数学实验</h3>
          <p class="empty-state-subtitle">流形与拓扑动力学规划中</p>
        </div>
      </div>
    `;
    return el;
  }

  private bindHeaderEvents(): void {
    this.btnBack?.addEventListener('click', () => {
      if (this.activeTab === 'physics') {
        if (this.physicsModal.canGoBack()) {
          this.physicsModal.goBack();
          return;
        }
        this.switchTab('disciplines');
      } else if (this.activeTab === 'thermo') {
        this.switchTab('physics');
      } else if (this.activeTab === 'chemistry' || this.activeTab === 'math') {
        this.switchTab('disciplines');
      } else if (this.activeTab === 'beaker') {
        this.switchTab('chemistry');
      } else {
        this.switchTab('disciplines');
      }
    });

    this.element.querySelector('#vision-window-mover-bar')?.addEventListener('click', () => {
      this.callbacks.onRecenter?.();
    });

    this.element.querySelector('#btn-window-close')?.addEventListener('click', () => {
      this.close();
    });
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'KeyV') {
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      } else if (e.code === 'KeyR' && this.isOpen) {
        this.callbacks.onRecenter?.();
      } else if (e.code === 'Escape') {
        if (this.isOpen) {
          this.close();
        }
      } else if (this.isOpen) {
        if (
          e.code === 'Equal' ||
          e.code === 'NumpadAdd' ||
          e.code === 'BracketRight' ||
          e.key === '+' ||
          e.key === '=' ||
          e.key === ']'
        ) {
          e.preventDefault();
          this.zoomIn();
        } else if (
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract' ||
          e.code === 'BracketLeft' ||
          e.key === '-' ||
          e.key === '_' ||
          e.key === '['
        ) {
          e.preventDefault();
          this.zoomOut();
        } else if (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0') {
          e.preventDefault();
          this.resetScale();
        }
      }
    });
  }

  public activeBeakerId: 'left' | 'right' = 'left';

  public setEngines(left: ChemistryEngine, right: ChemistryEngine, activeId: 'left' | 'right' = 'left'): void {
    this.periodicTableModal.setEngines(left, right, activeId);
    this.statusCard.setEngines(left, right, activeId);
    this.activeBeakerId = activeId;
  }

  public setActiveBeaker(id: 'left' | 'right'): void {
    this.activeBeakerId = id;
    this.periodicTableModal.setActiveBeaker(id);
    this.statusCard.selectBeaker(id);
    this.callbacks.onSelectBeaker?.(id);
  }

  public get periodicTable(): PeriodicTableModal {
    return this.periodicTableModal;
  }

  public get experimentStatusCard(): ExperimentStatusCard {
    return this.statusCard;
  }

  public get thermoCard(): ThermoStatusCard {
    return this.thermoStatusCard;
  }

  public switchTab(tab: VisionTab): void {
    this.activeTab = tab;

    if (this.btnBack) {
      this.btnBack.classList.toggle('hidden', tab === 'disciplines');
    }

    const titleEl = this.element.querySelector('#vision-window-title');
    const titles: Record<VisionTab, string> = {
      disciplines: '学科领域',
      chemistry: '常用试剂 · 试剂注入',
      beaker: '烧杯组分全息分析',
      physics: '物理学',
      math: '空间数学',
      thermo: '热力学状态分析 (PV = nRT)',
    };
    if (titleEl) {
      titleEl.textContent = titles[tab] || '全息实验视窗';
    }

    this.bodyContainer.innerHTML = '';
    this.statusCardSlot.innerHTML = '';
    this.statusCardSlot.style.display = 'none';

    if (this.thermoStatusCard) {
      this.thermoStatusCard.setVisible(tab === 'thermo');
    }

    if (tab === 'disciplines') {
      this.bodyContainer.appendChild(this.disciplineSelector.element);
    } else if (tab === 'chemistry') {
      this.setActiveBeaker('left');
      this.bodyContainer.appendChild(this.periodicTableModal.element);
      this.callbacks.onSelectChemistry?.();
    } else if (tab === 'physics') {
      this.physicsModal.reset();
      this.bodyContainer.appendChild(this.physicsModal.element);
    } else if (tab === 'math') {
      this.bodyContainer.appendChild(this.createMathView());
    } else if (tab === 'beaker') {
      this.bodyContainer.appendChild(this.statusCard.element);
      this.callbacks.onSelectChemistry?.();
    } else if (tab === 'thermo') {
      this.bodyContainer.appendChild(this.thermoStatusCard.element);
    }
  }

  public open(tab?: VisionTab, beakerId?: 'left' | 'right'): void {
    if (tab) {
      this.switchTab(tab);
    }
    if (beakerId) {
      this.setActiveBeaker(beakerId);
    }
    this.isOpen = true;
    this.element.classList.remove('hidden');
    this.floatingLauncher.classList.add('hidden');
    this.callbacks.onOpen();
  }

  public close(): void {
    this.isOpen = false;
    this.element.classList.add('hidden');
    this.floatingLauncher.classList.remove('hidden');
    this.thermoStatusCard?.setVisible(false);
    this.callbacks.onClose();
  }

  public get visible(): boolean {
    return this.isOpen;
  }

  public get currentTab(): VisionTab {
    return this.activeTab;
  }

  public zoomIn(step = this.SCALE_STEP): void {
    this.setScale(this.currentScale + step);
  }

  public zoomOut(step = this.SCALE_STEP): void {
    this.setScale(this.currentScale - step);
  }

  public resetScale(): void {
    this.setScale(this.DEFAULT_SCALE);
  }

  public setScale(scale: number): void {
    const clamped = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, scale));
    this.currentScale = Math.round(clamped * 100) / 100;
    this.callbacks.onScaleChange?.(this.currentScale);
    this.showScaleIndicator();
  }

  public get scale(): number {
    return this.currentScale;
  }

  private showScaleIndicator(): void {
    if (!this.scaleIndicatorEl) return;
    const percent = Math.round(this.currentScale * 100);
    this.scaleIndicatorEl.textContent = `视窗缩放: ${percent}%`;
    this.scaleIndicatorEl.classList.add('visible');

    if (this.scaleIndicatorTimeout) {
      clearTimeout(this.scaleIndicatorTimeout);
    }
    this.scaleIndicatorTimeout = setTimeout(() => {
      this.scaleIndicatorEl?.classList.remove('visible');
    }, 1200);
  }
}
