/**
 * 3D 实验台模型：平抛运动与机械能守恒实验仪
 * 包含弧形发射斜槽、坐标网格背板、铅垂线重锤、光电门及承接落点底盘。
 */

import * as THREE from 'three';
import { mechMetal, mechIron, mechGlow, disposeObjectTree } from './mechKit.ts';

export class ProjectileBenchMesh {
  public readonly group = new THREE.Group();

  private ballMesh: THREE.Mesh;
  private landingPlate: THREE.Mesh;
  private chuteGroup = new THREE.Group();
  private trajectoryLine: THREE.Line;
  private trajectoryGeom: THREE.BufferGeometry;

  private readonly LAUNCH_X = 0;
  private readonly LAUNCH_Y = 0.5;

  constructor() {
    this.group.name = 'ProjectileBenchMesh';

    // 1. 带坐标网格的背板
    const boardGeom = new THREE.PlaneGeometry(1.2, 0.8);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.set(0.4, 0.3, -0.06);
    this.group.add(board);

    // 背板边框
    const frameGeom = new THREE.BoxGeometry(1.24, 0.84, 0.02);
    const frame = new THREE.Mesh(frameGeom, mechIron(0x334155));
    frame.position.set(0.4, 0.3, -0.075);
    this.group.add(frame);

    // 铅垂线（重锤与悬线指示垂直基准）
    const plumbThreadGeom = new THREE.CylinderGeometry(0.001, 0.001, 0.7, 4);
    const plumbThread = new THREE.Mesh(plumbThreadGeom, mechIron(0x0f172a));
    plumbThread.position.set(-0.15, 0.35, -0.04);
    const plumbBobGeom = new THREE.ConeGeometry(0.012, 0.03, 12);
    plumbBobGeom.rotateX(Math.PI);
    const plumbBob = new THREE.Mesh(plumbBobGeom, mechMetal(0xeab308)); // 黄铜铅锤
    plumbBob.position.set(-0.15, -0.015, -0.04);
    this.group.add(plumbThread, plumbBob);

    // 2. 弧形轨道斜槽（平滑过渡至水平出口）
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.35, this.LAUNCH_Y + 0.3, 0),
      new THREE.Vector3(-0.15, this.LAUNCH_Y, 0),
      new THREE.Vector3(this.LAUNCH_X, this.LAUNCH_Y, 0)
    );
    const chuteGeom = new THREE.TubeGeometry(curve, 32, 0.012, 8, false);
    const chuteMat = mechMetal(0x94a3b8, 0.9, 0.1);
    const chuteMesh = new THREE.Mesh(chuteGeom, chuteMat);
    this.chuteGroup.add(chuteMesh);

    // 出口发射光电门
    const gateGeom = new THREE.BoxGeometry(0.02, 0.05, 0.04);
    const gate = new THREE.Mesh(gateGeom, mechIron(0x1e293b));
    gate.position.set(this.LAUNCH_X, this.LAUNCH_Y, 0);
    this.chuteGroup.add(gate);
    this.group.add(this.chuteGroup);

    // 3. 移动式承接板 / 落点撞击板
    const plateGeom = new THREE.BoxGeometry(0.2, 0.015, 0.15);
    const plateMat = mechIron(0x475569);
    this.landingPlate = new THREE.Mesh(plateGeom, plateMat);
    this.landingPlate.position.set(0.5, 0.1, 0);
    this.group.add(this.landingPlate);

    // 4. 平抛金属小球（镀铬镜面）
    const ballGeom = new THREE.SphereGeometry(0.014, 24, 24);
    const ballMat = mechMetal(0xffffff, 0.98, 0.05);
    this.ballMesh = new THREE.Mesh(ballGeom, ballMat);
    this.ballMesh.position.set(this.LAUNCH_X, this.LAUNCH_Y, 0);
    this.group.add(this.ballMesh);

    // 5. 动态轨迹虚线
    this.trajectoryGeom = new THREE.BufferGeometry();
    const maxPoints = 50;
    const positions = new Float32Array(maxPoints * 3);
    this.trajectoryGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.03,
      gapSize: 0.015,
      linewidth: 2,
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeom, lineMat);
    this.group.add(this.trajectoryLine);
  }

  public setBallPosition(x: number, yDrop: number): void {
    this.ballMesh.position.set(this.LAUNCH_X + x, this.LAUNCH_Y - yDrop, 0);
  }

  public setLandingPlate(targetX: number, targetYDrop: number): void {
    this.landingPlate.position.set(this.LAUNCH_X + targetX, this.LAUNCH_Y - targetYDrop, 0);
  }

  public updateTrajectory(points: { x: number; y: number }[]): void {
    const posAttr = this.trajectoryGeom.getAttribute('position') as THREE.BufferAttribute;
    const count = Math.min(points.length, posAttr.count);
    for (let i = 0; i < count; i++) {
      posAttr.setXYZ(i, this.LAUNCH_X + points[i].x, this.LAUNCH_Y - points[i].y, 0);
    }
    this.trajectoryGeom.setDrawRange(0, count);
    posAttr.needsUpdate = true;
    (this.trajectoryLine as any).computeLineDistances?.();
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
