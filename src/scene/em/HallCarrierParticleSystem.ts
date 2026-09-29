import * as THREE from 'three';
import type { ComputeBridge } from '../../core/platform/ComputeBridge.ts';

export interface HallCarrierOptions {
  waferLength?: number;    // 沿X轴（长度/宽度）
  waferHeight?: number;    // 沿Y轴（高度）
  waferThickness?: number; // 沿Z轴（厚度）
  waferWidth?: number;     // waferHeight的向后兼容别名
  particleCount?: number;
  computeBridge?: ComputeBridge;
  useWorkerSimulation?: boolean;
}

export type CarrierType = 'electron' | 'hole' | 'metal';

export class HallCarrierParticleSystem {
  public group: THREE.Group;
  private readonly particleCount: number;

  // 物理尺寸
  public readonly waferLength: number;
  public readonly waferHeight: number;
  public readonly waferThickness: number;
  public get waferWidth(): number {
    return this.waferHeight;
  }

  // 粒子位置与仿真状态
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

  // 量子发光点系统（核心+光晕双层）
  private particleGeo: THREE.BufferGeometry;
  private corePoints: THREE.Points;
  private haloPoints: THREE.Points;
  private coreMat: THREE.PointsMaterial;
  private haloMat: THREE.PointsMaterial;

  // 不同载流子类型的纹理
  private electronTexture: THREE.CanvasTexture;
  private holeTexture: THREE.CanvasTexture;
  private metalTexture: THREE.CanvasTexture;
  private electronHaloTexture: THREE.CanvasTexture;
  private holeHaloTexture: THREE.CanvasTexture;
  private metalHaloTexture: THREE.CanvasTexture;

  // 横向静电势发光带（上下面边界）
  private topGlowMesh: THREE.Mesh;
  private bottomGlowMesh: THREE.Mesh;
  private topGlowMat: THREE.MeshBasicMaterial;
  private bottomGlowMat: THREE.MeshBasicMaterial;

  // 表面电荷指示徽标（微型胶囊徽章）
  private probeBadgeGroup: THREE.Group;
  private topProbeSprites: THREE.Sprite[] = [];
  private bottomProbeSprites: THREE.Sprite[] = [];
  public topProbeSprite: THREE.Sprite;
  public bottomProbeSprite: THREE.Sprite;
  private plusBadgeTex: THREE.CanvasTexture;
  private minusBadgeTex: THREE.CanvasTexture;
  private badgeMatTop: THREE.SpriteMaterial;
  private badgeMatBottom: THREE.SpriteMaterial;

  // 立体3D矢量指示器
  private vectorGroup: THREE.Group;
  private arrowVelocity: THREE.ArrowHelper;
  private arrowMagField: THREE.ArrowHelper;
  private arrowLorentz: THREE.ArrowHelper;
  private arrowHallField: THREE.ArrowHelper;

  private static readonly _VEC_VEL = new THREE.Vector3();
  private static readonly _VEC_B = new THREE.Vector3();
  private static readonly _VEC_FL = new THREE.Vector3();
  private static readonly _VEC_EH = new THREE.Vector3();

  // 物理状态
  private carrierType: CarrierType = 'electron';
  private magFieldStrength = 0.5; // 特斯拉 (T)
  private currentMa = 10.0;       // 毫安 (mA)
  private hallVoltageMv = -25.0;  // 毫伏 (mV)
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
   * 程序化辐射量子载流子纹理，具备高饱和色彩、
   * 镜面高光、清晰发光边界与量子电荷标识
   */
  private initTextures(): void {
    // n型载流子（电子 e⁻）：深电光皇家蓝主体 + 明亮电光青核心 + 高对比暗色边缘
    this.electronTexture = this.createGlowingParticleTexture({
      innerCore: '#00f0ff',                // 电光青内核
      mainBody: '#0062ff',                 // 明亮皇家电光蓝
      shadedEdge: '#003db8',               // 深饱和蓝宝石色
      darkRim: 'rgba(0, 18, 56, 0.88)',    // 高对比外围阴影边缘（确保在浅色背景下的对比度）
      haloColor: 'rgba(0, 130, 255, 0.55)', // 外层光晕
      symbol: '−',                         // 减号符号 (U+2212)
    });
    this.electronHaloTexture = this.createHaloTexture('rgba(0, 110, 255, 0.60)');

    // p型载流子（空穴 h⁺）：炽烈太阳琥珀内核 + 鲜艳深绯红主体 + 高对比暗色边缘
    this.holeTexture = this.createGlowingParticleTexture({
      innerCore: '#ffb300',                // 辐射太阳金/琥珀色
      mainBody: '#e62e2e',                 // 鲜艳饱和深绯红
      shadedEdge: '#a81313',               // 深焰红宝石色
      darkRim: 'rgba(56, 8, 8, 0.88)',     // 高对比外围阴影边缘
      haloColor: 'rgba(255, 60, 20, 0.55)', // 外层光晕
      symbol: '+',                         // 加号符号
    });
    this.holeHaloTexture = this.createHaloTexture('rgba(255, 50, 10, 0.60)');

    // 金属载流子：明亮钴蓝 / 电光群青
    this.metalTexture = this.createGlowingParticleTexture({
      innerCore: '#38bdf8',                // 电光天蓝
      mainBody: '#2563eb',                 // 亮丽钴蓝
      shadedEdge: '#1d4ed8',               // 深钴蓝
      darkRim: 'rgba(15, 23, 60, 0.88)',   // 高对比外围阴影边缘
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
      const bodyRadius = size * 0.36; // 46像素半径，呈现醒目的实心球体

      // 1. 柔和发光光晕（外层环境光晕）
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

      // 2. 高对比外围阴影边缘（确保在浅色实验室背景下的对比度）
      ctx.fillStyle = config.darkRim;
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius + 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. 实心3D球形量子粒子主体与镜面高光
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
        bodyGrad.addColorStop(0.0, '#ffffff');           // 纯白镜面高光点
        bodyGrad.addColorStop(0.12, '#ffffff');          // 聚集焦点高光
        bodyGrad.addColorStop(0.25, config.innerCore);   // 亮丽霓虹核心
        bodyGrad.addColorStop(0.60, config.mainBody);    // 高饱和鲜艳主体
        bodyGrad.addColorStop(0.88, config.shadedEdge);  // 深度饱和阴影主体
        bodyGrad.addColorStop(1.0, config.darkRim);      // 清晰外围边缘
        ctx.fillStyle = bodyGrad;
      } else {
        ctx.fillStyle = config.mainBody;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius, 0, Math.PI * 2);
      ctx.fill();

      // 4. 微弱内发光边缘
      ctx.strokeStyle = config.innerCore;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius - 0.75, 0, Math.PI * 2);
      ctx.stroke();

      // 5. 居中量子电荷符号及深色高对比投影
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

        // 重置阴影
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
    // 1. 双层量子载流子粒子系统
    this.particleGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.particleGeo.setAttribute('position', posAttr);
    this.disposables.push(this.particleGeo);

    // 光晕层：首先使用 NormalBlending 渲染辐射能量光晕 (renderOrder 18)
    this.haloMat = new THREE.PointsMaterial({
      size: 0.046,
      map: this.electronHaloTexture,
      transparent: true,
      opacity: 0.65,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    // 核心层：使用 NormalBlending 渲染高亮集中量子电荷点 (renderOrder 20)
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

    // 2. 横向静电势发光带
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

    // 3. 精密霍尔电压探针徽标（微型胶囊徽章）
    this.buildProbeBadges();

    // 4. 立体3D矢量指示器
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
      // 外部辐射环境光晕
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

      // 高对比磨砂胶囊背景
      ctx.beginPath();
      ctx.arc(64, 64, 46, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(22, 24, 30, 0.88)';
      ctx.fill();

      // 极性高亮色镜面边框
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = color;
      ctx.stroke();

      // 内部细白光环
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.stroke();

      // 加粗清晰字样
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
   * 边界表面电荷积累遵循高斯定律：sigma = epsilon * E_H = epsilon * V_H / h。
   * 电荷数量随 |V_H| 显著增加（由 I * B / (n * q * d) 决定）。
   * 零磁场 (B=0) 或零电流 (I=0) -> 0个表面累积电荷。
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

    // 沿顶面和底面动态对称分布
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

    // 根据霍尔电压大小调节发光强度
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

    // 实心3D圆柱形箭杆，替代1像素细线，提供高对比立体箭身
    const shaftLen = Math.max(0.002, length - headLength);
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12);
    const shaftMat = new THREE.MeshBasicMaterial({ color: colorHex });
    this.disposables.push(shaftGeo, shaftMat);

    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.position.set(0, shaftLen * 0.5, 0);
    arrow.add(shaftMesh);

    // 弱化1像素线框以消除瑕疵伪影
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

    // 醒目、高对比立体矢量箭头
    // 1. 速度 v：浓郁饱和翡翠绿
    this.arrowVelocity = this.createThickArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(halfL * 0.45, 0, halfT + 0.018),
      0.046,
      0x00a843, // 深邃生动翡翠绿
      0.014,
      0.0085,
      0.0018
    );

    // 2. 磁场 B：深邃皇家天蓝 / 电光蓝
    this.arrowMagField = this.createThickArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-halfL * 0.50, 0, -halfT - 0.020),
      0.052,
      0x0066ff, // 深邃皇家天蓝
      0.015,
      0.0090,
      0.0018
    );

    // 3. 洛伦兹力 F_L：高对比鲜艳深绯红
    this.arrowLorentz = this.createThickArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, halfT + 0.018),
      0.044,
      0xd92d20, // 鲜艳深绯红
      0.014,
      0.0085,
      0.0018
    );

    // 4. 霍尔电场 E_H：饱和太阳琥珀赭石色
    this.arrowHallField = this.createThickArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-halfL * 0.45, 0, halfT + 0.018),
      0.044,
      0xe67300, // 浓郁饱和琥珀色
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
    // 电子逆电流方向漂移；空穴顺电流方向漂移
    const driftDirection = isElectron ? -currentSign : currentSign;

    const b = this.magFieldStrength;
    const bSign = b >= 0 ? 1 : -1;

    // 洛伦兹力方向：fl = q(v x B)
    // 当 I > 0 且 B > 0 时，电子与空穴均向下偏转
    const flSign = -currentSign * bSign;

    const hasCurrent = Math.abs(this.currentMa) > 1e-4;
    const hasField = Math.abs(b) > 1e-4;

    // 物理洛伦兹力驱动因子：严格由磁感应强度B决定
    // 载流子横向偏转幅度（霍尔角 tanθ_H = μB）仅取决于B，
    // 与漂移电流I无关。
    const driveNorm = (hasCurrent && hasField)
      ? (Math.abs(b) / 0.5)
      : 0;

    // 高动态范围饱和曲线，大幅提高上限（最高至 1.60）
    const deflectionAlpha = THREE.MathUtils.clamp(
      Math.pow(driveNorm, 0.55) * 0.92,
      0,
      1.60
    );
    const maxDeflectionY = halfH * deflectionAlpha * flSign;

    // 纵向漂移速度：电流为0时严格为0（无向前漂移）
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

      // 1. 沿X轴持续纵向漂移（仅当有电流通过时）
      if (speed > 0) {
        this.positions[idx] += driftDirection * speed * delta;

        // 连续模循环环绕，无位置丢失或突然的Y向跳变
        if (this.positions[idx] > halfL) {
          this.positions[idx] -= curveL;
        } else if (this.positions[idx] < -halfL) {
          this.positions[idx] += curveL;
        }
      }

      // 2. 物理霍尔平衡横向分布（"中间平两边弯" 流线曲率）：
      // 在中心观测区 (|u| <= 0.38)，霍尔静电力与洛伦兹力完全平衡 (q*E_H = -F_L)，
      // 因而流线完全水平平直 (dY/dx = 0)。
      // 靠近电极接触端 (|u| > 0.38) 时，等势面边界恢复接触注入扩散，
      // 形成平滑的 C^1 埃尔米特 (Hermite) 边界弯曲。
      const absU = Math.abs(this.positions[idx] / halfL);
      let curvFactor = 1.0;
      if (absU > 0.38) {
        const t = Math.min(1.0, (absU - 0.38) / 0.62);
        // 平滑埃尔米特 C1 连续过渡：中心处为 1.0，逐渐过渡至电极处的 0.12
        curvFactor = 1.0 - 0.88 * t * t * (3.0 - 2.0 * t);
      }

      const localAlpha = deflectionAlpha * curvFactor;
      const normA = Math.min(1.0, localAlpha / 1.60);
      const u0 = THREE.MathUtils.clamp(this.baseOffsetsY[i] / halfH, -1.0, 1.0);
      const p = (u0 + 1.0) * 0.5;

      // 非线性玻尔兹曼-霍尔载流子积累与耗尽层动力学（上限提升）
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

      // 平滑弛豫趋向霍尔平衡流线（瞬态迁移）
      const currentY = this.positions[idx + 1];
      const nextY = currentY + (clampedTargetY - currentY) * relaxFactor;

      // 3. 柔和有机量子布朗起伏（多频率非同步）
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
      ? (Math.abs(b) / 0.5)
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
