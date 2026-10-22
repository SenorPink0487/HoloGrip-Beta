import * as THREE from 'three';

export class Lighting {
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setupLights();
  }

  private setupLights(): void {
    // 柔和均衡的环境光补光，避免阴影死黑并维持画面对比度
    const ambientLight = new THREE.AmbientLight(0xf0f4f8, 0.28);
    this.scene.add(ambientLight);

    // 天空到地面的微弱冷暖对比半球光
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb8c5ce, 0.35);
    hemiLight.position.set(0, 7, 0);
    this.scene.add(hemiLight);

    // 自穹顶天窗倾泻至工作台面的主方向光
    const key = new THREE.DirectionalLight(0xfffef8, 1.35);
    key.position.set(0.15, 9.2, 0.3);
    key.target.position.set(0, 0.99, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 18;
    key.shadow.camera.left = -3.6;
    key.shadow.camera.right = 3.6;
    key.shadow.camera.top = 3.6;
    key.shadow.camera.bottom = -3.6;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    this.scene.add(key.target);

    // 穹顶天窗漫射下照聚光灯
    const oculus = new THREE.SpotLight(0xffffff, 2.4, 12, Math.PI / 2.8, 0.75, 1.2);
    oculus.position.set(0, 4.38, 0);
    oculus.target.position.set(0, 0.99, 0);
    this.scene.add(oculus);
    this.scene.add(oculus.target);

    // 摄像机方向的柔和辅助补光，增强正面清晰度
    const fill = new THREE.DirectionalLight(0xe8f0f6, 0.25);
    fill.position.set(0, 2.5, 6.0);
    fill.target.position.set(0, 1.2, 0);
    this.scene.add(fill);
    this.scene.add(fill.target);
  }
}
