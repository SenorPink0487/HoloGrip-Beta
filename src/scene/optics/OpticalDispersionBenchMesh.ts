import * as THREE from 'three';
import {
  createChamferedHexNut,
  createContactCollar,
  createGuideShaftGeometry,
  createKnurledBand,
} from '../em/conductorRod.ts';
import {
  buildPrecisionOpticalRail,
  createChamferedBlockGeometry,
  type OpticalRailFinish,
} from './OpticalBenchRail.ts';
import {
  PRISM_MATERIALS,
  type PrismMaterialType,
} from './OpticalPhysics.ts';

import {
  DISPERSION_BENCH, projectDispersionFan, prismRotationY, prismCenterOffset,
  type DispersionProjection,
} from './PrismDispersionGeometry.ts';
export { DISPERSION_BENCH, projectDispersionFan } from './PrismDispersionGeometry.ts';
export type { DispersionProjection, DispersionRayHit } from './PrismDispersionGeometry.ts';

export const DISPERSION_MATERIALS: PrismMaterialType[] = [
  'quartz',
  'crown',
  'bariumFlint',
  'flint',
  'diamond',
];

export interface OpticalDispersionTelemetry {
  lampOn: boolean;
  incidentAngleDeg: number;
  material: PrismMaterialType;
  materialName: string;
  slitWidthMm: number;
  screenDistanceM: number;
  yellowDeviationDeg: number;
  angularDispersionDeg: number;
  abbeNumber: number;
  hasPartialTIR: boolean;
  hasFullTIR: boolean;
  redHitU: number;
  violetHitU: number;
  redOnScreen: boolean;
  violetOnScreen: boolean;
  spectrumSpanM: number;
}

export interface OpticalDispersionOptions {
  lampOn?: boolean;
  incidentAngleDeg?: number;
  material?: PrismMaterialType;
  slitWidthMm?: number;
  screenDistanceM?: number;
}

function createPrecisionTriangularPrismGeometry(a: number, depth: number): THREE.BufferGeometry {
  const hBase = (a * Math.sqrt(3)) / 2;
  const rCircum = a / Math.sqrt(3);
  const rIn = hBase / 3;

  // 局部 XY 为等边三角形；装配时绕 X 轴转 -90°，使主截面位于水平 XZ 平面。
  // 顶棱在 (0, rCircum)，朝向正上方 (+Y)
  // 右下底角在 (+a/2, -rIn)
  // 左下底角在 (-a/2, -rIn)
  // 棱柱深度沿 Z 轴两极分布：从 -depth/2 到 +depth/2，主截面严格在 (X, Y) 垂直平面内
  const halfZ = depth / 2;

  // 前端面三个顶点 (z = +halfZ, 正对操作者视线)
  const f0: [number, number, number] = [0, rCircum, halfZ];
  const f1: [number, number, number] = [a / 2, -rIn, halfZ];
  const f2: [number, number, number] = [-a / 2, -rIn, halfZ];

  // 后端面三个顶点 (z = -halfZ)
  const b0: [number, number, number] = [0, rCircum, -halfZ];
  const b1: [number, number, number] = [a / 2, -rIn, -halfZ];
  const b2: [number, number, number] = [-a / 2, -rIn, -halfZ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const addQuad = (
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    p4: [number, number, number],
    nx: number,
    ny: number,
    nz: number
  ) => {
    // 两个独立三角形构成平坦四边形光学面，法线绝对平直不插值，杜绝圆柱形光斑畸变
    positions.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    for (let k = 0; k < 6; k++) {
      normals.push(nx, ny, nz);
    }
    uvs.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
  };

  const addTri = (
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    nx: number,
    ny: number,
    nz: number
  ) => {
    positions.push(...p1, ...p2, ...p3);
    for (let k = 0; k < 3; k++) {
      normals.push(nx, ny, nz);
    }
    uvs.push(0.5, 1, 0, 0, 1, 0);
  };

  // 1. 前侧透明透光三角形端面 (Front Face, z = +halfZ，正对操作者视线)
  // 法线朝外：(0, 0, 1)
  addTri(f0, f2, f1, 0, 0, 1);

  // 2. 后侧透明透光三角形端面 (Back Face, z = -halfZ)
  // 法线朝外：(0, 0, -1)
  addTri(b0, b1, b2, 0, 0, -1);

  // 3. 左侧光学入射面 (Left Entrance Face, 沿斜面从底角向顶棱展开)
  // 法线严格朝向外侧左上方：(-sqrt(3)/2, 1/2, 0)
  const normLeft: [number, number, number] = [-Math.sqrt(3) / 2, 0.5, 0];
  addQuad(b2, f2, f0, b0, ...normLeft);

  // 4. 右侧光学出射面 (Right Exit Face, 沿斜面从顶棱向右下底角展开)
  // 法线严格朝向外侧右上方：(sqrt(3)/2, 1/2, 0)
  const normRight: [number, number, number] = [Math.sqrt(3) / 2, 0.5, 0];
  addQuad(b1, b0, f0, f1, ...normRight);

  // 5. 底部水平承托基准面 (Bottom Base Face, y = -rIn)
  // 法线朝下：(0, -1, 0)
  addQuad(f2, b2, b1, f1, 0, -1, 0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } catch {
    return null;
  }
}

/**
 * 光具座式光的色散实验台：准直灯箱、竖直三棱镜与双面毛玻璃屏。
 * 导轨沿 X 轴，刻度与旋钮朝向操作者 (+Z)。
 * 器材用枪灰阳极铝、哑光不锈钢和低饱和香槟铜，避开漂白银与亮橙金。
 */
const QUIET_RAIL: OpticalRailFinish = {
  satin: 0x8a94a0,
  skirt: 0x6e7884,
  channel: 0x4f5864,
  chrome: 0xffffff,
  brass: 0xc4cbd4, // 银灰钛金五金，杜绝亮黄
  scaleBackground: '#f1f5f9',
  scaleEdge: '#94a3b8',
  scaleTick: '#1e293b',
  scaleAccent: '#0284c7', // 纯正科技冷蓝刻度重点
};
export class OpticalDispersionBenchMesh {
  public readonly group = new THREE.Group();

  public readonly railLength = 0.50;
  public readonly railWidth = 0.07;
  public readonly railHeight = 0.042;

  public lampOn = true;
  public incidentAngleDeg = DISPERSION_BENCH.defaultIncidentDeg;
  public material: PrismMaterialType = 'flint';
  public slitWidthMm = 1.0;
  public screenDistanceM = DISPERSION_BENCH.defaultScreenDistanceM;

  public prismMount!: THREE.Group;
  public prismTilt!: THREE.Group;
  public screenCarrier!: THREE.Group;
  private beamGroup = new THREE.Group();
  private receiverArm = new THREE.Group();
  private receiverSlide = new THREE.Group();
  private screenPanel!: THREE.Group;
  private screenBackTexture: THREE.CanvasTexture | null = null;
  private angleGuide = new THREE.Group();
  private filament!: THREE.Mesh;
  private lampLed!: THREE.Mesh;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  private plateCanvas: HTMLCanvasElement | null = null;
  private plateTexture: THREE.CanvasTexture | null = null;
  private projection: DispersionProjection;

  // 射线交互对象缓存，避免每次指针检测时遍历 190+ 节点场景树
  private interactiveObjectsCache: THREE.Object3D[] | null = null;

  // 光束网格与材质池化复用，避免每次参数变动时反复创建/销毁几何体与材质引起掉帧与内存泄漏
  private readonly unitBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  private beamMeshPool: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private activeBeamIndex = 0;
  private fanMesh: THREE.Mesh | null = null;
  private fanGeo: THREE.BufferGeometry | null = null;
  private static readonly _BEAM_DIR = new THREE.Vector3();
  private static readonly _BEAM_MID = new THREE.Vector3();
  private static readonly _Y_AXIS = new THREE.Vector3(0, 1, 0);

  // 严禁使用廉价亮黄色，全面采用德系科研阳极银铝、镜面液态铬与深空钛晶灰
  private readonly titaniumSlate = new THREE.MeshStandardMaterial({
    color: 0x243242,
    metalness: 0.30,
    roughness: 0.40,
  });
  private readonly satin = new THREE.MeshStandardMaterial({
    color: 0xdde3ea,
    metalness: 0.55,
    roughness: 0.32,
  });
  private readonly chrome = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.12,
  });
  private readonly silverMat = new THREE.MeshStandardMaterial({
    color: 0xb0bec5,
    metalness: 0.65,
    roughness: 0.28,
  });
  private readonly satinSilverMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.82,
    roughness: 0.20,
  });
  private readonly bluedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.55,
    roughness: 0.28,
  });
  private readonly groundEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.98,
    roughness: 0.06,
  });
  private readonly datumLineMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.70,
    roughness: 0.35,
  });
  private readonly paper = new THREE.MeshBasicMaterial({ color: 0xffffff });

  constructor(options: OpticalDispersionOptions = {}) {
    this.group.name = 'OpticalDispersionBenchMesh';
    if (options.lampOn !== undefined) this.lampOn = options.lampOn;
    if (options.incidentAngleDeg !== undefined) this.incidentAngleDeg = options.incidentAngleDeg;
    if (options.material) this.material = options.material;
    if (options.slitWidthMm !== undefined) this.slitWidthMm = options.slitWidthMm;
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;

    this.projection = projectDispersionFan(this.incidentAngleDeg, this.material, this.screenDistanceM);
    this.buildRail();
    this.buildLamp();
    this.buildPrism();
    this.buildScreen();
    this.beamGroup.name = 'DispersionBeams';
    this.group.add(this.beamGroup);
    this.syncLampVisuals();
    this.syncAll();
  }

  public getProjection(): DispersionProjection {
    return this.projection;
  }

  public getTelemetry(): OpticalDispersionTelemetry {
    const spec = PRISM_MATERIALS[this.material];
    const { analysis, red, violet, spectrumSpanM } = this.projection;
    return {
      lampOn: this.lampOn,
      incidentAngleDeg: this.incidentAngleDeg,
      material: this.material,
      materialName: spec.name,
      slitWidthMm: this.slitWidthMm,
      screenDistanceM: this.screenDistanceM,
      yellowDeviationDeg: analysis.yellowRay.deviationAngleDeg,
      angularDispersionDeg: analysis.angularDispersionDeg,
      abbeNumber: analysis.abbeNumber,
      hasPartialTIR: analysis.hasPartialTIR,
      hasFullTIR: analysis.hasFullTIR,
      redHitU: red.hitU,
      violetHitU: violet.hitU,
      redOnScreen: red.onScreen,
      violetOnScreen: violet.onScreen,
      spectrumSpanM,
    };
  }

  public getScreenX(): number {
    return this.projection.screenCenter.x;
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    if (!this.interactiveObjectsCache) {
      const found: THREE.Object3D[] = [];
      this.group.traverse((obj) => {
        if (obj.userData?.interactiveId) found.push(obj);
      });
      this.interactiveObjectsCache = found;
    }
    return this.interactiveObjectsCache;
  }

  public setLampOn(on: boolean): void {
    this.lampOn = on;
    this.syncLampVisuals();
    this.syncAll();
  }

  public setIncidentAngle(deg: number): void {
    this.incidentAngleDeg = THREE.MathUtils.clamp(
      deg,
      DISPERSION_BENCH.minIncidentDeg,
      DISPERSION_BENCH.maxIncidentDeg,
    );
    this.syncAll();
  }

  public setMaterial(material: PrismMaterialType): void {
    this.material = PRISM_MATERIALS[material] ? material : 'flint';
    this.syncAll();
  }

  public cycleMaterial(): PrismMaterialType {
    const index = DISPERSION_MATERIALS.indexOf(this.material);
    const next = DISPERSION_MATERIALS[(index + 1) % DISPERSION_MATERIALS.length];
    this.setMaterial(next);
    return next;
  }

  public setSlitWidth(mm: number): void {
    this.slitWidthMm = THREE.MathUtils.clamp(mm, 0.4, 3.5);
    this.syncAll();
  }

  public setScreenDistance(meters: number): void {
    this.screenDistanceM = THREE.MathUtils.clamp(
      meters,
      DISPERSION_BENCH.minScreenDistanceM,
      DISPERSION_BENCH.maxScreenDistanceM,
    );
    this.syncAll();
  }

  public setScreenX(x: number): void {
    const delta = (x - this.getScreenX()) / Math.max(0.05, this.projection.screenNormal.x);
    this.setScreenDistance(this.screenDistanceM + delta);
  }

  public update(_elapsed: number): void {
    // 静态科研级光源与光学器件：状态由交互驱动，杜绝逐帧冗余 Uniform 刷新与 GPU 重绘
  }

  private syncLampVisuals(): void {
    if (this.filament) {
      const mat = this.filament.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = this.lampOn ? 1.4 : 0.02;
    }
    if (this.lampLed) {
      const ledMat = this.lampLed.material as THREE.MeshStandardMaterial;
      ledMat.color.setHex(this.lampOn ? 0x10b981 : 0x064e3b);
      ledMat.emissive.setHex(this.lampOn ? 0x10b981 : 0x000000);
      ledMat.emissiveIntensity = this.lampOn ? 1.5 : 0;
    }
  }

  public dispose(): void {
    this.interactiveObjectsCache = null;
    this.unitBeamGeo.dispose();
    this.fanGeo?.dispose();
    (this.fanMesh?.material as THREE.Material | undefined)?.dispose();
    for (const mesh of this.beamMeshPool) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.beamMeshPool = [];
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== this.unitBeamGeo) geos.add(mesh.geometry);
      const material = mesh.material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const entry of list) {
        mats.add(entry);
        const mapped = entry as THREE.MeshStandardMaterial;
        if (mapped.map) textures.add(mapped.map);
      }
    });
    geos.forEach((geo) => geo.dispose());
    mats.forEach((mat) => mat.dispose());
    textures.forEach((tex) => tex.dispose());
  }

  private syncAll(): void {
    this.projection = projectDispersionFan(this.incidentAngleDeg, this.material, this.screenDistanceM);
    this.prismTilt.rotation.set(0, prismRotationY(this.incidentAngleDeg), 0);
    const { screenCenter, screenNormal } = this.projection;
    this.screenCarrier.position.set(screenCenter.x, 0, screenCenter.z);
    const armAngle = -Math.atan2(screenNormal.z, screenNormal.x);
    this.screenCarrier.rotation.y = armAngle;
    this.screenPanel.rotation.y = Math.PI / 2;
    this.receiverArm.rotation.y = armAngle;
    // 固定回转中心与棱镜转台同轴；短燕尾滑台补偿真实出射点相对转轴的偏移。
    const exit = screenCenter.clone().addScaledVector(screenNormal, -this.screenDistanceM);
    const relative = exit.sub(new THREE.Vector3(DISPERSION_BENCH.prismX, DISPERSION_BENCH.beamY, 0));
    this.receiverSlide.position.set(relative.dot(screenNormal), 0, -relative.dot(this.projection.screenTangent));
    const spec = PRISM_MATERIALS[this.material];
    this.glassMat.color.setHex(0xd8ebf4);
    this.glassMat.ior = spec.nd;
    this.glassMat.emissive.setHex(this.lampOn ? spec.emissiveHex : 0x000000);
    this.glassMat.emissiveIntensity = this.lampOn ? 0.025 : 0.0;
    this.paintPlate();
    this.paintScreen();
    this.rebuildBeams();
  }

  private buildRail(): void {
    const source = buildPrecisionOpticalRail({
      length: this.railLength, width: this.railWidth, height: this.railHeight,
      name: 'DispersionRail', finish: QUIET_RAIL, attachedEnd: true, scaleLengthM: 0.44,
    });
    // 源轨在回转底座左侧终止，接头处没有多余端盖和支脚。
    source.group.position.x = -0.31;
    this.group.add(source.group);

    const joint = new THREE.Group();
    joint.name = 'DispersionRailSwivel';
    joint.position.x = DISPERSION_BENCH.prismX;
    this.group.add(joint);
    const turnedGeometry = (profile: number[][]) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const base = new THREE.Mesh(turnedGeometry([
      [0, -0.008], [0.070, -0.008], [0.078, -0.003], [0.078, 0.010],
      [0.073, 0.015], [0.064, 0.015], [0.064, 0.027], [0, 0.027],
    ]), this.satin);
    base.name = 'RailSwivelBase';
    base.castShadow = true;
    joint.add(base);
    const sourceFlange = new THREE.Mesh(createChamferedBlockGeometry(0.065, 0.012, 0.062, 0.002), this.satin);
    sourceFlange.name = 'SourceRailJointFlange';
    sourceFlange.position.set(-0.068, 0.030, 0);
    joint.add(sourceFlange);
    for (const z of [-0.020, 0.020]) {
      const bolt = new THREE.Mesh(createChamferedHexNut(0.003, 0.002), this.chrome);
      bolt.position.set(-0.067, 0.038, z);
      joint.add(bolt);
    }
    const support = new THREE.Mesh(turnedGeometry([
      [0, 0.026], [0.031, 0.026], [0.035, 0.030], [0.035, 0.040], [0.031, 0.043], [0, 0.043],
    ]), this.satin);
    support.name = 'PrismTurntableSupport';
    joint.add(support);
    for (const angle of [90, 210, 330]) {
      const a = THREE.MathUtils.degToRad(angle);
      const foot = new THREE.Mesh(createKnurledBand(0.012, 0.0075), this.silverMat);
      foot.position.set(0.055 * Math.cos(a), -0.014, 0.055 * Math.sin(a));
      joint.add(foot);
    }
    const ticks: number[] = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const a = THREE.MathUtils.degToRad(deg);
      const inner = deg % 30 === 0 ? 0.069 : 0.072;
      ticks.push(inner * Math.cos(a), 0.0153, inner * Math.sin(a),
        0.076 * Math.cos(a), 0.0153, 0.076 * Math.sin(a));
    }
    const graduations = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute(ticks, 3)), new THREE.LineBasicMaterial({color: 0x526778, toneMapped: false}));
    graduations.raycast = () => {};
    joint.add(graduations);

    this.receiverArm.name = 'DispersionReceivingArm';
    this.receiverArm.position.x = DISPERSION_BENCH.prismX;
    const rotor = new THREE.Mesh(turnedGeometry([
      [0.044, 0.027], [0.065, 0.027], [0.068, 0.030], [0.068, 0.036],
      [0.065, 0.039], [0.044, 0.039], [0.044, 0.027],
    ]), this.silverMat);
    rotor.name = 'RailSwivelRotor';
    this.receiverArm.add(rotor);
    const lock = new THREE.Mesh(createKnurledBand(0.009, 0.010), this.chrome);
    lock.position.set(0, 0.024, 0.083);
    this.receiverArm.add(lock);
    const index = new THREE.Mesh(createChamferedBlockGeometry(0.008, 0.001, 0.002, 0.0003),
      new THREE.MeshBasicMaterial({ color: 0x0284c7 }));
    index.position.set(0.068, 0.040, 0);
    this.receiverArm.add(index);

    this.receiverSlide.name = 'RailExitAlignmentSlide';
    const tongue = new THREE.Mesh(createChamferedBlockGeometry(0.110, 0.012, 0.040, 0.002), this.satin);
    tongue.name = 'RailSwivelTongue';
    tongue.position.set(0.050, 0.028, 0);
    this.receiverSlide.add(tongue);
    for (const z of [-0.021, 0.021]) {
      const dovetail = new THREE.Mesh(createChamferedBlockGeometry(0.075, 0.006, 0.005, 0.0008), this.silverMat);
      dovetail.position.set(0.040, 0.035, z);
      this.receiverSlide.add(dovetail);
    }
    for (const x of [0.028, 0.065]) {
      const bolt = new THREE.Mesh(createChamferedHexNut(0.003, 0.002), this.chrome);
      bolt.position.set(x, 0.039, 0);
      this.receiverSlide.add(bolt);
    }
    const arm = buildPrecisionOpticalRail({ length: 0.49, width: 0.055, height: this.railHeight,
      name: 'DispersionReceivingRail', finish: QUIET_RAIL, attachedStart: true, scaleLengthM: 0.45 });
    arm.group.position.x = 0.320;
    this.receiverSlide.add(arm.group);
    this.receiverArm.add(this.receiverSlide);
    this.group.add(this.receiverArm);
  }

  private addCarrier(x: number, name: string, id: string, postTop = 0.152): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, 0);
    group.userData.interactiveId = id;

    // CNC 切削德系阳极氧化钛晶灰蓝铝制滑座基座
    const shoe = new THREE.Mesh(createChamferedBlockGeometry(0.074, 0.020, 0.082, 0.002), this.titaniumSlate);
    shoe.position.set(0, this.railHeight + 0.010, 0);
    shoe.castShadow = true;
    shoe.receiveShadow = true;
    shoe.userData.interactiveId = id;
    group.add(shoe);

    // 正面高精度导轨毫米刻度对齐读数游标指针与基准板
    const indexPlate = new THREE.Mesh(createChamferedBlockGeometry(0.016, 0.018, 0.003, 0.0008), this.satin);
    indexPlate.position.set(0, this.railHeight + 0.004, 0.041);
    group.add(indexPlate);

    const indexHairline = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.016, 0.001), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    indexHairline.position.set(0, this.railHeight + 0.004, 0.043);
    group.add(indexHairline);

    // 侧边燕尾槽精密导轨锁紧手轮 (液态铬镜面滚花旋钮 + 不锈钢连接轴，拒绝廉价黄色)
    const clampShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 16), this.chrome);
    clampShaft.rotation.z = Math.PI / 2;
    clampShaft.position.set(0.038, this.railHeight + 0.010, 0);
    group.add(clampShaft);

    const clampKnob = new THREE.Mesh(createKnurledBand(0.009, 0.007), this.chrome);
    clampKnob.rotation.z = Math.PI / 2;
    clampKnob.position.set(0.043, this.railHeight + 0.010, 0);
    group.add(clampKnob);

    // 基座四角精密内六角加固螺栓
    const boltOffsets = [
      [-0.028, -0.030],
      [-0.028, 0.030],
      [0.028, -0.030],
      [0.028, 0.030],
    ];
    for (const [bx, bz] of boltOffsets) {
      const bolt = new THREE.Mesh(createChamferedHexNut(0.0024, 0.002), this.chrome);
      bolt.position.set(bx, this.railHeight + 0.020, bz);
      group.add(bolt);
    }

    // 重型车削立柱承座与银色锁紧环
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.028, 28), this.titaniumSlate);
    collar.position.set(0, this.railHeight + 0.026, 0);
    collar.castShadow = true;
    group.add(collar);

    const lockRing = new THREE.Mesh(createKnurledBand(0.0145, 0.008), this.silverMat);
    lockRing.position.set(0, this.railHeight + 0.032, 0);
    group.add(lockRing);

    // 立柱侧边高低微调紧固手柄
    const postLockShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.005, 16), this.chrome);
    postLockShaft.rotation.x = Math.PI / 2;
    postLockShaft.position.set(0, this.railHeight + 0.028, 0.015);
    group.add(postLockShaft);

    const postLockKnob = new THREE.Mesh(createKnurledBand(0.007, 0.006), this.chrome);
    postLockKnob.rotation.x = Math.PI / 2;
    postLockKnob.position.set(0, this.railHeight + 0.028, 0.019);
    group.add(postLockKnob);

    // 镜面 316L 不锈钢升降立柱导杆
    const post = new THREE.Mesh(createGuideShaftGeometry(postTop - (this.railHeight + 0.020), 0.0075), this.chrome);
    post.position.set(0, (postTop + this.railHeight + 0.020) * 0.5, 0);
    post.castShadow = true;
    group.add(post);

    this.group.add(group);
    return group;
  }

  private buildLamp(): void {
    const mount = this.addCarrier(DISPERSION_BENCH.lampX, 'LampCarrier', 'lamp_switch');

    // 1. 双色 CNC 精密航空机箱箱体
    const housing = new THREE.Mesh(createChamferedBlockGeometry(0.096, 0.088, 0.080, 0.003), this.titaniumSlate);
    housing.position.set(0, DISPERSION_BENCH.beamY, 0);
    housing.castShadow = true;
    housing.userData.interactiveId = 'lamp_switch';
    mount.add(housing);

    // 前面板缎面银铝外嵌框与角部紧固螺栓
    const frontPlate = new THREE.Mesh(createChamferedBlockGeometry(0.006, 0.084, 0.076, 0.002), this.satin);
    frontPlate.position.set(0.046, DISPERSION_BENCH.beamY, 0);
    mount.add(frontPlate);

    const fBolts = [
      [DISPERSION_BENCH.beamY + 0.034, -0.030],
      [DISPERSION_BENCH.beamY + 0.034, 0.030],
      [DISPERSION_BENCH.beamY - 0.034, -0.030],
      [DISPERSION_BENCH.beamY - 0.034, 0.030],
    ];
    for (const [fy, fz] of fBolts) {
      const bolt = new THREE.Mesh(createChamferedHexNut(0.0025, 0.002), this.chrome);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(0.049, fy, fz);
      mount.add(bolt);
    }

    // 2. 顶部散热风道风帽与横向导热翅片
    const chimney = new THREE.Mesh(createChamferedBlockGeometry(0.062, 0.014, 0.054, 0.0016), this.satin);
    chimney.position.set(-0.006, DISPERSION_BENCH.beamY + 0.050, 0);
    mount.add(chimney);

    for (let i = -2; i <= 2; i++) {
      const fin = new THREE.Mesh(createChamferedBlockGeometry(0.056, 0.004, 0.004, 0.0006), this.titaniumSlate);
      fin.position.set(-0.006, DISPERSION_BENCH.beamY + 0.057, i * 0.009);
      mount.add(fin);
    }

    // 3. 机箱两侧精密通风散热百叶窗
    for (const zSide of [-1, 1]) {
      const louverPanel = new THREE.Mesh(createChamferedBlockGeometry(0.050, 0.040, 0.003, 0.001), this.satin);
      louverPanel.position.set(-0.008, DISPERSION_BENCH.beamY, zSide * 0.041);
      mount.add(louverPanel);

      for (let i = -2; i <= 2; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.003, 0.002), this.titaniumSlate);
        slat.position.set(-0.008, DISPERSION_BENCH.beamY + i * 0.007, zSide * 0.0425);
        mount.add(slat);
      }
    }

    // 4. 多级准直聚光物镜筒 (镜面镀铬镜筒 + 镜面液态铬调焦环 + 增透镀膜物镜，全面去黄)
    const barrelBase = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.010, 32), this.titaniumSlate);
    barrelBase.rotation.z = Math.PI / 2;
    barrelBase.position.set(0.053, DISPERSION_BENCH.beamY, 0);
    mount.add(barrelBase);

    const innerTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.024, 32), this.chrome);
    innerTube.rotation.z = Math.PI / 2;
    innerTube.position.set(0.065, DISPERSION_BENCH.beamY, 0);
    mount.add(innerTube);

    const focusCollar = new THREE.Mesh(createKnurledBand(0.0245, 0.010), this.chrome);
    focusCollar.rotation.z = Math.PI / 2;
    focusCollar.position.set(0.068, DISPERSION_BENCH.beamY, 0);
    mount.add(focusCollar);

    const bezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.0028, 12, 36), this.satin);
    bezelRing.rotation.y = Math.PI / 2;
    bezelRing.position.set(0.078, DISPERSION_BENCH.beamY, 0);
    mount.add(bezelRing);

    // 前端增透镀膜聚光物镜 (高透明度科研玻璃，免 transmission 避免全场景额外渲染通道与 GPU 掉帧)
    const lensGeo = new THREE.SphereGeometry(0.021, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8ebf4,
      roughness: 0.02,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const frontLens = new THREE.Mesh(lensGeo, lensMat);
    frontLens.rotation.z = -Math.PI / 2;
    frontLens.position.set(0.076, DISPERSION_BENCH.beamY, 0);
    mount.add(frontLens);

    // 5. 内部卤素灯珠、抛物面聚光反光碗与高亮灯丝
    const reflector = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 24, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.08, side: THREE.BackSide }),
    );
    reflector.rotation.z = -Math.PI / 2;
    reflector.position.set(0.010, DISPERSION_BENCH.beamY, 0);
    mount.add(reflector);

    this.filament = new THREE.Mesh(
      new THREE.SphereGeometry(0.010, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    this.filament.position.set(0.038, DISPERSION_BENCH.beamY, 0);
    mount.add(this.filament);

    // 6. 背板电源翘板开关、运行状态指示 LED 与工业螺旋耐折柔性电缆
    const switchBezel = new THREE.Mesh(createChamferedBlockGeometry(0.022, 0.016, 0.004, 0.001), this.titaniumSlate);
    switchBezel.position.set(-0.049, DISPERSION_BENCH.beamY - 0.015, 0.020);
    mount.add(switchBezel);

    const rocker = new THREE.Mesh(createChamferedBlockGeometry(0.016, 0.010, 0.006, 0.001), this.silverMat);
    rocker.name = 'LampSwitch';
    rocker.userData.interactiveId = 'lamp_switch';
    rocker.position.set(-0.049, DISPERSION_BENCH.beamY - 0.015, 0.020);
    mount.add(rocker);

    // 绿色工作状态指示灯
    const ledBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0045, 0.003, 16), this.chrome);
    ledBezel.rotation.z = Math.PI / 2;
    ledBezel.position.set(-0.049, DISPERSION_BENCH.beamY + 0.015, 0.020);
    mount.add(ledBezel);

    this.lampLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 1.5,
      }),
    );
    this.lampLed.position.set(-0.050, DISPERSION_BENCH.beamY + 0.015, 0.020);
    mount.add(this.lampLed);

    // 电缆接头与耐温柔性波纹电缆
    const gland = new THREE.Mesh(createChamferedHexNut(0.006, 0.008), this.chrome);
    gland.rotation.z = Math.PI / 2;
    gland.position.set(-0.051, DISPERSION_BENCH.beamY - 0.026, -0.018);
    mount.add(gland);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.054, DISPERSION_BENCH.beamY - 0.026, -0.018),
      new THREE.Vector3(-0.082, 0.12, -0.010),
      new THREE.Vector3(-0.075, 0.065, 0.025),
      new THREE.Vector3(-0.055, 0.046, 0.040),
    ]);
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 18, 0.004, 10, false),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.15 }),
    );
    mount.add(cable);
  }

  private buildPrism(): void {
    this.prismMount = new THREE.Group();
    this.prismMount.name = 'PrismMount';
    this.prismMount.position.set(DISPERSION_BENCH.prismX, 0, 0);
    this.group.add(this.prismMount);

    // 1. 三棱镜滑座基座
    const shoe = new THREE.Mesh(createChamferedBlockGeometry(0.092, 0.020, 0.092, 0.002), this.titaniumSlate);
    shoe.position.set(0, this.railHeight + 0.010, 0);
    shoe.userData.interactiveId = 'prism_turntable';
    shoe.castShadow = true;
    shoe.receiveShadow = true;
    this.prismMount.add(shoe);

    // 正面高精度导轨毫米刻度对齐读数游标指针与基准板
    const indexPlate = new THREE.Mesh(createChamferedBlockGeometry(0.016, 0.018, 0.003, 0.0008), this.satin);
    indexPlate.position.set(0, this.railHeight + 0.004, 0.046);
    this.prismMount.add(indexPlate);

    const indexHairline = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.016, 0.001), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    indexHairline.position.set(0, this.railHeight + 0.004, 0.048);
    this.prismMount.add(indexHairline);

    const pBolts = [
      [-0.034, -0.034],
      [-0.034, 0.034],
      [0.034, -0.034],
      [0.034, 0.034],
    ];
    for (const [bx, bz] of pBolts) {
      const bolt = new THREE.Mesh(createChamferedHexNut(0.0025, 0.002), this.chrome);
      bolt.position.set(bx, this.railHeight + 0.020, bz);
      this.prismMount.add(bolt);
    }

    // 竖直转轴、水平载物台。玻璃竖放，底面高于全部固定轴承。
    const post = new THREE.Mesh(createGuideShaftGeometry(0.080, 0.009), this.chrome);
    post.name = 'PrismSupportPost';
    post.position.y = 0.110;
    this.prismMount.add(post);
    const bearing = new THREE.Mesh(createContactCollar(0.012, 0.016), this.satin);
    bearing.name = 'PrismBearing';
    bearing.position.y = 0.144;
    this.prismMount.add(bearing);
    const matCollar = new THREE.Mesh(createKnurledBand(0.017, 0.012), this.chrome);
    matCollar.name = 'MaterialCollar';
    matCollar.userData.interactiveId = 'material_collar';
    matCollar.position.y = 0.079;
    this.prismMount.add(matCollar);

    this.prismTilt = new THREE.Group();
    this.prismTilt.name = 'PrismTilt';
    this.prismTilt.position.y = DISPERSION_BENCH.beamY;
    this.prismMount.add(this.prismTilt);
    const offset = prismCenterOffset();
    const bottomY = -DISPERSION_BENCH.prismDepth / 2;
    const hub = new THREE.Mesh(createKnurledBand(0.023, 0.006), this.chrome);
    hub.position.y = -0.047;
    this.prismTilt.add(hub);
    const tray = new THREE.Mesh(createChamferedBlockGeometry(0.100, 0.004, 0.096, 0.002), this.satin);
    tray.name = 'PrismSupportTray';
    tray.position.set(offset.x, bottomY - 0.003, offset.z);
    tray.userData.interactiveId = 'prism_turntable';
    this.prismTilt.add(tray);
    // 三个小承托点均位于三角形的水平底面之内。
    for (const [x, z] of [[0, -0.030], [-0.025, 0.012], [0.025, 0.012]]) {
      const pad = new THREE.Mesh(createChamferedBlockGeometry(0.008, 0.001, 0.008, 0.0002), this.silverMat);
      pad.name = 'PrismContactPad';
      pad.geometry.computeBoundingBox();
      pad.position.set(offset.x + x, bottomY - pad.geometry.boundingBox!.max.y, offset.z + z);
      this.prismTilt.add(pad);
    }
    const prismGeo = createPrecisionTriangularPrismGeometry(DISPERSION_BENCH.prismSide, DISPERSION_BENCH.prismDepth);
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0xd8ebf4, roughness: 0.035, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.9, transparent: true, opacity: 0.32,
      depthWrite: false, side: THREE.FrontSide, ior: 1.725 });
    const glass = new THREE.Mesh(prismGeo, this.glassMat);
    glass.name = 'DispersionPrism';
    glass.rotation.x = -Math.PI / 2;
    glass.position.copy(offset);
    glass.userData.interactiveId = 'prism_turntable';
    this.prismTilt.add(glass);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(prismGeo, 25),
      new THREE.LineBasicMaterial({ color: 0x7096a5, transparent: true, opacity: 0.78, toneMapped: false }));
    edges.rotation.copy(glass.rotation);
    edges.position.copy(offset);
    edges.raycast = () => {};
    this.prismTilt.add(edges);
    this.angleGuide.name = 'PrismIncidentAngleGuide';
    this.group.add(this.angleGuide);

    // 3. 下方圆形度数指示表盘 (纯正圆形表盘，仅显示度数，零黄色)
    this.plateCanvas = safeCanvas(512, 512);
    if (this.plateCanvas) {
      this.plateTexture = new THREE.CanvasTexture(this.plateCanvas);
      this.plateTexture.colorSpace = THREE.SRGBColorSpace;

      const gaugeGroup = new THREE.Group();
      gaugeGroup.name = 'PrismAngleGauge';
      gaugeGroup.position.set(0, this.railHeight + 0.052, 0.048);
      gaugeGroup.userData.interactiveId = 'prism_turntable';

      // 表盘紧固托架
      const bracket = new THREE.Mesh(createChamferedBlockGeometry(0.010, 0.016, 0.008, 0.001), this.titaniumSlate);
      bracket.position.set(0, -0.012, -0.004);
      gaugeGroup.add(bracket);

      const boltL = new THREE.Mesh(createChamferedHexNut(0.002, 0.002), this.chrome);
      boltL.position.set(-0.003, -0.012, 0.001);
      gaugeGroup.add(boltL);
      const boltR = new THREE.Mesh(createChamferedHexNut(0.002, 0.002), this.chrome);
      boltR.position.set(0.003, -0.012, 0.001);
      gaugeGroup.add(boltR);

      // 圆形外壳与液态铬镜面滚花边框 (彻底去除黄色)
      const gaugeHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 48), this.titaniumSlate);
      gaugeHousing.rotation.x = Math.PI / 2;
      gaugeGroup.add(gaugeHousing);

      const knurledBezel = new THREE.Mesh(createKnurledBand(0.0248, 0.004), this.chrome);
      knurledBezel.rotation.x = Math.PI / 2;
      gaugeGroup.add(knurledBezel);

      const chromeRim = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.0016, 12, 48), this.satin);
      chromeRim.position.set(0, 0, 0.0026);
      gaugeGroup.add(chromeRim);

      // 圆形表盘盘面 (仅显示度数)
      const faceGeo = new THREE.CircleGeometry(0.0218, 48);
      const faceMat = new THREE.MeshBasicMaterial({
        map: this.plateTexture,
      });
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(0, 0, 0.0028);
      face.userData.interactiveId = 'prism_turntable';
      gaugeGroup.add(face);

      // 高透水晶表镜 (高透光度免 transmission，消除表盘渲染管线开销)
      const crystalGeo = new THREE.CircleGeometry(0.0218, 48);
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0xf8fafc,
        roughness: 0.04,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        reflectivity: 0.95,
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.set(0, 0, 0.0032);
      gaugeGroup.add(crystal);

      this.prismMount.add(gaugeGroup);
    }
  }

  private buildScreen(): void {
    this.screenCarrier = this.addCarrier(this.getScreenX(), 'ScreenCarrier', 'screen_carrier', DISPERSION_BENCH.screenCenterY - DISPERSION_BENCH.screenHeight / 2 - 0.004);
    // This compact screen mounts directly onto the carrier's existing upright.
    const panel = this.screenPanel = new THREE.Group();
    panel.name = 'DispersionScreenPanel';
    panel.position.y = DISPERSION_BENCH.screenCenterY;
    this.screenCarrier.add(panel);
    const w = DISPERSION_BENCH.screenWidth, h = DISPERSION_BENCH.screenHeight;
    for (const side of [-1, 1]) {
      const upright = new THREE.Mesh(createChamferedBlockGeometry(0.004, h + 0.008, 0.007, 0.001), this.satin);
      upright.position.x = side * (w / 2 + 0.002);
      upright.userData.interactiveId = 'screen_carrier';
      panel.add(upright);
      const rim = new THREE.Mesh(createChamferedBlockGeometry(w + 0.008, 0.004, 0.007, 0.001), this.satin);
      rim.position.y = side * (h / 2 + 0.002);
      panel.add(rim);
    }
    const bracket = new THREE.Mesh(createChamferedBlockGeometry(0.036, 0.008, 0.025, 0.001), this.satin);
    bracket.name = 'ScreenLowerClamp';
    bracket.position.set(0, -DISPERSION_BENCH.screenHeight / 2 - 0.001, 0);
    panel.add(bracket);
    const sheet = new THREE.Mesh(createChamferedBlockGeometry(w, h, 0.0015, 0.0002),
      new THREE.MeshStandardMaterial({ color: 0xfafaf7, roughness: 0.95 }));
    panel.add(sheet);
    this.screenCanvas = safeCanvas(900, 800);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.colorSpace = THREE.SRGBColorSpace;
      this.paper.map = this.screenTexture;
      this.screenBackTexture = this.screenTexture.clone();
      this.screenBackTexture.repeat.x = -1;
      this.screenBackTexture.offset.x = 1;
    }
    this.paper.toneMapped = false;
    for (const side of [1, -1]) {
      const mat = side === 1 ? this.paper : this.paper.clone();
      if (side === -1) mat.map = this.screenBackTexture;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      face.name = side === 1 ? 'DispersionScreen' : 'DispersionScreenReceivingFace';
      face.position.z = side * DISPERSION_BENCH.screenFaceZ;
      if (side === -1) face.rotation.y = Math.PI;
      face.userData.interactiveId = 'screen_carrier';
      panel.add(face);
    }
  }

  private paintPlate(): void {
    const ctx = this.plateCanvas?.getContext('2d');
    if (!ctx || !this.plateCanvas || !this.plateTexture) return;
    const { width, height } = this.plateCanvas;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.48;

    // 深邃深海蓝宝石圆形底色 (高科技防眩质感)
    ctx.fillStyle = '#070f1e';
    if (typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function' && typeof ctx.fill === 'function') {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 银色外分度圈 (去除黄色)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
      ctx.stroke();

      // 内层荧光青蓝饰环
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 16, 0, Math.PI * 2);
      ctx.stroke();

      // 激光蚀刻圆周角度细密刻度线 (360度每10度一刻，主刻度加长)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 2.5;
      for (let deg = 0; deg < 360; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const tickLen = isMajor ? 14 : 7;
        const r1 = r - 18;
        const r2 = r1 - tickLen;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
        ctx.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
        ctx.stroke();
      }

      // 顶部零位游标三角指引 (荧光科技青蓝)
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 18);
      ctx.lineTo(cx - 7, cy - r + 30);
      ctx.lineTo(cx + 7, cy - r + 30);
      ctx.closePath?.();
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, width, height);
    }

    // 只显示度数 (严格遵循用户要求：圆形表盘，只显示度数)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 118px "SF Pro Display", "SF Mono", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '40px system-ui, sans-serif';
    ctx.fillStyle = '#b9d8e8';
    ctx.fillText('入射角 θ₁', cx, cy - 90);
    ctx.font = 'bold 112px "SF Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${this.projection.rays[0].incidentAngleDeg.toFixed(1)}°`, cx, cy + 28);

    this.plateTexture.needsUpdate = true;
  }

  private paintScreen(): void {
    const ctx = this.screenCanvas?.getContext('2d');
    if (!ctx || !this.screenCanvas || !this.screenTexture) return;
    const { width, height } = this.screenCanvas;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fafaf7';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#8b9498';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('毛玻璃接光屏', width / 2, height - 26);
    if (this.lampOn) {
      // Each spot is placed from its own geometric screen intersection.
      const rays = this.projection.rays;
      const stripeH = height * (2 * DISPERSION_BENCH.beamHalfDepth / DISPERSION_BENCH.screenHeight);
      const py = height / 2;
      const uToPx = (u: number) => (u / DISPERSION_BENCH.screenWidth + 0.5) * width;
      for (let i = 0; i < rays.length - 1; i++) {
        const a = rays[i], b = rays[i + 1];
        if (!a.onScreen || !b.onScreen) continue;
        const x1 = uToPx(a.hitU), x2 = uToPx(b.hitU);
        if (typeof ctx.createLinearGradient === 'function' && Math.abs(x2 - x1) > 0.01) {
          const gradient = ctx.createLinearGradient(x1, 0, x2, 0);
          gradient.addColorStop(0, a.css); gradient.addColorStop(1, b.css);
          ctx.fillStyle = gradient;
        } else ctx.fillStyle = a.css;
        ctx.fillRect(Math.min(x1, x2), py - stripeH / 2, Math.max(1, Math.abs(x2 - x1)), stripeH);
      }
      for (const ray of rays) {
        if (!ray.onScreen) continue;
        ctx.fillStyle = ray.css;
        ctx.fillRect(uToPx(ray.hitU) - 1, py - stripeH / 2, 2, stripeH);
      }
    }
    this.screenTexture.needsUpdate = true;
    if (this.screenBackTexture) this.screenBackTexture.needsUpdate = true;
  }

  private rebuildBeams(): void {
    this.activeBeamIndex = 0;
    this.angleGuide.children.forEach(obj => {
      const line = obj as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.angleGuide.clear();
    const first = this.projection.red.interfaces[0];
    const guideY = DISPERSION_BENCH.beamY + 0.001;
    const normalStart = first.point.clone().addScaledVector(first.normal, -0.028);
    const normalEnd = first.point.clone().addScaledVector(first.normal, 0.058);
    normalStart.y = normalEnd.y = guideY;
    const normalLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([normalStart, normalEnd]),
      new THREE.LineDashedMaterial({ color: 0x567a8d, dashSize: 0.004, gapSize: 0.003, toneMapped: false }));
    normalLine.name = 'PrismEntranceNormal';
    normalLine.computeLineDistances();
    normalLine.raycast = () => {};
    this.angleGuide.add(normalLine);
    const arc: THREE.Vector3[] = [];
    const angle = THREE.MathUtils.degToRad(this.projection.red.incidentAngleDeg);
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + angle * i / 24;
      arc.push(new THREE.Vector3(first.point.x + 0.026 * Math.cos(a), guideY, first.point.z + 0.026 * Math.sin(a)));
    }
    const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc),
      new THREE.LineBasicMaterial({ color: 0x567a8d, toneMapped: false }));
    arcLine.raycast = () => {};
    this.angleGuide.add(arcLine);
    if (this.lampOn) {
      this.setBeam(new THREE.Vector3(DISPERSION_BENCH.lampX + 0.076, DISPERSION_BENCH.beamY, 0), first.point, 0xffffff, 0.0014, 0.9);
      for (const [index, ray] of this.projection.rays.entries()) {
        for (let i = 1; i < ray.interfaces.length; i++) {
          this.setBeam(ray.interfaces[i - 1].point, ray.interfaces[i].point, ray.hex, 0.00045, 0.88);
        }
        if (ray.exit && ray.direction) {
          // The continuous fan already contains these paths. Drawing cylinders through
          // its centre makes a third stripe when the two horizontal faces are edge-on.
          const inFan = ray.onScreen && (this.projection.rays[index - 1]?.onScreen || this.projection.rays[index + 1]?.onScreen);
          if (inFan) continue;
          const end = ray.onScreen ? ray.hit! : ray.exit.clone().addScaledVector(ray.direction, 0.10);
          this.setBeam(ray.exit, end, ray.hex, 0.00065, 0.96);
        }
      }
    }
    const positions: number[] = [], colors: number[] = [];
    const rays = this.projection.rays;
    const halfH = DISPERSION_BENCH.beamHalfDepth;
    const addQuad = (points: THREE.Vector3[], shades: THREE.Color[], outward: THREE.Vector3) => {
      // Keep the closed shell outward-facing so only its nearest surface is blended.
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      const indices = normal.dot(outward) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const index of indices) {
        const point = points[index], color = shades[index];
        positions.push(point.x, point.y, point.z);
        colors.push(color.r, color.g, color.b);
      }
    };
    const raised = (point: THREE.Vector3, side: number) => point.clone().addScaledVector(OpticalDispersionBenchMesh._Y_AXIS, side * halfH);
    if (this.lampOn) for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i], b = rays[i + 1];
      if (!a.onScreen || !b.onScreen) continue;
      const c1 = new THREE.Color(a.hex), c2 = new THREE.Color(b.hex);
      // A closed, continuous shell: horizontal faces, entrance/receiver caps and
      // the two outer spectral walls. No walls between neighbouring colours.
      for (const side of [-1, 1]) {
        addQuad([raised(a.exit!, side), raised(a.hit!, side), raised(b.hit!, side), raised(b.exit!, side)],
          [c1, c1, c2, c2], new THREE.Vector3(0, side, 0));
      }
      addQuad([raised(a.exit!, -1), raised(a.exit!, 1), raised(b.exit!, 1), raised(b.exit!, -1)],
        [c1, c1, c2, c2], a.interfaces[a.interfaces.length - 1].normal.clone().negate());
      addQuad([raised(a.hit!, -1), raised(a.hit!, 1), raised(b.hit!, 1), raised(b.hit!, -1)],
        [c1, c1, c2, c2], this.projection.screenNormal);
      if (!rays[i - 1]?.onScreen) {
        const outward = a.exit!.clone().sub(b.exit!).add(a.hit!.clone().sub(b.hit!));
        addQuad([raised(a.exit!, -1), raised(a.exit!, 1), raised(a.hit!, 1), raised(a.hit!, -1)],
          [c1, c1, c1, c1], outward);
      }
      if (!rays[i + 2]?.onScreen) {
        const outward = b.exit!.clone().sub(a.exit!).add(b.hit!.clone().sub(a.hit!));
        addQuad([raised(b.exit!, -1), raised(b.exit!, 1), raised(b.hit!, 1), raised(b.hit!, -1)],
          [c2, c2, c2, c2], outward);
      }
    }
    if (!this.fanGeo) {
      this.fanGeo = new THREE.BufferGeometry();
      this.fanMesh = new THREE.Mesh(this.fanGeo, new THREE.MeshBasicMaterial({
        side: THREE.FrontSide, transparent: true, opacity: 0.6, blending: THREE.NormalBlending,
        toneMapped: false, depthWrite: false, vertexColors: true }));
      this.fanMesh.name = 'DispersionSpectrumFan';
      this.fanMesh.renderOrder = 1;
      this.fanMesh.raycast = () => {};
      this.beamGroup.add(this.fanMesh);
    }
    this.fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.fanGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.fanGeo.computeBoundingSphere();
    if (this.fanMesh) this.fanMesh.visible = positions.length > 0;
    for (let i = this.activeBeamIndex; i < this.beamMeshPool.length; i++) this.beamMeshPool[i].visible = false;
  }

  private setBeam(start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number, opacity = 0.85): void {
    const delta = OpticalDispersionBenchMesh._BEAM_DIR.subVectors(end, start);
    const length = delta.length();
    if (length < 0.004) return;

    let mesh = this.beamMeshPool[this.activeBeamIndex];
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.unitBeamGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.NormalBlending,
          toneMapped: false,
          depthWrite: false,
        }),
      );
      mesh.renderOrder = 2;
      mesh.raycast = () => {};
      this.beamMeshPool.push(mesh);
      this.beamGroup.add(mesh);
    } else {
      mesh.material.color.setHex(color);
      mesh.material.opacity = opacity;
      mesh.visible = true;
    }

    const mid = OpticalDispersionBenchMesh._BEAM_MID.addVectors(start, end).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(OpticalDispersionBenchMesh._Y_AXIS, delta.normalize());
    mesh.scale.set(radius, length, radius);

    this.activeBeamIndex++;
  }
}
