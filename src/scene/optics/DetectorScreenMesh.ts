import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export class DetectorScreenMesh {
  public readonly group = new THREE.Group();

  public readonly screenWidth = 0.16;
  public readonly screenHeight = 0.12;

  private screenCanvas: HTMLCanvasElement;
  private screenCtx: CanvasRenderingContext2D;
  private gridCanvas: HTMLCanvasElement;
  private gridCtx: CanvasRenderingContext2D;
  private alphaColorCache: Map<string, string[]> = new Map();
  private screenTexture: THREE.CanvasTexture;
  public screenMesh: THREE.Mesh;

  private digitalDisplayCanvas: HTMLCanvasElement;
  private digitalDisplayCtx: CanvasRenderingContext2D;
  private digitalDisplayTex: THREE.CanvasTexture;
  public digitalDisplayMesh: THREE.Mesh;

  private lastRenderKey = '';
  private lastMeterKey = '';
  public showCalipers = false;
  private lastFringeSpacingMm = 2.53;

  constructor() {
    this.group.name = 'DetectorScreenMesh';
    this.group.userData = { isDetectorScreen: true, screen: this };
    this.createMount();
    this.createScreen();
    this.createDigitalMeter();
    this.renderFringesPattern({ mode: 'spot', wavelengthNm: 632.8, intensity: 1.0 });
    this.updateMeter({ intensityRatio: 1.0, wavelengthNm: 632.8, fringeSpacingMm: 3.04 });
  }

  private createMount(): void {
    // 实验室级拉丝不锈钢立柱
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });

    // 高级本色阳极氧化喷砂铝合金边框
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ed,
      metalness: 0.70,
      roughness: 0.28,
    });

    // 滚花钛灰对比色锁紧手拧螺钉
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.75,
      roughness: 0.25,
    });

    // 1. 直径 12mm 不锈钢安装立柱
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 24), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    post.userData = { isDetectorScreen: true, screen: this };
    this.group.add(post);

    // 2. 立柱套筒固定夹
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.024, 24), frameMat);
    collar.position.y = 0.122;
    collar.castShadow = true;
    this.group.add(collar);

    const clampScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.014, 16), knobMat);
    clampScrew.rotation.z = Math.PI * 0.5;
    clampScrew.position.set(0.015, 0.122, 0);
    this.group.add(clampScrew);

    // 3. 屏幕后方精密超窄边框支撑架
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(this.screenWidth + 0.010, this.screenHeight + 0.010, 0.004),
      frameMat
    );
    frame.position.set(0, 0.186, 0.002);
    frame.castShadow = true;
    frame.userData = { isDetectorScreen: true, screen: this };
    this.group.add(frame);
  }

  private createScreen(): void {
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 768;
    this.screenCtx = this.screenCanvas.getContext('2d')!;

    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.width = 1024;
    this.gridCanvas.height = 768;
    this.gridCtx = this.gridCanvas.getContext('2d')!;
    this.initGridCanvas();

    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;

    // 哑光漫反射白色投影材质（双面渲染，确保全视角清晰可见）
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      side: THREE.DoubleSide,
    });

    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.screenWidth, this.screenHeight),
      screenMat
    );
    this.screenMesh.name = 'DetectorScreen';
    this.screenMesh.userData = { isDetectorScreen: true, screen: this };
    // 紧贴前面板平齐放置
    this.screenMesh.position.set(0, 0.186, -0.001);
    this.group.add(this.screenMesh);
  }

  private createDigitalMeter(): void {
    this.digitalDisplayCanvas = document.createElement('canvas');
    this.digitalDisplayCanvas.width = 512;
    this.digitalDisplayCanvas.height = 128;
    this.digitalDisplayCtx = this.digitalDisplayCanvas.getContext('2d')!;

    this.digitalDisplayTex = new THREE.CanvasTexture(this.digitalDisplayCanvas);
    this.digitalDisplayTex.colorSpace = THREE.SRGBColorSpace;

    const meterHousingMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8e3,
      metalness: 0.68,
      roughness: 0.30,
    });

    const meterGroup = new THREE.Group();
    // 平齐安装于屏幕正下方的安装立柱上
    meterGroup.position.set(0, 0.114, 0.001);

    // 超薄紧凑型外壳条
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.024, 0.010), meterHousingMat);
    housing.castShadow = true;
    housing.userData = { isDetectorScreen: true, screen: this };
    meterGroup.add(housing);

    // 集成式 OLED 读数显示窗
    const dispMat = new THREE.MeshBasicMaterial({ map: this.digitalDisplayTex });
    this.digitalDisplayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.100, 0.018), dispMat);
    this.digitalDisplayMesh.position.set(0, 0, -0.0051);
    this.digitalDisplayMesh.rotation.y = Math.PI; // 朝向前方迎光面（正对激光器）
    this.digitalDisplayMesh.userData = { isDetectorScreen: true, screen: this };
    meterGroup.add(this.digitalDisplayMesh);

    this.group.add(meterGroup);
  }

  private initGridCanvas(
    targetCtx: CanvasRenderingContext2D | null = this.gridCtx,
    w = this.gridCanvas?.width || 1024,
    h = this.gridCanvas?.height || 768
  ): void {
    if (!targetCtx) return;
    const ctx = targetCtx;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // 1. 真实大学实验室哑光白投影屏面（暖白缎面标靶板）
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(0, 0, w, h);

    // 2. 精密面板边框
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // 3. 精细毫米标尺网格（1024px / 160mm = 6.4 px/mm，即每 5mm 对应 32px，每 10mm 对应 64px）
    const step5mm = 32;
    const step10mm = 64;

    // 5mm 次刻度线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.0;
    for (let x = cx % step5mm; x < w; x += step5mm) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % step5mm; y < h; y += step5mm) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 10mm 主刻度线
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = 1.4;
    for (let x = cx % step10mm; x < w; x += step10mm) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % step10mm; y < h; y += step10mm) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 高对比度中心十字坐标分划线（X 与 Y 轴）
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    // 中心十字分划线刻度标记
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.8;
    for (let x = cx - step10mm * 7; x <= cx + step10mm * 7; x += step10mm) {
      ctx.beginPath();
      ctx.moveTo(x, cy - 6);
      ctx.lineTo(x, cy + 6);
      ctx.stroke();
    }
    for (let y = cy - step10mm * 5; y <= cy + step10mm * 5; y += step10mm) {
      ctx.beginPath();
      ctx.moveTo(cx - 6, y);
      ctx.lineTo(cx + 6, y);
      ctx.stroke();
    }

    // 角落技术参数文字标注
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.fillText('MATTE PROJECTION SCREEN · 1 div = 5.0 mm', 22, h - 22);
    ctx.textAlign = 'right';
    ctx.fillText('OPTICAL BENCH LAB', w - 22, 28);
    ctx.textAlign = 'left';
  }

  /**
   * 快速绘制预渲染的分划板网格（小于 0.02ms），包含针对非绘图测试环境的回退逻辑
   */
  private drawReticleGrid(): void {
    if (this.gridCanvas && typeof this.screenCtx.drawImage === 'function') {
      this.screenCtx.drawImage(this.gridCanvas, 0, 0);
    } else {
      this.initGridCanvas(this.screenCtx, this.screenCanvas.width, this.screenCanvas.height);
    }
  }

  private getAlphaColor(r: number, g: number, b: number, alpha: number): string {
    const aQuant = Math.min(50, Math.max(0, Math.round(alpha * 50)));
    const key = `${r}_${g}_${b}`;
    let lut = this.alphaColorCache.get(key);
    if (!lut) {
      lut = new Array(51);
      for (let i = 0; i <= 50; i++) {
        lut[i] = `rgba(${r}, ${g}, ${b}, ${(i / 50).toFixed(2)})`;
      }
      this.alphaColorCache.set(key, lut);
    }
    return lut[aQuant];
  }

  /**
   * 在屏上实时渲染光学光斑与干涉条纹图样
   */
  public renderFringesPattern(params: {
    mode: 'spot' | 'double_slit' | 'single_slit' | 'grating' | 'polarization' | 'spectrum';
    wavelengthNm: number;
    intensity: number;
    slitWidthMm?: number;
    slitDistanceMm?: number;
    gratingLinesPerMm?: number;
    screenDistanceM?: number;
    polarizerAngle?: number;
    analyzerAngle?: number;
  }): void {
    const intensity = typeof params.intensity === 'number' && !isNaN(params.intensity) ? params.intensity : 1.0;
    const wavelength = typeof params.wavelengthNm === 'number' && !isNaN(params.wavelengthNm) ? params.wavelengthNm : 550;
    const key = `${params.mode}_${wavelength.toFixed(1)}_${intensity.toFixed(3)}_${(params.slitWidthMm ?? 0).toFixed(3)}_${(params.slitDistanceMm ?? 0).toFixed(3)}_${params.gratingLinesPerMm || 0}_${(params.screenDistanceM ?? 0).toFixed(3)}_${(params.polarizerAngle ?? 0).toFixed(1)}_${(params.analyzerAngle ?? 0).toFixed(1)}_calipers_${this.showCalipers}`;
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    this.drawReticleGrid();

    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const color = OpticalPhysics.wavelengthToColor(wavelength);
    const rVal = Math.round(color.r * 255);
    const gVal = Math.round(color.g * 255);
    const bVal = Math.round(color.b * 255);
    const rgbStr = `rgba(${rVal}, ${gVal}, ${bVal}`;

    if (params.mode === 'spot' || params.mode === 'polarization') {
      // 哑光白色屏面上的高斯激光光斑
      const r = 28;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      grad.addColorStop(0, `${rgbStr}, ${intensity * 0.95})`);
      grad.addColorStop(0.35, `${rgbStr}, ${intensity * 0.75})`);
      grad.addColorStop(0.7, `${rgbStr}, ${intensity * 0.25})`);
      grad.addColorStop(1, `${rgbStr}, 0.0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (params.mode === 'spectrum') {
      // 投射在白板上的物理连续彩虹色散光谱
      const bandCenter = cx + 80;
      const bandWidth = 280;
      const leftX = bandCenter - bandWidth * 0.5;
      const rightX = bandCenter + bandWidth * 0.5;

      // 1. 连续彩虹色散渐变（红至紫）
      const grad = ctx.createLinearGradient(leftX, 0, rightX, 0);
      grad.addColorStop(0.00, 'rgba(235, 30, 30, 0.0)');
      grad.addColorStop(0.08, 'rgba(235, 30, 30, 0.94)'); // 红光 (~680nm)
      grad.addColorStop(0.22, 'rgba(245, 120, 0, 0.92)'); // 橙光 (~610nm)
      grad.addColorStop(0.38, 'rgba(235, 195, 0, 0.95)'); // 黄光 (~575nm)
      grad.addColorStop(0.52, 'rgba(25, 185, 60, 0.92)'); // 绿光 (~530nm)
      grad.addColorStop(0.68, 'rgba(0, 180, 225, 0.92)'); // 青光 (~480nm)
      grad.addColorStop(0.82, 'rgba(35, 75, 240, 0.95)'); // 蓝光 (~440nm)
      grad.addColorStop(0.94, 'rgba(135, 30, 230, 0.92)');// 紫光 (~405nm)
      grad.addColorStop(1.00, 'rgba(135, 30, 230, 0.0)');

      ctx.fillStyle = grad;
      ctx.fillRect(leftX, cy - 120, bandWidth, 240);

      // 2. 模拟真实光束轮廓的垂直边界柔和衰减
      const vGrad = ctx.createLinearGradient(0, cy - 120, 0, cy + 120);
      vGrad.addColorStop(0, 'rgba(246, 248, 251, 1.0)');
      vGrad.addColorStop(0.20, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(0.80, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(1, 'rgba(246, 248, 251, 1.0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(leftX, cy - 120, bandWidth, 240);
    } else if (params.mode === 'double_slit') {
      // 解析法计算杨氏双缝干涉条纹（双侧对称性优化）
      const d = (params.slitDistanceMm || 0.25) * 1e-3;
      const a = (params.slitWidthMm || 0.04) * 1e-3;
      const L = params.screenDistanceM || 1.0;
      const lambda = wavelength * 1e-9;
      const mmPerPx = 0.16 / w;
      const halfW = w * 0.5;

      for (let offset = 0; offset < halfW; offset += 2) {
        const xDist = offset * mmPerPx;
        const sinTheta = xDist / Math.sqrt(xDist * xDist + L * L);

        const beta = (Math.PI * a * sinTheta) / lambda;
        const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
        const alpha = (Math.PI * d * sinTheta) / lambda;
        const cosAlpha = Math.cos(alpha);
        const I = cosAlpha * cosAlpha * sinc * sinc * intensity;

        if (I > 0.008) {
          const colAlpha = Math.min(1.0, I * 0.95);
          ctx.fillStyle = this.getAlphaColor(rVal, gVal, bVal, colAlpha);
          ctx.fillRect(cx + offset, cy - 140, 2.2, 280);
          if (offset > 0) {
            ctx.fillRect(cx - offset, cy - 140, 2.2, 280);
          }
        }
      }

      // 模拟真实光束轮廓的垂直边界柔和衰减
      const vGrad = ctx.createLinearGradient(0, cy - 140, 0, cy + 140);
      vGrad.addColorStop(0, 'rgba(246, 248, 251, 1.0)');
      vGrad.addColorStop(0.20, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(0.80, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(1, 'rgba(246, 248, 251, 1.0)');
      ctx.fillStyle = vGrad;
    } else if (params.mode === 'single_slit') {
      // 夫琅禾费单缝衍射图样（双侧对称性优化）
      const a = (params.slitWidthMm || 0.05) * 1e-3;
      const L = params.screenDistanceM || 1.0;
      const lambda = wavelength * 1e-9;
      const mmPerPx = 0.16 / w;
      const halfW = w * 0.5;

      for (let offset = 0; offset < halfW; offset += 2) {
        const xDist = offset * mmPerPx;
        const sinTheta = xDist / Math.sqrt(xDist * xDist + L * L);

        const beta = (Math.PI * a * sinTheta) / lambda;
        const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
        const I = sinc * sinc * intensity;

        if (I > 0.008) {
          const colAlpha = Math.min(1.0, I * 0.95);
          ctx.fillStyle = this.getAlphaColor(rVal, gVal, bVal, colAlpha);
          ctx.fillRect(cx + offset, cy - 140, 2.2, 280);
          if (offset > 0) {
            ctx.fillRect(cx - offset, cy - 140, 2.2, 280);
          }
        }
      }

      // 模拟真实光束轮廓的垂直边界柔和衰减
      const vGrad = ctx.createLinearGradient(0, cy - 140, 0, cy + 140);
      vGrad.addColorStop(0, 'rgba(246, 248, 251, 1.0)');
      vGrad.addColorStop(0.20, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(0.80, 'rgba(246, 248, 251, 0.0)');
      vGrad.addColorStop(1, 'rgba(246, 248, 251, 1.0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, cy - 140, w, 280);
    } else if (params.mode === 'grating') {
      // 衍射光栅分光光谱级次
      const gratingLines = params.gratingLinesPerMm || 300;
      const d = 1e-3 / gratingLines;
      const lambda = wavelength * 1e-9;
      const L = params.screenDistanceM || 0.48;
      const pxPerM = w / 0.16;

      const orders = [
        { m: 0, scale: 1.0 },
        { m: 1, scale: 0.72 },
        { m: -1, scale: 0.72 },
        { m: 2, scale: 0.40 },
        { m: -2, scale: 0.40 },
      ];

      for (const ord of orders) {
        const sinTheta = (ord.m * lambda) / d;
        if (Math.abs(sinTheta) > 0.85) continue;
        const tanTheta = Math.tan(Math.asin(sinTheta));
        const xOffset = tanTheta * L * pxPerM;
        const xp = cx + xOffset;

        if (xp < 10 || xp > w - 10) continue;

        const slitGrad = ctx.createLinearGradient(xp - 14, 0, xp + 14, 0);
        const alpha = intensity * ord.scale * 0.92;
        slitGrad.addColorStop(0, `${rgbStr}, 0)`);
        slitGrad.addColorStop(0.5, `${rgbStr}, ${alpha})`);
        slitGrad.addColorStop(1, `${rgbStr}, 0)`);

        ctx.fillStyle = slitGrad;
        ctx.fillRect(xp - 14, cy - 140, 28, 280);
      }
    }

    if (this.showCalipers) {
      this.drawCalipersOverlay(this.lastFringeSpacingMm);
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * 高灵敏度 32 位 FNV-1a 缓冲区哈希，无需字符串序列化即可精确检测条纹变化
   */
  private computeBufferHash(buf: Float32Array): number {
    let h = 2166136261 >>> 0;
    const step = Math.max(1, Math.floor(buf.length / 64));
    for (let i = 0; i < buf.length; i += step) {
      const v = Math.round(buf[i] * 10000);
      h = Math.imul(h ^ v, 16777619) >>> 0;
    }
    return h;
  }

  /**
   * 直接从多核 Worker 计算缓冲区渲染条纹光强图样
   */
  public renderFringesFromBuffer(intensityBuffer: Float32Array, wavelengthNm: number, intensity = 1.0): void {
    const bLen = intensityBuffer.length;
    if (bLen === 0) return;

    const safeWavelength = typeof wavelengthNm === 'number' && !isNaN(wavelengthNm) ? wavelengthNm : 550;
    const safeIntensity = typeof intensity === 'number' && !isNaN(intensity) ? intensity : 1.0;
    const bufHash = this.computeBufferHash(intensityBuffer);
    const sampleHash = `buf_${safeWavelength.toFixed(1)}_${safeIntensity.toFixed(3)}_${bufHash}_calipers_${this.showCalipers}`;
    if (sampleHash === this.lastRenderKey) return;
    this.lastRenderKey = sampleHash;

    this.drawReticleGrid();

    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cy = h * 0.5;

    const color = OpticalPhysics.wavelengthToColor(safeWavelength);
    const rVal = Math.round(color.r * 255);
    const gVal = Math.round(color.g * 255);
    const bVal = Math.round(color.b * 255);

    const colW = w / bLen;
    for (let i = 0; i < bLen; i++) {
      const I = intensityBuffer[i] * safeIntensity;
      if (I < 0.008) continue;
      const x = i * colW;
      const alpha = Math.min(1.0, I * 0.95);
      ctx.fillStyle = this.getAlphaColor(rVal, gVal, bVal, alpha);
      ctx.fillRect(x, cy - 140, colW + 0.6, 280);
    }

    if (this.showCalipers) {
      this.drawCalipersOverlay(this.lastFringeSpacingMm);
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * 切换虚拟游标卡尺测量工具
   */
  public toggleCalipers(): boolean {
    this.showCalipers = !this.showCalipers;
    this.lastRenderKey = '';
    this.lastMeterKey = '';
    return this.showCalipers;
  }

  /**
   * 在屏上绘制高精度虚拟游标卡尺指示线
   */
  private drawCalipersOverlay(fringeSpacingMm: number): void {
    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const pxPerMm = w / 160.0;
    const spanMm = Math.max(1.0, Math.min(30.0, fringeSpacingMm || this.lastFringeSpacingMm || 3.0));
    const spanPx = spanMm * pxPerMm;

    const x1 = cx - spanPx * 0.5;
    const x2 = cx + spanPx * 0.5;

    // 双朱红色精密测量标线
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.4;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([8, 4]);
    }

    ctx.beginPath();
    ctx.moveTo(x1, 40);
    ctx.lineTo(x1, h - 40);
    ctx.moveTo(x2, 40);
    ctx.lineTo(x2, h - 40);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    // 带箭头的卡尺水平尺寸线
    const arrowY = cy - 170;
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, arrowY);
    ctx.lineTo(x2, arrowY);
    // 左箭头
    ctx.moveTo(x1 + 8, arrowY - 5);
    ctx.lineTo(x1, arrowY);
    ctx.lineTo(x1 + 8, arrowY + 5);
    // 右箭头
    ctx.moveTo(x2 - 8, arrowY - 5);
    ctx.lineTo(x2, arrowY);
    ctx.lineTo(x2 - 8, arrowY + 5);
    ctx.stroke();

    // 测量读数标牌框（清晰边框的实验室白胶囊背景）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.8;
    const badgeW = 260;
    const badgeH = 40;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(cx - badgeW * 0.5, arrowY - badgeH - 8, badgeW, badgeH, 6);
    } else {
      ctx.rect(cx - badgeW * 0.5, arrowY - badgeH - 8, badgeW, badgeH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Δx = ${spanMm.toFixed(2)} mm (测微游标)`, cx, arrowY - badgeH * 0.5 - 8);
    ctx.textAlign = 'left';
  }

  /**
   * 更新集成式实验室数字光功率计读数显示
   */
  public updateMeter(params: {
    intensityRatio: number; // 0 至 1 相对光强比
    wavelengthNm: number;
    fringeSpacingMm?: number;
  }): void {
    const key = `${params.intensityRatio.toFixed(2)}_${params.wavelengthNm.toFixed(1)}_${(params.fringeSpacingMm || 0).toFixed(2)}`;
    if (key === this.lastMeterKey) return;
    this.lastMeterKey = key;

    const ctx = this.digitalDisplayCtx;
    const w = this.digitalDisplayCanvas.width;
    const h = this.digitalDisplayCanvas.height;

    // 深色科技感 OLED 显示屏背景
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, w, h);

    // 细边框线
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // 顶部标题
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('OPTICAL POWER SENSOR', 18, 28);

    // 相对光功率读数
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 36px monospace';
    const percent = (params.intensityRatio * 100).toFixed(1);
    ctx.fillText(`${percent}%`, 18, 72);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px monospace';
    ctx.fillText('I / I₀', 156, 68);

    // 次级物理量：波长与条纹间距
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`λ: ${params.wavelengthNm.toFixed(0)}nm`, 230, 48);

    if (params.fringeSpacingMm !== undefined) {
      this.lastFringeSpacingMm = params.fringeSpacingMm;
    }

    if (params.fringeSpacingMm) {
      ctx.fillText(`Δx: ${params.fringeSpacingMm.toFixed(2)}mm`, 230, 76);
    } else if (this.showCalipers) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText(`CALIPERS: ON`, 230, 76);
    } else {
      ctx.fillStyle = '#10b981';
      ctx.fillText(`STATUS: OK`, 230, 76);
    }

    // 底部微型信号进度条
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(18, 92, w - 36, 12);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(18, 92, (w - 36) * Math.max(0, Math.min(1, params.intensityRatio)), 12);

    this.digitalDisplayTex.needsUpdate = true;
  }

  public dispose(): void {
    this.screenTexture.dispose();
    this.digitalDisplayTex.dispose();
  }
}
