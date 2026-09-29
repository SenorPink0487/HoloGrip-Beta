/**
 * 3D 实验台模型：精密气垫导轨碰撞系统
 * 包含三角截面导轨、带挡光片的双滑块、缓冲弹簧及双 U 型光电门。
 */

import * as THREE from 'three';
import { mechMetal, mechIron, mechGlow, disposeObjectTree } from './mechKit.ts';

export class AirTrackBenchMesh {
  public readonly group = new THREE.Group();

  private car1 = new THREE.Group();
  private car2 = new THREE.Group();
  private gateALed: THREE.Mesh;
  private gateBLed: THREE.Mesh;

  private gateAPosX = -0.25;
  private gateBPosX = 0.25;

  private readonly TRACK_LENGTH = 1.5;

  constructor() {
    this.group.name = 'AirTrackBenchMesh';

    // 1. 三角形截面气垫导轨拉伸体
    // 横截面为倒 V 形（顶部为三角脊线）
    const shape = new THREE.Shape();
    shape.moveTo(-0.05, 0);
    shape.lineTo(0, 0.05);
    shape.lineTo(0.05, 0);
    shape.lineTo(0.04, -0.04);
    shape.lineTo(-0.04, -0.04);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: this.TRACK_LENGTH,
      bevelEnabled: false,
    };
    const trackGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    trackGeom.rotateY(Math.PI / 2);
    trackGeom.translate(0, 0.08, -this.TRACK_LENGTH * 0.5);

    const trackMat = mechMetal(0xe2e8f0, 0.9, 0.15); // 拉丝铝材
    const trackMesh = new THREE.Mesh(trackGeom, trackMat);
    this.group.add(trackMesh);

    // 导轨底座支架（左右两侧水平调节地脚）
    const legGeom = new THREE.CylinderGeometry(0.012, 0.018, 0.08, 16);
    const legMat = mechIron(0x334155);
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-this.TRACK_LENGTH * 0.4, 0.04, 0);
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(this.TRACK_LENGTH * 0.4, 0.04, 0);
    this.group.add(leg1, leg2);

    // 2. 光电门 A 与 B（U 型传感器支架）
    const createPhotogate = (xPos: number) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(xPos, 0.08, 0);

      const archShape = new THREE.Shape();
      archShape.moveTo(-0.06, 0);
      archShape.lineTo(-0.06, 0.12);
      archShape.lineTo(0.06, 0.12);
      archShape.lineTo(0.06, 0);
      archShape.lineTo(0.04, 0);
      archShape.lineTo(0.04, 0.1);
      archShape.lineTo(-0.04, 0.1);
      archShape.lineTo(-0.04, 0);
      archShape.closePath();

      const pGeom = new THREE.ExtrudeGeometry(archShape, { depth: 0.02, bevelEnabled: false });
      pGeom.translate(0, 0, -0.01);
      const pMat = mechIron(0x1e293b);
      const pMesh = new THREE.Mesh(pGeom, pMat);
      pGroup.add(pMesh);

      // 指示 LED
      const ledGeom = new THREE.SphereGeometry(0.006, 12, 12);
      const ledMat = mechGlow(0x22c55e, 0.2); // 空闲状态：绿色
      const ledMesh = new THREE.Mesh(ledGeom, ledMat);
      ledMesh.position.set(0, 0.126, 0);
      pGroup.add(ledMesh);

      this.group.add(pGroup);
      return ledMesh;
    };

    this.gateALed = createPhotogate(this.gateAPosX);
    this.gateBLed = createPhotogate(this.gateBPosX);

    // 3. 气浮滑块（骑跨在导轨上的倒 V 型鞍座）
    const createGlider = (color: number, name: string) => {
      const gGroup = new THREE.Group();
      gGroup.name = name;

      const saddleShape = new THREE.Shape();
      saddleShape.moveTo(-0.052, 0);
      saddleShape.lineTo(0, 0.052);
      saddleShape.lineTo(0.052, 0);
      saddleShape.lineTo(0.056, 0);
      saddleShape.lineTo(0, 0.056);
      saddleShape.lineTo(-0.056, 0);
      saddleShape.closePath();

      const gGeom = new THREE.ExtrudeGeometry(saddleShape, { depth: 0.14, bevelEnabled: false });
      gGeom.rotateY(Math.PI / 2);
      gGeom.translate(0, 0.08, -0.07);

      const gMat = mechMetal(color, 0.8, 0.25);
      const gMesh = new THREE.Mesh(gGeom, gMat);
      gGroup.add(gMesh);

      // 顶部挡光片
      const flagGeom = new THREE.BoxGeometry(0.015, 0.04, 0.002);
      const flagMat = mechIron(0x0f172a);
      const flag = new THREE.Mesh(flagGeom, flagMat);
      flag.position.set(0, 0.155, 0);
      gGroup.add(flag);

      // 端部缓冲器（弹簧圈）
      const springGeom = new THREE.TorusGeometry(0.012, 0.002, 8, 20, Math.PI);
      springGeom.rotateZ(-Math.PI / 2);
      const springMat = mechMetal(0xf59e0b);
      const frontSpring = new THREE.Mesh(springGeom, springMat);
      frontSpring.position.set(0.07, 0.1, 0);
      const rearSpring = new THREE.Mesh(springGeom, springMat);
      rearSpring.rotation.y = Math.PI;
      rearSpring.position.set(-0.07, 0.1, 0);
      gGroup.add(frontSpring, rearSpring);

      this.group.add(gGroup);
      return gGroup;
    };

    this.car1 = createGlider(0x38bdf8, 'Glider1'); // 青色
    this.car2 = createGlider(0xfacc15, 'Glider2'); // 金黄色

    this.setGliderPositions(-0.4, 0.0);
  }

  public setGliderPositions(x1: number, x2: number): void {
    this.car1.position.x = x1;
    this.car2.position.x = x2;

    // 检测滑块挡光片是否位于光电门内
    const isInsideGate = (carX: number, gateX: number) => Math.abs(carX - gateX) < 0.03;

    const gateABlocked = isInsideGate(x1, this.gateAPosX) || isInsideGate(x2, this.gateAPosX);
    const gateBBlocked = isInsideGate(x1, this.gateBPosX) || isInsideGate(x2, this.gateBPosX);

    (this.gateALed.material as THREE.MeshStandardMaterial).emissive.setHex(gateABlocked ? 0xef4444 : 0x22c55e);
    (this.gateBLed.material as THREE.MeshStandardMaterial).emissive.setHex(gateBBlocked ? 0xef4444 : 0x22c55e);
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
