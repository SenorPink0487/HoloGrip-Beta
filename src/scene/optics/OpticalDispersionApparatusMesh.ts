import * as THREE from 'three';
import {
  OpticalPhysics,
  PRISM_MATERIALS,
  type PrismMaterialType,
  type PrismSpectrumAnalysis,
} from './OpticalPhysics.ts';

export type DispersionSourceMode = 'white' | 'spectral_lines' | 'monochromatic';

export interface OpticalDispersionTelemetry {
  sourceMode: DispersionSourceMode;
  wavelengthNm: number;
  laserPower: boolean;
  prismMaterial: PrismMaterialType;
  prismMaterialName: string;
  incidentAngleDeg: number;
  apexAngleDeg: number;
  screenDistanceM: number;
  enableRecombinationPrism: boolean;
  nd: number;
  nRed: number;
  nViolet: number;
  abbeNumber: number;
  redDeviationDeg: number;
  yellowDeviationDeg: number;
  violetDeviationDeg: number;
  angularDispersionDeg: number;
  minimumDeviationDeg: number;
  criticalAngleVioletDeg: number;
  spectrumSpreadMm: number;
  hasPartialTIR: boolean;
  hasFullTIR: boolean;
  isNearMinimumDeviation: boolean;
}

export interface OpticalDispersionOptions {
  sourceMode?: DispersionSourceMode;
  wavelengthNm?: number;
  laserPower?: boolean;
  prismMaterial?: PrismMaterialType;
  incidentAngleDeg?: number;
  apexAngleDeg?: number;
  screenDistanceM?: number;
  enableRecombinationPrism?: boolean;
  showOpticalAuxiliaries?: boolean;
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
 * 创建带光学倒角边缘的高透三棱镜实体几何
 */
function createBeveledPrismGeometry(
  vLeft: THREE.Vector2,
  vRight: THREE.Vector2,
  vTop: THREE.Vector2,
  depth: number,
  bevel = 0.0016
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(vLeft.x, vLeft.y);
  shape.lineTo(vRight.x, vRight.y);
  shape.lineTo(vTop.x, vTop.y);
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
  // 将 Z 轴中心对齐到 z = 0
  geo.translate(0, 0, -extrudeDepth * 0.5);
  return geo;
}

/**
 * 2D 线段相交求解：射线 P + t * D (t >= 0) 与线段 A -> B 相交
 */
function intersectRayWithSegment2D(
  px: number,
  py: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { x: number; y: number; t: number; u: number } | null {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-8) return null;

  const qpx = ax - px;
  const qpy = ay - py;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;

  if (t >= 0) {
    const uClamped = THREE.MathUtils.clamp(u, 0.04, 0.96);
    return {
      x: ax + uClamped * sx,
      y: ay + uClamped * sy,
      t,
      u: uClamped,
    };
  }
  return null;
}

/**
 * 旗舰科研级“光的色散与牛顿光谱复合”精密测角分光实验仪
 * (航天级阳极氧化喷砂银铝 · 镜面液态铬 · 香槟金微调五金 · 高透倒角光学晶棱镜 · 深海蓝黑全景彩虹光谱屏)
 *
 * 针对光的色散实验特点专门研发的五大专属精密模块：
 * 1. 分光计单块精雕底座与双铬导轨系统 (Aerospace Satin Silver Monoblock Spectrometer Bed)；
 * 2. 左侧俯仰旋转平行白光/汞氦原子光谱准直管与弧形摆臂 (Pivoting Polychromatic Slit Collimator Arm)；
 * 3. 中央 360° 游标测角分度环、五档材质转轮与高色散水晶三棱镜台 (Vernier Goniometer & Crystal Prism Stage)；
 * 4. 牛顿双棱镜复合白光实验专属：可切入光路的第二倒置复合三棱镜机械摆臂 (Newton's Swing-In Recombination Prism)；
 * 5. 右侧全景弧面遮光罩深海蓝黑彩虹光谱接收屏与红/紫双端游标波长测微卡尺 (Panoramic Spectral Screen & Dual-Edge Caliper)。
 */
export class OpticalDispersionApparatusMesh {
  public readonly group = new THREE.Group();

  // 核心基准空间坐标 (沿 X 轴水平展开，正面对向操作者 +Z)
  public readonly railLength = 1.12;
  public readonly railWidth = 0.072;
  public readonly railHeight = 0.042;
  public readonly prismCenterX = -0.105;
  public readonly prismCenterY = 0.252;
  public readonly prismSideLength = 0.122;
  public readonly prismDepth = 0.064;
  public readonly minScreenX = 0.18;
  public readonly maxScreenX = 0.47;

  // 核心物理与实验状态参数
  public sourceMode: DispersionSourceMode = 'white';
  public wavelengthNm = 532.0; // 单色模式下的波长
  public laserPower = true;
  public prismMaterial: PrismMaterialType = 'flint'; // 默认采用高色散重火石光学玻璃，彩虹张角鲜明壮观
  public incidentAngleDeg = 58.0; // 第一界面入射角 θ1 (25° ~ 80°)
  public apexAngleDeg = 60.0; // 三棱镜顶角 α (45° ~ 70°)
  public screenDistanceM = 0.60; // 棱镜至光谱接收屏距离 L (0.30m ~ 0.85m)
  public enableRecombinationPrism = false; // 牛顿第二倒置三棱镜复合白光开关
  public showOpticalAuxiliaries = true; // 显示界面法线、入射延长虚线与偏向角 δ 弧线
  public showBeamsInAir = true; // 显示空气丁达尔彩虹色散光扇

  // 五档材质转轮索引 (0: crown, 1: bariumFlint, 2: flint, 3: quartz, 4: diamond)
  public static readonly MATERIAL_PRESETS: PrismMaterialType[] = [
    'crown',
    'bariumFlint',
    'flint',
    'quartz',
    'diamond',
  ];
  public activeMaterialIndex = 2; // 默认 'flint'

  // 高精度连续光谱色彩锚点 (物理 CIE 1931 光度学高饱和色彩插值)
  public static readonly SPECTRUM_ANCHORS: { wl: number; c: [number, number, number] }[] = [
    { wl: 700, c: [1.00, 0.04, 0.08] }, // 深绯红
    { wl: 645, c: [1.00, 0.20, 0.04] }, // 鲜红
    { wl: 615, c: [1.00, 0.48, 0.02] }, // 亮橙
    { wl: 590, c: [1.00, 0.80, 0.04] }, // 金黄
    { wl: 575, c: [0.96, 0.95, 0.06] }, // 纯黄
    { wl: 550, c: [0.55, 0.98, 0.16] }, // 黄绿
    { wl: 525, c: [0.12, 0.98, 0.32] }, // 翠绿
    { wl: 500, c: [0.04, 0.95, 0.75] }, // 碧青
    { wl: 475, c: [0.08, 0.72, 1.00] }, // 天青蓝
    { wl: 450, c: [0.18, 0.42, 1.00] }, // 湛蓝
    { wl: 425, c: [0.42, 0.16, 0.98] }, // 靛蓝
    { wl: 395, c: [0.65, 0.08, 0.92] }, // 幽紫
  ];

  public static getContinuousSpectralColor(wl: number): THREE.Color {
    const anchors = OpticalDispersionApparatusMesh.SPECTRUM_ANCHORS;
    if (wl >= anchors[0].wl) {
      const [r, g, b] = anchors[0].c;
      return new THREE.Color(r, g, b);
    }
    const last = anchors[anchors.length - 1];
    if (wl <= last.wl) {
      return new THREE.Color(last.c[0], last.c[1], last.c[2]);
    }
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (wl <= a.wl && wl >= b.wl) {
        const u = (a.wl - wl) / (a.wl - b.wl);
        const s = u * u * (3 - 2 * u);
        const red = a.c[0] + (b.c[0] - a.c[0]) * s;
        const grn = a.c[1] + (b.c[1] - a.c[1]) * s;
        const blu = a.c[2] + (b.c[2] - a.c[2]) * s;
        return new THREE.Color(red, grn, blu);
      }
    }
    return new THREE.Color(1, 1, 1);
  }

  // 3D 核心装配节点 (公开供交互管理器与自动化测试检验)
  public railGroup!: THREE.Group;
  public goniometerDialGroup!: THREE.Group;
  public collimatorArmGroup!: THREE.Group;
  public prismStageGroup!: THREE.Group;
  public prismCrystalMesh!: THREE.Mesh;
  public prismTopCapMesh!: THREE.Mesh;
  public prismBottomPlateMesh!: THREE.Mesh;
  public prismMicrometerKnob!: THREE.Mesh;
  public materialTurretWheel!: THREE.Group;
  public recombinationGroup!: THREE.Group;
  public recombinationPivotArm!: THREE.Group;
  public recombinationPrismMesh!: THREE.Mesh;
  public recombinationToggleKnob!: THREE.Mesh;
  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public screenMesh!: THREE.Mesh;

  // 光源控制面板交互按键
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public whiteLightBtnMesh!: THREE.Mesh;
  public spectralLinesBtnMesh!: THREE.Mesh;
  public monoModeBtnMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};

  // 光谱接收屏红端/紫端双游标测微指针与手轮
  public redEdgeCaliperMesh!: THREE.Mesh;
  public violetEdgeCaliperMesh!: THREE.Mesh;
  public centerRefCaliperMesh!: THREE.Mesh;
  public caliperHandwheelMesh!: THREE.Mesh;

  // 原生 3D 交互引导光晕环与首次接触生命周期状态
  public micrometerHoverCue!: THREE.Mesh;
  public turretHoverCue!: THREE.Mesh;
  public recombinationHoverCue!: THREE.Mesh;
  public hasInteractedWithMicrometer = false;
  public hasInteractedWithTurret = false;
  public hasInteractedWithRecombination = false;

  // 阻尼动画目标角
  public currentTurretAngle = 2 * ((Math.PI * 2) / 5);
  public targetTurretAngle = 2 * ((Math.PI * 2) / 5);
  public currentRecombSwing = 1.0; // 0 = 切入光路 (In), 1 = 抬起停靠 (Out)
  public targetRecombSwing = 1.0;

  // 光路与视觉特效 3D 网格
  public beamsGroup!: THREE.Group;
  public incidentBeamMesh!: THREE.Mesh;
  public incidentHaloMesh!: THREE.Mesh;
  public internalWhiteBeamMesh!: THREE.Mesh;
  public internalWhiteHaloMesh!: THREE.Mesh;
  public entrySpotMesh!: THREE.Mesh;
  public fresnelReflectedMesh!: THREE.Mesh;
  public internalRainbowRibbonMesh!: THREE.Mesh;
  public externalRainbowRibbonMesh!: THREE.Mesh;
  public externalRainbowGlowMesh!: THREE.Mesh;
  public principalRaysGroup!: THREE.Group;
  public tirInternalRayGroup!: THREE.Group;
  public recombinedBeamGroup!: THREE.Group;
  public auxiliariesGroup!: THREE.Group;

  // 材质引用
  private prismGlassMaterial!: THREE.MeshPhysicalMaterial;
  private recombGlassMaterial!: THREE.MeshPhysicalMaterial;
  private incidentCoreMat!: THREE.MeshBasicMaterial;
  private incidentHaloMat!: THREE.MeshBasicMaterial;
  private fresnelReflMat!: THREE.MeshBasicMaterial;

  // 动态纹理 Canvas
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  private railScaleCanvas: HTMLCanvasElement | null = null;
  private railScaleTexture: THREE.CanvasTexture | null = null;
  private goniometerDialCanvas: HTMLCanvasElement | null = null;
  private goniometerDialTexture: THREE.CanvasTexture | null = null;
  private caliperScaleCanvas: HTMLCanvasElement | null = null;
  private caliperScaleTexture: THREE.CanvasTexture | null = null;
  private prismValueCanvas: HTMLCanvasElement | null = null;
  private prismValueTexture: THREE.CanvasTexture | null = null;
  public prismValueSprite!: THREE.Sprite;

  // 脏标记与缓存
  private isScreenDirty = true;
  private lastScreenHash = '';
  private cachedSpectrum: PrismSpectrumAnalysis | null = null;

  constructor(options: OpticalDispersionOptions = {}) {
    this.group.name = 'OpticalDispersionApparatusMesh';

    if (options.sourceMode !== undefined) this.sourceMode = options.sourceMode;
    if (options.wavelengthNm !== undefined) this.wavelengthNm = options.wavelengthNm;
    if (options.laserPower !== undefined) this.laserPower = options.laserPower;
    if (options.prismMaterial !== undefined) {
      this.prismMaterial = options.prismMaterial;
      const idx = OpticalDispersionApparatusMesh.MATERIAL_PRESETS.indexOf(options.prismMaterial);
      if (idx >= 0) {
        this.activeMaterialIndex = idx;
        this.currentTurretAngle = idx * ((Math.PI * 2) / 5);
        this.targetTurretAngle = this.currentTurretAngle;
      }
    }
    if (options.incidentAngleDeg !== undefined) this.incidentAngleDeg = options.incidentAngleDeg;
    if (options.apexAngleDeg !== undefined) this.apexAngleDeg = options.apexAngleDeg;
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;
    if (options.enableRecombinationPrism !== undefined) {
      this.enableRecombinationPrism = options.enableRecombinationPrism;
      this.currentRecombSwing = this.enableRecombinationPrism ? 0.0 : 1.0;
      this.targetRecombSwing = this.currentRecombSwing;
    }
    if (options.showOpticalAuxiliaries !== undefined) this.showOpticalAuxiliaries = options.showOpticalAuxiliaries;
    if (options.showBeamsInAir !== undefined) this.showBeamsInAir = options.showBeamsInAir;

    this.buildApparatus();
    this.syncScreenPositionFromDistance();
    this.updatePrismGeometryAndMount();
    this.updateSourceIndicators();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  // ==================== 1. 主装配构建 ====================
  private buildApparatus(): void {
    // A. 航天级阳极氧化喷砂银铝分光计精雕底座与双铬导轨系统
    this.buildSpectrometerBed();

    // B. 中央 360° 高精激光蚀刻测角分度圆环 (+Z 正对操作者)
    this.buildGoniometerDial();

    // C. 中央高色散水晶三棱镜转台、五档材质转换轮与入射角测微鼓轮
    this.buildPrismTurntableStage();

    // D. 左侧俯仰旋转平行白光/汞氦光谱准直管与弧形摆臂
    this.buildCollimatorArm();

    // E. 牛顿双棱镜复合白光实验：可切入光路的第二倒置三棱镜机械摆臂
    this.buildRecombinationPrismAssembly();

    // F. 右侧全景深海蓝黑彩虹光谱接收屏与红/紫双端游标波长测微卡尺
    this.buildSpectralObservationScreen();

    // G. 3D 空间光路、棱镜内部色散扇、空气体积彩虹带与辅助角度标线
    this.buildOpticalBeamsSystem();
  }

  // ==================== A. 航天级阳极氧化银铝分光计底座与双铬导轨 ====================
  private buildSpectrometerBed(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'SpectrometerBedGroup';

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.36,
      roughness: 0.26,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.28,
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
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.10,
      roughness: 0.75,
    });

    // 1. 主光学床身 (带精铣倒角与减重型腔)
    const bedGeo = createChamferedBlockGeometry(this.railLength, 0.026, this.railWidth, 0.0022);
    const bedMesh = new THREE.Mesh(bedGeo, satinSilverMat);
    bedMesh.position.set(0, 0.025, 0);
    bedMesh.castShadow = true;
    bedMesh.receiveShadow = true;
    this.railGroup.add(bedMesh);

    // 2. 中央分光计圆形重型基座凸台 (支撑三棱镜测角转台与准直臂枢轴)
    const hubRadius = 0.068;
    const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius + 0.006, 0.032, 48);
    const hubMesh = new THREE.Mesh(hubGeo, satinSilverMat);
    hubMesh.position.set(this.prismCenterX, 0.028, 0);
    hubMesh.castShadow = true;
    hubMesh.receiveShadow = true;
    this.railGroup.add(hubMesh);

    const hubTrimRingGeo = new THREE.TorusGeometry(hubRadius + 0.001, 0.0022, 16, 48);
    hubTrimRingGeo.rotateX(Math.PI / 2);
    const hubTrimRing = new THREE.Mesh(hubTrimRingGeo, brassMat);
    hubTrimRing.position.set(this.prismCenterX, 0.043, 0);
    this.railGroup.add(hubTrimRing);

    // 3. 床身正面 CNC 减重凹槽 (深空钛灰内衬)
    const pocketXList = [-0.42, -0.28, 0.08, 0.22, 0.36];
    for (const px of pocketXList) {
      const pocketGeo = createChamferedBlockGeometry(0.095, 0.009, 0.004, 0.0008);
      const pocketFront = new THREE.Mesh(pocketGeo, titaniumSlateMat);
      pocketFront.position.set(px, 0.021, this.railWidth * 0.5 - 0.001);
      this.railGroup.add(pocketFront);
    }

    // 4. 顶部双平行镜面液态铬精密导轨杆
    const rodLen = this.railLength - 0.03;
    const rodGeo = new THREE.CylinderGeometry(0.0055, 0.0055, rodLen, 24);
    rodGeo.rotateZ(Math.PI / 2);
    const frontRod = new THREE.Mesh(rodGeo, chromeRodMat);
    frontRod.position.set(0, this.railHeight, 0.021);
    frontRod.castShadow = true;
    const backRod = new THREE.Mesh(rodGeo, chromeRodMat);
    backRod.position.set(0, this.railHeight, -0.021);
    backRod.castShadow = true;
    this.railGroup.add(frontRod);
    this.railGroup.add(backRod);

    // 5. 左右端精铣阳极氧化端座与香槟金锁紧螺栓
    for (const side of [-1, 1]) {
      const blockX = side * (this.railLength * 0.5 - 0.016);
      const endBlockGeo = createChamferedBlockGeometry(0.032, 0.038, this.railWidth + 0.008, 0.0018);
      const endBlock = new THREE.Mesh(endBlockGeo, titaniumSlateMat);
      endBlock.position.set(blockX, 0.028, 0);
      endBlock.castShadow = true;
      this.railGroup.add(endBlock);

      for (const zOff of [-0.021, 0.021]) {
        const capGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.005, 6);
        capGeo.rotateZ(Math.PI / 2);
        const cap = new THREE.Mesh(capGeo, brassMat);
        cap.position.set(blockX + side * 0.017, this.railHeight, zOff);
        this.railGroup.add(cap);
      }
    }

    // 6. 六点防倾覆横梁支脚与香槟金调平旋钮脚垫
    const footXPositions = [-this.railLength * 0.44, this.prismCenterX, this.railLength * 0.44];
    for (const fx of footXPositions) {
      const crossBarGeo = createChamferedBlockGeometry(0.056, 0.012, 0.148, 0.0015);
      const crossBar = new THREE.Mesh(crossBarGeo, satinSilverMat);
      crossBar.position.set(fx, 0.010, 0);
      crossBar.castShadow = true;
      crossBar.receiveShadow = true;
      this.railGroup.add(crossBar);

      for (const fz of [-0.058, 0.058]) {
        const knurlRingGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.006, 24);
        const knurlRing = new THREE.Mesh(knurlRingGeo, brassMat);
        knurlRing.position.set(fx, 0.006, fz);
        this.railGroup.add(knurlRing);

        const padGeo = new THREE.CylinderGeometry(0.017, 0.018, 0.004, 24);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(fx, 0.002, fz);
        this.railGroup.add(pad);
      }
    }

    // 7. 正面 (+Z) 深海蓝黑激光蚀刻 0~100cm 毫米标尺面板
    this.railScaleCanvas = safeCanvas(2048, 128);
    if (this.railScaleCanvas) {
      const ctx = this.railScaleCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#08101e';
        ctx.fillRect(0, 0, 2048, 128);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 2044, 124);

        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#e2e8f0';
        ctx.font = 'bold 26px "JetBrains Mono", "SF Pro Display", monospace';
        ctx.textAlign = 'center';

        const padPx = 56;
        const usableW = 2048 - padPx * 2;
        for (let cm = 0; cm <= 100; cm++) {
          const x = padPx + (cm / 100) * usableW;
          const is10 = cm % 10 === 0;
          const is5 = cm % 5 === 0;
          const tickH = is10 ? 44 : is5 ? 30 : 16;

          ctx.strokeStyle = is10 ? '#38bdf8' : '#cbd5e1';
          ctx.lineWidth = is10 ? 3.0 : 1.5;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, tickH);
          ctx.stroke();

          if (is10) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(`${cm}`, x, 82);
          }
        }
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('SPECTROMETER BENCH (cm)', 1860, 112);
      }
      this.railScaleTexture = new THREE.CanvasTexture(this.railScaleCanvas);
      this.railScaleTexture.anisotropy = 8;
    }

    const scaleStripGeo = new THREE.PlaneGeometry(this.railLength - 0.08, 0.015);
    const scaleStripMat = new THREE.MeshBasicMaterial({ map: this.railScaleTexture });
    const scaleStrip = new THREE.Mesh(scaleStripGeo, scaleStripMat);
    scaleStrip.position.set(0, 0.031, this.railWidth * 0.5 + 0.0012);
    this.railGroup.add(scaleStrip);

    this.group.add(this.railGroup);
  }

  // ==================== B. 中央 360° 激光蚀刻分光测角圆环 ====================
  private buildGoniometerDial(): void {
    this.goniometerDialGroup = new THREE.Group();
    this.goniometerDialGroup.name = 'GoniometerDialGroup';
    this.goniometerDialGroup.position.set(this.prismCenterX, this.prismCenterY, -0.044);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.42,
      roughness: 0.24,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.30,
      roughness: 0.36,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.48,
      roughness: 0.22,
    });

    const outerR = 0.142;
    const innerR = 0.106;

    // 1. 支撑立柱 (从中央凸台向上连接测角圆环后背)
    const pillarH = this.prismCenterY - 0.038;
    const pillarGeo = createChamferedBlockGeometry(0.034, pillarH, 0.020, 0.0016);
    const pillar = new THREE.Mesh(pillarGeo, satinSilverMat);
    pillar.position.set(0, -pillarH * 0.5, -0.012);
    pillar.castShadow = true;
    this.goniometerDialGroup.add(pillar);

    // 2. 航天级银铝精雕测角外环基座 (基座正面严谨对齐 z = 0.0000，彻底位于刻度环与黄铜压圈后方)
    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, outerR + 0.006, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, innerR - 0.004, 0, Math.PI * 2, true);
    ringShape.holes.push(holePath);

    const frameDepth = 0.007;
    const frameBevel = 0.0012;
    const frameGeo = new THREE.ExtrudeGeometry(ringShape, {
      steps: 1,
      depth: frameDepth,
      bevelEnabled: true,
      bevelThickness: frameBevel,
      bevelSize: frameBevel,
      bevelSegments: 2,
      curveSegments: 72,
    });
    // 将外环基座向后平移，使其正面最高处平齐于 z = 0.0000，彻底杜绝与刻度盘和黄铜环的 Z-fighting 闪烁
    frameGeo.translate(0, 0, -(frameDepth + frameBevel));
    const frameMesh = new THREE.Mesh(frameGeo, satinSilverMat);
    frameMesh.castShadow = true;
    this.goniometerDialGroup.add(frameMesh);

    // 2b. 深空钛灰分度盘物理承载衬底环 (清晰凸出于基座 z = 0.0018，提供坚实的实体垫层)
    const dialBackingGeo = new THREE.RingGeometry(innerR - 0.0006, outerR + 0.0006, 96);
    const dialBackingMesh = new THREE.Mesh(dialBackingGeo, titaniumSlateMat);
    dialBackingMesh.position.z = 0.0018;
    dialBackingMesh.castShadow = false;
    dialBackingMesh.receiveShadow = true;
    this.goniometerDialGroup.add(dialBackingMesh);

    // 3. 高清激光蚀刻 360° 角度刻度环纹理 (1024x1024，深邃海洋蓝黑底盘配合激光天青刻度线)
    this.goniometerDialCanvas = safeCanvas(1024, 1024);
    if (this.goniometerDialCanvas) {
      const ctx = this.goniometerDialCanvas.getContext('2d');
      if (ctx) {
        const cx = 512;
        const cy = 512;
        ctx.clearRect(0, 0, 1024, 1024);

        // 深海蓝宝石环形底盘 (填满 innerR 至 outerR 完整 UV 扇区，消除边缘透明发白缝隙)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 512, 0, Math.PI * 2, false);
        ctx.arc(cx, cy, 376, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fillStyle = '#08101e';
        ctx.fill();

        // 外周镜面激光蚀刻天青基准圈与内周香槟金防眩分界圈
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 508, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(cx, cy, 384, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 绘制 360° 刻度与每 15° 角度读数
        for (let deg = 0; deg < 360; deg += 1) {
          const rad = THREE.MathUtils.degToRad(deg);
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const is15 = deg % 15 === 0;
          const is5 = deg % 5 === 0;

          if (!is5 && deg % 2 !== 0) continue;

          const rIn = 386;
          const rOut = is15 ? 426 : is5 ? 412 : 398;
          ctx.strokeStyle = is15 ? '#38bdf8' : is5 ? '#e2e8f0' : '#64748b';
          ctx.lineWidth = is15 ? 3.2 : is5 ? 2.0 : 1.2;
          ctx.beginPath();
          ctx.moveTo(cx + cos * rIn, cy - sin * rIn);
          ctx.lineTo(cx + cos * rOut, cy - sin * rOut);
          ctx.stroke();

          if (is15) {
            let quadDeg = deg % 180;
            if (quadDeg > 90) quadDeg = 180 - quadDeg;
            const rTxt = 462;
            ctx.fillStyle = deg % 90 === 0 ? '#fbbf24' : '#f8fafc';
            ctx.font = 'bold 25px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${quadDeg}°`, cx + cos * rTxt, cy - sin * rTxt);
          }
        }
      }
      this.goniometerDialTexture = new THREE.CanvasTexture(this.goniometerDialCanvas);
      this.goniometerDialTexture.anisotropy = 8;
    }

    const dialRingGeo = new THREE.RingGeometry(innerR, outerR, 96);
    const dialRingMat = new THREE.MeshBasicMaterial({
      map: this.goniometerDialTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
      side: THREE.FrontSide,
    });
    const dialRingMesh = new THREE.Mesh(dialRingGeo, dialRingMat);
    dialRingMesh.position.z = 0.0028;
    dialRingMesh.renderOrder = 3;
    this.goniometerDialGroup.add(dialRingMesh);

    // 4. 内外香槟金精密压圈 (置于 z = 0.0042，高出刻度盘表面，形成精密机械压圈装配层，彻底杜绝任何穿模与闪烁)
    const outerBrassRingGeo = new THREE.TorusGeometry(outerR + 0.0012, 0.0020, 16, 96);
    const outerBrassRing = new THREE.Mesh(outerBrassRingGeo, brassMat);
    outerBrassRing.position.z = 0.0042;
    this.goniometerDialGroup.add(outerBrassRing);

    const innerBrassRingGeo = new THREE.TorusGeometry(innerR - 0.0008, 0.0018, 16, 96);
    const innerBrassRing = new THREE.Mesh(innerBrassRingGeo, brassMat);
    innerBrassRing.position.z = 0.0042;
    this.goniometerDialGroup.add(innerBrassRing);

    // 5. 外周 4 枚 90° 基准游标定位耳座
    for (let i = 0; i < 4; i++) {
      const ang = i * (Math.PI * 0.5);
      const lugGeo = createChamferedBlockGeometry(0.014, 0.014, 0.012, 0.001);
      const lug = new THREE.Mesh(lugGeo, titaniumSlateMat);
      lug.position.set(Math.cos(ang) * (outerR + 0.006), Math.sin(ang) * (outerR + 0.006), 0);
      lug.rotation.z = ang;
      this.goniometerDialGroup.add(lug);
    }

    this.group.add(this.goniometerDialGroup);
  }

  // ==================== C. 中央高色散水晶三棱镜转台、五档材质转换轮与测微鼓轮 ====================
  private buildPrismTurntableStage(): void {
    this.prismStageGroup = new THREE.Group();
    this.prismStageGroup.name = 'PrismStageGroup';
    this.prismStageGroup.position.set(this.prismCenterX, this.prismCenterY, 0);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.40,
      roughness: 0.24,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.28,
      roughness: 0.36,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.82,
      roughness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.48,
      roughness: 0.22,
    });

    // 1. 高透光学水晶三棱镜材质 (MeshPhysicalMaterial 具有清澈菲涅尔反射与通透光泽，不写深度以确保内部彩虹色散扇100%呈现)
    const matSpec = PRISM_MATERIALS[this.prismMaterial] || PRISM_MATERIALS.flint;
    this.prismGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: matSpec.tintHex,
      roughness: 0.03,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.98,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: matSpec.emissiveHex,
      emissiveIntensity: 0.16,
    });

    const vertices = this.getPrimaryPrismVerticesLocal();
    const prismGeo = createBeveledPrismGeometry(
      vertices.vLeft,
      vertices.vRight,
      vertices.vTop,
      this.prismDepth,
      0.0018
    );
    this.prismCrystalMesh = new THREE.Mesh(prismGeo, this.prismGlassMaterial);
    this.prismCrystalMesh.name = 'PrimaryCrystalPrismMesh';
    this.prismCrystalMesh.userData = { interactiveId: 'prism_micrometer' };
    this.prismCrystalMesh.renderOrder = 8;
    this.prismStageGroup.add(this.prismCrystalMesh);

    // 2. 三棱镜底部精密运动学承载托盘 (Kinematic Prism Platform) 与三点香槟金调平螺丝
    const baseY = vertices.vLeft.y - 0.008;
    const plateW = Math.abs(vertices.vRight.x - vertices.vLeft.x) + 0.024;
    const plateGeo = createChamferedBlockGeometry(plateW, 0.010, this.prismDepth + 0.014, 0.0015);
    this.prismBottomPlateMesh = new THREE.Mesh(plateGeo, satinSilverMat);
    this.prismBottomPlateMesh.name = 'PrismBottomPlateMesh';
    this.prismBottomPlateMesh.position.set(0, baseY, 0);
    this.prismBottomPlateMesh.castShadow = true;
    this.prismBottomPlateMesh.userData = { interactiveId: 'prism_micrometer' };
    this.prismStageGroup.add(this.prismBottomPlateMesh);

    // 托盘下沿深空钛灰分度转盘座与三枚香槟金滚花调平螺丝
    const subTurntableGeo = new THREE.CylinderGeometry(0.048, 0.052, 0.014, 36);
    const subTurntable = new THREE.Mesh(subTurntableGeo, titaniumSlateMat);
    subTurntable.position.set(0, baseY - 0.012, 0);
    this.prismStageGroup.add(subTurntable);

    for (const sx of [-plateW * 0.36, 0, plateW * 0.36]) {
      const screwGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 18);
      const screw = new THREE.Mesh(screwGeo, brassMat);
      screw.position.set(sx, baseY - 0.007, this.prismDepth * 0.42);
      this.prismStageGroup.add(screw);
    }

    // 3. 三棱镜顶部香槟金/银铝防松压帽 (Top Optical Retaining Bridge)
    const capGeo = createChamferedBlockGeometry(0.026, 0.008, this.prismDepth + 0.008, 0.0012);
    this.prismTopCapMesh = new THREE.Mesh(capGeo, satinSilverMat);
    this.prismTopCapMesh.position.set(0, vertices.vTop.y + 0.005, 0);
    this.prismStageGroup.add(this.prismTopCapMesh);

    const topFinialGeo = new THREE.CylinderGeometry(0.005, 0.006, 0.009, 20);
    const topFinial = new THREE.Mesh(topFinialGeo, brassMat);
    topFinial.position.set(0, 0.007, 0);
    this.prismTopCapMesh.add(topFinial);

    // 4. 中央主立柱 (连接转台底部与导轨凸台)
    const centerStemH = (this.prismCenterY + baseY - 0.018) - 0.042;
    const centerStemGeo = new THREE.CylinderGeometry(0.016, 0.018, Math.max(0.04, centerStemH), 28);
    const centerStem = new THREE.Mesh(centerStemGeo, chromeMat);
    centerStem.position.set(0, baseY - 0.018 - centerStemH * 0.5, 0);
    centerStem.castShadow = true;
    this.prismStageGroup.add(centerStem);

    // 5. 正前方 (+Z) 精密蜗杆测微鼓轮 (调节入射角 θ1，具有 >12 个真实机械滚花与刻度环子构件)
    const microGroup = new THREE.Group();
    microGroup.name = 'PrismMicrometerGroup';
    microGroup.position.set(0.042, baseY - 0.022, 0.032);
    microGroup.userData = { interactiveId: 'prism_micrometer' };

    const sleeveGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.024, 24);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, chromeMat);
    sleeveMesh.userData = { interactiveId: 'prism_micrometer' };
    microGroup.add(sleeveMesh);

    const knobBodyGeo = new THREE.CylinderGeometry(0.0115, 0.0115, 0.018, 28);
    knobBodyGeo.rotateX(Math.PI / 2);
    this.prismMicrometerKnob = new THREE.Mesh(knobBodyGeo, brassMat);
    this.prismMicrometerKnob.name = 'PrismMicrometerKnob';
    this.prismMicrometerKnob.position.set(0, 0, 0.016);
    this.prismMicrometerKnob.userData = { interactiveId: 'prism_micrometer' };

    // 16 道真实立体防滑滚花棱条 + 锥形读数裙边 + 端面内六角锁孔
    const ridgeGeo = new THREE.BoxGeometry(0.0014, 0.0014, 0.015);
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const ridge = new THREE.Mesh(ridgeGeo, titaniumSlateMat);
      ridge.position.set(Math.cos(ang) * 0.0116, Math.sin(ang) * 0.0116, 0);
      ridge.rotation.z = ang;
      ridge.userData = { interactiveId: 'prism_micrometer' };
      this.prismMicrometerKnob.add(ridge);
    }

    const skirtGeo = new THREE.CylinderGeometry(0.0086, 0.0112, 0.006, 28);
    skirtGeo.rotateX(Math.PI / 2);
    const skirtMesh = new THREE.Mesh(skirtGeo, chromeMat);
    skirtMesh.position.set(0, 0, -0.012);
    this.prismMicrometerKnob.add(skirtMesh);

    const endCapGeo = new THREE.CylinderGeometry(0.007, 0.009, 0.005, 20);
    endCapGeo.rotateX(Math.PI / 2);
    const endCapMesh = new THREE.Mesh(endCapGeo, satinSilverMat);
    endCapMesh.position.set(0, 0, 0.0115);
    this.prismMicrometerKnob.add(endCapMesh);

    microGroup.add(this.prismMicrometerKnob);

    // 测微鼓轮原生 3D 悬浮引导光晕环
    const microCueGeo = new THREE.TorusGeometry(0.0155, 0.0008, 16, 48, Math.PI * 1.65);
    const microCueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.micrometerHoverCue = new THREE.Mesh(microCueGeo, microCueMat);
    this.micrometerHoverCue.name = 'MicrometerHoverCue';
    this.micrometerHoverCue.position.set(0, 0, 0.018);
    this.micrometerHoverCue.visible = false;
    microGroup.add(this.micrometerHoverCue);

    this.prismStageGroup.add(microGroup);

    // 6. 左侧五档光学玻璃材质转换棘轮盘 (5-Stage Optical Glass Material Turret Wheel)
    this.materialTurretWheel = new THREE.Group();
    this.materialTurretWheel.name = 'MaterialTurretWheel';
    this.materialTurretWheel.position.set(-0.044, baseY - 0.022, 0.028);
    this.materialTurretWheel.rotation.z = this.currentTurretAngle;
    this.materialTurretWheel.userData = { interactiveId: 'prism_material_turret' };

    // 铝合金内盘 (半径 0.0170m，厚度 0.009m，精准嵌于外周黄铜滚花圈内，杜绝共面与重叠闪烁)
    const wheelDiskGeo = new THREE.CylinderGeometry(0.0170, 0.0170, 0.009, 32);
    wheelDiskGeo.rotateX(Math.PI / 2);
    const wheelDisk = new THREE.Mesh(wheelDiskGeo, satinSilverMat);
    wheelDisk.userData = { interactiveId: 'prism_material_turret' };
    this.materialTurretWheel.add(wheelDisk);

    // 外周香槟金精密防滑滚花外圈 (主半径 0.0185m，管径 0.0018m，包裹于内盘外缘)
    const wheelRimGeo = new THREE.TorusGeometry(0.0185, 0.0018, 16, 40);
    const wheelRim = new THREE.Mesh(wheelRimGeo, brassMat);
    wheelRim.userData = { interactiveId: 'prism_material_turret' };
    this.materialTurretWheel.add(wheelRim);

    const hubBossGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 20);
    hubBossGeo.rotateX(Math.PI / 2);
    const hubBoss = new THREE.Mesh(hubBossGeo, chromeMat);
    hubBoss.userData = { interactiveId: 'prism_material_turret' };
    this.materialTurretWheel.add(hubBoss);

    // 5 枚光学材质宝石色标镶嵌窗与外周 10 枚滚花拨齿
    const sampleColors = [0x38bdf8, 0x2563eb, 0x6366f1, 0x06b6d4, 0xec4899];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const gemGeo = new THREE.CylinderGeometry(0.0038, 0.0038, 0.0115, 16);
      gemGeo.rotateX(Math.PI / 2);
      const gemMat = new THREE.MeshStandardMaterial({
        color: sampleColors[i],
        emissive: sampleColors[i],
        emissiveIntensity: 0.35,
        metalness: 0.2,
        roughness: 0.15,
      });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.name = `MaterialGem_${i}`;
      gem.position.set(Math.cos(ang) * 0.012, Math.sin(ang) * 0.012, 0);
      gem.userData = { interactiveId: 'prism_material_turret', gemIndex: i };
      this.materialTurretWheel.add(gem);
    }

    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const notchGeo = new THREE.BoxGeometry(0.0020, 0.0020, 0.010);
      const notch = new THREE.Mesh(notchGeo, titaniumSlateMat);
      notch.position.set(Math.cos(ang) * 0.0195, Math.sin(ang) * 0.0195, 0);
      notch.rotation.z = ang;
      notch.userData = { interactiveId: 'prism_material_turret' };
      this.materialTurretWheel.add(notch);
    }

    // 材质转轮原生 3D 悬浮引导光晕环
    const turretCueGeo = new THREE.TorusGeometry(0.0235, 0.0008, 16, 48, Math.PI * 1.65);
    const turretCueMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.turretHoverCue = new THREE.Mesh(turretCueGeo, turretCueMat);
    this.turretHoverCue.name = 'TurretHoverCue';
    this.turretHoverCue.position.set(-0.044, baseY - 0.022, 0.035);
    this.turretHoverCue.visible = false;
    this.prismStageGroup.add(this.turretHoverCue);

    this.prismStageGroup.add(this.materialTurretWheel);

    // 7. 棱镜上方纯大字号深色 3D 物理参数浮空文本 (严格遵循无背景框/无边框铁律)
    this.prismValueCanvas = safeCanvas(1024, 256);
    if (this.prismValueCanvas) {
      this.prismValueTexture = new THREE.CanvasTexture(this.prismValueCanvas);
      this.prismValueTexture.minFilter = THREE.LinearFilter;
      this.prismValueTexture.magFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: this.prismValueTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.prismValueSprite = new THREE.Sprite(spriteMat);
      this.prismValueSprite.name = 'PrismValueLabel';
      this.prismValueSprite.scale.set(0.24, 0.060, 1.0);
      this.prismValueSprite.renderOrder = 30;
      this.prismValueSprite.raycast = () => {};
      this.prismValueSprite.position.set(0, 0.235, 0);
      this.prismStageGroup.add(this.prismValueSprite);
    } else {
      this.prismValueSprite = new THREE.Sprite(new THREE.SpriteMaterial());
      this.prismValueSprite.raycast = () => {};
    }

    this.group.add(this.prismStageGroup);
  }

  // ==================== D. 左侧俯仰旋转平行白光/汞氦光谱准直管与弧形摆臂 ====================
  private buildCollimatorArm(): void {
    this.collimatorArmGroup = new THREE.Group();
    this.collimatorArmGroup.name = 'CollimatorArmGroup';
    this.collimatorArmGroup.userData = { interactiveId: 'collimator_arm' };

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
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.80,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.45,
      roughness: 0.24,
    });

    // 准直管总成沿局部 -X 延伸 (局部原点 (0,0,0) 对齐第一界面入射点 P1，旋转 Z 轴即为光线入射俯仰角)
    // 1. 平行光管主镜筒与前端香槟金调焦环顺序轴向衔接，彻底杜绝端面重叠共面
    const barrelStart = -0.135;
    const focusRingLen = 0.016;
    const tubeEnd = barrelStart - focusRingLen; // -0.151
    const tubeLen = 0.138;
    const tubeCenter = tubeEnd - tubeLen * 0.5; // -0.220
    const barrelLen = focusRingLen + tubeLen; // 0.154
    const barrelCenter = tubeCenter;

    const tubeGeo = new THREE.CylinderGeometry(0.022, 0.022, tubeLen, 36);
    tubeGeo.rotateZ(Math.PI / 2);
    const tubeMesh = new THREE.Mesh(tubeGeo, satinSilverMat);
    tubeMesh.position.set(tubeCenter, 0, 0);
    tubeMesh.castShadow = true;
    tubeMesh.userData = { interactiveId: 'collimator_arm' };
    this.collimatorArmGroup.add(tubeMesh);

    // 镜筒中部 6 道精密铝合金散热环与双 CNC 抱箍
    for (let i = 0; i < 6; i++) {
      const fx = tubeCenter - 0.032 + i * 0.013;
      const finGeo = new THREE.CylinderGeometry(0.0255, 0.0255, 0.004, 36);
      finGeo.rotateZ(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, titaniumSlateMat);
      fin.position.set(fx, 0, 0);
      fin.userData = { interactiveId: 'collimator_arm' };
      this.collimatorArmGroup.add(fin);
    }

    // 前端消色差准直透镜香槟金调焦环与立体机械滚花棱条 (正对三棱镜左斜面，位置 -0.151 到 -0.135)
    const focusRingGeo = new THREE.CylinderGeometry(0.024, 0.024, focusRingLen, 36);
    focusRingGeo.rotateZ(Math.PI / 2);
    const focusRing = new THREE.Mesh(focusRingGeo, brassMat);
    focusRing.position.set(tubeEnd + focusRingLen * 0.5, 0, 0);
    focusRing.userData = { interactiveId: 'collimator_arm' };

    // 24 道精细机械防滑滚花棱条，不仅提供极致工业质感，同时避免圆柱大面积平整高光反射频闪
    const focusRibGeo = new THREE.BoxGeometry(focusRingLen - 0.002, 0.0014, 0.0014);
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const rib = new THREE.Mesh(focusRibGeo, titaniumSlateMat);
      rib.position.set(0, Math.cos(ang) * 0.0241, Math.sin(ang) * 0.0241);
      rib.rotation.x = ang;
      rib.userData = { interactiveId: 'collimator_arm' };
      focusRing.add(rib);
    }
    this.collimatorArmGroup.add(focusRing);

    const nozzleGeo = new THREE.CylinderGeometry(0.012, 0.019, 0.018, 28);
    nozzleGeo.rotateZ(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, chromeMat);
    nozzle.position.set(barrelStart + 0.009, 0, 0);
    nozzle.userData = { interactiveId: 'collimator_arm' };
    this.collimatorArmGroup.add(nozzle);

    // 准直发射发光窗
    const emitterLensGeo = new THREE.CircleGeometry(0.009, 24);
    emitterLensGeo.rotateY(Math.PI / 2);
    this.laserLedMesh = new THREE.Mesh(
      emitterLensGeo,
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.96 })
    );
    this.laserLedMesh.name = 'CollimatorEmitterLens';
    this.laserLedMesh.position.set(barrelStart + 0.0185, 0, 0);
    this.collimatorArmGroup.add(this.laserLedMesh);

    // 后端高亮度氙气/汞氦光谱灯室后盖与香槟金防折应力尾套
    const lampHouseGeo = new THREE.CylinderGeometry(0.026, 0.023, 0.032, 32);
    lampHouseGeo.rotateZ(Math.PI / 2);
    const lampHouse = new THREE.Mesh(lampHouseGeo, titaniumSlateMat);
    lampHouse.position.set(barrelStart - barrelLen - 0.016, 0, 0);
    lampHouse.userData = { interactiveId: 'collimator_arm' };
    this.collimatorArmGroup.add(lampHouse);

    const strainBootGeo = new THREE.CylinderGeometry(0.007, 0.011, 0.018, 20);
    strainBootGeo.rotateZ(Math.PI / 2);
    const strainBoot = new THREE.Mesh(strainBootGeo, brassMat);
    strainBoot.position.set(barrelStart - barrelLen - 0.038, 0, 0);
    this.collimatorArmGroup.add(strainBoot);

    // 2. 侧面弧形测角摆臂连杆 (连接准直管与分光计测角转轴)
    const armBarGeo = createChamferedBlockGeometry(0.195, 0.014, 0.010, 0.0012);
    const armBar = new THREE.Mesh(armBarGeo, satinSilverMat);
    armBar.position.set(-0.125, -0.028, -0.022);
    armBar.userData = { interactiveId: 'collimator_arm' };
    this.collimatorArmGroup.add(armBar);

    const clampYokeGeo = createChamferedBlockGeometry(0.038, 0.036, 0.056, 0.0015);
    const clampYoke = new THREE.Mesh(clampYokeGeo, titaniumSlateMat);
    clampYoke.position.set(barrelCenter, -0.018, 0);
    clampYoke.userData = { interactiveId: 'collimator_arm' };
    this.collimatorArmGroup.add(clampYoke);

    // 3. 正面对向操作者 (+Z) 的倾斜式多光谱控制面板
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(barrelCenter, 0.028, 0.018);
    consoleGroup.rotation.x = 0.42;

    const consolePlateGeo = createChamferedBlockGeometry(0.128, 0.028, 0.008, 0.001);
    const consolePlate = new THREE.Mesh(consolePlateGeo, titaniumSlateMat);
    consoleGroup.add(consolePlate);

    // a. 电源拨杆开关 (-0.050)
    const swBaseGeo = new THREE.CylinderGeometry(0.0045, 0.0052, 0.005, 16);
    swBaseGeo.rotateX(Math.PI / 2);
    const swBase = new THREE.Mesh(swBaseGeo, brassMat);
    swBase.position.set(-0.050, 0, 0.005);
    consoleGroup.add(swBase);

    const leverGeo = new THREE.CylinderGeometry(0.0020, 0.0026, 0.013, 14);
    this.laserSwitchMesh = new THREE.Mesh(leverGeo, chromeMat);
    this.laserSwitchMesh.name = 'LaserPowerSwitch';
    this.laserSwitchMesh.position.set(-0.050, 0, 0.010);
    this.laserSwitchMesh.rotation.z = this.laserPower ? -0.25 : 0.25;
    this.laserSwitchMesh.userData = { interactiveId: 'laser_power' };
    consoleGroup.add(this.laserSwitchMesh);

    // b. 复合白光模式按钮 (-0.030)
    const whiteBtnGeo = createChamferedBlockGeometry(0.016, 0.013, 0.006, 0.0008);
    this.whiteLightBtnMesh = new THREE.Mesh(
      whiteBtnGeo,
      new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xfef08a,
        emissiveIntensity: 0.75,
        roughness: 0.2,
      })
    );
    this.whiteLightBtnMesh.name = 'SourceWhiteButton';
    this.whiteLightBtnMesh.position.set(-0.028, 0, 0.006);
    this.whiteLightBtnMesh.userData = { interactiveId: 'source_white' };
    consoleGroup.add(this.whiteLightBtnMesh);

    // c. 汞氦原子特征光谱线模式按钮 (-0.008)
    const specBtnGeo = createChamferedBlockGeometry(0.016, 0.013, 0.006, 0.0008);
    this.spectralLinesBtnMesh = new THREE.Mesh(
      specBtnGeo,
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.15,
        roughness: 0.2,
      })
    );
    this.spectralLinesBtnMesh.name = 'SourceSpectralLinesButton';
    this.spectralLinesBtnMesh.position.set(-0.008, 0, 0.006);
    this.spectralLinesBtnMesh.userData = { interactiveId: 'source_spectral_lines' };
    consoleGroup.add(this.spectralLinesBtnMesh);

    // d. 三枚特征单色激光按钮 (650nm 红 / 532nm 绿 / 405nm 紫)
    const wlPresets = [
      { wl: 650, x: 0.014 },
      { wl: 532, x: 0.031 },
      { wl: 405, x: 0.048 },
    ];
    for (const item of wlPresets) {
      const btnGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.006, 20);
      btnGeo.rotateX(Math.PI / 2);
      const c = OpticalPhysics.wavelengthToColor(item.wl);
      const btnMat = new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.2,
        roughness: 0.25,
      });
      const btn = new THREE.Mesh(btnGeo, btnMat);
      btn.name = `WavelengthBtn_${item.wl}`;
      btn.position.set(item.x, 0, 0.006);
      btn.userData = {
        interactiveId: `laser_wavelength_${item.wl}`,
        wavelength: item.wl,
      };
      this.wlButtons[item.wl] = btn;
      consoleGroup.add(btn);
    }

    this.collimatorArmGroup.add(consoleGroup);
    this.group.add(this.collimatorArmGroup);
  }

  // ==================== E. 牛顿双棱镜复合白光实验：可切入光路的第二倒置三棱镜机械摆臂 ====================
  private buildRecombinationPrismAssembly(): void {
    this.recombinationGroup = new THREE.Group();
    this.recombinationGroup.name = 'RecombinationPrismAssembly';
    this.recombinationGroup.position.set(0.055, 0.042, 0);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.40,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.28,
      roughness: 0.36,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.82,
      roughness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.48,
      roughness: 0.22,
    });

    // 1. 导轨固定支座与立柱枢轴座
    const mountBaseGeo = createChamferedBlockGeometry(0.052, 0.022, 0.076, 0.0015);
    const mountBase = new THREE.Mesh(mountBaseGeo, satinSilverMat);
    mountBase.position.set(0, 0.011, 0);
    mountBase.castShadow = true;
    this.recombinationGroup.add(mountBase);

    const postH = 0.215;
    const postGeo = createChamferedBlockGeometry(0.018, postH, 0.016, 0.0012);
    const post = new THREE.Mesh(postGeo, titaniumSlateMat);
    post.position.set(0, 0.022 + postH * 0.5, -0.026);
    post.castShadow = true;
    this.recombinationGroup.add(post);

    // 枢轴中心位于 (0, 0.225, -0.018)
    const pivotY = 0.225;
    const pivotHubGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.024, 28);
    pivotHubGeo.rotateX(Math.PI / 2);
    const pivotHub = new THREE.Mesh(pivotHubGeo, satinSilverMat);
    pivotHub.position.set(0, pivotY, -0.016);
    pivotHub.userData = { interactiveId: 'recombination_toggle' };
    this.recombinationGroup.add(pivotHub);

    // 正面香槟金滚花摆臂旋钮
    const toggleKnobGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.014, 24);
    toggleKnobGeo.rotateX(Math.PI / 2);
    this.recombinationToggleKnob = new THREE.Mesh(toggleKnobGeo, brassMat);
    this.recombinationToggleKnob.name = 'RecombinationToggleKnob';
    this.recombinationToggleKnob.position.set(0, pivotY, 0.002);
    this.recombinationToggleKnob.userData = { interactiveId: 'recombination_toggle' };

    const slotGeo = new THREE.BoxGeometry(0.002, 0.018, 0.002);
    const slotMesh = new THREE.Mesh(slotGeo, titaniumSlateMat);
    slotMesh.position.set(0, 0, 0.0075);
    slotMesh.userData = { interactiveId: 'recombination_toggle' };
    this.recombinationToggleKnob.add(slotMesh);

    this.recombinationGroup.add(this.recombinationToggleKnob);

    // 2. 旋转摆臂与倒置复合水晶三棱镜 (Inverted Equilateral Recombination Prism)
    this.recombinationPivotArm = new THREE.Group();
    this.recombinationPivotArm.name = 'RecombinationPivotArm';
    this.recombinationPivotArm.position.set(0, pivotY, 0);
    this.recombinationPivotArm.userData = { interactiveId: 'recombination_toggle' };

    const swingLinkGeo = createChamferedBlockGeometry(0.014, 0.072, 0.010, 0.001);
    const swingLink = new THREE.Mesh(swingLinkGeo, chromeMat);
    swingLink.position.set(0, -0.032, -0.014);
    swingLink.userData = { interactiveId: 'recombination_toggle' };
    this.recombinationPivotArm.add(swingLink);

    // 倒置三棱镜几何 (顶点朝下 ∇，与第一块正立三棱镜 △ 形成牛顿消色散平行复合系统)
    const invS = 0.088;
    const invAlpha = THREE.MathUtils.degToRad(60);
    const invH = invS * Math.cos(invAlpha * 0.5);
    const invW = invS * Math.sin(invAlpha * 0.5);
    const vTopLeft = new THREE.Vector2(-invW, 0.036);
    const vTopRight = new THREE.Vector2(invW, 0.036);
    const vBottomApex = new THREE.Vector2(0, 0.036 - invH);

    this.recombGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.03,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.98,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.14,
    });

    const invPrismGeo = createBeveledPrismGeometry(
      vBottomApex,
      vTopRight,
      vTopLeft,
      0.054,
      0.0014
    );
    this.recombinationPrismMesh = new THREE.Mesh(invPrismGeo, this.recombGlassMaterial);
    this.recombinationPrismMesh.name = 'RecombinationCrystalPrismMesh';
    this.recombinationPrismMesh.position.set(0.008, -0.068, 0);
    this.recombinationPrismMesh.renderOrder = 8;
    this.recombinationPrismMesh.userData = { interactiveId: 'recombination_toggle' };
    this.recombinationPivotArm.add(this.recombinationPrismMesh);

    // 倒置三棱镜顶部银铝夹持顶梁与香槟金锁紧螺母
    const topClampGeo = createChamferedBlockGeometry(invW * 2.1, 0.008, 0.060, 0.001);
    const topClamp = new THREE.Mesh(topClampGeo, satinSilverMat);
    topClamp.position.set(0.008, -0.028, 0);
    topClamp.userData = { interactiveId: 'recombination_toggle' };
    this.recombinationPivotArm.add(topClamp);

    // 3D 悬浮引导光晕环
    const recombCueGeo = new THREE.TorusGeometry(0.017, 0.0008, 16, 48, Math.PI * 1.65);
    const recombCueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.recombinationHoverCue = new THREE.Mesh(recombCueGeo, recombCueMat);
    this.recombinationHoverCue.name = 'RecombinationHoverCue';
    this.recombinationHoverCue.position.set(0, pivotY, 0.010);
    this.recombinationHoverCue.visible = false;
    this.recombinationGroup.add(this.recombinationHoverCue);

    this.recombinationGroup.add(this.recombinationPivotArm);
    this.group.add(this.recombinationGroup);
  }

  // ==================== F. 右侧全景深海蓝黑彩虹光谱接收屏与红/紫双端游标波长测微卡尺 ====================
  private buildSpectralObservationScreen(): void {
    this.screenCarrierGroup = new THREE.Group();
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';
    this.screenCarrierGroup.position.set(this.maxScreenX, 0, 0);
    this.screenCarrierGroup.userData = { interactiveId: 'screen_handle' };

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.28,
      roughness: 0.38,
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
    const rubyPointerMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.35,
      metalness: 0.4,
      roughness: 0.2,
    });
    const violetPointerMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.35,
      metalness: 0.4,
      roughness: 0.2,
    });

    // 1. 精密导轨滑鞍底座 (带燕尾导向卡爪、香槟金锁紧套筒与游标指针)
    const saddleGeo = createChamferedBlockGeometry(0.074, 0.022, 0.082, 0.0016);
    const saddle = new THREE.Mesh(saddleGeo, satinSilverMat);
    saddle.position.set(0, this.railHeight + 0.011, 0);
    saddle.castShadow = true;
    saddle.userData = { interactiveId: 'screen_handle' };
    this.screenCarrierGroup.add(saddle);

    const indexLineGeo = new THREE.BoxGeometry(0.0024, 0.018, 0.0025);
    const indexLine = new THREE.Mesh(indexLineGeo, brassMat);
    indexLine.position.set(0, this.railHeight + 0.005, 0.0415);
    this.screenCarrierGroup.add(indexLine);

    const collarGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.032, 28);
    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.position.set(0, this.railHeight + 0.036, 0);
    collar.userData = { interactiveId: 'screen_handle' };
    this.screenCarrierGroup.add(collar);

    const postGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.065, 24);
    const post = new THREE.Mesh(postGeo, chromeMat);
    post.position.set(0, this.railHeight + 0.075, 0);
    post.userData = { interactiveId: 'screen_handle' };
    this.screenCarrierGroup.add(post);

    // 2. 全景竖向高画幅彩虹光谱接收屏总成 (微偏转迎向操作者视线 +Z，使七色光谱带一览无遗)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, 0.215, 0);
    this.screenPanelGroup.rotation.y = -0.22;

    const screenW = 0.165;
    const screenH = 0.235;
    const screenD = 0.016;

    // 航天银铝精雕主框体
    const frameGeo = createChamferedBlockGeometry(screenW + 0.022, screenH + 0.022, screenD, 0.0022);
    const frameMesh = new THREE.Mesh(frameGeo, satinSilverMat);
    frameMesh.name = 'ScreenBoardMesh';
    frameMesh.castShadow = true;
    frameMesh.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(frameMesh);

    // 深空钛灰防杂散光内框遮光檐 (Optical Hood Visor)
    const hoodTopGeo = createChamferedBlockGeometry(screenW + 0.018, 0.008, 0.018, 0.001);
    const hoodTop = new THREE.Mesh(hoodTopGeo, titaniumSlateMat);
    hoodTop.position.set(0, screenH * 0.5 + 0.005, screenD * 0.5 + 0.006);
    this.screenPanelGroup.add(hoodTop);

    const hoodBottom = new THREE.Mesh(hoodTopGeo, titaniumSlateMat);
    hoodBottom.position.set(0, -screenH * 0.5 - 0.005, screenD * 0.5 + 0.006);
    this.screenPanelGroup.add(hoodBottom);

    // 3. 右侧边缘竖向精密丝杠波长色散测微游标尺 (实时联动追踪红光上沿与紫光下沿)
    const caliperX = screenW * 0.5 + 0.016;
    const rulerHousingGeo = createChamferedBlockGeometry(0.018, screenH + 0.010, 0.014, 0.0012);
    const rulerHousing = new THREE.Mesh(rulerHousingGeo, titaniumSlateMat);
    rulerHousing.position.set(caliperX, 0, screenD * 0.5 + 0.004);
    rulerHousing.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(rulerHousing);

    // 竖向镜面液态铬测微丝杠
    const leadScrewGeo = new THREE.CylinderGeometry(0.0022, 0.0022, screenH + 0.024, 18);
    const leadScrew = new THREE.Mesh(leadScrewGeo, chromeMat);
    leadScrew.position.set(caliperX + 0.006, 0, screenD * 0.5 + 0.012);
    this.screenPanelGroup.add(leadScrew);

    // 顶部香槟金滚花测微手轮
    const hwGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 24);
    this.caliperHandwheelMesh = new THREE.Mesh(hwGeo, brassMat);
    this.caliperHandwheelMesh.position.set(caliperX + 0.003, screenH * 0.5 + 0.016, screenD * 0.5 + 0.008);
    this.screenPanelGroup.add(this.caliperHandwheelMesh);

    // 竖向毫米标尺贴面
    this.caliperScaleCanvas = safeCanvas(64, 1024);
    if (this.caliperScaleCanvas) {
      const ctx = this.caliperScaleCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 64, 1024);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.0;
        const centerPy = 512;
        const pxPerMm = 512 / 50;
        for (let mm = -45; mm <= 45; mm++) {
          const y = centerPy + mm * pxPerMm;
          const is10 = mm % 10 === 0;
          const is5 = mm % 5 === 0;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(is10 ? 38 : is5 ? 24 : 14, y);
          ctx.stroke();
        }
      }
      this.caliperScaleTexture = new THREE.CanvasTexture(this.caliperScaleCanvas);
      const scalePlaneGeo = new THREE.PlaneGeometry(0.009, screenH - 0.010);
      const scalePlaneMat = new THREE.MeshBasicMaterial({ map: this.caliperScaleTexture });
      const scalePlane = new THREE.Mesh(scalePlaneGeo, scalePlaneMat);
      scalePlane.position.set(caliperX - 0.002, 0, screenD * 0.5 + 0.0115);
      this.screenPanelGroup.add(scalePlane);
    }

    // 三枚联动游标指针 (红端上沿指针、中央参考针、紫端下沿指针)
    const pointerGeo = new THREE.ConeGeometry(0.0032, 0.014, 14);
    pointerGeo.rotateZ(Math.PI / 2);

    this.redEdgeCaliperMesh = new THREE.Mesh(pointerGeo, rubyPointerMat);
    this.redEdgeCaliperMesh.name = 'RedEdgeCaliperPointer';
    this.redEdgeCaliperMesh.position.set(caliperX - 0.008, 0.025, screenD * 0.5 + 0.012);
    this.screenPanelGroup.add(this.redEdgeCaliperMesh);

    this.centerRefCaliperMesh = new THREE.Mesh(pointerGeo, chromeMat);
    this.centerRefCaliperMesh.name = 'CenterRefCaliperPointer';
    this.centerRefCaliperMesh.position.set(caliperX - 0.008, 0.0, screenD * 0.5 + 0.012);
    this.screenPanelGroup.add(this.centerRefCaliperMesh);

    this.violetEdgeCaliperMesh = new THREE.Mesh(pointerGeo, violetPointerMat);
    this.violetEdgeCaliperMesh.name = 'VioletEdgeCaliperPointer';
    this.violetEdgeCaliperMesh.position.set(caliperX - 0.008, -0.035, screenD * 0.5 + 0.012);
    this.screenPanelGroup.add(this.violetEdgeCaliperMesh);

    // 4. 深邃海洋蓝黑核心光谱成像平面 (1024x1024 纯正光学彩虹图样，零文字零杂质)
    this.screenCanvas = safeCanvas(1024, 1024);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.anisotropy = 8;
    }

    const screenSurfaceGeo = new THREE.PlaneGeometry(screenW, screenH);
    const screenSurfaceMat = new THREE.MeshBasicMaterial({ map: this.screenTexture });
    this.screenMesh = new THREE.Mesh(screenSurfaceGeo, screenSurfaceMat);
    this.screenMesh.name = 'ScreenSurfaceMesh';
    this.screenMesh.position.set(0, 0, screenD * 0.5 + 0.001);
    this.screenMesh.userData = { interactiveId: 'screen_surface' };
    this.screenPanelGroup.add(this.screenMesh);

    this.screenCarrierGroup.add(this.screenPanelGroup);
    this.group.add(this.screenCarrierGroup);
  }

  // ==================== G. 3D 空间彩虹色散光路与体积光谱扇构建 ====================
  private buildOpticalBeamsSystem(): void {
    this.beamsGroup = new THREE.Group();
    this.beamsGroup.name = 'OpticalBeamsGroup';

    this.incidentCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.incidentHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.fresnelReflMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    // 1. 入射准直主光束与外层丁达尔光晕
    const unitCylCore = new THREE.CylinderGeometry(0.0020, 0.0020, 1.0, 16);
    unitCylCore.rotateZ(Math.PI / 2);
    this.incidentBeamMesh = new THREE.Mesh(unitCylCore, this.incidentCoreMat);
    this.incidentBeamMesh.name = 'IncidentBeamCoreMesh';
    this.incidentBeamMesh.renderOrder = 14;
    this.beamsGroup.add(this.incidentBeamMesh);

    const unitCylHalo = new THREE.CylinderGeometry(0.0048, 0.0048, 1.0, 16);
    unitCylHalo.rotateZ(Math.PI / 2);
    this.incidentHaloMesh = new THREE.Mesh(unitCylHalo, this.incidentHaloMat);
    this.incidentHaloMesh.name = 'IncidentBeamHaloMesh';
    this.incidentHaloMesh.renderOrder = 13;
    this.beamsGroup.add(this.incidentHaloMesh);

    // 1b. 棱镜内部折射核心光柱 (纤细半透明，体现复色光进入介质的物理路径，绝不遮挡晶体透光感)
    const unitIntCore = new THREE.CylinderGeometry(0.0010, 0.0010, 1.0, 16);
    unitIntCore.rotateZ(Math.PI / 2);
    this.internalWhiteBeamMesh = new THREE.Mesh(unitIntCore, this.incidentCoreMat);
    this.internalWhiteBeamMesh.name = 'InternalWhiteBeamMesh';
    this.internalWhiteBeamMesh.renderOrder = 14;
    this.beamsGroup.add(this.internalWhiteBeamMesh);

    const unitIntHalo = new THREE.CylinderGeometry(0.0025, 0.0025, 1.0, 16);
    unitIntHalo.rotateZ(Math.PI / 2);
    this.internalWhiteHaloMesh = new THREE.Mesh(unitIntHalo, this.incidentHaloMat);
    this.internalWhiteHaloMesh.name = 'InternalWhiteHaloMesh';
    this.internalWhiteHaloMesh.renderOrder = 13;
    this.internalWhiteHaloMesh.visible = false;
    this.beamsGroup.add(this.internalWhiteHaloMesh);

    // 第一界面入射高光点
    const spotGeo = new THREE.SphereGeometry(0.0035, 16, 16);
    this.entrySpotMesh = new THREE.Mesh(
      spotGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    this.entrySpotMesh.renderOrder = 16;
    this.beamsGroup.add(this.entrySpotMesh);

    // 2. 第一界面菲涅尔部分反射光束
    const reflCyl = new THREE.CylinderGeometry(0.0010, 0.0012, 1.0, 12);
    reflCyl.rotateZ(Math.PI / 2);
    this.fresnelReflectedMesh = new THREE.Mesh(reflCyl, this.fresnelReflMat);
    this.fresnelReflectedMesh.name = 'FresnelReflectedRayMesh';
    this.fresnelReflectedMesh.renderOrder = 13;
    this.beamsGroup.add(this.fresnelReflectedMesh);

    // 3. 三棱镜内部连续 32 波段顶点着色色散光带 (Internal Crystal Rainbow Fan - 采用真实色度 NormalBlending，通透晶莹)
    const numBands = 32;
    const internalGeo = new THREE.BufferGeometry();
    const internalPositions = new Float32Array((numBands - 1) * 6 * 3);
    const internalColors = new Float32Array((numBands - 1) * 6 * 3);
    internalGeo.setAttribute('position', new THREE.BufferAttribute(internalPositions, 3));
    internalGeo.setAttribute('color', new THREE.BufferAttribute(internalColors, 3));
    const internalMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.60,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.internalRainbowRibbonMesh = new THREE.Mesh(internalGeo, internalMat);
    this.internalRainbowRibbonMesh.name = 'InternalRainbowRibbonMesh';
    this.internalRainbowRibbonMesh.renderOrder = 15;
    this.beamsGroup.add(this.internalRainbowRibbonMesh);

    // 4. 棱镜出射至接收屏的 32 波段高饱和连续彩虹光带 (External Volumetric Spectrum Ribbon)
    // 关键修正：采用 NormalBlending 彻底避免 AdditiveBlending 在亮色实验室背景下过曝泛白成白纸的问题！
    const externalGeo = new THREE.BufferGeometry();
    const externalPositions = new Float32Array((numBands - 1) * 6 * 3);
    const externalColors = new Float32Array((numBands - 1) * 6 * 3);
    externalGeo.setAttribute('position', new THREE.BufferAttribute(externalPositions, 3));
    externalGeo.setAttribute('color', new THREE.BufferAttribute(externalColors, 3));
    const externalMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.externalRainbowRibbonMesh = new THREE.Mesh(externalGeo, externalMat);
    this.externalRainbowRibbonMesh.name = 'ExternalRainbowRibbonMesh';
    this.externalRainbowRibbonMesh.renderOrder = 15;
    this.beamsGroup.add(this.externalRainbowRibbonMesh);

    // 外层光晕占位（隐藏以杜绝重复叠层导致的不透明或发白缺陷）
    const glowGeo = new THREE.BufferGeometry();
    const glowPositions = new Float32Array((numBands - 1) * 12 * 3);
    const glowColors = new Float32Array((numBands - 1) * 12 * 3);
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    const glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.externalRainbowGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.externalRainbowGlowMesh.name = 'ExternalRainbowGlowMesh';
    this.externalRainbowGlowMesh.renderOrder = 14;
    this.externalRainbowGlowMesh.visible = false;
    this.beamsGroup.add(this.externalRainbowGlowMesh);

    // 5. 七束核心特征波长高亮光谱射线与屏面落点光斑组 (Red, Orange, Yellow, Green, Cyan, Blue, Violet)
    this.principalRaysGroup = new THREE.Group();
    this.principalRaysGroup.name = 'PrincipalSpectralRaysGroup';
    this.principalRaysGroup.renderOrder = 16;
    this.beamsGroup.add(this.principalRaysGroup);

    // 6. 第二界面全反射 (TIR) 内部反射光路组
    this.tirInternalRayGroup = new THREE.Group();
    this.tirInternalRayGroup.name = 'TIRInternalRayGroup';
    this.tirInternalRayGroup.renderOrder = 16;
    this.beamsGroup.add(this.tirInternalRayGroup);

    // 7. 牛顿双棱镜复合白光光路组
    this.recombinedBeamGroup = new THREE.Group();
    this.recombinedBeamGroup.name = 'RecombinedWhiteBeamGroup';
    this.recombinedBeamGroup.renderOrder = 16;
    this.beamsGroup.add(this.recombinedBeamGroup);

    // 8. 光学辅助几何标线组 (界面法线 N1/N2、原入射方向延长虚线、偏向角 δ 测量弧)
    this.auxiliariesGroup = new THREE.Group();
    this.auxiliariesGroup.name = 'OpticalAuxiliariesGroup';
    this.auxiliariesGroup.renderOrder = 18;
    this.beamsGroup.add(this.auxiliariesGroup);

    this.group.add(this.beamsGroup);
  }

  // ==================== 几何顶点计算与棱镜模型动态同步 ====================
  public getPrimaryPrismVerticesLocal(): {
    vLeft: THREE.Vector2;
    vRight: THREE.Vector2;
    vTop: THREE.Vector2;
    alphaRad: number;
  } {
    const alphaRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(this.apexAngleDeg, 35, 72));
    const S = this.prismSideLength;
    const H = S * Math.cos(alphaRad * 0.5);
    const W = S * Math.sin(alphaRad * 0.5);

    const vTop = new THREE.Vector2(0, 0.54 * H);
    const vLeft = new THREE.Vector2(-W, -0.46 * H);
    const vRight = new THREE.Vector2(W, -0.46 * H);
    return { vLeft, vRight, vTop, alphaRad };
  }

  /**
   * 获取第一界面入射点 P1 的局部基准坐标
   */
  public getIncidentPointP1(): THREE.Vector2 {
    const { vLeft, vTop } = this.getPrimaryPrismVerticesLocal();
    const ax1 = this.prismCenterX + vLeft.x;
    const ay1 = this.prismCenterY + vLeft.y;
    const bx1 = this.prismCenterX + vTop.x;
    const by1 = this.prismCenterY + vTop.y;
    return new THREE.Vector2(ax1 + 0.54 * (bx1 - ax1), ay1 + 0.54 * (by1 - ay1));
  }

  /**
   * 获取五档材质转盘局部中心坐标
   */
  public getTurretCenterLocal(): THREE.Vector2 {
    const { vLeft } = this.getPrimaryPrismVerticesLocal();
    const baseY = this.prismCenterY + vLeft.y - 0.008;
    return new THREE.Vector2(this.prismCenterX - 0.044, baseY - 0.022);
  }

  /**
   * 获取测微鼓轮局部中心坐标
   */
  public getMicrometerCenterLocal(): THREE.Vector2 {
    const { vLeft } = this.getPrimaryPrismVerticesLocal();
    const baseY = this.prismCenterY + vLeft.y - 0.008;
    return new THREE.Vector2(this.prismCenterX + 0.042, baseY - 0.022);
  }

  private updatePrismGeometryAndMount(): void {
    const { vLeft, vRight, vTop } = this.getPrimaryPrismVerticesLocal();

    if (this.prismCrystalMesh) {
      this.prismCrystalMesh.geometry.dispose();
      this.prismCrystalMesh.geometry = createBeveledPrismGeometry(
        vLeft,
        vRight,
        vTop,
        this.prismDepth,
        0.0018
      );
    }

    const spec = PRISM_MATERIALS[this.prismMaterial] || PRISM_MATERIALS.flint;
    if (this.prismGlassMaterial) {
      this.prismGlassMaterial.color.setHex(spec.tintHex);
      this.prismGlassMaterial.emissive.setHex(spec.emissiveHex);
    }
    if (this.recombGlassMaterial) {
      this.recombGlassMaterial.color.setHex(spec.tintHex);
      this.recombGlassMaterial.emissive.setHex(spec.emissiveHex);
    }

    if (this.prismBottomPlateMesh) {
      this.prismBottomPlateMesh.position.y = vLeft.y - 0.008;
    }
    if (this.prismTopCapMesh) {
      this.prismTopCapMesh.position.y = vTop.y + 0.005;
    }

    this.updatePrismValueLabel();
  }

  private updatePrismValueLabel(): void {
    if (!this.prismValueCanvas || !this.prismValueTexture) return;
    const ctx = this.prismValueCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.prismValueCanvas.width;
    const h = this.prismValueCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // 严格遵守纯净无背景框铁律：绝不调用 fillRect / strokeRect，仅以大号深色粗体字呈现核心参数
    const spec = PRISM_MATERIALS[this.prismMaterial] || PRISM_MATERIALS.flint;
    const shortName =
      this.prismMaterial === 'crown'
        ? 'K9冕牌玻璃'
        : this.prismMaterial === 'bariumFlint'
        ? 'BaF10钡火石'
        : this.prismMaterial === 'flint'
        ? 'ZF7重火石'
        : this.prismMaterial === 'quartz'
        ? '高纯石英'
        : '光学金刚石';
    const labelText = `${shortName} n = ${spec.nd.toFixed(3)} · θ₁ = ${this.incidentAngleDeg.toFixed(1)}°`;

    if (typeof ctx.save === 'function') ctx.save();
    ctx.font =
      'bold 78px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.80)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#0284c7'; // 高对比度深海天青蓝，清晰呈现物理参量
    ctx.fillText(labelText, w / 2, h / 2);
    if (typeof ctx.restore === 'function') ctx.restore();

    this.prismValueTexture.needsUpdate = true;
  }

  private updateSourceIndicators(): void {
    const isWhite = this.sourceMode === 'white';
    const isLines = this.sourceMode === 'spectral_lines';
    const isMono = this.sourceMode === 'monochromatic';

    const activeBeamColor = isMono
      ? OpticalPhysics.wavelengthToColor(this.wavelengthNm)
      : isLines
      ? new THREE.Color(0xe0f2fe)
      : new THREE.Color(0xfffbeb);

    if (this.incidentCoreMat) {
      this.incidentCoreMat.color.copy(activeBeamColor);
      this.incidentCoreMat.opacity = this.laserPower ? 0.96 : 0.0;
    }
    if (this.incidentHaloMat) {
      this.incidentHaloMat.color.copy(activeBeamColor);
      this.incidentHaloMat.opacity = this.laserPower ? 0.30 : 0.0;
    }
    if (this.laserLedMesh) {
      const ledMat = this.laserLedMesh.material as THREE.MeshBasicMaterial;
      ledMat.color.copy(activeBeamColor);
      ledMat.opacity = this.laserPower ? 0.98 : 0.15;
    }

    if (this.whiteLightBtnMesh) {
      const m = this.whiteLightBtnMesh.material as THREE.MeshStandardMaterial;
      m.color.setHex(isWhite ? 0xfffbeb : 0x94a3b8);
      m.emissive.setHex(isWhite ? 0xfef08a : 0x000000);
      m.emissiveIntensity = isWhite ? 0.80 : 0;
      this.whiteLightBtnMesh.position.z = isWhite ? 0.0035 : 0.006;
    }
    if (this.spectralLinesBtnMesh) {
      const m = this.spectralLinesBtnMesh.material as THREE.MeshStandardMaterial;
      m.color.setHex(isLines ? 0x38bdf8 : 0x94a3b8);
      m.emissive.setHex(isLines ? 0x0ea5e9 : 0x000000);
      m.emissiveIntensity = isLines ? 0.80 : 0;
      this.spectralLinesBtnMesh.position.z = isLines ? 0.0035 : 0.006;
    }

    for (const [wlStr, btn] of Object.entries(this.wlButtons)) {
      const wl = Number(wlStr);
      const isSelected = isMono && Math.abs(this.wavelengthNm - wl) < 15;
      const c = OpticalPhysics.wavelengthToColor(wl);
      const m = btn.material as THREE.MeshStandardMaterial;
      m.color.copy(isSelected ? c : new THREE.Color(0x94a3b8));
      m.emissive.copy(isSelected ? c : new THREE.Color(0x000000));
      m.emissiveIntensity = isSelected ? 0.75 : 0;
      btn.position.z = isSelected ? 0.0035 : 0.006;
    }
  }

  // ==================== 2. 精确二维/三维棱镜色散光线追踪与视觉网格更新 ====================
  public updateOpticalPaths(): OpticalDispersionTelemetry {
    const spectrum = OpticalPhysics.calculatePrismSpectrum(
      this.incidentAngleDeg,
      this.apexAngleDeg,
      this.prismMaterial
    );
    this.cachedSpectrum = spectrum;

    const { vLeft, vRight, vTop, alphaRad } = this.getPrimaryPrismVerticesLocal();
    const halfAlpha = alphaRad * 0.5;

    // 转换到实验台全局局部坐标 (加上 prismCenterX, prismCenterY)
    const ax1 = this.prismCenterX + vLeft.x;
    const ay1 = this.prismCenterY + vLeft.y;
    const bx1 = this.prismCenterX + vTop.x;
    const by1 = this.prismCenterY + vTop.y;
    const cx1 = this.prismCenterX + vRight.x;
    const cy1 = this.prismCenterY + vRight.y;

    // 第一界面入射点 P1 (左斜面中点偏上 54% 处)
    const p1X = ax1 + 0.54 * (bx1 - ax1);
    const p1Y = ay1 + 0.54 * (by1 - ay1);

    // 入射光线方向角 psi_inc = theta_1 - alpha / 2
    const theta1Rad = THREE.MathUtils.degToRad(this.incidentAngleDeg);
    const psiIncRad = theta1Rad - halfAlpha;
    const incDirX = Math.cos(psiIncRad);
    const incDirY = Math.sin(psiIncRad);

    // 同步左侧平行光管摆臂位置与俯仰角，使其喷嘴精确对准 P1
    if (this.collimatorArmGroup) {
      this.collimatorArmGroup.position.set(p1X, p1Y, 0);
      this.collimatorArmGroup.rotation.z = psiIncRad;
    }

    // 同步测微鼓轮旋转角度与微米轴向进给
    if (this.prismMicrometerKnob) {
      const normAngle = (this.incidentAngleDeg - 25.0) / (80.0 - 25.0);
      this.prismMicrometerKnob.rotation.z = normAngle * Math.PI * 8.0;
      this.prismMicrometerKnob.position.z = 0.016 + normAngle * 0.003;
    }

    // 同步牛顿第二复合棱镜摆臂姿态
    if (this.recombinationPivotArm) {
      this.recombinationPivotArm.rotation.z = this.currentRecombSwing * 1.38;
    }

    const screenX = this.getScreenCarrierX();

    // 若电源关闭或隐藏空气光束，则隐藏光路网格
    if (!this.laserPower || !this.showBeamsInAir) {
      this.beamsGroup.visible = false;
      return this.buildTelemetryFromSpectrum(spectrum, 0);
    }
    this.beamsGroup.visible = true;

    // 1. 更新入射准直光束 (从准直管喷嘴到 P1)
    const nozzleDist = 0.116;
    const startX = p1X - incDirX * nozzleDist;
    const startY = p1Y - incDirY * nozzleDist;
    this.positionCylinderBetween(
      this.incidentBeamMesh,
      new THREE.Vector3(startX, startY, 0),
      new THREE.Vector3(p1X, p1Y, 0)
    );
    this.positionCylinderBetween(
      this.incidentHaloMesh,
      new THREE.Vector3(startX, startY, 0),
      new THREE.Vector3(p1X, p1Y, 0)
    );
    this.entrySpotMesh.position.set(p1X, p1Y, 0);

    // 2. 更新第一界面菲涅尔反射光束 (法线 N1 方向角为 pi - alpha/2)
    const n1Angle = Math.PI - halfAlpha;
    const reflAngle = n1Angle - theta1Rad;
    const reflLen = 0.145;
    const reflEndX = p1X + Math.cos(reflAngle) * reflLen;
    const reflEndY = p1Y + Math.sin(reflAngle) * reflLen;
    this.positionCylinderBetween(
      this.fresnelReflectedMesh,
      new THREE.Vector3(p1X, p1Y, 0),
      new THREE.Vector3(reflEndX, reflEndY, 0)
    );
    this.fresnelReflMat.opacity = Math.min(0.65, 0.14 + spectrum.yellowRay.fresnelR1 * 2.2);

    // 3. 计算 32 个连续波长采样点 (395nm ~ 700nm) 在棱镜内部与外部的精确轨迹
    const numSamples = 32;
    const p2Points: THREE.Vector3[] = [];
    const endPoints: THREE.Vector3[] = [];
    const sampleColors: THREE.Color[] = [];

    const isRecombActive = this.enableRecombinationPrism && this.currentRecombSwing < 0.35;
    const recombEntryX = 0.042;

    const screenCenterY = 0.215;
    const screenH = 0.235;
    const pxToM = screenH / 1024;

    const distScale = 0.65 + (this.screenDistanceM - 0.30) * 1.25;
    const baseDevShiftPx = (spectrum.yellowRay.deviationAngleDeg - 48.0) * 6.5;
    const dispersionSpanPx = Math.max(45, spectrum.angularDispersionDeg * 56.0 * distScale);

    const redTopPy = 512 - dispersionSpanPx * 0.52 + baseDevShiftPx;
    const violetBottomPy = 512 + dispersionSpanPx * 0.52 + baseDevShiftPx;

    for (let i = 0; i < numSamples; i++) {
      const tNorm = i / (numSamples - 1);
      const wl = this.sourceMode === 'monochromatic'
        ? this.wavelengthNm
        : 700.0 - tNorm * (700.0 - 395.0);

      const trace = OpticalPhysics.tracePrismRay(
        wl,
        this.incidentAngleDeg,
        this.apexAngleDeg,
        this.prismMaterial
      );

      // 棱镜内部方向角 psi_int = theta_2 - alpha / 2
      const theta2Rad = THREE.MathUtils.degToRad(trace.refractionAngle1Deg);
      const psiIntRad = theta2Rad - halfAlpha;
      const intDirX = Math.cos(psiIntRad);
      const intDirY = Math.sin(psiIntRad);

      // 与右斜面 (bx1, by1) -> (cx1, cy1) 求交得到出射点 P2(lambda)
      const hitP2 = intersectRayWithSegment2D(p1X, p1Y, intDirX, intDirY, bx1, by1, cx1, cy1);
      const p2X = hitP2 ? hitP2.x : p1X + intDirX * 0.065;
      const p2Y = hitP2 ? hitP2.y : p1Y + intDirY * 0.065;
      p2Points.push(new THREE.Vector3(p2X, p2Y, 0));

      // 出射至接收屏或复合棱镜的精确目标落点 (与屏幕 Canvas 彩虹色谱带严丝合缝)
      if (!trace.isTotalInternalReflection) {
        const cauchyT = Math.pow(THREE.MathUtils.clamp(tNorm, 0, 1), 0.78);
        const samplePy = redTopPy + cauchyT * (violetBottomPy - redTopPy);
        const sampleTargetY = screenCenterY + (512 - samplePy) * pxToM;

        const targetX = isRecombActive ? recombEntryX : screenX - 0.0020;
        const targetZ = isRecombActive ? 0.001 : 0.0088;
        const endY = isRecombActive ? p2Y + (sampleTargetY - p2Y) * 0.35 : sampleTargetY;
        endPoints.push(new THREE.Vector3(targetX, endY, targetZ));
      } else {
        endPoints.push(new THREE.Vector3(p2X, p2Y, 0));
      }

      const c = OpticalDispersionApparatusMesh.getContinuousSpectralColor(wl);
      sampleColors.push(c);
    }

    // 棱镜内部折射核心光柱更新 (在白光模式下展现高亮白光核心，体现复色光重合叠加物理本质)
    const p2MidX = (p2Points[0].x + p2Points[numSamples - 1].x) * 0.5;
    const p2MidY = (p2Points[0].y + p2Points[numSamples - 1].y) * 0.5;
    if (this.sourceMode === 'white' && !spectrum.hasFullTIR) {
      this.internalWhiteBeamMesh.visible = true;
      this.internalWhiteHaloMesh.visible = false;
      this.positionCylinderBetween(
        this.internalWhiteBeamMesh,
        new THREE.Vector3(p1X, p1Y, 0),
        new THREE.Vector3(p2MidX, p2MidY, 0)
      );
    } else {
      this.internalWhiteBeamMesh.visible = false;
      this.internalWhiteHaloMesh.visible = false;
    }

    // 填充内部色散扇 BufferGeometry (P1 -> P2_i, P2_{i+1})
    const intPosAttr = this.internalRainbowRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const intColAttr = this.internalRainbowRibbonMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < numSamples - 1; i++) {
      const pA = p2Points[i];
      const pB = p2Points[i + 1];
      const cA = sampleColors[i];
      const cB = sampleColors[i + 1];
      const baseIdx = i * 6;

      // 两个三角形组成棱镜内扇元
      intPosAttr.setXYZ(baseIdx + 0, p1X, p1Y, 0);
      intPosAttr.setXYZ(baseIdx + 1, pA.x, pA.y, 0);
      intPosAttr.setXYZ(baseIdx + 2, pB.x, pB.y, 0);
      intPosAttr.setXYZ(baseIdx + 3, p1X, p1Y, 0);
      intPosAttr.setXYZ(baseIdx + 4, pB.x, pB.y, 0);
      intPosAttr.setXYZ(baseIdx + 5, pA.x, pA.y, 0);

      for (let v = 0; v < 6; v++) {
        const col = v % 3 === 0 ? new THREE.Color(0xffffff) : v % 3 === 1 ? cA : cB;
        intColAttr.setXYZ(baseIdx + v, col.r, col.g, col.b);
      }
    }
    intPosAttr.needsUpdate = true;
    intColAttr.needsUpdate = true;

    // 填充外部体积彩虹核心带与前后立体光晕壳 (3D Volumetric Sheaf)
    const extPosAttr = this.externalRainbowRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const extColAttr = this.externalRainbowRibbonMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const glowPosAttr = this.externalRainbowGlowMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const glowColAttr = this.externalRainbowGlowMesh.geometry.getAttribute('color') as THREE.BufferAttribute;

    for (let i = 0; i < numSamples - 1; i++) {
      const p2A = p2Points[i];
      const p2B = p2Points[i + 1];
      const eA = endPoints[i];
      const eB = endPoints[i + 1];
      const cA = sampleColors[i];
      const cB = sampleColors[i + 1];

      // 1. 中心高亮核心色散扇面 (起始自 P2，无缝延伸至屏幕表面)
      const baseIdx = i * 6;
      extPosAttr.setXYZ(baseIdx + 0, p2A.x, p2A.y, 0);
      extPosAttr.setXYZ(baseIdx + 1, eA.x, eA.y, eA.z);
      extPosAttr.setXYZ(baseIdx + 2, eB.x, eB.y, eB.z);

      extPosAttr.setXYZ(baseIdx + 3, p2A.x, p2A.y, 0);
      extPosAttr.setXYZ(baseIdx + 4, eB.x, eB.y, eB.z);
      extPosAttr.setXYZ(baseIdx + 5, p2B.x, p2B.y, 0);

      extColAttr.setXYZ(baseIdx + 0, cA.r, cA.g, cA.b);
      extColAttr.setXYZ(baseIdx + 1, cA.r, cA.g, cA.b);
      extColAttr.setXYZ(baseIdx + 2, cB.r, cB.g, cB.b);

      extColAttr.setXYZ(baseIdx + 3, cA.r, cA.g, cA.b);
      extColAttr.setXYZ(baseIdx + 4, cB.r, cB.g, cB.b);
      extColAttr.setXYZ(baseIdx + 5, cB.r, cB.g, cB.b);

      // 保持 glow 缓冲区格式完整，但设为零以杜绝光效白化过曝
      const glowBaseIdx = i * 12;
      for (let v = 0; v < 12; v++) {
        glowPosAttr.setXYZ(glowBaseIdx + v, p2A.x, p2A.y, 0);
        glowColAttr.setXYZ(glowBaseIdx + v, 0, 0, 0);
      }
    }
    extPosAttr.needsUpdate = true;
    extColAttr.needsUpdate = true;
    glowPosAttr.needsUpdate = true;
    glowColAttr.needsUpdate = true;

    // 单色激光模式或全反射时隐藏连续彩虹宽带，仅展示精细分立光线
    const showContinuousRibbon = this.sourceMode === 'white' && !spectrum.hasFullTIR;
    this.internalRainbowRibbonMesh.visible = showContinuousRibbon;
    this.externalRainbowRibbonMesh.visible = showContinuousRibbon;
    this.externalRainbowGlowMesh.visible = false;

    // 4. 更新七束核心特征波长高亮射线与第二界面全反射 (TIR) 内部反射光束
    this.clearGroupMeshes(this.principalRaysGroup);
    this.clearGroupMeshes(this.tirInternalRayGroup);
    this.clearGroupMeshes(this.recombinedBeamGroup);

    const activeBands =
      this.sourceMode === 'monochromatic'
        ? [
            {
              ...OpticalPhysics.tracePrismRay(
                this.wavelengthNm,
                this.incidentAngleDeg,
                this.apexAngleDeg,
                this.prismMaterial
              ),
              color: OpticalPhysics.wavelengthToColor(this.wavelengthNm),
              name: '单色光',
              nameEn: 'Monochromatic',
            },
          ]
        : spectrum.bands;

    let topRedY = screenCenterY;
    let bottomVioletY = screenCenterY;
    let hasRefractedTop = false;

    for (const band of activeBands) {
      const theta2Rad = THREE.MathUtils.degToRad(band.refractionAngle1Deg);
      const psiIntRad = theta2Rad - halfAlpha;
      const intDirX = Math.cos(psiIntRad);
      const intDirY = Math.sin(psiIntRad);

      const hitP2 = intersectRayWithSegment2D(p1X, p1Y, intDirX, intDirY, bx1, by1, cx1, cy1);
      const p2X = hitP2 ? hitP2.x : p1X + intDirX * 0.065;
      const p2Y = hitP2 ? hitP2.y : p1Y + intDirY * 0.065;

      // 棱镜内部核心光线：
      // 白光模式下：内部主体为高亮复合白光柱，隐藏 intRayMesh 杜绝红线贯穿棱镜的非物理现象；
      // 单色模式/谱线模式下展示对应波长的高亮光束
      const intRayMesh = this.createRayCylinder(
        new THREE.Vector3(p1X, p1Y, 0.001),
        new THREE.Vector3(p2X, p2Y, 0.001),
        band.color,
        this.sourceMode === 'monochromatic' ? 0.0020 : 0.0006,
        0.95,
        true
      );
      if (this.sourceMode === 'white') {
        intRayMesh.visible = false;
      }
      this.principalRaysGroup.add(intRayMesh);

      if (!band.isTotalInternalReflection) {
        const normWl = THREE.MathUtils.clamp((700.0 - band.wavelengthNm) / (700.0 - 390.0), 0, 1);
        const cauchyT = Math.pow(normWl, 0.78);
        const bandPy = redTopPy + cauchyT * (violetBottomPy - redTopPy);
        const bandTargetY = screenCenterY + (512 - bandPy) * pxToM;

        const targetX = isRecombActive ? recombEntryX : screenX - 0.0020;
        const targetZ = isRecombActive ? 0.001 : 0.0088;
        const endY = isRecombActive ? p2Y + (bandTargetY - p2Y) * 0.35 : bandTargetY;

        // 出射光线：清晰优雅的 7 色特征波长高亮光束，指引各色折射角轨迹
        const extRayRadius =
          this.sourceMode === 'white'
            ? 0.00085
            : this.sourceMode === 'monochromatic'
            ? 0.0022
            : 0.0012;
        const extRayOpacity = this.sourceMode === 'white' ? 0.85 : 0.95;
        const rayColor = OpticalDispersionApparatusMesh.getContinuousSpectralColor(band.wavelengthNm);

        const extRayMesh = this.createRayCylinder(
          new THREE.Vector3(p2X, p2Y, 0.001),
          new THREE.Vector3(targetX, endY, targetZ),
          rayColor,
          extRayRadius,
          extRayOpacity,
          false
        );
        this.principalRaysGroup.add(extRayMesh);

        if (!isRecombActive) {
          // 接收屏上的高亮彩色光谱聚焦点 (光学辉光微球，精准对齐屏面)
          const spot = new THREE.Mesh(
            new THREE.SphereGeometry(0.0028, 14, 14),
            new THREE.MeshBasicMaterial({
              color: rayColor,
              transparent: true,
              opacity: 0.92,
              depthWrite: false,
              blending: THREE.NormalBlending,
            })
          );
          spot.position.set(targetX, endY, targetZ);
          spot.visible = true;
          this.principalRaysGroup.add(spot);
        }

        if (!hasRefractedTop) {
          topRedY = endY;
          hasRefractedTop = true;
        }
        bottomVioletY = endY;
      } else {
        // 发生第二界面全反射 (TIR)：光线在右斜面内部全反射折向棱镜底边并向下射出
        const n2InwardAngle = halfAlpha + Math.PI;
        const theta3Rad = THREE.MathUtils.degToRad(band.internalIncidentAngle2Deg);
        const tirDirAngle = n2InwardAngle + theta3Rad;
        const tirDirX = Math.cos(tirDirAngle);
        const tirDirY = Math.sin(tirDirAngle);

        const hitBase = intersectRayWithSegment2D(p2X, p2Y, tirDirX, tirDirY, ax1, ay1, cx1, cy1);
        const baseX = hitBase ? hitBase.x : p2X + tirDirX * 0.055;
        const baseY = hitBase ? hitBase.y : ay1;

        const tirRay = this.createRayCylinder(
          new THREE.Vector3(p2X, p2Y, 0.002),
          new THREE.Vector3(baseX, baseY, 0.002),
          band.color,
          0.0015,
          0.95
        );
        this.tirInternalRayGroup.add(tirRay);

        // 全反射界面倏逝波高亮环
        const tirHalo = new THREE.Mesh(
          new THREE.RingGeometry(0.002, 0.0055, 20),
          new THREE.MeshBasicMaterial({
            color: band.color,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        tirHalo.position.set(p2X, p2Y, 0.003);
        this.tirInternalRayGroup.add(tirHalo);
      }
    }

    // 5. 若牛顿第二倒置复合三棱镜切入光路，渲染第二棱镜内收敛光束与复合平行白光束
    if (isRecombActive && hasRefractedTop) {
      const recombExitX = 0.088;
      const screenHitY = screenCenterY + 0.008; // 精确对准 Canvas 白光中心 (centerY - 35)
      const recombMidY = screenHitY;

      // 第二棱镜内部收敛光锥
      for (const band of activeBands) {
        if (band.isTotalInternalReflection) continue;
        const normWl = THREE.MathUtils.clamp((700.0 - band.wavelengthNm) / (700.0 - 390.0), 0, 1);
        const cauchyT = Math.pow(normWl, 0.78);
        const bandPy = redTopPy + cauchyT * (violetBottomPy - redTopPy);
        const bandTargetY = screenCenterY + (512 - bandPy) * pxToM;
        const theta2Rad = THREE.MathUtils.degToRad(band.refractionAngle1Deg);
        const psiIntRad = theta2Rad - halfAlpha;
        const hitP2 = intersectRayWithSegment2D(
          p1X,
          p1Y,
          Math.cos(psiIntRad),
          Math.sin(psiIntRad),
          bx1,
          by1,
          cx1,
          cy1
        );
        const p2Y = hitP2 ? hitP2.y : p1Y;
        const entryY = p2Y + (bandTargetY - p2Y) * 0.35;

        const convRay = this.createRayCylinder(
          new THREE.Vector3(recombEntryX, entryY, 0.001),
          new THREE.Vector3(recombExitX, recombMidY, 0.001),
          band.color,
          0.0010,
          0.90
        );
        this.recombinedBeamGroup.add(convRay);
      }

      // 复合还原后的高亮度平行白光束直达观测屏
      const whiteCore = this.createRayCylinder(
        new THREE.Vector3(recombExitX, recombMidY, 0.001),
        new THREE.Vector3(screenX, screenHitY, 0.001),
        new THREE.Color(0xfffbeb),
        0.0028,
        0.96
      );
      const whiteHalo = this.createRayCylinder(
        new THREE.Vector3(recombExitX, recombMidY, 0.001),
        new THREE.Vector3(screenX, screenHitY, 0.001),
        new THREE.Color(0xfef08a),
        0.0068,
        0.34
      );
      this.recombinedBeamGroup.add(whiteCore);
      this.recombinedBeamGroup.add(whiteHalo);

      topRedY = screenHitY + 0.004;
      bottomVioletY = screenHitY - 0.004;
    }

    // 6. 同步光谱屏右侧竖向红/紫游标卡尺指针位置与手轮旋转
    if (this.redEdgeCaliperMesh) {
      this.redEdgeCaliperMesh.position.y = THREE.MathUtils.clamp(topRedY - screenCenterY, -0.095, 0.095);
    }
    if (this.violetEdgeCaliperMesh) {
      this.violetEdgeCaliperMesh.position.y = THREE.MathUtils.clamp(bottomVioletY - screenCenterY, -0.095, 0.095);
    }
    if (this.caliperHandwheelMesh) {
      const spreadM = Math.abs(topRedY - bottomVioletY);
      this.caliperHandwheelMesh.rotation.y = spreadM * 85.0;
    }

    // 7. 更新光学辅助标线 (法线 N1/N2、入射延长虚线与偏向角 δ 测量圆弧)
    this.updateOpticalAuxiliariesGeometry(
      p1X,
      p1Y,
      psiIncRad,
      halfAlpha,
      spectrum
    );

    const spreadMm = Math.abs(topRedY - bottomVioletY) * 1000.0;
    return this.buildTelemetryFromSpectrum(spectrum, spreadMm);
  }

  private updateOpticalAuxiliariesGeometry(
    p1X: number,
    p1Y: number,
    psiIncRad: number,
    halfAlpha: number,
    spectrum: PrismSpectrumAnalysis
  ): void {
    this.clearGroupMeshes(this.auxiliariesGroup);
    if (!this.showOpticalAuxiliaries || !this.laserPower) {
      this.auxiliariesGroup.visible = false;
      return;
    }
    this.auxiliariesGroup.visible = true;

    // 1. 第一界面法线 N1-N1' (角度 pi - halfAlpha 与 -halfAlpha)
    const n1OutAngle = Math.PI - halfAlpha;
    const n1Len = 0.055;
    const n1Start = new THREE.Vector3(
      p1X - Math.cos(n1OutAngle) * n1Len * 0.65,
      p1Y - Math.sin(n1OutAngle) * n1Len * 0.65,
      0.003
    );
    const n1End = new THREE.Vector3(
      p1X + Math.cos(n1OutAngle) * n1Len,
      p1Y + Math.sin(n1OutAngle) * n1Len,
      0.003
    );
    this.auxiliariesGroup.add(
      this.createRayCylinder(n1Start, n1End, new THREE.Color(0x94a3b8), 0.00055, 0.55)
    );

    // 2. 原入射光方向延长参考线 (用于直观对比总偏向角 δ)
    const extLen = 0.145;
    const extEnd = new THREE.Vector3(
      p1X + Math.cos(psiIncRad) * extLen,
      p1Y + Math.sin(psiIncRad) * extLen,
      0.003
    );
    this.auxiliariesGroup.add(
      this.createRayCylinder(
        new THREE.Vector3(p1X, p1Y, 0.003),
        extEnd,
        new THREE.Color(0x38bdf8),
        0.0005,
        0.42
      )
    );

    // 3. 偏向角 δ 指示圆弧 (从原入射延长角 psiIncRad 向下偏转 delta_yellow)
    if (!spectrum.yellowRay.isTotalInternalReflection) {
      const deltaRad = THREE.MathUtils.degToRad(spectrum.yellowRay.deviationAngleDeg);
      const startAng = psiIncRad - deltaRad;
      const arcGeo = new THREE.RingGeometry(0.068, 0.0705, 28, 1, startAng, Math.max(0.05, deltaRad));
      const arcMat = new THREE.MeshBasicMaterial({
        color: spectrum.isNearMinimumDeviation ? 0xfbbf24 : 0x38bdf8,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const arcMesh = new THREE.Mesh(arcGeo, arcMat);
      arcMesh.position.set(p1X + 0.032, p1Y, 0.004);
      this.auxiliariesGroup.add(arcMesh);
    }
  }

  private buildTelemetryFromSpectrum(
    spectrum: PrismSpectrumAnalysis,
    spreadMm: number
  ): OpticalDispersionTelemetry {
    return {
      sourceMode: this.sourceMode,
      wavelengthNm: this.wavelengthNm,
      laserPower: this.laserPower,
      prismMaterial: this.prismMaterial,
      prismMaterialName: spectrum.material.name,
      incidentAngleDeg: this.incidentAngleDeg,
      apexAngleDeg: this.apexAngleDeg,
      screenDistanceM: this.screenDistanceM,
      enableRecombinationPrism: this.enableRecombinationPrism,
      nd: spectrum.material.nd,
      nRed: spectrum.redRay.refractiveIndex,
      nViolet: spectrum.violetRay.refractiveIndex,
      abbeNumber: spectrum.abbeNumber,
      redDeviationDeg: spectrum.redRay.deviationAngleDeg,
      yellowDeviationDeg: spectrum.yellowRay.deviationAngleDeg,
      violetDeviationDeg: spectrum.violetRay.deviationAngleDeg,
      angularDispersionDeg: spectrum.angularDispersionDeg,
      minimumDeviationDeg: spectrum.yellowRay.minimumDeviationAngleDeg,
      criticalAngleVioletDeg: spectrum.violetRay.criticalAngleDeg,
      spectrumSpreadMm: spreadMm,
      hasPartialTIR: spectrum.hasPartialTIR,
      hasFullTIR: spectrum.hasFullTIR,
      isNearMinimumDeviation: spectrum.isNearMinimumDeviation,
    };
  }

  // ==================== 3. 深邃海洋蓝黑接收屏纯物理彩虹光谱带渲染 ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.sourceMode}_${this.wavelengthNm}_${this.laserPower}_${this.prismMaterial}_${this.incidentAngleDeg.toFixed(2)}_${this.apexAngleDeg.toFixed(2)}_${this.screenDistanceM.toFixed(3)}_${this.enableRecombinationPrism}`;
    if (hash === this.lastScreenHash) return;
    this.lastScreenHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 深邃海洋蓝黑高对比底色 (#060b17)，纯净沉浸式高科技光学屏（严格遵守零文字零方框铁律）
    ctx.fillStyle = '#060b17';
    ctx.fillRect(0, 0, w, h);

    // 2. 激光蚀刻光学准线网格 (仅线段 stroke，严禁调用 fillText/strokeText)
    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // 垂直光学准线 (微弱深青色虚线)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(centerX, 48);
    ctx.lineTo(centerX, h - 48);
    ctx.stroke();
    ctx.setLineDash([]);

    // 水平零基准线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)';
    ctx.beginPath();
    ctx.moveTo(centerX - 160, centerY);
    ctx.lineTo(centerX + 160, centerY);
    ctx.stroke();

    // 右侧精密毫米刻度标尺线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 1.0;
    for (let y = 80; y <= 944; y += 16) {
      const isMajor = (y - 80) % 80 === 0;
      const isMid = (y - 80) % 32 === 0;
      const tickLen = isMajor ? 14 : isMid ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(centerX + 105, y);
      ctx.lineTo(centerX + 105 + tickLen, y);
      ctx.stroke();
    }

    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    const spectrum =
      this.cachedSpectrum ||
      OpticalPhysics.calculatePrismSpectrum(
        this.incidentAngleDeg,
        this.apexAngleDeg,
        this.prismMaterial
      );

    if (spectrum.hasFullTIR) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 狭缝投影半宽度（约 34mm，形成适度开阔、清晰大气的连续光谱投影带）
    const slitHalfW = 200;

    // 若牛顿第二倒置三棱镜切入光路：七色光谱重新聚合并还原为璀璨明亮的复合白光狭缝条纹！
    if (this.enableRecombinationPrism) {
      const bandCenterY = centerY - 35;
      const bandHalfH = 22;
      for (let py = Math.max(0, Math.floor(bandCenterY - bandHalfH * 2.5)); py < Math.min(h, Math.ceil(bandCenterY + bandHalfH * 2.5)); py++) {
        const dy = (py - bandCenterY) / bandHalfH;
        const env = Math.exp(-dy * dy * 2.0);
        if (env < 0.008) continue;

        // 边缘呈现极其细微的红/紫微米级色散边缘 (微观真实衍射色差)，中心为高亮白光核心
        const r = Math.min(255, Math.round(255 * Math.exp(-Math.pow(dy + 0.12, 2) * 1.8)));
        const g = Math.min(255, Math.round(252 * Math.exp(-dy * dy * 2.0)));
        const b = Math.min(255, Math.round(255 * Math.exp(-Math.pow(dy - 0.12, 2) * 1.8)));
        const alpha = Math.min(1.0, env * 1.05);

        const grad = ctx.createLinearGradient(centerX - slitHalfW, 0, centerX + slitHalfW, 0);
        grad.addColorStop(0.00, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.18).toFixed(3)})`);
        grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.72).toFixed(3)})`);
        grad.addColorStop(0.50, `rgba(255, 255, 255, ${(alpha * 0.98).toFixed(3)})`);
        grad.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.72).toFixed(3)})`);
        grad.addColorStop(0.82, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.18).toFixed(3)})`);
        grad.addColorStop(1.00, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(centerX - slitHalfW, py, slitHalfW * 2, 1);
      }
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 计算光谱在接收屏上的中心偏移与角色散跨度像素映射
    const distScale = 0.65 + (this.screenDistanceM - 0.30) * 1.25;
    const baseDevShiftPx = (spectrum.yellowRay.deviationAngleDeg - 48.0) * 6.5;
    const dispersionSpanPx = Math.max(45, spectrum.angularDispersionDeg * 56.0 * distScale);

    const redTopPy = centerY - dispersionSpanPx * 0.52 + baseDevShiftPx;
    const violetBottomPy = centerY + dispersionSpanPx * 0.52 + baseDevShiftPx;

    if (this.sourceMode === 'white') {
      // 复合白光色散：从上至下呈现“上红、橙、黄、绿、青、蓝、下紫”物理连续高质感彩虹光谱带
      const padPx = 36;
      const startPy = Math.max(0, Math.floor(redTopPy - padPx));
      const endPy = Math.min(h - 1, Math.ceil(violetBottomPy + padPx));

      for (let py = startPy; py <= endPy; py++) {
        const t = (py - redTopPy) / Math.max(1.0, violetBottomPy - redTopPy);
        // 柯西非线性色散映射：短波（紫端）偏折更大、色散展宽，长波（红端）偏折较小
        const cauchyT = Math.pow(THREE.MathUtils.clamp(t, 0, 1), 0.78);
        const wl = 700.0 - cauchyT * (700.0 - 395.0);

        const trace = OpticalPhysics.tracePrismRay(
          wl,
          this.incidentAngleDeg,
          this.apexAngleDeg,
          this.prismMaterial
        );
        if (trace.isTotalInternalReflection) continue;

        let edgeFade = 1.0;
        if (t < 0) {
          edgeFade = Math.exp(-Math.pow(t * 4.5, 2));
        } else if (t > 1) {
          edgeFade = Math.exp(-Math.pow((t - 1) * 4.5, 2));
        }
        if (edgeFade < 0.005) continue;

        // 使用连续光谱物理插值，保持纯正饱和度
        const c = OpticalDispersionApparatusMesh.getContinuousSpectralColor(wl);
        const rBase = Math.round(c.r * 255);
        const gBase = Math.round(c.g * 255);
        const bBase = Math.round(c.b * 255);

        // 核心区域保持 75% 纯正饱和光谱色，点缀 25% 柔和光学辉光，严禁惨白
        const rCore = Math.min(255, Math.round(rBase + (255 - rBase) * 0.25));
        const gCore = Math.min(255, Math.round(gBase + (255 - gBase) * 0.25));
        const bCore = Math.min(255, Math.round(bBase + (255 - bBase) * 0.25));

        const peakAlpha = Math.min(1.0, edgeFade * 0.98);

        const grad = ctx.createLinearGradient(centerX - slitHalfW, 0, centerX + slitHalfW, 0);
        grad.addColorStop(0.00, `rgba(${rBase}, ${gBase}, ${bBase}, 0)`);
        grad.addColorStop(0.12, `rgba(${rBase}, ${gBase}, ${bBase}, ${(peakAlpha * 0.25).toFixed(3)})`);
        grad.addColorStop(0.32, `rgba(${rBase}, ${gBase}, ${bBase}, ${(peakAlpha * 0.82).toFixed(3)})`);
        grad.addColorStop(0.50, `rgba(${rCore}, ${gCore}, ${bCore}, ${(peakAlpha * 0.98).toFixed(3)})`);
        grad.addColorStop(0.68, `rgba(${rBase}, ${gBase}, ${bBase}, ${(peakAlpha * 0.82).toFixed(3)})`);
        grad.addColorStop(0.88, `rgba(${rBase}, ${gBase}, ${bBase}, ${(peakAlpha * 0.25).toFixed(3)})`);
        grad.addColorStop(1.00, `rgba(${rBase}, ${gBase}, ${bBase}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(centerX - slitHalfW, py, slitHalfW * 2, 1);
      }
    } else if (this.sourceMode === 'spectral_lines') {
      // 汞氦原子光谱灯模式：在对应波长折射角位置呈现锐利明亮的分立特征原子谱线
      const atomicLines = [667.8, 615.0, 587.6, 546.1, 491.6, 435.8, 404.7];
      for (const wl of atomicLines) {
        const trace = OpticalPhysics.tracePrismRay(
          wl,
          this.incidentAngleDeg,
          this.apexAngleDeg,
          this.prismMaterial
        );
        if (trace.isTotalInternalReflection) continue;

        const normWl = (700.0 - wl) / (700.0 - 390.0);
        const linePy = redTopPy + Math.pow(normWl, 1 / 0.78) * (violetBottomPy - redTopPy);
        this.drawSpectralSlitLineOnCanvas(ctx, centerX, linePy, slitHalfW, wl, 8.0);
      }
    } else {
      // 单色激光模式：仅在所选波长对应偏向角处呈现单条锐利高亮激光谱线（证明单色光不再发生色散）
      const trace = OpticalPhysics.tracePrismRay(
        this.wavelengthNm,
        this.incidentAngleDeg,
        this.apexAngleDeg,
        this.prismMaterial
      );
      if (!trace.isTotalInternalReflection) {
        const normWl = THREE.MathUtils.clamp((700.0 - this.wavelengthNm) / (700.0 - 390.0), 0, 1);
        const linePy = redTopPy + Math.pow(normWl, 1 / 0.78) * (violetBottomPy - redTopPy);
        this.drawSpectralSlitLineOnCanvas(ctx, centerX, linePy, slitHalfW, this.wavelengthNm, 12.0);
      }
    }

    this.screenTexture.needsUpdate = true;
  }

  private drawSpectralSlitLineOnCanvas(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    linePy: number,
    slitHalfW: number,
    wavelengthNm: number,
    halfThicknessPx: number
  ): void {
    const c = OpticalDispersionApparatusMesh.getContinuousSpectralColor(wavelengthNm);
    const rBase = Math.round(c.r * 255);
    const gBase = Math.round(c.g * 255);
    const bBase = Math.round(c.b * 255);

    const startY = Math.max(0, Math.floor(linePy - halfThicknessPx * 2.2));
    const endY = Math.min(1023, Math.ceil(linePy + halfThicknessPx * 2.2));

    for (let py = startY; py <= endY; py++) {
      const dy = (py - linePy) / halfThicknessPx;
      const profile = Math.exp(-dy * dy * 2.2);
      if (profile < 0.01) continue;

      const coreMix = Math.max(0, (profile - 0.45) / 0.55);
      const r = Math.min(255, Math.round(rBase + (255 - rBase) * coreMix * 0.30));
      const g = Math.min(255, Math.round(gBase + (255 - gBase) * coreMix * 0.30));
      const b = Math.min(255, Math.round(bBase + (255 - bBase) * coreMix * 0.30));

      const grad = ctx.createLinearGradient(centerX - slitHalfW, 0, centerX + slitHalfW, 0);
      grad.addColorStop(0.00, `rgba(${r}, ${g}, ${b}, 0)`);
      grad.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, ${(profile * 0.30).toFixed(3)})`);
      grad.addColorStop(0.40, `rgba(${r}, ${g}, ${b}, ${(profile * 0.85).toFixed(3)})`);
      grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${(profile * 0.98).toFixed(3)})`);
      grad.addColorStop(0.60, `rgba(${r}, ${g}, ${b}, ${(profile * 0.85).toFixed(3)})`);
      grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${(profile * 0.30).toFixed(3)})`);
      grad.addColorStop(1.00, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(centerX - slitHalfW, py, slitHalfW * 2, 1);
    }
  }

  // ==================== 4. 逐帧平滑阻尼运动与状态控制接口 ====================
  public update(delta: number): void {
    const dt = delta || 0.016;

    // 1. 材质五档转换轮弹簧阻尼旋转
    if (this.materialTurretWheel) {
      const diff = this.targetTurretAngle - this.currentTurretAngle;
      if (Math.abs(diff) > 0.0005) {
        this.currentTurretAngle += diff * Math.min(1.0, dt * 14.0);
        this.materialTurretWheel.rotation.z = this.currentTurretAngle;
      } else {
        this.currentTurretAngle = this.targetTurretAngle;
        this.materialTurretWheel.rotation.z = this.targetTurretAngle;
      }
    }

    // 2. 牛顿第二复合三棱镜机械摆臂与旋钮平滑切入/抬起动画
    const swingDiff = this.targetRecombSwing - this.currentRecombSwing;
    if (Math.abs(swingDiff) > 0.001) {
      this.currentRecombSwing += swingDiff * Math.min(1.0, dt * 12.0);
      if (this.recombinationPivotArm) {
        this.recombinationPivotArm.rotation.z = this.currentRecombSwing * 1.38;
      }
      if (this.recombinationToggleKnob) {
        this.recombinationToggleKnob.rotation.z = (1.0 - this.currentRecombSwing) * (Math.PI * 0.5);
      }
      this.updateOpticalPaths();
    } else if (this.currentRecombSwing !== this.targetRecombSwing) {
      this.currentRecombSwing = this.targetRecombSwing;
      if (this.recombinationPivotArm) {
        this.recombinationPivotArm.rotation.z = this.currentRecombSwing * 1.38;
      }
      if (this.recombinationToggleKnob) {
        this.recombinationToggleKnob.rotation.z = (1.0 - this.currentRecombSwing) * (Math.PI * 0.5);
      }
      this.updateOpticalPaths();
    }

    // 3. 3D 悬浮引导光晕环微光自转
    if (this.micrometerHoverCue && this.micrometerHoverCue.visible) {
      this.micrometerHoverCue.rotation.z += dt * 1.8;
    }
    if (this.turretHoverCue && this.turretHoverCue.visible) {
      this.turretHoverCue.rotation.z += dt * 1.8;
    }
    if (this.recombinationHoverCue && this.recombinationHoverCue.visible) {
      this.recombinationHoverCue.rotation.z += dt * 1.8;
    }

    if (this.isScreenDirty) {
      this.updateOpticalPaths();
      this.updateScreenTexture();
      this.isScreenDirty = false;
    }
  }

  public setIncidentAngle(angleDeg: number): void {
    this.incidentAngleDeg = THREE.MathUtils.clamp(angleDeg, 25.0, 80.0);
    this.updatePrismValueLabel();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setApexAngle(apexDeg: number): void {
    this.apexAngleDeg = THREE.MathUtils.clamp(apexDeg, 40.0, 70.0);
    this.updatePrismGeometryAndMount();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setPrismMaterial(material: PrismMaterialType): void {
    this.prismMaterial = material;
    const idx = OpticalDispersionApparatusMesh.MATERIAL_PRESETS.indexOf(material);
    if (idx >= 0) {
      this.activeMaterialIndex = idx;
      const step = (Math.PI * 2) / 5;
      const targetBase = idx * step;
      const k = Math.round((this.currentTurretAngle - targetBase) / (Math.PI * 2));
      let candidate = targetBase + k * (Math.PI * 2);
      if (candidate < this.currentTurretAngle - 0.001) {
        candidate += Math.PI * 2;
      }
      this.targetTurretAngle = candidate;
    }
    this.updatePrismGeometryAndMount();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setPrismMaterialIndex(idx: number): PrismMaterialType {
    const presets = OpticalDispersionApparatusMesh.MATERIAL_PRESETS;
    const clampedIdx = THREE.MathUtils.clamp(idx, 0, presets.length - 1);
    this.setPrismMaterial(presets[clampedIdx]);
    return this.prismMaterial;
  }

  public cycleNextPrismMaterial(): PrismMaterialType {
    const presets = OpticalDispersionApparatusMesh.MATERIAL_PRESETS;
    const nextIdx = (this.activeMaterialIndex + 1) % presets.length;
    return this.setPrismMaterialIndex(nextIdx);
  }

  public setSourceMode(mode: DispersionSourceMode): void {
    this.sourceMode = mode;
    this.updateSourceIndicators();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setWavelength(wlNm: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wlNm, 380, 750);
    this.sourceMode = 'monochromatic';
    this.updateSourceIndicators();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setLaserPower(on: boolean): void {
    this.laserPower = on;
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.updateSourceIndicators();
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public setRecombinationPrismEnabled(enabled: boolean): void {
    this.enableRecombinationPrism = enabled;
    this.targetRecombSwing = enabled ? 0.0 : 1.0;
    this.currentRecombSwing = this.targetRecombSwing;
    if (this.recombinationPivotArm) {
      this.recombinationPivotArm.rotation.z = this.currentRecombSwing * 1.38;
    }
    if (this.recombinationToggleKnob) {
      this.recombinationToggleKnob.rotation.z = (1.0 - this.currentRecombSwing) * (Math.PI * 0.5);
    }
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public toggleRecombinationPrism(): boolean {
    this.setRecombinationPrismEnabled(!this.enableRecombinationPrism);
    return this.enableRecombinationPrism;
  }

  public syncScreenPositionFromDistance(): void {
    this.screenDistanceM = THREE.MathUtils.clamp(this.screenDistanceM, 0.30, 0.85);
    const norm = (this.screenDistanceM - 0.30) / (0.85 - 0.30);
    const targetX = this.minScreenX + norm * (this.maxScreenX - this.minScreenX);
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = targetX;
    }
  }

  public setScreenCarrierX(localX: number): void {
    const clampedX = THREE.MathUtils.clamp(localX, this.minScreenX, this.maxScreenX);
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = clampedX;
    }
    const norm = (clampedX - this.minScreenX) / (this.maxScreenX - this.minScreenX);
    this.screenDistanceM = 0.30 + norm * (0.85 - 0.30);
    this.updateOpticalPaths();
    this.updateScreenTexture();
  }

  public getScreenCarrierX(): number {
    return this.screenCarrierGroup ? this.screenCarrierGroup.position.x : this.maxScreenX;
  }

  public setKnobHovered(
    id: 'prism_micrometer' | 'prism_material_turret' | 'recombination_toggle' | null,
    hovered: boolean
  ): void {
    if (this.micrometerHoverCue) {
      this.micrometerHoverCue.visible =
        id === 'prism_micrometer' && hovered && !this.hasInteractedWithMicrometer;
    }
    if (this.turretHoverCue) {
      this.turretHoverCue.visible =
        id === 'prism_material_turret' && hovered && !this.hasInteractedWithTurret;
    }
    if (this.recombinationHoverCue) {
      this.recombinationHoverCue.visible =
        id === 'recombination_toggle' && hovered && !this.hasInteractedWithRecombination;
    }
  }

  public hideMicrometerHint(): void {
    this.hasInteractedWithMicrometer = true;
    if (this.micrometerHoverCue) this.micrometerHoverCue.visible = false;
  }

  public hideTurretHint(): void {
    this.hasInteractedWithTurret = true;
    if (this.turretHoverCue) this.turretHoverCue.visible = false;
  }

  public hideRecombinationHint(): void {
    this.hasInteractedWithRecombination = true;
    if (this.recombinationHoverCue) this.recombinationHoverCue.visible = false;
  }

  public getTelemetry(): OpticalDispersionTelemetry {
    return this.updateOpticalPaths();
  }

  // ==================== 几何辅助方法与显存释放 ====================
  private positionCylinderBetween(mesh: THREE.Mesh, pStart: THREE.Vector3, pEnd: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(pEnd, pStart);
    const len = dir.length();
    if (len < 1e-5) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(pStart).addScaledVector(dir, 0.5);
    mesh.scale.set(len, 1, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  }

  private createRayCylinder(
    pStart: THREE.Vector3,
    pEnd: THREE.Vector3,
    color: THREE.Color,
    radius: number,
    opacity: number,
    useAdditive = true
  ): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(pEnd, pStart);
    const len = Math.max(0.001, dir.length());
    const geo = new THREE.CylinderGeometry(radius, radius, len, 10);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: useAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pStart).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    return mesh;
  }

  private clearGroupMeshes(group: THREE.Group): void {
    if (!group) return;
    for (const child of group.children) {
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    }
    group.clear();
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    if (this.collimatorArmGroup) list.push(this.collimatorArmGroup);
    if (this.prismStageGroup) list.push(this.prismStageGroup);
    if (this.screenCarrierGroup) list.push(this.screenCarrierGroup);
    if (this.recombinationGroup) list.push(this.recombinationGroup);
    return list;
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
      if ((obj as THREE.Sprite).isSprite) {
        const sprite = obj as THREE.Sprite;
        sprite.material?.dispose();
      }
    });

    this.screenTexture?.dispose();
    this.railScaleTexture?.dispose();
    this.goniometerDialTexture?.dispose();
    this.caliperScaleTexture?.dispose();
    this.prismValueTexture?.dispose();
  }
}
