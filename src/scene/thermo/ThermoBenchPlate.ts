import * as THREE from 'three';

export class ThermoBenchPlate {
  public group: THREE.Group;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ThermoBenchPlate';
    this.build();
  }

  private build(): void {
    // 1. 航空级阳极氧化铝光学底板 (0.9m x 0.45m x 0.024m)
    const baseGeo = new THREE.BoxGeometry(0.9, 0.024, 0.45);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e222a,
      metalness: 0.85,
      roughness: 0.25,
      envMapIntensity: 1.2,
    });
    this.disposables.push(baseGeo, baseMat);

    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.012;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    this.group.add(baseMesh);

    // 2. 不锈钢斜边边框饰条
    const rimGeo = new THREE.BoxGeometry(0.906, 0.008, 0.456);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.disposables.push(rimGeo, rimMat);

    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.022;
    this.group.add(rimMesh);

    // 3. 四个工业级减震橡胶脚垫
    const footGeo = new THREE.CylinderGeometry(0.025, 0.028, 0.018, 24);
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.disposables.push(footGeo, footMat);

    const footPositions = [
      [-0.41, 0.009, -0.19],
      [0.41, 0.009, -0.19],
      [-0.41, 0.009, 0.19],
      [0.41, 0.009, 0.19],
    ];

    for (const [x, y, z] of footPositions) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(x, y, z);
      foot.castShadow = true;
      this.group.add(foot);
    }

    // 4. 顶面光学精密 M6 螺纹网格标线
    const gridHelper = new THREE.GridHelper(0.84, 28, 0x3b82f6, 0x242d3d);
    gridHelper.position.set(0, 0.0245, 0);
    this.disposables.push(gridHelper.geometry, gridHelper.material as any);
    this.group.add(gridHelper);
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
