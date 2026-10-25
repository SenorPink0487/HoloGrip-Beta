import * as THREE from 'three';
import type { HandGestureFrame, NormalizedLandmark, SingleHandData } from '../../vision/types.ts';
import type { HandRuleEvaluation, HandRuleMode } from '../../physics/em/handRulesSolver.ts';
import { disposeObjectTree } from './disposeObject.ts';

/**
 * MediaPipe 21 节点手部骨骼标准解剖拓扑连线
 * 0: 手腕 (Wrist)
 * 1-4: 拇指 (CMC, MCP, IP, TIP)
 * 5-8: 食指 (MCP, PIP, DIP, TIP)
 * 9-12: 中指 (MCP, PIP, DIP, TIP)
 * 13-16: 无名指 (MCP, PIP, DIP, TIP)
 * 17-20: 小指 (MCP, PIP, DIP, TIP)
 */
export const HAND_BONE_CONNECTIONS: ReadonlyArray<
  readonly [number, number, 'thumb' | 'finger' | 'palm']
> = [
  // 拇指骨节 (0-1: 腕掌基座, 1-2: 大鱼际宽体包壳段, 2-3: 近节指骨, 3-4: 远节机械爪尖)
  [0, 1, 'thumb'],
  [1, 2, 'thumb'],
  [2, 3, 'thumb'],
  [3, 4, 'thumb'],
  // 食指骨节与掌骨液压缸
  [0, 5, 'palm'],
  [5, 6, 'finger'],
  [6, 7, 'finger'],
  [7, 8, 'finger'],
  // 中指骨节与掌骨液压缸
  [0, 9, 'palm'],
  [9, 10, 'finger'],
  [10, 11, 'finger'],
  [11, 12, 'finger'],
  // 无名指骨节与掌骨液压缸
  [0, 13, 'palm'],
  [13, 14, 'finger'],
  [14, 15, 'finger'],
  [15, 16, 'finger'],
  // 小指骨节与掌骨液压缸
  [0, 17, 'palm'],
  [17, 18, 'finger'],
  [18, 19, 'finger'],
  [19, 20, 'finger'],
  // 掌指关节横向刚性桥接连杆 (Metacarpal Arch)
  [5, 9, 'palm'],
  [9, 13, 'palm'],
  [13, 17, 'palm'],
];

/**
 * 创建带机械倒角的精加工金属块几何体（中心在原点）
 */
function createMachinedBlockGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.0018,
  bevel = 0.0006
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rx = Math.max(0.0002, Math.min(radius, width * 0.38, height * 0.38));
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

  const bSize = Math.min(rx * 0.55, bevel);
  const extrudeDepth = Math.max(0.0004, depth - bSize * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bSize,
    bevelSize: bSize,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -extrudeDepth * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建带中空矩形观察窗的拇指根部大鱼际装甲壳板（X/Z 为真实毫米尺寸，Y 归一化为 1.0）
 */
function createThumbWindowShellGeometry(
  width = 0.020,
  height = 1.0,
  depth = 0.0032
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = width * 0.5;
  const h = height * 0.5;
  const cut = 0.0030;

  shape.moveTo(-w + cut, -h);
  shape.lineTo(w - cut, -h);
  shape.lineTo(w, -h + cut);
  shape.lineTo(w, h - cut);
  shape.lineTo(w - cut, h);
  shape.lineTo(-w + cut, h);
  shape.lineTo(-w, h - cut);
  shape.lineTo(-w, -h + cut);
  shape.closePath();

  // 中央矩形镂空机械窗
  const hole = new THREE.Path();
  const hw = w * 0.44;
  const hh = h * 0.38;
  hole.moveTo(-hw, -hh);
  hole.lineTo(hw, -hh);
  hole.lineTo(hw, hh);
  hole.lineTo(-hw, hh);
  hole.closePath();
  shape.holes.push(hole);

  const bevel = 0.0006;
  const extrudeDepth = Math.max(0.0008, depth - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -extrudeDepth * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建 T-800 远节指尖斜切机械爪瓣几何体（X/Z 为真实毫米尺寸，Y 归一化为 1.0）
 */
function createDistalClawSidePlateGeometry(
  length = 1.0,
  baseDepth = 0.0110,
  tipDepth = 0.0050,
  thickness = 0.0030
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfL = length * 0.5;
  const bd = baseDepth * 0.5;
  const td = tipDepth * 0.5;

  shape.moveTo(-bd, -halfL);
  shape.lineTo(bd, -halfL);
  shape.lineTo(bd * 0.92, halfL * 0.35);
  shape.quadraticCurveTo(td, halfL * 0.92, 0, halfL);
  shape.quadraticCurveTo(-td * 1.1, halfL * 0.92, -bd * 0.85, halfL * 0.45);
  shape.closePath();

  const bevel = 0.0004;
  const ext = Math.max(0.0006, thickness - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: ext,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -ext * 0.5);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建图1标志性的 T-800 同心圆盘轴承铰链鼓几何体（沿 X 轴旋转对称，两侧带深槽同心圆环）
 */
function createConcentricBearingDrumGeometry(
  radius = 0.0072,
  halfWidth = 0.0066
): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -halfWidth * 0.92),
    new THREE.Vector2(radius * 0.24, -halfWidth * 0.92),
    new THREE.Vector2(radius * 0.26, -halfWidth * 1.02),
    new THREE.Vector2(radius * 0.52, -halfWidth * 1.02),
    new THREE.Vector2(radius * 0.55, -halfWidth * 0.82),
    new THREE.Vector2(radius * 0.76, -halfWidth * 0.82),
    new THREE.Vector2(radius * 0.78, -halfWidth * 1.0),
    new THREE.Vector2(radius * 0.96, -halfWidth * 1.0),
    new THREE.Vector2(radius * 1.0, -halfWidth * 0.86),
    new THREE.Vector2(radius * 1.0, -halfWidth * 0.25),
    new THREE.Vector2(radius * 0.92, -halfWidth * 0.18),
    new THREE.Vector2(radius * 0.92, halfWidth * 0.18),
    new THREE.Vector2(radius * 1.0, halfWidth * 0.25),
    new THREE.Vector2(radius * 1.0, halfWidth * 0.86),
    new THREE.Vector2(radius * 0.96, halfWidth * 1.0),
    new THREE.Vector2(radius * 0.78, halfWidth * 1.0),
    new THREE.Vector2(radius * 0.76, halfWidth * 0.82),
    new THREE.Vector2(radius * 0.55, halfWidth * 0.82),
    new THREE.Vector2(radius * 0.52, halfWidth * 1.02),
    new THREE.Vector2(radius * 0.26, halfWidth * 1.02),
    new THREE.Vector2(radius * 0.24, halfWidth * 0.92),
    new THREE.Vector2(0.0, halfWidth * 0.92),
  ];
  const geo = new THREE.LatheGeometry(profile, 28);
  geo.rotateZ(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建车削阶梯液压缸筒几何体（径向 radius 为真实毫米级尺寸，轴向高度归一化为 Y ∈ [-0.5, +0.5]）
 */
function createSteppedCylinderBarrelGeometry(radius = 0.0050): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -0.5),
    new THREE.Vector2(radius * 0.88, -0.5),
    new THREE.Vector2(radius * 1.06, -0.44),
    new THREE.Vector2(radius * 1.06, -0.34),
    new THREE.Vector2(radius * 0.98, -0.31),
    new THREE.Vector2(radius * 0.98, 0.32),
    new THREE.Vector2(radius * 1.08, 0.35),
    new THREE.Vector2(radius * 1.08, 0.45),
    new THREE.Vector2(radius * 0.78, 0.5),
    new THREE.Vector2(0.0, 0.5),
  ];
  const geo = new THREE.LatheGeometry(profile, 22);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 创建腕部宽边铆钉金属箍环几何体（还原图1手腕下方带凸缘与内六角螺栓孔的厚壁金属环）
 */
function createWristBoltedCollarGeometry(
  radius = 0.026,
  height = 0.015
): THREE.BufferGeometry {
  const hh = height * 0.5;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(radius * 0.82, -hh),
    new THREE.Vector2(radius * 1.04, -hh),
    new THREE.Vector2(radius * 1.06, -hh * 0.68),
    new THREE.Vector2(radius * 0.98, -hh * 0.58),
    new THREE.Vector2(radius * 0.98, hh * 0.58),
    new THREE.Vector2(radius * 1.06, hh * 0.68),
    new THREE.Vector2(radius * 1.04, hh),
    new THREE.Vector2(radius * 0.82, hh),
  ];
  const geo = new THREE.LatheGeometry(profile, 36);
  geo.computeVertexNormals();
  return geo;
}

interface BoneSegmentNode {
  group: THREE.Group;
  barrelGroup: THREE.Group;
  pistonGroup: THREE.Group;
  sidePlatesGroup: THREE.Group;
  startIdx: number;
  endIdx: number;
  category: 'thumb' | 'finger' | 'palm';
  isDistalClaw: boolean;
  isThumbHousing: boolean;
  isRadiatingPalm: boolean;
  palmCylinderIndex: number;
}

interface JointNode {
  group: THREE.Group;
  index: number;
}

const _DIR = new THREE.Vector3();
const _MID = new THREE.Vector3();
const _START = new THREE.Vector3();

const _PALM_X = new THREE.Vector3(1, 0, 0);
const _PALM_Y = new THREE.Vector3(0, 1, 0);
const _PALM_Z = new THREE.Vector3(0, 0, 1);
const _PALM_CENTER = new THREE.Vector3();
const _BONE_X = new THREE.Vector3();
const _BONE_Y = new THREE.Vector3();
const _BONE_Z = new THREE.Vector3();
const _MAT4 = new THREE.Matrix4();

/**
 * T-800 机械内骨骼手部模型（严格复刻图1工业级精加工不锈钢/亮铬/枪灰液压机械手解剖结构）
 */
export class ArticulatedHandSkeletonMesh {
  public readonly group = new THREE.Group();

  // 图1专属写实工业不锈钢与枪灰液压材质体系
  private readonly machinedSteelMat: THREE.MeshPhysicalMaterial;
  private readonly polishedChromeMat: THREE.MeshPhysicalMaterial;
  private readonly satinAlloyMat: THREE.MeshStandardMaterial;
  private readonly darkGunmetalMat: THREE.MeshStandardMaterial;
  private readonly braidedCableMat: THREE.MeshStandardMaterial;

  private readonly joints: JointNode[] = [];
  private readonly bones: BoneSegmentNode[] = [];
  private readonly palmChassisGroup = new THREE.Group();
  private readonly wristCuffGroup = new THREE.Group();
  private readonly activeVectorArrow = new THREE.Group();

  // 21 个三维关键点的平滑状态 + 4 个腕掌基座锚点（使掌骨液压缸呈图1近平行排列）
  private readonly targetPoints: THREE.Vector3[] = [];
  private readonly currentPoints: THREE.Vector3[] = [];
  private readonly carpalBaseAnchors: THREE.Vector3[] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  private hasInitializedPoints = false;
  private currentHandedness: 'left' | 'right' | null = null;
  private fadeOpacity = 0;
  private pulseClock = 0;

  constructor() {
    this.group.name = 'ArticulatedHandSkeletonMesh';

    // 1. 主体 CNC 精加工拉丝不锈钢材质 (Machined Brushed Stainless Steel)
    this.machinedSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8dde4,
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.35,
      clearcoatRoughness: 0.18,
      reflectivity: 0.95,
      emissive: 0x0f172a,
      emissiveIntensity: 0.04,
      transparent: true,
      opacity: 0.99,
    });

    // 2. 高光镜面铬活塞杆与横梁材质 (Mirror Polished Chrome Ram)
    this.polishedChromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f7fb,
      metalness: 0.95,
      roughness: 0.10,
      clearcoat: 0.65,
      clearcoatRoughness: 0.08,
      emissive: 0x0f172a,
      emissiveIntensity: 0.04,
      transparent: true,
      opacity: 0.99,
    });

    // 3. 喷砂钛灰合金过渡件材质 (Satin Titanium-Steel Alloy)
    this.satinAlloyMat = new THREE.MeshStandardMaterial({
      color: 0xb4bcc8,
      metalness: 0.85,
      roughness: 0.28,
      emissive: 0x111827,
      emissiveIntensity: 0.04,
      transparent: true,
      opacity: 0.99,
    });

    // 4. 轴承同心深槽、螺栓沉孔与掌心镂空内衬深枪灰金属材质 (Anodized Dark Gunmetal)
    this.darkGunmetalMat = new THREE.MeshStandardMaterial({
      color: 0x2c323b,
      metalness: 0.76,
      roughness: 0.36,
      emissive: 0x090d14,
      emissiveIntensity: 0.05,
      transparent: true,
      opacity: 0.99,
    });

    // 5. 编织金属液压软管材质 (Braided Steel Hydraulic Hose)
    this.braidedCableMat = new THREE.MeshStandardMaterial({
      color: 0x383f4a,
      metalness: 0.68,
      roughness: 0.45,
      transparent: true,
      opacity: 0.99,
    });

    for (let i = 0; i < 21; i++) {
      this.targetPoints.push(new THREE.Vector3());
      this.currentPoints.push(new THREE.Vector3());
    }

    this.buildSkeletonGeometry();
    this.group.visible = false;
  }

  private buildSkeletonGeometry(): void {
    // 1. 构建 21 个关节（全部使用真实毫米尺寸，严禁任何 1.0m 大半径网格）
    const mcpBlockGeo = createMachinedBlockGeometry(0.0155, 0.0145, 0.014, 0.0022, 0.0007);
    const boltSocketGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.0152, 14);
    boltSocketGeo.rotateX(Math.PI / 2);
    const boltHeadGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 0.0156, 6);
    boltHeadGeo.rotateX(Math.PI / 2);

    const pipDrumGeo = createConcentricBearingDrumGeometry(0.0072, 0.0066);
    const dipDrumGeo = createConcentricBearingDrumGeometry(0.0062, 0.0058);
    const mcpSideBearingGeo = createConcentricBearingDrumGeometry(0.0066, 0.0080);

    for (let i = 0; i < 21; i++) {
      const isWrist = i === 0;
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const isFingerMcp = i === 5 || i === 9 || i === 13 || i === 17;
      const isPip = i === 2 || i === 6 || i === 10 || i === 14 || i === 18;

      const jointGroup = new THREE.Group();

      if (isWrist || isTip) {
        const capRadius = isTip ? 0.0034 : 0.0042;
        const capMesh = new THREE.Mesh(
          new THREE.SphereGeometry(capRadius, 14, 12),
          this.machinedSteelMat
        );
        jointGroup.add(capMesh);
      } else if (isFingerMcp) {
        // 图1掌指关节 (MCP 5, 9, 13, 17)：带正面双沉头螺栓的方形倒角机械抱箍块 + 内部同心轴承
        const blockMesh = new THREE.Mesh(mcpBlockGeo, this.machinedSteelMat);
        jointGroup.add(blockMesh);

        const bearingMesh = new THREE.Mesh(mcpSideBearingGeo, this.polishedChromeMat);
        bearingMesh.position.y = 0.0035;
        jointGroup.add(bearingMesh);

        for (const by of [-0.0036, 0.0036]) {
          const socket = new THREE.Mesh(boltSocketGeo, this.darkGunmetalMat);
          socket.position.set(0, by, 0);
          const head = new THREE.Mesh(boltHeadGeo, this.polishedChromeMat);
          head.position.set(0, by, 0);
          jointGroup.add(socket, head);
        }

        for (const sx of [-1, 1]) {
          const darkRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.0042, 0.0008, 10, 24),
            this.darkGunmetalMat
          );
          darkRing.rotation.y = Math.PI / 2;
          darkRing.position.set(sx * 0.0074, 0.0035, 0);
          jointGroup.add(darkRing);
        }
      } else {
        // 图1指间关节 (PIP / DIP / 拇指关节)：大直径同心圆盘轴承鼓
        const r = isPip ? 0.0072 : 0.0062;
        const hw = isPip ? 0.0066 : 0.0058;
        const drumMesh = new THREE.Mesh(isPip ? pipDrumGeo : dipDrumGeo, this.machinedSteelMat);
        jointGroup.add(drumMesh);

        for (const sx of [-1, 1]) {
          const grooveRing = new THREE.Mesh(
            new THREE.TorusGeometry(r * 0.64, r * 0.13, 12, 24),
            this.darkGunmetalMat
          );
          grooveRing.rotation.y = Math.PI / 2;
          grooveRing.position.x = sx * hw * 0.90;

          const centerPin = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.22, r * 0.22, hw * 0.25, 14),
            this.darkGunmetalMat
          );
          centerPin.rotation.z = Math.PI / 2;
          centerPin.position.x = sx * hw * 0.94;

          jointGroup.add(grooveRing, centerPin);
        }

        const earGeo = createMachinedBlockGeometry(hw * 1.85, r * 0.85, r * 1.15, 0.0014, 0.0004);
        const earTop = new THREE.Mesh(earGeo, this.satinAlloyMat);
        earTop.position.y = r * 0.55;
        const earBottom = new THREE.Mesh(earGeo, this.satinAlloyMat);
        earBottom.position.y = -r * 0.55;
        jointGroup.add(earTop, earBottom);
      }

      this.group.add(jointGroup);
      this.joints.push({
        group: jointGroup,
        index: i,
      });
    }

    // 2. 构建 23 段机械骨节（所有几何体的 X/Z 半径均为毫米级真实物理尺寸，仅 Y 轴归一化为 1.0）
    const palmBarrelGeo = createSteppedCylinderBarrelGeometry(0.0068);
    const palmTopCollarGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.14, 22);
    const palmBottomGlandGeo = new THREE.CylinderGeometry(0.0074, 0.0066, 0.16, 22);
    const palmSealGrooveGeo = new THREE.CylinderGeometry(0.0071, 0.0071, 0.06, 20);
    const palmRamGeo = new THREE.CylinderGeometry(0.0040, 0.0040, 1.0, 18);
    const palmHoseGeo = new THREE.CylinderGeometry(0.0017, 0.0017, 1.0, 12);

    const archBridgeGeo = createSteppedCylinderBarrelGeometry(0.0045);

    const thumbInnerCylGeo = createSteppedCylinderBarrelGeometry(0.0048);
    const thumbInnerHoseGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1.0, 12);
    const thumbWindowGeo = createThumbWindowShellGeometry(0.020, 1.0, 0.0032);
    const thumbBaseRodGeo = createSteppedCylinderBarrelGeometry(0.0050);

    const phalanxBarrelGeo = createSteppedCylinderBarrelGeometry(0.0048);
    const phalanxRamGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 1.0, 18);
    const phalanxHoseGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 12);
    const cheekPlateGeo = createMachinedBlockGeometry(0.0026, 1.0, 0.0092, 0.0012, 0.0004);
    const cheekSlotGeo = createMachinedBlockGeometry(0.0029, 0.52, 0.0028, 0.0005, 0.0002);

    const distalCoreGeo = createMachinedBlockGeometry(0.0040, 0.86, 0.0072, 0.001, 0.0003);
    const distalClawSideGeo = createDistalClawSidePlateGeometry(1.0, 0.0110, 0.0050, 0.0030);

    let palmCylCounter = 0;

    for (const [startIdx, endIdx, category] of HAND_BONE_CONNECTIONS) {
      const boneGroup = new THREE.Group();
      const barrelGroup = new THREE.Group();
      const pistonGroup = new THREE.Group();
      const sidePlatesGroup = new THREE.Group();
      boneGroup.add(barrelGroup, pistonGroup, sidePlatesGroup);

      const isRadiatingPalm = category === 'palm' && startIdx === 0;
      const isThumbHousing = startIdx === 1 && endIdx === 2;
      const isThumbBaseLink = startIdx === 0 && endIdx === 1;
      const isDistalClaw =
        endIdx === 4 || endIdx === 8 || endIdx === 12 || endIdx === 16 || endIdx === 20;

      let assignedPalmIdx = -1;

      if (isRadiatingPalm) {
        // 图1掌心 4 路近平行重型套筒液压作动器 (Metacarpal Hydraulic Cylinders)
        assignedPalmIdx = palmCylCounter++;

        const mainBarrel = new THREE.Mesh(palmBarrelGeo, this.machinedSteelMat);
        const topCollar = new THREE.Mesh(palmTopCollarGeo, this.satinAlloyMat);
        topCollar.position.y = 0.36;
        const bottomGland = new THREE.Mesh(palmBottomGlandGeo, this.satinAlloyMat);
        bottomGland.position.y = -0.42;
        const sealGroove = new THREE.Mesh(palmSealGrooveGeo, this.darkGunmetalMat);
        sealGroove.position.y = 0.22;
        barrelGroup.add(mainBarrel, topCollar, bottomGland, sealGroove);

        const chromeRam = new THREE.Mesh(palmRamGeo, this.polishedChromeMat);
        pistonGroup.add(chromeRam);

        const hoseMesh = new THREE.Mesh(palmHoseGeo, this.braidedCableMat);
        hoseMesh.position.set(0.0076, 0, -0.0020);
        sidePlatesGroup.add(hoseMesh);
      } else if (category === 'palm') {
        // 图1掌指关节横向圆柱桥接管 (5-9, 9-13, 13-17)
        const bridgeTube = new THREE.Mesh(archBridgeGeo, this.polishedChromeMat);
        barrelGroup.add(bridgeTube);
      } else if (isThumbHousing) {
        // 图1拇指根部标志性的宽体流线型大鱼际金属装甲包壳（带矩形镂空观察窗）
        const innerCyl = new THREE.Mesh(thumbInnerCylGeo, this.satinAlloyMat);
        const innerHose = new THREE.Mesh(thumbInnerHoseGeo, this.darkGunmetalMat);
        innerHose.position.x = -0.0038;
        barrelGroup.add(innerCyl, innerHose);

        for (const sz of [-1, 1]) {
          const shell = new THREE.Mesh(thumbWindowGeo, this.machinedSteelMat);
          shell.position.z = sz * 0.0062;
          sidePlatesGroup.add(shell);
        }
        for (const sx of [-1, 1]) {
          const sideWall = new THREE.Mesh(cheekPlateGeo, this.satinAlloyMat);
          sideWall.position.x = sx * 0.0088;
          sidePlatesGroup.add(sideWall);
        }
      } else if (isThumbBaseLink) {
        // 腕部至拇指根部的双液压随动连杆
        const mainRod = new THREE.Mesh(thumbBaseRodGeo, this.machinedSteelMat);
        barrelGroup.add(mainRod);
        const hose = new THREE.Mesh(thumbInnerHoseGeo, this.braidedCableMat);
        hose.position.x = 0.0050;
        sidePlatesGroup.add(hose);
      } else if (isDistalClaw) {
        // 图1远节分体式削角机械指尖爪 (Distal Split-Shell Mechanical Fingertip)
        const innerCore = new THREE.Mesh(distalCoreGeo, this.darkGunmetalMat);
        barrelGroup.add(innerCore);

        for (const sx of [-1, 1]) {
          const clawPlate = new THREE.Mesh(distalClawSideGeo, this.machinedSteelMat);
          clawPlate.position.x = sx * 0.0032;
          sidePlatesGroup.add(clawPlate);
        }
      } else {
        // 图1近节与中节机械指骨 (Proximal & Middle Phalanges)：
        // 中央粗液压缸 + 镜面活塞杆 + 左右厚壁开槽机械护板 + 侧面深灰液压软管
        const cylBarrel = new THREE.Mesh(phalanxBarrelGeo, this.machinedSteelMat);
        barrelGroup.add(cylBarrel);

        const pistonRam = new THREE.Mesh(phalanxRamGeo, this.polishedChromeMat);
        pistonGroup.add(pistonRam);

        for (const sx of [-1, 1]) {
          const plate = new THREE.Mesh(cheekPlateGeo, this.machinedSteelMat);
          plate.position.x = sx * 0.0052;
          const darkSlot = new THREE.Mesh(cheekSlotGeo, this.darkGunmetalMat);
          darkSlot.position.x = sx * 0.0053;
          sidePlatesGroup.add(plate, darkSlot);
        }

        const tendonHose = new THREE.Mesh(phalanxHoseGeo, this.braidedCableMat);
        tendonHose.position.set(0.0044, 0, -0.0040);
        sidePlatesGroup.add(tendonHose);
      }

      this.group.add(boneGroup);
      this.bones.push({
        group: boneGroup,
        barrelGroup,
        pistonGroup,
        sidePlatesGroup,
        startIdx,
        endIdx,
        category,
        isDistalClaw,
        isThumbHousing,
        isRadiatingPalm,
        palmCylinderIndex: assignedPalmIdx,
      });
    }

    // 3. 构建掌心深枪灰镂空机械底衬板
    this.buildPalmBackingPlate();

    // 4. 构建腕部 U 型多孔叉架 + 液压管束 + 宽边螺栓金属腕箍 + 前臂液压柱总成
    this.buildWristAndForearmAssembly();

    this.activeVectorArrow.visible = false;
    this.group.add(this.activeVectorArrow);
  }

  /**
   * 构建图1掌骨液压缸内侧的深枪灰多孔机械衬板与横向液压分流管
   */
  private buildPalmBackingPlate(): void {
    const backingGeo = createMachinedBlockGeometry(0.054, 0.040, 0.0040, 0.004, 0.0008);
    const backingPlate = new THREE.Mesh(backingGeo, this.darkGunmetalMat);
    backingPlate.position.set(0, 0.002, -0.0042);
    this.palmChassisGroup.add(backingPlate);

    for (const yOff of [-0.011, 0.010]) {
      const crossBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0020, 0.0020, 0.056, 14),
        this.satinAlloyMat
      );
      crossBar.rotation.z = Math.PI / 2;
      crossBar.position.set(0, yOff, -0.002);
      this.palmChassisGroup.add(crossBar);
    }

    this.group.add(this.palmChassisGroup);
  }

  /**
   * 构建图1手腕部的三层精密机械构造
   */
  private buildWristAndForearmAssembly(): void {
    // --- 1. 上层腕部 U 型机械叉架 (Upper Wrist Clevis Bridge) ---
    const wristBridgeGeo = createMachinedBlockGeometry(0.052, 0.014, 0.017, 0.003, 0.0008);
    const wristBridge = new THREE.Mesh(wristBridgeGeo, this.machinedSteelMat);
    wristBridge.position.set(0, 0.002, 0);
    this.wristCuffGroup.add(wristBridge);

    for (const xHole of [-0.013, 0.013]) {
      const ovalHole = new THREE.Mesh(
        createMachinedBlockGeometry(0.0080, 0.0052, 0.018, 0.002, 0.0003),
        this.darkGunmetalMat
      );
      ovalHole.position.set(xHole, 0.002, 0);
      this.wristCuffGroup.add(ovalHole);
    }

    // 腕桥左右两侧标志性的大直径同心圆盘轴承
    const wristBearingGeo = createConcentricBearingDrumGeometry(0.0092, 0.0052);
    for (const sx of [-1, 1]) {
      const wBearing = new THREE.Mesh(wristBearingGeo, this.machinedSteelMat);
      wBearing.position.set(sx * 0.024, 0.003, 0.002);

      const wDarkRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.0058, 0.0013, 12, 24),
        this.darkGunmetalMat
      );
      wDarkRing.rotation.y = Math.PI / 2;
      wDarkRing.position.set(sx * 0.024, 0.003, 0.002);
      this.wristCuffGroup.add(wBearing, wDarkRing);
    }

    // 中央连接上腕桥与下腕箍的纵向 T 型精加工支撑立柱
    const centralStrutGeo = createMachinedBlockGeometry(0.0082, 0.035, 0.015, 0.0015, 0.0005);
    const centralStrut = new THREE.Mesh(centralStrutGeo, this.machinedSteelMat);
    centralStrut.position.set(0, -0.016, 0.002);
    this.wristCuffGroup.add(centralStrut);

    // --- 2. 中层腕颈部液压连杆与深灰编织软管束 ---
    const neckRodOffsets: Array<[number, number, number]> = [
      [-0.020, -0.018, 0.001],
      [-0.010, -0.018, -0.003],
      [0.010, -0.018, -0.003],
      [0.020, -0.018, 0.001],
    ];
    for (const [rx, ry, rz] of neckRodOffsets) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0034, 0.0040, 0.034, 16),
        this.polishedChromeMat
      );
      rod.position.set(rx, ry, rz);
      rod.rotation.z = rx * 1.8;
      this.wristCuffGroup.add(rod);
    }

    const cableOffsets: Array<[number, number, number]> = [
      [-0.015, -0.018, 0.004],
      [-0.006, -0.018, 0.005],
      [0.006, -0.018, 0.005],
      [0.015, -0.018, 0.004],
      [-0.008, -0.018, -0.005],
      [0.008, -0.018, -0.005],
    ];
    for (const [cx, cy, cz] of cableOffsets) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0017, 0.0017, 0.038, 12),
        this.braidedCableMat
      );
      cable.position.set(cx, cy, cz);
      cable.rotation.z = -cx * 2.2;
      this.wristCuffGroup.add(cable);
    }

    // --- 3. 下层宽边内六角螺栓金属腕箍环 ---
    const collarRadius = 0.0265;
    const collarY = -0.036;
    const wristCollar = new THREE.Mesh(
      createWristBoltedCollarGeometry(collarRadius, 0.0145),
      this.machinedSteelMat
    );
    wristCollar.scale.set(1.08, 1.0, 0.68);
    wristCollar.position.set(0, collarY, 0);
    this.wristCuffGroup.add(wristCollar);

    const innerSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(collarRadius * 0.92, collarRadius * 0.92, 0.015, 28),
      this.darkGunmetalMat
    );
    innerSleeve.scale.set(1.08, 1.0, 0.68);
    innerSleeve.position.set(0, collarY, 0);
    this.wristCuffGroup.add(innerSleeve);

    const numBolts = 10;
    for (let b = 0; b < numBolts; b++) {
      const angle = (b / numBolts) * Math.PI * 2;
      const bx = Math.sin(angle) * collarRadius * 1.08;
      const bz = Math.cos(angle) * collarRadius * 0.68;

      const boltGroup = new THREE.Group();
      boltGroup.position.set(bx, collarY, bz);
      boltGroup.lookAt(bx * 2, collarY, bz * 2);

      const recess = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0023, 0.0023, 0.0020, 14),
        this.darkGunmetalMat
      );
      recess.rotation.x = Math.PI / 2;
      const hexPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0012, 0.0012, 0.0024, 6),
        this.polishedChromeMat
      );
      hexPin.rotation.x = Math.PI / 2;
      boltGroup.add(recess, hexPin);
      this.wristCuffGroup.add(boltGroup);
    }

    // --- 4. 腕箍下方延伸的前臂多路重型液压缸与活塞杆 ---
    const forearmSpecs: Array<{ x: number; z: number; rBarrel: number; rRod: number; tilt: number }> = [
      { x: -0.019, z: 0.001, rBarrel: 0.0046, rRod: 0.0032, tilt: 0.14 },
      { x: -0.007, z: 0.004, rBarrel: 0.0064, rRod: 0.0044, tilt: 0.06 },
      { x: 0.008, z: 0.003, rBarrel: 0.0060, rRod: 0.0040, tilt: -0.05 },
      { x: 0.020, z: 0.001, rBarrel: 0.0044, rRod: 0.0030, tilt: -0.12 },
    ];
    for (const spec of forearmSpecs) {
      const fGroup = new THREE.Group();
      fGroup.position.set(spec.x, -0.062, spec.z);
      fGroup.rotation.z = spec.tilt;

      const upperBarrel = new THREE.Mesh(
        createSteppedCylinderBarrelGeometry(spec.rBarrel),
        this.machinedSteelMat
      );
      upperBarrel.scale.set(1, 0.025, 1);
      upperBarrel.position.y = 0.008;

      const lowerRod = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.rRod, spec.rRod, 0.025, 18),
        this.polishedChromeMat
      );
      lowerRod.position.y = -0.013;

      const collarRing = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.rBarrel * 1.08, spec.rBarrel * 1.08, 0.0032, 18),
        this.darkGunmetalMat
      );
      collarRing.position.y = -0.004;

      fGroup.add(upperBarrel, lowerRod, collarRing);
      this.wristCuffGroup.add(fGroup);
    }

    for (const hx of [-0.013, 0.0, 0.014]) {
      const fHose = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0018, 0.0018, 0.042, 12),
        this.braidedCableMat
      );
      fHose.position.set(hx, -0.063, -0.003);
      fHose.rotation.z = hx * 3.0;
      this.wristCuffGroup.add(fHose);
    }

    this.group.add(this.wristCuffGroup);
  }

  /**
   * 将 MediaPipe 归一化关键点映射到实验台中央上方的 3D 交互空间
   */
  private computeTargetLandmarks(
    handData: SingleHandData,
    mode: HandRuleMode
  ): void {
    const lms: NormalizedLandmark[] = handData.landmarks;
    if (!lms || lms.length < 21) return;

    const wrist = lms[0];
    const middleMcp = lms[9];
    const indexMcp = lms[5];
    const pinkyMcp = lms[17];

    const rawScale = Math.max(
      0.08,
      Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y),
      Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y)
    );
    const targetHandSpan = 0.112 / rawScale;

    const palmCenterX = (wrist.x + middleMcp.x) * 0.5;
    const palmCenterY = (wrist.y + middleMcp.y) * 0.5;
    const palmCenterZ = (wrist.z + middleMcp.z) * 0.5;

    const mirroredNormX = 0.5 - palmCenterX;
    const mirroredNormY = 0.5 - palmCenterY;

    const anchorBaseY = mode === 'right-hand-screw' ? 0.25 : 0.24;
    const anchorBaseZ = 0.11;

    const handWorldCenterX = THREE.MathUtils.clamp(mirroredNormX * 0.34, -0.18, 0.18);
    const handWorldCenterY = THREE.MathUtils.clamp(anchorBaseY + mirroredNormY * 0.22, 0.13, 0.40);
    const handWorldCenterZ = anchorBaseZ;

    const pDirX = wrist.x - middleMcp.x;
    const pDirY = wrist.y - middleMcp.y;
    const pLen = Math.hypot(pDirX, pDirY) || 1;
    const ux = pDirX / pLen;
    const uy = pDirY / pLen;
    const lx = -uy;
    const ly = ux;

    for (let i = 0; i < 21; i++) {
      const lm = lms[i];
      const dx = palmCenterX - lm.x;
      const dy = palmCenterY - lm.y;

      const alongPalm = dx * ux + dy * uy;
      const acrossPalm = (dx * lx + dy * ly) * 0.76;

      const regDx = alongPalm * ux + acrossPalm * lx;
      const regDy = alongPalm * uy + acrossPalm * ly;

      const localX = regDx * targetHandSpan;
      const localY = regDy * targetHandSpan;
      const localZ = (palmCenterZ - lm.z) * targetHandSpan * 0.50;

      this.targetPoints[i].set(
        handWorldCenterX + localX,
        handWorldCenterY + localY,
        handWorldCenterZ + localZ
      );
    }
  }

  /**
   * 根据骨节轴向矢量与手掌横向基准轴构建无扭转奇异点的正交机械坐标系
   */
  private setMechanicalBasisQuaternion(
    targetQuat: THREE.Quaternion,
    axisY: THREE.Vector3,
    refLateralX: THREE.Vector3,
    fallbackNormalZ: THREE.Vector3
  ): void {
    _BONE_Y.copy(axisY).normalize();
    _BONE_X.copy(refLateralX).addScaledVector(_BONE_Y, -refLateralX.dot(_BONE_Y));
    if (_BONE_X.lengthSq() < 1e-5) {
      _BONE_X.copy(fallbackNormalZ).addScaledVector(_BONE_Y, -fallbackNormalZ.dot(_BONE_Y));
    }
    if (_BONE_X.lengthSq() < 1e-5) {
      _BONE_X.set(1, 0, 0);
    } else {
      _BONE_X.normalize();
    }
    _BONE_Z.crossVectors(_BONE_X, _BONE_Y).normalize();
    _MAT4.makeBasis(_BONE_X, _BONE_Y, _BONE_Z);
    targetQuat.setFromRotationMatrix(_MAT4);
  }

  /**
   * 在每帧渲染循环中更新 T-800 机械内骨骼关键点插值、非畸变套筒液压推杆与腕部总成姿态
   */
  public update(
    delta: number,
    frame: HandGestureFrame | null,
    evaluation: HandRuleEvaluation
  ): void {
    this.pulseClock += delta;

    let activeHand: SingleHandData | null = null;
    if (frame && frame.hasHand && evaluation.status !== 'idle') {
      if (evaluation.requiredHand === 'left') {
        activeHand = frame.leftHand ?? frame.rightHand;
      } else {
        activeHand = frame.rightHand ?? frame.leftHand;
      }
    }

    if (!activeHand || !activeHand.landmarks || activeHand.landmarks.length < 21) {
      this.fadeOpacity = Math.max(0, this.fadeOpacity - delta * 5.0);
      if (this.fadeOpacity <= 0.01) {
        this.group.visible = false;
        this.hasInitializedPoints = false;
        this.currentHandedness = null;
      } else {
        this.applyGlobalOpacity(this.fadeOpacity);
      }
      return;
    }

    this.group.visible = true;
    this.fadeOpacity = Math.min(1, this.fadeOpacity + delta * 6.5);
    this.applyGlobalOpacity(this.fadeOpacity);

    this.computeTargetLandmarks(activeHand, evaluation.mode);

    const switchedHand = this.currentHandedness !== activeHand.handedness;
    this.currentHandedness = activeHand.handedness;

    const lerpAlpha = !this.hasInitializedPoints || switchedHand
      ? 1.0
      : 1 - Math.exp(-30 * Math.max(0.001, Math.min(0.05, delta)));

    for (let i = 0; i < 21; i++) {
      if (lerpAlpha >= 0.999) {
        this.currentPoints[i].copy(this.targetPoints[i]);
      } else {
        this.currentPoints[i].lerp(this.targetPoints[i], lerpAlpha);
      }
      this.joints[i].group.position.copy(this.currentPoints[i]);
    }
    this.hasInitializedPoints = true;

    // 1. 解算手掌全局三维正交基准架 (_PALM_X 横跨掌指关节, _PALM_Y 腕至中指, _PALM_Z 掌面法向)
    const wristPt = this.currentPoints[0];
    const indexMcpPt = this.currentPoints[5];
    const midMcpPt = this.currentPoints[9];
    const ringMcpPt = this.currentPoints[13];
    const pinkyMcpPt = this.currentPoints[17];

    _PALM_Y.subVectors(midMcpPt, wristPt);
    if (_PALM_Y.lengthSq() > 1e-6) {
      _PALM_Y.normalize();
    } else {
      _PALM_Y.set(0, 1, 0);
    }

    _PALM_X.subVectors(indexMcpPt, pinkyMcpPt);
    _PALM_X.addScaledVector(_PALM_Y, -_PALM_X.dot(_PALM_Y));
    if (_PALM_X.lengthSq() > 1e-6) {
      _PALM_X.normalize();
    } else {
      _PALM_X.set(1, 0, 0);
    }
    _PALM_Z.crossVectors(_PALM_X, _PALM_Y).normalize();

    // 2. 计算腕部桥架上的 4 个掌骨液压缸基座锚点
    const mcpNodes = [indexMcpPt, midMcpPt, ringMcpPt, pinkyMcpPt];
    for (let k = 0; k < 4; k++) {
      const mcp = mcpNodes[k];
      const lateralOffset = _DIR.subVectors(mcp, wristPt).dot(_PALM_X);
      this.carpalBaseAnchors[k]
        .copy(wristPt)
        .addScaledVector(_PALM_X, lateralOffset * 0.62)
        .addScaledVector(_PALM_Y, 0.008);
    }

    // 3. 更新 23 根 T-800 机械骨节（X/Z 缩放恒为 1，仅缩放 Y 轴，确保毫米级精密尺寸绝不膨胀）
    for (const bone of this.bones) {
      const pA = bone.isRadiatingPalm
        ? this.carpalBaseAnchors[bone.palmCylinderIndex]
        : this.currentPoints[bone.startIdx];
      const pB = this.currentPoints[bone.endIdx];
      const dist = pA.distanceTo(pB);

      if (dist < 1e-4) {
        bone.group.visible = false;
        continue;
      }
      bone.group.visible = true;

      _MID.addVectors(pA, pB).multiplyScalar(0.5);
      bone.group.position.copy(_MID);

      _DIR.subVectors(pB, pA).divideScalar(dist);
      this.setMechanicalBasisQuaternion(bone.group.quaternion, _DIR, _PALM_X, _PALM_Z);

      bone.group.scale.set(1, 1, 1);

      if (bone.isRadiatingPalm) {
        const barrelLen = dist * 0.62;
        bone.barrelGroup.scale.set(1, barrelLen, 1);
        bone.barrelGroup.position.set(0, dist * 0.08, 0);

        const pistonLen = dist * 0.48;
        bone.pistonGroup.scale.set(1, pistonLen, 1);
        bone.pistonGroup.position.set(0, -dist * 0.24, 0);

        bone.sidePlatesGroup.scale.set(1, dist * 0.88, 1);
      } else if (bone.category === 'palm') {
        bone.barrelGroup.scale.set(1, dist * 0.92, 1);
      } else if (bone.isThumbHousing) {
        const shellLen = Math.max(0.018, dist * 0.88);
        bone.barrelGroup.scale.set(1, shellLen * 0.9, 1);
        bone.sidePlatesGroup.scale.set(1, shellLen, 1);
      } else if (bone.startIdx === 0 && bone.endIdx === 1) {
        _START
          .copy(wristPt)
          .addScaledVector(_PALM_X, _DIR.subVectors(indexMcpPt, wristPt).dot(_PALM_X) * 0.68);
        const tDist = Math.max(0.008, _START.distanceTo(pB));
        _MID.addVectors(_START, pB).multiplyScalar(0.5);
        bone.group.position.copy(_MID);
        _DIR.subVectors(pB, _START).divideScalar(tDist);
        this.setMechanicalBasisQuaternion(bone.group.quaternion, _DIR, _PALM_X, _PALM_Z);

        bone.barrelGroup.scale.set(1, tDist * 0.78, 1);
        bone.sidePlatesGroup.scale.set(1, tDist * 0.82, 1);
      } else if (bone.isDistalClaw) {
        const clawLen = Math.max(0.014, dist * 1.12);
        bone.barrelGroup.scale.set(1, clawLen, 1);
        bone.barrelGroup.position.set(0, clawLen * 0.06, 0);
        bone.sidePlatesGroup.scale.set(1, clawLen, 1);
        bone.sidePlatesGroup.position.set(0, clawLen * 0.06, 0);
      } else {
        const spanLen = Math.max(0.010, dist * 0.76);
        bone.barrelGroup.scale.set(1, spanLen * 0.64, 1);
        bone.barrelGroup.position.set(0, -spanLen * 0.14, 0);

        bone.pistonGroup.scale.set(1, spanLen * 0.52, 1);
        bone.pistonGroup.position.set(0, spanLen * 0.22, 0);

        bone.sidePlatesGroup.scale.set(1, spanLen * 0.92, 1);
      }
    }

    // 4. 更新 21 个关节轴承的三维正交朝向
    for (let i = 0; i < 21; i++) {
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const isFingerMcp = i === 5 || i === 9 || i === 13 || i === 17;
      if (i === 0 || isFingerMcp) {
        _MAT4.makeBasis(_PALM_X, _PALM_Y, _PALM_Z);
        this.joints[i].group.quaternion.setFromRotationMatrix(_MAT4);
      } else if (isTip) {
        _DIR.subVectors(this.currentPoints[i], this.currentPoints[i - 1]);
        if (_DIR.lengthSq() > 1e-6) {
          this.setMechanicalBasisQuaternion(this.joints[i].group.quaternion, _DIR, _PALM_X, _PALM_Z);
        }
      } else {
        _DIR.subVectors(this.currentPoints[i + 1], this.currentPoints[i]);
        if (_DIR.lengthSq() > 1e-6) {
          this.setMechanicalBasisQuaternion(this.joints[i].group.quaternion, _DIR, _PALM_X, _PALM_Z);
        }
      }
    }

    // 5. 更新掌心深枪灰内衬底板位置与姿态
    _PALM_CENTER
      .copy(wristPt)
      .multiplyScalar(0.42)
      .addScaledVector(indexMcpPt, 0.145)
      .addScaledVector(midMcpPt, 0.145)
      .addScaledVector(ringMcpPt, 0.145)
      .addScaledVector(pinkyMcpPt, 0.145);
    this.palmChassisGroup.position.copy(_PALM_CENTER);
    _MAT4.makeBasis(_PALM_X, _PALM_Y, _PALM_Z);
    this.palmChassisGroup.quaternion.setFromRotationMatrix(_MAT4);

    // 6. 更新腕部桥架、宽边螺栓腕箍与前臂液压柱总成姿态
    this.wristCuffGroup.position.copy(wristPt);
    this.wristCuffGroup.quaternion.setFromRotationMatrix(_MAT4);

    // 7. 更新材质微反光
    this.updateMaterialResonance(evaluation);
  }

  private applyGlobalOpacity(alpha: number): void {
    this.machinedSteelMat.opacity = 0.99 * alpha;
    this.polishedChromeMat.opacity = 0.99 * alpha;
    this.satinAlloyMat.opacity = 0.99 * alpha;
    this.darkGunmetalMat.opacity = 0.99 * alpha;
    this.braidedCableMat.opacity = 0.99 * alpha;
  }

  private updateMaterialResonance(evaluation: HandRuleEvaluation): void {
    if (evaluation.status === 'wrong-hand') {
      this.darkGunmetalMat.emissive.setHex(0x451a03);
      this.darkGunmetalMat.emissiveIntensity = 0.18;
    } else if (evaluation.isMatched) {
      this.darkGunmetalMat.emissive.setHex(0x064e3b);
      this.darkGunmetalMat.emissiveIntensity = 0.16;
    } else {
      this.darkGunmetalMat.emissive.setHex(0x090d14);
      this.darkGunmetalMat.emissiveIntensity = 0.05;
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
