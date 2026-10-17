/**
 * 3D 实验台模型：伽利略理想斜面实验仪 (未来主义极简主义空间科技设计)
 *
 * 核心设计：
 * 1. 极简未来感：纯净悬浮式深空钛/微磨砂黑曜石晶体底座，去除一切繁杂、多余的刻度线与纸质分度盘。
 * 2. 对称双向自由可调斜面：左右两侧对称配备极简磁吸交互端头，均可自由拖拽调节倾角与高度。
 * 3. 极简流动导轨：双路镜面液态铬导向滑轨，嵌入极简微透半磨砂导轨床身。
 * 4. 纯净镜面镀铬小球与纯净等高基准光线，完美契合 HoloGrip 科技空间站氛围。
 */

import * as THREE from 'three';
import {
  mechMetal,
  disposeObjectTree,
} from './mechKit.ts';

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
  private rightStrutInner: THREE.Mesh;

  // 小球与物理基准
  private ballMesh: THREE.Mesh;
  private ballRadius = 0.022; // 22mm 纯净纯色金属小球
  private apexFlashRing: THREE.Mesh;
  private heightReferenceGroup = new THREE.Group();
  private leftReleaseGateMesh: THREE.Mesh;

  // 材质引用
  private railBedMat: THREE.MeshStandardMaterial;
  private rodMetalMat: THREE.MeshStandardMaterial;
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
    this.createMinimalBase();
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
    // 极简微透珍珠白/航天轻量化晶体床身材质
    this.railBedMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.08,
      roughness: 0.12,
      transparent: true,
      opacity: 0.92,
    });

    // 抛光镜面液态铬导向滑轨
    this.rodMetalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.03,
    });

    // 左右磁吸交互环高亮材质 (清澈冰蓝/全息未来光泽)
    this.handleGlowMatL = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.1,
    });

    this.handleGlowMatR = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.1,
    });
  }

  /**
   * 1. 悬浮式极简太空银白晶体底座
   */
  private createMinimalBase(): void {
    // 悬浮主底座板 (陶瓷白/航天银铝质感，彻底告别沉重黑板)
    const baseGeom = new THREE.BoxGeometry(1.65, 0.02, 0.24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.12,
      roughness: 0.2,
    });
    const basePlate = new THREE.Mesh(baseGeom, baseMat);
    basePlate.position.set(0, -0.01, 0);
    basePlate.receiveShadow = true;
    this.baseGroup.add(basePlate);

    // 底部微光悬浮冰蓝光槽
    const glowLineGeom = new THREE.BoxGeometry(1.63, 0.003, 0.22);
    const glowLineMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const glowLine = new THREE.Mesh(glowLineGeom, glowLineMat);
    glowLine.position.set(0, -0.019, 0);
    this.baseGroup.add(glowLine);

    // 极简圆柱悬浮支撑柱（抛光不锈钢/银色）
    const footGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 24);
    const footMat = mechMetal(0xe2e8f0, 0.95, 0.1);
    const footPositions = [
      [-0.75, -0.022, -0.09],
      [-0.75, -0.022, 0.09],
      [0.75, -0.022, -0.09],
      [0.75, -0.022, 0.09],
    ];
    for (const [fx, fy, fz] of footPositions) {
      const foot = new THREE.Mesh(footGeom, footMat);
      foot.position.set(fx, fy, fz);
      this.baseGroup.add(foot);
    }
  }

  /**
   * 2. 中间水平无缝导轨
   */
  private createFlatRail(): void {
    const flatGeom = new THREE.BoxGeometry(this.flatLengthM, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    const flatBed = new THREE.Mesh(flatGeom, this.railBedMat);
    flatBed.position.set(0, this.RAIL_THICKNESS * 0.5, 0);
    flatBed.receiveShadow = true;
    this.flatRailGroup.add(flatBed);

    // 双路镜面滑轨
    const rodGeom = new THREE.CylinderGeometry(0.003, 0.003, this.flatLengthM, 16);
    rodGeom.rotateZ(Math.PI / 2);

    const r1 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.003, -0.011);
    const r2 = new THREE.Mesh(rodGeom, this.rodMetalMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.003, 0.011);
    this.flatRailGroup.add(r1, r2);

    // 中间微型极简转轴衬套
    const hingeGeom = new THREE.CylinderGeometry(0.01, 0.01, this.RAIL_WIDTH + 0.01, 24);
    hingeGeom.rotateX(Math.PI / 2);
    const hingeMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const hL = new THREE.Mesh(hingeGeom, hingeMat);
    hL.position.set(-this.flatLengthM * 0.5, 0.008, 0);
    const hR = new THREE.Mesh(hingeGeom, hingeMat);
    hR.position.set(this.flatLengthM * 0.5, 0.008, 0);
    this.flatRailGroup.add(hL, hR);
  }

  /**
   * 3. 左侧可自由拖拽倾角与坡长斜面
   */
  private createLeftIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;
    this.leftInclinePivot.position.set(-halfFlat, 0, 0);

    // 左侧床身（长度随拖拽动态缩放）
    const railGeom = new THREE.BoxGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    this.leftInclineRail = new THREE.Mesh(railGeom, this.railBedMat);
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

    // 左侧极简端头交互环与释放挡块
    this.leftTipHandleGroup.name = 'leftInclineTipHandleGroup';

    // 极简微型端盖 (航天铝银)
    const capGeom = new THREE.BoxGeometry(0.014, 0.024, this.RAIL_WIDTH + 0.006);
    const capMat = mechMetal(0xe2e8f0, 0.95, 0.1);
    const endCap = new THREE.Mesh(capGeom, capMat);
    this.leftTipHandleGroup.add(endCap);

    // 极简磁吸环把手
    const ringGeom = new THREE.TorusGeometry(0.018, 0.004, 16, 32);
    ringGeom.rotateY(Math.PI / 2);
    this.leftTipHandleMesh = new THREE.Mesh(ringGeom, this.handleGlowMatL);
    this.leftTipHandleMesh.position.set(0.014, 0.016, 0);
    this.leftTipHandleMesh.name = 'galileo-left-handle';
    this.leftTipHandleMesh.userData = { isLeftHandle: true, isLeftGate: true };
    this.leftTipHandleGroup.add(this.leftTipHandleMesh);

    // 释放挡块几何体引用
    this.leftReleaseGateMesh = this.leftTipHandleMesh;

    // 灵敏射线碰撞体
    const hitGeom = new THREE.SphereGeometry(0.065, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.leftHandleHitBox = new THREE.Mesh(hitGeom, hitMat);
    this.leftHandleHitBox.name = 'galileo-left-handle';
    this.leftHandleHitBox.userData = { isLeftHandle: true, isLeftGate: true };
    this.leftTipHandleGroup.add(this.leftHandleHitBox);

    this.leftInclinePivot.add(this.leftTipHandleGroup);

    // 左侧自适应极简伸缩柱 (纯净银铬)
    const outerGeom = new THREE.CylinderGeometry(0.008, 0.009, 1.0, 16);
    outerGeom.translate(0, 0.5, 0);
    this.leftStrutOuter = new THREE.Mesh(outerGeom, mechMetal(0xe2e8f0, 0.92, 0.12));

    const innerGeom = new THREE.CylinderGeometry(0.005, 0.005, 1.0, 16);
    innerGeom.translate(0, 0.5, 0);
    this.leftStrutInner = new THREE.Mesh(innerGeom, this.rodMetalMat);

    this.leftSupportStrut.add(this.leftStrutOuter, this.leftStrutInner);
  }

  /**
   * 4. 右侧可自由拖拽倾角与坡长斜面
   */
  private createRightIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;
    this.rightInclinePivot.position.set(halfFlat, 0, 0);

    // 右侧床身
    const railGeom = new THREE.BoxGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    this.rightInclineRail = new THREE.Mesh(railGeom, this.railBedMat);
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

    // 右侧极简端头交互环
    this.rightTipHandleGroup.name = 'rightInclineTipHandleGroup';

    // 极简微型端盖 (航天铝银)
    const capGeom = new THREE.BoxGeometry(0.014, 0.024, this.RAIL_WIDTH + 0.006);
    const capMat = mechMetal(0xe2e8f0, 0.95, 0.1);
    const endCap = new THREE.Mesh(capGeom, capMat);
    this.rightTipHandleGroup.add(endCap);

    // 极简磁吸环把手
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

    // 右侧自适应极简伸缩柱 (纯净银铬)
    const outerGeom = new THREE.CylinderGeometry(0.008, 0.009, 1.0, 16);
    outerGeom.translate(0, 0.5, 0);
    this.rightStrutOuter = new THREE.Mesh(outerGeom, mechMetal(0xe2e8f0, 0.92, 0.12));

    const innerGeom = new THREE.CylinderGeometry(0.005, 0.005, 1.0, 16);
    innerGeom.translate(0, 0.5, 0);
    this.rightStrutInner = new THREE.Mesh(innerGeom, this.rodMetalMat);

    this.rightSupportStrut.add(this.rightStrutOuter, this.rightStrutInner);
  }

  /**
   * 5. 经典极简等高虚线辅助线 (精细黑色点划线段，清晰醒目指示初始释放高度)
   */
  private createHeightReferenceLine(): void {
    const dashCount = 23;
    const dashLength = 0.045;
    const dashGap = 0.055;
    // 微细圆柱截面，确保抗锯齿渲染清晰，但保持纤细（直径 1.8mm）
    const dashGeom = new THREE.CylinderGeometry(0.0009, 0.0009, dashLength, 8);
    dashGeom.rotateZ(Math.PI / 2);

    const dashMat = new THREE.MeshBasicMaterial({
      color: 0x000000, // 黑色经典物理辅助线
      transparent: true,
      opacity: 0.85,
    });

    const instancedDashes = new THREE.InstancedMesh(dashGeom, dashMat, dashCount);
    const dummy = new THREE.Object3D();
    const startX = -1.15 + dashLength * 0.5;

    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(startX + i * (dashLength + dashGap), 0, 0);
      dummy.updateMatrix();
      instancedDashes.setMatrixAt(i, dummy.matrix);
    }
    instancedDashes.instanceMatrix.needsUpdate = true;

    this.heightReferenceGroup.add(instancedDashes);
  }

  /**
   * 6. 纯色极简物理小球
   */
  private createBall(): void {
    const ballGeom = new THREE.SphereGeometry(this.ballRadius, 32, 32);
    // 纯色哑光漫反射材质，彻底避免强镜面反光导致的上下两截色视觉误差
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.1,
      roughness: 0.32,
    });
    this.ballMesh = new THREE.Mesh(ballGeom, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.name = 'galileo-ball';
    this.ballMesh.userData = { isBall: true };
    this.ballMesh.position.set(0, this.ballRadius, 0);
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
    // 严格基底变换：沿斜面向上切向 vX = (-cosθ, sinθ)，法向向上 vY = (sinθ, cosθ)
    const vX = new THREE.Vector3(-Math.cos(angleRad), Math.sin(angleRad), 0);
    const vY = new THREE.Vector3(Math.sin(angleRad), Math.cos(angleRad), 0);
    const vZ = new THREE.Vector3(0, 0, -1);
    const m = new THREE.Matrix4().makeBasis(vX, vY, vZ);
    this.leftInclinePivot.quaternion.setFromRotationMatrix(m);

    // 导轨长度缩放
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

    this.leftStrutOuter.scale.set(1, Math.min(0.25, strutH * 0.6), 1);
    this.leftStrutInner.position.y = Math.min(0.25, strutH * 0.6);
    this.leftStrutInner.scale.set(1, Math.max(0.001, strutH - Math.min(0.25, strutH * 0.6)), 1);
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

    // 导轨长度缩放
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

    this.rightStrutOuter.scale.set(1, Math.min(0.25, strutH * 0.6), 1);
    this.rightStrutInner.position.y = Math.min(0.25, strutH * 0.6);
    this.rightStrutInner.scale.set(1, Math.max(0.001, strutH - Math.min(0.25, strutH * 0.6)), 1);
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
   * 更新小球的 3D 位置与滚转动画 (无悬浮、无杂乱箭头、严密贴轨)
   */
  public setBallState(
    x: number,
    y: number,
    _velocity: number,
    arcLength: number,
    _showVelocity = false
  ): void {
    // 严格贴合双轨物理接触：中心到轨道基线的法向高度
    // RAIL_THICKNESS (0.016) + 导轨圆柱半径 (0.003) + 球心在双轨凹槽上的几何下沉高度 sqrt(R^2 - d^2)
    const H_NORMAL = 0.04145;
    const halfFlat = this.flatLengthM * 0.5;
    const w = 0.025; // 铰链过渡平滑带宽度

    let posX = x;
    let posY = H_NORMAL;

    if (x < -halfFlat - w) {
      // 左侧斜面：法向为 (sin(leftRad), cos(leftRad))
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
      // 右侧斜面：法向为 (-sin(rightRad), cos(rightRad))
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
      this.handleGlowMatL.emissiveIntensity = target === 'left' ? 0.9 : 0.2;
    }
    if (this.handleGlowMatR) {
      this.handleGlowMatR.emissiveIntensity = target === 'right' ? 0.9 : 0.2;
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

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
