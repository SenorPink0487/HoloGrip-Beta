import * as THREE from 'three';

export type SlitType = 'double' | 'single' | 'grating';

export class SlitApertureMesh {
  public readonly group = new THREE.Group();

  public slitType: SlitType = 'double';
  public slitWidthMm = 0.04;
  public slitDistanceMm = 0.25;
  public gratingLinesPerMm = 300;

  private slideMesh: THREE.Mesh;
  private slideTexture: THREE.CanvasTexture | null = null;
  private micrometerDrum: THREE.Mesh;

  constructor(type: SlitType = 'double') {
    this.slitType = type;
    this.group.name = 'SlitApertureMesh';
    this.createMountAssembly();
    this.createSlide();
    this.updateSlideTexture();
  }

  private createMountAssembly(): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.65,
      roughness: 0.20,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x4a5464,
      metalness: 0.22,
      roughness: 0.35,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdfb43a,
      metalness: 0.65,
      roughness: 0.25,
    });

    // 1. Stainless steel post (Ø12mm)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 24), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    this.group.add(post);

    // 2. Optical mount collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 24), frameMat);
    collar.position.y = 0.14;
    this.group.add(collar);

    // 3. 50mm square blackened slide holder frame with center circular aperture (Ø25mm)
    const frameGeo = new THREE.BoxGeometry(0.068, 0.072, 0.012);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0.186;
    frame.castShadow = true;
    this.group.add(frame);

    // Circular inner window cutout
    const holeGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.014, 32);
    const hole = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x020409 }));
    hole.rotation.x = Math.PI * 0.5;
    hole.position.set(0, 0.186, 0);
    this.group.add(hole);

    // 4. Chrome retention spring clips (2 clips)
    const clipGeo = new THREE.BoxGeometry(0.006, 0.018, 0.003);
    const clip1 = new THREE.Mesh(clipGeo, postMat);
    clip1.position.set(-0.026, 0.186, 0.007);
    this.group.add(clip1);

    const clip2 = new THREE.Mesh(clipGeo, postMat);
    clip2.position.set(0.026, 0.186, 0.007);
    this.group.add(clip2);

    // 5. Precision micrometer thimble adjustment drum on top (微分微调鼓轮)
    const micrometerGroup = new THREE.Group();
    micrometerGroup.position.set(0, 0.228, 0);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.016, 20), postMat);
    micrometerGroup.add(sleeve);

    this.micrometerDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 24), brassMat);
    this.micrometerDrum.position.y = 0.016;
    micrometerGroup.add(this.micrometerDrum);

    this.group.add(micrometerGroup);
  }

  private updateSlideTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Blackened chrome-on-glass slide background
    ctx.fillStyle = '#0f1114';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Metal rim border
    ctx.strokeStyle = '#2b313a';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Header label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, monospace';
    ctx.textAlign = 'center';

    const cx = 256;
    const cy = 256;

    if (this.slitType === 'double') {
      ctx.fillText('YOUNG DOUBLE SLIT', cx, 64);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#8b949e';
      ctx.fillText(`d = ${this.slitDistanceMm.toFixed(2)} mm  |  a = ${this.slitWidthMm.toFixed(2)} mm`, cx, 96);

      // Microscopic double-slit visual representation in center
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#388bfd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Slits (two bright vertical lines)
      ctx.strokeStyle = '#00f7ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 80);
      ctx.lineTo(cx - 16, cy + 80);
      ctx.moveTo(cx + 16, cy - 80);
      ctx.lineTo(cx + 16, cy + 80);
      ctx.stroke();
    } else if (this.slitType === 'single') {
      ctx.fillText('SINGLE SLIT DIFFRACTION', cx, 64);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#8b949e';
      ctx.fillText(`a = ${this.slitWidthMm.toFixed(3)} mm`, cx, 96);

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#388bfd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Single vertical slit
      ctx.strokeStyle = '#00f7ff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 80);
      ctx.lineTo(cx, cy + 80);
      ctx.stroke();
    } else {
      ctx.fillText('DIFFRACTION GRATING', cx, 64);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#8b949e';
      ctx.fillText(`N = ${this.gratingLinesPerMm} lines/mm`, cx, 96);

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#388bfd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Multi-line grating lines
      ctx.strokeStyle = 'rgba(0, 247, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = -70; x <= 70; x += 7) {
        ctx.moveTo(cx + x, cy - 80);
        ctx.lineTo(cx + x, cy + 80);
      }
      ctx.stroke();
    }

    if (this.slideTexture) {
      this.slideTexture.dispose();
    }
    this.slideTexture = new THREE.CanvasTexture(canvas);
    this.slideTexture.colorSpace = THREE.SRGBColorSpace;

    if (this.slideMesh) {
      (this.slideMesh.material as THREE.MeshBasicMaterial).map = this.slideTexture;
      (this.slideMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
  }

  private createSlide(): void {
    const slideGeo = new THREE.PlaneGeometry(0.048, 0.048);
    const slideMat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.slideMesh = new THREE.Mesh(slideGeo, slideMat);
    this.slideMesh.position.set(0, 0.186, 0.0061);
    this.group.add(this.slideMesh);
  }

  public setParameters(params: {
    type?: SlitType;
    slitWidthMm?: number;
    slitDistanceMm?: number;
    gratingLinesPerMm?: number;
  }): void {
    if (params.type) this.slitType = params.type;
    if (params.slitWidthMm !== undefined) this.slitWidthMm = params.slitWidthMm;
    if (params.slitDistanceMm !== undefined) this.slitDistanceMm = params.slitDistanceMm;
    if (params.gratingLinesPerMm !== undefined) this.gratingLinesPerMm = params.gratingLinesPerMm;

    this.updateSlideTexture();
    if (this.micrometerDrum) {
      this.micrometerDrum.rotation.y += 0.25;
    }
  }

  public dispose(): void {
    if (this.slideTexture) {
      this.slideTexture.dispose();
      this.slideTexture = null;
    }
  }
}
