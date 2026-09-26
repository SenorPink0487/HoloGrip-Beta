import * as THREE from 'three';

export interface HallCarrierOptions {
  waferLength?: number;    // Along X (width)
  waferHeight?: number;    // Along Y (height)
  waferThickness?: number; // Along Z (depth)
  waferWidth?: number;     // Backwards-compatible alias for waferHeight
  particleCount?: number;
}

export type CarrierType = 'electron' | 'hole' | 'metal';

export class HallCarrierParticleSystem {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private readonly particleCount: number;

  // Wafer physical dimensions in local space
  public readonly waferLength: number;
  public readonly waferHeight: number;
  public readonly waferThickness: number;
  // Backwards-compatible getter / property
  public get waferWidth(): number {
    return this.waferHeight;
  }

  // Particle positions & initial entry cross-section coordinates
  private positions: Float32Array;
  private baseOffsetsY: Float32Array;
  private baseOffsetsZ: Float32Array;
  private dummyObj = new THREE.Object3D();

  // Edge charge glow strips on top (+Y) and bottom (-Y) inner edges
  private topGlowMesh: THREE.Mesh;
  private bottomGlowMesh: THREE.Mesh;
  private topGlowMat: THREE.MeshBasicMaterial;
  private bottomGlowMat: THREE.MeshBasicMaterial;

  // Visual Charge Accumulation Badges (7 on top, 7 on bottom)
  private topChargeGroup: THREE.Group;
  private bottomChargeGroup: THREE.Group;
  private topChargeSprites: THREE.Sprite[] = [];
  private bottomChargeSprites: THREE.Sprite[] = [];

  // Minimalist 3D Vector arrows
  private vectorGroup: THREE.Group;
  private arrowVelocity: THREE.ArrowHelper;
  private arrowMagField: THREE.ArrowHelper;
  private arrowLorentz: THREE.ArrowHelper;
  private arrowHallField: THREE.ArrowHelper;

  // Carrier & physical state
  private carrierType: CarrierType = 'electron';
  private magFieldStrength = 0.5; // Tesla
  private currentMa = 10.0;       // mA
  private hallVoltageMv = -25.0;  // mV
  private showVectors = false;    // Default OFF for clear view
  private showParticles = true;

  private sphereMat: THREE.MeshStandardMaterial;
  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallCarrierOptions = {}) {
    this.waferLength = options.waferLength ?? 0.32;
    this.waferHeight = options.waferHeight ?? options.waferWidth ?? 0.125;
    this.waferThickness = options.waferThickness ?? 0.032;
    this.particleCount = options.particleCount ?? 140;

    this.group = new THREE.Group();
    this.group.name = 'HallCarrierParticleSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.baseOffsetsY = new Float32Array(this.particleCount);
    this.baseOffsetsZ = new Float32Array(this.particleCount);

    this.build();
    this.initParticles();
  }

  private build(): void {
    // 1. Instanced luminous micro-carrier spheres (Ultra-bright glowing neon dots)
    const sphereRadius = Math.max(0.0048, this.waferThickness * 0.14);
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 14, 14);
    this.sphereMat = new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x00ff88,
      emissiveIntensity: 3.8,
      roughness: 0.1,
      metalness: 0.1,
    });
    this.disposables.push(sphereGeo, this.sphereMat);

    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, this.sphereMat, this.particleCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.instancedMesh);

    // 2. Edge accumulation luminous glow strips
    const glowGeo = new THREE.PlaneGeometry(this.waferLength * 0.96, this.waferThickness * 0.90);
    this.disposables.push(glowGeo);

    this.topGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bottomGlowMat = new THREE.MeshBasicMaterial({
      color: 0x007aff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(this.topGlowMat, this.bottomGlowMat);

    this.topGlowMesh = new THREE.Mesh(glowGeo, this.topGlowMat);
    this.topGlowMesh.rotation.x = Math.PI / 2;
    this.topGlowMesh.position.set(0, this.waferHeight / 2 - 0.001, 0);
    this.group.add(this.topGlowMesh);

    this.bottomGlowMesh = new THREE.Mesh(glowGeo, this.bottomGlowMat);
    this.bottomGlowMesh.rotation.x = Math.PI / 2;
    this.bottomGlowMesh.position.set(0, -this.waferHeight / 2 + 0.001, 0);
    this.group.add(this.bottomGlowMesh);

    // 3. Side Charge Accumulation Badges (7 on top, 7 on bottom - bold, prominent & clear)
    this.buildEdgeChargeBadges();

    // 4. Vector Arrows
    this.buildVectorHelpers();
  }

  private buildEdgeChargeBadges(): void {
    this.topChargeGroup = new THREE.Group();
    this.topChargeGroup.name = 'TopChargeGroup';
    this.group.add(this.topChargeGroup);

    this.bottomChargeGroup = new THREE.Group();
    this.bottomChargeGroup.name = 'BottomChargeGroup';
    this.group.add(this.bottomChargeGroup);

    // 7 badges along top, 7 along bottom
    const badgeCount = 7;
    const spanX = this.waferLength * 0.82;
    const spacing = spanX / (badgeCount - 1);
    const startX = -spanX / 2;
    // Elevated clearly above and below the crystal box edges
    const topY = this.waferHeight * 0.5 + 0.018;
    const bottomY = -this.waferHeight * 0.5 - 0.018;
    const frontZ = this.waferThickness * 0.5 + 0.008;

    for (let i = 0; i < badgeCount; i++) {
      const x = startX + i * spacing;

      // Top badge (defaults to "+" for standard electron deflection)
      const topSprite = this.createChargeGlyph('+', '#ff3b30');
      topSprite.position.set(x, topY, frontZ);
      this.topChargeGroup.add(topSprite);
      this.topChargeSprites.push(topSprite);

      // Bottom badge (defaults to "−" for standard electron deflection)
      const bottomSprite = this.createChargeGlyph('−', '#007aff');
      bottomSprite.position.set(x, bottomY, frontZ);
      this.bottomChargeGroup.add(bottomSprite);
      this.bottomChargeSprites.push(bottomSprite);
    }
  }

  private createChargeGlyph(symbol: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    this.drawChargeCanvas(ctx, symbol, color);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Ensures badges are NEVER clipped or occluded
    });
    this.disposables.push(texture, mat);

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.026, 0.026, 1.0); // Bold, prominent size
    return sprite;
  }

  private drawChargeCanvas(ctx: CanvasRenderingContext2D, symbol: string, color: string): void {
    ctx.clearRect(0, 0, 256, 256);

    // 1. Outer radiant glow
    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
      grad.addColorStop(0, color);
      grad.addColorStop(0.7, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. High-contrast solid pill badge body
    ctx.beginPath();
    ctx.arc(128, 128, 92, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 3. Crisp white outer ring
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // 4. Bold white symbol glyph
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 142px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 128, 126);
  }

  private updateChargeBadges(): void {
    const hasField = Math.abs(this.magFieldStrength) > 0.01 && Math.abs(this.currentMa) > 0.01;
    const isTopPositive = this.hallVoltageMv < 0;

    const badgeVisible = hasField && Math.abs(this.hallVoltageMv) > 0.005;
    this.topChargeGroup.visible = badgeVisible;
    this.bottomChargeGroup.visible = badgeVisible;

    if (!badgeVisible) {
      this.topGlowMesh.visible = false;
      this.bottomGlowMesh.visible = false;
      return;
    }

    this.topGlowMesh.visible = true;
    this.bottomGlowMesh.visible = true;

    // Polarity colors
    const topColor = isTopPositive ? 0xff3b30 : 0x007aff;
    const bottomColor = isTopPositive ? 0x007aff : 0xff3b30;

    this.topGlowMat.color.setHex(topColor);
    this.bottomGlowMat.color.setHex(bottomColor);

    // Re-render charge badges with correct sign
    const topSymbol = isTopPositive ? '+' : '−';
    const bottomSymbol = isTopPositive ? '−' : '+';
    const topColorHex = isTopPositive ? '#ff3b30' : '#007aff';
    const bottomColorHex = isTopPositive ? '#007aff' : '#ff3b30';

    for (const s of this.topChargeSprites) {
      this.redrawChargeGlyph(s, topSymbol, topColorHex);
    }
    for (const s of this.bottomChargeSprites) {
      this.redrawChargeGlyph(s, bottomSymbol, bottomColorHex);
    }
  }

  private redrawChargeGlyph(sprite: THREE.Sprite, symbol: string, color: string): void {
    const mat = sprite.material as THREE.SpriteMaterial;
    const texture = mat.map as THREE.CanvasTexture;
    if (!texture || !texture.image) return;

    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.drawChargeCanvas(ctx, symbol, color);
    texture.needsUpdate = true;
  }

  private buildVectorHelpers(): void {
    this.vectorGroup = new THREE.Group();
    this.vectorGroup.name = 'HallVectorIndicators';
    this.vectorGroup.visible = this.showVectors;
    this.group.add(this.vectorGroup);

    const halfL = this.waferLength * 0.5;
    const halfT = this.waferThickness * 0.5;

    this.arrowVelocity = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(halfL * 0.35, 0, halfT + 0.016),
      0.038,
      0xffffff,
      0.008,
      0.005
    );

    this.arrowMagField = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-halfL * 0.40, 0, -halfT - 0.020),
      0.048,
      0x00f0ff,
      0.009,
      0.006
    );

    this.arrowLorentz = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, halfT + 0.016),
      0.035,
      0x2997ff,
      0.008,
      0.005
    );

    this.arrowHallField = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-halfL * 0.35, 0, halfT + 0.016),
      0.035,
      0xff9500,
      0.008,
      0.005
    );

    this.vectorGroup.add(this.arrowVelocity);
    this.vectorGroup.add(this.arrowMagField);
    this.vectorGroup.add(this.arrowLorentz);
    this.vectorGroup.add(this.arrowHallField);
  }

  private initParticles(): void {
    const halfL = this.waferLength * 0.46;
    const halfH = this.waferHeight * 0.40;
    const halfT = this.waferThickness * 0.35;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.positions[idx] = (Math.random() * 2 - 1) * halfL;
      const yOffset = (Math.random() * 2 - 1) * halfH;
      const zOffset = (Math.random() * 2 - 1) * halfT;

      this.positions[idx + 1] = yOffset;
      this.positions[idx + 2] = zOffset;
      this.baseOffsetsY[i] = yOffset;
      this.baseOffsetsZ[i] = zOffset;
    }
    this.updateMeshTransforms();
  }

  public setPhysicsState(
    currentMa: number,
    magFieldTesla: number,
    hallVoltageMv: number,
    carrierType: CarrierType
  ): void {
    this.currentMa = currentMa;
    this.magFieldStrength = magFieldTesla;
    this.hallVoltageMv = hallVoltageMv;
    this.setCarrierType(carrierType);
    this.updateChargeBadges();
    this.updateVectorHelpers();
  }

  public setCarrierType(type: CarrierType): void {
    this.carrierType = type;
    if (type === 'electron') {
      // Vivid Neon Emerald Green
      this.sphereMat.color.setHex(0x39ff14);
      this.sphereMat.emissive.setHex(0x00ff88);
      this.sphereMat.emissiveIntensity = 3.8;
    } else if (type === 'hole') {
      // Vivid Solar Gold / Amber
      this.sphereMat.color.setHex(0xffaa00);
      this.sphereMat.emissive.setHex(0xff7700);
      this.sphereMat.emissiveIntensity = 3.8;
    } else {
      // Luminous Cyber Cyan
      this.sphereMat.color.setHex(0x00f0ff);
      this.sphereMat.emissive.setHex(0x00b4d8);
      this.sphereMat.emissiveIntensity = 3.2;
    }

    this.updateChargeBadges();
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.showParticles = showParticles;
    this.vectorGroup.visible = showVectors;
    this.instancedMesh.visible = showParticles;
    const badgeActive = Math.abs(this.hallVoltageMv) > 0.005;
    this.topChargeGroup.visible = badgeActive;
    this.bottomChargeGroup.visible = badgeActive;
  }

  public update(delta: number): void {
    if (!this.showParticles) return;

    const halfL = this.waferLength * 0.46;
    const halfH = this.waferHeight * 0.42;

    const currentSign = this.currentMa >= 0 ? 1 : -1;
    const isElectron = this.carrierType === 'electron';
    const driftDirection = isElectron ? -currentSign : currentSign;

    const b = this.magFieldStrength;
    const bSign = b >= 0 ? 1 : -1;

    // Deflects DOWNWARDS when current > 0 and B > 0
    const flSign = -currentSign * bSign;

    const deflectionIntensity = THREE.MathUtils.clamp(
      (Math.abs(b) / 1.0) * (Math.abs(this.currentMa) / 10.0),
      0,
      1
    );
    const maxDeflectionY = halfH * 0.78 * deflectionIntensity * flSign;

    const speed = Math.max(0.04, Math.min(0.26, Math.abs(this.currentMa) * 0.014));

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      // Longitudinal drift along X
      this.positions[idx] += driftDirection * speed * delta;

      // Wrap around when exiting wafer edge
      if (driftDirection > 0 && this.positions[idx] > halfL) {
        this.positions[idx] = -halfL;
        this.baseOffsetsY[i] = (Math.random() * 2 - 1) * halfH * 0.8;
      } else if (driftDirection < 0 && this.positions[idx] < -halfL) {
        this.positions[idx] = halfL;
        this.baseOffsetsY[i] = (Math.random() * 2 - 1) * halfH * 0.8;
      }

      // Smooth parabolic trajectory towards accumulating edge
      const u = driftDirection > 0
        ? (this.positions[idx] + halfL) / (2 * halfL)
        : (halfL - this.positions[idx]) / (2 * halfL);

      const curveWeight = Math.pow(Math.max(0, Math.min(1, u)), 1.3);
      const targetY = this.baseOffsetsY[i] + maxDeflectionY * curveWeight;

      this.positions[idx + 1] = THREE.MathUtils.clamp(targetY, -halfH * 0.95, halfH * 0.95);
    }

    this.updateMeshTransforms();
    this.updateVectorHelpers();
  }

  private updateMeshTransforms(): void {
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.dummyObj.position.set(
        this.positions[idx],
        this.positions[idx + 1],
        this.positions[idx + 2]
      );
      this.dummyObj.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private updateVectorHelpers(): void {
    if (!this.showVectors) return;

    const currentSign = this.currentMa >= 0 ? 1 : -1;
    const isElectron = this.carrierType === 'electron';
    const driftDir = isElectron ? -currentSign : currentSign;

    this.arrowVelocity.setDirection(new THREE.Vector3(driftDir, 0, 0));

    const bSign = this.magFieldStrength >= 0 ? 1 : -1;
    this.arrowMagField.setDirection(new THREE.Vector3(0, 0, bSign));

    const flSign = -currentSign * bSign;
    this.arrowLorentz.setDirection(new THREE.Vector3(0, flSign, 0));

    const ehSign = this.hallVoltageMv < 0 ? -1 : 1;
    this.arrowHallField.setDirection(new THREE.Vector3(0, ehSign, 0));
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
