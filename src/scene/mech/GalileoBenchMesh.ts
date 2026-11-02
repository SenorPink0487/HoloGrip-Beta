/**
 * 3D 实验台模型：伽利略理想斜面实验仪 (Galileo Ideal Incline Dynamics Apparatus)
 *
 * 视觉美学与材质工业规范 (遵循 AGENTS.md / GEMINI.md 高度科研级标准)：
 * 1. 彻底告别粗糙单调死白与脏黑塑料：
 *    - 基座底盘：航天级深空钛精密阳极氧化合金 (Aerospace Slate Titanium: 0x1e293b)。
 *    - 导轨床身：精铣枪灰色高强度铝合金 (Precision Slate Gunmetal: 0x253245)，带激光蚀刻高对比度厘米刻度标尺。
 *    - 导向滑轨：镜面抛光 316L 不锈钢 / 液态铬双精密导杆 (Mirror Polished Liquid Chrome: 0xffffff, metalness 0.98)。
 *    - 经典实心小球：经典抛光香槟黄铜/青铜实心球 (Solid Champagne Brass Bearing: 0xf59e0b)，严格契合伽利略原版实验历史考证。
 *    - 五金调校件：香槟金黄铜滚花调平旋钮、锁紧套环、铰链转轴与刻度指针 (Champagne Brass: 0xf59e0b)。
 * 2. 纯三维物理实体交互：
 *    - 零 DOM 悬浮弹窗/横幅，端正正对操作者视线 (+Z)。
 *    - 左右双侧铰链配备物理量角分度盘 (0°~60°) 与联动旋转指示指针。
 *    - 伸缩支撑柱具有真实机械套筒与香槟金防滑锁套。
 */

import * as THREE from 'three';
import {
  createChamferedBlockGeometry,
  createChamferedHexNut,
  createChampagneBrassMaterial,
  createGuideShaftGeometry,
  createKnurledBand,
  createLevelingPadMaterial,
  createLiquidChromeMaterial,
  createSatinSilverMaterial,
  createTitaniumSlateMaterial,
  disposeObjectTree,
  safeCanvas,
} from './mechKit.ts';

/**
 * 创建正对操作者视线的金属铭牌纹理 (航天喷砂银铝底版 + 激光雕刻铭文)
 */
function createNameplateTexture(): THREE.CanvasTexture | null {
  const canvas = safeCanvas(512, 64);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.fillRect !== 'function') return null;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 512, 64);

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 506, 58);

  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1;
  ctx.strokeRect(6, 6, 500, 52);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px "SF Pro Display", -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GALILEO DYNAMICS APPARATUS · h₁ = h₂', 256, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class GalileoBenchMesh {
  public readonly group = new THREE.Group();

  // 基础构件
  private baseGroup = new THREE.Group();
  private flatRailGroup = new THREE.Group();

  // 左侧可调斜面
  private leftInclinePivot = new THREE.Group();
  private leftInclineRail: THREE.Mesh;
  private leftSideRails: THREE.Group = new THREE.Group();
  private leftTipHandleGroup = new THREE.Group();
  private leftTipHandleMesh: THREE.Mesh;
  private leftHandleHitBox: THREE.Mesh;
  private leftSupportStrut: THREE.Group = new THREE.Group();
  private leftStrutOuter: THREE.Mesh;
  private leftStrutCollar: THREE.Mesh;
  private leftStrutInner: THREE.Mesh;

  // 右侧可调斜面
  private rightInclinePivot = new THREE.Group();
  private rightInclineRail: THREE.Mesh;
  private rightSideRails: THREE.Group = new THREE.Group();
  private rightTipHandleGroup = new THREE.Group();
  private rightTipHandleMesh: THREE.Mesh;
  private rightHandleHitBox: THREE.Mesh;
  private rightSupportStrut: THREE.Group = new THREE.Group();
  private rightStrutOuter: THREE.Mesh;
  private rightStrutCollar: THREE.Mesh;
  private rightStrutInner: THREE.Mesh;

  // 小球与物理基准
  private ballMesh: THREE.Mesh;
  private ballRadius = 0.022; // 22mm 纯正抛光黄铜实心球
  private apexFlashRing: THREE.Mesh;
  private heightReferenceGroup = new THREE.Group();
  private leftReleaseGateMesh: THREE.Mesh;

  // 材质引用 (航天深空钛、枪灰色合金、香槟金与镜面液态铬)
  private chassisMat: THREE.MeshStandardMaterial;
  private chassisStepMat: THREE.MeshStandardMaterial;
  private chassisGrooveMat: THREE.MeshStandardMaterial;
  private railBedMat: THREE.MeshStandardMaterial;
  private leftRailBedMat: THREE.MeshStandardMaterial;
  private rightRailBedMat: THREE.MeshStandardMaterial;
  private flatRailBedMat: THREE.MeshStandardMaterial;
  private rodMetalMat: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private footMat: THREE.MeshStandardMaterial;
  private strutOuterMat: THREE.MeshStandardMaterial;
  private ballMat: THREE.MeshStandardMaterial;
  private handleGlowMatL: THREE.MeshStandardMaterial;
  private handleGlowMatR: THREE.MeshStandardMaterial;

  // 几何参数缓存
  private releaseHeightM = 0.25;
  private leftAngleDeg = 35.0;
  private leftLengthM = 0.436; // 0.25 / sin(35°)
  private flatLengthM = 0.40;
  private rightAngleDeg = 30.0;
  private rightLengthM = 0.60;
  private readonly RAIL_WIDTH = 0.09;
  private readonly RAIL_THICKNESS = 0.016;

  constructor() {
    this.group.name = 'GalileoBenchMesh';

    this.initMaterials();
    this.createPrecisionBase();
    this.createFlatRail();
    this.createLeftIncline();
    this.createRightIncline();
    this.createHeightReferenceLine();
    this.createBall();
    this.createApexFeedback();

    this.group.add(this.baseGroup);
    this.group.add(this.flatRailGroup);
    this.group.add(this.leftInclinePivot);
    this.group.add(this.rightInclinePivot);
    this.group.add(this.leftSupportStrut);
    this.group.add(this.rightSupportStrut);
    this.group.add(this.heightReferenceGroup);
    this.group.add(this.ballMesh);
    this.group.add(this.apexFlashRing);

    // 初始布局同步
    this.updateLeftIncline(this.leftAngleDeg, this.leftLengthM);
    this.updateRightIncline(this.rightAngleDeg, this.rightLengthM);
    this.updateHeightLine(this.releaseHeightM);
  }

  private initMaterials(): void {
    // 航天级阳极氧化喷砂银铝底座主材质 (Aerospace Satin Silver Anodized Aluminum: 0xf1f5f9)
    this.chassisMat = createSatinSilverMaterial(0xf1f5f9, 0.74, 0.22);

    // 承载平台台阶材质
    this.chassisStepMat = createSatinSilverMaterial(0xe2e8f0, 0.78, 0.20);

    // 沉槽与安装凹口精铣银灰铝材质 (纯净统一，告别脏黑色块)
    this.chassisGrooveMat = createSatinSilverMaterial(0xd8e2ec, 0.72, 0.26);

    // 导轨床身精研阳极氧化喷砂银铝材质 (纯净无杂乱纹理)
    this.railBedMat = createSatinSilverMaterial(0xf1f5f9, 0.76, 0.22);
    this.flatRailBedMat = this.railBedMat;
    this.leftRailBedMat = this.railBedMat;
    this.rightRailBedMat = this.railBedMat;

    // 抛光镜面液态铬精密滑轨 (Liquid Chrome 316L)
    this.rodMetalMat = createLiquidChromeMaterial(0xffffff, 0.98, 0.06);

    // 银灰钛金精密调节五金构件材质 (Titanium Hardware: 0xc4cbd4，彻底告别廉价亮黄)
    this.brassMat = createChampagneBrassMaterial(0xc4cbd4, 0.85, 0.22);

    // 防震脚垫橡胶材质
    this.footMat = createLevelingPadMaterial(0x0f172a, 0.85);

    // 伸缩立柱外筒航天银铝
    this.strutOuterMat = createSatinSilverMaterial(0xe2e8f0, 0.76, 0.22);

    // 计量级单晶红宝石高精测球材质 (Precision Synthetic Ruby Sphere: 0xbe123c)
    // 采用 Renishaw 工业计量级单晶红刚玉标准：纯正深红宝石晶体光泽，高透光微晶深度 (ior: 1.76, clearcoat: 1.0)
    // 彻底告别死沉灰色与廉价亮黄，在阳极氧化喷砂银铝导轨上具有极佳的视觉辨识度与科研质感
    this.ballMat = new THREE.MeshPhysicalMaterial({
      color: 0xbe123c,
      emissive: 0x9f1239,
      emissiveIntensity: 0.14,
      roughness: 0.05,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      ior: 1.76,
    });

    // 左右磁吸交互环高亮材质 (极光冰蓝/科技发光，内核为实心黄铜)
    this.handleGlowMatL = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.1,
    });

    this.handleGlowMatR = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.1,
    });
  }

  /**
   * 1. 航天级阳极氧化银铝精密机加工底座与量角器刻度总成
   */
  private createPrecisionBase(): void {
    // 主底座主板 (航空级喷砂银铝，CNC 精密四周倒角)
    const baseGeom = createChamferedBlockGeometry(1.66, 0.018, 0.22, 0.0028);
    const basePlate = new THREE.Mesh(baseGeom, this.chassisMat);
    basePlate.position.set(0, -0.009, 0);
    basePlate.receiveShadow = true;
    this.baseGroup.add(basePlate);

    // 上层台阶承载平台 (阶梯精密构造)
    const stepGeom = createChamferedBlockGeometry(1.62, 0.006, 0.18, 0.002);
    const stepPlate = new THREE.Mesh(stepGeom, this.chassisStepMat);
    stepPlate.position.set(0, 0.003, 0);
    stepPlate.receiveShadow = true;
    this.baseGroup.add(stepPlate);

    // 中央导轨安装沉槽 (浅雅银灰铝，平滑自然)
    const grooveGeom = new THREE.BoxGeometry(1.58, 0.002, 0.10);
    const grooveMesh = new THREE.Mesh(grooveGeom, this.chassisGrooveMat);
    grooveMesh.position.set(0, 0.0065, 0);
    this.baseGroup.add(grooveMesh);

    // 四角精密调平支脚 (香槟金滚花手轮 + 橡胶防震底垫)
    const footPositions = [
      [-0.75, -0.075],
      [-0.75, 0.075],
      [0.75, -0.075],
      [0.75, 0.075],
    ];
    for (const [fx, fz] of footPositions) {
      const wheelGeom = createKnurledBand(0.016, 0.008);
      const wheel = new THREE.Mesh(wheelGeom, this.brassMat);
      wheel.position.set(fx, -0.012, fz);
      this.baseGroup.add(wheel);

      const padGeom = new THREE.CylinderGeometry(0.012, 0.014, 0.006, 24);
      const pad = new THREE.Mesh(padGeom, this.footMat);
      pad.position.set(fx, -0.019, fz);
      this.baseGroup.add(pad);
    }

    // 正对操作者视线 (+Z) 的前置金属铭牌
    this.createNameplate();

    // 双侧铰链量角扇面
    this.createProtractors();
  }

  /**
   * 前置操作者视线 (+Z) 激光刻蚀金属铭牌
   */
  private createNameplate(): void {
    const plateTex = createNameplateTexture();
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: plateTex,
      metalness: 0.8,
      roughness: 0.25,
    });

    const bezelGeom = new THREE.BoxGeometry(0.244, 0.014, 0.002);
    const bezelMesh = new THREE.Mesh(bezelGeom, this.brassMat);
    bezelMesh.position.set(0, 0.007, 0.091);
    this.baseGroup.add(bezelMesh);

    const plateGeom = new THREE.BoxGeometry(0.238, 0.012, 0.002);
    const plateMesh = new THREE.Mesh(plateGeom, plateMat);
    plateMesh.position.set(0, 0.007, 0.0925);
    this.baseGroup.add(plateMesh);
  }

  /**
   * 铰链下方物理量角分度标盘 (0° ~ 60°)
   */
  private createProtractors(): void {
    const protractorMat = createSatinSilverMaterial(0xe2e8f0, 0.82, 0.24);

    const configs = [
      { xPos: -this.flatLengthM * 0.5, isRight: false },
      { xPos: this.flatLengthM * 0.5, isRight: true },
    ];

    for (const { xPos, isRight } of configs) {
      const dialGroup = new THREE.Group();
      dialGroup.position.set(xPos, 0.008, 0.056);

      // 扇面底板
      const sectorGeom = new THREE.CylinderGeometry(
        0.046,
        0.046,
        0.002,
        32,
        1,
        false,
        isRight ? 0 : Math.PI - Math.PI / 3,
        Math.PI / 3
      );
      sectorGeom.rotateX(Math.PI / 2);
      const sectorMesh = new THREE.Mesh(sectorGeom, protractorMat);
      dialGroup.add(sectorMesh);

      // 香槟金圆弧包边
      const rimGeom = new THREE.TorusGeometry(0.046, 0.0012, 8, 24, Math.PI / 3);
      if (!isRight) rimGeom.rotateZ((Math.PI * 2) / 3);
      const rimMesh = new THREE.Mesh(rimGeom, this.brassMat);
      dialGroup.add(rimMesh);

      // 刻度线 (0°, 15°, 30°, 45°, 60°)
      const tickAngles = [0, 15, 30, 45, 60];
      for (const deg of tickAngles) {
        const rad = (deg * Math.PI) / 180.0;
        const tickLen = deg % 30 === 0 ? 0.009 : 0.005;
        const tickGeom = new THREE.CylinderGeometry(0.0006, 0.0006, tickLen, 8);
        const tickMesh = new THREE.Mesh(tickGeom, this.brassMat);
        const dir = isRight ? 1 : -1;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const midR = 0.046 - tickLen * 0.5;
        tickMesh.position.set(dir * midR * cosA, midR * sinA, 0.0015);
        tickMesh.rotation.z = isRight ? rad - Math.PI / 2 : Math.PI / 2 - rad;
        dialGroup.add(tickMesh);
      }

      this.baseGroup.add(dialGroup);
    }
  }

  /**
   * 2. 中间水平无缝导轨 (航空喷砂银铝床身 + 双镜面铬滑轨 + 香槟金铰链衬套)
   */
  private createFlatRail(): void {
    const flatGeom = createChamferedBlockGeometry(this.flatLengthM, this.RAIL_THICKNESS, this.RAIL_WIDTH, 0.0016);
    const flatBed = new THREE.Mesh(flatGeom, this.flatRailBedMat);
    flatBed.position.set(0, this.RAIL_THICKNESS * 0.5, 0);
    flatBed.receiveShadow = true;
    this.flatRailGroup.add(flatBed);

    // 中央导向凹槽
    const troughGeom = new THREE.BoxGeometry(this.flatLengthM, 0.004, 0.016);
    const troughMesh = new THREE.Mesh(troughGeom, this.chassisGrooveMat);
    troughMesh.position.set(0, this.RAIL_THICKNESS - 0.001, 0);
    this.flatRailGroup.add(troughMesh);

    // 双路镜面液态铬精密滑轨
    const rodGeom = new THREE.CylinderGeometry(0.003, 0.003, this.flatLengthM, 16);
    rodGeom.rotateZ(Math.PI / 2);

    const r1 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.003, -0.011);
    const r2 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.003, 0.011);
    this.flatRailGroup.add(r1, r2);

    // 导轨两端香槟金安装固定座
    for (const xSign of [-1, 1]) {
      const blockGeom = createChamferedBlockGeometry(0.012, 0.008, this.RAIL_WIDTH + 0.004, 0.001);
      const block = new THREE.Mesh(blockGeom, this.brassMat);
      block.position.set(xSign * (this.flatLengthM * 0.5 - 0.01), this.RAIL_THICKNESS * 0.5, 0);
      this.flatRailGroup.add(block);
    }

    // 中间香槟金转轴衬套与六角锁母
    const hingeGeom = new THREE.CylinderGeometry(0.01, 0.01, this.RAIL_WIDTH + 0.012, 24);
    hingeGeom.rotateX(Math.PI / 2);

    const hL = new THREE.Mesh(hingeGeom, this.brassMat);
    hL.position.set(-this.flatLengthM * 0.5, 0.008, 0);
    const hR = new THREE.Mesh(hingeGeom, this.brassMat);
    hR.position.set(this.flatLengthM * 0.5, 0.008, 0);
    this.flatRailGroup.add(hL, hR);

    // 外侧六角紧固螺母
    const hexGeom = createChamferedHexNut(0.006, 0.004);
    hexGeom.rotateX(Math.PI / 2);
    for (const hPos of [-this.flatLengthM * 0.5, this.flatLengthM * 0.5]) {
      for (const zSign of [-1, 1]) {
        const nut = new THREE.Mesh(hexGeom, this.brassMat);
        nut.position.set(hPos, 0.008, zSign * (this.RAIL_WIDTH * 0.5 + 0.008));
        this.flatRailGroup.add(nut);
      }
    }
  }

  /**
   * 3. 左侧可自由拖拽倾角与坡长斜面
   */
  private createLeftIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;
    this.leftInclinePivot.position.set(-halfFlat, 0, 0);

    // 左侧床身 (动态缩放)
    const railGeom = createChamferedBlockGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH, 0.0016);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    this.leftInclineRail = new THREE.Mesh(railGeom, this.leftRailBedMat);
    this.leftInclinePivot.add(this.leftInclineRail);

    // 双侧滑轨
    const rodGeom = new THREE.CylinderGeometry(0.003, 0.003, 1.0, 16);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(0.5, 0, 0);

    const r1 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.003, -0.011);
    const r2 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.003, 0.011);
    this.leftSideRails.add(r1, r2);
    this.leftInclinePivot.add(this.leftSideRails);

    // 左侧倾角指示指针 (香槟金细针，随斜面实时旋转指示基座分度)
    const leftPointerGeom = new THREE.CylinderGeometry(0.0008, 0.0008, 0.038, 8);
    leftPointerGeom.rotateZ(-Math.PI / 2);
    leftPointerGeom.translate(0.019, 0, 0);
    const leftPointer = new THREE.Mesh(leftPointerGeom, this.brassMat);
    leftPointer.position.set(0, 0.008, 0.056);
    this.leftInclinePivot.add(leftPointer);

    // 左侧端头总成
    this.leftTipHandleGroup.name = 'leftInclineTipHandleGroup';

    // 精密机加工航空银铝端盖
    const capGeom = createChamferedBlockGeometry(0.014, 0.024, this.RAIL_WIDTH + 0.006, 0.0014);
    const endCap = new THREE.Mesh(capGeom, this.chassisMat);
    this.leftTipHandleGroup.add(endCap);

    // 香槟金防撞止动面
    const bumperGeom = new THREE.BoxGeometry(0.003, 0.020, this.RAIL_WIDTH);
    const bumper = new THREE.Mesh(bumperGeom, this.brassMat);
    bumper.position.set(-0.007, 0, 0);
    this.leftTipHandleGroup.add(bumper);

    // 香槟金内环 + 极光发光环
    const ringCoreGeom = new THREE.TorusGeometry(0.018, 0.002, 16, 32);
    ringCoreGeom.rotateY(Math.PI / 2);
    const ringCore = new THREE.Mesh(ringCoreGeom, this.brassMat);
    ringCore.position.set(0.014, 0.016, 0);
    this.leftTipHandleGroup.add(ringCore);

    const ringGeom = new THREE.TorusGeometry(0.018, 0.004, 16, 32);
    ringGeom.rotateY(Math.PI / 2);
    this.leftTipHandleMesh = new THREE.Mesh(ringGeom, this.handleGlowMatL);
    this.leftTipHandleMesh.position.set(0.014, 0.016, 0);
    this.leftTipHandleMesh.name = 'galileo-left-handle';
    this.leftTipHandleMesh.userData = { isLeftHandle: true, isLeftGate: true };
    this.leftTipHandleGroup.add(this.leftTipHandleMesh);

    this.leftReleaseGateMesh = this.leftTipHandleMesh;

    // 灵敏射线碰撞体
    const hitGeom = new THREE.SphereGeometry(0.065, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.leftHandleHitBox = new THREE.Mesh(hitGeom, hitMat);
    this.leftHandleHitBox.name = 'galileo-left-handle';
    this.leftHandleHitBox.userData = { isLeftHandle: true, isLeftGate: true };
    this.leftTipHandleGroup.add(this.leftHandleHitBox);

    this.leftInclinePivot.add(this.leftTipHandleGroup);

    // 左侧自适应伸缩柱 (航天银铝外筒 + 香槟金滚花锁套 + 液态铬活塞杆)
    const outerGeom = new THREE.CylinderGeometry(0.009, 0.010, 1.0, 24);
    outerGeom.translate(0, 0.5, 0);
    this.leftStrutOuter = new THREE.Mesh(outerGeom, this.strutOuterMat);

    const collarGeom = createKnurledBand(0.0125, 0.012);
    this.leftStrutCollar = new THREE.Mesh(collarGeom, this.brassMat);

    const innerGeom = new THREE.CylinderGeometry(0.0055, 0.0055, 1.0, 20);
    innerGeom.translate(0, 0.5, 0);
    this.leftStrutInner = new THREE.Mesh(innerGeom, this.rodMetalMat);

    // 底部万向转轴支座
    const baseClevis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.013, 0.008, 16),
      this.brassMat
    );
    baseClevis.position.set(0, 0.004, 0);
    this.leftSupportStrut.add(baseClevis);

    this.leftSupportStrut.add(this.leftStrutOuter, this.leftStrutCollar, this.leftStrutInner);
  }

  /**
   * 4. 右侧可自由拖拽倾角与坡长斜面
   */
  private createRightIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;
    this.rightInclinePivot.position.set(halfFlat, 0, 0);

    // 右侧床身
    const railGeom = createChamferedBlockGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH, 0.0016);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    this.rightInclineRail = new THREE.Mesh(railGeom, this.rightRailBedMat);
    this.rightInclinePivot.add(this.rightInclineRail);

    // 双侧滑轨
    const rodGeom = new THREE.CylinderGeometry(0.003, 0.003, 1.0, 16);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(0.5, 0, 0);

    const r1 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.003, -0.011);
    const r2 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.003, 0.011);
    this.rightSideRails.add(r1, r2);
    this.rightInclinePivot.add(this.rightSideRails);

    // 右侧倾角指示指针 (香槟金细针，随斜面实时旋转指示基座分度)
    const rightPointerGeom = new THREE.CylinderGeometry(0.0008, 0.0008, 0.038, 8);
    rightPointerGeom.rotateZ(-Math.PI / 2);
    rightPointerGeom.translate(0.019, 0, 0);
    const rightPointer = new THREE.Mesh(rightPointerGeom, this.brassMat);
    rightPointer.position.set(0, 0.008, 0.056);
    this.rightInclinePivot.add(rightPointer);

    // 右侧端头总成
    this.rightTipHandleGroup.name = 'rightInclineTipHandleGroup';

    // 精密机加工航空银铝端盖
    const capGeom = createChamferedBlockGeometry(0.014, 0.024, this.RAIL_WIDTH + 0.006, 0.0014);
    const endCap = new THREE.Mesh(capGeom, this.chassisMat);
    this.rightTipHandleGroup.add(endCap);

    // 香槟金防撞止动面
    const bumperGeom = new THREE.BoxGeometry(0.003, 0.020, this.RAIL_WIDTH);
    const bumper = new THREE.Mesh(bumperGeom, this.brassMat);
    bumper.position.set(-0.007, 0, 0);
    this.rightTipHandleGroup.add(bumper);

    // 香槟金内环 + 极光发光环
    const ringCoreGeom = new THREE.TorusGeometry(0.018, 0.002, 16, 32);
    ringCoreGeom.rotateY(Math.PI / 2);
    const ringCore = new THREE.Mesh(ringCoreGeom, this.brassMat);
    ringCore.position.set(0.014, 0.016, 0);
    this.rightTipHandleGroup.add(ringCore);

    const ringGeom = new THREE.TorusGeometry(0.018, 0.004, 16, 32);
    ringGeom.rotateY(Math.PI / 2);
    this.rightTipHandleMesh = new THREE.Mesh(ringGeom, this.handleGlowMatR);
    this.rightTipHandleMesh.position.set(0.014, 0.016, 0);
    this.rightTipHandleMesh.name = 'galileo-direction-handle';
    this.rightTipHandleMesh.userData = { isDirectionHandle: true, isRightHandle: true };
    this.rightTipHandleGroup.add(this.rightTipHandleMesh);

    // 灵敏射线碰撞体
    const hitGeom = new THREE.SphereGeometry(0.065, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.rightHandleHitBox = new THREE.Mesh(hitGeom, hitMat);
    this.rightHandleHitBox.name = 'galileo-direction-handle';
    this.rightHandleHitBox.userData = { isDirectionHandle: true, isRightHandle: true };
    this.rightTipHandleGroup.add(this.rightHandleHitBox);

    this.rightInclinePivot.add(this.rightTipHandleGroup);

    // 右侧自适应伸缩柱 (航天银铝外筒 + 香槟金滚花锁套 + 液态铬活塞杆)
    const outerGeom = new THREE.CylinderGeometry(0.009, 0.010, 1.0, 24);
    outerGeom.translate(0, 0.5, 0);
    this.rightStrutOuter = new THREE.Mesh(outerGeom, this.strutOuterMat);

    const collarGeom = createKnurledBand(0.0125, 0.012);
    this.rightStrutCollar = new THREE.Mesh(collarGeom, this.brassMat);

    const innerGeom = new THREE.CylinderGeometry(0.0055, 0.0055, 1.0, 20);
    innerGeom.translate(0, 0.5, 0);
    this.rightStrutInner = new THREE.Mesh(innerGeom, this.rodMetalMat);

    const baseClevis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.013, 0.008, 16),
      this.brassMat
    );
    baseClevis.position.set(0, 0.004, 0);
    this.rightSupportStrut.add(baseClevis);

    this.rightSupportStrut.add(this.rightStrutOuter, this.rightStrutCollar, this.rightStrutInner);
  }

  /**
   * 5. 经典极简等高虚线辅助线 (科技冷蓝激光基准，指示初始释放高度)
   */
  private createHeightReferenceLine(): void {
    const dashCount = 17;
    const dashLength = 0.035;
    const dashGap = 0.055;
    const dashGeom = new THREE.CylinderGeometry(0.0006, 0.0006, dashLength, 8);
    dashGeom.rotateZ(Math.PI / 2);

    const dashMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7, // 科技冷蓝激光参考基准线
      transparent: true,
      opacity: 0.65,
    });

    const instancedDashes = new THREE.InstancedMesh(dashGeom, dashMat, dashCount);
    const dummy = new THREE.Object3D();
    const startX = -0.75 + dashLength * 0.5;

    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(startX + i * (dashLength + dashGap), 0, 0);
      dummy.updateMatrix();
      instancedDashes.setMatrixAt(i, dummy.matrix);
    }
    instancedDashes.instanceMatrix.needsUpdate = true;

    this.heightReferenceGroup.add(instancedDashes);
  }

  /**
   * 6. 计量级单晶红宝石高精测球 (Precision Synthetic Ruby Sphere: 0xbe123c)
   */
  private createBall(): void {
    const ballGeom = new THREE.SphereGeometry(this.ballRadius, 32, 32);
    this.ballMesh = new THREE.Mesh(ballGeom, this.ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.name = 'galileo-ball';
    this.ballMesh.userData = { isBall: true };
    this.ballMesh.position.set(0, this.ballRadius, 0);

    // 精细液态铬赤道与经度微雕嵌线 (高反差液态铬银标线，清晰直观感知小球沿导轨滚转时的物理自转)
    const ringGeom = new THREE.TorusGeometry(this.ballRadius * 0.998, 0.0006, 12, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05,
    });
    const equatorRing = new THREE.Mesh(ringGeom, ringMat);
    equatorRing.rotation.x = Math.PI / 2;
    this.ballMesh.add(equatorRing);

    const meridianRing = new THREE.Mesh(ringGeom, ringMat);
    this.ballMesh.add(meridianRing);
  }

  /**
   * 7. 等高微光反馈
   */
  private createApexFeedback(): void {
    const ringGeom = new THREE.RingGeometry(0.015, 0.028, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.apexFlashRing = new THREE.Mesh(ringGeom, ringMat);
    this.apexFlashRing.visible = false;
  }

  /**
   * 更新左侧斜面倾角与坡长
   */
  public updateLeftIncline(angleDeg: number, lengthM: number): void {
    this.leftAngleDeg = angleDeg;
    this.leftLengthM = lengthM;

    const angleRad = (angleDeg * Math.PI) / 180.0;
    const vX = new THREE.Vector3(-Math.cos(angleRad), Math.sin(angleRad), 0);
    const vY = new THREE.Vector3(Math.sin(angleRad), Math.cos(angleRad), 0);
    const vZ = new THREE.Vector3(0, 0, -1);
    const m = new THREE.Matrix4().makeBasis(vX, vY, vZ);
    this.leftInclinePivot.quaternion.setFromRotationMatrix(m);

    // 导轨长度自适应缩放
    this.leftInclineRail.scale.set(lengthM, 1, 1);
    this.leftSideRails.scale.set(lengthM, 1, 1);

    // 交互手柄位置
    this.leftTipHandleGroup.position.set(lengthM, this.RAIL_THICKNESS + 0.012, 0);

    // 联动更新左侧立柱
    const halfFlat = this.flatLengthM * 0.5;
    const midPointM = Math.min(lengthM * 0.65, lengthM - 0.05);
    const midX = -halfFlat - midPointM * Math.cos(angleRad);
    const midY = midPointM * Math.sin(angleRad);

    this.leftSupportStrut.position.set(midX, 0, 0);
    const strutH = Math.max(0.001, midY);
    const outerH = Math.min(0.25, strutH * 0.6);

    this.leftStrutOuter.scale.set(1, outerH, 1);
    this.leftStrutCollar.position.y = outerH;
    this.leftStrutInner.position.y = outerH;
    this.leftStrutInner.scale.set(1, Math.max(0.001, strutH - outerH), 1);
    this.leftSupportStrut.visible = angleDeg > 1.2;

    // 联动同步等高参考光束
    this.updateHeightLine(this.releaseHeightM);
  }

  /**
   * 更新右侧斜面倾角与坡长
   */
  public updateRightIncline(angleDeg: number, lengthM: number): void {
    this.rightAngleDeg = angleDeg;
    this.rightLengthM = lengthM;

    const angleRad = (angleDeg * Math.PI) / 180.0;
    this.rightInclinePivot.rotation.z = angleRad;

    // 导轨长度自适应缩放
    this.rightInclineRail.scale.set(lengthM, 1, 1);
    this.rightSideRails.scale.set(lengthM, 1, 1);

    // 交互手柄位置
    this.rightTipHandleGroup.position.set(lengthM, this.RAIL_THICKNESS + 0.012, 0);

    // 联动更新右侧立柱
    const halfFlat = this.flatLengthM * 0.5;
    const midPointM = Math.min(lengthM * 0.65, lengthM - 0.05);
    const midX = halfFlat + midPointM * Math.cos(angleRad);
    const midY = midPointM * Math.sin(angleRad);

    this.rightSupportStrut.position.set(midX, 0, 0);
    const strutH = Math.max(0.001, midY);
    const outerH = Math.min(0.25, strutH * 0.6);

    this.rightStrutOuter.scale.set(1, outerH, 1);
    this.rightStrutCollar.position.y = outerH;
    this.rightStrutInner.position.y = outerH;
    this.rightStrutInner.scale.set(1, Math.max(0.001, strutH - outerH), 1);
    this.rightSupportStrut.visible = angleDeg > 1.2;
  }

  /**
   * 更新等高激光参考线的高度 (精确穿过释放初始高度球心)
   */
  public updateHeightLine(heightM: number): void {
    this.releaseHeightM = heightM;
    const H_NORMAL = 0.04145;
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const targetY = heightM + H_NORMAL * Math.cos(leftRad);
    this.heightReferenceGroup.position.set(0, targetY, 0);
  }

  /**
   * 更新小球的 3D 位置与滚转动画
   */
  public setBallState(
    x: number,
    y: number,
    _velocity: number,
    arcLength: number,
    _showVelocity = false
  ): void {
    // 严格贴合双轨物理接触：中心到轨道基线的法向高度
    const H_NORMAL = 0.04145;
    const halfFlat = this.flatLengthM * 0.5;
    const w = 0.025; // 铰链过渡平滑带宽度

    let posX = x;
    let posY = H_NORMAL;

    if (x < -halfFlat - w) {
      // 左侧斜面
      const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
      posX = x + H_NORMAL * Math.sin(leftRad);
      posY = y + H_NORMAL * Math.cos(leftRad);
    } else if (x < -halfFlat + w) {
      // 左侧铰链圆弧过渡
      const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
      const u = (x - (-halfFlat - w)) / (2 * w);
      const t = u * u * (3 - 2 * u);
      const nx = (1 - t) * Math.sin(leftRad);
      const ny = (1 - t) * Math.cos(leftRad) + t * 1.0;
      const len = Math.hypot(nx, ny);
      posX = x + H_NORMAL * (nx / len);
      posY = y + H_NORMAL * (ny / len);
    } else if (x <= halfFlat - w) {
      // 中间水平平直段
      posX = x;
      posY = H_NORMAL;
    } else if (x < halfFlat + w) {
      // 右侧铰链圆弧过渡
      const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
      const u = (x - (halfFlat - w)) / (2 * w);
      const t = u * u * (3 - 2 * u);
      const nx = -t * Math.sin(rightRad);
      const ny = (1 - t) * 1.0 + t * Math.cos(rightRad);
      const len = Math.hypot(nx, ny);
      posX = x + H_NORMAL * (nx / len);
      posY = y + H_NORMAL * (ny / len);
    } else {
      // 右侧斜面
      const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
      posX = x - H_NORMAL * Math.sin(rightRad);
      posY = y + H_NORMAL * Math.cos(rightRad);
    }

    this.ballMesh.position.set(posX, posY, 0);

    // 沿轨道滚动的物理自转动画 (v = ω * R)
    const rollAngle = -arcLength / this.ballRadius;
    this.ballMesh.rotation.z = rollAngle;
  }

  public triggerApexBeacon(x: number, y: number): void {
    const H_NORMAL = 0.04145;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
    const posX = x - H_NORMAL * Math.sin(rightRad);
    const posY = y + H_NORMAL * Math.cos(rightRad);

    this.apexFlashRing.position.set(posX, posY, 0);
    this.apexFlashRing.visible = true;
    (this.apexFlashRing.material as THREE.MeshBasicMaterial).opacity = 0.75;
    this.apexFlashRing.scale.set(1, 1, 1);
  }

  public setHandleHovered(target: 'left' | 'right' | null): void {
    if (this.handleGlowMatL) {
      this.handleGlowMatL.emissiveIntensity = target === 'left' ? 0.9 : 0.45;
    }
    if (this.handleGlowMatR) {
      this.handleGlowMatR.emissiveIntensity = target === 'right' ? 0.9 : 0.45;
    }
  }

  public updateAnimation(delta: number): void {
    if (this.apexFlashRing.visible) {
      const mat = this.apexFlashRing.material as THREE.MeshBasicMaterial;
      mat.opacity -= delta * 3.0;
      this.apexFlashRing.scale.addScalar(delta * 0.8);
      if (mat.opacity <= 0.02) {
        this.apexFlashRing.visible = false;
        this.apexFlashRing.scale.set(1, 1, 1);
      }
    }
  }

  public getRightTipHandleMesh(): THREE.Mesh {
    return this.rightTipHandleMesh;
  }

  public getLeftTipHandleMesh(): THREE.Mesh {
    return this.leftTipHandleMesh;
  }

  public getBallMesh(): THREE.Mesh {
    return this.ballMesh;
  }

  public getLeftReleaseGateMesh(): THREE.Mesh {
    return this.leftReleaseGateMesh;
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    return [this.leftTipHandleGroup, this.rightTipHandleGroup, this.ballMesh];
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
