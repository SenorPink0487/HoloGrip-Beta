import * as THREE from 'three';

export class Lighting {
  constructor(private scene: THREE.Scene) {
    this.setupLights();
  }

  private setupLights(): void {
    // High-key cool daylight from the oculus, with a soft floor bounce.
    const ambientLight = new THREE.AmbientLight(0xf4f7fa, 0.34);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc5d0d8, 0.38);
    hemiLight.position.set(0, 6, 0);
    this.scene.add(hemiLight);

    const key = new THREE.DirectionalLight(0xfffdf8, 1.25);
    key.position.set(0.35, 9.2, 0.55);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 18;
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.035;
    this.scene.add(key);
    this.scene.add(key.target);

    const oculus = new THREE.SpotLight(0xfffdf8, 3.2, 12, Math.PI / 3.1, 0.65, 1);
    oculus.position.set(0, 4.05, 0);
    oculus.target.position.set(0, 0.9, 0);
    this.scene.add(oculus);
    this.scene.add(oculus.target);

    const fill = new THREE.DirectionalLight(0xf3f7fb, 0.32);
    fill.position.set(0, 2.8, 7.5);
    fill.target.position.set(0, 1.6, -4);
    this.scene.add(fill);
    this.scene.add(fill.target);
  }
}
