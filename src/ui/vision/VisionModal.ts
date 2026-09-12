import { DisciplineSelector } from './DisciplineSelector';
import { PeriodicTableModal } from './PeriodicTableModal';
import { ExperimentStatusCard } from './ExperimentStatusCard';
import type { ChemistryEngine } from '../../chemistry/ChemistryEngine';

export type VisionTab = 'disciplines' | 'chemistry' | 'physics' | 'math';

export interface VisionModalCallbacks {
  onClose: () => void;
  onOpen: () => void;
  onSelectPhysicsExperiment: (id: string) => Promise<void>;
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
                <span>化学元素表</span>
              </button>
            </div>
          </div>

          <div class="header-center">
            <div class="vision-drag-indicator"></div>
          </div>

          <div class="header-right">
            <button class="vision-window-btn btn-recenter" id="btn-window-recenter" title="对准当前视角 (R)">
              <span class="btn-icon">◎</span>
            </button>
            <button class="vision-window-btn btn-close" id="btn-window-close" title="退出实验浮窗并自由漫游 (ESC)">
              <span class="btn-icon">✕</span>
            </button>
          </div>
        </div>

        <!-- Dynamic Content Slot -->
        <div class="vision-window-body" id="vision-body-content"></div>

        <!-- Docked Status Card Slot for Chemistry -->
        <div class="vision-status-slot" id="vision-status-slot"></div>
      </div>

      <!-- Bottom VisionOS Window Mover Handle Bar -->
      <div class="vision-window-mover-bar" id="vision-window-mover-bar" title="轻触校准朝向"></div>
    `;

    this.bodyContainer = this.element.querySelector('#vision-body-content') as HTMLElement;
    this.statusCardSlot = this.element.querySelector('#vision-status-slot') as HTMLElement;
    this.tabPillDisciplines = this.element.querySelector('#pill-nav-disciplines') as HTMLElement;
    this.tabPillChemistry = this.element.querySelector('#pill-nav-chemistry') as HTMLElement;

    // Sub-components
    this.disciplineSelector = new DisciplineSelector({
      onSelectChemistry: () => this.switchTab('chemistry'),
      onSelectPhysics: (id) => {
        if (id) {
          this.callbacks.onSelectPhysicsExperiment(id);
        }
        this.close();
      },
      onSelectMath: () => {
        alert('数学流形几何与动力系统正在重构中，敬请期待！');
      },
    });

    this.periodicTableModal = new PeriodicTableModal(this.engine, () => {
      this.switchTab('disciplines');
    });

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
        <span class="launcher-text">开启 3D 悬浮视窗</span>
        <kbd class="launcher-kbd">V</kbd>
      </div>
    `;

    this.floatingLauncher.addEventListener('click', (e) => {
      e.stopPropagation();
      this.open();
    });

    parent.appendChild(this.floatingLauncher);
  }

  private bindHeaderEvents(): void {
    this.tabPillDisciplines.addEventListener('click', () => {
      this.switchTab('disciplines');
    });

    this.tabPillChemistry.addEventListener('click', () => {
      this.switchTab('chemistry');
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

    this.bodyContainer.innerHTML = '';
    this.statusCardSlot.innerHTML = '';

    if (tab === 'disciplines') {
      this.bodyContainer.appendChild(this.disciplineSelector.element);
      this.statusCardSlot.style.display = 'none';
    } else if (tab === 'chemistry') {
      this.bodyContainer.appendChild(this.periodicTableModal.element);
      this.statusCardSlot.style.display = 'block';
      this.statusCardSlot.appendChild(this.statusCard.element);
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
