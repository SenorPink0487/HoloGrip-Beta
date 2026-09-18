import { DisciplineSelector } from './DisciplineSelector';
import { PeriodicTableModal } from './PeriodicTableModal';
import { ExperimentStatusCard } from './ExperimentStatusCard';
import type { ChemistryEngine } from '../../chemistry/ChemistryEngine';

export type VisionTab = 'disciplines' | 'chemistry' | 'beaker' | 'physics' | 'math';

export interface VisionModalCallbacks {
  onClose: () => void;
  onOpen: () => void;
  onSelectPhysicsExperiment?: (id: string) => Promise<void>;
  onSelectChemistry?: () => void;
  onStirBeaker?: () => void;
  onRecenter?: () => void;
  onScaleChange?: (scaleMultiplier: number) => void;
  onSelectBeaker?: (beakerId: 'left' | 'right') => void;
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

    // Mount initial view
    this.switchTab('disciplines');

    this.bindHeaderEvents();
  }

  private createFloatingLauncher(parent: HTMLElement): void {
    this.floatingLauncher = document.createElement('div');
    this.floatingLauncher.id = 'vision-floating-launcher';
    this.floatingLauncher.className = 'vision-launcher hud-interactive';
    this.floatingLauncher.innerHTML = `
      <div class="launcher-inner">
        <svg class="apple-sf-icon launcher-logo-svg" viewBox="0 0 170 170" width="13" height="13" fill="currentColor">
          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.71-11.7-14.01-6.19-9.56-11-20.7-14.42-33.43-3.42-12.73-5.13-24.3-5.13-34.71 0-15.11 3.86-27.46 11.59-37.06 7.73-9.6 17.5-14.49 29.31-14.67 4.9.11 10.37 1.47 16.42 4.09 6.05 2.62 9.99 4.04 11.82 4.25 1.52-.21 5.76-1.74 12.73-4.57 6.96-2.83 12.92-4.14 17.88-3.92 11.21.65 20.47 4.79 27.79 12.41 7.32 7.62 12.08 17.09 14.28 28.41-10.02 6.09-15.03 14.59-15.03 25.5 0 9.14 3.75 16.98 11.24 23.51 7.5 6.53 16.44 10.12 26.83 10.77-1.96 5.88-4.13 11.32-6.52 16.32zM119.22 31.84c0-7.39 2.6-14.15 7.8-20.28 5.2-6.13 11.75-10.34 19.65-12.63.87 7.62-1.41 14.6-6.85 20.93-5.43 6.33-12.29 10.33-20.6 11.98z"/>
        </svg>
        <span class="launcher-text">全息视窗</span>
        <kbd class="launcher-kbd">V</kbd>
      </div>
    `;

    this.floatingLauncher.addEventListener('click', (e) => {
      e.stopPropagation();
      this.open();
    });

    parent.appendChild(this.floatingLauncher);
  }

  private createPhysicsView(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vision-sector-page';
    el.innerHTML = `
      <div class="sector-display-container">
        <div class="vision-empty-state">
          <div class="empty-state-icon">
            <svg class="vision-empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="2.5"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(30 12 12)"/>
              <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-30 12 12)"/>
            </svg>
          </div>
          <h3 class="empty-state-title">物理实验</h3>
          <p class="empty-state-subtitle">即将推出</p>
        </div>
      </div>
    `;

    return el;
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
          <p class="empty-state-subtitle">即将推出</p>
        </div>
      </div>
    `;

    return el;
  }

  private bindHeaderEvents(): void {
    this.btnBack?.addEventListener('click', () => {
      this.switchTab('disciplines');
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
        // Zoom In: "+" / "=" (Equal, NumpadAdd), or "]" (BracketRight)
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
        }
        // Zoom Out: "-" (Minus, NumpadSubtract), or "[" (BracketLeft)
        else if (
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract' ||
          e.code === 'BracketLeft' ||
          e.key === '-' ||
          e.key === '_' ||
          e.key === '['
        ) {
          e.preventDefault();
          this.zoomOut();
        }
        // Reset Scale: "0" (Digit0, Numpad0)
        else if (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0') {
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

  public switchTab(tab: VisionTab): void {
    this.activeTab = tab;

    if (this.btnBack) {
      this.btnBack.classList.toggle('hidden', tab === 'disciplines');
    }

    const titleEl = this.element.querySelector('#vision-window-title');
    const titles: Record<VisionTab, string> = {
      disciplines: '学科领域',
      chemistry: '元素周期表 · 试剂注入',
      beaker: '烧杯组分全息分析',
      physics: '前沿物理',
      math: '空间数学',
    };
    if (titleEl) {
      titleEl.textContent = titles[tab] || '全息实验视窗';
    }

    this.bodyContainer.innerHTML = '';
    this.statusCardSlot.innerHTML = '';
    this.statusCardSlot.style.display = 'none';

    if (tab === 'disciplines') {
      this.bodyContainer.appendChild(this.disciplineSelector.element);
    } else if (tab === 'chemistry') {
      // Default to left beaker when opening chemistry plate ("打开化学板块默认给左边的杯子选试剂")
      this.setActiveBeaker('left');
      this.bodyContainer.appendChild(this.periodicTableModal.element);
      this.callbacks.onSelectChemistry?.();
    } else if (tab === 'physics') {
      this.bodyContainer.appendChild(this.createPhysicsView());
    } else if (tab === 'math') {
      this.bodyContainer.appendChild(this.createMathView());
    } else if (tab === 'beaker') {
      this.bodyContainer.appendChild(this.statusCard.element);
      this.callbacks.onSelectChemistry?.();
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
