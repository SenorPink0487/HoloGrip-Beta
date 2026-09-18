import * as THREE from 'three';

export interface CarrierMount {
  id: string;
  name: string;
  group: THREE.Group;
  currentX: number; // Position along rail (-0.50m to +0.50m)
  minX: number;
  maxX: number;
  indicatorMesh: THREE.Mesh;
}

/**
 * OpticalBenchMesh
 * Precision CNC anodized aluminum optical bench rail (1000mm length).
 * Designed according to Apple Industrial Design principles:
 * - Unibody extruded anodized aluminum rail with dual T-slots
 * - Diamond-cut specular chamfers
 * - Laser-etched millimeter scale with satin silver inlay
 * - Low-friction magnetic/mechanical sliding carriers with vernier alignment marks
 */
export class OpticalBenchMesh {
  public readonly group = new THREE.Group();
  public readonly railLength = 1.05; // 1.05 meters total
  public readonly railY = 0.912; // Sits flush on HoloTable surface

  private railMesh: THREE.Mesh;
  private scaleTexture: THREE.CanvasTexture;
  public carriers = new Map<string, CarrierMount>();

  constructor() {
    this.createRail();
  }

  private createRail(): void {
    // 1. Primary extruded aluminum rail profile
    const railShape = new THREE.Shape();
    const w = 0.052; // 52mm rail width
    const h = 0.024; // 24mm rail height
    const hw = w / 2;

    railShape.moveTo(-hw, 0);
    railShape.lineTo(hw, 0);
    railShape.lineTo(hw, h);
    railShape.lineTo(-hw, h);
    railShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 1,
      depth: this.railLength,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 3,
    };

    const railGeo = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
    // Center geometry along Z initially, then rotate to lie along X-axis
    railGeo.center();

    // Apple Space Gray anodized aluminum material
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x22272e,
      metalness: 0.88,
      roughness: 0.25,
      side: THREE.DoubleSide,
    });

    this.railMesh = new THREE.Mesh(railGeo, railMat);
    // Rotate 90 deg so rail extends along X-axis (-0.525m to +0.525m)
    this.railMesh.rotation.y = Math.PI / 2;
    this.railMesh.position.set(0, this.railY + 0.012, 0);
    this.railMesh.castShadow = true;
    this.railMesh.receiveShadow = true;
    this.group.add(this.railMesh);

    // 2. High-precision laser-etched millimeter scale strip along rail top
    this.createScaleStrip();

    // 3. Dual side bevel strips with specular highlight (Apple diamond-cut chamfer accent)
    this.createChamferStrips();

    // 4. End caps (Precision milled brushed metal plates at x = -0.525 and x = +0.525)
    this.createEndCaps();
  }

  private createScaleStrip(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Satin silver ruler background
    ctx.fillStyle = '#2d333b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle brushed noise / fine hairline
    ctx.fillStyle = '#373e47';
    ctx.fillRect(0, 0, canvas.width, 2);
    ctx.fillRect(0, canvas.height - 2, canvas.width, 2);

    // Laser graduations (0 - 1000 mm)
    ctx.strokeStyle = '#c9d1d9';
    ctx.fillStyle = '#8b949e';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Mono", "SF Pro Text", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const totalMm = 1000;
    const pad = 24;
    const usableW = canvas.width - pad * 2;

    for (let mm = 0; mm <= totalMm; mm++) {
      const x = pad + (mm / totalMm) * usableW;

      if (mm % 50 === 0) {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, canvas.height - 24);
        ctx.stroke();

        ctx.fillText(`${mm}`, x, canvas.height - 28);
      } else if (mm % 10 === 0) {
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, canvas.height - 15);
        ctx.stroke();
      } else if (mm % 5 === 0) {
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, canvas.height - 10);
        ctx.stroke();
      } else if (mm % 1 === 0) {
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, canvas.height - 6);
        ctx.stroke();
      }
    }

    this.scaleTexture = new THREE.CanvasTexture(canvas);
    this.scaleTexture.colorSpace = THREE.SRGBColorSpace;
    this.scaleTexture.minFilter = THREE.LinearFilter;
    this.scaleTexture.magFilter = THREE.LinearFilter;

    const stripGeo = new THREE.PlaneGeometry(1.0, 0.016);
    const stripMat = new THREE.MeshStandardMaterial({
      map: this.scaleTexture,
      metalness: 0.65,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });

    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, this.railY + 0.0242, 0.01);
    this.group.add(strip);
  }

  private createChamferStrips(): void {
    const chamferMat = new THREE.MeshStandardMaterial({
      color: 0x9099a2,
      metalness: 0.95,
      roughness: 0.15,
    });

    const edgeGeo = new THREE.BoxGeometry(this.railLength, 0.0015, 0.0015);
    const edgeFront = new THREE.Mesh(edgeGeo, chamferMat);
    edgeFront.position.set(0, this.railY + 0.024, 0.026);
    this.group.add(edgeFront);

    const edgeBack = new THREE.Mesh(edgeGeo, chamferMat);
    edgeBack.position.set(0, this.railY + 0.024, -0.026);
    this.group.add(edgeBack);
  }

  private createEndCaps(): void {
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x161b22,
      metalness: 0.85,
      roughness: 0.3,
    });

    const capGeo = new THREE.BoxGeometry(0.004, 0.026, 0.054);

    const capLeft = new THREE.Mesh(capGeo, capMat);
    capLeft.position.set(-this.railLength / 2 - 0.002, this.railY + 0.012, 0);
    this.group.add(capLeft);

    const capRight = new THREE.Mesh(capGeo, capMat);
    capRight.position.set(this.railLength / 2 + 0.002, this.railY + 0.012, 0);
    this.group.add(capRight);
  }

  /**
   * Factory to create an Apple-style sliding carrier block (卡座).
   */
  public createCarrier(id: string, name: string, initialX: number, minX = -0.50, maxX = 0.50): CarrierMount {
    const carrierGroup = new THREE.Group();
    carrierGroup.name = `carrier-${id}`;

    // 1. Sliding base block (milled aluminum)
    const baseGeo = new THREE.BoxGeometry(0.046, 0.018, 0.058);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2d333b,
      metalness: 0.9,
      roughness: 0.22,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    baseMesh.position.y = 0.009;
    carrierGroup.add(baseMesh);

    // 2. High-precision laser pointer hairline indicator
    const indicatorGeo = new THREE.BoxGeometry(0.0015, 0.002, 0.016);
    const indicatorMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff, // Apple Blue hairline indicator
      emissive: 0x0a84ff,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    const indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
    indicatorMesh.position.set(0, 0.0185, 0.012);
    carrierGroup.add(indicatorMesh);

    // 3. Side clamping knurled knob (Apple precision thumbscrew)
    const knobGroup = new THREE.Group();
    const knobCylGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 24);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x6e7681,
      metalness: 0.92,
      roughness: 0.18,
    });
    const knobCyl = new THREE.Mesh(knobCylGeo, knobMat);
    knobCyl.rotation.x = Math.PI / 2;
    knobGroup.add(knobCyl);
    knobGroup.position.set(0, 0.009, 0.033);
    carrierGroup.add(knobGroup);

    // 4. Vertical optical post adapter (立柱插座)
    const postCollarGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.024, 24);
    const postCollarMat = new THREE.MeshStandardMaterial({
      color: 0x1f242c,
      metalness: 0.85,
      roughness: 0.25,
    });
    const postCollar = new THREE.Mesh(postCollarGeo, postCollarMat);
    postCollar.position.y = 0.018 + 0.012;
    carrierGroup.add(postCollar);

    carrierGroup.position.set(initialX, this.railY + 0.024, 0);
    this.group.add(carrierGroup);

    const carrier: CarrierMount = {
      id,
      name,
      group: carrierGroup,
      currentX: initialX,
      minX,
      maxX,
      indicatorMesh,
    };

    this.carriers.set(id, carrier);
    return carrier;
  }

  public setCarrierPosition(id: string, x: number): void {
    const carrier = this.carriers.get(id);
    if (!carrier) return;

    const clampedX = Math.max(carrier.minX, Math.min(carrier.maxX, x));
    carrier.currentX = clampedX;
    carrier.group.position.x = clampedX;
  }

  public getCarrierMmPosition(id: string): number {
    const carrier = this.carriers.get(id);
    if (!carrier) return 0;
    // Map -0.50m ... +0.50m to 0 ... 1000mm
    const mm = ((carrier.currentX + 0.50) / 1.0) * 1000;
    return Math.round(mm);
  }

  public setCarrierFromMm(id: string, mm: number): void {
    const x = (mm / 1000) * 1.0 - 0.50;
    this.setCarrierPosition(id, x);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    this.scaleTexture?.dispose();
  }
}
