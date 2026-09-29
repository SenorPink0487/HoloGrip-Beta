import * as THREE from 'three';

export class PressureGaugeMesh {
  public group: THREE.Group;
  private pointerMesh: THREE.Mesh;
  private dialCanvas: HTMLCanvasElement;
  private dialTexture: THREE.CanvasTexture;
  private disposables: { dispose: () => void }[] = [];

  public readonly minPressure = 0;
  public readonly maxPressure = 400; // 单位：千帕 (kPa)

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PressureGauge';
    this.build();
  }

  private build(): void {
    // 1. 橡胶防滑底垫边圈 (y = 0 至 0.0015)
    const rubberGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.0015, 32);
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.9,
    });
    this.disposables.push(rubberGeo, rubberMat);
    const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
    rubberMesh.position.y = 0.00075;
    this.group.add(rubberMesh);

    // 2. 抛光不锈钢底座斜角环 (y = 0.0015 至 0.004)
    const baseRimGeo = new THREE.CylinderGeometry(0.040, 0.042, 0.0025, 32);
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    this.disposables.push(baseRimGeo, stainlessMat);
    const baseRimMesh = new THREE.Mesh(baseRimGeo, stainlessMat);
    baseRimMesh.position.y = 0.00275;
    this.group.add(baseRimMesh);

    // 3. 高精度缎面阳极氧化铝基座 (y = 0.004 至 0.012)
    const baseGeo = new THREE.CylinderGeometry(0.036, 0.040, 0.008, 32);
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.76,
      roughness: 0.24,
    });
    this.disposables.push(baseGeo, satinSilverMat);

    const baseMesh = new THREE.Mesh(baseGeo, satinSilverMat);
    baseMesh.position.y = 0.008;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 4. 抛光不锈钢垂直支撑立柱 (y = 0.012 至 0.062, 直径 10mm)
    const postGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.050, 16);
    this.disposables.push(postGeo);

    const postMesh = new THREE.Mesh(postGeo, stainlessMat);
    postMesh.position.y = 0.037;
    postMesh.castShadow = true;
    this.group.add(postMesh);

    // 六角黄铜管接头法兰套环（侧向管道在 y = 0.037 处连接）
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.92,
      roughness: 0.22,
    });
    this.disposables.push(brassMat);

    const fittingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.010, 6);
    this.disposables.push(fittingGeo);
    const fittingMesh = new THREE.Mesh(fittingGeo, brassMat);
    fittingMesh.position.y = 0.037;
    this.group.add(fittingMesh);

    // 5. 镜面抛光镀铬外壳（中心高度 y = 0.104）
    const caseGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.022, 36);
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.95,
      roughness: 0.12,
    });
    this.disposables.push(caseGeo, caseMat);

    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.rotation.x = Math.PI * 0.5;
    caseMesh.position.set(0, 0.104, 0);
    caseMesh.castShadow = true;
    this.group.add(caseMesh);

    // 6. 带清晰公制刻度的表盘圆盘
    this.dialCanvas = document.createElement('canvas');
    this.dialCanvas.width = 512;
    this.dialCanvas.height = 512;
    this.drawDialFace();

    this.dialTexture = new THREE.CanvasTexture(this.dialCanvas);
    this.dialTexture.minFilter = THREE.LinearFilter;
    this.disposables.push(this.dialTexture);

    const dialGeo = new THREE.CircleGeometry(0.039, 36);
    const dialMat = new THREE.MeshBasicMaterial({
      map: this.dialTexture,
    });
    this.disposables.push(dialGeo, dialMat);

    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.position.set(0, 0.104, 0.0115);
    this.group.add(dialMesh);

    // 7. 旋转式指示表针
    const pointerGroup = new THREE.Group();
    pointerGroup.position.set(0, 0.104, 0.0125);
    this.group.add(pointerGroup);

    const needleGeo = new THREE.ConeGeometry(0.0022, 0.032, 16);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.disposables.push(needleGeo, needleMat);

    this.pointerMesh = new THREE.Mesh(needleGeo, needleMat);
    this.pointerMesh.position.y = 0.016; // 旋转支点位于底部
    pointerGroup.add(this.pointerMesh);

    // 中心轴盖
    const capGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.004, 24);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    this.disposables.push(capGeo, capMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.rotation.x = Math.PI * 0.5;
    pointerGroup.add(capMesh);

    // 在 pointerMesh 父级中保存 pointerGroup 引用并初始化指针位置
    this.setPressure(101.3);
  }

  private drawDialFace(): void {
    const ctx = this.dialCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    // 内圆边框
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 244, 0, Math.PI * 2);
    ctx.stroke();

    // 红色危险警示弧段 (300 至 400 kPa)
    // 角度分布：0 kPa 位于 225°（左下），400 kPa 位于 -45° / 315°（右下）
    // 在 Canvas 坐标系中（0 代表 3 点钟方向）：
    // 0 kPa: 135° = 0.75 * PI
    // 300 kPa: 337.5° = 1.875 * PI
    // 400 kPa: 405° = 2.25 * PI = 0.25 * PI
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 256, 218, 1.875 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    // 正常安全工作弧段 (0 至 300 kPa)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 218, 0.75 * Math.PI, 1.875 * Math.PI);
    ctx.stroke();

    // 刻度线与读数标签
    const startAngle = 0.75 * Math.PI; // 135°
    const endAngle = 2.25 * Math.PI;   // 405°
    const totalTicks = 40; // 每 10 kPa 一个刻度

    for (let i = 0; i <= totalTicks; i++) {
      const angle = startAngle + (i / totalTicks) * (endAngle - startAngle);
      const isMajor = i % 5 === 0;
      const isNumber = i % 10 === 0;

      const rOuter = 212;
      const rInner = isMajor ? 186 : 198;

      const x1 = 256 + Math.cos(angle) * rOuter;
      const y1 = 256 + Math.sin(angle) * rOuter;
      const x2 = 256 + Math.cos(angle) * rInner;
      const y2 = 256 + Math.sin(angle) * rInner;

      ctx.strokeStyle = (i >= 30) ? '#dc2626' : '#1e293b';
      ctx.lineWidth = isMajor ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isNumber) {
        const val = i * 10;
        const rText = 158;
        const xt = 256 + Math.cos(angle) * rText;
        const yt = 256 + Math.sin(angle) * rText;

        ctx.fillStyle = (i >= 30) ? '#dc2626' : '#0f172a';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${val}`, xt, yt);
      }
    }

    // 表盘标题与单位
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('kPa', 256, 320);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillText('PRESSURE GAUGE', 256, 350);
  }

  public setPressure(kpa: number): void {
    const clamped = Math.max(0, Math.min(this.maxPressure, kpa));
    // 指针旋转：0 kPa 对应 +135°（2.356 rad），400 kPa 对应 -135°（-2.356 rad）
    const norm = clamped / this.maxPressure;
    const angle = 135 - norm * 270;
    if (this.pointerMesh.parent) {
      this.pointerMesh.parent.rotation.z = (angle * Math.PI) / 180;
    }
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
