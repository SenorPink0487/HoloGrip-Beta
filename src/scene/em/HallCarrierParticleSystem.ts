import * as THREE from 'three';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface HallCarrierOptions {
  waferLength?: number;    // Along X (width)
  waferHeight?: number;    // Along Y (height)
  waferThickness?: number; // Along Z (depth)
  waferWidth?: number;     // Backwards-compatible alias for waferHeight
  particleCount?: number;
  computeBridge?: ComputeBridge;
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
  private thermalPhaseClock = 0;
  private computeBridge?: ComputeBridge;
  public useWorkerSimulation = false;
  private isWorkerBusy = false;

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
  private plusBadgeTex: THREE.CanvasTexture;
  private minusBadgeTex: THREE.CanvasTexture;

  // Sleek 3D Vector Indicators
  private vectorGroup: THREE.Group;
  private arrowVelocity: THREE.ArrowHelper;
  private arrowMagField: THREE.ArrowHelper;
  private arrowLorentz: THREE.ArrowHelper;
  private arrowHallField: THREE.ArrowHelper;

  private static readonly _VEC_VEL = new THREE.Vector3();
  private static readonly _VEC_B = new THREE.Vector3();
  private static readonly _VEC_FL = new THREE.Vector3();
  private static readonly _VEC_EH = new THREE.Vector3();

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
    this.computeBridge = options.computeBridge;

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

  public setComputeBridge(bridge: ComputeBridge): void {
    this.computeBridge = bridge;
  }

  /**
   * Procedural radiant quantum carrier textures with high-saturation pigment,
   * specular glint, crisp luminous boundary, and quantum charge indicator
   */
  private initTextures(): void {
    // n-type Carrier: Intense Electric Laser Cyan & Radiant Azure (#00F5FF -> #007AFF)
    this.electronTexture = this.createGlowingParticleTexture(
      '#ffffff',                 // Specular glint
      '#00f5ff',                 // Luminous electric cyan
      '#007aff',                 // Saturated vivid azure body
      'rgba(0, 210, 255, 0.50)', // Luminous ambient halo
      '−'                        // True minus symbol (U+2212)
    );

    // p-type Carrier: Intense Fiery Solar Amber & Radiant Crimson (#FFCC00 -> #FF3B30)
    this.holeTexture = this.createGlowingParticleTexture(
      '#ffffff',                 // Specular glint
      '#ffcc00',                 // Luminous solar gold
      '#ff3b30',                 // Saturated vivid flame red body
      'rgba(255, 120, 0, 0.55)', // Luminous ambient halo
      '+'                        // Plus symbol
    );

    // Metal Carrier: Brilliant Cobalt
    this.metalTexture = this.createGlowingParticleTexture(
      '#ffffff',
      '#64d2ff',
      '#0077ed',
      'rgba(0, 119, 237, 0.40)'
    );

    this.disposables.push(this.electronTexture, this.holeTexture, this.metalTexture);
  }

  private createGlowingParticleTexture(
    glintColor: string,
    coreColor: string,
    bodyColor: string,
    haloColor: string,
    symbol?: string
  ): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    if (ctx && typeof ctx.arc === 'function') {
      // 1. Soft Luminous Glow Halo
      if (typeof ctx.createRadialGradient === 'function') {
        const haloGrad = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 0.48);
        haloGrad.addColorStop(0.0, haloColor);
        haloGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Solid High-Contrast Quantum Particle Body
      const bodyRadius = size * 0.28;
      if (typeof ctx.createRadialGradient === 'function') {
        const bodyGrad = ctx.createRadialGradient(
          cx - size * 0.05,
          cy - size * 0.05,
          0,
          cx,
          cy,
          bodyRadius
        );
        bodyGrad.addColorStop(0.0, glintColor);
        bodyGrad.addColorStop(0.20, coreColor);
        bodyGrad.addColorStop(0.80, bodyColor);
        bodyGrad.addColorStop(1.0, bodyColor);
        ctx.fillStyle = bodyGrad;
      } else {
        ctx.fillStyle = coreColor;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Crisp Glowing Perimeter Rim (Ensures sharp contrast against any background)
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Centered Quantum Charge Symbol (Minus for e⁻, Plus for h⁺)
      if (symbol && typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, cx, cy + (symbol === '−' || symbol === '-' ? -0.5 : 1));
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private build(): void {
    // 1. Dual-Layer Quantum Carrier Particle System
    this.particleGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.particleGeo.setAttribute('position', posAttr);
    this.disposables.push(this.particleGeo);

    // Core layer: brilliant concentrated quantum charge point with NormalBlending for 100% saturation
    this.coreMat = new THREE.PointsMaterial({
      size: 0.018,
      map: this.electronTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // Halo layer: radiant luminous energy wavepacket
    this.haloMat = new THREE.PointsMaterial({
      size: 0.034,
      map: this.electronTexture,
      transparent: true,
      opacity: 0.70,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.disposables.push(this.coreMat, this.haloMat);

    this.corePoints = new THREE.Points(this.particleGeo, this.coreMat);
    this.haloPoints = new THREE.Points(this.particleGeo, this.haloMat);
    this.corePoints.renderOrder = 20;
    this.haloPoints.renderOrder = 21;
    this.group.renderOrder = 20;
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

    this.plusBadgeTex = this.createProbeBadgeTexture('+', '#ff453a');
    this.minusBadgeTex = this.createProbeBadgeTexture('−', '#0a84ff');
    this.disposables.push(this.plusBadgeTex, this.minusBadgeTex);

    const badgeMatTop = new THREE.SpriteMaterial({
      map: this.plusBadgeTex,
      transparent: true,
      depthTest: false,
    });
    const badgeMatBottom = new THREE.SpriteMaterial({
      map: this.minusBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.disposables.push(badgeMatTop, badgeMatBottom);

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
  }

  private createProbeBadgeTexture(symbol: string, color: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
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
      if (typeof ctx.fillText === 'function') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 70px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, 64, 63);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
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

    const topTex = isTopPositive ? this.plusBadgeTex : this.minusBadgeTex;
    const bottomTex = isTopPositive ? this.minusBadgeTex : this.plusBadgeTex;
    if (this.topProbeSprite.material.map !== topTex) {
      this.topProbeSprite.material.map = topTex;
      this.topProbeSprite.material.needsUpdate = true;
    }
    if (this.bottomProbeSprite.material.map !== bottomTex) {
      this.bottomProbeSprite.material.map = bottomTex;
      this.bottomProbeSprite.material.needsUpdate = true;
    }
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

    if (showVectors) {
      this.updateVectorHelpers();
    }
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

    // Longitudinal drift velocity: strictly 0 when current is 0 (no forward drift)
    const hasCurrent = Math.abs(this.currentMa) > 1e-4;
    const speed = hasCurrent ? Math.max(0.04, Math.min(0.28, Math.abs(this.currentMa) * 0.016)) : 0;

    this.thermalPhaseClock = (this.thermalPhaseClock + delta * 3.0) % (Math.PI * 2000);
    const timeNow = this.thermalPhaseClock;

    if (this.useWorkerSimulation && this.computeBridge) {
      if (!this.isWorkerBusy) {
        this.isWorkerBusy = true;
        const positionsCopy = new Float32Array(this.positions);
        const baseOffsetsYCopy = new Float32Array(this.baseOffsetsY);

        this.computeBridge
          .simulateHallCarriers({
            positions: positionsCopy,
            baseOffsetsY: baseOffsetsYCopy,
            baseOffsetsZ: this.baseOffsetsZ,
            thermalPhases: this.thermalPhases,
            particleCount: this.particleCount,
            driftDirection,
            speed,
            maxDeflectionY,
            halfL,
            halfH,
            waferThickness: this.waferThickness,
            timeNow,
            delta,
          })
          .then((res) => {
            if (res && res.positions && res.baseOffsetsY) {
              this.positions.set(res.positions);
              this.baseOffsetsY.set(res.baseOffsetsY);
              const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
              posAttr.needsUpdate = true;
            }
            this.isWorkerBusy = false;
          })
          .catch(() => {
            this.isWorkerBusy = false;
          });
      }
      return;
    }

    const curveL = 2 * halfL;
    const invCurveL = 1.0 / curveL;
    const maxY = halfH * 0.94;
    const minY = -maxY;
    const maxZ = this.waferThickness * 0.40;
    const minZ = -maxZ;

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
        ? (this.positions[idx] + halfL) * invCurveL
        : (halfL - this.positions[idx]) * invCurveL;

      const clampedU = u < 0 ? 0 : u > 1 ? 1 : u;
      const curveWeight = Math.pow(clampedU, 1.35);

      // Microscopic thermal jitter (Brownian quantum fluctuation)
      const thermalPhase = this.thermalPhases[i] + timeNow;
      const thermalY = Math.sin(thermalPhase * 3.5) * halfH * 0.045;
      const thermalZ = Math.cos(thermalPhase * 2.8) * this.waferThickness * 0.06;

      const targetY = this.baseOffsetsY[i] + maxDeflectionY * curveWeight + thermalY;
      this.positions[idx + 1] = targetY < minY ? minY : targetY > maxY ? maxY : targetY;

      const targetZ = this.baseOffsetsZ[i] + thermalZ;
      this.positions[idx + 2] = targetZ < minZ ? minZ : targetZ > maxZ ? maxZ : targetZ;
    }

    const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  public async simulateStepAsync(delta: number): Promise<void> {
    if (!this.computeBridge || this.isWorkerBusy) return;

    const halfL = this.waferLength * 0.46;
    const halfH = this.waferHeight * 0.42;
    const currentSign = this.currentMa >= 0 ? 1 : -1;
    const isElectron = this.carrierType === 'electron';
    const driftDirection = isElectron ? -currentSign : currentSign;
    const b = this.magFieldStrength;
    const bSign = b >= 0 ? 1 : -1;
    const flSign = -currentSign * bSign;
    const deflectionIntensity = THREE.MathUtils.clamp((Math.abs(b) / 1.0) * (Math.abs(this.currentMa) / 10.0), 0, 1);
    const maxDeflectionY = halfH * 0.82 * deflectionIntensity * flSign;
    const hasCurrent = Math.abs(this.currentMa) > 1e-4;
    const speed = hasCurrent ? Math.max(0.04, Math.min(0.28, Math.abs(this.currentMa) * 0.016)) : 0;
    this.thermalPhaseClock = (this.thermalPhaseClock + delta * 3.0) % (Math.PI * 2000);

    this.isWorkerBusy = true;
    try {
      const res = await this.computeBridge.simulateHallCarriers({
        positions: new Float32Array(this.positions),
        baseOffsetsY: new Float32Array(this.baseOffsetsY),
        baseOffsetsZ: this.baseOffsetsZ,
        thermalPhases: this.thermalPhases,
        particleCount: this.particleCount,
        driftDirection,
        speed,
        maxDeflectionY,
        halfL,
        halfH,
        waferThickness: this.waferThickness,
        timeNow: this.thermalPhaseClock,
        delta,
      });

      if (res && res.positions && res.baseOffsetsY) {
        this.positions.set(res.positions);
        this.baseOffsetsY.set(res.baseOffsetsY);
        const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
      }
    } finally {
      this.isWorkerBusy = false;
    }
  }

  private updateVectorHelpers(): void {
    if (!this.showVectors) {
      this.vectorGroup.visible = false;
      return;
    }

    const hasCurrent = Math.abs(this.currentMa) > 0.05;
    const hasB = Math.abs(this.magFieldStrength) > 0.02;
    const hasVh = Math.abs(this.hallVoltageMv) > 0.01;

    this.arrowVelocity.visible = hasCurrent;
    this.arrowMagField.visible = hasB;
    this.arrowLorentz.visible = hasCurrent && hasB;
    this.arrowHallField.visible = hasVh;

    if (hasCurrent) {
      const currentSign = this.currentMa >= 0 ? 1 : -1;
      const isElectron = this.carrierType === 'electron';
      const driftDir = isElectron ? -currentSign : currentSign;
      HallCarrierParticleSystem._VEC_VEL.set(driftDir, 0, 0);
      this.arrowVelocity.setDirection(HallCarrierParticleSystem._VEC_VEL);
    }

    if (hasB) {
      const bSign = this.magFieldStrength >= 0 ? 1 : -1;
      HallCarrierParticleSystem._VEC_B.set(0, 0, bSign);
      this.arrowMagField.setDirection(HallCarrierParticleSystem._VEC_B);
    }

    if (hasCurrent && hasB) {
      const currentSign = this.currentMa >= 0 ? 1 : -1;
      const bSign = this.magFieldStrength >= 0 ? 1 : -1;
      const flSign = -currentSign * bSign;
      HallCarrierParticleSystem._VEC_FL.set(0, flSign, 0);
      this.arrowLorentz.setDirection(HallCarrierParticleSystem._VEC_FL);
    }

    if (hasVh) {
      const ehSign = this.hallVoltageMv < 0 ? -1 : 1;
      HallCarrierParticleSystem._VEC_EH.set(0, ehSign, 0);
      this.arrowHallField.setDirection(HallCarrierParticleSystem._VEC_EH);
    }
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
