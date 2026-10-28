import * as THREE from 'three';
import { galleryPalette, type GalleryPaletteId } from './gallery/palette.ts';

export class Lighting {
  private scene: THREE.Scene;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private oculus!: THREE.SpotLight;
  private fill!: THREE.DirectionalLight;
  private ceilingWash!: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setupLights();
  }

  public applyPalette(id: GalleryPaletteId): void {
    const palette = galleryPalette(id);
    this.ambient.color.set(palette.ambient);
    this.ambient.intensity = palette.ambientIntensity;
    this.hemi.color.set(palette.hemiSky);
    this.hemi.groundColor.set(palette.hemiGround);
    this.hemi.intensity = palette.hemiIntensity;
    this.key.color.set(palette.key);
    this.key.intensity = palette.keyIntensity;
    this.oculus.color.set(palette.spot);
    this.oculus.intensity = palette.spotIntensity;
    this.fill.color.set(palette.fill);
    this.fill.intensity = palette.fillIntensity;
    this.ceilingWash.color.set(palette.wash);
    this.ceilingWash.intensity = palette.washIntensity;
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xf7f3eb, 0.34);
    this.ambient = ambientLight;
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfff8f1, 0xd5cec2, 0.42);
    hemiLight.position.set(0, 7, 0);
    this.hemi = hemiLight;
    this.scene.add(hemiLight);

    const key = new THREE.DirectionalLight(0xfff6ee, 0.72);
    this.key = key;
    key.position.set(0.35, 8.4, 0.6);
    key.target.position.set(0, 0.99, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 16;
    key.shadow.camera.left = -3.2;
    key.shadow.camera.right = 3.2;
    key.shadow.camera.top = 3.2;
    key.shadow.camera.bottom = -3.2;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.028;
    this.scene.add(key);
    this.scene.add(key.target);

    const oculus = new THREE.SpotLight(0xfff4e8, 9.5, 14, 0.62, 0.48, 1);
    this.oculus = oculus;
    oculus.position.set(0, 4.15, 0);
    oculus.target.position.set(0, 0.99, 0);
    this.scene.add(oculus);
    this.scene.add(oculus.target);

    const fill = new THREE.DirectionalLight(0xf4efe6, 0.28);
    this.fill = fill;
    fill.position.set(0, 2.8, 6.2);
    fill.target.position.set(0, 1.05, 0);
    this.scene.add(fill);
    this.scene.add(fill.target);

    // 穹顶法线朝下，顶光打不亮它。用一盏朝上的洗墙光把浅碟顶照成和墙面同一块灰泥。
    const ceilingWash = new THREE.DirectionalLight(0xfff7ef, 0.55);
    this.ceilingWash = ceilingWash;
    ceilingWash.position.set(0, 1.2, 0.4);
    ceilingWash.target.position.set(0, 4.3, 0);
    this.scene.add(ceilingWash);
    this.scene.add(ceilingWash.target);
  }
}
