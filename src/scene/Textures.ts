import * as THREE from 'three';

/**
 * 高精科幻实验室程序化纹理生成器
 */
export class TextureGenerator {
  /**
   * 生成伪随机平滑 2D 晶格数值噪声
   */
  private static generateNoiseGrid(w: number, h: number, seed: number): Float32Array {
    const grid = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453123;
        grid[y * w + x] = n - Math.floor(n);
      }
    }
    return grid;
  }

  private static sampleNoise(grid: Float32Array, gw: number, gh: number, u: number, v: number): number {
    const x = ((u % 1 + 1) % 1) * (gw - 1);
    const y = ((v % 1 + 1) % 1) * (gh - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = grid[y0 * gw + x0];
    const v10 = grid[y0 * gw + x1];
    const v01 = grid[y1 * gw + x0];
    const v11 = grid[y1 * gw + x1];
    const top = v00 + sx * (v10 - v00);
    const bottom = v01 + sx * (v11 - v01);
    return top + sy * (bottom - top);
  }

  /**
   * 生成抛光环氧微水泥地面纹理
   */
  static createFloorTexture(prebakedFbm?: Uint8ClampedArray): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (prebakedFbm) {
      const off = document.createElement('canvas');
      off.width = 512;
      off.height = 512;
      const offCtx = off.getContext('2d')!;
      offCtx.putImageData(new ImageData(prebakedFbm as any, 512, 512), 0, 0);
      ctx.drawImage(off, 0, 0, size, size);
      ctx.fillStyle = 'rgba(232, 238, 244, 0.85)';
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.fillStyle = '#cfdbe3';
      ctx.fillRect(0, 0, size, size);
      // 匹配天窗光锥的柔和径向漫射光照渐变
      const glow = ctx.createRadialGradient(size * 0.5, size * 0.5, 30, size * 0.5, size * 0.5, size * 0.60);
      glow.addColorStop(0, 'rgba(245, 248, 252, 0.75)');
      glow.addColorStop(0.45, 'rgba(235, 240, 246, 0.45)');
      glow.addColorStop(0.85, 'rgba(215, 225, 232, 0.15)');
      glow.addColorStop(1, 'rgba(195, 208, 218, 0.25)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
    }

    // 微细洁净水磨石珠光微粒（保持通透纯净质感）
    let seed = 20260324;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 3500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = rand() * 0.9 + 0.3;
      const shade = rand();
      ctx.fillStyle = shade > 0.6
        ? 'rgba(255,255,255,0.55)'
        : shade > 0.25
          ? 'rgba(155, 170, 180, 0.18)'
          : 'rgba(120, 135, 145, 0.10)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * 生成地面粗糙度贴图（呈现微水泥缎面哑光质感）
   */
  static createFloorRoughnessMap(prebaked?: Uint8ClampedArray): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 精细缎面光泽粗糙度（基准约 0.18），防止高光过曝眩光
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(0, 0, size, size);

    // 相关的微观粗糙度扰动
    const off = document.createElement('canvas');
    off.width = 256;
    off.height = 256;
    const octx = off.getContext('2d')!;

    if (prebaked) {
      const img = new ImageData(prebaked as any, 256, 256);
      octx.putImageData(img, 0, 0);
    } else {
      const img = octx.createImageData(256, 256);
      const d = img.data;

      const g1 = this.generateNoiseGrid(16, 16, 8.11);
      const g2 = this.generateNoiseGrid(32, 32, 4.33);

      for (let y = 0; y < 256; y++) {
        const v = y / 256;
        for (let x = 0; x < 256; x++) {
          const u = x / 256;
          const n = 0.65 * this.sampleNoise(g1, 16, 16, u * 2, v * 2) + 0.35 * this.sampleNoise(g2, 32, 32, u * 4, v * 4);
          const val = Math.round(43 + n * 26);
          const idx = (y * 256 + x) * 4;
          d[idx] = val;
          d[idx + 1] = val;
          d[idx + 2] = val;
          d[idx + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
    }

    ctx.drawImage(off, 0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * 生成模拟液体环氧树脂表面张力的微浮雕凹凸贴图
   */
  static createFloorBumpMap(prebaked?: Uint8ClampedArray): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (prebaked) {
      const img = new ImageData(prebaked as any, size, size);
      ctx.putImageData(img, 0, 0);
    } else {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      const g = this.generateNoiseGrid(64, 64, 9.42);

      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const n = this.sampleNoise(g, 64, 64, u * 8, v * 8);
          const val = Math.round(120 + n * 16);
          const idx = (y * size + x) * 4;
          d[idx] = val;
          d[idx + 1] = val;
          d[idx + 2] = val;
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * 在 Web Worker 中并行烘焙所有地面纹理
   */
  static async bakeAllTexturesAsync(computeBridge: any): Promise<{
    floorTex: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  }> {
    const [floorRes, roughRes, bumpRes] = await Promise.all([
      computeBridge.bakeTextureAsync({ task: 'floor_fbm', resolution: 512 }),
      computeBridge.bakeTextureAsync({ task: 'roughness_fbm', resolution: 256 }),
      computeBridge.bakeTextureAsync({ task: 'bump_fbm', resolution: 512 }),
    ]);

    const floorTex = this.createFloorTexture(floorRes.pixelBuffer);
    const roughnessMap = this.createFloorRoughnessMap(roughRes.pixelBuffer);
    const bumpMap = this.createFloorBumpMap(bumpRes.pixelBuffer);

    return { floorTex, roughnessMap, bumpMap };
  }

  /**
   * 创建极简空间全息屏幕纹理
   */
  static createHoloScreenTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // 极简毛玻璃孔径视窗
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(16, 16, width - 32, height - 32, 28);
    ctx.fill();

    // 精致的高光边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 顶部微妙的高亮边缘
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 16);
    ctx.lineTo(width - 48, 16);
    ctx.stroke();

    // 标题文字排版
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('  Spatial Laboratory', width / 2, 210);

    // 引导提示文字排版
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 36px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif';
    ctx.fillText('轻触开启 3D 悬浮视窗', width / 2, 285);

    return new THREE.CanvasTexture(canvas);
  }

  private static drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
  }

  /**
   * 工业设计风格：一体化深黑黑曜石光学计量展板（2048 x 1280）
   */
  static createWallMainOpticsBoard(): THREE.CanvasTexture {
    const width = 2048;
    const height = 1280;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // 1. 深色黑曜石面板基底
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(10, 14, 20, 0.98)');
    grad.addColorStop(0.5, 'rgba(7, 10, 15, 0.98)');
    grad.addColorStop(1, 'rgba(4, 6, 10, 0.99)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawRoundRect(ctx, 16, 16, width - 32, height - 32, 20);
    ctx.fill();

    // 2. 超细微发丝金属边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 顶部微妙镜面高光
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 16);
    ctx.lineTo(width - 48, 16);
    ctx.stroke();

    // 3. 顶部标题栏
    // 标志图符
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '400 36px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 72, 85);

    // 主标题
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('OPTICAL METROLOGY MONOLITH', 120, 75);

    // 副标题
    ctx.fillStyle = '#8a99a8';
    ctx.font = '400 16px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('HOLOGRIP SPATIAL PHYSICS • PARAXIAL WAVEFRONT & COHERENCE METRICS', 120, 104);

    // 右侧技术参数胶囊标签
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    this.drawRoundRect(ctx, width - 340, 62, 268, 44, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('λ: 532.0 nm • Nd:YAG', width - 315, 84);

    // 极细分割线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(72, 138);
    ctx.lineTo(width - 72, 138);
    ctx.stroke();

    // 4. 第一分区（左侧）：近轴折射与光线传输矩阵
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 19px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('01  PARAXIAL RAY ANALYSIS & FOCAL GEOMETRY', 72, 185);

    ctx.fillStyle = '#6a7888';
    ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('TRANSFER MATRIX [M] = [1 d; 0 1][1 0; -1/f 1] • SNELL GEOMETRY', 72, 210);

    const box1X = 72;
    const box1Y = 235;
    const box1W = 900;
    const box1H = 580;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, box1X, box1Y, box1W, box1H, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 光轴
    const axisY = box1Y + box1H * 0.44;
    ctx.strokeStyle = 'rgba(160, 180, 205, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(box1X + 40, axisY);
    ctx.lineTo(box1X + box1W - 40, axisY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 双凸透镜
    const lensX = box1X + box1W * 0.46;
    const lensH = 260;
    const lensW = 64;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(lensX, axisY - lensH / 2);
    ctx.quadraticCurveTo(lensX + lensW / 2, axisY, lensX, axisY + lensH / 2);
    ctx.quadraticCurveTo(lensX - lensW / 2, axisY, lensX, axisY - lensH / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const fDist = 240;
    const focalX1 = lensX + fDist;

    // 激光光束（单色冷银白）
    const rayYs = [-85, -42, 0, 42, 85];
    rayYs.forEach((offset) => {
      const startY = axisY + offset;
      const lensContactX = lensX - (1 - Math.abs(offset) / 130) * (lensW / 2);

      ctx.strokeStyle = '#f4f6fa';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(box1X + 40, startY);
      ctx.lineTo(lensContactX, startY);
      ctx.stroke();

      const exitX = lensX + (1 - Math.abs(offset) / 130) * (lensW / 2);
      const exitY = startY - offset * 0.15;
      ctx.beginPath();
      ctx.moveTo(lensContactX, startY);
      ctx.lineTo(exitX, exitY);
      ctx.stroke();

      const targetY = axisY;
      const slope = (targetY - exitY) / (focalX1 - exitX);
      const endX = box1X + box1W - 40;
      const endY = exitY + slope * (endX - exitX);

      ctx.beginPath();
      ctx.moveTo(exitX, exitY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    });

    // 焦点 F1 处的十字准星
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(focalX1, axisY, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(focalX1 - 10, axisY);
    ctx.lineTo(focalX1 + 10, axisY);
    ctx.moveTo(focalX1, axisY - 10);
    ctx.lineTo(focalX1, axisY + 10);
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('F₁ (150.0 mm)', focalX1 - 45, axisY + 28);

    // 焦距标注箭头 f
    ctx.strokeStyle = '#6a7888';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(lensX, axisY + 115);
    ctx.lineTo(focalX1, axisY + 115);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX, axisY + 109);
    ctx.lineTo(lensX, axisY + 121);
    ctx.moveTo(focalX1, axisY + 109);
    ctx.lineTo(focalX1, axisY + 121);
    ctx.stroke();
    ctx.fillStyle = '#8a99a8';
    ctx.textAlign = 'center';
    ctx.fillText('focal length = 150.00 mm', (lensX + focalX1) / 2, axisY + 135);
    ctx.textAlign = 'left';

    // 下方图表（高斯光束剖面）
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('GAUSSIAN BEAM WAIST PROFILE w(z) = w₀ √[1 + (z/z_R)²]', box1X + 40, box1Y + box1H - 80);

    const gBaseY = box1Y + box1H - 42;
    ctx.strokeStyle = '#f4f6fa';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let px = 0; px <= 800; px += 8) {
      const z = (px - 400) / 120;
      const w = 14 * Math.sqrt(1 + z * z);
      if (px === 0) ctx.moveTo(box1X + 50 + px, gBaseY - w);
      else ctx.lineTo(box1X + 50 + px, gBaseY - w);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let px = 0; px <= 800; px += 8) {
      const z = (px - 400) / 120;
      const w = 14 * Math.sqrt(1 + z * z);
      if (px === 0) ctx.moveTo(box1X + 50 + px, gBaseY + w);
      else ctx.lineTo(box1X + 50 + px, gBaseY + w);
    }
    ctx.stroke();

    // 5. 第二分区（右侧）：相干干涉与艾里斑衍射
    const rightX = 1008;
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 19px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('02  AIRY DIFFRACTION & BESSEL INTENSITY', rightX, 185);

    ctx.fillStyle = '#6a7888';
    ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('I(θ) = I₀ [2 J₁(ka sinθ) / (ka sinθ)]² • SINGLE-MODE COHERENCE', rightX, 210);

    const box2W = width - rightX - 72;
    const box2H = 275;
    const box2Y = 235;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, box2Y, box2W, box2H, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 框 2 左侧艾里斑同心圆环
    const airyCenterX = rightX + 155;
    const airyCenterY = box2Y + box2H / 2;
    const ringRadii = [18, 38, 58, 78, 98];
    const ringOpacities = [0.8, 0.35, 0.18, 0.08, 0.03];
    ringRadii.forEach((r, idx) => {
      ctx.fillStyle = `rgba(244, 246, 250, ${ringOpacities[idx]})`;
      ctx.beginPath();
      ctx.arc(airyCenterX, airyCenterY, r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('2D AIRY DISC INTENSITY', airyCenterX, box2Y + box2H - 18);
    ctx.textAlign = 'left';

    // 框 2 右侧贝塞尔函数光强曲线
    const besselX = rightX + 320;
    const besselW = box2W - 360;
    const besselBaseY = box2Y + box2H * 0.65;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(besselX, besselBaseY);
    ctx.lineTo(besselX + besselW, besselBaseY);
    ctx.stroke();

    ctx.strokeStyle = '#f4f6fa';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let px = 0; px <= besselW; px += 4) {
      const t = (px - besselW / 2) / 36;
      let val = 1;
      if (Math.abs(t) > 0.01) {
        val = Math.pow(Math.sin(Math.PI * t) / (Math.PI * t), 2);
      }
      const py = besselBaseY - val * 120;
      if (px === 0) ctx.moveTo(besselX + px, py);
      else ctx.lineTo(besselX + px, py);
    }
    ctx.stroke();

    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('Central Disk Power: 83.8%', besselX, box2Y + 45);
    ctx.fillText('Diffraction Limit: 1.22 λ/D', besselX, box2Y + 70);

    // 右侧框 2：遥测参数表格
    const box3Y = box2Y + box2H + 20;
    const box3H = 285;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, box3Y, box2W, box3H, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('METROLOGY CALIBRATION DATA', rightX + 32, box3Y + 40);

    const telemetryData = [
      ['WAVELENGTH (VACUUM)', '532.000 nm', '±0.001 nm'],
      ['TEM TRANSVERSE MODE', 'TEM₀₀ GAUSSIAN', 'M² = 1.04'],
      ['RAYLEIGH LENGTH z_R', '2.012 mm', 'CALIBRATED'],
      ['COHERENCE LENGTH L_c', '12.42 m', 'SINGLE FREQ'],
      ['BEAM DIVERGENCE θ', '0.85 mrad', 'FAR FIELD'],
      ['EXTINCTION RATIO', '-46.2 dB', 'POLARIZED'],
    ];

    telemetryData.forEach((row, idx) => {
      const rowY = box3Y + 78 + idx * 32;
      ctx.fillStyle = '#6a7888';
      ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(row[0], rightX + 32, rowY);

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(row[1], rightX + 260, rowY);

      ctx.fillStyle = '#8a99a8';
      ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(row[2], rightX + 430, rowY);
    });

    // 6. 底部信息栏（4 个面板卡片）
    const cardY = 848;
    const cardH = 340;
    const cardW = (width - 144 - 3 * 24) / 4;

    const cards = [
      {
        tag: 'FOCAL METRIC',
        val: '150.00 mm',
        sub: 'BI-CONVEX REFRACTION',
        desc: 'Conjugate image distance verified with Snell paraxial ray model.',
      },
      {
        tag: 'BEAM WAIST',
        val: 'w₀ = 18.4 µm',
        sub: 'DIFFRACTION LIMITED',
        desc: 'Rayleigh length 2.01mm ensures stable focus throughout optical axis.',
      },
      {
        tag: 'SPECTRAL PURITY',
        val: '99.98 %',
        sub: 'SINGLE LONGITUDINAL',
        desc: 'Linewidth Δν < 1.0 kHz with active piezoelectric resonator lock.',
      },
      {
        tag: 'APPARATUS',
        val: 'AP-OP04',
        sub: 'DESIGNED IN CUPERTINO',
        desc: 'HoloGrip Spatial Physics Lab Architecture • Ver 3.0',
      },
    ];

    cards.forEach((card, idx) => {
      const cx = 72 + idx * (cardW + 24);
      ctx.fillStyle = 'rgba(14, 19, 28, 0.65)';
      ctx.beginPath();
      this.drawRoundRect(ctx, cx, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.fillStyle = '#6a7888';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(card.tag, cx + 24, cardY + 42);

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.fillText(card.val, cx + 24, cardY + 92);

      ctx.fillStyle = '#8a99a8';
      ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(card.sub, cx + 24, cardY + 125);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(cx + 24, cardY + 150);
      ctx.lineTo(cx + cardW - 24, cardY + 150);
      ctx.stroke();

      ctx.fillStyle = '#6a7888';
      ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      const words = card.desc.split(' ');
      let line = '';
      let textY = cardY + 185;
      for (const w of words) {
        const testLine = line + w + ' ';
        if (ctx.measureText(testLine).width > cardW - 48) {
          ctx.fillText(line, cx + 24, textY);
          line = w + ' ';
          textY += 22;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, cx + 24, textY);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Apple 专业工业设计：一体化黑曜石热力学展板纹理（1536 x 1024）
   */
  static createWallThermodynamicsBoard(): THREE.CanvasTexture {
    const width = 1536;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(10, 14, 20, 0.98)');
    grad.addColorStop(1, 'rgba(4, 6, 10, 0.99)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawRoundRect(ctx, 16, 16, width - 32, height - 32, 20);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Header
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '400 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 60, 68);

    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('THERMODYNAMIC DYNAMICS & KINETICS', 105, 62);

    ctx.fillStyle = '#8a99a8';
    ctx.font = '400 15px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('CARNOT CYCLE LOOP • MAXWELL-BOLTZMANN SPEED DISTRIBUTION', 105, 88);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(60, 118);
    ctx.lineTo(width - 60, 118);
    ctx.stroke();

    // 左侧面板：卡诺循环 P-V 状态图
    const leftW = 680;
    const leftH = 500;
    const leftX = 60;
    const leftY = 145;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, leftX, leftY, leftW, leftH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('CARNOT CYCLE INDICATOR LOOP (P - V)', leftX + 30, leftY + 38);

    // Axes
    const originX = leftX + 80;
    const originY = leftY + leftH - 70;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(originX, leftY + 70);
    ctx.lineTo(originX, originY);
    ctx.lineTo(leftX + leftW - 40, originY);
    ctx.stroke();

    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('P (kPa)', originX - 45, leftY + 80);
    ctx.fillText('V (L)', leftX + leftW - 35, originY + 25);

    // Carnot 4 Points
    const pt1 = { x: originX + 70, y: originY - 260 };
    const pt2 = { x: originX + 220, y: originY - 180 };
    const pt3 = { x: originX + 440, y: originY - 60 };
    const pt4 = { x: originX + 220, y: originY - 100 };

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(pt1.x, pt1.y);
    ctx.quadraticCurveTo(originX + 140, originY - 230, pt2.x, pt2.y);
    ctx.quadraticCurveTo(originX + 340, originY - 110, pt3.x, pt3.y);
    ctx.quadraticCurveTo(originX + 320, originY - 75, pt4.x, pt4.y);
    ctx.quadraticCurveTo(originX + 130, originY - 170, pt1.x, pt1.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#f4f6fa';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('W_net = ∮ P dV', (pt1.x + pt3.x) / 2, (pt1.y + pt3.y) / 2);
    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('η = 1 - (T_C / T_H) = 53.85%', (pt1.x + pt3.x) / 2, (pt1.y + pt3.y) / 2 + 24);
    ctx.textAlign = 'left';

    // 右侧面板：麦克斯韦-玻尔兹曼速率分布曲线
    const rightX = leftX + leftW + 24;
    const rightW = width - rightX - 60;
    const rightH = 500;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, leftY, rightW, rightH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('MAXWELL-BOLTZMANN VELOCITY DENSITY f(v)', rightX + 30, leftY + 38);

    const mbOriginX = rightX + 70;
    const mbOriginY = leftY + 280;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mbOriginX, leftY + 70);
    ctx.lineTo(mbOriginX, mbOriginY);
    ctx.lineTo(rightX + rightW - 30, mbOriginY);
    ctx.stroke();

    ctx.strokeStyle = '#f4f6fa';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let px = 0; px <= rightW - 120; px += 4) {
      const v = px / 35;
      const f = 160 * v * v * Math.exp(-v * v * 0.5);
      if (px === 0) ctx.moveTo(mbOriginX + px, mbOriginY - f);
      else ctx.lineTo(mbOriginX + px, mbOriginY - f);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let px = 0; px <= rightW - 120; px += 4) {
      const v = px / 48;
      const f = 110 * v * v * Math.exp(-v * v * 0.38);
      if (px === 0) ctx.moveTo(mbOriginX + px, mbOriginY - f);
      else ctx.lineTo(mbOriginX + px, mbOriginY - f);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('— T₁ = 300 K (v_p = 398 m/s)', mbOriginX + 160, leftY + 75);
    ctx.fillStyle = '#8a99a8';
    ctx.fillText('-- T₂ = 600 K (v_p = 563 m/s)', mbOriginX + 160, leftY + 98);

    // 底部 4 组参数指标卡
    const cardY = 670;
    const cardH = 300;
    const cardW = (width - 120 - 3 * 20) / 4;

    const cards = [
      { tag: 'CARNOT EFFICIENCY', val: '53.85 %', sub: 'TH = 650K • TC = 300K' },
      { tag: 'SPEED RANKING', val: 'v_p < v̄ < v_rms', sub: '1 : 1.128 : 1.225' },
      { tag: 'FOURIER FLUX', val: 'q = -k ∇T', sub: '1D PDE TRANSIENT' },
      { tag: 'SYSTEM MODULE', val: 'AP-TH02', sub: 'CALORIMETRY ENGINE' },
    ];

    cards.forEach((c, idx) => {
      const cx = 60 + idx * (cardW + 20);
      ctx.fillStyle = 'rgba(14, 19, 28, 0.65)';
      ctx.beginPath();
      this.drawRoundRect(ctx, cx, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.fillStyle = '#6a7888';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(c.tag, cx + 22, cardY + 42);

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.fillText(c.val, cx + 22, cardY + 90);

      ctx.fillStyle = '#8a99a8';
      ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(c.sub, cx + 22, cardY + 125);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Apple 专业工业设计：一体化黑曜石立体几何展板纹理（1536 x 1024）
   */
  static createWallStereometryBoard(): THREE.CanvasTexture {
    const width = 1536;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(10, 14, 20, 0.98)');
    grad.addColorStop(1, 'rgba(4, 6, 10, 0.99)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawRoundRect(ctx, 16, 16, width - 32, height - 32, 20);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Header
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '400 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 60, 68);

    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('SPATIAL STEREOMETRY & VECTOR TOPOLOGY', 105, 62);

    ctx.fillStyle = '#8a99a8';
    ctx.font = '400 15px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('EULER INVARIANT V - E + F = 2 • 3D SKEW VECTORS', 105, 88);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(60, 118);
    ctx.lineTo(width - 60, 118);
    ctx.stroke();

    // 左侧面板：带有对角异面直线的等轴测正方体
    const leftW = 680;
    const leftH = 500;
    const leftX = 60;
    const leftY = 145;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, leftX, leftY, leftW, leftH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('SPATIAL SKEW LINES A₁B vs B₁C (θ = 60.00°)', leftX + 30, leftY + 38);

    const cubeCx = leftX + leftW / 2;
    const cubeCy = leftY + leftH / 2 + 20;
    const s = 110;

    const vA = { x: cubeCx - s, y: cubeCy + s * 0.4 };
    const vB = { x: cubeCx + s * 0.1, y: cubeCy + s * 0.8 };
    const vC = { x: cubeCx + s, y: cubeCy + s * 0.3 };
    const vD = { x: cubeCx - s * 0.1, y: cubeCy - s * 0.1 };

    const vA1 = { x: vA.x, y: vA.y - s * 1.5 };
    const vB1 = { x: vB.x, y: vB.y - s * 1.5 };
    const vC1 = { x: vC.x, y: vC.y - s * 1.5 };
    const vD1 = { x: vD.x, y: vD.y - s * 1.5 };

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.2;
    const edges = [
      [vA, vB], [vB, vC], [vC, vD], [vD, vA],
      [vA1, vB1], [vB1, vC1], [vC1, vD1], [vD1, vA1],
      [vA, vA1], [vB, vB1], [vC, vC1], [vD, vD1],
    ];
    edges.forEach(([p1, p2]) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // 异面直线（银白与白金线条）
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(vA1.x, vA1.y);
    ctx.lineTo(vB.x, vB.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(vB1.x, vB1.y);
    ctx.lineTo(vC.x, vC.y);
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillText('A₁', vA1.x - 22, vA1.y - 8);
    ctx.fillText('B₁', vB1.x - 8, vB1.y - 12);
    ctx.fillText('C₁', vC1.x + 12, vC1.y - 8);
    ctx.fillText('B', vB.x - 8, vB.y + 22);
    ctx.fillText('C', vC.x + 12, vC.y + 8);

    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('cos θ = |A₁B · B₁C| / (|A₁B||B₁C|) = 1/2', leftX + 30, leftY + leftH - 28);

    // 右侧面板：柏拉图多面体结构
    const rightX = leftX + leftW + 24;
    const rightW = width - rightX - 60;
    const rightH = 500;
    ctx.fillStyle = 'rgba(14, 19, 28, 0.55)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, leftY, rightW, rightH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('PLATONIC SOLIDS & EULER INVARIANT', rightX + 30, leftY + 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
    ctx.fillText('V - E + F = 2', rightX + 30, leftY + 105);

    ctx.fillStyle = '#8a99a8';
    ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('TOPOLOGICAL INVARIANT FOR CONVEX POLYHEDRA IN ℝ³', rightX + 30, leftY + 135);

    const polyhedra = [
      ['正四面体 (Tetrahedron)', 'V: 4', 'E: 6', 'F: 4', '4 - 6 + 4 = 2'],
      ['正方体 (Hexahedron)', 'V: 8', 'E: 12', 'F: 6', '8 - 12 + 6 = 2'],
      ['正八面体 (Octahedron)', 'V: 6', 'E: 12', 'F: 8', '6 - 12 + 8 = 2'],
      ['正十二面体 (Dodecahedron)', 'V: 20', 'E: 30', 'F: 12', '20 - 30 + 12 = 2'],
      ['正二十面体 (Icosahedron)', 'V: 12', 'E: 30', 'F: 20', '12 - 30 + 20 = 2'],
    ];

    polyhedra.forEach((poly, idx) => {
      const rowY = leftY + 180 + idx * 36;
      ctx.fillStyle = '#f4f6fa';
      ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fillText(poly[0], rightX + 30, rowY);

      ctx.fillStyle = '#8a99a8';
      ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(`${poly[1]}  ${poly[2]}  ${poly[3]}`, rightX + 290, rowY);
    });

    // 底部 4 组参数指标卡
    const cardY = 670;
    const cardH = 300;
    const cardW = (width - 120 - 3 * 20) / 4;

    const cards = [
      { tag: 'SKEW LINE ANGLE', val: 'θ = 60.00°', sub: 'EXACT ANALYTIC VALUE' },
      { tag: 'CROSS SECTION', val: 'HEXAGON', sub: '6-MIDPOINT EQUAL SLICE' },
      { tag: 'CIRCUMSCRIBED R', val: 'R = (√3/2) a', sub: 'EMBEDDING SPHERE 2R' },
      { tag: 'MODULE SPEC', val: 'AP-MA01', sub: 'STEREOMETRY STUDIO' },
    ];

    cards.forEach((c, idx) => {
      const cx = 60 + idx * (cardW + 20);
      ctx.fillStyle = 'rgba(14, 19, 28, 0.65)';
      ctx.beginPath();
      this.drawRoundRect(ctx, cx, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.fillStyle = '#6a7888';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(c.tag, cx + 22, cardY + 42);

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.fillText(c.val, cx + 22, cardY + 90);

      ctx.fillStyle = '#8a99a8';
      ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(c.sub, cx + 22, cardY + 125);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Apple 专业工业设计：一体化黑曜石实验室标牌铭牌（1024 x 512）
   */
  static createWallSignageTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(12, 16, 22, 0.98)');
    grad.addColorStop(1, 'rgba(5, 7, 11, 0.99)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawRoundRect(ctx, 16, 16, width - 32, height - 32, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Apple 品牌标识
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '300 48px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 56, 90);

    // 实验室房间主编号
    ctx.font = '300 72px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('LABORATORY 03', 125, 90);

    // Subtitle
    ctx.fillStyle = '#8a99a8';
    ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('SPATIAL COMPUTING & OPTICAL METROLOGY', 56, 175);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(56, 215);
    ctx.lineTo(width - 56, 215);
    ctx.stroke();

    // 元数据信息网格
    const meta = [
      ['CAMPUS', 'CUPERTINO HEADQUARTERS • AP-E03'],
      ['FACILITY', 'CLASS 10 OPTICAL CLEANROOM METROLOGY'],
      ['EXPERIMENTS', 'OPTICS • THERMODYNAMICS • STEREOMETRY'],
      ['STATUS', 'RESTRICTED RESEARCH ACCESS ONLY'],
    ];

    meta.forEach((m, idx) => {
      const my = 265 + idx * 36;
      ctx.fillStyle = '#6a7888';
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(m[0], 56, my);

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillText(m[1], 200, my);
    });

    // 单色精密微距刻度标尺
    const rulerY = 440;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(56, rulerY);
    ctx.lineTo(width - 56, rulerY);
    ctx.stroke();

    for (let x = 56; x <= width - 56; x += 16) {
      const isMajor = (x - 56) % 64 === 0;
      const tickH = isMajor ? 12 : 6;
      ctx.beginPath();
      ctx.moveTo(x, rulerY);
      ctx.lineTo(x, rulerY - tickH);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * 高分辨率未来主义全息实验台交互界面纹理（2048 x 1400）
   * 汲取高科技科幻工作站设计风格
   */
  static createTabletopHoloTexture(): THREE.CanvasTexture {
    const width = 2048;
    const height = 1400;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // 1. 半透明深蓝宝石底色背景
    const baseGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.65);
    baseGrad.addColorStop(0, 'rgba(12, 32, 54, 0.72)');
    baseGrad.addColorStop(0.6, 'rgba(8, 22, 38, 0.85)');
    baseGrad.addColorStop(1, 'rgba(4, 14, 24, 0.95)');
    ctx.fillStyle = baseGrad;
    this.drawRoundRect(ctx, 30, 30, width - 60, height - 60, 48);
    ctx.fill();

    // 2. 外部青色发光边界与精密拐角支架
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 拐角支架定位线
    const bracketLen = 80;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(30, 30 + bracketLen);
    ctx.lineTo(30, 30);
    ctx.lineTo(30 + bracketLen, 30);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(width - 30 - bracketLen, 30);
    ctx.lineTo(width - 30, 30);
    ctx.lineTo(width - 30, 30 + bracketLen);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(30, height - 30 - bracketLen);
    ctx.lineTo(30, height - 30);
    ctx.lineTo(30 + bracketLen, height - 30);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(width - 30 - bracketLen, height - 30);
    ctx.lineTo(width - 30, height - 30);
    ctx.lineTo(width - 30, height - 30 - bracketLen);
    ctx.stroke();

    // 3. 精细等轴测/工程技术坐标网格
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.08)';
    ctx.lineWidth = 1.0;
    const gridStep = 48;
    for (let x = 60; x < width - 60; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, height - 60);
      ctx.stroke();
    }
    for (let y = 60; y < height - 60; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();
    }

    // 4. 中央分子结构/空间对准 HUD 准星
    const cx = width / 2;
    const cy = height / 2;

    // 带有刻度标记的外同心圆环
    ctx.strokeStyle = 'rgba(100, 225, 255, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 320, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 225, 255, 0.28)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, 360, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 角度刻度标线
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const isMajor = deg % 45 === 0;
      const r1 = 320;
      const r2 = isMajor ? 342 : 330;
      ctx.strokeStyle = isMajor ? '#40c4ff' : 'rgba(100, 225, 255, 0.4)';
      ctx.lineWidth = isMajor ? 2.0 : 1.0;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
      ctx.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
      ctx.stroke();
    }

    // 内部准星环
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.8)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, 210, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.stroke();

    // 中央 3D 六边形/分子线框结构
    const hexRadius = 88;
    ctx.strokeStyle = '#80d8ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const hx = cx + Math.cos(a) * hexRadius;
      const hy = cy + Math.sin(a) * hexRadius;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();

    // Nodes at vertices
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const hx = cx + Math.cos(a) * hexRadius;
      const hy = cy + Math.sin(a) * hexRadius;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();

      // 内部连接支撑线
      ctx.strokeStyle = 'rgba(128, 216, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // 5. 左侧仪器仪表与遥测波形面板
    const leftX = 120;
    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPECTRUM & HARMONIC OSCILLATION', leftX, 160);

    ctx.fillStyle = '#78909c';
    ctx.font = '400 14px "SF Pro Text", monospace';
    ctx.fillText('FOURIER DECOMPOSITION // SAMPLING RATE: 192 kHz // REALTIME', leftX, 190);

    // 遥测波形边框盒
    const waveBoxW = 480;
    const waveBoxH = 220;
    const waveBoxY = 220;
    ctx.fillStyle = 'rgba(8, 24, 40, 0.6)';
    ctx.beginPath();
    this.drawRoundRect(ctx, leftX, waveBoxY, waveBoxW, waveBoxH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 发光正弦波形
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let wx = 0; wx < waveBoxW - 40; wx += 4) {
      const t = wx / (waveBoxW - 40);
      const wy = waveBoxY + waveBoxH / 2 + Math.sin(t * Math.PI * 6) * 45 * Math.sin(t * Math.PI) + Math.cos(t * Math.PI * 14) * 15;
      if (wx === 0) ctx.moveTo(leftX + 20 + wx, wy);
      else ctx.lineTo(leftX + 20 + wx, wy);
    }
    ctx.stroke();

    // 波形下方的谐波频率柱状图
    const barStartY = 480;
    const numBars = 28;
    const barWidth = 12;
    const barGap = 5;
    for (let b = 0; b < numBars; b++) {
      const bh = 20 + Math.sin(b * 0.45) * 40 + Math.cos(b * 0.8) * 35 + ((b * 7) % 30);
      const bx = leftX + b * (barWidth + barGap);
      const by = barStartY + 110 - bh;
      const barGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
      barGrad.addColorStop(0, '#00e5ff');
      barGrad.addColorStop(1, 'rgba(0, 150, 255, 0.25)');
      ctx.fillStyle = barGrad;
      ctx.fillRect(bx, by, barWidth, bh);
    }

    // 空间坐标读数盒
    const coordY = 640;
    ctx.fillStyle = 'rgba(8, 24, 40, 0.6)';
    ctx.beginPath();
    this.drawRoundRect(ctx, leftX, coordY, 480, 160, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.stroke();

    ctx.fillStyle = '#b0bec5';
    ctx.font = '500 15px monospace';
    ctx.fillText('SPATIAL ORIGIN [STAGE ELEVATION: 0.990 m]', leftX + 24, coordY + 36);
    ctx.fillStyle = '#80d8ff';
    ctx.font = '700 18px monospace';
    ctx.fillText('ΔX: +0.0000 m  •  ΔY: +0.0000 m  •  ΔZ: +0.0000 m', leftX + 24, coordY + 72);
    ctx.fillStyle = '#4dd0e1';
    ctx.font = '400 14px monospace';
    ctx.fillText('STATUS: STATIONARY // KINEMATICS DAMPED // READY', leftX + 24, coordY + 108);

    // 6. 右侧仪器面板：化学与量子测量
    const rightX = width - 600;
    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace';
    ctx.fillText('QUANTUM METROLOGY & REAGENT MATRIX', rightX, 160);

    ctx.fillStyle = '#78909c';
    ctx.font = '400 14px "SF Pro Text", monospace';
    ctx.fillText('MOLECULAR ORBITAL SIMULATION // EQUILIBRIUM', rightX, 190);

    // 右侧化学状态信息盒
    const rightBoxW = 480;
    const rightBoxH = 220;
    const rightBoxY = 220;
    ctx.fillStyle = 'rgba(8, 24, 40, 0.6)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, rightBoxY, rightBoxW, rightBoxH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 右侧进度仪表条
    const gauges = [
      { label: 'LASER COHERENCE (Nd:YAG 532nm)', val: 0.98, color: '#00e5ff' },
      { label: 'CHAMBER PRESSURE (101.325 kPa)', val: 0.88, color: '#40c4ff' },
      { label: 'THERMAL FLUX EQUILIBRIUM', val: 0.76, color: '#80d8ff' },
      { label: 'ELECTROLYTIC CONDUCTIVITY', val: 0.94, color: '#00e5ff' },
    ];
    gauges.forEach((g, i) => {
      const gy = rightBoxY + 35 + i * 44;
      ctx.fillStyle = '#b0bec5';
      ctx.font = '500 13px monospace';
      ctx.fillText(g.label, rightX + 24, gy);

      // Track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(rightX + 24, gy + 8, rightBoxW - 48, 8);
      // Progress
      ctx.fillStyle = g.color;
      ctx.fillRect(rightX + 24, gy + 8, (rightBoxW - 48) * g.val, 8);
    });

    // 分子化合物矩阵盒
    const molBoxY = 480;
    ctx.fillStyle = 'rgba(8, 24, 40, 0.6)';
    ctx.beginPath();
    this.drawRoundRect(ctx, rightX, molBoxY, rightBoxW, 320, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 16px monospace';
    ctx.fillText('STRUCTURAL ISOMERS & LATTICE PARAMETERS', rightX + 24, molBoxY + 38);

    const params = [
      ['UNIT CELL VOLUME', '164.28 Å³'],
      ['BRAVAIS LATTICE', 'FACE-CENTERED CUBIC (FCC)'],
      ['SPACE GROUP', 'Fm-3m (#225)'],
      ['BOND ANGLE θ', '109.47° (TETRAHEDRAL)'],
      ['GIBBS FREE ENERGY ΔG', '-32.4 kJ/mol (EXERGONIC)'],
      ['REACTION QUOTIENT Q', '1.000 (STEADY-STATE)'],
    ];
    params.forEach((p, idx) => {
      const py = molBoxY + 76 + idx * 36;
      ctx.fillStyle = '#78909c';
      ctx.font = '500 13px monospace';
      ctx.fillText(p[0], rightX + 24, py);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(p[1], rightX + rightBoxW - 24, py);
      ctx.textAlign = 'left';
    });

    // 7. 顶部与底部系统信息栏
    // 顶部状态栏
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(60, 110);
    ctx.lineTo(width - 60, 110);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('  HOLOGRIP SPATIAL LABORATORY', 80, 85);

    ctx.fillStyle = '#40c4ff';
    ctx.font = '500 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('WORKSTATION 01 // AUTONOMOUS METROLOGY SYSTEM // ONLINE', width - 80, 85);
    ctx.textAlign = 'left';

    // 底部控制栏
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.4)';
    ctx.beginPath();
    ctx.moveTo(60, height - 100);
    ctx.lineTo(width - 60, height - 100);
    ctx.stroke();

    ctx.fillStyle = '#78909c';
    ctx.font = '500 14px monospace';
    ctx.fillText('SPATIAL CALIBRATION: ACTIVE  •  OPTICAL ALIGNMENT: 0.002 mrad  •  SAFETY INTERLOCK: ENGAGED', 80, height - 65);

    ctx.fillStyle = '#00e5ff';
    ctx.textAlign = 'right';
    ctx.fillText('SYSTEM CLOCK: 2026.09.24 // PROTOCOL v3.8.0', width - 80, height - 65);
    ctx.textAlign = 'left';

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * 墙面壁龛悬浮半透明全息 HUD 界面纹理（1024 x 600）
   * 匹配实验室壁龛悬浮全息监视视窗
   */
  static createNicheHudTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 600;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // 磨砂玻璃毛玻璃背景
    ctx.fillStyle = 'rgba(6, 20, 36, 0.45)';
    this.drawRoundRect(ctx, 12, 12, width - 24, height - 24, 28);
    ctx.fill();

    // 精细青色边框线条
    ctx.strokeStyle = 'rgba(100, 217, 255, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 顶部标题栏
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('LABORATORY ENVIRONMENTAL TELEMETRY', 48, 56);

    ctx.fillStyle = '#40c4ff';
    ctx.font = '500 13px monospace';
    ctx.fillText('SYS.01 // DIAGNOSTIC: NORMAL', 48, 80);

    // 左侧环形状态仪表
    const gaugeX1 = 140;
    const gaugeY = 220;
    ctx.strokeStyle = 'rgba(100, 225, 255, 0.3)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(gaugeX1, gaugeY, 70, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(gaugeX1, gaugeY, 70, -Math.PI / 2, Math.PI * 0.85);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('94%', gaugeX1, gaugeY + 10);
    ctx.fillStyle = '#78909c';
    ctx.font = '500 12px monospace';
    ctx.fillText('EFFICIENCY', gaugeX1, gaugeY + 36);

    const gaugeX2 = 330;
    ctx.strokeStyle = 'rgba(100, 225, 255, 0.3)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(gaugeX2, gaugeY, 70, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#40c4ff';
    ctx.beginPath();
    ctx.arc(gaugeX2, gaugeY, 70, -Math.PI / 2, Math.PI * 0.62);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px monospace';
    ctx.fillText('21.5°C', gaugeX2, gaugeY + 10);
    ctx.fillStyle = '#78909c';
    ctx.font = '500 12px monospace';
    ctx.fillText('CHAMBER TEMP', gaugeX2, gaugeY + 36);
    ctx.textAlign = 'left';

    // 右侧核心数据指标
    const rx = 480;
    ctx.fillStyle = '#78909c';
    ctx.font = '500 13px monospace';
    ctx.fillText('AIR PURITY: CLASS 10 CLEANROOM (ISO 4)', rx, 150);
    ctx.fillText('PRESSURE: 101.325 kPa (1.000 atm)', rx, 185);
    ctx.fillText('RELATIVE HUMIDITY: 42.0% RH', rx, 220);
    ctx.fillText('O₂ CONCENTRATION: 20.95%', rx, 255);
    ctx.fillText('ACOUSTIC NOISE FLOOR: < 18 dBA', rx, 290);

    // 底部微型趋势图表
    const graphX = 48;
    const graphY = 380;
    const graphW = width - 96;
    const graphH = 150;
    ctx.fillStyle = 'rgba(4, 16, 28, 0.5)';
    this.drawRoundRect(ctx, graphX, graphY, graphW, graphH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 217, 255, 0.25)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 微型图表中的正弦波动曲线
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let x = 0; x < graphW - 20; x += 6) {
      const t = x / (graphW - 20);
      const gy = graphY + graphH / 2 + Math.sin(t * Math.PI * 8) * 35 * Math.sin(t * Math.PI) + Math.cos(t * Math.PI * 4) * 15;
      if (x === 0) ctx.moveTo(graphX + 10 + x, gy);
      else ctx.lineTo(graphX + 10 + x, gy);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * 全景净化实验室观察窗柔和背景纹理（1024 x 512）
   * 渲染于中央观察窗内，营造深远真实的纵深感
   */
  static createWindowObservationTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 射入洁净室空间的柔和自然渐变天光
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#cce0ec');
    grad.addColorStop(0.4, '#d8e8f2');
    grad.addColorStop(0.7, '#e4eff6');
    grad.addColorStop(1, '#bcd0dc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 细腻的水平建筑窗棂与透视网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.35);
    ctx.lineTo(width, height * 0.35);
    ctx.moveTo(0, height * 0.65);
    ctx.lineTo(width, height * 0.65);
    ctx.stroke();

    // 远景柔和建筑灯槽光晕
    const lightGrad = ctx.createRadialGradient(width / 2, height * 0.35, 20, width / 2, height * 0.35, width * 0.5);
    lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(0, 0, width, height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }
}

