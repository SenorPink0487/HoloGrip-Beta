import * as THREE from 'three';

export class Lighting {
  constructor(private scene: THREE.Scene) {
    this.setupLights();
  }

  private setupLights(): void {
    // Soft, balanced ambient fill - prevents pitch black shadows without washing out contrast
    const ambientLight = new THREE.AmbientLight(0xf0f4f8, 0.28);
    this.scene.add(ambientLight);

    // Subtle sky-to-floor contrast
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb8c5ce, 0.35);
    hemiLight.position.set(0, 7, 0);
    this.scene.add(hemiLight);

    // Primary oculus sunlight pouring down from the skylight onto the workstation
    const key = new THREE.DirectionalLight(0xfffef8, 1.35);
    key.position.set(0.15, 9.2, 0.3);
    key.target.position.set(0, 0.99, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 18;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    this.scene.add(key.target);

    // Diffuse oculus cone downlight
    const oculus = new THREE.SpotLight(0xffffff, 2.4, 12, Math.PI / 2.8, 0.75, 1.2);
    oculus.position.set(0, 4.38, 0);
    oculus.target.position.set(0, 0.99, 0);
    this.scene.add(oculus);
    this.scene.add(oculus.target);

    // Gentle camera-side fill light for front clarity
    const fill = new THREE.DirectionalLight(0xe8f0f6, 0.25);
    fill.position.set(0, 2.5, 6.0);
    fill.target.position.set(0, 1.2, 0);
    this.scene.add(fill);
    this.scene.add(fill.target);
  }
}
