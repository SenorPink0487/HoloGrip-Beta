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

    // 缎面银色刻度盘背景环
    ctx.fillStyle = '#edf2f7';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
    ctx.fill();

    // 外圈与内圈金属倒角线
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();

    // 高对比度纯黑 360 度刻度线与数字
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';

    for (let deg = 0; deg < 360; deg++) {
      const rad = THREE.MathUtils.degToRad(deg - 90);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      if (deg % 30 === 0) {
        // 30 度主刻度标记
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 34), cy + sin * (outerR - 34));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();

        // 刻度数值标签
        const textR = innerR + 42;
        ctx.save();
        ctx.translate(cx + cos * textR, cy + sin * textR);
        ctx.rotate(rad + Math.PI * 0.5);
        ctx.fillText(`${deg}°`, 0, 0);
        ctx.restore();
      } else if (deg % 10 === 0) {
        // 10 度中刻度标记
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 24), cy + sin * (outerR - 24));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      } else if (deg % 5 === 0) {
        // 5 度小刻度标记
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 16), cy + sin * (outerR - 16));
        ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
        ctx.stroke();
      } else {
        // 1 度细分次刻度标记
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (outerR - 10), cy + sin * (outerR - 10));
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
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ed,
      metalness: 0.70,
      roughness: 0.28,
    });

    const knurledMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.75,
      roughness: 0.25,
    });

    // 1. 支撑立柱（直径 12mm）
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 24), postMat);
    post.position.y = 0.06;
    post.castShadow = true;
    this.group.add(post);

    // 2. 缎面银色厚重定子底座套筒
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.016, 48), bodyMat);
    collar.position.y = 0.128;
    collar.castShadow = true;
    this.group.add(collar);

    // 3. 游标固定读数指针（底座上的红色指标线）
    const ptrGeo = new THREE.BoxGeometry(0.004, 0.018, 0.003);
    const ptrMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const pointer = new THREE.Mesh(ptrGeo, ptrMat);
    pointer.position.set(0, 0.136, 0.049);
    this.group.add(pointer);

    // 4. 侧边微分切线微调鼓轮
    const micrometerGroup = new THREE.Group();
    micrometerGroup.position.set(0.056, 0.128, 0);

    const drumSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 20), postMat);
    drumSleeve.rotation.z = Math.PI * 0.5;
    micrometerGroup.add(drumSleeve);

    this.micrometerKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 24), knurledMat);
    this.micrometerKnob.rotation.z = Math.PI * 0.5;
    this.micrometerKnob.position.x = 0.02;
    this.micrometerKnob.name = 'RotaryMicrometer';
    this.micrometerKnob.userData = { isRotaryMicrometer: true, rotaryStage: this };
    micrometerGroup.add(this.micrometerKnob);

    this.group.add(micrometerGroup);
  }

  private createRotor(): void {
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0xd5dde8,
      metalness: 0.72,
      roughness: 0.26,
    });

    const clampMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });

    this.rotorGroup.position.y = 0.144;

    // 1. 旋转主圆盘
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, 48), rotorMat);
    disc.castShadow = true;
    disc.userData = { isRotaryStageRotor: true, rotaryStage: this };
    this.rotorGroup.add(disc);

    // 2. 360 度分度盘顶面
    const dialTex = this.createDialCanvas();
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTex,
      side: THREE.DoubleSide,
    });
    const dialDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0458, 48), dialMat);
    dialDisc.rotation.x = -Math.PI * 0.5;
    dialDisc.position.y = 0.0061;
    dialDisc.userData = { isRotaryStageRotor: true, rotaryStage: this };
    this.rotorGroup.add(dialDisc);

    // 3. 中心样品承载台（用于放置棱镜）
    const stagePlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.005, 36), rotorMat);
    stagePlatform.position.y = 0.0086;
    stagePlatform.castShadow = true;
    stagePlatform.userData = { isRotaryStageRotor: true, rotaryStage: this };
    this.rotorGroup.add(stagePlatform);

    // 4. 棱镜弹簧不锈钢压臂（3 组压夹）
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const clampArm = new THREE.Group();
      clampArm.position.set(Math.cos(angle) * 0.028, 0.011, Math.sin(angle) * 0.028);
      clampArm.rotation.y = -angle;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.016, 12), clampMat);
      post.position.y = 0.008;
      clampArm.add(post);

      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.004), clampMat);
      finger.position.set(0.005, 0.016, 0);
      clampArm.add(finger);

      this.rotorGroup.add(clampArm);
    }

    this.rotorGroup.name = 'RotaryStageRotor';
    this.rotorGroup.userData = { isRotaryStageRotor: true, rotaryStage: this };
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

  public rotateBy(deltaDeg: number): number {
    const newAng = Math.max(-35, Math.min(35, this.currentAngleDeg + deltaDeg));
    this.setRotationAngleDeg(newAng);
    return newAng;
  }

  public dispose(): void {
    if (this.dialTexture) {
      this.dialTexture.dispose();
      this.dialTexture = null;
    }
  }
}
