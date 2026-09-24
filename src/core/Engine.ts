import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { Laboratory } from '../scene/Laboratory';
import { HoloTable } from '../scene/HoloTable';
import { Lighting } from '../scene/Lighting';
import { TextureGenerator } from '../scene/Textures';
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
  public chemistryEngineLeft: ChemistryEngine;
  public chemistryEngineRight: ChemistryEngine;
  public beakerLeft: BeakerMesh;
  public beakerRight: BeakerMesh;
  public reactionEffectsLeft: ReactionEffects;
  public reactionEffectsRight: ReactionEffects;
  public activeBeakerId: 'left' | 'right' = 'left';
  public visionModal: VisionModal;

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
  private currentHoveredTarget: string | null = null;
  private isExperimentInteracting = false;
  private lastThermoTelemetrySync = 0;

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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.localClippingEnabled = true;

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
    this.scene.background = new THREE.Color(0xecf1f5);
  }

  private initCamera(): void {
    // 60° FOV gives natural, distortion-free cinematic perspective matching Image 1
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
  }

  // Use clean, crisp native WebGL pipeline with hardware MSAA to prevent overexposed bloom fog
  public isPostProcessingActive = false;

  private initPostProcessing(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // High threshold (1.15) ensures ONLY ultra-bright emissives bloom, never white architecture
    const bloomSize = new THREE.Vector2(Math.max(256, Math.floor(width * 0.5)), Math.max(256, Math.floor(height * 0.5)));
    this.bloomPass = new UnrealBloomPass(bloomSize, 0.16, 0.22, 1.15);
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

  /**
   * Balanced image-based reflection environment matching the circular chamber architecture.
   * Generates photorealistic specular reflections of the oculus, cove light, and neon lines onto the glossy epoxy floor.
   */
  private initImageBasedLighting(): void {
    const envScene = new THREE.Scene();

    // 1. Surrounding cylindrical white room shell
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.2, 5.0, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd9e2e8, side: THREE.BackSide }),
    );
    shell.position.y = 2.2;
    envScene.add(shell);

    // 2. Radiant circular oculus skylight disc at ceiling
    const oculus = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    oculus.position.y = 4.4;
    oculus.rotation.x = Math.PI / 2;
    envScene.add(oculus);

    // 3. Recessed circular cove halo ring
    const coveRing = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 3.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2e0, side: THREE.DoubleSide }),
    );
    coveRing.position.y = 4.3;
    coveRing.rotation.x = Math.PI / 2;
    envScene.add(coveRing);

    // 4. Vertical cyan light strips on walls
    for (const phi of [0.66, -0.66, 1.20, -1.22]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 3.2),
        new THREE.MeshBasicMaterial({ color: 0x64e5ff, side: THREE.DoubleSide }),
      );
      strip.position.set(Math.sin(phi) * 8.1, 2.1, -Math.cos(phi) * 8.1);
      strip.rotation.y = -phi;
      envScene.add(strip);
    }

    // 5. Warm wall niche glow pads
    for (const phi of [0.92, -0.92]) {
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xffeedd, side: THREE.DoubleSide }),
      );
      pad.position.set(Math.sin(phi) * 8.0, 2.15, -Math.cos(phi) * 8.0);
      pad.rotation.y = -phi;
      envScene.add(pad);
    }

    // 6. Central glowing cyan table disc
    const tableDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x40d5ff, side: THREE.DoubleSide }),
    );
    tableDisc.position.y = 1.0;
    tableDisc.rotation.x = -Math.PI / 2;
    envScene.add(tableDisc);

    // 7. Balanced soft environmental fill
    envScene.add(new THREE.HemisphereLight(0xffffff, 0xc5d2dc, 0.45));
    const downKey = new THREE.DirectionalLight(0xffffff, 0.85);
    downKey.position.set(0, 7.0, 0.2);
    envScene.add(downKey);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.52;
    pmrem.dispose();
  }

  private initWorld(): void {
    this.lighting = new Lighting(this.scene);
    this.initImageBasedLighting();

    this.lab = new Laboratory();
    this.scene.add(this.lab.group);

    if (this.computeBridge) {
      TextureGenerator.bakeAllTexturesAsync(this.computeBridge)
        .then((textures) => {
          this.lab.updateFloorTextures(textures);
        })
        .catch((err) => {
          console.warn('[Engine] Async floor texture baking fallback:', err);
        });
    }

    this.holoTable = new HoloTable();
    this.scene.add(this.holoTable.group);

    this.holoStage = new HologramStage();
    this.scene.add(this.holoStage.group);

    // Mount two chemistry beakers symmetrically on sides of table (avoiding table center!)
    this.chemistryEngineLeft = new ChemistryEngine();
    this.chemistryEngineLeft.setComputeBridge(this.computeBridge);
    this.chemistryEngineRight = new ChemistryEngine();
    this.chemistryEngineRight.setComputeBridge(this.computeBridge);

    this.beakerLeft = new BeakerMesh();
    this.beakerLeft.restingPosition.set(-0.38, 0.998, 1.10);
    this.beakerLeft.setVisible(false, false);

    this.beakerRight = new BeakerMesh();
    this.beakerRight.restingPosition.set(0.38, 0.998, 1.10);
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
    this.reactionEffectsLeft.setComputeBridge(this.computeBridge);
    this.beakerLeft.group.add(this.reactionEffectsLeft.group);

    this.reactionEffectsRight = new ReactionEffects(this.beakerRight);
    this.reactionEffectsRight.setComputeBridge(this.computeBridge);
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

  private pourStreamVertexBuffer = new Float32Array(153 * 3);
  private isPourStreamWorkerBusy = false;

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
    const defaultCurve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, 0));
    const pooledGeo = new THREE.TubeGeometry(defaultCurve, 16, 0.007, 8, false);
    this.pourStreamMesh = new THREE.Mesh(pooledGeo, this.pourStreamMat);
    this.pourStreamMesh.visible = false;
    this.scene.add(this.pourStreamMesh);
  }

  private updatePourStream(startWorld: THREE.Vector3, endWorld: THREE.Vector3, color: THREE.Color): void {
    if (!this.pourStreamMesh || !this.pourStreamMat) return;
    if (!this.pourStreamVertexBuffer || this.pourStreamVertexBuffer.byteLength === 0) {
      this.pourStreamVertexBuffer = new Float32Array(153 * 3);
    }

    this.pourStreamMat.color.copy(color);

    const midWorld = startWorld.clone().lerp(endWorld, 0.45).add(new THREE.Vector3(0, 0.025, 0));

    if (this.computeBridge && !this.isPourStreamWorkerBusy) {
      this.isPourStreamWorkerBusy = true;
      this.computeBridge
        .generatePourStreamTube({
          startWorld: [startWorld.x, startWorld.y, startWorld.z],
          midWorld: [midWorld.x, midWorld.y, midWorld.z],
          endWorld: [endWorld.x, endWorld.y, endWorld.z],
          tubularSegments: 16,
          radialSegments: 8,
          radius: 0.007,
          vertexBuffer: this.pourStreamVertexBuffer,
        })
        .then((res: any) => {
          this.pourStreamVertexBuffer = res.vertexBuffer;
          if (this.pourStreamMesh) {
            const posAttr = this.pourStreamMesh.geometry.attributes.position as THREE.BufferAttribute;
            if (posAttr) {
              posAttr.copyArray(res.vertexBuffer);
              posAttr.needsUpdate = true;
              this.pourStreamMesh.geometry.computeVertexNormals();
            }
            this.pourStreamMesh.visible = true;
          }
        })
        .catch((err: any) => {
          console.warn('[Engine] Pour stream worker error:', err);
        })
        .finally(() => {
          this.isPourStreamWorkerBusy = false;
        });
    } else if (!this.computeBridge) {
      // Sync fallback for test environments
      const curve = new THREE.CatmullRomCurve3([startWorld, midWorld, endWorld]);
      this.pourStreamMesh.geometry.dispose();
      this.pourStreamMesh.geometry = new THREE.TubeGeometry(curve, 16, 0.007, 8, false);
      this.pourStreamMesh.visible = true;
    } else {
      this.pourStreamMesh.visible = true;
    }
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
          this.crosshair.setVisible(false);
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
        this.crosshair.setVisible(false);
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
        this.holoStage.clearExperiment(this.currentContext);
        this.currentExperimentId = null;
        this.hud.clearActiveExperiment();
        this.beakerLeft.setVisible(true, true);
        this.beakerRight.setVisible(true, true);
        if (this.renderer?.shadowMap?.enabled) {
          this.renderer.shadowMap.needsUpdate = true;
        }
      },
      onSelectPhysicsExperiment: async (id: string) => {
        this.beakerLeft.setVisible(false, true);
        this.beakerRight.setVisible(false, true);
        this.holoTable.showHologram();
        this.holoStage.setStageVisible(true);
        await this.switchExperiment(id);
      },
      onStirBeaker: () => {
        this.reactionEffects.triggerPour(0x0a84ff);
      },
      onSelectBeaker: (beakerId) => {
        this.activeBeakerId = beakerId;
      },
      onThermoTemperatureChange: (tempK) => {
        if (this.currentExperimentId === 'thermo-idealgas') {
          const val = Math.round(tempK);
          this.currentContext.setParameter('temperature', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.onParameterChange === 'function') {
            exp.onParameterChange('temperature', val, this.currentContext);
          }
        }
      },
      onThermoVolumeChange: (volL) => {
        if (this.currentExperimentId === 'thermo-idealgas') {
          const val = parseFloat(volL.toFixed(2));
          this.currentContext.setParameter('volume', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.onParameterChange === 'function') {
            exp.onParameterChange('volume', val, this.currentContext);
          }
        }
      },
      onCarnotTempHighChange: (tempK) => {
        if (this.currentExperimentId === 'thermo-carnot') {
          const val = Math.round(tempK);
          this.currentContext.setParameter('tempHigh', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setTempHigh === 'function') {
            exp.setTempHigh(val);
          }
        }
      },
      onCarnotTempLowChange: (tempK) => {
        if (this.currentExperimentId === 'thermo-carnot') {
          const val = Math.round(tempK);
          this.currentContext.setParameter('tempLow', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setTempLow === 'function') {
            exp.setTempLow(val);
          }
        }
      },
      onCarnotToggleRunning: () => {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.toggleRunning === 'function') {
          exp.toggleRunning();
        }
      },
      onCarnotToggleDirection: () => {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.toggleDirection === 'function') {
          exp.toggleDirection();
        }
      },
      onCarnotStepStage: (step) => {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.stepStage === 'function') {
          exp.stepStage(step);
        }
      },
      onCarnotApplyPreset: (preset) => {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.applyPreset === 'function') {
          exp.applyPreset(preset);
        }
      },
      // Thermo Conduction
      onCondTempHChange: (tempK: number) => {
        if (this.currentExperimentId === 'thermo-conduction') {
          const val = Math.round(tempK);
          this.currentContext.setParameter('heatSourceTemp', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setHeatSourceTemp === 'function') {
            exp.setHeatSourceTemp(val);
          }
        }
      },
      onCondTempCChange: (tempK: number) => {
        if (this.currentExperimentId === 'thermo-conduction') {
          const val = Math.round(tempK);
          this.currentContext.setParameter('coldSourceTemp', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setColdSourceTemp === 'function') {
            exp.setColdSourceTemp(val);
          }
        }
      },
      onCondMaterialChange: (material: string) => {
        if (this.currentExperimentId === 'thermo-conduction') {
          this.currentContext.setParameter('material', material);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setMaterial === 'function') {
            exp.setMaterial(material);
          }
        }
      },
      onCondInsulationChange: (insulated: boolean) => {
        if (this.currentExperimentId === 'thermo-conduction') {
          this.currentContext.setParameter('lateralInsulation', insulated);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setLateralInsulation === 'function') {
            exp.setLateralInsulation(insulated);
          }
        }
      },
      onCondProbeChange: (normX: number) => {
        if (this.currentExperimentId === 'thermo-conduction') {
          this.currentContext.setParameter('probePosition', normX);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setProbePosition === 'function') {
            exp.setProbePosition(normX);
          }
        }
      },
      onCondResetTransient: () => {
        if (this.currentExperimentId === 'thermo-conduction') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.resetTransient === 'function') {
            exp.resetTransient();
          }
        }
      },
      // Thermo Phase Transition
      onPhasePowerChange: (powerW: number) => {
        if (this.currentExperimentId === 'thermo-phase') {
          const val = Math.round(powerW);
          this.currentContext.setParameter('heatPower', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setHeatPower === 'function') {
            exp.setHeatPower(val);
          }
        }
      },
      onPhaseMassChange: (massG: number) => {
        if (this.currentExperimentId === 'thermo-phase') {
          const val = Math.round(massG);
          this.currentContext.setParameter('substanceMass', val);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setSubstanceMass === 'function') {
            exp.setSubstanceMass(val);
          }
        }
      },
      onPhaseToggleHeating: () => {
        if (this.currentExperimentId === 'thermo-phase') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.toggleHeating === 'function') {
            exp.toggleHeating();
          }
        }
      },
      onPhaseReset: () => {
        if (this.currentExperimentId === 'thermo-phase') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.resetExperiment === 'function') {
            exp.resetExperiment();
          }
        }
      },
      onPhaseAccelChange: (scale: number) => {
        if (this.currentExperimentId === 'thermo-phase') {
          this.currentContext.setParameter('timeAcceleration', scale);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setTimeAcceleration === 'function') {
            exp.setTimeAcceleration(scale);
          }
        }
      },
      // Stereometry Math Callbacks
      onMathModelChange: (type) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.setModelType?.(type);
        }
      },
      onMathDimensionChange: (dims) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.setDimensions?.(dims);
        }
      },
      onMathInteractionModeChange: (mode) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.setInteractionMode?.(mode);
        }
      },
      onMathResetView: (view) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.resetView?.(view);
        }
      },
      onMathClearSegments: () => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.clearAllSegments?.();
        }
      },
      onMathToggleDashedLines: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleDashedLines?.(show);
        }
      },
      onMathToggleCoordinateSystem: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleCoordinateSystem?.(show);
        }
      },
      onMathToggleEmbeddingBox: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleEmbeddingBox?.(show);
        }
      },
      onMathToggleCircumSphere: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleCircumSphere?.(show);
        }
      },
      onMathToggleInSphere: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleInSphere?.(show);
        }
      },
      onMathToggleClipping: (enabled) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleClipping?.(enabled);
        }
      },
      onMathExplodeDistanceChange: (dist) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.setExplodeDistance?.(dist);
        }
      },
      onMathUnfoldProgressChange: (progress) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.setUnfoldProgress?.(progress);
        }
      },
      onMathToggleThreeViews: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleThreeViews?.(show);
        }
      },
      onMathToggleMidpoints: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleMidpoints?.(show);
        }
      },
      onMathToggleFaceCenters: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleFaceCenters?.(show);
        }
      },
      onMathToggleLabels: (show) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.toggleLabels?.(show);
        }
      },
      onMathApplyPreset: (preset) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.applyClassicPreset?.(preset);
        }
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
      this.crosshair.setVisible(false);
      }
    };
  }

  public async switchExperiment(id: string): Promise<void> {
    const requestId = ++this.currentSwitchRequestId;
    this.hud.showTransition(true, '全息粒子解聚与参数重构...');

    // Guarantee holographic stage is active and clean table surface for 3D hardware
    this.holoStage.setStageVisible(true);
    this.holoTable.hideHologram(true);
    this.beakerLeft.setVisible(false, true);
    this.beakerRight.setVisible(false, true);
    this.reactionEffectsLeft?.reset();
    this.reactionEffectsRight?.reset();

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
      this.visionModal.setCurrentExperimentId(id);
      this.hud.setActiveExperiment(experiment, this.currentContext);
      this.holoStage.setStageVisible(true);
      if (this.renderer?.shadowMap?.enabled) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    } catch (err: any) {
      console.error('[Engine] Failed to switch experiment:', err);
      if (typeof window !== 'undefined') {
        (window as any).__LAST_ENGINE_ERROR__ = {
          message: err?.message || String(err),
          stack: err?.stack || ''
        };
      }
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

  public clearExperiment(): void {
    if (this.holoStage) {
      this.holoStage.clearExperiment(this.currentContext);
    }
    this.beakerLeft?.setVisible(false, true);
    this.beakerRight?.setVisible(false, true);
    this.reactionEffectsLeft?.reset();
    this.reactionEffectsRight?.reset();
    this.currentExperimentId = null;
    this.holoTable?.hideHologram(true);
    this.hud?.clearActiveExperiment();
    if (this.renderer?.shadowMap?.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private async initDefaultExperiment(): Promise<void> {
    try {
      const registry = ExperimentRegistry.getInstance();
      const all = registry.getAll();
      if (typeof window !== 'undefined') {
        (window as any).__REGISTRY_COUNT__ = all.length;
        (window as any).__REGISTRY_ALL__ = all.map(e => e.id);
      }
      // Per user requirement: 进入实验室后，没选择实验，桌上就不要有实验器材
      // Keep holographic stage and beakers hidden, table remains clean in standby mode.
      this.holoStage.setStageVisible(false);
      this.holoTable.hideHologram(true);
      this.beakerLeft.setVisible(false, false);
      this.beakerRight.setVisible(false, false);
      this.currentExperimentId = null;

      // Pre-warm and compile beaker shaders and textures at startup to eliminate frame hitch on initial chemistry click
      if (this.renderer && this.scene && this.camera && this.beakerLeft && this.beakerRight) {
        this.beakerLeft.setVisible(true, false);
        this.beakerRight.setVisible(true, false);
        if (this.renderer.shadowMap.enabled) {
          this.renderer.shadowMap.needsUpdate = true;
        }
        this.renderer.render(this.scene, this.camera);
        this.beakerLeft.setVisible(false, false);
        this.beakerRight.setVisible(false, false);
      }
      if (typeof window !== 'undefined') {
        (window as any).__ENGINE_READY__ = true;
      }
    } catch (err: any) {
      console.error('[Engine] Failed in initDefaultExperiment:', err);
      if (typeof window !== 'undefined') {
        (window as any).__INIT_ERROR__ = {
          message: err?.message || String(err),
          stack: err?.stack || ''
        };
      }
    }
  }

  private getInteractiveBeakerAt(screenPos: THREE.Vector2): 'left' | 'right' | null {
    this.raycaster.setFromCamera(screenPos, this.camera);
    const ray = this.raycaster.ray;

    if (this.beakerLeft && this.beakerLeft.isInteractive()) {
      const center = this.beakerLeft.group.position.clone().add(new THREE.Vector3(0, this.beakerLeft.beakerHeight * 0.5, 0));
      const sphere = new THREE.Sphere(center, 0.25);
      if (ray.intersectsSphere(sphere)) {
        const leftHits = this.raycaster.intersectObjects(this.beakerLeft.getInteractiveMeshes(), true);
        if (leftHits.length > 0 && leftHits[0].distance < 8.0) {
          return 'left';
        }
      }
    }

    if (this.beakerRight && this.beakerRight.isInteractive()) {
      const center = this.beakerRight.group.position.clone().add(new THREE.Vector3(0, this.beakerRight.beakerHeight * 0.5, 0));
      const sphere = new THREE.Sphere(center, 0.25);
      if (ray.intersectsSphere(sphere)) {
        const rightHits = this.raycaster.intersectObjects(this.beakerRight.getInteractiveMeshes(), true);
        if (rightHits.length > 0 && rightHits[0].distance < 8.0) {
          return 'right';
        }
      }
    }

    return null;
  }

  private getInteractiveTargetAt(screenPos: THREE.Vector2): 'beaker-left' | 'beaker-right' | 'beaker' | 'holo-table' | null {
    this.raycaster.setFromCamera(screenPos, this.camera);

    const beaker = this.getInteractiveBeakerAt(screenPos);
    if (beaker === 'left') return 'beaker-left';
    if (beaker === 'right') return 'beaker-right';

    // When no experiment is mounted and beakers are hidden/non-interactive, the standby holographic table is interactive
    if (!this.currentExperimentId && (!this.beakerLeft || !this.beakerLeft.isInteractive())) {
      if (this.holoTable && this.holoTable.isHologramVisible()) {
        const hits = this.raycaster.intersectObjects(this.holoTable.getInteractiveMeshes(), true);
        if (hits.length > 0 && hits[0].distance < 8.0) {
          return 'holo-table';
        }
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

    // 3D Pointer interactions (Single-click Reagent Select & Long-press Drag & Pour)
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.visionModal && this.visionModal.visible) {
        if (e.target !== canvas) return;
      }

      const mouseNDC = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

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

      // If no experiment or beaker is active, clicking the holographic table opens VisionModal
      if (!this.currentExperimentId && (!this.beakerLeft || !this.beakerLeft.isInteractive())) {
        if (this.holoTable && this.holoTable.isHologramVisible()) {
          this.raycaster.setFromCamera(mouseNDC, this.camera);
          const tableHits = this.raycaster.intersectObjects(this.holoTable.getInteractiveMeshes(), true);
          if (tableHits.length > 0 && tableHits[0].distance < 8.0) {
            e.stopPropagation();
            this.visionModal.open('disciplines');
            return;
          }
        }
      }

      // Forward 3D interaction to active experiment on hologram stage
      if (this.holoStage.activeExperiment?.onPointerDown) {
        this.raycaster.setFromCamera(mouseNDC, this.camera);
        const hits = this.raycaster.intersectObjects(this.holoStage.activeExperiment.rootGroup.children, true);
        for (const hit of hits) {
          const handled = this.holoStage.activeExperiment.onPointerDown(e, hit, this.currentContext);
          if (handled) {
            e.stopPropagation();
            this.isExperimentInteracting = true;
            this.inputManager.player.enabled = false;
            this.inputManager.player.allowPointerLock = false;
            this.inputManager.player.exitLock();
            return;
          }
        }
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

      if (this.isExperimentInteracting && this.holoStage.activeExperiment?.onPointerMove) {
        const mouseNDC = new THREE.Vector2(
          (e.clientX / window.innerWidth) * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1
        );
        this.raycaster.setFromCamera(mouseNDC, this.camera);
        const hits = this.raycaster.intersectObjects(this.holoStage.activeExperiment.rootGroup.children, true);
        const hit = hits.length > 0 ? hits[0] : null;
        this.holoStage.activeExperiment.onPointerMove(e, hit, this.currentContext);
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
      if (this.isExperimentInteracting) {
        this.isExperimentInteracting = false;
        this.holoStage.activeExperiment?.onPointerUp?.(e, this.currentContext);
        this.inputManager.player.enabled = true;
        this.inputManager.player.allowPointerLock = true;
        if (this.crosshair && (!this.visionModal || !this.visionModal.visible)) {
          this.crosshair.setVisible(false);
        }
      }

      if (!this.beakerDragState) return;

      const state = this.beakerDragState;
      this.beakerDragState = null;
      this.inputManager.player.enabled = true;
      if (this.crosshair && (!this.visionModal || !this.visionModal.visible)) {
        this.crosshair.setVisible(false);
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
    } else if (targetType === 'holo-table') {
      label = '全息实验台 · 单击选择实验';
    }

    // If not hovering a beaker, query active experiment for hoverable equipment
    if (!hovered && this.holoStage.activeExperiment?.getHoverTarget) {
      const screenPos = (!isPointerLocked && this.lastPointerPos) ? this.lastPointerPos : this.centerScreen;
      this.raycaster.setFromCamera(screenPos, this.camera);
      const expHover = this.holoStage.activeExperiment.getHoverTarget(this.raycaster);
      if (expHover) {
        this.currentHoveredTarget = expHover.id;
        this.crosshair.setHovered(true, expHover.label);
        if (this.renderer?.domElement) {
          this.renderer.domElement.style.cursor = expHover.cursor || 'pointer';
        }
        return;
      }
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
      this.holoTable.setHovered(targetType === 'holo-table');
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
      if (isModalOpen && this.visionModal.currentTab === 'thermo') {
        const nowMs = performance.now();
        if (nowMs - this.lastThermoTelemetrySync >= 50) {
          this.lastThermoTelemetrySync = nowMs;
          const exp = this.holoStage.activeExperiment as any;
          if (this.currentExperimentId === 'thermo-carnot' && typeof exp?.getCarnotTelemetry === 'function') {
            this.visionModal.carnotCard.updateTelemetry(exp.getCarnotTelemetry());
          } else if (this.currentExperimentId === 'thermo-conduction' && typeof exp?.getConductionTelemetry === 'function') {
            this.visionModal.conductionCard.updateTelemetry(exp.getConductionTelemetry());
          } else if (this.currentExperimentId === 'thermo-phase' && typeof exp?.getPhaseTelemetry === 'function') {
            this.visionModal.phaseCard.updateTelemetry(exp.getPhaseTelemetry());
          } else if (exp && typeof exp.getThermodynamicTelemetry === 'function') {
            this.visionModal.thermoCard.updateTelemetry(exp.getThermodynamicTelemetry());
          }
        }
      } else if (isModalOpen && this.visionModal.currentTab === 'math') {
        const nowMs = performance.now();
        if (nowMs - this.lastThermoTelemetrySync >= 50) {
          this.lastThermoTelemetrySync = nowMs;
          const exp = this.holoStage.activeExperiment as any;
          if (this.currentExperimentId === 'math-stereometry' && typeof exp?.getStereometryTelemetry === 'function') {
            this.visionModal.stereometryCard.updateTelemetry(exp.getStereometryTelemetry());
          }
        }
      }
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
    if (this.beakerLeft && (this.beakerLeft.group.visible || this.beakerLeft.isVisible())) {
      this.beakerLeft.update(delta);
      if (this.reactionEffectsLeft && this.chemistryEngineLeft && this.beakerLeft.isVisible()) {
        this.reactionEffectsLeft.update(delta, this.chemistryEngineLeft.state);
      }
    }

    if (this.beakerRight && (this.beakerRight.group.visible || this.beakerRight.isVisible())) {
      this.beakerRight.update(delta);
      if (this.reactionEffectsRight && this.chemistryEngineRight && this.beakerRight.isVisible()) {
        this.reactionEffectsRight.update(delta, this.chemistryEngineRight.state);
      }
    }

    if (this.hud) {
      this.hud.update(delta);
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
