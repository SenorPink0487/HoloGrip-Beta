import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { Laboratory } from '../scene/Laboratory.ts';
import { HoloTable } from '../scene/HoloTable.ts';
import { Lighting } from '../scene/Lighting.ts';
import { TextureGenerator } from '../scene/Textures.ts';
import { HologramStage } from './HologramStage.ts';
import { InputManager } from '../controls/InputManager.ts';
import { WorkerPool } from '../workers/WorkerPool.ts';
import { ComputeBridge } from './platform/ComputeBridge.ts';
import { ExperimentRegistry } from '../experiments/ExperimentRegistry.ts';
import { HUD } from '../ui/HUD.ts';
import { Crosshair } from '../ui/Crosshair.ts';
import { ChemistryEngine } from '../chemistry/ChemistryEngine.ts';
import { BeakerMesh } from '../scene/BeakerMesh.ts';
import { ReactionEffects } from '../scene/ReactionEffects.ts';
import {
  POUR_EXIT_SPEED,
  POUR_GRAVITY,
  POUR_LIP_CLEARANCE,
  POUR_STREAM_RADIAL,
  POUR_STREAM_RINGS,
  POUR_TILT,
  composePourStream,
  ellipticTubeIndices,
  lipGoalForPour,
  lipOutwardFromTilt,
  writeEllipticTube,
  type StreamSample,
} from '../chemistry/pourKinematics.ts';
import { VisionModal } from '../ui/vision/VisionModal.ts';
import type { ExperimentContext, IExperiment } from './types.ts';
import {
  advanceLabEntry,
  createLabEntryClock,
  labEntryPose,
  type LabEntryClock,
  type LabEntryFrame,
} from '../controls/labEntry.ts';
import {
  advanceLabReturn,
  createLabReturnClock,
  type LabReturnClock,
} from '../controls/labReturn.ts';
import { blurActiveInput, isTextInputActive, isTextInputElement, isElementVisibleAndActive } from './focus.ts';
import { HandGestureService, VisionProCursor, HandTrackingHUD } from '../vision/index.ts';

const _BEAKER_DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.10);
const _BEAKER_HIT_POINT = new THREE.Vector3();

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
  public handGestureService: HandGestureService | null = null;
  public visionProCursor: VisionProCursor | null = null;
  public handTrackingHUD: HandTrackingHUD | null = null;

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

  // 烧杯间倾倒与流体动力学
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
    lipAim: THREE.Vector3 | null;
  } | null = null;

  private raycaster = new THREE.Raycaster();
  private centerScreen = new THREE.Vector2(0, 0);
  private lastPointerPos: THREE.Vector2 | null = null;
  private currentHoveredTarget: string | null = null;
  private isExperimentInteracting = false;
  private lastThermoTelemetrySync = 0;
  private lastMathTelemetrySync = 0;
  private lastEmTelemetrySync = 0;
  private lastMechTelemetrySync = 0;
  private lastCss3dCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastCss3dCamQuat = new THREE.Quaternion(Infinity, Infinity, Infinity, Infinity);
  private lastCss3dWinPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastCss3dWinRotY = Infinity;
  private lastCss3dWinScale = 1.0;
  private lastCss3dVisible = false;
  private spatialWindowTargetPos = new THREE.Vector3(0, 2.20, 0);
  private spatialWindowTargetRotY = 0;

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
    this.initHandTracking();
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
    // 在高分屏上将像素比限制为 1.5，避免 GPU 填充率耗尽
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    // 将透射渲染目标降采样 50%（减少 75% 的 GPU 填充率与 Mipmap 占用）
    (this.renderer as any).transmissionResolutionScale = 0.5;

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
    // 60° 视场角（FOV）提供自然无畸变的电影级视角
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
  }

  // 使用硬件 MSAA 的原生 WebGL 管线，清晰锐利，防止辉光过度曝光雾化
  public isPostProcessingActive = false;

  private initPostProcessing(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 提高阈值（1.15）确保仅超高亮自发光泛光，避免白色建筑过曝
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
   * 匹配圆形实验室结构的平衡反射贴图环境。
   * 在环氧树脂地坪上生成天顶天窗、暗槽灯与霓虹线条的真实镜面反射。
   */
  private initImageBasedLighting(): void {
    const envScene = new THREE.Scene();

    // 1. 周围圆柱形白色室体外壳
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.2, 5.0, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd9e2e8, side: THREE.BackSide }),
    );
    shell.position.y = 2.2;
    envScene.add(shell);

    // 2. 天花板圆形发光天窗
    const oculus = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    oculus.position.y = 4.4;
    oculus.rotation.x = Math.PI / 2;
    envScene.add(oculus);

    // 3. 顶部嵌入式环形灯槽
    const coveRing = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 3.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2e0, side: THREE.DoubleSide }),
    );
    coveRing.position.y = 4.3;
    coveRing.rotation.x = Math.PI / 2;
    envScene.add(coveRing);

    // 4. 墙面垂直青色灯带
    for (const phi of [0.66, -0.66, 1.20, -1.22]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 3.2),
        new THREE.MeshBasicMaterial({ color: 0x64e5ff, side: THREE.DoubleSide }),
      );
      strip.position.set(Math.sin(phi) * 8.1, 2.1, -Math.cos(phi) * 8.1);
      strip.rotation.y = -phi;
      envScene.add(strip);
    }

    // 5. 墙壁壁龛暖色发光板
    for (const phi of [0.92, -0.92]) {
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xffeedd, side: THREE.DoubleSide }),
      );
      pad.position.set(Math.sin(phi) * 8.0, 2.15, -Math.cos(phi) * 8.0);
      pad.rotation.y = -phi;
      envScene.add(pad);
    }

    // 6. 中央全息台青色发光圆盘
    const tableDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x40d5ff, side: THREE.DoubleSide }),
    );
    tableDisc.position.y = 1.0;
    tableDisc.rotation.x = -Math.PI / 2;
    envScene.add(tableDisc);

    // 7. 平衡柔和的环境补光
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

    // 在实验台两侧对称放置两只化学烧杯（避开实验台中心）
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

    // 调用 setVisible 时保持可见性同步
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

  private pourStreamPositions = new Float32Array(POUR_STREAM_RINGS * (POUR_STREAM_RADIAL + 1) * 3);
  private pourStreamPhase = 0;

  private initPourStreamMesh(): void {
    this.pourStreamMat = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.035,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      reflectivity: 0.9,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pourStreamPositions, 3));
    geo.setIndex(new THREE.BufferAttribute(ellipticTubeIndices(POUR_STREAM_RINGS, POUR_STREAM_RADIAL), 1));
    this.pourStreamMesh = new THREE.Mesh(geo, this.pourStreamMat);
    this.pourStreamMesh.visible = false;
    this.pourStreamMesh.frustumCulled = false;
    this.pourStreamMesh.renderOrder = 4;
    this.scene.add(this.pourStreamMesh);
  }

  private writePourStream(samples: StreamSample[], color: THREE.Color): void {
    if (!this.pourStreamMesh || !this.pourStreamMat) return;
    if (samples.length !== POUR_STREAM_RINGS) return;
    writeEllipticTube(samples, POUR_STREAM_RADIAL, this.pourStreamPositions);
    const posAttr = this.pourStreamMesh.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    this.pourStreamMesh.geometry.computeVertexNormals();
    this.pourStreamMat.color.copy(color);
    this.pourStreamMesh.visible = true;
  }

  private stepBeakerPour(
    state: {
      sourceId: 'left' | 'right';
      targetId: 'left' | 'right';
      sourceMesh: BeakerMesh;
      targetMesh: BeakerMesh;
      sourceEngine: ChemistryEngine;
      targetEngine: ChemistryEngine;
      targetTilt: number;
      lastPouredVolume: number;
      lipAim: THREE.Vector3 | null;
    },
    delta: number,
  ): void {
    const direction = state.sourceId === 'left' ? 'right' : 'left';
    const source = state.sourceMesh;
    const target = state.targetMesh;
    const mouth = target.getMouthWorldPosition();
    const surfaceY = target.getLiquidSurfaceWorldY();
    const parent = source.group.parent;
    const outwardLocal = lipOutwardFromTilt(state.targetTilt, direction);
    const outward = new THREE.Vector3(outwardLocal.x, outwardLocal.y, outwardLocal.z);
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion();
      parent.getWorldQuaternion(q);
      outward.applyQuaternion(q);
    }
    const goal = lipGoalForPour({
      outward: { x: outward.x, y: outward.y, z: outward.z },
      mouth: { x: mouth.x, y: mouth.y, z: mouth.z },
      surfaceY,
      clearance: POUR_LIP_CLEARANCE,
      exitSpeed: POUR_EXIT_SPEED,
      gravity: POUR_GRAVITY,
    });

    const goalPoint = new THREE.Vector3(goal.x, goal.y, goal.z);
    if (!state.lipAim) state.lipAim = source.getGlassLipWorld(direction).clone();
    state.lipAim.lerp(goalPoint, 1 - Math.exp(-Math.max(0, delta) * 6));
    source.placeLipAt(state.lipAim, direction);
    const lipSettled = state.lipAim.distanceTo(goalPoint) < 0.04;
    const volume = state.sourceEngine.state.volume;
    this.updatePourVolumeBadge(source, volume);

    const room = state.targetEngine.state.maxVolume - state.targetEngine.state.volume;
    if (!source.isSpilling() || !lipSettled || volume <= 0.4 || room <= 0.4) {
      this.hidePourStream();
      return;
    }

    this.pourStreamPhase += delta;
    const approach = source.getPourApproachWorld();
    const liveOut = source.getPourOutwardWorld();
    const samples = composePourStream({
      approach: approach.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      outward: { x: liveOut.x, y: liveOut.y, z: liveOut.z },
      surfaceY,
      targetX: mouth.x,
      targetZ: mouth.z,
      targetRadius: target.beakerRadius,
      gravity: POUR_GRAVITY,
      exitSpeed: POUR_EXIT_SPEED,
      phase: this.pourStreamPhase,
    });
    if (!samples) {
      this.hidePourStream();
      return;
    }

    const hit = samples[samples.length - 1];
    if (Math.hypot(hit.x - mouth.x, hit.z - mouth.z) > target.beakerRadius * 0.9) {
      this.hidePourStream();
      return;
    }

    this.writePourStream(samples, source.liquidColor);

    const rate = 22 + Math.min(38, source.getPourOverflow() * 280);
    const transferAmt = Math.min(volume, Math.max(0, room), rate * delta);
    if (transferAmt > 0.02 && room > 0.4) {
      state.targetEngine.mixFrom(state.sourceEngine, transferAmt);
      state.lastPouredVolume += transferAmt;
      const effects = state.targetId === 'left' ? this.reactionEffectsLeft : this.reactionEffectsRight;
      if (effects) {
        const localHit = target.group.worldToLocal(new THREE.Vector3(hit.x, hit.y, hit.z));
        effects.setPourImpact(localHit.x, localHit.z);
        effects.triggerPour(source.liquidColor.getHex());
      }
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

    const topWorld = beaker.getMouthWorldPosition();
    topWorld.y += 0.1;
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
          this.inputManager.player.allowPointerLock = (this.currentExperimentId !== 'math-stereometry');
          if (!this.labEntryActive && !this.isWhiteboardMode && this.currentExperimentId !== 'math-stereometry') {
            this.crosshair.setVisible(true);
          }
        }
      }
    };

    this.crosshair = new Crosshair();
  }

  private updateSpatialWindowTransform(delta: number, snap = false): void {
    if (!this.spatialWindowObject || !this.visionModal || !this.visionModal.visible || !this.camera) {
      return;
    }

    const targetX = this.spatialWindowTargetPos.x;
    const targetY = this.spatialWindowTargetPos.y;
    const targetZ = this.spatialWindowTargetPos.z;

    // 位于实验台中心时，沿 Y 轴动态朝向用户视角
    let targetRotY = this.spatialWindowTargetRotY;
    if (Math.hypot(targetX, targetZ) < 1e-3) {
      const dx = this.camera.position.x - targetX;
      const dz = this.camera.position.z - targetZ;
      if (Math.hypot(dx, dz) > 1e-4) {
        targetRotY = Math.atan2(dx, dz);
        this.spatialWindowTargetRotY = targetRotY;
      }
    }

    // 保持视窗严格直立（俯仰角与翻滚角均为 0），仅沿 Y 轴朝向用户
    if (snap) {
      this.spatialWindowObject.position.set(targetX, targetY, targetZ);
      this.spatialWindowObject.rotation.set(0, targetRotY, 0);
    } else {
      const lerpSpeed = Math.min(1.0, delta * 7.0);
      const pos = this.spatialWindowObject.position;
      const rot = this.spatialWindowObject.rotation;

      if (pos.distanceTo(this.spatialWindowTargetPos) > 1e-4) {
        pos.x = THREE.MathUtils.lerp(pos.x, targetX, lerpSpeed);
        pos.y = THREE.MathUtils.lerp(pos.y, targetY, lerpSpeed);
        pos.z = THREE.MathUtils.lerp(pos.z, targetZ, lerpSpeed);
      }

      // 处理角度循环跨越（Wrap-around），确保平滑旋转
      let diffY = targetRotY - rot.y;
      while (diffY < -Math.PI) diffY += Math.PI * 2;
      while (diffY > Math.PI) diffY -= Math.PI * 2;
      if (Math.abs(diffY) > 1e-4) {
        rot.y += diffY * lerpSpeed;
      }
      rot.x = 0;
      rot.z = 0;
    }
  }

  /**
   * 将空间浮动视窗置于默认位置：悬浮于全息实验台中央
   * （x = 0, y = 2.20, z = 0）并正对摄像机。
   */
  public positionWindowAtTableCenter(snap = true): void {
    const cam = this.camera;
    const targetX = 0;
    const targetY = 2.20;
    const targetZ = 0;

    let angleY = 0;
    if (cam) {
      const dx = cam.position.x - targetX;
      const dz = cam.position.z - targetZ;
      if (Math.hypot(dx, dz) > 1e-4) {
        angleY = Math.atan2(dx, dz);
      }
    }

    this.spatialWindowTargetPos.set(targetX, targetY, targetZ);
    this.spatialWindowTargetRotY = angleY;

    this.updateSpatialWindowTransform(0.1, snap);
    this.lastCss3dCamPos.set(Infinity, Infinity, Infinity);
  }

  public positionWindowDefault(snap = true): void {
    this.positionWindowAtTableCenter(snap);
  }

  public positionWindowInFrontOfCamera(snap = true): void {
    const cam = this.camera;
    if (!cam) return;

    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // 计算水平前向矢量以保持视窗完全直立
    const forwardX = dir.x;
    const forwardZ = dir.z;
    const horizontalLen = Math.hypot(forwardX, forwardZ) || 1e-4;
    const normForwardX = forwardX / horizontalLen;
    const normForwardZ = forwardZ / horizontalLen;

    // 将视窗置于摄像机视线正前方 2.2 米且与视线等高处
    const distance = 2.2;
    const targetX = cam.position.x + normForwardX * distance;
    const targetZ = cam.position.z + normForwardZ * distance;
    const targetY = Math.max(0.95, Math.min(2.6, cam.position.y + dir.y * 1.0));

    // 调整 Y 轴朝向，使 CSS3DObject 正面（+Z）指向摄像机
    const angleY = Math.atan2(cam.position.x - targetX, cam.position.z - targetZ);

    this.spatialWindowTargetPos.set(targetX, targetY, targetZ);
    this.spatialWindowTargetRotY = angleY;

    this.updateSpatialWindowTransform(0.1, snap);
    this.lastCss3dCamPos.set(Infinity, Infinity, Infinity);
  }

  private initVisionOS(): void {
    this.visionModal = new VisionModal(this.chemistryEngine, {
      onClose: () => {
        this.spatialWindowObject.visible = false;
        this.inputManager?.touch?.setVisionModalOpen(false);
        this.lab?.setObservationWindowVisible(true);
        this.inputManager.player.allowPointerLock = (this.currentExperimentId !== 'math-stereometry');
        if (!this.labEntryActive && !this.isWhiteboardMode && (!this.hud?.drawer || !this.hud.drawer.open) && this.currentExperimentId !== 'math-stereometry') {
          this.crosshair.setVisible(true);
        }
        this.isExperimentInteracting = false;
        const exp = this.holoStage?.activeExperiment as any;
        exp?.clearHover?.();
      },
      onOpen: () => {
        this.positionWindowDefault(true);
        this.spatialWindowObject.visible = true;
        this.inputManager?.touch?.setVisionModalOpen(true);
        this.lab?.setObservationWindowVisible(false);
        this.inputManager.player.exitLock();
        this.inputManager.player.allowPointerLock = false;
        this.crosshair.setVisible(false);
        this.isExperimentInteracting = false;
        const exp = this.holoStage?.activeExperiment as any;
        exp?.clearHover?.();
      },
      onRecenter: () => {
        this.positionWindowDefault(true);
      },
      onScaleChange: (multiplier: number) => {
        const baseScale = 0.0028;
        const s = baseScale * multiplier;
        this.spatialWindowObject.scale.set(s, s, s);
      },
      onSelectChemistry: () => {
        const baseScale = 0.0028;
        this.spatialWindowObject.scale.set(baseScale, baseScale, baseScale);
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
        const baseScale = 0.0028;
        this.spatialWindowObject.scale.set(baseScale, baseScale, baseScale);
        this.positionWindowDefault(true);
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
      // 热学热传导
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
      // 热学相变
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
      // 电磁学霍尔效应回调
      onHallMagFieldChange: (bTesla: number) => {
        if (this.currentExperimentId === 'em-hall') {
          this.currentContext.setParameter('magField', bTesla);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setMagField === 'function') {
            exp.setMagField(bTesla);
          }
        }
      },
      onHallCurrentChange: (currentMa: number) => {
        if (this.currentExperimentId === 'em-hall') {
          this.currentContext.setParameter('current', currentMa);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setCurrent === 'function') {
            exp.setCurrent(currentMa);
          }
        }
      },
      onHallThicknessChange: (thicknessMm: number) => {
        if (this.currentExperimentId === 'em-hall') {
          this.currentContext.setParameter('thickness', thicknessMm);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setThickness === 'function') {
            exp.setThickness(thicknessMm);
          }
        }
      },
      onHallMaterialChange: (materialKey: string) => {
        if (this.currentExperimentId === 'em-hall') {
          this.currentContext.setParameter('material', materialKey);
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.applyMaterial === 'function') {
            exp.applyMaterial(materialKey);
          }
        }
      },
      onHallCarrierConcentrationChange: (n: number) => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setCarrierConcentration === 'function') {
            exp.setCarrierConcentration(n);
          }
        }
      },
      onHallCarrierChargeToggle: () => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.toggleCarrierCharge === 'function') {
            exp.toggleCarrierCharge();
          }
        }
      },
      onHallMobilityChange: (mu: number) => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setMobility === 'function') {
            exp.setMobility(mu);
          }
        }
      },
      onHallToggleFieldPolarity: () => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.toggleFieldPolarity === 'function') {
            exp.toggleFieldPolarity();
          }
        }
      },
      onHallToggleCurrentPolarity: () => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.toggleCurrentPolarity === 'function') {
            exp.toggleCurrentPolarity();
          }
        }
      },
      onHallToggleVectors: (show: boolean) => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setToggles === 'function') {
            exp.setToggles(show, exp.getTelemetryData().showParticles);
          }
        }
      },
      onHallToggleParticles: (show: boolean) => {
        if (this.currentExperimentId === 'em-hall') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.setToggles === 'function') {
            exp.setToggles(exp.getTelemetryData().showVectors, show);
          }
        }
      },
      onMassSpecCommand: (cmd) => {
        if (this.currentExperimentId !== 'em-mass-spec') return;
        const exp = this.holoStage?.activeExperiment as any;
        if (!exp) return;
        if (cmd.type === 'sample') {
          this.currentContext.setParameter('sample', cmd.id);
          exp.setSample?.(cmd.id);
        } else if (cmd.type === 'accel') {
          this.currentContext.setParameter('accelVoltage', cmd.voltage);
          exp.setAccel?.(cmd.voltage);
        } else if (cmd.type === 'field') {
          this.currentContext.setParameter('analyzerField', cmd.tesla);
          exp.setAnalyzerMagnitude?.(cmd.tesla);
        } else if (cmd.type === 'jaw') {
          this.currentContext.setParameter('jaw', cmd.opening);
          exp.setJaw?.(cmd.opening);
        } else if (cmd.type === 'plate') {
          this.currentContext.setParameter('plateVoltage', cmd.voltage);
          exp.setPlate?.(cmd.voltage);
        } else if (cmd.type === 'flip') exp.flipAnalyzer?.();
        else if (cmd.type === 'reset') exp.resetGolden?.();
      },
      onHysteresisCommand: (cmd) => {
        if (this.currentExperimentId !== 'em-hysteresis') return;
        const exp = this.holoStage?.activeExperiment as any;
        if (!exp) return;
        if (cmd.type === 'material') {
          this.currentContext.setParameter('material', cmd.id);
          exp.setMaterial?.(cmd.id);
        } else if (cmd.type === 'field') {
          this.currentContext.setParameter('fieldH', cmd.H);
          exp.setH?.(cmd.H);
        } else if (cmd.type === 'sweep') exp.setAuto?.(!exp.getTelemetry?.().auto);
        else if (cmd.type === 'reset') exp.resetGolden?.();
      },
      onFieldCommand: (cmd) => {
        if (this.currentExperimentId !== 'em-field') return;
        const exp = this.holoStage?.activeExperiment as any;
        if (!exp) return;
        if (cmd.type === 'addCharge') exp.addCharge?.(cmd.q);
        else if (cmd.type === 'removeCharge') exp.removeCharge?.(cmd.id);
        else if (cmd.type === 'clearCharges') exp.clearCharges?.();
        else if (cmd.type === 'selectCharge') exp.selectCharge?.(cmd.id);
        else if (cmd.type === 'setChargeMagnitude') exp.setSelectedChargeMagnitude?.(cmd.q);
        else if (cmd.type === 'setPreset') exp.loadPreset?.(cmd.presetKey);
        else if (cmd.type === 'toggleLines') exp.setToggles?.(cmd.show, exp.showFlow);
        else if (cmd.type === 'toggleFlow') exp.setToggles?.(exp.showLines, cmd.show);
        else if (cmd.type === 'setDensity') exp.setDensity?.(cmd.density);
        else if (cmd.type === 'reset') exp.resetGolden?.();
      },
      onInductionCommand: (cmd) => {
        if (this.currentExperimentId !== 'em-induction') return;
        const exp = this.holoStage?.activeExperiment as any;
        if (!exp) return;
        if (cmd.type === 'turns') {
          this.currentContext.setParameter('turns', cmd.turns);
          exp.setTurns?.(cmd.turns);
        } else if (cmd.type === 'resistance') {
          this.currentContext.setParameter('resistance', cmd.ohm);
          exp.setResistance?.(cmd.ohm);
        } else if (cmd.type === 'axial') {
          this.currentContext.setParameter('axial', cmd.axial);
          exp.setAxial?.(cmd.axial);
        } else if (cmd.type === 'probe') {
          this.currentContext.setParameter('probe', cmd.axial);
          exp.setProbe?.(cmd.axial);
        } else if (cmd.type === 'flip') {
          exp.flipPole?.();
        } else if (cmd.type === 'pass') {
          exp.startPass?.();
        } else if (cmd.type === 'reset') {
          exp.resetGolden?.();
        }
      },
      onGeneratorCommand: (cmd) => {
        if (this.currentExperimentId !== 'em-generator') return;
        const exp = this.holoStage?.activeExperiment as any;
        if (!exp) return;
        if (cmd.type === 'outputType') {
          this.currentContext.setParameter('outputType', cmd.outputType);
          exp.setOutputType?.(cmd.outputType);
        } else if (cmd.type === 'magField') {
          this.currentContext.setParameter('magField', cmd.field);
          exp.setMagField?.(cmd.field);
        } else if (cmd.type === 'turns') {
          this.currentContext.setParameter('turns', cmd.turns);
          exp.setTurns?.(cmd.turns);
        } else if (cmd.type === 'boost') {
          exp.boostSpeed?.();
        } else if (cmd.type === 'toggleBulb') {
          exp.toggleBulb?.();
        } else if (cmd.type === 'reset') {
          exp.reset?.();
        }
      },
      // 立体几何数学回调
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
      onMathZoom: (dir) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.zoom?.(dir);
        }
      },
      onMathResetScale: () => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          exp?.resetScale?.();
        }
      },
      onMathRecognizeImage: (dataUrl: string) => {
        const exp = this.holoStage?.activeExperiment as any;
        if (this.currentExperimentId !== 'math-stereometry' || typeof exp?.recognizeProblemImage !== 'function') {
          return Promise.reject(new Error('请先打开立体几何'));
        }
        return exp.recognizeProblemImage(dataUrl);
      },
    });

    this.visionModal.setEngines(this.chemistryEngineLeft, this.chemistryEngineRight, 'left');

    // 将 3D 空间视窗直接挂载至 Three.js 3D 场景中
    this.spatialWindowObject = new CSS3DObject(this.visionModal.element);
    this.spatialWindowObject.rotation.order = 'YXZ';
    this.spatialWindowObject.scale.set(0.0028, 0.0028, 0.0028);
    this.positionWindowDefault(true);
    this.spatialWindowObject.visible = false;
    this.css3dScene.add(this.spatialWindowObject);

    if (this.inputManager?.touch) {
      this.inputManager.touch.onToggleVisionModal = () => {
        if (this.visionModal.visible) {
          this.visionModal.close();
        } else {
          this.visionModal.open();
        }
      };
      this.inputManager.touch.setVisionModalOpen(this.visionModal.visible);
    }

    this.inputManager.player.onLockChange = (isLocked: boolean) => {
      const isDrawerOpen = this.hud?.drawer?.open ?? false;
      const isModalOpen = this.visionModal?.visible ?? false;
      if (!this.labEntryActive && !this.isWhiteboardMode && !isModalOpen && !isDrawerOpen && this.currentExperimentId !== 'math-stereometry') {
        this.crosshair.setVisible(true);
      } else {
        this.crosshair.setVisible(false);
      }
    };
  }

  public async switchExperiment(id: string): Promise<void> {
    const requestId = ++this.currentSwitchRequestId;
    this.hud.showTransition(true, '全息粒子解聚与参数重构...');

    // 确保全息舞台处于活动状态，并为 3D 设备清理实验台表面
    this.holoStage.setStageVisible(true);
    this.holoTable.hideHologram(true);
    this.beakerLeft.setVisible(false, true);
    this.beakerRight.setVisible(false, true);
    this.reactionEffectsLeft?.reset();
    this.reactionEffectsRight?.reset();

    try {
      const registry = ExperimentRegistry.getInstance();
      const experiment = await registry.loadExperiment(id);

      // 防竞态守卫：加载过程中若发起新请求则中止
      if (requestId !== this.currentSwitchRequestId) {
        return;
      }

      // 在暂存 Map 中预计算目标参数（暂不修改引擎当前状态）
      const targetParams = new Map<string, any>();
      if (experiment.metadata.parameters) {
        for (const p of experiment.metadata.parameters) {
          targetParams.set(p.id, p.defaultValue);
        }
      }

      // 带有令牌保护的全息舞台过渡切换
      const mounted = await this.holoStage.switchExperiment(
        experiment,
        this.currentContext,
        (status) => {
          if (requestId === this.currentSwitchRequestId) {
            this.hud.showTransition(true, status);
          }
        }
      );

      // 防竞态守卫：舞台过渡期间已被后续请求取代则中止
      if (!mounted || requestId !== this.currentSwitchRequestId) {
        return;
      }

      // 仅在舞台成功挂载此实验后，原子性提交参数
      this.experimentParams.clear();
      for (const [key, value] of targetParams) {
        this.experimentParams.set(key, value);
      }

      this.currentExperimentId = id;
      if (id === 'math-stereometry') {
        this.crosshair?.setVisible(false);
        if (this.inputManager?.player) {
          this.inputManager.player.allowPointerLock = false;
          this.inputManager.player.exitLock();
        }
      } else {
        if (this.inputManager?.player && !this.labEntryActive) {
          this.inputManager.player.allowPointerLock = true;
        }
      }
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
      // 用户要求：进入实验室后，未选择实验时桌上不放置实验器材
      // 待机模式下隐藏全息舞台与烧杯，保持桌面整洁。
      this.holoStage.setStageVisible(false);
      this.holoTable.hideHologram(true);
      this.beakerLeft.setVisible(false, false);
      this.beakerRight.setVisible(false, false);
      this.currentExperimentId = null;

      // 启动时预热并编译烧杯着色器与纹理，避免首次点击化学实验时掉帧卡顿
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

    // 未挂载实验且烧杯隐藏/不可交互时，待机全息实验台支持交互
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

  private initHandTracking(): void {
    if (typeof document === 'undefined') return;

    this.handGestureService = new HandGestureService({
      modelAssetPath: '/models/hand_landmarker.task',
      wasmBasePath: '/mediapipe/wasm',
      mirrorX: true,
      activeMarginX: 0.12,
      activeMarginY: 0.12,
      pinchThresholdEnter: 0.21,
      pinchThresholdExit: 0.27,
      quickPinchMaxDurationMs: 200,
    });

    this.visionProCursor = new VisionProCursor(document.body);
    this.handTrackingHUD = new HandTrackingHUD(this.handGestureService, document.body);
    if (this.isWhiteboardMode) {
      this.handTrackingHUD.setVisible(false);
    }

    // 将手势追踪与 Vision Pro 光标及准星可见性同步
    this.handGestureService.onFrame((frame) => {
      this.visionProCursor?.update(frame);

      if (frame.hasHand) {
        if (this.inputManager?.player?.isLocked) {
          this.inputManager.player.exitLock();
        }
        if (this.crosshair?.getVisible()) {
          this.crosshair.setVisible(false);
        }
      } else {
        if (
          !this.labEntryActive &&
          (!this.visionModal || !this.visionModal.visible) &&
          !this.isWhiteboardMode &&
          (!this.hud?.drawer || !this.hud.drawer.open) &&
          this.currentExperimentId !== 'math-stereometry'
        ) {
          if (!this.crosshair?.getVisible()) {
            this.crosshair?.setVisible(true);
          }
        }
      }
    });

    // 左手快速捏合：打开/切换悬浮空间视窗（VisionModal）
    this.handGestureService.onQuickPinchMenu(() => {
      if (this.visionModal) {
        if (this.visionModal.visible) {
          console.log('[Engine] Left Hand Quick Pinch: closing floating window');
          this.visionModal.close();
        } else {
          console.log('[Engine] Left Hand Quick Pinch: opening floating window at table center');
          this.visionModal.open();
        }
      }
    });

    // 左手长捏合：控制摄像机视角与观察朝向
    this.handGestureService.onCameraRotate((dx: number, dy: number) => {
      // 触控互斥：当移动设备上的虚拟摇杆正在被按压操作时，抑制手势视角旋转
      if (this.inputManager?.touch?.isJoystickActive()) {
        return;
      }
      if (this.inputManager?.player && !this.labEntryActive) {
        this.inputManager.player.rotate(dx, dy, 0.0035);
      }
    });

    // 双手捏合：缩放悬浮视窗（若已打开）或 3D 立体几何模型
    let initialDualPinchStereometryScale = 1.0;
    let initialDualPinchSpatialWindowScale = 1.0;
    this.handGestureService.onDualPinchZoom((event) => {
      // 1. 若悬浮空间视窗处于打开状态，双手捏合缩放悬浮视窗
      if (this.visionModal && this.visionModal.visible) {
        if (event.state === 'start') {
          initialDualPinchSpatialWindowScale = this.visionModal.scale;
        } else if (event.state === 'move') {
          const targetScale = THREE.MathUtils.clamp(
            initialDualPinchSpatialWindowScale * event.scaleFactor,
            0.5,
            2.0
          );
          this.visionModal.setScale(targetScale);
        }
        return;
      }

      // 2. 否则（悬浮视窗关闭时），双手捏合缩放 3D 立体几何模型
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp) {
          if (event.state === 'start') {
            initialDualPinchStereometryScale = exp.getScale?.() ?? exp.mesh?.getScale?.() ?? 1.0;
            exp.interactionManager?.callbacks?.onGuidanceChange?.(
              `双手指势缩放 · 当前: ${Math.round(initialDualPinchStereometryScale * 100)}%`,
              'info'
            );
          } else if (event.state === 'move') {
            const targetScale = THREE.MathUtils.clamp(
              initialDualPinchStereometryScale * event.scaleFactor,
              0.35,
              3.0
            );
            exp.setScale?.(targetScale);
            exp.interactionManager?.callbacks?.onGuidanceChange?.(
              `立体几何缩放: ${Math.round(targetScale * 100)}%`,
              'active'
            );
          } else if (event.state === 'end') {
            const finalScale = exp.getScale?.() ?? 1.0;
            exp.interactionManager?.callbacks?.onGuidanceChange?.(
              `缩放完成 · 当前: ${Math.round(finalScale * 100)}%`,
              'success'
            );
          }
        }
      }
    });

    this.handGestureService.onStatusChange((telemetry) => {
      const isRunning = telemetry.status === 'running';
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('hand-tracking-active', isRunning);
      }
      if (this.inputManager?.touch) {
        this.inputManager.touch.setHandTrackingActive(isRunning);
      }

      if (isRunning) {
        if (this.inputManager?.player) {
          this.inputManager.player.allowPointerLock = false;
          this.inputManager.player.allowMouseRotation = false;
        }
      } else {
        if (this.inputManager?.player && !this.visionModal?.visible) {
          this.inputManager.player.allowPointerLock = this.currentExperimentId !== 'math-stereometry';
        }
      }
    });
  }

  private initEvents(): void {
    window.addEventListener('resize', () => this.onResize());

    // WebGL 上下文丢失与恢复保护（保护 iPadOS/iOS/macOS 后台切换与息屏恢复）
    const canvas = this.renderer.domElement;

    canvas.addEventListener('webglcontextlost', (e: Event) => {
      e.preventDefault(); // WebGL 规范要求阻止默认行为以允许上下文恢复
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

    // 通过鼠标滚轮缩放 3D 模型
    window.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (this.labEntryActive) return;
        if (this.visionModal && this.visionModal.visible) return;
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.onWheel === 'function') {
            exp.onWheel(e);
            if (e.cancelable) {
              e.preventDefault();
            }
          }
        }
      },
      { passive: false }
    );

    // 3D 模型缩放（+ / -）及操作的键盘快捷键
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.labEntryActive) return;
      if (this.visionModal && this.visionModal.visible) return;
      const target = e.target as HTMLElement | null;
      if (target && isTextInputElement(target)) {
        if (isElementVisibleAndActive(target)) return;
        blurActiveInput(true);
      } else if (isTextInputActive()) {
        return;
      }
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.onKeyDown === 'function') {
          const handled = exp.onKeyDown(e);
          if (handled && e.cancelable) {
            e.preventDefault();
          }
        }
      }
    });

    // 3D 指针交互（单击选择试剂，长按拖拽倾倒）
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      blurActiveInput(true);
      if (this.labEntryActive) return;
      if (this.visionModal && this.visionModal.visible) return;

      const isPointerLocked = this.inputManager?.player?.isLocked ?? false;
      const mouseNDC = isPointerLocked ? this.centerScreen : new THREE.Vector2(
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
          lipAim: null,
        };
        return;
      }

      // 若无活动实验或烧杯，点击全息实验台打开 VisionModal
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

      // 将 3D 交互事件转发至全息舞台上的活动实验
      if (this.holoStage.activeExperiment?.onPointerDown) {
        this.raycaster.setFromCamera(mouseNDC, this.camera);
        const hits = this.raycaster.intersectObjects(this.holoStage.activeExperiment.rootGroup.children, true);
        if (hits.length > 0) {
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
        } else if (this.currentExperimentId === 'math-stereometry') {
          const handled = this.holoStage.activeExperiment.onPointerDown(e, null, this.currentContext);
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

      if (
        !this.visionModal?.visible &&
        (this.isExperimentInteracting || this.currentExperimentId === 'math-stereometry') &&
        this.holoStage.activeExperiment?.onPointerMove
      ) {
        this.raycaster.setFromCamera(this.lastPointerPos, this.camera);
        const hits = this.raycaster.intersectObjects(this.holoStage.activeExperiment.rootGroup.children, true);
        const hit = hits.length > 0 ? hits[0] : null;
        this.holoStage.activeExperiment.onPointerMove(e, hit, this.currentContext);
      }

      if (!this.beakerDragState) return;

      const dist = Math.hypot(e.clientX - this.beakerDragState.downClientX, e.clientY - this.beakerDragState.downClientY);
      const elapsed = performance.now() - this.beakerDragState.downTime;

      // 移动距离 > 8px 或按住 > 160ms 且移动 > 2px 时启动拖拽
      if (!this.beakerDragState.isDragging && (dist > 8 || (elapsed > 160 && dist > 2))) {
        this.beakerDragState.isDragging = true;
        this.crosshair?.setVisible(false);
        this.inputManager.player.enabled = false;
        this.inputManager.player.allowPointerLock = false;
        this.inputManager.player.exitLock();
      }

      if (this.beakerDragState.isDragging) {
        this.raycaster.setFromCamera(this.lastPointerPos, this.camera);

        const intersected = this.raycaster.ray.intersectPlane(_BEAKER_DRAG_PLANE, _BEAKER_HIT_POINT);
        if (intersected) {
          const hitX = Math.max(-0.85, Math.min(0.85, _BEAKER_HIT_POINT.x));
          const hitZ = Math.max(-0.55, Math.min(1.55, _BEAKER_HIT_POINT.z));

          const targetBase = this.beakerDragState.targetMesh.restingPosition;
          const distToTarget = Math.hypot(hitX - targetBase.x, hitZ - targetBase.z);

          if (distToTarget < 0.38) {
            // 倾角围绕杯嘴旋转；动画循环将杯嘴对准接收烧杯口
            this.beakerDragState.isPouring = true;
            const isLeftToRight = this.beakerDragState.sourceId === 'left';
            this.beakerDragState.targetTilt = isLeftToRight ? -POUR_TILT : POUR_TILT;
          } else {
            // 在空中平移
            this.beakerDragState.isPouring = false;
            this.beakerDragState.lipAim = null;
            this.beakerDragState.targetPosition.set(hitX, 1.08, hitZ);
            this.beakerDragState.targetTilt = 0;
          }
        }
      }
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.isExperimentInteracting) {
        this.holoStage.activeExperiment?.onPointerUp?.(e, this.currentContext);
        const exp = this.holoStage.activeExperiment as any;
        const stillPinching = typeof exp?.interactionManager?.isPinchingActive === 'function' && exp.interactionManager.isPinchingActive();
        if (!stillPinching) {
          this.isExperimentInteracting = false;
          if (!this.labEntryActive) {
            this.inputManager.player.enabled = true;
            this.inputManager.player.allowPointerLock = (this.currentExperimentId !== 'math-stereometry');
          }
          if (this.crosshair && !this.labEntryActive && (!this.visionModal || !this.visionModal.visible) && !this.isWhiteboardMode && (!this.hud?.drawer || !this.hud.drawer.open) && this.currentExperimentId !== 'math-stereometry') {
            this.crosshair.setVisible(true);
          }
        }
      }

    window.addEventListener('pointercancel', (e: PointerEvent) => {
      if (this.isExperimentInteracting) {
        const exp = this.holoStage.activeExperiment as any;
        exp?.onPointerCancel?.(e);
        exp?.interactionManager?.onPointerCancel?.(e);
        this.isExperimentInteracting = false;
        if (!this.labEntryActive) {
          this.inputManager.player.enabled = true;
        }
      }
    });

    // iPad 及移动端触摸屏上的原生画布触摸事件支持
    canvas.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (this.labEntryActive) return;
        if (this.visionModal && this.visionModal.visible) return;

        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.onTouchStart === 'function') {
            const handled = exp.onTouchStart(e, this.currentContext);
            if (handled) {
              this.isExperimentInteracting = true;
              if (this.inputManager?.player) {
                this.inputManager.player.enabled = false;
              }
              if (e.cancelable && e.touches.length >= 2) {
                e.preventDefault();
              }
            }
          }
        }
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (this.currentExperimentId === 'math-stereometry') {
          const exp = this.holoStage?.activeExperiment as any;
          if (exp && typeof exp.onTouchMove === 'function') {
            const handled = exp.onTouchMove(e, this.currentContext);
            if (handled && e.cancelable && e.touches.length >= 2) {
              e.preventDefault();
            }
          }
        }
      },
      { passive: false }
    );

    window.addEventListener('touchend', (e: TouchEvent) => {
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.onTouchEnd === 'function') {
          exp.onTouchEnd(e, this.currentContext);
          if (e.touches.length === 0) {
            this.isExperimentInteracting = false;
          }
        }
      }
    });

    window.addEventListener('touchcancel', (e: TouchEvent) => {
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        if (exp && typeof exp.onTouchCancel === 'function') {
          exp.onTouchCancel(e);
          this.isExperimentInteracting = false;
        }
      }
    });

    // Safari WebKit 手势事件支持（iPadOS gesturestart, gesturechange, gestureend）
    canvas.addEventListener('gesturestart', (e: any) => {
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        exp?.onGestureStart?.(e);
      }
    });

    canvas.addEventListener('gesturechange', (e: any) => {
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        exp?.onGestureChange?.(e);
      }
    });

    canvas.addEventListener('gestureend', (e: any) => {
      if (this.currentExperimentId === 'math-stereometry') {
        const exp = this.holoStage?.activeExperiment as any;
        exp?.onGestureEnd?.(e);
      }
    });

      if (!this.beakerDragState) return;

      const state = this.beakerDragState;
      this.beakerDragState = null;
      if (!this.labEntryActive) {
        this.inputManager.player.enabled = true;
      }
      if (this.crosshair && !this.labEntryActive && (!this.visionModal || !this.visionModal.visible) && !this.isWhiteboardMode && (!this.hud?.drawer || !this.hud.drawer.open)) {
        this.crosshair.setVisible(true);
      }

      if (!state.isDragging) {
        // 单击：打开被点击烧杯的元素周期表选择试剂
        // “打开化学板块默认给左边的杯子选试剂，单击烧杯打开元素周期表页面自由选择”
        this.activeBeakerId = state.sourceId;
        this.visionModal.open('chemistry', state.sourceId);
        return;
      }

      // 拖拽释放：复位源烧杯
      state.sourceMesh.setTilt(0);
      this.hidePourStream();
      this.hidePourVolumeBadge();

      // 若发生了液体转移，自动触发目标烧杯的成分分析视窗
      // “视窗呈现：混合反应发生后，中央全息主视窗自动切换至该烧杯的成分分析面板进行大屏展示。”
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
      this.lastCss3dCamPos.set(Infinity, Infinity, Infinity);
    }

    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private checkCrosshairIntersection(now: number): void {
    if (
      !this.crosshair ||
      !this.crosshair.getVisible() ||
      (this.visionModal && this.visionModal.visible) ||
      this.currentExperimentId === 'math-stereometry'
    ) {
      if (this.currentExperimentId === 'math-stereometry' && this.crosshair?.getVisible()) {
        this.crosshair.setVisible(false);
      }
      return;
    }

    // 将光线投射节流至每 50ms 一次（约 20Hz），避免主线程场景遍历卡顿
    if (now - this.lastCrosshairCheck < 50) {
      return;
    }
    this.lastCrosshairCheck = now;

    const isPointerLocked = this.inputManager?.player?.isLocked ?? false;
    let targetType = this.getInteractiveTargetAt(this.centerScreen);

    // 若未锁定指针且屏幕中心准星未命中，检查自由鼠标指针位置
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

    // 若未悬停于烧杯，查询当前实验中可悬停的器材
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

    // 3D 交互反馈：高亮烧杯主体与光环
    if (this.beakerLeft) {
      this.beakerLeft.setHovered(targetType === 'beaker-left');
    }
    if (this.beakerRight) {
      this.beakerRight.setHovered(targetType === 'beaker-right');
    }
    if (this.holoTable) {
      this.holoTable.setHovered(targetType === 'holo-table');
    }

    // 交互目标的光标反馈
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = hovered && !isPointerLocked ? 'pointer' : 'default';
    }
  }

  public isWhiteboardMode = false; // 默认引擎模式为实验室（3D 场景激活）

  /** 进入或离开实验室动画过程中为 true：运镜脚本接管视角控制。 */
  public labEntryActive = false;
  public onLabEntryFrame: ((frame: LabEntryFrame) => void) | null = null;
  private labEntryClock: LabEntryClock | null = null;
  private labReturnClock: LabReturnClock | null = null;

  public beginLabEntry(): void {
    const restFov = this.labEntryClock?.restFov ?? this.camera.fov;
    this.labEntryClock = createLabEntryClock(restFov);
    this.labEntryActive = true;
    const player = this.inputManager?.player;
    if (player) {
      player.velocity.set(0, 0, 0);
      player.resetKeys();
      player.enabled = false;
      player.allowPointerLock = false;
      player.exitLock();
    }
    this.crosshair?.setVisible(false);
    const frame = advanceLabEntry(this.labEntryClock, 0);
    this.applyLabEntryPose(frame.pose);
    this.onLabEntryFrame?.(frame);
  }

  public cancelLabEntry(): void {
    const restFov = this.labEntryClock?.restFov;
    this.suspendLabMotion();
    if (restFov !== undefined) {
      this.applyLabEntryPose(labEntryPose(1, restFov));
    }
  }

  /** 停止运行中的运镜并保留摄像机在当前位置。 */
  public suspendLabMotion(): void {
    this.labEntryActive = false;
    this.labEntryClock = null;
    this.labReturnClock = null;
    this.onLabEntryFrame = null;
  }

  public getLabTransitionLinear(): number {
    const clock = this.labEntryClock ?? this.labReturnClock;
    if (!clock || clock.duration <= 0) return 1;
    return Math.min(1, clock.elapsed / clock.duration);
  }

  public beginLabReturn(): void {
    const player = this.inputManager?.player;
    const from = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: player?.yaw ?? 0,
      pitch: player?.pitch ?? 0,
      fov: this.camera.fov,
    };
    this.labEntryClock = null;
    this.labReturnClock = createLabReturnClock(from, {
      roomRadius: player?.roomRadius ?? 7.6,
      tableRadius: player?.tableRadius ?? 2.48,
      minHeight: player?.minHeight ?? 0.3,
      maxHeight: player?.maxHeight ?? 3.55,
      minPitch: player?.minPitch ?? -Math.PI / 2,
      maxPitch: player?.maxPitch ?? Math.PI / 2,
    });
    this.labEntryActive = true;
    if (player) {
      player.velocity.set(0, 0, 0);
      player.resetKeys();
      player.enabled = false;
      player.allowPointerLock = false;
      player.exitLock();
    }
    this.crosshair?.setVisible(false);
    const frame = advanceLabReturn(this.labReturnClock, 0);
    this.applyLabEntryPose(frame.pose);
    this.onLabEntryFrame?.(frame);
  }

  private applyLabEntryPose(pose: LabEntryFrame['pose']): void {
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.fov = pose.fov;
    this.camera.updateProjectionMatrix();
    const player = this.inputManager?.player;
    if (!player) return;
    player.yaw = pose.yaw;
    player.pitch = pose.pitch;
    player.eyeHeight = pose.y;
    player.velocity.set(0, 0, 0);
    player.updateCameraRotation();
  }

  private tickLabEntry(delta: number): void {
    if (this.labReturnClock) {
      const frame = advanceLabReturn(this.labReturnClock, delta);
      this.applyLabEntryPose(frame.pose);
      const listener = this.onLabEntryFrame;
      if (frame.done) {
        this.labEntryActive = false;
        this.labReturnClock = null;
        this.onLabEntryFrame = null;
      }
      listener?.(frame);
      return;
    }
    if (!this.labEntryClock) return;
    const frame = advanceLabEntry(this.labEntryClock, delta);
    this.applyLabEntryPose(frame.pose);
    const listener = this.onLabEntryFrame;
    if (frame.done) {
      this.labEntryActive = false;
      this.labEntryClock = null;
      this.onLabEntryFrame = null;
    }
    listener?.(frame);
  }

  public setViewMode(mode: 'whiteboard' | 'laboratory'): void {
    const wasWhiteboard = this.isWhiteboardMode;
    this.isWhiteboardMode = mode === 'whiteboard';

    this.holoStage?.setViewMode(mode);
    this.handTrackingHUD?.setVisible(!this.isWhiteboardMode);

    if (this.inputManager?.touch) {
      this.inputManager.touch.setVisible(!this.isWhiteboardMode);
    }

    if (wasWhiteboard && !this.isWhiteboardMode) {
      if (this.renderer?.shadowMap?.enabled) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      if (!this.labEntryActive && this.crosshair && (!this.visionModal || !this.visionModal.visible) && (!this.hud?.drawer || !this.hud.drawer.open) && this.currentExperimentId !== 'math-stereometry') {
        this.crosshair.setVisible(true);
      }
    } else if (this.isWhiteboardMode) {
      if (this.crosshair) {
        this.crosshair.setVisible(false);
      }
    }
  }

  public getViewMode(): 'whiteboard' | 'laboratory' {
    return this.isWhiteboardMode ? 'whiteboard' : 'laboratory';
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

    // 当聚焦于白板时，3D 场景完全隐藏在白板层下方。
    // 跳过 3D 场景更新、物理模拟、光线投射及 WebGL 渲染调用，消除 GPU/CPU 资源浪费。
    // 仅更新 HUD / 性能监控覆盖层，确保 60+ FPS 且无多余 GPU 开销。
    if (this.isWhiteboardMode) {
      if (this.hud) {
        this.hud.update(delta);
      }
      return;
    }

    // 运镜平息前由其接管摄像机，避免玩家控制器积分使其偏离路径。
    if (this.labEntryActive) {
      this.tickLabEntry(delta);
    } else if (this.inputManager) {
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
        if (nowMs - this.lastMathTelemetrySync >= 120) {
          this.lastMathTelemetrySync = nowMs;
          const exp = this.holoStage.activeExperiment as any;
          if (this.currentExperimentId === 'math-stereometry' && typeof exp?.getStereometryTelemetry === 'function') {
            this.visionModal.stereometryCard.updateTelemetry(exp.getStereometryTelemetry());
          }
        }
      } else if (isModalOpen && this.visionModal.currentTab === 'em') {
        const nowMs = performance.now();
        if (nowMs - this.lastEmTelemetrySync >= 50) {
          this.lastEmTelemetrySync = nowMs;
          const exp = this.holoStage.activeExperiment as any;
          if (this.currentExperimentId === 'em-hall' && typeof exp?.getTelemetryData === 'function') {
            this.visionModal.hallCard.updateTelemetry(exp.getTelemetryData());
          } else if (this.currentExperimentId === 'em-induction' && typeof exp?.getTelemetry === 'function') {
            this.visionModal.inductionCard.updateTelemetry(exp.getTelemetry());
          } else if (this.currentExperimentId === 'em-generator' && typeof exp?.getTelemetry === 'function') {
            this.visionModal.generatorCard.updateTelemetry(exp.getTelemetry());
          } else if (this.currentExperimentId === 'em-mass-spec' && typeof exp?.getTelemetry === 'function') {
            this.visionModal.massSpecCard.updateTelemetry(exp.getTelemetry());
          } else if (this.currentExperimentId === 'em-hysteresis' && typeof exp?.getTelemetry === 'function') {
            this.visionModal.hysteresisCard.updateTelemetry(exp.getTelemetry());
          } else if (this.currentExperimentId === 'em-field' && typeof exp?.getTelemetry === 'function') {
            this.visionModal.fieldCard.updateTelemetry(exp.getTelemetry());
          }
        }
      } else if (isModalOpen && this.visionModal.currentTab === 'mechanics') {
        const nowMs = performance.now();
        if (nowMs - this.lastMechTelemetrySync >= 50) {
          this.lastMechTelemetrySync = nowMs;
          const exp = this.holoStage.activeExperiment as any;
          if (typeof exp?.getTelemetry === 'function') {
            this.visionModal.updateMechanicsTelemetry(exp.getTelemetry());
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

    // 烧杯拖拽：倾倒计算在网格更新后运行，使倾倒流使用当前帧的倾角与水平自由表面。
    if (this.beakerDragState && this.beakerDragState.isDragging) {
      const { sourceMesh, targetPosition, targetTilt, isPouring } = this.beakerDragState;
      sourceMesh.setTilt(targetTilt);
      if (!isPouring) {
        const posLerp = Math.min(1.0, delta * 12.0);
        sourceMesh.group.position.lerp(targetPosition, posLerp);
      }
    } else {
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

    if (this.beakerLeft && (this.beakerLeft.group.visible || this.beakerLeft.isVisible())) {
      this.beakerLeft.update(delta);
    }
    if (this.beakerRight && (this.beakerRight.group.visible || this.beakerRight.isVisible())) {
      this.beakerRight.update(delta);
    }

    if (this.beakerDragState && this.beakerDragState.isDragging) {
      if (this.beakerDragState.isPouring) {
        this.stepBeakerPour(this.beakerDragState, delta);
      } else {
        this.hidePourStream();
        this.updatePourVolumeBadge(this.beakerDragState.sourceMesh, this.beakerDragState.sourceEngine.state.volume);
      }
    }

    if (this.reactionEffectsLeft && this.chemistryEngineLeft && this.beakerLeft?.isVisible()) {
      this.reactionEffectsLeft.update(delta, this.chemistryEngineLeft.state);
    }
    if (this.reactionEffectsRight && this.chemistryEngineRight && this.beakerRight?.isVisible()) {
      this.reactionEffectsRight.update(delta, this.chemistryEngineRight.state);
    }

    if (!this.labEntryActive) {
      this.checkCrosshairIntersection(now);
    }

    // 使用高速原生管线（100+ FPS）或可选的降采样泛光合成器进行渲染
    const tRenderStart = performance.now();
    if (this.isPostProcessingActive && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const renderDuration = performance.now() - tRenderStart;

    if (this.hud) {
      this.hud.update(delta, renderDuration);
    }

    // 仅在空间视窗打开/可见且变换发生改变时渲染 CSS3D 场景
    const isCss3dVisible = Boolean(this.css3dRenderer && this.css3dScene && isModalOpen && this.spatialWindowObject?.visible);
    if (isCss3dVisible) {
      const cam = this.camera;
      const win = this.spatialWindowObject!;
      const camMoved =
        cam.position.distanceToSquared(this.lastCss3dCamPos) > 1e-6 ||
        Math.abs(cam.quaternion.x - this.lastCss3dCamQuat.x) > 1e-4 ||
        Math.abs(cam.quaternion.y - this.lastCss3dCamQuat.y) > 1e-4 ||
        Math.abs(cam.quaternion.z - this.lastCss3dCamQuat.z) > 1e-4 ||
        Math.abs(cam.quaternion.w - this.lastCss3dCamQuat.w) > 1e-4;

      const winMoved =
        win.position.distanceToSquared(this.lastCss3dWinPos) > 1e-6 ||
        Math.abs(win.rotation.y - this.lastCss3dWinRotY) > 1e-4 ||
        Math.abs(win.scale.x - this.lastCss3dWinScale) > 1e-5;

      const becameVisible = !this.lastCss3dVisible;

      if (camMoved || winMoved || becameVisible) {
        this.lastCss3dCamPos.copy(cam.position);
        this.lastCss3dCamQuat.copy(cam.quaternion);
        this.lastCss3dWinPos.copy(win.position);
        this.lastCss3dWinRotY = win.rotation.y;
        this.lastCss3dWinScale = win.scale.x;
        this.lastCss3dVisible = true;
        this.css3dRenderer!.render(this.css3dScene!, this.camera);
      }
    } else {
      this.lastCss3dVisible = false;
    }
  }
}
