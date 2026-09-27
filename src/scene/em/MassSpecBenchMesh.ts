import * as THREE from 'three';
import { MASS_STAGE, trajectoryPoint } from '../../physics/em/massSpec.ts';
import { disposeObjectTree } from './disposeObject.ts';
import {
  anodizedAluminum,
  enameledCopper,
  labGlow,
  labMetal,
  opticalQuartz,
  outlined,
  plateTexture,
  polishedGold,
  ReadoutPanel,
  softDiscTexture,
} from './labKit.ts';

import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface IonVisual {
  visible: boolean;
  x: number;
  y: number;
  color: number;
  opacity: number;
  spotVisible: boolean;
  spotY: number;
  magVisible: boolean;
  magX: number;
}

export interface MassSpecVisual {
  jawOpening: number;
  accelVoltage: number;
  plateVoltage: number;
  analyzerBz: number;
  probeX: number;
  ions: IonVisual[];
}

export interface MassSpecBenchMeshOptions {
  computeBridge?: ComputeBridge;
}

export class MassSpecBenchMesh {
  public readonly group = new THREE.Group();
  public readonly sourceGroup = new THREE.Group();
  public readonly jawGroup = new THREE.Group();
  public readonly magnetGroup = new THREE.Group();
  public readonly accelKnob = new THREE.Group();
  public readonly selectorKnob = new THREE.Group();
  public readonly probeGroup = new THREE.Group();
  public computeBridge?: ComputeBridge;

  private readonly ionMeshes: THREE.Mesh[] = [];
  private readonly halos: THREE.Sprite[] = [];
  private readonly spotMeshes: THREE.Mesh[] = [];
  private readonly magMeshes: THREE.Mesh[] = [];
  private readonly trails: THREE.BufferAttribute[] = [];
  private readonly trailLines: THREE.Line[] = [];
  private readonly trailHist: Array<Array<[number, number]>> = [[], [], [], []];
  private readonly upperJaw: THREE.Mesh;
  private readonly lowerJaw: THREE.Mesh;
  private readonly nearPole: THREE.Mesh;
  private readonly farPole: THREE.Mesh;
  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly blueMat: THREE.MeshStandardMaterial;
  private readonly chassisMat: THREE.MeshStandardMaterial;
  private readonly frontBezelMat: THREE.MeshStandardMaterial;
  private readonly aluminumMat: THREE.MeshStandardMaterial;
  private readonly goldMat: THREE.MeshStandardMaterial;
  private readonly copperMat: THREE.MeshStandardMaterial;
  private readonly readout: ReadoutPanel;

  constructor(options: MassSpecBenchMeshOptions = {}) {
    this.computeBridge = options.computeBridge;
    this.group.name = 'MassSpecBench';
    this.redMat = labGlow(0xef4444, 0.45);
    this.blueMat = labGlow(0x2563eb, 0.45);
    this.chassisMat = labMetal(0x475569, 0.6, 0.32);
    this.frontBezelMat = anodizedAluminum(0x94a3b8, 0.25);
    this.aluminumMat = anodizedAluminum(0xcbd5e1, 0.22);
    this.goldMat = polishedGold(0xd4af37);
    this.copperMat = enameledCopper(0xb45309);

    // Beveled Optical Knife-Edge Slit Jaws
    const jawGeo = new THREE.BoxGeometry(0.024, 0.07, 0.045);
    const jawMat = anodizedAluminum(0xe2e8f0, 0.2);
    this.upperJaw = new THREE.Mesh(jawGeo, jawMat);
    this.lowerJaw = new THREE.Mesh(jawGeo, jawMat);

    // Proportionate Magnetic Analyzer Pole Shoes
    const poleGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.018, 36);
    this.nearPole = new THREE.Mesh(poleGeo, this.redMat);
    this.farPole = new THREE.Mesh(poleGeo, this.blueMat);

    this.readout = new ReadoutPanel(0.22, 0.08);

    this.build();
  }

  public sync(state: MassSpecVisual): void {
    this.jawGroup.userData.jawOpening = state.jawOpening;
    const half = 0.012 + state.jawOpening * 0.03;
    this.upperJaw.position.y = MASS_STAGE.entranceY + half + 0.038;
    this.lowerJaw.position.y = MASS_STAGE.entranceY - half - 0.038;

    this.accelKnob.rotation.z = ((state.accelVoltage - 200) / 4800) * Math.PI * 2;
    this.selectorKnob.rotation.z = (state.plateVoltage / 800) * Math.PI * 2;

    const nearIsNorth = state.analyzerBz < 0;
    this.nearPole.material = nearIsNorth ? this.redMat : this.blueMat;
    this.farPole.material = nearIsNorth ? this.blueMat : this.redMat;

    this.probeGroup.position.x = state.probeX;

    for (let i = 0; i < this.ionMeshes.length; i++) {
      const ion = state.ions[i];
      const mesh = this.ionMeshes[i];
      const halo = this.halos[i];
      const spot = this.spotMeshes[i];
      const mag = this.magMeshes[i];
      const hist = this.trailHist[i];

      if (!ion || !ion.visible) {
        mesh.visible = false;
        halo.visible = false;
        spot.visible = false;
        mag.visible = false;
        hist.length = 0;
        this.trailLines[i].geometry.setDrawRange(0, 0);
        continue;
      }

      mesh.visible = true;
      mesh.position.set(ion.x, ion.y, 0.05);

      halo.visible = true;
      halo.position.set(ion.x, ion.y, 0.055);
      halo.scale.setScalar(0.042 + 0.02 * ion.opacity);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(ion.color);
      mat.emissive.setHex(ion.color);
      mat.opacity = Math.max(0.35, ion.opacity);

      (halo.material as THREE.SpriteMaterial).color.setHex(ion.color);
      (halo.material as THREE.SpriteMaterial).opacity = ion.opacity;

      spot.visible = ion.spotVisible;
      spot.position.set(MASS_STAGE.entranceX - 0.012, ion.spotY, 0.055);
      (spot.material as THREE.MeshStandardMaterial).color.setHex(ion.color);
      (spot.material as THREE.MeshStandardMaterial).emissive.setHex(ion.color);

      mag.visible = ion.magVisible;
      mag.position.set(ion.magX, 0.66, 0.05);
      (mag.material as THREE.MeshStandardMaterial).color.setHex(ion.color);
      (mag.material as THREE.MeshStandardMaterial).emissive.setHex(ion.color);

      hist.push([ion.x, ion.y]);
      if (hist.length > 20) hist.shift();

      const attr = this.trails[i];
      hist.forEach((point, index) => attr.setXYZ(index, point[0], point[1], 0.048));
      attr.needsUpdate = true;
      this.trailLines[i].geometry.setDrawRange(0, hist.length);
      (this.trailLines[i].material as THREE.LineBasicMaterial).color.setHex(ion.color);
    }

    if (this.readout.mesh.visible) {
      this.readout.write([
        { text: `${Math.round(state.accelVoltage)} V`, color: '#fbbf24', size: 56 },
        { text: `B ${state.analyzerBz.toFixed(2)} T`, color: '#38bdf8', size: 40 },
        { text: state.jawOpening > 0.92 ? '狭缝全开' : `狭缝 ${(state.jawOpening * 100).toFixed(0)}%`, color: '#e2e8f0', size: 30 },
      ]);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }

  private build(): void {
    // 1. Sleek Central Stand Base Pedestals (No ugly rectangular table slab)
    const standLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.085, 0.018, 32), this.chassisMat);
    standLeft.position.set(-0.28, 0.009, 0);
    const standRight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.018, 32), this.chassisMat);
    standRight.position.set(0.18, 0.009, 0);
    this.group.add(standLeft, standRight, outlined(standLeft, 0x64748b, 0.3), outlined(standRight, 0x64748b, 0.3));

    // Support pillars connecting stands to apparatus
    const pillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.26, 16), this.aluminumMat);
    pillar1.position.set(-0.28, 0.14, 0);
    const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.26, 16), this.aluminumMat);
    pillar2.position.set(0.18, 0.14, 0);
    this.group.add(pillar1, pillar2);

    // 2. 180° Semicircular Flight Vacuum Chamber & Quartz Observation Lid
    this.buildVacuumChamber();

    // 3. Stage 1: UHV Electron-Bombardment Ionization Source & Accelerating Grids
    this.buildIonSource();

    // 4. Stage 2: Orthogonal Crossed-Field Wien Velocity Selector (E x B)
    this.buildVelocitySelector();

    // 5. Stage 3: Micrometer-Driven Precision Slit Collimator
    this.buildCollimatorJaws();

    // 6. Stage 4: Semicircular C-Yoke Electromagnet Analyzer
    this.buildAnalyzerMagnet();

    // 7. Stage 5: MCP Focal-Plane Detector Array
    this.buildDetectorPlate();

    // 8. Auxiliary High-Vacuum Pumping System & Turbomolecular Flange
    this.buildVacuumAuxiliary();

    // 9. Integrated Front Power & Signal Control Deck
    this.buildControlDeck();

    // 10. Dynamic Trajectory Visuals, Halos, & Probe
    this.buildIonVisuals();

    // Hide redundant 3D floating canvas readout
    this.readout.mesh.visible = false;
    this.group.add(this.readout.mesh);
  }

  private buildVacuumChamber(): void {
    // Semicircular non-magnetic stainless steel flight tube (Curves from entrance along semi-circle)
    const chamberToroid = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.012, 12, 36, Math.PI),
      this.aluminumMat,
    );
    chamberToroid.position.set(MASS_STAGE.entranceX, MASS_STAGE.entranceY + 0.155, 0);
    chamberToroid.rotation.z = -Math.PI / 2;

    const reverseToroid = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.012, 12, 36, Math.PI),
      this.aluminumMat,
    );
    reverseToroid.position.set(MASS_STAGE.entranceX, MASS_STAGE.entranceY - 0.155, 0);
    reverseToroid.rotation.z = Math.PI / 2;

    this.group.add(chamberToroid, reverseToroid);

    // Reference orbit lines (Forward +Y and Reverse -Y guidance)
    this.addArc(1, 0x38bdf8, 0.35);
    this.addArc(-1, 0x64748b, 0.20);
  }

  private buildIonSource(): void {
    this.sourceGroup.name = 'IonSource';
    this.sourceGroup.position.set(MASS_STAGE.sourceX, MASS_STAGE.entranceY, 0);

    // Stainless Steel UHV Ionization Cylinder
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.065, 24), this.chassisMat);
    chamber.rotation.z = Math.PI / 2;

    // Optical quartz inspection viewport showing heated plasma glow
    const window = new THREE.Mesh(new THREE.SphereGeometry(0.024, 24, 18), opticalQuartz(0x38bdf8, 0.35));

    // Hot tungsten electron emission filament
    const filament = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 6, 16), labGlow(0xf97316, 0.95));
    filament.rotation.y = Math.PI / 2;

    // Ceramic high-voltage insulation feedthrough headers on top
    for (const y of [0.030, 0.042]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.014, 12), labMetal(0xf8fafc, 0.1, 0.9));
      insulator.position.set(0, y, 0);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 12), this.goldMat);
      cap.position.set(0, y + 0.008, 0);
      this.sourceGroup.add(insulator, cap);
    }

    // Collimation accelerating nozzle flange
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.010, 0.024, 16), this.aluminumMat);
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.x = 0.040;

    this.sourceGroup.add(chamber, window, filament, nozzle);
    this.group.add(this.sourceGroup);

    // Internal Plasma Glow Point Light
    const glow = new THREE.PointLight(0x38bdf8, 0.5, 0.35);
    glow.position.copy(this.sourceGroup.position);
    this.group.add(glow);
  }

  private buildVelocitySelector(): void {
    const selectorGroup = new THREE.Group();
    selectorGroup.position.set((MASS_STAGE.selector0 + MASS_STAGE.selector1) / 2, MASS_STAGE.entranceY, 0);

    // Parallel Electrostatic Deflection Plates (+V top, -V bottom)
    const plateGeo = new THREE.BoxGeometry(0.14, 0.006, 0.040);
    const upperPlate = new THREE.Mesh(plateGeo, this.goldMat);
    const lowerPlate = new THREE.Mesh(plateGeo, this.goldMat);
    upperPlate.position.set(0, 0.028, 0);
    lowerPlate.position.set(0, -0.028, 0);

    // High-voltage Ceramic Standoff Insulators
    const ceramicMat = labMetal(0xf8fafc, 0.05, 0.85);
    for (const x of [-0.05, 0.05]) {
      for (const y of [0.028, -0.028]) {
        const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 10), ceramicMat);
        standoff.position.set(x, y, 0);
        selectorGroup.add(standoff);
      }
    }

    // Lateral Permalloy Magnetic Pole Pieces (Producing orthogonal Bz)
    const poleCheek = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.052, 0.006), this.frontBezelMat);
    poleCheek.position.set(0, 0, 0.024);
    const poleCheekBack = poleCheek.clone();
    poleCheekBack.position.set(0, 0, -0.024);

    selectorGroup.add(upperPlate, lowerPlate, poleCheek, poleCheekBack);
    this.group.add(selectorGroup);
  }

  private buildCollimatorJaws(): void {
    this.jawGroup.name = 'SlitJaws';
    this.jawGroup.position.x = MASS_STAGE.slitX;

    // Micrometer Adjustment Drum & Stainless Steel Lead Screw
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 12), this.aluminumMat);
    screw.position.set(0, MASS_STAGE.entranceY, 0.025);

    const micrometerDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.024, 20), this.goldMat);
    micrometerDrum.position.set(0, MASS_STAGE.entranceY + 0.085, 0.025);

    this.jawGroup.add(this.upperJaw, this.lowerJaw, screw, micrometerDrum);
    this.group.add(this.jawGroup);
  }

  private buildAnalyzerMagnet(): void {
    this.magnetGroup.name = 'AnalyzerMagnet';
    this.nearPole.rotation.x = Math.PI / 2;
    this.farPole.rotation.x = Math.PI / 2;
    this.nearPole.position.set(0.18, MASS_STAGE.entranceY + 0.08, 0.08);
    this.farPole.position.set(0.18, MASS_STAGE.entranceY + 0.08, -0.06);

    // Copper Excitation Windings
    const coilGeo = new THREE.TorusGeometry(0.062, 0.010, 10, 32);
    const frontCoil = new THREE.Mesh(coilGeo, this.copperMat);
    const backCoil = new THREE.Mesh(coilGeo, this.copperMat);
    frontCoil.position.set(0.18, MASS_STAGE.entranceY + 0.08, 0.05);
    backCoil.position.set(0.18, MASS_STAGE.entranceY + 0.08, -0.035);

    // C-Frame Yoke completing the magnetic circuit (Sleek and proportionate)
    const yokeBack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.15), this.chassisMat);
    yokeBack.position.set(0.28, MASS_STAGE.entranceY + 0.08, 0.01);
    const yokeTop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.15), this.chassisMat);
    yokeTop.position.set(0.22, MASS_STAGE.entranceY + 0.165, 0.01);
    const yokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.15), this.chassisMat);
    yokeBottom.position.set(0.22, MASS_STAGE.entranceY - 0.015, 0.01);

    this.magnetGroup.add(this.nearPole, this.farPole, frontCoil, backCoil, yokeBack, yokeTop, yokeBottom);
    this.group.add(this.magnetGroup);
  }

  private buildDetectorPlate(): void {
    // Microchannel Plate (MCP) & Phosphor Focal Plane Detector
    const detector = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, MASS_STAGE.plateReach * 2, 0.035),
      new THREE.MeshStandardMaterial({ map: plateTexture(), metalness: 0.45, roughness: 0.45 }),
    );
    detector.position.set(MASS_STAGE.entranceX - 0.018, MASS_STAGE.entranceY, 0);
    detector.name = 'DetectorPlate';
    this.group.add(detector, outlined(detector, 0x38bdf8, 0.4));
  }

  private buildVacuumAuxiliary(): void {
    // Turbomolecular High-Vacuum Pump Port & Stainless Steel Bellows Flange
    const pumpGroup = new THREE.Group();
    pumpGroup.position.set(0.06, 0.12, -0.06);

    const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.10, 24), this.chassisMat);
    const bellows = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.004, 8, 24), this.aluminumMat);
    bellows.rotation.x = Math.PI / 2;
    bellows.position.y = 0.038;

    pumpGroup.add(pumpBody, bellows);
    this.group.add(pumpGroup);
  }

  private buildControlDeck(): void {
    // Accelerating Voltage Dial & Selector Voltage Dial (Mounted directly on left stand base)
    this.buildKnob(this.accelKnob, MASS_STAGE.sourceX + 0.06, 0xf59e0b);
    this.buildKnob(this.selectorKnob, -0.22, 0x38bdf8);
    this.accelKnob.name = 'AccelKnob';
    this.selectorKnob.name = 'SelectorKnob';
    this.group.add(this.accelKnob, this.selectorKnob);
  }

  private buildKnob(group: THREE.Group, x: number, color: number): void {
    group.position.set(x, 0.035, 0.10);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.016, 24), labGlow(color, 0.4));
    disc.rotation.x = Math.PI / 3; // Angled up towards camera

    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.005, 24), this.chassisMat);
    skirt.rotation.x = Math.PI / 3;
    skirt.position.z = -0.006;

    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.012, 0.0035), labMetal(0xf8fafc, 0.2, 0.4));
    mark.position.set(0.010, 0, 0.008);

    group.add(skirt, disc, mark);
  }

  private buildIonVisuals(): void {
    const disc = softDiscTexture();

    for (let i = 0; i < 4; i++) {
      const ionMat = labGlow(0xffffff, 0.85);
      ionMat.transparent = true;

      const ion = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), ionMat);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: disc,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 10), ionMat.clone());
      const mag = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), ionMat.clone());

      const trailGeo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(20 * 3), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      trailGeo.setAttribute('position', attr);
      trailGeo.setDrawRange(0, 20);

      const trail = new THREE.Line(
        trailGeo,
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      trail.frustumCulled = false;
      trail.geometry.setDrawRange(0, 0);

      this.group.add(ion, halo, spot, mag, trail);
      this.trailLines.push(trail);
      this.ionMeshes.push(ion);
      this.halos.push(halo);
      this.spotMeshes.push(spot);
      this.magMeshes.push(mag);
      this.trails.push(attr);
    }

    // Draggable Magnetic Field Probe
    this.probeGroup.name = 'FieldProbe';
    this.probeGroup.position.set(0, MASS_STAGE.entranceY, 0.10);

    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 12), this.aluminumMat);
    wand.rotation.z = Math.PI / 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), labGlow(0x22d3ee, 0.85));
    bead.position.x = 0.040;

    this.probeGroup.add(wand, bead);
    this.group.add(this.probeGroup);

    // Central ion beam alignment guide line
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0024, 0.0024, MASS_STAGE.entranceX - MASS_STAGE.sourceX - 0.06, 12),
      labGlow(0x94a3b8, 0.3),
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set((MASS_STAGE.sourceX + MASS_STAGE.entranceX) / 2, MASS_STAGE.entranceY, 0.015);
    this.group.add(beam);
  }

  private addArc(side: 1 | -1, color: number, opacity: number): void {
    const points: THREE.Vector3[] = [];
    const radius = MASS_STAGE.plateReach / 2;
    for (let i = 0; i <= 40; i++) {
      const theta = (Math.PI * i) / 40;
      const point = trajectoryPoint(radius, theta, side);
      points.push(new THREE.Vector3(MASS_STAGE.entranceX + point.x, MASS_STAGE.entranceY + point.y, 0.015));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    line.frustumCulled = false;
    this.group.add(line);
  }
}
