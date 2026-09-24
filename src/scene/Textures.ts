import * as THREE from 'three';

/**
 * Procedural Texture Generator for High-Fidelity Sci-Fi Lab
 */
export class TextureGenerator {
  /**
   * Generates pseudo-random smooth 2D value noise lattice
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
   * Generates the polished epoxy microcement floor texture matching reference image
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
      ctx.fillStyle = 'rgba(238, 243, 246, 0.72)';
      ctx.fillRect(0, 0, size, size);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#edf2f5');
      grad.addColorStop(0.55, '#e5ebef');
      grad.addColorStop(1, '#dce5ea');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    const glow = ctx.createRadialGradient(size * 0.5, size * 0.42, 80, size * 0.5, size * 0.42, 520);
    glow.addColorStop(0, 'rgba(255,255,255,0.24)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.strokeStyle = 'rgba(136, 151, 160, 0.12)';
    ctx.lineWidth = 1.2;
    for (const radius of [170, 310, 465]) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Generates roughness map for floor with organic microcement satin finish
   */
  static createFloorRoughnessMap(prebaked?: Uint8ClampedArray): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base satin roughness: 0.22 (56 in 0-255 grayscale)
    ctx.fillStyle = '#383838';
    ctx.fillRect(0, 0, size, size);

    // Correlated micro-roughness variations
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
   * Generates micro-relief bump map for liquid epoxy surface tension
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
   * Bake all floor textures concurrently in Web Worker
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
   * Creates the Apple Vision Pro Minimalist Spatial Hologram Screen Texture
   */
  static createHoloScreenTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // Minimalist Apple Vision Pro clean frosted glass aperture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(16, 16, width - 32, height - 32, 28);
    ctx.fill();

    // Delicate specular rim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Top subtle highlight edge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 16);
    ctx.lineTo(width - 48, 16);
    ctx.stroke();

    // Clean Apple typography - Header
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('  Spatial Laboratory', width / 2, 210);

    // Clean Apple typography - Minimalist invitation
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
   * Apple Pro Industrial Design: Monolithic Dark Obsidian Optical Metrology Panel (2048 x 1280)
   */
  static createWallMainOpticsBoard(): THREE.CanvasTexture {
    const width = 2048;
    const height = 1280;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    // 1. Deep Obsidian Monolith Surface
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(10, 14, 20, 0.98)');
    grad.addColorStop(0.5, 'rgba(7, 10, 15, 0.98)');
    grad.addColorStop(1, 'rgba(4, 6, 10, 0.99)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawRoundRect(ctx, 16, 16, width - 32, height - 32, 20);
    ctx.fill();

    // 2. Micro Hairline Metallic Rim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Top subtle specular highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 16);
    ctx.lineTo(width - 48, 16);
    ctx.stroke();

    // 3. Header Bar
    // Apple Glyph
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '400 36px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 72, 85);

    // Title
    ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.fillText('OPTICAL METROLOGY MONOLITH', 120, 75);

    // Subtitle
    ctx.fillStyle = '#8a99a8';
    ctx.font = '400 16px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
    ctx.fillText('HOLOGRIP SPATIAL PHYSICS • PARAXIAL WAVEFRONT & COHERENCE METRICS', 120, 104);

    // Right Technical Pill
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

    // Razor-thin Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(72, 138);
    ctx.lineTo(width - 72, 138);
    ctx.stroke();

    // 4. Section 1 (Left): Paraxial Refraction & Ray Transfer Matrix
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

    // Optical Axis
    const axisY = box1Y + box1H * 0.44;
    ctx.strokeStyle = 'rgba(160, 180, 205, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(box1X + 40, axisY);
    ctx.lineTo(box1X + box1W - 40, axisY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bi-Convex Lens
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

    // Laser Rays (Monochrome Cold Silver-White)
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

    // Crosshair at Focal Point F1
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

    // Dimension Arrow f
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

    // Lower Diagram (Gaussian Beam Profile)
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

    // 5. Section 2 (Right): Coherent Interference & Airy Diffraction
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

    // Airy Disk Rings on Left of Box 2
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

    // Bessel Curve on Right of Box 2
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

    // Right Box 2: Telemetry Table
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

    // 6. Footer (4 Monolith Blocks)
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
   * Apple Pro Industrial Design: Monolithic Dark Obsidian Thermodynamics Panel (1536 x 1024)
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

    // Left Panel: Carnot P-V Diagram
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

    // Right Panel: Maxwell-Boltzmann Distribution
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

    // 4 Footer Cards
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
   * Apple Pro Industrial Design: Monolithic Dark Obsidian Stereometry Panel (1536 x 1024)
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

    // Left Panel: Isometric Cube with Diagonal Skew Lines
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

    // Skew Lines (Fine Silver and Platinum)
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

    // Right Panel: Platonic Solids
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

    // 4 Footer Cards
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
   * Apple Pro Industrial Design: Monolithic Dark Obsidian Signage Plaque (1024 x 512)
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

    // Apple Logo
    ctx.fillStyle = '#f4f6fa';
    ctx.font = '300 48px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 56, 90);

    // Main Room Number
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

    // Metadata Grid
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

    // Monochrome Precision Tick Ruler
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
}

