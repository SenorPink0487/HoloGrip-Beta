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

export class InductionBenchMesh {
  public readonly group = new THREE.Group();
  public readonly magnetGroup = new THREE.Group();
  public readonly coilGroup = new THREE.Group();
  public readonly probeGroup = new THREE.Group();
  public readonly needlePivot = new THREE.Group();
  public readonly driveLever = new THREE.Group();
  public readonly flowArrow = new THREE.Group();
  public topCap!: THREE.Mesh;
  public bottomCap!: THREE.Mesh;

  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly blueMat: THREE.MeshStandardMaterial;
  private readonly copperMat: THREE.MeshStandardMaterial;
  private readonly steelMat: THREE.MeshStandardMaterial;
  private readonly aluminumMat: THREE.MeshStandardMaterial;
  private readonly goldMat: THREE.MeshStandardMaterial;
  private readonly rings: THREE.Mesh[] = [];
  private readonly beads: THREE.Mesh[] = [];
  private readonly magnetArrow: THREE.Group;
  private readonly inducedArrow: THREE.Group;
  private readonly fieldPos: THREE.BufferAttribute[] = [];
  private readonly fieldLayout: Array<{ plane: 'xy' | 'xz'; sign: number; k: number }> = [];
  private readonly readout: ReadoutPanel;
  private readonly nPlate: THREE.Mesh;
  private readonly sPlate: THREE.Mesh;

  constructor() {
    this.group.name = 'InductionBench';
    this.redMat = labGlow(0xef4444, 0.45);
    this.blueMat = labGlow(0x2563eb, 0.45);
    this.copperMat = enameledCopper(0xb45309);
    this.steelMat = labMetal(0x475569, 0.85, 0.25);
    this.aluminumMat = anodizedAluminum(0xcbd5e1, 0.22);
    this.goldMat = polishedGold(0xd4af37);

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
    this.copperMat.emissiveIntensity = 0.15 + Math.min(0.9, Math.abs(state.currentAmp) / FULL_SCALE_AMP);

    const swing = Math.max(-1, Math.min(1, state.currentAmp / FULL_SCALE_AMP));
    this.needlePivot.rotation.z = swing * 1.05;

    const flow = state.currentAmp === 0 ? 0 : Math.sign(state.currentAmp);
    this.flowArrow.visible = flow !== 0;
    this.flowArrow.rotation.z = flow > 0 ? -Math.PI / 2 : Math.PI / 2;

    const phase = performance.now() * 0.003 * flow;
    this.beads.forEach((bead, index) => {
      bead.visible = flow !== 0;
      const angle = phase + (index / this.beads.length) * Math.PI * 2;
      bead.position.set(Math.sin(angle) * 0.052, COIL_AXIS_Y, Math.cos(angle) * 0.052);
    });

    this.placeFieldArrow(this.magnetArrow, state.magnetField);
    this.placeFieldArrow(this.inducedArrow, state.inducedField);
    this.inducedArrow.position.x = 0.12;
    this.writeFieldLines(magnetY);

    this.readout.write([
      { text: `${(state.currentAmp * 1000).toFixed(1)} mA`, color: '#fbbf24', size: 60 },
      { text: `B ${(state.magnetField * 1000).toFixed(1)} mT`, color: '#38bdf8', size: 36 },
      { text: state.poleSign > 0 ? 'N 极朝上' : 'N 极朝下', color: '#e2e8f0', size: 30 },
    ]);
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }

  private build(): void {
    // 1. Sleek Central Stand Base (No giant ugly rectangular table slab)
    const baseStand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.13, 0.02, 36),
      this.steelMat,
    );
    baseStand.position.set(0, 0.01, 0);
    const ringTrim = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.003, 8, 36), this.goldMat);
    ringTrim.rotation.x = Math.PI / 2;
    ringTrim.position.set(0, 0.02, 0);
    this.group.add(baseStand, ringTrim, outlined(baseStand, 0x64748b, 0.3));

    // 2. Dual Polished Stainless Steel Vertical Guide Columns
    this.buildGuideColumns();

    // 3. Multi-layer Induction Solenoid (SearchCoil)
    this.buildSolenoid();

    // 4. Sintered AlNiCo Bar Magnet with Precision Slider Bracket
    this.buildMagnet();

    // 5. Axial Magnetic Field Probe
    this.buildProbe();

    // 6. Benchtop 45° Inclined Sensitive Center-Zero Galvanometer
    this.buildMeter();

    // 7. Tactical Release Trigger Mechanism
    this.buildDrive();

    // 8. Braided Flexible Laboratory Jumper Cables
    this.buildWiring();

    // 9. Dynamic Flow Indicators & Flux Arrows
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

  private buildGuideColumns(): void {
    const colGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.48, 16);
    const colMat = this.aluminumMat;

    for (const x of [-0.09, 0.09]) {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x, 0.26, 0);
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16), this.goldMat);
      capTop.position.set(x, 0.505, 0);
      const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 16), this.steelMat);
      capBot.position.set(x, 0.025, 0);
      this.group.add(col, capTop, capBot);
    }

    // Top Crossbeam with laser-etched alignment notch
    const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.012, 0.018), this.steelMat);
    crossbeam.position.set(0, 0.50, 0);
    this.group.add(crossbeam);

    // Slim Vertical Scale Strip along the left column
    const scalePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.42, 0.002),
      labMetal(0x0f172a, 0.5, 0.5),
    );
    scalePlate.position.set(-0.102, 0.26, 0.006);
    this.group.add(scalePlate);
  }

  private buildSolenoid(): void {
    // Optical quartz bore tube for clear observation of passing magnet
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.24, 32, 1, true),
      opticalQuartz(0xc9e7ff, 0.12),
    );
    tube.position.y = COIL_AXIS_Y;
    tube.renderOrder = 2;
    this.group.add(tube);

    this.coilGroup.name = 'SearchCoil';
    this.coilGroup.position.y = COIL_AXIS_Y;

    // Precision Acrylic End Flanges
    for (const y of [-0.05, 0.05]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.008, 32), this.aluminumMat);
      flange.position.y = y;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.003, 8, 32), this.goldMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = y;
      this.coilGroup.add(flange, rim);
    }

    // Multi-layer Copper Windings
    const ringGeo = new THREE.TorusGeometry(0.048, 0.0032, 10, 32);
    for (let i = 0; i < 14; i++) {
      const ring = new THREE.Mesh(ringGeo, this.copperMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = (i - 6.5) * 0.0055;
      this.coilGroup.add(ring);
      this.rings.push(ring);
    }

    // Front Terminal Bracket with Gold Binding Posts (COM, 100T, 200T, 400T)
    const terminalBlock = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.016, 0.018), this.steelMat);
    terminalBlock.position.set(0, -0.045, 0.055);
    this.coilGroup.add(terminalBlock);

    for (let i = 0; i < 4; i++) {
      const postX = -0.036 + i * 0.024;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.014, 12), this.goldMat);
      post.position.set(postX, -0.038, 0.055);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 6), this.goldMat);
      nut.position.set(postX, -0.033, 0.055);
      this.coilGroup.add(post, nut);
    }

    this.group.add(this.coilGroup);
  }

  private buildMagnet(): void {
    this.magnetGroup.name = 'BarMagnet';

    // Central cylindrical magnet body - MUST be children[0] for intersection test
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.11, 24),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.2 }),
    );

    // North (Red) and South (Blue) Pole Caps
    this.topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.032, 24), this.redMat);
    this.bottomCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.032, 24), this.blueMat);
    this.topCap.position.y = 0.071;
    this.bottomCap.position.y = -0.071;

    // Laser-etched N & S indicator plates
    this.nPlate.position.set(0, 0.072, 0.016);
    this.sPlate.position.set(0, -0.072, 0.016);

    // Compact central suspension sleeve & rear guide slider shoe
    const sleeve = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0028, 8, 20), this.aluminumMat);
    sleeve.rotation.x = Math.PI / 2;

    const sliderShoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.040, 0.016),
      this.steelMat,
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
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 8, 28), labGlow(0x22d3ee, 0.7));
    ring.rotation.x = -Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.07, 12), this.aluminumMat);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.045;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.022), labMetal(0x0f172a, 0.6, 0.4));
    grip.position.set(0, 0, 0.08);
    this.probeGroup.add(ring, stem, grip);
    this.group.add(this.probeGroup);
  }

  private buildMeter(): void {
    const meter = new THREE.Group();
    meter.position.set(0.24, 0.09, 0.04);

    // 45° Ergonomic Desktop Housing (Silver/Grey, NOT pitch black!)
    const caseGeo = new THREE.BoxGeometry(0.14, 0.14, 0.09);
    const meterCase = new THREE.Mesh(caseGeo, this.steelMat);
    meterCase.rotation.x = -Math.PI / 4; // 45-degree ergonomic tilt directly facing camera
    meter.add(meterCase, outlined(meterCase, 0x94a3b8, 0.35));

    // Polished Aluminum Bezel framing the dial
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.058, 0.012, 36), this.aluminumMat);
    bezel.rotation.x = Math.PI / 2 - Math.PI / 4;
    bezel.position.set(0, 0.01, 0.045);

    // High-Contrast Anti-Parallax Mirrored Dial Face
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.048, 36),
      new THREE.MeshBasicMaterial({ map: dialTexture(), toneMapped: false }),
    );
    face.rotation.x = Math.PI / 2 - Math.PI / 4;
    face.position.set(0, 0.016, 0.05);

    // Protective Crystal Glass Cover
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.05, 36), opticalQuartz(0xc9e7ff, 0.16));
    glass.rotation.x = Math.PI / 2 - Math.PI / 4;
    glass.position.set(0, 0.02, 0.054);

    meter.add(bezel, face, glass);

    // Needle Pivot & Red Pointer
    this.needlePivot.position.set(0, -0.01, 0.053);
    this.needlePivot.rotation.x = -Math.PI / 4;

    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.044, 0.002),
      labGlow(0xef4444, 0.8),
    );
    needle.position.y = 0.018;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 16), this.aluminumMat);
    hub.rotation.x = Math.PI / 2;
    this.needlePivot.add(needle, hub);
    meter.add(this.needlePivot);

    // Top Terminal Binding Posts (+ Red, - Black)
    const redPost = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.016, 12), this.redMat);
    redPost.position.set(-0.035, 0.08, 0.02);
    const blackPost = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.016, 12), labMetal(0x0f172a, 0.3, 0.7));
    blackPost.position.set(0.035, 0.08, 0.02);
    meter.add(redPost, blackPost);

    this.group.add(meter);
  }

  private buildDrive(): void {
    this.driveLever.name = 'DriveLever';
    this.driveLever.position.set(-0.22, 0.02, 0.05);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.024, 20), this.steelMat);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 8, 20), this.aluminumMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.012;

    const trigger = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.014, 20), labGlow(0xf59e0b, 0.7));
    trigger.position.y = 0.018;

    this.driveLever.add(pedestal, collar, trigger);
    this.group.add(this.driveLever);
  }

  private buildWiring(): void {
    // Twin flexible laboratory jumper leads running from coil terminals to galvanometer
    const redLead = createJumperLead([
      new THREE.Vector3(0.012, COIL_AXIS_Y - 0.045, 0.06),
      new THREE.Vector3(0.08, 0.16, 0.09),
      new THREE.Vector3(0.16, 0.12, 0.08),
      new THREE.Vector3(0.205, 0.17, 0.06),
    ], 0xef4444);

    const blackLead = createJumperLead([
      new THREE.Vector3(-0.012, COIL_AXIS_Y - 0.045, 0.06),
      new THREE.Vector3(0.06, 0.14, 0.11),
      new THREE.Vector3(0.18, 0.10, 0.10),
      new THREE.Vector3(0.275, 0.17, 0.06),
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
    const layouts: Array<{ plane: 'xy' | 'xz'; sign: number; k: number }> = [
      { plane: 'xy', sign: -1, k: 0.07 },
      { plane: 'xy', sign: 1, k: 0.07 },
      { plane: 'xy', sign: -1, k: 0.11 },
      { plane: 'xy', sign: 1, k: 0.11 },
      { plane: 'xz', sign: -1, k: 0.09 },
      { plane: 'xz', sign: 1, k: 0.09 },
    ];
    for (const layout of layouts) {
      const geometry = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(36 * 3), 3);
      geometry.setAttribute('position', attr);
      const line = new THREE.Line(geometry, mat);
      line.frustumCulled = false;
      this.group.add(line);
      this.fieldPos.push(attr);
      this.fieldLayout.push(layout);
    }
  }

  private writeFieldLines(magnetY: number): void {
    this.fieldPos.forEach((attr, index) => {
      const layout = this.fieldLayout[index];
      const count = attr.count;
      for (let i = 0; i < count; i++) {
        const theta = 0.18 + ((Math.PI - 0.36) * i) / (count - 1);
        const radius = layout.k * Math.sin(theta) * Math.sin(theta);
        const lateral = layout.sign * radius * Math.sin(theta);
        const y = magnetY + radius * Math.cos(theta);
        if (layout.plane === 'xz') attr.setXYZ(i, 0, y, lateral);
        else attr.setXYZ(i, lateral, y, 0.04);
      }
      attr.needsUpdate = true;
    });
  }
}
