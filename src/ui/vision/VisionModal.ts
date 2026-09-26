import { DisciplineSelector } from './DisciplineSelector.ts';
import { PeriodicTableModal } from './PeriodicTableModal.ts';
import { ExperimentStatusCard } from './ExperimentStatusCard.ts';
import { PhysicsDisciplineModal } from './PhysicsDisciplineModal.ts';
import { ThermoStatusCard } from './ThermoStatusCard.ts';
import { CarnotStatusCard } from './CarnotStatusCard.ts';
import { ConductionStatusCard } from './ConductionStatusCard.ts';
import { PhaseStatusCard } from './PhaseStatusCard.ts';
import { StereometryStatusCard } from './StereometryStatusCard.ts';
import { HallStatusCard } from './HallStatusCard.ts';
import type { ChemistryEngine } from '../../chemistry/ChemistryEngine.ts';
import type { HighSchoolModelType } from '../../scene/math/GeometrySolver.ts';
import type { InteractionMode } from '../../scene/math/StereometryInteractionManager.ts';

export type VisionTab = 'disciplines' | 'chemistry' | 'beaker' | 'physics' | 'math' | 'thermo' | 'em';

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
  onCarnotTempHighChange?: (tempK: number) => void;
  onCarnotTempLowChange?: (tempK: number) => void;
  onCarnotToggleRunning?: () => void;
  onCarnotToggleDirection?: () => void;
  onCarnotStepStage?: (step: 1 | -1) => void;
  onCarnotApplyPreset?: (preset: 'steam' | 'extreme' | 'stirling' | 'refrig') => void;
  // Conduction Callbacks
  onCondTempHChange?: (tempK: number) => void;
  onCondTempCChange?: (tempK: number) => void;
  onCondMaterialChange?: (material: string) => void;
  onCondInsulationChange?: (insulated: boolean) => void;
  onCondProbeChange?: (normX: number) => void;
  onCondResetTransient?: () => void;
  // Phase Callbacks
  onPhasePowerChange?: (powerW: number) => void;
  onPhaseMassChange?: (massG: number) => void;
  onPhaseToggleHeating?: () => void;
  onPhaseReset?: () => void;
  onPhaseAccelChange?: (scale: number) => void;
  // Hall Effect Callbacks
  onHallMagFieldChange?: (tesla: number) => void;
  onHallCurrentChange?: (ma: number) => void;
  onHallThicknessChange?: (thicknessMm: number) => void;
  onHallMaterialChange?: (materialKey: string) => void;
  onHallCarrierConcentrationChange?: (n: number) => void;
  onHallCarrierChargeToggle?: () => void;
  onHallMobilityChange?: (mu: number) => void;
  onHallToggleFieldPolarity?: () => void;
  onHallToggleCurrentPolarity?: () => void;
  onHallToggleVectors?: (show: boolean) => void;
  onHallToggleParticles?: (show: boolean) => void;
  // Stereometry Math Callbacks
  onMathModelChange?: (type: HighSchoolModelType) => void;
  onMathDimensionChange?: (dims: { a?: number; h?: number }) => void;
  onMathInteractionModeChange?: (mode: InteractionMode) => void;
  onMathResetView?: (view: 'iso' | 'front' | 'side' | 'top') => void;
  onMathClearSegments?: () => void;
  onMathToggleDashedLines?: (show: boolean) => void;
  onMathToggleCoordinateSystem?: (show: boolean) => void;
  onMathToggleEmbeddingBox?: (show: boolean) => void;
  onMathToggleCircumSphere?: (show: boolean) => void;
  onMathToggleInSphere?: (show: boolean) => void;
  onMathToggleClipping?: (enabled: boolean) => void;
  onMathExplodeDistanceChange?: (dist: number) => void;
  onMathUnfoldProgressChange?: (progress: number) => void;
  onMathToggleThreeViews?: (show: boolean) => void;
  onMathToggleMidpoints?: (show: boolean) => void;
  onMathToggleFaceCenters?: (show: boolean) => void;
  onMathToggleLabels?: (show: boolean) => void;
  onMathApplyPreset?: (preset: any) => void;
  onMathZoom?: (direction: 1 | -1) => void;
  onMathResetScale?: () => void;
}

export class VisionModal {
  public element: HTMLElement;
  public floatingLauncher?: HTMLElement;

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
  private carnotStatusCard: CarnotStatusCard;
  private conductionStatusCard: ConductionStatusCard;
  private phaseStatusCard: PhaseStatusCard;
  private stereometryStatusCard: StereometryStatusCard;
  private hallStatusCard: HallStatusCard;
  private currentExperimentId = '';

  private bodyContainer: HTMLElement;
  private statusCardSlot: HTMLElement;
  private btnBack: HTMLElement | null = null;
  private scaleIndicatorEl: HTMLElement | null = null;
  private scaleIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;

  private engine: ChemistryEngine;
  private callbacks: VisionModalCallbacks;

  constructor(
    engine: ChemistryEngine,
    callbacks: VisionModalCallbacks,
    parent: HTMLElement = document.body
  ) {
    this.engine = engine;
    this.callbacks = callbacks;
    this.createUI();
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

    this.carnotStatusCard = new CarnotStatusCard({
      onTempHighChange: (tempK) => {
        this.callbacks.onCarnotTempHighChange?.(tempK);
      },
      onTempLowChange: (tempK) => {
        this.callbacks.onCarnotTempLowChange?.(tempK);
      },
      onToggleRunning: () => {
        this.callbacks.onCarnotToggleRunning?.();
      },
      onToggleDirection: () => {
        this.callbacks.onCarnotToggleDirection?.();
      },
      onStepStage: (step) => {
        this.callbacks.onCarnotStepStage?.(step);
      },
      onApplyPreset: (preset) => {
        this.callbacks.onCarnotApplyPreset?.(preset);
      },
    });

    this.conductionStatusCard = new ConductionStatusCard({
      onHeatSourceTempChange: (tempK) => {
        this.callbacks.onCondTempHChange?.(tempK);
      },
      onColdSourceTempChange: (tempK) => {
        this.callbacks.onCondTempCChange?.(tempK);
      },
      onMaterialChange: (material) => {
        this.callbacks.onCondMaterialChange?.(material);
      },
      onLateralInsulationChange: (insulated) => {
        this.callbacks.onCondInsulationChange?.(insulated);
      },
      onProbePositionChange: (normX) => {
        this.callbacks.onCondProbeChange?.(normX);
      },
      onResetTransient: () => {
        this.callbacks.onCondResetTransient?.();
      },
    });

    this.phaseStatusCard = new PhaseStatusCard({
      onHeatPowerChange: (powerW) => {
        this.callbacks.onPhasePowerChange?.(powerW);
      },
      onMassChange: (massG) => {
        this.callbacks.onPhaseMassChange?.(massG);
      },
      onToggleHeating: () => {
        this.callbacks.onPhaseToggleHeating?.();
      },
      onResetExperiment: () => {
        this.callbacks.onPhaseReset?.();
      },
      onTimeAccelerationChange: (scale) => {
        this.callbacks.onPhaseAccelChange?.(scale);
      },
    });

    this.physicsModal = new PhysicsDisciplineModal({
      onBackToDisciplines: () => this.switchTab('disciplines'),
      onSelectExperiment: async (id: string) => {
        this.currentExperimentId = id;
        await this.callbacks.onSelectPhysicsExperiment?.(id);
        if (id.startsWith('thermo-')) {
          this.switchTab('thermo');
        } else if (id.startsWith('em-')) {
          this.switchTab('em');
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

    this.stereometryStatusCard = new StereometryStatusCard({
      onModelChange: (type) => this.callbacks.onMathModelChange?.(type),
      onDimensionChange: (dims) => this.callbacks.onMathDimensionChange?.(dims),
      onInteractionModeChange: (mode) => this.callbacks.onMathInteractionModeChange?.(mode),
      onResetView: (view) => this.callbacks.onMathResetView?.(view),
      onClearSegments: () => this.callbacks.onMathClearSegments?.(),
      onToggleDashedLines: (show) => this.callbacks.onMathToggleDashedLines?.(show),
      onToggleCoordinateSystem: (show) => this.callbacks.onMathToggleCoordinateSystem?.(show),
      onToggleEmbeddingBox: (show) => this.callbacks.onMathToggleEmbeddingBox?.(show),
      onToggleCircumSphere: (show) => this.callbacks.onMathToggleCircumSphere?.(show),
      onToggleInSphere: (show) => this.callbacks.onMathToggleInSphere?.(show),
      onToggleClipping: (enabled) => this.callbacks.onMathToggleClipping?.(enabled),
      onExplodeDistanceChange: (dist) => this.callbacks.onMathExplodeDistanceChange?.(dist),
      onUnfoldProgressChange: (progress) => this.callbacks.onMathUnfoldProgressChange?.(progress),
      onToggleThreeViews: (show) => this.callbacks.onMathToggleThreeViews?.(show),
      onToggleMidpoints: (show) => this.callbacks.onMathToggleMidpoints?.(show),
      onToggleFaceCenters: (show) => this.callbacks.onMathToggleFaceCenters?.(show),
      onToggleLabels: (show) => this.callbacks.onMathToggleLabels?.(show),
      onApplyPreset: (preset) => this.callbacks.onMathApplyPreset?.(preset),
    });

    this.hallStatusCard = new HallStatusCard({
      onMagFieldChange: (b) => this.callbacks.onHallMagFieldChange?.(b),
      onCurrentChange: (i) => this.callbacks.onHallCurrentChange?.(i),
      onThicknessChange: (d) => this.callbacks.onHallThicknessChange?.(d),
      onMaterialChange: (m) => this.callbacks.onHallMaterialChange?.(m),
      onCarrierConcentrationChange: (n) => this.callbacks.onHallCarrierConcentrationChange?.(n),
      onCarrierChargeToggle: () => this.callbacks.onHallCarrierChargeToggle?.(),
      onMobilityChange: (mu) => this.callbacks.onHallMobilityChange?.(mu),
      onToggleFieldPolarity: () => this.callbacks.onHallToggleFieldPolarity?.(),
      onToggleCurrentPolarity: () => this.callbacks.onHallToggleCurrentPolarity?.(),
      onToggleVectors: (v) => this.callbacks.onHallToggleVectors?.(v),
      onToggleParticles: (p) => this.callbacks.onHallToggleParticles?.(p),
    });

    // Mount initial view
    this.switchTab('disciplines');

    this.bindHeaderEvents();
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
    // Intercept clicks on window header when secondary modal is open to dismiss it
    this.element.querySelector('.vision-window-header')?.addEventListener(
      'click',
      (e) => {
        if (this.periodicTableModal?.isPopoverOpen?.()) {
          e.stopPropagation();
          e.preventDefault();
          this.periodicTableModal.closeElementPopover();
        }
      },
      true
    );

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
        if (this.periodicTableModal?.isPopoverOpen?.()) {
          this.periodicTableModal.closeElementPopover();
          return;
        }
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
          if (this.activeTab === 'math') {
            this.callbacks.onMathZoom?.(1);
          } else {
            this.zoomIn();
          }
        } else if (
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract' ||
          e.code === 'BracketLeft' ||
          e.key === '-' ||
          e.key === '_' ||
          e.key === '['
        ) {
          e.preventDefault();
          if (this.activeTab === 'math') {
            this.callbacks.onMathZoom?.(-1);
          } else {
            this.zoomOut();
          }
        } else if (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0') {
          e.preventDefault();
          if (this.activeTab === 'math') {
            this.callbacks.onMathResetScale?.();
          } else {
            this.resetScale();
          }
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

  public get carnotCard(): CarnotStatusCard {
    return this.carnotStatusCard;
  }

  public get conductionCard(): ConductionStatusCard {
    return this.conductionStatusCard;
  }

  public get phaseCard(): PhaseStatusCard {
    return this.phaseStatusCard;
  }

  public get stereometryCard(): StereometryStatusCard {
    return this.stereometryStatusCard;
  }

  public get hallCard(): HallStatusCard {
    return this.hallStatusCard;
  }

  public setCurrentExperimentId(id: string): void {
    this.currentExperimentId = id;
    if (id === 'math-stereometry') {
      this.activeTab = 'math';
    } else if (id.startsWith('thermo-')) {
      this.activeTab = 'thermo';
    } else if (id.startsWith('em-')) {
      this.activeTab = 'em';
    }
  }

  public switchTab(tab: VisionTab): void {
    this.periodicTableModal?.closeElementPopover();
    this.element.querySelector('.vision-window-frame')?.classList.remove('has-modal-popover');
    this.activeTab = tab;

    if (this.btnBack) {
      this.btnBack.classList.toggle('hidden', tab === 'disciplines');
    }

    const isCarnot = this.currentExperimentId === 'thermo-carnot';
    const isConduction = this.currentExperimentId === 'thermo-conduction';
    const isPhase = this.currentExperimentId === 'thermo-phase';

    let thermoTitle = '热力学';
    if (isCarnot) {
      thermoTitle = '卡诺循环';
    } else if (isConduction) {
      thermoTitle = '热传导';
    } else if (isPhase) {
      thermoTitle = '物态相变';
    }

    const titleEl = this.element.querySelector('#vision-window-title');
    const titles: Record<VisionTab, string> = {
      disciplines: '学科',
      chemistry: '常用试剂',
      beaker: '烧杯成分',
      physics: '物理学',
      math: '立体几何',
      thermo: thermoTitle,
      em: '霍尔效应',
    };
    if (titleEl) {
      titleEl.textContent = titles[tab] || '实验视窗';
    }


    this.bodyContainer.innerHTML = '';
    this.statusCardSlot.innerHTML = '';
    this.statusCardSlot.style.display = 'none';

    if (this.thermoStatusCard) {
      this.thermoStatusCard.setVisible(tab === 'thermo' && !isCarnot && !isConduction && !isPhase);
    }
    if (this.carnotStatusCard) {
      this.carnotStatusCard.setVisible(tab === 'thermo' && isCarnot);
    }
    if (this.conductionStatusCard) {
      this.conductionStatusCard.setVisible(tab === 'thermo' && isConduction);
    }
    if (this.phaseStatusCard) {
      this.phaseStatusCard.setVisible(tab === 'thermo' && isPhase);
    }
    if (this.stereometryStatusCard) {
      this.stereometryStatusCard.setVisible(tab === 'math');
    }
    if (this.hallStatusCard) {
      this.hallStatusCard.setVisible(tab === 'em');
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
      if (this.currentExperimentId !== 'math-stereometry') {
        this.currentExperimentId = 'math-stereometry';
        this.callbacks.onSelectPhysicsExperiment?.('math-stereometry');
      }
      this.stereometryStatusCard.setVisible(true);
      this.bodyContainer.appendChild(this.stereometryStatusCard.element);
    } else if (tab === 'beaker') {
      this.bodyContainer.appendChild(this.statusCard.element);
      this.callbacks.onSelectChemistry?.();
    } else if (tab === 'thermo') {
      if (isCarnot) {
        this.carnotStatusCard.setVisible(true);
        this.bodyContainer.appendChild(this.carnotStatusCard.element);
      } else if (isConduction) {
        this.conductionStatusCard.setVisible(true);
        this.bodyContainer.appendChild(this.conductionStatusCard.element);
      } else if (isPhase) {
        this.phaseStatusCard.setVisible(true);
        this.bodyContainer.appendChild(this.phaseStatusCard.element);
      } else {
        this.thermoStatusCard.setVisible(true);
        this.bodyContainer.appendChild(this.thermoStatusCard.element);
      }
    } else if (tab === 'em') {
      this.hallStatusCard.setVisible(true);
      this.bodyContainer.appendChild(this.hallStatusCard.element);
    }
  }

  public open(tab?: VisionTab, beakerId?: 'left' | 'right'): void {
    const targetTab =
      tab ||
      (this.currentExperimentId === 'math-stereometry'
        ? 'math'
        : this.currentExperimentId?.startsWith('thermo-')
        ? 'thermo'
        : this.currentExperimentId?.startsWith('em-')
        ? 'em'
        : this.activeTab) ||
      'disciplines';

    this.switchTab(targetTab);

    if (beakerId) {
      this.setActiveBeaker(beakerId);
    }
    this.isOpen = true;
    this.element.classList.remove('hidden');
    this.callbacks.onOpen();
  }

  public close(): void {
    this.periodicTableModal?.closeElementPopover();
    this.element.querySelector('.vision-window-frame')?.classList.remove('has-modal-popover');
    this.isOpen = false;
    this.element.classList.add('hidden');
    this.thermoStatusCard?.setVisible(false);
    this.carnotStatusCard?.setVisible(false);
    this.conductionStatusCard?.setVisible(false);
    this.phaseStatusCard?.setVisible(false);
    this.stereometryStatusCard?.setVisible(false);
    this.hallStatusCard?.setVisible(false);
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
