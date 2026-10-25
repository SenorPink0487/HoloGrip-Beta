import * as THREE from 'three';
import {
  anodizedAluminum,
  labGlass,
  labMetal,
  polishedGold,
} from '../em/labKit.ts';
import { disposeObjectTree } from '../em/disposeObject.ts';
import {
  BOYLE_INVARIANT_PV,
  CHARLES_INVARIANT_P_OVER_T,
  CHARLES_MAX_TEMP_K,
  CHARLES_MIN_TEMP_K,
  GAY_LUSSAC_INVARIANT_V_OVER_T,
  GAY_LUSSAC_MAX_TEMP_K,
  GAY_LUSSAC_MIN_TEMP_K,
  MAX_CYLINDER_VOLUME_ML,
  MIN_CYLINDER_VOLUME_ML,
  evaluateBoylePressureKPa,
  evaluateCharlesPressureKPa,
  evaluateGayLussacVolumeML,
  type GasLawMode,
  type GasLawsTelemetry,
} from '../../physics/thermo/gasLawsSolver.ts';

export type GasLawsInteractRole =
  | 'drag-piston-handle'
  | 'drag-temp-knob'
  | 'toggle-lock-pin'
  | 'mode-boyle'
  | 'mode-charles'
  | 'mode-gay-lussac';

/**
 * 创建带真实机械圆角与倒角的水平底座/腔体几何体
 * X 居中 [-width/2, +width/2]，Z 居中 [-depth/2, +depth/2]，底部 Y=0，顶部 Y=height
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.002
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.0006, Math.min(radius, width * 0.45, depth * 0.45));
  const w = width * 0.5 - rx;
  const d = depth * 0.5 - rx;

  shape.moveTo(-w, -d - rx);
  shape.lineTo(w, -d - rx);
  shape.quadraticCurveTo(w + rx, -d - rx, w + rx, -d);
  shape.lineTo(w + rx, d);
  shape.quadraticCurveTo(w + rx, d + rx, w, d + rx);
  shape.lineTo(-w, d + rx);
  shape.quadraticCurveTo(-w - rx, d + rx, -w - rx, d);
  shape.lineTo(-w, -d);
  shape.quadraticCurveTo(-w - rx, -d - rx, -w, -d - rx);

  const bSize = Math.min(rx * 0.5, bevel, height * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0008, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * 创建面向 +Z、中心位于 (0, 0, 0) 的精密倒角圆角矩形几何体
 */
function createFrontFacingRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.0016
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.0006, Math.min(radius, width * 0.45, height * 0.45));
  const w = width * 0.5 - rx;
  const h = height * 0.5 - rx;

  shape.moveTo(-w, -h - rx);
  shape.lineTo(w, -h - rx);
  shape.quadraticCurveTo(w + rx, -h - rx, w + rx, -h);
  shape.lineTo(w + rx, h);
  shape.quadraticCurveTo(w + rx, h + rx, w, h + rx);
  shape.lineTo(-w, h + rx);
  shape.quadraticCurveTo(-w - rx, h + rx, -w - rx, h);
  shape.lineTo(-w - rx, -h);
  shape.quadraticCurveTo(-w - rx, -h - rx, -w, -h - rx);

  const bSize = Math.min(rx * 0.45, bevel, depth * 0.35);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0008, depth - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

/**
 * 创建工业六角螺母几何体（中心在原点，轴向沿 Y）
 */
function createHexNutGeometry(flatRadius: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = Math.cos(angle) * flatRadius;
    const y = Math.sin(angle) * flatRadius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const bevel = Math.min(height * 0.2, flatRadius * 0.15);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0004, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * 创建带上下法兰倒角的回转套筒几何体（底部 Y=0，顶部 Y=height）
 */
function createFlangedCollarGeometry(
  innerR: number,
  outerR: number,
  flangeR: number,
  height: number
): THREE.BufferGeometry {
  const bevel = Math.min(0.0012, height * 0.12);
  const fH = Math.min(0.0035, height * 0.24);
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(innerR, 0),
    new THREE.Vector2(flangeR - bevel, 0),
    new THREE.Vector2(flangeR, bevel),
    new THREE.Vector2(flangeR, fH),
    new THREE.Vector2(outerR, fH + bevel * 0.8),
    new THREE.Vector2(outerR, height - fH - bevel * 0.8),
    new THREE.Vector2(flangeR, height - fH),
    new THREE.Vector2(flangeR, height - bevel),
    new THREE.Vector2(flangeR - bevel, height),
    new THREE.Vector2(innerR, height),
  ];
  return new THREE.LatheGeometry(pts, 36);
}

/**
 * 创建面向 +Z 的精密滚花黄铜温控旋钮总成（绕 Z 轴旋转）
 */
function createFrontKnurledDialGroup(
  radius: number,
  depth: number,
  brassMat: THREE.Material,
  chromeMat: THREE.Material,
  pointerMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();

  // 后部金属法兰座
  const basePts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(radius * 1.16, 0),
    new THREE.Vector2(radius * 1.16, depth * 0.28),
    new THREE.Vector2(radius * 0.98, depth * 0.36),
    new THREE.Vector2(radius, depth * 0.92),
    new THREE.Vector2(radius * 0.86, depth),
    new THREE.Vector2(0.001, depth),
  ];
  const bodyGeo = new THREE.LatheGeometry(basePts, 36);
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, brassMat);
  group.add(bodyMesh);

  // 周向 20 道防滑滚花脊条
  const ridgeGeo = createFrontFacingRoundedBox(
    radius * 0.11,
    radius * 0.14,
    depth * 0.56,
    0.0005,
    0.0004
  );
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const ridge = new THREE.Mesh(ridgeGeo, chromeMat);
    ridge.position.set(
      Math.cos(angle) * radius * 0.99,
      Math.sin(angle) * radius * 0.99,
      depth * 0.64
    );
    ridge.rotation.z = angle;
    group.add(ridge);
  }

  // 正面中心凹槽与径向指示刻线
  const pointerGeo = createFrontFacingRoundedBox(
    0.0022,
    radius * 0.68,
    0.0022,
    0.0006,
    0.0004
  );
  const pointer = new THREE.Mesh(pointerGeo, pointerMat);
  pointer.position.set(0, radius * 0.34, depth + 0.0008);
  group.add(pointer);

  return group;
}

interface MoleculeState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
}

/**
 * 气体实验三定律（玻意耳定律 / 查理定律 / 盖-吕萨克定律）高精度 3D 实验台网格总成
 *
 * 【核心构型与高级科研材质规范】：
 * 1. 左侧：立式精密恒温水浴夹套气缸实验装置（X = -0.175）
 *    - 航天级喷砂阳极氧化银铝防倾覆底座 + 前倾式温控操作台（带黄铜滚花调温旋钮与激光温标环）；
 *    - 外层高透恒温水浴夹套（内置螺旋紫铜换热盘管与冷暖渐变导热流体）；
 *    - 内层高硼硅玻璃精密气缸（正前方 +Z 激光蚀刻 10~60 mL 容积标尺）；
 *    - 气缸内部始终呈现 3D 理想气体分子热运动粒子（速率随 sqrt(T) 变化、冷暖色温渐变、空间密度随 1/V 变化）；
 *    - 双氟橡胶密封圈铝合金活塞 + 镜面液态铬活塞杆 + 顶部人体工学 T 形推拉手柄；
 *    - 上横梁配备黄铜机械定容锁止插销（查理定律等容模式下物理插入锁死活塞，其余模式退回）；
 *    - 右侧高压紫铜弯管连接正对操作者（+Z）的精密波登管机械指针压力表（0~220 kPa）。
 *
 * 2. 右侧：三维多定律自适应数据采集终端（X = +0.165）
 *    - 深邃海洋蓝黑显示面板（#08101e），1024×768 高清 CanvasTexture 实时渲染；
 *    - 随所选定律自动切换主坐标系：
 *      · 玻意耳定律（等温）：p-V 等温双曲线图 + pV=C₁ 不变量核验；
 *      · 查理定律（等容）：p-T 正比例直线图（含 0 K 绝对零度虚线外推）+ p/T=C₂ 不变量核验；
 *      · 盖-吕萨克定律（等压）：V-T 正比例直线图（含 0 K 绝对零度虚线外推）+ V/T=C₃ 不变量核验；
 *    - 屏幕下方设三枚带状态指示灯的 3D 实体模式切换键（玻意耳等温 / 查理等容 / 盖-吕萨克等压）。
 */
export class GasLawsBenchMesh {
  public readonly group = new THREE.Group();

  // 核心可动/可交互部件引用（供交互控制与测试断言验证）
  public pistonAssemblyGroup!: THREE.Group;
  public pistonHandleHitMesh!: THREE.Mesh;
  public lockPinMovingGroup!: THREE.Group;
  public lockPinHitMesh!: THREE.Mesh;
  public tempKnobGroup!: THREE.Group;
  public tempKnobHitMesh!: THREE.Mesh;
  public bourdonNeedleGroup!: THREE.Group;
  public moleculesInstancedMesh!: THREE.InstancedMesh;
  public dataLoggerScreenMesh!: THREE.Mesh;
  public btnModeBoyleGroup!: THREE.Group;
  public btnModeCharlesGroup!: THREE.Group;
  public btnModeGayLussacGroup!: THREE.Group;

  // 气缸几何物理映射参数
  public readonly cylinderCenterX = -0.175;
  public readonly cylinderInnerRadius = 0.031;
  public readonly gasChamberBottomY = 0.088;
  public readonly pistonMinHeightY = 0.132; // 对应 18 mL
  public readonly pistonMaxHeightY = 0.254; // 对应 60 mL

  // 材质与动态光效引用
  private bathFluidMat!: THREE.MeshPhysicalMaterial;
  private heatCoilMat!: THREE.MeshStandardMaterial;
  private lockStatusLedMat!: THREE.MeshStandardMaterial;
  private tempRingLedMat!: THREE.MeshStandardMaterial;
  private btnBoyleLedMat!: THREE.MeshStandardMaterial;
  private btnCharlesLedMat!: THREE.MeshStandardMaterial;
  private btnGayLussacLedMat!: THREE.MeshStandardMaterial;
  private btnBoyleCapMat!: THREE.MeshStandardMaterial;
  private btnCharlesCapMat!: THREE.MeshStandardMaterial;
  private btnGayLussacCapMat!: THREE.MeshStandardMaterial;

  // 理想气体分子粒子系统
  private readonly moleculeCount = 88;
  private readonly molecules: MoleculeState[] = [];
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly dummyPosition = new THREE.Vector3();
  private readonly dummyScale = new THREE.Vector3();
  private readonly dummyQuat = new THREE.Quaternion();
  private readonly moleculeColor = new THREE.Color();

  // 采集器大屏 Canvas
  private screenCanvas!: HTMLCanvasElement;
  private screenCtx!: CanvasRenderingContext2D | null;
  private screenTexture!: THREE.CanvasTexture;

  constructor() {
    this.group.name = 'thermo-gas-laws-bench';
    this.buildMaterials();
    this.buildLeftGasCylinderApparatus();
    this.buildRightDataTerminal();
    this.initGasMolecules();
  }

  private buildMaterials(): void {
    this.bathFluidMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.12,
      roughness: 0.08,
      metalness: 0.0,
      transmission: 0.84,
      transparent: true,
      opacity: 0.34,
      ior: 1.333,
      depthWrite: false,
    });

    this.heatCoilMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.88,
    });

    this.lockStatusLedMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.tempRingLedMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.btnBoyleLedMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.btnCharlesLedMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.2,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.btnGayLussacLedMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.2,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.btnBoyleCapMat = new THREE.MeshStandardMaterial({
      color: 0x0c2d48,
      emissive: 0x0284c7,
      emissiveIntensity: 0.32,
      roughness: 0.26,
      metalness: 0.38,
    });

    this.btnCharlesCapMat = new THREE.MeshStandardMaterial({
      color: 0x3b2710,
      emissive: 0xd97706,
      emissiveIntensity: 0.12,
      roughness: 0.26,
      metalness: 0.38,
    });

    this.btnGayLussacCapMat = new THREE.MeshStandardMaterial({
      color: 0x0d3328,
      emissive: 0x059669,
      emissiveIntensity: 0.12,
      roughness: 0.26,
      metalness: 0.38,
    });
  }

  /**
   * 为网格节点及其子孙标记 3D 交互角色
   */
  private tagInteractRole(obj: THREE.Object3D, role: GasLawsInteractRole): void {
    obj.userData.interactRole = role;
    obj.traverse((child) => {
      child.userData.interactRole = role;
    });
  }

  /**
   * 1. 构建左侧「立式透明恒温夹套气缸 + 活塞锁销 + 波登压力表 + 底座温控台」
   */
  private buildLeftGasCylinderApparatus(): void {
    const leftGroup = new THREE.Group();
    leftGroup.name = 'gas-laws-left-apparatus';
    leftGroup.position.set(this.cylinderCenterX, 0, 0);
    this.group.add(leftGroup);

    const satinSilverMat = anodizedAluminum(0xe2e8f0, 0.22);
    const lightSilverMat = anodizedAluminum(0xf1f5f9, 0.18);
    const slateSteelMat = anodizedAluminum(0x475569, 0.28);
    const sealBlueGreyMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.35,
      metalness: 0.25,
    });
    const chromeMat = labMetal(0xffffff, 0.97, 0.07);
    const brassMat = polishedGold(0xf59e0b);
    const copperPipeMat = polishedGold(0xd97706);

    // === 1.1 防倾覆精密倒角银铝底座与减振脚垫 ===
    const basePlinthGeo = createChamferedBoxGeometry(0.24, 0.026, 0.21, 0.016, 0.0028);
    const basePlinth = new THREE.Mesh(basePlinthGeo, satinSilverMat);
    basePlinth.position.set(0, 0.006, 0);
    leftGroup.add(basePlinth);

    const upperDeckGeo = createChamferedBoxGeometry(0.21, 0.016, 0.175, 0.012, 0.002);
    const upperDeck = new THREE.Mesh(upperDeckGeo, lightSilverMat);
    upperDeck.position.set(0, 0.032, -0.008);
    leftGroup.add(upperDeck);

    // 四角不锈钢调平减振脚垫
    const footPts: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.015, 0),
      new THREE.Vector2(0.014, 0.004),
      new THREE.Vector2(0.01, 0.007),
      new THREE.Vector2(0.001, 0.007),
    ];
    const footGeo = new THREE.LatheGeometry(footPts, 24);
    const footCoords: [number, number][] = [
      [-0.098, -0.082],
      [0.098, -0.082],
      [-0.098, 0.082],
      [0.098, 0.082],
    ];
    for (const [fx, fz] of footCoords) {
      const foot = new THREE.Mesh(footGeo, slateSteelMat);
      foot.position.set(fx, 0, fz);
      leftGroup.add(foot);
    }

    // === 1.2 正前方 (+Z) 倾斜温控操作台与黄铜滚花调温旋钮 ===
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(0, 0.044, 0.078);
    consoleGroup.rotation.x = -0.38; // 正对操作者视线向上仰角
    leftGroup.add(consoleGroup);

    const consoleHousingGeo = createFrontFacingRoundedBox(0.148, 0.052, 0.022, 0.008, 0.002);
    const consoleHousing = new THREE.Mesh(consoleHousingGeo, slateSteelMat);
    consoleGroup.add(consoleHousing);

    // 温控面板刻度盘贴图（180 K ~ 480 K）
    const dialPlateGeo = createFrontFacingRoundedBox(0.138, 0.044, 0.003, 0.006, 0.0008);
    const dialPlateMat = new THREE.MeshBasicMaterial({
      map: this.createTempConsoleDialTexture(),
    });
    const dialPlate = new THREE.Mesh(dialPlateGeo, dialPlateMat);
    dialPlate.position.set(0, 0, 0.0105);
    consoleGroup.add(dialPlate);

    // 温控发光状态环
    const ringGeo = new THREE.TorusGeometry(0.0165, 0.0014, 12, 36);
    const ringMesh = new THREE.Mesh(ringGeo, this.tempRingLedMat);
    ringMesh.position.set(0, -0.002, 0.0125);
    consoleGroup.add(ringMesh);

    // 黄铜滚花调温旋钮（可左右/上下拖拽旋转调节温度 T）
    this.tempKnobGroup = createFrontKnurledDialGroup(
      0.0135,
      0.014,
      brassMat,
      chromeMat,
      lightSilverMat
    );
    this.tempKnobGroup.name = 'gas-laws-temp-knob';
    this.tempKnobGroup.position.set(0, -0.002, 0.012);
    consoleGroup.add(this.tempKnobGroup);

    // 温控旋钮宽松透明拾取碰撞体，确保极佳拖拽手感
    const knobHitGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.032, 24);
    knobHitGeo.rotateX(Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.tempKnobHitMesh = new THREE.Mesh(knobHitGeo, hitMat);
    this.tempKnobHitMesh.name = 'gas-laws-temp-knob-hit';
    this.tempKnobHitMesh.position.set(0, -0.002, 0.02);
    consoleGroup.add(this.tempKnobHitMesh);
    this.tagInteractRole(this.tempKnobGroup, 'drag-temp-knob');
    this.tagInteractRole(this.tempKnobHitMesh, 'drag-temp-knob');

    // === 1.3 恒温水浴底座法兰与螺旋紫铜冷暖盘管 ===
    const bathBottomFlangeGeo = createFlangedCollarGeometry(0.004, 0.056, 0.064, 0.038);
    const bathBottomFlange = new THREE.Mesh(bathBottomFlangeGeo, satinSilverMat);
    bathBottomFlange.position.set(0, 0.048, -0.012);
    leftGroup.add(bathBottomFlange);

    // 恒温水浴透明外夹套（高硼硅光学玻璃）
    const outerBathRadius = 0.054;
    const outerBathHeight = 0.214;
    const outerBathPts: THREE.Vector2[] = [
      new THREE.Vector2(outerBathRadius - 0.0025, 0),
      new THREE.Vector2(outerBathRadius, 0),
      new THREE.Vector2(outerBathRadius, outerBathHeight),
      new THREE.Vector2(outerBathRadius - 0.0025, outerBathHeight),
    ];
    const outerBathGeo = new THREE.LatheGeometry(outerBathPts, 48);
    const outerBathGlassMat = labGlass(0.22);
    const outerBathMesh = new THREE.Mesh(outerBathGeo, outerBathGlassMat);
    outerBathMesh.position.set(0, 0.084, -0.012);
    leftGroup.add(outerBathMesh);

    // 恒温水浴内部导热流体层（随温度冷暖渐变）
    const fluidGeo = new THREE.CylinderGeometry(
      outerBathRadius - 0.0035,
      outerBathRadius - 0.0035,
      outerBathHeight - 0.014,
      40
    );
    const fluidMesh = new THREE.Mesh(fluidGeo, this.bathFluidMat);
    fluidMesh.position.set(0, 0.084 + (outerBathHeight - 0.014) * 0.5, -0.012);
    leftGroup.add(fluidMesh);

    // 水浴夹套底部螺旋换热盘管（3 圈紫铜螺旋环）
    for (let i = 0; i < 3; i++) {
      const coilGeo = new THREE.TorusGeometry(0.043, 0.0026, 12, 36);
      coilGeo.rotateX(Math.PI / 2);
      const coil = new THREE.Mesh(coilGeo, this.heatCoilMat);
      coil.position.set(0, 0.096 + i * 0.011, -0.012);
      leftGroup.add(coil);
    }

    // === 1.4 内层高硼硅玻璃精密气缸与正前方 (+Z) 激光刻度标尺 ===
    const innerCylOuterR = 0.0345;
    const innerCylHeight = 0.222;
    const innerCylPts: THREE.Vector2[] = [
      new THREE.Vector2(this.cylinderInnerRadius, 0),
      new THREE.Vector2(innerCylOuterR, 0),
      new THREE.Vector2(innerCylOuterR, innerCylHeight),
      new THREE.Vector2(this.cylinderInnerRadius, innerCylHeight),
    ];
    const innerCylGeo = new THREE.LatheGeometry(innerCylPts, 48);
    const innerCylGlassMat = labGlass(0.28);
    const innerCylMesh = new THREE.Mesh(innerCylGeo, innerCylGlassMat);
    innerCylMesh.position.set(0, 0.084, -0.012);
    leftGroup.add(innerCylMesh);

    // 正前方 (+Z) 激光蚀刻容积刻度标尺（10 mL ~ 60 mL，弧面贴合气缸外壁）
    const scaleGeo = new THREE.CylinderGeometry(
      innerCylOuterR + 0.0008,
      innerCylOuterR + 0.0008,
      0.165,
      32,
      1,
      true,
      -Math.PI * 0.22,
      Math.PI * 0.44
    );
    const scaleMat = new THREE.MeshBasicMaterial({
      map: this.createCylinderScaleTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scaleMesh = new THREE.Mesh(scaleGeo, scaleMat);
    scaleMesh.position.set(0, 0.192, -0.012);
    leftGroup.add(scaleMesh);

    // 气缸顶部密封法兰环
    const topCapFlangeGeo = createFlangedCollarGeometry(0.012, 0.056, 0.064, 0.016);
    const topCapFlange = new THREE.Mesh(topCapFlangeGeo, satinSilverMat);
    topCapFlange.position.set(0, 0.298, -0.012);
    leftGroup.add(topCapFlange);

    // === 1.5 双液态铬立柱、顶部导向横梁与黄铜机械定容锁止插销 ===
    const pillarOffsets = [-0.068, 0.068];
    const pillarGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.34, 24);
    const nutGeo = createHexNutGeometry(0.0095, 0.006);
    for (const px of pillarOffsets) {
      const pillar = new THREE.Mesh(pillarGeo, chromeMat);
      pillar.position.set(px, 0.215, -0.012);
      leftGroup.add(pillar);

      const bottomNut = new THREE.Mesh(nutGeo, brassMat);
      bottomNut.position.set(px, 0.051, -0.012);
      leftGroup.add(bottomNut);

      const topNut = new THREE.Mesh(nutGeo, brassMat);
      topNut.position.set(px, 0.386, -0.012);
      leftGroup.add(topNut);
    }

    // 顶部导向锁止横梁（高度 Y = 0.342）
    const topBridgeGeo = createChamferedBoxGeometry(0.168, 0.022, 0.038, 0.008, 0.002);
    const topBridge = new THREE.Mesh(topBridgeGeo, lightSilverMat);
    topBridge.position.set(0, 0.342, -0.012);
    leftGroup.add(topBridge);

    // 中央活塞杆精密黄铜导向轴套
    const guideBushingGeo = createFlangedCollarGeometry(0.0075, 0.016, 0.02, 0.028);
    const guideBushing = new THREE.Mesh(guideBushingGeo, brassMat);
    guideBushing.position.set(0, 0.339, -0.012);
    leftGroup.add(guideBushing);

    // 定容锁止状态 LED 指示灯环（位于横梁正面 +Z）
    const lockLedGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 20);
    lockLedGeo.rotateX(Math.PI / 2);
    const lockLed = new THREE.Mesh(lockLedGeo, this.lockStatusLedMat);
    lockLed.position.set(-0.032, 0.353, 0.008);
    leftGroup.add(lockLed);

    // 黄铜机械定容锁止插销总成（可点击切换锁死/解锁，查理定律下向右滑入卡死活塞杆）
    this.lockPinMovingGroup = new THREE.Group();
    this.lockPinMovingGroup.name = 'gas-laws-lock-pin';
    this.lockPinMovingGroup.position.set(-0.044, 0.353, -0.012);
    leftGroup.add(this.lockPinMovingGroup);

    // 插销轴杆（沿 X 轴水平伸向中央活塞杆）
    const pinShaftGeo = new THREE.CylinderGeometry(0.0046, 0.0046, 0.046, 20);
    pinShaftGeo.rotateZ(Math.PI / 2);
    const pinShaft = new THREE.Mesh(pinShaftGeo, brassMat);
    pinShaft.position.set(0.012, 0, 0);
    this.lockPinMovingGroup.add(pinShaft);

    // 插销前端半圆卡箍叉口
    const caliperJawGeo = createChamferedBoxGeometry(0.014, 0.011, 0.018, 0.003, 0.001);
    const caliperJaw = new THREE.Mesh(caliperJawGeo, brassMat);
    caliperJaw.position.set(0.034, -0.0055, 0);
    this.lockPinMovingGroup.add(caliperJaw);

    // 插销左端滚花拉手头
    const pinKnobPts: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.011, 0),
      new THREE.Vector2(0.012, 0.003),
      new THREE.Vector2(0.012, 0.012),
      new THREE.Vector2(0.009, 0.015),
      new THREE.Vector2(0.001, 0.015),
    ];
    const pinKnobGeo = new THREE.LatheGeometry(pinKnobPts, 24);
    pinKnobGeo.rotateZ(Math.PI / 2);
    const pinKnob = new THREE.Mesh(pinKnobGeo, brassMat);
    pinKnob.position.set(-0.008, 0, 0);
    this.lockPinMovingGroup.add(pinKnob);

    // 插销点击碰撞盒
    const lockPinHitGeo = new THREE.BoxGeometry(0.072, 0.034, 0.04);
    this.lockPinHitMesh = new THREE.Mesh(lockPinHitGeo, hitMat);
    this.lockPinHitMesh.name = 'gas-laws-lock-pin-hit';
    this.lockPinHitMesh.position.set(0.01, 0, 0);
    this.lockPinMovingGroup.add(this.lockPinHitMesh);
    this.tagInteractRole(this.lockPinMovingGroup, 'toggle-lock-pin');

    // === 1.6 双密封圈活塞、液态铬活塞杆与顶部人体工学 T 形推拉手柄 ===
    this.pistonAssemblyGroup = new THREE.Group();
    this.pistonAssemblyGroup.name = 'gas-laws-piston-assembly';
    this.pistonAssemblyGroup.position.set(0, this.pistonMinHeightY, -0.012);
    leftGroup.add(this.pistonAssemblyGroup);

    // 铝合金精密活塞头（底面位于局部 Y = 0，直接对应气体腔顶面高度）
    const pistonHeadPts: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(this.cylinderInnerRadius - 0.001, 0),
      new THREE.Vector2(this.cylinderInnerRadius - 0.0005, 0.002),
      new THREE.Vector2(this.cylinderInnerRadius - 0.0005, 0.018),
      new THREE.Vector2(this.cylinderInnerRadius - 0.0015, 0.02),
      new THREE.Vector2(0.001, 0.02),
    ];
    const pistonHeadGeo = new THREE.LatheGeometry(pistonHeadPts, 36);
    const pistonHead = new THREE.Mesh(pistonHeadGeo, lightSilverMat);
    this.pistonAssemblyGroup.add(pistonHead);

    // 双道深海蓝灰氟橡胶 O 型密封圈（杜绝脏黑塑料，清晰标示活塞读数位置）
    const oRingGeo = new THREE.TorusGeometry(this.cylinderInnerRadius - 0.0004, 0.0018, 12, 36);
    oRingGeo.rotateX(Math.PI / 2);
    const lowerORing = new THREE.Mesh(oRingGeo, sealBlueGreyMat);
    lowerORing.position.y = 0.005;
    this.pistonAssemblyGroup.add(lowerORing);

    const upperORing = new THREE.Mesh(oRingGeo, sealBlueGreyMat);
    upperORing.position.y = 0.015;
    this.pistonAssemblyGroup.add(upperORing);

    // 镜面液态铬活塞主轴杆
    const rodLength = 0.255;
    const pistonRodGeo = new THREE.CylinderGeometry(0.0068, 0.0068, rodLength, 24);
    const pistonRod = new THREE.Mesh(pistonRodGeo, chromeMat);
    pistonRod.position.y = 0.02 + rodLength * 0.5;
    this.pistonAssemblyGroup.add(pistonRod);

    // 活塞杆上的黄铜定容锁槽环
    const notchCollarGeo = createFlangedCollarGeometry(0.0066, 0.0092, 0.0108, 0.012);
    const notchCollar = new THREE.Mesh(notchCollarGeo, brassMat);
    notchCollar.position.y = 0.165;
    this.pistonAssemblyGroup.add(notchCollar);

    // 顶部人体工学 T 形推拉手柄
    const handleY = 0.02 + rodLength;
    const handleHubGeo = createFlangedCollarGeometry(0.005, 0.013, 0.016, 0.018);
    const handleHub = new THREE.Mesh(handleHubGeo, brassMat);
    handleHub.position.y = handleY - 0.004;
    this.pistonAssemblyGroup.add(handleHub);

    const crossbarGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.116, 24);
    crossbarGeo.rotateZ(Math.PI / 2);
    const crossbar = new THREE.Mesh(crossbarGeo, satinSilverMat);
    crossbar.position.y = handleY + 0.006;
    this.pistonAssemblyGroup.add(crossbar);

    // T 形手柄两端黄铜防滑球头握把
    const gripSphereGeo = new THREE.SphereGeometry(0.0115, 24, 24);
    for (const gx of [-0.058, 0.058]) {
      const grip = new THREE.Mesh(gripSphereGeo, brassMat);
      grip.position.set(gx, handleY + 0.006, 0);
      this.pistonAssemblyGroup.add(grip);
    }

    // 活塞手柄与主杆宽裕透明拖拽碰撞盒
    const pistonHitGeo = new THREE.BoxGeometry(0.145, 0.29, 0.065);
    this.pistonHandleHitMesh = new THREE.Mesh(pistonHitGeo, hitMat);
    this.pistonHandleHitMesh.name = 'gas-laws-piston-hit';
    this.pistonHandleHitMesh.position.set(0, 0.16, 0);
    this.pistonAssemblyGroup.add(this.pistonHandleHitMesh);
    this.tagInteractRole(this.pistonAssemblyGroup, 'drag-piston-handle');

    // === 1.7 正对操作者 (+Z) 的精密波登管机械指针压力表 (0 ~ 220 kPa) ===
    const gaugeGroup = new THREE.Group();
    gaugeGroup.name = 'gas-laws-bourdon-gauge';
    gaugeGroup.position.set(0.098, 0.215, 0.016);
    leftGroup.add(gaugeGroup);

    // 连接气缸底座至压力表的高压紫铜导气管
    const manifoldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.048, 0.068, -0.012),
      new THREE.Vector3(0.098, 0.068, 0.016),
      new THREE.Vector3(0.098, 0.168, 0.016),
    ]);
    const manifoldGeo = new THREE.TubeGeometry(manifoldCurve, 20, 0.0038, 12, false);
    const manifoldMesh = new THREE.Mesh(manifoldGeo, copperPipeMat);
    leftGroup.add(manifoldMesh);

    // 压力表底部六角黄铜接头
    const gaugeStemNut = new THREE.Mesh(createHexNutGeometry(0.0085, 0.012), brassMat);
    gaugeStemNut.position.set(0, -0.042, 0);
    gaugeGroup.add(gaugeStemNut);

    // 压力表金属圆表壳（面向 +Z）
    const bezelPts: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.038, 0),
      new THREE.Vector2(0.04, 0.003),
      new THREE.Vector2(0.04, 0.016),
      new THREE.Vector2(0.036, 0.019),
      new THREE.Vector2(0.034, 0.019),
      new THREE.Vector2(0.034, 0.015),
      new THREE.Vector2(0.001, 0.015),
    ];
    const gaugeBezelGeo = new THREE.LatheGeometry(bezelPts, 40);
    gaugeBezelGeo.rotateX(Math.PI / 2);
    const gaugeBezel = new THREE.Mesh(gaugeBezelGeo, brassMat);
    gaugeBezel.position.z = -0.008;
    gaugeGroup.add(gaugeBezel);

    // 压力表刻度盘面 (0 ~ 220 kPa)
    const gaugeFaceGeo = new THREE.CircleGeometry(0.0345, 40);
    const gaugeFaceMat = new THREE.MeshBasicMaterial({
      map: this.createBourdonGaugeTexture(),
    });
    const gaugeFace = new THREE.Mesh(gaugeFaceGeo, gaugeFaceMat);
    gaugeFace.position.z = 0.0076;
    gaugeGroup.add(gaugeFace);

    // 3D 机械旋转指针总成
    this.bourdonNeedleGroup = new THREE.Group();
    this.bourdonNeedleGroup.name = 'gas-laws-bourdon-needle';
    this.bourdonNeedleGroup.position.set(0, 0, 0.009);
    gaugeGroup.add(this.bourdonNeedleGroup);

    const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const needleGeo = createFrontFacingRoundedBox(0.0024, 0.027, 0.0012, 0.0006, 0.0003);
    const needleMesh = new THREE.Mesh(needleGeo, needleMat);
    needleMesh.position.y = 0.009;
    this.bourdonNeedleGroup.add(needleMesh);

    const needleCapGeo = new THREE.CylinderGeometry(0.0038, 0.0038, 0.0025, 16);
    needleCapGeo.rotateX(Math.PI / 2);
    const needleCap = new THREE.Mesh(needleCapGeo, brassMat);
    this.bourdonNeedleGroup.add(needleCap);

    // 压力表防尘光学表蒙玻璃
    const gaugeCoverGeo = new THREE.CircleGeometry(0.035, 36);
    const gaugeCover = new THREE.Mesh(gaugeCoverGeo, innerCylGlassMat);
    gaugeCover.position.z = 0.0112;
    gaugeGroup.add(gaugeCover);

    // === 1.8 气缸内部 3D 理想气体分子热运动粒子群 ===
    const molSphereGeo = new THREE.SphereGeometry(0.0025, 12, 12);
    const molMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.15,
    });
    this.moleculesInstancedMesh = new THREE.InstancedMesh(
      molSphereGeo,
      molMat,
      this.moleculeCount
    );
    this.moleculesInstancedMesh.name = 'gas-laws-molecules-instanced';
    this.moleculesInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leftGroup.add(this.moleculesInstancedMesh);
  }

  /**
   * 2. 构建右侧「三维气体实验三定律数据采集终端」（面向 +Z）
   */
  private buildRightDataTerminal(): void {
    const rightGroup = new THREE.Group();
    rightGroup.name = 'gas-laws-right-data-terminal';
    rightGroup.position.set(0.165, 0, 0.01);
    this.group.add(rightGroup);

    const satinSilverMat = anodizedAluminum(0xe2e8f0, 0.22);
    const slateFrameMat = anodizedAluminum(0x334155, 0.28);
    const chromeMat = labMetal(0xffffff, 0.96, 0.08);
    const brassMat = polishedGold(0xf59e0b);

    // 稳固倒角底座与双倾斜支撑立柱
    const standBaseGeo = createChamferedBoxGeometry(0.24, 0.02, 0.155, 0.014, 0.0024);
    const standBase = new THREE.Mesh(standBaseGeo, satinSilverMat);
    standBase.position.set(0, 0.005, 0);
    rightGroup.add(standBase);

    for (const sx of [-0.068, 0.068]) {
      const neckGeo = createChamferedBoxGeometry(0.018, 0.056, 0.028, 0.004, 0.0014);
      const neck = new THREE.Mesh(neckGeo, chromeMat);
      neck.position.set(sx, 0.022, -0.01);
      neck.rotation.x = -0.12;
      rightGroup.add(neck);
    }

    // 终端主机面板总成（向后微倾 8°，端正正对操作者 +Z 视线）
    const panelGroup = new THREE.Group();
    panelGroup.position.set(0, 0.212, 0.004);
    panelGroup.rotation.x = -0.135;
    rightGroup.add(panelGroup);

    // 外层航天喷砂银铝机身壳体
    const chassisGeo = createFrontFacingRoundedBox(0.328, 0.278, 0.026, 0.014, 0.0028);
    const chassis = new THREE.Mesh(chassisGeo, satinSilverMat);
    panelGroup.add(chassis);

    // 内层深灰金属倒角镶边
    const innerBezelGeo = createFrontFacingRoundedBox(0.312, 0.262, 0.008, 0.011, 0.0016);
    const innerBezel = new THREE.Mesh(innerBezelGeo, slateFrameMat);
    innerBezel.position.z = 0.011;
    panelGroup.add(innerBezel);

    // 顶部双通道传感器航空插头（连接左侧压力传感器与热电偶）
    for (const cx of [-0.085, -0.035]) {
      const plugGeo = createFlangedCollarGeometry(0.003, 0.007, 0.0095, 0.018);
      const plug = new THREE.Mesh(plugGeo, brassMat);
      plug.position.set(cx, 0.139, 0);
      panelGroup.add(plug);
    }

    // 高分辨率 1024×768 深海蓝宝石数据采集屏幕
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 768;
    this.screenCtx = this.screenCanvas.getContext('2d');
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 4;

    const screenGeo = new THREE.PlaneGeometry(0.292, 0.204);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
    });
    this.dataLoggerScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.dataLoggerScreenMesh.name = 'gas-laws-terminal-screen';
    this.dataLoggerScreenMesh.position.set(0, 0.018, 0.0156);
    panelGroup.add(this.dataLoggerScreenMesh);

    // 屏幕下方三枚 3D 实体定律模式切换键（正对 +Z）
    this.btnModeBoyleGroup = this.createModeSwitchButton(
      '玻意耳 · 等温',
      '#38bdf8',
      this.btnBoyleCapMat,
      this.btnBoyleLedMat,
      'mode-boyle'
    );
    this.btnModeBoyleGroup.position.set(-0.096, -0.106, 0.0155);
    panelGroup.add(this.btnModeBoyleGroup);

    this.btnModeCharlesGroup = this.createModeSwitchButton(
      '查理 · 等容',
      '#fbbf24',
      this.btnCharlesCapMat,
      this.btnCharlesLedMat,
      'mode-charles'
    );
    this.btnModeCharlesGroup.position.set(0, -0.106, 0.0155);
    panelGroup.add(this.btnModeCharlesGroup);

    this.btnModeGayLussacGroup = this.createModeSwitchButton(
      '盖-吕萨克 · 等压',
      '#34d399',
      this.btnGayLussacCapMat,
      this.btnGayLussacLedMat,
      'mode-gay-lussac'
    );
    this.btnModeGayLussacGroup.position.set(0.096, -0.106, 0.0155);
    panelGroup.add(this.btnModeGayLussacGroup);
  }

  /**
   * 创建带 LED 状态灯条与高清微刻标签的 3D 实体定律模式按键
   */
  private createModeSwitchButton(
    label: string,
    accentHex: string,
    capMat: THREE.MeshStandardMaterial,
    ledMat: THREE.MeshStandardMaterial,
    role: GasLawsInteractRole
  ): THREE.Group {
    const btnGroup = new THREE.Group();
    btnGroup.name = `gas-laws-btn-${role}`;

    const capGeo = createFrontFacingRoundedBox(0.088, 0.028, 0.008, 0.005, 0.0012);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    btnGroup.add(capMesh);

    // 左侧发光状态 LED 灯珠
    const ledGeo = createFrontFacingRoundedBox(0.0055, 0.015, 0.003, 0.0018, 0.0005);
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(-0.035, 0, 0.0038);
    btnGroup.add(ledMesh);

    // 按键表面文字铭牌
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = 'bold 24px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
      ctx.fillStyle = accentHex;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 140, 33);
    }
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const labelGeo = new THREE.PlaneGeometry(0.082, 0.022);
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTex,
      transparent: true,
      depthWrite: false,
    });
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.position.set(0.002, 0, 0.0044);
    btnGroup.add(labelMesh);

    // 宽松透明点击碰撞盒
    const hitGeo = new THREE.BoxGeometry(0.092, 0.034, 0.018);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.z = 0.004;
    btnGroup.add(hitMesh);

    this.tagInteractRole(btnGroup, role);
    return btnGroup;
  }

  /**
   * 初始化气缸内 88 颗三维理想气体分子位置与随机热运动速度方向
   */
  private initGasMolecules(): void {
    this.molecules.length = 0;
    const maxR = this.cylinderInnerRadius - 0.0042;
    for (let i = 0; i < this.moleculeCount; i++) {
      // 使用确定性伪随机分布确保测试可复现且空间均匀
      const seed1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
      const seed2 = Math.sin(i * 78.233 + 4.56) * 43758.5453;
      const seed3 = Math.sin(i * 39.425 + 7.89) * 43758.5453;
      const u1 = seed1 - Math.floor(seed1);
      const u2 = seed2 - Math.floor(seed2);
      const u3 = seed3 - Math.floor(seed3);

      const r = Math.sqrt(u1) * maxR;
      const theta = u2 * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = -0.012 + Math.sin(theta) * r;
      const y = this.gasChamberBottomY + 0.005 + u3 * 0.075;

      const phi = (i * 2.39996) % (Math.PI * 2);
      const cosTilt = ((i % 11) / 5.0) - 1.0;
      const sinTilt = Math.sqrt(Math.max(0.05, 1 - cosTilt * cosTilt));
      const speed = 0.095 + (i % 5) * 0.018;

      this.molecules.push({
        x,
        y,
        z,
        vx: Math.cos(phi) * sinTilt * speed,
        vy: cosTilt * speed,
        vz: Math.sin(phi) * sinTilt * speed,
        phase: i * 0.47,
      });
    }
  }

  /**
   * 根据实时物理遥测更新左侧 3D 装置（活塞行程、定容锁销、温控旋钮、波登表指针、三维气体分子热运动）与右侧采集大屏
   */
  public update(dt: number, telem: GasLawsTelemetry): void {
    // 1. 更新活塞总成垂直高度（与实时气体体积 V 严格线性对应）
    const targetPistonY =
      this.pistonMinHeightY +
      telem.pistonNormalized * (this.pistonMaxHeightY - this.pistonMinHeightY);
    this.pistonAssemblyGroup.position.y = targetPistonY;

    // 2. 更新黄铜定容锁止插销位置（查理定律等容下向右滑入卡紧活塞杆，其余模式向左退回）
    const targetLockPinX = telem.pistonLocked ? -0.028 : -0.046;
    this.lockPinMovingGroup.position.x = targetLockPinX;
    if (telem.pistonLocked) {
      this.lockStatusLedMat.color.setHex(0xf59e0b);
      this.lockStatusLedMat.emissive.setHex(0xf59e0b);
      this.lockStatusLedMat.emissiveIntensity = 0.95;
    } else {
      this.lockStatusLedMat.color.setHex(0x10b981);
      this.lockStatusLedMat.emissive.setHex(0x10b981);
      this.lockStatusLedMat.emissiveIntensity = 0.55;
    }

    // 3. 更新温控旋钮旋转角度与水浴夹套冷暖导热光效
    this.tempKnobGroup.rotation.z = -telem.knobAngleRad;
    this.updateThermalBathAppearance(telem.temperatureK);

    // 4. 更新波登管机械压力表指针角度（0 kPa 对应 +135°，220 kPa 对应 -135°）
    const needleAngle = (0.5 - telem.gaugeNormalized) * 1.5 * Math.PI;
    this.bourdonNeedleGroup.rotation.z = needleAngle;

    // 5. 更新气缸内 3D 理想气体分子热运动粒子（速率正比于 sqrt(T)，空间受限于活塞底面）
    this.updateGasMolecules(dt, targetPistonY, telem);

    // 6. 更新右侧 3D 终端模式按键高亮状态与自适应坐标曲线大屏
    this.updateModeButtonsState(telem.mode);
    this.renderDataTerminalScreen(telem);
  }

  /**
   * 根据温度 T (180 K ~ 480 K) 平滑驱动水浴夹套流体、螺旋换热盘管与温控指示环的冷暖色彩
   */
  private updateThermalBathAppearance(tempK: number): void {
    const tNorm = Math.max(0, Math.min(1, (tempK - 180) / 300));
    const coolColor = new THREE.Color(0x0ea5e9);
    const midColor = new THREE.Color(0x38bdf8);
    const warmColor = new THREE.Color(0xf97316);

    const activeColor = new THREE.Color();
    if (tNorm < 0.4) {
      activeColor.lerpColors(coolColor, midColor, tNorm / 0.4);
    } else {
      activeColor.lerpColors(midColor, warmColor, (tNorm - 0.4) / 0.6);
    }

    this.bathFluidMat.color.copy(activeColor);
    this.bathFluidMat.emissive.copy(activeColor);
    this.bathFluidMat.emissiveIntensity = 0.1 + Math.abs(tNorm - 0.4) * 0.25;

    this.heatCoilMat.emissive.copy(activeColor);
    this.heatCoilMat.emissiveIntensity = 0.2 + Math.abs(tNorm - 0.4) * 0.65;

    this.tempRingLedMat.color.copy(activeColor);
    this.tempRingLedMat.emissive.copy(activeColor);
  }

  /**
   * 步进并渲染气缸内 3D 理想气体分子热运动
   */
  private updateGasMolecules(
    dt: number,
    pistonBottomY: number,
    telem: GasLawsTelemetry
  ): void {
    const minY = this.gasChamberBottomY + 0.0038;
    const maxY = Math.max(minY + 0.012, pistonBottomY - 0.0038);
    const maxR = this.cylinderInnerRadius - 0.0036;
    const centerZ = -0.012;

    const stepDt = Math.min(0.05, Math.max(0.004, dt > 0 ? dt : 0.016));
    const speedScale = telem.molecularSpeedFactor;

    // 分子色温随温度 T 从冰青色 -> 天蓝色 -> 琥珀金红平滑渐变
    const tNorm = Math.max(0, Math.min(1, (telem.temperatureK - 180) / 300));
    if (tNorm < 0.42) {
      this.moleculeColor.lerpColors(
        new THREE.Color(0x38bdf8),
        new THREE.Color(0x67e8f9),
        tNorm / 0.42
      );
    } else {
      this.moleculeColor.lerpColors(
        new THREE.Color(0x67e8f9),
        new THREE.Color(0xfbbf24),
        (tNorm - 0.42) / 0.58
      );
    }

    const mat = this.moleculesInstancedMesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(this.moleculeColor);
    mat.emissive.copy(this.moleculeColor);
    mat.emissiveIntensity = 0.45 + 0.35 * Math.min(1.6, telem.molecularDensityFactor * 0.65);

    for (let i = 0; i < this.moleculeCount; i++) {
      const m = this.molecules[i];
      m.x += m.vx * speedScale * stepDt;
      m.y += m.vy * speedScale * stepDt;
      m.z += m.vz * speedScale * stepDt;

      // 上下端面（气缸底面与运动活塞底面）弹性碰撞反射
      if (m.y < minY) {
        m.y = minY + (minY - m.y) * 0.5;
        m.vy = Math.abs(m.vy);
      } else if (m.y > maxY) {
        m.y = maxY - (m.y - maxY) * 0.5;
        if (m.y < minY) m.y = (minY + maxY) * 0.5;
        m.vy = -Math.abs(m.vy);
      }

      // 圆柱内壁径向弹性碰撞反射
      const dx = m.x;
      const dz = m.z - centerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > maxR * maxR) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        m.x = nx * maxR * 0.97;
        m.z = centerZ + nz * maxR * 0.97;
        const dot = m.vx * nx + m.vz * nz;
        if (dot > 0) {
          m.vx -= 2 * dot * nx;
          m.vz -= 2 * dot * nz;
        }
      }

      this.dummyPosition.set(m.x, m.y, m.z);
      const radiusScale = 0.92 + 0.16 * Math.sin(m.phase);
      this.dummyScale.setScalar(radiusScale);
      this.dummyMatrix.compose(this.dummyPosition, this.dummyQuat, this.dummyScale);
      this.moleculesInstancedMesh.setMatrixAt(i, this.dummyMatrix);
    }

    this.moleculesInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 同步三枚 3D 定律模式实体按键的发光状态
   */
  private updateModeButtonsState(mode: GasLawMode): void {
    const isBoyle = mode === 'boyle';
    const isCharles = mode === 'charles';
    const isGayLussac = mode === 'gay-lussac';

    this.btnBoyleLedMat.emissiveIntensity = isBoyle ? 1.1 : 0.15;
    this.btnBoyleCapMat.emissiveIntensity = isBoyle ? 0.38 : 0.06;

    this.btnCharlesLedMat.emissiveIntensity = isCharles ? 1.1 : 0.15;
    this.btnCharlesCapMat.emissiveIntensity = isCharles ? 0.38 : 0.06;

    this.btnGayLussacLedMat.emissiveIntensity = isGayLussac ? 1.1 : 0.15;
    this.btnGayLussacCapMat.emissiveIntensity = isGayLussac ? 0.38 : 0.06;
  }

  /**
   * 绘制右侧 3D 终端深海蓝宝石大屏（随所选定律动态切换 p-V / p-T / V-T 主坐标系并高亮当前状态点与不变量）
   */
  private renderDataTerminalScreen(telem: GasLawsTelemetry): void {
    const ctx = this.screenCtx;
    if (!ctx) return;

    const W = 1024;
    const H = 768;

    // 1. 深邃海洋蓝黑背景 (#08101e)
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, W, H);

    // 顶部标题栏
    ctx.fillStyle = '#0d1b30';
    ctx.fillRect(24, 20, W - 48, 68);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 20, W - 48, 68);

    let titleText = '玻意耳定律 (等温过程 · T = 300.0 K) — p-V 等温双曲线';
    let accentColor = '#38bdf8';
    if (telem.mode === 'charles') {
      titleText = '查理定律 (等容过程 · V = 35.0 mL) — p-T 等容外推直线';
      accentColor = '#fbbf24';
    } else if (telem.mode === 'gay-lussac') {
      titleText = '盖-吕萨克定律 (等压过程 · p = 101.3 kPa) — V-T 等压外推直线';
      accentColor = '#34d399';
    }

    ctx.font = 'bold 27px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, 44, 54);

    // 右上角活塞机械锁状态徽章
    ctx.font = 'bold 21px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillStyle = telem.pistonLocked ? '#fbbf24' : '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(
      telem.pistonLocked ? '● 黄铜定容锁销：已锁死活塞' : '○ 活塞锁销：已松开',
      W - 44,
      54
    );

    // 2. 四枚实时物理量遥测数字卡片 (p, V, T, 不变量)
    const cards = [
      {
        label: '气体压强 p',
        val: `${telem.pressureKPa.toFixed(1)} kPa`,
        color: '#38bdf8',
      },
      {
        label: '气体体积 V',
        val: `${telem.volumeML.toFixed(1)} mL`,
        color: '#34d399',
      },
      {
        label: '热力学温度 T',
        val: `${telem.temperatureK.toFixed(0)} K (${telem.temperatureC.toFixed(0)}°C)`,
        color: '#fbbf24',
      },
      {
        label: `不变量 ${telem.invariantExpression}`,
        val: `${telem.invariantValue.toFixed(telem.mode === 'boyle' ? 0 : 3)} ${telem.invariantUnit}`,
        color: accentColor,
      },
    ];

    const cardW = 228;
    const cardH = 86;
    const cardY = 104;
    for (let i = 0; i < cards.length; i++) {
      const cx = 24 + i * (cardW + 21);
      ctx.fillStyle = '#0c182b';
      ctx.fillRect(cx, cardY, cardW, cardH);
      ctx.strokeStyle = i === 3 ? accentColor : 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = i === 3 ? 2.5 : 1.5;
      ctx.strokeRect(cx, cardY, cardW, cardH);

      ctx.font = '19px -apple-system, "SF Pro Text", "PingFang SC", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(cards[i].label, cx + 14, cardY + 26);

      ctx.font = 'bold 24px "SF Mono", Menlo, monospace';
      ctx.fillStyle = cards[i].color;
      ctx.fillText(cards[i].val, cx + 14, cardY + 62);
    }

    // 3. 主坐标轴绘图区
    const plotX = 108;
    const plotY = 222;
    const plotW = 864;
    const plotH = 468;

    ctx.fillStyle = '#060c18';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // 坐标网格线
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
    ctx.lineWidth = 1;
    for (let gx = 1; gx < 6; gx++) {
      const x = plotX + (gx / 6) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, plotY);
      ctx.lineTo(x, plotY + plotH);
      ctx.stroke();
    }
    for (let gy = 1; gy < 5; gy++) {
      const y = plotY + (gy / 5) * plotH;
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
    }

    if (telem.mode === 'boyle') {
      this.drawBoylePVChart(ctx, plotX, plotY, plotW, plotH, telem);
    } else if (telem.mode === 'charles') {
      this.drawCharlesPTChart(ctx, plotX, plotY, plotW, plotH, telem);
    } else {
      this.drawGayLussacVTChart(ctx, plotX, plotY, plotW, plotH, telem);
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * 绘制玻意耳定律 p-V 等温双曲线图
   */
  private drawBoylePVChart(
    ctx: CanvasRenderingContext2D,
    plotX: number,
    plotY: number,
    plotW: number,
    plotH: number,
    telem: GasLawsTelemetry
  ): void {
    const vMin = 15;
    const vMax = 65;
    const pMin = 0;
    const pMax = 220;

    const toX = (v: number) => plotX + ((v - vMin) / (vMax - vMin)) * plotW;
    const toY = (p: number) => plotY + plotH - ((p - pMin) / (pMax - pMin)) * plotH;

    // 1. 理论等温双曲线参考虚线 (p = C₁ / V)
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let v = MIN_CYLINDER_VOLUME_ML; v <= MAX_CYLINDER_VOLUME_ML; v += 0.5) {
      const p = evaluateBoylePressureKPa(v);
      const x = toX(v);
      const y = toY(p);
      if (v === MIN_CYLINDER_VOLUME_ML) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. 用户已手动拖拽探索过的高亮双曲线段
    const [sMinV, sMaxV] = telem.sweptVolumeRangeML;
    if (sMaxV - sMinV > 0.15) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let v = sMinV; v <= sMaxV; v += 0.4) {
        const p = evaluateBoylePressureKPa(v);
        const x = toX(v);
        const y = toY(p);
        if (v === sMinV) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(toX(sMaxV), toY(evaluateBoylePressureKPa(sMaxV)));
      ctx.stroke();
    }

    // 3. 当前状态点 (V, p) 十字准星与发光圆点
    const curX = toX(telem.volumeML);
    const curY = toY(telem.pressureKPa);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(curX, plotY + plotH);
    ctx.lineTo(curX, curY);
    ctx.lineTo(plotX, curY);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fill();

    // 状态点旁实时标注
    ctx.font = 'bold 21px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#e0f2fe';
    ctx.textAlign = 'left';
    ctx.fillText(
      `(${telem.volumeML.toFixed(1)} mL, ${telem.pressureKPa.toFixed(1)} kPa)  pV = ${BOYLE_INVARIANT_PV.toFixed(0)}`,
      Math.min(plotX + plotW - 390, curX + 16),
      Math.max(plotY + 32, curY - 16)
    );

    // 坐标轴刻度与标签
    ctx.font = '19px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let v = 20; v <= 60; v += 10) {
      ctx.fillText(`${v}`, toX(v), plotY + plotH + 28);
    }
    ctx.textAlign = 'right';
    for (let p = 0; p <= 200; p += 50) {
      ctx.fillText(`${p}`, plotX - 12, toY(p));
    }

    ctx.font = 'bold 22px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText('气体体积 V (mL)  [上下拖拽 3D 活塞手柄调节]', plotX + plotW * 0.5, plotY + plotH + 56);
    ctx.restore();
  }

  /**
   * 绘制查理定律 p-T 等容正比例直线图（含 0 K 绝对零度外推线）
   */
  private drawCharlesPTChart(
    ctx: CanvasRenderingContext2D,
    plotX: number,
    plotY: number,
    plotW: number,
    plotH: number,
    telem: GasLawsTelemetry
  ): void {
    const tMin = 0;
    const tMax = 480;
    const pMin = 0;
    const pMax = 180;

    const toX = (t: number) => plotX + ((t - tMin) / (tMax - tMin)) * plotW;
    const toY = (p: number) => plotY + plotH - ((p - pMin) / (pMax - pMin)) * plotH;

    ctx.save();

    // 1. 0 K (-273.15°C) 绝对零度外推参考线 (0 K -> 200 K)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(toX(CHARLES_MAX_TEMP_K), toY(evaluateCharlesPressureKPa(CHARLES_MAX_TEMP_K)));
    ctx.stroke();

    // 绝对零度原点标记
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 18px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('绝对零度外推 (0 K, 0 kPa)', toX(12), toY(14));

    // 2. 用户已手动拖拽探索过的高亮等容直线段
    const [sMinT, sMaxT] = telem.sweptCharlesTempRangeK;
    if (sMaxT - sMinT > 0.5) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(toX(sMinT), toY(evaluateCharlesPressureKPa(sMinT)));
      ctx.lineTo(toX(sMaxT), toY(evaluateCharlesPressureKPa(sMaxT)));
      ctx.stroke();
    }

    // 3. 当前状态点 (T, p)
    const curX = toX(telem.temperatureK);
    const curY = toY(telem.pressureKPa);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(curX, plotY + plotH);
    ctx.lineTo(curX, curY);
    ctx.lineTo(plotX, curY);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 21px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#fef3c7';
    ctx.textAlign = 'left';
    ctx.fillText(
      `(${telem.temperatureK.toFixed(0)} K, ${telem.pressureKPa.toFixed(1)} kPa)  p/T = ${CHARLES_INVARIANT_P_OVER_T.toFixed(3)}`,
      Math.min(plotX + plotW - 390, curX + 16),
      Math.max(plotY + 32, curY - 16)
    );

    // 坐标轴刻度
    ctx.font = '19px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let t = 0; t <= 450; t += 100) {
      ctx.fillText(`${t}`, toX(t), plotY + plotH + 28);
    }
    ctx.textAlign = 'right';
    for (let p = 0; p <= 160; p += 40) {
      ctx.fillText(`${p}`, plotX - 12, toY(p));
    }

    ctx.font = 'bold 22px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText('热力学温度 T (K)  [拖拽底座黄铜温控旋钮调节]', plotX + plotW * 0.5, plotY + plotH + 56);
    ctx.restore();
  }

  /**
   * 绘制盖-吕萨克定律 V-T 等压正比例直线图（含 0 K 绝对零度外推线）
   */
  private drawGayLussacVTChart(
    ctx: CanvasRenderingContext2D,
    plotX: number,
    plotY: number,
    plotW: number,
    plotH: number,
    telem: GasLawsTelemetry
  ): void {
    const tMin = 0;
    const tMax = 500;
    const vMin = 0;
    const vMax = 65;

    const toX = (t: number) => plotX + ((t - tMin) / (tMax - tMin)) * plotW;
    const toY = (v: number) => plotY + plotH - ((v - vMin) / (vMax - vMin)) * plotH;

    ctx.save();

    // 1. 0 K 绝对零度外推直线 (0 K -> 480 K)
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    ctx.lineTo(
      toX(GAY_LUSSAC_MAX_TEMP_K),
      toY(evaluateGayLussacVolumeML(GAY_LUSSAC_MAX_TEMP_K))
    );
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 18px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('绝对零度外推 (0 K, 0 mL)', toX(12), toY(6));

    // 2. 用户已手动拖拽探索过的高亮等压直线段
    const [sMinT, sMaxT] = telem.sweptGayLussacTempRangeK;
    if (sMaxT - sMinT > 0.5) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(toX(sMinT), toY(evaluateGayLussacVolumeML(sMinT)));
      ctx.lineTo(toX(sMaxT), toY(evaluateGayLussacVolumeML(sMaxT)));
      ctx.stroke();
    }

    // 3. 当前状态点 (T, V)
    const curX = toX(telem.temperatureK);
    const curY = toY(telem.volumeML);

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(curX, plotY + plotH);
    ctx.lineTo(curX, curY);
    ctx.lineTo(plotX, curY);
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(curX, curY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 21px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#d1fae5';
    ctx.textAlign = 'left';
    ctx.fillText(
      `(${telem.temperatureK.toFixed(0)} K, ${telem.volumeML.toFixed(1)} mL)  V/T = ${GAY_LUSSAC_INVARIANT_V_OVER_T.toFixed(3)}`,
      Math.min(plotX + plotW - 390, curX + 16),
      Math.max(plotY + 32, curY - 16)
    );

    // 坐标轴刻度
    ctx.font = '19px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let t = 0; t <= 500; t += 100) {
      ctx.fillText(`${t}`, toX(t), plotY + plotH + 28);
    }
    ctx.textAlign = 'right';
    for (let v = 0; v <= 60; v += 15) {
      ctx.fillText(`${v}`, plotX - 12, toY(v));
    }

    ctx.font = 'bold 22px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText('热力学温度 T (K)  [拖拽底座黄铜温控旋钮调节]', plotX + plotW * 0.5, plotY + plotH + 56);
    ctx.restore();
  }

  /**
   * 生成气缸外壁激光蚀刻容积标尺纹理（10 mL ~ 60 mL，面向 +Z）
   */
  private createCylinderScaleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 512);
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
      ctx.font = 'bold 22px "SF Mono", Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // 顶部标题 mL
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('V (mL)', 92, 26);

      ctx.fillStyle = '#f8fafc';
      for (let ml = 15; ml <= 60; ml += 5) {
        const norm = (ml - 15) / 45;
        const y = 468 - norm * 405;
        const isMajor = ml % 10 === 0;
        ctx.lineWidth = isMajor ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(78, y);
        ctx.lineTo(isMajor ? 126 : 108, y);
        ctx.stroke();

        if (isMajor || ml === 35) {
          ctx.fillStyle = ml === 35 ? '#fbbf24' : '#f8fafc';
          ctx.fillText(`${ml}`, 134, y);
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 生成波登机械压力表盘纹理 (0 ~ 220 kPa)
   */
  private createBourdonGaugeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#08101e';
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(128, 128, 118, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 20px "SF Mono", Menlo, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('kPa', 128, 178);

      ctx.strokeStyle = '#e2e8f0';
      for (let p = 0; p <= 220; p += 20) {
        const norm = p / 220;
        const angle = -Math.PI * 0.75 + norm * Math.PI * 1.5 - Math.PI * 0.5;
        const rInner = p % 40 === 0 ? 84 : 94;
        const rOuter = 108;
        ctx.lineWidth = p % 40 === 0 ? 3 : 1.8;
        ctx.beginPath();
        ctx.moveTo(128 + Math.cos(angle) * rInner, 128 + Math.sin(angle) * rInner);
        ctx.lineTo(128 + Math.cos(angle) * rOuter, 128 + Math.sin(angle) * rOuter);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 生成温控底座面板铭牌纹理
   */
  private createTempConsoleDialTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0a1426';
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, 504, 152);

      ctx.font = 'bold 22px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText('COLD 180K', 22, 86);

      ctx.fillStyle = '#fb923c';
      ctx.textAlign = 'right';
      ctx.fillText('480K HOT', 490, 86);

      ctx.font = 'bold 20px -apple-system, "SF Pro Display", "PingFang SC", sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText('恒温水浴温控旋钮 T', 256, 30);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public dispose(): void {
    this.screenTexture?.dispose();
    disposeObjectTree(this.group);
  }
}
