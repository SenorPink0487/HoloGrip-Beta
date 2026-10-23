import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export type LiquidMediumType = 'water' | 'ethanol' | 'glycerin' | 'glass' | 'flint' | 'diamond' | 'custom';

export interface LiquidMediumInfo {
  type: LiquidMediumType;
  name: string;
  nameEn: string;
  n: number;
  color: number;
  opacity: number;
}

export const LIQUID_MEDIA: Record<LiquidMediumType, LiquidMediumInfo> = {
  water: {
    type: 'water',
    name: '水 (纯净淡蓝透明水)',
    nameEn: 'Water (H₂O)',
    n: 1.333,
    color: 0x38bdf8, // 清新通透的淡蓝色水体
    opacity: 0.58,
  },
  ethanol: {
    type: 'ethanol',
    name: '乙醇 (酒精)',
    nameEn: 'Ethanol (Alcohol)',
    n: 1.361,
    color: 0x06b6d4, // 清透青蓝
    opacity: 0.55,
  },
  glycerin: {
    type: 'glycerin',
    name: '甘油 (丙三醇)',
    nameEn: 'Glycerin (Glycerol)',
    n: 1.473,
    color: 0xf59e0b, // 暖金琥珀色
    opacity: 0.66,
  },
  glass: {
    type: 'glass',
    name: '亚克力 / 冕牌玻璃',
    nameEn: 'Crown Glass / Acrylic',
    n: 1.517,
    color: 0x8b5cf6, // 紫晶透光
    opacity: 0.70,
  },
  flint: {
    type: 'flint',
    name: '重火石光学玻璃',
    nameEn: 'Dense Flint Glass',
    n: 1.650,
    color: 0x2563eb, // 宝石湛蓝
    opacity: 0.74,
  },
  diamond: {
    type: 'diamond',
    name: '金刚石 (超高折射介质)',
    nameEn: 'Diamond',
    n: 2.417,
    color: 0xec4899, // 晶钻炫彩粉
    opacity: 0.80,
  },
  custom: {
    type: 'custom',
    name: '自定义介质',
    nameEn: 'Custom Medium',
    n: 1.400,
    color: 0x10b981, // 翡翠翠绿
    opacity: 0.62,
  },
};

export interface OpticalTelemetry {
  incidentAngleDeg: number;
  reflectionAngleDeg: number;
  refractionAngleDeg: number;
  snellRatio: number;
  isTotalInternalReflection: boolean;
  criticalAngleDeg: number;
  reflectionCoeffR: number;
  transmissionCoeffT: number;
  n1: number;
  n2: number;
  incidentMedium: 'air' | 'liquid';
}

/**
 * 高精密光学分度圆盘与透明半圆介质实验仪
 * 采用航空级钛合金精雕底座、双弧臂测角架、水晶光学池与准直二极管激光模组
 */
export class OpticalDiskApparatusMesh {
  public readonly group = new THREE.Group();

  // 关键几何尺寸 (参考实体教学演示仪黄金比例：水槽内收，刻度完整裸露外圈不被遮挡)
  public readonly diskRadius = 0.34;
  public readonly tankRadius = 0.22;
  public readonly tankDepth = 0.055;
  public readonly diskCenterY = 0.38;
  public readonly railRadius = 0.365;

  // 物理与状态参数
  public incidentAngleDeg = 45.0; // 相对于法线，范围 -85° ~ +85°
  public isAirToWater = true; // true: 空气->水 (上半部入射); false: 水->空气 (下半部入射，演示全反射)
  public mediumType: LiquidMediumType = 'water';
  public liquidRefractiveIndex = 1.333;
  public airRefractiveIndex = 1.000;
  public laserWavelengthNm = 650.0; // 默认 650nm 经典红色激光
  public showNormalLine = true;
  public showAngleArcs = true;
  public showTyndallGlow = true;

  // 3D 几何组件
  private diskPlateMesh: THREE.Mesh;
  private dialTexture: THREE.CanvasTexture | null = null;
  private waterTankContainer: THREE.Group;
  private waterBodyMesh: THREE.Mesh;
  private waterSurfaceMesh: THREE.Mesh;
  private waterMaterial: THREE.MeshStandardMaterial;
  private waterSurfaceMat: THREE.MeshStandardMaterial;
  private meniscusMat: THREE.MeshStandardMaterial;

  // 旋转激光发射臂与激光头
  public laserCarriageGroup = new THREE.Group();
  public laserHitMesh: THREE.Mesh; // 用于鼠标射线拾取拖拽
  public incidentBeamHitMesh!: THREE.Mesh; // 用于触控射线拾取光束拖拽
  private laserBarrelMesh: THREE.Mesh;
  private laserLedMesh: THREE.Mesh;
  private laserLedMat: THREE.MeshBasicMaterial;
  private laserLensMat: THREE.MeshBasicMaterial;

  // 光束系统
  private incidentCoreMesh: THREE.Mesh;
  private incidentGlowMesh: THREE.Mesh;
  private reflectedCoreMesh: THREE.Mesh;
  private reflectedGlowMesh: THREE.Mesh;
  private refractedCoreMesh: THREE.Mesh;
  private refractedGlowMesh: THREE.Mesh;
  private tyndallScatterMesh: THREE.Mesh; // 水中丁达尔散射光路

  // 光斑系统 (界面的入射点、表盘刻度落点)
  private centerSpotMesh: THREE.Mesh;
  private reflectedSpotMesh: THREE.Mesh;
  private refractedSpotMesh: THREE.Mesh;
  private tirHaloMesh: THREE.Mesh; // 全反射表面倏逝波/高亮环

  // 材质引用
  private beamCoreMat: THREE.MeshBasicMaterial;
  private beamGlowMat: THREE.MeshBasicMaterial;
  private reflectedCoreMat: THREE.MeshBasicMaterial;
  private reflectedGlowMat: THREE.MeshBasicMaterial;
  private refractedCoreMat: THREE.MeshBasicMaterial;
  private refractedGlowMat: THREE.MeshBasicMaterial;
  private spotMat: THREE.MeshBasicMaterial;
  private tirHaloMat: THREE.MeshBasicMaterial;

  // 辅助标线 (法线、分界面、角度弧线与 3D 浮空角度标注)
  private normalLineGroup = new THREE.Group();
  public angleArcsGroup = new THREE.Group();
  public angleLabelsGroup = new THREE.Group();

  // 3D 浮空角度标注 (纯 WebGL Sprite 纹理与 Canvas 徽标)
  private incidentBadgeCanvas: HTMLCanvasElement | null = null;
  private incidentBadgeTex: THREE.CanvasTexture | null = null;
  public incidentBadgeSprite: THREE.Sprite;

  private reflectedBadgeCanvas: HTMLCanvasElement | null = null;
  private reflectedBadgeTex: THREE.CanvasTexture | null = null;
  public reflectedBadgeSprite: THREE.Sprite;

  private refractedBadgeCanvas: HTMLCanvasElement | null = null;
  private refractedBadgeTex: THREE.CanvasTexture | null = null;
  public refractedBadgeSprite: THREE.Sprite;

  private lastIncidentKey = '';
  private lastReflectedKey = '';
  private lastRefractedKey = '';

  // 预分配角度弧线网格与材质（避免每帧重建 RingGeometry 与材质造成的 GPU 内存分配与丢帧）
  private fanMesh1!: THREE.Mesh;
  private arcMesh1!: THREE.Mesh;
  private fanMeshR!: THREE.Mesh;
  private arcMeshR!: THREE.Mesh;
  private fanMesh2!: THREE.Mesh;
  private arcMesh2!: THREE.Mesh;
  private lastArcTheta1 = -999;
  private lastArcTheta2 = -999;
  private lastArcTIR = false;
  private lastArcNormalRad = -999;
  private lastArcSign = 0;

  // 静态复用计算向量（避免每秒数百次频繁垃圾回收）
  private static readonly _DIR = new THREE.Vector3();
  private static readonly _MID = new THREE.Vector3();
  private static readonly _X_AXIS = new THREE.Vector3(1, 0, 0);
  private static readonly _P_LASER = new THREE.Vector3();
  private static readonly _P_ORIGIN = new THREE.Vector3(0, 0, 0);
  private static readonly _P_REFL = new THREE.Vector3();
  private static readonly _P_REFR = new THREE.Vector3();
  private static readonly _P_TANK_EXIT = new THREE.Vector3();
  private static readonly _P_TANK_ENTRY = new THREE.Vector3();

  constructor() {
    this.group.name = 'OpticalDiskApparatusMesh';
    this.createStandAndBase();
    this.createDiskAndDial();
    this.createWaterTank();
    this.createLaserCarriage();
    this.createBeamSystem();
    this.createAuxiliaryGraphics();
    this.setLaserWavelength(this.laserWavelengthNm);
    this.updateOpticalPaths();
  }

  /**
   * 1. 极简一体化悬臂支架与苹果级工业设计底座 (Apple-inspired Studio Stand)
   * 彻底去除背后突出的斜撑连杆、复杂手轮旋钮与多余机械构件，呈现如 Pro Display XDR 般的极致纯粹美感
   */
  private createStandAndBase(): void {
    const standGroup = new THREE.Group();

    // 苹果级阳极氧化喷砂铝与深空灰材质
    const spaceGrayMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.22,
    });
    const anodizedSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.82,
      roughness: 0.18,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.95,
      roughness: 0.10,
    });
    const darkFootPadMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.05,
    });

    // 1.1 一体成型倒角实心铝合金底座 (平整贴合桌面 Y = 0)
    // 宽 0.38m，深 0.18m，厚 0.012m，边缘带有细腻的高光倒角
    const basePlateGeo = new THREE.BoxGeometry(0.38, 0.012, 0.18);
    const basePlate = new THREE.Mesh(basePlateGeo, spaceGrayMat);
    basePlate.position.set(0, 0.006, 0);
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    standGroup.add(basePlate);

    // 底座四角防滑阻尼脚垫
    for (const sx of [-0.16, 0.16]) {
      for (const sz of [-0.07, 0.07]) {
        const padGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.002, 24);
        const pad = new THREE.Mesh(padGeo, darkFootPadMat);
        pad.position.set(sx, 0.001, sz);
        standGroup.add(pad);
      }
    }

    // 1.2 极简一体化流线型铝合金中央支撑悬臂 (Single Sculpted Cantilever Arm)
    // 从底座中心向后微仰并向上平滑延伸至圆盘中心，如 Studio Display 支架般优雅
    const armGroup = new THREE.Group();
    armGroup.position.set(0, 0.012, -0.015);

    // 支柱下铰链座
    const lowerJointGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.020, 32);
    const lowerJoint = new THREE.Mesh(lowerJointGeo, spaceGrayMat);
    lowerJoint.position.set(0, 0.010, 0);
    armGroup.add(lowerJoint);

    // 极简主立臂 (单根纤薄而稳固的缎面实心铝臂)
    const armHeight = this.diskCenterY - 0.012;
    const armGeo = new THREE.BoxGeometry(0.046, armHeight, 0.018);
    const arm = new THREE.Mesh(armGeo, anodizedSilverMat);
    arm.position.set(0, armHeight / 2, 0);
    armGroup.add(arm);

    // 1.3 圆盘背面中心极简平齐磁吸/阻尼枢轴 (Flush Pivot Joint)
    // 完全平整微嵌入圆盘后壳，无任何突出的多余旋钮或斜拉撑杆
    const pivotGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.008, 36);
    pivotGeo.rotateX(Math.PI / 2);
    const pivot = new THREE.Mesh(pivotGeo, spaceGrayMat);
    pivot.position.set(0, this.diskCenterY, -0.012);
    standGroup.add(pivot);

    const pivotRingGeo = new THREE.TorusGeometry(0.042, 0.002, 16, 48);
    const pivotRing = new THREE.Mesh(pivotRingGeo, chromeMat);
    pivotRing.position.set(0, this.diskCenterY, -0.008);
    standGroup.add(pivotRing);

    standGroup.add(armGroup);

    // 1.4 圆盘背面一体化极简封盖 (Pristine Unibody Backplate)
    // 整个圆盘后背为一体化喷砂铝质曲面封板，正面看与反面看均极度纯粹
    const backCasingGeo = new THREE.CylinderGeometry(this.diskRadius, this.diskRadius, 0.004, 72);
    backCasingGeo.rotateX(Math.PI / 2);
    const backCasing = new THREE.Mesh(backCasingGeo, spaceGrayMat);
    backCasing.position.set(0, this.diskCenterY, -0.007);
    standGroup.add(backCasing);

    this.group.add(standGroup);
  }

  /**
   * 2. 圆形实验分度盘 (Apple 级极简纯粹一体化外框与高精刻度盘，彻底去除层叠嵌套圆环)
   */
  private createDiskAndDial(): void {
    const diskGroup = new THREE.Group();
    diskGroup.position.set(0, this.diskCenterY, 0);

    // 生成高清 2048x2048 科学刻度表盘 CanvasTexture
    this.dialTexture = this.generateDialCanvas();

    // 2.1 极简一体化深空灰外边框 (单个纯净倒角外圈，绝无多重同心层叠)
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.22,
    });
    const bezelGeo = new THREE.CylinderGeometry(
      this.diskRadius + 0.008,
      this.diskRadius + 0.008,
      0.012,
      96
    );
    bezelGeo.rotateX(Math.PI / 2);
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.z = -0.006;
    diskGroup.add(bezel);

    // 2.2 刻度盘正面主体薄圆柱 (正面朝向 +Z)
    const dialMat = new THREE.MeshStandardMaterial({
      map: this.dialTexture,
      roughness: 0.30,
      metalness: 0.06,
    });
    const plateGeo = new THREE.CylinderGeometry(this.diskRadius, this.diskRadius, 0.008, 96);
    plateGeo.rotateX(Math.PI / 2);

    // 重新校准圆盘正面 (z > 0) 的 UV 映射，保证 1:1 对齐真实物理笛卡尔坐标系
    // 解决 Three.js CylinderGeometry 默认顶盖 UV 旋转 90 度导致的文字垂直侧立及 0°/90° 轴向反转
    const pos = plateGeo.attributes.position.array;
    const norm = plateGeo.attributes.normal.array;
    const uv = plateGeo.attributes.uv.array;
    for (let i = 0; i < pos.length; i += 3) {
      if (norm[i + 2] > 0.5) {
        uv[(i / 3) * 2] = pos[i] / (2 * this.diskRadius) + 0.5;
        uv[(i / 3) * 2 + 1] = pos[i + 1] / (2 * this.diskRadius) + 0.5;
      }
    }
    plateGeo.attributes.uv.needsUpdate = true;

    this.diskPlateMesh = new THREE.Mesh(plateGeo, dialMat);
    this.diskPlateMesh.position.z = 0;
    diskGroup.add(this.diskPlateMesh);

    // 2.3 单一极细微导轨 (纤细缎面导轨，与外边框融为一体)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25,
    });
    const railGeo = new THREE.TorusGeometry(this.railRadius, 0.0032, 16, 128);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.z = 0.015;
    diskGroup.add(rail);

    this.group.add(diskGroup);
  }

  /**
   * 生成极简、高清晰度物理教学级光学分度表盘 (参考实体教学演示仪)
   * 刻度与数字全部置于外圈，水槽完全内收，刻度 100% 裸露不被水体或槽壁遮挡
   */
  private generateDialCanvas(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    const cx = 1024;
    const cy = 1024;
    const rOuter = 995;
    const rNumbers = 915; // 数字轨道 (最外圈，完全裸露)
    const rTickOuter = 855; // 刻度线外端起点

    // 1. 底盘底色 (高反差纯净象牙白)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.fill();

    // 2. 核心分界基准线 (参考图：穿过圆心的细黑实线)
    // 介质交界面 (水平直径横线)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - rOuter + 20, cy);
    ctx.lineTo(cx + rOuter - 20, cy);
    ctx.stroke();

    // 法线垂直基准线 (垂直竖线，贯穿上下)
    ctx.beginPath();
    ctx.moveTo(cx, cy - rOuter + 20);
    ctx.lineTo(cx, cy + rOuter - 20);
    ctx.stroke();

    // 3. 中心参考圆 (参考图：半径约 180px 的中心标圈)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 180, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // 4. 四象限 0 ~ 90 角度标度与向内刻度线
    // 刻度线完全位于 r >= 725px 区域，水槽半径为 647px，水槽完全位于刻度内侧，零遮挡！
    for (let deg = 0; deg < 360; deg++) {
      // 0° 位于 12点钟与 6点钟方向法线
      const rad = THREE.MathUtils.degToRad(deg - 90);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      let quadAngle = deg <= 180 ? deg : 360 - deg;
      if (quadAngle > 90) quadAngle = 180 - quadAngle;

      if (deg % 10 === 0) {
        // 10 度主刻度线 (长 125px，终止于 730px，远大于水槽 647px，完全裸露)
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(cx + cos * 730, cy + sin * 730);
        ctx.lineTo(cx + cos * rTickOuter, cy + sin * rTickOuter);
        ctx.stroke();

        // 象限读数：0, 10, 20, 30, 40, 50, 60, 70, 80, 90
        const textX = cx + cos * rNumbers;
        const textY = cy + sin * rNumbers;

        ctx.save();
        ctx.font = '600 42px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 白色轮廓保护晕层，保证数字在横贯轴线或任何背景时绝对清晰，字形保持正向水平无倾斜
        if (typeof ctx.strokeText === 'function') {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 8;
          ctx.lineJoin = 'round';
          ctx.strokeText(`${quadAngle}`, textX, textY);
        }

        ctx.fillStyle = '#0f172a';
        ctx.fillText(`${quadAngle}`, textX, textY);
        ctx.restore();
      } else if (deg % 5 === 0) {
        // 5 度中刻度线 (长 75px，从 855px 到 780px)
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx + cos * 780, cy + sin * 780);
        ctx.lineTo(cx + cos * rTickOuter, cy + sin * rTickOuter);
        ctx.stroke();
      } else {
        // 1 度微刻度线 (长 40px，从 855px 到 815px)
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx + cos * 815, cy + sin * 815);
        ctx.lineTo(cx + cos * rTickOuter, cy + sin * rTickOuter);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * 3. 晶莹剔透的一体成型高硼硅光学半圆介质槽与纯净液体介质
   * 彻底移除所有粗笨塑料牙、阀门、杂乱容量刻度与气泡，展现纯净科学之美
   */
  private createWaterTank(): void {
    this.waterTankContainer = new THREE.Group();
    this.waterTankContainer.position.set(0, this.diskCenterY, 0.005);

    // 晶莹清澈的科研级物理光学玻璃 (不采用 transmission 帧缓冲拷贝，避免剔除容器内部水体与光束)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      roughness: 0.02,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    // 3.1 前表面光学平晶半圆窗口 (精细 45° 倒角打磨)
    const frontShape = new THREE.Shape();
    frontShape.absarc(0, 0, this.tankRadius, Math.PI, 0, false);
    frontShape.lineTo(-this.tankRadius, 0);

    const frontPanelGeo = new THREE.ExtrudeGeometry(frontShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
      curveSegments: 64,
    });
    const frontPanel = new THREE.Mesh(frontPanelGeo, glassMat);
    frontPanel.position.z = this.tankDepth - 0.004;
    frontPanel.castShadow = false;
    frontPanel.receiveShadow = false;
    frontPanel.renderOrder = 12;
    this.waterTankContainer.add(frontPanel);

    // 3.2 半圆弧形外侧壁圆柱壳 (6mm 均匀厚度光学玻璃壁)
    const wallShape = new THREE.Shape();
    const rOut = this.tankRadius;
    const rIn = this.tankRadius - 0.006;
    wallShape.absarc(0, 0, rOut, Math.PI, 0, false);
    wallShape.lineTo(rIn, 0);
    wallShape.absarc(0, 0, rIn, 0, Math.PI, true);
    wallShape.lineTo(-rOut, 0);

    const curvedWallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: this.tankDepth,
      bevelEnabled: false,
      curveSegments: 64,
    });
    const curvedWall = new THREE.Mesh(curvedWallGeo, glassMat);
    curvedWall.position.set(0, 0, 0);
    curvedWall.castShadow = false;
    curvedWall.receiveShadow = false;
    curvedWall.renderOrder = 12;
    this.waterTankContainer.add(curvedWall);

    // 3.3 液体介质填充体积 (纯净无杂质的清澈淡蓝流体介质，绝不写入深度缓冲，保证背后刻度与折射激光完全显露)
    const waterShape = new THREE.Shape();
    const rWater = this.tankRadius - 0.0065;
    waterShape.absarc(0, 0, rWater, Math.PI, 0, false);
    waterShape.lineTo(-rWater, 0);

    const waterExtrudeGeo = new THREE.ExtrudeGeometry(waterShape, {
      depth: this.tankDepth - 0.007,
      bevelEnabled: false,
      curveSegments: 64,
    });
    const info = LIQUID_MEDIA[this.mediumType] || LIQUID_MEDIA.water;
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: info.color,
      transparent: true,
      opacity: 0.35,
      roughness: 0.02,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.02,
      reflectivity: 0.8,
      depthWrite: false, // 保证水槽内部折射激光束完全显现，不被深度剔除！
      side: THREE.DoubleSide,
      emissive: 0x0284c7, // 柔和淡蓝自发光，确保任何视角与光照下均保持清透淡蓝，绝不发灰发黑！
      emissiveIntensity: 0.25,
    });
    this.waterBodyMesh = new THREE.Mesh(waterExtrudeGeo, this.waterMaterial);
    this.waterBodyMesh.position.z = 0.002;
    this.waterBodyMesh.castShadow = false;
    this.waterBodyMesh.receiveShadow = false;
    this.waterBodyMesh.renderOrder = 3;
    this.waterTankContainer.add(this.waterBodyMesh);

    // 3.4 水平介质交界面 (液面光学水平薄层，极高镜面平整度)
    const surfaceGeo = new THREE.PlaneGeometry((rWater - 0.001) * 2, this.tankDepth - 0.008);
    surfaceGeo.rotateX(-Math.PI / 2);
    this.waterSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd, // 清亮透光液面
      transparent: true,
      opacity: 0.35,
      roughness: 0.02,
      metalness: 0.15,
      depthWrite: false,
      emissive: 0x0284c7,
      emissiveIntensity: 0.18,
    });
    this.waterSurfaceMesh = new THREE.Mesh(surfaceGeo, this.waterSurfaceMat);
    this.waterSurfaceMesh.position.set(0, -0.0003, (this.tankDepth - 0.007) / 2 + 0.002);
    this.waterSurfaceMesh.castShadow = false;
    this.waterSurfaceMesh.receiveShadow = false;
    this.waterSurfaceMesh.renderOrder = 4;
    this.waterTankContainer.add(this.waterSurfaceMesh);

    // 3.5 边缘弯月面微细高光细带 (Meniscus Specular Strips)
    const meniscusGeo = new THREE.CylinderGeometry(0.0012, 0.0012, (rWater - 0.002) * 2, 24);
    meniscusGeo.rotateZ(Math.PI / 2);
    this.meniscusMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.40,
      roughness: 0.05,
      transparent: true,
      opacity: 0.50,
      depthWrite: false,
    });

    const frontMeniscus = new THREE.Mesh(meniscusGeo, this.meniscusMat);
    frontMeniscus.position.set(0, -0.0006, this.tankDepth - 0.004);
    frontMeniscus.renderOrder = 5;
    this.waterTankContainer.add(frontMeniscus);

    const backMeniscus = new THREE.Mesh(meniscusGeo, this.meniscusMat);
    backMeniscus.position.set(0, -0.0006, 0.004);
    backMeniscus.renderOrder = 5;
    this.waterTankContainer.add(backMeniscus);

    this.group.add(this.waterTankContainer);
  }

  /**
   * 4. 沿圆盘外圈轨道滑动的流线型准直二极管激光器模组
   * 工业级散热鳍片、阳极氧化铝筒、消色差聚焦光阑与同心状态指示灯环
   */
  private createLaserCarriage(): void {
    this.laserCarriageGroup.name = 'LaserCarriage';
    this.laserCarriageGroup.userData = { isLaserHandle: true, interactiveId: 'laser_handle' };
    this.laserCarriageGroup.position.set(0, this.diskCenterY, 0.02);

    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.88,
      roughness: 0.20,
    });
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.82,
      roughness: 0.18,
    });
    const knurledRingMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.90,
      roughness: 0.30,
    });
    const darkNozzleMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.60,
      roughness: 0.35,
    });

    // 4.1 骑跨式滑轨底座 (抱合外圈圆形导轨)
    const carriageBaseGeo = new THREE.BoxGeometry(0.048, 0.026, 0.034);
    const carriageBase = new THREE.Mesh(carriageBaseGeo, titaniumMat);
    carriageBase.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(carriageBase);

    // 导轨滑槽侧面镀铬卡爪
    for (const zSign of [-1, 1]) {
      const clawGeo = new THREE.BoxGeometry(0.042, 0.008, 0.006);
      const claw = new THREE.Mesh(clawGeo, satinSilverMat);
      claw.position.set(0, 0, zSign * 0.016);
      claw.userData = { isLaserHandle: true };
      this.laserCarriageGroup.add(claw);
    }

    // 4.2 准直二极管激光器主筒 (指向圆心 O)
    // 筒身长 0.082m，直径 0.018m
    const barrelGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.082, 32);
    barrelGeo.rotateZ(Math.PI / 2);
    this.laserBarrelMesh = new THREE.Mesh(barrelGeo, satinSilverMat);
    this.laserBarrelMesh.position.set(-0.048, 0, 0);
    this.laserBarrelMesh.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(this.laserBarrelMesh);

    // 筒身 4 道精密散热环 (Cooling Fin Rings)
    for (let f = 0; f < 4; f++) {
      const finGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.0028, 24);
      finGeo.rotateZ(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, titaniumMat);
      fin.position.set(-0.025 - f * 0.012, 0, 0);
      fin.userData = { isLaserHandle: true };
      this.laserCarriageGroup.add(fin);
    }

    // 4.3 准直物镜与滚花调焦环 (Knurled Collimation Ring)
    const focusRingGeo = new THREE.CylinderGeometry(0.0096, 0.0096, 0.012, 24);
    focusRingGeo.rotateZ(Math.PI / 2);
    const focusRing = new THREE.Mesh(focusRingGeo, knurledRingMat);
    focusRing.position.set(-0.076, 0, 0);
    focusRing.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(focusRing);

    // 锥形出光喷嘴 (Aperture Hood)
    const nozzleGeo = new THREE.CylinderGeometry(0.0055, 0.009, 0.016, 24);
    nozzleGeo.rotateZ(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, darkNozzleMat);
    nozzle.position.set(-0.090, 0, 0);
    nozzle.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(nozzle);

    // 出光口内嵌光学镀膜准直透镜
    const lensGeo = new THREE.SphereGeometry(0.004, 16, 16);
    this.laserLensMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const lens = new THREE.Mesh(lensGeo, this.laserLensMat);
    lens.position.set(-0.097, 0, 0);
    lens.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(lens);

    // 4.4 状态指示 LED 环 (环绕筒身后部)
    const ledGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.004, 24);
    ledGeo.rotateZ(Math.PI / 2);
    this.laserLedMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    this.laserLedMesh = new THREE.Mesh(ledGeo, this.laserLedMat);
    this.laserLedMesh.position.set(-0.012, 0, 0);
    this.laserLedMesh.userData = { isLaserHandle: true };
    this.laserCarriageGroup.add(this.laserLedMesh);

    // 4.5 扩大的透明交互射线碰撞箱 (全面覆盖滑轨底座、镜筒、调焦环、喷嘴与出光透镜，专为触控屏宽容度优化)
    const hitGeo = new THREE.BoxGeometry(0.165, 0.088, 0.088);
    hitGeo.translate(-0.042, 0, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.laserHitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.laserHitMesh.name = 'LaserHandleHit';
    this.laserHitMesh.userData = { isLaserHandle: true, interactiveId: 'laser_handle' };
    this.laserCarriageGroup.add(this.laserHitMesh);

    this.group.add(this.laserCarriageGroup);
  }

  /**
   * 5. 动态高保真光束系统 (入射光、反射光、折射光、丁达尔光路与光斑)
   */
  private createBeamSystem(): void {
    const beamGroup = new THREE.Group();
    beamGroup.position.set(0, this.diskCenterY, 0.035); // 位于水面与玻璃正中间

    // 材质定义：核心光束与外层辉光均使用纯正浓郁的单色激光色彩（杜绝白炽白芯与白光管感）
    const initialLaserColor = OpticalPhysics.wavelengthToColor(this.laserWavelengthNm);

    this.beamCoreMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    this.beamGlowMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.reflectedCoreMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.reflectedGlowMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.refractedCoreMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    this.refractedGlowMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 0.50,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // 入射光束网格 (核心高对比细光束 + 外层柔和辉光束)
    const unitCylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
    unitCylGeo.rotateZ(Math.PI / 2);

    this.incidentCoreMesh = new THREE.Mesh(unitCylGeo, this.beamCoreMat);
    this.incidentCoreMesh.name = 'IncidentLaserBeam';
    this.incidentCoreMesh.userData = { isLaserHandle: true, isIncidentBeam: true, interactiveId: 'laser_handle' };
    this.incidentGlowMesh = new THREE.Mesh(unitCylGeo, this.beamGlowMat);
    this.incidentGlowMesh.name = 'IncidentLaserGlow';
    this.incidentGlowMesh.userData = { isLaserHandle: true, isIncidentBeam: true, interactiveId: 'laser_handle' };
    this.incidentCoreMesh.renderOrder = 10;
    this.incidentGlowMesh.renderOrder = 9;
    beamGroup.add(this.incidentCoreMesh);
    beamGroup.add(this.incidentGlowMesh);

    // 入射光束交互拾取碰撞套筒 (宽容度触控光柱，覆盖整条入射光路)
    const beamHitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.incidentBeamHitMesh = new THREE.Mesh(unitCylGeo, beamHitMat);
    this.incidentBeamHitMesh.name = 'IncidentBeamHit';
    this.incidentBeamHitMesh.userData = { isLaserHandle: true, isIncidentBeam: true, interactiveId: 'laser_handle' };
    beamGroup.add(this.incidentBeamHitMesh);

    // 反射光束网格
    this.reflectedCoreMesh = new THREE.Mesh(unitCylGeo, this.reflectedCoreMat);
    this.reflectedGlowMesh = new THREE.Mesh(unitCylGeo, this.reflectedGlowMat);
    this.reflectedCoreMesh.renderOrder = 10;
    this.reflectedGlowMesh.renderOrder = 9;
    beamGroup.add(this.reflectedCoreMesh);
    beamGroup.add(this.reflectedGlowMesh);

    // 折射光束网格 (极高优先级渲染，穿透水体清晰显露)
    this.refractedCoreMesh = new THREE.Mesh(unitCylGeo, this.refractedCoreMat);
    this.refractedGlowMesh = new THREE.Mesh(unitCylGeo, this.refractedGlowMat);
    this.refractedCoreMesh.renderOrder = 10;
    this.refractedGlowMesh.renderOrder = 9;
    beamGroup.add(this.refractedCoreMesh);
    beamGroup.add(this.refractedGlowMesh);

    // 水中丁达尔散射光路 (细腻微扩散圆锥光套)
    const tyndallGeo = new THREE.CylinderGeometry(0.008, 0.0025, 1, 16);
    tyndallGeo.rotateZ(Math.PI / 2);
    this.tyndallScatterMesh = new THREE.Mesh(
      tyndallGeo,
      new THREE.MeshBasicMaterial({
        color: initialLaserColor,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.tyndallScatterMesh.renderOrder = 8;
    beamGroup.add(this.tyndallScatterMesh);

    // 光斑网格 (中心入射点 O 光斑)
    this.spotMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spotGeo = new THREE.SphereGeometry(0.004, 16, 16);
    this.centerSpotMesh = new THREE.Mesh(spotGeo, this.spotMat);
    this.centerSpotMesh.renderOrder = 11;
    beamGroup.add(this.centerSpotMesh);

    // 刻度盘落点反射光斑与折射光斑
    this.reflectedSpotMesh = new THREE.Mesh(spotGeo, this.spotMat);
    this.refractedSpotMesh = new THREE.Mesh(spotGeo, this.spotMat);
    this.reflectedSpotMesh.renderOrder = 11;
    this.refractedSpotMesh.renderOrder = 11;
    beamGroup.add(this.reflectedSpotMesh);
    beamGroup.add(this.refractedSpotMesh);

    // 全反射倏逝波光晕光环 (发生全反射时在分界面处亮起)
    const tirRingGeo = new THREE.RingGeometry(0.006, 0.024, 32);
    this.tirHaloMat = new THREE.MeshBasicMaterial({
      color: initialLaserColor,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tirHaloMesh = new THREE.Mesh(tirRingGeo, this.tirHaloMat);
    this.tirHaloMesh.renderOrder = 11;
    this.tirHaloMesh.position.set(0, 0, 0.002);
    beamGroup.add(this.tirHaloMesh);

    this.group.add(beamGroup);
  }

  /**
   * 6. 辅助矢量图形 (法线、角度测量弧线与 3D 浮空角度标注)
   */
  private createAuxiliaryGraphics(): void {
    const auxGroup = new THREE.Group();
    auxGroup.position.set(0, this.diskCenterY, 0.025);

    // 法线高亮线 (青色微光虚线)
    const normalPoints = [new THREE.Vector3(0, 0.28, 0), new THREE.Vector3(0, -0.28, 0)];
    const normalGeo = new THREE.BufferGeometry().setFromPoints(normalPoints);
    const normalMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.015,
      gapSize: 0.010,
      linewidth: 2,
    });
    const normalLine = new THREE.Line(normalGeo, normalMat);
    normalLine.computeLineDistances();
    this.normalLineGroup.add(normalLine);
    auxGroup.add(this.normalLineGroup);

    // 角度弧线组预装配 (预创建 6 个专用材质与网格节点，避免每帧反复构造/销毁材质引起掉帧)
    const fanMat1 = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthTest: false });
    const arcMat1 = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, depthTest: false });
    this.fanMesh1 = new THREE.Mesh(new THREE.BufferGeometry(), fanMat1);
    this.fanMesh1.name = 'IncidentAngleFan';
    this.fanMesh1.userData = { isLaserHandle: true, interactiveId: 'laser_handle' };
    this.fanMesh1.renderOrder = 24;
    this.arcMesh1 = new THREE.Mesh(new THREE.BufferGeometry(), arcMat1);
    this.arcMesh1.name = 'IncidentAngleArc';
    this.arcMesh1.userData = { isLaserHandle: true, interactiveId: 'laser_handle' };
    this.arcMesh1.renderOrder = 25;

    const fanMatR = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthTest: false });
    const arcMatR = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, depthTest: false });
    this.fanMeshR = new THREE.Mesh(new THREE.BufferGeometry(), fanMatR);
    this.fanMeshR.renderOrder = 24;
    this.arcMeshR = new THREE.Mesh(new THREE.BufferGeometry(), arcMatR);
    this.arcMeshR.renderOrder = 25;

    const fanMat2 = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthTest: false });
    const arcMat2 = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, depthTest: false });
    this.fanMesh2 = new THREE.Mesh(new THREE.BufferGeometry(), fanMat2);
    this.fanMesh2.renderOrder = 24;
    this.arcMesh2 = new THREE.Mesh(new THREE.BufferGeometry(), arcMat2);
    this.arcMesh2.renderOrder = 25;

    this.angleArcsGroup.add(this.fanMesh1, this.arcMesh1, this.fanMeshR, this.arcMeshR, this.fanMesh2, this.arcMesh2);
    auxGroup.add(this.angleArcsGroup);

    // 3D 浮空角度标注组 (位于水槽前表面前向 Z = 0.035，彻底杜绝深度遮挡)
    const incBadge = this.createBadgeSprite('incident');
    this.incidentBadgeCanvas = incBadge.canvas;
    this.incidentBadgeTex = incBadge.texture;
    this.incidentBadgeSprite = incBadge.sprite;
    this.incidentBadgeSprite.name = 'IncidentAngleBadge';
    this.incidentBadgeSprite.userData = { isLaserHandle: true, interactiveId: 'laser_handle' };
    this.angleLabelsGroup.add(this.incidentBadgeSprite);

    const reflBadge = this.createBadgeSprite('reflected');
    this.reflectedBadgeCanvas = reflBadge.canvas;
    this.reflectedBadgeTex = reflBadge.texture;
    this.reflectedBadgeSprite = reflBadge.sprite;
    this.angleLabelsGroup.add(this.reflectedBadgeSprite);

    const refrBadge = this.createBadgeSprite('refracted');
    this.refractedBadgeCanvas = refrBadge.canvas;
    this.refractedBadgeTex = refrBadge.texture;
    this.refractedBadgeSprite = refrBadge.sprite;
    this.angleLabelsGroup.add(this.refractedBadgeSprite);

    this.angleLabelsGroup.position.set(0, 0, 0.035);
    auxGroup.add(this.angleLabelsGroup);

    this.group.add(auxGroup);
  }

  /**
   * 构造 3D 浮空角度标注 Sprite (纯文字与醒目大尺寸角度符号，无背景气泡)
   */
  private createBadgeSprite(
    type: 'incident' | 'reflected' | 'refracted'
  ): { canvas: HTMLCanvasElement | null; texture: THREE.CanvasTexture | null; sprite: THREE.Sprite } {
    if (typeof document === 'undefined') {
      const dummyMat = new THREE.SpriteMaterial();
      const sprite = new THREE.Sprite(dummyMat);
      sprite.raycast = () => {};
      return { canvas: null, texture: null, sprite };
    }

    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      const dummyMat = new THREE.SpriteMaterial();
      const sprite = new THREE.Sprite(dummyMat);
      sprite.raycast = () => {};
      return { canvas: null, texture: null, sprite };
    }

    // 高清纯文字画布 (宽 600，高 140，长宽比约 4.286:1，背景完全透明)
    canvas.width = 600;
    canvas.height = 140;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.name = `AngleBadge_${type}`;
    sprite.raycast = () => {};
    // 大尺寸纯文字标度 (宽 0.165m, 高 0.0385m)，字形与表盘刻度数字相当，清晰夺目
    sprite.scale.set(0.165, 0.0385, 1.0);
    sprite.renderOrder = 30;

    return { canvas, texture, sprite };
  }

  /**
   * 纯文字与专属高对比度角度符号标注 (严禁使用任何气泡、胶囊背景框或实心圆点)
   * 采用大号粗体与醒目镂空度数符号 (°) 绘制，确保在任何视距下都一清二楚
   */
  private renderAngleBadge(
    canvas: HTMLCanvasElement | null,
    texture: THREE.CanvasTexture | null,
    label: string,
    valText: string,
    color: string
  ): void {
    if (!canvas || typeof canvas.getContext !== 'function' || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();

    const cy = h / 2;

    ctx.font = 'bold 50px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';

    // 严禁绘制任何背景气泡、胶囊底板或实心圆点！纯文字 + 醒目大尺寸度数符号 (°)
    if (!valText) {
      // 纯文本状态 (例如 "全反射")
      ctx.textAlign = 'center';
      const cx = w / 2;
      if (typeof ctx.strokeText === 'function') {
        ctx.lineWidth = 6.0;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(8, 14, 26, 0.95)';
        ctx.strokeText(label, cx, cy);
      }
      ctx.fillStyle = color;
      ctx.fillText(label, cx, cy);
    } else {
      // 格式: "折射角: 32.0" + 专属镂空度数圆环 "°"
      const mainText = `${label}: ${valText}`;

      let mainW = 280;
      if (typeof ctx.measureText === 'function') {
        const tm = ctx.measureText(mainText);
        if (tm && typeof tm.width === 'number') mainW = tm.width;
      }

      // 角度符号 (°) 的几何规格：半径 7.0px、间距 6px、线宽 3.0px，保持开孔通透清晰
      const degRadius = 7.0;
      const degGap = 6.0;
      const totalW = mainW + degGap + degRadius * 2;

      // 整体居中对齐
      const startX = (w - totalW) / 2;
      ctx.textAlign = 'left';

      // 1. 绘制文字深色保护描边与纯色填充
      if (typeof ctx.strokeText === 'function') {
        ctx.lineWidth = 6.0;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(8, 14, 26, 0.95)';
        ctx.strokeText(mainText, startX, cy);
      }
      ctx.fillStyle = color;
      ctx.fillText(mainText, startX, cy);

      // 2. 绘制醒目镂空角度符号 (°)
      const degCenterX = startX + mainW + degGap + degRadius;
      const degCenterY = cy - 14.0; // 上标适度提升

      // 外层深色描边
      ctx.beginPath();
      if (typeof ctx.arc === 'function') {
        ctx.arc(degCenterX, degCenterY, degRadius, 0, Math.PI * 2);
      }
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = 'rgba(8, 14, 26, 0.95)';
      ctx.stroke();

      // 内层纯色圆环 (镂空通透，彻底告别糊成墨点)
      ctx.beginPath();
      if (typeof ctx.arc === 'function') {
        ctx.arc(degCenterX, degCenterY, degRadius, 0, Math.PI * 2);
      }
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    ctx.restore();

    texture.needsUpdate = true;
  }

  private updateArcPair(fanMesh: THREE.Mesh, arcMesh: THREE.Mesh, r: number, thickness: number, startAng: number, spanAng: number): void {
    if (spanAng < 0.005) {
      fanMesh.visible = false;
      arcMesh.visible = false;
      return;
    }
    fanMesh.visible = true;
    arcMesh.visible = true;
    const innerR = r - thickness / 2;
    const outerR = r + thickness / 2;
    if (fanMesh.geometry) fanMesh.geometry.dispose();
    fanMesh.geometry = new THREE.RingGeometry(0.002, innerR, 32, 1, startAng, spanAng);
    if (arcMesh.geometry) arcMesh.geometry.dispose();
    arcMesh.geometry = new THREE.RingGeometry(innerR, outerR, 48, 1, startAng, spanAng);
  }

  /**
   * 动态刷新角度测量弧线与大尺寸纯文字角度标注
   */
  private updateAngleArcs(theta1Rad: number, theta2Rad: number, isTIR: boolean): void {
    if (!this.showAngleArcs) {
      this.angleLabelsGroup.visible = false;
      this.angleArcsGroup.visible = false;
      return;
    }
    this.angleLabelsGroup.visible = true;
    this.angleArcsGroup.visible = true;

    const normalAngleRad = this.isAirToWater ? Math.PI / 2 : -Math.PI / 2;
    const sign = this.incidentAngleDeg >= 0 ? 1 : -1;

    // 1. 入射角几何范围 (翡翠高光绿)
    const incidentRayAngleRad = this.isAirToWater
      ? normalAngleRad + (this.incidentAngleDeg >= 0 ? -Math.abs(theta1Rad) : Math.abs(theta1Rad))
      : normalAngleRad + (this.incidentAngleDeg >= 0 ? Math.abs(theta1Rad) : -Math.abs(theta1Rad));
    const minAng1 = Math.min(normalAngleRad, incidentRayAngleRad);
    const maxAng1 = Math.max(normalAngleRad, incidentRayAngleRad);
    const span1 = maxAng1 - minAng1;

    // 2. 反射角几何范围 (电光亮青色)
    const reflRayAngleRad = this.isAirToWater
      ? normalAngleRad + (this.incidentAngleDeg >= 0 ? Math.abs(theta1Rad) : -Math.abs(theta1Rad))
      : normalAngleRad + (this.incidentAngleDeg >= 0 ? -Math.abs(theta1Rad) : Math.abs(theta1Rad));
    const minAngR = Math.min(normalAngleRad, reflRayAngleRad);
    const maxAngR = Math.max(normalAngleRad, reflRayAngleRad);
    const spanR = maxAngR - minAngR;

    // 3. 折射角几何范围 (未发生全反射时)
    const oppositeNormalAngleRad = this.isAirToWater ? -Math.PI / 2 : Math.PI / 2;
    let minAng2 = 0;
    let maxAng2 = 0;
    let span2 = 0;
    if (!isTIR) {
      const refrRayAngleRad = this.isAirToWater
        ? oppositeNormalAngleRad + (this.incidentAngleDeg >= 0 ? Math.abs(theta2Rad) : -Math.abs(theta2Rad))
        : oppositeNormalAngleRad + (this.incidentAngleDeg >= 0 ? -Math.abs(theta2Rad) : Math.abs(theta2Rad));
      minAng2 = Math.min(oppositeNormalAngleRad, refrRayAngleRad);
      maxAng2 = Math.max(oppositeNormalAngleRad, refrRayAngleRad);
      span2 = maxAng2 - minAng2;
    }

    // 检查角度弧线几何体是否脏变（若未变化直接跳过昂贵的 RingGeometry 重构）
    const arcsDirty =
      Math.abs(theta1Rad - this.lastArcTheta1) > 1e-4 ||
      Math.abs(theta2Rad - this.lastArcTheta2) > 1e-4 ||
      isTIR !== this.lastArcTIR ||
      normalAngleRad !== this.lastArcNormalRad ||
      sign !== this.lastArcSign;

    if (arcsDirty) {
      this.lastArcTheta1 = theta1Rad;
      this.lastArcTheta2 = theta2Rad;
      this.lastArcTIR = isTIR;
      this.lastArcNormalRad = normalAngleRad;
      this.lastArcSign = sign;

      this.updateArcPair(this.fanMesh1, this.arcMesh1, 0.095, 0.0055, minAng1, span1);
      this.updateArcPair(this.fanMeshR, this.arcMeshR, 0.078, 0.0055, minAngR, spanR);

      if (!isTIR) {
        this.updateArcPair(this.fanMesh2, this.arcMesh2, 0.095, 0.0055, minAng2, span2);
      } else {
        this.fanMesh2.visible = false;
        this.arcMesh2.visible = false;
      }
    }

    // 4. 纯文字加清晰角度符号 (°) 实时标注刷新 (精确到整数)
    const theta1DegAbs = Math.abs(this.incidentAngleDeg);
    const theta1Key = Math.round(theta1DegAbs).toString();
    const theta2Deg = isTIR ? 0 : THREE.MathUtils.radToDeg(theta2Rad);
    const theta2Key = isTIR ? 'TIR' : Math.round(theta2Deg).toString();

    if (this.lastIncidentKey !== theta1Key) {
      this.lastIncidentKey = theta1Key;
      this.renderAngleBadge(
        this.incidentBadgeCanvas,
        this.incidentBadgeTex,
        '入射角',
        theta1Key,
        '#4ade80'
      );
    }

    if (this.lastReflectedKey !== theta1Key) {
      this.lastReflectedKey = theta1Key;
      this.renderAngleBadge(
        this.reflectedBadgeCanvas,
        this.reflectedBadgeTex,
        '反射角',
        theta1Key,
        '#2dd4bf'
      );
    }

    const refrFullKey = `${theta2Key}_${isTIR}`;
    if (this.lastRefractedKey !== refrFullKey) {
      this.lastRefractedKey = refrFullKey;
      if (isTIR) {
        this.renderAngleBadge(
          this.refractedBadgeCanvas,
          this.refractedBadgeTex,
          '全反射',
          '',
          '#f43f5e'
        );
      } else {
        this.renderAngleBadge(
          this.refractedBadgeCanvas,
          this.refractedBadgeTex,
          '折射角',
          theta2Key,
          '#fbbf24'
        );
      }
    }

    // 5. 紧贴弧线外侧纯文字定位 (微错距防重叠；在 0° 或极小角度时沿法线左右错开避免叠字)
    const rInc = 0.145;
    const rRefl = 0.130;
    const rRefr = 0.138;

    const midAng1 = (minAng1 + maxAng1) / 2;
    const midAngR = (minAngR + maxAngR) / 2;
    const midAng2 = isTIR ? oppositeNormalAngleRad : (minAng2 + maxAng2) / 2;

    if (theta1DegAbs < 5.0) {
      // 0 点及极小角度下，入射角标注位于法线右侧(+X)，反射角标注位于法线左侧(-X)，折射角居于水下
      this.incidentBadgeSprite.position.set(0.046, this.isAirToWater ? rInc : -rInc, 0);
      this.reflectedBadgeSprite.position.set(-0.046, this.isAirToWater ? rRefl : -rRefl, 0);
      this.refractedBadgeSprite.position.set(0.046, this.isAirToWater ? -rRefr : rRefr, 0);
    } else {
      this.incidentBadgeSprite.position.set(
        Math.cos(midAng1) * rInc,
        Math.sin(midAng1) * rInc,
        0
      );
      this.reflectedBadgeSprite.position.set(
        Math.cos(midAngR) * rRefl,
        Math.sin(midAngR) * rRefl,
        0
      );
      this.refractedBadgeSprite.position.set(
        Math.cos(midAng2) * rRefr,
        Math.sin(midAng2) * rRefr,
        0
      );
    }
  }

  /**
   * 核心光学物理更新：斯涅尔定律、菲涅耳反射率与几何光路定向
   */
  public updateOpticalPaths(): OpticalTelemetry {
    // 1. 介质折射率
    const n1 = this.isAirToWater ? this.airRefractiveIndex : this.liquidRefractiveIndex;
    const n2 = this.isAirToWater ? this.liquidRefractiveIndex : this.airRefractiveIndex;

    const theta1DegAbs = Math.abs(this.incidentAngleDeg);
    const theta1Rad = THREE.MathUtils.degToRad(theta1DegAbs);

    // 2. 斯涅尔定律：n1 * sin(theta1) = n2 * sin(theta2)
    const sinTheta1 = Math.sin(theta1Rad);
    const sinTheta2 = (n1 / n2) * sinTheta1;

    let isTIR = false;
    let theta2Rad = 0;
    let theta2Deg = 0;
    let criticalAngleDeg = 90.0;

    if (n1 > n2) {
      // 存在全反射临界角
      criticalAngleDeg = THREE.MathUtils.radToDeg(Math.asin(n2 / n1));
    }

    if (sinTheta2 > 1.0) {
      // 发生全反射 (Total Internal Reflection)
      isTIR = true;
      theta2Rad = 0;
      theta2Deg = 0;
    } else {
      theta2Rad = Math.asin(Math.max(-1.0, Math.min(1.0, sinTheta2)));
      theta2Deg = THREE.MathUtils.radToDeg(theta2Rad);
    }

    // 3. 菲涅耳反射系数计算 (未极化自然光)
    let R = 0.0;
    if (isTIR) {
      R = 1.0;
    } else {
      const cos1 = Math.cos(theta1Rad);
      const cos2 = Math.cos(theta2Rad);
      const rs = Math.pow((n1 * cos1 - n2 * cos2) / (n1 * cos1 + n2 * cos2 || 1e-5), 2);
      const rp = Math.pow((n2 * cos1 - n1 * cos2) / (n2 * cos1 + n1 * cos2 || 1e-5), 2);
      R = Math.max(0.0, Math.min(1.0, (rs + rp) / 2));
    }
    const T = Math.max(0.0, 1.0 - R);

    // 4. 定位激光发射器悬臂位置
    const sign = this.incidentAngleDeg >= 0 ? -1 : 1;
    const laserAngleRad = this.isAirToWater
      ? Math.PI / 2 + sign * theta1Rad
      : -Math.PI / 2 - sign * theta1Rad;

    const laserX = Math.cos(laserAngleRad) * this.railRadius;
    const laserY = Math.sin(laserAngleRad) * this.railRadius;

    this.laserCarriageGroup.position.set(laserX, this.diskCenterY + laserY, 0.02);
    // 旋转让激光筒精准对准圆心 (0, diskCenterY)
    this.laserCarriageGroup.rotation.z = laserAngleRad + Math.PI;

    // 5. 光束端点几何计算 (以圆心 O 为局部原点，复用静态向量避免频繁内存分配)
    const pLaser = OpticalDiskApparatusMesh._P_LASER.set(laserX, laserY, 0);
    const pOrigin = OpticalDiskApparatusMesh._P_ORIGIN.set(0, 0, 0);

    // 反射光线：角度关于法线对称
    const reflAngleRad = this.isAirToWater
      ? Math.PI / 2 - sign * theta1Rad
      : -Math.PI / 2 + sign * theta1Rad;
    const pRefl = OpticalDiskApparatusMesh._P_REFL.set(
      Math.cos(reflAngleRad) * this.diskRadius,
      Math.sin(reflAngleRad) * this.diskRadius,
      0
    );

    // 折射光线：折射角为 theta2。由于半圆形水槽圆弧面的法线恰为径向，折射光线垂直穿出水槽圆弧壁，
    // 无额外偏折地一直延伸打到圆盘外缘刻度盘 (diskRadius) 上，刻度读数清晰显露且完全不被遮挡。
    const refrAngleRad = this.isAirToWater
      ? -Math.PI / 2 - sign * theta2Rad
      : Math.PI / 2 + sign * theta2Rad;
    const pRefr = OpticalDiskApparatusMesh._P_REFR.set(
      Math.cos(refrAngleRad) * this.diskRadius,
      Math.sin(refrAngleRad) * this.diskRadius,
      0
    );

    // 6. 3D 光束网格定向与伸缩
    this.orientBeam(this.incidentCoreMesh, pLaser, pOrigin, 0.0016);
    this.orientBeam(this.incidentGlowMesh, pLaser, pOrigin, 0.0065);
    if (this.incidentBeamHitMesh) {
      this.orientBeam(this.incidentBeamHitMesh, pLaser, pOrigin, 0.024);
    }

    // 反射光束强度随菲涅耳反射率 R 调节
    this.orientBeam(this.reflectedCoreMesh, pOrigin, pRefl, 0.0015 * Math.max(0.2, R));
    this.orientBeam(this.reflectedGlowMesh, pOrigin, pRefl, 0.0060 * Math.max(0.15, R));
    this.reflectedGlowMat.opacity = Math.max(0.15, R * 0.75);

    // 折射光束在全反射时消失，正常时随 T 调节
    this.refractedCoreMesh.visible = !isTIR;
    this.refractedGlowMesh.visible = !isTIR;
    this.refractedSpotMesh.visible = !isTIR;

    // 水中丁达尔散射光鞘 (仅在水槽介质内部段可见)
    const showScatter = this.showTyndallGlow && (this.isAirToWater ? !isTIR : true);
    this.tyndallScatterMesh.visible = showScatter;

    if (!isTIR) {
      this.orientBeam(this.refractedCoreMesh, pOrigin, pRefr, 0.0015 * Math.max(0.3, T));
      this.orientBeam(this.refractedGlowMesh, pOrigin, pRefr, 0.0060 * Math.max(0.25, T));
      this.refractedGlowMat.opacity = Math.max(0.2, T * 0.70);
    }

    if (showScatter) {
      if (this.isAirToWater) {
        // 空气到水：光线从圆心 O 射入水槽，在 tankRadius 处穿出水体
        const pTankExit = OpticalDiskApparatusMesh._P_TANK_EXIT.set(
          Math.cos(refrAngleRad) * (this.tankRadius - 0.003),
          Math.sin(refrAngleRad) * (this.tankRadius - 0.003),
          0
        );
        this.orientBeam(this.tyndallScatterMesh, pOrigin, pTankExit, 0.010);
      } else {
        // 水到空气：激光自外环射出，在 tankRadius 处垂直射入水槽并传播至圆心 O
        const pTankEntry = OpticalDiskApparatusMesh._P_TANK_ENTRY.set(
          Math.cos(laserAngleRad) * (this.tankRadius - 0.003),
          Math.sin(laserAngleRad) * (this.tankRadius - 0.003),
          0
        );
        this.orientBeam(this.tyndallScatterMesh, pTankEntry, pOrigin, 0.010);
      }
    }

    // 7. 光斑位置更新
    this.reflectedSpotMesh.position.copy(pRefl);
    if (!isTIR) {
      this.refractedSpotMesh.position.copy(pRefr);
    }

    // 全反射倏逝波光晕
    this.tirHaloMesh.visible = isTIR;
    this.tirHaloMat.opacity = isTIR ? 0.85 : 0.0;

    // 8. 辅助标线更新
    this.normalLineGroup.visible = this.showNormalLine;
    this.updateAngleArcs(theta1Rad, theta2Rad, isTIR);

    // 返回计算遥测包
    const snellRatio = sinTheta2 > 1e-5 ? sinTheta1 / sinTheta2 : n2 / n1;
    return {
      incidentAngleDeg: this.incidentAngleDeg,
      reflectionAngleDeg: theta1DegAbs,
      refractionAngleDeg: isTIR ? 0 : theta2Deg,
      snellRatio,
      isTotalInternalReflection: isTIR,
      criticalAngleDeg,
      reflectionCoeffR: R,
      transmissionCoeffT: T,
      n1,
      n2,
      incidentMedium: this.isAirToWater ? 'air' : 'liquid',
    };
  }

  /**
   * 将圆柱光束在两点间进行定向与缩放 (复用静态计算对象)
   */
  private orientBeam(mesh: THREE.Mesh, pStart: THREE.Vector3, pEnd: THREE.Vector3, radius: number): void {
    const dir = OpticalDiskApparatusMesh._DIR.subVectors(pEnd, pStart);
    const length = dir.length();
    if (length < 1e-4) {
      mesh.scale.set(0.0001, 0.0001, 0.0001);
      return;
    }

    const mid = OpticalDiskApparatusMesh._MID.addVectors(pStart, pEnd).multiplyScalar(0.5);
    mesh.position.copy(mid);

    mesh.scale.set(length, radius, radius);
    mesh.quaternion.setFromUnitVectors(OpticalDiskApparatusMesh._X_AXIS, dir.normalize());
  }

  /**
   * 切换激光波长与颜色 (405nm ~ 650nm)
   */
  public setLaserWavelength(wavelengthNm: number): void {
    this.laserWavelengthNm = wavelengthNm;
    const laserColor = OpticalPhysics.wavelengthToColor(wavelengthNm);

    // 核心光柱与外层辉光均同步赋予纯正浓郁的单色激光色彩（彻底告别白芯管质感）
    if (this.beamCoreMat) this.beamCoreMat.color.copy(laserColor);
    if (this.beamGlowMat) this.beamGlowMat.color.copy(laserColor);
    if (this.reflectedCoreMat) this.reflectedCoreMat.color.copy(laserColor);
    if (this.reflectedGlowMat) this.reflectedGlowMat.color.copy(laserColor);
    if (this.refractedCoreMat) this.refractedCoreMat.color.copy(laserColor);
    if (this.refractedGlowMat) this.refractedGlowMat.color.copy(laserColor);
    if (this.spotMat) this.spotMat.color.copy(laserColor);
    if (this.laserLedMat) this.laserLedMat.color.copy(laserColor);
    if (this.laserLensMat) this.laserLensMat.color.copy(laserColor);
    if (this.tirHaloMat) this.tirHaloMat.color.copy(laserColor);

    if (this.tyndallScatterMesh) {
      (this.tyndallScatterMesh.material as THREE.MeshBasicMaterial).color.copy(laserColor);
    }
    this.updateOpticalPaths();
  }

  /**
   * 切换液体介质 (水、乙醇、甘油、重火石等)
   */
  public setLiquidMedium(type: LiquidMediumType, customN?: number): void {
    this.mediumType = type;
    const info = LIQUID_MEDIA[type] || LIQUID_MEDIA.water;
    this.liquidRefractiveIndex = customN ?? info.n;

    // 水体颜色与透明度响应式更新
    this.waterMaterial.color.setHex(info.color);
    this.waterMaterial.opacity = info.opacity;
    if (this.waterSurfaceMat) {
      this.waterSurfaceMat.color.setHex(info.color);
    }
    if (this.meniscusMat) {
      this.meniscusMat.emissive.setHex(info.color);
    }
    this.updateOpticalPaths();
  }

  /**
   * 自定义水体显色风格
   */
  public setLiquidColor(hexColor: number): void {
    this.waterMaterial.color.setHex(hexColor);
    if (this.waterSurfaceMat) {
      this.waterSurfaceMat.color.setHex(hexColor);
    }
    if (this.meniscusMat) {
      this.meniscusMat.emissive.setHex(hexColor);
    }
  }

  /**
   * 动态水体表面微波光泽与微光动态更新
   */
  public animateWater(elapsed: number): void {
    if (this.waterSurfaceMesh && this.waterSurfaceMesh.material) {
      const mat = this.waterSurfaceMesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.80 + Math.sin(elapsed * 2.2) * 0.04;
    }
  }

  /**
   * 切换入射方向 (从空气射入水 / 从水射向空气)
   */
  public setIncidentDirection(isAirToWater: boolean): void {
    this.isAirToWater = isAirToWater;
    this.updateOpticalPaths();
  }

  /**
   * 调节入射角 (精确到整数，并在 0 点处具备磁吸吸附效果)
   */
  public setIncidentAngle(angleDeg: number, snapToZero = true): void {
    let target = angleDeg;
    if (snapToZero) {
      // 0 点处适当吸附效果：在 ±2.0° 范围内自动磁吸至 0°，离开后平滑调节
      if (Math.abs(target) <= 2.0) {
        target = 0;
      } else {
        target = Math.round(target);
      }
    } else {
      target = Math.round(target);
    }
    this.incidentAngleDeg = Math.max(-85, Math.min(85, target));
    this.updateOpticalPaths();
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    if (this.laserCarriageGroup) list.push(this.laserCarriageGroup);
    return list;
  }

  /**
   * 深度释放 GPU 资源
   */
  public dispose(): void {
    if (this.dialTexture) {
      this.dialTexture.dispose();
      this.dialTexture = null;
    }
    if (this.incidentBadgeTex) {
      this.incidentBadgeTex.dispose();
      this.incidentBadgeTex = null;
    }
    if (this.reflectedBadgeTex) {
      this.reflectedBadgeTex.dispose();
      this.reflectedBadgeTex = null;
    }
    if (this.refractedBadgeTex) {
      this.refractedBadgeTex.dispose();
      this.refractedBadgeTex = null;
    }

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
  }
}
