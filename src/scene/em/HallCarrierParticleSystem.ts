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
  private electronHaloTexture: THREE.CanvasTexture;
  private holeHaloTexture: THREE.CanvasTexture;
  private metalHaloTexture: THREE.CanvasTexture;

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

    this.coreMat.map = targetTexture;
    this.haloMat.map = targetHaloTexture;
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
    const maxY = halfH * 0.92;
    const minY = -maxY;
    const minZ = -this.waferThickness * 0.08;
    const maxZ = this.waferThickness * 0.44;
    const relaxFactor = Math.min(1.0, delta * 6.0);

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

      // 2. Physical Hall equilibrium transverse distribution:
      // In steady-state Hall equilibrium, transverse forces balance (q*E_H + q*(v x B) = 0).
      // Carriers drift along continuous streamlines; the magnetic field biases the overall
      // carrier concentration towards the accumulating boundary (producing the Hall voltage V_H).
      const baseNormY = this.baseOffsetsY[i] / halfH;
      const targetY = this.baseOffsetsY[i] + maxDeflectionY * (1.0 - 0.30 * Math.abs(baseNormY));
      const clampedTargetY = targetY < minY ? minY : targetY > maxY ? maxY : targetY;

      // Smooth relaxation towards Hall equilibrium distribution (transient migration)
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
