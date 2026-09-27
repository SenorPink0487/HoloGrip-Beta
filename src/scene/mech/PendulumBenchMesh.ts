/**
 * 3D Bench Mesh: Simple Pendulum & Gravitational Acceleration Rig
 * Cast-iron stand, suspension clamp, protractor dial, dynamic string line, and laser photogate.
 */

import * as THREE from 'three';
import { mechMetal, mechIron, mechGlow, disposeObjectTree } from './mechKit.ts';

export class PendulumBenchMesh {
  public readonly group = new THREE.Group();

  private bobMesh: THREE.Mesh;
  private stringLine: THREE.Line;
  private stringGeom: THREE.BufferGeometry;
  private laserBeam: THREE.Mesh;

  private readonly SUSPENSION_POINT = new THREE.Vector3(0, 0.9, 0);

  constructor() {
    this.group.name = 'PendulumBenchMesh';

    // 1. Triangular Cast-Iron Base
    const baseShape = new THREE.Shape();
    baseShape.moveTo(-0.16, -0.14);
    baseShape.lineTo(0.16, -0.14);
    baseShape.lineTo(0, 0.18);
    baseShape.closePath();

    const baseGeom = new THREE.ExtrudeGeometry(baseShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.005 });
    baseGeom.rotateX(-Math.PI / 2);
    const baseMat = mechIron(0x1e293b, 0.4, 0.8);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    this.group.add(baseMesh);

    // 2. Vertical Steel Rod
    const rodGeom = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 16);
    rodGeom.translate(-0.12, 0.5, 0);
    const rodMat = mechMetal(0xcbd5e1, 0.9, 0.2);
    const rodMesh = new THREE.Mesh(rodGeom, rodMat);
    this.group.add(rodMesh);

    // 3. Horizontal Support Arm & Dual-Clamp
    const armGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 12);
    armGeom.rotateZ(Math.PI / 2);
    armGeom.translate(-0.06, this.SUSPENSION_POINT.y, 0);
    const armMesh = new THREE.Mesh(armGeom, rodMat);
    this.group.add(armMesh);

    const clampGeom = new THREE.BoxGeometry(0.024, 0.024, 0.024);
    const clampMesh = new THREE.Mesh(clampGeom, mechIron(0x334155));
    clampMesh.position.copy(this.SUSPENSION_POINT);
    this.group.add(clampMesh);

    // 4. Protractor Angle Dial Arc (0 to 15 degrees)
    const arcGeom = new THREE.RingGeometry(0.12, 0.15, 32, 1, Math.PI * 1.35, Math.PI * 0.3);
    const arcMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide });
    const arcMesh = new THREE.Mesh(arcGeom, arcMat);
    arcMesh.position.set(this.SUSPENSION_POINT.x, this.SUSPENSION_POINT.y - 0.02, -0.015);
    this.group.add(arcMesh);

    // 5. Dynamic Suspension String
    this.stringGeom = new THREE.BufferGeometry();
    const stringPositions = new Float32Array([
      this.SUSPENSION_POINT.x, this.SUSPENSION_POINT.y, this.SUSPENSION_POINT.z,
      this.SUSPENSION_POINT.x, this.SUSPENSION_POINT.y - 0.7, this.SUSPENSION_POINT.z,
    ]);
    this.stringGeom.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
    const stringMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0, linewidth: 2 });
    this.stringLine = new THREE.Line(this.stringGeom, stringMat);
    this.group.add(this.stringLine);

    // 6. Spherical Bob
    const bobGeom = new THREE.SphereGeometry(0.016, 24, 24);
    const bobMat = mechMetal(0xef4444, 0.7, 0.2); // Red-orange painted precision steel
    this.bobMesh = new THREE.Mesh(bobGeom, bobMat);
    this.bobMesh.position.set(this.SUSPENSION_POINT.x, this.SUSPENSION_POINT.y - 0.7, this.SUSPENSION_POINT.z);
    this.group.add(this.bobMesh);

    // 7. Laser Photogate at Equilibrium Position
    const gateHousingGeom = new THREE.BoxGeometry(0.08, 0.04, 0.04);
    const gateHousing = new THREE.Mesh(gateHousingGeom, mechIron(0x0f172a));
    gateHousing.position.set(0, 0.15, 0);
    this.group.add(gateHousing);

    // Laser Beam across photogate slot
    const laserGeom = new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 8);
    laserGeom.rotateX(Math.PI / 2);
    const laserMat = mechGlow(0xef4444, 0.9);
    laserMat.toneMapped = false;
    this.laserBeam = new THREE.Mesh(laserGeom, laserMat);
    this.laserBeam.position.set(0, 0.18, 0);
    this.group.add(this.laserBeam);
  }

  public updatePendulum(angleRad: number, effectiveLengthM: number, bobDiameterM: number): void {
    const bobX = this.SUSPENSION_POINT.x + effectiveLengthM * Math.sin(angleRad);
    const bobY = this.SUSPENSION_POINT.y - effectiveLengthM * Math.cos(angleRad);
    const bobZ = this.SUSPENSION_POINT.z;

    this.bobMesh.position.set(bobX, bobY, bobZ);

    const radius = Math.max(0.005, bobDiameterM * 0.5);
    this.bobMesh.scale.set(radius / 0.016, radius / 0.016, radius / 0.016);

    const posAttr = this.stringGeom.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, this.SUSPENSION_POINT.x, this.SUSPENSION_POINT.y, this.SUSPENSION_POINT.z);
    posAttr.setXYZ(1, bobX, bobY, bobZ);
    posAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
