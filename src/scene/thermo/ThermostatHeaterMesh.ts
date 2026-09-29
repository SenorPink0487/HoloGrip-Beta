import * as THREE from 'three';

export class ThermostatHeaterMesh {
  public group: THREE.Group;
  public knobMesh: THREE.Mesh;
  private heatingSurfaceMesh: THREE.Mesh;
  private heatingSurfaceMat: THREE.MeshStandardMaterial;
  private ledCanvas: HTMLCanvasElement;
  private ledTexture: THREE.CanvasTexture;
  private ledMesh: THREE.Mesh;
  private heatGlowLight: THREE.PointLight;
  private disposables: { dispose: () => void }[] = [];

  private currentTempK = 300;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ThermostatHeater';
    this.build();
  }

  private build(): void {
    // 共享科研级材质（符合光学硬件规格）
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.76,
      roughness: 0.24,
    });
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xc4cfdc,
      metalness: 0.82,
      roughness: 0.22,
    });
    this.disposables.push(satinSilverMat, stainlessMat, titaniumMat);

    // 1. 工业级防滑橡胶底垫 (y = 0 至 0.002)
    const rubberGeo = new THREE.CylinderGeometry(0.134, 0.134, 0.002, 36);
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.9 });
    this.disposables.push(rubberGeo, rubberMat);
    const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
    rubberMesh.position.y = 0.001;
    this.group.add(rubberMesh);

    // 2. 抛光不锈钢下斜倒角边框 (y = 0.002 至 0.006)
    const lowerRimGeo = new THREE.CylinderGeometry(0.131, 0.134, 0.004, 36);
    this.disposables.push(lowerRimGeo);
    const lowerRim = new THREE.Mesh(lowerRimGeo, stainlessMat);
    lowerRim.position.y = 0.004;
    lowerRim.castShadow = true;
    this.group.add(lowerRim);

    // 3. 精密缎面阳极氧化铝基座外壳 (y = 0.006 至 0.052)
    const housingGeo = new THREE.CylinderGeometry(0.120, 0.131, 0.046, 36);
    this.disposables.push(housingGeo);

    const housingMesh = new THREE.Mesh(housingGeo, satinSilverMat);
    housingMesh.position.y = 0.029;
    housingMesh.castShadow = true;
    housingMesh.receiveShadow = true;
    this.group.add(housingMesh);

    // 顶部不锈钢法兰环（开放端设计以消除共面贴合闪烁）
    const topCollarGeo = new THREE.CylinderGeometry(0.114, 0.120, 0.004, 36, 1, true);
    this.disposables.push(topCollarGeo);
    const topCollar = new THREE.Mesh(topCollarGeo, stainlessMat);
    topCollar.position.y = 0.052;
    this.group.add(topCollar);

    // 4. 高温陶瓷加热板台面 (y = 0.052 至 0.062)
    const plateGeo = new THREE.CylinderGeometry(0.108, 0.108, 0.010, 36);
    this.heatingSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      metalness: 0.5,
      roughness: 0.4,
    });
    this.disposables.push(plateGeo, this.heatingSurfaceMat);

    this.heatingSurfaceMesh = new THREE.Mesh(plateGeo, this.heatingSurfaceMat);
    this.heatingSurfaceMesh.position.y = 0.057;
    this.heatingSurfaceMesh.castShadow = true;
    this.group.add(this.heatingSurfaceMesh);

    // 5. 动态热红外辐射泛光点光源
    this.heatGlowLight = new THREE.PointLight(0xff4500, 0, 0.4);
    this.heatGlowLight.position.set(0, 0.07, 0);
    this.group.add(this.heatGlowLight);
    this.disposables.push(this.heatGlowLight);

    // 6. 带凸出前面板外框的数显 LED 温度读数屏
    // 仪表前面板基座（避免与圆柱壁相交穿模/剪裁）
    const bezelGeo = new THREE.BoxGeometry(0.076, 0.034, 0.012);
    this.disposables.push(bezelGeo);
    const bezelMesh = new THREE.Mesh(bezelGeo, titaniumMat);
    bezelMesh.position.set(0, 0.028, 0.125);
    bezelMesh.castShadow = true;
    this.group.add(bezelMesh);

    this.ledCanvas = document.createElement('canvas');
    this.ledCanvas.width = 256;
    this.ledCanvas.height = 96;
    this.ledTexture = new THREE.CanvasTexture(this.ledCanvas);
    this.ledTexture.minFilter = THREE.LinearFilter;
    this.disposables.push(this.ledTexture);

    const screenGeo = new THREE.PlaneGeometry(0.066, 0.026);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.ledTexture,
      transparent: true,
      depthWrite: false,
    });
    this.disposables.push(screenGeo, screenMat);

    this.ledMesh = new THREE.Mesh(screenGeo, screenMat);
    this.ledMesh.position.set(0, 0.028, 0.1312);
    this.ledMesh.renderOrder = 2;
    this.group.add(this.ledMesh);

    // 7. 滚花旋转控温旋钮（交互旋钮）
    // 钛合金旋钮套环
    const dialCollarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24);
    this.disposables.push(dialCollarGeo);
    const dialCollar = new THREE.Mesh(dialCollarGeo, titaniumMat);
    dialCollar.rotation.x = Math.PI * 0.5;
    dialCollar.position.set(0.055, 0.026, 0.126);
    this.group.add(dialCollar);

    const knobGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 24);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(knobGeo, knobMat);

    this.knobMesh = new THREE.Mesh(knobGeo, knobMat);
    this.knobMesh.rotation.x = Math.PI * 0.5;
    this.knobMesh.position.set(0.055, 0.026, 0.134);
    this.knobMesh.name = 'HeaterKnob';
    this.group.add(this.knobMesh);

    // 旋钮刻度凹槽指示标
    const notchGeo = new THREE.BoxGeometry(0.003, 0.016, 0.006);
    const notchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.disposables.push(notchGeo, notchMat);
    const notch = new THREE.Mesh(notchGeo, notchMat);
    notch.position.set(0, 0.008, 0.008);
    this.knobMesh.add(notch);

    this.updateHeaterAppearance(this.currentTempK);
  }

  public setTemperature(tempK: number): void {
    this.currentTempK = Math.max(100, Math.min(800, tempK));
    this.updateHeaterAppearance(this.currentTempK);
  }

  private updateHeaterAppearance(tempK: number): void {
    // 1. 旋钮旋转角度（在 100K 至 800K 范围内对应 -135° 至 +135°）
    const norm = (tempK - 100) / 700;
    const angle = (norm * 270 - 135) * (Math.PI / 180);
    this.knobMesh.rotation.z = -angle;

    // 2. 热炽光与发光特效：
    // 低于 350K：无发光，暗态冷态
    // 350K 至 550K：开始呈现暗红微光
    // 550K 至 800K：明亮的橙红炽光至金黄炽热光芒
    if (tempK < 350) {
      this.heatingSurfaceMat.emissive.setHex(0x000000);
      this.heatingSurfaceMat.emissiveIntensity = 0.0;
      this.heatGlowLight.intensity = 0.0;
    } else {
      const heatFactor = (tempK - 350) / 450; // 归一化至 0 到 1
      const r = Math.min(1.0, 0.4 + heatFactor * 0.6);
      const g = Math.max(0.0, (heatFactor - 0.3) * 0.7);
      const b = 0.0;

      this.heatingSurfaceMat.emissive.setRGB(r, g, b);
      this.heatingSurfaceMat.emissiveIntensity = 0.4 + heatFactor * 1.8;

      this.heatGlowLight.color.setRGB(r, g, b);
      this.heatGlowLight.intensity = heatFactor * 1.5;
    }

    // 3. 更新 LED 数字读数 Canvas
    const ctx = this.ledCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, 256, 96);

      // 玻璃内边框
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 92);

      // 温度数值与单位
      ctx.fillStyle = '#00f5ff';
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const celsius = (tempK - 273.15).toFixed(1);
      ctx.fillText(`${tempK.toFixed(0)} K`, 128, 38);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.fillText(`${celsius} °C · HEATER`, 128, 74);

      this.ledTexture.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
