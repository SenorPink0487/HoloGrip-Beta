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
  static createFloorTexture(): THREE.CanvasTexture {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Generate multi-octave FBM noise on a 512x512 offscreen canvas for high-perf silky clouds
    const noiseRes = 512;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = noiseRes;
    offCanvas.height = noiseRes;
    const offCtx = offCanvas.getContext('2d')!;
    const offImg = offCtx.createImageData(noiseRes, noiseRes);
    const offData = offImg.data;

    const g1 = this.generateNoiseGrid(16, 16, 1.41);
    const g2 = this.generateNoiseGrid(32, 32, 2.71);
    const g3 = this.generateNoiseGrid(64, 64, 3.14);
    const g4 = this.generateNoiseGrid(128, 128, 5.89);

    for (let py = 0; py < noiseRes; py++) {
      const v = py / noiseRes;
      for (let px = 0; px < noiseRes; px++) {
        const u = px / noiseRes;
        const n1 = this.sampleNoise(g1, 16, 16, u * 2, v * 2);
        const n2 = this.sampleNoise(g2, 32, 32, u * 4, v * 4);
        const n3 = this.sampleNoise(g3, 64, 64, u * 8, v * 8);
        const n4 = this.sampleNoise(g4, 128, 128, u * 16, v * 16);

        const fbm = 0.50 * n1 + 0.28 * n2 + 0.15 * n3 + 0.07 * n4;
        const idx = (py * noiseRes + px) * 4;

        // Map fbm (0.0 to 1.0) to polished microcement slate gray gradient
        // Matching sampled reference colors: #748290 (low) -> #929ea9 (mid) -> #b2bcc7 (high)
        let r: number, g: number, b: number;
        if (fbm < 0.5) {
          const t = (0.5 - fbm) / 0.5;
          r = 146 - t * 30;
          g = 158 - t * 28;
          b = 169 - t * 25;
        } else {
          const t = (fbm - 0.5) / 0.5;
          r = 146 + t * 32;
          g = 158 + t * 30;
          b = 169 + t * 30;
        }

        offData[idx] = Math.round(r);
        offData[idx + 1] = Math.round(g);
        offData[idx + 2] = Math.round(b);
        offData[idx + 3] = 255;
      }
    }
    offCtx.putImageData(offImg, 0, 0);

    // Draw smoothed FBM microcement base onto 2048x2048 canvas
    ctx.drawImage(offCanvas, 0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // 2. Subtle radial trowel finish mark around room center
    const trowelGrad = ctx.createRadialGradient(cx, cy, 100, cx, cy, size * 0.55);
    trowelGrad.addColorStop(0, 'rgba(180, 192, 204, 0.08)');
    trowelGrad.addColorStop(0.35, 'rgba(120, 134, 146, 0.08)');
    trowelGrad.addColorStop(0.7, 'rgba(170, 180, 192, 0.06)');
    trowelGrad.addColorStop(1, 'rgba(115, 128, 140, 0.12)');
    ctx.fillStyle = trowelGrad;
    ctx.fillRect(0, 0, size, size);

    // 3. Ambient Occlusion (Contact Shadow) under central table pedestal (plinth radius ~182px)
    const plinthR = 182;
    const aoGrad = ctx.createRadialGradient(cx, cy, plinthR * 0.75, cx, cy, plinthR * 1.45);
    aoGrad.addColorStop(0, 'rgba(18, 22, 28, 0.94)');
    aoGrad.addColorStop(0.55, 'rgba(28, 34, 42, 0.75)');
    aoGrad.addColorStop(0.85, 'rgba(48, 56, 66, 0.32)');
    aoGrad.addColorStop(1.0, 'rgba(60, 70, 80, 0.0)');
    ctx.fillStyle = aoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, plinthR * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // 4. Brushed metal pedestal contact reflection (central dark-cool reflection matching sampled reference #61747B)
    const refH = 175;
    const refGrad = ctx.createLinearGradient(cx, cy + plinthR, cx, cy + plinthR + refH);
    refGrad.addColorStop(0, 'rgba(38, 48, 56, 0.72)');
    refGrad.addColorStop(0.35, 'rgba(58, 72, 82, 0.52)');
    refGrad.addColorStop(0.7, 'rgba(88, 102, 114, 0.25)');
    refGrad.addColorStop(1.0, 'rgba(120, 134, 146, 0.0)');

    ctx.save();
    ctx.fillStyle = refGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + plinthR + refH * 0.48, plinthR * 0.95, refH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. Ceiling cove light soft specular sheen (circular luminous glow bands in foreground)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const coveGrad1 = ctx.createRadialGradient(cx, cy, 320, cx, cy, 470);
    coveGrad1.addColorStop(0, 'rgba(255, 255, 255, 0)');
    coveGrad1.addColorStop(0.5, 'rgba(220, 240, 255, 0.24)');
    coveGrad1.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = coveGrad1;
    ctx.beginPath();
    ctx.arc(cx, cy, 470, 0, Math.PI * 2);
    ctx.fill();

    const coveGrad2 = ctx.createRadialGradient(cx, cy, 520, cx, cy, 680);
    coveGrad2.addColorStop(0, 'rgba(255, 255, 255, 0)');
    coveGrad2.addColorStop(0.5, 'rgba(215, 235, 255, 0.16)');
    coveGrad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = coveGrad2;
    ctx.beginPath();
    ctx.arc(cx, cy, 680, 0, Math.PI * 2);
    ctx.fill();

    // Foreground soft specular pool reflecting central downlights
    const specGrad = ctx.createRadialGradient(cx, cy + 280, 40, cx, cy + 280, 230);
    specGrad.addColorStop(0, 'rgba(225, 240, 255, 0.22)');
    specGrad.addColorStop(0.5, 'rgba(205, 228, 250, 0.12)');
    specGrad.addColorStop(1, 'rgba(205, 228, 250, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 280, 250, 130, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. Inlaid floor guide lines matching reference image exactly
    // Scaled precisely to 3D world space (R1 = 360px ~ 2.88m)
    const R1 = 360;
    const aStart = 0.20 * Math.PI;
    const aEnd = 0.80 * Math.PI;

    const buildFloorPath = () => {
      ctx.beginPath();

      // (A) Center straight axis line running from table base towards viewer
      ctx.moveTo(cx, cy + 175);
      ctx.lineTo(cx, size);

      // (B) Center line behind table
      ctx.moveTo(cx, cy - 175);
      ctx.lineTo(cx, cy - R1);

      // (C) Transverse radial axis lines
      ctx.moveTo(cx - R1, cy);
      ctx.lineTo(cx - 780, cy);
      ctx.moveTo(cx + R1, cy);
      ctx.lineTo(cx + 780, cy);

      // (D) Main concentric circular arc around back and sides of table
      // In canvas: 0 is right, 0.5*PI is bottom (viewer), PI is left, 1.5*PI is top (window)
      // Arc goes from aStart (front-right) counter-clockwise through top to aEnd (front-left)
      ctx.moveTo(cx + R1 * Math.cos(aStart), cy + R1 * Math.sin(aStart));
      ctx.arc(cx, cy, R1, aStart, aEnd, true);

      // (E) Front-Left runner S-curve:
      // Starts from arc endpoint (cx - 291, cy + 211), sweeps in an organic S-curve to nose at (cx - 180, cy + 265),
      // then sweeps outward down-left towards bottom-left corner
      const leftStartX = cx + R1 * Math.cos(aEnd);
      const leftStartY = cy + R1 * Math.sin(aEnd);
      ctx.moveTo(leftStartX, leftStartY);
      ctx.bezierCurveTo(
        cx - 295, cy + 235,
        cx - 240, cy + 255,
        cx - 180, cy + 265
      );
      ctx.bezierCurveTo(
        cx - 180, cy + 275,
        cx - 240, cy + 285,
        cx - 320, cy + 295
      );
      ctx.bezierCurveTo(
        cx - 420, cy + 315,
        cx - 560, cy + 355,
        cx - 780, cy + 430
      );

      // (F) Front-Right runner S-curve (symmetrically mirrored across cx):
      const rightStartX = cx + R1 * Math.cos(aStart);
      const rightStartY = cy + R1 * Math.sin(aStart);
      ctx.moveTo(rightStartX, rightStartY);
      ctx.bezierCurveTo(
        cx + 295, cy + 235,
        cx + 240, cy + 255,
        cx + 180, cy + 265
      );
      ctx.bezierCurveTo(
        cx + 180, cy + 275,
        cx + 240, cy + 285,
        cx + 320, cy + 295
      );
      ctx.bezierCurveTo(
        cx + 420, cy + 315,
        cx + 560, cy + 355,
        cx + 780, cy + 430
      );
    };

    const drawAllLines = (pass: 'outer' | 'mid' | 'core') => {
      ctx.save();
      buildFloorPath();
      if (pass === 'outer') {
        ctx.strokeStyle = 'rgba(215, 238, 255, 0.25)';
        ctx.lineWidth = 10;
        ctx.shadowColor = 'rgba(215, 240, 255, 0.5)';
        ctx.shadowBlur = 4;
      } else if (pass === 'mid') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 4.8;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 1.5;
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 0;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    drawAllLines('outer');
    drawAllLines('mid');
    drawAllLines('core');

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Generates roughness map for floor with organic microcement satin finish
   */
  static createFloorRoughnessMap(): THREE.CanvasTexture {
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
    const img = octx.createImageData(256, 256);
    const d = img.data;

    const g1 = this.generateNoiseGrid(16, 16, 8.11);
    const g2 = this.generateNoiseGrid(32, 32, 4.33);

    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const n = 0.65 * this.sampleNoise(g1, 16, 16, u * 2, v * 2) + 0.35 * this.sampleNoise(g2, 32, 32, u * 4, v * 4);
        // Roughness between 0.17 (43) and 0.27 (69)
        const val = Math.round(43 + n * 26);
        const idx = (y * 256 + x) * 4;
        d[idx] = val;
        d[idx + 1] = val;
        d[idx + 2] = val;
        d[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    ctx.drawImage(off, 0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Generates micro-relief bump map for liquid epoxy surface tension
   */
  static createFloorBumpMap(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

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

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
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
}
