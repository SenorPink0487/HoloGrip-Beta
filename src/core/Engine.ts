import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { Laboratory } from '../scene/Laboratory';
import { HoloTable } from '../scene/HoloTable';
import { Lighting } from '../scene/Lighting';
import { HologramStage } from './HologramStage';
import { InputManager } from '../controls/InputManager';
import { WorkerPool } from '../workers/WorkerPool';
import { ComputeBridge } from './platform/ComputeBridge';
import { ExperimentRegistry } from '../experiments/ExperimentRegistry';
import { HUD } from '../ui/HUD';
import { Crosshair } from '../ui/Crosshair';
import { ChemistryEngine } from '../chemistry/ChemistryEngine';
import { BeakerMesh } from '../scene/BeakerMesh';
import { ReactionEffects } from '../scene/ReactionEffects';
import { VisionModal } from '../ui/vision/VisionModal';
import { OpticsExperimentManager, OpticsExperimentId } from '../physics/optics/OpticsExperimentManager';
import type { ExperimentContext, IExperiment } from './types';

export class Engine {
  public container: HTMLElement;
  public renderer: THREE.WebGLRenderer;
  public css3dRenderer: CSS3DRenderer;
  public css3dScene: THREE.Scene;
  public spatialWindowObject: CSS3DObject;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;

  public lighting: Lighting;
  public lab: Laboratory;
  public holoTable: HoloTable;
  public holoStage: HologramStage;

  public workerPool: WorkerPool;
  public computeBridge: ComputeBridge;
  public inputManager: InputManager;
  public hud: HUD;

  public crosshair: Crosshair;
  public chemistryEngineLeft: ChemistryEngine;
  public chemistryEngineRight: ChemistryEngine;
  public beakerLeft: BeakerMesh;
  public beakerRight: BeakerMesh;
  public reactionEffectsLeft: ReactionEffects;
  public reactionEffectsRight: ReactionEffects;
  public activeBeakerId: 'left' | 'right' = 'left';
  public visionModal: VisionModal;
  public opticsManager: OpticsExperimentManager | null = null;
  public opticsDragState: {
    carrierId: string;
    downClientX: number;
    initialCarrierX: number;
  } | null = null;

  public get chemistryEngine(): ChemistryEngine {
    return this.activeBeakerId === 'left' ? this.chemistryEngineLeft : this.chemistryEngineRight;
  }
  public set chemistryEngine(engine: ChemistryEngine) {
    this.chemistryEngineLeft = engine;
  }

  public get beaker(): BeakerMesh {
    return this.activeBeakerId === 'left' ? this.beakerLeft : this.beakerRight;
  }
  public set beaker(b: BeakerMesh) {
    this.beakerLeft = b;
  }

  public get reactionEffects(): ReactionEffects {
    return this.activeBeakerId === 'left' ? this.reactionEffectsLeft : this.reactionEffectsRight;
  }
  public set reactionEffects(re: ReactionEffects) {
    this.reactionEffectsLeft = re;
  }

  // Inter-beaker pouring & fluid dynamics
  private pourStreamMesh: THREE.Mesh | null = null;
  private pourStreamMat: THREE.MeshPhysicalMaterial | null = null;
  private pourVolumeBadgeEl: HTMLElement | null = null;

  public beakerDragState: {
    isDragging: boolean;
    isPouring: boolean;
    sourceId: 'left' | 'right';
    targetId: 'left' | 'right';
    sourceMesh: BeakerMesh;
    targetMesh: BeakerMesh;
    sourceEngine: ChemistryEngine;
    targetEngine: ChemistryEngine;
    downClientX: number;
    downClientY: number;
    downTime: number;
    targetTilt: number;
    targetPosition: THREE.Vector3;
    lastPouredVolume: number;
  } | null = null;

  private raycaster = new THREE.Raycaster();
  private centerScreen = new THREE.Vector2(0, 0);
  private lastPointerPos: THREE.Vector2 | null = null;
  private currentHoveredTarget: 'beaker-left' | 'beaker-right' | 'beaker' | null = null;

  public clock = new THREE.Clock();
  private lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  private startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  private lastCrosshairCheck = 0;
  public experimentParams = new Map<string, any>();
  private currentContext: ExperimentContext;
  private currentSwitchRequestId = 0;
  private currentExperimentId: string | null = null;
  private isContextLost = false;

  constructor(containerId = 'webgl-container') {
    if (typeof window !== 'undefined') {
      (window as any).__ENGINE__ = this;
    }
    this.container = document.getElementById(containerId) || document.body;

    this.initRenderer();
    this.initCSS3DRenderer();
    this.initScene();
    this.initCamera();
    this.initPostProcessing();
    this.initComputeAndWorkers();
    this.initWorld();
    this.initControls();
    this.initHUD();
    this.initVisionOS();
    this.initEvents();

    this.initDefaultExperiment();
    this.animate();
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Limit pixel ratio to 1.5 on high-DPI displays to eliminate fillrate starvation
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.container.appendChild(this.renderer.domElement);
  }

  private initCSS3DRenderer(): void {
    this.css3dScene = new THREE.Scene();
    this.css3dRenderer = new CSS3DRenderer();
    this.css3dRenderer.setSize(window.innerWidth, window.innerHeight);

    const dom = this.css3dRenderer.domElement;
    dom.id = 'css3d-container';
    dom.style.position = 'absolute';
    dom.style.top = '0';
    dom.style.left = '0';
    dom.style.width = '100%';
    dom.style.height = '100%';
    dom.style.pointerEvents = 'none';
    dom.style.overflow = 'hidden';
    dom.style.zIndex = '50';

    this.container.appendChild(dom);
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020409);
    this.scene.fog = new THREE.FogExp2(0x020409, 0.002);
  }

  private initCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
  }

  public isPostProcessingActive = false;

  private initPostProcessing(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Half-resolution bloom resolution to prevent 4K fragment shading bottlenecks
    const bloomSize = new THREE.Vector2(Math.max(256, Math.floor(width * 0.5)), Math.max(256, Math.floor(height * 0.5)));
    this.bloomPass = new UnrealBloomPass(bloomSize, 0.28, 0.32, 0.91);
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public setPostProcessing(enabled: boolean): void {
    this.isPostProcessingActive = enabled;
  }

  private initComputeAndWorkers(): void {
    this.workerPool = new WorkerPool();
    this.computeBridge = new ComputeBridge(this.workerPool);
  }

  private initWorld(): void {
    this.lighting = new Lighting(this.scene);

    this.lab = new Laboratory();
    this.scene.add(this.lab.group);

    this.holoTable = new HoloTable();
    this.scene.add(this.holoTable.group);

    this.holoStage = new HologramStage();
    this.scene.add(this.holoStage.group);

    // Mount two chemistry beakers symmetrically on sides of table (avoiding table center!)
    this.chemistryEngineLeft = new ChemistryEngine();
    this.chemistryEngineRight = new ChemistryEngine();

    this.beakerLeft = new BeakerMesh();
    this.beakerLeft.restingPosition.set(-0.38, 0.852, 1.10);
    this.beakerLeft.setVisible(false, false);

    this.beakerRight = new BeakerMesh();
    this.beakerRight.restingPosition.set(0.38, 0.852, 1.10);
    this.beakerRight.setVisible(false, false);

    this.holoTable.mountBeakers(
      this.beakerLeft.group,
      this.beakerRight.group,
      this.beakerLeft.restingPosition,
      this.beakerRight.restingPosition
    );

    // Keep visibility in sync when setVisible is called
    this.beakerLeft.onVisibilityChange = (visible, animate) => {
      this.beakerRight.setVisible(visible, animate);
    };

    this.reactionEffectsLeft = new ReactionEffects(this.beakerLeft);
    this.beakerLeft.group.add(this.reactionEffectsLeft.group);

    this.reactionEffectsRight = new ReactionEffects(this.beakerRight);
    this.beakerRight.group.add(this.reactionEffectsRight.group);

    this.chemistryEngineLeft.subscribe((state) => {
      this.beakerLeft.updateFromState(state);
      if (state.recentReactions.length === 0 && state.precipitates.size === 0 && state.solids.size === 0) {
        this.reactionEffectsLeft?.reset();
      }
    });

    this.chemistryEngineRight.subscribe((state) => {
      this.beakerRight.updateFromState(state);
      if (state.recentReactions.length === 0 && state.precipitates.size === 0 && state.solids.size === 0) {
        this.reactionEffectsRight?.reset();
      }
    });

    this.initPourStreamMesh();
    this.initPourVolumeBadge();
  }

  private initPourStreamMesh(): void {
    this.pourStreamMat = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.05,
      metalness: 0.02,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const dummyGeo = new THREE.BufferGeometry();
    this.pourStreamMesh = new THREE.Mesh(dummyGeo, this.pourStreamMat);
    this.pourStreamMesh.visible = false;
    this.scene.add(this.pourStreamMesh);
  }

  private updatePourStream(startWorld: THREE.Vector3, endWorld: THREE.Vector3, color: THREE.Color): void {
    if (!this.pourStreamMesh || !this.pourStreamMat) return;

    this.pourStreamMat.color.copy(color);

    const midWorld = startWorld.clone().lerp(endWorld, 0.45).add(new THREE.Vector3(0, 0.025, 0));
    const curve = new THREE.CatmullRomCurve3([startWorld, midWorld, endWorld]);

    this.pourStreamMesh.geometry.dispose();
    this.pourStreamMesh.geometry = new THREE.TubeGeometry(curve, 16, 0.007, 8, false);
    this.pourStreamMesh.visible = true;
  }

  private hidePourStream(): void {
    if (this.pourStreamMesh) {
      this.pourStreamMesh.visible = false;
    }
  }

  private initPourVolumeBadge(): void {
    if (typeof document === 'undefined') return;
    this.pourVolumeBadgeEl = document.createElement('div');
    this.pourVolumeBadgeEl.id = 'beaker-pour-vol-indicator';
    this.pourVolumeBadgeEl.className = 'beaker-vol-indicator';
    this.pourVolumeBadgeEl.innerHTML = `
      <svg class="apple-sf-icon badge-glyph" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
      </svg>
      <span class="badge-text" id="beaker-vol-text">剩余量: 60 mL</span>
    `;
    this.container.appendChild(this.pourVolumeBadgeEl);
  }

  private updatePourVolumeBadge(beaker: BeakerMesh, volume: number): void {
    if (!this.pourVolumeBadgeEl || !this.camera) return;

    const topWorld = beaker.group.position.clone().add(new THREE.Vector3(0, beaker.beakerHeight + 0.12, 0));
    topWorld.project(this.camera);
    if (topWorld.z > 1.0) {
      this.hidePourVolumeBadge();
      return;
    }

    const x = (topWorld.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(topWorld.y * 0.5) + 0.5) * window.innerHeight;

    this.pourVolumeBadgeEl.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 14}px)`;
    const textEl = this.pourVolumeBadgeEl.querySelector('#beaker-vol-text');
    if (textEl) {
      textEl.textContent = `剩余量: ${Math.max(0, Math.round(volume))} mL`;
    }
    this.pourVolumeBadgeEl.classList.add('visible');
  }

  private hidePourVolumeBadge(): void {
    this.pourVolumeBadgeEl?.classList.remove('visible');
  }

  private initControls(): void {
    this.inputManager = new InputManager(this.camera, this.renderer.domElement);
  }

  private createContext(): ExperimentContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      stage: this.holoStage,
      computeBridge: this.computeBridge,
      workerPool: this.workerPool,
      parameters: {},
      getParameter: <T = any>(id: string): T => {
        return this.experimentParams.get(id);
      },
      setParameter: <T = any>(id: string, value: T): void => {
        this.experimentParams.set(id, value);
      },
    };
  }

  private initHUD(): void {
    this.currentContext = this.createContext();
    this.hud = new HUD(this.computeBridge, async (id: string) => {
      await this.switchExperiment(id);
    });

    this.hud.drawer.onToggle = (isOpen: boolean) => {
      if (isOpen) {
        this.inputManager.player.exitLock();
        this.inputManager.player.allowPointerLock = false;
        this.crosshair.setVisible(false);
      } else {
        if (!this.visionModal || !this.visionModal.visible) {
          this.inputManager.player.allowPointerLock = true;
          this.crosshair.setVisible(true);
        }
      }
    };

    this.crosshair = new Crosshair();
  }

  private updateSpatialWindowTransform(delta: number, snap = false): void {
    if (!this.spatialWindowObject || !this.visionModal || !this.visionModal.visible || !this.camera) {
      return;
    }

    // Target height suspended directly above the table (table top is 0.88m, beaker top is 1.27m)
    // At y = 2.06m, with height ~1.15m, the window bottom is at ~1.48m, leaving a clean 21cm clear view of the beaker
    const targetY = 2.06;

    // Angle of the camera relative to table center (0, 0)
    const dx = this.camera.position.x;
    const dz = this.camera.position.z;
    const angleY = Math.atan2(dx, dz);

    // Position window slightly behind the table center along the camera sightline
    // so the beaker at (0, 0.908, 0) is always situated in front and below the window
    const backOffset = -0.06;
    const targetX = Math.sin(angleY) * backOffset;
    const targetZ = Math.cos(angleY) * backOffset;

    // Vertical angle to tilt window slightly downward towards player's eye level (eyeHeight is 1.65m)
    const distXZ = Math.max(1.0, Math.hypot(dx - targetX, dz - targetZ));
    const tiltDown = Math.atan2(targetY - this.camera.position.y, distXZ) * 0.42;

    if (snap) {
      this.spatialWindowObject.position.set(targetX, targetY, targetZ);
      this.spatialWindowObject.rotation.set(-tiltDown, angleY, 0);
    } else {
      const lerpSpeed = Math.min(1.0, delta * 7.0);
      const pos = this.spatialWindowObject.position;
      const rot = this.spatialWindowObject.rotation;

      if (Math.hypot(pos.x - targetX, pos.y - targetY, pos.z - targetZ) > 1e-4) {
        pos.x = THREE.MathUtils.lerp(pos.x, targetX, lerpSpeed);
        pos.y = THREE.MathUtils.lerp(pos.y, targetY, lerpSpeed);
        pos.z = THREE.MathUtils.lerp(pos.z, targetZ, lerpSpeed);
      }

      // Handle angular wrap-around for smooth rotation
      let diffY = angleY - rot.y;
      while (diffY < -Math.PI) diffY += Math.PI * 2;
      while (diffY > Math.PI) diffY -= Math.PI * 2;
      if (Math.abs(diffY) > 1e-4) {
        rot.y += diffY * lerpSpeed;
      }
      if (Math.abs(-tiltDown - rot.x) > 1e-4) {
        rot.x = THREE.MathUtils.lerp(rot.x, -tiltDown, lerpSpeed);
      }
      rot.z = 0;
    }
  }

  private positionWindowInFrontOfCamera(snap = true): void {
    this.updateSpatialWindowTransform(0.1, snap);
  }

  private initVisionOS(): void {
    this.visionModal = new VisionModal(this.chemistryEngine, {
      onClose: () => {
        this.spatialWindowObject.visible = false;
        this.inputManager.player.allowPointerLock = true;
        this.crosshair.setVisible(true);
      },
      onOpen: () => {
        this.positionWindowInFrontOfCamera(true);
        this.spatialWindowObject.visible = true;
        this.inputManager.player.exitLock();
        this.inputManager.player.allowPointerLock = false;
        this.crosshair.setVisible(false);
      },
      onRecenter: () => {
        this.positionWindowInFrontOfCamera(true);
      },
      onScaleChange: (multiplier: number) => {
        const baseScale = 0.0016;
        const s = baseScale * multiplier;
        this.spatialWindowObject.scale.set(s, s, s);
      },
      onSelectChemistry: () => {
        this.holoTable.hideHologram();
        this.holoStage.setStageVisible(false);
        this.beakerLeft.setVisible(true, true);
        this.beakerRight.setVisible(true, true);
        if (this.opticsManager) {
          this.opticsManager.setVisible(false);
        }
      },
      onSelectPhysicsExperiment: async (id: string) => {
        this.beakerLeft.setVisible(false, true);
        this.beakerRight.setVisible(false, true);
        this.holoTable.showHologram();
        this.holoStage.setStageVisible(true);
        if (this.opticsManager) {
          this.opticsManager.setVisible(false);
        }
        await this.switchExperiment(id);
      },
      onSelectOptics: (experimentId: OpticsExperimentId) => {
        this.beakerLeft.setVisible(false, true);
        this.beakerRight.setVisible(false, true);
        this.holoTable.hideHologram();
        this.holoStage.setStageVisible(false);

        if (!this.opticsManager) {
          this.opticsManager = new OpticsExperimentManager(this.computeBridge);
          this.scene.add(this.opticsManager.group);
          this.visionModal.setOpticsManager(this.opticsManager);
        }
        this.opticsManager.setVisible(true);
        this.opticsManager.setExperiment(experimentId);
      },
      onStirBeaker: () => {
        this.reactionEffects.triggerPour(0x0a84ff);
      },
      onSelectBeaker: (beakerId) => {
        this.activeBeakerId = beakerId;
      },
    });

    this.visionModal.setEngines(this.chemistryEngineLeft, this.chemistryEngineRight, 'left');

    // Mount 3D spatial window directly inside the Three.js 3D scene
    this.spatialWindowObject = new CSS3DObject(this.visionModal.element);
    this.spatialWindowObject.scale.set(0.0016, 0.0016, 0.0016);
    this.positionWindowInFrontOfCamera(true);
    this.spatialWindowObject.visible = false;
    this.css3dScene.add(this.spatialWindowObject);

    this.inputManager.player.onLockChange = (isLocked: boolean) => {
      const isDrawerOpen = this.hud?.drawer?.open ?? false;
      const isModalOpen = this.visionModal?.visible ?? false;
      if (!isLocked && !isModalOpen && !isDrawerOpen) {
        this.crosshair.setVisible(true);
      }
    };
  }

  public async switchExperiment(id: string): Promise<void> {
    const requestId = ++this.currentSwitchRequestId;
    this.hud.showTransition(true, '全息粒子解聚与参数重构...');

    try {
      const registry = ExperimentRegistry.getInstance();
      const experiment = await registry.loadExperiment(id);

      // Guard against race condition: newer request initiated during load
      if (requestId !== this.currentSwitchRequestId) {
        return;
      }

      // Pre-calculate target parameters in a staging map (do not alter engine state yet)
      const targetParams = new Map<string, any>();
      if (experiment.metadata.parameters) {
        for (const p of experiment.metadata.parameters) {
          targetParams.set(p.id, p.defaultValue);
        }
      }

      // Transition holographic stage with token guard
      const mounted = await this.holoStage.switchExperiment(
        experiment,
        this.currentContext,
        (status) => {
          if (requestId === this.currentSwitchRequestId) {
            this.hud.showTransition(true, status);
          }
        }
      );

      // Guard against race condition: superseded during stage transition
      if (!mounted || requestId !== this.currentSwitchRequestId) {
        return;
      }

      // Atomically commit parameters only when stage successfully mounts this experiment
      this.experimentParams.clear();
      for (const [key, value] of targetParams) {
        this.experimentParams.set(key, value);
      }

      this.currentExperimentId = id;
      this.hud.setActiveExperiment(experiment, this.currentContext);
      if (this.renderer?.shadowMap?.enabled) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    } catch (err) {
      console.error('[Engine] Failed to switch experiment:', err);
    } finally {
      if (requestId === this.currentSwitchRequestId) {
        setTimeout(() => {
          if (requestId === this.currentSwitchRequestId) {
            this.hud.showTransition(false);
          }
        }, 300);
      }
    }
  }

  private async initDefaultExperiment(): Promise<void> {
    const all = ExperimentRegistry.getInstance().getAll();
    if (all.length > 0) {
      await this.switchExperiment(all[0].id);
    }
  }

  private getInteractiveBeakerAt(screenPos: THREE.Vector2): 'left' | 'right' | null {
    this.raycaster.setFromCamera(screenPos, this.camera);
    if (this.beakerLeft && this.beakerLeft.isVisible()) {
      const leftHits = this.raycaster.intersectObjects(this.beakerLeft.getInteractiveMeshes(), true);
      if (leftHits.length > 0 && leftHits[0].distance < 8.0) {
        return 'left';
      }
    }
    if (this.beakerRight && this.beakerRight.isVisible()) {
      const rightHits = this.raycaster.intersectObjects(this.beakerRight.getInteractiveMeshes(), true);
      if (rightHits.length > 0 && rightHits[0].distance < 8.0) {
        return 'right';
      }
    }
    return null;
  }

  private getInteractiveTargetAt(screenPos: THREE.Vector2): 'beaker-left' | 'beaker-right' | 'beaker' | null {
    this.raycaster.setFromCamera(screenPos, this.camera);

    const beaker = this.getInteractiveBeakerAt(screenPos);
    if (beaker === 'left') return 'beaker-left';
    if (beaker === 'right') return 'beaker-right';

    return null;
  }

  private initEvents(): void {
    window.addEventListener('resize', () => this.onResize());

    // WebGL Context Lost & Restored Protection (safeguards iPadOS/iOS/macOS backgrounding & screen-off)
    const canvas = this.renderer.domElement;

    canvas.addEventListener('webglcontextlost', (e: Event) => {
      e.preventDefault(); // REQUIRED by WebGL spec to allow context restore
      console.warn('[Engine] WebGL Context Lost! Pausing render loop to avoid GPU crash.');
      this.isContextLost = true;
      this.hud?.showTransition(true, 'GPU 渲染上下文休眠中...');
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.info('[Engine] WebGL Context Restored. Rebuilding pipeline and restoring experiment.');
      this.isContextLost = false;
      this.initPostProcessing();
      this.onResize();
      if (this.currentExperimentId) {
        this.switchExperiment(this.currentExperimentId);
      }
      this.hud?.showTransition(false);
    });

    // 3D Pointer interactions (Single-click Reagent Select & Long-press Drag & Pour)
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.visionModal && this.visionModal.visible) {
        if (e.target !== canvas) return;
      }

      const mouseNDC = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      // Optics apparatus 3D interactions
      if (this.opticsManager && this.opticsManager.group.visible) {
        this.raycaster.setFromCamera(mouseNDC, this.camera);
        const opticsHits = this.raycaster.intersectObjects(this.opticsManager.group.children, true);
        if (opticsHits.length > 0 && opticsHits[0].distance < 8.0) {
          let obj: THREE.Object3D | null = opticsHits[0].object;
          while (obj && obj !== this.opticsManager.group) {
            if (obj.name === 'laser-power-btn') {
              e.stopPropagation();
              this.opticsManager.toggleLaserPower();
              return;
            }
            if (obj.name && obj.name.startsWith('carrier-')) {
              e.stopPropagation();
              const carrierId = obj.name.replace('carrier-', '');
              const carrier = this.opticsManager.bench.carriers.get(carrierId);
              if (carrier) {
                this.opticsDragState = {
                  carrierId,
                  downClientX: e.clientX,
                  initialCarrierX: carrier.currentX,
                };
                return;
              }
            }
            obj = obj.parent;
          }
        }
      }

      const beakerHit = this.getInteractiveBeakerAt(mouseNDC);
      if (beakerHit) {
        e.stopPropagation();
        const sourceId = beakerHit;
        const targetId = sourceId === 'left' ? 'right' : 'left';
        const sourceMesh = sourceId === 'left' ? this.beakerLeft : this.beakerRight;
        const targetMesh = sourceId === 'left' ? this.beakerRight : this.beakerLeft;
        const sourceEngine = sourceId === 'left' ? this.chemistryEngineLeft : this.chemistryEngineRight;
        const targetEngine = sourceId === 'left' ? this.chemistryEngineRight : this.chemistryEngineLeft;

        this.beakerDragState = {
          isDragging: false,
          isPouring: false,
          sourceId,
          targetId,
          sourceMesh,
          targetMesh,
          sourceEngine,
          targetEngine,
          downClientX: e.clientX,
          downClientY: e.clientY,
          downTime: performance.now(),
          targetTilt: 0,
          targetPosition: sourceMesh.restingPosition.clone(),
          lastPouredVolume: 0,
        };
        return;
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.lastPointerPos) {
        this.lastPointerPos = new THREE.Vector2();
      }
      this.lastPointerPos.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      if (this.opticsDragState && this.opticsManager) {
        const dx = (e.clientX - this.opticsDragState.downClientX) * 0.0012;
        this.opticsManager.setCarrierFromRaycast(
          this.opticsDragState.carrierId,
          this.opticsDragState.initialCarrierX + dx
        );
        return;
      }

      if (!this.beakerDragState) return;

      const dist = Math.hypot(e.clientX - this.beakerDragState.downClientX, e.clientY - this.beakerDragState.downClientY);
      const elapsed = performance.now() - this.beakerDragState.downTime;

      // Initiate dragging if moved > 8px or held > 160ms and moved > 2px
      if (!this.beakerDragState.isDragging && (dist > 8 || (elapsed > 160 && dist > 2))) {
        this.beakerDragState.isDragging = true;
        this.crosshair?.setVisible(false);
        this.inputManager.player.enabled = false;
        this.inputManager.player.allowPointerLock = false;
        this.inputManager.player.exitLock();
      }

      if (this.beakerDragState.isDragging) {
        const mouseNDC = new THREE.Vector2(
          (e.clientX / window.innerWidth) * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1
        );
        this.raycaster.setFromCamera(mouseNDC, this.camera);

        const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.10);
        const hitPoint = new THREE.Vector3();
        const intersected = this.raycaster.ray.intersectPlane(dragPlane, hitPoint);
        if (intersected) {
          hitPoint.x = Math.max(-0.85, Math.min(0.85, hitPoint.x));
          hitPoint.z = Math.max(-0.55, Math.min(1.55, hitPoint.z));

          const targetBase = this.beakerDragState.targetMesh.restingPosition;
          const distToTarget = Math.hypot(hitPoint.x - targetBase.x, hitPoint.z - targetBase.z);

          if (distToTarget < 0.38) {
            // Hover pouring pose directly above target beaker mouth
            this.beakerDragState.isPouring = true;
            const isLeftToRight = this.beakerDragState.sourceId === 'left';
            const hoverOffset = isLeftToRight ? -0.16 : 0.16;
            const tiltAngle = isLeftToRight ? -Math.PI * 0.38 : Math.PI * 0.38;

            this.beakerDragState.targetPosition.set(
              targetBase.x + hoverOffset,
              targetBase.y + this.beakerDragState.targetMesh.beakerHeight + 0.08,
              targetBase.z
            );
            this.beakerDragState.targetTilt = tiltAngle;
          } else {
            // Moving in air
            this.beakerDragState.isPouring = false;
            this.beakerDragState.targetPosition.set(hitPoint.x, 1.08, hitPoint.z);
            this.beakerDragState.targetTilt = 0;
          }
        }
      }
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.opticsDragState) {
        this.opticsDragState = null;
      }

      if (!this.beakerDragState) return;

      const state = this.beakerDragState;
      this.beakerDragState = null;
      this.inputManager.player.enabled = true;
      if (this.crosshair && (!this.visionModal || !this.visionModal.visible)) {
        this.crosshair.setVisible(true);
      }

      if (!state.isDragging) {
        // Single click: open Periodic Table for clicked beaker!
        // "打开化学板块默认给左边的杯子选试剂，单击烧杯打开元素周期表页面自由选择"
        this.activeBeakerId = state.sourceId;
        this.visionModal.open('chemistry', state.sourceId);
        return;
      }

      // Drag released: restore source beaker
      state.sourceMesh.setTilt(0);
      this.hidePourStream();
      this.hidePourVolumeBadge();

      // If liquid was transferred, trigger composition analysis view for target beaker!
      // "视窗呈现：混合反应发生后，中央全息主视窗自动切换至该烧杯的成分分析面板进行大屏展示。"
      if (state.lastPouredVolume > 0.01) {
        this.activeBeakerId = state.targetId;
        this.visionModal.open('beaker', state.targetId);
      }
    });
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    if (this.composer && this.bloomPass) {
      this.composer.setSize(width, height);
      this.bloomPass.resolution.set(Math.max(256, Math.floor(width * 0.5)), Math.max(256, Math.floor(height * 0.5)));
    }

    if (this.css3dRenderer) {
      this.css3dRenderer.setSize(width, height);
    }

    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private checkCrosshairIntersection(now: number): void {
    if (!this.crosshair || (this.visionModal && this.visionModal.visible)) {
      return;
    }

    // Throttle raycasting to every 50ms (~20Hz) to prevent main-thread scene traversal spikes
    if (now - this.lastCrosshairCheck < 50) {
      return;
    }
    this.lastCrosshairCheck = now;

    const isPointerLocked = this.inputManager?.player?.isLocked ?? false;
    let targetType = this.getInteractiveTargetAt(this.centerScreen);

    // If not pointer locked and center crosshair didn't hit, also check free mouse pointer position
    if (!targetType && !isPointerLocked && this.lastPointerPos) {
      targetType = this.getInteractiveTargetAt(this.lastPointerPos);
    }

    const hovered = targetType !== null;
    let label = '';

    if (targetType === 'beaker-left') {
      label = '左侧烧杯 · 单击选试剂 / 长按拖拽倾倒';
    } else if (targetType === 'beaker-right') {
      label = '右侧烧杯 · 单击选试剂 / 长按拖拽倾倒';
    } else if (targetType === 'beaker') {
      label = '烧杯 · 单击选试剂 / 长按拖拽倾倒';
    }

    this.currentHoveredTarget = targetType;
    this.crosshair.setHovered(hovered, label);

    // 3D Interactive feedback: highlight beaker body & halo ring
    if (this.beakerLeft) {
      this.beakerLeft.setHovered(targetType === 'beaker-left');
    }
    if (this.beakerRight) {
      this.beakerRight.setHovered(targetType === 'beaker-right');
    }
    if (this.holoTable) {
      this.holoTable.setHovered(false);
    }

    // Cursor feedback for interactive targets
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = hovered && !isPointerLocked ? 'pointer' : 'default';
    }
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (this.isContextLost) {
      return;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delta = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const elapsed = (now - this.startTime) / 1000;

    if (this.inputManager) {
      this.inputManager.update(delta);
    }

    // Continuously update spatial window orientation and elevation only when modal is visible
    const isModalOpen = Boolean(this.visionModal && this.visionModal.visible);
    if (this.spatialWindowObject && isModalOpen) {
      this.updateSpatialWindowTransform(delta, false);
    }

    if (this.holoTable) {
      this.holoTable.update(delta);
    }

    if (this.lab) {
      this.lab.update(delta, elapsed);
    }

    if (this.holoStage) {
      this.holoStage.update(delta, elapsed, this.currentContext);
    }

    if (this.chemistryEngineLeft) {
      this.chemistryEngineLeft.update(delta);
    }
    if (this.chemistryEngineRight) {
      this.chemistryEngineRight.update(delta);
    }

    // Beaker drag, pour stream, volume transfer & physics
    if (this.beakerDragState && this.beakerDragState.isDragging) {
      const { sourceMesh, targetMesh, sourceEngine, targetEngine, targetPosition, targetTilt, isPouring } = this.beakerDragState;

      // Smoothly lerp dragged beaker position towards target position
      const posLerp = Math.min(1.0, delta * 12.0);
      sourceMesh.group.position.lerp(targetPosition, posLerp);

      // Smoothly tilt beaker towards target tilt
      sourceMesh.setTilt(targetTilt);

      // Pouring mechanics
      if (isPouring) {
        // Liquid begins flowing when beaker is sufficiently tilted and has remaining volume
        if (Math.abs(sourceMesh.currentTiltZ) > 0.18 && sourceEngine.state.volume > 0.05) {
          const transferRate = 35.0; // mL/s
          const transferAmt = Math.min(sourceEngine.state.volume, transferRate * delta);
          if (transferAmt > 0) {
            targetEngine.mixFrom(sourceEngine, transferAmt);
            this.beakerDragState.lastPouredVolume += transferAmt;

            // Trigger pour splash & reaction effects in target beaker
            const targetEffects = this.beakerDragState.targetId === 'left' ? this.reactionEffectsLeft : this.reactionEffectsRight;
            targetEffects.triggerPour(sourceMesh.liquidColor.getHex());
          }

          // Dynamic fluid pouring stream connecting source lip to target mouth
          const pourDirection = this.beakerDragState.sourceId === 'left' ? 'right' : 'left';
          const lipPos = sourceMesh.getLipWorldPosition(pourDirection);
          const mouthPos = targetMesh.getMouthWorldPosition();
          this.updatePourStream(lipPos, mouthPos, sourceMesh.liquidColor);

          // Update floating volume badge above tilted source beaker
          this.updatePourVolumeBadge(sourceMesh, sourceEngine.state.volume);
        } else if (sourceEngine.state.volume <= 0.05) {
          // Source beaker emptied
          this.hidePourStream();
          this.updatePourVolumeBadge(sourceMesh, 0);
        }
      } else {
        this.hidePourStream();
        // Show remaining volume badge while holding and moving beaker in air
        this.updatePourVolumeBadge(sourceMesh, sourceEngine.state.volume);
      }
    } else {
      // Not dragging: smoothly return both beakers to symmetrical resting positions & reset tilt
      if (this.beakerLeft) {
        const dist = this.beakerLeft.group.position.distanceTo(this.beakerLeft.restingPosition);
        if (dist > 0.0005) {
          this.beakerLeft.group.position.lerp(this.beakerLeft.restingPosition, Math.min(1.0, delta * 10.0));
        }
        this.beakerLeft.setTilt(0);
      }
      if (this.beakerRight) {
        const dist = this.beakerRight.group.position.distanceTo(this.beakerRight.restingPosition);
        if (dist > 0.0005) {
          this.beakerRight.group.position.lerp(this.beakerRight.restingPosition, Math.min(1.0, delta * 10.0));
        }
        this.beakerRight.setTilt(0);
      }
      this.hidePourStream();
      this.hidePourVolumeBadge();
    }

    // Update both beaker meshes and reaction particle systems
    if (this.beakerLeft && this.beakerLeft.isVisible()) {
      this.beakerLeft.update(delta);
      if (this.reactionEffectsLeft && this.chemistryEngineLeft) {
        this.reactionEffectsLeft.update(delta, this.chemistryEngineLeft.state);
      }
    }

    if (this.beakerRight && this.beakerRight.isVisible()) {
      this.beakerRight.update(delta);
      if (this.reactionEffectsRight && this.chemistryEngineRight) {
        this.reactionEffectsRight.update(delta, this.chemistryEngineRight.state);
      }
    }

    if (this.hud) {
      this.hud.update(delta);
    }

    if (this.opticsManager && this.opticsManager.group.visible) {
      this.opticsManager.update(delta);
    }

    this.checkCrosshairIntersection(now);

    // Render using ultra-fast native pipeline (100+ FPS) or optional downsampled bloom composer
    if (this.isPostProcessingActive && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Only render CSS3D scene when spatial window is open/visible
    if (this.css3dRenderer && this.css3dScene && isModalOpen && this.spatialWindowObject?.visible) {
      this.css3dRenderer.render(this.css3dScene, this.camera);
    }
  }
}
