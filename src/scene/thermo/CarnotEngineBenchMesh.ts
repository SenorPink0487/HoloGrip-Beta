import * as THREE from 'three';
import {
  anodizedAluminum,
  labGlass,
  labGlow,
  labMetal,
  paintTexture,
  polishedGold,
} from '../em/labKit.ts';
import { disposeObjectTree } from '../em/disposeObject.ts';
import {
  CRANK_ROD_RATIO,
  type CarnotPVCurveSamples,
  type CarnotTelemetry,
} from '../../physics/thermo/carnotCycle.ts';

export interface CarnotEngineBenchOptions {
  hotTempC?: number;
  coldTempC?: number;
}

/**
 * 创建带真实机械圆角与倒角的水平底座/构件几何体
 */
function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.0022
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, Math.min(radius, width * 0.45, depth * 0.45));
  const w = width * 0.5 - rx;
  const d = depth * 0.5 - rx;

  shape.moveTo(-w, -d - rx);
  shape.lineTo(w, -d - rx);
  shape.quadraticCurveTo(w + rx, -d - rx, w + rx, -d);
  shape.lineTo(w + rx, d);
  shape.quadraticCurveTo(w + rx, d + rx, w, d + rx);
  shape.lineTo(-w, d + rx);
  shape.quadraticCurveTo(-w - rx, d + rx, -w - rx, d);
  shape.lineTo(-w - rx, -d);
  shape.quadraticCurveTo(-w - rx, -d - rx, -w, -d - rx);

  const bSize = Math.min(rx * 0.6, bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.001, height - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * 创建面向 +Z 的精密倒角圆角矩形外壳几何体
 */
function createFrontFacingRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.002
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.001, Math.min(radius, width * 0.45, height * 0.45));
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

  const bSize = Math.min(rx * 0.5, bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.001, depth - bSize * 2),
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

/**
 * 创建工业六角螺母几何体（带倒角）
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
    depth: Math.max(0.0005, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * 创建螺旋盘管 3D 曲线 (Helix Curve)
 */
function createHelixPoints(
  radius: number,
  height: number,
  turns: number,
  samples = 140
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const angle = u * turns * Math.PI * 2;
    const y = (u - 0.5) * height;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

/**
 * 创建带镂空辐条窗的精密飞轮轮盘几何体
 */
function createSpokedFlywheelGeometry(
  outerRadius: number,
  innerRimRadius: number,
  hubRadius: number,
  thickness: number,
  spokeCount = 5
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  // 扇形减重窗孔
  const sectorAngle = (Math.PI * 2) / spokeCount;
  const spokeHalfAngle = 0.16;
  for (let i = 0; i < spokeCount; i++) {
    const a0 = i * sectorAngle + spokeHalfAngle;
    const a1 = (i + 1) * sectorAngle - spokeHalfAngle;
    if (a1 <= a0) continue;

    const hole = new THREE.Path();
    const rIn = hubRadius * 1.12;
    const rOut = innerRimRadius * 0.96;
    hole.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
    hole.lineTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
    hole.absarc(0, 0, rOut, a0, a1, false);
    hole.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
    hole.absarc(0, 0, rIn, a1, a0, true);
    shape.holes.push(hole);
  }

  const bevel = Math.min(0.0025, thickness * 0.18);
  const geo = new THREE.ExtrudeGeometry(shape, {
    curveSegments: 48,
    steps: 1,
    depth: Math.max(0.002, thickness - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

interface GasParticleState {
  /** 在气缸局部坐标系中的归一化轴向位置 u ∈ [0.06, 0.94] */
  u: number;
  /** 径向半径 r ∈ [0, R_max] */
  r: number;
  /** 极角 φ ∈ [0, 2π) */
  phi: number;
  /** 轴向归一化速度 */
  vu: number;
  /** 径向速度 */
  vr: number;
  /** 角速度 */
  vphi: number;
  /** 粒子相位偏移 */
  phase: number;
}

export class CarnotEngineBenchMesh {
  public readonly group = new THREE.Group();

  // 交互手轮组（供 Raycaster 拾取与拖拽旋转）
  public readonly hotValveHandleGroup = new THREE.Group();
  public readonly coldValveHandleGroup = new THREE.Group();
  private hotValveHighlightRing!: THREE.Mesh;
  private coldValveHighlightRing!: THREE.Mesh;

  // 机械运动部件
  public readonly pistonGroup = new THREE.Group();
  public readonly connectingRodGroup = new THREE.Group();
  public readonly flywheelGroup = new THREE.Group();
  public readonly pressureNeedleGroup = new THREE.Group();

  // 曲柄连杆几何常量 (严格对齐 CRANK_ROD_RATIO = r / L = 0.042 / 0.150 = 0.28)
  private readonly cylinderAxisY = 0.235;
  private readonly cylinderAxisZ = -0.025;
  private readonly flywheelCenterX = 0.205;
  private readonly crankRadius = 0.042;
  private readonly connectingRodLength = this.crankRadius / CRANK_ROD_RATIO; // 0.150 m
  /** 活塞左端面相对于手腕销 (wristPin) 的偏移量 */
  private readonly wristPinToPistonCrownOffset = -0.148;
  /** 气缸内部左端盖基准 X */
  private readonly cylinderInnerLeftX = -0.218;

  // 热源与热流视觉材质
  private hotCoilMat!: THREE.MeshStandardMaterial;
  private coldCoilMat!: THREE.MeshStandardMaterial;
  private flameOuterMesh!: THREE.Mesh;
  private flameInnerMesh!: THREE.Mesh;
  private flameCoreMesh!: THREE.Mesh;
  private hotPipeUpperMat!: THREE.MeshStandardMaterial;
  private hotPipeLowerMat!: THREE.MeshStandardMaterial;
  private coldPipeMat!: THREE.MeshStandardMaterial;
  private hotPulseMeshes: THREE.Mesh[] = [];
  private coldPulseMeshes: THREE.Mesh[] = [];

  // 气缸内三维理想气体分子粒子系统
  private readonly particleCount = 140;
  private gasParticlesInstanced!: THREE.InstancedMesh;
  private gasParticleStates: GasParticleState[] = [];
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly dummyPos = new THREE.Vector3();
  private readonly dummyScale = new THREE.Vector3();
  private readonly dummyQuat = new THREE.Quaternion();
  private readonly tempColor = new THREE.Color();

  // 温度表头动态 CanvasTexture
  private hotReadoutCanvas!: HTMLCanvasElement;
  private hotReadoutTexture!: THREE.CanvasTexture;
  private lastHotReadoutKey = '';

  private coldReadoutCanvas!: HTMLCanvasElement;
  private coldReadoutTexture!: THREE.CanvasTexture;
  private lastColdReadoutKey = '';

  // 手轮累计转角
  private hotValveAngle = 0;
  private coldValveAngle = 0;
  private animClock = 0;

  constructor(_options: CarnotEngineBenchOptions = {}) {
    this.group.name = 'CarnotEngineBenchGroup';

    this.buildBaseplate();
    this.buildHotReservoirAssembly();
    this.buildColdReservoirAssembly();
    this.buildWorkingCylinderAndGaugeAssembly();
    this.buildCrankFlywheelMechanism();
    this.buildHeatExchangePiping();
    this.initGasParticleSystem();
  }

  // ============================================================================
  // 1. 航天级喷砂银铝重型底座 (纯净紧凑台面，无前方遮挡屏)
  // ============================================================================
  private buildBaseplate(): void {
    const baseGroup = new THREE.Group();
    baseGroup.name = 'CarnotBaseplateAssembly';

    const satinSilver = anodizedAluminum(0xe2e8f0, 0.24);
    const brightAluminum = anodizedAluminum(0xf1f5f9, 0.18);
    const chromeMat = labMetal(0xffffff, 0.96, 0.08);
    const brassMat = polishedGold(0xf59e0b);
    const slatePadMat = anodizedAluminum(0x475569, 0.38);

    // 主工作台底座（带精密倒角）
    const mainBaseGeo = createChamferedBoxGeometry(1.24, 0.056, 0.36, 0.018, 0.003);
    const mainBaseMesh = new THREE.Mesh(mainBaseGeo, satinSilver);
    mainBaseMesh.position.set(0, 0.018, -0.02);
    mainBaseMesh.castShadow = true;
    mainBaseMesh.receiveShadow = true;
    baseGroup.add(mainBaseMesh);

    // 台面顶层精密拉丝导轨承重层
    const topDeckGeo = createChamferedBoxGeometry(1.18, 0.012, 0.30, 0.012, 0.0018);
    const topDeckMesh = new THREE.Mesh(topDeckGeo, brightAluminum);
    topDeckMesh.position.set(0, 0.072, -0.025);
    topDeckMesh.receiveShadow = true;
    baseGroup.add(topDeckMesh);

    // 台面横向 T 型工艺燕尾凹槽装饰条（增强工业精密感）
    for (const zOffset of [-0.11, 0.06]) {
      const railGeo = createChamferedBoxGeometry(1.12, 0.003, 0.008, 0.002, 0.0005);
      const railMesh = new THREE.Mesh(railGeo, chromeMat);
      railMesh.position.set(0, 0.083, zOffset);
      baseGroup.add(railMesh);
    }

    // 四角水平微调防震支脚（黄铜调节锁环 + 金属减震底座）
    const footPositions: [number, number][] = [
      [-0.55, -0.15],
      [0.55, -0.15],
      [-0.55, 0.11],
      [0.55, 0.11],
    ];
    for (const [fx, fz] of footPositions) {
      const padGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.012, 24);
      const padMesh = new THREE.Mesh(padGeo, slatePadMat);
      padMesh.position.set(fx, 0.006, fz);
      baseGroup.add(padMesh);

      const collarGeo = createHexNutGeometry(0.022, 0.009);
      const collarMesh = new THREE.Mesh(collarGeo, brassMat);
      collarMesh.rotation.x = Math.PI / 2;
      collarMesh.position.set(fx, 0.015, fz);
      baseGroup.add(collarMesh);
    }

    this.group.add(baseGroup);
  }

  // ============================================================================
  // 2. 左侧：高温热源（热水/加热器 + 螺旋电热管 + 火焰 + 红色手轮阀门 + 数显表头）
  // ============================================================================
  private buildHotReservoirAssembly(): void {
    const hotGroup = new THREE.Group();
    hotGroup.name = 'HotReservoirAssembly';
    hotGroup.position.set(-0.455, 0.084, this.cylinderAxisZ);

    const satinSilver = anodizedAluminum(0xe2e8f0, 0.22);
    const chromeMat = labMetal(0xffffff, 0.96, 0.07);
    const brassMat = polishedGold(0xf59e0b);
    const crimsonAnodized = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.72,
      roughness: 0.24,
    });
    const glassMat = labGlass(0.22);

    // 底部阶梯式法兰基座
    const baseFlangeGeo = new THREE.CylinderGeometry(0.094, 0.102, 0.022, 36);
    const baseFlange = new THREE.Mesh(baseFlangeGeo, satinSilver);
    baseFlange.position.y = 0.011;
    baseFlange.castShadow = true;
    hotGroup.add(baseFlange);

    const lowerRingGeo = new THREE.CylinderGeometry(0.088, 0.092, 0.014, 36);
    const lowerRing = new THREE.Mesh(lowerRingGeo, crimsonAnodized);
    lowerRing.position.y = 0.029;
    hotGroup.add(lowerRing);

    // 透明高硼硅玻璃圆筒容器 (高度 0.22m, 半径 0.080m)
    const vesselHeight = 0.22;
    const vesselCenterY = 0.036 + vesselHeight * 0.5; // 0.146
    const glassCylGeo = new THREE.CylinderGeometry(0.080, 0.080, vesselHeight, 40, 1, true);
    const glassCyl = new THREE.Mesh(glassCylGeo, glassMat);
    glassCyl.position.y = vesselCenterY;
    hotGroup.add(glassCyl);

    // 内部导热介质暖红流体柱（半透明柔和渐变体积感）
    const hotLiquidMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      emissive: 0xe11d48,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.26,
      roughness: 0.15,
      depthWrite: false,
    });
    const hotLiquidMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.074, vesselHeight * 0.86, 32),
      hotLiquidMat
    );
    hotLiquidMesh.position.y = vesselCenterY - 0.006;
    hotGroup.add(hotLiquidMesh);

    // 内部 6 匝螺旋加热盘管 (TubeGeometry)
    const coilPts = createHelixPoints(0.046, 0.125, 5.5, 140);
    const coilCurve = new THREE.CatmullRomCurve3(coilPts);
    const coilGeo = new THREE.TubeGeometry(coilCurve, 120, 0.0068, 12, false);
    this.hotCoilMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff3b1f,
      emissiveIntensity: 0.65,
      metalness: 0.65,
      roughness: 0.22,
    });
    const coilMesh = new THREE.Mesh(coilGeo, this.hotCoilMat);
    coilMesh.position.y = vesselCenterY + 0.008;
    hotGroup.add(coilMesh);

    // 底部精密黄铜燃烧喷嘴与三层动态火焰
    const burnerNozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.024, 0.022, 24),
      brassMat
    );
    burnerNozzle.position.y = 0.046;
    hotGroup.add(burnerNozzle);

    const flameOuterGeo = new THREE.ConeGeometry(0.025, 0.052, 20);
    flameOuterGeo.translate(0, 0.026, 0);
    this.flameOuterMesh = new THREE.Mesh(
      flameOuterGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    this.flameOuterMesh.position.y = 0.054;
    hotGroup.add(this.flameOuterMesh);

    const flameInnerGeo = new THREE.ConeGeometry(0.016, 0.038, 18);
    flameInnerGeo.translate(0, 0.019, 0);
    this.flameInnerMesh = new THREE.Mesh(
      flameInnerGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffb703,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    );
    this.flameInnerMesh.position.y = 0.055;
    hotGroup.add(this.flameInnerMesh);

    const flameCoreGeo = new THREE.ConeGeometry(0.008, 0.022, 16);
    flameCoreGeo.translate(0, 0.011, 0);
    this.flameCoreMesh = new THREE.Mesh(
      flameCoreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfffbeb,
        transparent: true,
        opacity: 0.96,
      })
    );
    this.flameCoreMesh.position.y = 0.056;
    hotGroup.add(this.flameCoreMesh);

    // 顶部阳极氧化红法兰封盖与一圈六角紧固螺栓
    const topCapY = 0.036 + vesselHeight + 0.012; // 0.268
    const topFlangeGeo = new THREE.CylinderGeometry(0.092, 0.092, 0.024, 36);
    const topFlange = new THREE.Mesh(topFlangeGeo, crimsonAnodized);
    topFlange.position.y = topCapY;
    topFlange.castShadow = true;
    hotGroup.add(topFlange);

    // 4 根外置液态铬拉杆与 8 颗六角螺母
    const boltRadius = 0.084;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const bx = Math.cos(a) * boltRadius;
      const bz = Math.sin(a) * boltRadius;

      const nutGeo = createHexNutGeometry(0.0065, 0.006);
      const topNut = new THREE.Mesh(nutGeo, chromeMat);
      topNut.rotation.x = Math.PI / 2;
      topNut.position.set(bx, topCapY + 0.014, bz);
      hotGroup.add(topNut);

      if (i % 2 === 0) {
        const tieRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0032, 0.0032, vesselHeight + 0.03, 12),
          chromeMat
        );
        tieRod.position.set(bx, vesselCenterY, bz);
        hotGroup.add(tieRod);
      }
    }

    // 顶部数字温度计表头 (正对 +Z，显示 80.0 °C)
    const meterGroup = new THREE.Group();
    meterGroup.position.set(0, topCapY + 0.044, 0.012);

    const meterStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.022, 20),
      satinSilver
    );
    meterStem.position.set(0, -0.022, 0);
    meterGroup.add(meterStem);

    const meterHousingGeo = createFrontFacingRoundedBox(0.112, 0.052, 0.026, 0.008, 0.0018);
    const meterHousing = new THREE.Mesh(meterHousingGeo, satinSilver);
    meterGroup.add(meterHousing);

    this.hotReadoutCanvas = document.createElement('canvas');
    this.hotReadoutCanvas.width = 256;
    this.hotReadoutCanvas.height = 120;
    this.hotReadoutTexture = new THREE.CanvasTexture(this.hotReadoutCanvas);
    this.hotReadoutTexture.colorSpace = THREE.SRGBColorSpace;
    const hotScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.098, 0.038),
      new THREE.MeshBasicMaterial({ map: this.hotReadoutTexture, toneMapped: false })
    );
    hotScreenMesh.position.z = 0.0135;
    meterGroup.add(hotScreenMesh);
    hotGroup.add(meterGroup);

    // 右上侧：黄铜三通阀体 + 红色滚花调节手轮 (支持 3D 鼠标直接拖拽调节 Th)
    const valveBodyGroup = new THREE.Group();
    valveBodyGroup.position.set(0.115, topCapY - 0.002, 0);

    // 水平黄铜阀体管与六角压紧螺母
    const valvePipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.056, 20),
      brassMat
    );
    valvePipe.rotation.z = Math.PI / 2;
    valveBodyGroup.add(valvePipe);

    for (const nx of [-0.022, 0.022]) {
      const hexNut = new THREE.Mesh(createHexNutGeometry(0.017, 0.009), brassMat);
      hexNut.rotation.y = Math.PI / 2;
      hexNut.position.x = nx;
      valveBodyGroup.add(hexNut);
    }

    // 垂直阀杆座
    const valveBonnet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.013, 0.026, 18),
      brassMat
    );
    valveBonnet.position.y = 0.016;
    valveBodyGroup.add(valveBonnet);

    const valveStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 16),
      chromeMat
    );
    valveStem.position.y = 0.032;
    valveBodyGroup.add(valveStem);

    // 红色可交互滚花手轮
    this.hotValveHandleGroup.name = 'HotValveHandle';
    this.hotValveHandleGroup.position.set(0, 0.044, 0);
    this.buildKnurledValveWheel(this.hotValveHandleGroup, 0xdc2626, brassMat, chromeMat);

    // 悬停/拖拽磁吸高亮光环
    this.hotValveHighlightRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.0022, 12, 32),
      labGlow(0xff5a36, 1.1)
    );
    this.hotValveHighlightRing.rotation.x = Math.PI / 2;
    this.hotValveHighlightRing.visible = false;
    this.hotValveHandleGroup.add(this.hotValveHighlightRing);

    // 透明拾取碰撞球（提升触控/鼠标点击灵敏度）
    const hitCollider = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 12, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitCollider.name = 'HotValveCollider';
    this.hotValveHandleGroup.add(hitCollider);

    valveBodyGroup.add(this.hotValveHandleGroup);
    hotGroup.add(valveBodyGroup);

    this.group.add(hotGroup);
  }

  // ============================================================================
  // 3. 右侧：低温冷源（冷却水容器 + 蓝色冷却盘管 + 蓝色手轮阀门 + 数显表头）
  // ============================================================================
  private buildColdReservoirAssembly(): void {
    const coldGroup = new THREE.Group();
    coldGroup.name = 'ColdReservoirAssembly';
    coldGroup.position.set(0.465, 0.084, this.cylinderAxisZ);

    const satinSilver = anodizedAluminum(0xe2e8f0, 0.22);
    const chromeMat = labMetal(0xffffff, 0.96, 0.07);
    const brassMat = polishedGold(0xf59e0b);
    const sapphireAnodized = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.74,
      roughness: 0.22,
    });
    const glassMat = labGlass(0.22);

    // 底部阶梯式法兰基座
    const baseFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.094, 0.102, 0.022, 36),
      satinSilver
    );
    baseFlange.position.y = 0.011;
    baseFlange.castShadow = true;
    coldGroup.add(baseFlange);

    const lowerRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.092, 0.014, 36),
      sapphireAnodized
    );
    lowerRing.position.y = 0.029;
    coldGroup.add(lowerRing);

    const vesselHeight = 0.22;
    const vesselCenterY = 0.036 + vesselHeight * 0.5;
    const glassCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.080, 0.080, vesselHeight, 40, 1, true),
      glassMat
    );
    glassCyl.position.y = vesselCenterY;
    coldGroup.add(glassCyl);

    // 内部冰蓝冷却水介质柱
    const coldWaterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.20,
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      depthWrite: false,
    });
    const coldWaterMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, vesselHeight * 0.84, 32),
      coldWaterMat
    );
    coldWaterMesh.position.y = vesselCenterY - 0.008;
    coldGroup.add(coldWaterMesh);

    // 内部 6 匝螺旋冷却盘管
    const coilPts = createHelixPoints(0.046, 0.135, 6.0, 140);
    const coilCurve = new THREE.CatmullRomCurve3(coilPts);
    const coilGeo = new THREE.TubeGeometry(coilCurve, 120, 0.0068, 12, false);
    this.coldCoilMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.72,
      roughness: 0.20,
    });
    const coilMesh = new THREE.Mesh(coilGeo, this.coldCoilMat);
    coilMesh.position.y = vesselCenterY - 0.004;
    coldGroup.add(coilMesh);

    // 顶部法兰封盖与外置拉杆
    const topCapY = 0.036 + vesselHeight + 0.012;
    const topFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.092, 0.092, 0.024, 36),
      satinSilver
    );
    topFlange.position.y = topCapY;
    topFlange.castShadow = true;
    coldGroup.add(topFlange);

    const boltRadius = 0.084;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const bx = Math.cos(a) * boltRadius;
      const bz = Math.sin(a) * boltRadius;

      const topNut = new THREE.Mesh(createHexNutGeometry(0.0065, 0.006), chromeMat);
      topNut.rotation.x = Math.PI / 2;
      topNut.position.set(bx, topCapY + 0.014, bz);
      coldGroup.add(topNut);

      if (i % 2 === 0) {
        const tieRod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0032, 0.0032, vesselHeight + 0.03, 12),
          chromeMat
        );
        tieRod.position.set(bx, vesselCenterY, bz);
        coldGroup.add(tieRod);
      }
    }

    // 顶部数字温度计表头 (正对 +Z，显示 20.0 °C)
    const meterGroup = new THREE.Group();
    meterGroup.position.set(0, topCapY + 0.044, 0.012);

    const meterStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.022, 20),
      satinSilver
    );
    meterStem.position.set(0, -0.022, 0);
    meterGroup.add(meterStem);

    const meterHousing = new THREE.Mesh(
      createFrontFacingRoundedBox(0.112, 0.052, 0.026, 0.008, 0.0018),
      satinSilver
    );
    meterGroup.add(meterHousing);

    this.coldReadoutCanvas = document.createElement('canvas');
    this.coldReadoutCanvas.width = 256;
    this.coldReadoutCanvas.height = 120;
    this.coldReadoutTexture = new THREE.CanvasTexture(this.coldReadoutCanvas);
    this.coldReadoutTexture.colorSpace = THREE.SRGBColorSpace;
    const coldScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.098, 0.038),
      new THREE.MeshBasicMaterial({ map: this.coldReadoutTexture, toneMapped: false })
    );
    coldScreenMesh.position.z = 0.0135;
    meterGroup.add(coldScreenMesh);
    coldGroup.add(meterGroup);

    // 左上侧：黄铜三通阀体 + 蓝色滚花调节手轮 (支持 3D 鼠标直接拖拽调节 Tc)
    const valveBodyGroup = new THREE.Group();
    valveBodyGroup.position.set(-0.115, topCapY - 0.002, 0);

    const valvePipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.056, 20),
      brassMat
    );
    valvePipe.rotation.z = Math.PI / 2;
    valveBodyGroup.add(valvePipe);

    for (const nx of [-0.022, 0.022]) {
      const hexNut = new THREE.Mesh(createHexNutGeometry(0.017, 0.009), brassMat);
      hexNut.rotation.y = Math.PI / 2;
      hexNut.position.x = nx;
      valveBodyGroup.add(hexNut);
    }

    const valveBonnet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.013, 0.026, 18),
      brassMat
    );
    valveBonnet.position.y = 0.016;
    valveBodyGroup.add(valveBonnet);

    const valveStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 16),
      chromeMat
    );
    valveStem.position.y = 0.032;
    valveBodyGroup.add(valveStem);

    this.coldValveHandleGroup.name = 'ColdValveHandle';
    this.coldValveHandleGroup.position.set(0, 0.044, 0);
    this.buildKnurledValveWheel(this.coldValveHandleGroup, 0x0284c7, brassMat, chromeMat);

    this.coldValveHighlightRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.0022, 12, 32),
      labGlow(0x38bdf8, 1.1)
    );
    this.coldValveHighlightRing.rotation.x = Math.PI / 2;
    this.coldValveHighlightRing.visible = false;
    this.coldValveHandleGroup.add(this.coldValveHighlightRing);

    const hitCollider = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 12, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitCollider.name = 'ColdValveCollider';
    this.coldValveHandleGroup.add(hitCollider);

    valveBodyGroup.add(this.coldValveHandleGroup);
    coldGroup.add(valveBodyGroup);

    this.group.add(coldGroup);
  }

  /**
   * 构建带微米级防滑滚花凸耳与六辐条的精密阀门手轮
   */
  private buildKnurledValveWheel(
    targetGroup: THREE.Group,
    wheelHex: number,
    brassMat: THREE.Material,
    chromeMat: THREE.Material
  ): void {
    const wheelMat = new THREE.MeshStandardMaterial({
      color: wheelHex,
      metalness: 0.68,
      roughness: 0.24,
    });

    // 外圈圆环
    const rimMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.0048, 16, 32),
      wheelMat
    );
    rimMesh.rotation.x = Math.PI / 2;
    targetGroup.add(rimMesh);

    // 外周 12 颗防滑滚花凸棱
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const lobe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0036, 0.0036, 0.009, 10),
        wheelMat
      );
      lobe.position.set(Math.cos(a) * 0.029, 0, Math.sin(a) * 0.029);
      targetGroup.add(lobe);
    }

    // 6 根辐条
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0024, 0.0024, 0.050, 10),
        chromeMat
      );
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (i * Math.PI) / 3;
      targetGroup.add(spoke);
    }

    // 中心黄铜锁紧螺帽
    const centerCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.008, 0.010, 18),
      brassMat
    );
    targetGroup.add(centerCap);
  }

  // ============================================================================
  // 4. 中央：透明工作气缸、精密双密封环活塞与顶部指针式压力表 (0 ~ 0.4 MPa)
  // ============================================================================
  private buildWorkingCylinderAndGaugeAssembly(): void {
    const cylGroup = new THREE.Group();
    cylGroup.name = 'WorkingCylinderAssembly';

    const satinSilver = anodizedAluminum(0xe2e8f0, 0.22);
    const chromeMat = labMetal(0xffffff, 0.96, 0.07);
    const brassMat = polishedGold(0xf59e0b);
    const titaniumSealMat = anodizedAluminum(0x334155, 0.32);
    const glassMat = labGlass(0.20);

    const cylCenterX = -0.085;
    const cylLength = 0.285;
    const cylRadius = 0.064;
    const leftHeadX = cylCenterX - cylLength * 0.5; // -0.2275
    const rightHeadX = cylCenterX + cylLength * 0.5; // +0.0575

    // 左右两座重型 CNC 铝合金法兰支撑立柱
    for (const bracketX of [leftHeadX, rightHeadX]) {
      // 底部宽脚座
      const footGeo = createChamferedBoxGeometry(0.044, 0.016, 0.145, 0.006, 0.0015);
      const footMesh = new THREE.Mesh(footGeo, satinSilver);
      footMesh.position.set(bracketX, 0.084, this.cylinderAxisZ);
      cylGroup.add(footMesh);

      // 4 颗底座安装螺栓
      for (const bz of [-0.052, 0.052]) {
        const bolt = new THREE.Mesh(createHexNutGeometry(0.0055, 0.005), chromeMat);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(bracketX, 0.102, this.cylinderAxisZ + bz);
        cylGroup.add(bolt);
      }

      // 垂直立柱腹板
      const pillarGeo = createChamferedBoxGeometry(0.026, 0.145, 0.096, 0.005, 0.0015);
      const pillarMesh = new THREE.Mesh(pillarGeo, satinSilver);
      pillarMesh.position.set(bracketX, 0.098, this.cylinderAxisZ);
      cylGroup.add(pillarMesh);

      // 气缸端盖圆形法兰盘
      const headFlange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.076, 0.076, 0.020, 36),
        satinSilver
      );
      headFlange.rotation.z = Math.PI / 2;
      headFlange.position.set(bracketX, this.cylinderAxisY, this.cylinderAxisZ);
      headFlange.castShadow = true;
      cylGroup.add(headFlange);
    }

    // 4 根外置水平镜面铬合金拉杆与端盖六角螺母
    const tieAngles = [Math.PI * 0.22, Math.PI * 0.78, -Math.PI * 0.22, -Math.PI * 0.78];
    for (const a of tieAngles) {
      const ty = this.cylinderAxisY + Math.sin(a) * 0.069;
      const tz = this.cylinderAxisZ + Math.cos(a) * 0.069;

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0032, 0.0032, cylLength + 0.036, 12),
        chromeMat
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(cylCenterX, ty, tz);
      cylGroup.add(rod);

      for (const nx of [leftHeadX - 0.013, rightHeadX + 0.013]) {
        const nut = new THREE.Mesh(createHexNutGeometry(0.0065, 0.006), chromeMat);
        nut.rotation.y = Math.PI / 2;
        nut.position.set(nx, ty, tz);
        cylGroup.add(nut);
      }
    }

    // 右端盖活塞杆黄铜密封填料函 (Brass Gland Seal)
    const glandSeal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.020, 0.022, 0.018, 24),
      brassMat
    );
    glandSeal.rotation.z = Math.PI / 2;
    glandSeal.position.set(rightHeadX + 0.015, this.cylinderAxisY, this.cylinderAxisZ);
    cylGroup.add(glandSeal);

    // 水平高透光学玻璃气缸筒体
    const glassBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(cylRadius, cylRadius, cylLength - 0.016, 40, 1, true),
      glassMat
    );
    glassBarrel.rotation.z = Math.PI / 2;
    glassBarrel.position.set(cylCenterX, this.cylinderAxisY, this.cylinderAxisZ);
    cylGroup.add(glassBarrel);

    // -------------------------------------------------------------------------
    // 活塞与活塞杆组件 (Piston & Piston Rod Group)
    // -------------------------------------------------------------------------
    this.pistonGroup.name = 'CarnotPistonGroup';
    this.pistonGroup.position.set(0.01, this.cylinderAxisY, this.cylinderAxisZ);

    // 活塞主体（相对于手腕销原点 X = 0，活塞头中心位于 X = -0.130，左端面位于 X = -0.148）
    const pistonHeadX = -0.130;
    const pistonBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.059, 0.059, 0.036, 36),
      satinSilver
    );
    pistonBody.rotation.z = Math.PI / 2;
    pistonBody.position.x = pistonHeadX;
    this.pistonGroup.add(pistonBody);

    // 双道精密金属气密活塞环 (Dual Compression Piston Rings)
    for (const rx of [pistonHeadX - 0.009, pistonHeadX + 0.009]) {
      const sealRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0608, 0.0608, 0.0045, 36),
        titaniumSealMat
      );
      sealRing.rotation.z = Math.PI / 2;
      sealRing.position.x = rx;
      this.pistonGroup.add(sealRing);
    }

    // 活塞顶面耐热香槟金缓冲垫片
    const crownCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.058, 0.003, 32),
      brassMat
    );
    crownCap.rotation.z = Math.PI / 2;
    crownCap.position.x = pistonHeadX - 0.0185;
    this.pistonGroup.add(crownCap);

    // 镜面抛光液态铬活塞连杆轴 (从活塞背面 X = -0.112 延伸至手腕销 X = 0)
    const pistonRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0095, 0.0095, 0.118, 24),
      chromeMat
    );
    pistonRod.rotation.z = Math.PI / 2;
    pistonRod.position.x = -0.056;
    this.pistonGroup.add(pistonRod);

    // 右端十字头 U 型叉头关节 (Clevis Fork Joint at X = 0)
    const clevisBase = new THREE.Mesh(
      createChamferedBoxGeometry(0.022, 0.028, 0.028, 0.004, 0.001),
      satinSilver
    );
    clevisBase.position.set(-0.008, -0.014, 0);
    this.pistonGroup.add(clevisBase);

    // 手腕销 (Wrist Pin along Z axis at X = 0)
    const wristPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, 0.034, 20),
      brassMat
    );
    wristPin.rotation.x = Math.PI / 2;
    this.pistonGroup.add(wristPin);

    cylGroup.add(this.pistonGroup);

    // -------------------------------------------------------------------------
    // 顶部机械指针式压力表 (Analog Pressure Gauge 0 ~ 0.4 MPa)
    // -------------------------------------------------------------------------
    const gaugeGroup = new THREE.Group();
    gaugeGroup.name = 'TopPressureGaugeAssembly';
    gaugeGroup.position.set(cylCenterX, this.cylinderAxisY + 0.145, this.cylinderAxisZ);

    // 底部与气缸连通的黄铜测压支管与六角接头
    const stemTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.068, 20),
      brassMat
    );
    stemTube.position.y = -0.068;
    gaugeGroup.add(stemTube);

    for (const ny of [-0.088, -0.048]) {
      const hex = new THREE.Mesh(createHexNutGeometry(0.015, 0.009), brassMat);
      hex.rotation.x = Math.PI / 2;
      hex.position.y = ny;
      gaugeGroup.add(hex);
    }

    // 表盘圆形拉丝银铝外框与液态铬内圈
    const gaugeRadius = 0.064;
    const gaugeCase = new THREE.Mesh(
      new THREE.CylinderGeometry(gaugeRadius, gaugeRadius, 0.026, 44),
      satinSilver
    );
    gaugeCase.rotation.x = Math.PI / 2;
    gaugeCase.castShadow = true;
    gaugeGroup.add(gaugeCase);

    const gaugeBezelRing = new THREE.Mesh(
      new THREE.TorusGeometry(gaugeRadius - 0.002, 0.0045, 16, 48),
      chromeMat
    );
    gaugeBezelRing.position.z = 0.013;
    gaugeGroup.add(gaugeBezelRing);

    // 激光蚀刻高对比度压力表刻度盘纹理 (0 ~ 0.4 MPa，还原参考图纸白底银圈表盘)
    const dialTex = this.createPressureGaugeDialTexture();
    const dialFace = new THREE.Mesh(
      new THREE.CircleGeometry(gaugeRadius - 0.005, 44),
      new THREE.MeshBasicMaterial({ map: dialTex, toneMapped: false })
    );
    dialFace.position.z = 0.0135;
    gaugeGroup.add(dialFace);

    // 3D 实体红色指针与黄铜中心轴帽
    this.pressureNeedleGroup.position.set(0, 0, 0.0155);
    const needleShape = new THREE.Shape();
    needleShape.moveTo(-0.0028, -0.012);
    needleShape.lineTo(0.0028, -0.012);
    needleShape.lineTo(0.0008, 0.046);
    needleShape.lineTo(-0.0008, 0.046);
    needleShape.closePath();

    const needleMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(needleShape),
      new THREE.MeshBasicMaterial({ color: 0xdc2626 })
    );
    this.pressureNeedleGroup.add(needleMesh);

    const needleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.004, 20),
      brassMat
    );
    needleCap.rotation.x = Math.PI / 2;
    this.pressureNeedleGroup.add(needleCap);
    gaugeGroup.add(this.pressureNeedleGroup);

    // 表蒙光学玻璃罩
    const gaugeGlass = new THREE.Mesh(
      new THREE.CircleGeometry(gaugeRadius - 0.004, 36),
      labGlass(0.14)
    );
    gaugeGlass.position.z = 0.0175;
    gaugeGroup.add(gaugeGlass);

    cylGroup.add(gaugeGroup);
    this.group.add(cylGroup);
  }

  /**
   * 绘制 0 ~ 0.4 MPa 高精度激光刻度压力表盘
   */
  private createPressureGaugeDialTexture(): THREE.CanvasTexture {
    return paintTexture(512, 512, (ctx, w, h) => {
      const c = ctx as unknown as CanvasRenderingContext2D;
      const cx = w / 2;
      const cy = h / 2;

      // 银白拉丝表盘背景
      c.fillStyle = '#f8fafc';
      c.fillRect(0, 0, w, h);

      // 内阴影圈
      c.beginPath();
      c.arc(cx, cy, 236, 0, Math.PI * 2);
      c.strokeStyle = '#cbd5e1';
      c.lineWidth = 8;
      c.stroke();

      // 刻度弧线 (从左下 -135° 到右下 +135°，共 270° 扇区，对应 0 ~ 0.4 MPa)
      const startDeg = -225; // Canvas 角度：正右为 0°，正上为 -90°，左下为 -225°，右下为 +45°
      const sweepDeg = 270;
      const totalTicks = 40; // 每小格 0.01 MPa

      for (let i = 0; i <= totalTicks; i++) {
        const frac = i / totalTicks;
        const deg = startDeg + frac * sweepDeg;
        const rad = (deg * Math.PI) / 180;
        const isMajor = i % 10 === 0;
        const isMid = i % 5 === 0 && !isMajor;

        const rOuter = 212;
        const rInner = isMajor ? 174 : isMid ? 186 : 196;

        c.beginPath();
        c.moveTo(cx + Math.cos(rad) * rInner, cy + Math.sin(rad) * rInner);
        c.lineTo(cx + Math.cos(rad) * rOuter, cy + Math.sin(rad) * rOuter);
        c.strokeStyle = i >= 32 ? '#dc2626' : '#0f172a';
        c.lineWidth = isMajor ? 5.5 : isMid ? 3.5 : 2.0;
        c.stroke();

        if (isMajor) {
          const val = (i / 100).toFixed(i === 0 ? 0 : 1);
          const rText = 138;
          c.fillStyle = '#0f172a';
          c.font = '700 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(val, cx + Math.cos(rad) * rText, cy + Math.sin(rad) * rText);
        }
      }

      // 单位与压力表标识
      c.fillStyle = '#334155';
      c.font = '700 30px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      c.textAlign = 'center';
      c.fillText('MPa', cx, cy + 92);

      c.fillStyle = '#64748b';
      c.font = '600 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      c.fillText('PRESSURE GAUGE', cx, cy - 52);
    });
  }

  // ============================================================================
  // 5. 中右：曲柄连杆机构与辐条式飞轮 (Crank-Connecting Rod & Flywheel)
  // ============================================================================
  private buildCrankFlywheelMechanism(): void {
    const mechGroup = new THREE.Group();
    mechGroup.name = 'CrankFlywheelAssembly';

    const satinSilver = anodizedAluminum(0xe2e8f0, 0.22);
    const chromeMat = labMetal(0xffffff, 0.96, 0.08);
    const brassMat = polishedGold(0xf59e0b);

    // 飞轮重型轴承座底座 (Bearing Pedestal Block)
    const pedestalBaseGeo = createChamferedBoxGeometry(0.145, 0.022, 0.135, 0.008, 0.002);
    const pedestalBase = new THREE.Mesh(pedestalBaseGeo, satinSilver);
    pedestalBase.position.set(this.flywheelCenterX, 0.084, this.cylinderAxisZ - 0.015);
    pedestalBase.castShadow = true;
    mechGroup.add(pedestalBase);

    // 后侧双立柱主轴承座
    const pillarZ = this.cylinderAxisZ - 0.036;
    const bearingPillarGeo = createChamferedBoxGeometry(0.072, 0.142, 0.034, 0.008, 0.002);
    const bearingPillar = new THREE.Mesh(bearingPillarGeo, satinSilver);
    bearingPillar.position.set(this.flywheelCenterX, 0.104, pillarZ);
    bearingPillar.castShadow = true;
    mechGroup.add(bearingPillar);

    // 主轴黄铜轴承套与铬合金主轴
    const mainBearingHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.044, 28),
      brassMat
    );
    mainBearingHousing.rotation.x = Math.PI / 2;
    mainBearingHousing.position.set(this.flywheelCenterX, this.cylinderAxisY, pillarZ + 0.006);
    mechGroup.add(mainBearingHousing);

    const mainShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.068, 24),
      chromeMat
    );
    mainShaft.rotation.x = Math.PI / 2;
    mainShaft.position.set(this.flywheelCenterX, this.cylinderAxisY, this.cylinderAxisZ - 0.018);
    mechGroup.add(mainShaft);

    // -------------------------------------------------------------------------
    // 5 辐条镂空精密飞轮 (Spoked Flywheel Group)
    // -------------------------------------------------------------------------
    this.flywheelGroup.name = 'CarnotFlywheelGroup';
    this.flywheelGroup.position.set(
      this.flywheelCenterX,
      this.cylinderAxisY,
      this.cylinderAxisZ - 0.012
    );

    const flywheelGeo = createSpokedFlywheelGeometry(0.092, 0.072, 0.024, 0.022, 5);
    const flywheelMesh = new THREE.Mesh(flywheelGeo, satinSilver);
    flywheelMesh.castShadow = true;
    this.flywheelGroup.add(flywheelMesh);

    // 飞轮外缘镜面抛光金属圈
    const outerRimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.091, 0.0035, 14, 48),
      chromeMat
    );
    outerRimRing.position.z = 0.009;
    this.flywheelGroup.add(outerRimRing);

    // 飞轮中心黄铜锁紧法兰盘
    const hubCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.020, 0.022, 0.028, 28),
      brassMat
    );
    hubCap.rotation.x = Math.PI / 2;
    hubCap.position.z = 0.004;
    this.flywheelGroup.add(hubCap);

    // 偏心曲柄销 (Eccentric Crank Pin at local (-crankRadius, 0) so θ = 0 corresponds to TDC leftmost position!)
    const crankPinBoss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.026, 20),
      brassMat
    );
    crankPinBoss.rotation.x = Math.PI / 2;
    crankPinBoss.position.set(-this.crankRadius, 0, 0.012);
    this.flywheelGroup.add(crankPinBoss);

    const crankPinJournal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, 0.022, 20),
      chromeMat
    );
    crankPinJournal.rotation.x = Math.PI / 2;
    crankPinJournal.position.set(-this.crankRadius, 0, 0.020);
    this.flywheelGroup.add(crankPinJournal);

    mechGroup.add(this.flywheelGroup);

    // -------------------------------------------------------------------------
    // 工字梁截面刚性连杆 (Articulated Connecting Rod Group)
    // 原点在左端活塞手腕销 (0, 0, 0)，右端孔在 (+connectingRodLength, 0, 0)
    // -------------------------------------------------------------------------
    this.connectingRodGroup.name = 'CarnotConnectingRodGroup';
    this.connectingRodGroup.position.set(
      this.flywheelCenterX - this.crankRadius - this.connectingRodLength,
      this.cylinderAxisY,
      this.cylinderAxisZ + 0.004
    );

    const rodL = this.connectingRodLength; // 0.150 m
    const rodBeamGeo = createFrontFacingRoundedBox(rodL, 0.018, 0.010, 0.006, 0.0015);
    const rodBeam = new THREE.Mesh(rodBeamGeo, satinSilver);
    rodBeam.position.set(rodL * 0.5, 0, 0);
    rodBeam.castShadow = true;
    this.connectingRodGroup.add(rodBeam);

    // 连杆中部减重凹槽筋条
    const recessPocket = new THREE.Mesh(
      createFrontFacingRoundedBox(rodL * 0.66, 0.007, 0.0115, 0.002, 0.0005),
      anodizedAluminum(0x94a3b8, 0.32)
    );
    recessPocket.position.set(rodL * 0.5, 0, 0);
    this.connectingRodGroup.add(recessPocket);

    // 连杆两端轴承环与黄铜轴套
    for (const endX of [0, rodL]) {
      const eyeRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.012, 24),
        satinSilver
      );
      eyeRing.rotation.x = Math.PI / 2;
      eyeRing.position.set(endX, 0, 0);
      this.connectingRodGroup.add(eyeRing);

      const bushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 20),
        brassMat
      );
      bushing.rotation.x = Math.PI / 2;
      bushing.position.set(endX, 0, 0);
      this.connectingRodGroup.add(bushing);
    }

    mechGroup.add(this.connectingRodGroup);
    this.group.add(mechGroup);
  }

  // ============================================================================
  // 6. 冷热源导热循环管道与动态热流脉冲 (Heat-Exchange Piping & Pulses)
  // ============================================================================
  private buildHeatExchangePiping(): void {
    const pipeGroup = new THREE.Group();
    pipeGroup.name = 'HeatExchangePipingGroup';

    const brassMat = polishedGold(0xf59e0b);
    const zPipe = this.cylinderAxisZ;

    // 1. 高温上管 (连接高温阀门右侧 X = -0.315, Y = 0.350 -> 气缸左端盖上部 X = -0.232, Y = 0.275)
    const hotUpperCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.315, 0.350, zPipe),
      new THREE.Vector3(-0.278, 0.350, zPipe),
      new THREE.Vector3(-0.268, 0.335, zPipe),
      new THREE.Vector3(-0.268, 0.290, zPipe),
      new THREE.Vector3(-0.256, 0.275, zPipe),
      new THREE.Vector3(-0.230, 0.275, zPipe),
    ]);
    this.hotPipeUpperMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.35,
      metalness: 0.55,
      roughness: 0.25,
    });
    const hotUpperTube = new THREE.Mesh(
      new THREE.TubeGeometry(hotUpperCurve, 48, 0.0082, 14, false),
      this.hotPipeUpperMat
    );
    pipeGroup.add(hotUpperTube);

    // 2. 高温下回流管 (连接高温热源下部 X = -0.375, Y = 0.205 -> 气缸左端盖下部 X = -0.230, Y = 0.205)
    const hotLowerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.375, 0.205, zPipe),
      new THREE.Vector3(-0.300, 0.205, zPipe),
      new THREE.Vector3(-0.230, 0.205, zPipe),
    ]);
    this.hotPipeLowerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.25,
      metalness: 0.55,
      roughness: 0.25,
    });
    const hotLowerTube = new THREE.Mesh(
      new THREE.TubeGeometry(hotLowerCurve, 24, 0.0082, 14, false),
      this.hotPipeLowerMat
    );
    pipeGroup.add(hotLowerTube);

    // 高温管道黄铜六角锁紧接头
    for (const [fx, fy] of [
      [-0.234, 0.275],
      [-0.234, 0.205],
      [-0.372, 0.205],
    ]) {
      const fitting = new THREE.Mesh(createHexNutGeometry(0.013, 0.010), brassMat);
      fitting.rotation.y = Math.PI / 2;
      fitting.position.set(fx, fy, zPipe);
      pipeGroup.add(fitting);
    }

    // 3. 低温放热管道 (连接气缸右端盖上部 X = -0.028, Y = 0.275 -> 低温冷源阀门左侧 X = +0.325, Y = 0.350)
    const coldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.025, 0.275, zPipe),
      new THREE.Vector3(0.115, 0.275, zPipe),
      new THREE.Vector3(0.135, 0.290, zPipe),
      new THREE.Vector3(0.145, 0.335, zPipe),
      new THREE.Vector3(0.165, 0.350, zPipe),
      new THREE.Vector3(0.325, 0.350, zPipe),
    ]);
    this.coldPipeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.30,
      metalness: 0.55,
      roughness: 0.25,
    });
    const coldTube = new THREE.Mesh(
      new THREE.TubeGeometry(coldCurve, 56, 0.0082, 14, false),
      this.coldPipeMat
    );
    pipeGroup.add(coldTube);

    const coldFitting = new THREE.Mesh(createHexNutGeometry(0.013, 0.010), brassMat);
    coldFitting.rotation.y = Math.PI / 2;
    coldFitting.position.set(-0.020, 0.275, zPipe);
    pipeGroup.add(coldFitting);

    // 4. 管道热流动态光脉冲球（阶段 1 红管吸热流动，阶段 3 蓝管放热流动）
    const pulseGeo = new THREE.SphereGeometry(0.0105, 12, 12);
    const hotPulseMat = labGlow(0xff6b35, 1.4);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(pulseGeo, hotPulseMat);
      m.userData = { curve: hotUpperCurve, offset: i / 4 };
      pipeGroup.add(m);
      this.hotPulseMeshes.push(m);
    }

    const coldPulseMat = labGlow(0x38bdf8, 1.4);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(pulseGeo, coldPulseMat);
      m.userData = { curve: coldCurve, offset: i / 5 };
      pipeGroup.add(m);
      this.coldPulseMeshes.push(m);
    }

    this.group.add(pipeGroup);
  }

  // ============================================================================
  // 7. 气缸内三维理想气体分子粒子系统 (3D Working Gas Molecular Particles)
  // ============================================================================
  private initGasParticleSystem(): void {
    const sphereGeo = new THREE.SphereGeometry(0.0046, 10, 10);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.gasParticlesInstanced = new THREE.InstancedMesh(
      sphereGeo,
      sphereMat,
      this.particleCount
    );
    this.gasParticlesInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gasParticlesInstanced.name = 'WorkingGasParticles';

    // 使用确定性伪随机分布初始化气体分子位置与速度
    for (let i = 0; i < this.particleCount; i++) {
      const seed1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
      const seed2 = Math.sin(i * 78.233 + 4.56) * 43758.5453;
      const seed3 = Math.sin(i * 39.346 + 7.89) * 43758.5453;
      const f1 = seed1 - Math.floor(seed1);
      const f2 = seed2 - Math.floor(seed2);
      const f3 = seed3 - Math.floor(seed3);

      this.gasParticleStates.push({
        u: 0.08 + f1 * 0.84,
        r: Math.sqrt(f2) * 0.048,
        phi: f3 * Math.PI * 2,
        vu: (f2 - 0.5) * 1.4,
        vr: (f3 - 0.5) * 0.06,
        vphi: (f1 - 0.5) * 4.5,
        phase: f1 * Math.PI * 2,
      });

      this.gasParticlesInstanced.setColorAt(i, new THREE.Color(0xfbbf24));
    }

    if (this.gasParticlesInstanced.instanceColor) {
      this.gasParticlesInstanced.instanceColor.needsUpdate = true;
    }

    this.group.add(this.gasParticlesInstanced);
  }

  // ============================================================================
  // 8. 交互高亮与手轮状态控制
  // ============================================================================
  public setHoveredValve(target: 'hot' | 'cold' | null): void {
    if (this.hotValveHighlightRing) {
      this.hotValveHighlightRing.visible = target === 'hot';
    }
    if (this.coldValveHighlightRing) {
      this.coldValveHighlightRing.visible = target === 'cold';
    }
  }

  public rotateValveVisual(target: 'hot' | 'cold', deltaRad: number): void {
    if (target === 'hot') {
      this.hotValveAngle += deltaRad;
      this.hotValveHandleGroup.rotation.y = this.hotValveAngle;
    } else {
      this.coldValveAngle += deltaRad;
      this.coldValveHandleGroup.rotation.y = this.coldValveAngle;
    }
  }

  // ============================================================================
  // 9. 主循环实时同步更新 (机械连杆机构、压力表、气体分子、表头与 P-V 面板)
  // ============================================================================
  public update(
    delta: number,
    telemetry: CarnotTelemetry,
    pvCurves: CarnotPVCurveSamples
  ): void {
    this.animClock += Math.min(delta, 0.1);

    // 1. 曲柄飞轮旋转与连杆-活塞精确刚体运动学
    // 当 crankAngle = 0 时，曲柄销位于最左侧 (-r, 0)，活塞处于左止点 (V = V1)
    const theta = telemetry.crankAngleRad;
    this.flywheelGroup.rotation.z = -theta;

    // 曲柄销在世界/基准平面中的坐标 (相对于飞轮中心)
    const pinOffsetX = -this.crankRadius * Math.cos(theta);
    const pinOffsetY = this.crankRadius * Math.sin(theta);
    const crankPinX = this.flywheelCenterX + pinOffsetX;

    // 刚体连杆几何约束：wristPinY = cylinderAxisY，故连杆右端高度差为 pinOffsetY
    const rodHorizontalSpan = Math.sqrt(
      Math.max(1e-5, this.connectingRodLength * this.connectingRodLength - pinOffsetY * pinOffsetY)
    );
    const wristPinX = crankPinX - rodHorizontalSpan;

    // 更新活塞与活塞杆位置
    this.pistonGroup.position.x = wristPinX;

    // 更新刚性连杆位姿（左端锁定在 wristPinX，右端精确指向飞轮曲柄销）
    this.connectingRodGroup.position.x = wristPinX;
    this.connectingRodGroup.position.y = this.cylinderAxisY;
    const rodPitchAngle = Math.atan2(pinOffsetY, rodHorizontalSpan);
    this.connectingRodGroup.rotation.z = rodPitchAngle;

    // 2. 更新顶部指针式压力表 (0 ~ 0.4 MPa -> +135° 到 -135°)
    const pClamped = Math.max(0, Math.min(0.4, telemetry.pressureMPa));
    const pFrac = pClamped / 0.4;
    // 在 Three.js XY 平面中，指针初始朝 +Y (0 rad)，0 MPa 在左下 (+135° = +0.75π)，0.4 MPa 在右下 (-135° = -0.75π)
    const needleAngleZ = (0.75 - pFrac * 1.5) * Math.PI;
    this.pressureNeedleGroup.rotation.z = needleAngleZ;

    // 3. 更新高温火焰与冷热盘管光效
    const hotFactor = (telemetry.hotTempC - 50) / 100; // 0 ~ 1
    const flamePulse = 1 + 0.08 * Math.sin(this.animClock * 18) + 0.05 * Math.cos(this.animClock * 29);
    const flameHeightScale = (0.78 + 0.45 * hotFactor) * flamePulse;
    this.flameOuterMesh.scale.set(1 + 0.12 * hotFactor, flameHeightScale, 1 + 0.12 * hotFactor);
    this.flameInnerMesh.scale.set(1 + 0.08 * hotFactor, flameHeightScale * 0.96, 1 + 0.08 * hotFactor);
    this.flameCoreMesh.scale.set(1, flameHeightScale * 0.92, 1);

    this.hotCoilMat.emissiveIntensity = 0.45 + 0.55 * hotFactor + 0.35 * telemetry.hotPipeFlowIntensity;
    const coldFactor = 1 - telemetry.coldTempC / 40; // 温度越低冰蓝感越强
    this.coldCoilMat.emissiveIntensity = 0.35 + 0.45 * coldFactor + 0.35 * telemetry.coldPipeFlowIntensity;

    // 4. 更新导热管道发光脉冲（① 等温膨胀吸热，③ 等温压缩放热，②④ 绝热断流）
    this.hotPipeUpperMat.emissiveIntensity = 0.18 + 0.72 * telemetry.hotPipeFlowIntensity;
    this.hotPipeLowerMat.emissiveIntensity = 0.15 + 0.50 * telemetry.hotPipeFlowIntensity;
    this.coldPipeMat.emissiveIntensity = 0.16 + 0.75 * telemetry.coldPipeFlowIntensity;

    for (const mesh of this.hotPulseMeshes) {
      if (telemetry.hotPipeFlowIntensity > 0.02) {
        mesh.visible = true;
        const curve = mesh.userData.curve as THREE.CatmullRomCurve3;
        const u = (mesh.userData.offset + this.animClock * 1.35) % 1;
        curve.getPointAt(u, mesh.position);
        const s = 0.75 + 0.45 * telemetry.hotPipeFlowIntensity;
        mesh.scale.setScalar(s);
      } else {
        mesh.visible = false;
      }
    }

    for (const mesh of this.coldPulseMeshes) {
      if (telemetry.coldPipeFlowIntensity > 0.02) {
        mesh.visible = true;
        const curve = mesh.userData.curve as THREE.CatmullRomCurve3;
        const u = (mesh.userData.offset + this.animClock * 1.35) % 1;
        curve.getPointAt(u, mesh.position);
        const s = 0.75 + 0.45 * telemetry.coldPipeFlowIntensity;
        mesh.scale.setScalar(s);
      } else {
        mesh.visible = false;
      }
    }

    // 5. 更新气缸内三维气体分子的热运动与冷暖色彩过渡
    this.updateGasParticles(delta, wristPinX, telemetry);

    // 6. 更新冷热源顶部数显表头
    this.renderReservoirReadouts(telemetry);
  }

  /**
   * 推进气缸腔体内三维理想气体分子热运动（颜色随温度 T 平滑冷暖渐变，范围严格约束在活塞左端面内）
   */
  private updateGasParticles(
    delta: number,
    wristPinX: number,
    telemetry: CarnotTelemetry
  ): void {
    const dt = Math.min(delta, 0.05);
    const pistonCrownX = wristPinX + this.wristPinToPistonCrownOffset - 0.018;
    const chamberLeftX = this.cylinderInnerLeftX + 0.012;
    const chamberLen = Math.max(0.045, pistonCrownX - chamberLeftX);

    // 归一化气体温度因子 [0 (冷源 Tc) -> 1 (热源 Th)]
    const tempSpan = Math.max(10, telemetry.hotTempK - telemetry.coldTempK);
    const tempNorm = Math.max(
      0,
      Math.min(1, (telemetry.gasTempK - telemetry.coldTempK) / tempSpan)
    );

    // 分子热运动速率正比于 sqrt(T)
    const speedScale = 0.75 + 0.85 * tempNorm;

    // 颜色插值：低温冰晶蓝 (0x38bdf8) -> 中温琥珀金 (0xfbbf24) -> 高温炽热橙红 (0xf97316)
    if (tempNorm < 0.5) {
      this.tempColor.setHex(0x38bdf8).lerp(new THREE.Color(0xfbbf24), tempNorm * 2);
    } else {
      this.tempColor.setHex(0xfbbf24).lerp(new THREE.Color(0xff5a1f), (tempNorm - 0.5) * 2);
    }

    for (let i = 0; i < this.particleCount; i++) {
      const st = this.gasParticleStates[i];
      st.u += st.vu * speedScale * dt;
      if (st.u < 0.06) {
        st.u = 0.06;
        st.vu = Math.abs(st.vu);
      } else if (st.u > 0.94) {
        st.u = 0.94;
        st.vu = -Math.abs(st.vu);
      }

      st.r += st.vr * speedScale * dt;
      if (st.r < 0.004) {
        st.r = 0.004;
        st.vr = Math.abs(st.vr);
      } else if (st.r > 0.048) {
        st.r = 0.048;
        st.vr = -Math.abs(st.vr);
      }

      st.phi += st.vphi * speedScale * dt;

      const px = chamberLeftX + st.u * chamberLen;
      const py = this.cylinderAxisY + Math.sin(st.phi) * st.r;
      const pz = this.cylinderAxisZ + Math.cos(st.phi) * st.r;

      this.dummyPos.set(px, py, pz);
      const pulse = 0.9 + 0.2 * Math.sin(this.animClock * 6 + st.phase);
      this.dummyScale.setScalar(pulse);
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.gasParticlesInstanced.setMatrixAt(i, this.dummyMatrix);
      this.gasParticlesInstanced.setColorAt(i, this.tempColor);
    }

    this.gasParticlesInstanced.instanceMatrix.needsUpdate = true;
    if (this.gasParticlesInstanced.instanceColor) {
      this.gasParticlesInstanced.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 渲染左右冷热源顶部数字温度表头 (80.0 °C / 20.0 °C)
   */
  private renderReservoirReadouts(telemetry: CarnotTelemetry): void {
    const hotKey = telemetry.hotTempC.toFixed(1);
    if (hotKey !== this.lastHotReadoutKey) {
      this.lastHotReadoutKey = hotKey;
      const ctx = this.hotReadoutCanvas.getContext('2d');
      if (ctx && typeof ctx.fillRect === 'function') {
        const w = this.hotReadoutCanvas.width;
        const h = this.hotReadoutCanvas.height;
        ctx.fillStyle = '#08101e';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);

        ctx.fillStyle = '#fca5a5';
        ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('高温热源 Th', w / 2, 30);

        ctx.fillStyle = '#ff5a36';
        ctx.font = '700 48px "SF Mono", Menlo, monospace';
        ctx.fillText(`${hotKey} °C`, w / 2, 84);
        this.hotReadoutTexture.needsUpdate = true;
      }
    }

    const coldKey = telemetry.coldTempC.toFixed(1);
    if (coldKey !== this.lastColdReadoutKey) {
      this.lastColdReadoutKey = coldKey;
      const ctx = this.coldReadoutCanvas.getContext('2d');
      if (ctx && typeof ctx.fillRect === 'function') {
        const w = this.coldReadoutCanvas.width;
        const h = this.coldReadoutCanvas.height;
        ctx.fillStyle = '#08101e';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);

        ctx.fillStyle = '#bae6fd';
        ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('低温冷源 Tc', w / 2, 30);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 48px "SF Mono", Menlo, monospace';
        ctx.fillText(`${coldKey} °C`, w / 2, 84);
        this.coldReadoutTexture.needsUpdate = true;
      }
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
    this.hotReadoutTexture?.dispose();
    this.coldReadoutTexture?.dispose();
  }
}
