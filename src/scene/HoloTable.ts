import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';
import { galleryPalette, type GalleryPaletteId } from './gallery/palette.ts';

/** 石材圆桌台面半径（米）。 */
export const HOLO_TABLE_RADIUS = 1.92;
/** 行走时与桌沿保持的距离，含倒角余量。 */
export const HOLO_TABLE_CLEARANCE = 2.02;
/** 台面标高。烧杯与实验台面以此对齐。 */
export const HOLO_TABLE_TOP_Y = 0.99;

export class HoloTable {
  public readonly group = new THREE.Group();
  private hologramTime = 0;

  private holoLight: THREE.PointLight;
  private particles: THREE.Points;
  private particleSpeeds: Float32Array;
  private mainScreen: THREE.Mesh;
  private beamCone: THREE.Mesh;
  private emitterLens: THREE.Mesh;
  private emitterAssembly = new THREE.Group();

  private mainScreenMat: THREE.MeshBasicMaterial;
  private particlesMat: THREE.PointsMaterial;
  private beamConeMat: THREE.MeshBasicMaterial;
  private emitterLensMat: THREE.MeshStandardMaterial;

  private targetHoloAlpha = 0;
  private currentHoloAlpha = 0;
  private isHovered = false;
  private stoneMat!: THREE.MeshPhysicalMaterial;
  private inlayMat!: THREE.MeshStandardMaterial;

  public applyPalette(id: GalleryPaletteId): void {
    const palette = galleryPalette(id);
    this.stoneMat.color.set(palette.tableStone);
    this.inlayMat.color.set(palette.metal);
    this.inlayMat.roughness = palette.metalRoughness;
    this.inlayMat.metalness = palette.metalness;
    this.inlayMat.envMapIntensity = palette.metalEnv;
  }

  constructor() {
    this.createTableStructure();
    this.createProjectorEmitter();
    this.createHoloScreens();
    this.createFloatingParticles();
    this.hideHologram(true);
  }

  private createTableStructure(): void {
    const stone = new THREE.MeshPhysicalMaterial({
      color: 0xf3efe6,
      metalness: 0.02,
      roughness: 0.46,
      clearcoat: 0.12,
      clearcoatRoughness: 0.7,
      reflectivity: 0.28,
      envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    });
    this.stoneMat = stone;
    const aluminum = new THREE.MeshStandardMaterial({
      color: 0xe7ebf0,
      metalness: 0.8,
      roughness: 0.24,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xc6a56e,
      metalness: 0.9,
      roughness: 0.3,
      envMapIntensity: 1.05,
      side: THREE.DoubleSide,
    });
    this.inlayMat = brass;

    const pedestal = new THREE.Mesh(
      new THREE.LatheGeometry(this.pedestalProfile(), 128),
      aluminum,
    );
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    pedestal.name = 'table-pedestal';
    this.group.add(pedestal);

    const tabletop = new THREE.Mesh(
      new THREE.LatheGeometry(this.tableTopProfile(), 160),
      stone,
    );
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    tabletop.name = 'reference-white-tabletop';
    this.group.add(tabletop);

    const inlay = new THREE.Mesh(
      new THREE.RingGeometry(HOLO_TABLE_RADIUS - 0.148, HOLO_TABLE_RADIUS - 0.122, 160),
      brass,
    );
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = HOLO_TABLE_TOP_Y + 0.0016;
    inlay.name = 'table-brass-inlay';
    this.group.add(inlay);
  }

  /** 一支连续收分的铸铝柱，脚部摊开，柱身收腰，在台面板下轻轻展开。 */
  private pedestalProfile(): THREE.Vector2[] {
    const capitalY = HOLO_TABLE_TOP_Y - 0.03;
    const raw: Array<[number, number]> = [
      [0.03, 0.004],
      [0.26, 0.006],
      [0.44, 0.014],
      [0.52, 0.03],
      [0.50, 0.046],
      [0.36, 0.08],
      [0.22, 0.15],
      [0.168, 0.3],
      [0.152, 0.5],
      [0.156, 0.68],
      [0.19, 0.8],
      [0.28, 0.87],
      [0.42, 0.92],
      [0.58, capitalY],
    ];
    return raw.map(([x, y]) => new THREE.Vector2(x, y));
  }

  /** 薄石材圆盘，边缘是一整圈圆角，台面保持平整。 */
  private tableTopProfile(): THREE.Vector2[] {
    const radius = HOLO_TABLE_RADIUS;
    const top = HOLO_TABLE_TOP_Y;
    const thick = 0.044;
    const nose = 0.022;
    const under = top - thick;
    const cx = radius - nose;
    const cy = under + nose;
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.004, under),
      new THREE.Vector2(cx - 0.004, under),
    ];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + Math.PI * (i / steps);
      pts.push(new THREE.Vector2(cx + Math.cos(angle) * nose, cy + Math.sin(angle) * nose));
    }
    pts.push(new THREE.Vector2(0.0008, top));
    return pts;
  }

  private createProjectorEmitter(): void {
    this.emitterAssembly.name = 'hologram-emitter';
    this.emitterAssembly.visible = false;

    const emitterBaseMat = new THREE.MeshStandardMaterial({
      color: 0xd4dde1, metalness: 0.7, roughness: 0.26, side: THREE.DoubleSide,
    });
    const emitterBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.025, 64), emitterBaseMat);
    emitterBase.position.y = 1.0;
    this.emitterAssembly.add(emitterBase);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.028, 64), emitterBaseMat);
    collar.position.y = 1.026;
    this.emitterAssembly.add(collar);

    this.emitterLensMat = new THREE.MeshStandardMaterial({
      color: 0xb8eaff, metalness: 0.42, roughness: 0.2, emissive: 0x8bdfff,
      emissiveIntensity: 0, side: THREE.DoubleSide,
    });
    this.emitterLens = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.36, 64), this.emitterLensMat);
    this.emitterLens.rotation.x = -Math.PI / 2;
    this.emitterLens.position.y = 1.045;
    this.emitterAssembly.add(this.emitterLens);

    this.group.add(this.emitterAssembly);

    this.beamConeMat = new THREE.MeshBasicMaterial({
      color: 0xeaf9ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.beamCone = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.28, 1.05, 48, 1, true), this.beamConeMat);
    this.beamCone.position.y = 1.55;
    this.beamCone.visible = false;
    this.group.add(this.beamCone);

    this.holoLight = new THREE.PointLight(0xbdeeff, 0, 3.2, 2);
    this.holoLight.position.set(0, 1.35, 0);
    this.group.add(this.holoLight);
  }

  private createHoloScreens(): void {
    const holoTex = TextureGenerator.createHoloScreenTexture();
    this.mainScreenMat = new THREE.MeshBasicMaterial({
      map: holoTex, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    this.mainScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.84), this.mainScreenMat);
    this.mainScreen.position.set(0, 1.82, -0.05);
    this.mainScreen.rotation.x = -0.05;
    this.mainScreen.visible = false;
    this.group.add(this.mainScreen);
  }

  private createFloatingParticles(): void {
    const particleCount = 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const radius = Math.random() * 0.4;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 1.04 + Math.random() * 0.95;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.15 + Math.random() * 0.3;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlesMat = new THREE.PointsMaterial({
      color: 0xf2f6fc, size: 0.008, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.particles = new THREE.Points(geometry, this.particlesMat);
    this.particleSpeeds = speeds;
    this.particles.visible = false;
    this.group.add(this.particles);
  }

  public hideHologram(immediate = false): void {
    this.targetHoloAlpha = 0;
    if (immediate) {
      this.currentHoloAlpha = 0;
      this.mainScreenMat.opacity = 0;
      this.mainScreen.visible = false;
      this.beamConeMat.opacity = 0;
      this.beamCone.visible = false;
      this.particlesMat.opacity = 0;
      this.particles.visible = false;
      this.holoLight.intensity = 0;
      this.emitterLensMat.emissiveIntensity = 0;
      this.emitterAssembly.visible = false;
    }
  }

  public showHologram(): void {
    this.targetHoloAlpha = 1;
    this.emitterAssembly.visible = true;
  }

  public setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  public isHologramVisible(): boolean {
    return this.currentHoloAlpha > 0.1;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return [this.mainScreen, this.beamCone, this.emitterLens];
  }

  public mountBeaker(beakerGroup: THREE.Object3D, position?: THREE.Vector3): void {
    beakerGroup.position.copy(position ?? new THREE.Vector3(-0.38, 0.98, 1.1));
    this.group.add(beakerGroup);
  }

  public mountBeakers(leftGroup: THREE.Object3D, rightGroup: THREE.Object3D, leftPos?: THREE.Vector3, rightPos?: THREE.Vector3): void {
    leftGroup.position.copy(leftPos ?? new THREE.Vector3(-0.38, 0.98, 1.1));
    rightGroup.position.copy(rightPos ?? new THREE.Vector3(0.38, 0.98, 1.1));
    this.group.add(leftGroup);
    this.group.add(rightGroup);
  }

  public update(delta: number): void {
    this.hologramTime += delta;
    const t = this.hologramTime * 2;
    this.currentHoloAlpha = THREE.MathUtils.lerp(this.currentHoloAlpha, this.targetHoloAlpha, delta * 4);

    const screenOpacity = (this.isHovered ? 0.9 : 0.72) * this.currentHoloAlpha;
    this.mainScreenMat.opacity = THREE.MathUtils.lerp(this.mainScreenMat.opacity, screenOpacity, delta * 6);
    this.mainScreen.visible = this.currentHoloAlpha > 0.01;

    const beamOpacity = (this.isHovered ? 0.055 : 0.025) * this.currentHoloAlpha;
    this.beamConeMat.opacity = THREE.MathUtils.lerp(this.beamConeMat.opacity, beamOpacity, delta * 6);
    this.beamCone.visible = this.currentHoloAlpha > 0.01;

    this.particlesMat.opacity = 0.28 * this.currentHoloAlpha;
    this.particles.visible = this.currentHoloAlpha > 0.01;
    if (this.particles.visible) {
      const positions = (this.particles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] += this.particleSpeeds[i] * delta;
        if (positions[i * 3 + 1] > 2.0) positions[i * 3 + 1] = 1.04;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    this.holoLight.intensity = (0.36 + Math.sin(t * 2.5) * 0.04) * this.currentHoloAlpha;
    this.emitterLensMat.emissiveIntensity = 0.22 * this.currentHoloAlpha;
    this.emitterAssembly.visible = this.currentHoloAlpha > 0.01;
  }
}
