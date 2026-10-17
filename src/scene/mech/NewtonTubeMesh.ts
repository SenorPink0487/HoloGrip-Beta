/**
 * 3D 实验器材模型：牛顿管与旋片式真空抽气机 (Newton's Tube & Laboratory Vacuum Pump)
 *
 * 视觉美学规范 (VisionOS / 航天轻量化实验室风格)：
 * - 彻底告别沉重压抑的黑铁与黑橡胶！
 * - 纯净太空银白纳米陶瓷晶体底座 (Ceramic White / Silver)。
 * - 抛光镜面液态铬双立柱与轴承抱箍 (Polished Liquid Chrome)。
 * - 晶莹微透高韧性医用级硅胶透明导管 (Translucent Crystal Silicone Hose)，自带清澈微折射。
 * - 晶体硅胶缓冲底垫与防震脚垫 (Clear Ice-Blue Silicone)。
 * - 高纯度 24K 镀金硬币、纯白轻羽与温暖天然蜜色软木塞。
 */

import * as THREE from 'three';
import { mechMetal, disposeObjectTree } from './mechKit.ts';

export class NewtonTubeMesh {
  public readonly group = new THREE.Group();

  // 1. 支架总成
  private standGroup = new THREE.Group();
  private rotateButtonPivot = new THREE.Group();
  private rotateButtonRing: THREE.Mesh;
  private rotateButtonIcon: THREE.Mesh;
  private rotateButtonHitBox: THREE.Mesh;
  private rotateButtonHovered = false;

  // 2. 牛顿管旋转总成 (围绕中央水平轴旋转)
  public tubePivot = new THREE.Group();
  private glassOuterMesh: THREE.Mesh;
  private glassInnerMesh: THREE.Mesh;
  private topCapGroup = new THREE.Group();
  private bottomCapGroup = new THREE.Group();
  private graduationGroup = new THREE.Group();
  private valveKnobMesh: THREE.Mesh;
  private valveHitBox: THREE.Mesh;

  // 3. 管内物体
  private featherGroup = new THREE.Group();
  private featherVaneMesh: THREE.Mesh;
  private featherQuillMesh: THREE.Mesh;

  private coinGroup = new THREE.Group();
  private coinMesh: THREE.Mesh;

  private corkGroup = new THREE.Group();
  private corkMesh: THREE.Mesh;

  // 4. 抽气机总成
  private pumpGroup = new THREE.Group();
  private pumpPowerSwitchMesh: THREE.Mesh;
  private pumpSwitchHitBox: THREE.Mesh;
  private pumpLedMesh: THREE.Mesh;
  private pumpGaugeNeedlePivot = new THREE.Group();
  private pumpIntakeNozzle = new THREE.Vector3();

  // 5. 导管
  private hoseMesh: THREE.Mesh | null = null;
  private hoseCurve: THREE.CatmullRomCurve3 | null = null;
  private hoseMaterial: THREE.MeshStandardMaterial;

  // 材质引用 (纯净航天白、抛光铬与晶透硅胶)
  private glassMaterial: THREE.MeshPhysicalMaterial;
  private innerGlassMaterial: THREE.MeshStandardMaterial;
  private chromeMaterial: THREE.MeshStandardMaterial;
  private ceramicWhiteMaterial: THREE.MeshStandardMaterial;
  private brassMaterial: THREE.MeshStandardMaterial;
  private siliconeMaterial: THREE.MeshStandardMaterial;
  private featherMaterial: THREE.MeshStandardMaterial;
  private featherQuillMaterial: THREE.MeshStandardMaterial;
  private coinMaterial: THREE.MeshStandardMaterial;
  private corkMaterial: THREE.MeshStandardMaterial;
  private corkBandMaterial: THREE.MeshStandardMaterial;
  private buttonGlowMaterial: THREE.MeshStandardMaterial;
  private ledMaterial: THREE.MeshStandardMaterial;
  private needleMaterial: THREE.MeshBasicMaterial;

  // 尺寸常量
  public readonly TUBE_LENGTH_M = 1.25;
  public readonly FALL_DISTANCE_M = 1.05; // 扣除两端端盖与缓冲垫的净下落距离
  public readonly TUBE_RADIUS_M = 0.072; // 大直径光学牛顿管 (直径 14.4cm，气势恢宏、清晰透亮)
  public readonly PIVOT_HEIGHT_Y = 0.72; // 牛顿管旋转中心离台面高度

  constructor() {
    this.group.name = 'NewtonTubeMesh';

    this.initMaterials();
    this.createStand();
    this.createNewtonTube();
    this.createObjects();
    this.createVacuumPump();
    this.createHose();

    this.group.add(this.standGroup);
    this.group.add(this.tubePivot);
    this.group.add(this.pumpGroup);

    // 初始位置设定
    this.tubePivot.position.set(0, this.PIVOT_HEIGHT_Y, 0);
    this.updateHose();
  }

  private initMaterials(): void {
    // 高透光光学玻璃外管 (晶莹剔透，降低物理厚度与折射扰动，使管内物体如同悬浮在空中般清澈)
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.98,
      opacity: 1.0,
      transparent: true,
      roughness: 0.015,
      ior: 1.45,
      thickness: 0.004,
      specularIntensity: 0.9,
      clearcoat: 0.9,
      clearcoatRoughness: 0.02,
    });

    // 内部微发光玻璃腔体 (极微弱冰蓝漫射，depthWrite 为 false，杜绝遮挡管内物体深度)
    this.innerGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.02,
      side: THREE.BackSide,
      depthWrite: false,
    });

    // 镜面液态铬金属
    this.chromeMaterial = mechMetal(0xffffff, 0.96, 0.08);

    // 纯白陶瓷/航天极轻铝合金 (彻底替代粗笨黑色)
    this.ceramicWhiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.15,
    });

    // 精密亮黄铜气嘴
    this.brassMaterial = mechMetal(0xfbbf24, 0.90, 0.18);

    // 晶莹微透高分子硅胶减震垫 (清澈冰蓝微透，彻底替代黑橡胶)
    this.siliconeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
    });

    // 羽毛羽片材质 (经典教科书鲜艳绯红轻羽，自带柔和自发光，在白墙和玻璃下极其清晰醒目)
    this.featherMaterial = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xbe123c,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    // 羽毛羽轴材质 (高亮金色)
    this.featherQuillMaterial = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xd97706,
      emissiveIntensity: 0.40,
      metalness: 0.5,
      roughness: 0.2,
    });

    // 硬币材质 (高亮 24K 纯金硬币，强化暖金底色与金光自发光，杜绝阴影反黑)
    this.coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xd97706,
      emissiveIntensity: 0.32,
      metalness: 0.45,
      roughness: 0.20,
    });

    // 软木塞材质 (温暖天然蜜色琥珀软木，柔和自发光与木质漫射)
    this.corkMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x78350f,
      emissiveIntensity: 0.25,
      roughness: 0.70,
      metalness: 0.02,
    });

    // 软木塞年轮深色条纹材质
    this.corkBandMaterial = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      emissive: 0x451a03,
      emissiveIntensity: 0.20,
      roughness: 0.85,
      metalness: 0.02,
    });

    // 旋转按钮发光材质 (纯净全息青蓝)
    this.buttonGlowMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      metalness: 0.7,
      roughness: 0.15,
    });

    // 抽气机 LED 指示灯材质
    this.ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.1,
    });

    // 压力表指针材质 (警示红)
    this.needleMaterial = new THREE.MeshBasicMaterial({
      color: 0xef4444,
    });

    // 晶透微光天蓝高分子硅胶导管 (具有柔和微透光泽，清晰分明)
    this.hoseMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    });
  }

  /**
   * 创建实验台支架系统与旋转按钮 (纯净太空白晶体与液态铬风格)
   * 正前方零遮挡设计：支撑立柱位于左后方 (-X, -Z)，正面对准用户，视线 100% 全通透
   */
  private createStand(): void {
    // 1. 加重稳固底座 (纯净太空银白纳米陶瓷晶体底盘)
    const baseGeo = new THREE.CylinderGeometry(0.20, 0.22, 0.026, 48);
    const baseMesh = new THREE.Mesh(baseGeo, this.ceramicWhiteMaterial);
    baseMesh.position.set(0, 0.013, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.standGroup.add(baseMesh);

    // 亮铬光圈装饰
    const ringGeo = new THREE.TorusGeometry(0.185, 0.0035, 16, 48);
    const ringMesh = new THREE.Mesh(ringGeo, this.chromeMaterial);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.027;
    this.standGroup.add(ringMesh);

    // 2. 左后侧主承重立柱 (位于 X = -0.16, Z = -0.08，彻底移出牛顿管正后方视野，直视管身 100% 纯净通透)
    const columnHeight = this.PIVOT_HEIGHT_Y;
    const colRadius = 0.016;
    const colGeo = new THREE.CylinderGeometry(colRadius, colRadius, columnHeight, 32);

    const xStandOffset = -0.16;
    const zStandOffset = -0.08;

    const colBack = new THREE.Mesh(colGeo, this.chromeMaterial);
    colBack.position.set(xStandOffset, columnHeight / 2, zStandOffset);
    colBack.castShadow = true;
    this.standGroup.add(colBack);

    // 柱底固定法兰 (液态铬)
    const flangeGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.018, 24);
    const flangeB = new THREE.Mesh(flangeGeo, this.chromeMaterial);
    flangeB.position.set(xStandOffset, 0.03, zStandOffset);
    this.standGroup.add(flangeB);

    // 水平悬臂托架 (从左后方立柱优雅延伸至中央转轴，后面完全不遮挡管内物体)
    const bracketCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xStandOffset, this.PIVOT_HEIGHT_Y, zStandOffset),
      new THREE.Vector3(xStandOffset * 0.4, this.PIVOT_HEIGHT_Y, zStandOffset * 0.4),
      new THREE.Vector3(0, this.PIVOT_HEIGHT_Y, -0.015),
    ]);
    const bracketArmGeo = new THREE.TubeGeometry(bracketCurve, 20, 0.016, 16, false);
    const bracketArm = new THREE.Mesh(bracketArmGeo, this.chromeMaterial);
    this.standGroup.add(bracketArm);

    // 3. 轴承抱箍与水平转轴套筒 (液态铬，位于 Y = PIVOT_HEIGHT_Y)
    const bearingHousingGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.065, 32);
    const bearingHousing = new THREE.Mesh(bearingHousingGeo, this.chromeMaterial);
    bearingHousing.rotation.x = Math.PI / 2;
    bearingHousing.position.set(0, this.PIVOT_HEIGHT_Y, -0.015);
    this.standGroup.add(bearingHousing);

    // 4. 正前方 3D 旋转操作控制台按钮 (在底座前部斜向上 45° 完美迎向用户视线，绝不遮挡管内物体)
    const consoleZ = 0.165;
    const consoleY = 0.055;

    // 倾斜控制台基座
    const pedestalGeo = new THREE.CylinderGeometry(0.052, 0.058, 0.032, 32);
    const pedestal = new THREE.Mesh(pedestalGeo, this.ceramicWhiteMaterial);
    pedestal.position.set(0, 0.026, consoleZ);
    pedestal.castShadow = true;
    this.standGroup.add(pedestal);

    const pedestalTrimGeo = new THREE.TorusGeometry(0.054, 0.0025, 16, 32);
    const pedestalTrim = new THREE.Mesh(pedestalTrimGeo, this.chromeMaterial);
    pedestalTrim.rotation.x = Math.PI / 2;
    pedestalTrim.position.set(0, 0.042, consoleZ);
    this.standGroup.add(pedestalTrim);

    this.rotateButtonPivot.position.set(0, consoleY, consoleZ);
    this.rotateButtonPivot.rotation.x = -Math.PI / 4; // 倾角 45° 迎向用户
    this.rotateButtonPivot.name = 'freefall-rotate-button';

    // 旋转外圆环
    const btnRingGeo = new THREE.TorusGeometry(0.042, 0.006, 16, 48);
    this.rotateButtonRing = new THREE.Mesh(btnRingGeo, this.buttonGlowMaterial);
    this.rotateButtonPivot.add(this.rotateButtonRing);

    // 圆盘中央底垫 (纯净白陶瓷)
    const btnCenterGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.008, 32);
    const btnCenter = new THREE.Mesh(btnCenterGeo, this.ceramicWhiteMaterial);
    btnCenter.rotation.x = Math.PI / 2;
    this.rotateButtonPivot.add(btnCenter);

    // 3D 旋转箭头图标 (抛光铬)
    const arrowCurveGeo = new THREE.TorusGeometry(0.024, 0.0035, 12, 32, Math.PI * 1.3);
    this.rotateButtonIcon = new THREE.Mesh(arrowCurveGeo, this.chromeMaterial);
    this.rotateButtonIcon.position.z = 0.006;
    this.rotateButtonPivot.add(this.rotateButtonIcon);

    // 箭头尖端锥体
    const arrowTipGeo = new THREE.ConeGeometry(0.007, 0.012, 16);
    const arrowTip = new THREE.Mesh(arrowTipGeo, this.chromeMaterial);
    arrowTip.position.set(0.023, 0.005, 0.006);
    arrowTip.rotation.z = -Math.PI / 4;
    this.rotateButtonPivot.add(arrowTip);

    // 增大射线检测范围的透明隐形包围盒
    const hitGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.rotateButtonHitBox = new THREE.Mesh(hitGeo, hitMat);
    this.rotateButtonHitBox.rotation.x = Math.PI / 2;
    this.rotateButtonHitBox.name = 'freefall-rotate-button';
    this.rotateButtonHitBox.userData = { isRotateButton: true };
    this.rotateButtonPivot.add(this.rotateButtonHitBox);

    this.standGroup.add(this.rotateButtonPivot);
  }

  /**
   * 创建牛顿管主体及密封端盖、激光刻度线
   */
  private createNewtonTube(): void {
    const halfL = this.TUBE_LENGTH_M / 2;

    // 1. 中部抱箍 (亮铬液态金属，夹持在玻璃管中心)
    const collarGeo = new THREE.CylinderGeometry(this.TUBE_RADIUS_M + 0.008, this.TUBE_RADIUS_M + 0.008, 0.05, 32);
    const collarMesh = new THREE.Mesh(collarGeo, this.chromeMaterial);
    this.tubePivot.add(collarMesh);

    // 2. 玻璃外管 (大直径光学高透玻璃，不阻挡阴影，通透明净)
    const outerGeo = new THREE.CylinderGeometry(
      this.TUBE_RADIUS_M,
      this.TUBE_RADIUS_M,
      this.TUBE_LENGTH_M,
      48,
      1,
      true
    );
    this.glassOuterMesh = new THREE.Mesh(outerGeo, this.glassMaterial);
    this.glassOuterMesh.name = 'freefall-tube';
    this.glassOuterMesh.userData = { isNewtonTube: true };
    this.glassOuterMesh.castShadow = false;
    this.glassOuterMesh.renderOrder = 10;
    this.tubePivot.add(this.glassOuterMesh);

    // 3. 内部微发光玻璃腔壁
    const innerGeo = new THREE.CylinderGeometry(
      this.TUBE_RADIUS_M - 0.004,
      this.TUBE_RADIUS_M - 0.004,
      this.TUBE_LENGTH_M - 0.02,
      48,
      1,
      true
    );
    this.glassInnerMesh = new THREE.Mesh(innerGeo, this.innerGlassMaterial);
    this.glassInnerMesh.castShadow = false;
    this.glassInnerMesh.renderOrder = 9;
    this.tubePivot.add(this.glassInnerMesh);

    // 专属管内前置与后置透亮补光灯 (随管身同步转动，确保内部硬币、羽毛、软木塞永远光彩夺目、高反差清晰)
    const frontFillLight = new THREE.PointLight(0xffffff, 2.4, 2.5);
    frontFillLight.position.set(0, 0, 0.22);
    this.tubePivot.add(frontFillLight);

    const backFillLight = new THREE.PointLight(0xfef08a, 1.4, 2.5);
    backFillLight.position.set(0, 0, -0.22);
    this.tubePivot.add(backFillLight);

    // 4. 上密封盖 (Top End Cap - 液态亮铬)
    this.topCapGroup.position.set(0, halfL, 0);
    const capGeo = new THREE.CylinderGeometry(this.TUBE_RADIUS_M + 0.005, this.TUBE_RADIUS_M + 0.005, 0.038, 32);
    const topCapMesh = new THREE.Mesh(capGeo, this.chromeMaterial);
    this.topCapGroup.add(topCapMesh);

    // 上端晶透硅胶缓冲垫 (无黑橡胶)
    const padGeo = new THREE.CylinderGeometry(this.TUBE_RADIUS_M - 0.006, this.TUBE_RADIUS_M - 0.006, 0.016, 32);
    const topPad = new THREE.Mesh(padGeo, this.siliconeMaterial);
    topPad.position.y = -0.02;
    this.topCapGroup.add(topPad);

    // 顶部金属圆顶螺帽 (液态铬)
    const domeGeo = new THREE.SphereGeometry(this.TUBE_RADIUS_M - 0.008, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const topDome = new THREE.Mesh(domeGeo, this.chromeMaterial);
    topDome.position.y = 0.019;
    this.topCapGroup.add(topDome);
    this.tubePivot.add(this.topCapGroup);

    // 5. 下密封盖 (Bottom End Cap，带有抽气阀门接口)
    this.bottomCapGroup.position.set(0, -halfL, 0);
    const botCapMesh = new THREE.Mesh(capGeo, this.chromeMaterial);
    this.bottomCapGroup.add(botCapMesh);

    // 下端晶透硅胶缓冲垫
    const botPad = new THREE.Mesh(padGeo, this.siliconeMaterial);
    botPad.position.y = 0.02;
    this.bottomCapGroup.add(botPad);

    // 抽气阀门底座与旋塞 (Stopcock Valve - 金黄铜)
    const valveBaseGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.045, 24);
    const valveBase = new THREE.Mesh(valveBaseGeo, this.brassMaterial);
    valveBase.position.y = -0.038;
    this.bottomCapGroup.add(valveBase);

    // 阀门出气嘴 (Nozzle，导管连接处，朝向右前方抽气机)
    const nozzleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.036, 16);
    const nozzleMesh = new THREE.Mesh(nozzleGeo, this.brassMaterial);
    nozzleMesh.rotation.z = Math.PI / 2;
    nozzleMesh.position.set(this.TUBE_RADIUS_M + 0.015, -0.038, 0.018);
    this.bottomCapGroup.add(nozzleMesh);

    // 旋转旋塞手柄 (亮铬)
    const knobGeo = new THREE.BoxGeometry(0.012, 0.016, 0.045);
    this.valveKnobMesh = new THREE.Mesh(knobGeo, this.chromeMaterial);
    this.valveKnobMesh.position.set(0, -0.062, 0);
    this.valveKnobMesh.name = 'freefall-valve';
    this.bottomCapGroup.add(this.valveKnobMesh);

    // 阀门点击包围盒
    const valveHitGeo = new THREE.SphereGeometry(0.055, 16, 16);
    const valveHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.valveHitBox = new THREE.Mesh(valveHitGeo, valveHitMat);
    this.valveHitBox.position.set(0, -0.048, 0);
    this.valveHitBox.name = 'freefall-valve';
    this.valveHitBox.userData = { isValve: true };
    this.bottomCapGroup.add(this.valveHitBox);

    this.tubePivot.add(this.bottomCapGroup);

    // 6. 激光蚀刻刻度标线 (从 0cm 到 100cm，正面直对用户)
    this.createGraduationMarks();
    this.tubePivot.add(this.graduationGroup);
  }

  /**
   * 激光蚀刻刻度线 (正面朝向用户，刻度清晰立现)
   */
  private createGraduationMarks(): void {
    const markMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    const startY = this.FALL_DISTANCE_M / 2;
    const totalTicks = 11; // 0cm, 10cm, ..., 100cm

    for (let i = 0; i < totalTicks; i++) {
      const y = startY - (i / 10) * this.FALL_DISTANCE_M;
      const isMajor = i % 2 === 0;
      const width = isMajor ? 0.024 : 0.014;

      const tickGeo = new THREE.PlaneGeometry(width, 0.0025);
      const tickMesh = new THREE.Mesh(tickGeo, markMat);
      tickMesh.position.set(0, y, this.TUBE_RADIUS_M - 0.002);
      this.graduationGroup.add(tickMesh);
    }
  }

  /**
   * 创建管内的三件对比自由落体对象 (羽毛、硬币、软木塞)
   * 尺寸加大、高饱和艳丽对比、双向自发光加持，落体过程一目了然
   */
  private createObjects(): void {
    // 1. 羽毛 (Feather) - 位于右侧 X = +0.042，经典教科书鲜艳绯红轻羽 + 亮金羽轴
    this.createFeatherMesh();
    this.featherGroup.position.set(0.042, this.FALL_DISTANCE_M / 2, 0);
    this.featherGroup.name = 'freefall-feather';
    this.featherGroup.renderOrder = 2;
    this.tubePivot.add(this.featherGroup);

    // 2. 软木塞 (Cork) - 位于中央 X = 0，琥珀暖木质感 + 真实年轮深色横纹
    const corkGeo = new THREE.CylinderGeometry(0.019, 0.025, 0.048, 24);
    this.corkMesh = new THREE.Mesh(corkGeo, this.corkMaterial);
    this.corkMesh.castShadow = false;
    this.corkGroup.add(this.corkMesh);

    // 软木塞深色年轮环带 (强化木塞分层纹理与立体辨识度)
    const bandGeo = new THREE.CylinderGeometry(0.021, 0.023, 0.005, 24);
    const band1 = new THREE.Mesh(bandGeo, this.corkBandMaterial);
    band1.position.y = 0.009;
    this.corkGroup.add(band1);

    const band2 = new THREE.Mesh(bandGeo, this.corkBandMaterial);
    band2.position.y = -0.011;
    this.corkGroup.add(band2);

    this.corkGroup.position.set(0, this.FALL_DISTANCE_M / 2, 0);
    this.corkGroup.name = 'freefall-cork';
    this.corkGroup.renderOrder = 2;
    this.tubePivot.add(this.corkGroup);

    // 3. 硬币 (Coin) - 位于左侧 X = -0.042，闪耀 24K 纯金，双面立体边框与浮雕徽记
    const coinOuterGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.0036, 32);
    this.coinMesh = new THREE.Mesh(coinOuterGeo, this.coinMaterial);
    this.coinMesh.rotation.x = Math.PI / 2;
    this.coinMesh.castShadow = false;
    this.coinGroup.add(this.coinMesh);

    // 硬币凸起边框环 (增强 3D 浮雕与金币高光反差)
    const coinRimGeo = new THREE.TorusGeometry(0.023, 0.0016, 12, 32);
    const coinRimFront = new THREE.Mesh(coinRimGeo, this.coinMaterial);
    coinRimFront.position.z = 0.002;
    this.coinGroup.add(coinRimFront);

    const coinRimBack = new THREE.Mesh(coinRimGeo, this.coinMaterial);
    coinRimBack.position.z = -0.002;
    this.coinGroup.add(coinRimBack);

    // 硬币中央浮雕五角星徽记
    const starGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.0042, 5);
    const starMesh = new THREE.Mesh(starGeo, this.coinMaterial);
    starMesh.rotation.x = Math.PI / 2;
    this.coinGroup.add(starMesh);

    this.coinGroup.position.set(-0.042, this.FALL_DISTANCE_M / 2, 0);
    this.coinGroup.name = 'freefall-coin';
    this.coinGroup.renderOrder = 2;
    this.tubePivot.add(this.coinGroup);
  }

  /**
   * 构造逼真的大羽毛网格 (金色羽轴 + 艳丽绯红双侧微曲轻羽羽面)
   */
  private createFeatherMesh(): void {
    // 羽轴 (Quill) - 亮金羽茎
    const quillCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.070, 0),
      new THREE.Vector3(0.0015, -0.025, 0.001),
      new THREE.Vector3(0.0035, 0.030, -0.001),
      new THREE.Vector3(0.0010, 0.070, 0),
    ]);
    const quillGeo = new THREE.TubeGeometry(quillCurve, 20, 0.0016, 8, false);
    this.featherQuillMesh = new THREE.Mesh(quillGeo, this.featherQuillMaterial);
    this.featherGroup.add(this.featherQuillMesh);

    // 羽片 (Vane) - 鲜艳绯红轻盈柳叶曲线，在任何实验室背景下清晰夺目
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.060);
    shape.bezierCurveTo(0.024, -0.040, 0.030, 0.035, 0.004, 0.070);
    shape.bezierCurveTo(-0.022, 0.035, -0.020, -0.040, 0, -0.060);

    const vaneGeo = new THREE.ShapeGeometry(shape, 24);
    this.featherVaneMesh = new THREE.Mesh(vaneGeo, this.featherMaterial);
    this.featherVaneMesh.castShadow = false;
    this.featherGroup.add(this.featherVaneMesh);
  }

  /**
   * 创建旋片式真空抽气机 (真空泵 - 陶瓷白与亮铬现代实验室风格)
   * 布局重构：泵腔与进气嘴位于左侧 (面向牛顿管)，电机与散热片位于右侧，中间空域开阔杜绝穿模
   */
  private createVacuumPump(): void {
    this.pumpGroup.position.set(0.48, 0, 0.02);
    this.pumpGroup.name = 'freefall-pump';

    // 1. 抽气机底座与四角晶透防震脚 (纯白基座 + 晶透硅胶脚垫)
    const basePlateGeo = new THREE.BoxGeometry(0.26, 0.022, 0.16);
    const basePlate = new THREE.Mesh(basePlateGeo, this.ceramicWhiteMaterial);
    basePlate.position.y = 0.021;
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    this.pumpGroup.add(basePlate);

    const footGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.01, 16);
    const footPositions = [
      [-0.11, 0.005, -0.06],
      [0.11, 0.005, -0.06],
      [-0.11, 0.005, 0.06],
      [0.11, 0.005, 0.06],
    ];
    for (const [fx, fy, fz] of footPositions) {
      const foot = new THREE.Mesh(footGeo, this.siliconeMaterial);
      foot.position.set(fx, fy, fz);
      this.pumpGroup.add(foot);
    }

    // 2. 旋片式泵腔室 (位于左侧 X = -0.065，正对牛顿管方向)
    const chamberGeo = new THREE.BoxGeometry(0.10, 0.105, 0.12);
    const chamberMesh = new THREE.Mesh(chamberGeo, this.chromeMaterial);
    chamberMesh.position.set(-0.065, 0.08, 0);
    chamberMesh.castShadow = true;
    this.pumpGroup.add(chamberMesh);

    // 3. 抽气进气嘴 (金黄铜，位于腔室左前上方，畅通无阻迎接导管)
    const pumpNozzleGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.035, 16);
    const pumpNozzle = new THREE.Mesh(pumpNozzleGeo, this.brassMaterial);
    pumpNozzle.position.set(-0.075, 0.150, 0.032);
    this.pumpGroup.add(pumpNozzle);
    this.pumpIntakeNozzle.set(0.48 - 0.075, 0.1675, 0.02 + 0.032);

    // 4. 排气消音滤嘴 (亮铬，位于腔室后侧)
    const exhaustGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.045, 20);
    const exhaust = new THREE.Mesh(exhaustGeo, this.chromeMaterial);
    exhaust.position.set(-0.075, 0.150, -0.032);
    this.pumpGroup.add(exhaust);

    // 5. 电机机壳 (纯净白陶瓷电机，位于右侧 X = +0.055，背离牛顿管方向)
    const motorRadius = 0.052;
    const motorLength = 0.12;
    const motorGeo = new THREE.CylinderGeometry(motorRadius, motorRadius, motorLength, 32);
    const motorMesh = new THREE.Mesh(motorGeo, this.ceramicWhiteMaterial);
    motorMesh.rotation.z = Math.PI / 2;
    motorMesh.position.set(0.055, 0.08, 0);
    motorMesh.castShadow = true;
    this.pumpGroup.add(motorMesh);

    // 散热鳍片 (4 环亮铬金属片，分布在右侧电机上)
    const finGeo = new THREE.CylinderGeometry(motorRadius + 0.006, motorRadius + 0.006, 0.004, 32);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, this.chromeMaterial);
      fin.rotation.z = Math.PI / 2;
      fin.position.set(0.025 + i * 0.02, 0.08, 0);
      this.pumpGroup.add(fin);
    }

    // 6. 镀铬顶部提手 (居中横跨)
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.13, 0),
      new THREE.Vector3(-0.05, 0.175, 0),
      new THREE.Vector3(0.05, 0.175, 0),
      new THREE.Vector3(0.05, 0.13, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 20, 0.005, 12, false);
    const handleMesh = new THREE.Mesh(handleGeo, this.chromeMaterial);
    this.pumpGroup.add(handleMesh);

    // 7. 高精度真空压力表 (装在左侧泵腔正面，直观正对用户视线)
    const gaugeDialGroup = new THREE.Group();
    gaugeDialGroup.position.set(-0.065, 0.08, 0.061);

    // 亮铬表圈外壳
    const bezelGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.012, 32);
    const bezel = new THREE.Mesh(bezelGeo, this.chromeMaterial);
    bezel.rotation.x = Math.PI / 2;
    gaugeDialGroup.add(bezel);

    // 白色表盘底盘
    const dialFaceGeo = new THREE.CircleGeometry(0.032, 32);
    const dialFaceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dialFace = new THREE.Mesh(dialFaceGeo, dialFaceMat);
    dialFace.position.z = 0.007;
    gaugeDialGroup.add(dialFace);

    // 表盘刻度环与标记
    const dialMarkGeo = new THREE.RingGeometry(0.026, 0.030, 32, 1, 0, Math.PI * 1.5);
    const dialMarkMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const dialMark = new THREE.Mesh(dialMarkGeo, dialMarkMat);
    dialMark.position.z = 0.008;
    dialMark.rotation.z = Math.PI * 0.75;
    gaugeDialGroup.add(dialMark);

    // 动态红色指针
    this.pumpGaugeNeedlePivot.position.set(0, 0, 0.009);
    const needleGeo = new THREE.ConeGeometry(0.002, 0.024, 8);
    const needle = new THREE.Mesh(needleGeo, this.needleMaterial);
    needle.position.y = 0.012;
    this.pumpGaugeNeedlePivot.add(needle);
    gaugeDialGroup.add(this.pumpGaugeNeedlePivot);

    this.pumpGroup.add(gaugeDialGroup);

    // 8. 电源开关按钮与指示灯 (安装在右侧电机底座前部)
    const switchBoxGeo = new THREE.BoxGeometry(0.038, 0.024, 0.018);
    const switchBox = new THREE.Mesh(switchBoxGeo, this.ceramicWhiteMaterial);
    switchBox.position.set(0.055, 0.035, 0.085);
    this.pumpGroup.add(switchBox);

    const switchBtnGeo = new THREE.BoxGeometry(0.016, 0.012, 0.008);
    this.pumpPowerSwitchMesh = new THREE.Mesh(switchBtnGeo, this.chromeMaterial);
    this.pumpPowerSwitchMesh.position.set(0.045, 0.035, 0.096);
    this.pumpPowerSwitchMesh.name = 'freefall-pump-switch';
    this.pumpGroup.add(this.pumpPowerSwitchMesh);

    // LED 工作状态指示灯
    const ledGeo = new THREE.SphereGeometry(0.005, 16, 16);
    this.pumpLedMesh = new THREE.Mesh(ledGeo, this.ledMaterial);
    this.pumpLedMesh.position.set(0.070, 0.035, 0.096);
    this.pumpGroup.add(this.pumpLedMesh);

    // 抽气机交互点击包围盒
    const pumpHitGeo = new THREE.BoxGeometry(0.28, 0.20, 0.20);
    const pumpHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.pumpSwitchHitBox = new THREE.Mesh(pumpHitGeo, pumpHitMat);
    this.pumpSwitchHitBox.position.set(0, 0.09, 0);
    this.pumpSwitchHitBox.name = 'freefall-pump-switch';
    this.pumpSwitchHitBox.userData = { isPumpSwitch: true };
    this.pumpGroup.add(this.pumpSwitchHitBox);
  }

  /**
   * 构造连接抽气机与牛顿管的柔性硅胶导管
   */
  private createHose(): void {
    this.updateHose();
  }

  /**
   * 动态更新导管三维曲度 (完全在 this.group 局部坐标系内计算，杜绝世界坐标漂移与几何穿模)
   */
  public updateHose(): void {
    const halfL = this.TUBE_LENGTH_M / 2;

    // 1. 牛顿管阀门出气嘴在 this.group 局部坐标系下的准确位置
    const nozzleTipLocal = new THREE.Vector3(this.TUBE_RADIUS_M + 0.033, -halfL - 0.038, 0.018);
    const valveLocalPos = nozzleTipLocal.clone().applyEuler(this.tubePivot.rotation).add(this.tubePivot.position);
    const nozzleDir = new THREE.Vector3(0.9, 0, 0.35).normalize().applyEuler(this.tubePivot.rotation);

    // 2. 抽气机进气嘴在 this.group 局部坐标系下的准确位置
    // pumpGroup 位于 (0.48, 0, 0.02)，进气嘴顶端位于 (-0.075, 0.1675, 0.032)
    const pumpLocalPos = new THREE.Vector3(0.48 - 0.075, 0.1675, 0.02 + 0.032);

    // 3. 构建柔性导管的自然垂坠三维样条曲线
    const p1 = new THREE.Vector3().copy(valveLocalPos).addScaledVector(nozzleDir, 0.06);
    const p4 = new THREE.Vector3().copy(pumpLocalPos).add(new THREE.Vector3(0, 0.06, 0.01));

    // 中间控制点：插值自适应垂坠
    const uprightY = this.PIVOT_HEIGHT_Y - halfL - 0.038; // ≈ 0.057
    const invertedY = this.PIVOT_HEIGHT_Y + halfL + 0.038; // ≈ 1.383
    const alpha = Math.max(0, Math.min(1, (valveLocalPos.y - uprightY) / (invertedY - uprightY)));

    // p2 与 p3 保持在 Z=0.14~0.18 的开阔前方空域，离台面 Y>=0.075，杜绝与任何电机、立柱或台面穿模
    const p2 = new THREE.Vector3(
      THREE.MathUtils.lerp(valveLocalPos.x + 0.10, valveLocalPos.x + 0.12, alpha),
      THREE.MathUtils.lerp(0.075, 0.78, alpha),
      THREE.MathUtils.lerp(0.14, 0.18, alpha)
    );
    const p3 = new THREE.Vector3(
      THREE.MathUtils.lerp(pumpLocalPos.x - 0.08, pumpLocalPos.x - 0.06, alpha),
      THREE.MathUtils.lerp(0.105, 0.36, alpha),
      THREE.MathUtils.lerp(0.12, 0.14, alpha)
    );

    this.hoseCurve = new THREE.CatmullRomCurve3([
      valveLocalPos,
      p1,
      p2,
      p3,
      p4,
      pumpLocalPos,
    ]);

    if (this.hoseMesh) {
      this.hoseMesh.geometry.dispose();
      this.hoseMesh.geometry = new THREE.TubeGeometry(this.hoseCurve, 48, 0.0075, 16, false);
    } else {
      const hoseGeo = new THREE.TubeGeometry(this.hoseCurve, 48, 0.0075, 16, false);
      this.hoseMesh = new THREE.Mesh(hoseGeo, this.hoseMaterial);
      this.hoseMesh.name = 'freefall-hose';
      this.group.add(this.hoseMesh);
    }
  }

  private lastHoseAngle = -999999;

  /**
   * 更新牛顿管旋转角度 (Rad)
   */
  public setTubeRotation(angleRad: number): void {
    if (Math.abs(angleRad - this.lastHoseAngle) < 0.0001) return;
    this.lastHoseAngle = angleRad;
    this.tubePivot.rotation.z = angleRad;
    this.updateHose();
  }

  /**
   * 更新管内三物体在管内的下落空间位置
   */
  public setObjectsState(
    featherY: number,
    coinY: number,
    corkY: number,
    flutterX = 0,
    flutterAngle = 0
  ): void {
    const halfH = this.FALL_DISTANCE_M / 2;

    const localFeatherY = halfH - featherY;
    const localCoinY = halfH - coinY;
    const localCorkY = halfH - corkY;

    this.featherGroup.position.set(0.042 + flutterX, localFeatherY, 0);
    this.featherGroup.rotation.z = flutterAngle;

    this.coinGroup.position.set(-0.042, localCoinY, 0);
    this.corkGroup.position.set(0, localCorkY, 0);
  }

  /**
   * 更新抽气机与压力表状态
   */
  public setPumpState(isPumpRunning: boolean, pressureKPa: number): void {
    if (isPumpRunning) {
      this.ledMaterial.emissive.setHex(0x10b981);
      this.ledMaterial.emissiveIntensity = 1.0;
    } else {
      // 待机时使用柔和的浅天蓝微弱待机光，彻底去除沉重暗黑色
      this.ledMaterial.emissive.setHex(0x38bdf8);
      this.ledMaterial.emissiveIntensity = 0.2;
    }

    const ratio = Math.max(0, Math.min(1.0, pressureKPa / 101.325));
    const needleAngle = -Math.PI * 1.35 * (1.0 - ratio);
    this.pumpGaugeNeedlePivot.rotation.z = needleAngle;
  }

  /**
   * 设置 3D 旋转按钮的高亮状态
   */
  public setRotateButtonHovered(hovered: boolean): void {
    if (this.rotateButtonHovered === hovered) return;
    this.rotateButtonHovered = hovered;
    if (hovered) {
      this.buttonGlowMaterial.emissive.setHex(0x38bdf8);
      this.buttonGlowMaterial.emissiveIntensity = 0.9;
      this.rotateButtonPivot.scale.set(1.08, 1.08, 1.08);
    } else {
      this.buttonGlowMaterial.emissive.setHex(0x0284c7);
      this.buttonGlowMaterial.emissiveIntensity = 0.45;
      this.rotateButtonPivot.scale.set(1.0, 1.0, 1.0);
    }
  }

  /**
   * 触发旋转按钮点击脉冲波动画
   */
  public pulseRotateButton(): void {
    this.rotateButtonPivot.scale.set(0.92, 0.92, 0.92);
    setTimeout(() => {
      this.rotateButtonPivot.scale.set(1.0, 1.0, 1.0);
    }, 120);
  }

  /**
   * 释放所有 3D 资源
   */
  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
