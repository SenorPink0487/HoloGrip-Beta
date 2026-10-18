import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';

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

  constructor() {
    this.createTableStructure();
    this.createProjectorEmitter();
    this.createHoloScreens();
    this.createFloatingParticles();
    this.hideHologram(true);
  }

  private createTableStructure(): void {
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xdbe3e8, metalness: 0.12, roughness: 0.38, side: THREE.DoubleSide,
    });
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x90a2ac, metalness: 0.22, roughness: 0.40, side: THREE.DoubleSide,
    });
    // 纯白缎面复合材质台面，具备高光反射质感
    const whiteMat = new THREE.MeshPhysicalMaterial({
      color: 0xf2f6f9,
      metalness: 0.02,
      roughness: 0.28,
      clearcoat: 0.70,
      clearcoatRoughness: 0.16,
      reflectivity: 0.82,
      side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xdde5ec, metalness: 0.25, roughness: 0.28, side: THREE.DoubleSide,
    });
    const basePlinthMat = new THREE.MeshStandardMaterial({
      color: 0x1e2428, metalness: 0.65, roughness: 0.35, side: THREE.DoubleSide,
    });

    // 贴地深色内凹阴影基座
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.28, 0.024, 96), basePlinthMat);
    plinth.position.y = 0.012;
    plinth.receiveShadow = true;
    this.group.add(plinth);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.20, 1.26, 0.045, 96), pedestalMat);
    foot.position.y = 0.042;
    foot.receiveShadow = true;
    foot.castShadow = true;
    this.group.add(foot);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.14, 0.58, 96), pedestalMat);
    pedestal.position.y = 0.355;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this.group.add(pedestal);

    const pedestalSeam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.56, 0.012), seamMat);
    pedestalSeam.position.set(0, 0.35, 1.09);
    this.group.add(pedestalSeam);

    // 流线型圆盘台面，由底向上至台面中心 (确保顶点法线朝外向上，保持表面饱满凸起，严禁背面剔除致使台面下凹)
    const profile = [
      new THREE.Vector2(1.16, 0.64),
      new THREE.Vector2(1.48, 0.67),
      new THREE.Vector2(2.16, 0.74),
      new THREE.Vector2(2.40, 0.82),
      new THREE.Vector2(2.42, 0.90),
      new THREE.Vector2(2.34, 0.968),
      new THREE.Vector2(2.18, 0.99),
      new THREE.Vector2(0.02, 0.99),
    ];
    const tabletop = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), whiteMat);
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    tabletop.name = 'reference-white-tabletop';
    this.group.add(tabletop);

    const topSeam = new THREE.Mesh(new THREE.TorusGeometry(2.20, 0.01, 8, 128), edgeMat);
    topSeam.rotation.x = Math.PI / 2;
    topSeam.position.y = 0.992;
    this.group.add(topSeam);
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
