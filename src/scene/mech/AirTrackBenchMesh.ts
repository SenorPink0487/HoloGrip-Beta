/**
 * 3D Bench Mesh: Precision Air Track Collision System
 * Triangular rail, two gliders with shutters, buffer springs, and dual U-photogates.
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

    // 1. Triangular Air Track Extrusion
    // In cross section, air track is an inverted V shape (triangular top ridge)
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

    const trackMat = mechMetal(0xe2e8f0, 0.9, 0.15); // Brushed aluminum
    const trackMesh = new THREE.Mesh(trackGeom, trackMat);
    this.group.add(trackMesh);

    // Track Base Stands (Leveling feet at left and right)
    const legGeom = new THREE.CylinderGeometry(0.012, 0.018, 0.08, 16);
    const legMat = mechIron(0x334155);
    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-this.TRACK_LENGTH * 0.4, 0.04, 0);
    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(this.TRACK_LENGTH * 0.4, 0.04, 0);
    this.group.add(leg1, leg2);

    // 2. Photogate A & B (U-shaped sensor brackets)
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

      // Indicator LED
      const ledGeom = new THREE.SphereGeometry(0.006, 12, 12);
      const ledMat = mechGlow(0x22c55e, 0.2); // Green idle
      const ledMesh = new THREE.Mesh(ledGeom, ledMat);
      ledMesh.position.set(0, 0.126, 0);
      pGroup.add(ledMesh);

      this.group.add(pGroup);
      return ledMesh;
    };

    this.gateALed = createPhotogate(this.gateAPosX);
    this.gateBLed = createPhotogate(this.gateBPosX);

    // 3. Glider Carts (Inverted V saddles riding on the rail)
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

      // Shutter Flag on top
      const flagGeom = new THREE.BoxGeometry(0.015, 0.04, 0.002);
      const flagMat = mechIron(0x0f172a);
      const flag = new THREE.Mesh(flagGeom, flagMat);
      flag.position.set(0, 0.155, 0);
      gGroup.add(flag);

      // End bumpers (Spring loop)
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

    this.car1 = createGlider(0x38bdf8, 'Glider1'); // Cyan
    this.car2 = createGlider(0xfacc15, 'Glider2'); // Gold

    this.setGliderPositions(-0.4, 0.0);
  }

  public setGliderPositions(x1: number, x2: number): void {
    this.car1.position.x = x1;
    this.car2.position.x = x2;

    // Check if glider flags are inside photogates
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
