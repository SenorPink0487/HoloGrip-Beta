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
  private readonly particleCount: number;

  // Physical dimensions
  public readonly waferLength: number;
  public readonly waferHeight: number;
  public readonly waferThickness: number;
  public get waferWidth(): number {
    return this.waferHeight;
  }

  // Particle positions & simulation state
  private positions: Float32Array;
  private baseOffsetsY: Float32Array;
  private baseOffsetsZ: Float32Array;
  private thermalPhases: Float32Array;

  // Quantum Luminous Point System (Core + Halo dual-layer)
  private particleGeo: THREE.BufferGeometry;
  private corePoints: THREE.Points;
  private haloPoints: THREE.Points;
  private coreMat: THREE.PointsMaterial;
  private haloMat: THREE.PointsMaterial;

  // Textures for different carrier types
  private electronTexture: THREE.CanvasTexture;
  private holeTexture: THREE.CanvasTexture;
  private metalTexture: THREE.CanvasTexture;

  // Transverse Electrostatic Potential Glow Ribbons (Top & Bottom boundaries)
  private topGlowMesh: THREE.Mesh;
  private bottomGlowMesh: THREE.Mesh;
  private topGlowMat: THREE.MeshBasicMaterial;
  private bottomGlowMat: THREE.MeshBasicMaterial;

  // Precision Hall Voltage Probe Badges (Only 2 elegant micro-badges at center probes)
  private probeBadgeGroup: THREE.Group;
  private topProbeSprite: THREE.Sprite;
  private bottomProbeSprite: THREE.Sprite;
  private badgeCanvasTop: HTMLCanvasElement;
  private badgeCanvasBottom: HTMLCanvasElement;
  private badgeTexTop: THREE.CanvasTexture;
  private badgeTexBottom: THREE.CanvasTexture;

  // Sleek 3D Vector Indicators
  private vectorGroup: THREE.Group;
  private arrowVelocity: THREE.ArrowHelper;
  private arrowMagField: THREE.ArrowHelper;
  private arrowLorentz: THREE.ArrowHelper;
  private arrowHallField: THREE.ArrowHelper;

  // Physical State
  private carrierType: CarrierType = 'electron';
  private magFieldStrength = 0.5; // Tesla
  private currentMa = 10.0;       // mA
  private hallVoltageMv = -25.0;  // mV
  private showVectors = false;
  private showParticles = true;

  private disposables: { dispose: () => void }[] = [];

  constructor(options: HallCarrierOptions = {}) {
    this.waferLength = options.waferLength ?? 0.32;
    this.waferHeight = options.waferHeight ?? options.waferWidth ?? 0.125;
    this.waferThickness = options.waferThickness ?? 0.032;
    this.particleCount = options.particleCount ?? 180;

    this.group = new THREE.Group();
    this.group.name = 'HallCarrierParticleSystem';

    this.positions = new Float32Array(this.particleCount * 3);
    this.baseOffsetsY = new Float32Array(this.particleCount);
    this.baseOffsetsZ = new Float32Array(this.particleCount);
    this.thermalPhases = new Float32Array(this.particleCount);

    this.initTextures();
    this.build();
    this.initParticles();
  }

  /**
   * Procedural radiant glow textures with smooth Gaussian core and exponential falloff
   */
  private initTextures(): void {
    this.electronTexture = this.createGlowingParticleTexture('#ffffff', '#00f0ff', '#007aff');
    this.holeTexture = this.createGlowingParticleTexture('#ffffff', '#ff9f0a', '#ff3b30');
    this.metalTexture = this.createGlowingParticleTexture('#ffffff', '#64d2ff', '#0091ff');

    this.disposables.push(this.electronTexture, this.holeTexture, this.metalTexture);
  }

  private createGlowingParticleTexture(coreColor: string, midColor: string, outerColor: string): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
      grad.addColorStop(0.0, coreColor);
      grad.addColorStop(0.2, coreColor);
      grad.addColorStop(0.45, midColor);
      grad.addColorStop(0.75, outerColor);
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = midColor;
    }
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private build(): void {
    // 1. Dual-Layer Quantum Carrier Particle System
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.disposables.push(this.particleGeo);

    // Core layer: brilliant concentrated quantum charge point
    this.coreMat = new THREE.PointsMaterial({
      size: 0.010,
      map: this.electronTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // Halo layer: radiant luminous energy wavepacket
    this.haloMat = new THREE.PointsMaterial({
      size: 0.022,
      map: this.electronTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.disposables.push(this.coreMat, this.haloMat);

    this.corePoints = new THREE.Points(this.particleGeo, this.coreMat);
    this.haloPoints = new THREE.Points(this.particleGeo, this.haloMat);
    this.group.add(this.corePoints);
    this.group.add(this.haloPoints);

    // 2. Transverse Electrostatic Potential Glow Ribbons
    const glowGeo = new THREE.PlaneGeometry(this.waferLength * 0.98, this.waferThickness * 0.92);
    this.disposables.push(glowGeo);

    this.topGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bottomGlowMat = new THREE.MeshBasicMaterial({
      color: 0x0a84ff,
      transparent: true,
      opacity: 0.35,
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

    // 3. Precision Hall Voltage Probe Badges (Apple Vision Pro Micro-Pills)
    this.buildProbeBadges();

    // 4. Sleek 3D Vector Indicators
    this.buildVectorHelpers();
  }

  private buildProbeBadges(): void {
    this.probeBadgeGroup = new THREE.Group();
    this.probeBadgeGroup.name = 'HallProbeBadges';
    this.group.add(this.probeBadgeGroup);

    // Canvas & Texture for Top Badge
    this.badgeCanvasTop = document.createElement('canvas');
    this.badgeCanvasTop.width = 128;
    this.badgeCanvasTop.height = 128;
    this.badgeTexTop = new THREE.CanvasTexture(this.badgeCanvasTop);
    this.badgeTexTop.minFilter = THREE.LinearFilter;

    // Canvas & Texture for Bottom Badge
    this.badgeCanvasBottom = document.createElement('canvas');
    this.badgeCanvasBottom.width = 128;
    this.badgeCanvasBottom.height = 128;
    this.badgeTexBottom = new THREE.CanvasTexture(this.badgeCanvasBottom);
    this.badgeTexBottom.minFilter = THREE.LinearFilter;

    const badgeMatTop = new THREE.SpriteMaterial({
      map: this.badgeTexTop,
      transparent: true,
      depthTest: false,
    });
    const badgeMatBottom = new THREE.SpriteMaterial({
      map: this.badgeTexBottom,
      transparent: true,
      depthTest: false,
    });
    this.disposables.push(this.badgeTexTop, this.badgeTexBottom, badgeMatTop, badgeMatBottom);

    const badgeScale = 0.026;
    const topY = this.waferHeight * 0.5 + 0.022;
    const bottomY = -this.waferHeight * 0.5 - 0.022;
    const frontZ = this.waferThickness * 0.5 + 0.010;

    this.topProbeSprite = new THREE.Sprite(badgeMatTop);
    this.topProbeSprite.scale.set(badgeScale, badgeScale, 1.0);
    this.topProbeSprite.position.set(0, topY, frontZ);
    this.probeBadgeGroup.add(this.topProbeSprite);

    this.bottomProbeSprite = new THREE.Sprite(badgeMatBottom);
    this.bottomProbeSprite.scale.set(badgeScale, badgeScale, 1.0);
    this.bottomProbeSprite.position.set(0, bottomY, frontZ);
    this.probeBadgeGroup.add(this.bottomProbeSprite);

    this.drawProbeBadge(this.badgeCanvasTop, '+', '#ff453a');
    this.drawProbeBadge(this.badgeCanvasBottom, '−', '#0a84ff');
    this.badgeTexTop.needsUpdate = true;
    this.badgeTexBottom.needsUpdate = true;
  }

  private drawProbeBadge(canvas: HTMLCanvasElement, symbol: string, color: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 128, 128);

    // Radiant outer ambient glow
    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
      grad.addColorStop(0.0, color);
      grad.addColorStop(0.65, 'rgba(0,0,0,0.1)');
      grad.addColorStop(1.0, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(64, 64, 62, 0, Math.PI * 2);
      ctx.fill();
    }

    // High-contrast frosted pill container
    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22, 24, 30, 0.88)';
    ctx.fill();

    // Specular border in polarity accent color
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Inner hairline white ring
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();

    // Bold, crisp typography
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 70px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 64, 63);
  }

  private updateProbeBadges(): void {
    const hasField = Math.abs(this.magFieldStrength) > 0.01 && Math.abs(this.currentMa) > 0.01;
    const isTopPositive = this.hallVoltageMv < 0;
    const badgeVisible = hasField && Math.abs(this.hallVoltageMv) > 0.005;

    this.probeBadgeGroup.visible = badgeVisible;
    this.topGlowMesh.visible = badgeVisible;
    this.bottomGlowMesh.visible = badgeVisible;

    if (!badgeVisible) return;

    // Intensity scaling based on voltage magnitude
    const normVh = Math.min(1.0, Math.abs(this.hallVoltageMv) / 40.0);
    const glowOpacity = 0.15 + normVh * 0.35;

    const topColor = isTopPositive ? 0xff453a : 0x0a84ff;
    const bottomColor = isTopPositive ? 0x0a84ff : 0xff453a;

    this.topGlowMat.color.setHex(topColor);
    this.topGlowMat.opacity = glowOpacity;
    this.bottomGlowMat.color.setHex(bottomColor);
    this.bottomGlowMat.opacity = glowOpacity;

    const topSymbol = isTopPositive ? '+' : '−';
    const bottomSymbol = isTopPositive ? '−' : '+';
    const topHex = isTopPositive ? '#ff453a' : '#0a84ff';
    const bottomHex = isTopPositive ? '#0a84ff' : '#ff453a';

    this.drawProbeBadge(this.badgeCanvasTop, topSymbol, topHex);
    this.drawProbeBadge(this.badgeCanvasBottom, bottomSymbol, bottomHex);
    this.badgeTexTop.needsUpdate = true;
    this.badgeTexBottom.needsUpdate = true;
  }

  private buildVectorHelpers(): void {
    this.vectorGroup = new THREE.Group();
    this.vectorGroup.name = 'HallVectorIndicators';
    this.vectorGroup.visible = this.showVectors;
    this.group.add(this.vectorGroup);

    const halfL = this.waferLength * 0.5;
    const halfT = this.waferThickness * 0.5;

    // Sleek, refined vector arrows
    this.arrowVelocity = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(halfL * 0.45, 0, halfT + 0.016),
      0.036,
      0x30d158, // Vibrant Emerald
      0.007,
      0.004
    );

    this.arrowMagField = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-halfL * 0.50, 0, -halfT - 0.018),
      0.042,
      0x00f0ff, // Electric Cyan
      0.007,
      0.004
    );

    this.arrowLorentz = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, halfT + 0.016),
      0.034,
      0x0a84ff, // Royal Azure
      0.007,
      0.004
    );

    this.arrowHallField = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-halfL * 0.45, 0, halfT + 0.016),
      0.034,
      0xff9f0a, // Solar Amber
      0.007,
      0.004
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
      this.thermalPhases[i] = Math.random() * Math.PI * 2;
    }

    const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
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
    this.updateProbeBadges();
    this.updateVectorHelpers();
  }

  public setCarrierType(type: CarrierType): void {
    this.carrierType = type;
    let targetTexture = this.electronTexture;

    if (type === 'electron') {
      targetTexture = this.electronTexture;
    } else if (type === 'hole') {
      targetTexture = this.holeTexture;
    } else {
      targetTexture = this.metalTexture;
    }

    this.coreMat.map = targetTexture;
    this.haloMat.map = targetTexture;
    this.coreMat.needsUpdate = true;
    this.haloMat.needsUpdate = true;

    this.updateProbeBadges();
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.showParticles = showParticles;
    this.vectorGroup.visible = showVectors;
    this.corePoints.visible = showParticles;
    this.haloPoints.visible = showParticles;

    const badgeActive = Math.abs(this.hallVoltageMv) > 0.005;
    this.probeBadgeGroup.visible = badgeActive;
    this.topGlowMesh.visible = badgeActive;
    this.bottomGlowMesh.visible = badgeActive;
  }

  public update(delta: number): void {
    if (!this.showParticles) return;

    const halfL = this.waferLength * 0.46;
    const halfH = this.waferHeight * 0.42;

    const currentSign = this.currentMa >= 0 ? 1 : -1;
    const isElectron = this.carrierType === 'electron';
    // Electrons drift against current flow; holes drift with current flow
    const driftDirection = isElectron ? -currentSign : currentSign;

    const b = this.magFieldStrength;
    const bSign = b >= 0 ? 1 : -1;

    // Lorentz force direction: fl = q(v x B)
    // Downwards when I > 0 and B > 0 for both electron and hole
    const flSign = -currentSign * bSign;

    const deflectionIntensity = THREE.MathUtils.clamp(
      (Math.abs(b) / 1.0) * (Math.abs(this.currentMa) / 10.0),
      0,
      1
    );
    const maxDeflectionY = halfH * 0.82 * deflectionIntensity * flSign;

    // Longitudinal drift velocity
    const speed = Math.max(0.04, Math.min(0.28, Math.abs(this.currentMa) * 0.016));

    const timeNow = performance.now() * 0.003;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      // Longitudinal drift along X
      this.positions[idx] += driftDirection * speed * delta;

      // Seamless wrap-around when exiting wafer boundary
      if (driftDirection > 0 && this.positions[idx] > halfL) {
        this.positions[idx] = -halfL;
        this.baseOffsetsY[i] = (Math.random() * 2 - 1) * halfH * 0.75;
      } else if (driftDirection < 0 && this.positions[idx] < -halfL) {
        this.positions[idx] = halfL;
        this.baseOffsetsY[i] = (Math.random() * 2 - 1) * halfH * 0.75;
      }

      // Smooth parabolic deflection towards accumulating edge
      const u = driftDirection > 0
        ? (this.positions[idx] + halfL) / (2 * halfL)
        : (halfL - this.positions[idx]) / (2 * halfL);

      const curveWeight = Math.pow(Math.max(0, Math.min(1, u)), 1.35);

      // Microscopic thermal jitter (Brownian quantum fluctuation)
      const thermalPhase = this.thermalPhases[i] + timeNow;
      const thermalY = Math.sin(thermalPhase * 3.5) * halfH * 0.045;
      const thermalZ = Math.cos(thermalPhase * 2.8) * this.waferThickness * 0.06;

      const targetY = this.baseOffsetsY[i] + maxDeflectionY * curveWeight + thermalY;

      this.positions[idx + 1] = THREE.MathUtils.clamp(targetY, -halfH * 0.94, halfH * 0.94);
      this.positions[idx + 2] = THREE.MathUtils.clamp(
        this.baseOffsetsZ[i] + thermalZ,
        -this.waferThickness * 0.40,
        this.waferThickness * 0.40
      );
    }

    const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;

    this.updateVectorHelpers();
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
