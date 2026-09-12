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
  public chemistryEngine: ChemistryEngine;
  public beaker: BeakerMesh;
  public reactionEffects: ReactionEffects;
  public visionModal: VisionModal;

  private raycaster = new THREE.Raycaster();
  private centerScreen = new THREE.Vector2(0, 0);
  private currentHoveredTarget: 'hologram' | 'beaker' | null = null;

  public clock = new THREE.Clock();
  public experimentParams = new Map<string, any>();
  private currentContext: ExperimentContext;
  private currentSwitchRequestId = 0;
  private currentExperimentId = 'quantum-wave';
  private isContextLost = false;

  constructor(containerId = 'webgl-container') {
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

  private initPostProcessing(): void {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(size, 0.28, 0.32, 0.91);
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
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

    // Mount Chemistry Beaker on the table (initially hidden until chemistry mode entered)
    this.chemistryEngine = new ChemistryEngine();
    this.beaker = new BeakerMesh();
    this.beaker.setVisible(false, false);
    this.holoTable.mountBeaker(this.beaker.group);

    this.reactionEffects = new ReactionEffects(this.beaker);
    this.beaker.group.add(this.reactionEffects.group);

    this.chemistryEngine.subscribe((state) => {
      this.beaker.updateFromState(state);
      if (state.recentReactions.length === 0 && state.precipitates.size === 0 && state.solids.size === 0) {
        this.reactionEffects?.reset();
      }
    });
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
      this.spatialWindowObject.position.x = THREE.MathUtils.lerp(this.spatialWindowObject.position.x, targetX, lerpSpeed);
      this.spatialWindowObject.position.y = THREE.MathUtils.lerp(this.spatialWindowObject.position.y, targetY, lerpSpeed);
      this.spatialWindowObject.position.z = THREE.MathUtils.lerp(this.spatialWindowObject.position.z, targetZ, lerpSpeed);

      // Handle angular wrap-around for smooth rotation
      let diffY = angleY - this.spatialWindowObject.rotation.y;
      while (diffY < -Math.PI) diffY += Math.PI * 2;
      while (diffY > Math.PI) diffY -= Math.PI * 2;
      this.spatialWindowObject.rotation.y += diffY * lerpSpeed;
      this.spatialWindowObject.rotation.x = THREE.MathUtils.lerp(this.spatialWindowObject.rotation.x, -tiltDown, lerpSpeed);
      this.spatialWindowObject.rotation.z = 0;
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
      onSelectChemistry: () => {
        this.holoTable.hideHologram();
        this.holoStage.setStageVisible(false);
        this.beaker.setVisible(true, true);
      },
      onSelectPhysicsExperiment: async (id: string) => {
        this.beaker.setVisible(false, true);
        this.holoTable.showHologram();
        this.holoStage.setStageVisible(true);
        await this.switchExperiment(id);
      },
      onStirBeaker: () => {
        this.reactionEffects.triggerPour(0x0a84ff);
      },
    });

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
    await this.switchExperiment('quantum-wave');
  }

  private getInteractiveTargetAt(screenPos: THREE.Vector2): 'hologram' | 'beaker' | null {
    this.raycaster.setFromCamera(screenPos, this.camera);

    // Check hologram projection (screens, emitter beam, and 3D stage)
    if (this.holoTable && this.holoTable.isHologramVisible()) {
      const holoTargets: THREE.Object3D[] = [...this.holoTable.getInteractiveMeshes()];
      if (this.holoStage && this.holoStage.group.visible) {
        holoTargets.push(this.holoStage.group);
      }
      const tableHits = this.raycaster.intersectObjects(holoTargets, true);
      if (tableHits.length > 0 && tableHits[0].distance < 8.0) {
        return 'hologram';
      }
    }

    // Check beaker (only when beaker is visible on the table)
    if (this.beaker && this.beaker.isVisible()) {
      const beakerHits = this.raycaster.intersectObjects(this.beaker.getInteractiveMeshes(), true);
      if (beakerHits.length > 0 && beakerHits[0].distance < 8.0) {
        return 'beaker';
      }
    }

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

    // Click on interactive objects in 3D (crosshair aiming or direct pointer click)
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.visionModal && this.visionModal.visible) return;

      const mouseNDC = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      const target = this.getInteractiveTargetAt(mouseNDC) || this.currentHoveredTarget;
      if (target) {
        e.stopPropagation();
        if (target === 'hologram') {
          this.holoTable.hideHologram();
          this.holoStage.setStageVisible(false);
          this.visionModal.open('disciplines');
        } else if (target === 'beaker') {
          this.visionModal.open('chemistry');
        }
      }
    });
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);

    if (this.css3dRenderer) {
      this.css3dRenderer.setSize(width, height);
    }
  }

  private checkCrosshairIntersection(): void {
    if (!this.crosshair || (this.visionModal && this.visionModal.visible)) {
      return;
    }

    const targetType = this.getInteractiveTargetAt(this.centerScreen);
    const hovered = targetType !== null;
    let label = '';

    if (targetType === 'hologram') {
      label = '✦ 点击开启 3D 悬浮视窗';
    } else if (targetType === 'beaker') {
      label = '✦ 点击开启化学实验视窗';
    }

    this.currentHoveredTarget = targetType;
    this.crosshair.setHovered(hovered, label);
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (this.isContextLost) {
      return;
    }

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    if (this.inputManager) {
      this.inputManager.update(delta);
    }

    // Continuously update spatial window orientation and elevation to smoothly face camera in 3D
    if (this.spatialWindowObject && this.visionModal && this.visionModal.visible) {
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

    if (this.chemistryEngine) {
      this.chemistryEngine.update(delta);
    }

    if (this.beaker) {
      this.beaker.update(delta);
    }

    if (this.reactionEffects && this.chemistryEngine) {
      this.reactionEffects.update(delta, this.chemistryEngine.state);
    }

    if (this.hud) {
      this.hud.update(delta);
    }

    this.checkCrosshairIntersection();

    this.composer.render();

    if (this.css3dRenderer && this.css3dScene) {
      this.css3dRenderer.render(this.css3dScene, this.camera);
    }
  }
}
