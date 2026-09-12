import * as THREE from 'three';
import { TextureGenerator } from './Textures';

export class HoloTable {
  public readonly group = new THREE.Group();
  private hologramTime = 0;

  private holoLight: THREE.PointLight;
  private particles: THREE.Points;
  private particleSpeeds: Float32Array;
  private mainScreen: THREE.Mesh;
  private beamCone: THREE.Mesh;

  private mainScreenMat: THREE.MeshBasicMaterial;
  private particlesMat: THREE.PointsMaterial;
  private beamConeMat: THREE.MeshBasicMaterial;

  private targetHoloAlpha = 1.0;
  private currentHoloAlpha = 1.0;

  constructor() {
    this.createTableStructure();
    this.createProjectorEmitter();
    this.createHoloScreens();
    this.createFloatingParticles();
  }

  private createTableStructure(): void {
    // Brushed metallic materials for table pedestal
    const brushedMetalMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3ad,
      metalness: 0.88,
      roughness: 0.25,
      side: THREE.DoubleSide,
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      metalness: 0.8,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });

    // Clean white sci-fi outer beveled tabletop rim
    const whiteRimMat = new THREE.MeshStandardMaterial({
      color: 0xeff3f7,
      metalness: 0.08,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    // Sunken matte dark charcoal inner tabletop disc
    const darkTopMat = new THREE.MeshStandardMaterial({
      color: 0x15181c,
      metalness: 0.2,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    const silverRimMat = new THREE.MeshStandardMaterial({
      color: 0xc8d8e8,
      metalness: 0.85,
      roughness: 0.25,
      side: THREE.DoubleSide,
    });

    // 1. Base plinth sitting on floor
    const basePlinthGeo = new THREE.CylinderGeometry(1.42, 1.46, 0.05, 64);
    const basePlinth = new THREE.Mesh(basePlinthGeo, brushedMetalMat);
    basePlinth.position.y = 0.025;
    basePlinth.receiveShadow = true;
    this.group.add(basePlinth);

    // 2. Inward tapering metallic pedestal base
    const baseConeGeo = new THREE.CylinderGeometry(1.18, 1.42, 0.44, 64);
    const baseCone = new THREE.Mesh(baseConeGeo, brushedMetalMat);
    baseCone.position.y = 0.27;
    baseCone.receiveShadow = true;
    this.group.add(baseCone);

    // 3. Vertical panel seam lines on base cone
    const numSeams = 16;
    for (let i = 0; i < numSeams; i++) {
      const angle = (i / numSeams) * Math.PI * 2;
      const seamGeo = new THREE.BoxGeometry(0.008, 0.44, 0.02);
      const seam = new THREE.Mesh(seamGeo, darkMetalMat);
      const r = 1.3 - (0.44 / 2) * (0.24 / 0.44);
      seam.position.set(Math.cos(angle) * r, 0.27, Math.sin(angle) * r);
      seam.rotation.y = -angle;
      this.group.add(seam);
    }

    // 4. Middle recessed groove ring
    const grooveGeo = new THREE.CylinderGeometry(1.16, 1.16, 0.04, 64);
    const groove = new THREE.Mesh(grooveGeo, darkMetalMat);
    groove.position.y = 0.51;
    this.group.add(groove);

    // 5. Flaring upper pedestal collar
    const upperCollarGeo = new THREE.CylinderGeometry(1.85, 1.16, 0.28, 64);
    const upperCollar = new THREE.Mesh(upperCollarGeo, brushedMetalMat);
    upperCollar.position.y = 0.67;
    this.group.add(upperCollar);

    // 6. Outer White Tabletop Beveled Rim
    const rimFlatGeo = new THREE.RingGeometry(1.58, 2.06, 96);
    const rimFlat = new THREE.Mesh(rimFlatGeo, whiteRimMat);
    rimFlat.rotation.x = -Math.PI / 2;
    rimFlat.position.y = 0.88;
    rimFlat.receiveShadow = true;
    this.group.add(rimFlat);

    // Beveled outer chamfer ring
    const chamferGeo = new THREE.CylinderGeometry(2.06, 2.18, 0.06, 96, 1, true);
    const chamfer = new THREE.Mesh(chamferGeo, whiteRimMat);
    chamfer.position.y = 0.85;
    chamfer.receiveShadow = true;
    this.group.add(chamfer);

    // Outer vertical skirt
    const skirtGeo = new THREE.CylinderGeometry(2.18, 2.18, 0.06, 96, 1, true);
    const skirt = new THREE.Mesh(skirtGeo, whiteRimMat);
    skirt.position.y = 0.79;
    this.group.add(skirt);

    // Under-bevel connecting skirt back to upper collar
    const underBevelGeo = new THREE.CylinderGeometry(2.18, 1.85, 0.08, 96, 1, true);
    const underBevel = new THREE.Mesh(underBevelGeo, brushedMetalMat);
    underBevel.position.y = 0.72;
    this.group.add(underBevel);

    // Inner step down from white rim to dark sunken disc
    const innerStepGeo = new THREE.CylinderGeometry(1.58, 1.58, 0.03, 80, 1, true);
    const innerStep = new THREE.Mesh(innerStepGeo, darkMetalMat);
    innerStep.position.y = 0.865;
    this.group.add(innerStep);

    // 7. Sunken Dark Charcoal / Black Inner Disc
    const darkDiscGeo = new THREE.RingGeometry(0.52, 1.58, 80);
    const darkDisc = new THREE.Mesh(darkDiscGeo, darkTopMat);
    darkDisc.rotation.x = -Math.PI / 2;
    darkDisc.position.y = 0.851;
    darkDisc.receiveShadow = true;
    this.group.add(darkDisc);

    // Refined metallic seam ring
    const seamRingGeo = new THREE.RingGeometry(1.57, 1.585, 80);
    const seamRing = new THREE.Mesh(seamRingGeo, silverRimMat);
    seamRing.rotation.x = -Math.PI / 2;
    seamRing.position.y = 0.852;
    this.group.add(seamRing);
  }

  private createProjectorEmitter(): void {
    const emitterBaseGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.03, 64);
    const emitterBaseMat = new THREE.MeshStandardMaterial({
      color: 0xc8d2dc,
      metalness: 0.92,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const emitterBase = new THREE.Mesh(emitterBaseGeo, emitterBaseMat);
    emitterBase.position.y = 0.865;
    this.group.add(emitterBase);

    // Beveled chrome collar ring
    const collarGeo = new THREE.CylinderGeometry(0.38, 0.48, 0.03, 64);
    const collar = new THREE.Mesh(collarGeo, emitterBaseMat);
    collar.position.y = 0.89;
    this.group.add(collar);

    // Subtle optical frosted glass lens ring
    const lensGeo = new THREE.RingGeometry(0.22, 0.38, 64);
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0xd8e4f0,
      side: THREE.DoubleSide,
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = 0.906;
    this.group.add(lens);

    // Center dark core aperture disc
    const coreGeo = new THREE.CircleGeometry(0.22, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0a1016,
      metalness: 0.8,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.907;
    this.group.add(core);

    // Soft neutral optical projection light column
    const coneGeo = new THREE.CylinderGeometry(0.58, 0.28, 1.05, 48, 1, true);
    this.beamConeMat = new THREE.MeshBasicMaterial({
      color: 0xf0f4fa,
      transparent: true,
      opacity: 0.025,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beamCone = new THREE.Mesh(coneGeo, this.beamConeMat);
    this.beamCone.position.y = 0.91 + 0.525;
    this.group.add(this.beamCone);

    // Subtle neutral optical light
    this.holoLight = new THREE.PointLight(0xe8f0f8, 0.45, 3.5, 2.0);
    this.holoLight.position.set(0, 1.25, 0);
    this.group.add(this.holoLight);
  }

  private createHoloScreens(): void {
    const holoTex = TextureGenerator.createHoloScreenTexture();

    const screenGeo = new THREE.PlaneGeometry(1.68, 0.84);
    this.mainScreenMat = new THREE.MeshBasicMaterial({
      map: holoTex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    this.mainScreen = new THREE.Mesh(screenGeo, this.mainScreenMat);
    this.mainScreen.position.set(0, 1.68, -0.05);
    this.mainScreen.rotation.x = -0.05;
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
      positions[i * 3 + 1] = 0.92 + Math.random() * 0.95;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.15 + Math.random() * 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.particlesMat = new THREE.PointsMaterial({
      color: 0xf2f6fc,
      size: 0.008,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, this.particlesMat);
    this.particleSpeeds = speeds;
    this.group.add(this.particles);
  }

  public hideHologram(): void {
    this.targetHoloAlpha = 0.0;
  }

  public showHologram(): void {
    this.targetHoloAlpha = 1.0;
  }

  public isHologramVisible(): boolean {
    return this.currentHoloAlpha > 0.1;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return [this.mainScreen, this.beamCone];
  }

  public mountBeaker(beakerGroup: THREE.Object3D): void {
    beakerGroup.position.set(0, 0.908, 0);
    this.group.add(beakerGroup);
  }

  public update(delta: number): void {
    this.hologramTime += delta;
    const t = this.hologramTime * 2.0;

    // Smooth transition of hologram transparency
    this.currentHoloAlpha = THREE.MathUtils.lerp(this.currentHoloAlpha, this.targetHoloAlpha, delta * 4.0);

    if (this.mainScreenMat) {
      this.mainScreenMat.opacity = 0.72 * this.currentHoloAlpha;
      const s = Math.max(0.01, this.currentHoloAlpha);
      this.mainScreen.scale.set(s, s, s);
      this.mainScreen.visible = this.currentHoloAlpha > 0.01;
    }

    if (this.beamConeMat) {
      this.beamConeMat.opacity = 0.025 * this.currentHoloAlpha;
      this.beamCone.visible = this.currentHoloAlpha > 0.01;
    }

    if (this.particlesMat) {
      this.particlesMat.opacity = 0.28 * this.currentHoloAlpha;
      this.particles.visible = this.currentHoloAlpha > 0.01;
    }

    if (this.particles && this.currentHoloAlpha > 0.01) {
      const positions = (this.particles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] += this.particleSpeeds[i] * delta;
        if (positions[i * 3 + 1] > 2.0) {
          positions[i * 3 + 1] = 0.92;
          const radius = Math.random() * 0.4;
          const angle = Math.random() * Math.PI * 2;
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 2] = Math.sin(angle) * radius;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.holoLight) {
      this.holoLight.intensity = (0.55 + Math.sin(t * 2.5) * 0.06) * this.currentHoloAlpha;
    }
  }
}
