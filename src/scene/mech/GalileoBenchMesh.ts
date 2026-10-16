/**
 * 3D 实验台模型：伽利略理想斜面实验仪
 *
 * 构成：
 * 1. 稳固钛合金底座托盘与双向平滑轨道
 * 2. 左侧固定倾角光滑斜面导轨与左侧释放挡闸
 * 3. 中间水平无缝导轨
 * 4. 右侧可调倾角与坡长斜面导轨：
 *    - 顶端显著的 3D 全息“方向标”（包含方向矢量箭头、双环云台把手、发光指示晶体与 3D 实时参数浮空标牌）
 *    - 底部精密分度盘铰链与角度刻度针
 *    - 下方自适应伸缩支撑立柱
 * 5. 等高全息激光参考虚线（高度等于 h0，直观观察斜面放缓时等高到达规律）
 * 6. 高反光抛光镀铬金属小球（真实现场滚动自转动画）
 * 7. 瞬时切向速度矢量指示箭头
 */

import * as THREE from 'three';
import {
  mechMetal,
  mechIron,
  mechWood,
  mechGlow,
  createForceArrow,
  disposeObjectTree,
} from './mechKit.ts';

export class GalileoBenchMesh {
  public readonly group = new THREE.Group();

  // 几何装配体
  private baseGroup = new THREE.Group();
  private leftInclineGroup = new THREE.Group();
  private flatRailGroup = new THREE.Group();
  private rightInclinePivot = new THREE.Group();
  private rightInclineRail: THREE.Mesh;
  private rightSideRails: THREE.Group = new THREE.Group();
  private protractorGroup = new THREE.Group();
  private supportStrutMesh: THREE.Mesh;

  // 右上角 3D 方向标与把手
  private rightTipHandleGroup = new THREE.Group();
  private rightTipHandleMesh: THREE.Mesh;
  private rightHandleHitBox: THREE.Mesh;
  private rightDirectionArrow: THREE.Group;
  private tipCanvasBadge: THREE.Sprite;
  private tipBadgeCanvas: HTMLCanvasElement | null = null;
  private tipBadgeTexture: THREE.CanvasTexture | null = null;

  // 左侧释放挡闸与小球
  private leftReleaseGateMesh: THREE.Mesh;
  private ballMesh: THREE.Mesh;
  private ballRadius = 0.022; // 22mm 金属小球
  private velocityArrow = createForceArrow(0x38bdf8, 0.05, 0.025);
  private apexFlashRing: THREE.Mesh;
  private heightReferenceLine: THREE.LineSegments;

  // 几何尺寸缓存
  private releaseHeightM = 0.25;
  private leftAngleDeg = 35.0;
  private flatLengthM = 0.40;
  private rightAngleDeg = 30.0;
  private rightLengthM = 0.60;
  private readonly RAIL_WIDTH = 0.12;
  private readonly RAIL_THICKNESS = 0.016;

  // 材质引用
  private laserMat: THREE.LineDashedMaterial;
  private handleGlowMat: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'GalileoBenchMesh';

    this.createBase();
    this.createFlatRail();
    this.createLeftIncline();
    this.createRightIncline();
    this.createHeightReferenceLine();
    this.createBall();
    this.createApexFlash();

    this.group.add(this.baseGroup);
    this.group.add(this.flatRailGroup);
    this.group.add(this.leftInclineGroup);
    this.group.add(this.rightInclinePivot);
    this.group.add(this.heightReferenceLine);
    this.group.add(this.ballMesh);
    this.group.add(this.velocityArrow.group);
    this.group.add(this.apexFlashRing);

    // 初始布局对齐
    this.updateRightIncline(this.rightAngleDeg, this.rightLengthM);
    this.updateHeightLine(this.releaseHeightM);
  }

  /**
   * 1. 稳固底座托盘与金属导轨支架
   */
  private createBase(): void {
    const baseGeom = new THREE.BoxGeometry(1.65, 0.025, 0.30);
    const baseMat = mechIron(0x1e293b, 0.4, 0.6);
    const basePlate = new THREE.Mesh(baseGeom, baseMat);
    basePlate.position.set(0, -0.0125, 0);
    basePlate.receiveShadow = true;
    this.baseGroup.add(basePlate);

    // 橡胶减震地脚
    const footGeom = new THREE.CylinderGeometry(0.025, 0.028, 0.015, 16);
    const footMat = mechIron(0x0f172a, 0.1, 0.9);
    const footPositions = [
      [-0.78, -0.025, -0.12],
      [-0.78, -0.025, 0.12],
      [0.78, -0.025, -0.12],
      [0.78, -0.025, 0.12],
    ];
    for (const [fx, fy, fz] of footPositions) {
      const foot = new THREE.Mesh(footGeom, footMat);
      foot.position.set(fx, fy, fz);
      this.baseGroup.add(foot);
    }

    // 左侧固定立柱支架
    const leftColGeom = new THREE.CylinderGeometry(0.014, 0.016, 0.32, 16);
    const leftColMat = mechMetal(0x64748b, 0.8, 0.2);
    const leftCol = new THREE.Mesh(leftColGeom, leftColMat);
    leftCol.position.set(-0.55, 0.13, 0);
    this.baseGroup.add(leftCol);

    // 实验仪标牌 (伽利略理想实验)
    const plaqueGeom = new THREE.BoxGeometry(0.24, 0.035, 0.005);
    const plaqueMat = mechMetal(0xd97706, 0.8, 0.2);
    const plaque = new THREE.Mesh(plaqueGeom, plaqueMat);
    plaque.position.set(0, 0.005, 0.152);
    this.baseGroup.add(plaque);
  }

  /**
   * 2. 中间水平无缝导轨
   */
  private createFlatRail(): void {
    const flatGeom = new THREE.BoxGeometry(this.flatLengthM, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    const flatMat = mechWood(0xd97706, 0.5);
    const flatBed = new THREE.Mesh(flatGeom, flatMat);
    flatBed.position.set(0, this.RAIL_THICKNESS * 0.5, 0);
    flatBed.receiveShadow = true;
    this.flatRailGroup.add(flatBed);

    // 双侧不锈钢金属滑轨
    const railRodGeom = new THREE.CylinderGeometry(0.004, 0.004, this.flatLengthM, 12);
    railRodGeom.rotateZ(Math.PI / 2);
    const railRodMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const r1 = new THREE.Mesh(railRodGeom, railRodMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.004, -this.RAIL_WIDTH * 0.5 + 0.008);
    const r2 = new THREE.Mesh(railRodGeom, railRodMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.004, this.RAIL_WIDTH * 0.5 - 0.008);
    this.flatRailGroup.add(r1, r2);

    // 导轨侧边防护压条
    const sideGeom = new THREE.BoxGeometry(this.flatLengthM, 0.016, 0.006);
    const sideMat = mechMetal(0x475569);
    const s1 = new THREE.Mesh(sideGeom, sideMat);
    s1.position.set(0, this.RAIL_THICKNESS + 0.008, -this.RAIL_WIDTH * 0.5);
    const s2 = new THREE.Mesh(sideGeom, sideMat);
    s2.position.set(0, this.RAIL_THICKNESS + 0.008, this.RAIL_WIDTH * 0.5);
    this.flatRailGroup.add(s1, s2);
  }

  /**
   * 3. 左侧固定倾角光滑斜面
   */
  private createLeftIncline(): void {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const inclineLen = this.releaseHeightM / Math.sin(leftRad);
    const halfFlat = this.flatLengthM * 0.5;

    this.leftInclineGroup.position.set(-halfFlat, 0, 0);
    this.leftInclineGroup.rotation.z = Math.PI - leftRad;

    // 导轨底板
    const inclineGeom = new THREE.BoxGeometry(inclineLen, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    inclineGeom.translate(inclineLen * 0.5, this.RAIL_THICKNESS * 0.5, 0);
    const inclineMat = mechWood(0xd97706, 0.5);
    const inclineMesh = new THREE.Mesh(inclineGeom, inclineMat);
    this.leftInclineGroup.add(inclineMesh);

    // 双侧滑轨
    const rodGeom = new THREE.CylinderGeometry(0.004, 0.004, inclineLen, 12);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(inclineLen * 0.5, 0, 0);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const rod1 = new THREE.Mesh(rodGeom, rodMat);
    rod1.position.set(0, this.RAIL_THICKNESS + 0.004, -this.RAIL_WIDTH * 0.5 + 0.008);
    const rod2 = new THREE.Mesh(rodGeom, rodMat);
    rod2.position.set(0, this.RAIL_THICKNESS + 0.004, this.RAIL_WIDTH * 0.5 - 0.008);
    this.leftInclineGroup.add(rod1, rod2);

    // 左端释放挡闸（支持点击重置释放）
    const stopGeom = new THREE.BoxGeometry(0.02, 0.038, this.RAIL_WIDTH);
    stopGeom.translate(inclineLen - 0.01, 0.019, 0);
    const stopMat = mechMetal(0x38bdf8, 0.8, 0.2);
    this.leftReleaseGateMesh = new THREE.Mesh(stopGeom, stopMat);
    this.leftReleaseGateMesh.name = 'galileo-left-gate';
    this.leftReleaseGateMesh.userData = { isLeftGate: true };
    this.leftInclineGroup.add(this.leftReleaseGateMesh);

    // 释放挡闸上的发光晶体指示标
    const gateBeadGeom = new THREE.SphereGeometry(0.012, 16, 16);
    const gateBeadMat = mechGlow(0x06b6d4, 1.2);
    const gateBead = new THREE.Mesh(gateBeadGeom, gateBeadMat);
    gateBead.position.set(inclineLen - 0.01, 0.045, 0);
    gateBead.name = 'galileo-left-gate';
    gateBead.userData = { isLeftGate: true };
    this.leftInclineGroup.add(gateBead);
  }

  /**
   * 4. 右侧可调倾角与坡长对接斜面，及其右上角 3D 方向标
   */
  private createRightIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;

    // 枢轴中心位于水平段右端接点 (halfFlat, 0, 0)
    this.rightInclinePivot.position.set(halfFlat, 0, 0);

    // 铰链分度盘刻度盘
    const protractorGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.006, 32);
    protractorGeom.rotateX(Math.PI / 2);
    const protractorMat = mechMetal(0x0f172a, 0.6, 0.4);
    const protractorMesh = new THREE.Mesh(protractorGeom, protractorMat);
    protractorMesh.position.set(0, 0.035, -this.RAIL_WIDTH * 0.5 - 0.008);
    this.protractorGroup.add(protractorMesh);

    // 分度盘刻度环
    const ringGeom = new THREE.RingGeometry(0.05, 0.072, 32);
    const ringMat = mechGlow(0x38bdf8, 0.6);
    ringMat.side = THREE.DoubleSide;
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.set(0, 0.035, -this.RAIL_WIDTH * 0.5 - 0.004);
    this.protractorGroup.add(ringMesh);

    // 转动轴金属铰接套筒
    const hingeGeom = new THREE.CylinderGeometry(0.016, 0.016, this.RAIL_WIDTH + 0.03, 16);
    hingeGeom.rotateX(Math.PI / 2);
    const hingeMat = mechMetal(0x94a3b8, 0.9, 0.1);
    const hingeMesh = new THREE.Mesh(hingeGeom, hingeMat);
    hingeMesh.position.set(0, 0.01, 0);
    this.protractorGroup.add(hingeMesh);

    this.group.add(this.protractorGroup);

    // 右侧可调导轨底板
    const railGeom = new THREE.BoxGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    const railMat = mechWood(0xd97706, 0.5);
    this.rightInclineRail = new THREE.Mesh(railGeom, railMat);
    this.rightInclineRail.castShadow = true;
    this.rightInclineRail.receiveShadow = true;
    this.rightInclinePivot.add(this.rightInclineRail);

    // 双侧不锈钢金属滑轨
    const rodGeom = new THREE.CylinderGeometry(0.004, 0.004, 1.0, 12);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(0.5, 0, 0);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const r1 = new THREE.Mesh(rodGeom, rodMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.004, -this.RAIL_WIDTH * 0.5 + 0.008);
    const r2 = new THREE.Mesh(rodGeom, rodMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.004, this.RAIL_WIDTH * 0.5 - 0.008);
    this.rightSideRails.add(r1, r2);
    this.rightInclinePivot.add(this.rightSideRails);

    // ==========================================
    // 右上角 3D 方向标组合体 (位于斜面顶端)
    // ==========================================
    this.rightTipHandleGroup.name = 'rightInclineTipHandleGroup';

    // 1. 发光方向把手晶体球
    this.handleGlowMat = mechGlow(0x38bdf8, 1.3);
    const handleSphereGeom = new THREE.SphereGeometry(0.022, 20, 20);
    this.rightTipHandleMesh = new THREE.Mesh(handleSphereGeom, this.handleGlowMat);
    this.rightTipHandleMesh.name = 'galileo-direction-handle';
    this.rightTipHandleMesh.userData = { isDirectionHandle: true };
    this.rightTipHandleGroup.add(this.rightTipHandleMesh);

    // 2. 双环云台测角圆环
    const ringTorusGeom1 = new THREE.TorusGeometry(0.034, 0.0035, 12, 32);
    const ringTorusMat = mechMetal(0xe2e8f0, 0.9, 0.1);
    const torus1 = new THREE.Mesh(ringTorusGeom1, ringTorusMat);
    torus1.rotateY(Math.PI / 2);
    torus1.name = 'galileo-direction-handle';
    torus1.userData = { isDirectionHandle: true };

    const ringTorusGeom2 = new THREE.TorusGeometry(0.042, 0.003, 12, 32);
    const ringTorusMat2 = mechGlow(0x06b6d4, 0.8);
    const torus2 = new THREE.Mesh(ringTorusGeom2, ringTorusMat2);
    torus2.rotateX(Math.PI / 2);
    torus2.name = 'galileo-direction-handle';
    torus2.userData = { isDirectionHandle: true };

    this.rightTipHandleGroup.add(torus1, torus2);

    // 3. 3D 方向标方向矢量箭头 (直观指示斜面方向与坡度)
    this.rightDirectionArrow = new THREE.Group();
    const arrowShaftGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.09, 12);
    arrowShaftGeom.rotateZ(-Math.PI / 2);
    arrowShaftGeom.translate(0.045, 0, 0);
    const arrowConeGeom = new THREE.ConeGeometry(0.016, 0.04, 16);
    arrowConeGeom.rotateZ(-Math.PI / 2);
    arrowConeGeom.translate(0.11, 0, 0);

    const arrowMat = mechGlow(0x38bdf8, 1.4);
    const shaft = new THREE.Mesh(arrowShaftGeom, arrowMat);
    const cone = new THREE.Mesh(arrowConeGeom, arrowMat);
    shaft.name = 'galileo-direction-handle';
    cone.name = 'galileo-direction-handle';
    shaft.userData = { isDirectionHandle: true };
    cone.userData = { isDirectionHandle: true };

    this.rightDirectionArrow.add(shaft, cone);
    this.rightTipHandleGroup.add(this.rightDirectionArrow);

    // 4. 超大无缝碰撞检测盒 (确保鼠标/触控准星 100% 灵敏拾取)
    const hitBoxGeom = new THREE.SphereGeometry(0.065, 12, 12);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    this.rightHandleHitBox = new THREE.Mesh(hitBoxGeom, hitBoxMat);
    this.rightHandleHitBox.name = 'galileo-direction-handle';
    this.rightHandleHitBox.userData = { isDirectionHandle: true };
    this.rightTipHandleGroup.add(this.rightHandleHitBox);

    // 5. 3D 悬浮实时参数标牌 (WebGL Canvas Texture, 无任何 HTML 浮窗)
    this.create3DBadge();
    this.rightTipHandleGroup.add(this.tipCanvasBadge);

    this.rightInclinePivot.add(this.rightTipHandleGroup);

    // 6. 导轨下方随倾角伸缩的精雕金属支撑立柱
    const strutGeom = new THREE.CylinderGeometry(0.008, 0.01, 1.0, 12);
    strutGeom.translate(0, 0.5, 0);
    const strutMat = mechMetal(0x64748b, 0.8, 0.3);
    this.supportStrutMesh = new THREE.Mesh(strutGeom, strutMat);
    this.group.add(this.supportStrutMesh);
  }

  /**
   * 创建位于 3D 方向标正上方的 3D 浮空标牌（纯 WebGL Sprite 纹理，非 DOM 元素）
   */
  private create3DBadge(): void {
    if (typeof document === 'undefined') {
      const dummyMat = new THREE.SpriteMaterial();
      this.tipCanvasBadge = new THREE.Sprite(dummyMat);
      this.tipCanvasBadge.raycast = () => {};
      return;
    }

    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      const dummyMat = new THREE.SpriteMaterial();
      this.tipCanvasBadge = new THREE.Sprite(dummyMat);
      this.tipCanvasBadge.raycast = () => {};
      return;
    }

    canvas.width = 512;
    canvas.height = 128;
    this.tipBadgeCanvas = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.tipBadgeTexture = texture;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.tipBadgeTexture,
      transparent: true,
      depthTest: false,
    });
    this.tipCanvasBadge = new THREE.Sprite(spriteMat);
    this.tipCanvasBadge.raycast = () => {};
    this.tipCanvasBadge.scale.set(0.36, 0.09, 1.0);
    this.tipCanvasBadge.position.set(0, 0.095, 0);
  }

  /**
   * 刷新 3D 浮空标牌的文字读数
   */
  private render3DBadge(angleDeg: number, lengthM: number): void {
    if (!this.tipBadgeCanvas || typeof this.tipBadgeCanvas.getContext !== 'function' || !this.tipBadgeTexture) return;

    const ctx = this.tipBadgeCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 128);

    // 绘制流体毛玻璃微胶囊底板
    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 28, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 4;

    const r = 32;
    const w = 504;
    const h = 120;
    const x = 4;
    const y = 4;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制标题与参数文本
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const heightM = lengthM * Math.sin((angleDeg * Math.PI) / 180.0);
    let text = `θ: ${angleDeg.toFixed(1)}°   L: ${lengthM.toFixed(2)}m   H: ${heightM.toFixed(2)}m`;
    if (angleDeg < 0.1) {
      text = `θ: 0.0° (理想水平面 · 惯性定律)`;
    }

    ctx.fillText(text, 256, 52);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '22px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('✦ 拖动方向标调节倾角与高度', 256, 94);

    ctx.restore();
    this.tipBadgeTexture.needsUpdate = true;
  }

  /**
   * 5. 等高全息激光参考虚线 (高度等于 h0)
   */
  private createHeightReferenceLine(): void {
    const points = [
      new THREE.Vector3(-0.95, this.releaseHeightM, 0),
      new THREE.Vector3(1.25, this.releaseHeightM, 0),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);

    this.laserMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4,
      dashSize: 0.025,
      gapSize: 0.015,
      linewidth: 2,
    });
    this.laserMat.toneMapped = false;

    this.heightReferenceLine = new THREE.LineSegments(geom, this.laserMat);
    this.heightReferenceLine.computeLineDistances();
  }

  /**
   * 6. 高反光抛光镀铬金属小球
   */
  private createBall(): void {
    const ballGeom = new THREE.SphereGeometry(this.ballRadius, 32, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.12,
    });
    this.ballMesh = new THREE.Mesh(ballGeom, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.name = 'galileo-ball';
    this.ballMesh.userData = { isBall: true };
    this.ballMesh.position.set(0, this.ballRadius, 0);

    // 赤道刻度线观察自转
    const markGeom = new THREE.TorusGeometry(this.ballRadius + 0.0005, 0.0012, 8, 32);
    const markMat = mechIron(0x0f172a, 0.8, 0.2);
    const markMesh = new THREE.Mesh(markGeom, markMat);
    markMesh.rotateX(Math.PI / 2);
    this.ballMesh.add(markMesh);
  }

  /**
   * 7. 等高到达光环特效
   */
  private createApexFlash(): void {
    const ringGeom = new THREE.RingGeometry(0.03, 0.055, 32);
    const ringMat = mechGlow(0x38bdf8, 1.5);
    ringMat.side = THREE.DoubleSide;
    ringMat.transparent = true;
    ringMat.opacity = 0;
    this.apexFlashRing = new THREE.Mesh(ringGeom, ringMat);
    this.apexFlashRing.visible = false;
  }

  /**
   * 更新右侧斜面倾角与坡长
   */
  public updateRightIncline(angleDeg: number, lengthM: number): void {
    this.rightAngleDeg = angleDeg;
    this.rightLengthM = lengthM;

    const angleRad = (angleDeg * Math.PI) / 180.0;
    this.rightInclinePivot.rotation.z = angleRad;

    // 导轨长度缩放
    this.rightInclineRail.scale.set(lengthM, 1, 1);
    this.rightSideRails.scale.set(lengthM, 1, 1);

    // 把手位于导轨顶端
    this.rightTipHandleGroup.position.set(lengthM, this.RAIL_THICKNESS + 0.015, 0);

    // 更新下方伸缩支撑立柱
    const halfFlat = this.flatLengthM * 0.5;
    const midPointM = lengthM * 0.65;
    const midX = halfFlat + midPointM * Math.cos(angleRad);
    const midY = midPointM * Math.sin(angleRad);

    this.supportStrutMesh.position.set(midX, 0, 0);
    this.supportStrutMesh.scale.set(1, Math.max(0.001, midY), 1);
    this.supportStrutMesh.visible = angleDeg > 1.0;

    // 刷新 3D 浮空标牌
    this.render3DBadge(angleDeg, lengthM);
  }

  /**
   * 更新等高激光参考虚线的高度
   */
  public updateHeightLine(heightM: number): void {
    this.releaseHeightM = heightM;
    const pos = this.heightReferenceLine.geometry.attributes.position;
    if (pos) {
      pos.setY(0, heightM);
      pos.setY(1, heightM);
      pos.needsUpdate = true;
      this.heightReferenceLine.computeLineDistances();
    }
  }

  /**
   * 更新小球的 3D 位置、滚动自转角度与速度矢量
   */
  public setBallState(
    x: number,
    y: number,
    velocity: number,
    arcLength: number,
    showVelocity = true
  ): void {
    const ballY = y + this.RAIL_THICKNESS + this.ballRadius;
    this.ballMesh.position.set(x, ballY, 0);

    // 无滑滚动自转
    const rollAngle = -arcLength / this.ballRadius;
    this.ballMesh.rotation.z = rollAngle;

    // 速度矢量箭头
    if (showVelocity && Math.abs(velocity) > 0.01) {
      this.velocityArrow.setVisible(true);
      this.velocityArrow.group.position.set(x, ballY + this.ballRadius + 0.01, 0);

      const halfFlat = this.flatLengthM * 0.5;
      let dir = new THREE.Vector3(1, 0, 0);

      if (x < -halfFlat) {
        const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
        dir = new THREE.Vector3(Math.cos(leftRad), -Math.sin(leftRad), 0);
      } else if (x > halfFlat) {
        const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
        dir = new THREE.Vector3(Math.cos(rightRad), Math.sin(rightRad), 0);
      } else {
        dir = new THREE.Vector3(1, 0, 0);
      }

      if (velocity < 0) {
        dir.negate();
      }

      const arrowLen = Math.min(0.25, Math.abs(velocity) * 0.08);
      this.velocityArrow.setVector(dir, arrowLen);
    } else {
      this.velocityArrow.setVisible(false);
    }
  }

  /**
   * 触发等高到达光圈动效
   */
  public triggerApexBeacon(x: number, y: number): void {
    this.apexFlashRing.position.set(x, y + this.RAIL_THICKNESS + this.ballRadius, 0);
    this.apexFlashRing.visible = true;
    (this.apexFlashRing.material as THREE.MeshStandardMaterial).opacity = 1.0;
  }

  public setHandleHovered(hovered: boolean): void {
    if (this.handleGlowMat) {
      this.handleGlowMat.emissiveIntensity = hovered ? 2.2 : 1.3;
    }
  }

  public updateAnimation(delta: number): void {
    if (this.apexFlashRing.visible) {
      const mat = this.apexFlashRing.material as THREE.MeshStandardMaterial;
      mat.opacity -= delta * 2.5;
      this.apexFlashRing.scale.addScalar(delta * 1.5);
      if (mat.opacity <= 0.01) {
        this.apexFlashRing.visible = false;
        this.apexFlashRing.scale.set(1, 1, 1);
      }
    }
  }

  public getRightTipHandleMesh(): THREE.Mesh {
    return this.rightTipHandleMesh;
  }

  public getBallMesh(): THREE.Mesh {
    return this.ballMesh;
  }

  public getLeftReleaseGateMesh(): THREE.Mesh {
    return this.leftReleaseGateMesh;
  }

  public dispose(): void {
    if (this.tipBadgeTexture) {
      this.tipBadgeTexture.dispose();
      this.tipBadgeTexture = null;
    }
    this.tipBadgeCanvas = null;
    disposeObjectTree(this.group);
  }
}
