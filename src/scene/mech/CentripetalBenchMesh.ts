/**
 * 3D 实验台模型：向心力探究实验仪
 * 包含旋转主轴、双速塔轮皮带轮、带滑动重锤的水平横梁，
 * 以及垂直弹簧刻度测力指示筒。
 */

import * as THREE from 'three';
import { mechMetal, mechIron, mechGlow, createForceArrow, disposeObjectTree } from './mechKit.ts';

export class CentripetalBenchMesh {
  public readonly group = new THREE.Group();

  private rotatingAssembly = new THREE.Group();
  private testBob: THREE.Mesh;
  private forceIndicatorRing: THREE.Mesh;
  private arrowCentripetal = createForceArrow(0xa855f7, 0.05, 0.03); // 紫色向心力矢量箭头

  constructor() {
    this.group.name = 'CentripetalBenchMesh';

    // 1. 固定底座与主轴座
    const baseGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.04, 32);
    const baseMat = mechIron(0x334155);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.02;
    this.group.add(baseMesh);

    // 主轴立柱
    const columnGeom = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 24);
    const columnMat = mechMetal(0x64748b, 0.85, 0.2);
    const columnMesh = new THREE.Mesh(columnGeom, columnMat);
    columnMesh.position.y = 0.215;
    this.group.add(columnMesh);

    // 2. 底座多级皮带传动塔轮
    const pulley1Geom = new THREE.CylinderGeometry(0.07, 0.07, 0.015, 24);
    const pulley2Geom = new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24);
    const pulley3Geom = new THREE.CylinderGeometry(0.03, 0.03, 0.015, 24);
    const pulleyMat = mechMetal(0xeab308, 0.9, 0.2); // 黄铜材质
    const p1 = new THREE.Mesh(pulley1Geom, pulleyMat);
    p1.position.y = 0.05;
    const p2 = new THREE.Mesh(pulley2Geom, pulleyMat);
    p2.position.y = 0.065;
    const p3 = new THREE.Mesh(pulley3Geom, pulleyMat);
    p3.position.y = 0.08;
    this.group.add(p1, p2, p3);

    // 3. 旋转组件（安装在立柱顶部 y = 0.38 处）
    this.rotatingAssembly.position.y = 0.38;
    this.group.add(this.rotatingAssembly);

    // 带毫米级滑槽的水平横梁
    const barGeom = new THREE.BoxGeometry(0.48, 0.018, 0.024);
    const barMat = mechMetal(0xe2e8f0, 0.9, 0.1);
    const barMesh = new THREE.Mesh(barGeom, barMat);
    this.rotatingAssembly.add(barMesh);

    // 右臂滑动测试重锤
    const bobGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16);
    const bobMat = mechMetal(0xa855f7, 0.8, 0.25); // 紫色阳极氧化测试砝码
    this.testBob = new THREE.Mesh(bobGeom, bobMat);
    this.testBob.position.set(0.12, 0.02, 0);
    this.rotatingAssembly.add(this.testBob);

    // 从重锤连接至中心轴的拉杆
    const rodGeom = new THREE.CylinderGeometry(0.002, 0.002, 0.12, 8);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(0.06, 0.02, 0);
    const rodMat = mechMetal(0x94a3b8);
    const tieRod = new THREE.Mesh(rodGeom, rodMat);
    this.rotatingAssembly.add(tieRod);

    // 向心力矢量箭头
    this.testBob.add(this.arrowCentripetal.group);

    // 4. 位于中心顶部主轴的测力指示套筒
    const sleeveGuideGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 16);
    const sleeveGuideMat = mechIron(0x0f172a);
    const sleeveGuide = new THREE.Mesh(sleeveGuideGeom, sleeveGuideMat);
    sleeveGuide.position.y = 0.06;
    this.rotatingAssembly.add(sleeveGuide);

    // 红色刻度指示环，随受力增大而上升
    const ringGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16);
    const ringMat = mechGlow(0xef4444, 0.8); // 发光红色指示环
    this.forceIndicatorRing = new THREE.Mesh(ringGeom, ringMat);
    this.forceIndicatorRing.position.y = 0.03;
    this.rotatingAssembly.add(this.forceIndicatorRing);
  }

  public updateCentripetal(rotationAngleRad: number, radiusM: number, forceN: number, springMarks: number): void {
    this.rotatingAssembly.rotation.y = rotationAngleRad;

    // 测试重锤沿横梁的位置
    this.testBob.position.x = radiusM;

    // 向心力箭头从重锤指向中心（重锤局部坐标系中的矢量为 -1, 0, 0）
    const arrowLen = Math.min(0.12, forceN * 0.04);
    this.arrowCentripetal.setVector(new THREE.Vector3(-1, 0, 0), arrowLen);

    // 指示套筒高度与受力/弹簧格数成正比上升
    const indicatorY = 0.03 + Math.min(0.06, springMarks * 0.012);
    this.forceIndicatorRing.position.y = indicatorY;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
