import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export class DetectorScreenMesh {
  public readonly group = new THREE.Group();

  public readonly screenWidth = 0.16;
  public readonly screenHeight = 0.12;

  private screenCanvas: HTMLCanvasElement;
  private screenCtx: CanvasRenderingContext2D;
  private screenTexture: THREE.CanvasTexture;
  private screenMesh: THREE.Mesh;

  private digitalDisplayCanvas: HTMLCanvasElement;
  private digitalDisplayCtx: CanvasRenderingContext2D;
  private digitalDisplayTex: THREE.CanvasTexture;
  private digitalDisplayMesh: THREE.Mesh;

  private lastRenderKey = '';
  private lastMeterKey = '';

  constructor() {
    this.group.name = 'DetectorScreenMesh';
    this.createMount();
    this.createScreen();
    this.createDigitalMeter();
    this.renderFringesPattern({ mode: 'spot', wavelengthNm: 632.8, intensity: 1.0 });
    this.updateMeter({ intensityRatio: 1.0, wavelengthNm: 632.8, fringeSpacingMm: 3.04 });
  }

  private createMount(): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.65,
      roughness: 0.20,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x485262,
      metalness: 0.22,
      roughness: 0.35,
    });

    // 1. Post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 24), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    this.group.add(post);

    // 2. Heavy perimeter bezel frame support behind screen
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(this.screenWidth + 0.016, this.screenHeight + 0.016, 0.006),
      frameMat
    );
    frame.position.set(0, 0.186, 0.004);
    frame.castShadow = true;
    this.group.add(frame);
  }

  private createScreen(): void {
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 768;
    this.screenCtx = this.screenCanvas.getContext('2d')!;

    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;

    // Matte white frosted projection material (DoubleSide so fringes are luminous and visible from any angle)
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      side: THREE.DoubleSide,
    });

    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.screenWidth, this.screenHeight),
      screenMat
    );
    // Face incoming laser beam directly at z = -0.001
    this.screenMesh.position.set(0, 0.186, -0.001);
    this.group.add(this.screenMesh);
  }

  private createDigitalMeter(): void {
    this.digitalDisplayCanvas = document.createElement('canvas');
    this.digitalDisplayCanvas.width = 512;
    this.digitalDisplayCanvas.height = 256;
    this.digitalDisplayCtx = this.digitalDisplayCanvas.getContext('2d')!;

    this.digitalDisplayTex = new THREE.CanvasTexture(this.digitalDisplayCanvas);
    this.digitalDisplayTex.colorSpace = THREE.SRGBColorSpace;

    const meterHousingMat = new THREE.MeshStandardMaterial({
      color: 0x424c5c,
      metalness: 0.22,
      roughness: 0.35,
    });

    const meterGroup = new THREE.Group();
    meterGroup.position.set(this.screenWidth * 0.5 + 0.044, 0.186, 0);

    // Meter Housing Box
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.082, 0.026), meterHousingMat);
    housing.castShadow = true;
    meterGroup.add(housing);

    // OLED display screen
    const dispMat = new THREE.MeshBasicMaterial({ map: this.digitalDisplayTex });
    this.digitalDisplayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.038), dispMat);
    this.digitalDisplayMesh.position.set(0, 0.012, 0.0132);
    meterGroup.add(this.digitalDisplayMesh);

    // Cable to photodiode sensor head
    const cableCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, -0.036, 0),
      new THREE.Vector3(0, -0.06, 0.02),
      new THREE.Vector3(-0.03, -0.08, 0.03),
      new THREE.Vector3(-0.06, -0.09, 0.01)
    );
    const cableGeo = new THREE.TubeGeometry(cableCurve, 16, 0.002, 8, false);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.8 });
    const cable = new THREE.Mesh(cableGeo, cableMat);
    meterGroup.add(cable);

    this.group.add(meterGroup);
  }

  /**
   * Draw millimeter reticle grid with axes on screen canvas
   */
  private drawReticleGrid(): void {
    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Refined technical lab sensor plate background
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, w, h);

    // Screen outer bezel accent border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // 10mm grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.2;

    const gridStep = 40; // 40px = 1cm
    for (let x = cx % gridStep; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % gridStep; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // High-contrast Center Crosshair
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    // Scale label in corner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillText('DETECTOR RETICLE · 1 div = 5.0 mm', 24, h - 24);
  }

  /**
   * Render real-time optical pattern on screen (with memoization cache to prevent unnecessary CPU redraws)
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
    const key = `${params.mode}_${params.wavelengthNm}_${params.intensity.toFixed(3)}_${params.slitWidthMm || 0}_${params.slitDistanceMm || 0}_${params.gratingLinesPerMm || 0}_${params.screenDistanceM || 0}_${params.polarizerAngle || 0}_${params.analyzerAngle || 0}`;
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    this.drawReticleGrid();

    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const color = OpticalPhysics.wavelengthToColor(params.wavelengthNm);
    const rgbStr = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}`;

    if (params.mode === 'spot' || params.mode === 'polarization') {
      // Gaussian laser spot with Malus intensity attenuation
      const r = 28;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      grad.addColorStop(0, `${rgbStr}, ${params.intensity * 0.95})`);
      grad.addColorStop(0.3, `${rgbStr}, ${params.intensity * 0.75})`);
      grad.addColorStop(0.7, `${rgbStr}, ${params.intensity * 0.25})`);
      grad.addColorStop(1, `${rgbStr}, 0.0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (params.mode === 'double_slit') {
      // Analytical Young's double-slit interference pattern
      const d = (params.slitDistanceMm || 0.25) * 1e-3;
      const a = (params.slitWidthMm || 0.04) * 1e-3;
      const L = params.screenDistanceM || 1.0;
      const lambda = params.wavelengthNm * 1e-9;
      const mmPerPx = 0.16 / w;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const rVal = Math.round(color.r * 255);
      const gVal = Math.round(color.g * 255);
      const bVal = Math.round(color.b * 255);

      for (let x = 0; x < w; x++) {
        const xDist = (x - cx) * mmPerPx;
        const sinTheta = xDist / Math.sqrt(xDist * xDist + L * L);

        const beta = (Math.PI * a * sinTheta) / lambda;
        const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
        const alpha = (Math.PI * d * sinTheta) / lambda;
        const I = Math.cos(alpha) * Math.cos(alpha) * sinc * sinc * params.intensity;

        if (I > 0.01) {
          // Vertical fringe column
          for (let y = Math.floor(cy - 160); y <= Math.floor(cy + 160); y++) {
            const yDist = (y - cy) / 160;
            const yFalloff = Math.max(0, 1 - yDist * yDist);
            const finalI = I * yFalloff;

            const idx = (y * w + x) * 4;
            data[idx] = Math.min(255, data[idx] + rVal * finalI);
            data[idx + 1] = Math.min(255, data[idx + 1] + gVal * finalI);
            data[idx + 2] = Math.min(255, data[idx + 2] + bVal * finalI);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (params.mode === 'single_slit') {
      // Fraunhofer single-slit sinc pattern
      const a = (params.slitWidthMm || 0.05) * 1e-3;
      const L = params.screenDistanceM || 1.0;
      const lambda = params.wavelengthNm * 1e-9;
      const mmPerPx = 0.16 / w;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const rVal = Math.round(color.r * 255);
      const gVal = Math.round(color.g * 255);
      const bVal = Math.round(color.b * 255);

      for (let x = 0; x < w; x++) {
        const xDist = (x - cx) * mmPerPx;
        const sinTheta = xDist / Math.sqrt(xDist * xDist + L * L);

        const beta = (Math.PI * a * sinTheta) / lambda;
        const sinc = Math.abs(beta) < 1e-7 ? 1.0 : Math.sin(beta) / beta;
        const I = sinc * sinc * params.intensity;

        if (I > 0.01) {
          for (let y = Math.floor(cy - 160); y <= Math.floor(cy + 160); y++) {
            const yDist = (y - cy) / 160;
            const yFalloff = Math.max(0, 1 - yDist * yDist);
            const finalI = I * yFalloff;

            const idx = (y * w + x) * 4;
            data[idx] = Math.min(255, data[idx] + rVal * finalI);
            data[idx + 1] = Math.min(255, data[idx + 1] + gVal * finalI);
            data[idx + 2] = Math.min(255, data[idx + 2] + bVal * finalI);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else if (params.mode === 'grating' || params.mode === 'spectrum') {
      // Diffraction grating spectral orders or rainbow dispersion band
      const wavelengths = [
        { wl: 680, name: 'Red' },
        { wl: 610, name: 'Orange' },
        { wl: 575, name: 'Yellow' },
        { wl: 530, name: 'Green' },
        { wl: 480, name: 'Cyan' },
        { wl: 440, name: 'Blue' },
        { wl: 405, name: 'Violet' },
      ];

      for (const spec of wavelengths) {
        const c = OpticalPhysics.wavelengthToColor(spec.wl);
        const specRgb = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;

        // Angular deviation for m = 1 order
        const gratingLines = params.gratingLinesPerMm || 300;
        const d = 1e-3 / gratingLines;
        const sinTheta = (spec.wl * 1e-9) / d;
        const offsetPx = (sinTheta * (params.screenDistanceM || 1.0) / (0.16 / w)) * 0.45;

        // Draw order +1 and -1 and center m=0
        const xPositions = [cx, cx + offsetPx, cx - offsetPx];
        for (const xp of xPositions) {
          const grad = ctx.createLinearGradient(xp - 12, 0, xp + 12, 0);
          grad.addColorStop(0, `${specRgb}, 0)`);
          grad.addColorStop(0.5, `${specRgb}, 0.85)`);
          grad.addColorStop(1, `${specRgb}, 0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(xp - 12, cy - 140, 24, 280);
        }
      }
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * Render fringe intensity pattern directly from Multi-Core Worker calculation buffer (zero CPU equation overhead)
   */
  public renderFringesFromBuffer(intensityBuffer: Float32Array, wavelengthNm: number, intensity = 1.0): void {
    const bLen = intensityBuffer.length;
    if (bLen === 0) return;

    // Quick sample hash to avoid redundant canvas draw if buffer hasn't changed
    const sampleHash = `buf_${wavelengthNm}_${intensity.toFixed(2)}_${intensityBuffer[0]?.toFixed(2)}_${intensityBuffer[Math.floor(bLen * 0.5)]?.toFixed(2)}_${intensityBuffer[bLen - 1]?.toFixed(2)}`;
    if (sampleHash === this.lastRenderKey) return;
    this.lastRenderKey = sampleHash;

    this.drawReticleGrid();

    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;
    const cy = h * 0.5;

    const color = OpticalPhysics.wavelengthToColor(wavelengthNm);
    const rVal = Math.round(color.r * 255);
    const gVal = Math.round(color.g * 255);
    const bVal = Math.round(color.b * 255);

    const colW = w / bLen;
    for (let i = 0; i < bLen; i++) {
      const I = intensityBuffer[i] * intensity;
      if (I < 0.008) continue;
      const x = i * colW;
      const alpha = Math.min(1.0, I * 0.95);
      ctx.fillStyle = `rgba(${rVal}, ${gVal}, ${bVal}, ${alpha})`;
      ctx.fillRect(x, cy - 150, colW + 0.6, 300);
    }

    this.screenTexture.needsUpdate = true;
  }

  /**
   * Update OLED Digital Radiometer Display (with memoization cache)
   */
  public updateMeter(params: {
    intensityRatio: number; // 0 to 1
    wavelengthNm: number;
    fringeSpacingMm?: number;
  }): void {
    const key = `${params.intensityRatio.toFixed(2)}_${params.wavelengthNm}_${(params.fringeSpacingMm || 0).toFixed(2)}`;
    if (key === this.lastMeterKey) return;
    this.lastMeterKey = key;

    const ctx = this.digitalDisplayCtx;
    const w = this.digitalDisplayCanvas.width;
    const h = this.digitalDisplayCanvas.height;

    // Dark OLED background
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, w, h);

    // Frame border
    ctx.strokeStyle = '#1d212a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // Header title
    ctx.fillStyle = '#388bfd';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillText('PHOTODETECTOR METER', 24, 38);

    // Large Relative Power Readout
    ctx.fillStyle = '#00f7ff';
    ctx.font = 'bold 54px -apple-system, BlinkMacSystemFont, monospace';
    const percent = (params.intensityRatio * 100).toFixed(1);
    ctx.fillText(`${percent}%`, 24, 102);

    ctx.fillStyle = '#8b949e';
    ctx.font = '22px monospace';
    ctx.fillText('I / I₀ (RELATIVE)', 220, 94);

    // Secondary metrics: Wavelength and Fringe Spacing
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    ctx.fillText(`λ: ${params.wavelengthNm.toFixed(1)} nm`, 24, 158);

    if (params.fringeSpacingMm) {
      ctx.fillText(`Δx: ${params.fringeSpacingMm.toFixed(2)} mm`, 24, 198);
    } else {
      ctx.fillText(`STATUS: NORMAL`, 24, 198);
    }

    // Live signal bar graph at bottom
    ctx.fillStyle = '#161b22';
    ctx.fillRect(24, 218, w - 48, 14);

    ctx.fillStyle = '#30d158';
    ctx.fillRect(24, 218, (w - 48) * Math.max(0, Math.min(1, params.intensityRatio)), 14);

    this.digitalDisplayTex.needsUpdate = true;
  }

  public dispose(): void {
    this.screenTexture.dispose();
    this.digitalDisplayTex.dispose();
  }
}
