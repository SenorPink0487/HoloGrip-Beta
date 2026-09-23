import * as THREE from 'three';

export class PressureGaugeMesh {
  public group: THREE.Group;
  private pointerMesh: THREE.Mesh;
  private dialCanvas: HTMLCanvasElement;
  private dialTexture: THREE.CanvasTexture;
  private disposables: { dispose: () => void }[] = [];

  public readonly minPressure = 0;
  public readonly maxPressure = 400; // kPa

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PressureGauge';
    this.build();
  }

  private build(): void {
    // 1. Brass inlet stem / pipe connector
    const pipeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.06, 16);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      metalness: 0.9,
      roughness: 0.25,
    });
    this.disposables.push(pipeGeo, pipeMat);

    const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
    pipeMesh.position.y = 0.03;
    pipeMesh.castShadow = true;
    this.group.add(pipeMesh);

    // 2. Chrome cylindrical casing (diameter 0.08m, depth 0.024m)
    const caseGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.022, 36);
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.disposables.push(caseGeo, caseMat);

    const caseMesh = new THREE.Mesh(caseGeo, caseMat);
    caseMesh.rotation.x = Math.PI * 0.5;
    caseMesh.position.set(0, 0.06 + 0.042, 0);
    caseMesh.castShadow = true;
    this.group.add(caseMesh);

    // 3. Dial Face Disc with crisp metric scale
    this.dialCanvas = document.createElement('canvas');
    this.dialCanvas.width = 512;
    this.dialCanvas.height = 512;
    this.drawDialFace();

    this.dialTexture = new THREE.CanvasTexture(this.dialCanvas);
    this.dialTexture.minFilter = THREE.LinearFilter;
    this.disposables.push(this.dialTexture);

    const dialGeo = new THREE.CircleGeometry(0.039, 36);
    const dialMat = new THREE.MeshBasicMaterial({
      map: this.dialTexture,
    });
    this.disposables.push(dialGeo, dialMat);

    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.position.set(0, 0.06 + 0.042, 0.0115);
    this.group.add(dialMesh);

    // 4. Rotating Pointer Needle
    const pointerGroup = new THREE.Group();
    pointerGroup.position.set(0, 0.06 + 0.042, 0.0125);
    this.group.add(pointerGroup);

    const needleGeo = new THREE.ConeGeometry(0.0022, 0.032, 16);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.disposables.push(needleGeo, needleMat);

    this.pointerMesh = new THREE.Mesh(needleGeo, needleMat);
    this.pointerMesh.position.y = 0.016; // pivot at base
    pointerGroup.add(this.pointerMesh);

    // Center cap
    const capGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.004, 24);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    this.disposables.push(capGeo, capMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.rotation.x = Math.PI * 0.5;
    pointerGroup.add(capMesh);

    // Store pointerGroup reference in pointerMesh parent
    this.setPressure(101.3);
  }

  private drawDialFace(): void {
    const ctx = this.dialCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    // Circular inner rim
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 244, 0, Math.PI * 2);
    ctx.stroke();

    // Red warning danger zone arc (300 to 400 kPa)
    // Angles: 0 kPa is at 225° (bottom left), 400 kPa is at -45° / 315° (bottom right)
    // In canvas coords (0 is 3 o'clock):
    // 0 kPa: 135° = 0.75 * PI
    // 300 kPa: 337.5° = 1.875 * PI
    // 400 kPa: 405° = 2.25 * PI = 0.25 * PI
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 256, 218, 1.875 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    // Normal safe zone arc (0 to 300 kPa)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 218, 0.75 * Math.PI, 1.875 * Math.PI);
    ctx.stroke();

    // Ticks & Labels
    const startAngle = 0.75 * Math.PI; // 135°
    const endAngle = 2.25 * Math.PI;   // 405°
    const totalTicks = 40; // Every 10 kPa

    for (let i = 0; i <= totalTicks; i++) {
      const angle = startAngle + (i / totalTicks) * (endAngle - startAngle);
      const isMajor = i % 5 === 0;
      const isNumber = i % 10 === 0;

      const rOuter = 212;
      const rInner = isMajor ? 186 : 198;

      const x1 = 256 + Math.cos(angle) * rOuter;
      const y1 = 256 + Math.sin(angle) * rOuter;
      const x2 = 256 + Math.cos(angle) * rInner;
      const y2 = 256 + Math.sin(angle) * rInner;

      ctx.strokeStyle = (i >= 30) ? '#dc2626' : '#1e293b';
      ctx.lineWidth = isMajor ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (isNumber) {
        const val = i * 10;
        const rText = 158;
        const xt = 256 + Math.cos(angle) * rText;
        const yt = 256 + Math.sin(angle) * rText;

        ctx.fillStyle = (i >= 30) ? '#dc2626' : '#0f172a';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${val}`, xt, yt);
      }
    }

    // Title / Unit
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('kPa', 256, 320);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillText('PRESSURE GAUGE', 256, 350);
  }

  public setPressure(kpa: number): void {
    const clamped = Math.max(0, Math.min(this.maxPressure, kpa));
    // Pointer rotation: 0 kPa is +135° (or 2.356 rad), 400 kPa is -135° (-2.356 rad)
    const norm = clamped / this.maxPressure;
    const angle = 135 - norm * 270;
    if (this.pointerMesh.parent) {
      this.pointerMesh.parent.rotation.z = (angle * Math.PI) / 180;
    }
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
