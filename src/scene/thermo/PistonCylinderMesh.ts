import * as THREE from 'three';

export class PistonCylinderMesh {
  public group: THREE.Group;
  public pistonGroup: THREE.Group;
  public handleMesh: THREE.Mesh;
  public readonly radius = 0.08;
  public readonly minHeight = 0.06;  // 对应容积 1.0 L
  public readonly maxHeight = 0.30;  // 对应容积 5.0 L
  public readonly minVolume = 1.0;
  public readonly maxVolume = 5.0;

  private currentVolume = 2.5;
  private currentHeight = 0.15;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PistonCylinder';
    this.build();
  }

  private build(): void {
    // 1. 高精度缎面阳极氧化铝安装底座法兰 (y = 0 至 0.010)
    const flangeGeo = new THREE.CylinderGeometry(0.095, 0.098, 0.010, 36);
    const flangeMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.78,
      roughness: 0.22,
    });
    this.disposables.push(flangeGeo, flangeMat);

    const flangeMesh = new THREE.Mesh(flangeGeo, flangeMat);
    flangeMesh.position.y = 0.005;
    this.group.add(flangeMesh);

    // 抛光不锈钢压紧卡箍环 (y = 0.010 至 0.015)
    const clampGeo = new THREE.CylinderGeometry(0.092, 0.095, 0.005, 36);
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    this.disposables.push(clampGeo, stainlessMat);
    const clampMesh = new THREE.Mesh(clampGeo, stainlessMat);
    clampMesh.position.y = 0.0125;
    this.group.add(clampMesh);

    // 2. 优质光学石英玻璃气缸筒 (y = 0.023 至 0.363)
    // 气缸总高度：0.34m，内半径：0.08m
    const cylinderTotalHeight = 0.34;
    const cylinderGeo = new THREE.CylinderGeometry(this.radius, this.radius, cylinderTotalHeight, 48, 1, true);
    const cylinderMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.1,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposables.push(cylinderGeo, cylinderMat);

    const cylinderMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
    cylinderMesh.position.y = 0.023 + cylinderTotalHeight * 0.5;
    cylinderMesh.castShadow = false;
    cylinderMesh.receiveShadow = true;
    cylinderMesh.renderOrder = 10;
    this.group.add(cylinderMesh);

    // 石英缸底密封底板（钛/不锈钢合金，y = 0.015 至 0.023）
    const bottomGeo = new THREE.CylinderGeometry(this.radius, this.radius, 0.008, 48);
    const bottomMat = new THREE.MeshStandardMaterial({
      color: 0xc4cfdc,
      metalness: 0.80,
      roughness: 0.22,
    });
    this.disposables.push(bottomGeo, bottomMat);
    const bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
    bottomMesh.position.y = 0.019;
    this.group.add(bottomMesh);

    // 3. 容积刻度线与读数标签 (1.0 L 至 5.0 L)
    this.buildGraduations();

    // 气缸顶部皇冠套环及中心导向支架 (y = 0.363 至 0.375)
    const crownGeo = new THREE.CylinderGeometry(0.088, 0.084, 0.012, 48);
    this.disposables.push(crownGeo);
    const crownMesh = new THREE.Mesh(crownGeo, flangeMat);
    crownMesh.position.y = 0.369;
    crownMesh.castShadow = true;
    this.group.add(crownMesh);

    // 4 根带镀铬盖形螺母的不锈钢紧固拉杆
    const tieRodGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.360, 16);
    this.disposables.push(tieRodGeo);
    const nutGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.008, 12);
    this.disposables.push(nutGeo);

    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const tx = Math.cos(ang) * 0.086;
      const tz = Math.sin(ang) * 0.086;

      const tieRod = new THREE.Mesh(tieRodGeo, stainlessMat);
      tieRod.position.set(tx, 0.185, tz);
      tieRod.castShadow = true;
      this.group.add(tieRod);

      const topNut = new THREE.Mesh(nutGeo, stainlessMat);
      topNut.position.set(tx, 0.375, tz);
      this.group.add(topNut);

      const botNut = new THREE.Mesh(nutGeo, stainlessMat);
      botNut.position.set(tx, 0.005, tz);
      this.group.add(botNut);
    }

    // 4. 可移动活塞组件
    this.pistonGroup = new THREE.Group();
    this.pistonGroup.name = 'PistonAssembly';
    this.group.add(this.pistonGroup);

    // 活塞头（精密缎面阳极氧化铝圆盘）
    const headGeo = new THREE.CylinderGeometry(this.radius - 0.001, this.radius - 0.001, 0.018, 48);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.82,
      roughness: 0.22,
    });
    this.disposables.push(headGeo, headMat);

    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 0.009; // 活塞头底部相对于 pistonGroup 位于 y = 0
    headMesh.castShadow = true;
    this.pistonGroup.add(headMesh);

    // 密封 O 型圈（氟橡胶 Viton）
    const ringGeo = new THREE.TorusGeometry(this.radius - 0.0005, 0.003, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
    });
    this.disposables.push(ringGeo, ringMat);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI * 0.5;
    ringMesh.position.y = 0.009;
    this.pistonGroup.add(ringMesh);

    // 镀铬连杆
    const rodHeight = 0.16;
    const rodGeo = new THREE.CylinderGeometry(0.008, 0.008, rodHeight, 24);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.98,
      roughness: 0.05,
    });
    this.disposables.push(rodGeo, rodMat);

    const rodMesh = new THREE.Mesh(rodGeo, rodMat);
    rodMesh.position.y = 0.018 + rodHeight * 0.5;
    rodMesh.castShadow = true;
    this.pistonGroup.add(rodMesh);

    // 抓取手柄（苹果蓝阳极氧化 T 型拉手）
    const handleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 24);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff,
      metalness: 0.85,
      roughness: 0.2,
    });
    this.disposables.push(handleGeo, handleMat);

    this.handleMesh = new THREE.Mesh(handleGeo, handleMat);
    this.handleMesh.name = 'PistonHandle';
    this.handleMesh.rotation.z = Math.PI * 0.5;
    this.handleMesh.position.y = 0.018 + rodHeight + 0.008;
    this.handleMesh.castShadow = true;
    this.pistonGroup.add(this.handleMesh);

    this.setPistonVolume(this.currentVolume);
  }

  private buildGraduations(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 1024);

    // 绘制垂直公制标尺线
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(380, 80);
    ctx.lineTo(380, 960);
    ctx.stroke();

    for (let i = 0; i <= 20; i++) {
      const vol = 1.0 + (i / 20) * 4.0;
      // Canvas 上的 y 坐标（上下反转：1.0L 在底部 y=940，5.0L 在顶部 y=100）
      const y = 940 - (i / 20) * 840;

      const isMajor = i % 5 === 0;
      const tickLength = isMajor ? 36 : 18;

      ctx.lineWidth = isMajor ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(380, y);
      ctx.lineTo(380 - tickLength, y);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#00f5ff';
        ctx.font = 'bold 36px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${vol.toFixed(1)} L`, 320, y);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.disposables.push(texture);

    const gradGeo = new THREE.CylinderGeometry(this.radius + 0.0012, this.radius + 0.0012, 0.34, 48, 1, true, -Math.PI * 0.45, Math.PI * 0.9);
    const gradMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.92,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.disposables.push(gradGeo, gradMat);

    const gradMesh = new THREE.Mesh(gradGeo, gradMat);
    gradMesh.position.y = 0.023 + 0.17;
    gradMesh.rotation.y = Math.PI * 0.5;
    gradMesh.renderOrder = 11;
    this.group.add(gradMesh);
  }

  public setPistonVolume(liters: number): void {
    this.currentVolume = Math.max(this.minVolume, Math.min(this.maxVolume, liters));
    const t = (this.currentVolume - this.minVolume) / (this.maxVolume - this.minVolume);
    this.currentHeight = this.minHeight + t * (this.maxHeight - this.minHeight);

    // 活塞头底部恰好位于 y = 0.015 + currentHeight
    this.pistonGroup.position.y = 0.015 + this.currentHeight;
  }

  public getPistonVolume(): number {
    return this.currentVolume;
  }

  public getPistonHeight(): number {
    return this.currentHeight;
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
