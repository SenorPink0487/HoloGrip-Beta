import * as THREE from 'three';

export class RotaryStageMesh {
  public readonly group = new THREE.Group();
  public readonly rotorGroup = new THREE.Group();

  public currentAngleDeg = 0;

  private dialTexture: THREE.CanvasTexture | null = null;
  private micrometerKnob: THREE.Mesh;

  constructor() {
    this.group.name = 'RotaryStageMesh';
    this.createStator();
    this.createRotor();
  }

  private createDialCanvas(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    const cx = 512;
    const cy = 512;
    const outerR = 490;
    const innerR = 360;

    // Dial background ring
    ctx.fillStyle = '#181b20';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fill();

    // Outer & Inner metallic bevel line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();

    // 360 Degree Ticks & Numbers
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';

    for (let deg = 0; deg < 360; deg++) {
      const rad = THREE.MathUtils.degToRad(deg - 90);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      if (deg % 30 === 0) {
        // Major 30 deg mark
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 36), cy + sin * (outerR - 36));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();

        // Label
        const textR = innerR + 42;
        ctx.save();
        ctx.translate(cx + cos * textR, cy + sin * textR);
        ctx.rotate(rad + Math.PI * 0.5);
        ctx.fillText(`${deg}°`, 0, 0);
        ctx.restore();
      } else if (deg % 10 === 0) {
        // 10 deg mark
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 26), cy + sin * (outerR - 26));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      } else if (deg % 5 === 0) {
        // 5 deg mark
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 18), cy + sin * (outerR - 18));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      } else {
        // 1 deg minor mark
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 11), cy + sin * (outerR - 11));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.dialTexture = texture;
    return texture;
  }

  private createStator(): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.65,
      roughness: 0.20,
    });

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x485262,
      metalness: 0.22,
      roughness: 0.35,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdfb43a,
      metalness: 0.65,
      roughness: 0.25,
    });

    // 1. Support post (Ø12mm)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 24), postMat);
    post.position.y = 0.06;
    post.castShadow = true;
    this.group.add(post);

    // 2. Heavy stator base collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.016, 48), bodyMat);
    collar.position.y = 0.128;
    collar.castShadow = true;
    this.group.add(collar);

    // 3. Vernier fixed reading pointer (red line on base)
    const ptrGeo = new THREE.BoxGeometry(0.004, 0.018, 0.003);
    const ptrMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const pointer = new THREE.Mesh(ptrGeo, ptrMat);
    pointer.position.set(0, 0.136, 0.049);
    this.group.add(pointer);

    // 4. Side micrometer fine tangent adjustment drum (微分头)
    const micrometerGroup = new THREE.Group();
    micrometerGroup.position.set(0.056, 0.128, 0);

    const drumSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 20), postMat);
    drumSleeve.rotation.z = Math.PI * 0.5;
    micrometerGroup.add(drumSleeve);

    this.micrometerKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 24), brassMat);
    this.micrometerKnob.rotation.z = Math.PI * 0.5;
    this.micrometerKnob.position.x = 0.02;
    micrometerGroup.add(this.micrometerKnob);

    this.group.add(micrometerGroup);
  }

  private createRotor(): void {
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x505b6c,
      metalness: 0.25,
      roughness: 0.32,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdfb43a,
      metalness: 0.65,
      roughness: 0.25,
    });

    this.rotorGroup.position.y = 0.144;

    // 1. Rotating main disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, 48), rotorMat);
    disc.castShadow = true;
    this.rotorGroup.add(disc);

    // 2. 360 Degree Dial Disc Top Face
    const dialTex = this.createDialCanvas();
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTex,
      side: THREE.DoubleSide,
    });
    const dialDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0458, 48), dialMat);
    dialDisc.rotation.x = -Math.PI * 0.5;
    dialDisc.position.y = 0.0061;
    this.rotorGroup.add(dialDisc);

    // 3. Central sample stage platform (for holding prism)
    const stagePlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.005, 36), rotorMat);
    stagePlatform.position.y = 0.0086;
    stagePlatform.castShadow = true;
    this.rotorGroup.add(stagePlatform);

    // 4. Spring-loaded brass clamp arms for prism (3 clamps)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const clampArm = new THREE.Group();
      clampArm.position.set(Math.cos(angle) * 0.028, 0.011, Math.sin(angle) * 0.028);
      clampArm.rotation.y = -angle;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.016, 12), brassMat);
      post.position.y = 0.008;
      clampArm.add(post);

      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.004), brassMat);
      finger.position.set(0.005, 0.016, 0);
      clampArm.add(finger);

      this.rotorGroup.add(clampArm);
    }

    this.group.add(this.rotorGroup);
  }

  public setRotationAngleDeg(deg: number): void {
    this.currentAngleDeg = deg;
    const rad = THREE.MathUtils.degToRad(deg);
    this.rotorGroup.rotation.y = rad;
    if (this.micrometerKnob) {
      this.micrometerKnob.rotation.x = rad * 8.0;
    }
  }

  public dispose(): void {
    if (this.dialTexture) {
      this.dialTexture.dispose();
      this.dialTexture = null;
    }
  }
}
