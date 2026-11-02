/**
 * 悬挂法测物体重心实验 - 光学科研级高保真铁架台与悬挂装置 3D 模型
 * (Optical-Grade Precision Retort Stand & Suspension Apparatus)
 *
 * 【工业设计与光学级建模质感规范】：
 * 1. 结构真实严谨：
 *    - 底座：航空级阳极氧化喷砂银铝与钛晶深灰双层 CNC 倒角复合重底座，内置防倾覆配重与避空沉槽；
 *    - 四角：香槟金精密滚花微调调平手轮与高阻尼防震吸附脚垫；
 *    - 立柱：镜面抛光 316L 液态铬不锈钢导杆，正面端正朝向操作者 (+Z) 镶嵌高对比度 0~50cm 激光蚀刻毫米精密标尺；
 *    - 十字夹套 (Bosshead)：CNC 切削双孔倒角合金锁紧块，配备香槟金精密滚花防滑蝶形手轮；
 *    - 横杆与吊钩：镜面铬合金横向导杆、香槟金锁套与黄金合金悬吊挂钩，倒角圆润，杜绝粗糙毛刺；
 *    - 顶针验证装置：精密车削阶梯底座、香槟金调平环与淬火不锈钢极细顶针。
 * 2. 纯三维物理实体交互：严禁任何 DOM 悬浮弹窗与非 3D 浮动向导。
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
  createPrecisionRulerTexture,
  createSatinSilverMaterial,
  createTitaniumSlateMaterial,
  disposeObjectTree,
  mechMetal,
  safeCanvas,
} from './mechKit.ts';

export class RetortStandMesh {
  public readonly group = new THREE.Group();

  // 关键物理连接点位置 (局部坐标系) - 挂钩底部承托小孔的中心位置
  public readonly pinLocalPosition = new THREE.Vector3(0, 0.38, 0.04);

  // 3D 部件引用
  private baseMesh!: THREE.Mesh;
  private rodMesh!: THREE.Mesh;
  private clampGroup = new THREE.Group();
  private armMesh!: THREE.Mesh;
  public hookMesh!: THREE.Mesh;
  public pinMesh!: THREE.Mesh; // 保持向后兼容性别名
  public snapAuraMesh!: THREE.Mesh;
  public snapTargetGuide!: THREE.Line;
  private needleStandGroup = new THREE.Group();

  // 材质引用以支持高亮与清理
  private snapAuraMaterial!: THREE.MeshBasicMaterial;
  private snapGuideMaterial!: THREE.LineDashedMaterial;
  private hookMaterial!: THREE.MeshStandardMaterial;

  // 光学科研级共享材质
  private satinSilverMat!: THREE.MeshStandardMaterial;
  private liquidChromeMat!: THREE.MeshStandardMaterial;
  private champagneBrassMat!: THREE.MeshStandardMaterial;
  private titaniumSlateMat!: THREE.MeshStandardMaterial;
  private footPadMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'RetortStandMesh';
    this.initMaterials();
    this.createStandBaseAndPole();
    this.createClampAndArm();
    this.createSuspensionHook();
    this.createNeedleVerificationStand();
  }

  private initMaterials(): void {
    this.satinSilverMat = createSatinSilverMaterial(0xf1f5f9, 0.74, 0.22);
    this.liquidChromeMat = createLiquidChromeMaterial(0xffffff, 0.98, 0.06);
    this.champagneBrassMat = createChampagneBrassMaterial(0xf59e0b, 0.90, 0.20);
    this.titaniumSlateMat = createTitaniumSlateMaterial(0x334155, 0.82, 0.26);
    this.footPadMat = createLevelingPadMaterial(0x0f172a, 0.85);
  }

  /**
   * 1. 航空级阳极氧化喷砂银铝与钛晶复合重底座、调平旋钮及激光标尺垂直立杆
   */
  private createStandBaseAndPole(): void {
    const baseGroup = new THREE.Group();
    baseGroup.position.set(-0.13, 0, 0.02);

    // 1.1 下层防倾覆配重重基座 (钛晶深灰，CNC 精密四边大倒角)
    const lowerBaseGeo = createChamferedBlockGeometry(0.24, 0.014, 0.19, 0.0024);
    const lowerBase = new THREE.Mesh(lowerBaseGeo, this.titaniumSlateMat);
    lowerBase.position.set(0, 0.007, 0);
    lowerBase.castShadow = true;
    lowerBase.receiveShadow = true;
    baseGroup.add(lowerBase);

    // 1.2 上层精铣工作台阶台 (航空级喷砂银铝，四周精研小倒角)
    const upperDeckGeo = createChamferedBlockGeometry(0.21, 0.008, 0.16, 0.0016);
    this.baseMesh = new THREE.Mesh(upperDeckGeo, this.satinSilverMat);
    this.baseMesh.position.set(0, 0.016, 0);
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    baseGroup.add(this.baseMesh);

    // 1.3 双侧精密黄铜装饰嵌槽与定位基准嵌条
    for (const zSign of [-0.065, 0.065]) {
      const inlayGeo = new THREE.BoxGeometry(0.18, 0.0012, 0.003);
      const inlay = new THREE.Mesh(inlayGeo, this.champagneBrassMat);
      inlay.position.set(0, 0.0205, zSign);
      baseGroup.add(inlay);
    }

    // 1.4 正对操作者视线 (+Z) 的激光雕刻光学级金属铭牌
    const nameplateTex = this.createNameplateTexture();
    if (nameplateTex) {
      const nameplateMat = new THREE.MeshStandardMaterial({
        map: nameplateTex,
        roughness: 0.25,
        metalness: 0.6,
      });
      const nameplateMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.010),
        nameplateMat
      );
      nameplateMesh.position.set(0, 0.015, 0.096);
      baseGroup.add(nameplateMesh);
    }

    // 1.5 四角香槟金滚花微调调平手轮与防震橡胶脚垫
    const footOffsets = [
      [-0.095, -0.075],
      [-0.095, 0.075],
      [0.095, -0.075],
      [0.095, 0.075],
    ];
    for (const [fx, fz] of footOffsets) {
      // 橡胶防滑垫
      const padGeo = new THREE.CylinderGeometry(0.010, 0.011, 0.004, 24);
      const pad = new THREE.Mesh(padGeo, this.footPadMat);
      pad.position.set(fx, 0.002, fz);
      baseGroup.add(pad);

      // 香槟金滚花调平旋钮
      const knobGeo = createKnurledBand(0.013, 0.005);
      const knob = new THREE.Mesh(knobGeo, this.champagneBrassMat);
      knob.position.set(fx, 0.0055, fz);
      baseGroup.add(knob);
    }

    this.group.add(baseGroup);

    // 1.6 立柱安装沉头基座法兰凸台 (CNC 精密车削阶梯环 + 六角紧固锁母)
    const flangeX = -0.16;
    const flangeZ = 0.02;

    const flangeGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.012, 32);
    const flangeMesh = new THREE.Mesh(flangeGeo, this.satinSilverMat);
    flangeMesh.position.set(flangeX, 0.024, flangeZ);
    this.group.add(flangeMesh);

    // 六角黄铜锁紧螺母
    const lockNutGeo = createChamferedHexNut(0.010, 0.005);
    const lockNut = new THREE.Mesh(lockNutGeo, this.champagneBrassMat);
    lockNut.position.set(flangeX, 0.030, flangeZ);
    this.group.add(lockNut);

    // 1.7 垂直立柱：镜面抛光 316L 液态铬不锈钢实心精密导杆
    const poleHeight = 0.50;
    const poleRadius = 0.0065;
    const poleGeo = createGuideShaftGeometry(poleHeight, poleRadius);
    this.rodMesh = new THREE.Mesh(poleGeo, this.liquidChromeMat);
    this.rodMesh.position.set(flangeX, 0.030 + poleHeight * 0.5, flangeZ);
    this.rodMesh.castShadow = true;
    this.group.add(this.rodMesh);

    // 1.8 正面镶嵌 (+Z) 0~50cm 激光蚀刻毫米精密垂直标尺
    const rulerTex = createPrecisionRulerTexture({
      width: 128,
      height: 1024,
      maxCm: 50,
      unitText: 'cm',
      accentColor: '#0284c7',
    });
    if (rulerTex) {
      const rulerMat = new THREE.MeshStandardMaterial({
        map: rulerTex,
        roughness: 0.28,
        metalness: 0.55,
      });
      const rulerMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.008, poleHeight * 0.94),
        rulerMat
      );
      rulerMesh.position.set(flangeX, 0.030 + poleHeight * 0.5, flangeZ + poleRadius + 0.0006);
      this.group.add(rulerMesh);
    }

    // 1.9 立柱顶端车削铝制与香槟金端盖 (双色台阶 finial，取代粗糙单球体)
    const topCapGroup = new THREE.Group();
    topCapGroup.position.set(flangeX, 0.030 + poleHeight, flangeZ);

    const capRing = new THREE.Mesh(createKnurledBand(0.0085, 0.004), this.champagneBrassMat);
    capRing.position.y = 0.002;
    topCapGroup.add(capRing);

    const capDome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.0085, 0.008, 24),
      this.satinSilverMat
    );
    capDome.position.y = 0.006;
    topCapGroup.add(capDome);

    const capBall = new THREE.Mesh(new THREE.SphereGeometry(0.006, 20, 16), this.liquidChromeMat);
    capBall.position.y = 0.012;
    topCapGroup.add(capBall);

    this.group.add(topCapGroup);
  }

  /**
   * 2. 十字夹套 (Bosshead) 与精密水平横梁杆
   */
  private createClampAndArm(): void {
    // 2.1 夹头主体：CNC 精密倒角合金块
    const clampBodyGeo = createChamferedBlockGeometry(0.028, 0.038, 0.028, 0.002);
    const clampBody = new THREE.Mesh(clampBodyGeo, this.titaniumSlateMat);
    clampBody.castShadow = true;
    this.clampGroup.add(clampBody);

    // 夹头中心镶嵌高光钛合金装饰圈
    const centerRingGeo = new THREE.TorusGeometry(0.008, 0.0012, 12, 24);
    const centerRing = new THREE.Mesh(centerRingGeo, this.satinSilverMat);
    centerRing.position.set(0, 0, 0.0145);
    this.clampGroup.add(centerRing);

    // 2.2 紧固精密香槟金双翼手轮 (Thumbscrews)
    // 旋钮 1：锁紧立柱 (向后延伸 -Z)
    this.createPrecisionThumbscrew(
      this.clampGroup,
      new THREE.Vector3(0, 0, -0.014),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );

    // 旋钮 2：锁紧横杆 (向左延伸 -X)
    this.createPrecisionThumbscrew(
      this.clampGroup,
      new THREE.Vector3(-0.014, 0, 0),
      new THREE.Euler(0, 0, Math.PI / 2)
    );

    // 放置夹头在立柱高度上
    this.clampGroup.position.set(-0.16, 0.44, 0.02);
    this.group.add(this.clampGroup);

    // 2.3 水平横梁杆：316L 镜面液态铬不锈钢实心精研杆 (沿 X 轴水平延伸至挂钩悬挂位置)
    const armLength = 0.26;
    const armRadius = 0.0055;
    const armGeo = createGuideShaftGeometry(armLength, armRadius);
    this.armMesh = new THREE.Mesh(armGeo, this.liquidChromeMat);
    this.armMesh.rotation.z = Math.PI / 2;
    this.armMesh.position.set(-0.07, 0.44, 0.02);
    this.armMesh.castShadow = true;
    this.group.add(this.armMesh);

    // 横梁杆两端装饰倒角车削端套
    for (const endX of [-0.20, 0.06]) {
      const endGroup = new THREE.Group();
      endGroup.position.set(endX, 0.44, 0.02);

      const collar = new THREE.Mesh(createKnurledBand(0.0075, 0.004), this.champagneBrassMat);
      collar.rotation.z = Math.PI / 2;
      endGroup.add(collar);

      const tipDome = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 16), this.liquidChromeMat);
      tipDome.position.set(endX > 0 ? 0.003 : -0.003, 0, 0);
      endGroup.add(tipDome);

      this.group.add(endGroup);
    }
  }

  /**
   * 辅助构建精密香槟金防滑滚花双翼手轮 (Precision Thumbscrew)
   */
  private createPrecisionThumbscrew(
    parent: THREE.Group,
    pos: THREE.Vector3,
    rot: THREE.Euler
  ): void {
    const screwGroup = new THREE.Group();
    screwGroup.position.copy(pos);
    screwGroup.rotation.copy(rot);

    // 镀铬螺杆光轴
    const studGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 16);
    const stud = new THREE.Mesh(studGeo, this.liquidChromeMat);
    stud.position.y = 0.008;
    screwGroup.add(stud);

    // 黄铜定位垫圈
    const washerGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 20);
    const washer = new THREE.Mesh(washerGeo, this.champagneBrassMat);
    washer.position.y = 0.003;
    screwGroup.add(washer);

    // 香槟金滚花手轮主体
    const knobGeo = createKnurledBand(0.009, 0.007);
    const knob = new THREE.Mesh(knobGeo, this.champagneBrassMat);
    knob.position.y = 0.015;
    screwGroup.add(knob);

    // 经典轻量化蝶形双翼手柄 (倒角过渡)
    const wingGeo = createChamferedBlockGeometry(0.026, 0.004, 0.005, 0.0008);
    const wing = new THREE.Mesh(wingGeo, this.champagneBrassMat);
    wing.position.y = 0.018;
    screwGroup.add(wing);

    parent.add(screwGroup);
  }

  /**
   * 3. 悬挂挂钩 (挂在横杆上，承托薄板小孔) 与吸附指引
   */
  private createSuspensionHook(): void {
    // 挂在横杆上的固定套环 (位于 X=0, Y=0.44, Z=0.02 处)
    const collarGroup = new THREE.Group();
    collarGroup.position.set(0, 0.44, 0.02);

    const collarGeo = createKnurledBand(0.009, 0.016);
    const collarMesh = new THREE.Mesh(collarGeo, this.champagneBrassMat);
    collarMesh.rotation.z = Math.PI / 2;
    collarGroup.add(collarMesh);

    // 锁紧小滚花手轮
    const lockScrew = new THREE.Mesh(createKnurledBand(0.004, 0.008), this.champagneBrassMat);
    lockScrew.position.set(0, 0.011, 0);
    collarGroup.add(lockScrew);
    this.group.add(collarGroup);

    // 挂钩本体：采用 CatmullRomCurve3 三维样条曲线构建光滑管道模型
    const hookCurvePoints = [
      new THREE.Vector3(0, 0.052, -0.020),  // 顶端连接至套环底部
      new THREE.Vector3(0, 0.034, -0.018),  // 笔直竖向悬垂下行细杆
      new THREE.Vector3(0, 0.016, -0.012),  // 柔和向前下方探出，靠近薄板孔位平面
      new THREE.Vector3(0, 0.004, -0.005),  // 穿入小孔背部空间
      new THREE.Vector3(0, -0.006, 0.000), // 挂钩底部承托弧面 (恰好承接半径 6mm 小孔内壁底端)
      new THREE.Vector3(0, 0.000, 0.008),  // 向上向前穿过小孔内径
      new THREE.Vector3(0, 0.014, 0.014),  // 挂钩前端微翘起的防脱安全钩尖
    ];
    const hookCurve = new THREE.CatmullRomCurve3(hookCurvePoints);
    const hookGeo = new THREE.TubeGeometry(hookCurve, 48, 0.0016, 16, false);
    this.hookMaterial = createChampagneBrassMaterial(0xf59e0b, 0.94, 0.12);
    this.hookMesh = new THREE.Mesh(hookGeo, this.hookMaterial);
    this.hookMesh.castShadow = true;

    // 钩尖安全小圆珠端帽 (镜面镀金安全球)
    const tipSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.0024, 16, 16),
      this.hookMaterial
    );
    tipSphere.position.set(0, 0.014, 0.014);
    this.hookMesh.add(tipSphere);

    // 挂钩定位至 pinLocalPosition
    this.hookMesh.position.copy(this.pinLocalPosition);
    this.hookMesh.name = 'suspension-hook';
    this.hookMesh.userData = { isSuspensionPin: true, isHook: true };
    this.pinMesh = this.hookMesh;
    this.group.add(this.hookMesh);

    // 悬挂挂钩磁吸指引光环
    const auraGeo = new THREE.TorusGeometry(0.024, 0.0025, 16, 32);
    this.snapAuraMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    this.snapAuraMesh = new THREE.Mesh(auraGeo, this.snapAuraMaterial);
    this.snapAuraMesh.position.copy(this.pinLocalPosition);
    this.snapAuraMesh.position.z += 0.004;
    this.group.add(this.snapAuraMesh);

    // 磁吸导引虚线 (连接挂钩托心与被拖拽孔)
    const guideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    this.snapGuideMaterial = new THREE.LineDashedMaterial({
      color: 0x22c55e,
      dashSize: 0.01,
      gapSize: 0.006,
      transparent: true,
      opacity: 0,
    });
    this.snapTargetGuide = new THREE.Line(guideGeo, this.snapGuideMaterial);
    this.group.add(this.snapTargetGuide);
  }

  /**
   * 4. 重心平衡验证立柱与高精度淬火不锈钢顶针 (Precision Needle Stand)
   */
  private createNeedleVerificationStand(): void {
    // 阶梯倒角车削底座 (喷砂银铝 + 抛光倒角)
    const baseGeo = new THREE.CylinderGeometry(0.046, 0.052, 0.014, 36);
    const base = new THREE.Mesh(baseGeo, this.satinSilverMat);
    base.position.y = 0.007;
    base.castShadow = true;
    this.needleStandGroup.add(base);

    // 底座上部香槟金微调滚花衬套
    const ringGeo = createKnurledBand(0.042, 0.004);
    const ring = new THREE.Mesh(ringGeo, this.champagneBrassMat);
    ring.position.y = 0.014;
    this.needleStandGroup.add(ring);

    // 顶针立杆：镜面镀铬精密导杆
    const rodGeo = createGuideShaftGeometry(0.18, 0.0045);
    const rod = new THREE.Mesh(rodGeo, this.liquidChromeMat);
    rod.position.y = 0.105;
    rod.castShadow = true;
    this.needleStandGroup.add(rod);

    // 顶部香槟金导向套筒
    const tipCollarGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.010, 24);
    const tipCollar = new THREE.Mesh(tipCollarGeo, this.champagneBrassMat);
    tipCollar.position.y = 0.195;
    this.needleStandGroup.add(tipCollar);

    // 极细淬火高硬度不锈钢顶针尖
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.018, 24), this.liquidChromeMat);
    tip.position.y = 0.20 + 0.010;
    this.needleStandGroup.add(tip);

    this.needleStandGroup.position.set(0.18, 0, 0.04);
    this.needleStandGroup.visible = false;
    this.group.add(this.needleStandGroup);
  }

  /**
   * 创建操作者视线前置高精铭牌纹理
   */
  private createNameplateTexture(): THREE.CanvasTexture | null {
    const canvas = safeCanvas(512, 48);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 48);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 508, 44);

    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 15px "SF Pro Display", "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PRECISION RETORT STAND · 500MM GROUND CHROME POST', 256, 24);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * 设置吸附光环的高亮程度及动态引线
   */
  public setSnapAuraHighlighted(isNearby: boolean, targetHolePos?: THREE.Vector3): void {
    if (isNearby) {
      this.snapAuraMaterial.color.setHex(0x22c55e); // 亮绿吸附色
      this.snapAuraMaterial.opacity = 0.95;
      this.snapAuraMesh.scale.setScalar(1.35);

      if (targetHolePos) {
        let posAttr = this.snapTargetGuide.geometry.getAttribute('position') as THREE.BufferAttribute;
        if (!posAttr) {
          posAttr = new THREE.BufferAttribute(new Float32Array(6), 3);
          posAttr.setUsage(THREE.DynamicDrawUsage);
          this.snapTargetGuide.geometry.setAttribute('position', posAttr);
        }
        const positions = posAttr.array as Float32Array;
        positions[0] = this.pinLocalPosition.x;
        positions[1] = this.pinLocalPosition.y;
        positions[2] = this.pinLocalPosition.z;
        positions[3] = targetHolePos.x;
        positions[4] = targetHolePos.y;
        positions[5] = targetHolePos.z;
        posAttr.needsUpdate = true;
        this.snapTargetGuide.computeLineDistances();
        this.snapGuideMaterial.opacity = 0.9;
        this.snapTargetGuide.visible = true;
      }
    } else {
      this.snapAuraMaterial.color.setHex(0x38bdf8);
      this.snapAuraMaterial.opacity = 0.40;
      this.snapAuraMesh.scale.setScalar(1.0);
      this.snapGuideMaterial.opacity = 0;
      this.snapTargetGuide.visible = false;
    }
  }

  /**
   * 切换顶针验证装置的可见性
   */
  public setNeedleStandVisible(visible: boolean, targetPos?: THREE.Vector3): void {
    this.needleStandGroup.visible = visible;
    if (visible && targetPos) {
      this.needleStandGroup.position.set(targetPos.x, 0, targetPos.z);
    }
  }

  /**
   * 动画更新
   */
  public update(elapsed: number): void {
    if (this.snapAuraMesh) {
      this.snapAuraMesh.rotation.z = elapsed * 1.5;
    }
  }

  /**
   * 安全销毁 GPU 资源
   */
  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
