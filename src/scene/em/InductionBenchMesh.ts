import * as THREE from 'three';
import { disposeObjectTree } from './disposeObject.ts';
import {
  anodizedAluminum,
  createJumperLead,
  dialTexture,
  enameledCopper,
  labGlow,
  labMetal,
  letterTexture,
  opticalQuartz,
  outlined,
  polishedGold,
  ReadoutPanel,
} from './labKit.ts';

import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

/** Coil center height. Axial offset 0 puts the magnet in the middle of the coil. */
export const COIL_AXIS_Y = 0.3;
const FULL_SCALE_AMP = 0.08;

export interface InductionVisual {
  axial: number;
  poleSign: 1 | -1;
  probeAxial: number;
  turns: number;
  currentAmp: number;
  magnetField: number;
  inducedField: number;
}

export interface InductionBenchMeshOptions {
  computeBridge?: ComputeBridge;
}

export class InductionBenchMesh {
  public readonly group = new THREE.Group();
  public readonly magnetGroup = new THREE.Group();
  public readonly coilGroup = new THREE.Group();
  public readonly probeGroup = new THREE.Group();
  public readonly needlePivot = new THREE.Group();
  public readonly driveLever = new THREE.Group();
  public readonly flowArrow = new THREE.Group();
  public computeBridge?: ComputeBridge;
  public topCap!: THREE.Mesh;
  public bottomCap!: THREE.Mesh;

  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly blueMat: THREE.MeshStandardMaterial;
  private readonly copperMat: THREE.MeshStandardMaterial;
  private readonly chassisMat: THREE.MeshStandardMaterial;
  private readonly aluminumMat: THREE.MeshStandardMaterial;
  private readonly goldMat: THREE.MeshStandardMaterial;
  private readonly chromeMat: THREE.MeshStandardMaterial;
  private readonly rings: THREE.Mesh[] = [];
  private readonly beads: THREE.Mesh[] = [];
  private readonly magnetArrow: THREE.Group;
  private readonly inducedArrow: THREE.Group;
  private readonly fieldPos: THREE.BufferAttribute[] = [];
  private readonly fieldLayout: Array<{ plane: 'xy' | 'xz'; sign: number; k: number }> = [];
  private readonly readout: ReadoutPanel;
  private readonly nPlate: THREE.Mesh;
  private readonly sPlate: THREE.Mesh;
  private lastMagnetY = -9999;

  constructor(options: InductionBenchMeshOptions = {}) {
    this.computeBridge = options.computeBridge;
    this.group.name = 'InductionBench';

    this.redMat = labGlow(0xef4444, 0.65);
    this.blueMat = labGlow(0x2563eb, 0.65);
    this.copperMat = enameledCopper(0xc25e00);
    this.chassisMat = labMetal(0x1e293b, 0.78, 0.28);
    this.aluminumMat = anodizedAluminum(0x94a3b8, 0.22);
    this.goldMat = polishedGold(0xd4af37);
    this.chromeMat = labMetal(0xf1f5f9, 0.95, 0.12);

    this.magnetArrow = this.makeArrow(0x22d3ee);
    this.inducedArrow = this.makeArrow(0xfbbf24);
    this.readout = new ReadoutPanel(0.18, 0.07);

    const nMat = new THREE.MeshBasicMaterial({ map: letterTexture('N', '#fecaca'), toneMapped: false });
    const sMat = new THREE.MeshBasicMaterial({ map: letterTexture('S', '#bfdbfe'), toneMapped: false });
    this.nPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.024), nMat);
    this.sPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.024), sMat);

    this.build();
  }

  public sync(state: InductionVisual): void {
    const magnetY = COIL_AXIS_Y + state.axial;
    this.magnetGroup.position.y = magnetY;
    this.probeGroup.position.y = COIL_AXIS_Y + state.probeAxial;

    const nOnTop = state.poleSign > 0;
    this.topCap.material = nOnTop ? this.redMat : this.blueMat;
    this.bottomCap.material = nOnTop ? this.blueMat : this.redMat;
    this.nPlate.position.y = nOnTop ? 0.072 : -0.072;
    this.sPlate.position.y = nOnTop ? -0.072 : 0.072;

    const shown = Math.min(this.rings.length, Math.max(4, Math.round(state.turns / 70)));
    this.rings.forEach((ring, index) => {
      ring.visible = index < shown;
    });
    this.copperMat.emissiveIntensity = 0.18 + Math.min(0.9, Math.abs(state.currentAmp) / FULL_SCALE_AMP);

    const swing = Math.max(-1, Math.min(1, state.currentAmp / FULL_SCALE_AMP));
    this.needlePivot.rotation.z = swing * 1.05;

    const flow = state.currentAmp === 0 ? 0 : Math.sign(state.currentAmp);
    if (flow === 0) {
      if (this.flowArrow.visible) this.flowArrow.visible = false;
      if (this.beads[0]?.visible) {
        for (let i = 0; i < this.beads.length; i++) this.beads[i].visible = false;
      }
    } else {
      this.flowArrow.visible = true;
      this.flowArrow.rotation.z = flow > 0 ? -Math.PI / 2 : Math.PI / 2;
      const phase = performance.now() * 0.0035 * flow;
      this.beads.forEach((bead, index) => {
        bead.visible = true;
        const angle = phase + (index / this.beads.length) * Math.PI * 2;
        bead.position.set(Math.sin(angle) * 0.052, COIL_AXIS_Y, Math.cos(angle) * 0.052);
      });
    }

    this.placeFieldArrow(this.magnetArrow, state.magnetField);
    this.placeFieldArrow(this.inducedArrow, state.inducedField);
    this.inducedArrow.position.x = 0.12;
    this.writeFieldLines(magnetY);

    if (this.readout.mesh.visible) {
      this.readout.write([
        { text: `${(state.currentAmp * 1000).toFixed(1)} mA`, color: '#fbbf24', size: 60 },
        { text: `B ${(state.magnetField * 1000).toFixed(1)} mT`, color: '#38bdf8', size: 36 },
        { text: state.poleSign > 0 ? 'N 极朝上' : 'N 极朝下', color: '#e2e8f0', size: 30 },
      ]);
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }

  private build(): void {
    // 1. Streamlined Precision Instrument Base Plinth (No rectangular wood block)
    this.buildBasePlatform();

    // 2. High-Precision Chrome Vertical Guide Tower (Full magnet travel clearance)
    this.buildGuideTower();

    // 3. Multi-layer Induction Solenoid Bobbin with Acrylic Core
    this.buildSolenoid();

    // 4. Sintered AlNiCo Bar Magnet with Smooth Linear Guide Slider
    this.buildMagnet();

    // 5. Axial Magnetic Field Hall Probe (Rail-mounted, NO floating in air)
    this.buildProbe();

    // 6. Center-Zero Sensitive Galvanometer Directly Oriented to User View
    this.buildMeter();

    // 7. Tactical Drop Release Trigger Mechanism
    this.buildDrive();

    // 8. Flexible Braided Jumper Cables with Molded Banana Plugs
    this.buildWiring();

    // 9. Dynamic Flow Indicators & Expansive Dipole Magnetic Streamlines
    this.buildVisualizers();

    // Initial state synchronization
    this.sync({
      axial: 0.22,
      poleSign: -1,
      probeAxial: 0,
      turns: 200,
      currentAmp: 0,
      magnetField: -0.01,
      inducedField: 0,
    });
  }

  private buildBasePlatform(): void {
    // Streamlined Rounded Plinth seamlessly sitting on the circular HoloTable
    const w = 0.68;
    const d = 0.26;
    const r = 0.04;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2);
    shape.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(w / 2, d / 2 - r);
    shape.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-w / 2 + r, d / 2);
    shape.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-w / 2, -d / 2 + r);
    shape.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, (Math.PI * 3) / 2, false);

    const baseGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.020,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 8,
    });
    const plinth = new THREE.Mesh(baseGeo, this.chassisMat);
    plinth.rotation.x = Math.PI / 2;
    plinth.position.set(0, 0.023, 0);

    const rim = outlined(plinth, 0x38bdf8, 0.35);
    this.group.add(plinth, rim);

    // Four Leveling Feet with Silicone Damping Pads
    const footGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.010, 24);
    for (const [x, z] of [
      [-w / 2 + 0.04, -d / 2 + 0.04],
      [-w / 2 + 0.04, d / 2 - 0.04],
      [w / 2 - 0.04, -d / 2 + 0.04],
      [w / 2 - 0.04, d / 2 - 0.04],
    ]) {
      const foot = new THREE.Mesh(footGeo, this.chassisMat);
      foot.position.set(x, 0.005, z);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.002, 6, 24), this.goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(x, 0.010, z);
      this.group.add(foot, collar);
    }

    // Central Circular Turntable Plinth under the Solenoid Tower
    const centerPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.112, 0.010, 48),
      labMetal(0x0f172a, 0.8, 0.35),
    );
    centerPlinth.position.set(0, 0.028, 0);
    const goldBezel = new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.0025, 8, 48), this.goldMat);
    goldBezel.rotation.x = Math.PI / 2;
    goldBezel.position.set(0, 0.033, 0);
    this.group.add(centerPlinth, goldBezel);

    // Front Laser-Etched Nameplate Badge
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.010, 0.002), this.goldMat);
    badge.position.set(0, 0.015, d / 2 + 0.002);
    this.group.add(badge);
  }

  private buildGuideTower(): void {
    const colHeight = 0.64;
    const colGeo = new THREE.CylinderGeometry(0.0055, 0.0055, colHeight, 20);
    const topY = 0.033 + colHeight; // ~0.673m

    for (const x of [-0.09, 0.09]) {
      const col = new THREE.Mesh(colGeo, this.chromeMat);
      col.position.set(x, 0.033 + colHeight / 2, 0);

      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20), this.goldMat);
      capTop.position.set(x, topY + 0.007, 0);

      const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.014, 20), this.aluminumMat);
      capBot.position.set(x, 0.033 + 0.007, 0);

      this.group.add(col, capTop, capBot);
    }

    // Top Crossbeam with jeweled suspension guide bushing
    const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.012, 0.020), this.aluminumMat);
    crossbeam.position.set(0, topY, 0);

    const centralBushing = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 24), this.goldMat);
    centralBushing.position.set(0, topY + 0.006, 0);

    this.group.add(crossbeam, centralBushing);

    // Precision Vertical Millimeter Scale Plate along the left column
    const scalePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, colHeight - 0.08, 0.002),
      labMetal(0x020617, 0.5, 0.5),
    );
    scalePlate.position.set(-0.102, 0.033 + colHeight / 2, 0.005);
    this.group.add(scalePlate);
  }

  private buildSolenoid(): void {
    // Optical quartz bore tube for clear observation of passing magnet
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.22, 32, 1, true),
      opticalQuartz(0xc9e7ff, 0.14),
    );
    tube.position.y = COIL_AXIS_Y;
    tube.renderOrder = 2;
    this.group.add(tube);

    this.coilGroup.name = 'SearchCoil';
    this.coilGroup.position.y = COIL_AXIS_Y;

    // Precision Acrylic End Flanges
    for (const y of [-0.055, 0.055]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.009, 32), this.aluminumMat);
      flange.position.y = y;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.003, 8, 32), this.goldMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = y;
      this.coilGroup.add(flange, rim);
    }

    // Inner Bobbin Core Cylinder
    const bobbinCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.040, 0.040, 0.10, 32),
      labMetal(0x0f172a, 0.6, 0.4),
    );
    this.coilGroup.add(bobbinCore);

    // Multi-layer Copper Windings
    const ringGeo = new THREE.TorusGeometry(0.048, 0.0034, 10, 32);
    for (let i = 0; i < 14; i++) {
      const ring = new THREE.Mesh(ringGeo, this.copperMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = (i - 6.5) * 0.0068;
      this.coilGroup.add(ring);
      this.rings.push(ring);
    }

    // Front Terminal Bracket with Gold Binding Posts (COM, 100T, 200T, 400T)
    const terminalBlock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.018), this.chassisMat);
    terminalBlock.position.set(0, -0.050, 0.058);
    this.coilGroup.add(terminalBlock);

    for (let i = 0; i < 4; i++) {
      const postX = -0.038 + i * 0.025;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.014, 12), this.goldMat);
      post.position.set(postX, -0.042, 0.058);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 6), this.goldMat);
      nut.position.set(postX, -0.037, 0.058);
      this.coilGroup.add(post, nut);
    }

    this.group.add(this.coilGroup);
  }

  private buildMagnet(): void {
    this.magnetGroup.name = 'BarMagnet';

    // Central cylindrical magnet body - MUST be children[0] for intersection test in tests/em_remaining.test.ts
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.11, 24),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 }),
    );

    // North (Red) and South (Blue) Pole Caps
    this.topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.032, 24), this.redMat);
    this.bottomCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.032, 24), this.blueMat);
    this.topCap.position.y = 0.071;
    this.bottomCap.position.y = -0.071;

    // Laser-etched N & S indicator plates
    this.nPlate.position.set(0, 0.072, 0.016);
    this.sPlate.position.set(0, -0.072, 0.016);

    // Compact central suspension sleeve & rear guide slider shoe riding on the columns
    const sleeve = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0028, 8, 20), this.aluminumMat);
    sleeve.rotation.x = Math.PI / 2;

    const sliderShoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.040, 0.016),
      this.chassisMat,
    );
    sliderShoe.position.set(0, 0, -0.016);

    // Top knurled suspension grip knob
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 16), this.goldMat);
    knob.position.y = 0.096;

    this.magnetGroup.add(body, this.topCap, this.bottomCap, this.nPlate, this.sPlate, sleeve, sliderShoe, knob);
    this.group.add(this.magnetGroup);
  }

  private buildProbe(): void {
    this.probeGroup.name = 'FieldProbe';

    // Sampling ring encircling the quartz bore
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0035, 8, 28), labGlow(0x22d3ee, 0.75));
    ring.rotation.x = -Math.PI / 2;

    // Rigid connecting stem to the guide column
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.055, 12), this.aluminumMat);
    stem.rotation.z = Math.PI / 2;
    stem.position.set(-0.065, 0, 0);

    // Sliding collar riding smoothly along the left guide column
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 16), this.chassisMat);
    collar.position.set(-0.09, 0, 0);

    // Ergonomic knurled thumbscrew on the collar
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.010, 12), this.goldMat);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(-0.098, 0, 0);

    this.probeGroup.add(ring, stem, collar, screw);
    this.group.add(this.probeGroup);
  }

  private buildMeter(): void {
    const meter = new THREE.Group();
    // Solidly positioned on the right wing of the instrument base
    meter.position.set(0.22, 0.033, 0.01);

    // Wedged instrument casing with top surface sloping DOWN towards the user (NO backwards tilt!)
    const caseGeo = new THREE.BoxGeometry(0.13, 0.065, 0.11);
    const meterCase = new THREE.Mesh(caseGeo, this.chassisMat);
    meterCase.position.set(0, 0.032, 0);
    meter.add(meterCase, outlined(meterCase, 0x64748b, 0.35));

    // Angled Front Face Assembly (Tilted -28° so normal points UP and directly TOWARDS user eye)
    const dialAngle = -0.48; // Negative angle tilts face forward towards the camera!
    const dialOriginY = 0.065;
    const dialOriginZ = 0.015;

    // Polished Aluminum Bezel
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.048, 0.008, 36), this.aluminumMat);
    bezel.rotation.x = dialAngle;
    bezel.position.set(0, dialOriginY, dialOriginZ);

    // Mirrored Center-Zero Dial Face (Crisp, fully facing user)
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.042, 36),
      new THREE.MeshBasicMaterial({ map: dialTexture(), toneMapped: false }),
    );
    face.rotation.x = dialAngle;
    face.position.set(0, dialOriginY + 0.004 * Math.cos(dialAngle), dialOriginZ - 0.004 * Math.sin(dialAngle));

    // Optical Protective Crystal Cover
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.044, 36), opticalQuartz(0xc9e7ff, 0.18));
    glass.rotation.x = dialAngle;
    glass.position.set(0, dialOriginY + 0.007 * Math.cos(dialAngle), dialOriginZ - 0.007 * Math.sin(dialAngle));

    meter.add(bezel, face, glass);

    // Needle Pivot & Ruby Red Pointer Needle
    this.needlePivot.position.set(
      0,
      dialOriginY + 0.005 * Math.cos(dialAngle) - 0.010 * Math.sin(dialAngle),
      dialOriginZ - 0.005 * Math.sin(dialAngle) - 0.010 * Math.cos(dialAngle),
    );
    this.needlePivot.rotation.x = dialAngle;

    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.038, 0.002),
      labGlow(0xef4444, 0.9),
    );
    needle.position.y = 0.016;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 16), this.aluminumMat);
    hub.rotation.x = Math.PI / 2;
    this.needlePivot.add(needle, hub);
    meter.add(this.needlePivot);

    // Top Terminal Posts (+ Red, - Black)
    const redPost = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.014, 12), this.redMat);
    redPost.position.set(-0.032, 0.070, -0.040);
    const blackPost = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.014, 12), labMetal(0x020617, 0.3, 0.7));
    blackPost.position.set(0.032, 0.070, -0.040);
    meter.add(redPost, blackPost);

    this.group.add(meter);
  }

  private buildDrive(): void {
    this.driveLever.name = 'DriveLever';
    // Seated solidly on the left wing of the instrument base
    this.driveLever.position.set(-0.22, 0.033, 0.01);

    // Precision CNC-Machined Mounting Stanchion
    const mountBlock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.024, 0.065), this.chassisMat);
    mountBlock.position.y = 0.012;

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.024, 0.018, 20), this.aluminumMat);
    pedestal.position.y = 0.030;

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0028, 8, 20), this.goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.035;

    // Spring-loaded tactile release plunger button
    const trigger = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.015, 20), labGlow(0xf59e0b, 0.85));
    trigger.position.y = 0.043;

    this.driveLever.add(mountBlock, pedestal, collar, trigger, outlined(mountBlock, 0x64748b, 0.35));
    this.group.add(this.driveLever);
  }

  private buildWiring(): void {
    // Twin flexible laboratory jumper leads running cleanly from coil terminals to galvanometer
    const redLead = createJumperLead([
      new THREE.Vector3(0.012, COIL_AXIS_Y - 0.050, 0.065),
      new THREE.Vector3(0.06, 0.15, 0.08),
      new THREE.Vector3(0.13, 0.11, 0.06),
      new THREE.Vector3(0.188, 0.105, -0.030),
    ], 0xef4444);

    const blackLead = createJumperLead([
      new THREE.Vector3(-0.012, COIL_AXIS_Y - 0.050, 0.065),
      new THREE.Vector3(0.04, 0.13, 0.10),
      new THREE.Vector3(0.15, 0.09, 0.08),
      new THREE.Vector3(0.252, 0.105, -0.030),
    ], 0x1e293b);

    this.group.add(redLead, blackLead);
  }

  private buildVisualizers(): void {
    const beadMat = labGlow(0xf8fafc, 0.9);
    const beadGeo = new THREE.SphereGeometry(0.0045, 12, 10);
    for (let i = 0; i < 8; i++) {
      const bead = new THREE.Mesh(beadGeo, beadMat);
      this.group.add(bead);
      this.beads.push(bead);
    }

    this.flowArrow.position.set(0, COIL_AXIS_Y, 0.065);
    this.flowArrow.add(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.026, 12), labGlow(0xf8fafc, 0.8)));
    this.magnetArrow.position.set(-0.12, COIL_AXIS_Y, 0.08);
    this.inducedArrow.position.set(0.12, COIL_AXIS_Y, 0.08);
    this.group.add(this.flowArrow, this.magnetArrow, this.inducedArrow);

    this.buildFieldLines();

    // Hide redundant 3D floating canvas readout (Telemetry is cleanly presented in VisionOS Card)
    this.readout.mesh.visible = false;
    this.group.add(this.readout.mesh);
  }

  private makeArrow(color: number): THREE.Group {
    const group = new THREE.Group();
    const mat = labGlow(color, 0.7);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 12), mat);
    shaft.position.y = 0.025;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.018, 14), mat);
    head.position.y = 0.055;
    group.add(shaft, head);
    return group;
  }

  private placeFieldArrow(arrow: THREE.Group, field: number): void {
    arrow.visible = Math.abs(field) > 1e-6;
    arrow.rotation.z = field >= 0 ? 0 : Math.PI;
    arrow.scale.set(1, 0.55 + Math.min(1.1, Math.abs(field) / 0.05), 1);
  }

  private buildFieldLines(): void {
    const mat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // True expansive dipole field lines looping gracefully around the magnet
    const layouts: Array<{ plane: 'xy' | 'xz'; sign: number; k: number }> = [
      { plane: 'xy', sign: -1, k: 0.12 },
      { plane: 'xy', sign: 1, k: 0.12 },
      { plane: 'xy', sign: -1, k: 0.20 },
      { plane: 'xy', sign: 1, k: 0.20 },
      { plane: 'xz', sign: -1, k: 0.16 },
      { plane: 'xz', sign: 1, k: 0.16 },
    ];
    for (const layout of layouts) {
      const geometry = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(40 * 3), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attr);
      const line = new THREE.Line(geometry, mat);
      line.frustumCulled = false;
      this.group.add(line);
      this.fieldPos.push(attr);
      this.fieldLayout.push(layout);
    }
  }

  private writeFieldLines(magnetY: number): void {
    if (Math.abs(this.lastMagnetY - magnetY) < 1e-4) return;
    this.lastMagnetY = magnetY;
    const poleSpan = 0.065;
    this.fieldPos.forEach((attr, index) => {
      const layout = this.fieldLayout[index];
      const count = attr.count;
      for (let i = 0; i < count; i++) {
        const theta = 0.12 + ((Math.PI - 0.24) * i) / (count - 1);
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const r = layout.k * sinT * sinT;
        const lateral = layout.sign * r * sinT;
        const y = magnetY + cosT * (poleSpan + r * Math.abs(cosT));
        if (layout.plane === 'xz') attr.setXYZ(i, 0, y, lateral);
        else attr.setXYZ(i, lateral, y, 0.035);
      }
      attr.needsUpdate = true;
    });
  }
}
