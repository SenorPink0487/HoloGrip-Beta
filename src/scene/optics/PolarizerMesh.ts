import * as THREE from 'three';

export class PolarizerMesh {
  public readonly group = new THREE.Group();
  public readonly rotatableRing = new THREE.Group();

  public angleDeg = 0;
  public label: string;

  private dialTexture: THREE.CanvasTexture | null = null;
  private filmMat: THREE.MeshPhysicalMaterial;
  private wavePlateMesh: THREE.Mesh | null = null;
  public hasWavePlate = false;

  constructor(label = 'POLARIZER P1', initialAngle = 0) {
    this.label = label;
    this.angleDeg = initialAngle;
    this.group.name = `PolarizerMesh_${label}`;
    this.createMount();
    this.createRotatableRing();
    this.setAngleDeg(initialAngle);
  }

  private createDialCanvas(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    const cx = 512;
    const cy = 512;
    const outerR = 490;
    const innerR = 380;

    ctx.fillStyle = '#14161a';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fill();

    ctx.strokeStyle = '#388bfd';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, monospace';

    for (let deg = 0; deg < 360; deg += 5) {
      const rad = THREE.MathUtils.degToRad(deg - 90);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      if (deg % 30 === 0) {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 36), cy + sin * (outerR - 36));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();

        const textR = innerR + 45;
        ctx.save();
        ctx.translate(cx + cos * textR, cy + sin * textR);
        ctx.rotate(rad + Math.PI * 0.5);
        ctx.fillText(`${deg}°`, 0, 0);
        ctx.restore();
      } else if (deg % 10 === 0) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 24), cy + sin * (outerR - 24));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      } else {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 14), cy + sin * (outerR - 14));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.dialTexture = tex;
    return tex;
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

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdfb43a,
      metalness: 0.65,
      roughness: 0.25,
    });

    // 1. Post (Ø12mm)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 24), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    this.group.add(post);

    // 2. Annular Stator Bracket (Outer ring, inner aperture Ø50mm)
    const statorGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.016, 48);
    const stator = new THREE.Mesh(statorGeo, frameMat);
    stator.rotation.x = Math.PI * 0.5;
    stator.position.y = 0.186;
    stator.castShadow = true;
    this.group.add(stator);

    // 3. Stator top lock screw
    const lockScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 16), brassMat);
    lockScrew.position.set(0, 0.235, 0);
    this.group.add(lockScrew);

    // 4. Zero degree vernier reading index pointer
    const ptrGeo = new THREE.BoxGeometry(0.003, 0.014, 0.002);
    const ptrMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const pointer = new THREE.Mesh(ptrGeo, ptrMat);
    pointer.position.set(0, 0.224, 0.009);
    this.group.add(pointer);
  }

  private createRotatableRing(): void {
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdfb43a,
      metalness: 0.65,
      roughness: 0.25,
    });

    this.rotatableRing.position.set(0, 0.186, 0);

    // 1. Rotor ring with knurled finger rim
    const rotorGeo = new THREE.TorusGeometry(0.036, 0.004, 16, 48);
    const rotor = new THREE.Mesh(rotorGeo, brassMat);
    this.rotatableRing.add(rotor);

    // 2. Dial face plate with 360 degree scale
    const dialTex = this.createDialCanvas();
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const dialPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.076), dialMat);
    dialPlane.position.z = 0.005;
    this.rotatableRing.add(dialPlane);

    // 3. Polarizing film disc (PVA dichroic crystal sheet)
    this.filmMat = new THREE.MeshPhysicalMaterial({
      color: 0x6a7b8c,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.72,
      transparent: true,
      opacity: 0.75,
      clearcoat: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const filmDisc = new THREE.Mesh(new THREE.CircleGeometry(0.026, 36), this.filmMat);
    filmDisc.position.z = 0.001;
    this.rotatableRing.add(filmDisc);

    // 4. Transmission polarization axis indicator needle
    const axisGeo = new THREE.BoxGeometry(0.0015, 0.052, 0.001);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0x00f7ff });
    const axisNeedle = new THREE.Mesh(axisGeo, axisMat);
    axisNeedle.position.z = 0.002;
    this.rotatableRing.add(axisNeedle);

    // Arrows on both ends of the axis needle
    const arrowTop = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.006, 12), axisMat);
    arrowTop.position.set(0, 0.025, 0.002);
    this.rotatableRing.add(arrowTop);

    const arrowBottom = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.006, 12), axisMat);
    arrowBottom.position.set(0, -0.025, 0.002);
    arrowBottom.rotation.z = Math.PI;
    this.rotatableRing.add(arrowBottom);

    this.group.add(this.rotatableRing);
  }

  public setAngleDeg(deg: number): void {
    this.angleDeg = deg;
    const rad = THREE.MathUtils.degToRad(deg);
    this.rotatableRing.rotation.z = rad;
  }

  public toggleQuarterWavePlate(enabled: boolean): void {
    this.hasWavePlate = enabled;
    if (enabled && !this.wavePlateMesh) {
      const plateMat = new THREE.MeshPhysicalMaterial({
        color: 0xffe6aa,
        roughness: 0.02,
        metalness: 0.05,
        transmission: 0.88,
        transparent: true,
        opacity: 0.85,
        clearcoat: 1.0,
      });
      this.wavePlateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.003), plateMat);
      this.wavePlateMesh.position.set(0, 0, 0.012);
      this.rotatableRing.add(this.wavePlateMesh);
    } else if (this.wavePlateMesh) {
      this.wavePlateMesh.visible = enabled;
    }
  }

  public dispose(): void {
    if (this.dialTexture) {
      this.dialTexture.dispose();
      this.dialTexture = null;
    }
    this.filmMat.dispose();
  }
}
