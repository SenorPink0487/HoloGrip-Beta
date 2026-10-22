import * as THREE from 'three';
import {
  OpticalPhysics,
  type PolarizationSampleMode,
  type PolarizationStateType,
  type PolarizationAnalysisResult,
  type BrewsterReflectionResult,
} from './OpticalPhysics.ts';

export type PolarizationLightSourceMode = 'monochromatic' | 'white';

export interface OpticalPolarizationTelemetry {
  lightSourceMode: PolarizationLightSourceMode;
  wavelengthNm: number;
  laserPower: boolean;
  polarizerAngleDeg: number;
  analyzerAngleDeg: number;
  relativeAngleDeg: number;
  sampleMode: PolarizationSampleMode;
  sampleModeName: string;
  waveplateFastAxisDeg: number;
  stressLoadMPa: number;
  enableBrewsterPlate: boolean;
  brewsterIncidentAngleDeg: number;
  screenDistanceM: number;
  // 斯托克斯-琼斯偏振态核心遥测
  phaseRetardationDeg: number;
  ellipticityRatio: number;
  azimuthAngleDeg: number;
  polarizationState: PolarizationStateType;
  polarizationStateName: string;
  transmittedIntensity: number;
  rejectedIntensity: number;
  isExtinction: boolean;
  isParallelMax: boolean;
  // 冰洲石双折射 o光 / e光分束遥测
  calciteORayTransmitted: number;
  calciteERayTransmitted: number;
  // 布儒斯特角反射遥测
  brewsterAngleDeg: number;
  brewsterReflectanceS: number;
  brewsterReflectanceP: number;
  brewsterDegreeOfPolarization: number;
}

export interface OpticalPolarizationOptions {
  lightSourceMode?: PolarizationLightSourceMode;
  wavelengthNm?: number;
  laserPower?: boolean;
  polarizerAngleDeg?: number;
  analyzerAngleDeg?: number;
  sampleMode?: PolarizationSampleMode;
  waveplateFastAxisDeg?: number;
  stressLoadMPa?: number;
  enableBrewsterPlate?: boolean;
  brewsterIncidentAngleDeg?: number;
  screenDistanceM?: number;
  showVectorDecomposition?: boolean;
  showBeamsInAir?: boolean;
}

function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  } catch {
    return null;
  }
}

/**
 * 创建带真实机械倒角与圆角过渡的精密工业块体几何
 * 严禁使用毫无细节的粗糙直角 BoxGeometry 生硬拼接
 */
function createChamferedBlockGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.0012
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const b = Math.min(bevel, width * 0.2, height * 0.2);
  const hw = width * 0.5 - b;
  const hh = height * 0.5 - b;

  shape.moveTo(-hw, -hh - b);
  shape.lineTo(hw, -hh - b);
  shape.lineTo(hw + b, -hh);
  shape.lineTo(hw + b, hh);
  shape.lineTo(hw, hh + b);
  shape.lineTo(-hw, hh + b);
  shape.lineTo(-hw - b, hh);
  shape.lineTo(-hw - b, -hh);
  shape.closePath();

  const extrudeDepth = Math.max(0.0005, depth - b * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * 创建中空倒角环形法兰外框几何
 */
function createHollowRingFrameGeometry(
  outerRadius: number,
  innerRadius: number,
  depth: number,
  bevel = 0.0012,
  segments = 64
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const extrudeDepth = Math.max(0.001, depth - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: segments,
  });
  geo.translate(0, 0, -extrudeDepth * 0.5);
  return geo;
}

/**
 * 创建天然冰洲石 (CaCO3) 菱面体双折射斜晶几何 (带光学倒角棱边)
 */
function createRhombohedralCalciteGeometry(
  width: number,
  height: number,
  depth: number,
  shearX = 0.012,
  bevel = 0.0014
): THREE.BufferGeometry {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-hw - shearX * 0.5, -hh);
  shape.lineTo(hw - shearX * 0.5, -hh);
  shape.lineTo(hw + shearX * 0.5, hh);
  shape.lineTo(-hw + shearX * 0.5, hh);
  shape.closePath();

  const extrudeDepth = Math.max(0.004, depth - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

/**
 * 创建光弹应力测试透明聚碳酸酯承压拱形试件几何
 */
function createPhotoelasticArchGeometry(
  radius: number,
  holeRadius: number,
  depth: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, -Math.PI * 0.22, Math.PI * 1.22, false);
  shape.lineTo(-radius * 0.92, -radius * 0.65);
  shape.absarc(0, -radius * 0.65, holeRadius, Math.PI, 0, true);
  shape.lineTo(radius * 0.92, -radius * 0.65);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geo.center();
  return geo;
}

/**
 * 旗舰科研级“光的偏振、琼斯三维螺旋波、冰洲石双折射与光弹应力色偏振”综合椭偏实验仪
 * (航天级阳极氧化喷砂银铝 · 镜面液态铬双导轨 · Mitutoyo 差动测微鼓轮 · 360°激光分度旋转镜架 · 深海蓝黑全景椭偏接收屏)
 */
export class OpticalPolarizationApparatusMesh {
  public readonly group = new THREE.Group();

  // 核心空间基准坐标 (沿 X 轴水平展开，正面对向操作者 +Z)
  public readonly railLength = 1.18;
  public readonly railWidth = 0.074;
  public readonly railHeight = 0.038;
  public readonly beamCenterY = 0.224;

  public readonly emitterX = -0.465;
  public readonly emitterNozzleX = -0.382;
  public readonly brewsterCenterX = -0.295;
  public readonly polarizerX = -0.195;
  public readonly sampleStageX = -0.005;
  public readonly analyzerX = 0.185;
  public readonly minScreenX = 0.320;
  public readonly maxScreenX = 0.495;

  // 核心物理与实验状态参数
  public lightSourceMode: PolarizationLightSourceMode = 'monochromatic';
  public wavelengthNm = 532.0;
  public laserPower = true;
  public polarizerAngleDeg = 0.0; // 起偏器 P1 透振轴方位角 θ_P (0° ~ 180°, 0°为竖直 +Y)
  public analyzerAngleDeg = 35.0; // 检偏器 P2 透振轴方位角 θ_A (0° ~ 180°)
  public sampleMode: PolarizationSampleMode = 'malus_free';
  public waveplateFastAxisDeg = 45.0; // 中央波片快轴或冰洲石主截面方位角 θ_WP (0° ~ 180°)
  public stressLoadMPa = 48.0; // 光弹应力加载压强 (10 ~ 100 MPa)
  public enableBrewsterPlate = false; // 布儒斯特角反射起偏玻片台切入开关
  public brewsterIncidentAngleDeg = 56.6; // BK7 光学玻璃布儒斯特角 arctan(1.5168) ≈ 56.6°
  public screenDistanceM = 0.58; // 检偏器至接收屏距离 L (0.30m ~ 0.85m)
  public showVectorDecomposition = true; // 显示三维电矢量分解环与偏振椭圆轨迹
  public showBeamsInAir = true; // 显示三维电磁横波/螺旋波与空气丁达尔光束

  // 五工位中央样品转换轮预设
  public static readonly SAMPLE_MODES: PolarizationSampleMode[] = [
    'malus_free',
    'quarter_waveplate',
    'half_waveplate',
    'calcite_birefringence',
    'photoelastic_stress',
  ];
  public activeSampleIndex = 0;

  // 3D 核心装配节点 (公开供交互管理器与测试验证)
  public railGroup!: THREE.Group;
  public emitterGroup!: THREE.Group;
  public brewsterGroup!: THREE.Group;
  public brewsterPivotArm!: THREE.Group;
  public brewsterGlassMesh!: THREE.Mesh;
  public brewsterToggleKnob!: THREE.Mesh;

  public polarizerStageGroup!: THREE.Group;
  public polarizerRotorGroup!: THREE.Group;
  public polarizerCrystalMesh!: THREE.Mesh;
  public polarizerMicrometerKnob!: THREE.Mesh;
  public polarizerFrontPointer!: THREE.Mesh;

  public sampleStageGroup!: THREE.Group;
  public sampleTurretWheel!: THREE.Group;
  public waveplateMountGroup!: THREE.Group;
  public waveplateCrystalMesh!: THREE.Mesh;
  public waveplateMicrometerKnob!: THREE.Mesh;
  public calciteCrystalGroup!: THREE.Group;
  public calciteCrystalMesh!: THREE.Mesh;
  public photoelasticFrameGroup!: THREE.Group;
  public stressSpecimenMesh!: THREE.Mesh;
  public stressLoadScrewKnob!: THREE.Mesh;
  public stressAnvilMesh!: THREE.Mesh;

  public analyzerStageGroup!: THREE.Group;
  public analyzerRotorGroup!: THREE.Group;
  public analyzerCrystalMesh!: THREE.Mesh;
  public analyzerMicrometerKnob!: THREE.Mesh;
  public analyzerFrontPointer!: THREE.Mesh;
  public presetParallelBtnMesh!: THREE.Mesh;
  public preset45BtnMesh!: THREE.Mesh;
  public presetCrossedBtnMesh!: THREE.Mesh;

  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public screenMesh!: THREE.Mesh;
  public photodiodeGroup!: THREE.Group;
  public photodiodeBarMeshes: THREE.Mesh[] = [];

  // 光源控制面板按键
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public whiteLightBtnMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};

  // 原生 3D 交互引导光晕环与首次接触生命周期状态
  public polarizerHoverCue!: THREE.Mesh;
  public analyzerHoverCue!: THREE.Mesh;
  public sampleTurretHoverCue!: THREE.Mesh;
  public waveplateHoverCue!: THREE.Mesh;
  public brewsterHoverCue!: THREE.Mesh;
  public hasInteractedWithPolarizer = false;
  public hasInteractedWithAnalyzer = false;
  public hasInteractedWithSampleTurret = false;
  public hasInteractedWithWaveplate = false;
  public hasInteractedWithBrewster = false;

  // 阻尼动画状态
  public currentTurretAngle = 0.0;
  public targetTurretAngle = 0.0;
  public currentBrewsterSwing = 1.0; // 0 = 切入光路, 1 = 折叠收纳
  public targetBrewsterSwing = 1.0;
  private wavePhase = 0.0;

  // 3D 电磁波场与偏振矢量网格
  public beamsGroup!: THREE.Group;
  // 段 1: 非偏振自然光多方位星芒波束 (Emitter -> Polarizer P1)
  public unpolarizedWaveGroup!: THREE.Group;
  public unpolarizedRibbons: THREE.Mesh[] = [];
  public unpolarizedVectorsMesh!: THREE.LineSegments;
  public unpolarizedStarRings: THREE.Mesh[] = [];
  public brewsterReflectedRibbonMesh!: THREE.Mesh;

  // 段 2: 起偏后纯线偏振 3D 横波带与电矢量梳 (Polarizer P1 -> Sample Stage)
  public polarizedWaveGroup!: THREE.Group;
  public polarizedRibbonMesh!: THREE.Mesh;
  public polarizedVectorsMesh!: THREE.LineSegments;
  public polarizedCoreCylinder!: THREE.Mesh;

  // 段 3: 调制区 (Sample Stage -> Analyzer P2)
  public modulatedWaveGroup!: THREE.Group;
  public modulatedRibbonMesh!: THREE.Mesh;
  public modulatedVectorsMesh!: THREE.LineSegments;
  public fastComponentLineMesh!: THREE.Line;
  public slowComponentLineMesh!: THREE.Line;
  public polarizationStateLocusLine!: THREE.LineLoop;
  public rotatingEVectorArrowGroup!: THREE.Group;
  public calciteOWaveRibbonMesh!: THREE.Mesh;
  public calciteEWaveRibbonMesh!: THREE.Mesh;
  public calciteOVectorsMesh!: THREE.LineSegments;
  public calciteEVectorsMesh!: THREE.LineSegments;

  // 段 4: 检偏后透射波带 (Analyzer P2 -> Screen)
  public transmittedWaveGroup!: THREE.Group;
  public transmittedRibbonMesh!: THREE.Mesh;
  public transmittedVectorsMesh!: THREE.LineSegments;
  public transmittedCalciteORibbonMesh!: THREE.Mesh;
  public transmittedCalciteERibbonMesh!: THREE.Mesh;
  public rejectedOrthogonalBeamMesh!: THREE.Mesh;

  // 检偏器正前方 3D 相对夹角 Δθ 扇形环
  public auxiliariesGroup!: THREE.Group;

  // 动态纹理与材质引用
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  private railScaleCanvas: HTMLCanvasElement | null = null;
  private railScaleTexture: THREE.CanvasTexture | null = null;
  private goniometerDialCanvas: HTMLCanvasElement | null = null;
  private goniometerDialTexture: THREE.CanvasTexture | null = null;
  private valueLabelCanvas: HTMLCanvasElement | null = null;
  private valueLabelTexture: THREE.CanvasTexture | null = null;
  public polarizationValueSprite!: THREE.Sprite;

  // 脏标记与缓存
  private isOpticalDirty = true;
  private isScreenDirty = true;
  private lastScreenHash = '';
  private cachedAnalysis: PolarizationAnalysisResult | null = null;
  private cachedBrewster: BrewsterReflectionResult | null = null;

  constructor(options: OpticalPolarizationOptions = {}) {
    this.group.name = 'OpticalPolarizationApparatusMesh';

    if (options.lightSourceMode !== undefined) this.lightSourceMode = options.lightSourceMode;
    if (options.wavelengthNm !== undefined) this.wavelengthNm = options.wavelengthNm;
    if (options.laserPower !== undefined) this.laserPower = options.laserPower;
    if (options.polarizerAngleDeg !== undefined) this.polarizerAngleDeg = options.polarizerAngleDeg;
    if (options.analyzerAngleDeg !== undefined) this.analyzerAngleDeg = options.analyzerAngleDeg;
    if (options.sampleMode !== undefined) {
      this.sampleMode = options.sampleMode;
      const idx = OpticalPolarizationApparatusMesh.SAMPLE_MODES.indexOf(options.sampleMode);
      if (idx >= 0) {
        this.activeSampleIndex = idx;
        this.currentTurretAngle = idx * ((Math.PI * 2) / 5);
        this.targetTurretAngle = this.currentTurretAngle;
      }
    }
    if (options.waveplateFastAxisDeg !== undefined) this.waveplateFastAxisDeg = options.waveplateFastAxisDeg;
    if (options.stressLoadMPa !== undefined) this.stressLoadMPa = options.stressLoadMPa;
    if (options.enableBrewsterPlate !== undefined) {
      this.enableBrewsterPlate = options.enableBrewsterPlate;
      this.currentBrewsterSwing = this.enableBrewsterPlate ? 0.0 : 1.0;
      this.targetBrewsterSwing = this.currentBrewsterSwing;
    }
    if (options.brewsterIncidentAngleDeg !== undefined) {
      this.brewsterIncidentAngleDeg = options.brewsterIncidentAngleDeg;
    }
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;
    if (options.showVectorDecomposition !== undefined) {
      this.showVectorDecomposition = options.showVectorDecomposition;
    }
    if (options.showBeamsInAir !== undefined) this.showBeamsInAir = options.showBeamsInAir;

    this.buildApparatus();
    this.syncScreenPositionFromDistance();
    this.updateSourceIndicators();
    this.updateMechanicalKinematics();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  // ==================== 通用精密导轨滑鞍与 316L 镜面铬升降立柱生成器 ====================
  private createSliderSaddle(
    xPos: number,
    name: string,
    rodHeight = 0.082,
    baseWidth = 0.068
  ): { saddleGroup: THREE.Group; collar: THREE.Mesh; rod: THREE.Mesh } {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(xPos, 0, 0);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.36,
      roughness: 0.26,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.25,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.78,
      roughness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    // 1. 滑鞍主体基座 (航天级喷砂银铝精铣滑座 + 深空钛灰上压板与下燕尾卡爪)
    const baseW = baseWidth;
    const baseH = 0.020;
    const baseD = 0.078;
    const baseGeo = createChamferedBlockGeometry(baseW, baseH, baseD, 0.0016);
    const base = new THREE.Mesh(baseGeo, satinSilverMat);
    base.position.set(0, this.railHeight + baseH * 0.5, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const topPlateGeo = createChamferedBlockGeometry(baseW * 0.86, 0.004, baseD * 0.86, 0.0008);
    const topPlate = new THREE.Mesh(topPlateGeo, titaniumSlateMat);
    topPlate.position.set(0, this.railHeight + baseH + 0.002, 0);
    group.add(topPlate);

    // 正面香槟金游标对齐读数指针
    const indexLineGeo = new THREE.BoxGeometry(0.0022, 0.016, 0.0022);
    const indexLine = new THREE.Mesh(indexLineGeo, brassMat);
    indexLine.position.set(0, this.railHeight + 0.006, baseD * 0.502);
    group.add(indexLine);

    // 2. 中央立柱六角法兰与香槟金锁紧套筒
    const flangeGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.005, 6);
    const flange = new THREE.Mesh(flangeGeo, titaniumSlateMat);
    flange.position.set(0, this.railHeight + baseH + 0.004, 0);
    group.add(flange);

    const collarRadius = 0.0105;
    const collarH = 0.030;
    const collarGeo = new THREE.CylinderGeometry(collarRadius, collarRadius, collarH, 28);
    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.position.set(0, this.railHeight + baseH + collarH * 0.5, 0);
    collar.castShadow = true;
    group.add(collar);

    // 3. 套筒侧面滚花锁紧螺钉
    const screwShaftGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.008, 16);
    screwShaftGeo.rotateZ(Math.PI / 2);
    const screwShaft = new THREE.Mesh(screwShaftGeo, chromeRodMat);
    screwShaft.position.set(collarRadius + 0.004, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwShaft);

    const screwHeadGeo = new THREE.CylinderGeometry(0.0070, 0.0070, 0.006, 24);
    screwHeadGeo.rotateZ(Math.PI / 2);
    const screwHead = new THREE.Mesh(screwHeadGeo, brassMat);
    screwHead.position.set(collarRadius + 0.010, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwHead);

    // 4. 精密镜面 316L 不锈钢升降立柱导杆
    const rodRadius = 0.0070;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodHeight, 32);
    const rod = new THREE.Mesh(rodGeo, chromeRodMat);
    rod.position.set(0, this.railHeight + baseH + rodHeight * 0.5, 0);
    rod.castShadow = true;
    group.add(rod);

    return { saddleGroup: group, collar, rod };
  }

  /**
   * 构造 Mitutoyo 级精密差动测微螺杆鼓轮总成 (包含铬合金固定游标套筒、六角防松螺母、45°倒角读数环、24道滚花微分筒与棘轮测力尾钮)
   */
  private createMitutoyoMicrometerAssembly(
    interactiveId: string,
    knobName: string
  ): { group: THREE.Group; rotatingKnob: THREE.Mesh; hoverCue: THREE.Mesh } {
    const group = new THREE.Group();

    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.26,
      roughness: 0.38,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.78,
      roughness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    // a. 固定游标套筒 (Fixed Vernier Barrel Sleeve)
    const sleeveGeo = new THREE.CylinderGeometry(0.0072, 0.0072, 0.014, 32);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, chromeRodMat);
    sleeveMesh.position.set(0, 0, 0.007);
    sleeveMesh.userData = { interactiveId };
    group.add(sleeveMesh);

    // 套筒根部香槟金六角锁紧螺母
    const locknutGeo = new THREE.CylinderGeometry(0.0088, 0.0088, 0.0035, 6);
    locknutGeo.rotateX(Math.PI / 2);
    const locknut = new THREE.Mesh(locknutGeo, brassMat);
    locknut.position.set(0, 0, 0.0018);
    locknut.userData = { interactiveId };
    group.add(locknut);

    // 套筒毫米分度刻线
    for (let i = 0; i <= 4; i++) {
      const tickGeo = new THREE.BoxGeometry(0.0026, 0.0004, 0.0005);
      const tick = new THREE.Mesh(tickGeo, titaniumSlateMat);
      tick.position.set(0, 0.0073, 0.003 + i * 0.0022);
      tick.userData = { interactiveId };
      group.add(tick);
    }

    // b. 可旋转精密测微微分筒 (Rotating Thimble Knob Assembly)
    const knobGeo = new THREE.CylinderGeometry(0.0088, 0.0088, 0.015, 32);
    knobGeo.rotateX(Math.PI / 2);
    const rotatingKnob = new THREE.Mesh(knobGeo, brassMat);
    rotatingKnob.name = knobName;
    rotatingKnob.position.set(0, 0, 0.017);
    rotatingKnob.userData = { interactiveId };

    // 读数端 45° 精密倒角游标环
    const bevelGeo = new THREE.CylinderGeometry(0.0074, 0.0088, 0.004, 32);
    bevelGeo.rotateX(Math.PI / 2);
    const bevelCollar = new THREE.Mesh(bevelGeo, chromeRodMat);
    bevelCollar.position.set(0, 0, -0.0095);
    bevelCollar.userData = { interactiveId };
    rotatingKnob.add(bevelCollar);

    // 24 道微米滚花防滑条
    for (let i = 0; i < 24; i++) {
      const kAngle = (i / 24) * Math.PI * 2;
      const ribGeo = new THREE.BoxGeometry(0.0006, 0.0006, 0.014);
      const rib = new THREE.Mesh(ribGeo, brassMat);
      rib.position.set(Math.cos(kAngle) * 0.0089, Math.sin(kAngle) * 0.0089, 0);
      rib.rotation.z = kAngle;
      rib.userData = { interactiveId };
      rotatingKnob.add(rib);
    }

    const neckGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.004, 24);
    neckGeo.rotateX(Math.PI / 2);
    const neckMesh = new THREE.Mesh(neckGeo, chromeRodMat);
    neckMesh.position.set(0, 0, 0.0095);
    neckMesh.userData = { interactiveId };
    rotatingKnob.add(neckMesh);

    const ratchetGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.007, 24);
    ratchetGeo.rotateX(Math.PI / 2);
    const ratchetKnob = new THREE.Mesh(ratchetGeo, brassMat);
    ratchetKnob.position.set(0, 0, 0.014);
    ratchetKnob.userData = { interactiveId };
    rotatingKnob.add(ratchetKnob);

    group.add(rotatingKnob);

    // c. 3D 悬停引导光晕环
    const cueGeo = new THREE.TorusGeometry(0.0118, 0.0007, 14, 40, Math.PI * 1.65);
    const hoverCue = new THREE.Mesh(
      cueGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.90,
        depthWrite: false,
      })
    );
    hoverCue.position.set(0, 0, 0.017);
    hoverCue.visible = false;
    group.add(hoverCue);

    return { group, rotatingKnob, hoverCue };
  }

  // ==================== 1. 主装配构建 ====================
  private buildApparatus(): void {
    // A. 航天级阳极氧化喷砂银铝光学导轨与深海蓝激光标尺
    this.buildOpticalBenchBed();

    // B. 左侧双环 CNC 万向调心自然光/相干激光发射舱与倾斜控制面板
    this.buildUnpolarizedLightEmitter();

    // C. 可切入光路的布儒斯特角 (Brewster's Angle) 玻片起偏台 (折叠收纳无悬空构件)
    this.buildBrewsterPolarizerStage();

    // D. 360° 外周分度旋转起偏器座 P1 (Thorlabs 级万向光学镜架)
    this.buildRotaryPolarizerStage();

    // E. 中央五工位双折射波片、冰洲石晶体与光弹应力加载转换台
    this.buildCentralSampleTurretStage();

    // F. 360° 外周分度旋转检偏器座 P2 与正面倾斜快捷定位台
    this.buildRotaryAnalyzerStage();

    // G. 右侧深海蓝黑全景偏振/马吕斯曲线/光弹图谱接收屏与前向集成光强柱状计
    this.buildObservationScreenAndPhotodiode();

    // H. 3D 空间四区电磁横波、圆偏振螺旋波、冰洲石双光束与正交矢量分解系统
    this.buildElectromagneticWavesSystem();
  }

  // ==================== A. 航天级阳极氧化银铝光学导轨底座 ====================
  private buildOpticalBenchBed(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'PolarizationBenchBedGroup';

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.35,
      roughness: 0.28,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.24,
      roughness: 0.42,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.75,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.44,
      roughness: 0.24,
    });

    // 1. 导轨床身主体
    const railBodyGeo = createChamferedBlockGeometry(this.railLength, this.railHeight, this.railWidth, 0.0022);
    const railBody = new THREE.Mesh(railBodyGeo, satinSilverMat);
    railBody.position.set(0, this.railHeight * 0.5, 0);
    railBody.castShadow = true;
    railBody.receiveShadow = true;
    this.railGroup.add(railBody);

    // 顶面中央消光凹槽
    const topGrooveGeo = new THREE.BoxGeometry(this.railLength - 0.01, 0.003, this.railWidth * 0.42);
    const topGroove = new THREE.Mesh(topGrooveGeo, titaniumSlateMat);
    topGroove.position.set(0, this.railHeight + 0.0005, 0);
    this.railGroup.add(topGroove);

    // 2. 顶部双平行镜面液态铬导向滑杆
    const rodRadius = 0.0044;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, this.railLength + 0.016, 32);
    rodGeo.rotateZ(Math.PI / 2);
    const frontRod = new THREE.Mesh(rodGeo, chromeRodMat);
    frontRod.position.set(0, this.railHeight + rodRadius * 0.7, this.railWidth * 0.30);
    const backRod = new THREE.Mesh(rodGeo, chromeRodMat);
    backRod.position.set(0, this.railHeight + rodRadius * 0.7, -this.railWidth * 0.30);
    this.railGroup.add(frontRod);
    this.railGroup.add(backRod);

    // 3. 两端深空钛晶灰蓝端盖与香槟金调平减震支脚
    const endCapW = 0.026;
    const endCapH = this.railHeight + 0.008;
    const endCapD = this.railWidth + 0.008;
    const endCapGeo = createChamferedBlockGeometry(endCapW, endCapH, endCapD, 0.0018);
    const xEnds = [-this.railLength * 0.5 - endCapW * 0.5, this.railLength * 0.5 + endCapW * 0.5];

    xEnds.forEach((xPos) => {
      const endCap = new THREE.Mesh(endCapGeo, titaniumSlateMat);
      endCap.position.set(xPos, this.railHeight * 0.5, 0);
      endCap.castShadow = true;
      this.railGroup.add(endCap);

      const stopScrewGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.018, 24);
      const stopScrew = new THREE.Mesh(stopScrewGeo, brassMat);
      stopScrew.position.set(xPos, this.railHeight + 0.013, 0);
      this.railGroup.add(stopScrew);

      const crossFootD = 0.152;
      const crossFootGeo = createChamferedBlockGeometry(0.028, 0.014, crossFootD, 0.0015);
      const crossFoot = new THREE.Mesh(crossFootGeo, titaniumSlateMat);
      crossFoot.position.set(xPos, 0.002, 0);
      crossFoot.castShadow = true;
      this.railGroup.add(crossFoot);

      [-crossFootD * 0.40, crossFootD * 0.40].forEach((zPos) => {
        const studGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.024, 16);
        const stud = new THREE.Mesh(studGeo, chromeRodMat);
        stud.position.set(xPos, -0.008, zPos);
        this.railGroup.add(stud);

        const lockNutGeo = new THREE.CylinderGeometry(0.0082, 0.0082, 0.006, 6);
        const lockNut = new THREE.Mesh(lockNutGeo, brassMat);
        lockNut.position.set(xPos, -0.002, zPos);
        this.railGroup.add(lockNut);

        const footPadGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.009, 28);
        const footPad = new THREE.Mesh(footPadGeo, brassMat);
        footPad.position.set(xPos, -0.018, zPos);
        this.railGroup.add(footPad);
      });
    });

    // 4. 正面深海蓝底白字高对比激光蚀刻 0~100cm 标尺
    this.railScaleCanvas = safeCanvas(2048, 128);
    if (this.railScaleCanvas) {
      const ctx = this.railScaleCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 2048, 128);

        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, 0, 2048, 4);
        ctx.fillRect(0, 124, 2048, 4);

        ctx.strokeStyle = '#f8fafc';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 32px -apple-system, "SF Mono", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const scaleStartX = 60;
        const scaleEndX = 1920;
        const scaleSpan = scaleEndX - scaleStartX;

        for (let cm = 0; cm <= 100; cm++) {
          const pxCm = scaleStartX + (cm / 100) * scaleSpan;
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(pxCm, 4);
          ctx.lineTo(pxCm, 48);
          ctx.stroke();

          if (cm % 10 === 0) {
            ctx.fillText(`${cm}`, pxCm, 58);
          }

          if (cm < 100) {
            for (let mm = 1; mm < 10; mm++) {
              const pxMm = pxCm + (mm / 10) * (scaleSpan / 100);
              const is5 = mm === 5;
              ctx.lineWidth = is5 ? 2.0 : 1.2;
              ctx.beginPath();
              ctx.moveTo(pxMm, 4);
              ctx.lineTo(pxMm, is5 ? 32 : 18);
              ctx.stroke();
            }
          }
        }
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 30px "SF Mono", sans-serif';
        ctx.fillText('cm', scaleEndX + 56, 58);
      }
      this.railScaleTexture = new THREE.CanvasTexture(this.railScaleCanvas);
      this.railScaleTexture.anisotropy = 8;

      const scalePlateGeo = new THREE.PlaneGeometry(this.railLength * 0.96, this.railHeight * 0.64);
      const scalePlateMat = new THREE.MeshStandardMaterial({
        map: this.railScaleTexture,
        roughness: 0.30,
        metalness: 0.15,
      });
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.502);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 左侧双环 CNC 万向调心自然光/激光发射舱与人体工学控制台 ====================
  private buildUnpolarizedLightEmitter(): void {
    const saddleData = this.createSliderSaddle(this.emitterX, 'UnpolarizedEmitterGroup', 0.122, 0.074);
    this.emitterGroup = saddleData.saddleGroup;

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.24,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.75,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.44,
      roughness: 0.24,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.08,
    });

    // 1. 双环调心架底部承载横梁平台
    const cradleGeo = createChamferedBlockGeometry(0.132, 0.013, 0.064, 0.0014);
    const cradle = new THREE.Mesh(cradleGeo, titaniumSlateMat);
    cradle.position.set(0, this.beamCenterY - 0.042, 0);
    cradle.castShadow = true;
    this.emitterGroup.add(cradle);

    // 2. 前后两座 CNC 精铣万向调心圆环架 + 6 枚 120° 径向香槟金调心顶丝
    [-0.042, 0.032].forEach((rx) => {
      const supportGeo = createChamferedBlockGeometry(0.012, 0.018, 0.026, 0.001);
      const support = new THREE.Mesh(supportGeo, satinSilverMat);
      support.position.set(rx, this.beamCenterY - 0.030, 0);
      this.emitterGroup.add(support);

      const ringGeo = new THREE.TorusGeometry(0.029, 0.0042, 16, 36);
      ringGeo.rotateY(Math.PI / 2);
      const ringMesh = new THREE.Mesh(ringGeo, titaniumSlateMat);
      ringMesh.position.set(rx, this.beamCenterY, 0);
      ringMesh.castShadow = true;
      this.emitterGroup.add(ringMesh);

      const angles = [Math.PI * 0.5, Math.PI * (0.5 + 2 / 3), Math.PI * (0.5 + 4 / 3)];
      angles.forEach((ang) => {
        const yOff = Math.sin(ang);
        const zOff = Math.cos(ang);
        const screwGroup = new THREE.Group();
        screwGroup.position.set(rx, this.beamCenterY + yOff * 0.031, zOff * 0.031);
        screwGroup.rotation.x = Math.atan2(zOff, yOff);

        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0020, 0.0020, 0.012, 12),
          chromeRodMat
        );
        const head = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0045, 0.0045, 0.0055, 18),
          brassMat
        );
        head.position.set(0, 0.007, 0);
        screwGroup.add(shaft);
        screwGroup.add(head);
        this.emitterGroup.add(screwGroup);
      });
    });

    // 3. 中央圆筒形非偏振自然光/激光谐振腔管体 (航天级喷砂银铝主筒 + 8道环形散热鳍片 + 香槟金铭牌环)
    const barrelLen = 0.142;
    const barrelRadius = 0.020;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLen, 36);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, satinSilverMat);
    barrel.position.set(0, this.beamCenterY, 0);
    barrel.castShadow = true;
    this.emitterGroup.add(barrel);

    for (let i = 0; i < 8; i++) {
      const finGeo = new THREE.CylinderGeometry(barrelRadius + 0.0026, barrelRadius + 0.0026, 0.003, 36);
      finGeo.rotateZ(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, titaniumSlateMat);
      fin.position.set(-0.056 + i * 0.0065, this.beamCenterY, 0);
      this.emitterGroup.add(fin);
    }

    const bandGeo = new THREE.CylinderGeometry(barrelRadius + 0.0008, barrelRadius + 0.0008, 0.016, 36);
    bandGeo.rotateZ(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, brassMat);
    band.position.set(0.004, this.beamCenterY, 0);
    this.emitterGroup.add(band);

    // 4. 前置准直光学物镜筒与香槟金出光压圈 (+X 端)
    const nozzleGeo = new THREE.CylinderGeometry(0.0155, 0.019, 0.018, 32);
    nozzleGeo.rotateZ(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, titaniumSlateMat);
    nozzle.position.set(barrelLen * 0.5 + 0.004, this.beamCenterY, 0);
    this.emitterGroup.add(nozzle);

    const brassRingGeo = new THREE.TorusGeometry(0.0145, 0.0028, 16, 32);
    brassRingGeo.rotateY(Math.PI / 2);
    const brassRing = new THREE.Mesh(brassRingGeo, brassMat);
    brassRing.position.set(barrelLen * 0.5 + 0.012, this.beamCenterY, 0);
    this.emitterGroup.add(brassRing);

    const lensGeo = new THREE.CircleGeometry(0.0125, 32);
    lensGeo.rotateY(Math.PI / 2);
    this.laserLedMesh = new THREE.Mesh(
      lensGeo,
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.96,
      })
    );
    this.laserLedMesh.position.set(barrelLen * 0.5 + 0.013, this.beamCenterY, 0);
    this.emitterGroup.add(this.laserLedMesh);

    // 5. 尾部香槟金航空锁紧接头与柔性同轴电源线
    const rearCapGeo = new THREE.CylinderGeometry(0.011, 0.014, 0.012, 24);
    rearCapGeo.rotateZ(Math.PI / 2);
    const rearCap = new THREE.Mesh(rearCapGeo, brassMat);
    rearCap.position.set(-barrelLen * 0.5 - 0.006, this.beamCenterY, 0);
    this.emitterGroup.add(rearCap);

    const cableCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-barrelLen * 0.5 - 0.014, this.beamCenterY, 0),
      new THREE.Vector3(-barrelLen * 0.5 - 0.060, this.beamCenterY - 0.030, -0.020),
      new THREE.Vector3(-barrelLen * 0.5 - 0.095, this.beamCenterY - 0.110, -0.035),
      new THREE.Vector3(-barrelLen * 0.5 - 0.120, 0.020, -0.055)
    );
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 24, 0.0032, 12, false), cableMat);
    this.emitterGroup.add(cable);

    // 6. 正面 (+Z) 24° 人体工学倾斜式波长与电源控制面板 (安装在承载平台前缘，正对操作者)
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(0, this.beamCenterY - 0.038, 0.038);
    consoleGroup.rotation.x = 0.42;
    this.emitterGroup.add(consoleGroup);

    const panelGeo = createChamferedBlockGeometry(0.112, 0.008, 0.026, 0.0012);
    const panelMesh = new THREE.Mesh(panelGeo, titaniumSlateMat);
    consoleGroup.add(panelMesh);

    // 红色翘板电源开关
    const switchBase = new THREE.Mesh(
      createChamferedBlockGeometry(0.018, 0.004, 0.012, 0.0005),
      satinSilverMat
    );
    switchBase.position.set(-0.038, 0.005, 0);
    consoleGroup.add(switchBase);

    this.laserSwitchMesh = new THREE.Mesh(
      createChamferedBlockGeometry(0.013, 0.0055, 0.009, 0.0005),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.35, roughness: 0.25 })
    );
    this.laserSwitchMesh.name = 'LaserPowerSwitch';
    this.laserSwitchMesh.userData = { interactiveId: 'laser_power' };
    this.laserSwitchMesh.position.set(-0.038, 0.0075, 0);
    this.laserSwitchMesh.rotation.z = -0.25;
    consoleGroup.add(this.laserSwitchMesh);

    // 3 枚单色波长切换键 (650nm, 532nm, 405nm)
    const wavelengths = [650, 532, 405];
    wavelengths.forEach((wl, idx) => {
      const btnGeo = new THREE.CylinderGeometry(0.0048, 0.0054, 0.006, 20);
      const c = OpticalPhysics.wavelengthToColor(wl);
      const btnMesh = new THREE.Mesh(
        btnGeo,
        new THREE.MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: wl === this.wavelengthNm ? 0.65 : 0.1,
          metalness: 0.55,
          roughness: 0.22,
        })
      );
      btnMesh.name = `WavelengthBtn_${wl}`;
      btnMesh.userData = { interactiveId: `laser_wavelength_${wl}`, wavelength: wl };
      btnMesh.position.set(-0.012 + idx * 0.017, 0.006, 0);
      consoleGroup.add(btnMesh);
      this.wlButtons[wl] = btnMesh;
    });

    // 右侧复合白光轻触键 (带香槟金底座环)
    const whiteRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0064, 0.0068, 0.004, 24),
      brassMat
    );
    whiteRim.position.set(0.041, 0.005, 0);
    whiteRim.userData = { interactiveId: 'source_white' };
    consoleGroup.add(whiteRim);

    this.whiteLightBtnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0048, 0.0050, 0.0065, 24),
      new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.20, metalness: 0.45 })
    );
    this.whiteLightBtnMesh.name = 'SourceWhiteButton';
    this.whiteLightBtnMesh.userData = { interactiveId: 'source_white' };
    this.whiteLightBtnMesh.position.set(0.041, 0.0065, 0);
    consoleGroup.add(this.whiteLightBtnMesh);

    this.group.add(this.emitterGroup);
  }

  // ==================== C. 可切入光路的布儒斯特角 (Brewster's Angle) 玻片起偏台 ====================
  private buildBrewsterPolarizerStage(): void {
    this.brewsterGroup = new THREE.Group();
    this.brewsterGroup.name = 'BrewsterPolarizerGroup';
    this.brewsterGroup.position.set(this.brewsterCenterX, 0, 0);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.28,
      roughness: 0.38,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.46,
      roughness: 0.22,
    });

    // 1. 低剖面导轨固定滑座与正前方切入旋钮
    const baseGeo = createChamferedBlockGeometry(0.040, 0.018, 0.076, 0.0014);
    const baseMesh = new THREE.Mesh(baseGeo, titaniumSlateMat);
    baseMesh.position.set(0, this.railHeight + 0.009, 0);
    this.brewsterGroup.add(baseMesh);

    const knobBuilt = this.createMitutoyoMicrometerAssembly('brewster_toggle', 'BrewsterToggleKnob');
    knobBuilt.group.position.set(0, this.railHeight + 0.009, 0.036);
    this.brewsterToggleKnob = knobBuilt.rotatingKnob;
    this.brewsterHoverCue = knobBuilt.hoverCue;
    this.brewsterGroup.add(knobBuilt.group);

    // 2. 完整刚性连接的布儒斯特玻片堆与 C 型反射探头支架 (未启用时完全隐藏，保持第一区全向星芒自然光路 100% 纯净通透)
    this.brewsterPivotArm = new THREE.Group();
    this.brewsterPivotArm.name = 'BrewsterPivotArm';
    this.brewsterPivotArm.userData = { interactiveId: 'brewster_toggle' };
    this.brewsterPivotArm.position.set(0, this.railHeight + 0.018, 0);

    const postH = this.beamCenterY - (this.railHeight + 0.018);
    const postMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, postH, 24),
      satinSilverMat
    );
    postMesh.position.set(0, postH * 0.5, 0);
    this.brewsterPivotArm.add(postMesh);

    // U型夹持轭与布儒斯特角 (θ_B = 56.6°) 光学玻片堆 (严格在 Z=0 光轴平面内，绝无悬空偏移)
    const plateHolderGroup = new THREE.Group();
    plateHolderGroup.position.set(0, postH, 0);
    const brewsterRad = THREE.MathUtils.degToRad(this.brewsterIncidentAngleDeg);
    plateHolderGroup.rotation.z = Math.PI * 0.5 - brewsterRad;

    const glassGeo = createChamferedBlockGeometry(0.048, 0.005, 0.032, 0.0006);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.04,
      metalness: 0.05,
      transmission: 0.88,
      transparent: true,
      opacity: 0.62,
      ior: 1.517,
      depthWrite: false,
    });
    this.brewsterGlassMesh = new THREE.Mesh(glassGeo, glassMat);
    this.brewsterGlassMesh.name = 'BrewsterGlassStackMesh';
    this.brewsterGlassMesh.userData = { interactiveId: 'brewster_toggle' };
    plateHolderGroup.add(this.brewsterGlassMesh);

    for (const endSide of [-1, 1]) {
      const clip = new THREE.Mesh(
        createChamferedBlockGeometry(0.005, 0.009, 0.036, 0.0006),
        brassMat
      );
      clip.position.set(endSide * 0.024, 0, 0);
      plateHolderGroup.add(clip);
    }
    this.brewsterPivotArm.add(plateHolderGroup);

    // 实心连杆支撑的顶部反射 s-偏振探头 (通过刚性斜臂直接与立柱顶部相连，杜绝悬空)
    const reflAngle = Math.PI - 2.0 * brewsterRad;
    const armLen = 0.062;
    const cArmGroup = new THREE.Group();
    cArmGroup.position.set(0, postH, -0.016);
    cArmGroup.rotation.z = reflAngle - Math.PI * 0.5;

    const strutMesh = new THREE.Mesh(
      createChamferedBlockGeometry(0.007, armLen, 0.006, 0.0008),
      satinSilverMat
    );
    strutMesh.position.set(0, armLen * 0.5, 0);
    cArmGroup.add(strutMesh);

    const sensorHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.011, 0.016, 24),
      titaniumSlateMat
    );
    sensorHead.position.set(0, armLen, 0.016);
    cArmGroup.add(sensorHead);

    const sensorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.009, 0.0016, 12, 24),
      brassMat
    );
    sensorRing.rotation.x = Math.PI / 2;
    sensorRing.position.set(0, armLen - 0.008, 0.016);
    cArmGroup.add(sensorRing);

    this.brewsterPivotArm.add(cArmGroup);
    this.brewsterGroup.add(this.brewsterPivotArm);
    this.group.add(this.brewsterGroup);
  }

  // ==================== D. 360° 外周分度旋转起偏器座 P1 (Thorlabs 级万向光学镜架) ====================
  private buildRotaryPolarizerStage(): void {
    const built = this.createThorlabsPolarizerMount(
      this.polarizerX,
      'polarizer',
      0x38bdf8 // 荧光青蓝透振轴标识
    );
    this.polarizerStageGroup = built.stageGroup;
    this.polarizerRotorGroup = built.rotorGroup;
    this.polarizerCrystalMesh = built.crystalMesh;
    this.polarizerMicrometerKnob = built.micrometerKnob;
    this.polarizerFrontPointer = built.frontPointer;
    this.polarizerHoverCue = built.hoverCue;

    this.group.add(this.polarizerStageGroup);
  }

  // ==================== F. 360° 外周分度旋转检偏器座 P2 与倾斜快捷定位台 ====================
  private buildRotaryAnalyzerStage(): void {
    const built = this.createThorlabsPolarizerMount(
      this.analyzerX,
      'analyzer',
      0xfbbf24 // 香槟琥珀金检偏轴标识
    );
    this.analyzerStageGroup = built.stageGroup;
    this.analyzerRotorGroup = built.rotorGroup;
    this.analyzerCrystalMesh = built.crystalMesh;
    this.analyzerMicrometerKnob = built.micrometerKnob;
    this.analyzerFrontPointer = built.frontPointer;
    this.analyzerHoverCue = built.hoverCue;

    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.26,
      roughness: 0.38,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    // 在检偏器滑鞍正面 (+Z) 安装一座 24° 倾斜式精密快捷定位按键面板：0°(平行最亮)、45°(半透射)、90°(正交消光)
    const presetConsole = new THREE.Group();
    presetConsole.position.set(0, this.railHeight + 0.022, 0.038);
    presetConsole.rotation.x = 0.42;
    this.analyzerStageGroup.add(presetConsole);

    const consolePlate = new THREE.Mesh(
      createChamferedBlockGeometry(0.062, 0.006, 0.020, 0.001),
      titaniumSlateMat
    );
    presetConsole.add(consolePlate);

    const createPresetBtn = (xOff: number, colorHex: number, name: string, interactiveId: string) => {
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0054, 0.0058, 0.0035, 20),
        brassMat
      );
      rim.position.set(xOff, 0.004, 0);
      rim.userData = { interactiveId };
      presetConsole.add(rim);

      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0040, 0.0042, 0.0055, 20),
        new THREE.MeshStandardMaterial({
          color: colorHex,
          emissive: colorHex,
          emissiveIntensity: 0.55,
          metalness: 0.45,
          roughness: 0.22,
        })
      );
      btn.name = name;
      btn.userData = { interactiveId };
      btn.position.set(xOff, 0.0052, 0);
      presetConsole.add(btn);
      return btn;
    };

    this.presetParallelBtnMesh = createPresetBtn(-0.019, 0x22c55e, 'PresetParallelButton', 'preset_parallel');
    this.preset45BtnMesh = createPresetBtn(0.0, 0x38bdf8, 'Preset45Button', 'preset_45');
    this.presetCrossedBtnMesh = createPresetBtn(0.019, 0xf43f5e, 'PresetCrossedButton', 'preset_crossed');

    this.group.add(this.analyzerStageGroup);
  }

  /**
   * 构造 Thorlabs 级 360° 外周激光分度万向旋转偏振镜架总成
   * 彻底摒弃粗糙方块立柱与突兀外挂小表盘，将 360° 刻度盘直接集成于镜架圆环外侧面，并配备 Mitutoyo 差动测微螺杆
   */
  private createThorlabsPolarizerMount(
    xPos: number,
    role: 'polarizer' | 'analyzer',
    accentColorHex: number
  ): {
    stageGroup: THREE.Group;
    rotorGroup: THREE.Group;
    crystalMesh: THREE.Mesh;
    micrometerKnob: THREE.Mesh;
    frontPointer: THREE.Mesh;
    hoverCue: THREE.Mesh;
  } {
    const saddleData = this.createSliderSaddle(
      xPos,
      role === 'polarizer' ? 'PolarizerStageGroup' : 'AnalyzerStageGroup',
      0.080
    );
    const stageGroup = saddleData.saddleGroup;
    const interactiveRotorId = role === 'polarizer' ? 'polarizer_rotor' : 'analyzer_rotor';
    const interactiveKnobId = role === 'polarizer' ? 'polarizer_micrometer' : 'analyzer_micrometer';

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.26,
      roughness: 0.40,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    const outerR = 0.048;
    const innerR = 0.035;

    // 1. 底部 U 型半圆托架支座 (衔接镜面不锈钢立柱与圆形光学镜架)
    const yokeBase = new THREE.Mesh(
      createChamferedBlockGeometry(0.016, 0.014, 0.054, 0.0012),
      titaniumSlateMat
    );
    yokeBase.position.set(0, this.beamCenterY - outerR - 0.005, 0);
    stageGroup.add(yokeBase);

    // 2. 航天银铝中空主轴定子外环 (微向操作者视线 +Z 偏转 -14°，使操作者正视即可清晰观测刻度环、内部线栅与透振轴矢量箭头)
    const housingPivot = new THREE.Group();
    housingPivot.position.set(0, this.beamCenterY, 0);
    housingPivot.rotation.y = -0.22;
    stageGroup.add(housingPivot);

    const statorGeo = createHollowRingFrameGeometry(outerR, innerR, 0.014, 0.0014, 64);
    statorGeo.rotateY(Math.PI / 2);
    const statorMesh = new THREE.Mesh(statorGeo, satinSilverMat);
    statorMesh.castShadow = true;
    housingPivot.add(statorMesh);

    // 定子侧面集成式 360° 蓝宝石激光蚀刻分度圆环贴图 (直接镶嵌于镜架定子正反环面)
    const dialTex = this.getOrCreateRingDialTexture();
    if (dialTex) {
      const dialRingGeo = new THREE.RingGeometry(innerR + 0.001, outerR - 0.0015, 64);
      dialRingGeo.rotateY(Math.PI / 2);
      const dialRingMat = new THREE.MeshBasicMaterial({
        map: dialTex,
        side: THREE.DoubleSide,
      });
      const dialFront = new THREE.Mesh(dialRingGeo, dialRingMat);
      dialFront.position.set(0.0072, 0, 0);
      dialFront.userData = { interactiveId: interactiveRotorId };
      housingPivot.add(dialFront);

      const dialBack = new THREE.Mesh(dialRingGeo, dialRingMat);
      dialBack.position.set(-0.0072, 0, 0);
      dialBack.userData = { interactiveId: interactiveRotorId };
      housingPivot.add(dialBack);
    }

    // 顶部香槟金精密止动锁紧螺钉
    const topLock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 24),
      brassMat
    );
    topLock.position.set(0, outerR + 0.006, 0);
    housingPivot.add(topLock);

    // 3. 沿光轴旋转的内转子总成 (包含香槟金压圈、二向色性微纳线栅晶片与发光透振轴双向箭头)
    const rotorGroup = new THREE.Group();
    rotorGroup.name = role === 'polarizer' ? 'PolarizerRotorGroup' : 'AnalyzerRotorGroup';
    rotorGroup.userData = { interactiveId: interactiveRotorId };
    housingPivot.add(rotorGroup);

    const innerBezelGeo = new THREE.TorusGeometry(innerR - 0.0005, 0.0024, 16, 56);
    innerBezelGeo.rotateY(Math.PI / 2);
    const innerBezel = new THREE.Mesh(innerBezelGeo, brassMat);
    innerBezel.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(innerBezel);

    // 外圈同步旋转游标读数指针三角形
    const frontPointer = new THREE.Mesh(
      createChamferedBlockGeometry(0.016, 0.003, 0.003, 0.0004),
      new THREE.MeshBasicMaterial({ color: accentColorHex })
    );
    frontPointer.position.set(0, innerR + 0.005, 0);
    frontPointer.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(frontPointer);

    // 偏振光学玻璃晶片
    const crystalGeo = new THREE.CylinderGeometry(innerR - 0.002, innerR - 0.002, 0.0035, 48);
    crystalGeo.rotateZ(Math.PI / 2);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.04,
      metalness: 0.05,
      transmission: 0.88,
      transparent: true,
      opacity: 0.38,
      ior: 1.52,
      depthWrite: false,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.name = role === 'polarizer' ? 'PolarizerCrystalMesh' : 'AnalyzerCrystalMesh';
    crystalMesh.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(crystalMesh);

    // 晶片内部激光蚀刻微纳导电线栅
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    for (let g = -4; g <= 4; g++) {
      if (g === 0) continue;
      const zOff = g * 0.0062;
      const halfChord = Math.sqrt(Math.max(0.0001, Math.pow(innerR - 0.005, 2) - zOff * zOff));
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0004, 0.0004, halfChord * 1.90, 8),
        gridMat
      );
      wire.position.set(0, 0, zOff);
      wire.userData = { interactiveId: interactiveRotorId };
      rotorGroup.add(wire);
    }

    // 透振轴高亮双向发光矢量箭头
    const arrowMat = new THREE.MeshBasicMaterial({
      color: accentColorHex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0013, 0.0013, (innerR - 0.006) * 1.72, 12),
      arrowMat
    );
    shaft.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(shaft);

    const coneGeo = new THREE.ConeGeometry(0.0038, 0.0085, 14);
    const topCone = new THREE.Mesh(coneGeo, arrowMat);
    topCone.position.set(0, innerR - 0.006, 0);
    topCone.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(topCone);

    const botCone = new THREE.Mesh(coneGeo, arrowMat);
    botCone.rotation.z = Math.PI;
    botCone.position.set(0, -(innerR - 0.006), 0);
    botCone.userData = { interactiveId: interactiveRotorId };
    rotorGroup.add(botCone);

    // 4. 前侧 (+Z) Mitutoyo 精密差动测微螺杆鼓轮总成
    const micro = this.createMitutoyoMicrometerAssembly(
      interactiveKnobId,
      role === 'polarizer' ? 'PolarizerMicrometerKnob' : 'AnalyzerMicrometerKnob'
    );
    micro.group.position.set(0, this.beamCenterY - 0.024, outerR + 0.002);
    stageGroup.add(micro.group);

    return {
      stageGroup,
      rotorGroup,
      crystalMesh,
      micrometerKnob: micro.rotatingKnob,
      frontPointer,
      hoverCue: micro.hoverCue,
    };
  }

  // ==================== E. 中央五工位波片、冰洲石双折射与光弹应力转换实验台 ====================
  private buildCentralSampleTurretStage(): void {
    const saddleData = this.createSliderSaddle(
      this.sampleStageX,
      'CentralSampleTurretStageGroup',
      0.080
    );
    this.sampleStageGroup = saddleData.saddleGroup;

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.26,
      roughness: 0.40,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.80,
      roughness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    const outerR = 0.048;
    const innerR = 0.035;

    // 1. 底部 U 型半圆托架支座
    const yokeBase = new THREE.Mesh(
      createChamferedBlockGeometry(0.016, 0.014, 0.056, 0.0012),
      titaniumSlateMat
    );
    yokeBase.position.set(0, this.beamCenterY - outerR - 0.005, 0);
    this.sampleStageGroup.add(yokeBase);

    // 2. 中央万向主外环 (微向操作者 +Z 偏转 -14°，保持与 P1/P2 视觉韵律一致)
    const centerHousing = new THREE.Group();
    centerHousing.position.set(0, this.beamCenterY, 0);
    centerHousing.rotation.y = -0.22;
    this.sampleStageGroup.add(centerHousing);

    const centerRingGeo = createHollowRingFrameGeometry(outerR, innerR, 0.014, 0.0014, 64);
    centerRingGeo.rotateY(Math.PI / 2);
    const centerRing = new THREE.Mesh(centerRingGeo, satinSilverMat);
    centerRing.castShadow = true;
    centerHousing.add(centerRing);

    const dialTex = this.getOrCreateRingDialTexture();
    if (dialTex) {
      const dialRingGeo = new THREE.RingGeometry(innerR + 0.001, outerR - 0.0015, 64);
      dialRingGeo.rotateY(Math.PI / 2);
      const dialMat = new THREE.MeshBasicMaterial({ map: dialTex, side: THREE.DoubleSide });
      const dialFront = new THREE.Mesh(dialRingGeo, dialMat);
      dialFront.position.set(0.0072, 0, 0);
      centerHousing.add(dialFront);
    }

    // 3. 后侧 (-Z)：精密香槟金 16 槽滚花五档转换轮与弹簧定位钢珠 (彻底取代廉价五色圆点风车造型)
    this.sampleTurretWheel = new THREE.Group();
    this.sampleTurretWheel.name = 'SampleTurretWheel';
    this.sampleTurretWheel.userData = { interactiveId: 'sample_turret' };
    this.sampleTurretWheel.position.set(0, this.beamCenterY - 0.024, -outerR - 0.012);

    const wheelGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.013, 32);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMesh = new THREE.Mesh(wheelGeo, brassMat);
    wheelMesh.userData = { interactiveId: 'sample_turret' };
    this.sampleTurretWheel.add(wheelMesh);

    for (let f = 0; f < 16; f++) {
      const fAngle = (f / 16) * Math.PI * 2;
      const fluteGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.0132, 8);
      fluteGeo.rotateX(Math.PI / 2);
      const flute = new THREE.Mesh(fluteGeo, brassMat);
      flute.position.set(Math.cos(fAngle) * 0.0142, Math.sin(fAngle) * 0.0142, 0);
      flute.userData = { interactiveId: 'sample_turret' };
      this.sampleTurretWheel.add(flute);
    }

    const wheelCapGeo = new THREE.CylinderGeometry(0.0078, 0.0078, 0.015, 24);
    wheelCapGeo.rotateX(Math.PI / 2);
    const wheelCap = new THREE.Mesh(wheelCapGeo, chromeMat);
    wheelCap.userData = { interactiveId: 'sample_turret' };
    this.sampleTurretWheel.add(wheelCap);

    // 5 档激光分度刻槽标识
    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * Math.PI * 2;
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.0008, 0.0038, 0.0006),
        titaniumSlateMat
      );
      tick.position.set(Math.cos(ang) * 0.0105, Math.sin(ang) * 0.0105, 0.0068);
      tick.rotation.z = ang;
      this.sampleTurretWheel.add(tick);
    }
    this.sampleStageGroup.add(this.sampleTurretWheel);

    // 顶部机械弹簧钢珠定位销
    const detentPin = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 16, 16), chromeMat);
    detentPin.position.set(0, this.beamCenterY - 0.024 + 0.015, -outerR - 0.012);
    this.sampleStageGroup.add(detentPin);

    // 转换轮 3D 悬停引导光晕环
    const turretCueGeo = new THREE.TorusGeometry(0.018, 0.0007, 16, 48, Math.PI * 1.65);
    this.sampleTurretHoverCue = new THREE.Mesh(
      turretCueGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.90, depthWrite: false })
    );
    this.sampleTurretHoverCue.position.set(0, this.beamCenterY - 0.024, -outerR - 0.012);
    this.sampleTurretHoverCue.visible = false;
    this.sampleStageGroup.add(this.sampleTurretHoverCue);

    // 4. 前侧 (+Z)：Mitutoyo 差动测微鼓轮总成 (调节波片快轴 / 冰洲石主截面角 θ_WP)
    const wpMicro = this.createMitutoyoMicrometerAssembly('waveplate_knob', 'WaveplateMicrometerKnob');
    wpMicro.group.position.set(0, this.beamCenterY - 0.024, outerR + 0.002);
    this.waveplateMicrometerKnob = wpMicro.rotatingKnob;
    this.waveplateHoverCue = wpMicro.hoverCue;
    this.sampleStageGroup.add(wpMicro.group);

    // 5. 子模块 1: λ/4 与 λ/2 石英双折射相位延迟波片转芯 (waveplateMountGroup)
    this.waveplateMountGroup = new THREE.Group();
    this.waveplateMountGroup.name = 'WaveplateMountGroup';
    centerHousing.add(this.waveplateMountGroup);

    const wpBezel = new THREE.Mesh(
      new THREE.TorusGeometry(innerR - 0.0005, 0.0024, 16, 48),
      brassMat
    );
    wpBezel.rotation.y = Math.PI / 2;
    this.waveplateMountGroup.add(wpBezel);

    const wpCrystalGeo = new THREE.CylinderGeometry(innerR - 0.002, innerR - 0.002, 0.004, 48);
    wpCrystalGeo.rotateZ(Math.PI / 2);
    const wpCrystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x67e8f9,
      roughness: 0.03,
      metalness: 0.05,
      transmission: 0.88,
      transparent: true,
      opacity: 0.45,
      ior: 1.544,
      depthWrite: false,
    });
    this.waveplateCrystalMesh = new THREE.Mesh(wpCrystalGeo, wpCrystalMat);
    this.waveplateCrystalMesh.name = 'WaveplateCrystalMesh';
    this.waveplateCrystalMesh.userData = { interactiveId: 'waveplate_knob' };
    this.waveplateMountGroup.add(this.waveplateCrystalMesh);

    // 波片快轴 (Fast Axis) 与慢轴 (Slow Axis) 正交十字激光刻线
    const fastAxisBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0012, (innerR - 0.005) * 1.85, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95, depthWrite: false })
    );
    fastAxisBar.userData = { interactiveId: 'waveplate_knob' };
    this.waveplateCrystalMesh.add(fastAxisBar);

    const slowAxisGeo = new THREE.CylinderGeometry(0.0008, 0.0008, (innerR - 0.005) * 1.85, 10);
    slowAxisGeo.rotateX(Math.PI / 2);
    const slowAxisBar = new THREE.Mesh(
      slowAxisGeo,
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.72, depthWrite: false })
    );
    slowAxisBar.userData = { interactiveId: 'waveplate_knob' };
    this.waveplateCrystalMesh.add(slowAxisBar);

    // 6. 子模块 2: 天然冰洲石 (Iceland Spar Calcite, CaCO3) 双折射菱面体斜晶座 (calciteCrystalGroup)
    this.calciteCrystalGroup = new THREE.Group();
    this.calciteCrystalGroup.name = 'CalciteCrystalGroup';
    centerHousing.add(this.calciteCrystalGroup);

    const calciteGeo = createRhombohedralCalciteGeometry(0.046, 0.044, 0.038, 0.011, 0.0014);
    const calciteMat = new THREE.MeshPhysicalMaterial({
      color: 0xfef9c3,
      roughness: 0.03,
      metalness: 0.04,
      transmission: 0.90,
      transparent: true,
      opacity: 0.50,
      ior: 1.658,
      depthWrite: false,
    });
    this.calciteCrystalMesh = new THREE.Mesh(calciteGeo, calciteMat);
    this.calciteCrystalMesh.name = 'CalciteCrystalMesh';
    this.calciteCrystalMesh.userData = { interactiveId: 'waveplate_knob' };
    this.calciteCrystalGroup.add(this.calciteCrystalMesh);

    for (const ySign of [-1, 1]) {
      const cap = new THREE.Mesh(
        createChamferedBlockGeometry(0.048, 0.004, 0.040, 0.0008),
        brassMat
      );
      cap.position.set(ySign * 0.0055, ySign * 0.0235, 0);
      this.calciteCrystalMesh.add(cap);
    }

    // 7. 子模块 3: 光弹应力双折射机械加压龙门与透明聚碳酸酯承压构件 (photoelasticFrameGroup)
    this.photoelasticFrameGroup = new THREE.Group();
    this.photoelasticFrameGroup.name = 'PhotoelasticStressFrameGroup';
    centerHousing.add(this.photoelasticFrameGroup);

    // 顶部香槟金应力加载测微螺杆手轮 (镶嵌在圆环顶端)
    this.stressLoadScrewKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.012, 28),
      brassMat
    );
    this.stressLoadScrewKnob.name = 'StressLoadScrewKnob';
    this.stressLoadScrewKnob.userData = { interactiveId: 'stress_screw' };
    this.stressLoadScrewKnob.position.set(0, outerR + 0.012, 0);
    this.photoelasticFrameGroup.add(this.stressLoadScrewKnob);

    const screwStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.024, 16),
      chromeMat
    );
    screwStem.position.set(0, outerR - 0.002, 0);
    this.photoelasticFrameGroup.add(screwStem);

    // 压头块 (Anvil)
    this.stressAnvilMesh = new THREE.Mesh(
      createChamferedBlockGeometry(0.012, 0.008, 0.018, 0.0008),
      brassMat
    );
    this.stressAnvilMesh.position.set(0, 0.029, 0);
    this.photoelasticFrameGroup.add(this.stressAnvilMesh);

    // 透明聚碳酸酯承压拱形光弹试件 (嵌于圆环通光孔内)
    const archGeo = createPhotoelasticArchGeometry(0.029, 0.0095, 0.007);
    archGeo.rotateY(Math.PI / 2);
    const archMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      emissive: 0xec4899,
      emissiveIntensity: 0.25,
      roughness: 0.05,
      metalness: 0.05,
      transmission: 0.86,
      transparent: true,
      opacity: 0.60,
      ior: 1.585,
      depthWrite: false,
    });
    this.stressSpecimenMesh = new THREE.Mesh(archGeo, archMat);
    this.stressSpecimenMesh.name = 'PhotoelasticSpecimenMesh';
    this.stressSpecimenMesh.userData = { interactiveId: 'stress_screw' };
    this.photoelasticFrameGroup.add(this.stressSpecimenMesh);

    // 8. 顶部无背景框大号深色核心参数标签 (2048x256 超宽画布，确保长文本 100% 完整显示绝不截断)
    this.valueLabelCanvas = safeCanvas(2048, 256);
    if (this.valueLabelCanvas) {
      this.valueLabelTexture = new THREE.CanvasTexture(this.valueLabelCanvas);
      this.valueLabelTexture.minFilter = THREE.LinearFilter;
      this.valueLabelTexture.magFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: this.valueLabelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.polarizationValueSprite = new THREE.Sprite(spriteMat);
      this.polarizationValueSprite.name = 'PolarizationValueLabel';
      this.polarizationValueSprite.scale.set(0.38, 0.048, 1.0);
      this.polarizationValueSprite.renderOrder = 30;
      this.polarizationValueSprite.raycast = () => {};
      this.polarizationValueSprite.position.set(0, this.beamCenterY + outerR + 0.042, 0);
      this.sampleStageGroup.add(this.polarizationValueSprite);
    } else {
      this.polarizationValueSprite = new THREE.Sprite(new THREE.SpriteMaterial());
      this.polarizationValueSprite.raycast = () => {};
    }

    this.group.add(this.sampleStageGroup);
  }

  // ==================== G. 右侧深海蓝黑全景接收屏与前向集成式光电功率柱状条 ====================
  private buildObservationScreenAndPhotodiode(): void {
    const saddleData = this.createSliderSaddle(this.maxScreenX, 'ScreenCarrierGroup', 0.038, 0.072);
    this.screenCarrierGroup = saddleData.saddleGroup;
    this.screenCarrierGroup.userData = { interactiveId: 'screen_handle' };

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.26,
      roughness: 0.40,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.44,
      roughness: 0.24,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.78,
      roughness: 0.12,
    });

    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamCenterY + 0.010, 0);
    this.screenPanelGroup.rotation.y = -0.24;

    const screenW = 0.205;
    const screenH = 0.205;
    const housingDepth = 0.014;

    // 1. 底部立柱连接座与香槟金锁紧手轮
    const neckY = -screenH * 0.5 - 0.016;
    const mountMesh = new THREE.Mesh(
      createChamferedBlockGeometry(0.036, 0.020, 0.022, 0.0014),
      titaniumSlateMat
    );
    mountMesh.position.set(0, neckY, 0);
    this.screenPanelGroup.add(mountMesh);

    const mountKnobGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.010, 18);
    mountKnobGeo.rotateZ(Math.PI / 2);
    const mountKnob = new THREE.Mesh(mountKnobGeo, brassMat);
    mountKnob.position.set(0.022, neckY, 0);
    this.screenPanelGroup.add(mountKnob);

    // 2. 航天级阳极氧化喷砂银铝一体式宽幅屏框 (右侧无缝内嵌光电积分球与 12 段光强柱状条，杜绝黑色凸出块)
    const totalBezelW = screenW + 0.044;
    const totalBezelH = screenH + 0.022;
    const bezelGeo = createChamferedBlockGeometry(totalBezelW, totalBezelH, housingDepth, 0.0022);
    const bezel = new THREE.Mesh(bezelGeo, satinSilverMat);
    bezel.name = 'ScreenBoardMesh';
    bezel.position.set(0.012, 0, 0);
    bezel.castShadow = true;
    bezel.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(bezel);

    // 四角镜面铬内六角紧固螺栓与香槟金垫圈
    const cornerX = [-screenW * 0.5 - 0.003, screenW * 0.5 + 0.027];
    const cornerY = [-screenH * 0.5 - 0.003, screenH * 0.5 + 0.003];
    for (const cx of cornerX) {
      for (const cy of cornerY) {
        const boltGeo = new THREE.CylinderGeometry(0.0032, 0.0032, housingDepth + 0.003, 6);
        boltGeo.rotateX(Math.PI / 2);
        const bolt = new THREE.Mesh(boltGeo, chromeMat);
        bolt.position.set(cx, cy, 0.001);
        this.screenPanelGroup.add(bolt);
      }
    }

    // 3. 深邃海洋蓝黑 (#08101e) 1024x1024 光学观测屏面
    this.screenCanvas = safeCanvas(1024, 1024);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.anisotropy = 8;
    }

    const screenFaceGeo = new THREE.PlaneGeometry(screenW, screenH);
    const screenFaceMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      side: THREE.FrontSide,
    });
    this.screenMesh = new THREE.Mesh(screenFaceGeo, screenFaceMat);
    this.screenMesh.name = 'ScreenSurfaceMesh';
    this.screenMesh.position.set(0, 0, housingDepth * 0.5 + 0.0012);
    this.screenMesh.userData = { interactiveId: 'screen_surface' };
    this.screenPanelGroup.add(this.screenMesh);

    // 4. 屏框右侧无缝镶嵌式光电功率计面板与顶部积分球采样头 (PhotodiodeGroup)
    this.photodiodeGroup = new THREE.Group();
    this.photodiodeGroup.name = 'PhotodiodeSensorGroup';
    this.photodiodeGroup.position.set(screenW * 0.5 + 0.016, 0, housingDepth * 0.5 + 0.001);

    const meterStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.020, screenH * 0.92),
      new THREE.MeshBasicMaterial({ color: 0x08101e })
    );
    this.photodiodeGroup.add(meterStrip);

    // 顶部香槟金镶边积分球光电采样窗
    const sphereSensor = new THREE.Mesh(
      new THREE.SphereGeometry(0.0075, 20, 20),
      chromeMat
    );
    sphereSensor.position.set(0, screenH * 0.40, 0.002);
    this.photodiodeGroup.add(sphereSensor);

    const sensorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0082, 0.0014, 12, 24),
      brassMat
    );
    sensorRing.position.set(0, screenH * 0.40, 0.002);
    this.photodiodeGroup.add(sensorRing);

    // 12 段高对比度荧光光强指示灯条 (实时反映透射比 I / I0)
    this.photodiodeBarMeshes = [];
    const barCount = 12;
    for (let b = 0; b < barCount; b++) {
      const barGeo = new THREE.PlaneGeometry(0.013, 0.0085);
      const barMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.20,
      });
      const barMesh = new THREE.Mesh(barGeo, barMat);
      const yPos = -0.072 + b * 0.0115;
      barMesh.position.set(0, yPos, 0.0012);
      this.photodiodeGroup.add(barMesh);
      this.photodiodeBarMeshes.push(barMesh);
    }

    this.screenPanelGroup.add(this.photodiodeGroup);
    this.screenCarrierGroup.add(this.screenPanelGroup);
    this.group.add(this.screenCarrierGroup);
  }

  // ==================== H. 三维空间四区电磁横波、圆偏振螺旋波与双折射双光束系统 ====================
  private buildElectromagneticWavesSystem(): void {
    this.beamsGroup = new THREE.Group();
    this.beamsGroup.name = 'PolarizationElectromagneticWavesGroup';

    // -------- 1. 第一区 (Emitter -> Polarizer P1): 非偏振自然光多方位全向星芒横波簇 --------
    this.unpolarizedWaveGroup = new THREE.Group();
    this.unpolarizedWaveGroup.name = 'UnpolarizedStarburstWaveGroup';

    const unpolSegments = 36;
    const azimuthAnglesDeg = [0, 30, 60, 90, 120, 150];
    this.unpolarizedRibbons = [];

    for (let aIdx = 0; aIdx < azimuthAnglesDeg.length; aIdx++) {
      const ribbonGeo = this.createDynamicRibbonGeometry(unpolSegments);
      const ribbonMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: aIdx % 2 === 0 ? 0.58 : 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.name = `UnpolarizedAzimuthRibbon_${azimuthAnglesDeg[aIdx]}`;
      this.unpolarizedWaveGroup.add(ribbon);
      this.unpolarizedRibbons.push(ribbon);
    }

    // 非偏振区全向星芒电矢量线段簇
    const unpolVecCount = 36;
    const unpolVecGeo = new THREE.BufferGeometry();
    unpolVecGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(unpolVecCount * 2 * 3), 3)
    );
    this.unpolarizedVectorsMesh = new THREE.LineSegments(
      unpolVecGeo,
      new THREE.LineBasicMaterial({
        color: 0x86efac,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    this.unpolarizedWaveGroup.add(this.unpolarizedVectorsMesh);

    // 2 枚横截面全向振动星芒环
    this.unpolarizedStarRings = [];
    for (const xPos of [-0.33, -0.25]) {
      const starRingGeo = new THREE.RingGeometry(0.014, 0.016, 24);
      starRingGeo.rotateY(Math.PI / 2);
      const starRing = new THREE.Mesh(
        starRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.40,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      starRing.position.set(xPos, this.beamCenterY, 0);
      this.unpolarizedWaveGroup.add(starRing);
      this.unpolarizedStarRings.push(starRing);
    }

    // 布儒斯特玻片向上反射的 100% s-线偏振横波带
    this.brewsterReflectedRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(24),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.brewsterReflectedRibbonMesh.name = 'BrewsterReflectedSWaveRibbon';
    this.brewsterReflectedRibbonMesh.visible = false;
    this.unpolarizedWaveGroup.add(this.brewsterReflectedRibbonMesh);

    this.beamsGroup.add(this.unpolarizedWaveGroup);

    // -------- 2. 第二区 (Polarizer P1 -> Sample Stage): 起偏后纯线偏振 3D 正弦横波带 --------
    this.polarizedWaveGroup = new THREE.Group();
    this.polarizedWaveGroup.name = 'LinearlyPolarizedWaveGroup';

    this.polarizedRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(48),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.polarizedRibbonMesh.name = 'LinearlyPolarizedWaveRibbon';
    this.polarizedWaveGroup.add(this.polarizedRibbonMesh);

    const polVecCount = 32;
    const polVecGeo = new THREE.BufferGeometry();
    polVecGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((polVecCount + 1) * 2 * 3), 3)
    );
    this.polarizedVectorsMesh = new THREE.LineSegments(
      polVecGeo,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })
    );
    this.polarizedWaveGroup.add(this.polarizedVectorsMesh);

    const coreGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1.0, 12);
    coreGeo.rotateZ(Math.PI / 2);
    this.polarizedCoreCylinder = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.polarizedWaveGroup.add(this.polarizedCoreCylinder);

    this.beamsGroup.add(this.polarizedWaveGroup);

    // -------- 3. 第三区 (Sample Stage -> Analyzer P2): 三维螺旋波 / 旋光波 / 冰洲石双折射 o-e 双波 --------
    this.modulatedWaveGroup = new THREE.Group();
    this.modulatedWaveGroup.name = 'ModulatedPolarizationWaveGroup';

    this.modulatedRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(64),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.modulatedRibbonMesh.name = 'ModulatedHelicalOrLinearWaveRibbon';
    this.modulatedWaveGroup.add(this.modulatedRibbonMesh);

    const modVecCount = 40;
    const modVecGeo = new THREE.BufferGeometry();
    modVecGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((modVecCount + 1) * 2 * 3), 3)
    );
    this.modulatedVectorsMesh = new THREE.LineSegments(
      modVecGeo,
      new THREE.LineBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      })
    );
    this.modulatedWaveGroup.add(this.modulatedVectorsMesh);

    // 快轴 (Fast) 与慢轴 (Slow) 正交分量对比轨迹线
    const compSegs = 64;
    const fastGeo = new THREE.BufferGeometry();
    fastGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((compSegs + 1) * 3), 3));
    this.fastComponentLineMesh = new THREE.Line(
      fastGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, depthWrite: false })
    );
    this.modulatedWaveGroup.add(this.fastComponentLineMesh);

    const slowGeo = new THREE.BufferGeometry();
    slowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((compSegs + 1) * 3), 3));
    this.slowComponentLineMesh = new THREE.Line(
      slowGeo,
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55, depthWrite: false })
    );
    this.modulatedWaveGroup.add(this.slowComponentLineMesh);

    // 第三区中点横截面 3D 偏振椭圆/圆轨迹环与实时旋转电矢量箭头 E(t)
    const locusPoints = 48;
    const locusGeo = new THREE.BufferGeometry();
    locusGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(locusPoints * 3), 3));
    this.polarizationStateLocusLine = new THREE.LineLoop(
      locusGeo,
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.92, depthWrite: false })
    );
    this.polarizationStateLocusLine.name = 'PolarizationEllipseLocusRing';
    this.modulatedWaveGroup.add(this.polarizationStateLocusLine);

    this.rotatingEVectorArrowGroup = new THREE.Group();
    this.rotatingEVectorArrowGroup.position.set(0.090, this.beamCenterY, 0);
    const eShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0011, 0.0011, 0.020, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthWrite: false })
    );
    eShaft.position.y = 0.010;
    const eHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.0030, 0.0065, 12),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthWrite: false })
    );
    eHead.position.y = 0.021;
    this.rotatingEVectorArrowGroup.add(eShaft);
    this.rotatingEVectorArrowGroup.add(eHead);
    this.modulatedWaveGroup.add(this.rotatingEVectorArrowGroup);

    // 冰洲石双折射专属：空间分离的寻常光 (o光) 与非寻常光 (e光) 3D 正弦波带
    this.calciteOWaveRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.calciteOWaveRibbonMesh.name = 'CalciteOrdinaryRayRibbon';
    this.modulatedWaveGroup.add(this.calciteOWaveRibbonMesh);

    this.calciteEWaveRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(48),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.calciteEWaveRibbonMesh.name = 'CalciteExtraordinaryRayRibbon';
    this.modulatedWaveGroup.add(this.calciteEWaveRibbonMesh);

    const calcVecGeoO = new THREE.BufferGeometry();
    calcVecGeoO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(28 * 2 * 3), 3));
    this.calciteOVectorsMesh = new THREE.LineSegments(
      calcVecGeoO,
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.modulatedWaveGroup.add(this.calciteOVectorsMesh);

    const calcVecGeoE = new THREE.BufferGeometry();
    calcVecGeoE.setAttribute('position', new THREE.BufferAttribute(new Float32Array(28 * 2 * 3), 3));
    this.calciteEVectorsMesh = new THREE.LineSegments(
      calcVecGeoE,
      new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.modulatedWaveGroup.add(this.calciteEVectorsMesh);

    this.beamsGroup.add(this.modulatedWaveGroup);

    // -------- 4. 第四区 (Analyzer P2 -> Screen): 检偏透射横波带 --------
    this.transmittedWaveGroup = new THREE.Group();
    this.transmittedWaveGroup.name = 'TransmittedPostAnalyzerWaveGroup';

    this.transmittedRibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(48),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.transmittedRibbonMesh.name = 'TransmittedPostAnalyzerWaveRibbon';
    this.transmittedWaveGroup.add(this.transmittedRibbonMesh);

    const transVecCount = 32;
    const transVecGeo = new THREE.BufferGeometry();
    transVecGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((transVecCount + 1) * 2 * 3), 3)
    );
    this.transmittedVectorsMesh = new THREE.LineSegments(
      transVecGeo,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.transmittedWaveGroup.add(this.transmittedVectorsMesh);

    this.transmittedCalciteORibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(40),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.transmittedWaveGroup.add(this.transmittedCalciteORibbonMesh);

    this.transmittedCalciteERibbonMesh = new THREE.Mesh(
      this.createDynamicRibbonGeometry(40),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.transmittedWaveGroup.add(this.transmittedCalciteERibbonMesh);

    // 检偏器吸收衰减辉光环 (置于检偏晶片中心，不突出镜架外部)
    const rejGeo = new THREE.RingGeometry(0.012, 0.022, 24);
    rejGeo.rotateY(Math.PI / 2);
    this.rejectedOrthogonalBeamMesh = new THREE.Mesh(
      rejGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.rejectedOrthogonalBeamMesh.position.set(this.analyzerX, this.beamCenterY, 0);
    this.transmittedWaveGroup.add(this.rejectedOrthogonalBeamMesh);

    this.beamsGroup.add(this.transmittedWaveGroup);

    // -------- 5. 检偏器前侧 3D 相对夹角 Δθ 全息量角扇形环 --------
    this.auxiliariesGroup = new THREE.Group();
    this.auxiliariesGroup.name = 'PolarizationVectorAuxiliariesGroup';
    this.auxiliariesGroup.position.set(this.analyzerX - 0.015, this.beamCenterY, 0);
    this.beamsGroup.add(this.auxiliariesGroup);

    this.group.add(this.beamsGroup);
  }

  /**
   * 创建用于零分配原地更新的正弦/螺旋波带 BufferGeometry
   */
  private createDynamicRibbonGeometry(segments: number): THREE.BufferGeometry {
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  /**
   * 生成或复用镜架侧面集成式 360° 深海蓝宝石激光蚀刻分度圆环纹理
   */
  private getOrCreateRingDialTexture(): THREE.CanvasTexture | null {
    if (this.goniometerDialTexture) return this.goniometerDialTexture;
    this.goniometerDialCanvas = safeCanvas(512, 512);
    if (!this.goniometerDialCanvas) return null;

    const ctx = this.goniometerDialCanvas.getContext('2d');
    if (ctx) {
      const cx = 256;
      const cy = 256;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, 252, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 246, 0, Math.PI * 2);
      ctx.stroke();

      for (let deg = 0; deg < 360; deg += 5) {
        const rad = THREE.MathUtils.degToRad(deg);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const is30 = deg % 30 === 0;
        const is10 = deg % 10 === 0;
        const rOut = 242;
        const rIn = is30 ? 204 : is10 ? 216 : 226;

        ctx.strokeStyle = is30 ? '#38bdf8' : '#e2e8f0';
        ctx.lineWidth = is30 ? 3.2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + cos * rIn, cy + sin * rIn);
        ctx.lineTo(cx + cos * rOut, cy + sin * rOut);
        ctx.stroke();
      }
    }
    this.goniometerDialTexture = new THREE.CanvasTexture(this.goniometerDialCanvas);
    this.goniometerDialTexture.anisotropy = 8;
    return this.goniometerDialTexture;
  }

  // ==================== 2. 机械运动学、旋转角度与光路状态更新 ====================
  public getScreenCarrierX(): number {
    const t = THREE.MathUtils.clamp((this.screenDistanceM - 0.30) / (0.85 - 0.30), 0, 1);
    return this.minScreenX + t * (this.maxScreenX - this.minScreenX);
  }

  public syncScreenPositionFromDistance(): void {
    const x = this.getScreenCarrierX();
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.set(x, 0, 0);
    }
  }

  public syncDistanceFromScreenX(x: number): void {
    const clampedX = THREE.MathUtils.clamp(x, this.minScreenX, this.maxScreenX);
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = clampedX;
    }
    const t = (clampedX - this.minScreenX) / (this.maxScreenX - this.minScreenX);
    this.screenDistanceM = 0.30 + t * (0.85 - 0.30);
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
  }

  public getActiveBeamColor(): THREE.Color {
    if (this.lightSourceMode === 'white') {
      return new THREE.Color(0xfffbeb);
    }
    return OpticalPhysics.wavelengthToColor(this.wavelengthNm);
  }

  public updateSourceIndicators(): void {
    const isWhite = this.lightSourceMode === 'white';
    const activeColor = this.getActiveBeamColor();

    if (this.laserLedMesh) {
      const mat = this.laserLedMesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(activeColor);
      mat.opacity = this.laserPower ? 0.96 : 0.15;
    }

    if (this.whiteLightBtnMesh) {
      const m = this.whiteLightBtnMesh.material as THREE.MeshStandardMaterial;
      m.color.setHex(isWhite ? 0xfffbeb : 0xcbd5e1);
      m.emissive.setHex(isWhite ? 0xfef08a : 0x000000);
      m.emissiveIntensity = isWhite ? 0.85 : 0;
    }

    for (const [wlStr, btn] of Object.entries(this.wlButtons)) {
      const wl = Number(wlStr);
      const isSelected = !isWhite && Math.abs(this.wavelengthNm - wl) < 15;
      const c = OpticalPhysics.wavelengthToColor(wl);
      const m = btn.material as THREE.MeshStandardMaterial;
      m.color.copy(isSelected ? c : new THREE.Color(0x94a3b8));
      m.emissive.copy(isSelected ? c : new THREE.Color(0x000000));
      m.emissiveIntensity = isSelected ? 0.85 : 0;
    }
  }

  public updateMechanicalKinematics(): void {
    const thetaPRad = THREE.MathUtils.degToRad(this.polarizerAngleDeg);
    const thetaARad = THREE.MathUtils.degToRad(this.analyzerAngleDeg);
    const thetaWPRad = THREE.MathUtils.degToRad(this.waveplateFastAxisDeg);

    // 1. 起偏器 P1 转子与 Mitutoyo 测微鼓轮联动
    if (this.polarizerRotorGroup) {
      this.polarizerRotorGroup.rotation.x = thetaPRad;
    }
    if (this.polarizerMicrometerKnob) {
      this.polarizerMicrometerKnob.rotation.z = thetaPRad * 4.0;
    }

    // 2. 检偏器 P2 转子与 Mitutoyo 测微鼓轮联动
    if (this.analyzerRotorGroup) {
      this.analyzerRotorGroup.rotation.x = thetaARad;
    }
    if (this.analyzerMicrometerKnob) {
      this.analyzerMicrometerKnob.rotation.z = thetaARad * 4.0;
    }

    // 3. 中央五工位样品显隐与快轴/应力螺杆姿态联动
    const isWaveplate =
      this.sampleMode === 'quarter_waveplate' || this.sampleMode === 'half_waveplate';
    const isCalcite = this.sampleMode === 'calcite_birefringence';
    const isStress = this.sampleMode === 'photoelastic_stress';

    if (this.waveplateMountGroup) {
      this.waveplateMountGroup.visible = isWaveplate;
      if (this.waveplateCrystalMesh) {
        this.waveplateCrystalMesh.rotation.x = thetaWPRad;
        const mat = this.waveplateCrystalMesh.material as THREE.MeshPhysicalMaterial;
        mat.color.setHex(this.sampleMode === 'quarter_waveplate' ? 0x67e8f9 : 0xc084fc);
      }
    }
    if (this.waveplateMicrometerKnob) {
      this.waveplateMicrometerKnob.rotation.z = thetaWPRad * 4.0;
    }

    if (this.calciteCrystalGroup) {
      this.calciteCrystalGroup.visible = isCalcite;
      if (this.calciteCrystalMesh) {
        this.calciteCrystalMesh.rotation.x = thetaWPRad - Math.PI * 0.25;
      }
    }

    if (this.photoelasticFrameGroup) {
      this.photoelasticFrameGroup.visible = isStress;
      const loadNorm = (this.stressLoadMPa - 10.0) / 90.0;
      if (this.stressLoadScrewKnob) {
        this.stressLoadScrewKnob.rotation.y = loadNorm * Math.PI * 6.0;
      }
      if (this.stressAnvilMesh) {
        this.stressAnvilMesh.position.y = 0.030 - loadNorm * 0.004;
      }
      if (this.stressSpecimenMesh) {
        this.stressSpecimenMesh.scale.set(1.0, 1.0 - loadNorm * 0.06, 1.0 + loadNorm * 0.04);
      }
    }

    // 4. 布儒斯特玻片立柱：仅在切入光路时升起展示，未启用时完全隐藏立柱以保持第一区星芒自然光路纯净无遮挡
    if (this.brewsterPivotArm) {
      this.brewsterPivotArm.visible = this.enableBrewsterPlate;
    }

    this.updateValueSpriteLabel();
  }

  private updateValueSpriteLabel(): void {
    if (!this.valueLabelCanvas || !this.valueLabelTexture) return;
    const ctx = this.valueLabelCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.valueLabelCanvas.width;
    const h = this.valueLabelCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const analysis =
      this.cachedAnalysis ||
      OpticalPhysics.analyzePolarizationState(
        this.polarizerAngleDeg,
        this.analyzerAngleDeg,
        this.sampleMode,
        this.waveplateFastAxisDeg,
        this.stressLoadMPa,
        this.wavelengthNm
      );

    const modeShort =
      this.sampleMode === 'malus_free'
        ? '马吕斯定律'
        : this.sampleMode === 'quarter_waveplate'
        ? 'λ/4波片·圆/椭圆偏振'
        : this.sampleMode === 'half_waveplate'
        ? 'λ/2半波片·旋光'
        : this.sampleMode === 'calcite_birefringence'
        ? '冰洲石双折射(o⊥e)'
        : `光弹应力(${this.stressLoadMPa.toFixed(0)}MPa)`;

    const transPct = (analysis.transmittedIntensity * 100).toFixed(1);
    const labelText = `${modeShort} · Δθ = ${analysis.relativeAngleDeg.toFixed(1)}° · I/I₀ = ${transPct}%`;

    // 严格遵守纯净无背景框铁律：绝不调用 fillRect / strokeRect，2048px 超宽画布确保长文字绝不截断
    if (typeof ctx.save === 'function') ctx.save();
    ctx.font =
      'bold 58px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(labelText, w / 2, h / 2);
    if (typeof ctx.restore === 'function') ctx.restore();

    this.valueLabelTexture.needsUpdate = true;
  }

  // ==================== 3. 光路物理计算、三维全息量角扇形与光电柱状条更新 ====================
  public updateOpticalPaths(): OpticalPolarizationTelemetry {
    const analysis = OpticalPhysics.analyzePolarizationState(
      this.polarizerAngleDeg,
      this.analyzerAngleDeg,
      this.sampleMode,
      this.waveplateFastAxisDeg,
      this.stressLoadMPa,
      this.wavelengthNm
    );
    this.cachedAnalysis = analysis;

    const brewster = OpticalPhysics.calculateBrewsterReflection(this.brewsterIncidentAngleDeg, 1.5168);
    this.cachedBrewster = brewster;

    this.updateMechanicalKinematics();

    // 同步光电积分球 12 段柱状指示条
    const activeBars = this.laserPower
      ? Math.round(analysis.transmittedIntensity * this.photodiodeBarMeshes.length)
      : 0;
    const beamColor = this.getActiveBeamColor();
    for (let i = 0; i < this.photodiodeBarMeshes.length; i++) {
      const mat = this.photodiodeBarMeshes[i].material as THREE.MeshBasicMaterial;
      const isLit = i < activeBars;
      mat.color.copy(isLit ? beamColor : new THREE.Color(0x334155));
      mat.opacity = isLit ? 0.95 : 0.22;
    }

    // 同步各区波带材质颜色与透射透明度
    const setMeshColorAndOpacity = (mesh: THREE.Mesh, col: THREE.Color, op: number) => {
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.color.copy(col);
      m.opacity = op;
    };

    for (let i = 0; i < this.unpolarizedRibbons.length; i++) {
      setMeshColorAndOpacity(this.unpolarizedRibbons[i], beamColor, i % 2 === 0 ? 0.54 : 0.34);
    }
    setMeshColorAndOpacity(this.polarizedRibbonMesh, beamColor, 0.92);
    setMeshColorAndOpacity(this.modulatedRibbonMesh, beamColor, 0.92);

    const transOpacity = Math.max(0.03, 0.12 + analysis.transmittedIntensity * 0.86);
    setMeshColorAndOpacity(this.transmittedRibbonMesh, beamColor, transOpacity);

    if (this.rejectedOrthogonalBeamMesh) {
      this.rejectedOrthogonalBeamMesh.visible =
        this.laserPower && this.showBeamsInAir && analysis.rejectedIntensity > 0.02;
      const rejMat = this.rejectedOrthogonalBeamMesh.material as THREE.MeshBasicMaterial;
      rejMat.opacity = Math.min(0.45, analysis.rejectedIntensity * 0.40);
    }

    // 更新检偏器前侧 3D 相对夹角 Δθ 全息量角扇形
    this.updateAuxiliariesGeometry(analysis);

    if (!this.laserPower || !this.showBeamsInAir) {
      this.beamsGroup.visible = false;
    } else {
      this.beamsGroup.visible = true;
      this.updateWaveAnimation();
    }

    return this.getTelemetry();
  }

  private updateAuxiliariesGeometry(analysis: PolarizationAnalysisResult): void {
    for (const child of this.auxiliariesGroup.children) {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.auxiliariesGroup.clear();

    if (!this.showVectorDecomposition || !this.laserPower) {
      this.auxiliariesGroup.visible = false;
      return;
    }
    this.auxiliariesGroup.visible = true;

    const rArc = 0.030;
    const p1Rad = THREE.MathUtils.degToRad(this.polarizerAngleDeg);
    const p2Rad = THREE.MathUtils.degToRad(this.analyzerAngleDeg);

    const startAng = Math.min(p1Rad, p2Rad);
    const spanAng = Math.max(0.03, Math.abs(p2Rad - p1Rad));
    const arcColor = analysis.isExtinction
      ? 0xf43f5e
      : analysis.isParallelMax
      ? 0x22c55e
      : 0x38bdf8;

    const arcGeo = new THREE.RingGeometry(rArc * 0.78, rArc, 28, 1, startAng, spanAng);
    arcGeo.rotateY(Math.PI / 2);
    arcGeo.rotateX(Math.PI / 2);
    const arcMesh = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({
        color: arcColor,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.auxiliariesGroup.add(arcMesh);
  }

  // ==================== 4. 零内存分配原地 3D 电磁横波、圆偏振螺旋波与双折射双光束动画 ====================
  private updateWaveAnimation(): void {
    const beamY = this.beamCenterY;
    const refWl = this.lightSourceMode === 'white' ? 550.0 : this.wavelengthNm;
    const wlNorm = (refWl - 380.0) / 370.0;
    const visualWavelength = 0.040 + wlNorm * 0.022;
    const kWave = (Math.PI * 2.0) / visualWavelength;
    const phase = this.wavePhase;
    const maxAmp = 0.015;
    const ribbonHalfWidth = 0.0015;

    const analysis =
      this.cachedAnalysis ||
      OpticalPhysics.analyzePolarizationState(
        this.polarizerAngleDeg,
        this.analyzerAngleDeg,
        this.sampleMode,
        this.waveplateFastAxisDeg,
        this.stressLoadMPa,
        this.wavelengthNm
      );

    // -------- 段 1: 非偏振自然光多方位全向星芒横波簇 (emitterNozzleX -> polarizerX) --------
    const xStart1 = this.emitterNozzleX + 0.010;
    const xEnd1 = this.polarizerX - 0.012;
    const len1 = Math.max(0.02, xEnd1 - xStart1);
    const azimuthsDeg = [0, 30, 60, 90, 120, 150];
    const unpolSegs = 36;

    for (let aIdx = 0; aIdx < this.unpolarizedRibbons.length; aIdx++) {
      const ribbon = this.unpolarizedRibbons[aIdx];
      const posAttr = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const azRad = THREE.MathUtils.degToRad(azimuthsDeg[aIdx]);
      const cosAz = Math.cos(azRad);
      const sinAz = Math.sin(azRad);
      const phaseOffset = aIdx * 1.15;

      for (let i = 0; i <= unpolSegs; i++) {
        const t = i / unpolSegs;
        const x = xStart1 + t * len1;
        const env = 0.35 + 0.65 * Math.sin(t * Math.PI);
        const wVal = Math.sin(kWave * (x - xStart1) - phase + phaseOffset) * (maxAmp * 0.85) * env;
        const dy = wVal * cosAz;
        const dz = wVal * sinAz;
        const ny = -sinAz * ribbonHalfWidth;
        const nz = cosAz * ribbonHalfWidth;

        const idx = i * 6;
        arr[idx] = x;
        arr[idx + 1] = beamY + dy + ny;
        arr[idx + 2] = dz + nz;

        arr[idx + 3] = x;
        arr[idx + 4] = beamY + dy - ny;
        arr[idx + 5] = dz - nz;
      }
      posAttr.needsUpdate = true;
    }

    if (this.unpolarizedVectorsMesh) {
      const posAttr = this.unpolarizedVectorsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const vecCount = 36;
      for (let i = 0; i < vecCount; i++) {
        const t = (i + 0.5) / vecCount;
        const x = xStart1 + t * len1;
        const azRad = THREE.MathUtils.degToRad(azimuthsDeg[i % 6]);
        const wVal = Math.sin(kWave * (x - xStart1) - phase + (i % 6) * 1.15) * (maxAmp * 0.85);
        const idx = i * 6;
        arr[idx] = x;
        arr[idx + 1] = beamY;
        arr[idx + 2] = 0;
        arr[idx + 3] = x;
        arr[idx + 4] = beamY + wVal * Math.cos(azRad);
        arr[idx + 5] = wVal * Math.sin(azRad);
      }
      posAttr.needsUpdate = true;
    }

    // 布儒斯特玻片反射 s-偏振横波带更新
    const isBrewsterIn = this.enableBrewsterPlate;
    if (this.brewsterReflectedRibbonMesh) {
      this.brewsterReflectedRibbonMesh.visible = isBrewsterIn;
      if (isBrewsterIn) {
        const bPosAttr = this.brewsterReflectedRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const bArr = bPosAttr.array as Float32Array;
        const brewsterRad = THREE.MathUtils.degToRad(this.brewsterIncidentAngleDeg);
        const reflAngle = Math.PI - 2.0 * brewsterRad;
        const rLen = 0.060;
        const bSegs = 24;
        for (let i = 0; i <= bSegs; i++) {
          const t = i / bSegs;
          const dist = t * rLen;
          const bx = this.brewsterCenterX + Math.cos(reflAngle) * dist;
          const by = beamY + Math.sin(reflAngle) * dist;
          const zOsc = Math.sin(kWave * dist - phase) * 0.008 * Math.sin(t * Math.PI);
          const idx = i * 6;
          bArr[idx] = bx;
          bArr[idx + 1] = by + 0.0012;
          bArr[idx + 2] = zOsc;
          bArr[idx + 3] = bx;
          bArr[idx + 4] = by - 0.0012;
          bArr[idx + 5] = zOsc;
        }
        bPosAttr.needsUpdate = true;
      }
    }

    // -------- 段 2: 起偏后纯线偏振 3D 正弦横波带 (polarizerX -> sampleStageX) --------
    const xStart2 = this.polarizerX + 0.012;
    const xEnd2 = this.sampleStageX - 0.014;
    const len2 = Math.max(0.02, xEnd2 - xStart2);
    const thetaPRad = THREE.MathUtils.degToRad(this.polarizerAngleDeg);
    const cosP = Math.cos(thetaPRad);
    const sinP = Math.sin(thetaPRad);

    if (this.polarizedCoreCylinder) {
      this.polarizedCoreCylinder.scale.set(len2, 1, 1);
      this.polarizedCoreCylinder.position.set((xStart2 + xEnd2) * 0.5, beamY, 0);
    }

    this.fillLinearWaveRibbonAndVectors(
      this.polarizedRibbonMesh,
      this.polarizedVectorsMesh,
      xStart2,
      len2,
      beamY,
      cosP,
      sinP,
      maxAmp,
      kWave,
      phase,
      48,
      32
    );

    // -------- 段 3: 调制区 (sampleStageX -> analyzerX) --------
    const xStart3 = this.sampleStageX + 0.014;
    const xEnd3 = this.analyzerX - 0.012;
    const len3 = Math.max(0.02, xEnd3 - xStart3);
    const isCalcite = this.sampleMode === 'calcite_birefringence';
    const isWaveplate =
      this.sampleMode === 'quarter_waveplate' || this.sampleMode === 'half_waveplate';

    this.modulatedRibbonMesh.visible = !isCalcite;
    this.modulatedVectorsMesh.visible = !isCalcite;
    this.fastComponentLineMesh.visible = isWaveplate && this.showVectorDecomposition;
    this.slowComponentLineMesh.visible = isWaveplate && this.showVectorDecomposition;
    this.polarizationStateLocusLine.visible = !isCalcite && this.showVectorDecomposition;
    this.rotatingEVectorArrowGroup.visible = !isCalcite && this.showVectorDecomposition;

    this.calciteOWaveRibbonMesh.visible = isCalcite;
    this.calciteEWaveRibbonMesh.visible = isCalcite;
    this.calciteOVectorsMesh.visible = isCalcite;
    this.calciteEVectorsMesh.visible = isCalcite;

    if (!isCalcite) {
      const modPosAttr = this.modulatedRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const modArr = modPosAttr.array as Float32Array;
      const modSegs = 64;

      const fastAttr = this.fastComponentLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fastArr = fastAttr.array as Float32Array;
      const slowAttr = this.slowComponentLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const slowArr = slowAttr.array as Float32Array;

      const thetaWPRad = THREE.MathUtils.degToRad(this.waveplateFastAxisDeg);
      const cosWP = Math.cos(thetaWPRad);
      const sinWP = Math.sin(thetaWPRad);
      const betaRad = thetaPRad - thetaWPRad;
      const Ef = Math.cos(betaRad);
      const Es = Math.sin(betaRad);

      for (let i = 0; i <= modSegs; i++) {
        const t = i / modSegs;
        const x = xStart3 + t * len3;
        const phiX = kWave * (x - xStart2) - phase;
        const cosPhi = Math.cos(phiX);
        const sinPhi = Math.sin(phiX);

        const ey = (analysis.eyRe * cosPhi - analysis.eyIm * sinPhi) * maxAmp;
        const ez = (analysis.ezRe * cosPhi - analysis.ezIm * sinPhi) * maxAmp;

        const idx = i * 6;
        modArr[idx] = x;
        modArr[idx + 1] = beamY + ey + ribbonHalfWidth;
        modArr[idx + 2] = ez;

        modArr[idx + 3] = x;
        modArr[idx + 4] = beamY + ey - ribbonHalfWidth;
        modArr[idx + 5] = ez;

        if (isWaveplate) {
          const fVal = Ef * Math.cos(phiX) * maxAmp;
          const sVal = Es * Math.cos(phiX - analysis.phaseRetardationRad) * maxAmp;
          const lIdx = i * 3;
          fastArr[lIdx] = x;
          fastArr[lIdx + 1] = beamY + fVal * cosWP;
          fastArr[lIdx + 2] = fVal * sinWP;

          slowArr[lIdx] = x;
          slowArr[lIdx + 1] = beamY - sVal * sinWP;
          slowArr[lIdx + 2] = sVal * cosWP;
        }
      }
      modPosAttr.needsUpdate = true;
      if (isWaveplate) {
        fastAttr.needsUpdate = true;
        slowAttr.needsUpdate = true;
      }

      const vecAttr = this.modulatedVectorsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const vecArr = vecAttr.array as Float32Array;
      const modVecCount = 40;
      for (let i = 0; i < modVecCount; i++) {
        const t = (i + 0.5) / modVecCount;
        const x = xStart3 + t * len3;
        const phiX = kWave * (x - xStart2) - phase;
        const ey = (analysis.eyRe * Math.cos(phiX) - analysis.eyIm * Math.sin(phiX)) * maxAmp;
        const ez = (analysis.ezRe * Math.cos(phiX) - analysis.ezIm * Math.sin(phiX)) * maxAmp;

        const idx = i * 6;
        vecArr[idx] = x;
        vecArr[idx + 1] = beamY;
        vecArr[idx + 2] = 0;
        vecArr[idx + 3] = x;
        vecArr[idx + 4] = beamY + ey;
        vecArr[idx + 5] = ez;
      }
      const axisIdx = modVecCount * 6;
      vecArr[axisIdx] = xStart3;
      vecArr[axisIdx + 1] = beamY;
      vecArr[axisIdx + 2] = 0;
      vecArr[axisIdx + 3] = xEnd3;
      vecArr[axisIdx + 4] = beamY;
      vecArr[axisIdx + 5] = 0;
      vecAttr.needsUpdate = true;

      const xMid = (xStart3 + xEnd3) * 0.5;
      const locusAttr = this.polarizationStateLocusLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const locusArr = locusAttr.array as Float32Array;
      const locusCount = 48;
      for (let i = 0; i < locusCount; i++) {
        const ang = (i / locusCount) * Math.PI * 2;
        const ly = (analysis.eyRe * Math.cos(ang) - analysis.eyIm * Math.sin(ang)) * (maxAmp * 1.15);
        const lz = (analysis.ezRe * Math.cos(ang) - analysis.ezIm * Math.sin(ang)) * (maxAmp * 1.15);
        const idx = i * 3;
        locusArr[idx] = xMid;
        locusArr[idx + 1] = beamY + ly;
        locusArr[idx + 2] = lz;
      }
      locusAttr.needsUpdate = true;

      if (this.rotatingEVectorArrowGroup) {
        const midPhi = kWave * (xMid - xStart2) - phase;
        const curEy = analysis.eyRe * Math.cos(midPhi) - analysis.eyIm * Math.sin(midPhi);
        const curEz = analysis.ezRe * Math.cos(midPhi) - analysis.ezIm * Math.sin(midPhi);
        const instAngle = Math.atan2(curEz, curEy);
        const instMag = Math.max(0.15, Math.sqrt(curEy * curEy + curEz * curEz));
        this.rotatingEVectorArrowGroup.position.set(xMid, beamY, 0);
        this.rotatingEVectorArrowGroup.rotation.x = instAngle;
        this.rotatingEVectorArrowGroup.scale.set(1, instMag * 0.72, 1);
      }
    } else {
      const oAngleRad = THREE.MathUtils.degToRad(this.waveplateFastAxisDeg + 90.0);
      const eAngleRad = THREE.MathUtils.degToRad(this.waveplateFastAxisDeg);
      const oAmp = maxAmp * Math.sqrt(analysis.calciteORayBeforeAnalyzer);
      const eAmp = maxAmp * Math.sqrt(analysis.calciteERayBeforeAnalyzer);
      const walkOffY = 0.013;

      this.fillLinearWaveRibbonAndVectors(
        this.calciteOWaveRibbonMesh,
        this.calciteOVectorsMesh,
        xStart3,
        len3,
        beamY - walkOffY * 0.5,
        Math.cos(oAngleRad),
        Math.sin(oAngleRad),
        oAmp,
        kWave,
        phase,
        48,
        28
      );
      this.fillLinearWaveRibbonAndVectors(
        this.calciteEWaveRibbonMesh,
        this.calciteEVectorsMesh,
        xStart3,
        len3,
        beamY + walkOffY * 0.5,
        Math.cos(eAngleRad),
        Math.sin(eAngleRad),
        eAmp,
        kWave,
        phase + 0.8,
        48,
        28
      );
    }

    // -------- 段 4: 检偏器 P2 透射后区 (analyzerX -> Screen) --------
    const xStart4 = this.analyzerX + 0.012;
    const xEnd4 = this.getScreenCarrierX() - 0.008;
    const len4 = Math.max(0.02, xEnd4 - xStart4);
    const thetaARad = THREE.MathUtils.degToRad(this.analyzerAngleDeg);
    const cosA = Math.cos(thetaARad);
    const sinA = Math.sin(thetaARad);

    this.transmittedRibbonMesh.visible = !isCalcite && !analysis.isExtinction;
    this.transmittedVectorsMesh.visible = !isCalcite && !analysis.isExtinction;
    this.transmittedCalciteORibbonMesh.visible = isCalcite && analysis.calciteORayTransmitted > 0.005;
    this.transmittedCalciteERibbonMesh.visible = isCalcite && analysis.calciteERayTransmitted > 0.005;

    if (!isCalcite) {
      const transAmp = maxAmp * Math.sqrt(analysis.transmittedIntensity);
      this.fillLinearWaveRibbonAndVectors(
        this.transmittedRibbonMesh,
        this.transmittedVectorsMesh,
        xStart4,
        len4,
        beamY,
        cosA,
        sinA,
        transAmp,
        kWave,
        phase,
        48,
        32
      );
    } else {
      const walkOffY = 0.013;
      const oTransAmp = maxAmp * Math.sqrt(analysis.calciteORayTransmitted);
      const eTransAmp = maxAmp * Math.sqrt(analysis.calciteERayTransmitted);
      this.fillLinearWaveRibbonAndVectors(
        this.transmittedCalciteORibbonMesh,
        null,
        xStart4,
        len4,
        beamY - walkOffY * 0.5,
        cosA,
        sinA,
        oTransAmp,
        kWave,
        phase,
        40,
        0
      );
      this.fillLinearWaveRibbonAndVectors(
        this.transmittedCalciteERibbonMesh,
        null,
        xStart4,
        len4,
        beamY + walkOffY * 0.5,
        cosA,
        sinA,
        eTransAmp,
        kWave,
        phase + 0.8,
        40,
        0
      );
    }
  }

  private fillLinearWaveRibbonAndVectors(
    ribbonMesh: THREE.Mesh,
    vectorsMesh: THREE.LineSegments | null,
    xStart: number,
    length: number,
    centerY: number,
    cosAngle: number,
    sinAngle: number,
    amplitude: number,
    kWave: number,
    phase: number,
    ribbonSegments: number,
    vectorCount: number
  ): void {
    const posAttr = ribbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const halfThick = 0.0014;
    const ny = -sinAngle * halfThick;
    const nz = cosAngle * halfThick;

    for (let i = 0; i <= ribbonSegments; i++) {
      const t = i / ribbonSegments;
      const x = xStart + t * length;
      const wVal = Math.sin(kWave * (x - this.polarizerX) - phase) * amplitude;
      const dy = wVal * cosAngle;
      const dz = wVal * sinAngle;

      const idx = i * 6;
      arr[idx] = x;
      arr[idx + 1] = centerY + dy + ny;
      arr[idx + 2] = dz + nz;

      arr[idx + 3] = x;
      arr[idx + 4] = centerY + dy - ny;
      arr[idx + 5] = dz - nz;
    }
    posAttr.needsUpdate = true;

    if (vectorsMesh && vectorCount > 0) {
      const vecAttr = vectorsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const vecArr = vecAttr.array as Float32Array;
      for (let i = 0; i < vectorCount; i++) {
        const t = (i + 0.5) / vectorCount;
        const x = xStart + t * length;
        const wVal = Math.sin(kWave * (x - this.polarizerX) - phase) * amplitude;
        const idx = i * 6;
        vecArr[idx] = x;
        vecArr[idx + 1] = centerY;
        vecArr[idx + 2] = 0;
        vecArr[idx + 3] = x;
        vecArr[idx + 4] = centerY + wVal * cosAngle;
        vecArr[idx + 5] = wVal * sinAngle;
      }
      if (vecArr.length >= (vectorCount + 1) * 6) {
        const axisIdx = vectorCount * 6;
        vecArr[axisIdx] = xStart;
        vecArr[axisIdx + 1] = centerY;
        vecArr[axisIdx + 2] = 0;
        vecArr[axisIdx + 3] = xStart + length;
        vecArr[axisIdx + 4] = centerY;
        vecArr[axisIdx + 5] = 0;
      }
      vecAttr.needsUpdate = true;
    }
  }

  // ==================== 5. 深邃海洋蓝黑 (#08101e) 接收屏纯物理光学图谱与马吕斯曲线渲染 ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.lightSourceMode}_${this.wavelengthNm}_${this.laserPower}_${this.polarizerAngleDeg.toFixed(1)}_${this.analyzerAngleDeg.toFixed(1)}_${this.sampleMode}_${this.waveplateFastAxisDeg.toFixed(1)}_${this.stressLoadMPa.toFixed(1)}_${this.screenDistanceM.toFixed(2)}`;
    if (hash === this.lastScreenHash) return;
    this.lastScreenHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    const analysis =
      this.cachedAnalysis ||
      OpticalPhysics.analyzePolarizationState(
        this.polarizerAngleDeg,
        this.analyzerAngleDeg,
        this.sampleMode,
        this.waveplateFastAxisDeg,
        this.stressLoadMPa,
        this.wavelengthNm
      );

    const centerX = w * 0.5;
    const spotCenterY = 395;

    if (this.sampleMode === 'photoelastic_stress') {
      this.renderPhotoelasticInterferogramOnCanvas(ctx, centerX, spotCenterY, 275);
    } else if (this.sampleMode === 'calcite_birefringence') {
      this.renderCalciteTwinSpotsOnCanvas(ctx, centerX, spotCenterY, analysis);
    } else {
      this.renderPolarizedSpotAndEllipseOnCanvas(ctx, centerX, spotCenterY, analysis);
    }

    this.renderMalusTransmissionCurveStrip(ctx, analysis);

    this.screenTexture.needsUpdate = true;
  }

  private renderPolarizedSpotAndEllipseOnCanvas(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    analysis: PolarizationAnalysisResult
  ): void {
    const c = this.getActiveBeamColor();
    const rCol = Math.min(255, Math.round(Math.pow(c.r, 0.55) * 255));
    const gCol = Math.min(255, Math.round(Math.pow(c.g, 0.55) * 255));
    const bCol = Math.min(255, Math.round(Math.pow(c.b, 0.55) * 255));

    const transI = analysis.transmittedIntensity;
    const maxRadius = 240;

    if (this.sampleMode === 'quarter_waveplate' || this.sampleMode === 'half_waveplate') {
      for (let ring = 1; ring <= 4; ring++) {
        const rr = ring * 52;
        ctx.strokeStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${(0.14 + transI * 0.18).toFixed(3)})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (transI > 0.002) {
      const gammaI = Math.pow(transI, 0.58);
      const spotR = 75 + gammaI * maxRadius;
      for (let rStep = Math.floor(spotR); rStep >= 2; rStep -= 4) {
        const normR = rStep / spotR;
        const falloff = Math.exp(-normR * normR * 2.6) * gammaI;
        if (falloff < 0.008) continue;
        const coreMix = Math.max(0, (falloff - 0.55) / 0.45);
        const rr = Math.min(255, Math.round(rCol + (255 - rCol) * coreMix));
        const gg = Math.min(255, Math.round(gCol + (255 - gCol) * coreMix));
        const bb = Math.min(255, Math.round(bCol + (255 - bCol) * coreMix));

        ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${(falloff * 0.14).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, rStep, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const locusScale = 165;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    for (let s = 0; s <= 72; s++) {
      const ang = (s / 72) * Math.PI * 2;
      const ez = (analysis.ezRe * Math.cos(ang) - analysis.ezIm * Math.sin(ang)) * locusScale;
      const ey = (analysis.eyRe * Math.cos(ang) - analysis.eyIm * Math.sin(ang)) * locusScale;
      if (s === 0) ctx.moveTo(cx + ez, cy - ey);
      else ctx.lineTo(cx + ez, cy - ey);
    }
    ctx.closePath();
    ctx.stroke();

    const thetaARad = THREE.MathUtils.degToRad(this.analyzerAngleDeg);
    const axisDirX = Math.sin(thetaARad);
    const axisDirY = -Math.cos(thetaARad);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 2.8;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx - axisDirX * 210, cy - axisDirY * 210);
    ctx.lineTo(cx + axisDirX * 210, cy + axisDirY * 210);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderCalciteTwinSpotsOnCanvas(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    analysis: PolarizationAnalysisResult
  ): void {
    const oSpotY = cy + 95;
    const eSpotY = cy - 95;
    const eSpotX = cx + 28;

    const drawBirefringentSpot = (
      sx: number,
      sy: number,
      intensity: number,
      rBase: number,
      gBase: number,
      bBase: number,
      polAngleDeg: number
    ) => {
      if (intensity > 0.003) {
        const gamma = Math.pow(intensity, 0.55);
        const maxR = 45 + gamma * 125;
        for (let r = Math.floor(maxR); r >= 2; r -= 4) {
          const nr = r / maxR;
          const alpha = Math.exp(-nr * nr * 2.5) * gamma * 0.18;
          ctx.fillStyle = `rgba(${rBase}, ${gBase}, ${bBase}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const rad = THREE.MathUtils.degToRad(polAngleDeg);
      const dx = Math.sin(rad) * 58;
      const dy = -Math.cos(rad) * 58;
      ctx.strokeStyle = `rgba(${rBase}, ${gBase}, ${bBase}, ${(0.35 + intensity * 0.65).toFixed(3)})`;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(sx - dx, sy - dy);
      ctx.lineTo(sx + dx, sy + dy);
      ctx.stroke();
    };

    drawBirefringentSpot(
      cx - 18,
      oSpotY,
      analysis.calciteORayTransmitted,
      56,
      189,
      248,
      this.waveplateFastAxisDeg + 90
    );

    drawBirefringentSpot(
      eSpotX,
      eSpotY,
      analysis.calciteERayTransmitted,
      251,
      191,
      36,
      this.waveplateFastAxisDeg
    );
  }

  private renderPhotoelasticInterferogramOnCanvas(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radiusPx: number
  ): void {
    const step = 6;
    for (let py = cy - radiusPx; py <= cy + radiusPx; py += step) {
      for (let px = cx - radiusPx; px <= cx + radiusPx; px += step) {
        const normX = (px - cx) / radiusPx;
        const normY = (cy - py) / radiusPx;
        const sample = OpticalPhysics.calculatePhotoelasticStressRGB(
          normX,
          normY,
          this.stressLoadMPa,
          this.polarizerAngleDeg,
          this.analyzerAngleDeg
        );
        if (!sample.insideSpecimen) continue;

        const r = Math.min(255, Math.round(Math.pow(sample.r, 0.65) * 255));
        const g = Math.min(255, Math.round(Math.pow(sample.g, 0.65) * 255));
        const b = Math.min(255, Math.round(Math.pow(sample.b, 0.65) * 255));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(px, py, step, step);
      }
    }
  }

  private renderMalusTransmissionCurveStrip(
    ctx: CanvasRenderingContext2D,
    analysis: PolarizationAnalysisResult
  ): void {
    const padX = 92;
    const plotW = 1024 - padX * 2;
    const plotTopY = 735;
    const plotBotY = 935;
    const plotH = plotBotY - plotTopY;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(padX, plotTopY);
    ctx.lineTo(padX + plotW, plotTopY);
    ctx.moveTo(padX, plotTopY + plotH * 0.5);
    ctx.lineTo(padX + plotW, plotTopY + plotH * 0.5);
    ctx.moveTo(padX, plotBotY);
    ctx.lineTo(padX + plotW, plotBotY);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    for (let deg = 0; deg <= 180; deg += 2) {
      const sim = OpticalPhysics.analyzePolarizationState(
        this.polarizerAngleDeg,
        deg,
        this.sampleMode,
        this.waveplateFastAxisDeg,
        this.stressLoadMPa,
        this.wavelengthNm
      );
      const x = padX + (deg / 180) * plotW;
      const y = plotBotY - sim.transmittedIntensity * plotH;
      if (deg === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (this.sampleMode === 'calcite_birefringence') {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let deg = 0; deg <= 180; deg += 2) {
        const sim = OpticalPhysics.analyzePolarizationState(
          this.polarizerAngleDeg,
          deg,
          this.sampleMode,
          this.waveplateFastAxisDeg,
          this.stressLoadMPa,
          this.wavelengthNm
        );
        const x = padX + (deg / 180) * plotW;
        const y = plotBotY - sim.calciteERayTransmitted * plotH;
        if (deg === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const normA = (((this.analyzerAngleDeg % 180) + 180) % 180) / 180;
    const curX = padX + normA * plotW;
    const curY = plotBotY - analysis.transmittedIntensity * plotH;

    ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.beginPath();
    ctx.arc(curX, curY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(curX, curY, 8.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ==================== 6. 公开控制 API 与逐帧阻尼更新 ====================
  public setPolarizerAngle(angleDeg: number): void {
    this.polarizerAngleDeg = ((angleDeg % 180) + 180) % 180;
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setAnalyzerAngle(angleDeg: number): void {
    this.analyzerAngleDeg = ((angleDeg % 180) + 180) % 180;
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setSampleMode(mode: PolarizationSampleMode): void {
    this.sampleMode = mode;
    const idx = OpticalPolarizationApparatusMesh.SAMPLE_MODES.indexOf(mode);
    if (idx >= 0) {
      this.activeSampleIndex = idx;
      this.targetTurretAngle = idx * ((Math.PI * 2) / 5);
    }
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public cycleNextSampleMode(): PolarizationSampleMode {
    this.activeSampleIndex =
      (this.activeSampleIndex + 1) % OpticalPolarizationApparatusMesh.SAMPLE_MODES.length;
    const nextMode = OpticalPolarizationApparatusMesh.SAMPLE_MODES[this.activeSampleIndex];
    this.setSampleMode(nextMode);
    return nextMode;
  }

  public setWaveplateFastAxis(angleDeg: number): void {
    this.waveplateFastAxisDeg = ((angleDeg % 180) + 180) % 180;
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setStressLoad(loadMPa: number): void {
    this.stressLoadMPa = THREE.MathUtils.clamp(loadMPa, 10.0, 100.0);
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setBrewsterPlateEnabled(enabled: boolean): void {
    this.enableBrewsterPlate = enabled;
    this.targetBrewsterSwing = enabled ? 0.0 : 1.0;
    this.currentBrewsterSwing = this.targetBrewsterSwing;
    this.isOpticalDirty = true;
    this.updateOpticalPaths();
  }

  public toggleBrewsterPlate(): boolean {
    this.setBrewsterPlateEnabled(!this.enableBrewsterPlate);
    return this.enableBrewsterPlate;
  }

  public setLightSourceMode(mode: PolarizationLightSourceMode): void {
    this.lightSourceMode = mode;
    this.updateSourceIndicators();
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setWavelength(wlNm: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wlNm, 400.0, 700.0);
    this.lightSourceMode = 'monochromatic';
    this.updateSourceIndicators();
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setLaserPower(on: boolean): void {
    this.laserPower = on;
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.updateSourceIndicators();
    this.isOpticalDirty = true;
    this.isScreenDirty = true;
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setKnobHovered(
    id:
      | 'polarizer_micrometer'
      | 'analyzer_micrometer'
      | 'sample_turret'
      | 'waveplate_knob'
      | 'brewster_toggle'
      | null,
    hovered: boolean
  ): void {
    if (this.polarizerHoverCue) {
      this.polarizerHoverCue.visible =
        id === 'polarizer_micrometer' && hovered && !this.hasInteractedWithPolarizer;
    }
    if (this.analyzerHoverCue) {
      this.analyzerHoverCue.visible =
        id === 'analyzer_micrometer' && hovered && !this.hasInteractedWithAnalyzer;
    }
    if (this.sampleTurretHoverCue) {
      this.sampleTurretHoverCue.visible =
        id === 'sample_turret' && hovered && !this.hasInteractedWithSampleTurret;
    }
    if (this.waveplateHoverCue) {
      this.waveplateHoverCue.visible =
        id === 'waveplate_knob' && hovered && !this.hasInteractedWithWaveplate;
    }
    if (this.brewsterHoverCue) {
      this.brewsterHoverCue.visible =
        id === 'brewster_toggle' && hovered && !this.hasInteractedWithBrewster;
    }
  }

  public markInteracted(
    id:
      | 'polarizer_micrometer'
      | 'analyzer_micrometer'
      | 'sample_turret'
      | 'waveplate_knob'
      | 'brewster_toggle'
  ): void {
    if (id === 'polarizer_micrometer') {
      this.hasInteractedWithPolarizer = true;
      if (this.polarizerHoverCue) this.polarizerHoverCue.visible = false;
    } else if (id === 'analyzer_micrometer') {
      this.hasInteractedWithAnalyzer = true;
      if (this.analyzerHoverCue) this.analyzerHoverCue.visible = false;
    } else if (id === 'sample_turret') {
      this.hasInteractedWithSampleTurret = true;
      if (this.sampleTurretHoverCue) this.sampleTurretHoverCue.visible = false;
    } else if (id === 'waveplate_knob') {
      this.hasInteractedWithWaveplate = true;
      if (this.waveplateHoverCue) this.waveplateHoverCue.visible = false;
    } else if (id === 'brewster_toggle') {
      this.hasInteractedWithBrewster = true;
      if (this.brewsterHoverCue) this.brewsterHoverCue.visible = false;
    }
  }

  public update(delta: number): void {
    const dt = delta || 0.016;

    if (this.sampleTurretWheel) {
      const diff = this.targetTurretAngle - this.currentTurretAngle;
      if (Math.abs(diff) > 0.0005) {
        this.currentTurretAngle += diff * Math.min(1.0, dt * 14.0);
        this.sampleTurretWheel.rotation.z = this.currentTurretAngle;
      }
    }

    if (this.isOpticalDirty) {
      this.updateOpticalPaths();
      this.isOpticalDirty = false;
    }
    if (this.isScreenDirty) {
      this.updateScreenTexture();
      this.isScreenDirty = false;
    }

    if (this.laserPower && this.showBeamsInAir) {
      this.wavePhase = (this.wavePhase + dt * 11.5) % (Math.PI * 200);
      this.updateWaveAnimation();
    }
  }

  public getTelemetry(): OpticalPolarizationTelemetry {
    const analysis =
      this.cachedAnalysis ||
      OpticalPhysics.analyzePolarizationState(
        this.polarizerAngleDeg,
        this.analyzerAngleDeg,
        this.sampleMode,
        this.waveplateFastAxisDeg,
        this.stressLoadMPa,
        this.wavelengthNm
      );
    const brewster =
      this.cachedBrewster ||
      OpticalPhysics.calculateBrewsterReflection(this.brewsterIncidentAngleDeg, 1.5168);

    const sampleModeName =
      this.sampleMode === 'malus_free'
        ? '自由空间 · 马吕斯定律验证'
        : this.sampleMode === 'quarter_waveplate'
        ? 'λ/4 四分之一波片 · 圆/椭圆偏振螺旋波'
        : this.sampleMode === 'half_waveplate'
        ? 'λ/2 二分之一半波片 · 偏振面旋光调制'
        : this.sampleMode === 'calcite_birefringence'
        ? '天然冰洲石晶体 · 双折射 o光/e光分离'
        : '光弹应力双折射加压架 · 彩色等色线图谱';

    return {
      lightSourceMode: this.lightSourceMode,
      wavelengthNm: this.wavelengthNm,
      laserPower: this.laserPower,
      polarizerAngleDeg: this.polarizerAngleDeg,
      analyzerAngleDeg: this.analyzerAngleDeg,
      relativeAngleDeg: analysis.relativeAngleDeg,
      sampleMode: this.sampleMode,
      sampleModeName,
      waveplateFastAxisDeg: this.waveplateFastAxisDeg,
      stressLoadMPa: this.stressLoadMPa,
      enableBrewsterPlate: this.enableBrewsterPlate,
      brewsterIncidentAngleDeg: this.brewsterIncidentAngleDeg,
      screenDistanceM: this.screenDistanceM,
      phaseRetardationDeg: analysis.phaseRetardationDeg,
      ellipticityRatio: analysis.ellipticityRatio,
      azimuthAngleDeg: analysis.azimuthAngleDeg,
      polarizationState: analysis.polarizationState,
      polarizationStateName: analysis.polarizationStateName,
      transmittedIntensity: analysis.transmittedIntensity,
      rejectedIntensity: analysis.rejectedIntensity,
      isExtinction: analysis.isExtinction,
      isParallelMax: analysis.isParallelMax,
      calciteORayTransmitted: analysis.calciteORayTransmitted,
      calciteERayTransmitted: analysis.calciteERayTransmitted,
      brewsterAngleDeg: brewster.brewsterAngleDeg,
      brewsterReflectanceS: brewster.reflectanceS,
      brewsterReflectanceP: brewster.reflectanceP,
      brewsterDegreeOfPolarization: brewster.degreeOfPolarization,
    };
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    this.screenTexture?.dispose();
    this.railScaleTexture?.dispose();
    this.goniometerDialTexture?.dispose();
    this.valueLabelTexture?.dispose();
  }
}
