/**
 * 3D Bench Mesh: Newton's 2nd Law Laboratory Apparatus
 * Incline board, spark ticker timer, wheeled cart with weights, pulley & hanging mass.
 */

import * as THREE from 'three';
import { mechWood, mechMetal, mechIron, mechGlow, createForceArrow, disposeObjectTree } from './mechKit.ts';

export class NewtonBenchMesh {
  public readonly group = new THREE.Group();

  // Sub-assemblies
  private boardPivot = new THREE.Group();
  private boardMesh: THREE.Mesh;
  private cartGroup = new THREE.Group();
  private pulleyGroup = new THREE.Group();
  private hangerGroup = new THREE.Group();
  private tickerGroup = new THREE.Group();
  private tapeMesh: THREE.Mesh;
  private tapeDotsGroup = new THREE.Group();

  // Force vector arrows
  private arrowGravity = createForceArrow(0xef4444); // Red: Gravity
  private arrowNormal = createForceArrow(0x38bdf8);  // Cyan: Normal
  private arrowTension = createForceArrow(0xfacc15); // Yellow: Tension
  private arrowFriction = createForceArrow(0xa855f7);// Purple: Friction

  private readonly TRACK_LENGTH = 1.2;
  private readonly TRACK_WIDTH = 0.16;

  constructor() {
    this.group.name = 'NewtonBenchMesh';

    // 1. Table Base Support Brackets
    const baseGeom = new THREE.BoxGeometry(1.4, 0.03, 0.3);
    const baseMat = mechIron(0x334155);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.set(0, -0.015, 0);
    this.group.add(baseMesh);

    // Left incline pivot stand
    const pivotStandGeom = new THREE.CylinderGeometry(0.018, 0.024, 0.12, 16);
    const pivotStand = new THREE.Mesh(pivotStandGeom, mechMetal(0x64748b));
    pivotStand.position.set(-this.TRACK_LENGTH * 0.5, 0.06, 0);
    this.group.add(pivotStand);

    // Board pivot located at left end
    this.boardPivot.position.set(-this.TRACK_LENGTH * 0.5, 0.12, 0);
    this.group.add(this.boardPivot);

    // 2. Track Board (Pivoting from left)
    const boardGeom = new THREE.BoxGeometry(this.TRACK_LENGTH, 0.024, this.TRACK_WIDTH);
    boardGeom.translate(this.TRACK_LENGTH * 0.5, 0, 0);
    this.boardMesh = new THREE.Mesh(boardGeom, mechWood(0xd97706));
    this.boardPivot.add(this.boardMesh);

    // Guide rails along sides
    const railGeom = new THREE.BoxGeometry(this.TRACK_LENGTH, 0.015, 0.008);
    railGeom.translate(this.TRACK_LENGTH * 0.5, 0.015, 0);
    const railMat = mechMetal(0xcbd5e1);
    const railLeft = new THREE.Mesh(railGeom, railMat);
    railLeft.position.z = -this.TRACK_WIDTH * 0.5 + 0.004;
    const railRight = new THREE.Mesh(railGeom, railMat);
    railRight.position.z = this.TRACK_WIDTH * 0.5 - 0.004;
    this.boardPivot.add(railLeft, railRight);

    // 3. Electric Spark Ticker Timer (mounted at left end of board)
    const tickerBoxGeom = new THREE.BoxGeometry(0.1, 0.06, 0.1);
    const tickerBoxMat = mechIron(0x166534); // Vintage lab green
    const tickerBox = new THREE.Mesh(tickerBoxGeom, tickerBoxMat);
    tickerBox.position.set(0.06, 0.042, 0);

    // Carbon disc
    const discGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.004, 24);
    const discMat = mechIron(0x0f172a);
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.position.set(0.06, 0.074, 0);

    // Vibrating needle needle arm
    const needleGeom = new THREE.BoxGeometry(0.04, 0.003, 0.003);
    const needleMat = mechMetal(0xe2e8f0);
    const needle = new THREE.Mesh(needleGeom, needleMat);
    needle.position.set(0.06, 0.08, 0);

    this.tickerGroup.add(tickerBox, disc, needle);
    this.boardPivot.add(this.tickerGroup);

    // 4. Wheeled Cart
    const cartBodyGeom = new THREE.BoxGeometry(0.18, 0.038, 0.11);
    const cartBodyMat = mechMetal(0x38bdf8, 0.7, 0.3); // High-visibility blue body
    const cartBody = new THREE.Mesh(cartBodyGeom, cartBodyMat);
    cartBody.position.y = 0.032;

    // 4 Wheels
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

    // Attach Force Arrows to Cart Center
    this.cartGroup.add(this.arrowGravity.group);
    this.cartGroup.add(this.arrowNormal.group);
    this.cartGroup.add(this.arrowTension.group);
    this.cartGroup.add(this.arrowFriction.group);
    this.boardPivot.add(this.cartGroup);

    // 5. Pulley Assembly at Right End of Track
    const pulleyWheelGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.008, 20);
    pulleyWheelGeom.rotateZ(Math.PI / 2);
    const pulleyWheelMat = mechMetal(0xeab308, 0.9, 0.1); // Brass wheel
    const pulleyWheel = new THREE.Mesh(pulleyWheelGeom, pulleyWheelMat);
    pulleyWheel.position.set(this.TRACK_LENGTH + 0.02, 0.03, 0);

    const pulleyBracketGeom = new THREE.BoxGeometry(0.03, 0.04, 0.02);
    const pulleyBracket = new THREE.Mesh(pulleyBracketGeom, mechIron(0x475569));
    pulleyBracket.position.set(this.TRACK_LENGTH, 0.015, 0);

    this.pulleyGroup.add(pulleyBracket, pulleyWheel);
    this.boardPivot.add(this.pulleyGroup);

    // 6. Hanging Hanger & Weights
    const hangerHookGeom = new THREE.CylinderGeometry(0.002, 0.002, 0.08, 8);
    const hangerDiscGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16);
    const hangerMat = mechMetal(0x94a3b8);
    const hangerHook = new THREE.Mesh(hangerHookGeom, hangerMat);
    const hangerDisc = new THREE.Mesh(hangerDiscGeom, hangerMat);
    hangerDisc.position.y = -0.04;
    this.hangerGroup.add(hangerHook, hangerDisc);
    this.hangerGroup.position.set(this.TRACK_LENGTH + 0.02, -0.1, 0);
    this.boardPivot.add(this.hangerGroup);

    // 7. Dynamic Paper Tape
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

    // Update Paper Tape span from ticker (x=0.1) to cart tail (x=clampedDist - 0.09)
    const tapeStart = 0.1;
    const tapeEnd = clampedDist - 0.09;
    const tapeLen = Math.max(0.001, tapeEnd - tapeStart);
    this.tapeMesh.position.x = tapeStart + tapeLen * 0.5;
    this.tapeMesh.scale.set(tapeLen, 1, 1);

    // Update hanging mass position (as cart moves forward, hook drops)
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
    const scale = 0.08; // Visual arrow scale
    this.arrowGravity.setVector(new THREE.Vector3(0, -1, 0), gravityN * scale);
    this.arrowNormal.setVector(new THREE.Vector3(0, 1, 0), normalN * scale);
    this.arrowTension.setVector(new THREE.Vector3(1, 0, 0), tensionN * scale);
    this.arrowFriction.setVector(new THREE.Vector3(-1, 0, 0), frictionN * scale);
  }

  public renderTickerDots(positionsM: number[]): void {
    // Clear old dots
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
