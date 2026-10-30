import * as THREE from 'three';
import { createKnurledBand } from '../em/conductorRod.ts';
import {
  buildPrecisionOpticalRail,
  createChamferedBlockGeometry,
  type OpticalRailFinish,
} from './OpticalBenchRail.ts';
import {
  OpticalPhysics,
  PRISM_MATERIALS,
  type PrismMaterialType,
  type PrismSpectrumAnalysis,
} from './OpticalPhysics.ts';

export const DISPERSION_MATERIALS: PrismMaterialType[] = [
  'quartz',
  'crown',
  'bariumFlint',
  'flint',
  'diamond',
];

/** 光具座演示姿态：黄光以固定仰角落到屏心，色带张角用真实偏向角之差。 */
export const DISPERSION_BENCH = {
  beamY: 0.2,
  prismX: 0.02,
  lampX: -0.46,
  slitX: -0.16,
  faceMidX: 0.018,
  faceMidY: 0.0104,
  basePitchDeg: 14,
  uprightIncidentDeg: 58,
  screenHeight: 0.22,
  screenWidth: 0.24,
  screenCenterY: 0.29,
  minScreenDistanceM: 0.2,
  maxScreenDistanceM: 0.5,
  defaultScreenDistanceM: 0.38,
  minIncidentDeg: 42,
  maxIncidentDeg: 82,
};

export interface DispersionRayHit {
  wavelengthNm: number;
  name: string;
  hex: number;
  css: string;
  deviationDeg: number;
  refractiveIndex: number;
  tir: boolean;
  pitchDeg: number;
  hitY: number;
  onScreen: boolean;
}

export interface DispersionProjection {
  analysis: PrismSpectrumAnalysis;
  referenceDeviationDeg: number;
  rays: DispersionRayHit[];
  red: DispersionRayHit;
  violet: DispersionRayHit;
  spectrumSpanM: number;
}

export interface OpticalDispersionTelemetry {
  lampOn: boolean;
  incidentAngleDeg: number;
  material: PrismMaterialType;
  materialName: string;
  slitWidthMm: number;
  screenDistanceM: number;
  yellowDeviationDeg: number;
  angularDispersionDeg: number;
  abbeNumber: number;
  hasPartialTIR: boolean;
  hasFullTIR: boolean;
  redHitY: number;
  violetHitY: number;
  redOnScreen: boolean;
  violetOnScreen: boolean;
  spectrumSpanM: number;
}

export interface OpticalDispersionOptions {
  lampOn?: boolean;
  incidentAngleDeg?: number;
  material?: PrismMaterialType;
  slitWidthMm?: number;
  screenDistanceM?: number;
}

function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } catch {
    return null;
  }
}

function tiltOf(incidentAngleDeg: number): number {
  return (incidentAngleDeg - DISPERSION_BENCH.uprightIncidentDeg) * 0.55;
}

function facePoint(incidentAngleDeg: number, side: 1 | -1): THREE.Vector3 {
  const tilt = THREE.MathUtils.degToRad(tiltOf(incidentAngleDeg));
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const lx = side * DISPERSION_BENCH.faceMidX;
  const ly = DISPERSION_BENCH.faceMidY;
  const centroidY = DISPERSION_BENCH.beamY - ly;
  return new THREE.Vector3(
    DISPERSION_BENCH.prismX + lx * c - ly * s,
    centroidY + lx * s + ly * c,
    0,
  );
}

function exitPoint(incidentAngleDeg: number): THREE.Vector3 {
  return facePoint(incidentAngleDeg, 1);
}

/**
 * 把柯西色散的偏向角投到光具座观察屏上。
 * 黄光最小偏向角对应屏幕中线附近的演示仰角，紫光偏折更大，因此落在更上方。
 */
export function projectDispersionFan(
  incidentAngleDeg: number,
  material: PrismMaterialType,
  screenDistanceM: number,
): DispersionProjection {
  const analysis = OpticalPhysics.calculatePrismSpectrum(incidentAngleDeg, 60, material);
  const referenceDeviationDeg = analysis.yellowRay.minimumDeviationAngleDeg;
  const exit = exitPoint(incidentAngleDeg);
  const screenX = DISPERSION_BENCH.prismX + screenDistanceM;
  const halfH = DISPERSION_BENCH.screenHeight * 0.5;
  const y0 = DISPERSION_BENCH.screenCenterY - halfH;
  const y1 = DISPERSION_BENCH.screenCenterY + halfH;

  const rays: DispersionRayHit[] = analysis.bands.map((band) => {
    const pitchDeg = DISPERSION_BENCH.basePitchDeg + (band.deviationAngleDeg - referenceDeviationDeg);
    const phi = THREE.MathUtils.degToRad(pitchDeg);
    const cosPhi = Math.cos(phi);
    const travel = cosPhi > 0.05 ? (screenX - exit.x) / cosPhi : 0;
    const hitY = exit.y + travel * Math.sin(phi);
    const onScreen = !band.isTotalInternalReflection && travel > 0 && hitY >= y0 && hitY <= y1;
    return {
      wavelengthNm: band.wavelengthNm,
      name: band.name,
      hex: band.hex,
      css: band.css,
      deviationDeg: band.deviationAngleDeg,
      refractiveIndex: band.refractiveIndex,
      tir: band.isTotalInternalReflection,
      pitchDeg,
      hitY,
      onScreen,
    };
  });

  const red = rays[0];
  const violet = rays[rays.length - 1];
  const spectrumSpanM = red.onScreen && violet.onScreen ? violet.hitY - red.hitY : 0;
  return { analysis, referenceDeviationDeg, rays, red, violet, spectrumSpanM };
}

/**
 * 光具座式光的色散实验台：灯箱、狭缝、直立三棱镜、观察屏。
 * 导轨沿 X 轴，刻度与旋钮朝向操作者 (+Z)。
 * 器材用枪灰阳极铝、哑光不锈钢和低饱和香槟铜，避开漂白银与亮橙金。
 */
const QUIET_RAIL: OpticalRailFinish = {
  satin: 0x7e8790,
  skirt: 0x6e777f,
  channel: 0x5e676f,
  chrome: 0xaeb6be,
  brass: 0xb5a28c,
  scaleBackground: '#9aa3ab',
  scaleEdge: '#6e777f',
  scaleTick: '#1c2228',
  scaleAccent: '#b5a28c',
};
export class OpticalDispersionBenchMesh {
  public readonly group = new THREE.Group();

  public readonly railLength = 1.16;
  public readonly railWidth = 0.07;
  public readonly railHeight = 0.042;

  public lampOn = true;
  public incidentAngleDeg = DISPERSION_BENCH.uprightIncidentDeg;
  public material: PrismMaterialType = 'flint';
  public slitWidthMm = 1.0;
  public screenDistanceM = DISPERSION_BENCH.defaultScreenDistanceM;

  public prismMount!: THREE.Group;
  public prismTilt!: THREE.Group;
  public screenCarrier!: THREE.Group;
  private beamGroup = new THREE.Group();
  private jawTop!: THREE.Mesh;
  private jawBottom!: THREE.Mesh;
  private filament!: THREE.Mesh;
  private lampGlow!: THREE.PointLight;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  private plateCanvas: HTMLCanvasElement | null = null;
  private plateTexture: THREE.CanvasTexture | null = null;
  private projection: DispersionProjection;

  private readonly satin = new THREE.MeshStandardMaterial({
    color: 0x7e8790,
    metalness: 0.58,
    roughness: 0.38,
  });
  private readonly chrome = new THREE.MeshStandardMaterial({
    color: 0xaeb6be,
    metalness: 0.72,
    roughness: 0.24,
  });
  private readonly brass = new THREE.MeshStandardMaterial({
    color: 0xb5a28c,
    metalness: 0.7,
    roughness: 0.34,
  });
  private readonly paper = new THREE.MeshBasicMaterial({ color: 0xffffff });

  constructor(options: OpticalDispersionOptions = {}) {
    this.group.name = 'OpticalDispersionBenchMesh';
    if (options.lampOn !== undefined) this.lampOn = options.lampOn;
    if (options.incidentAngleDeg !== undefined) this.incidentAngleDeg = options.incidentAngleDeg;
    if (options.material) this.material = options.material;
    if (options.slitWidthMm !== undefined) this.slitWidthMm = options.slitWidthMm;
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;

    this.projection = projectDispersionFan(this.incidentAngleDeg, this.material, this.screenDistanceM);
    this.buildRail();
    this.buildLamp();
    this.buildSlit();
    this.buildPrism();
    this.buildScreen();
    this.beamGroup.name = 'DispersionBeams';
    this.group.add(this.beamGroup);
    this.syncAll();
  }

  public getProjection(): DispersionProjection {
    return this.projection;
  }

  public getTelemetry(): OpticalDispersionTelemetry {
    const spec = PRISM_MATERIALS[this.material];
    const { analysis, red, violet, spectrumSpanM } = this.projection;
    return {
      lampOn: this.lampOn,
      incidentAngleDeg: this.incidentAngleDeg,
      material: this.material,
      materialName: spec.name,
      slitWidthMm: this.slitWidthMm,
      screenDistanceM: this.screenDistanceM,
      yellowDeviationDeg: analysis.yellowRay.deviationAngleDeg,
      angularDispersionDeg: analysis.angularDispersionDeg,
      abbeNumber: analysis.abbeNumber,
      hasPartialTIR: analysis.hasPartialTIR,
      hasFullTIR: analysis.hasFullTIR,
      redHitY: red.hitY,
      violetHitY: violet.hitY,
      redOnScreen: red.onScreen,
      violetOnScreen: violet.onScreen,
      spectrumSpanM,
    };
  }

  public getScreenX(): number {
    return DISPERSION_BENCH.prismX + this.screenDistanceM;
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    const found: THREE.Object3D[] = [];
    this.group.traverse((obj) => {
      if (obj.userData?.interactiveId) found.push(obj);
    });
    return found;
  }

  public setLampOn(on: boolean): void {
    this.lampOn = on;
    this.syncAll();
  }

  public setIncidentAngle(deg: number): void {
    this.incidentAngleDeg = THREE.MathUtils.clamp(
      deg,
      DISPERSION_BENCH.minIncidentDeg,
      DISPERSION_BENCH.maxIncidentDeg,
    );
    this.syncAll();
  }

  public setMaterial(material: PrismMaterialType): void {
    this.material = PRISM_MATERIALS[material] ? material : 'flint';
    this.syncAll();
  }

  public cycleMaterial(): PrismMaterialType {
    const index = DISPERSION_MATERIALS.indexOf(this.material);
    const next = DISPERSION_MATERIALS[(index + 1) % DISPERSION_MATERIALS.length];
    this.setMaterial(next);
    return next;
  }

  public setSlitWidth(mm: number): void {
    this.slitWidthMm = THREE.MathUtils.clamp(mm, 0.4, 3.5);
    this.syncAll();
  }

  public setScreenDistance(meters: number): void {
    this.screenDistanceM = THREE.MathUtils.clamp(
      meters,
      DISPERSION_BENCH.minScreenDistanceM,
      DISPERSION_BENCH.maxScreenDistanceM,
    );
    this.syncAll();
  }

  public setScreenX(x: number): void {
    this.setScreenDistance(x - DISPERSION_BENCH.prismX);
  }

  public update(elapsed: number): void {
    if (!this.filament) return;
    const glow = this.lampOn ? 1.15 + Math.sin(elapsed * 7.5) * 0.12 : 0.02;
    const mat = this.filament.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = glow;
    this.lampGlow.intensity = this.lampOn ? 0.55 + Math.sin(elapsed * 7.5) * 0.06 : 0;
  }

  public dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) geos.add(mesh.geometry);
      const material = mesh.material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const entry of list) {
        mats.add(entry);
        const mapped = entry as THREE.MeshStandardMaterial;
        if (mapped.map) textures.add(mapped.map);
      }
    });
    geos.forEach((geo) => geo.dispose());
    mats.forEach((mat) => mat.dispose());
    textures.forEach((tex) => tex.dispose());
    this.lampGlow?.dispose();
  }

  private syncAll(): void {
    this.projection = projectDispersionFan(this.incidentAngleDeg, this.material, this.screenDistanceM);
    this.prismTilt.rotation.z = THREE.MathUtils.degToRad(tiltOf(this.incidentAngleDeg));
    this.screenCarrier.position.x = this.getScreenX();
    const spec = PRISM_MATERIALS[this.material];
    this.glassMat.color.setHex(spec.tintHex);
    this.glassMat.ior = spec.nd;
    this.glassMat.emissive.setHex(spec.emissiveHex);
    const gap = 0.004 + this.slitWidthMm * 0.0022;
    this.jawTop.position.y = gap * 0.5 + 0.028;
    this.jawBottom.position.y = -gap * 0.5 - 0.028;
    this.paintPlate();
    this.paintScreen();
    this.rebuildBeams();
  }

  private buildRail(): void {
    const rail = buildPrecisionOpticalRail({
      length: this.railLength,
      width: this.railWidth,
      height: this.railHeight,
      name: 'DispersionRail',
      finish: QUIET_RAIL,
    });
    this.group.add(rail.group);
  }

  private addCarrier(x: number, name: string, id: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, 0);
    group.userData.interactiveId = id;
    const shoe = new THREE.Mesh(createChamferedBlockGeometry(0.07, 0.016, 0.078, 0.0016), this.satin);
    shoe.position.set(0, this.railHeight + 0.008, 0);
    shoe.castShadow = true;
    shoe.userData.interactiveId = id;
    group.add(shoe);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 24), this.chrome);
    post.position.set(0, this.railHeight + 0.062, 0);
    post.castShadow = true;
    group.add(post);
    const collar = new THREE.Mesh(createKnurledBand(0.011, 0.012), this.brass);
    collar.position.set(0, this.railHeight + 0.03, 0);
    group.add(collar);
    const index = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.014, 0.002), this.brass);
    index.position.set(0, this.railHeight + 0.004, 0.04);
    group.add(index);
    this.group.add(group);
    return group;
  }

  private buildLamp(): void {
    const mount = this.addCarrier(DISPERSION_BENCH.lampX, 'LampCarrier', 'lamp_switch');
    const housing = new THREE.Mesh(createChamferedBlockGeometry(0.092, 0.084, 0.078, 0.003), this.satin);
    housing.position.set(0, DISPERSION_BENCH.beamY, 0);
    housing.castShadow = true;
    housing.userData.interactiveId = 'lamp_switch';
    mount.add(housing);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 10, 28), this.brass);
    bezel.position.set(0.047, DISPERSION_BENCH.beamY, 0);
    bezel.rotation.y = Math.PI / 2;
    mount.add(bezel);

    this.filament = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff4d6,
        emissive: 0xffb020,
        emissiveIntensity: 1.2,
        roughness: 0.4,
      }),
    );
    this.filament.position.set(0.04, DISPERSION_BENCH.beamY, 0);
    mount.add(this.filament);

    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 0.012, 20),
      new THREE.MeshStandardMaterial({ color: 0xb5a28c, metalness: 0.55, roughness: 0.36, emissive: 0x6b5340, emissiveIntensity: 0.06 }),
    );
    throat.rotation.z = Math.PI / 2;
    throat.position.set(0.05, DISPERSION_BENCH.beamY, 0);
    mount.add(throat);

    for (let i = 0; i < 5; i++) {
      const louver = new THREE.Mesh(
        new THREE.BoxGeometry(0.002, 0.004, 0.04),
        this.satin,
      );
      louver.position.set(-0.047, DISPERSION_BENCH.beamY - 0.02 + i * 0.01, 0);
      mount.add(louver);
    }

    const rocker = new THREE.Mesh(createChamferedBlockGeometry(0.016, 0.01, 0.008, 0.001), this.brass);
    rocker.name = 'LampSwitch';
    rocker.userData.interactiveId = 'lamp_switch';
    rocker.position.set(0, DISPERSION_BENCH.beamY - 0.02, 0.041);
    mount.add(rocker);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.04, DISPERSION_BENCH.beamY - 0.02, 0),
      new THREE.Vector3(-0.07, 0.08, 0.02),
      new THREE.Vector3(-0.05, 0.045, 0.03),
    ]);
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 10, 0.004, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x4e565e, roughness: 0.62, metalness: 0.08 }),
    );
    mount.add(cable);

    this.lampGlow = new THREE.PointLight(0xffcc88, 0.55, 0.7, 2);
    this.lampGlow.position.set(0.06, DISPERSION_BENCH.beamY, 0);
    mount.add(this.lampGlow);
  }

  private buildSlit(): void {
    const mount = this.addCarrier(DISPERSION_BENCH.slitX, 'SlitCarrier', 'slit_micrometer');
    const plate = new THREE.Group();
    plate.position.set(0, DISPERSION_BENCH.beamY, 0);
    plate.rotation.y = -0.55;
    mount.add(plate);

    const frame = new THREE.Mesh(createChamferedBlockGeometry(0.012, 0.14, 0.09, 0.0014), this.satin);
    frame.userData.interactiveId = 'slit_micrometer';
    frame.castShadow = true;
    plate.add(frame);

    this.jawTop = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.07), this.chrome);
    this.jawBottom = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.07), this.chrome);
    this.jawTop.userData.interactiveId = 'slit_micrometer';
    this.jawBottom.userData.interactiveId = 'slit_micrometer';
    plate.add(this.jawTop);
    plate.add(this.jawBottom);

    const knob = new THREE.Mesh(createKnurledBand(0.011, 0.016), this.brass);
    knob.name = 'SlitMicrometer';
    knob.userData.interactiveId = 'slit_micrometer';
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0, -0.02, 0.055);
    plate.add(knob);
  }

  private buildPrism(): void {
    this.prismMount = new THREE.Group();
    this.prismMount.name = 'PrismMount';
    this.prismMount.position.set(DISPERSION_BENCH.prismX, 0, 0);
    this.group.add(this.prismMount);

    const shoe = new THREE.Mesh(createChamferedBlockGeometry(0.09, 0.016, 0.09, 0.0018), this.satin);
    shoe.position.set(0, this.railHeight + 0.008, 0);
    shoe.userData.interactiveId = 'prism_turntable';
    this.prismMount.add(shoe);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 24), this.chrome);
    post.position.set(0, this.railHeight + 0.07, 0);
    this.prismMount.add(post);

    const collar = new THREE.Mesh(createKnurledBand(0.016, 0.014), this.brass);
    collar.name = 'MaterialCollar';
    collar.userData.interactiveId = 'material_collar';
    collar.position.set(0, this.railHeight + 0.034, 0);
    this.prismMount.add(collar);

    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.008, 32), this.brass);
    table.position.set(0, DISPERSION_BENCH.beamY - 0.048, 0);
    table.userData.interactiveId = 'prism_turntable';
    this.prismMount.add(table);

    this.prismTilt = new THREE.Group();
    this.prismTilt.name = 'PrismTilt';
    this.prismTilt.position.set(0, DISPERSION_BENCH.beamY - DISPERSION_BENCH.faceMidY, 0);
    this.prismTilt.userData.interactiveId = 'prism_turntable';
    this.prismMount.add(this.prismTilt);

    const side = 0.072;
    const h = side * Math.sqrt(3) / 2;
    const shape = new THREE.Shape();
    shape.moveTo(0, (2 / 3) * h);
    shape.lineTo(-side / 2, -(1 / 3) * h);
    shape.lineTo(side / 2, -(1 / 3) * h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.042,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.0014,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -0.021);
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8d0d8,
      metalness: 0,
      roughness: 0.04,
      transmission: 0.9,
      thickness: 0.06,
      ior: 1.72,
      transparent: true,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.035,
    });
    const glass = new THREE.Mesh(geo, this.glassMat);
    glass.name = 'DispersionPrism';
    glass.userData.interactiveId = 'prism_turntable';
    glass.castShadow = true;
    this.prismTilt.add(glass);

    this.plateCanvas = safeCanvas(512, 220);
    if (this.plateCanvas) {
      this.plateTexture = new THREE.CanvasTexture(this.plateCanvas);
      this.plateTexture.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07, 0.03),
        new THREE.MeshStandardMaterial({ map: this.plateTexture, roughness: 0.4, metalness: 0.15 }),
      );
      plate.position.set(0, this.railHeight + 0.055, 0.05);
      this.prismMount.add(plate);
    }
  }

  private buildScreen(): void {
    this.screenCarrier = this.addCarrier(this.getScreenX(), 'ScreenCarrier', 'screen_carrier');
    const panel = new THREE.Group();
    panel.position.set(0, DISPERSION_BENCH.screenCenterY, 0);
    panel.rotation.y = -0.38;
    panel.userData.interactiveId = 'screen_carrier';
    this.screenCarrier.add(panel);

    const board = new THREE.Mesh(
      createChamferedBlockGeometry(DISPERSION_BENCH.screenWidth + 0.02, DISPERSION_BENCH.screenHeight + 0.02, 0.01, 0.002),
      this.satin,
    );
    board.userData.interactiveId = 'screen_carrier';
    board.castShadow = true;
    panel.add(board);

    this.screenCanvas = safeCanvas(640, 720);
    const mat = this.paper;
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.colorSpace = THREE.SRGBColorSpace;
      mat.map = this.screenTexture;
    }
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(DISPERSION_BENCH.screenWidth, DISPERSION_BENCH.screenHeight),
      mat,
    );
    face.name = 'DispersionScreen';
    face.position.set(0, 0, 0.006);
    face.userData.interactiveId = 'screen_carrier';
    panel.add(face);

    const grip = new THREE.Mesh(createKnurledBand(0.01, 0.02), this.brass);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, DISPERSION_BENCH.screenHeight * 0.5 + 0.012, 0);
    grip.userData.interactiveId = 'screen_carrier';
    panel.add(grip);
  }

  private paintPlate(): void {
    const ctx = this.plateCanvas?.getContext('2d');
    if (!ctx || !this.plateCanvas || !this.plateTexture) return;
    const { width, height } = this.plateCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#4a525a';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#b5a28c';
    ctx.fillRect(0, 0, width, 8);
    ctx.fillStyle = '#f4f1eb';
    ctx.font = 'bold 64px "SF Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.incidentAngleDeg.toFixed(1)}°`, width / 2, height * 0.42);
    ctx.fillStyle = '#d4c8b8';
    ctx.font = 'bold 36px "PingFang SC", sans-serif';
    const spec = PRISM_MATERIALS[this.material];
    ctx.fillText(`${spec.nameEn.split(' ')[0]}  Δδ ${this.projection.analysis.angularDispersionDeg.toFixed(2)}°`, width / 2, height * 0.78);
    this.plateTexture.needsUpdate = true;
  }

  private paintScreen(): void {
    const ctx = this.screenCanvas?.getContext('2d');
    if (!ctx || !this.screenCanvas || !this.screenTexture) return;
    const { width, height } = this.screenCanvas;
    ctx.fillStyle = '#e7e2d8';
    ctx.fillRect(0, 0, width, height);
    if (!this.lampOn) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    const y0 = DISPERSION_BENCH.screenCenterY - DISPERSION_BENCH.screenHeight * 0.5;
    const stripe = 8 + this.slitWidthMm * 14;
    for (const ray of this.projection.rays) {
      if (!ray.onScreen) continue;
      const v = (ray.hitY - y0) / DISPERSION_BENCH.screenHeight;
      const py = (1 - v) * height;
      ctx.fillStyle = ray.css;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(width * 0.28, py - stripe * 0.5, width * 0.44, stripe);
    }
    ctx.globalAlpha = 1;
    this.screenTexture.needsUpdate = true;
  }

  private rebuildBeams(): void {
    while (this.beamGroup.children.length > 0) {
      const child = this.beamGroup.children[0] as THREE.Mesh;
      this.beamGroup.remove(child);
      child.geometry?.dispose();
      const material = child.material as THREE.Material | undefined;
      material?.dispose();
    }
    if (!this.lampOn) return;

    const entrance = facePoint(this.incidentAngleDeg, -1);
    this.addBeam(
      new THREE.Vector3(DISPERSION_BENCH.lampX + 0.06, DISPERSION_BENCH.beamY, 0),
      new THREE.Vector3(DISPERSION_BENCH.slitX, DISPERSION_BENCH.beamY, 0),
      0xfff1c7,
      0.0045,
    );
    this.addBeam(
      new THREE.Vector3(DISPERSION_BENCH.slitX, DISPERSION_BENCH.beamY, 0),
      entrance,
      0xfff1c7,
      0.0032,
    );

    const exit = exitPoint(this.incidentAngleDeg);
    const screenX = this.getScreenX();
    for (const ray of this.projection.rays) {
      if (ray.tir) {
        const stub = exit.clone();
        stub.y -= 0.028;
        stub.x += 0.01;
        this.addBeam(exit, stub, ray.hex, 0.0022);
        continue;
      }
      const phi = THREE.MathUtils.degToRad(ray.pitchDeg);
      const travel = (screenX - exit.x) / Math.max(0.05, Math.cos(phi));
      const end = exit.clone().add(new THREE.Vector3(Math.cos(phi) * travel, Math.sin(phi) * travel, 0));
      if (!ray.onScreen) end.y = THREE.MathUtils.clamp(
        end.y,
        DISPERSION_BENCH.screenCenterY - DISPERSION_BENCH.screenHeight * 0.65,
        DISPERSION_BENCH.screenCenterY + DISPERSION_BENCH.screenHeight * 0.65,
      );
      this.addBeam(exit, end, ray.hex, ray.onScreen ? 0.0034 : 0.0016);
    }
  }

  private addBeam(start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number): void {
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 0.004) return;
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 10);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.scale.set(1, length, 1);
    mesh.raycast = () => {};
    this.beamGroup.add(mesh);
  }
}
