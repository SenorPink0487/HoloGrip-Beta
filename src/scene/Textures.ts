import * as THREE from 'three';

/**
 * Procedural Texture Generator for High-Fidelity Sci-Fi Lab
 */
export class TextureGenerator {
  /**
   * Generates the polished epoxy floor texture with inlaid sci-fi guide lines
   */
  static createFloorTexture(): THREE.CanvasTexture {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base floor tone: Clean polished futuristic slate gray
    ctx.fillStyle = '#b6bfc9';
    ctx.fillRect(0, 0, size, size);

    // Subtle micro-surface variations for realistic epoxy depth
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 4;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise + 2));
    }
    ctx.putImageData(imgData, 0, 0);

    const cx = size / 2;
    const cy = size / 2;

    // Draw inlaid floor guide lines matching reference image exactly
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowBlur = 6;

    // Center straight axis line running from table base towards viewer
    ctx.beginPath();
    ctx.moveTo(cx, cy + 180);
    ctx.lineTo(cx, size);
    ctx.stroke();

    // Concentric circular guide rings
    const ringRadius1 = 440; // Surrounding the table
    const ringRadius2 = 700;

    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius2, 0, Math.PI * 2);
    ctx.stroke();

    // Symmetrical curving guide tracks expanding outwards towards player
    const curveOffsets = [-1, 1];
    curveOffsets.forEach((dir) => {
      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.moveTo(cx + dir * 700, cy - 20);
      ctx.bezierCurveTo(
        cx + dir * 740, cy + 380,
        cx + dir * 880, cy + 700,
        cx + dir * 1000, size
      );
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = 3.5;
      ctx.moveTo(cx + dir * 440, cy + 220);
      ctx.quadraticCurveTo(cx + dir * 480, cy + 620, cx + dir * 560, size);
      ctx.stroke();
    });

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Generates roughness map for floor with realistic reflections
   */
  static createFloorRoughnessMap(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, size, size);

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

  /**
   * Generates high-density distant night city facade texture
   */
  static createBuildingFacadeTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#04070e';
    ctx.fillRect(0, 0, width, height);

    const cols = 32;
    const rows = 64;
    const colW = width / cols;
    const rowH = height / rows;

    const windowColors = [
      '#ffeaa7',
      '#fdcb6e',
      '#ffeaa7',
      '#81ecec',
      '#55efc4',
      '#dfe6e9',
      '#74b9ff',
    ];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isLit = Math.random() < 0.28;
        if (isLit) {
          ctx.fillStyle = windowColors[Math.floor(Math.random() * windowColors.length)];
          ctx.fillRect(c * colW + 2, r * rowH + 2, colW - 4, rowH - 4);
        } else {
          ctx.fillStyle = '#070d17';
          ctx.fillRect(c * colW + 2, r * rowH + 2, colW - 4, rowH - 4);
        }
      }
    }

    ctx.strokeStyle = '#0d1624';
    ctx.lineWidth = 1.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * rowH);
      ctx.lineTo(width, r * rowH);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * colW, 0);
      ctx.lineTo(c * colW, height);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}
