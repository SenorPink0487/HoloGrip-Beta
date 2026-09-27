/**
 * 3D Bench Mesh: Centripetal Force Inquiry Apparatus
 * Rotating spindle, dual-speed tower pulley, horizontal crossbar with sliding bob,
 * and vertical spring-loaded graduated force indicator cylinder.
 */

import * as THREE from 'three';
import { mechMetal, mechIron, mechGlow, createForceArrow, disposeObjectTree } from './mechKit.ts';

export class CentripetalBenchMesh {
  public readonly group = new THREE.Group();

  private rotatingAssembly = new THREE.Group();
  private testBob: THREE.Mesh;
  private forceIndicatorRing: THREE.Mesh;
  private arrowCentripetal = createForceArrow(0xa855f7, 0.05, 0.03); // Purple centripetal arrow

  constructor() {
    this.group.name = 'CentripetalBenchMesh';

    // 1. Stationary Base & Spindle Housing
    const baseGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.04, 32);
    const baseMat = mechIron(0x334155);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.02;
    this.group.add(baseMesh);

    // Spindle Column
    const columnGeom = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 24);
    const columnMat = mechMetal(0x64748b, 0.85, 0.2);
    const columnMesh = new THREE.Mesh(columnGeom, columnMat);
    columnMesh.position.y = 0.215;
    this.group.add(columnMesh);

    // 2. Multi-step Belt Drive Tower Pulleys at Base
    const pulley1Geom = new THREE.CylinderGeometry(0.07, 0.07, 0.015, 24);
    const pulley2Geom = new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24);
    const pulley3Geom = new THREE.CylinderGeometry(0.03, 0.03, 0.015, 24);
    const pulleyMat = mechMetal(0xeab308, 0.9, 0.2); // Brass
    const p1 = new THREE.Mesh(pulley1Geom, pulleyMat);
    p1.position.y = 0.05;
    const p2 = new THREE.Mesh(pulley2Geom, pulleyMat);
    p2.position.y = 0.065;
    const p3 = new THREE.Mesh(pulley3Geom, pulleyMat);
    p3.position.y = 0.08;
    this.group.add(p1, p2, p3);

    // 3. Rotating Assembly (mounts on top of column at y = 0.38)
    this.rotatingAssembly.position.y = 0.38;
    this.group.add(this.rotatingAssembly);

    // Horizontal Crossbar with millimeter slots
    const barGeom = new THREE.BoxGeometry(0.48, 0.018, 0.024);
    const barMat = mechMetal(0xe2e8f0, 0.9, 0.1);
    const barMesh = new THREE.Mesh(barGeom, barMat);
    this.rotatingAssembly.add(barMesh);

    // Sliding Test Bob on Right Arm
    const bobGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16);
    const bobMat = mechMetal(0xa855f7, 0.8, 0.25); // Purple anodized test weight
    this.testBob = new THREE.Mesh(bobGeom, bobMat);
    this.testBob.position.set(0.12, 0.02, 0);
    this.rotatingAssembly.add(this.testBob);

    // Tie-rod from bob to central axis
    const rodGeom = new THREE.CylinderGeometry(0.002, 0.002, 0.12, 8);
    rodGeom.rotateZ(Math.PI / 2);
    rodGeom.translate(0.06, 0.02, 0);
    const rodMat = mechMetal(0x94a3b8);
    const tieRod = new THREE.Mesh(rodGeom, rodMat);
    this.rotatingAssembly.add(tieRod);

    // Centripetal Force Vector Arrow
    this.testBob.add(this.arrowCentripetal.group);

    // 4. Force Indicator Sleeve on Central Top Spindle
    const sleeveGuideGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 16);
    const sleeveGuideMat = mechIron(0x0f172a);
    const sleeveGuide = new THREE.Mesh(sleeveGuideGeom, sleeveGuideMat);
    sleeveGuide.position.y = 0.06;
    this.rotatingAssembly.add(sleeveGuide);

    // Red graduated indicator collar that rises as force increases
    const ringGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16);
    const ringMat = mechGlow(0xef4444, 0.8); // Glowing red indicator ring
    this.forceIndicatorRing = new THREE.Mesh(ringGeom, ringMat);
    this.forceIndicatorRing.position.y = 0.03;
    this.rotatingAssembly.add(this.forceIndicatorRing);
  }

  public updateCentripetal(rotationAngleRad: number, radiusM: number, forceN: number, springMarks: number): void {
    this.rotatingAssembly.rotation.y = rotationAngleRad;

    // Position of test bob along crossbar
    this.testBob.position.x = radiusM;

    // Centripetal arrow points from bob toward center (vector: -1, 0, 0 in bob local frame)
    const arrowLen = Math.min(0.12, forceN * 0.04);
    this.arrowCentripetal.setVector(new THREE.Vector3(-1, 0, 0), arrowLen);

    // Indicator sleeve height rises proportional to force/spring marks
    const indicatorY = 0.03 + Math.min(0.06, springMarks * 0.012);
    this.forceIndicatorRing.position.y = indicatorY;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
