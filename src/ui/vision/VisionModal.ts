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
}

export class VisionModal {
  public element: HTMLElement;
  public floatingLauncher: HTMLElement;

  private activeTab: VisionTab = 'disciplines';
  private isOpen = false;

  private disciplineSelector: DisciplineSelector;
  private periodicTableModal: PeriodicTableModal;
  private statusCard: ExperimentStatusCard;

  private bodyContainer: HTMLElement;
  private statusCardSlot: HTMLElement;
  private tabPillDisciplines: HTMLElement;
  private tabPillChemistry: HTMLElement;
  private tabPillPhysics: HTMLElement;
  private tabPillMath: HTMLElement;
  private tabPillBeaker: HTMLElement;

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
            <div class="vision-window-badge">
              <span class="vision-glyph"></span>
              <span class="vision-badge-text">Spatial Lab</span>
            </div>
            <div class="vision-nav-pills">
              <button class="nav-pill active" id="pill-nav-disciplines">
                <span>学科大厅</span>
              </button>
              <button class="nav-pill" id="pill-nav-chemistry">
                <span>化学周期表</span>
              </button>
              <button class="nav-pill" id="pill-nav-physics">
                <span>物理板块</span>
              </button>
              <button class="nav-pill" id="pill-nav-math">
                <span>数学板块</span>
              </button>
              <button class="nav-pill" id="pill-nav-beaker">
                <span>烧杯监控</span>
              </button>
            </div>
          </div>

          <div class="header-center">
            <div class="vision-drag-indicator"></div>
          </div>

          <div class="header-right">
            <button class="vision-window-btn btn-recenter" id="btn-window-recenter" title="校准朝向 (R)">
              <span class="btn-icon">◎</span>
            </button>
            <button class="vision-window-btn btn-close" id="btn-window-close" title="关闭视窗 (ESC)">
              <span class="btn-icon">✕</span>
            </button>
          </div>
        </div>

        <!-- Dynamic Content Slot -->
        <div class="vision-window-body" id="vision-body-content"></div>

        <!-- Docked Status Card Slot (reserved if needed) -->
        <div class="vision-status-slot" id="vision-status-slot" style="display: none;"></div>
      </div>

      <!-- Bottom VisionOS Window Mover Handle Bar -->
      <div class="vision-window-mover-bar" id="vision-window-mover-bar" title="轻触校准朝向"></div>
    `;

    this.bodyContainer = this.element.querySelector('#vision-body-content') as HTMLElement;
    this.statusCardSlot = this.element.querySelector('#vision-status-slot') as HTMLElement;
    this.tabPillDisciplines = this.element.querySelector('#pill-nav-disciplines') as HTMLElement;
    this.tabPillChemistry = this.element.querySelector('#pill-nav-chemistry') as HTMLElement;
    this.tabPillPhysics = this.element.querySelector('#pill-nav-physics') as HTMLElement;
    this.tabPillMath = this.element.querySelector('#pill-nav-math') as HTMLElement;
    this.tabPillBeaker = this.element.querySelector('#pill-nav-beaker') as HTMLElement;

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
      }
    );

    this.statusCard = new ExperimentStatusCard(this.engine, () => {
      this.callbacks.onStirBeaker?.();
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
        <span class="launcher-glyph"></span>
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
      <div class="periodic-top-controls">
        <div class="top-controls-left">
          <button class="vision-back-btn" id="btn-phys-back-hall">
            <span class="back-icon">←</span>
            <span>学科大厅</span>
          </button>
          <div class="periodic-title-pill">
            <span class="pill-text">物理板块 · 前沿物理与空间场论</span>
          </div>
        </div>
      </div>
      <div class="sector-display-container">
        <div class="sector-glass-hero">
          <div class="sector-hero-badge">⚛️ 空间物理前沿</div>
          <h2 class="sector-hero-title">前沿物理与空间场论</h2>
          <p class="sector-hero-desc">
            经典天体力学引力摄动、非线性动力系统奇异吸引子与激光波动干涉衍射场交互模拟。
          </p>
          <div class="sector-status-box">
            <div class="sector-status-dot"></div>
            <div class="sector-status-text">
              <strong>物理实验架构重构中</strong>
              <span>物理实验模型正在进行新一代空间渲染与多核并行计算接入，板块入口持续开放，敬请期待！</span>
            </div>
          </div>
          <div class="sector-features-grid">
            <div class="sector-feature-item">
              <span class="feature-icon">🪐</span>
              <span class="feature-title">天体物理与引力</span>
              <span class="feature-desc">多体轨道动力学与吸积演化</span>
            </div>
            <div class="sector-feature-item">
              <span class="feature-icon">🦋</span>
              <span class="feature-title">非线性混沌力学</span>
              <span class="feature-desc">相空间吸引子与蝴蝶效应</span>
            </div>
            <div class="sector-feature-item">
              <span class="feature-icon">🎯</span>
              <span class="feature-title">光学与光子学</span>
              <span class="feature-desc">激光相干干涉与艾里斑衍射</span>
            </div>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#btn-phys-back-hall')?.addEventListener('click', () => {
      this.switchTab('disciplines');
    });

    return el;
  }

  private createMathView(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vision-sector-page';
    el.innerHTML = `
      <div class="periodic-top-controls">
        <div class="top-controls-left">
          <button class="vision-back-btn" id="btn-math-back-hall">
            <span class="back-icon">←</span>
            <span>学科大厅</span>
          </button>
          <div class="periodic-title-pill">
            <span class="pill-text">数学板块 · 流形几何与动力系统</span>
          </div>
        </div>
      </div>
      <div class="sector-display-container">
        <div class="sector-glass-hero">
          <div class="sector-hero-badge">📐 空间数学探索</div>
          <h2 class="sector-hero-title">流形几何与动力系统</h2>
          <p class="sector-hero-desc">
            直观呈现黎曼曲面高斯曲率、四维超立方体旋转投影、分形复变函数共形映射与非欧拓扑空间结构。
          </p>
          <div class="sector-status-box">
            <div class="sector-status-dot math-dot"></div>
            <div class="sector-status-text">
              <strong>数学实验模块构建中</strong>
              <span>高维几何拓扑与动力系统交互可视化模型正在构建筹备中，板块入口持续开放，敬请期待！</span>
            </div>
          </div>
          <div class="sector-features-grid">
            <div class="sector-feature-item">
              <span class="feature-icon">🌐</span>
              <span class="feature-title">微分流形</span>
              <span class="feature-desc">黎曼曲面与高斯曲率</span>
            </div>
            <div class="sector-feature-item">
              <span class="feature-icon">🧊</span>
              <span class="feature-title">四维超立方</span>
              <span class="feature-desc">4D 正方体空间投影旋转</span>
            </div>
            <div class="sector-feature-item">
              <span class="feature-icon">🌀</span>
              <span class="feature-title">动力系统与分形</span>
              <span class="feature-desc">复变函数映射与混沌分形</span>
            </div>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#btn-math-back-hall')?.addEventListener('click', () => {
      this.switchTab('disciplines');
    });

    return el;
  }

  private bindHeaderEvents(): void {
    this.tabPillDisciplines.addEventListener('click', () => {
      this.switchTab('disciplines');
    });

    this.tabPillChemistry.addEventListener('click', () => {
      this.switchTab('chemistry');
    });

    this.tabPillPhysics.addEventListener('click', () => {
      this.switchTab('physics');
    });

    this.tabPillMath.addEventListener('click', () => {
      this.switchTab('math');
    });

    this.tabPillBeaker.addEventListener('click', () => {
      this.switchTab('beaker');
    });

    this.element.querySelector('#btn-window-recenter')?.addEventListener('click', () => {
      this.callbacks.onRecenter?.();
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
      }
    });
  }

  public switchTab(tab: VisionTab): void {
    this.activeTab = tab;

    this.tabPillDisciplines.classList.toggle('active', tab === 'disciplines');
    this.tabPillChemistry.classList.toggle('active', tab === 'chemistry');
    this.tabPillPhysics.classList.toggle('active', tab === 'physics');
    this.tabPillMath.classList.toggle('active', tab === 'math');
    this.tabPillBeaker.classList.toggle('active', tab === 'beaker');

    this.bodyContainer.innerHTML = '';
    this.statusCardSlot.innerHTML = '';
    this.statusCardSlot.style.display = 'none';

    if (tab === 'disciplines') {
      this.bodyContainer.appendChild(this.disciplineSelector.element);
    } else if (tab === 'chemistry') {
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

  public open(tab?: VisionTab): void {
    if (tab) {
      this.switchTab(tab);
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
}
