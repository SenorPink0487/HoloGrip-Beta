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

    // Dark titanium anodized background
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Beveled accent border
    ctx.strokeStyle = '#2d333b';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Graduation lines and metric numbers (0 to 120 cm)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';

    const totalMm = 1200;
    const paddingX = 40;
    const usableW = canvas.width - paddingX * 2;

    for (let mm = 0; mm <= totalMm; mm += 2) {
      const x = paddingX + (mm / totalMm) * usableW;

      if (mm % 100 === 0) {
        // 10 cm major mark
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(x, 15);
        ctx.lineTo(x, 60);
        ctx.stroke();

        const cm = mm / 10;
        ctx.fillText(`${cm}`, x - (cm >= 100 ? 18 : 12), 92);
      } else if (mm % 50 === 0) {
        // 5 cm medium mark
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, 25);
        ctx.lineTo(x, 56);
        ctx.stroke();
      } else if (mm % 10 === 0) {
        // 1 cm mark
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 32);
        ctx.lineTo(x, 54);
        ctx.stroke();
      } else {
        // 2 mm minor mark
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x, 52);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.rulerTexture = texture;
    return texture;
  }

  private createRailStructure(): void {
    // 1. Extruded cross-section shape for authentic precision optical dovetail rail
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
    // Center extrusion around origin
    railGeo.center();

    // High quality anodized brushed aluminum material
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      metalness: 0.88,
      roughness: 0.32,
      side: THREE.DoubleSide,
    });

    this.railMesh = new THREE.Mesh(railGeo, railMat);
    this.railMesh.castShadow = true;
    this.railMesh.receiveShadow = true;
    this.group.add(this.railMesh);

    // 2. Precision laser-etched metric rulers on both sides
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

    // Center metallic groove runner
    const runnerGeo = new THREE.BoxGeometry(0.018, 0.004, this.railLength);
    const runnerMat = new THREE.MeshStandardMaterial({
      color: 0x88929e,
      metalness: 0.95,
      roughness: 0.18,
    });
    const runner = new THREE.Mesh(runnerGeo, runnerMat);
    runner.position.set(0, h * 0.5 - 0.015, 0);
    this.group.add(runner);
  }

  private createPedestals(): void {
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x15181d,
      metalness: 0.75,
      roughness: 0.45,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.22,
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x0d0e11,
      metalness: 0.1,
      roughness: 0.9,
    });

    const zOffsets = [-this.railLength * 0.44, this.railLength * 0.44];

    for (const z of zOffsets) {
      const pedGroup = new THREE.Group();
      pedGroup.position.set(0, -this.railHeight * 0.5, z);

      // Heavy bridge cross-beam under rail
      const crossBeamGeo = new THREE.BoxGeometry(this.railWidth * 1.6, 0.024, 0.07);
      const crossBeam = new THREE.Mesh(crossBeamGeo, pedestalMat);
      crossBeam.position.y = -0.012;
      pedGroup.add(crossBeam);

      // Leveling feet on left and right
      const feetX = [-this.railWidth * 0.65, this.railWidth * 0.65];
      for (const x of feetX) {
        // Knurled brass screw dial
        const dialGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 24);
        const dial = new THREE.Mesh(dialGeo, brassMat);
        dial.position.set(x, -0.022, 0);
        pedGroup.add(dial);

        // Heavy vibration dampening rubber pad
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

    const saddleMat = new THREE.MeshStandardMaterial({
      color: 0x1f2329,
      metalness: 0.85,
      roughness: 0.35,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.25,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xdde3ea,
      metalness: 0.95,
      roughness: 0.15,
    });

    // 1. Saddle base clamp wrapping around rail dovetail
    const saddleLength = 0.082;
    const saddleW = this.railWidth + 0.016;
    const baseGeo = new THREE.BoxGeometry(saddleW, 0.022, saddleLength);
    const base = new THREE.Mesh(baseGeo, saddleMat);
    base.position.y = this.railHeight * 0.5 + 0.011;
    base.castShadow = true;
    saddleGroup.add(base);

    // 2. Stainless steel optical post holder receptacle (立杆套筒)
    const socketGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.048, 24);
    const socket = new THREE.Mesh(socketGeo, steelMat);
    socket.position.set(0, this.railHeight * 0.5 + 0.038, 0);
    socket.castShadow = true;
    saddleGroup.add(socket);

    // 3. Knurled brass thumbscrew for locking post
    const thumbKnobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 18);
    const thumbKnob = new THREE.Mesh(thumbKnobGeo, brassMat);
    thumbKnob.rotation.z = Math.PI * 0.5;
    thumbKnob.position.set(0.022, this.railHeight * 0.5 + 0.038, 0);
    saddleGroup.add(thumbKnob);

    // 4. Rail lock screw with knurled grip on side
    const railLockGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 20);
    const railLock = new THREE.Mesh(railLockGeo, brassMat);
    railLock.rotation.z = Math.PI * 0.5;
    railLock.position.set(-saddleW * 0.5 - 0.006, this.railHeight * 0.5 + 0.008, 0);
    saddleGroup.add(railLock);

    // 5. Red vernier indicator hairline
    const indicatorGeo = new THREE.BoxGeometry(0.003, 0.014, 0.002);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicator.position.set(saddleW * 0.5 + 0.001, this.railHeight * 0.5 + 0.008, 0);
    saddleGroup.add(indicator);

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
