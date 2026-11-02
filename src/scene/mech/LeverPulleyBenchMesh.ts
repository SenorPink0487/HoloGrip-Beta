import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObjectTree } from './mechKit.ts';
import { LEVER_HEIGHT, type LeverPulleyDynamics } from '../../physics/mech/leverPulleyDynamics.ts';

export const LEVER_X = -0.49;
export const PULLEY_X = 0.63;
export const PULLEY_TOP = 0.76;
export const PULLEY_BOTTOM = 0.31;
export const HANDLE_REST_Y = 0.67;
export const SHEAVE_RADIUS = 0.045;
export type BenchControl = 'pivot' | 'weight' | 'pull' | 'mode' | 'load' | 'reset';
export interface ControlTag { kind: BenchControl; index?: number }
interface Screen { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; key: string; engraved: boolean }

/** Machined dual-station teaching apparatus. Every label is a material on a solid
 * instrument face; no HTML overlays, sprites or camera-facing helper cards. */
export class LeverPulleyBenchMesh {
  public readonly group = new THREE.Group();
  public readonly lever = new THREE.Group();
  public readonly beam = new THREE.Group();
  public readonly beamBody = new THREE.Group();
  public readonly pivot = new THREE.Group();
  public readonly weightGroups: THREE.Group[] = [];
  public readonly pulley = new THREE.Group();
  public readonly movingBlock = new THREE.Group();
  public readonly pullHandle = new THREE.Group();
  public readonly controls: THREE.Object3D[] = [];
  private readonly silver = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.72, roughness: 0.27 });
  private readonly chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.1 });
  private readonly brass = new THREE.MeshStandardMaterial({ color: 0xeab46a, metalness: 0.82, roughness: 0.22 });
  private readonly sapphire = new THREE.MeshStandardMaterial({ color: 0x0a192f, metalness: 0.4, roughness: 0.25 });
  private readonly groove = new THREE.MeshStandardMaterial({ color: 0x53758b, metalness: 0.6, roughness: 0.38 });
  private readonly ceramic = new THREE.MeshStandardMaterial({ color: 0xb7cbd7, roughness: 0.68 });
  private readonly ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x22c7d8, metalness: 0.15, roughness: 0.65 });
  private readonly invisibleEdge = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  private leftMomentDisplay!: Screen;
  private rightMomentDisplay!: Screen;
  private forceDisplay!: Screen;
  private heightDisplay!: Screen;
  private distanceDisplay!: Screen;
  private angleLabel!: Screen;
  private balanceLamp!: THREE.Mesh;
  private modeLabel!: Screen;
  private loadLabel!: Screen;
  private hangingMassLabel!: Screen;
  private modeKnob!: THREE.Group;
  private loadKnob!: THREE.Group;
  private rope!: THREE.Mesh;
  private ropePoints: THREE.Vector3[] = [];
  private fixedWheels: THREE.Group[] = [];
  private movingWheels: THREE.Group[] = [];
  private anchor!: THREE.Group;
  private hanger!: THREE.Group;
  private slotGlow!: THREE.Mesh;
  private lastRopeKey = '';
  private hovered: THREE.Object3D | null = null;
  private disposed = false;

  constructor() {
    this.group.name = 'LeverPulleyPrecisionBench';
    this.lever.position.x = LEVER_X;
    this.pulley.position.x = PULLEY_X;
    this.group.add(this.lever, this.pulley);
    this.createLever();
    this.createPulley();
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, name = ''): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private rounded(w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, r = 0.004): THREE.Mesh {
    return this.mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)), mat, parent, x, y, z);
  }

  /** Turned profile with shoulders and chamfered ends, axis +Y. */
  private turned(profile: number[][], mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, segments = 40): THREE.Mesh {
    return this.mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), mat, parent, x, y, z);
  }

  private shaft(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, length: number): THREE.Mesh {
    return this.turned([[0, -length / 2], [radius * 0.8, -length / 2], [radius, -length / 2 + radius * 0.3],
      [radius, length / 2 - radius * 0.3], [radius * 0.8, length / 2], [0, length / 2]], this.chrome, parent, x, y, z, 24);
  }

  private knob(parent: THREE.Object3D, x: number, y: number, z: number, radius = 0.022): THREE.Group {
    const knob = new THREE.Group();
    knob.position.set(x, y, z);
    parent.add(knob);
    const body = this.turned([[0, -0.01], [radius * 0.65, -0.01], [radius, -0.006], [radius, 0.006],
      [radius * 0.85, 0.01], [0, 0.01]], this.brass, knob, 0, 0, 0);
    body.rotation.x = Math.PI / 2;
    // Merge the grip's twenty-four machined knurls into one draw call.
    const ridges: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const g = new RoundedBoxGeometry(0.0017, 0.011, 0.0018, 1, 0.0005);
      g.rotateX(Math.PI / 2);
      g.rotateZ(a);
      g.translate(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      ridges.push(g);
    }
    this.mesh(mergeGeometries(ridges)!, this.brass, knob);
    ridges.forEach(g => g.dispose());
    this.rounded(0.002, radius * 0.55, 0.0015, this.sapphire, knob, 0, radius * 0.38, 0.0108, 0.0004);
    return knob;
  }

  private bolt(parent: THREE.Object3D, x: number, y: number, z: number): void {
    const head = this.turned([[0, -0.002], [0.004, -0.002], [0.0046, -0.001], [0.0046, 0.001], [0.0038, 0.002], [0, 0.002]], this.chrome, parent, x, y, z, 6);
    head.rotation.x = Math.PI / 2;
    this.rounded(0.004, 0.0008, 0.0006, this.groove, parent, x, y, z + 0.0022, 0.0001);
  }

  private tag(object: THREE.Object3D, kind: BenchControl, index?: number): void {
    object.userData.control = { kind, index } satisfies ControlTag;
    this.controls.push(object);
  }

  public controlOf(object: THREE.Object3D): { object: THREE.Object3D; tag: ControlTag } | null {
    for (let obj: THREE.Object3D | null = object; obj && obj !== this.group; obj = obj.parent) {
      if (obj.userData.control) return { object: obj, tag: obj.userData.control as ControlTag };
    }
    return null;
  }

  private surface(parent: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, background = '#0a192f'): Screen {
    const canvas = document.createElement('canvas');
    const density = Math.min(1536 / w, 2048 / h);
    canvas.width = Math.max(64, Math.round(w * density));
    canvas.height = Math.max(16, Math.round(h * density));
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const engraved = background === 'transparent';
    const screen = { canvas, ctx, texture, key: '', engraved };
    const printed = new THREE.MeshBasicMaterial({ map: texture, transparent: engraved, depthWrite: !engraved });
    const edge = engraved ? this.invisibleEdge : this.silver;
    const face = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.002, 2, 0.0006),
      [edge, edge, edge, edge, printed, edge]);
    if (engraved) face.raycast = () => {};
    face.position.set(x, y, z);
    parent.add(face);
    if (!engraved) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return screen;
  }

  private text(screen: Screen, lines: string[], light = false): void {
    const key = lines.join('|');
    if (screen.key === key) return;
    screen.key = key;
    const { canvas, ctx } = screen;
    if (screen.engraved) ctx.clearRect(0, 0, canvas.width, canvas.height);
    else {
      ctx.fillStyle = light ? '#e2e8f0' : '#0a192f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.textAlign = screen.engraved ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    const step = canvas.height / (lines.length + 0.25);
    lines.forEach((line, i) => {
      ctx.font = `${i === 1 ? 600 : 500} ${Math.floor(step * (screen.engraved ? 0.72 : i === 1 ? 0.65 : 0.53))}px "SF Pro Display", "PingFang SC", Arial, sans-serif`;
      ctx.fillStyle = screen.engraved || light ? '#365368' : i === 1 ? '#74f4e0' : '#c3dce9';
      ctx.fillText(line, screen.engraved ? canvas.width / 2 : 40, step * (i + 0.62));
    });
    screen.texture.needsUpdate = true;
  }

  /** Ink follows the actual metal surface; there is no opaque label backing. */
  private etching(parent: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, label: string): Screen {
    const surface = this.surface(parent, w, h, x, y, z, 'transparent');
    this.text(surface, [label], true);
    return surface;
  }

  /** The readout windows sit inside a continuous, chamfered aluminium fascia. */
  private console(parent: THREE.Object3D, width: number): void {
    const body = this.rounded(width, 0.112, 0.065, this.silver, parent, 0, 0.077, 0.143, 0.012);
    body.name = 'integrated-instrument-fascia';
    this.rounded(width - 0.025, 0.004, 0.004, this.brass, parent, 0, 0.026, 0.176, 0.001);
    for (const x of [-width / 2 + 0.018, width / 2 - 0.018]) this.bolt(parent, x, 0.077, 0.178);
  }

  private meter(parent: THREE.Object3D, width: number, x: number): Screen {
    this.rounded(width + 0.012, 0.084, 0.007, this.chrome, parent, x, 0.078, 0.178, 0.003);
    this.rounded(width + 0.005, 0.078, 0.004, this.sapphire, parent, x, 0.078, 0.183, 0.001);
    return this.surface(parent, width, 0.072, x, 0.078, 0.186);
  }

  private updateMeter(screen: Screen, label: string, value: string, unit: string, color = '#b4ede6'): void {
    const key = `${label}:${value}:${unit}:${color}`;
    if (screen.key === key) return;
    screen.key = key;
    const { ctx, canvas } = screen;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0a192f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#17354d'; ctx.fillRect(0, 0, w, h * 0.017);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.floor(h * 0.15)}px "SF Pro Display", "PingFang SC", sans-serif`;
    ctx.fillStyle = '#9db6ca'; ctx.fillText(label, w * 0.075, h * 0.19);
    ctx.font = `500 ${Math.floor(h * 0.43)}px "SFMono-Regular", "SF Mono", Consolas, monospace`;
    ctx.fillStyle = color; ctx.fillText(value, w * 0.075, h * 0.59);
    ctx.textAlign = 'right';
    ctx.font = `500 ${Math.floor(h * 0.145)}px "SF Pro Display", sans-serif`;
    ctx.fillStyle = '#9db6ca'; ctx.fillText(unit, w * 0.92, h * 0.865);
    screen.texture.needsUpdate = true;
  }

  private base(parent: THREE.Object3D, width: number): void {
    this.rounded(width, 0.056, 0.30, this.silver, parent, 0, 0.048, 0, 0.014);
    this.rounded(width - 0.025, 0.009, 0.278, this.brass, parent, 0, 0.024, 0, 0.003);
    // Ballasted plinth with individually levelable, grooved vibration isolators.
    for (const x of [-width * 0.42, width * 0.42]) for (const z of [-0.11, 0.11]) {
      this.turned([[0, 0], [0.018, 0], [0.022, 0.004], [0.022, 0.009], [0.019, 0.011],
        [0.022, 0.013], [0.019, 0.018], [0, 0.018]], this.ceramic, parent, x, 0.002, z);
      this.turned([[0, 0], [0.009, 0], [0.009, 0.009], [0.007, 0.011], [0, 0.011]], this.chrome, parent, x, 0.016, z);
    }
    for (const x of [-width * 0.44, width * 0.44]) this.bolt(parent, x, 0.048, 0.151);
  }

  private createLever(): void {
    this.base(this.lever, 1.02);
    // Dual chrome guides and a dovetail track for the movable bearing carriage.
    for (const z of [-0.095, -0.055]) {
      const rod = this.shaft(this.lever, 0, 0.13, z, 0.005, 0.47);
      rod.rotation.z = Math.PI / 2;
      for (const x of [-0.225, 0.225]) {
        this.rounded(0.029, 0.038, 0.03, this.silver, this.lever, x, 0.117, z);
        this.bolt(this.lever, x, 0.119, z + 0.016);
      }
    }
    this.rounded(0.46, 0.014, 0.015, this.groove, this.lever, 0, 0.101, -0.075);
    this.lever.add(this.pivot);
    this.tag(this.pivot, 'pivot');
    this.pivot.name = 'movable-fulcrum-carriage';
    this.rounded(0.070, 0.042, 0.082, this.silver, this.pivot, 0, 0.129, -0.075);
    for (const x of [-0.019, 0.019]) {
      this.shaft(this.pivot, x, 0.331, -0.075, 0.007, 0.37);
      this.turned([[0, 0], [0.012, 0], [0.012, 0.011], [0.009, 0.014], [0, 0.014]], this.brass, this.pivot, x, 0.149, -0.075);
    }
    this.rounded(0.072, 0.047, 0.07, this.silver, this.pivot, 0, LEVER_HEIGHT, -0.052);
    const axle = this.shaft(this.pivot, 0, LEVER_HEIGHT, 0, 0.007, 0.11);
    axle.rotation.x = Math.PI / 2;
    this.knob(this.pivot, 0, LEVER_HEIGHT, 0.057, 0.020);
    this.etching(this.pivot, 0.056, 0.014, 0, 0.129, -0.033, '⇆');

    this.lever.add(this.beam);
    this.beam.add(this.beamBody);
    const outline = new THREE.Shape();
    const w = 0.49, h = 0.029, r = 0.012;
    outline.moveTo(-w + r, -h);
    outline.lineTo(w - r, -h); outline.quadraticCurveTo(w, -h, w, -h + r);
    outline.lineTo(w, h - r); outline.quadraticCurveTo(w, h, w - r, h);
    outline.lineTo(-w + r, h); outline.quadraticCurveTo(-w, h, -w, h - r);
    outline.lineTo(-w, -h + r); outline.quadraticCurveTo(-w, -h, -w + r, -h);
    for (let i = -9; i <= 9; i++) {
      const hole = new THREE.Path();
      hole.absarc(i * 0.05, -0.015, 0.0043, 0, Math.PI * 2, true);
      outline.holes.push(hole);
    }
    const beamGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.024, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.0016, bevelThickness: 0.0016, curveSegments: 12 });
    beamGeo.translate(0, 0, -0.012);
    this.mesh(beamGeo, this.silver, this.beamBody, 0, 0, 0, 'bevelled-perforated-metre-beam');
    // One millimetre graduations are shallow inset solid cuts, batched on GPU.
    const ticks = new THREE.InstancedMesh(new RoundedBoxGeometry(0.00028, 1, 0.00045, 1, 0.00009), this.groove, 901);
    const dummy = new THREE.Object3D();
    for (let i = 0; i <= 900; i++) {
      const length = i % 50 === 0 ? 0.013 : i % 10 === 0 ? 0.008 : 0.003;
      dummy.position.set(-0.45 + i * 0.001, 0.025 - length / 2, 0.0138);
      dummy.scale.set(1, length, 1); dummy.updateMatrix(); ticks.setMatrixAt(i, dummy.matrix);
    }
    this.beamBody.add(ticks);
    const scale = this.surface(this.beamBody, 0.94, 0.014, 0, 0.004, 0.0145, '#e2e8f0');
    const ctx = scale.ctx;
    ctx.fillStyle = '#365368'; ctx.font = '600 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = -9; i <= 9; i++) ctx.fillText(String(i * 5), scale.canvas.width * (0.5 + i * 0.05 / 0.94), scale.canvas.height / 2);
    scale.texture.needsUpdate = true;

    this.slotGlow = this.mesh(new THREE.TorusGeometry(0.008, 0.0014, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x51e6d0, emissive: 0x25b99e, emissiveIntensity: 0.8 }), this.beamBody, 0, -0.015, 0.021);
    this.slotGlow.visible = false;
    for (let i = 0; i < 6; i++) {
      const mass = i < 2 ? 0.1 : i < 4 ? 0.05 : 0.2;
      const weight = this.weight(mass);
      this.lever.add(weight); this.weightGroups.push(weight); this.tag(weight, 'weight', i);
      // Recessed storage cups, each with a matching engraved nominal mass.
      this.turned([[0.023, 0], [0.026, 0.003], [0.026, 0.012], [0.022, 0.014], [0.022, 0.005]], this.silver, this.lever, this.rackX(i), 0.079, 0.065);
    }
    this.console(this.lever, 0.98);
    this.leftMomentDisplay = this.meter(this.lever, 0.22, -0.33);
    this.rightMomentDisplay = this.meter(this.lever, 0.22, -0.075);
    this.etching(this.lever, 0.22, 0.019, 0.20, 0.115, 0.178, '杠杆 · 01');
    this.etching(this.lever, 0.22, 0.014, 0.20, 0.043, 0.178, '杆重 120 g');
    this.angleLabel = this.etching(this.lever, 0.14, 0.022, 0.23, 0.077, 0.178, 'θ 0.0°');
    const lampRim = this.turned([[0, -0.003], [0.009, -0.003], [0.010, 0], [0.008, 0.003], [0, 0.003]], this.chrome, this.lever, 0.115, 0.077, 0.181);
    lampRim.rotation.x = Math.PI / 2;
    this.balanceLamp = this.mesh(new THREE.SphereGeometry(0.0057, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xc5eadb, emissive: 0x35b985, emissiveIntensity: 0.45, roughness: 0.25 }), this.lever, 0.115, 0.077, 0.184, 'balance-indicator-lens');
    this.balanceLamp.scale.z = 0.45;
    const reset = this.knob(this.lever, 0.415, 0.077, 0.190, 0.018);
    this.tag(reset, 'reset'); reset.name = 'reset-both-stations';
    this.etching(this.lever, 0.071, 0.014, 0.415, 0.043, 0.178, '复位 ↺');
  }

  public rackX(i: number): number { return -0.4 + i * 0.16; }

  private weight(kg: number, showMass = true): THREE.Group {
    const group = new THREE.Group();
    const ring = this.mesh(new THREE.TorusGeometry(0.008, 0.0017, 8, 32), this.chrome, group, 0, 0, 0.018);
    ring.name = 'hanger-eye';
    this.shaft(group, 0, -0.019, 0.018, 0.0025, 0.026);
    const height = kg === 0.2 ? 0.045 : kg === 0.1 ? 0.032 : 0.022;
    this.turned([[0, -height / 2], [0.018, -height / 2], [0.023, -height / 2 + 0.003], [0.023, -0.003],
      [0.022, -0.002], [0.022, 0.002], [0.023, 0.003], [0.023, height / 2 - 0.003],
      [0.018, height / 2], [0, height / 2]], this.brass, group, 0, -0.035 - height / 2, 0.018);
    if (showMass) this.etching(group, 0.033, 0.013, 0, -0.035 - height / 2, 0.042, `${kg * 1000} g`);
    return group;
  }

  private wheel(parent: THREE.Object3D): THREE.Group {
    const wheel = new THREE.Group();
    parent.add(wheel);
    // Continuous lathed U-groove, relieved web, bearing boss and rolled flanges.
    const profile = [[0.008, -0.011], [0.013, -0.011], [0.015, -0.005], [0.037, -0.005],
      [0.042, -0.011], [0.048, -0.011], [0.049, -0.009], [0.049, -0.006], [0.045, -0.003],
      [0.044, 0], [0.045, 0.003], [0.049, 0.006], [0.049, 0.009], [0.048, 0.011],
      [0.042, 0.011], [0.037, 0.005], [0.015, 0.005], [0.013, 0.011], [0.008, 0.011]];
    const rim = this.turned(profile, this.brass, wheel, 0, 0, 0);
    rim.rotation.x = Math.PI / 2;
    const bearing = this.turned([[0, -0.014], [0.008, -0.014], [0.010, -0.012], [0.010, 0.012], [0.008, 0.014], [0, 0.014]], this.chrome, wheel, 0, 0, 0);
    bearing.rotation.x = Math.PI / 2;
    // Radial engraved slots make angular motion visible without toy-like spokes.
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const slot = this.rounded(0.014, 0.0038, 0.0015, this.groove, wheel, Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.006);
      slot.rotation.z = a;
    }
    this.bolt(wheel, 0, 0, 0.017);
    return wheel;
  }

  private createPulley(): void {
    this.base(this.pulley, 0.79);
    for (const x of [-0.31, 0.31]) {
      this.shaft(this.pulley, x, 0.43, -0.055, 0.009, 0.69);
      this.turned([[0, 0], [0.023, 0], [0.023, 0.006], [0.016, 0.011], [0.013, 0.035], [0, 0.035]], this.silver, this.pulley, x, 0.076, -0.055);
      this.knob(this.pulley, x, 0.715, -0.025, 0.016);
    }
    this.rounded(0.70, 0.046, 0.064, this.silver, this.pulley, 0, 0.804, -0.055, 0.009);
    this.etching(this.pulley, 0.32, 0.022, 0, 0.804, -0.021, '滑轮组 · 02');
    this.anchor = new THREE.Group(); this.pulley.add(this.anchor);
    this.rounded(0.025, 0.027, 0.045, this.silver, this.anchor, 0, 0.023, -0.012);
    this.mesh(new THREE.TorusGeometry(0.006, 0.0018, 8, 24), this.chrome, this.anchor, 0, 0.003, 0.0);
    this.pulley.add(this.movingBlock);
    this.rounded(0.28, 0.019, 0.028, this.silver, this.movingBlock, -0.07, -0.061, -0.024);
    for (let i = 0; i < 2; i++) {
      this.fixedWheels.push(this.wheel(this.pulley));
      this.movingWheels.push(this.wheel(this.movingBlock));
      // Axles carried by front/rear fork plates, bolted into the overhead rail.
      const fork = new THREE.Group();
      fork.name = `fixed-bearing-fork-${i}`;
      this.pulley.add(fork);
      for (const z of [0.057, 0.103]) {
        this.rounded(0.020, 0.055, 0.004, this.silver, fork, 0, 0.020, z);
        this.bolt(fork, 0, 0, z + 0.003);
      }
      const axle = this.shaft(fork, 0, 0, 0.08, 0.004, 0.061); axle.rotation.x = Math.PI / 2;
      const rear = this.rounded(0.022, 0.06, 0.12, this.silver, fork, 0, 0.040, 0.012);
      rear.scale.y = 0.45;
      for (const z of [-0.024, 0.024]) {
        const lowerFork = this.rounded(0.015, 0.061, 0.004, this.silver, this.movingWheels[i], 0, -0.029, z);
        // Fork stays stationary while its sheave rotates; moved to block below.
        this.movingWheels[i].remove(lowerFork);
        lowerFork.name = `moving-fork-${i}`;
        this.movingBlock.add(lowerFork);
      }
    }
    this.hanger = this.weight(0.2, false); this.pulley.add(this.hanger);
    this.hangingMassLabel = this.etching(this.hanger, 0.033, 0.013, 0, -0.058, 0.042, '200 g');
    this.tag(this.hanger, 'load');

    this.pulley.add(this.pullHandle);
    this.tag(this.pullHandle, 'pull');
    this.pullHandle.name = 'free-rope-end-grip';
    this.mesh(new THREE.TorusGeometry(0.014, 0.003, 10, 40), this.chrome, this.pullHandle, 0, -0.014, 0);
    const grip = this.knob(this.pullHandle, 0, -0.04, 0, 0.021);
    grip.scale.set(1.2, 0.6, 1);

    // Real vertical ruler with a moving physical index fixed to the lower block.
    this.rounded(0.033, 0.55, 0.009, this.silver, this.pulley, -0.266, 0.405, 0.049);
    const ruler = this.surface(this.pulley, 0.025, 0.53, -0.266, 0.405, 0.055, '#e2e8f0');
    // Keep ruler texture resolution bounded despite its tall aspect ratio.
    ruler.canvas.width = 128; ruler.canvas.height = 2048;
    ruler.ctx.fillStyle = '#e2e8f0'; ruler.ctx.fillRect(0, 0, 128, 2048);
    ruler.ctx.strokeStyle = '#365368'; ruler.ctx.fillStyle = '#365368'; ruler.ctx.font = '28px Arial';
    for (let mm = -150; mm <= 350; mm += 5) {
      const y = 2048 * (0.670 - (PULLEY_BOTTOM + mm / 1000)) / 0.53;
      ruler.ctx.beginPath(); ruler.ctx.moveTo(mm % 50 === 0 ? 35 : 75, y); ruler.ctx.lineTo(125, y); ruler.ctx.stroke();
      if (mm % 50 === 0) ruler.ctx.fillText(String(mm), 2, y - 5);
    }
    ruler.texture.needsUpdate = true;
    const rulerCuts = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.00025, 0.00035, 1, 0.00007), this.groove, 531);
    const tick = new THREE.Object3D();
    for (let i = 0; i <= 530; i++) {
      const mm = i - 170;
      const length = mm % 50 === 0 ? 0.012 : mm % 10 === 0 ? 0.007 : 0.003;
      tick.position.set(-0.253 - length / 2, 0.14 + i / 1000, 0.0563);
      tick.scale.set(length, 1, 1); tick.updateMatrix(); rulerCuts.setMatrixAt(i, tick.matrix);
    }
    this.pulley.add(rulerCuts);
    this.rounded(0.045, 0.003, 0.006, this.brass, this.movingBlock, -0.236, 0, -0.021);
    this.console(this.pulley, 0.79);
    this.forceDisplay = this.meter(this.pulley, 0.13, -0.155);
    this.heightDisplay = this.meter(this.pulley, 0.13, 0);
    this.distanceDisplay = this.meter(this.pulley, 0.13, 0.155);
    this.modeKnob = this.knob(this.pulley, 0.30, 0.077, 0.19, 0.022); this.tag(this.modeKnob, 'mode');
    this.modeLabel = this.etching(this.pulley, 0.10, 0.016, 0.30, 0.042, 0.178, '2 : 1');
    this.etching(this.pulley, 0.10, 0.015, 0.30, 0.115, 0.178, '倍率');
    this.loadKnob = this.knob(this.pulley, -0.30, 0.077, 0.19, 0.022); this.tag(this.loadKnob, 'load');
    this.loadLabel = this.etching(this.pulley, 0.10, 0.016, -0.30, 0.042, 0.178, '200 g');
    this.etching(this.pulley, 0.10, 0.015, -0.30, 0.115, 0.178, '负载');
    this.etching(this.pulley, 0.22, 0.012, 0, 0.126, 0.178, 'F = G/n · s = nh  /  理想轻绳轻轮');

    // Fixed-capacity dynamic tube: update its vertices only when rope moves.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(256 * 8 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(256 * 8 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let i = 0; i < 255; i++) for (let j = 0; j < 8; j++) {
      const a = i * 8 + j, b = i * 8 + (j + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
    geometry.setIndex(indices);
    this.rope = this.mesh(geometry, this.ropeMaterial, this.pulley, 0, 0, 0, 'continuous-inextensible-rope');
    this.rope.frustumCulled = false;
  }

  public setSnapSlot(slot: number | null): void {
    this.slotGlow.visible = slot !== null;
    if (slot !== null) this.slotGlow.position.x = slot;
  }

  public highlight(object: THREE.Object3D | null): void {
    if (this.hovered === object) return;
    if (this.hovered) this.hovered.traverse(child => {
      const m = (child as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial && child.userData.originalMaterial) {
        (child as THREE.Mesh).material = child.userData.originalMaterial;
        m.dispose(); delete child.userData.originalMaterial;
      }
    });
    this.hovered = object;
    object?.traverse(child => {
      const m = (child as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial) {
        child.userData.originalMaterial = m;
        const glow = m.clone(); glow.emissive.set(0x20a4a0); glow.emissiveIntensity = 0.28;
        (child as THREE.Mesh).material = glow;
      }
    });
  }

  /** Location of a hanging eye, expressed in lever station coordinates. */
  public leverAnchor(slot: number, solver: LeverPulleyDynamics, out = new THREE.Vector3()): THREE.Vector3 {
    const r = slot - solver.pivot;
    return out.set(solver.pivot + r * Math.cos(solver.angle) + 0.023 * Math.sin(solver.angle),
      LEVER_HEIGHT + r * Math.sin(solver.angle) - 0.023 * Math.cos(solver.angle), 0.018);
  }

  public sync(solver: LeverPulleyDynamics, draggedWeight = -1): void {
    this.pivot.position.x = solver.pivot;
    this.beam.position.set(solver.pivot, LEVER_HEIGHT, 0);
    this.beam.rotation.z = solver.angle;
    this.beamBody.position.x = -solver.pivot;
    solver.weights.forEach((weight, i) => {
      if (i === draggedWeight) return;
      const group = this.weightGroups[i];
      if (weight.slot === null) group.position.set(this.rackX(i), 0.178 + (weight.massKg === 0.2 ? 0.012 : weight.massKg === 0.1 ? 0 : -0.010), 0.047);
      else {
        this.leverAnchor(weight.slot, solver, group.position);
        group.position.z = 0; // hanger eye's built-in +18 mm meets the beam hole
      }
    });
    const moments = solver.moments;
    const balanced = Math.abs(moments.net) < 0.002 && Math.abs(solver.angularVelocity) < 0.015;
    this.updateMeter(this.leftMomentDisplay, '左力矩', moments.left.toFixed(3), 'N·m');
    this.updateMeter(this.rightMomentDisplay, '右力矩', moments.right.toFixed(3), 'N·m');
    this.text(this.angleLabel, [`θ ${(solver.angle * 180 / Math.PI).toFixed(1)}°`], true);
    const lampMaterial = this.balanceLamp.material as THREE.MeshStandardMaterial;
    lampMaterial.color.set(balanced ? 0xc5eadb : 0xe8c997);
    lampMaterial.emissive.set(balanced ? 0x35b985 : 0xb98229);
    this.updateRope(solver);
    this.modeKnob.rotation.z = solver.mode === 'fixed' ? -0.7 : solver.mode === 'double' ? 0 : 0.7;
    this.loadKnob.rotation.z = (solver.loadKg - 0.2) * 5;
    this.text(this.modeLabel, [`${solver.strands} : 1`], true);
    this.text(this.loadLabel, [`${(solver.loadKg * 1000).toFixed(0)} g`], true);
    this.text(this.hangingMassLabel, [`${(solver.loadKg * 1000).toFixed(0)} g`], true);
    this.updateMeter(this.forceDisplay, '拉力 F', solver.tension.toFixed(2), 'N', '#c4e7f7');
    this.updateMeter(this.heightDisplay, '升高 h', (solver.lift * 1000).toFixed(0), 'mm');
    this.updateMeter(this.distanceDisplay, '拉绳 s', (solver.pullDistance * 1000).toFixed(0), 'mm');
  }

  private updateRope(solver: LeverPulleyDynamics): void {
    const key = `${solver.mode}:${solver.lift}:${solver.loadKg}`;
    if (key === this.lastRopeKey) return;
    this.lastRopeKey = key;
    const r = SHEAVE_RADIUS, y = PULLEY_BOTTOM + solver.lift, top = PULLEY_TOP;
    const xs = solver.mode === 'quad' ? [-0.16, 0.02] : [-0.10];
    const freeX = solver.mode === 'fixed' ? 0.045 : xs[xs.length - 1] + 3 * r;
    this.pullHandle.position.set(freeX, HANDLE_REST_Y - solver.pullDistance, 0.08);
    this.movingBlock.visible = solver.mode !== 'fixed';
    this.movingBlock.position.set(0, y, 0.08);
    this.hanger.position.set(solver.mode === 'fixed' ? -0.045 : xs.reduce((a, b) => a + b, 0) / xs.length, y - 0.082, 0.062);
    this.hanger.scale.y = 0.8 + solver.loadKg;
    this.anchor.visible = solver.mode !== 'fixed';
    this.anchor.position.set(xs[0] - r, top, 0.08);
    for (let i = 0; i < 2; i++) {
      this.fixedWheels[i].visible = i < (solver.mode === 'quad' ? 2 : 1);
      this.movingWheels[i].visible = solver.mode !== 'fixed' && i < xs.length;
      this.fixedWheels[i].position.set(solver.mode === 'fixed' ? 0 : (xs[i] ?? 0) + 2 * r, top, 0.08);
      this.fixedWheels[i].rotation.z = -(solver.mode === 'fixed' ? solver.lift : solver.lift * 2 * (i + 1)) / r;
      this.movingWheels[i].position.set(xs[i] ?? 0, 0, 0);
      this.movingWheels[i].rotation.z = solver.lift * (2 * i + 1) / r;
      const fork = this.pulley.getObjectByName(`fixed-bearing-fork-${i}`)!;
      fork.position.set(this.fixedWheels[i].position.x, top, 0);
      fork.visible = this.fixedWheels[i].visible;
      this.movingBlock.children.filter(c => c.name === `moving-fork-${i}`).forEach(c => {
        c.position.x = xs[i] ?? 0; c.visible = this.movingWheels[i].visible;
      });
    }
    this.ropePoints.length = 0;
    const point = (x: number, h: number) => this.ropePoints.push(new THREE.Vector3(x, h, 0.08));
    const arc = (cx: number, cy: number, a: number, b: number) => {
      for (let i = 0; i <= 32; i++) { const t = a + (b - a) * i / 32; point(cx + r * Math.cos(t), cy + r * Math.sin(t)); }
    };
    if (solver.mode === 'fixed') {
      point(-r, y - 0.082); point(-r, top); arc(0, top, Math.PI, 0);
    } else {
      point(xs[0] - r, top);
      for (const x of xs) {
        point(x - r, y); arc(x, y, Math.PI, Math.PI * 2); point(x + r, top);
        arc(x + 2 * r, top, Math.PI, 0);
      }
    }
    point(freeX, this.pullHandle.position.y);
    this.writeRopeTube();
  }

  /** Parallel planar normals avoid tube twists at straight/arc junctions. */
  private writeRopeTube(): void {
    const pos = this.rope.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = this.rope.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const points = this.ropePoints;
    for (let i = 0; i < points.length; i++) {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after.x - before.x, dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, nx = -dy / len * Math.cos(a), ny = dx / len * Math.cos(a), nz = Math.sin(a);
        const k = i * 8 + j;
        pos.setXYZ(k, points[i].x + nx * 0.0019, points[i].y + ny * 0.0019, points[i].z + nz * 0.0019);
        normals.setXYZ(k, nx, ny, nz);
      }
    }
    pos.needsUpdate = true; normals.needsUpdate = true;
    this.rope.geometry.setDrawRange(0, (points.length - 1) * 8 * 6);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.highlight(null);
    disposeObjectTree(this.group);
    this.group.clear();
  }
}
