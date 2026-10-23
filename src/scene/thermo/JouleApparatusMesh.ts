/**
 * 焦耳热功当量与做功-传热等效实验仪 3D 高精细度模型装配体
 * (High-Fidelity Joule's Mechanical & Electrical Equivalent of Heat 3D Apparatus)
 *
 * 【工业级三维精雕建模规范遵从】：
 * 1. 严禁粗糙几何拼接：全部采用带倒角 ExtrudeGeometry、多阶车削法兰、48齿物理滚花旋钮、
 *    6辐条滚珠轴承定滑轮、螺旋 TubeGeometry 康铜电热丝与交错镂空黄铜搅拌叶轮；
 * 2. 高级科研仪器材质体系 (严禁脏黑塑料)：
 *    - 航天级阳极氧化喷砂银铝 (0xe2e8f0 / 0xf1f5f9)
 *    - 镜面抛光 316L 液态铬导轨与主轴 (0xffffff)
 *    - 香槟金抛光黄铜配重砝码、滑轮、叶轮与调谐旋钮 (0xf59e0b / 0xd97706)
 *    - 纯净高硼硅光学玻璃观测窗 (MeshPhysicalMaterial transmission)
 *    - 深邃海洋蓝黑全息遥测显示面板 (#08101e / #0a192f)
 * 3. 正对操作者人体工学布局 (+Z 朝向操作者)：
 *    - 左右对称双塔滑轮与激光蚀刻高度标尺 (X = ±0.175m)
 *    - 中央 150° 大视野前剖面双层绝热量热器 (X = 0)
 *    - 左前侧流体切换四通旋塞阀与贝克曼精密差示温度计
 *    - 右前侧焦耳电热刀闸开关与 48 齿滚花变阻器控制台
 *    - 上方深海蓝宝石 ΔT-W 能量转换与热功当量实时测定屏
 */

import * as THREE from 'three';
import { disposeObjectTree } from '../mech/mechKit.ts';
import type { JouleTelemetry } from '../../physics/thermo/jouleDynamics.ts';

/**
 * 3D 螺旋康铜加热丝路径曲线
 */
class HelicalCoilCurve extends THREE.Curve<THREE.Vector3> {
  private radius: number;
  private turns: number;
  private yBottom: number;
  private yTop: number;

  constructor(radius = 0.033, turns = 5.5, yBottom = 0.056, yTop = 0.092) {
    super();
    this.radius = radius;
    this.turns = turns;
    this.yBottom = yBottom;
    this.yTop = yTop;
  }

  public override getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.turns;
    const x = Math.cos(angle) * this.radius;
    const z = Math.sin(angle) * this.radius;
    const y = this.yBottom + t * (this.yTop - this.yBottom);
    return optionalTarget.set(x, y, z);
  }
}

export class JouleApparatusMesh {
  public readonly group = new THREE.Group();

  // 核心结构子分组
  public readonly staticGroup = new THREE.Group();
  public readonly calorimeterGroup = new THREE.Group();
  public readonly paddleWheelGroup = new THREE.Group();
  public readonly statorBaffleGroup = new THREE.Group();
  public readonly winchGroup = new THREE.Group();
  public readonly crankRotorGroup = new THREE.Group();
  public readonly clutchLeverGroup = new THREE.Group();
  public readonly leftPulleyRotor = new THREE.Group();
  public readonly rightPulleyRotor = new THREE.Group();
  public readonly leftWeightGroup = new THREE.Group();
  public readonly rightWeightGroup = new THREE.Group();
  public readonly knifeSwitchBladeGroup = new THREE.Group();
  public readonly rheostatKnobGroup = new THREE.Group();
  public readonly fluidValveHandleGroup = new THREE.Group();

  // 7 大纯三维直接交互拾取热区 (HitBoxes)
  public readonly crankHitBox: THREE.Mesh;
  public readonly clutchLeverHitBox: THREE.Mesh;
  public readonly leftWeightHitBox: THREE.Mesh;
  public readonly rightWeightHitBox: THREE.Mesh;
  public readonly baffleToggleHitBox: THREE.Mesh;
  public readonly elecSwitchHitBox: THREE.Mesh;
  public readonly rheostatHitBox: THREE.Mesh;
  public readonly fluidValveHitBox: THREE.Mesh;

  // 共享高端实验室材质
  private satinAluminumMat!: THREE.MeshStandardMaterial;
  private slateTitaniumMat!: THREE.MeshStandardMaterial;
  private liquidChromeMat!: THREE.MeshStandardMaterial;
  private champagneBrassMat!: THREE.MeshStandardMaterial;
  private brushedCopperMat!: THREE.MeshStandardMaterial;
  private opticalGlassMat!: THREE.MeshPhysicalMaterial;
  private cordMat!: THREE.MeshStandardMaterial;
  private rubyMercuryMat!: THREE.MeshStandardMaterial;
  private heaterCoilMat!: THREE.MeshStandardMaterial;
  private fluidMat!: THREE.MeshPhysicalMaterial;

  // 动态视觉构件引用
  private windingDrumMesh!: THREE.Mesh;
  private drumCordLoops: THREE.Mesh[] = [];
  private leftCordVertical!: THREE.Mesh;
  private rightCordVertical!: THREE.Mesh;
  private leftHeightCursor!: THREE.Group;
  private rightHeightCursor!: THREE.Group;
  private leftWeightDiscs: THREE.Mesh[] = [];
  private rightWeightDiscs: THREE.Mesh[] = [];
  private leftWeightGlowRing!: THREE.Mesh;
  private rightWeightGlowRing!: THREE.Mesh;

  // 量热器内部流体、涡流液面与电热丝
  private fluidColumnMesh!: THREE.Mesh;
  private fluidVortexRingMesh!: THREE.Mesh;
  private heaterCoilMesh!: THREE.Mesh;
  private heaterLight!: THREE.PointLight;
  private baffleLockPinGroup!: THREE.Group;
  private baffleStatusRingMat!: THREE.MeshBasicMaterial;
  private switchStatusRingMat!: THREE.MeshBasicMaterial;
  private clutchStatusRingMat!: THREE.MeshBasicMaterial;

  // 贝克曼精密差示温度计动态液柱与游标
  private thermometerColumnMesh!: THREE.Mesh;
  private thermometerCursorGroup!: THREE.Group;

  // 微观分子热运动与湍流剪切粒子场 (220 粒子 BufferAttribute 原位更新)
  private readonly particleCount = 220;
  private molecularGeo!: THREE.BufferGeometry;
  private molecularPositions!: Float32Array;
  private molecularColors!: Float32Array;
  private molecularRadii!: Float32Array;
  private molecularAngles!: Float32Array;
  private molecularHeights!: Float32Array;
  private molecularSpeeds!: Float32Array;
  private molecularPoints!: THREE.Points;

  // 纹理资源追踪以便释放
  private ownedTextures: THREE.Texture[] = [];

  // 物理与几何行程常量
  public readonly pulleyX = 0.180;          // 左右滑轮中心 X 坐标 (±0.180 m)
  public readonly pulleyY = 0.258;          // 顶部滑轮槽高度 Y (0.258 m)
  public readonly weightTopY = 0.212;       // 重锤上死点 Y (对应 h = 1.20 m)
  public readonly weightBottomY = 0.046;    // 重锤下死点 Y (对应 h = 0.00 m)
  public readonly weightTravelM = 0.166;    // 3D 视口内重锤物理升降行程 (0.166 m 映射 1.20 m)

  constructor() {
    this.group.name = 'JouleApparatusMesh';

    this.initMaterials();
    this.buildBaseplateAndFeet();
    this.buildCutawayCalorimeter();
    this.buildPaddleAndStatorAssembly();
    this.buildTopWinchAndClutch();
    this.buildTwinPulleyTowersAndWeights();
    this.buildBeckmannThermometer();
    this.buildElectricalJouleConsole();
    this.buildFluidSelectorManifold();
    this.buildMicroscopicMolecularSystem();

    this.group.add(this.staticGroup);
    this.group.add(this.calorimeterGroup);
    this.group.add(this.winchGroup);

    // 创建 8 个高灵敏三维拾取热区
    this.crankHitBox = this.createHitBox(0.085, 0.055, 0.085, 'JouleCrankHitBox');
    this.crankHitBox.position.set(0, 0.278, 0);
    this.winchGroup.add(this.crankHitBox);

    this.clutchLeverHitBox = this.createHitBox(0.055, 0.045, 0.055, 'JouleClutchHitBox');
    this.clutchLeverHitBox.position.set(0.042, 0.218, 0.032);
    this.winchGroup.add(this.clutchLeverHitBox);

    this.leftWeightHitBox = this.createHitBox(0.068, 0.078, 0.068, 'JouleLeftWeightHitBox');
    this.leftWeightHitBox.position.set(0, 0.025, 0);
    this.leftWeightGroup.add(this.leftWeightHitBox);

    this.rightWeightHitBox = this.createHitBox(0.068, 0.078, 0.068, 'JouleRightWeightHitBox');
    this.rightWeightHitBox.position.set(0, 0.025, 0);
    this.rightWeightGroup.add(this.rightWeightHitBox);

    this.baffleToggleHitBox = this.createHitBox(0.048, 0.042, 0.048, 'JouleBaffleHitBox');
    this.baffleToggleHitBox.position.set(-0.042, 0.175, 0.025);
    this.calorimeterGroup.add(this.baffleToggleHitBox);

    this.elecSwitchHitBox = this.createHitBox(0.056, 0.052, 0.062, 'JouleElecSwitchHitBox');
    this.elecSwitchHitBox.position.set(0.095, 0.048, 0.066);
    this.staticGroup.add(this.elecSwitchHitBox);

    this.rheostatHitBox = this.createHitBox(0.056, 0.052, 0.056, 'JouleRheostatHitBox');
    this.rheostatHitBox.position.set(0.142, 0.048, 0.066);
    this.staticGroup.add(this.rheostatHitBox);

    this.fluidValveHitBox = this.createHitBox(0.058, 0.052, 0.058, 'JouleFluidValveHitBox');
    this.fluidValveHitBox.position.set(-0.115, 0.048, 0.066);
    this.staticGroup.add(this.fluidValveHitBox);
  }

  /**
   * 初始化符合高端实验室标准的金属与光学材质体系
   */
  private initMaterials(): void {
    // 航天级阳极氧化喷砂银铝
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.82,
      roughness: 0.24,
      envMapIntensity: 1.35,
    });

    // 深空钛银灰结构合金 (拒绝沉闷脏黑)
    this.slateTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 1.4,
    });

    // 316L 镜面液态铬不锈钢
    this.liquidChromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.07,
      envMapIntensity: 1.85,
    });

    // 香槟金抛光黄铜
    this.champagneBrassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.18,
      envMapIntensity: 1.6,
    });

    // 紫铜导热内胆与导电排材质
    this.brushedCopperMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.22,
      envMapIntensity: 1.4,
    });

    // 纯净光学高硼硅玻璃
    this.opticalGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.34,
      roughness: 0.04,
      metalness: 0.05,
      transmission: 0.92,
      ior: 1.51,
      thickness: 0.015,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 高强度芳纶编织牵引绳
    this.cordMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      metalness: 0.35,
      roughness: 0.55,
    });

    // 贝克曼温度计宝石红感温液柱
    this.rubyMercuryMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.65,
      metalness: 0.3,
      roughness: 0.15,
    });

    // 康铜螺旋电热丝 (可随电流动态炽热发光)
    this.heaterCoilMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      emissive: 0xff5500,
      emissiveIntensity: 0.0,
      metalness: 0.85,
      roughness: 0.25,
    });

    // 量热器内部工作液体材质
    this.fluidMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.52,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.65,
      ior: 1.33,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * 1. 构建加重防倾覆计量级基座、黄铜调平脚垫与正前方激光铭牌
   */
  private buildBaseplateAndFeet(): void {
    const w = 0.44;
    const d = 0.21;
    const hw = w * 0.5;
    const hd = d * 0.5;
    const r = 0.022;

    const baseShape = new THREE.Shape();
    baseShape.moveTo(-hw + r, -hd);
    baseShape.lineTo(hw - r, -hd);
    baseShape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    baseShape.lineTo(hw, hd - r);
    baseShape.quadraticCurveTo(hw, hd, hw - r, hd);
    baseShape.lineTo(-hw + r, hd);
    baseShape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    baseShape.lineTo(-hw, -hd + r);
    baseShape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.003,
      bevelThickness: 0.003,
    });
    const baseMesh = new THREE.Mesh(baseGeo, this.slateTitaniumMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.008;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.staticGroup.add(baseMesh);

    // 上层银铝精密仪器平台垫板
    const deckGeo = new THREE.ExtrudeGeometry(baseShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
    });
    const deckMesh = new THREE.Mesh(deckGeo, this.satinAluminumMat);
    deckMesh.scale.set(0.95, 0.92, 1.0);
    deckMesh.rotation.x = -Math.PI / 2;
    deckMesh.position.y = 0.027;
    deckMesh.receiveShadow = true;
    this.staticGroup.add(deckMesh);

    // 四角香槟金黄铜减震调平支脚 (配滚花锁紧环)
    const footCoords = [
      [-hw + 0.028, -hd + 0.026],
      [hw - 0.028, -hd + 0.026],
      [-hw + 0.028, hd - 0.026],
      [hw - 0.028, hd - 0.026],
    ];
    const footPadGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.006, 24);
    const footCollarGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.006, 24);
    for (const [fx, fz] of footCoords) {
      const pad = new THREE.Mesh(footPadGeo, this.champagneBrassMat);
      pad.position.set(fx, 0.003, fz);
      this.staticGroup.add(pad);

      const collar = new THREE.Mesh(footCollarGeo, this.liquidChromeMat);
      collar.position.set(fx, 0.008, fz);
      this.staticGroup.add(collar);
    }

    // 基座正前方激光蚀刻铭牌 (+Z)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 1012, 116);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(
      'JOULE MECHANICAL & ELECTRICAL EQUIVALENT OF HEAT APPARATUS',
      512,
      52
    );
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(
      '焦耳热功当量与做功-传热等效性精密实验台 · ΔU = W + Q · J = 4.186 J/cal',
      512,
      96
    );
    const plateTex = new THREE.CanvasTexture(canvas);
    this.ownedTextures.push(plateTex);

    const plateMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.016),
      new THREE.MeshBasicMaterial({ map: plateTex })
    );
    plateMesh.position.set(0, 0.017, hd + 0.0032);
    this.staticGroup.add(plateMesh);
  }

  /**
   * 2. 构建中央 150° 大视野剖面双层真空绝热量热器与螺旋康铜电热丝
   */
  private buildCutawayCalorimeter(): void {
    const baseTopY = 0.033;

    // 绝热底座法兰盘与 8 颗六角固定螺栓
    const pedestalGeo = new THREE.CylinderGeometry(0.062, 0.068, 0.014, 48);
    const pedestalMesh = new THREE.Mesh(pedestalGeo, this.slateTitaniumMat);
    pedestalMesh.position.y = baseTopY + 0.007;
    this.calorimeterGroup.add(pedestalMesh);

    const lowerBrassRingGeo = new THREE.CylinderGeometry(0.057, 0.059, 0.008, 48);
    const lowerBrassRing = new THREE.Mesh(lowerBrassRingGeo, this.champagneBrassMat);
    lowerBrassRing.position.y = baseTopY + 0.016;
    this.calorimeterGroup.add(lowerBrassRing);

    const hexBoltGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 6);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(hexBoltGeo, this.liquidChromeMat);
      bolt.position.set(Math.cos(ang) * 0.062, baseTopY + 0.015, Math.sin(ang) * 0.062);
      this.calorimeterGroup.add(bolt);
    }

    // 量热器外层喷砂银铝真空绝热护套 (后方 210° 环抱，前方 150° 剖开正对 +Z 操作者视线)
    const jacketHeight = 0.118;
    const jacketCenterY = baseTopY + 0.020 + jacketHeight * 0.5;
    // 在 Three.js CylinderGeometry 中，theta=0 对应 +Z，因此从 +75° (0.417π) 绕后方延伸 210° (1.167π)
    const cutawayStart = Math.PI * 0.42;
    const cutawayLength = Math.PI * 1.16;

    const outerJacketGeo = new THREE.CylinderGeometry(
      0.056,
      0.056,
      jacketHeight,
      48,
      1,
      true,
      cutawayStart,
      cutawayLength
    );
    const outerJacketMesh = new THREE.Mesh(outerJacketGeo, this.satinAluminumMat);
    outerJacketMesh.position.y = jacketCenterY;
    outerJacketMesh.castShadow = true;
    this.calorimeterGroup.add(outerJacketMesh);

    // 内层紫铜导热反射壁 (同样带前方大视野剖口)
    const innerCopperWallGeo = new THREE.CylinderGeometry(
      0.049,
      0.049,
      jacketHeight - 0.004,
      48,
      1,
      true,
      cutawayStart,
      cutawayLength
    );
    const innerCopperWall = new THREE.Mesh(innerCopperWallGeo, this.brushedCopperMat);
    innerCopperWall.position.y = jacketCenterY;
    this.calorimeterGroup.add(innerCopperWall);

    // 剖面左右两侧精密黄铜封边立柱 (展示双层真空绝热腔体壁厚)
    const trimBarGeo = new THREE.BoxGeometry(0.008, jacketHeight, 0.006);
    for (const side of [-1, 1]) {
      const ang = side * Math.PI * 0.42;
      const trim = new THREE.Mesh(trimBarGeo, this.champagneBrassMat);
      trim.position.set(Math.sin(ang) * 0.0525, jacketCenterY, Math.cos(ang) * 0.0525);
      trim.rotation.y = ang;
      this.calorimeterGroup.add(trim);
    }

    // 量热器紫铜内底盘
    const bottomDiscGeo = new THREE.CylinderGeometry(0.049, 0.049, 0.004, 48);
    const bottomDisc = new THREE.Mesh(bottomDiscGeo, this.brushedCopperMat);
    bottomDisc.position.y = baseTopY + 0.020;
    this.calorimeterGroup.add(bottomDisc);

    // 全景高硼硅光学玻璃内筒护罩 (360° 透明密封，透过前剖窗清晰观察叶轮与液体)
    const glassCylinderGeo = new THREE.CylinderGeometry(0.048, 0.048, jacketHeight - 0.004, 48, 1, true);
    const glassCylinder = new THREE.Mesh(glassCylinderGeo, this.opticalGlassMat);
    glassCylinder.position.y = jacketCenterY;
    glassCylinder.renderOrder = 12;
    this.calorimeterGroup.add(glassCylinder);

    // 顶部绝热压盖法兰环与香槟金锁圈
    const topCapY = baseTopY + 0.020 + jacketHeight;
    const topFlangeGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.010, 48);
    const topFlange = new THREE.Mesh(topFlangeGeo, this.satinAluminumMat);
    topFlange.position.y = topCapY + 0.005;
    this.calorimeterGroup.add(topFlange);

    const topBrassRimGeo = new THREE.TorusGeometry(0.056, 0.0028, 16, 48);
    const topBrassRim = new THREE.Mesh(topBrassRimGeo, this.champagneBrassMat);
    topBrassRim.rotation.x = Math.PI / 2;
    topBrassRim.position.y = topCapY + 0.005;
    this.calorimeterGroup.add(topBrassRim);

    // 量热器内部工作液体圆柱与顶部动态旋涡弯月面
    const fluidHeight = 0.096;
    const fluidGeo = new THREE.CylinderGeometry(0.0465, 0.0465, fluidHeight, 48);
    this.fluidColumnMesh = new THREE.Mesh(fluidGeo, this.fluidMat);
    this.fluidColumnMesh.position.y = baseTopY + 0.022 + fluidHeight * 0.5;
    this.fluidColumnMesh.renderOrder = 8;
    this.calorimeterGroup.add(this.fluidColumnMesh);

    const vortexRingGeo = new THREE.TorusGeometry(0.032, 0.0035, 16, 48);
    const vortexRingMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.45,
    });
    this.fluidVortexRingMesh = new THREE.Mesh(vortexRingGeo, vortexRingMat);
    this.fluidVortexRingMesh.rotation.x = Math.PI / 2;
    this.fluidVortexRingMesh.position.y = baseTopY + 0.022 + fluidHeight - 0.002;
    this.fluidVortexRingMesh.renderOrder = 9;
    this.calorimeterGroup.add(this.fluidVortexRingMesh);

    // 内置螺旋康铜电热丝线圈 (TubeGeometry 真实三维螺旋管)
    const coilCurve = new HelicalCoilCurve(0.037, 5.5, baseTopY + 0.028, baseTopY + 0.072);
    const coilGeo = new THREE.TubeGeometry(coilCurve, 120, 0.0018, 12, false);
    this.heaterCoilMesh = new THREE.Mesh(coilGeo, this.heaterCoilMat);
    this.calorimeterGroup.add(this.heaterCoilMesh);

    // 电热丝通电炽热腔内点光源
    this.heaterLight = new THREE.PointLight(0xff6b00, 0.0, 0.35, 2);
    this.heaterLight.position.set(0, baseTopY + 0.055, 0);
    this.calorimeterGroup.add(this.heaterLight);
  }

  /**
   * 3. 构建焦耳核心专利结构：四层镂空旋转黄铜叶轮 + 四层可啮合/抽离固定阻流定子叶片
   */
  private buildPaddleAndStatorAssembly(): void {
    const baseTopY = 0.033;
    const chamberBottomY = baseTopY + 0.022;

    // 3a. 中心 316L 镜面铬旋转主轴
    const shaftGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.145, 24);
    const shaftMesh = new THREE.Mesh(shaftGeo, this.liquidChromeMat);
    shaftMesh.position.y = chamberBottomY + 0.070;
    this.paddleWheelGroup.add(shaftMesh);

    // 4 层旋转黄铜叶轮 (每层 4 片带湍流剪切孔的精密叶片，共 16 片)
    const tierHeights = [0.022, 0.042, 0.062, 0.082];
    const hubGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 24);
    const bladeOuterGeo = new THREE.BoxGeometry(0.032, 0.0095, 0.0024);
    const bladeTipGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.0095, 12);

    for (let tIdx = 0; tIdx < tierHeights.length; tIdx++) {
      const ty = chamberBottomY + tierHeights[tIdx];
      const hub = new THREE.Mesh(hubGeo, this.champagneBrassMat);
      hub.position.y = ty;
      this.paddleWheelGroup.add(hub);

      for (let b = 0; b < 4; b++) {
        const angle = (b / 4) * Math.PI * 2 + (tIdx % 2) * (Math.PI / 8);
        const bladeGroup = new THREE.Group();
        bladeGroup.position.y = ty;
        bladeGroup.rotation.y = angle;

        const blade = new THREE.Mesh(bladeOuterGeo, this.champagneBrassMat);
        blade.position.x = 0.022;
        bladeGroup.add(blade);

        const tip = new THREE.Mesh(bladeTipGeo, this.liquidChromeMat);
        tip.position.x = 0.038;
        bladeGroup.add(tip);

        this.paddleWheelGroup.add(bladeGroup);
      }
    }
    this.calorimeterGroup.add(this.paddleWheelGroup);

    // 3b. 4 层交错固定阻流定子隔板 (Stator Baffle Vanes)
    // 嵌于旋转叶轮层间间隙 (0.032, 0.052, 0.072, 0.092)，阻止液体整体空转！
    const statorHeights = [0.032, 0.052, 0.072, 0.092];
    const statorBladeGeo = new THREE.BoxGeometry(0.028, 0.0065, 0.0022);
    const statorPostGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.092, 16);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(statorPostGeo, this.liquidChromeMat);
      post.position.set(side * 0.042, chamberBottomY + 0.056, 0);
      this.statorBaffleGroup.add(post);

      for (const sy of statorHeights) {
        const vane = new THREE.Mesh(statorBladeGeo, this.brushedCopperMat);
        vane.position.set(side * 0.027, chamberBottomY + sy, 0);
        this.statorBaffleGroup.add(vane);
      }
    }
    this.calorimeterGroup.add(this.statorBaffleGroup);

    // 顶部左侧定子阻流片啮合锁销开关 (3D Baffle Lock Pin)
    this.baffleLockPinGroup = new THREE.Group();
    this.baffleLockPinGroup.position.set(-0.042, baseTopY + 0.148, 0.022);

    const pinBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.011, 0.010, 24),
      this.slateTitaniumMat
    );
    this.baffleLockPinGroup.add(pinBase);

    const pinKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.012, 24),
      this.champagneBrassMat
    );
    pinKnob.position.y = 0.011;
    this.baffleLockPinGroup.add(pinKnob);

    this.baffleStatusRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const pinRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0095, 0.0016, 12, 24),
      this.baffleStatusRingMat
    );
    pinRing.rotation.x = Math.PI / 2;
    pinRing.position.y = 0.006;
    this.baffleLockPinGroup.add(pinRing);

    this.calorimeterGroup.add(this.baffleLockPinGroup);
  }

  /**
   * 4. 构建顶部双立柱拱桥、双槽绕线卷筒、棘轮离合器拨杆与手摇曲柄
   */
  private buildTopWinchAndClutch(): void {
    const lidTopY = 0.181;

    // 左右拱桥支座立柱
    const pillarGeo = new THREE.CylinderGeometry(0.0055, 0.0065, 0.068, 24);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, this.satinAluminumMat);
      pillar.position.set(side * 0.038, lidTopY + 0.034, 0);
      this.winchGroup.add(pillar);
    }

    // 顶部横梁桥板
    const bridgeGeo = new THREE.BoxGeometry(0.096, 0.010, 0.034);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, this.slateTitaniumMat);
    bridgeMesh.position.y = lidTopY + 0.068;
    this.winchGroup.add(bridgeMesh);

    // 中央香槟金双槽绕线卷筒 (Winding Drum)
    const drumY = lidTopY + 0.036;
    const drumGroup = new THREE.Group();
    drumGroup.position.y = drumY;

    const drumCoreGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.044, 36);
    this.windingDrumMesh = new THREE.Mesh(drumCoreGeo, this.champagneBrassMat);
    drumGroup.add(this.windingDrumMesh);

    // 卷筒上中下三道法兰挡圈
    const flangeGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.0035, 36);
    for (const fy of [-0.021, 0, 0.021]) {
      const flange = new THREE.Mesh(flangeGeo, this.champagneBrassMat);
      flange.position.y = fy;
      drumGroup.add(flange);
    }

    // 卷筒外圈 10 匝精密缠绕牵引绳圈
    const loopGeo = new THREE.TorusGeometry(0.0192, 0.0014, 10, 32);
    for (let i = 0; i < 10; i++) {
      const loop = new THREE.Mesh(loopGeo, this.cordMat);
      loop.rotation.x = Math.PI / 2;
      const offset = i < 5 ? -0.016 + i * 0.003 : 0.004 + (i - 5) * 0.003;
      loop.position.y = offset;
      this.drumCordLoops.push(loop);
      drumGroup.add(loop);
    }
    this.winchGroup.add(drumGroup);

    // 24 齿棘轮齿轮与离合释放拨杆 (Clutch Lever at X=+0.038, Z=+0.022)
    this.clutchLeverGroup.position.set(0.038, lidTopY + 0.036, 0.020);
    const clutchHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.012, 24),
      this.champagneBrassMat
    );
    clutchHub.rotation.x = Math.PI / 2;
    this.clutchLeverGroup.add(clutchHub);

    const leverArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0028, 0.0035, 0.032, 16),
      this.liquidChromeMat
    );
    leverArm.position.set(0.010, 0.012, 0.004);
    leverArm.rotation.z = -Math.PI / 5;
    this.clutchLeverGroup.add(leverArm);

    const leverBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.0065, 20, 20),
      this.champagneBrassMat
    );
    leverBall.position.set(0.019, 0.024, 0.004);
    this.clutchLeverGroup.add(leverBall);

    this.clutchStatusRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const clutchRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0105, 0.0016, 12, 24),
      this.clutchStatusRingMat
    );
    clutchRing.position.z = 0.006;
    this.clutchLeverGroup.add(clutchRing);
    this.winchGroup.add(this.clutchLeverGroup);

    // 顶部手摇绞盘曲柄总成 (Hand-Crank Rotor)
    this.crankRotorGroup.position.y = lidTopY + 0.075;

    const crankCenterCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.010, 24),
      this.champagneBrassMat
    );
    this.crankRotorGroup.add(crankCenterCap);

    const crankArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.006, 0.012),
      this.liquidChromeMat
    );
    crankArm.position.set(0.020, 0.004, 0);
    this.crankRotorGroup.add(crankArm);

    // 曲柄直立滚花握把
    const gripPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0045, 0.028, 24),
      this.slateTitaniumMat
    );
    gripPost.position.set(0.042, 0.020, 0);
    this.crankRotorGroup.add(gripPost);

    const gripCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 16, 16),
      this.champagneBrassMat
    );
    gripCap.position.set(0.042, 0.034, 0);
    this.crankRotorGroup.add(gripCap);

    this.winchGroup.add(this.crankRotorGroup);
  }

  /**
   * 5. 构建左右对称双滑轮高塔、激光蚀刻高度标尺、牵引绳与挂钩开口黄铜砝码组
   */
  private buildTwinPulleyTowersAndWeights(): void {
    const baseTopY = 0.033;
    const towerHeight = 0.228;

    for (const side of [-1, 1]) {
      const towerX = side * this.pulleyX;
      const towerGroup = new THREE.Group();
      towerGroup.position.set(towerX, 0, 0);

      // 塔座法兰
      const baseBlock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.028, 0.014, 32),
        this.slateTitaniumMat
      );
      baseBlock.position.y = baseTopY + 0.007;
      towerGroup.add(baseBlock);

      // 双根 316L 镜面镀铬精密立柱导杆 (位于后侧 Z = -0.018，绝不遮挡前方重锤与标尺)
      const rodGeo = new THREE.CylinderGeometry(0.0038, 0.0038, towerHeight, 20);
      for (const rx of [-0.012, 0.012]) {
        const rod = new THREE.Mesh(rodGeo, this.liquidChromeMat);
        rod.position.set(rx, baseTopY + towerHeight * 0.5, -0.018);
        rod.castShadow = true;
        towerGroup.add(rod);
      }

      // 顶部悬臂轴承架
      const topBracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, 0.014, 0.046),
        this.satinAluminumMat
      );
      topBracket.position.set(0, this.pulleyY, -0.006);
      towerGroup.add(topBracket);

      // 6 辐条精密滚珠轴承香槟金定滑轮
      const pulleyRotor = side === -1 ? this.leftPulleyRotor : this.rightPulleyRotor;
      pulleyRotor.position.set(0, this.pulleyY, 0.008);

      const rimTorus = new THREE.Mesh(
        new THREE.TorusGeometry(0.020, 0.0032, 16, 36),
        this.champagneBrassMat
      );
      pulleyRotor.add(rimTorus);

      const hubMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.008, 24),
        this.liquidChromeMat
      );
      hubMesh.rotation.x = Math.PI / 2;
      pulleyRotor.add(hubMesh);

      const spokeGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.038, 12);
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(spokeGeo, this.champagneBrassMat);
        spoke.rotation.z = (s / 3) * Math.PI;
        pulleyRotor.add(spoke);
      }
      towerGroup.add(pulleyRotor);

      // 激光蚀刻重锤高度标尺立牌 (0.00 m ~ 1.20 m，正对 +Z)
      const scaleTex = this.createHeightScaleTexture();
      const scalePlate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.024, 0.175),
        new THREE.MeshBasicMaterial({ map: scaleTex, transparent: true })
      );
      scalePlate.position.set(-side * 0.030, baseTopY + 0.116, 0.006);
      towerGroup.add(scalePlate);

      // 随动高对比度游标高度指针
      const cursorGroup = new THREE.Group();
      const pointerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.0035, 0.006),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      pointerMesh.position.set(-side * 0.020, 0, 0.008);
      cursorGroup.add(pointerMesh);
      if (side === -1) {
        this.leftHeightCursor = cursorGroup;
      } else {
        this.rightHeightCursor = cursorGroup;
      }
      towerGroup.add(cursorGroup);

      this.staticGroup.add(towerGroup);
    }

    // 中央卷筒至左右滑轮顶部的水平牵引绳段
    const horizLen = this.pulleyX - 0.018;
    const horizCordGeo = new THREE.CylinderGeometry(0.0012, 0.0012, horizLen, 12);
    horizCordGeo.rotateZ(Math.PI / 2);

    const leftHorizCord = new THREE.Mesh(horizCordGeo, this.cordMat);
    leftHorizCord.position.set(-0.018 - horizLen * 0.5, 0.238, 0.008);
    this.staticGroup.add(leftHorizCord);

    const rightHorizCord = new THREE.Mesh(horizCordGeo, this.cordMat);
    rightHorizCord.position.set(0.018 + horizLen * 0.5, 0.238, 0.008);
    this.staticGroup.add(rightHorizCord);

    // 左右垂直动态伸缩牵引绳 (原点位于顶部 y=0，向下延伸 length=1.0 以便通过 scale.y 动态控制)
    const vertCordGeo = new THREE.CylinderGeometry(0.0013, 0.0013, 1.0, 12);
    vertCordGeo.translate(0, -0.5, 0);

    this.leftCordVertical = new THREE.Mesh(vertCordGeo, this.cordMat);
    this.leftCordVertical.position.set(-this.pulleyX, this.pulleyY, 0.008);
    this.staticGroup.add(this.leftCordVertical);

    this.rightCordVertical = new THREE.Mesh(vertCordGeo, this.cordMat);
    this.rightCordVertical.position.set(this.pulleyX, this.pulleyY, 0.008);
    this.staticGroup.add(this.rightCordVertical);

    // 构建左右双侧开口黄铜配重砝码串 (Slotted Brass Weight Stacks)
    this.buildWeightStack(this.leftWeightGroup, this.leftWeightDiscs, -this.pulleyX, true);
    this.buildWeightStack(this.rightWeightGroup, this.rightWeightDiscs, this.pulleyX, false);
  }

  /**
   * 构建单侧高精度开槽黄铜砝码盘与叠片组
   */
  private buildWeightStack(
    targetGroup: THREE.Group,
    discArray: THREE.Mesh[],
    posX: number,
    isLeft: boolean
  ): void {
    targetGroup.position.set(posX, this.weightTopY, 0.008);

    // 底部承重托盘与中心吊杆
    const trayMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.020, 0.005, 32),
      this.liquidChromeMat
    );
    trayMesh.position.y = 0.0025;
    targetGroup.add(trayMesh);

    const hangerStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0028, 0.0028, 0.056, 16),
      this.liquidChromeMat
    );
    hangerStem.position.y = 0.028;
    targetGroup.add(hangerStem);

    // 顶部吊环
    const hookRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0055, 0.0016, 12, 24),
      this.liquidChromeMat
    );
    hookRing.position.y = 0.058;
    targetGroup.add(hookRing);

    // 8 片带径向开口槽的香槟金黄铜砝码圆饼 (每片带倒角环)
    const discGeo = new THREE.CylinderGeometry(
      0.0195,
      0.0195,
      0.0046,
      32,
      1,
      false,
      0.15,
      Math.PI * 2 - 0.3
    );
    for (let i = 0; i < 8; i++) {
      const disc = new THREE.Mesh(discGeo, this.champagneBrassMat);
      disc.position.y = 0.0075 + i * 0.0052;
      disc.castShadow = true;
      discArray.push(disc);
      targetGroup.add(disc);
    }

    // 势能/抓取高亮磁吸光环
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0016, 12, 32), glowMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.004;
    targetGroup.add(glowRing);

    if (isLeft) {
      this.leftWeightGlowRing = glowRing;
    } else {
      this.rightWeightGlowRing = glowRing;
    }

    this.staticGroup.add(targetGroup);
  }

  /**
   * 生成 0.00m ~ 1.20m 激光蚀刻重锤高度标尺纹理
   */
  private createHeightScaleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(0, 0, 160, 1024);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 156, 1020);

    for (let i = 0; i <= 12; i++) {
      const hVal = (1.2 - i * 0.1).toFixed(1);
      const y = 64 + (i / 12) * 896;

      ctx.strokeStyle = i % 2 === 0 ? '#38bdf8' : '#cbd5e1';
      ctx.lineWidth = i % 2 === 0 ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(i % 2 === 0 ? 54 : 36, y);
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${hVal}m`, 60, y + 9);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    this.ownedTextures.push(tex);
    return tex;
  }

  /**
   * 6. 构建左前侧贝克曼高灵敏度差示温度计 (0.01℃ 精密分度 + 随动放大游标)
   */
  private buildBeckmannThermometer(): void {
    const thermoGroup = new THREE.Group();
    thermoGroup.position.set(-0.068, 0.165, 0.022);

    // 铜质密封填料函螺母
    const gland = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0075, 0.014, 24),
      this.champagneBrassMat
    );
    thermoGroup.add(gland);

    // 透明石英毛细玻璃管护套
    const glassStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0042, 0.135, 24),
      this.opticalGlassMat
    );
    glassStem.position.y = 0.068;
    glassStem.renderOrder = 14;
    thermoGroup.add(glassStem);

    // 内部动态上升红宝石感温液柱 (原点位于底部 y=0)
    const colGeo = new THREE.CylinderGeometry(0.0020, 0.0020, 1.0, 16);
    colGeo.translate(0, 0.5, 0);
    this.thermometerColumnMesh = new THREE.Mesh(colGeo, this.rubyMercuryMat);
    this.thermometerColumnMesh.position.y = 0.005;
    this.thermometerColumnMesh.scale.y = 0.022;
    thermoGroup.add(this.thermometerColumnMesh);

    // 随动黄铜读数放大环游标
    this.thermometerCursorGroup = new THREE.Group();
    const cursorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0062, 0.0014, 12, 24),
      this.champagneBrassMat
    );
    cursorRing.rotation.x = Math.PI / 2;
    this.thermometerCursorGroup.add(cursorRing);
    this.thermometerCursorGroup.position.y = 0.027;
    thermoGroup.add(this.thermometerCursorGroup);

    // 贝克曼温度计旁侧精密激光刻度标牌 (20.0℃ ~ 25.0℃，正对 +Z)
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fillRect(0, 0, 160, 512);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 154, 506);

    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BECKMANN ℃', 80, 32);

    for (let i = 0; i <= 5; i++) {
      const tempVal = 25 - i;
      const y = 68 + (i / 5) * 400;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(52, y);
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${tempVal}.0°`, 58, y + 9);
    }

    const thermoTex = new THREE.CanvasTexture(canvas);
    this.ownedTextures.push(thermoTex);
    const thermoPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.028, 0.115),
      new THREE.MeshBasicMaterial({ map: thermoTex, transparent: true })
    );
    thermoPlate.position.set(-0.022, 0.068, 0.004);
    thermoGroup.add(thermoPlate);

    this.calorimeterGroup.add(thermoGroup);
  }

  /**
   * 7. 构建右前侧焦耳电热做功控制台 (3D 刀闸开关 + 48 齿物理滚花变阻器旋钮 + 接线柱)
   */
  private buildElectricalJouleConsole(): void {
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(0.116, 0.032, 0.066);

    // 喷砂银铝底座盒
    const deckBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.096, 0.012, 0.056),
      this.slateTitaniumMat
    );
    deckBox.position.y = 0.006;
    consoleGroup.add(deckBox);

    // 7a. 左侧三维单刀闸刀电源开关 (Knife Switch at local X = -0.022)
    const switchBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.006, 0.038),
      this.satinAluminumMat
    );
    switchBase.position.set(-0.022, 0.014, 0);
    consoleGroup.add(switchBase);

    // 前后黄铜夹座
    const jawGeo = new THREE.BoxGeometry(0.006, 0.012, 0.006);
    const rearPivotJaw = new THREE.Mesh(jawGeo, this.champagneBrassMat);
    rearPivotJaw.position.set(-0.022, 0.020, -0.012);
    consoleGroup.add(rearPivotJaw);

    const frontClipJaw = new THREE.Mesh(jawGeo, this.champagneBrassMat);
    frontClipJaw.position.set(-0.022, 0.020, 0.012);
    consoleGroup.add(frontClipJaw);

    // 可旋转黄铜闸刀臂与绝缘手柄
    this.knifeSwitchBladeGroup.position.set(-0.022, 0.022, -0.012);
    const bladeBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.0035, 0.005, 0.028),
      this.champagneBrassMat
    );
    bladeBar.position.set(0, 0, 0.014);
    this.knifeSwitchBladeGroup.add(bladeBar);

    const insulatedGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0035, 0.014, 16),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.2 })
    );
    insulatedGrip.rotation.x = Math.PI / 2;
    insulatedGrip.position.set(0, 0.002, 0.031);
    this.knifeSwitchBladeGroup.add(insulatedGrip);

    this.knifeSwitchBladeGroup.rotation.x = -0.65; // 初始断开抬起
    consoleGroup.add(this.knifeSwitchBladeGroup);

    this.switchStatusRingMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
    const switchLed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.003, 16),
      this.switchStatusRingMat
    );
    switchLed.position.set(-0.038, 0.013, 0.016);
    consoleGroup.add(switchLed);

    // 7b. 右侧 48 齿物理滚花电流调节变阻旋钮 (Rheostat Knob at local X = +0.024)
    this.rheostatKnobGroup.position.set(0.024, 0.014, 0);

    const knobBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.016, 0.014, 36),
      this.champagneBrassMat
    );
    knobBody.position.y = 0.007;
    this.rheostatKnobGroup.add(knobBody);

    // 真实 36 齿机械滚花凸棱
    const knurlGeo = new THREE.BoxGeometry(0.0012, 0.013, 0.0020);
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI * 2;
      const rib = new THREE.Mesh(knurlGeo, this.champagneBrassMat);
      rib.position.set(Math.cos(ang) * 0.0155, 0.007, Math.sin(ang) * 0.0155);
      rib.rotation.y = -ang;
      this.rheostatKnobGroup.add(rib);
    }

    // 旋钮顶部白铬指向标线
    const indexMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.0025, 0.002, 0.011),
      this.liquidChromeMat
    );
    indexMarker.position.set(0, 0.0145, 0.004);
    this.rheostatKnobGroup.add(indexMarker);

    consoleGroup.add(this.rheostatKnobGroup);
    this.staticGroup.add(consoleGroup);
  }

  /**
   * 8. 构建左前侧工作液体四通旋转切换阀 (水 / 煤油 / 甘油 / 水银)
   */
  private buildFluidSelectorManifold(): void {
    const manifoldGroup = new THREE.Group();
    manifoldGroup.position.set(-0.115, 0.032, 0.066);

    const block = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.026, 0.014, 32),
      this.satinAluminumMat
    );
    block.position.y = 0.007;
    manifoldGroup.add(block);

    // 十字香槟金旋转手柄 (Cross-Handle Valve)
    this.fluidValveHandleGroup.position.y = 0.020;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.006, 0.014, 20),
      this.liquidChromeMat
    );
    this.fluidValveHandleGroup.add(stem);

    const crossBar1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0032, 0.038, 16),
      this.champagneBrassMat
    );
    crossBar1.rotation.z = Math.PI / 2;
    crossBar1.position.y = 0.006;
    this.fluidValveHandleGroup.add(crossBar1);

    const crossBar2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0032, 0.038, 16),
      this.champagneBrassMat
    );
    crossBar2.rotation.x = Math.PI / 2;
    crossBar2.position.y = 0.006;
    this.fluidValveHandleGroup.add(crossBar2);

    // 主指向端蓝宝石标记球
    const tipMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.0048, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    tipMarker.position.set(0, 0.006, 0.019);
    this.fluidValveHandleGroup.add(tipMarker);

    manifoldGroup.add(this.fluidValveHandleGroup);
    this.staticGroup.add(manifoldGroup);
  }

  /**
   * 9. 构建量热器内微观分子热运动与叶轮剪切湍流粒子系统 (BufferAttribute 原位更新)
   */
  private buildMicroscopicMolecularSystem(): void {
    this.molecularGeo = new THREE.BufferGeometry();
    this.molecularPositions = new Float32Array(this.particleCount * 3);
    this.molecularColors = new Float32Array(this.particleCount * 3);
    this.molecularRadii = new Float32Array(this.particleCount);
    this.molecularAngles = new Float32Array(this.particleCount);
    this.molecularHeights = new Float32Array(this.particleCount);
    this.molecularSpeeds = new Float32Array(this.particleCount);

    const yMin = 0.058;
    const yMax = 0.146;

    for (let i = 0; i < this.particleCount; i++) {
      const r = 0.009 + Math.sqrt(Math.random()) * 0.035;
      const theta = Math.random() * Math.PI * 2;
      const y = yMin + Math.random() * (yMax - yMin);

      this.molecularRadii[i] = r;
      this.molecularAngles[i] = theta;
      this.molecularHeights[i] = y;
      this.molecularSpeeds[i] = 0.6 + Math.random() * 0.8;

      this.molecularPositions[i * 3 + 0] = Math.cos(theta) * r;
      this.molecularPositions[i * 3 + 1] = y;
      this.molecularPositions[i * 3 + 2] = Math.sin(theta) * r;

      this.molecularColors[i * 3 + 0] = 0.22;
      this.molecularColors[i * 3 + 1] = 0.74;
      this.molecularColors[i * 3 + 2] = 0.98;
    }

    this.molecularGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.molecularPositions, 3)
    );
    this.molecularGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.molecularColors, 3)
    );

    const pointsMat = new THREE.PointsMaterial({
      size: 0.0042,
      vertexColors: true,
      transparent: true,
      opacity: 0.90,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.molecularPoints = new THREE.Points(this.molecularGeo, pointsMat);
    this.molecularPoints.renderOrder = 10;
    this.calorimeterGroup.add(this.molecularPoints);
  }

  /**
   * 实时同步三维视觉构件位置、旋转、液体涡流、电热光效与微观分子粒子
   */
  public updateVisualState(t: JouleTelemetry, delta: number): void {
    const dt = Math.min(0.05, Math.max(0.0, delta));

    // 1. 同步左右双侧重锤高度、垂直牵引绳长度与游标指针
    const normH = Math.max(0.0, Math.min(1.0, t.normalizedHeight));
    const currentWeightY = this.weightBottomY + normH * this.weightTravelM;
    this.leftWeightGroup.position.y = currentWeightY;
    this.rightWeightGroup.position.y = currentWeightY;

    const cordLength = Math.max(0.015, this.pulleyY - (currentWeightY + 0.058));
    this.leftCordVertical.scale.y = cordLength;
    this.rightCordVertical.scale.y = cordLength;

    if (this.leftHeightCursor && this.rightHeightCursor) {
      this.leftHeightCursor.position.y = currentWeightY + 0.025;
      this.rightHeightCursor.position.y = currentWeightY + 0.025;
    }

    // 同步砝码叠片数量 (根据 weightMassKg 1~10kg 映射显示 2~8 片黄铜砝码)
    const activeDiscs = Math.max(2, Math.min(8, Math.round((t.weightMassKg / 10.0) * 8)));
    for (let i = 0; i < 8; i++) {
      const visible = i < activeDiscs;
      if (this.leftWeightDiscs[i]) this.leftWeightDiscs[i].visible = visible;
      if (this.rightWeightDiscs[i]) this.rightWeightDiscs[i].visible = visible;
    }

    // 2. 同步叶轮、绕线卷筒、手摇曲柄与左右定滑轮旋转角度
    this.paddleWheelGroup.rotation.y = -t.paddleAngleRad;
    this.windingDrumMesh.rotation.y = -t.paddleAngleRad * 0.35;
    this.crankRotorGroup.rotation.y = -t.paddleAngleRad * 0.35;

    // 滑轮转角与牵引绳行程精确啮合 (θ = h / R_pulley)
    const pulleyAngle = (1.0 - normH) * 18.0;
    this.leftPulleyRotor.rotation.z = pulleyAngle;
    this.rightPulleyRotor.rotation.z = -pulleyAngle;

    // 卷筒上缠绕绳圈随高度显隐
    const activeLoops = Math.max(2, Math.round(normH * 10));
    for (let i = 0; i < this.drumCordLoops.length; i++) {
      this.drumCordLoops[i].visible = i < activeLoops;
    }

    // 3. 同步定子阻流隔板啮合/抽离机械位移与状态环
    const targetBaffleY = t.bafflesEngaged ? 0.0 : 0.016;
    this.statorBaffleGroup.position.y +=
      (targetBaffleY - this.statorBaffleGroup.position.y) * Math.min(1.0, dt * 12.0);
    this.baffleLockPinGroup.position.y = (t.bafflesEngaged ? 0.181 : 0.190);
    this.baffleStatusRingMat.color.setHex(t.bafflesEngaged ? 0x10b981 : 0xf59e0b);

    // 离合器拨杆姿态
    const targetClutchRotZ = t.isDropping ? -0.45 : 0.0;
    this.clutchLeverGroup.rotation.z +=
      (targetClutchRotZ - this.clutchLeverGroup.rotation.z) * Math.min(1.0, dt * 12.0);
    this.clutchStatusRingMat.color.setHex(t.isDropping ? 0x10b981 : 0x38bdf8);

    // 4. 同步电热刀闸角度、48齿变阻器旋钮转角与康铜电热丝炽热光效
    const targetSwitchRotX = t.heaterActive ? 0.0 : -0.68;
    this.knifeSwitchBladeGroup.rotation.x +=
      (targetSwitchRotX - this.knifeSwitchBladeGroup.rotation.x) * Math.min(1.0, dt * 14.0);
    this.switchStatusRingMat.color.setHex(t.heaterActive ? 0xef4444 : 0x64748b);

    const normCurrent = (t.currentAmp - 0.5) / 5.5;
    this.rheostatKnobGroup.rotation.y = (0.5 - normCurrent) * Math.PI * 1.4;

    this.heaterCoilMat.emissiveIntensity = t.heaterGlowIntensity * 2.4;
    this.heaterLight.intensity = t.heaterGlowIntensity * 1.8;

    // 5. 同步流体光学材质、四通旋塞阀角度与旋涡液面
    this.fluidMat.color.setHex(t.fluidSpec.colorHex);
    this.fluidMat.emissive.setHex(t.fluidSpec.emissiveHex);
    this.fluidMat.opacity = t.fluidSpec.opacity;

    const fluidIdx = ['water', 'kerosene', 'glycerin', 'mercury'].indexOf(t.fluidType);
    const targetValveAngle = (fluidIdx * Math.PI) / 2;
    this.fluidValveHandleGroup.rotation.y +=
      (targetValveAngle - this.fluidValveHandleGroup.rotation.y) * Math.min(1.0, dt * 10.0);

    // 液面旋涡环随叶轮与流体角速度缩放旋转
    const swirlSpeed = Math.max(t.paddleOmegaRadS * 0.35, t.fluidVortexOmegaRadS);
    this.fluidVortexRingMesh.rotation.z -= swirlSpeed * dt;
    const vortexScale = 1.0 + Math.min(0.25, swirlSpeed * 0.015);
    this.fluidVortexRingMesh.scale.set(vortexScale, vortexScale, 1.0);

    // 6. 同步贝克曼差示温度计红宝石液柱高度與放大游标
    const tempProgress = Math.max(0.0, Math.min(1.0, t.deltaTC / 5.0));
    const colHeight = 0.022 + tempProgress * 0.098;
    this.thermometerColumnMesh.scale.y = colHeight;
    this.thermometerCursorGroup.position.y = 0.005 + colHeight;

    // 7. 原位更新 220 颗微观分子热运动与湍流剪切粒子场
    this.updateMicroscopicParticles(t, dt);
  }

  /**
   * 原位更新分子热运动粒子位置与色彩 (0 GC 内存分配)
   */
  private updateMicroscopicParticles(t: JouleTelemetry, dt: number): void {
    const posAttr = this.molecularGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.molecularGeo.attributes.color as THREE.BufferAttribute;

    const thermalFactor = 1.0 + Math.min(3.0, t.deltaTC * 0.65);
    const swirlOmega =
      (t.bafflesEngaged ? t.paddleOmegaRadS * 0.45 : t.fluidVortexOmegaRadS * 0.95) + 0.6;
    const shearKick = t.turbulentShearIntensity;
    const tempRatio = Math.max(0.0, Math.min(1.0, t.deltaTC / 3.5));

    const yMin = 0.058;
    const yMax = 0.146;

    for (let i = 0; i < this.particleCount; i++) {
      const speed = this.molecularSpeeds[i] * thermalFactor;
      let angle = this.molecularAngles[i] - swirlOmega * speed * dt;
      let r = this.molecularRadii[i];
      let y = this.molecularHeights[i];

      // 湍流剪切与电热对流抬升
      const verticalDrift =
        Math.sin(angle * 4.0 + i) * (0.015 * thermalFactor + shearKick * 0.08) +
        (t.heaterGlowIntensity > 0.05 && r > 0.028 ? t.heaterGlowIntensity * 0.035 : 0);
      y += verticalDrift * dt;
      if (y > yMax) y = yMin + (y - yMax);
      if (y < yMin) y = yMax - (yMin - y);

      this.molecularAngles[i] = angle;
      this.molecularHeights[i] = y;

      const idx3 = i * 3;
      this.molecularPositions[idx3 + 0] = Math.cos(angle) * r;
      this.molecularPositions[idx3 + 1] = y;
      this.molecularPositions[idx3 + 2] = Math.sin(angle) * r;

      // 粒子色彩随温度与局部剪切强度从冰川青蓝 (0.2, 0.75, 1.0) 过渡至炽热琥珀金红 (1.0, 0.45, 0.15)
      const localHeat = Math.min(1.0, tempRatio + (i % 5 === 0 ? shearKick * 0.65 : 0));
      this.molecularColors[idx3 + 0] = 0.20 + localHeat * 0.80;
      this.molecularColors[idx3 + 1] = 0.76 - localHeat * 0.22;
      this.molecularColors[idx3 + 2] = 0.98 - localHeat * 0.82;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  /**
   * 设置重锤抓取/悬停高亮反馈
   */
  public setWeightHighlight(active: boolean): void {
    const colorHex = active ? 0xfbbf24 : 0x38bdf8;
    const opacity = active ? 0.85 : 0.45;
    for (const ring of [this.leftWeightGlowRing, this.rightWeightGlowRing]) {
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.color.setHex(colorHex);
        mat.opacity = opacity;
      }
    }
  }

  /**
   * 创建透明射线拾取热区盒
   */
  private createHitBox(w: number, h: number, d: number, name: string): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.visible = true;
    return mesh;
  }

  /**
   * 彻底释放 GPU 纹理、几何体与材质
   */
  public dispose(): void {
    for (const tex of this.ownedTextures) {
      tex.dispose();
    }
    this.ownedTextures = [];
    disposeObjectTree(this.group);
  }
}
