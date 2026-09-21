import * as THREE from 'three';

export class OpticalBenchRail {
  public readonly group = new THREE.Group();

  // Rail dimensions (in meters)
  public readonly railLength = 1.28;
  public readonly railWidth = 0.088;
  public readonly railHeight = 0.052;

  private rulerTexture: THREE.CanvasTexture | null = null;
  private railMesh: THREE.Mesh;
  private sliders: THREE.Group[] = [];

  constructor() {
    this.group.name = 'OpticalBenchRail';
    this.createRailStructure();
    this.createPedestals();
  }

  private createRulerCanvas(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Scientific precision satin silver/aluminum scale background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Beveled accent border & baseline rail line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // Longitudinal alignment baseline
    ctx.beginPath();
    ctx.moveTo(30, 64);
    ctx.lineTo(canvas.width - 30, 64);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Graduation lines and metric numbers (0 to 120 cm) in high-contrast deep black
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';

    const totalMm = 1200;
    const paddingX = 40;
    const usableW = canvas.width - paddingX * 2;

    for (let mm = 0; mm <= totalMm; mm += 2) {
      const x = paddingX + (mm / totalMm) * usableW;

      if (mm % 100 === 0) {
        // 10 cm major mark
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, 64);
        ctx.stroke();

        const cm = mm / 10;
        ctx.fillText(`${cm}`, x, 98);
      } else if (mm % 50 === 0) {
        // 5 cm medium mark
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, 64);
        ctx.stroke();
      } else if (mm % 10 === 0) {
        // 1 cm mark
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 26);
        ctx.lineTo(x, 64);
        ctx.stroke();
      } else {
        // 2 mm minor mark
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x, 38);
        ctx.lineTo(x, 64);
        ctx.stroke();
      }
    }

    // Unit indicator
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText('cm', paddingX + 22, 118);
    ctx.fillText('OPTICAL BENCH · 1200mm', canvas.width * 0.5, 120);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.rulerTexture = texture;
    return texture;
  }

  private createRailStructure(): void {
    // Extruded cross-section shape for authentic precision optical dovetail rail
    const shape = new THREE.Shape();
    const w = this.railWidth * 0.5;
    const h = this.railHeight;

    shape.moveTo(-w, 0);
    shape.lineTo(-w, h * 0.45);
    shape.lineTo(-w + 0.008, h * 0.55); // Dovetail inward chamfer
    shape.lineTo(-w + 0.006, h);
    shape.lineTo(-0.012, h); // Central T-slot groove
    shape.lineTo(-0.012, h - 0.016);
    shape.lineTo(0.012, h - 0.016);
    shape.lineTo(0.012, h);
    shape.lineTo(w - 0.006, h);
    shape.lineTo(w - 0.008, h * 0.55); // Dovetail opposite
    shape.lineTo(w, h * 0.45);
    shape.lineTo(w, 0);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: this.railLength,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    };

    const railGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    railGeo.center();

    // High quality scientific satin clear-anodized natural aluminum rail
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.72,
      roughness: 0.26,
      side: THREE.DoubleSide,
    });

    this.railMesh = new THREE.Mesh(railGeo, railMat);
    this.railMesh.castShadow = true;
    this.railMesh.receiveShadow = true;
    this.group.add(this.railMesh);

    // Precision laser-etched metric rulers on both sides
    const rulerTex = this.createRulerCanvas();
    const rulerMat = new THREE.MeshBasicMaterial({
      map: rulerTex,
      side: THREE.DoubleSide,
    });

    const rulerGeo = new THREE.PlaneGeometry(this.railLength * 0.94, this.railHeight * 0.45);

    // Right side ruler
    const rulerRight = new THREE.Mesh(rulerGeo, rulerMat);
    rulerRight.position.set(w + 0.001, 0, 0);
    rulerRight.rotation.y = Math.PI * 0.5;
    this.group.add(rulerRight);

    // Left side ruler
    const rulerLeft = new THREE.Mesh(rulerGeo, rulerMat);
    rulerLeft.position.set(-w - 0.001, 0, 0);
    rulerLeft.rotation.y = -Math.PI * 0.5;
    this.group.add(rulerLeft);

    // Center metallic groove runner (polished chrome / stainless steel)
    const runnerGeo = new THREE.BoxGeometry(0.018, 0.004, this.railLength);
    const runnerMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });
    const runner = new THREE.Mesh(runnerGeo, runnerMat);
    runner.position.set(0, h * 0.5 - 0.015, 0);
    this.group.add(runner);

    // Dual upper dovetail polished guide rail strips
    const guideGeo = new THREE.BoxGeometry(0.005, 0.003, this.railLength);
    const guideLeft = new THREE.Mesh(guideGeo, runnerMat);
    guideLeft.position.set(-w + 0.006, h * 0.5 - 0.001, 0);
    this.group.add(guideLeft);

    const guideRight = new THREE.Mesh(guideGeo, runnerMat);
    guideRight.position.set(w - 0.006, h * 0.5 - 0.001, 0);
    this.group.add(guideRight);
  }

  private createPedestals(): void {
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.65,
      roughness: 0.32,
    });

    const levelDialMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.80,
      roughness: 0.22,
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x1e2229,
      metalness: 0.1,
      roughness: 0.85,
    });

    const zOffsets = [-this.railLength * 0.44, this.railLength * 0.44];

    for (const z of zOffsets) {
      const pedGroup = new THREE.Group();
      pedGroup.position.set(0, -this.railHeight * 0.5, z);

      // Solid satin silver bridge cross-beam under rail
      const crossBeamGeo = new THREE.BoxGeometry(this.railWidth * 1.6, 0.024, 0.07);
      const crossBeam = new THREE.Mesh(crossBeamGeo, pedestalMat);
      crossBeam.position.y = -0.012;
      pedGroup.add(crossBeam);

      // Leveling feet on left and right
      const feetX = [-this.railWidth * 0.65, this.railWidth * 0.65];
      for (const x of feetX) {
        // Knurled leveling screw dial
        const dialGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 24);
        const dial = new THREE.Mesh(dialGeo, levelDialMat);
        dial.position.set(x, -0.022, 0);
        pedGroup.add(dial);

        // Vibration dampening rubber pad
        const padGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.01, 24);
        const pad = new THREE.Mesh(padGeo, rubberMat);
        pad.position.set(x, -0.032, 0);
        pedGroup.add(pad);
      }

      this.group.add(pedGroup);
    }
  }

  /**
   * Factory method to create a sliding carrier saddle (光学滑块) to mount instruments
   */
  public createCarrierSaddle(name = 'CarrierSaddle'): THREE.Group {
    const saddleGroup = new THREE.Group();
    saddleGroup.name = name;

    // High-grade satin clear-anodized aluminum
    const saddleMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ed,
      metalness: 0.70,
      roughness: 0.28,
    });

    // Precision dark titanium / gunmetal thumbscrew for elegant mechanical contrast
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.75,
      roughness: 0.25,
    });

    // Polished stainless steel receptacle
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f9,
      metalness: 0.88,
      roughness: 0.18,
    });

    // 1. Saddle base clamp wrapping around rail dovetail
    const saddleLength = 0.082;
    const saddleW = this.railWidth + 0.016;
    const baseGeo = new THREE.BoxGeometry(saddleW, 0.022, saddleLength);
    const base = new THREE.Mesh(baseGeo, saddleMat);
    base.position.y = this.railHeight * 0.5 + 0.011;
    base.castShadow = true;
    base.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(base);

    // 2. Stainless steel optical post holder receptacle (立杆套筒)
    const socketGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.048, 24);
    const socket = new THREE.Mesh(socketGeo, steelMat);
    socket.position.set(0, this.railHeight * 0.5 + 0.038, 0);
    socket.castShadow = true;
    socket.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(socket);

    // 3. Knurled industrial thumbscrew for locking post
    const thumbKnobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20);
    const thumbKnob = new THREE.Mesh(thumbKnobGeo, knobMat);
    thumbKnob.rotation.z = Math.PI * 0.5;
    thumbKnob.position.set(0.022, this.railHeight * 0.5 + 0.038, 0);
    thumbKnob.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(thumbKnob);

    // 4. Rail lock screw with knurled grip on side
    const railLockGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 20);
    const railLock = new THREE.Mesh(railLockGeo, knobMat);
    railLock.rotation.z = Math.PI * 0.5;
    railLock.position.set(-saddleW * 0.5 - 0.006, this.railHeight * 0.5 + 0.008, 0);
    railLock.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(railLock);

    // 5. Red vernier indicator with clean white background reading window
    const backingGeo = new THREE.BoxGeometry(0.008, 0.018, 0.004);
    const backingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const backing = new THREE.Mesh(backingGeo, backingMat);
    backing.position.set(saddleW * 0.5 + 0.001, this.railHeight * 0.5 + 0.008, 0);
    backing.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(backing);

    const indicatorGeo = new THREE.BoxGeometry(0.003, 0.016, 0.002);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.set(saddleW * 0.5 + 0.003, this.railHeight * 0.5 + 0.008, 0);
    indicator.userData = { isSaddle: true, saddleName: name, saddleGroup };
    saddleGroup.add(indicator);

    saddleGroup.userData = { isSaddle: true, saddleName: name };
    this.sliders.push(saddleGroup);
    this.group.add(saddleGroup);
    return saddleGroup;
  }

  public dispose(): void {
    if (this.rulerTexture) {
      this.rulerTexture.dispose();
      this.rulerTexture = null;
    }
  }
}
