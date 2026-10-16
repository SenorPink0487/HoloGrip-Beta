/**
 * 3D 实验台模型：伽利略理想斜面实验仪
 *
 * 构成：
 * 1. 稳固底座托盘与分度盘立柱
 * 2. 左侧固定倾角光滑斜面导轨
 * 3. 中间水平连接无缝导轨
 * 4. 右侧可调倾角与坡长斜面导轨（带精密转动轴、角度刻度指示针与顶端 3D 方向标指示把手）
 * 5. 等高全息激光参考虚线（标示机械能守恒达到的理论同一高度 h0）
 * 6. 高光反射金属精密滚动小车/小球（带真实现场滚动自转动画）
 * 7. 瞬时速度矢量箭头指示
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

  // 小球与特效
  private ballMesh: THREE.Mesh;
  private ballRadius = 0.022; // 22mm 金属小球
  private velocityArrow = createForceArrow(0x38bdf8, 0.05, 0.025);
  private apexFlashRing: THREE.Mesh;
  private heightReferenceLine: THREE.LineSegments;
  private rightTipHandleMesh: THREE.Mesh;

  // 几何尺寸缓存
  private releaseHeightM = 0.25;
  private leftAngleDeg = 35.0;
  private flatLengthM = 0.40;
  private rightAngleDeg = 30.0;
  private rightLengthM = 0.60;
  private readonly RAIL_WIDTH = 0.12;
  private readonly RAIL_THICKNESS = 0.016;

  // 材质引用（便于动态更新）
  private laserMat: THREE.LineDashedMaterial;

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

    // 默认初始布局对齐
    this.updateRightIncline(this.rightAngleDeg, this.rightLengthM);
    this.updateHeightLine(this.releaseHeightM);
  }

  /**
   * 1. 稳固底座托盘与金属导轨支架
   */
  private createBase(): void {
    // 主底座金属板
    const baseGeom = new THREE.BoxGeometry(1.65, 0.025, 0.30);
    const baseMat = mechIron(0x1e293b, 0.4, 0.6);
    const basePlate = new THREE.Mesh(baseGeom, baseMat);
    basePlate.position.set(0, -0.0125, 0);
    basePlate.receiveShadow = true;
    this.baseGroup.add(basePlate);

    // 橡胶减震地脚 (4 只)
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

    // 左侧立柱支架 (支撑固定左斜面顶端)
    const leftColGeom = new THREE.CylinderGeometry(0.014, 0.016, 0.32, 16);
    const leftColMat = mechMetal(0x64748b, 0.8, 0.2);
    const leftCol = new THREE.Mesh(leftColGeom, leftColMat);
    leftCol.position.set(-0.55, 0.13, 0);
    this.baseGroup.add(leftCol);

    // 标牌
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
    const halfFlat = this.flatLengthM * 0.5;

    // 水平导轨主底板
    const flatGeom = new THREE.BoxGeometry(this.flatLengthM, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    const flatMat = mechWood(0xd97706, 0.5);
    const flatBed = new THREE.Mesh(flatGeom, flatMat);
    flatBed.position.set(0, this.RAIL_THICKNESS * 0.5, 0);
    flatBed.receiveShadow = true;
    this.flatRailGroup.add(flatBed);

    // 双侧不锈钢限位光滑滑轨
    const railRodGeom = new THREE.CylinderGeometry(0.004, 0.004, this.flatLengthM, 12);
    railRodGeom.rotateZ(Math.PI / 2);
    const railRodMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const r1 = new THREE.Mesh(railRodGeom, railRodMat);
    r1.position.set(0, this.RAIL_THICKNESS + 0.004, -this.RAIL_WIDTH * 0.5 + 0.008);
    const r2 = new THREE.Mesh(railRodGeom, railRodMat);
    r2.position.set(0, this.RAIL_THICKNESS + 0.004, this.RAIL_WIDTH * 0.5 - 0.008);
    this.flatRailGroup.add(r1, r2);

    // 导轨两翼侧板
    const sideGeom = new THREE.BoxGeometry(this.flatLengthM, 0.016, 0.006);
    const sideMat = mechMetal(0x475569);
    const s1 = new THREE.Mesh(sideGeom, sideMat);
    s1.position.set(0, this.RAIL_THICKNESS + 0.008, -this.RAIL_WIDTH * 0.5);
    const s2 = new THREE.Mesh(sideGeom, sideMat);
    s2.position.set(0, this.RAIL_THICKNESS + 0.008, this.RAIL_WIDTH * 0.5);
    this.flatRailGroup.add(s1, s2);
  }

  /**
   * 3. 左侧固定光滑斜面
   */
  private createLeftIncline(): void {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const inclineLen = this.releaseHeightM / Math.sin(leftRad);
    const halfFlat = this.flatLengthM * 0.5;

    // 定位左斜面铰接点（与水平段左端相连）
    this.leftInclineGroup.position.set(-halfFlat, 0, 0);
    // 逆时针倾斜（从底端向左上方仰起）
    this.leftInclineGroup.rotation.z = Math.PI - leftRad;

    // 导轨底板
    const inclineGeom = new THREE.BoxGeometry(inclineLen, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    inclineGeom.translate(inclineLen * 0.5, this.RAIL_THICKNESS * 0.5, 0);
    const inclineMat = mechWood(0xd97706, 0.5);
    const inclineMesh = new THREE.Mesh(inclineGeom, inclineMat);
    this.leftInclineGroup.add(inclineMesh);

    // 双侧精密光滑滑轨
    const rodGeom = new THREE.CylinderGeometry(0.004, 0.004, inclineLen, 12);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(inclineLen * 0.5, 0, 0);
    const rodMat = mechMetal(0xe2e8f0, 0.95, 0.1);

    const rod1 = new THREE.Mesh(rodGeom, rodMat);
    rod1.position.set(0, this.RAIL_THICKNESS + 0.004, -this.RAIL_WIDTH * 0.5 + 0.008);
    const rod2 = new THREE.Mesh(rodGeom, rodMat);
    rod2.position.set(0, this.RAIL_THICKNESS + 0.004, this.RAIL_WIDTH * 0.5 - 0.008);
    this.leftInclineGroup.add(rod1, rod2);

    // 顶端释放限位器与止退挡块
    const stopGeom = new THREE.BoxGeometry(0.02, 0.035, this.RAIL_WIDTH);
    stopGeom.translate(inclineLen - 0.01, 0.018, 0);
    const stopMat = mechMetal(0x38bdf8, 0.8, 0.2);
    const stopMesh = new THREE.Mesh(stopGeom, stopMat);
    this.leftInclineGroup.add(stopMesh);
  }

  /**
   * 4. 右侧可调倾角与坡长对接斜面
   */
  private createRightIncline(): void {
    const halfFlat = this.flatLengthM * 0.5;

    // 枢轴中心位于水平段右端接点
    this.rightInclinePivot.position.set(halfFlat, 0, 0);

    // 分度盘基座（固定在水平段右端底座上）
    const protractorGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.006, 32);
    protractorGeom.rotateX(Math.PI / 2);
    const protractorMat = mechMetal(0x0f172a, 0.6, 0.4);
    const protractorMesh = new THREE.Mesh(protractorGeom, protractorMat);
    protractorMesh.position.set(0, 0.03, -this.RAIL_WIDTH * 0.5 - 0.008);
    this.protractorGroup.add(protractorMesh);

    // 分度盘白色刻度盘刻度环
    const ringGeom = new THREE.RingGeometry(0.045, 0.062, 32);
    const ringMat = mechGlow(0x38bdf8, 0.5);
    ringMat.side = THREE.DoubleSide;
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.set(0, 0.03, -this.RAIL_WIDTH * 0.5 - 0.004);
    this.protractorGroup.add(ringMesh);

    // 转轴中心金属铰接轴套
    const hingeGeom = new THREE.CylinderGeometry(0.016, 0.016, this.RAIL_WIDTH + 0.03, 16);
    hingeGeom.rotateX(Math.PI / 2);
    const hingeMat = mechMetal(0x94a3b8, 0.9, 0.1);
    const hingeMesh = new THREE.Mesh(hingeGeom, hingeMat);
    hingeMesh.position.set(0, 0.01, 0);
    this.protractorGroup.add(hingeMesh);

    this.group.add(this.protractorGroup);

    // 右侧可调导轨底板（单位长度 1m，通过 scale 动态拉伸）
    const railGeom = new THREE.BoxGeometry(1.0, this.RAIL_THICKNESS, this.RAIL_WIDTH);
    railGeom.translate(0.5, this.RAIL_THICKNESS * 0.5, 0);
    const railMat = mechWood(0xd97706, 0.5);
    this.rightInclineRail = new THREE.Mesh(railGeom, railMat);
    this.rightInclineRail.castShadow = true;
    this.rightInclineRail.receiveShadow = true;
    this.rightInclinePivot.add(this.rightInclineRail);

    // 双侧不锈钢金属滑轨（随导轨伸长）
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

    // 右侧顶端 3D 方向标把手（发光青色晶体球与微型箭头圈）
    const handleGroup = new THREE.Group();
    const handleSphereGeom = new THREE.SphereGeometry(0.018, 16, 16);
    const handleSphereMat = mechGlow(0x06b6d4, 1.0);
    this.rightTipHandleMesh = new THREE.Mesh(handleSphereGeom, handleSphereMat);
    this.rightTipHandleMesh.name = 'galileo-right-handle';

    // 把手周围外圈光环
    const torusGeom = new THREE.TorusGeometry(0.028, 0.003, 12, 24);
    const torusMat = mechGlow(0x38bdf8, 0.8);
    const torus = new THREE.Mesh(torusGeom, torusMat);
    torus.rotateY(Math.PI / 2);

    handleGroup.add(this.rightTipHandleMesh);
    handleGroup.add(torus);
    handleGroup.name = 'rightInclineTipHandle';
    this.rightInclinePivot.add(handleGroup);

    // 导轨下方伸缩支撑立柱
    const strutGeom = new THREE.CylinderGeometry(0.008, 0.01, 1.0, 12);
    strutGeom.translate(0, 0.5, 0);
    const strutMat = mechMetal(0x64748b, 0.8, 0.3);
    this.supportStrutMesh = new THREE.Mesh(strutGeom, strutMat);
    this.group.add(this.supportStrutMesh);
  }

  /**
   * 5. 等高全息激光参考虚线
   */
  private createHeightReferenceLine(): void {
    const points = [
      new THREE.Vector3(-0.85, this.releaseHeightM, 0),
      new THREE.Vector3(0.85, this.releaseHeightM, 0),
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
   * 6. 高光反射金属精密滚动小球
   */
  private createBall(): void {
    const ballGeom = new THREE.SphereGeometry(this.ballRadius, 32, 24);
    // 高光泽抛光镀铬金属材质，带有青色反光微光晕
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.12,
    });
    this.ballMesh = new THREE.Mesh(ballGeom, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.position.set(0, this.ballRadius, 0);

    // 绘制小球表面的一圈深色赤道标记线，使用户能清晰观察滚动旋转
    const markGeom = new THREE.TorusGeometry(this.ballRadius + 0.0005, 0.0012, 8, 32);
    const markMat = mechIron(0x0f172a, 0.8, 0.2);
    const markMesh = new THREE.Mesh(markGeom, markMat);
    markMesh.rotateX(Math.PI / 2);
    this.ballMesh.add(markMesh);
  }

  /**
   * 7. 达到最高点的能量与等高到达光圈
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
   * 更新右侧斜面倾角与长度
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
    const tipHandle = this.rightInclinePivot.getObjectByName('rightInclineTipHandle');
    if (tipHandle) {
      tipHandle.position.set(lengthM, this.RAIL_THICKNESS + 0.015, 0);
    }

    // 更新下方支撑立柱的位置与角度
    const halfFlat = this.flatLengthM * 0.5;
    const midPointM = lengthM * 0.65;
    const midX = halfFlat + midPointM * Math.cos(angleRad);
    const midY = midPointM * Math.sin(angleRad);

    this.supportStrutMesh.position.set(midX, 0, 0);
    this.supportStrutMesh.scale.set(1, Math.max(0.001, midY), 1);
    this.supportStrutMesh.visible = angleDeg > 1.0;
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
    // 小球中心高度需叠加上小球半径与导轨厚度
    const ballY = y + this.RAIL_THICKNESS + this.ballRadius;
    this.ballMesh.position.set(x, ballY, 0);

    // 小球自转角度（无滑滚动: dθ = ds / R）
    const rollAngle = -arcLength / this.ballRadius;
    this.ballMesh.rotation.z = rollAngle;

    // 速度矢量箭头
    if (showVelocity && Math.abs(velocity) > 0.01) {
      this.velocityArrow.setVisible(true);
      this.velocityArrow.group.position.set(x, ballY + this.ballRadius + 0.01, 0);

      // 计算切向方向
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
   * 触发达到最高等高点的光环特效
   */
  public triggerApexBeacon(x: number, y: number): void {
    this.apexFlashRing.position.set(x, y + this.RAIL_THICKNESS + this.ballRadius, 0);
    this.apexFlashRing.visible = true;
    (this.apexFlashRing.material as THREE.MeshStandardMaterial).opacity = 1.0;
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

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
