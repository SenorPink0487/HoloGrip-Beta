import * as THREE from 'three';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface HallCarrierOptions {
  waferLength?: number;    // Along X (width)
  waferHeight?: number;    // Along Y (height)
  waferThickness?: number; // Along Z (depth)
  waferWidth?: number;     // Backwards-compatible alias for waferHeight
  particleCount?: number;
  computeBridge?: ComputeBridge;
  useWorkerSimulation?: boolean;
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
  private workerPositions?: Float32Array;
  private workerBaseOffsetsY?: Float32Array;

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
  private electronHaloTexture: THREE.CanvasTexture;
  private holeHaloTexture: THREE.CanvasTexture;
  private metalHaloTexture: THREE.CanvasTexture;

  // Transverse Electrostatic Potential Glow Ribbons (Top & Bottom boundaries)
  private topGlowMesh: THREE.Mesh;
  private bottomGlowMesh: THREE.Mesh;
  private topGlowMat: THREE.MeshBasicMaterial;
  private bottomGlowMat: THREE.MeshBasicMaterial;

  // Surface Charge Badges (Apple Vision Pro Micro-Pills)
  private probeBadgeGroup: THREE.Group;
  private topProbeSprites: THREE.Sprite[] = [];
  private bottomProbeSprites: THREE.Sprite[] = [];
  public topProbeSprite: THREE.Sprite;
  public bottomProbeSprite: THREE.Sprite;
  private plusBadgeTex: THREE.CanvasTexture;
  private minusBadgeTex: THREE.CanvasTexture;
  private badgeMatTop: THREE.SpriteMaterial;
  private badgeMatBottom: THREE.SpriteMaterial;

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
    this.useWorkerSimulation = options.useWorkerSimulation ?? Boolean(options.computeBridge);

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
    this.useWorkerSimulation = Boolean(bridge);
  }

  /**
   * Procedural radiant quantum carrier textures with high-saturation pigment,
   * specular glint, crisp luminous boundary, and quantum charge indicator
   */
  private initTextures(): void {
    // n-type Carrier (electron e⁻): Deep Electric Royal Blue body + Vivid Neon Cyan Core + High-Contrast Dark Rim
    this.electronTexture = this.createGlowingParticleTexture({
      innerCore: '#00f0ff',                // Electric neon cyan inner core
      mainBody: '#0062ff',                 // Vivid royal electric blue
      shadedEdge: '#003db8',               // Deep saturated sapphire
      darkRim: 'rgba(0, 18, 56, 0.88)',    // High-contrast perimeter shadow rim for light backgrounds
      haloColor: 'rgba(0, 130, 255, 0.55)', // Outer aura
      symbol: '−',                         // True minus symbol (U+2212)
    });
    this.electronHaloTexture = this.createHaloTexture('rgba(0, 110, 255, 0.60)');

    // p-type Carrier (hole h⁺): Radiant Solar Amber Core + Deep Fiery Crimson-Red Body + High-Contrast Dark Rim
    this.holeTexture = this.createGlowingParticleTexture({
      innerCore: '#ffb300',                // Radiant solar gold/amber
      mainBody: '#e62e2e',                 // Vivid saturated fiery crimson
      shadedEdge: '#a81313',               // Deep flame ruby
      darkRim: 'rgba(56, 8, 8, 0.88)',     // High-contrast perimeter shadow rim
      haloColor: 'rgba(255, 60, 20, 0.55)', // Outer aura
      symbol: '+',                         // Plus symbol
    });
    this.holeHaloTexture = this.createHaloTexture('rgba(255, 50, 10, 0.60)');

    // Metal Carrier: Brilliant Cobalt / Electric Ultramarine
    this.metalTexture = this.createGlowingParticleTexture({
      innerCore: '#38bdf8',                // Electric sky blue
      mainBody: '#2563eb',                 // Vibrant cobalt blue
      shadedEdge: '#1d4ed8',               // Deep cobalt
      darkRim: 'rgba(15, 23, 60, 0.88)',   // High-contrast perimeter shadow rim
      haloColor: 'rgba(37, 99, 235, 0.50)',
      symbol: '−',
    });
    this.metalHaloTexture = this.createHaloTexture('rgba(37, 99, 235, 0.55)');

    this.disposables.push(
      this.electronTexture,
      this.holeTexture,
      this.metalTexture,
      this.electronHaloTexture,
      this.holeHaloTexture,
      this.metalHaloTexture
    );
  }

  private createGlowingParticleTexture(config: {
    innerCore: string;
    mainBody: string;
    shadedEdge: string;
    darkRim: string;
    haloColor: string;
    symbol?: string;
  }): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;

    if (ctx && typeof ctx.arc === 'function') {
      const bodyRadius = size * 0.36; // 46px radius for prominent solid body

      // 1. Soft Luminous Glow Halo (Outer atmospheric glow)
      if (typeof ctx.createRadialGradient === 'function') {
        const haloGrad = ctx.createRadialGradient(cx, cy, bodyRadius * 0.75, cx, cy, size * 0.48);
        haloGrad.addColorStop(0.0, config.haloColor);
        haloGrad.addColorStop(0.55, config.haloColor.replace(/[\d.]+\)$/, '0.25)'));
        haloGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. High-Contrast Outer Perimeter Shadow Rim (Guarantees contrast on light lab backgrounds)
      ctx.fillStyle = config.darkRim;
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius + 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Solid 3D Spherical Quantum Particle Body with Specular Highlight
      if (typeof ctx.createRadialGradient === 'function') {
        const lightX = cx - bodyRadius * 0.28;
        const lightY = cy - bodyRadius * 0.28;
        const bodyGrad = ctx.createRadialGradient(
          lightX,
          lightY,
          0,
          cx,
          cy,
          bodyRadius
        );
        bodyGrad.addColorStop(0.0, '#ffffff');           // Pure specular glint highlight
        bodyGrad.addColorStop(0.12, '#ffffff');          // Tight pinpoint highlight
        bodyGrad.addColorStop(0.25, config.innerCore);   // Brilliant neon core
        bodyGrad.addColorStop(0.60, config.mainBody);    // High-saturation vivid body
        bodyGrad.addColorStop(0.88, config.shadedEdge);  // Deep saturated shaded body
        bodyGrad.addColorStop(1.0, config.darkRim);      // Crisp perimeter rim
        ctx.fillStyle = bodyGrad;
      } else {
        ctx.fillStyle = config.mainBody;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius, 0, Math.PI * 2);
      ctx.fill();

      // 4. Subtle Inner Luminance Rim
      ctx.strokeStyle = config.innerCore;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius - 0.75, 0, Math.PI * 2);
      ctx.stroke();

      // 5. Centered Quantum Charge Symbol with Dark Contrast Drop Shadow
      if (config.symbol && typeof ctx.fillText === 'function') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const yOffset = (config.symbol === '−' || config.symbol === '-') ? -1 : 1;
        ctx.fillText(config.symbol, cx, cy + yOffset);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private createHaloTexture(haloColor: string): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;

    if (ctx && typeof ctx.arc === 'function') {
      if (typeof ctx.createRadialGradient === 'function') {
        const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
        haloGrad.addColorStop(0.0, haloColor);
        haloGrad.addColorStop(0.40, haloColor.replace(/[\d.]+\)$/, '0.35)'));
        haloGrad.addColorStop(0.75, haloColor.replace(/[\d.]+\)$/, '0.08)'));
        haloGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = haloColor;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();
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

    // Halo layer: radiant luminous energy aura rendered first with NormalBlending (renderOrder 18)
    this.haloMat = new THREE.PointsMaterial({
      size: 0.046,
      map: this.electronHaloTexture,
      transparent: true,
      opacity: 0.65,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // Core layer: brilliant concentrated quantum charge point with NormalBlending (renderOrder 20)
    this.coreMat = new THREE.PointsMaterial({
      size: 0.026,
      map: this.electronTexture,
      transparent: true,
      opacity: 1.0,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.disposables.push(this.coreMat, this.haloMat);

    this.haloPoints = new THREE.Points(this.particleGeo, this.haloMat);
    this.corePoints = new THREE.Points(this.particleGeo, this.coreMat);
    this.haloPoints.renderOrder = 18;
    this.corePoints.renderOrder = 20;
    this.group.renderOrder = 20;

    this.group.add(this.haloPoints);
    this.group.add(this.corePoints);

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

    this.badgeMatTop = new THREE.SpriteMaterial({
      map: this.plusBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.badgeMatBottom = new THREE.SpriteMaterial({
      map: this.minusBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.disposables.push(this.badgeMatTop, this.badgeMatBottom);

    const badgeScale = 0.020;
    const topY = this.waferHeight * 0.5 + 0.018;
    const bottomY = -this.waferHeight * 0.5 - 0.018;
    const frontZ = this.waferThickness * 0.5 + 0.010;

    const maxBadges = 11;
    for (let i = 0; i < maxBadges; i++) {
      const topSprite = new THREE.Sprite(this.badgeMatTop);
      topSprite.scale.set(badgeScale, badgeScale, 1.0);
      topSprite.position.set(0, topY, frontZ);
      topSprite.visible = false;
      this.topProbeSprites.push(topSprite);
      this.probeBadgeGroup.add(topSprite);

      const bottomSprite = new THREE.Sprite(this.badgeMatBottom);
      bottomSprite.scale.set(badgeScale, badgeScale, 1.0);
      bottomSprite.position.set(0, bottomY, frontZ);
      bottomSprite.visible = false;
      this.bottomProbeSprites.push(bottomSprite);
      this.probeBadgeGroup.add(bottomSprite);
    }

    this.topProbeSprite = this.topProbeSprites[0];
    this.bottomProbeSprite = this.bottomProbeSprites[0];
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

  /**
   * Surface charge accumulation on boundaries follows Gauss's Law: sigma = epsilon * E_H = epsilon * V_H / h.
   * Number of charges increases visibly with |V_H| (governed by I * B / (n * q * d)).
   * Zero field (B=0) or zero current (I=0) -> 0 accumulated surface charges.
   */
  private getChargeCountForVoltage(vhMv: number, currentMa: number, bTesla: number): number {
    if (Math.abs(currentMa) < 1e-3 || Math.abs(bTesla) < 0.01) {
      return 0;
    }
    const absVh = Math.abs(vhMv);
    if (absVh < 0.05) return 0;
    if (absVh < 4.0) return 1;
    if (absVh < 10.0) return 3;
    if (absVh < 22.0) return 5;
    if (absVh < 40.0) return 7;
    if (absVh < 70.0) return 9;
    return 11;
  }

  private updateProbeBadges(): void {
    const activeChargeCount = this.getChargeCountForVoltage(
      this.hallVoltageMv,
      this.currentMa,
      this.magFieldStrength
    );
    const badgeVisible = activeChargeCount > 0;

    this.probeBadgeGroup.visible = badgeVisible;
    this.topGlowMesh.visible = badgeVisible;
    this.bottomGlowMesh.visible = badgeVisible;

    if (!badgeVisible) {
      for (let i = 0; i < this.topProbeSprites.length; i++) {
        this.topProbeSprites[i].visible = false;
        this.bottomProbeSprites[i].visible = false;
      }
      return;
    }

    const isTopPositive = this.hallVoltageMv < 0;
    const topTex = isTopPositive ? this.plusBadgeTex : this.minusBadgeTex;
    const bottomTex = isTopPositive ? this.minusBadgeTex : this.plusBadgeTex;

    if (this.badgeMatTop.map !== topTex) {
      this.badgeMatTop.map = topTex;
      this.badgeMatTop.needsUpdate = true;
    }
    if (this.badgeMatBottom.map !== bottomTex) {
      this.badgeMatBottom.map = bottomTex;
      this.badgeMatBottom.needsUpdate = true;
    }

    // Dynamic symmetric distribution along top and bottom surfaces
    const spanX = this.waferLength * 0.78;
    const topY = this.waferHeight * 0.5 + 0.018;
    const bottomY = -this.waferHeight * 0.5 - 0.018;
    const frontZ = this.waferThickness * 0.5 + 0.010;

    for (let i = 0; i < this.topProbeSprites.length; i++) {
      if (i < activeChargeCount) {
        const x = activeChargeCount === 1 ? 0 : -spanX * 0.5 + i * (spanX / (activeChargeCount - 1));
        this.topProbeSprites[i].position.set(x, topY, frontZ);
        this.topProbeSprites[i].visible = true;
        this.bottomProbeSprites[i].position.set(x, bottomY, frontZ);
        this.bottomProbeSprites[i].visible = true;
      } else {
        this.topProbeSprites[i].visible = false;
        this.bottomProbeSprites[i].visible = false;
      }
    }

    // Glow intensity scaling based on Hall voltage magnitude
    const normVh = Math.min(1.0, Math.abs(this.hallVoltageMv) / 60.0);
    const glowOpacity = 0.12 + normVh * 0.38;

    const topColor = isTopPositive ? 0xff453a : 0x0a84ff;
    const bottomColor = isTopPositive ? 0x0a84ff : 0xff453a;

    this.topGlowMat.color.setHex(topColor);
    this.topGlowMat.opacity = glowOpacity;
    this.bottomGlowMat.color.setHex(bottomColor);
    this.bottomGlowMat.opacity = glowOpacity;
  }

  private createThickArrowHelper(
    dir: THREE.Vector3,
    origin: THREE.Vector3,
    length: number,
    colorHex: number,
    headLength = 0.014,
    headWidth = 0.0085,
    shaftRadius = 0.0018
  ): THREE.ArrowHelper {
    const arrow = new THREE.ArrowHelper(dir, origin, length, colorHex, headLength, headWidth);

    // Solid 3D cylinder shaft to replace 1-pixel hairline with high-contrast volumetric shaft
    const shaftLen = Math.max(0.002, length - headLength);
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12);
    const shaftMat = new THREE.MeshBasicMaterial({ color: colorHex });
    this.disposables.push(shaftGeo, shaftMat);

    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.position.set(0, shaftLen * 0.5, 0);
    arrow.add(shaftMesh);

    // Dim the 1px wire line to avoid artifacting
    if (arrow.line && arrow.line.material) {
      (arrow.line.material as THREE.LineBasicMaterial).transparent = true;
      (arrow.line.material as THREE.LineBasicMaterial).opacity = 0;
    }

    return arrow;
  }

  private buildVectorHelpers(): void {
    this.vectorGroup = new THREE.Group();
    this.vectorGroup.name = 'HallVectorIndicators';
    this.vectorGroup.visible = this.showVectors;
    this.group.add(this.vectorGroup);

    const halfL = this.waferLength * 0.5;
    const halfT = this.waferThickness * 0.5;

    // Bold, high-contrast, volumetric vector arrows
    // 1. Velocity v: Rich Saturated Emerald Green
    this.arrowVelocity = this.createThickArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(halfL * 0.45, 0, halfT + 0.018),
      0.046,
      0x00a843, // Deep Vivid Emerald Green
      0.014,
      0.0085,
      0.0018
    );

    // 2. Magnetic Field B: Deep Royal Azure / Electric Blue
    this.arrowMagField = this.createThickArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-halfL * 0.50, 0, -halfT - 0.020),
      0.052,
      0x0066ff, // Deep Royal Azure
      0.015,
      0.0090,
      0.0018
    );

    // 3. Lorentz Force F_L: High-Contrast Fiery Crimson Red
    this.arrowLorentz = this.createThickArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, halfT + 0.018),
      0.044,
      0xd92d20, // Vivid Crimson Red
      0.014,
      0.0085,
      0.0018
    );

    // 4. Hall Electric Field E_H: Saturated Solar Amber Ochre
    this.arrowHallField = this.createThickArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-halfL * 0.45, 0, halfT + 0.018),
      0.044,
      0xe67300, // Deep Saturated Amber
      0.014,
      0.0085,
      0.0018
    );

    this.vectorGroup.add(this.arrowVelocity);
    this.vectorGroup.add(this.arrowMagField);
    this.vectorGroup.add(this.arrowLorentz);
    this.vectorGroup.add(this.arrowHallField);
  }

  private initParticles(): void {
    const halfL = this.waferLength * 0.46;
    const halfH = this.waferHeight * 0.40;
    const centerZ = this.waferThickness * 0.17;
    const halfT = this.waferThickness * 0.22;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.positions[idx] = (Math.random() * 2 - 1) * halfL;
      const yOffset = (Math.random() * 2 - 1) * halfH;
      const zOffset = centerZ + (Math.random() * 2 - 1) * halfT;

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
    const typeChanged = this.carrierType !== carrierType;
    this.currentMa = currentMa;
    this.magFieldStrength = magFieldTesla;
    this.hallVoltageMv = hallVoltageMv;
    if (typeChanged) {
      this.setCarrierType(carrierType);
    } else {
      this.updateProbeBadges();
    }
    this.updateVectorHelpers();
  }

  public setCarrierType(type: CarrierType): void {
    if (this.carrierType === type && this.coreMat.map) return;
    this.carrierType = type;
    let targetTexture = this.electronTexture;
    let targetHaloTexture = this.electronHaloTexture;

    if (type === 'electron') {
      targetTexture = this.electronTexture;
      targetHaloTexture = this.electronHaloTexture;
    } else if (type === 'hole') {
      targetTexture = this.holeTexture;
      targetHaloTexture = this.holeHaloTexture;
    } else {
      targetTexture = this.metalTexture;
      targetHaloTexture = this.metalHaloTexture;
    }

    if (this.coreMat.map !== targetTexture) {
      this.coreMat.map = targetTexture;
      this.coreMat.needsUpdate = true;
    }
    if (this.haloMat.map !== targetHaloTexture) {
      this.haloMat.map = targetHaloTexture;
      this.haloMat.needsUpdate = true;
    }

    this.updateProbeBadges();
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.showParticles = showParticles;
    this.vectorGroup.visible = showVectors;
    this.corePoints.visible = showParticles;
    this.haloPoints.visible = showParticles;

    const activeChargeCount = this.getChargeCountForVoltage(
      this.hallVoltageMv,
      this.currentMa,
      this.magFieldStrength
    );
    const badgeActive = activeChargeCount > 0;
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

    const hasCurrent = Math.abs(this.currentMa) > 1e-4;
    const hasField = Math.abs(b) > 1e-4;

    // Physical Lorentz driving factor: normalized around nominal operation (B = 0.5 T, I = 10 mA)
    const driveNorm = (hasCurrent && hasField)
      ? (Math.abs(b) / 0.5) * (Math.abs(this.currentMa) / 10.0)
      : 0;

    // High dynamic range saturation curve with significantly raised upper limit (up to 1.60)
    const deflectionAlpha = THREE.MathUtils.clamp(
      Math.pow(driveNorm, 0.55) * 0.92,
      0,
      1.60
    );
    const maxDeflectionY = halfH * deflectionAlpha * flSign;

    // Longitudinal drift velocity: strictly 0 when current is 0 (no forward drift)
    const speed = hasCurrent ? Math.max(0.04, Math.min(0.28, Math.abs(this.currentMa) * 0.016)) : 0;

    this.thermalPhaseClock = (this.thermalPhaseClock + delta * 3.0) % (Math.PI * 2000);
    const timeNow = this.thermalPhaseClock;

    if (this.useWorkerSimulation && this.computeBridge) {
      if (!this.isWorkerBusy) {
        this.isWorkerBusy = true;
        if (!this.workerPositions || this.workerPositions.byteLength === 0) {
          this.workerPositions = new Float32Array(this.positions);
        } else {
          this.workerPositions.set(this.positions);
        }
        if (!this.workerBaseOffsetsY || this.workerBaseOffsetsY.byteLength === 0) {
          this.workerBaseOffsetsY = new Float32Array(this.baseOffsetsY);
        } else {
          this.workerBaseOffsetsY.set(this.baseOffsetsY);
        }

        this.computeBridge
          .simulateHallCarriers({
            positions: this.workerPositions,
            baseOffsetsY: this.workerBaseOffsetsY,
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
              this.workerPositions = res.positions;
              this.workerBaseOffsetsY = res.baseOffsetsY;
              this.positions.set(res.positions);
              this.baseOffsetsY.set(res.baseOffsetsY);
              const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
              posAttr.needsUpdate = true;
            }
            this.isWorkerBusy = false;
          })
          .catch(() => {
            if (!this.workerPositions || this.workerPositions.byteLength === 0) {
              this.workerPositions = new Float32Array(this.positions);
            }
            if (!this.workerBaseOffsetsY || this.workerBaseOffsetsY.byteLength === 0) {
              this.workerBaseOffsetsY = new Float32Array(this.baseOffsetsY);
            }
            this.isWorkerBusy = false;
          });
      }
      return;
    }

    const curveL = 2 * halfL;
    const maxY = halfH * 0.92;
    const minY = -maxY;
    const minZ = -this.waferThickness * 0.08;
    const maxZ = this.waferThickness * 0.44;
    const relaxFactor = Math.min(1.0, delta * 12.0);

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      // 1. Continuous longitudinal drift along X (only when current flows)
      if (speed > 0) {
        this.positions[idx] += driftDirection * speed * delta;

        // Continuous modular wrap-around without positional loss or sudden Y jumps
        if (this.positions[idx] > halfL) {
          this.positions[idx] -= curveL;
        } else if (this.positions[idx] < -halfL) {
          this.positions[idx] += curveL;
        }
      }

      // 2. Physical Hall equilibrium transverse distribution ("中间平两边弯" Streamline Curvature):
      // In the central observation region (|u| <= 0.38), Hall electric force perfectly balances
      // Lorentz force (q*E_H = -F_L), so streamlines are completely horizontal and flat (dY/dx = 0).
      // Near electrode contacts (|u| > 0.38), equipotential boundaries restore contact injection spread,
      // producing smooth C^1 Hermite boundary curvature.
      const absU = Math.abs(this.positions[idx] / halfL);
      let curvFactor = 1.0;
      if (absU > 0.38) {
        const t = Math.min(1.0, (absU - 0.38) / 0.62);
        // Smooth Hermite C1-continuous transition: 1.0 at center down to 0.12 at electrodes
        curvFactor = 1.0 - 0.88 * t * t * (3.0 - 2.0 * t);
      }

      const localAlpha = deflectionAlpha * curvFactor;
      const normA = Math.min(1.0, localAlpha / 1.60);
      const u0 = THREE.MathUtils.clamp(this.baseOffsetsY[i] / halfH, -1.0, 1.0);
      const p = (u0 + 1.0) * 0.5;

      // Nonlinear Boltzmann-Hall carrier accumulation & depletion layer dynamics with raised upper limit
      let uSkew: number;
      const gamma = 1.0 + 2.2 * Math.min(1.5, localAlpha);
      if (flSign < 0) {
        const pSkew = Math.pow(Math.max(0, Math.min(1, p)), gamma);
        uSkew = 2.0 * pSkew - 1.0;
      } else {
        const pSkew = 1.0 - Math.pow(Math.max(0, Math.min(1, 1.0 - p)), gamma);
        uSkew = 2.0 * pSkew - 1.0;
      }

      const yShift = flSign * halfH * Math.min(0.85, 0.68 * localAlpha);
      const span = halfH * (0.90 - 0.55 * normA);
      const targetY = yShift + uSkew * span;
      const clampedTargetY = targetY < minY ? minY : targetY > maxY ? maxY : targetY;

      // Smooth relaxation towards Hall equilibrium streamline (transient migration)
      const currentY = this.positions[idx + 1];
      const nextY = currentY + (clampedTargetY - currentY) * relaxFactor;

      // 3. Gentle organic quantum Brownian fluctuation (multi-frequency, non-synchronized)
      const p1 = this.thermalPhases[i] + timeNow * 2.2;
      const p2 = this.thermalPhases[i] * 1.732 + timeNow * 3.7;
      const thermalY = (Math.sin(p1) * 0.65 + Math.sin(p2) * 0.35) * halfH * 0.022;
      const thermalZ = Math.cos(p1 * 1.2) * this.waferThickness * 0.025;

      const finalY = nextY + thermalY;
      this.positions[idx + 1] = finalY < minY ? minY : finalY > maxY ? maxY : finalY;

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
    const hasCurrent = Math.abs(this.currentMa) > 1e-4;
    const hasField = Math.abs(b) > 1e-4;
    const driveNorm = (hasCurrent && hasField)
      ? (Math.abs(b) / 0.5) * (Math.abs(this.currentMa) / 10.0)
      : 0;
    const deflectionAlpha = THREE.MathUtils.clamp(
      Math.pow(driveNorm, 0.55) * 0.92,
      0,
      1.60
    );
    const maxDeflectionY = halfH * deflectionAlpha * flSign;
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
