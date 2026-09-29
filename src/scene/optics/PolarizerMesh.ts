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
    this.group.userData = { isPolarizer: true, polarizer: this };
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

    ctx.fillStyle = '#edf2f7';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#0f172a';
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
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ed,
      metalness: 0.70,
      roughness: 0.28,
    });

    const knurledMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.75,
      roughness: 0.25,
    });

    // 1. 安装立柱（直径 12mm）
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 24), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    post.userData = { isPolarizer: true, polarizer: this };
    this.group.add(post);

    // 2. 环形定子支架（外圆直径 92mm，内通光孔径 76mm）
    const statorShape = new THREE.Shape();
    statorShape.absarc(0, 0, 0.046, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, 0.038, 0, Math.PI * 2, true);
    statorShape.holes.push(holePath);

    const statorGeo = new THREE.ExtrudeGeometry(statorShape, {
      depth: 0.016,
      bevelEnabled: false,
    });
    statorGeo.center();
    const stator = new THREE.Mesh(statorGeo, frameMat);
    stator.position.y = 0.186;
    stator.castShadow = true;
    stator.userData = { isPolarizerRotor: true, polarizer: this };
    this.group.add(stator);

    // 3. 定子顶部锁紧螺钉
    const lockScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 16), knurledMat);
    lockScrew.position.set(0, 0.235, 0);
    this.group.add(lockScrew);

    // 4. 0 度游标读数指标线
    const ptrGeo = new THREE.BoxGeometry(0.003, 0.014, 0.002);
    const ptrMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const pointer = new THREE.Mesh(ptrGeo, ptrMat);
    pointer.position.set(0, 0.224, 0.009);
    this.group.add(pointer);
  }

  private createRotatableRing(): void {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xd0d7de,
      metalness: 0.80,
      roughness: 0.22,
    });

    this.rotatableRing.position.set(0, 0.186, 0);

    // 1. 带滚花指拨外圈的转子环
    const rotorGeo = new THREE.TorusGeometry(0.036, 0.004, 16, 48);
    const rotor = new THREE.Mesh(rotorGeo, ringMat);
    rotor.userData = { isPolarizerRotor: true, polarizer: this };
    this.rotatableRing.add(rotor);

    // 2. 带有 360 度分度盘的刻度盘面板
    const dialTex = this.createDialCanvas();
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const dialPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.076), dialMat);
    dialPlane.position.z = 0.005;
    dialPlane.userData = { isPolarizerRotor: true, polarizer: this };
    this.rotatableRing.add(dialPlane);

    // 3. 偏振片圆片（PVA 二向色性晶体薄膜）
    this.filmMat = new THREE.MeshPhysicalMaterial({
      color: 0x3d4b59,
      roughness: 0.08,
      metalness: 0.12,
      reflectivity: 0.60,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const filmDisc = new THREE.Mesh(new THREE.CircleGeometry(0.026, 36), this.filmMat);
    filmDisc.position.z = 0.001;
    filmDisc.userData = { isPolarizerRotor: true, polarizer: this };
    this.rotatableRing.add(filmDisc);

    // 4. 透光偏振轴指示针
    const axisGeo = new THREE.BoxGeometry(0.0015, 0.052, 0.001);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0x00f7ff });
    const axisNeedle = new THREE.Mesh(axisGeo, axisMat);
    axisNeedle.position.z = 0.002;
    this.rotatableRing.add(axisNeedle);

    // 轴向指示针两端的箭头
    const arrowTop = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.006, 12), axisMat);
    arrowTop.position.set(0, 0.025, 0.002);
    this.rotatableRing.add(arrowTop);

    const arrowBottom = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.006, 12), axisMat);
    arrowBottom.position.set(0, -0.025, 0.002);
    arrowBottom.rotation.z = Math.PI;
    this.rotatableRing.add(arrowBottom);

    this.rotatableRing.name = 'PolarizerRotor';
    this.rotatableRing.userData = { isPolarizerRotor: true, polarizer: this };
    this.group.add(this.rotatableRing);
  }

  public setAngleDeg(deg: number): void {
    this.angleDeg = ((deg % 360) + 360) % 360;
    const rad = THREE.MathUtils.degToRad(this.angleDeg);
    this.rotatableRing.rotation.z = rad;
  }

  public rotateBy(deltaDeg: number): number {
    this.setAngleDeg(this.angleDeg + deltaDeg);
    return this.angleDeg;
  }

  public toggleWavePlate(): boolean {
    this.toggleQuarterWavePlate(!this.hasWavePlate);
    return this.hasWavePlate;
  }

  public toggleQuarterWavePlate(enabled: boolean): void {
    this.hasWavePlate = enabled;
    if (enabled && !this.wavePlateMesh) {
      const plateMat = new THREE.MeshPhysicalMaterial({
        color: 0xffe8b4,
        roughness: 0.06,
        metalness: 0.05,
        reflectivity: 0.80,
        clearcoat: 0.9,
        clearcoatRoughness: 0.06,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.wavePlateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.003), plateMat);
      this.wavePlateMesh.position.set(0, 0, 0.012);
      this.wavePlateMesh.name = 'QuarterWavePlate';
      this.wavePlateMesh.userData = { isWavePlate: true, polarizer: this };
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
    if (this.wavePlateMesh) {
      this.wavePlateMesh.geometry.dispose();
      if (Array.isArray(this.wavePlateMesh.material)) {
        this.wavePlateMesh.material.forEach((m) => m.dispose());
      } else {
        this.wavePlateMesh.material.dispose();
      }
    }
  }
}
