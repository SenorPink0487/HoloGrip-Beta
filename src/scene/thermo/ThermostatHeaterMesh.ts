import * as THREE from 'three';

export class ThermostatHeaterMesh {
  public group: THREE.Group;
  public knobMesh: THREE.Mesh;
  private heatingSurfaceMesh: THREE.Mesh;
  private heatingSurfaceMat: THREE.MeshStandardMaterial;
  private ledCanvas: HTMLCanvasElement;
  private ledTexture: THREE.CanvasTexture;
  private ledMesh: THREE.Mesh;
  private heatGlowLight: THREE.PointLight;
  private disposables: { dispose: () => void }[] = [];

  private currentTempK = 300;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ThermostatHeater';
    this.build();
  }

  private build(): void {
    // 1. Heavy industrial thermal base housing (dark powder-coated steel)
    const housingGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.05, 36);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x252a34,
      metalness: 0.7,
      roughness: 0.35,
    });
    this.disposables.push(housingGeo, housingMat);

    const housingMesh = new THREE.Mesh(housingGeo, housingMat);
    housingMesh.position.y = 0.025;
    housingMesh.castShadow = true;
    housingMesh.receiveShadow = true;
    this.group.add(housingMesh);

    // 2. Ceramic / High-temp alloy heating plate top
    const plateGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.012, 36);
    this.heatingSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      metalness: 0.4,
      roughness: 0.5,
    });
    this.disposables.push(plateGeo, this.heatingSurfaceMat);

    this.heatingSurfaceMesh = new THREE.Mesh(plateGeo, this.heatingSurfaceMat);
    this.heatingSurfaceMesh.position.y = 0.056;
    this.heatingSurfaceMesh.castShadow = true;
    this.group.add(this.heatingSurfaceMesh);

    // 3. Dynamic Thermal Infrared Glow PointLight
    this.heatGlowLight = new THREE.PointLight(0xff4500, 0, 0.4);
    this.heatGlowLight.position.set(0, 0.07, 0);
    this.group.add(this.heatGlowLight);
    this.disposables.push(this.heatGlowLight);

    // 4. Digital LED temperature readout screen on front face
    this.ledCanvas = document.createElement('canvas');
    this.ledCanvas.width = 256;
    this.ledCanvas.height = 96;
    this.ledTexture = new THREE.CanvasTexture(this.ledCanvas);
    this.ledTexture.minFilter = THREE.LinearFilter;
    this.disposables.push(this.ledTexture);

    const screenGeo = new THREE.PlaneGeometry(0.065, 0.024);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.ledTexture,
      transparent: true,
    });
    this.disposables.push(screenGeo, screenMat);

    this.ledMesh = new THREE.Mesh(screenGeo, screenMat);
    this.ledMesh.position.set(0, 0.028, 0.122);
    this.group.add(this.ledMesh);

    // 5. Knurled rotary temperature control dial (interactive knob)
    const knobGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 24);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(knobGeo, knobMat);

    this.knobMesh = new THREE.Mesh(knobGeo, knobMat);
    this.knobMesh.rotation.x = Math.PI * 0.5;
    this.knobMesh.position.set(0.055, 0.026, 0.118);
    this.knobMesh.name = 'HeaterKnob';
    this.group.add(this.knobMesh);

    // Dial notch indicator
    const notchGeo = new THREE.BoxGeometry(0.003, 0.016, 0.006);
    const notchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.disposables.push(notchGeo, notchMat);
    const notch = new THREE.Mesh(notchGeo, notchMat);
    notch.position.set(0, 0.008, 0.008);
    this.knobMesh.add(notch);

    this.updateHeaterAppearance(this.currentTempK);
  }

  public setTemperature(tempK: number): void {
    this.currentTempK = Math.max(100, Math.min(800, tempK));
    this.updateHeaterAppearance(this.currentTempK);
  }

  private updateHeaterAppearance(tempK: number): void {
    // 1. Rotary knob angle (-135° to +135° across 100K to 800K)
    const norm = (tempK - 100) / 700;
    const angle = (norm * 270 - 135) * (Math.PI / 180);
    this.knobMesh.rotation.z = -angle;

    // 2. Thermal incandescence & glow:
    // Below 350K: dark, cold
    // 350K - 550K: dark red glow begins
    // 550K - 800K: bright incandescent orange-red to bright amber
    if (tempK < 350) {
      this.heatingSurfaceMat.emissive.setHex(0x000000);
      this.heatingSurfaceMat.emissiveIntensity = 0.0;
      this.heatGlowLight.intensity = 0.0;
    } else {
      const heatFactor = (tempK - 350) / 450; // 0 to 1
      const r = Math.min(1.0, 0.4 + heatFactor * 0.6);
      const g = Math.max(0.0, (heatFactor - 0.3) * 0.7);
      const b = 0.0;

      this.heatingSurfaceMat.emissive.setRGB(r, g, b);
      this.heatingSurfaceMat.emissiveIntensity = 0.4 + heatFactor * 1.8;

      this.heatGlowLight.color.setRGB(r, g, b);
      this.heatGlowLight.intensity = heatFactor * 1.5;
    }

    // 3. Update LED digital readout canvas
    const ctx = this.ledCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, 256, 96);

      // Glass inner border
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 92);

      // Temp value & unit
      ctx.fillStyle = '#00f5ff';
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const celsius = (tempK - 273.15).toFixed(1);
      ctx.fillText(`${tempK.toFixed(0)} K`, 128, 38);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 22px -apple-system, sans-serif';
      ctx.fillText(`${celsius} °C · HEATER`, 128, 74);

      this.ledTexture.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
