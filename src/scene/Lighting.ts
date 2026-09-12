import * as THREE from 'three';

export class Lighting {
  constructor(private scene: THREE.Scene) {
    this.setupLights();
  }

  private setupLights(): void {
    // 1. Soft neutral ambient light
    const ambientLight = new THREE.AmbientLight(0xd5e0ec, 0.45);
    this.scene.add(ambientLight);

    // 2. Hemisphere light (crisp white ceiling bounce, deep slate ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xf2f7ff, 0x303844, 0.42);
    hemiLight.position.set(0, 5, 0);
    this.scene.add(hemiLight);

    // 3. Overhead center spotlight directly illuminating the center table
    const centerSpot = new THREE.SpotLight(0xffffff, 1.35);
    centerSpot.position.set(0, 4.5, 0);
    centerSpot.angle = Math.PI / 3.2;
    centerSpot.penumbra = 0.5;
    centerSpot.decay = 1.1;
    centerSpot.distance = 10;
    centerSpot.castShadow = true;
    centerSpot.shadow.mapSize.width = 1024;
    centerSpot.shadow.mapSize.height = 1024;
    centerSpot.shadow.camera.near = 0.5;
    centerSpot.shadow.camera.far = 8;
    centerSpot.shadow.bias = -0.0003;
    this.scene.add(centerSpot);

    // 4. Secondary directional fill
    const dirLight = new THREE.DirectionalLight(0xf5f8ff, 0.65);
    dirLight.position.set(2, 4.5, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 5. Perimeter ceiling downlight fill (4 balanced point lights)
    const ringRadius = 4.8;
    const ringLightCount = 4;
    for (let i = 0; i < ringLightCount; i++) {
      const angle = (i / ringLightCount) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius;

      const pLight = new THREE.PointLight(0xffffff, 0.32, 7.0, 1.5);
      pLight.position.set(x, 4.2, z);
      this.scene.add(pLight);
    }
  }
}
