import * as THREE from 'three';
import {
  anodizedAluminum,
  labGlass,
  labMetal,
  polishedGold,
} from '../em/labKit.ts';
import { disposeObjectTree } from '../em/disposeObject.ts';
import type { FireSyringeTelemetry } from '../../physics/thermo/fireSyringeSolver.ts';

/**
 * 创建带真实机械圆角与倒角的水平底座几何体
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
 * 创建工业六角螺母几何体（带机械倒角）
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
  const bevel = Math.min(height * 0.22, flatRadius * 0.16);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: Math.max(0.0005, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  geo.center();
  return geo;
}

/**
 * 创建有机水滴形火焰剖面旋转几何体
 */
function createFlameTeardropGeometry(radius: number, height: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 (bottom) -> 1 (tip)
    const y = t * height;
    // 下部饱满浑圆，上部渐收成纤细火苗尖端
    const profile = Math.sin(t * Math.PI) * Math.pow(1 - t, 0.55) * 1.45;
    const r = Math.max(0.0001, radius * profile);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 24);
}

interface AirMoleculeState {
  relX: number; // 归一化径向位置 (-1 ~ 1)
  relY: number; // 归一化高度位置 (0 ~ 1, 在燃烧室顶面与活塞底面之间)
  relZ: number; // 归一化径向位置 (-1 ~ 1)
  vx: number;
  vy: number;
  vz: number;
  phase: number;
}

interface SmokePuffState {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  y: number;
  z: number;
  vy: number;
  age: number;
  life: number;
  baseScale: number;
}

interface SparkParticleState {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

/**
 * 空气压缩引火仪 (Fire Syringe) 高精度 3D 物理实验装置与全阶段动效总成
 */
export class FireSyringeBenchMesh {
  public readonly group = new THREE.Group();

  // 可交互部件引用
  public readonly pistonAssemblyGroup = new THREE.Group();
  public readonly handleGroup = new THREE.Group();
  public readonly combustionChamberGroup = new THREE.Group();
  public readonly tinderGroup = new THREE.Group();

  // 活塞行程几何常数 (局部 Y 坐标，单位 m)
  public static readonly PISTON_TOP_Y = 0.236; // stroke = 0 时活塞底面高度
  public static readonly PISTON_BOTTOM_Y = 0.106; // stroke = 1 时活塞底面高度 (贴近燃烧室上沿)
  public static readonly CHAMBER_FLOOR_Y = 0.060; // 燃烧室内部火绒托盘底面高度
  public static readonly GLASS_INNER_RADIUS = 0.0225;

  // 动态材质与部件引用
  private handleHoverHalo!: THREE.Mesh;
  private handleHoverMat!: THREE.MeshBasicMaterial;
  private oRingTopMesh!: THREE.Mesh;
  private oRingBottomMesh!: THREE.Mesh;
  private pistonBottomGlowMat!: THREE.MeshBasicMaterial;

  // 火绒与燃烧动效组件
  private tinderCloveMaterials: THREE.MeshStandardMaterial[] = [];
  private flameGroup = new THREE.Group();
  private flameOuterMesh!: THREE.Mesh;
  private flameMidMesh!: THREE.Mesh;
  private flameCoreMesh!: THREE.Mesh;
  private flameOuterMat!: THREE.MeshBasicMaterial;
  private flameMidMat!: THREE.MeshBasicMaterial;
  private flameCoreMat!: THREE.MeshBasicMaterial;
  private ignitionFlashSprite!: THREE.Mesh;
  private ignitionFlashMat!: THREE.MeshBasicMaterial;
  private chamberLight!: THREE.PointLight;

  // 气缸内绝热压缩热浪光柱与冲击波环
  private thermalColumnMesh!: THREE.Mesh;
  private thermalColumnMat!: THREE.MeshBasicMaterial;
  private shockwaveRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; offset: number }[] = [];

  // 气缸内微观空气分子粒子系统 (InstancedMesh)
  private readonly moleculeCount = 135;
  private moleculesInstanced!: THREE.InstancedMesh;
  private moleculesMat!: THREE.MeshStandardMaterial;
  private moleculeStates: AirMoleculeState[] = [];
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly dummyPos = new THREE.Vector3();
  private readonly dummyQuat = new THREE.Quaternion();
  private readonly dummyScale = new THREE.Vector3();
  private readonly dummyColor = new THREE.Color();

  // 火星与青烟粒子系统
  private smokePuffs: SmokePuffState[] = [];
  private sparks: SparkParticleState[] = [];
  private elapsed = 0;

  constructor() {
    this.group.name = 'FireSyringeBenchGroup';

    this.buildBaseAssembly();
    this.buildTieRodsAndCollars();
    this.buildCombustionChamberAndTinder();
    this.buildGlassCylinder();
    this.buildTopFlangeAndGland();
    this.buildPistonAndTHandle();
    this.buildInternalDynamicEffects();
  }

  /**
   * 1. 重型机械倒角底座与四角的减振防滑脚垫
   */
  private buildBaseAssembly(): void {
    const baseGroup = new THREE.Group();
    baseGroup.name = 'BaseAssembly';

    // 深邃蓝灰钛金阳极氧化底座材质（避免死板脏黑，呈现细腻金属微光与清漆质感）
    const baseAnodizedMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.62,
      roughness: 0.28,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
    });

    const satinSilverMat = anodizedAluminum(0xe2e8f0, 0.22);

    const footRubberMat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      metalness: 0.25,
      roughness: 0.45,
    });

    // 四个圆柱减振水平调节脚垫
    const footOffsets: [number, number][] = [
      [-0.082, -0.058],
      [0.082, -0.058],
      [-0.082, 0.058],
      [0.082, 0.058],
    ];
    const footPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.014, 0),
      new THREE.Vector2(0.016, 0.002),
      new THREE.Vector2(0.016, 0.011),
      new THREE.Vector2(0.014, 0.012),
      new THREE.Vector2(0, 0.012),
    ];
    const footGeo = new THREE.LatheGeometry(footPts, 28);
    const ringGeo = new THREE.CylinderGeometry(0.0162, 0.0162, 0.0022, 28);

    for (const [fx, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, footRubberMat);
      foot.position.set(fx, 0, fz);
      foot.castShadow = true;
      foot.receiveShadow = true;
      baseGroup.add(foot);

      const trimRing = new THREE.Mesh(ringGeo, satinSilverMat);
      trimRing.position.set(fx, 0.009, fz);
      baseGroup.add(trimRing);
    }

    // 主底座板 (宽 0.22m, 深 0.165m, 高 0.025m)
    const mainPlateGeo = createChamferedBoxGeometry(0.22, 0.025, 0.165, 0.012, 0.003);
    const mainPlate = new THREE.Mesh(mainPlateGeo, baseAnodizedMat);
    mainPlate.position.y = 0.011;
    mainPlate.castShadow = true;
    mainPlate.receiveShadow = true;
    baseGroup.add(mainPlate);

    // 底座顶面银色精密承重内嵌装饰台面
    const inlayGeo = createChamferedBoxGeometry(0.165, 0.003, 0.125, 0.008, 0.001);
    const inlay = new THREE.Mesh(inlayGeo, satinSilverMat);
    inlay.position.y = 0.0345;
    inlay.receiveShadow = true;
    baseGroup.add(inlay);

    this.group.add(baseGroup);
  }

  /**
   * 2. 四根镜面不锈钢立柱、底座法兰、下抱箍环与右侧滚花锁紧螺丝（严格还原参考图2）
   */
  private buildTieRodsAndCollars(): void {
    const rodsGroup = new THREE.Group();
    rodsGroup.name = 'TieRodsAssembly';

    const chromeMat = labMetal(0xffffff, 0.96, 0.08);
    const satinSteelMat = anodizedAluminum(0xe5e7eb, 0.2);

    // 四根立柱的平面坐标 (前左、前右、后左、后右)
    const rodCoords: [number, number][] = [
      [-0.055, 0.038],
      [0.055, 0.038],
      [-0.055, -0.038],
      [0.055, -0.038],
    ];

    // 底部立柱阶梯法兰座剖面 (LatheGeometry)
    const baseBossPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.014, 0),
      new THREE.Vector2(0.014, 0.003),
      new THREE.Vector2(0.0125, 0.0045),
      new THREE.Vector2(0.011, 0.0045),
      new THREE.Vector2(0.011, 0.015),
      new THREE.Vector2(0.0095, 0.0165),
      new THREE.Vector2(0, 0.0165),
    ];
    const baseBossGeo = new THREE.LatheGeometry(baseBossPts, 32);

    // 下部抱箍套环剖面 (与燃烧室左右衔接)
    const collarPts = [
      new THREE.Vector2(0.005, 0),
      new THREE.Vector2(0.0115, 0),
      new THREE.Vector2(0.0125, 0.0015),
      new THREE.Vector2(0.0125, 0.0165),
      new THREE.Vector2(0.0115, 0.018),
      new THREE.Vector2(0.005, 0.018),
    ];
    const collarGeo = new THREE.LatheGeometry(collarPts, 32);

    // 立柱主轴几何体
    const rodHeight = 0.258;
    const rodGeo = new THREE.CylinderGeometry(0.0052, 0.0052, rodHeight, 28);

    // 顶部六角锁紧螺母与球面盖形螺帽
    const hexNutGeo = createHexNutGeometry(0.0095, 0.0065);
    const washerGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.002, 28);
    const acornCapGeo = new THREE.SphereGeometry(0.0058, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);

    rodCoords.forEach(([rx, rz], idx) => {
      // 1) 底部法兰座
      const boss = new THREE.Mesh(baseBossGeo, satinSteelMat);
      boss.position.set(rx, 0.036, rz);
      boss.castShadow = true;
      boss.receiveShadow = true;
      rodsGroup.add(boss);

      // 2) 镜面铬合金立柱
      const rod = new THREE.Mesh(rodGeo, chromeMat);
      rod.position.set(rx, 0.036 + rodHeight * 0.5, rz);
      rod.castShadow = true;
      rodsGroup.add(rod);

      // 3) 下部抱箍套环 (位于燃烧室中腰高度 y = 0.065)
      const collar = new THREE.Mesh(collarGeo, satinSteelMat);
      collar.position.set(rx, 0.065, rz);
      collar.castShadow = true;
      rodsGroup.add(collar);

      // 抱箍连接燃烧室的金属横梁臂
      const bridgeLen = Math.hypot(rx, rz) - 0.031;
      const bridgeGeo = createChamferedBoxGeometry(bridgeLen, 0.014, 0.012, 0.003, 0.0012);
      const bridge = new THREE.Mesh(bridgeGeo, satinSteelMat);
      const angle = Math.atan2(rz, rx);
      const midR = 0.031 + bridgeLen * 0.5;
      bridge.position.set(Math.cos(angle) * midR, 0.067, Math.sin(angle) * midR);
      bridge.rotation.y = -angle;
      rodsGroup.add(bridge);

      // 4) 顶部垫圈与六角螺母 (位于上顶盖 y = 0.290 之上)
      const washer = new THREE.Mesh(washerGeo, chromeMat);
      washer.position.set(rx, 0.291, rz);
      rodsGroup.add(washer);

      const nut = new THREE.Mesh(hexNutGeo, satinSteelMat);
      nut.position.set(rx, 0.295, rz);
      nut.rotation.y = idx * 0.4;
      rodsGroup.add(nut);

      const cap = new THREE.Mesh(acornCapGeo, chromeMat);
      cap.position.set(rx, 0.2975, rz);
      rodsGroup.add(cap);
    });

    // 右前立柱抱箍外侧的精密滚花锁紧螺丝 (完全对应参考图2右侧突出的滚花旋钮)
    const thumbscrewGroup = new THREE.Group();
    thumbscrewGroup.name = 'RightLockingThumbscrew';
    thumbscrewGroup.position.set(0.067, 0.074, 0.038);
    thumbscrewGroup.rotation.z = -Math.PI / 2;

    const screwStemGeo = new THREE.CylinderGeometry(0.0038, 0.0038, 0.010, 20);
    const screwStem = new THREE.Mesh(screwStemGeo, chromeMat);
    screwStem.position.y = 0.004;
    thumbscrewGroup.add(screwStem);

    const knobPts = [
      new THREE.Vector2(0, 0.008),
      new THREE.Vector2(0.0078, 0.008),
      new THREE.Vector2(0.0092, 0.0095),
      new THREE.Vector2(0.0092, 0.0175),
      new THREE.Vector2(0.0078, 0.019),
      new THREE.Vector2(0, 0.019),
    ];
    const knobGeo = new THREE.LatheGeometry(knobPts, 28);
    const knobMesh = new THREE.Mesh(knobGeo, satinSteelMat);
    thumbscrewGroup.add(knobMesh);

    // 20 道真实机械防滑滚花棱条
    const knurlBarGeo = new THREE.BoxGeometry(0.001, 0.0082, 0.0012);
    for (let k = 0; k < 20; k++) {
      const ka = (k / 20) * Math.PI * 2;
      const bar = new THREE.Mesh(knurlBarGeo, chromeMat);
      bar.position.set(Math.cos(ka) * 0.0092, 0.0135, Math.sin(ka) * 0.0092);
      bar.rotation.y = -ka;
      thumbscrewGroup.add(bar);
    }

    rodsGroup.add(thumbscrewGroup);
    this.group.add(rodsGroup);
  }

  /**
   * 3. 底部金属燃烧室（带正前方 +Z 拱形观察窗）与内部洁白蓬松引火棉（火绒）
   */
  private buildCombustionChamberAndTinder(): void {
    this.combustionChamberGroup.name = 'CombustionChamberAssembly';

    const chamberSteelMat = anodizedAluminum(0xe2e8f0, 0.22);
    const innerChamberMat = anodizedAluminum(0x94a3b8, 0.35);
    innerChamberMat.side = THREE.DoubleSide;
    const darkTrayMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.55,
      roughness: 0.38,
    });

    const outerR = 0.035;
    const innerR = 0.024;

    // 1) 燃烧室底部实心金属基座环 (y = 0.046 ~ 0.060)
    const bottomPts = [
      new THREE.Vector2(0, 0.046),
      new THREE.Vector2(outerR - 0.002, 0.046),
      new THREE.Vector2(outerR, 0.048),
      new THREE.Vector2(outerR, 0.060),
      new THREE.Vector2(innerR, 0.060),
      new THREE.Vector2(innerR, 0.056),
      new THREE.Vector2(0, 0.056),
    ];
    const bottomCup = new THREE.Mesh(new THREE.LatheGeometry(bottomPts, 48), chamberSteelMat);
    bottomCup.castShadow = true;
    bottomCup.receiveShadow = true;
    this.combustionChamberGroup.add(bottomCup);

    // 2) 燃烧室中段带正面 (+Z) 镂空观察窗的厚壁圆筒 (y = 0.060 ~ 0.090)
    // 正前方 (+Z 对应 CylinderGeometry 中 theta = 0 附近) 留出 ±38° 拱形观察口
    const windowHalfAngle = THREE.MathUtils.degToRad(38);
    const arcStart = windowHalfAngle;
    const arcLength = Math.PI * 2 - windowHalfAngle * 2;
    const midHeight = 0.030;

    // 外弧壁
    const midOuterGeo = new THREE.CylinderGeometry(
      outerR,
      outerR,
      midHeight,
      48,
      1,
      true,
      arcStart,
      arcLength
    );
    const midOuter = new THREE.Mesh(midOuterGeo, chamberSteelMat);
    midOuter.position.y = 0.060 + midHeight * 0.5;
    midOuter.castShadow = true;
    this.combustionChamberGroup.add(midOuter);

    // 内弧壁
    const midInnerGeo = new THREE.CylinderGeometry(
      innerR,
      innerR,
      midHeight,
      48,
      1,
      true,
      arcStart,
      arcLength
    );
    const midInner = new THREE.Mesh(midInnerGeo, innerChamberMat);
    midInner.position.y = 0.060 + midHeight * 0.5;
    this.combustionChamberGroup.add(midInner);

    // 左右观察窗侧壁封口切面（连接内外壁厚度）
    const wallThickness = outerR - innerR;
    const cheekGeo = new THREE.BoxGeometry(wallThickness, midHeight, 0.0025);
    for (const sign of [-1, 1]) {
      const theta = sign * windowHalfAngle;
      const midRad = (outerR + innerR) * 0.5;
      const cheek = new THREE.Mesh(cheekGeo, chamberSteelMat);
      cheek.position.set(
        Math.sin(theta) * midRad,
        0.060 + midHeight * 0.5,
        Math.cos(theta) * midRad
      );
      cheek.rotation.y = theta;
      this.combustionChamberGroup.add(cheek);
    }

    // 3) 燃烧室上部整圈承口环与拱形窗楣倒角圈 (y = 0.090 ~ 0.106)
    const topRimPts = [
      new THREE.Vector2(innerR, 0.090),
      new THREE.Vector2(outerR, 0.090),
      new THREE.Vector2(outerR, 0.104),
      new THREE.Vector2(outerR - 0.002, 0.106),
      new THREE.Vector2(innerR + 0.001, 0.106),
      new THREE.Vector2(innerR, 0.104),
      new THREE.Vector2(innerR, 0.090),
    ];
    const topRim = new THREE.Mesh(new THREE.LatheGeometry(topRimPts, 48), chamberSteelMat);
    topRim.castShadow = true;
    this.combustionChamberGroup.add(topRim);

    // 气缸底部黑色氟橡胶密封垫圈 (位于 y = 0.098)
    const bottomGasketGeo = new THREE.TorusGeometry(0.0255, 0.0022, 16, 48);
    bottomGasketGeo.rotateX(Math.PI / 2);
    const bottomGasket = new THREE.Mesh(
      bottomGasketGeo,
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.2 })
    );
    bottomGasket.position.y = 0.098;
    this.combustionChamberGroup.add(bottomGasket);

    // 4) 燃烧室内部火绒金属托盘 (y = 0.058)
    const trayPts = [
      new THREE.Vector2(0, 0.056),
      new THREE.Vector2(0.017, 0.056),
      new THREE.Vector2(0.0185, 0.059),
      new THREE.Vector2(0.016, 0.0615),
      new THREE.Vector2(0.014, 0.0585),
      new THREE.Vector2(0, 0.0585),
    ];
    const trayMesh = new THREE.Mesh(new THREE.LatheGeometry(trayPts, 32), darkTrayMat);
    this.combustionChamberGroup.add(trayMesh);

    // 5) 引火棉（火绒）3D 多瓣蓬松棉团模型 (如参考图2观察窗内的白色棉絮团)
    this.tinderGroup.name = 'TinderTuftGroup';
    this.tinderGroup.position.set(0, 0.062, 0.004);

    const numCloves = 8;
    for (let i = 0; i < numCloves; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfaf5e8,
        roughness: 0.85,
        metalness: 0.02,
        emissive: 0x000000,
        emissiveIntensity: 0,
      });
      this.tinderCloveMaterials.push(mat);

      const angle = (i / numCloves) * Math.PI * 2;
      const cloveGeo = new THREE.SphereGeometry(0.0048, 16, 14);
      cloveGeo.scale(1.15, 0.92, 0.95);
      const clove = new THREE.Mesh(cloveGeo, mat);
      clove.position.set(
        Math.cos(angle) * 0.0042,
        0.0018 + (i % 2) * 0.0008,
        Math.sin(angle) * 0.0042
      );
      clove.rotation.y = -angle;
      clove.userData = { isTinder: true };
      this.tinderGroup.add(clove);
    }

    // 中央顶部束口棉捻尖端（还原参考图2火绒顶部的纤维束头）
    const topWispMat = new THREE.MeshStandardMaterial({
      color: 0xfcf9f2,
      roughness: 0.88,
      metalness: 0.02,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.tinderCloveMaterials.push(topWispMat);

    const coreBulbGeo = new THREE.SphereGeometry(0.0052, 16, 14);
    coreBulbGeo.scale(1.0, 1.15, 1.0);
    const coreBulb = new THREE.Mesh(coreBulbGeo, topWispMat);
    coreBulb.position.y = 0.0035;
    coreBulb.userData = { isTinder: true };
    this.tinderGroup.add(coreBulb);

    const tuftTipPts = [
      new THREE.Vector2(0.0032, 0.006),
      new THREE.Vector2(0.0018, 0.0095),
      new THREE.Vector2(0.0030, 0.0135),
      new THREE.Vector2(0.0005, 0.015),
    ];
    const tuftTipGeo = new THREE.LatheGeometry(tuftTipPts, 16);
    const tuftTip = new THREE.Mesh(tuftTipGeo, topWispMat);
    tuftTip.userData = { isTinder: true };
    this.tinderGroup.add(tuftTip);

    this.combustionChamberGroup.add(this.tinderGroup);
    this.group.add(this.combustionChamberGroup);
  }

  /**
   * 4. 高透光率厚壁高硼硅玻璃气缸与正前方激光蚀刻容积标尺
   */
  private buildGlassCylinder(): void {
    const glassGroup = new THREE.Group();
    glassGroup.name = 'GlassCylinderAssembly';

    const glassHeight = 0.182; // y = 0.096 ~ 0.278
    const centerY = 0.096 + glassHeight * 0.5;

    const outerGlassMat = labGlass(0.10);
    outerGlassMat.color.setHex(0xffffff);
    const innerGlassMat = labGlass(0.06);
    innerGlassMat.color.setHex(0xdbeafe);

    // 外壁与内壁双层玻璃建模，展现真实厚壁有机玻璃/高硼硅玻璃折射质感
    const outerTubeGeo = new THREE.CylinderGeometry(0.0272, 0.0272, glassHeight, 48, 1, true);
    const outerTube = new THREE.Mesh(outerTubeGeo, outerGlassMat);
    outerTube.position.y = centerY;
    glassGroup.add(outerTube);

    const innerTubeGeo = new THREE.CylinderGeometry(
      FireSyringeBenchMesh.GLASS_INNER_RADIUS,
      FireSyringeBenchMesh.GLASS_INNER_RADIUS,
      glassHeight,
      48,
      1,
      true
    );
    const innerTube = new THREE.Mesh(innerTubeGeo, innerGlassMat);
    innerTube.position.y = centerY;
    glassGroup.add(innerTube);

    // 侧前方 (+Z 偏右 22°) 精细激光蚀刻容积刻度线，方便观察活塞下压深度与压缩比
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.55,
    });
    const numTicks = 13;
    for (let i = 0; i <= numTicks; i++) {
      const frac = i / numTicks;
      const y =
        FireSyringeBenchMesh.PISTON_BOTTOM_Y +
        frac * (FireSyringeBenchMesh.PISTON_TOP_Y - FireSyringeBenchMesh.PISTON_BOTTOM_Y);
      const isMajor = i % 3 === 0;
      const tickW = isMajor ? 0.0065 : 0.0036;
      const tickGeo = new THREE.BoxGeometry(tickW, 0.0007, 0.0006);
      const tick = new THREE.Mesh(tickGeo, tickMat);
      const angle = THREE.MathUtils.degToRad(22);
      tick.position.set(
        Math.sin(angle) * 0.0275,
        y,
        Math.cos(angle) * 0.0275
      );
      tick.rotation.y = angle;
      glassGroup.add(tick);
    }

    this.group.add(glassGroup);
  }

  /**
   * 5. 上部圆形不锈钢顶盖与中央阶梯式大六角导向压盖总成（严格对齐参考图2顶部结构）
   */
  private buildTopFlangeAndGland(): void {
    const topGroup = new THREE.Group();
    topGroup.name = 'TopFlangeAssembly';

    const satinSteelMat = anodizedAluminum(0xe5e7eb, 0.2);
    const chromeMat = labMetal(0xffffff, 0.96, 0.08);
    const brassBushingMat = polishedGold(0xd97706);

    // 顶盖下方密封黑胶垫圈 (y = 0.275)
    const topGasketGeo = new THREE.TorusGeometry(0.0255, 0.0022, 16, 48);
    topGasketGeo.rotateX(Math.PI / 2);
    const topGasket = new THREE.Mesh(
      topGasketGeo,
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.2 })
    );
    topGasket.position.y = 0.275;
    topGroup.add(topGasket);

    // 1) 上部圆形厚金属顶盖法兰盘 (y = 0.276 ~ 0.290)
    const flangePts = [
      new THREE.Vector2(0.009, 0.276),
      new THREE.Vector2(0.068, 0.276),
      new THREE.Vector2(0.070, 0.278),
      new THREE.Vector2(0.070, 0.288),
      new THREE.Vector2(0.068, 0.290),
      new THREE.Vector2(0.009, 0.290),
    ];
    const flangeMesh = new THREE.Mesh(new THREE.LatheGeometry(flangePts, 56), satinSteelMat);
    flangeMesh.castShadow = true;
    flangeMesh.receiveShadow = true;
    topGroup.add(flangeMesh);

    // 2) 中央阶梯导向底座环 (y = 0.290 ~ 0.298)
    const glandBasePts = [
      new THREE.Vector2(0.0085, 0.290),
      new THREE.Vector2(0.022, 0.290),
      new THREE.Vector2(0.022, 0.2935),
      new THREE.Vector2(0.0175, 0.2945),
      new THREE.Vector2(0.0175, 0.299),
      new THREE.Vector2(0.0085, 0.299),
    ];
    const glandBase = new THREE.Mesh(new THREE.LatheGeometry(glandBasePts, 40), chromeMat);
    glandBase.castShadow = true;
    topGroup.add(glandBase);

    // 3) 中央大六角锁紧压盖螺母 (y = 0.304)
    const centerHexNutGeo = createHexNutGeometry(0.0155, 0.010);
    const centerHexNut = new THREE.Mesh(centerHexNutGeo, satinSteelMat);
    centerHexNut.position.y = 0.304;
    centerHexNut.castShadow = true;
    topGroup.add(centerHexNut);

    // 4) 上层倒角导向轴套与黄铜耐磨衬套环 (y = 0.309 ~ 0.318)
    const upperCollarPts = [
      new THREE.Vector2(0.008, 0.309),
      new THREE.Vector2(0.013, 0.309),
      new THREE.Vector2(0.013, 0.315),
      new THREE.Vector2(0.011, 0.317),
      new THREE.Vector2(0.008, 0.317),
    ];
    const upperCollar = new THREE.Mesh(new THREE.LatheGeometry(upperCollarPts, 36), chromeMat);
    topGroup.add(upperCollar);

    const bushingRingGeo = new THREE.CylinderGeometry(0.0092, 0.0092, 0.002, 28);
    const bushingRing = new THREE.Mesh(bushingRingGeo, brassBushingMat);
    bushingRing.position.y = 0.3172;
    topGroup.add(bushingRing);

    this.group.add(topGroup);
  }

  /**
   * 6. 活塞头（双道密封圈）、镜面活塞杆与人体工学 T 形手柄总成
   */
  private buildPistonAndTHandle(): void {
    this.pistonAssemblyGroup.name = 'PistonAssemblyGroup';

    const chromeMat = labMetal(0xffffff, 0.97, 0.06);
    const pistonSteelMat = anodizedAluminum(0xe2e8f0, 0.16);
    const oRingRubberMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.22,
      roughness: 0.38,
    });
    const knobSphereMat = new THREE.MeshPhysicalMaterial({
      color: 0x172030,
      metalness: 0.65,
      roughness: 0.14,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    });

    // --- A. 双密封槽精密车削金属活塞头 (局部 y = 0 为活塞底面) ---
    const pistonRadius = 0.0222;
    const grooveRadius = 0.0192;
    const pistonPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(pistonRadius - 0.0015, 0),
      new THREE.Vector2(pistonRadius, 0.0015),
      // 下承压岸
      new THREE.Vector2(pistonRadius, 0.0075),
      // 第一道密封圈槽
      new THREE.Vector2(grooveRadius, 0.008),
      new THREE.Vector2(grooveRadius, 0.0125),
      // 中间分隔岸
      new THREE.Vector2(pistonRadius, 0.013),
      new THREE.Vector2(pistonRadius, 0.0165),
      // 第二道密封圈槽
      new THREE.Vector2(grooveRadius, 0.017),
      new THREE.Vector2(grooveRadius, 0.0215),
      // 上承压岸与顶面倒角
      new THREE.Vector2(pistonRadius, 0.022),
      new THREE.Vector2(pistonRadius, 0.028),
      new THREE.Vector2(pistonRadius - 0.0018, 0.030),
      new THREE.Vector2(0.0075, 0.030),
    ];
    const pistonHeadMesh = new THREE.Mesh(
      new THREE.LatheGeometry(pistonPts, 48),
      pistonSteelMat
    );
    pistonHeadMesh.name = 'PistonHeadMesh';
    pistonHeadMesh.castShadow = true;
    this.pistonAssemblyGroup.add(pistonHeadMesh);

    // 两道气密氟橡胶 O 型密封圈
    const oRingGeo = new THREE.TorusGeometry(0.0205, 0.0024, 18, 48);
    oRingGeo.rotateX(Math.PI / 2);

    this.oRingBottomMesh = new THREE.Mesh(oRingGeo, oRingRubberMat);
    this.oRingBottomMesh.position.y = 0.0102;
    this.pistonAssemblyGroup.add(this.oRingBottomMesh);

    this.oRingTopMesh = new THREE.Mesh(oRingGeo, oRingRubberMat);
    this.oRingTopMesh.position.y = 0.0192;
    this.pistonAssemblyGroup.add(this.oRingTopMesh);

    // 活塞底面受热反光圆盘
    this.pistonBottomGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bottomGlowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.021, 32),
      this.pistonBottomGlowMat
    );
    bottomGlowDisc.rotation.x = Math.PI / 2;
    bottomGlowDisc.position.y = -0.0005;
    this.pistonAssemblyGroup.add(bottomGlowDisc);

    // --- B. 中央镜面活塞杆 (从活塞顶面 y = 0.030 向上延伸至 y = 0.198) ---
    const rodLen = 0.168;
    const pistonRodGeo = new THREE.CylinderGeometry(0.0075, 0.0075, rodLen, 32);
    const pistonRod = new THREE.Mesh(pistonRodGeo, chromeMat);
    pistonRod.name = 'PistonRodMesh';
    pistonRod.position.y = 0.030 + rodLen * 0.5;
    pistonRod.castShadow = true;
    this.pistonAssemblyGroup.add(pistonRod);

    // --- C. 顶部 T 形手柄总成 (局部 y = 0.198) ---
    this.handleGroup.name = 'THandleGroup';
    this.handleGroup.position.y = 0.198;

    // 中央 T 字连接套筒与顶盖螺丝细节
    const tHubPts = [
      new THREE.Vector2(0.0075, -0.010),
      new THREE.Vector2(0.0105, -0.008),
      new THREE.Vector2(0.0105, 0.010),
      new THREE.Vector2(0.009, 0.012),
      new THREE.Vector2(0, 0.012),
    ];
    const tHub = new THREE.Mesh(new THREE.LatheGeometry(tHubPts, 32), pistonSteelMat);
    tHub.userData = { isTHandle: true };
    this.handleGroup.add(tHub);

    // 横向不锈钢手柄横杆 (沿 X 轴左右舒展，宽 0.164m)
    const crossbarLen = 0.164;
    const crossbarGeo = new THREE.CylinderGeometry(0.0058, 0.0058, crossbarLen, 28);
    crossbarGeo.rotateZ(Math.PI / 2);
    const crossbar = new THREE.Mesh(crossbarGeo, chromeMat);
    crossbar.userData = { isTHandle: true };
    crossbar.castShadow = true;
    this.handleGroup.add(crossbar);

    // 左右两端车削金属过渡颈环与高光泽握持圆球 (严格还原参考图2两端圆球把手)
    const ferruleGeo = new THREE.CylinderGeometry(0.0072, 0.0060, 0.008, 24);
    ferruleGeo.rotateZ(Math.PI / 2);
    const ballGeo = new THREE.SphereGeometry(0.0148, 32, 24);

    for (const sign of [-1, 1]) {
      const ferrule = new THREE.Mesh(ferruleGeo, pistonSteelMat);
      ferrule.position.x = sign * 0.078;
      if (sign < 0) ferrule.rotation.y = Math.PI;
      ferrule.userData = { isTHandle: true };
      this.handleGroup.add(ferrule);

      const ball = new THREE.Mesh(ballGeo, knobSphereMat);
      ball.position.x = sign * 0.091;
      ball.scale.set(1.08, 1.0, 1.0);
      ball.castShadow = true;
      ball.userData = { isTHandle: true };
      this.handleGroup.add(ball);
    }

    // 悬停/拖拽高亮光环与隐形宽大拾取碰撞盒（提升鼠标与触控屏拖拽手感）
    this.handleHoverMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const haloGeo = new THREE.TorusGeometry(0.018, 0.0018, 12, 36);
    haloGeo.rotateX(Math.PI / 2);
    this.handleHoverHalo = new THREE.Mesh(haloGeo, this.handleHoverMat);
    this.handleHoverHalo.position.y = -0.006;
    this.handleGroup.add(this.handleHoverHalo);

    const hitColliderGeo = new THREE.BoxGeometry(0.22, 0.055, 0.055);
    const hitColliderMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitCollider = new THREE.Mesh(hitColliderGeo, hitColliderMat);
    hitCollider.name = 'THandleCollider';
    hitCollider.userData = { isTHandle: true };
    this.handleGroup.add(hitCollider);

    this.pistonAssemblyGroup.add(this.handleGroup);
    this.pistonAssemblyGroup.position.y = FireSyringeBenchMesh.PISTON_TOP_Y;
    this.group.add(this.pistonAssemblyGroup);
  }

  /**
   * 7. 气缸内部全套微观与宏观动态视觉特效：
   *    - 135 颗动态空气分子粒子 (冷白蓝 -> 金黄 -> 炽热橙红)
   *    - 绝热压缩体积热浪光柱与向下推进的压缩冲击波环
   *    - 三层有机摇曳火焰、爆燃瞬间强闪光、燃烧室动态点光源
   *    - 飞溅火星粒子与袅袅上升的燃烧青烟
   */
  private buildInternalDynamicEffects(): void {
    const effectsGroup = new THREE.Group();
    effectsGroup.name = 'InternalDynamicEffectsGroup';

    // --- A. 气缸内空气体积染色柱与绝热压缩热浪光柱（采用 NormalBlending 高饱和宝石蓝，确保在浅灰背景前鲜明突出） ---
    this.thermalColumnMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.22,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const colGeo = new THREE.CylinderGeometry(0.0215, 0.0215, 1.0, 32, 1, true);
    this.thermalColumnMesh = new THREE.Mesh(colGeo, this.thermalColumnMat);
    effectsGroup.add(this.thermalColumnMesh);

    // --- B. 向下推进的绝热压缩冲击波环 (3 道流光环) ---
    const waveRingGeo = new THREE.TorusGeometry(0.0195, 0.0016, 12, 36);
    waveRingGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(waveRingGeo, mat);
      effectsGroup.add(mesh);
      this.shockwaveRings.push({ mesh, mat, offset: i / 3 });
    }

    // --- C. 气缸内微观空气分子群 (高饱和深钴蓝/宝石蓝实心粒子，杜绝泛白，与浅灰背景强对比) ---
    const molGeo = new THREE.SphereGeometry(0.00235, 14, 12);
    this.moleculesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.1,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.25,
    });
    this.moleculesInstanced = new THREE.InstancedMesh(
      molGeo,
      this.moleculesMat,
      this.moleculeCount
    );
    this.moleculesInstanced.name = 'AirMoleculesInstanced';
    this.moleculesInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // 使用确定性伪随机分布初始化分子位置与热运动方向
    for (let i = 0; i < this.moleculeCount; i++) {
      const r = Math.sqrt(((i * 73 + 19) % 100) / 100) * 0.88;
      const theta = i * 2.39996; // 黄金角均匀分布
      const relY = ((i * 37 + 11) % 100) / 100;
      const speedAngle = i * 1.71;
      this.moleculeStates.push({
        relX: Math.cos(theta) * r,
        relY,
        relZ: Math.sin(theta) * r,
        vx: Math.cos(speedAngle) * (0.65 + (i % 5) * 0.15),
        vy: ((i % 2 === 0 ? 1 : -1) * (0.75 + (i % 7) * 0.12)),
        vz: Math.sin(speedAngle) * (0.65 + (i % 4) * 0.15),
        phase: i * 0.43,
      });
      this.moleculesInstanced.setColorAt(i, new THREE.Color(0x1d4ed8));
    }
    if (this.moleculesInstanced.instanceColor) {
      this.moleculesInstanced.instanceColor.needsUpdate = true;
    }
    effectsGroup.add(this.moleculesInstanced);

    // --- D. 火绒三层动态摇曳火焰与爆燃闪光 ---
    this.flameGroup.name = 'CombustionFlameGroup';
    this.flameGroup.position.set(0, 0.065, 0.004);
    this.flameGroup.visible = false;

    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flameMidMat = new THREE.MeshBasicMaterial({
      color: 0xff9500,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.flameOuterMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0115, 0.034),
      this.flameOuterMat
    );
    this.flameMidMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0082, 0.026),
      this.flameMidMat
    );
    this.flameMidMesh.position.y = 0.001;
    this.flameCoreMesh = new THREE.Mesh(
      createFlameTeardropGeometry(0.0048, 0.016),
      this.flameCoreMat
    );
    this.flameCoreMesh.position.y = 0.002;

    this.flameGroup.add(this.flameOuterMesh, this.flameMidMesh, this.flameCoreMesh);
    effectsGroup.add(this.flameGroup);

    // 爆燃瞬间高光闪耀球
    this.ignitionFlashMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ignitionFlashSprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 20, 16),
      this.ignitionFlashMat
    );
    this.ignitionFlashSprite.position.set(0, 0.072, 0.006);
    effectsGroup.add(this.ignitionFlashSprite);

    // 燃烧室内部真实动态点光源
    this.chamberLight = new THREE.PointLight(0xff7b00, 0, 0.35, 1.6);
    this.chamberLight.position.set(0, 0.075, 0.012);
    effectsGroup.add(this.chamberLight);

    // --- E. 飞溅火星粒子池 ---
    const sparkGeo = new THREE.SphereGeometry(0.0011, 8, 8);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffe066 : 0xff6b00,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      effectsGroup.add(mesh);
      this.sparks.push({
        mesh,
        mat,
        x: 0,
        y: 0.068,
        z: 0.004,
        vx: 0,
        vy: 0,
        vz: 0,
        age: (i / 18) * 0.45,
        life: 0.35 + (i % 5) * 0.06,
      });
    }

    // --- F. 燃烧余烬袅袅青烟粒子池 ---
    const smokeGeo = new THREE.SphereGeometry(0.0045, 12, 10);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.visible = false;
      effectsGroup.add(mesh);
      this.smokePuffs.push({
        mesh,
        mat,
        x: 0,
        y: 0.068,
        z: 0.004,
        vy: 0.018 + (i % 5) * 0.004,
        age: (i / 24) * 1.6,
        life: 1.4 + (i % 4) * 0.25,
        baseScale: 0.7 + (i % 5) * 0.22,
      });
    }

    this.group.add(effectsGroup);
  }

  /**
   * 设置 T 形手柄悬停/拖拽高亮视觉状态
   */
  public setHandleHovered(hovered: boolean, isDragging = false): void {
    if (!this.handleHoverMat) return;
    if (isDragging) {
      this.handleHoverMat.color.setHex(0xf59e0b);
      this.handleHoverMat.opacity = 0.75;
    } else if (hovered) {
      this.handleHoverMat.color.setHex(0x38bdf8);
      this.handleHoverMat.opacity = 0.55;
    } else {
      this.handleHoverMat.opacity = 0.0;
    }
  }

  /**
   * 每帧同步更新活塞运动、分子加速变色、压缩冲击波、火绒爆燃火焰、余烬与青烟全流程动效
   */
  public update(dt: number, telemetry: FireSyringeTelemetry): void {
    const safeDt = Math.max(0, Math.min(0.05, dt));
    this.elapsed += safeDt;

    // 1. 更新活塞与 T 形手柄的垂直位移
    const pistonBottomY = THREE.MathUtils.lerp(
      FireSyringeBenchMesh.PISTON_TOP_Y,
      FireSyringeBenchMesh.PISTON_BOTTOM_Y,
      telemetry.stroke
    );
    this.pistonAssemblyGroup.position.y = pistonBottomY;

    // 2. 高压下 O 型圈径向微膨胀密封反馈与活塞底面热辐射反光
    const overPressure = Math.max(0, telemetry.pressureMPa - 0.1013);
    const sealExpand = 1.0 + Math.min(0.032, overPressure * 0.012);
    this.oRingBottomMesh.scale.set(sealExpand, 1.0, sealExpand);
    this.oRingTopMesh.scale.set(sealExpand, 1.0, sealExpand);
    this.pistonBottomGlowMat.opacity = Math.min(0.85, telemetry.thermalGlowIntensity * 0.75);

    // 3. 更新气缸内空气染色柱（常温为高饱和深海宝石蓝，绝热压缩升温时渐变为炽热橙红）
    const gasFloorY = 0.092;
    const gasColumnHeight = Math.max(0.008, pistonBottomY - gasFloorY);
    this.thermalColumnMesh.position.y = gasFloorY + gasColumnHeight * 0.5;
    this.thermalColumnMesh.scale.set(1, gasColumnHeight, 1);
    const densityBoost = Math.min(1.0, telemetry.stroke * 0.65);
    this.thermalColumnMat.opacity =
      0.22 + densityBoost * 0.14 + telemetry.thermalGlowIntensity * 0.26;
    if (telemetry.thermalGlowIntensity < 0.35) {
      // 常温至微温：深邃宝石蓝 (#0284c7 / #1d4ed8)，在浅灰背景前显色浓郁清晰
      this.thermalColumnMat.color
        .setHex(0x0284c7)
        .lerp(new THREE.Color(0x2563eb), densityBoost);
    } else {
      // 高温压缩引火：由宝石蓝迅速过渡至炽热橙红 (#ff3b00)
      const heatFactor = (telemetry.thermalGlowIntensity - 0.35) / 0.65;
      this.thermalColumnMat.color
        .setHex(0x2563eb)
        .lerp(new THREE.Color(0xff3b00), Math.min(1, heatFactor));
    }

    // 4. 更新向下推进的绝热压缩冲击波环
    for (const ring of this.shockwaveRings) {
      if (telemetry.compressionWaveIntensity > 0.02) {
        ring.mesh.visible = true;
        const travelPhase = (this.elapsed * 4.2 + ring.offset) % 1.0;
        ring.mesh.position.y = THREE.MathUtils.lerp(
          pistonBottomY - 0.002,
          gasFloorY + 0.004,
          travelPhase
        );
        const s = 0.85 + 0.18 * Math.sin(travelPhase * Math.PI);
        ring.mesh.scale.set(s, 1, s);
        ring.mat.opacity =
          telemetry.compressionWaveIntensity * Math.sin(travelPhase * Math.PI) * 0.78;
      } else {
        ring.mesh.visible = false;
        ring.mat.opacity = 0;
      }
    }

    // 5. 更新气缸内微观空气分子的压缩加密、加速热运动与高对比度深蓝->炽红渐变
    this.updateAirMolecules(safeDt, pistonBottomY, telemetry);

    // 6. 更新引火棉（火绒）碳化变色与暗红余烬呼吸光效
    this.updateTinderAndFlame(safeDt, pistonBottomY, telemetry);
  }

  /**
   * 更新气缸内 135 颗空气分子粒子的空间压缩与热运动状态
   */
  private updateAirMolecules(
    dt: number,
    pistonBottomY: number,
    telemetry: FireSyringeTelemetry
  ): void {
    const minY = 0.082; // 延伸进燃烧室上部，使高温气体包裹火绒
    const maxY = Math.max(minY + 0.012, pistonBottomY - 0.003);
    const maxR = FireSyringeBenchMesh.GLASS_INNER_RADIUS - 0.0025;
    const speedMult = telemetry.moleculeSpeedMultiplier;

    // 根据气体实时温度计算分子高对比度色彩：
    // 常温 20°C (浓郁深钴蓝/宝石蓝 #1d4ed8 / #0284c7，与浅灰背景强对比) -> 120°C (琥珀金) -> 260°C+ (炽热橙红)
    const tNorm = Math.max(0, Math.min(1.0, (telemetry.temperatureC - 20) / 240));
    if (tNorm < 0.4) {
      const k = tNorm / 0.4;
      this.moleculesMat.emissive.setRGB(
        THREE.MathUtils.lerp(0.04, 0.85, k),
        THREE.MathUtils.lerp(0.24, 0.45, k),
        THREE.MathUtils.lerp(0.78, 0.05, k)
      );
    } else {
      const k = (tNorm - 0.4) / 0.6;
      this.moleculesMat.emissive.setRGB(
        THREE.MathUtils.lerp(0.85, 1.0, k),
        THREE.MathUtils.lerp(0.45, 0.12, k),
        0.03
      );
    }
    this.moleculesMat.emissiveIntensity = 0.25 + tNorm * 0.95 + telemetry.flameIntensity * 0.55;

    const pScale = 0.95 + tNorm * 0.32;
    this.dummyScale.set(pScale, pScale, pScale);

    for (let i = 0; i < this.moleculeCount; i++) {
      const m = this.moleculeStates[i];
      if (dt > 0) {
        m.relX += m.vx * speedMult * dt * 1.6;
        m.relY += m.vy * speedMult * dt * 1.4;
        m.relZ += m.vz * speedMult * dt * 1.6;

        // 活塞与气缸壁弹性碰撞反射
        if (m.relY > 1.0) {
          m.relY = 1.0 - (m.relY - 1.0);
          m.vy = -Math.abs(m.vy);
        } else if (m.relY < 0.0) {
          m.relY = -m.relY;
          m.vy = Math.abs(m.vy);
        }

        const radSq = m.relX * m.relX + m.relZ * m.relZ;
        if (radSq > 0.86) {
          const rad = Math.sqrt(radSq);
          const nx = m.relX / rad;
          const nz = m.relZ / rad;
          m.relX = nx * 0.85;
          m.relZ = nz * 0.85;
          const dot = m.vx * nx + m.vz * nz;
          m.vx -= 2 * dot * nx;
          m.vz -= 2 * dot * nz;
        }
      }

      // 为每颗分子赋予高饱和深钴蓝 / 电光蓝 (常温) -> 炽热橙红 (高温) 的鲜明层次
      const shadeVar = ((i % 5) - 2) * 0.045;
      let r: number;
      let g: number;
      let b: number;
      if (tNorm < 0.4) {
        const k = tNorm / 0.4;
        r = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.06, 0.96, k) + shadeVar * 0.4, 0.02, 1.0);
        g = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.36, 0.58, k) + shadeVar * 0.8, 0.18, 0.75);
        b = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.92, 0.12, k) - shadeVar * 0.5, 0.05, 1.0);
      } else {
        const k = (tNorm - 0.4) / 0.6;
        r = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.96, 1.0, k), 0.85, 1.0);
        g = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.58, 0.12, k) + shadeVar * 0.5, 0.05, 0.65);
        b = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.12, 0.02, k), 0.01, 0.15);
      }
      this.dummyColor.setRGB(r, g, b);
      this.moleculesInstanced.setColorAt(i, this.dummyColor);

      const worldX = m.relX * maxR;
      const worldY = THREE.MathUtils.lerp(minY, maxY, m.relY);
      const worldZ = m.relZ * maxR;

      this.dummyPos.set(worldX, worldY, worldZ);
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.moleculesInstanced.setMatrixAt(i, this.dummyMatrix);
    }

    this.moleculesInstanced.instanceMatrix.needsUpdate = true;
    if (this.moleculesInstanced.instanceColor) {
      this.moleculesInstanced.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 更新火绒颜色/碳化、三层摇曳火焰、爆燃闪光、火星与青烟粒子
   */
  private updateTinderAndFlame(
    dt: number,
    pistonBottomY: number,
    telemetry: FireSyringeTelemetry
  ): void {
    // 1. 火绒材质颜色：由洁白蓬松棉絮 (0xfaf5e8) 随 charProgress 渐变为焦黑碳灰 (0x26211e)，并叠加暗红余烬自发光
    const freshR = 0.98;
    const freshG = 0.96;
    const freshB = 0.91;
    const charR = 0.16;
    const charG = 0.13;
    const charB = 0.12;
    const cp = telemetry.charProgress;

    const r = THREE.MathUtils.lerp(freshR, charR, cp);
    const g = THREE.MathUtils.lerp(freshG, charG, cp);
    const b = THREE.MathUtils.lerp(freshB, charB, cp);

    this.tinderCloveMaterials.forEach((mat, idx) => {
      mat.color.setRGB(r, g, b);
      const localPulse =
        0.75 + 0.25 * Math.sin(this.elapsed * 14.0 + idx * 1.1);
      const emberStrength =
        telemetry.emberIntensity * localPulse + telemetry.flameIntensity * 0.65;
      if (emberStrength > 0.01) {
        mat.emissive.setHex(0xff3b00);
        mat.emissiveIntensity = emberStrength * 1.45;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    });

    // 火绒在剧烈燃烧后体积略微收缩
    const tinderShrink = 1.0 - cp * 0.18;
    this.tinderGroup.scale.set(tinderShrink, 1.0 - cp * 0.24, tinderShrink);

    // 2. 三层动态摇曳火焰
    if (telemetry.flameIntensity > 0.01) {
      this.flameGroup.visible = true;
      const f = telemetry.flameIntensity;
      const swayZ = Math.sin(this.elapsed * 29.0) * 0.12 + Math.cos(this.elapsed * 17.0) * 0.06;
      const swayX = Math.cos(this.elapsed * 23.0) * 0.08;
      const stretchY = f * (0.92 + 0.16 * Math.sin(this.elapsed * 34.0));
      const widthScale = f * (0.94 + 0.10 * Math.cos(this.elapsed * 27.0));

      this.flameGroup.rotation.set(swayX, 0, swayZ);
      this.flameOuterMesh.scale.set(widthScale, stretchY, widthScale);
      this.flameMidMesh.scale.set(
        widthScale * 0.95,
        stretchY * (0.95 + 0.08 * Math.cos(this.elapsed * 41.0)),
        widthScale * 0.95
      );
      this.flameCoreMesh.scale.set(widthScale * 0.9, stretchY * 0.9, widthScale * 0.9);

      this.flameOuterMat.opacity = Math.min(0.82, f * 0.78);
      this.flameMidMat.opacity = Math.min(0.92, f * 0.90);
      this.flameCoreMat.opacity = Math.min(1.0, f * 0.98);
    } else {
      this.flameGroup.visible = false;
    }

    // 3. 爆燃瞬间强闪光球与点光源
    if (telemetry.flashIntensity > 0.01) {
      this.ignitionFlashSprite.visible = true;
      const flashScale = 0.7 + telemetry.flashIntensity * 1.45;
      this.ignitionFlashSprite.scale.set(flashScale, flashScale, flashScale);
      this.ignitionFlashMat.opacity = telemetry.flashIntensity * 0.85;
    } else {
      this.ignitionFlashSprite.visible = false;
      this.ignitionFlashMat.opacity = 0;
    }

    this.chamberLight.intensity =
      telemetry.flashIntensity * 3.2 +
      telemetry.flameIntensity * 2.1 +
      telemetry.emberIntensity * 0.65;

    // 4. 飞溅火星粒子动效
    const sparkActive = telemetry.flameIntensity > 0.08 || telemetry.emberIntensity > 0.25;
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i];
      if (!sparkActive) {
        sp.mesh.visible = false;
        continue;
      }
      sp.mesh.visible = true;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.age = 0;
        const angle = (i * 2.1 + this.elapsed * 7.3) % (Math.PI * 2);
        const rad = 0.002 + (i % 4) * 0.0012;
        sp.x = Math.cos(angle) * rad;
        sp.y = 0.066;
        sp.z = 0.004 + Math.sin(angle) * rad;
        sp.vx = Math.cos(angle) * (0.018 + (i % 3) * 0.008);
        sp.vy = 0.045 + (i % 5) * 0.014;
        sp.vz = Math.sin(angle) * (0.018 + (i % 3) * 0.008);
      } else {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.z += sp.vz * dt;
      }

      const lifeRatio = sp.age / sp.life;
      sp.mesh.position.set(sp.x, Math.min(pistonBottomY - 0.004, sp.y), sp.z);
      const s = Math.max(0.1, 1.0 - lifeRatio);
      sp.mesh.scale.set(s, s, s);
      sp.mat.opacity =
        Math.sin(lifeRatio * Math.PI) *
        Math.max(telemetry.flameIntensity, telemetry.emberIntensity * 0.7);
    }

    // 5. 袅袅青烟粒子动效
    const maxSmokeCeiling = Math.max(0.095, pistonBottomY - 0.006);
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const puff = this.smokePuffs[i];
      if (telemetry.smokeIntensity <= 0.015) {
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.visible = true;
      puff.age += dt;
      if (puff.age >= puff.life) {
        puff.age = 0;
        const angle = i * 1.618 + this.elapsed * 1.5;
        const rad = (i % 4) * 0.0022;
        puff.x = Math.cos(angle) * rad;
        puff.y = 0.068;
        puff.z = 0.003 + Math.sin(angle) * rad;
      } else {
        puff.y = Math.min(maxSmokeCeiling, puff.y + puff.vy * dt);
        puff.x += Math.sin(this.elapsed * 2.4 + i) * 0.004 * dt;
        puff.z += Math.cos(this.elapsed * 2.1 + i) * 0.004 * dt;
      }

      const lifeRatio = puff.age / puff.life;
      puff.mesh.position.set(puff.x, puff.y, puff.z);
      const scale = puff.baseScale * (0.65 + lifeRatio * 1.35);
      puff.mesh.scale.set(scale, scale * 0.85, scale);
      puff.mat.opacity =
        Math.sin(lifeRatio * Math.PI) * telemetry.smokeIntensity * 0.32;
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
