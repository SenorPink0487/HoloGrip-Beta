/**
 * 3D 牛顿第三定律精密实验台模型 (Newton's Third Law Precision Laboratory Bench)
 *
 * 核心架构：
 * 1. 左侧独立测力计体验区：
 *    - 航天级阳极氧化喷砂银铝立柱铁架台 (Retort Stand)；
 *    - 香槟金黄铜锁紧环悬挂 1 号独立弹簧测力计；
 *    - 底部挂钩配备向下拖拽交互环与标准 1N/2N 钩码组；
 *    - 动态 3D 作用力与反作用力双向矢量箭头 (手拉力与弹簧弹力)。
 * 2. 右侧双测力计互拉探究区：
 *    - 双路镜面液态铬合金精密平直导轨，燕尾滑块定位；
 *    - 测力计 A (左侧固定端) 与 测力计 B (右侧活动端) 挂钩完全互扣；
 *    - 右侧活动端配备人体工学液态铬拉动手柄与高亮脉冲光环；
 *    - 挂钩互扣中心呈现相反方向的 3D 作用力矢量 \vec{F}_{A\to B} 与反作用力矢量 \vec{F}_{B\to A}；
 * 3. 深邃海洋蓝黑数字遥测分析仪表板 (Deep Oceanic Sapphire Display #08101e)：
 *    - 纯三维物理屏幕，高对比度荧光青/荧光绿实时呈现两测力计示数与差值；
 *    - 双路实时力-时间示波曲线 (F_A 与 F_B 曲线完美重叠，直观印证“同时产生、同时变化、同时消失”)；
 * 4. 台载 3D 纯机械微动预设按钮：
 *    - 纯 3D 物理按钮，支持点击预设微拉 1.0N、中拉 2.5N、强拉 4.0N、正弦波动态与释放复位。
 */

import * as THREE from 'three';
import { SpringDynamometerMesh } from './SpringDynamometerMesh.ts';
import { mechMetal, disposeObjectTree } from './mechKit.ts';
import type { TelemetryPoint } from '../../physics/mech/newtonThirdDynamics.ts';

export interface BenchButtonDef {
  id: string;
  label: string;
  mesh: THREE.Mesh;
  baseMesh: THREE.Mesh;
  localPos: THREE.Vector3;
  targetForce?: number;
  action?: 'oscillation' | 'reset' | 'preset';
}

export class NewtonThirdBenchMesh {
  public readonly group = new THREE.Group();

  // 1. 三只弹簧测力计实例
  public readonly soloDynamometer: SpringDynamometerMesh;  // 左侧独立测力计
  public readonly dynamometerA: SpringDynamometerMesh;     // 右侧互拉测力计 A (左，定端)
  public readonly dynamometerB: SpringDynamometerMesh;     // 右侧互拉测力计 B (右，拉动手柄)

  // 2. 交互把手与热区
  public soloHookHitMesh?: THREE.Mesh;             // 单独测力计秤钩拖拽热区
  public pairPullHandleMesh!: THREE.Mesh;          // 双测力计右侧拉动手柄
  public pairHandleHitBox!: THREE.Mesh;            // 双测力计手柄拾取盒
  public handleAuraMesh!: THREE.Mesh;              // 手柄光晕环

  // 3. 3D 预设按钮
  public readonly benchButtons: BenchButtonDef[] = [];

  // 4. 挂钩码模型
  public readonly weightMeshGroup = new THREE.Group();
  public readonly weightMeshes: THREE.Mesh[] = [];

  // 5. 遥测屏幕与材质
  private screenMesh!: THREE.Mesh;
  private screenCanvas!: HTMLCanvasElement;
  private screenCtx!: CanvasRenderingContext2D;
  private screenTexture!: THREE.CanvasTexture;

  // 6. 3D 矢量力箭头
  private pairVectorAtoBGroup = new THREE.Group(); // A 对 B 的力 (向左，青色)
  private pairVectorBtoAGroup = new THREE.Group(); // B 对 A 的力 (向右，橙红)
  private pairArrowAtoBMesh!: THREE.Mesh;
  private pairArrowBtoAMesh!: THREE.Mesh;
  private pairVectorLabelA!: THREE.Sprite;
  private pairVectorLabelB!: THREE.Sprite;

  private soloVectorPullGroup = new THREE.Group(); // 单独测力计外拉力 (向下，橙红)
  private soloVectorReactGroup = new THREE.Group(); // 单独测力计反弹力 (向上，青色)
  private soloArrowPullMesh!: THREE.Mesh;
  private soloArrowReactMesh!: THREE.Mesh;

  // 材质引用
  private satinAluminumMat!: THREE.MeshStandardMaterial;
  private liquidChromeMat!: THREE.MeshStandardMaterial;
  private brassMat!: THREE.MeshStandardMaterial;
  private darkPlinthMat!: THREE.MeshStandardMaterial;
  private vectorMatA!: THREE.MeshStandardMaterial; // 青色
  private vectorMatB!: THREE.MeshStandardMaterial; // 橙红

  // 几何定位常量
  public readonly benchOriginX = 0;
  public readonly benchOriginY = 0;
  public readonly benchOriginZ = 0;

  // 测力计初始相对位置 (以 group 原点为基准)
  private readonly soloBasePos = new THREE.Vector3(-0.38, 0.18, 0.05);
  private readonly pairAnchorBaseX = -0.16; // 测力计 A 顶端固定锚点 X
  private readonly pairTrackY = 0.048;      // 双导轨水平中心高度
  private readonly pairTrackZ = 0.02;       // 双导轨前后 Z

  constructor() {
    this.group.name = 'NewtonThirdBenchMesh';

    this.initMaterials();

    // 1. 实例化三只弹簧测力计
    this.soloDynamometer = new SpringDynamometerMesh({
      label: 'SoloDynamometer',
      casingColor: 0x0d9488, // 孔雀青绿
    });

    this.dynamometerA = new SpringDynamometerMesh({
      label: 'DynamometerA',
      casingColor: 0x0f766e, // 测力计 A 深青绿
    });

    this.dynamometerB = new SpringDynamometerMesh({
      label: 'DynamometerB',
      casingColor: 0x0284c7, // 测力计 B 天空湛蓝，便于直观区分两个物体！
    });

    // 2. 搭建左侧立柱铁架台
    this.createSoloRetortStand();

    // 3. 搭建右侧精密双导轨床身
    this.createPairBenchTrack();

    // 4. 装配三只测力计
    this.assembleDynamometers();

    // 5. 创建 3D 矢量力箭头系统
    this.createForceVectorArrows();

    // 6. 创建深海蓝数字遥测仪表板
    this.createSapphireTelemetryScreen();

    // 7. 创建台面 3D 快速交互微动按钮
    this.createBenchButtons();

    // 8. 创建挂载钩码组
    this.createWeightsKit();
  }

  /**
   * 初始化高级实验材质
   */
  private initMaterials(): void {
    // 航天级阳极氧化喷砂银铝
    this.satinAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.82,
      roughness: 0.22,
    });

    // 镜面液态铬 316L
    this.liquidChromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.08,
    });

    // 香槟金微调手轮与锁圈
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.90,
      roughness: 0.20,
    });

    // 避空底座深色微倒角基座
    this.darkPlinthMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.55,
      roughness: 0.35,
    });

    // 作用力矢量材质 (青色 #00f5d4)
    this.vectorMatA = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      metalness: 0.3,
      roughness: 0.2,
      emissive: 0x00f5d4,
      emissiveIntensity: 0.45,
    });

    // 反作用力矢量材质 (珊瑚橙红 #ff6b6b)
    this.vectorMatB = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      metalness: 0.3,
      roughness: 0.2,
      emissive: 0xff6b6b,
      emissiveIntensity: 0.45,
    });
  }

  /**
   * 搭建左侧立柱铁架台 (用于垂直悬挂独立测力计)
   */
  private createSoloRetortStand(): void {
    const standGroup = new THREE.Group();
    standGroup.position.set(this.soloBasePos.x, 0, this.soloBasePos.z);

    // 1. 厚重防倾覆切角底座 (带微倒角)
    const baseGeo = new THREE.BoxGeometry(0.12, 0.016, 0.16);
    const baseMesh = new THREE.Mesh(baseGeo, this.satinAluminumMat);
    baseMesh.position.set(0, 0.008, 0);
    standGroup.add(baseMesh);

    // 四角防滑橡胶脚垫
    const footGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.004, 16);
    const footMat = this.darkPlinthMat;
    const offsets = [
      [-0.045, -0.06],
      [0.045, -0.06],
      [-0.045, 0.06],
      [0.045, 0.06],
    ];
    for (const [fx, fz] of offsets) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.002, fz);
      standGroup.add(foot);
    }

    // 2. 竖直液态铬立柱 (高度 0.38m)
    const poleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.38, 24);
    const poleMesh = new THREE.Mesh(poleGeo, this.liquidChromeMat);
    poleMesh.position.set(0, 0.19, -0.05);
    standGroup.add(poleMesh);

    // 3. 十字交叉接头 (Cross Head Clamp) 与 香槟金紧定手轮
    const crossClampGeo = new THREE.BoxGeometry(0.024, 0.022, 0.024);
    const crossClamp = new THREE.Mesh(crossClampGeo, this.satinAluminumMat);
    crossClamp.position.set(0, 0.35, -0.05);
    standGroup.add(crossClamp);

    const clampKnobGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 16);
    const clampKnob = new THREE.Mesh(clampKnobGeo, this.brassMat);
    clampKnob.rotation.z = Math.PI / 2;
    clampKnob.position.set(0.016, 0.35, -0.05);
    standGroup.add(clampKnob);

    // 4. 水平伸出支承横杆 (Horizontal Arm)
    const armGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.075, 24);
    const armMesh = new THREE.Mesh(armGeo, this.liquidChromeMat);
    armMesh.rotation.x = Math.PI / 2;
    armMesh.position.set(0, 0.35, -0.0125);
    standGroup.add(armMesh);

    // 横杆前端吊挂小销钉 (带圆头)
    const pinGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.012, 16);
    const pinMesh = new THREE.Mesh(pinGeo, this.liquidChromeMat);
    pinMesh.position.set(0, 0.345, 0.025);
    standGroup.add(pinMesh);

    this.group.add(standGroup);
  }

  /**
   * 搭建右侧精密双导轨床身 (用于双测力计水平互拉)
   */
  private createPairBenchTrack(): void {
    const trackGroup = new THREE.Group();
    trackGroup.position.set(0.18, 0, this.pairTrackZ);

    // 1. 导轨床身底座 (铝合金长条床身，长 0.72m, 宽 0.11m, 高 0.018m)
    const bedGeo = new THREE.BoxGeometry(0.72, 0.018, 0.11);
    const bedMesh = new THREE.Mesh(bedGeo, this.satinAluminumMat);
    bedMesh.position.set(0, 0.009, 0);
    trackGroup.add(bedMesh);

    // 床身避空底座
    const plinthGeo = new THREE.BoxGeometry(0.68, 0.006, 0.09);
    const plinthMesh = new THREE.Mesh(plinthGeo, this.darkPlinthMat);
    plinthMesh.position.set(0, 0.003, 0);
    trackGroup.add(plinthMesh);

    // 2. 双路精密镜面液态铬导轨圆轴 (Dual Chrome Guide Rods)
    const railLen = 0.68;
    const railRadius = 0.004;
    const railGeo = new THREE.CylinderGeometry(railRadius, railRadius, railLen, 24);

    const railBack = new THREE.Mesh(railGeo, this.liquidChromeMat);
    railBack.rotation.z = Math.PI / 2;
    railBack.position.set(0, 0.024, -0.028);
    trackGroup.add(railBack);

    const railFront = new THREE.Mesh(railGeo, this.liquidChromeMat);
    railFront.rotation.z = Math.PI / 2;
    railFront.position.set(0, 0.024, 0.028);
    trackGroup.add(railFront);

    // 3. 左右导轨固定支座 (端座)
    const endBlockGeo = new THREE.BoxGeometry(0.026, 0.032, 0.088);
    const leftBlock = new THREE.Mesh(endBlockGeo, this.satinAluminumMat);
    leftBlock.position.set(-railLen * 0.5, 0.022, 0);
    trackGroup.add(leftBlock);

    const rightBlock = new THREE.Mesh(endBlockGeo, this.satinAluminumMat);
    rightBlock.position.set(railLen * 0.5, 0.022, 0);
    trackGroup.add(rightBlock);

    // 4. 左侧测力计固定锚桩 (Anchor Post with Brass Collar)
    // 牢固锁住测力计 A 的提环，保证在受拉时不移位
    const anchorGroup = new THREE.Group();
    anchorGroup.position.set(-0.28, 0.024, 0);

    const anchorPostGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.045, 24);
    const anchorPost = new THREE.Mesh(anchorPostGeo, this.liquidChromeMat);
    anchorPost.position.y = 0.015;
    anchorGroup.add(anchorPost);

    const anchorCollarGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 24);
    const anchorCollar = new THREE.Mesh(anchorCollarGeo, this.brassMat);
    anchorCollar.position.y = 0.028;
    anchorGroup.add(anchorCollar);

    trackGroup.add(anchorGroup);

    // 5. 床身正前方激光蚀刻标尺板 (Laser-Etched Scale facing +Z)
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 1024;
    scaleCanvas.height = 64;
    const sCtx = scaleCanvas.getContext('2d')!;
    sCtx.fillStyle = '#0f172a';
    sCtx.fillRect(0, 0, scaleCanvas.width, scaleCanvas.height);
    sCtx.strokeStyle = '#38bdf8';
    sCtx.lineWidth = 2;
    sCtx.strokeRect(1, 1, scaleCanvas.width - 2, scaleCanvas.height - 2);

    // 绘制毫米刻度
    sCtx.fillStyle = '#94a3b8';
    sCtx.font = '16px monospace';
    sCtx.textAlign = 'center';
    for (let cm = 0; cm <= 60; cm += 5) {
      const px = 30 + (cm / 60) * (scaleCanvas.width - 60);
      sCtx.beginPath();
      sCtx.moveTo(px, scaleCanvas.height);
      sCtx.lineTo(px, scaleCanvas.height - 22);
      sCtx.strokeStyle = '#38bdf8';
      sCtx.lineWidth = 3;
      sCtx.stroke();
      sCtx.fillText(`${cm}`, px, scaleCanvas.height - 28);
    }
    for (let cm = 0; cm <= 60; cm++) {
      if (cm % 5 === 0) continue;
      const px = 30 + (cm / 60) * (scaleCanvas.width - 60);
      sCtx.beginPath();
      sCtx.moveTo(px, scaleCanvas.height);
      sCtx.lineTo(px, scaleCanvas.height - 12);
      sCtx.strokeStyle = '#475569';
      sCtx.lineWidth = 1.5;
      sCtx.stroke();
    }

    const scaleTrackTex = new THREE.CanvasTexture(scaleCanvas);
    const scaleTrackGeo = new THREE.PlaneGeometry(0.68, 0.014);
    const scaleTrackMat = new THREE.MeshBasicMaterial({ map: scaleTrackTex });
    const scaleTrackMesh = new THREE.Mesh(scaleTrackGeo, scaleTrackMat);
    scaleTrackMesh.position.set(0, 0.016, 0.056);
    trackGroup.add(scaleTrackMesh);

    this.group.add(trackGroup);
  }

  /**
   * 测力计在三维实验台上的高保真装配定位
   */
  private assembleDynamometers(): void {
    // ----------------------------------------------------
    // 1. 装配独立测力计 (垂直竖直挂在左侧铁架台上)
    // ----------------------------------------------------
    this.soloDynamometer.group.position.set(
      this.soloBasePos.x,
      0.22,
      this.soloBasePos.z + 0.025
    );
    // 端正朝向操作者 (+Z)
    this.soloDynamometer.group.rotation.set(0, 0, 0);
    this.group.add(this.soloDynamometer.group);

    // ----------------------------------------------------
    // 2. 装配测力计 A (左侧水平卧式，刻度正面朝向 +Z 操作者)
    //    挂钩朝右 (+X)，提环朝左 (-X) 牢固挂在左锚桩上
    // ----------------------------------------------------
    this.dynamometerA.group.rotation.set(0, 0, -Math.PI / 2);
    // 旋转后：局部 +Y 对应世界 -X (提环向左)，局部 -Y 对应世界 +X (挂钩向右)
    this.dynamometerA.group.position.set(
      this.pairAnchorBaseX,
      this.pairTrackY,
      this.pairTrackZ
    );
    this.group.add(this.dynamometerA.group);

    // ----------------------------------------------------
    // 3. 装配测力计 B (右侧水平卧式，刻度正面朝向 +Z 操作者)
    //    挂钩朝左 (-X)，提环朝右 (+X) 接活动拉动手柄
    // ----------------------------------------------------
    this.dynamometerB.group.rotation.set(0, 0, Math.PI / 2);
    // 旋转后：局部 +Y 对应世界 +X (提环向右)，局部 -Y 对应世界 -X (挂钩向左)
    // 初始静止时挂钩扣接点恰好重合
    this.dynamometerB.group.position.set(
      this.pairAnchorBaseX + 0.32,
      this.pairTrackY,
      this.pairTrackZ
    );
    this.group.add(this.dynamometerB.group);

    // ----------------------------------------------------
    // 4. 创建测力计 B 右端高精度拉动手柄与脉冲光环
    // ----------------------------------------------------
    const handleGroup = new THREE.Group();
    // 环形圆把手
    const handleGeo = new THREE.TorusGeometry(0.016, 0.0032, 16, 32);
    this.pairPullHandleMesh = new THREE.Mesh(handleGeo, this.liquidChromeMat);
    this.pairPullHandleMesh.rotation.y = Math.PI / 2;
    handleGroup.add(this.pairPullHandleMesh);

    // 香槟金锁紧衬套
    const sleeveGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.018, 24);
    const sleeve = new THREE.Mesh(sleeveGeo, this.brassMat);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = -0.012;
    handleGroup.add(sleeve);

    // 交互拾取盒
    this.pairHandleHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.065, 0.065),
      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
    );
    this.pairHandleHitBox.name = 'pair-pull-handle-hitbox';
    this.pairHandleHitBox.userData.isInteractable = true;
    handleGroup.add(this.pairHandleHitBox);

    // 交互磁吸脉冲光环 (Hover / Dragging 时发光提示)
    const auraGeo = new THREE.RingGeometry(0.020, 0.024, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.handleAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    this.handleAuraMesh.rotation.y = Math.PI / 2;
    handleGroup.add(this.handleAuraMesh);

    // 装载到测力计 B 的提环处 (外壳右侧端头)
    handleGroup.position.set(0, 0.175, 0); // 在 B 局部坐标的 +Y 端
    this.dynamometerB.casingGroup.add(handleGroup);
  }

  /**
   * 创建 3D 作用力与反作用力双向矢量箭头系统
   */
  private createForceVectorArrows(): void {
    // 1. 双测力计互拉接触点矢量系统 (位于挂钩互扣处)
    // A 对 B 的作用力 (F_A->B: 向左拉 B，青色)
    this.pairArrowAtoBMesh = this.buildVectorArrow(this.vectorMatA, -1);
    this.pairVectorAtoBGroup.add(this.pairArrowAtoBMesh);
    this.pairVectorLabelA = this.createVectorTextSprite('F(A对B)', '#00f5d4');
    this.pairVectorLabelA.position.set(-0.06, 0.035, 0);
    this.pairVectorAtoBGroup.add(this.pairVectorLabelA);
    this.group.add(this.pairVectorAtoBGroup);

    // B 对 A 的反作用力 (F_B->A: 向右拉 A，橙红色)
    this.pairArrowBtoAMesh = this.buildVectorArrow(this.vectorMatB, 1);
    this.pairVectorBtoAGroup.add(this.pairArrowBtoAMesh);
    this.pairVectorLabelB = this.createVectorTextSprite('F(B对A)', '#ff6b6b');
    this.pairVectorLabelB.position.set(0.06, 0.035, 0);
    this.pairVectorBtoAGroup.add(this.pairVectorLabelB);
    this.group.add(this.pairVectorBtoAGroup);

    // 2. 独立测力计垂直受力矢量系统 (位于秤钩处)
    this.soloArrowPullMesh = this.buildVectorArrow(this.vectorMatB, -1, true); // 向下橙红拉力
    this.soloVectorPullGroup.add(this.soloArrowPullMesh);
    this.group.add(this.soloVectorPullGroup);

    this.soloArrowReactMesh = this.buildVectorArrow(this.vectorMatA, 1, true); // 向上青色反弹力
    this.soloVectorReactGroup.add(this.soloArrowReactMesh);
    this.group.add(this.soloVectorReactGroup);
  }

  /**
   * 构建圆锥+圆柱 3D 精密矢量箭头模型
   */
  private buildVectorArrow(
    mat: THREE.MeshStandardMaterial,
    direction: 1 | -1,
    isVertical = false
  ): THREE.Mesh {
    const arrowGroup = new THREE.Group();

    // 箭杆 (Shaft)
    const shaftGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.05, 16);
    const shaft = new THREE.Mesh(shaftGeo, mat);

    // 箭头 (Cone Tip)
    const tipGeo = new THREE.ConeGeometry(0.007, 0.016, 20);
    const tip = new THREE.Mesh(tipGeo, mat);

    if (!isVertical) {
      // 水平方向 (沿 X 轴)
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = (direction * 0.05) / 2;
      tip.rotation.z = direction === 1 ? -Math.PI / 2 : Math.PI / 2;
      tip.position.x = direction * 0.058;
    } else {
      // 垂直方向 (沿 Y 轴)
      shaft.position.y = (direction * 0.05) / 2;
      tip.rotation.x = direction === 1 ? 0 : Math.PI;
      tip.position.y = direction * 0.058;
    }

    arrowGroup.add(shaft);
    arrowGroup.add(tip);

    // 将整个组合并为一个 Mesh 便于动态缩放
    const mergedMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mergedMesh.add(arrowGroup);
    return mergedMesh;
  }

  /**
   * 创建文字精灵 Sprite 标识 (纯 3D 渲染，非 DOM)
   */
  private createVectorTextSprite(text: string, colorHex: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(8, 16, 30, 0.85)';
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 16);
    ctx.fill();
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = 'bold 36px "SF Pro Display", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.065, 0.024, 1);
    sprite.raycast = () => {}; // 标签纯视觉展示，不参与光标拾取
    return sprite;
  }

  /**
   * 创建深海蓝数字遥测仪表板 (Deep Oceanic Sapphire Display #08101e)
   * 严格遵守规则：纯 3D 物理设备屏幕，绝非 DOM 弹窗！
   */
  private createSapphireTelemetryScreen(): void {
    const screenGroup = new THREE.Group();
    // 位于双测力计后上方 (X=0.18, Y=0.22, Z=-0.08)，端正面向操作者视线
    screenGroup.position.set(0.18, 0.22, -0.06);

    // 1. 屏幕金属外壳边框 (喷砂银铝 + 倒角边)
    const frameGeo = new THREE.BoxGeometry(0.56, 0.26, 0.016);
    const frameMesh = new THREE.Mesh(frameGeo, this.satinAluminumMat);
    frameMesh.position.z = -0.008;
    screenGroup.add(frameMesh);

    // 2. 屏幕背撑双立柱
    const strutGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.16, 16);
    const strutL = new THREE.Mesh(strutGeo, this.liquidChromeMat);
    strutL.position.set(-0.18, -0.10, -0.008);
    screenGroup.add(strutL);

    const strutR = new THREE.Mesh(strutGeo, this.liquidChromeMat);
    strutR.position.set(0.18, -0.10, -0.008);
    screenGroup.add(strutR);

    // 3. 屏幕面板画布与纹理 (1024 x 512 视网膜高清)
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 512;
    this.screenCtx = this.screenCanvas.getContext('2d')!;

    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.minFilter = THREE.LinearFilter;
    this.screenTexture.magFilter = THREE.LinearFilter;

    // 屏幕玻璃面
    const screenGeo = new THREE.PlaneGeometry(0.53, 0.23);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
    });
    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.position.z = 0.001;
    screenGroup.add(this.screenMesh);

    this.group.add(screenGroup);

    // 初始静态绘制
    this.renderTelemetryScreen(0, 0, []);
  }

  /**
   * 渲染深海蓝遥测屏幕内容 (每帧/数据更新时极速重绘)
   */
  public renderTelemetryScreen(
    forceA: number,
    forceB: number,
    history: TelemetryPoint[]
  ): void {
    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;

    // 1. 深海蓝黑渐变背景 (#08101e -> #0a192f)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#060d17');
    bgGrad.addColorStop(1, '#0c1a2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 精细科技网格衬线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. 顶部状态栏
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 26px "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('牛顿第三定律 · 作用力与反作用力遥测仪', 36, 44);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('● 120 FPS 纯物理同步中', w - 36, 44);

    // 分隔线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 62);
    ctx.lineTo(w - 32, 62);
    ctx.stroke();

    // 3. 左右测力计读数仪表卡 (HUD Cards)
    // 左卡：测力计 A (作用力)
    ctx.fillStyle = 'rgba(15, 118, 110, 0.22)';
    ctx.roundRect(36, 78, 290, 130, 12);
    ctx.fill();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('测力计 A (作用力 F₁)', 52, 108);

    ctx.fillStyle = '#00f5d4';
    ctx.font = 'bold 54px monospace';
    ctx.fillText(`${forceA.toFixed(2)} N`, 52, 172);

    // 右卡：测力计 B (反作用力)
    ctx.fillStyle = 'rgba(2, 132, 199, 0.22)';
    ctx.roundRect(w - 326, 78, 290, 130, 12);
    ctx.fill();
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('测力计 B (反作用力 F₂)', w - 310, 108);

    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 54px monospace';
    ctx.fillText(`${forceB.toFixed(2)} N`, w - 310, 172);

    // 中间：牛顿定律核心判别 (F₁ = -F₂)
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 36px "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F₁ ≡ -F₂', w * 0.5, 130);

    const deltaF = Math.abs(forceA - forceB);
    ctx.fillStyle = deltaF < 0.001 ? '#4ade80' : '#f87171';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`ΔF = ${deltaF.toFixed(3)} N`, w * 0.5, 170);

    // 4. 下方：动态力-时间实时示波器图表 (Oscilloscope Chart)
    const chartX = 36;
    const chartY = 226;
    const chartW = w - 72;
    const chartH = 250;

    // 示波框背景
    ctx.fillStyle = 'rgba(4, 9, 18, 0.75)';
    ctx.roundRect(chartX, chartY, chartW, chartH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 坐标横线 (0N, 1N, 2N, 3N, 4N, 5N)
    ctx.fillStyle = '#475569';
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    for (let f = 0; f <= 5; f++) {
      const py = chartY + chartH - 24 - (f / 5) * (chartH - 48);
      ctx.strokeStyle = f === 0 ? 'rgba(148, 163, 184, 0.4)' : 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartX + 44, py);
      ctx.lineTo(chartX + chartW - 20, py);
      ctx.stroke();
      ctx.fillText(`${f}N`, chartX + 38, py + 5);
    }

    // 图例
    ctx.fillStyle = '#00f5d4';
    ctx.fillRect(chartX + 60, chartY + 16, 20, 4);
    ctx.fillText('— 测力计 A (作用力)', chartX + 180, chartY + 22);

    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(chartX + 220, chartY + 16, 20, 4);
    ctx.fillText('— 测力计 B (反作用力)', chartX + 350, chartY + 22);

    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'right';
    ctx.font = '16px "SF Pro Display", sans-serif';
    ctx.fillText('两线完全重合：大小相等 · 方向相反 · 同生同灭', chartX + chartW - 20, chartY + 22);

    // 绘制历史数据双波形曲线
    if (history.length > 1) {
      const maxPts = 100;
      const stepX = (chartW - 70) / (maxPts - 1);
      const startX = chartX + 50;
      const baseBottomY = chartY + chartH - 24;
      const usableH = chartH - 48;

      // 1. 测力计 A 曲线 (青色线)
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        const x = startX + i * stepX;
        const y = baseBottomY - Math.min(1.0, Math.max(0, pt.forceA / 5.0)) * usableH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 2. 测力计 B 曲线 (珊瑚红虚线/微细偏置，直观展现重叠)
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]); // 虚线模式，即使完全重叠也能清晰看见两色交替交织！
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        const x = startX + i * stepX;
        const y = baseBottomY - Math.min(1.0, Math.max(0, pt.forceB / 5.0)) * usableH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]); // 还原实线
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * 创建台面 3D 机械微动控制按钮 (纯 3D 实物模型，非 DOM 弹窗)
   */
  private createBenchButtons(): void {
    const buttonConfigs = [
      { id: 'btn_1n', label: '1.0 N 微拉', force: 1.0, action: 'preset' as const },
      { id: 'btn_25n', label: '2.5 N 中拉', force: 2.5, action: 'preset' as const },
      { id: 'btn_4n', label: '4.0 N 强拉', force: 4.0, action: 'preset' as const },
      { id: 'btn_wave', label: '动态正弦波', force: 2.5, action: 'oscillation' as const },
      { id: 'btn_reset', label: '释放复位', force: 0, action: 'reset' as const },
    ];

    const startX = -0.10;
    const spacingX = 0.088;
    const buttonY = 0.020;
    const buttonZ = 0.115; // 位于导轨床身正前方，便于光标直接点击

    for (let i = 0; i < buttonConfigs.length; i++) {
      const cfg = buttonConfigs[i];
      const posX = startX + i * spacingX;

      const btnGroup = new THREE.Group();
      btnGroup.position.set(posX, buttonY, buttonZ);

      // 底座套筒 (香槟金金属底环)
      const baseGeo = new THREE.CylinderGeometry(0.018, 0.020, 0.008, 32);
      const baseMesh = new THREE.Mesh(baseGeo, this.brassMat);
      btnGroup.add(baseMesh);

      // 按键主体 (喷砂银铝圆柱体，带微凸按压帽)
      const capGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.010, 32);
      const capMesh = new THREE.Mesh(capGeo, this.satinAluminumMat);
      capMesh.position.y = 0.006;
      capMesh.userData.isInteractable = true;
      capMesh.userData.buttonId = cfg.id;
      btnGroup.add(capMesh);

      // 按钮顶面铭牌文字 (高对比度小圆标)
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 128;
      labelCanvas.height = 128;
      const lCtx = labelCanvas.getContext('2d')!;
      lCtx.fillStyle = '#0f172a';
      lCtx.beginPath();
      lCtx.arc(64, 64, 60, 0, Math.PI * 2);
      lCtx.fill();
      lCtx.strokeStyle = '#38bdf8';
      lCtx.lineWidth = 4;
      lCtx.stroke();

      lCtx.fillStyle = '#f8fafc';
      lCtx.font = 'bold 24px "PingFang SC", "SF Pro Display", sans-serif';
      lCtx.textAlign = 'center';
      lCtx.textBaseline = 'middle';
      const lines = cfg.label.split(' ');
      if (lines.length > 1) {
        lCtx.fillText(lines[0], 64, 46);
        lCtx.fillText(lines[1], 64, 82);
      } else {
        lCtx.fillText(cfg.label, 64, 64);
      }

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.0135, 32),
        new THREE.MeshBasicMaterial({ map: labelTex })
      );
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.y = 0.0115;
      btnGroup.add(labelMesh);

      this.group.add(btnGroup);

      this.benchButtons.push({
        id: cfg.id,
        label: cfg.label,
        mesh: capMesh,
        baseMesh: baseMesh,
        localPos: new THREE.Vector3(posX, buttonY, buttonZ),
        targetForce: cfg.force,
        action: cfg.action,
      });
    }
  }

  /**
   * 创建标准实验钩码组 (用于独立测力计挂载体验重力与反拉力)
   */
  private createWeightsKit(): void {
    this.weightMeshGroup.position.set(-0.38, 0.02, 0.16);
    this.group.add(this.weightMeshGroup);

    // 砝码底托盘
    const rackGeo = new THREE.BoxGeometry(0.12, 0.008, 0.08);
    const rackMesh = new THREE.Mesh(rackGeo, this.satinAluminumMat);
    this.weightMeshGroup.add(rackMesh);

    // 提供 2 只标准 1N (约 102g) 镜面镀铬挂钩码
    const weightOffsets = [-0.035, 0.035];
    for (let i = 0; i < weightOffsets.length; i++) {
      const wGroup = new THREE.Group();
      wGroup.position.set(weightOffsets[i], 0.022, 0);

      // 砝码身 (圆柱形带微倒角)
      const wBodyGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.028, 32);
      const wBody = new THREE.Mesh(wBodyGeo, this.brassMat);
      wGroup.add(wBody);

      // 顶部小挂环
      const wHookGeo = new THREE.TorusGeometry(0.006, 0.0016, 12, 24);
      const wHook = new THREE.Mesh(wHookGeo, this.liquidChromeMat);
      wHook.position.y = 0.018;
      wGroup.add(wHook);

      wGroup.userData.isInteractable = true;
      wGroup.userData.weightMassKg = 0.102; // 约 1.0 N
      this.weightMeshGroup.add(wGroup);
      this.weightMeshes.push(wBody);
    }
  }

  /**
   * 动态物理更新：同步两端弹簧、拉杆位移、对扣挂钩、矢量力箭头
   */
  public updateVisualState(
    soloForceN: number,
    pairForceN: number,
    history: TelemetryPoint[]
  ): void {
    // 1. 更新单独测力计受力形变
    this.soloDynamometer.setForce(soloForceN);

    // 更新单独测力计秤钩处的受力矢量箭头
    const soloHookWorld = this.soloDynamometer.getHookWorldTip();
    const soloHookLocal = this.group.worldToLocal(soloHookWorld);

    const soloArrowScale = Math.min(1.0, soloForceN / 5.0);
    this.soloVectorPullGroup.position.copy(soloHookLocal);
    this.soloVectorPullGroup.scale.set(soloArrowScale, soloArrowScale, soloArrowScale);
    this.soloVectorPullGroup.visible = soloForceN > 0.05;

    this.soloVectorReactGroup.position.copy(soloHookLocal);
    this.soloVectorReactGroup.scale.set(soloArrowScale, soloArrowScale, soloArrowScale);
    this.soloVectorReactGroup.visible = soloForceN > 0.05;

    // 2. 更新双测力计互拉系统
    // 测力计 A (左): 提环固定在 pairAnchorBaseX, 弹簧伸长使挂钩向右伸展
    this.dynamometerA.setForce(pairForceN);

    // 测力计 B (右): 整个外壳随拉动向右移动，内部弹簧亦同时反向拉伸
    this.dynamometerB.setForce(pairForceN);

    // 计算测力计 A 的秤钩尖端位置 (世界坐标转局部坐标)
    const hookWorldA = this.dynamometerA.getHookWorldTip();
    const hookLocalA = this.group.worldToLocal(hookWorldA);

    // 测力计 B 的位置自适应对准接触面：使 B 的秤钩始终与 A 的秤钩紧密扣合！
    // 测力计 B 的局部位移量
    const dispB = this.dynamometerB.getDisplacement();
    // 测力计 B 初始外壳中心在局部坐标中的 X 偏移，随拉力平稳舒展
    const bBaseX = hookLocalA.x + 0.16 + dispB;
    this.dynamometerB.group.position.x = bBaseX;

    // 3. 更新互扣接触点处的牛顿第三定律双向矢量箭头
    const contactPointX = hookLocalA.x;
    const contactPointY = this.pairTrackY;
    const contactPointZ = this.pairTrackZ;

    const vectorScale = Math.min(1.0, pairForceN / 5.0);
    const isVisible = pairForceN > 0.05;

    // 作用力 F(A->B) (向左，青色)
    this.pairVectorAtoBGroup.position.set(contactPointX, contactPointY + 0.025, contactPointZ);
    this.pairVectorAtoBGroup.scale.set(vectorScale, vectorScale, vectorScale);
    this.pairVectorAtoBGroup.visible = isVisible;

    // 反作用力 F(B->A) (向右，橙红色)
    this.pairVectorBtoAGroup.position.set(contactPointX, contactPointY + 0.025, contactPointZ);
    this.pairVectorBtoAGroup.scale.set(vectorScale, vectorScale, vectorScale);
    this.pairVectorBtoAGroup.visible = isVisible;

    // 4. 更新遥测仪表板
    this.renderTelemetryScreen(pairForceN, pairForceN, history);
  }

  /**
   * 触发 3D 机械按钮按下弹起微动动画
   */
  public animateButtonPress(buttonId: string): void {
    const btn = this.benchButtons.find((b) => b.id === buttonId);
    if (!btn) return;

    btn.mesh.position.y = 0.002; // 按下
    setTimeout(() => {
      btn.mesh.position.y = 0.006; // 弹起
    }, 120);
  }

  /**
   * 深度清理 GPU 资源
   */
  public dispose(): void {
    this.soloDynamometer.dispose();
    this.dynamometerA.dispose();
    this.dynamometerB.dispose();
    if (this.screenTexture) this.screenTexture.dispose();
    disposeObjectTree(this.group);
  }
}
