import * as THREE from 'three';

export class Lighting {
  constructor(private scene: THREE.Scene) {
    this.setupLights();
  }

  private setupLights(): void {
    // Reference image uses a neutral white architectural wash.
    const ambientLight = new THREE.AmbientLight(0xf0f4f7, 0.78);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 0.72);
    hemiLight.position.set(0, 5, 0);
    this.scene.add(hemiLight);

    const centerSpot = new THREE.SpotLight(0xfffdf8, 1.0);
    centerSpot.position.set(0, 4.55, 0);
    centerSpot.angle = Math.PI / 2.8;
    centerSpot.penumbra = 0.72;
    centerSpot.decay = 1.2;
    centerSpot.distance = 11;
    centerSpot.castShadow = true;
    centerSpot.shadow.mapSize.width = 1024;
    centerSpot.shadow.mapSize.height = 1024;
    centerSpot.shadow.camera.near = 0.5;
    centerSpot.shadow.camera.far = 8;
    centerSpot.shadow.bias = -0.0003;
    this.scene.add(centerSpot);

    const dirLight = new THREE.DirectionalLight(0xf7fbff, 0.42);
    dirLight.position.set(1.5, 4.5, 2.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const ringRadius = 4.9;
    const ringLightCount = 6;
    for (let i = 0; i < ringLightCount; i++) {
      const angle = (i / ringLightCount) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;

      const pLight = new THREE.PointLight(0xfffbf3, 0.14, 6.5, 1.8);
      pLight.position.set(x, 4.2, z);
      this.scene.add(pLight);
    }

    const rearFill = new THREE.DirectionalLight(0xf5f8fb, 0.28);
    rearFill.position.set(0, 3.8, 1.5);
    rearFill.target.position.set(0, 2.0, 8.2);
    this.scene.add(rearFill);
    this.scene.add(rearFill.target);

    const benchSpot = new THREE.SpotLight(0xfffdf8, 0.72);
    benchSpot.position.set(0, 3.8, 1.1);
    benchSpot.target.position.set(0, 0.9, 0.25);
    benchSpot.angle = Math.PI / 3.2;
    benchSpot.penumbra = 0.72;
    benchSpot.decay = 1.2;
    benchSpot.distance = 8;
    this.scene.add(benchSpot);
    this.scene.add(benchSpot.target);
  }
}
