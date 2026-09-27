import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { disposeObjectTree } from './disposeObject.ts';
import { labGlow } from './labKit.ts';
import {
  DEFAULT_CHARGE_ELEVATION,
  type ElectrostaticTelemetry,
  type FieldLine,
  type PointCharge,
  type TestChargeState,
} from '../../physics/em/electrostatic.ts';

const MAX_SEGMENTS = 16000;
const MAX_CONES = 500;

// Exact colors matching charges
export const CHARGE_POS_COLOR = { r: 1.0, g: 0.133, b: 0.267 }; // #ff2244 (luminous coral red)
export const CHARGE_NEG_COLOR = { r: 0.0, g: 0.533, b: 1.0 };   // #0088ff (luminous electric blue)
export const PROBE_COLOR = { r: 0.984, g: 0.749, b: 0.141 };     // #fbbf24 (golden amber test charge)

export interface FieldBenchVisualState {
  charges: PointCharge[];
  lines: FieldLine[];
  telemetry: ElectrostaticTelemetry;
  selectedChargeId: string | null;
  showLines: boolean;
  showFlow?: boolean;
  testCharge?: TestChargeState | null;
}

export class FieldBenchMesh {
  public readonly group = new THREE.Group();
  public readonly platform: THREE.Mesh;
  public readonly chargesGroup = new THREE.Group();
  public readonly linesGroup = new THREE.Group();
  public readonly selectionRing: THREE.Mesh;

  // Active charges map (publicly accessible for high-speed hit detection)
  public readonly chargeMeshes = new Map<string, THREE.Group>();

  // Movable test charge (probe q0) group
  public readonly testChargeGroup = new THREE.Group();
  private readonly probeCoreMat: THREE.MeshStandardMaterial;
  private readonly probeHaloMat: THREE.MeshBasicMaterial;
  private readonly probeArrowGroup = new THREE.Group();
  private readonly probeArrowShaft: THREE.Mesh;
  private readonly probeArrowTip: THREE.Mesh;

  // Charge materials
  private readonly posCoreMat: THREE.MeshStandardMaterial;
  private readonly negCoreMat: THREE.MeshStandardMaterial;
  private readonly posHaloMat: THREE.MeshBasicMaterial;
  private readonly negHaloMat: THREE.MeshBasicMaterial;

  // Directional arrow cones
  private readonly arrowConeGeo: THREE.ConeGeometry;
  private readonly arrowConeMat: THREE.MeshBasicMaterial;
  private readonly arrowConesMesh: THREE.InstancedMesh;

  // Thick, high-visibility field lines (LineSegments2 screen-space ribbon)
  private readonly lineGeo = new LineSegmentsGeometry();
  private readonly lineMat: LineMaterial;
  private readonly linesMesh: LineSegments2;
  private readonly linePosArray = new Float32Array(MAX_SEGMENTS * 6);
  private readonly lineColArray = new Float32Array(MAX_SEGMENTS * 6);

  constructor() {
    this.group.name = 'FieldBench';

    // Base high-contrast luminous materials (no diffuse dullness)
    this.posCoreMat = labGlow(0xff2244, 1.4);
    this.negCoreMat = labGlow(0x0088ff, 1.4);
    this.posHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0.32,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.negHaloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.32,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Arrow cones (self-luminous, sharp museum styling)
    this.arrowConeGeo = new THREE.ConeGeometry(0.006, 0.020, 12);
    this.arrowConeGeo.rotateX(Math.PI / 2);
    this.arrowConeMat = new THREE.MeshBasicMaterial({
      toneMapped: false,
    });
    this.arrowConesMesh = new THREE.InstancedMesh(this.arrowConeGeo, this.arrowConeMat, MAX_CONES);
    this.arrowConesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowConesMesh.count = 0;

    // 1. Transparent interactive field plane for background clicking (expansive wide exploration zone)
    const platMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.platform = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), platMat);
    this.platform.name = 'FieldPlatform';
    this.group.add(this.platform);

    // 2. Selection ring (subtle glowing halo around active charge)
    const ringGeo = new THREE.RingGeometry(0.038, 0.046, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.visible = false;
    this.selectionRing.position.z = 0.002;
    this.group.add(this.selectionRing);

    // 3. Thick High-Visibility Field Lines (LineSegments2 ribbon, 3.2px screen width)
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    this.lineMat = new LineMaterial({
      linewidth: 3.2,
      vertexColors: true,
      alphaToCoverage: true,
      worldUnits: false,
      resolution: new THREE.Vector2(width, height),
    });
    this.linesMesh = new LineSegments2(this.lineGeo, this.lineMat);
    this.linesMesh.position.z = 0.0;
    this.linesGroup.add(this.linesMesh);
    this.linesGroup.add(this.arrowConesMesh);
    this.group.add(this.linesGroup);

    // 4. Source charges container
    this.group.add(this.chargesGroup);

    // 5. Test Charge (Probe q0) Assembly
    this.testChargeGroup.name = 'TestChargeProbe';
    this.probeCoreMat = labGlow(0xfbbf24, 1.5);
    this.probeHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const probeCore = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 24), this.probeCoreMat);
    probeCore.name = 'ProbeCore';
    this.testChargeGroup.add(probeCore);

    const probeHalo = new THREE.Mesh(new THREE.SphereGeometry(0.023, 20, 20), this.probeHaloMat);
    probeHalo.name = 'ProbeHalo';
    this.testChargeGroup.add(probeHalo);

    const probeRingGeo = new THREE.RingGeometry(0.026, 0.030, 32);
    const probeRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const probeRing = new THREE.Mesh(probeRingGeo, probeRingMat);
    probeRing.name = 'ProbeRing';
    this.testChargeGroup.add(probeRing);

    // Hit target for easy dragging
    const probeHitGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const probeHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const probeHit = new THREE.Mesh(probeHitGeo, probeHitMat);
    probeHit.name = 'ProbeHitTarget';
    this.testChargeGroup.add(probeHit);

    // 3D Vector Arrow for Electric Field E
    this.probeArrowGroup.name = 'ProbeArrowGroup';
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false });
    const shaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 12);
    this.probeArrowShaft = new THREE.Mesh(shaftGeo, arrowMat);
    this.probeArrowShaft.name = 'Shaft';
    this.probeArrowGroup.add(this.probeArrowShaft);

    const tipGeo = new THREE.ConeGeometry(0.009, 0.024, 12);
    this.probeArrowTip = new THREE.Mesh(tipGeo, arrowMat);
    this.probeArrowTip.name = 'Tip';
    this.probeArrowGroup.add(this.probeArrowTip);

    this.testChargeGroup.add(this.probeArrowGroup);

    this.testChargeGroup.visible = false;
    this.group.add(this.testChargeGroup);
  }

  /**
   * Synchronize visual representation with current simulation state
   */
  public sync(state: FieldBenchVisualState): void {
    // 1. Sync source charges meshes
    this.syncCharges(state.charges, state.selectedChargeId);

    // 2. Selection ring position
    if (state.selectedChargeId) {
      const selected = state.charges.find((c) => c.id === state.selectedChargeId);
      if (selected) {
        this.selectionRing.visible = true;
        this.selectionRing.position.set(selected.x, selected.y, selected.z ?? DEFAULT_CHARGE_ELEVATION);
        const ringScale = 0.024 + 0.008 * Math.cbrt(Math.abs(selected.q));
        this.selectionRing.scale.set(ringScale / 0.038, ringScale / 0.038, 1);
      } else {
        this.selectionRing.visible = false;
      }
    } else {
      this.selectionRing.visible = false;
    }

    // 3. Sync field lines and directional arrow cones
    this.linesGroup.visible = state.showLines;
    this.arrowConesMesh.visible = state.showLines;
    if (state.showLines) {
      this.syncFieldLines(state.lines);
    }

    // 4. Sync test charge (probe)
    this.syncTestCharge(state.testCharge ?? null);
  }

  /**
   * Synchronize test charge probe position, electric field vector arrow, and HUD badge
   */
  public syncTestCharge(probe: TestChargeState | null): void {
    if (!probe || !probe.visible) {
      this.testChargeGroup.visible = false;
      return;
    }

    this.testChargeGroup.visible = true;
    this.testChargeGroup.position.set(probe.x, probe.y, probe.z ?? DEFAULT_CHARGE_ELEVATION);

    // Update 3D vector arrow pointing along E
    const E = probe.fieldMagnitude;
    if (E > 1e-3) {
      const uX = probe.fieldVector.x / E;
      const uY = probe.fieldVector.y / E;
      const uZ = probe.fieldVector.z / E;
      const unitDir = new THREE.Vector3(uX, uY, uZ);
      this.probeArrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDir);

      const len = Math.max(0.06, Math.min(0.24, 0.05 + 0.16 * Math.sqrt(E / 5000)));
      const shaftLen = Math.max(0.02, len - 0.022);
      this.probeArrowShaft.scale.set(1, shaftLen, 1);
      this.probeArrowShaft.position.set(0, shaftLen * 0.5, 0);
      this.probeArrowTip.position.set(0, shaftLen + 0.011, 0);
      this.probeArrowGroup.visible = true;
    } else {
      this.probeArrowGroup.visible = false;
    }
  }

  /**
   * Advance gentle floating levitation breathing on charge heads (no particles)
   */
  public updateFlow(_dt?: number, _lines?: readonly FieldLine[], elapsed = 0): void {
    this.update(elapsed);
  }

  public update(elapsed = 0): void {
    if (this.chargeMeshes.size > 0 && elapsed > 0) {
      for (const [id, group] of this.chargeMeshes.entries()) {
        const head = group.getObjectByName('Head');
        const baseZ = (group.userData?.baseZ as number) ?? DEFAULT_CHARGE_ELEVATION;
        const phase = (id.charCodeAt(id.length - 1) * 1.7) % (Math.PI * 2);
        const floatZ = baseZ + 0.0035 * Math.sin(elapsed * 2.2 + phase);

        if (head) {
          head.position.z = floatZ;
        }
      }
    }
  }

  private syncCharges(charges: PointCharge[], _selectedId: string | null): void {
    const activeIds = new Set<string>();

    for (const c of charges) {
      activeIds.add(c.id);
      let group = this.chargeMeshes.get(c.id);
      const isPos = c.q >= 0;
      const radius = 0.022 + 0.008 * Math.cbrt(Math.abs(c.q));
      const baseZ = c.z ?? DEFAULT_CHARGE_ELEVATION;

      if (!group) {
        group = new THREE.Group();
        group.name = `Charge_${c.id}`;
        group.userData = { chargeId: c.id, baseZ, radius };

        // 1. Clean Floating Head (Core + Halo, NO letters or signs)
        const head = new THREE.Group();
        head.name = 'Head';
        head.position.set(0, 0, baseZ);

        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 28), isPos ? this.posCoreMat : this.negCoreMat);
        core.name = 'Core';
        head.add(core);

        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.36, 24, 24), isPos ? this.posHaloMat : this.negHaloMat);
        halo.name = 'Halo';
        head.add(halo);

        // Invisible expanded hit target for smooth mouse/touch interaction
        const hitGeo = new THREE.SphereGeometry(1.6, 12, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitTarget = new THREE.Mesh(hitGeo, hitMat);
        hitTarget.name = 'HitTarget';
        head.add(hitTarget);

        group.add(head);
        this.chargesGroup.add(group);
        this.chargeMeshes.set(c.id, group);
      }

      // Update position on bench plane
      group.position.set(c.x, c.y, 0);
      group.userData.baseZ = baseZ;
      group.userData.radius = radius;

      // Update Head
      const head = group.getObjectByName('Head') as THREE.Group;
      if (head) {
        head.position.set(0, 0, baseZ);
        head.scale.set(radius, radius, radius);

        const core = head.getObjectByName('Core') as THREE.Mesh;
        const halo = head.getObjectByName('Halo') as THREE.Mesh;
        if (core) core.material = isPos ? this.posCoreMat : this.negCoreMat;
        if (halo) halo.material = isPos ? this.posHaloMat : this.negHaloMat;
      }
    }

    // Remove deleted charges
    for (const [id, mesh] of this.chargeMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.chargesGroup.remove(mesh);
        disposeObjectTree(mesh);
        this.chargeMeshes.delete(id);
      }
    }
  }

  private syncFieldLines(lines: readonly FieldLine[]): void {
    if (typeof window !== 'undefined' && this.lineMat) {
      this.lineMat.resolution.set(window.innerWidth, window.innerHeight);
    }

    let segCount = 0;
    const pos = this.linePosArray;
    const col = this.lineColArray;

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const pts = line.points;
      const len = pts.length;
      if (len < 2) continue;

      const isBridging = Boolean(line.sourceChargeId && line.targetChargeId);
      const isPosOnly = Boolean(line.sourceChargeId && !line.targetChargeId);
      const isNegOnly = Boolean(!line.sourceChargeId && line.targetChargeId);

      for (let i = 0; i < len - 1; i++) {
        if (segCount >= MAX_SEGMENTS) break;

        const p0 = pts[i];
        const p1 = pts[i + 1];
        const idx = segCount * 6;

        pos[idx] = p0.x;
        pos[idx + 1] = p0.y;
        pos[idx + 2] = p0.z;

        pos[idx + 3] = p1.x;
        pos[idx + 4] = p1.y;
        pos[idx + 5] = p1.z;

        // Line color strictly matches charge color!
        const t0 = i / (len - 1);
        const t1 = (i + 1) / (len - 1);

        this.setSegmentColor(col, idx, t0, isBridging, isPosOnly, isNegOnly);
        this.setSegmentColor(col, idx + 3, t1, isBridging, isPosOnly, isNegOnly);

        segCount++;
      }
      if (segCount >= MAX_SEGMENTS) break;
    }

    if (segCount > 0) {
      this.lineGeo.setPositions(this.linePosArray.subarray(0, segCount * 6));
      this.lineGeo.setColors(this.lineColArray.subarray(0, segCount * 6));
      this.linesMesh.visible = true;
    } else {
      this.lineGeo.setPositions([]);
      this.linesMesh.visible = false;
    }

    // Update Directional Arrow Cones (Museum-grade disciplined placement)
    let coneCount = 0;
    const dummy = new THREE.Object3D();
    const unitZ = new THREE.Vector3(0, 0, 1);
    const tangent = new THREE.Vector3();
    const coneColor = new THREE.Color();

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const pts = line.points;
      const len = pts.length;
      if (len < 12) continue; // Skip very short line fragments near charge cores

      const isBridging = Boolean(line.sourceChargeId && line.targetChargeId);
      const isPosOnly = Boolean(line.sourceChargeId && !line.targetChargeId);
      const isNegOnly = Boolean(!line.sourceChargeId && line.targetChargeId);
      const sampleIndices: number[] = [];

      if (isBridging) {
        if (len < 26) {
          sampleIndices.push(Math.floor(len * 0.50));
        } else {
          sampleIndices.push(Math.floor(len * 0.35));
          sampleIndices.push(Math.floor(len * 0.68));
        }
      } else {
        // Line going to or coming from infinity: exactly ONE clean arrowhead mid-flight
        sampleIndices.push(Math.floor(len * 0.48));
      }

      for (const idx of sampleIndices) {
        if (coneCount >= MAX_CONES) break;
        if (idx <= 0 || idx >= len - 1) continue;

        const pPrev = pts[idx - 1];
        const pCurr = pts[idx];
        const pNext = pts[idx + 1];

        tangent.set(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
        if (tangent.lengthSq() < 1e-6) continue;
        tangent.normalize();

        dummy.position.set(pCurr.x, pCurr.y, pCurr.z);
        dummy.quaternion.setFromUnitVectors(unitZ, tangent);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        this.arrowConesMesh.setMatrixAt(coneCount, dummy.matrix);

        // Arrow cone color strictly matches the streamline color
        const t = idx / (len - 1);
        this.getSampleColor(t, isBridging, isPosOnly, isNegOnly, coneColor);
        this.arrowConesMesh.setColorAt(coneCount, coneColor);

        coneCount++;
      }
      if (coneCount >= MAX_CONES) break;
    }

    this.arrowConesMesh.count = coneCount;
    this.arrowConesMesh.instanceMatrix.needsUpdate = true;
    if (this.arrowConesMesh.instanceColor) {
      this.arrowConesMesh.instanceColor.needsUpdate = true;
    }
  }

  private setSegmentColor(
    targetArray: Float32Array,
    offset: number,
    t: number,
    isBridging: boolean,
    isPosOnly: boolean,
    _isNegOnly: boolean,
  ): void {
    if (isPosOnly) {
      targetArray[offset] = CHARGE_POS_COLOR.r;
      targetArray[offset + 1] = CHARGE_POS_COLOR.g;
      targetArray[offset + 2] = CHARGE_POS_COLOR.b;
    } else if (isBridging) {
      targetArray[offset] = CHARGE_POS_COLOR.r + (CHARGE_NEG_COLOR.r - CHARGE_POS_COLOR.r) * t;
      targetArray[offset + 1] = CHARGE_POS_COLOR.g + (CHARGE_NEG_COLOR.g - CHARGE_POS_COLOR.g) * t;
      targetArray[offset + 2] = CHARGE_POS_COLOR.b + (CHARGE_NEG_COLOR.b - CHARGE_POS_COLOR.b) * t;
    } else {
      targetArray[offset] = CHARGE_NEG_COLOR.r;
      targetArray[offset + 1] = CHARGE_NEG_COLOR.g;
      targetArray[offset + 2] = CHARGE_NEG_COLOR.b;
    }
  }

  private getSampleColor(
    t: number,
    isBridging: boolean,
    isPosOnly: boolean,
    _isNegOnly: boolean,
    outColor: THREE.Color,
  ): void {
    if (isPosOnly) {
      outColor.setRGB(CHARGE_POS_COLOR.r, CHARGE_POS_COLOR.g, CHARGE_POS_COLOR.b);
    } else if (isBridging) {
      outColor.setRGB(
        CHARGE_POS_COLOR.r + (CHARGE_NEG_COLOR.r - CHARGE_POS_COLOR.r) * t,
        CHARGE_POS_COLOR.g + (CHARGE_NEG_COLOR.g - CHARGE_POS_COLOR.g) * t,
        CHARGE_POS_COLOR.b + (CHARGE_NEG_COLOR.b - CHARGE_POS_COLOR.b) * t,
      );
    } else {
      outColor.setRGB(CHARGE_NEG_COLOR.r, CHARGE_NEG_COLOR.g, CHARGE_NEG_COLOR.b);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
    this.lineGeo.dispose();
    this.lineMat.dispose();
    this.arrowConeGeo.dispose();
    this.arrowConeMat.dispose();
    this.arrowConesMesh.dispose();
    this.posHaloMat.dispose();
    this.negHaloMat.dispose();
    this.probeCoreMat.dispose();
    this.probeHaloMat.dispose();
    this.chargesGroup.clear();
    this.chargeMeshes.clear();
  }
}
