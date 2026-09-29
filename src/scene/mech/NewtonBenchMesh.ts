/**
 * 3D 实验台模型：牛顿第二定律实验仪
 * 包含倾斜木板、打点计时器、带配重轮式小车、定滑轮与悬挂钩码。
 */

import * as THREE from 'three';
import { mechWood, mechMetal, mechIron, mechGlow, createForceArrow, disposeObjectTree } from './mechKit.ts';

export class NewtonBenchMesh {
  public readonly group = new THREE.Group();

  // 子装配体
  private boardPivot = new THREE.Group();
  private boardMesh: THREE.Mesh;
  private cartGroup = new THREE.Group();
  private pulleyGroup = new THREE.Group();
  private hangerGroup = new THREE.Group();
  private tickerGroup = new THREE.Group();
  private tapeMesh: THREE.Mesh;
  private tapeDotsGroup = new THREE.Group();

  // 受力矢量箭头
  private arrowGravity = createForceArrow(0xef4444); // 红色：重力
  private arrowNormal = createForceArrow(0x38bdf8);  // 青色：支持力
  private arrowTension = createForceArrow(0xfacc15); // 黄色：拉力
  private arrowFriction = createForceArrow(0xa855f7);// 紫色：摩擦力

  private readonly TRACK_LENGTH = 1.2;
  private readonly TRACK_WIDTH = 0.16;

  constructor() {
    this.group.name = 'NewtonBenchMesh';

    // 1. 台面底座支撑架
    const baseGeom = new THREE.BoxGeometry(1.4, 0.03, 0.3);
    const baseMat = mechIron(0x334155);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.set(0, -0.015, 0);
    this.group.add(baseMesh);

    // 左侧倾角转轴支架
    const pivotStandGeom = new THREE.CylinderGeometry(0.018, 0.024, 0.12, 16);
    const pivotStand = new THREE.Mesh(pivotStandGeom, mechMetal(0x64748b));
    pivotStand.position.set(-this.TRACK_LENGTH * 0.5, 0.06, 0);
    this.group.add(pivotStand);

    // 板端转轴位于左端
    this.boardPivot.position.set(-this.TRACK_LENGTH * 0.5, 0.12, 0);
    this.group.add(this.boardPivot);

    // 2. 轨道长木板（以左端为轴旋转）
    const boardGeom = new THREE.BoxGeometry(this.TRACK_LENGTH, 0.024, this.TRACK_WIDTH);
    boardGeom.translate(this.TRACK_LENGTH * 0.5, 0, 0);
    this.boardMesh = new THREE.Mesh(boardGeom, mechWood(0xd97706));
    this.boardPivot.add(this.boardMesh);

    // 两侧导轨护沿
    const railGeom = new THREE.BoxGeometry(this.TRACK_LENGTH, 0.015, 0.008);
    railGeom.translate(this.TRACK_LENGTH * 0.5, 0.015, 0);
    const railMat = mechMetal(0xcbd5e1);
    const railLeft = new THREE.Mesh(railGeom, railMat);
    railLeft.position.z = -this.TRACK_WIDTH * 0.5 + 0.004;
    const railRight = new THREE.Mesh(railGeom, railMat);
    railRight.position.z = this.TRACK_WIDTH * 0.5 - 0.004;
    this.boardPivot.add(railLeft, railRight);

    // 3. 电火花打点计时器（固定于木板左端）
    const tickerBoxGeom = new THREE.BoxGeometry(0.1, 0.06, 0.1);
    const tickerBoxMat = mechIron(0x166534); // 经典实验墨绿色
    const tickerBox = new THREE.Mesh(tickerBoxGeom, tickerBoxMat);
    tickerBox.position.set(0.06, 0.042, 0);

    // 墨粉纸盘 / 碳粉盘
    const discGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.004, 24);
    const discMat = mechIron(0x0f172a);
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.position.set(0.06, 0.074, 0);

    // 振针臂
    const needleGeom = new THREE.BoxGeometry(0.04, 0.003, 0.003);
    const needleMat = mechMetal(0xe2e8f0);
    const needle = new THREE.Mesh(needleGeom, needleMat);
    needle.position.set(0.06, 0.08, 0);

    this.tickerGroup.add(tickerBox, disc, needle);
    this.boardPivot.add(this.tickerGroup);

    // 4. 轮式小车
    const cartBodyGeom = new THREE.BoxGeometry(0.18, 0.038, 0.11);
    const cartBodyMat = mechMetal(0x38bdf8, 0.7, 0.3); // 高对比度天蓝车身
    const cartBody = new THREE.Mesh(cartBodyGeom, cartBodyMat);
    cartBody.position.y = 0.032;

    // 4 个车轮
    const wheelGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16);
    wheelGeom.rotateX(Math.PI / 2);
    const wheelMat = mechMetal(0x334155, 0.9, 0.2);
    const w1 = new THREE.Mesh(wheelGeom, wheelMat);
    w1.position.set(0.06, 0.018, 0.06);
    const w2 = new THREE.Mesh(wheelGeom, wheelMat);
    w2.position.set(-0.06, 0.018, 0.06);
    const w3 = new THREE.Mesh(wheelGeom, wheelMat);
    w3.position.set(0.06, 0.018, -0.06);
    const w4 = new THREE.Mesh(wheelGeom, wheelMat);
    w4.position.set(-0.06, 0.018, -0.06);

    this.cartGroup.add(cartBody, w1, w2, w3, w4);

    // 将受力箭头绑定至小车中心
    this.cartGroup.add(this.arrowGravity.group);
    this.cartGroup.add(this.arrowNormal.group);
    this.cartGroup.add(this.arrowTension.group);
    this.cartGroup.add(this.arrowFriction.group);
    this.boardPivot.add(this.cartGroup);

    // 5. 轨道右端滑轮组件
    const pulleyWheelGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.008, 20);
    pulleyWheelGeom.rotateZ(Math.PI / 2);
    const pulleyWheelMat = mechMetal(0xeab308, 0.9, 0.1); // 黄铜滑轮
    const pulleyWheel = new THREE.Mesh(pulleyWheelGeom, pulleyWheelMat);
    pulleyWheel.position.set(this.TRACK_LENGTH + 0.02, 0.03, 0);

    const pulleyBracketGeom = new THREE.BoxGeometry(0.03, 0.04, 0.02);
    const pulleyBracket = new THREE.Mesh(pulleyBracketGeom, mechIron(0x475569));
    pulleyBracket.position.set(this.TRACK_LENGTH, 0.015, 0);

    this.pulleyGroup.add(pulleyBracket, pulleyWheel);
    this.boardPivot.add(this.pulleyGroup);

    // 6. 悬挂钩码盘与砝码
    const hangerHookGeom = new THREE.CylinderGeometry(0.002, 0.002, 0.08, 8);
    const hangerDiscGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16);
    const hangerMat = mechMetal(0x94a3b8);
    const hangerHook = new THREE.Mesh(hangerHookGeom, hangerMat);
    const hangerDisc = new THREE.Mesh(hangerDiscGeom, hangerMat);
    hangerDisc.position.y = -0.04;
    this.hangerGroup.add(hangerHook, hangerDisc);
    this.hangerGroup.position.set(this.TRACK_LENGTH + 0.02, -0.1, 0);
    this.boardPivot.add(this.hangerGroup);

    // 7. 动态纸带
    const tapeGeom = new THREE.PlaneGeometry(1, 0.018);
    tapeGeom.rotateX(-Math.PI / 2);
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.tapeMesh = new THREE.Mesh(tapeGeom, tapeMat);
    this.tapeMesh.position.y = 0.025;
    this.boardPivot.add(this.tapeMesh);
    this.boardPivot.add(this.tapeDotsGroup);

    this.setBoardAngle(0);
    this.setCartPosition(0.2);
  }

  public setBoardAngle(deg: number): void {
    const rad = (deg * Math.PI) / 180.0;
    this.boardPivot.rotation.z = -rad;
  }

  public setCartPosition(distFromStartM: number): void {
    const clampedDist = Math.max(0.12, Math.min(this.TRACK_LENGTH - 0.15, distFromStartM));
    this.cartGroup.position.set(clampedDist, 0.012, 0);

    // 更新纸带跨度：从计时器（x=0.1）至小车尾部（x=clampedDist - 0.09）
    const tapeStart = 0.1;
    const tapeEnd = clampedDist - 0.09;
    const tapeLen = Math.max(0.001, tapeEnd - tapeStart);
    this.tapeMesh.position.x = tapeStart + tapeLen * 0.5;
    this.tapeMesh.scale.set(tapeLen, 1, 1);

    // 更新悬挂钩码位置（小车前移时，砝码下落）
    const hookY = -0.06 - clampedDist * 0.4;
    this.hangerGroup.position.y = hookY;
  }

  public updateForces(normalN: number, tensionN: number, frictionN: number, gravityN: number, show: boolean): void {
    if (!show) {
      this.arrowGravity.setVisible(false);
      this.arrowNormal.setVisible(false);
      this.arrowTension.setVisible(false);
      this.arrowFriction.setVisible(false);
      return;
    }
    const scale = 0.08; // 箭头可视化比例缩放
    this.arrowGravity.setVector(new THREE.Vector3(0, -1, 0), gravityN * scale);
    this.arrowNormal.setVector(new THREE.Vector3(0, 1, 0), normalN * scale);
    this.arrowTension.setVector(new THREE.Vector3(1, 0, 0), tensionN * scale);
    this.arrowFriction.setVector(new THREE.Vector3(-1, 0, 0), frictionN * scale);
  }

  public renderTickerDots(positionsM: number[]): void {
    // 清除原有打点
    while (this.tapeDotsGroup.children.length > 0) {
      this.tapeDotsGroup.remove(this.tapeDotsGroup.children[0]);
    }
    const dotGeom = new THREE.CircleGeometry(0.0025, 8);
    dotGeom.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    for (const pos of positionsM) {
      if (pos > this.TRACK_LENGTH) break;
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.set(0.1 + pos, 0.026, 0);
      this.tapeDotsGroup.add(dot);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
