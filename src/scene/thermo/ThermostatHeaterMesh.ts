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
    // Shared scientific materials (matching optics hardware specifications)
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xdfe6ed,
      metalness: 0.76,
      roughness: 0.24,
    });
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xc4cfdc,
      metalness: 0.82,
      roughness: 0.22,
    });
    this.disposables.push(satinSilverMat, stainlessMat, titaniumMat);

    // 1. Non-slip industrial rubber base pad (y = 0 to 0.002)
    const rubberGeo = new THREE.CylinderGeometry(0.134, 0.134, 0.002, 36);
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.9 });
    this.disposables.push(rubberGeo, rubberMat);
    const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
    rubberMesh.position.y = 0.001;
    this.group.add(rubberMesh);

    // 2. Polished stainless steel lower bevel rim (y = 0.002 to 0.006)
    const lowerRimGeo = new THREE.CylinderGeometry(0.131, 0.134, 0.004, 36);
    this.disposables.push(lowerRimGeo);
    const lowerRim = new THREE.Mesh(lowerRimGeo, stainlessMat);
    lowerRim.position.y = 0.004;
    lowerRim.castShadow = true;
    this.group.add(lowerRim);

    // 3. Precision satin clear-anodized aluminum base housing (y = 0.006 to 0.052)
    const housingGeo = new THREE.CylinderGeometry(0.120, 0.131, 0.046, 36);
    this.disposables.push(housingGeo);

    const housingMesh = new THREE.Mesh(housingGeo, satinSilverMat);
    housingMesh.position.y = 0.029;
    housingMesh.castShadow = true;
    housingMesh.receiveShadow = true;
    this.group.add(housingMesh);

    // Top stainless steel collar rim (open-ended to eliminate co-planar caps)
    const topCollarGeo = new THREE.CylinderGeometry(0.114, 0.120, 0.004, 36, 1, true);
    this.disposables.push(topCollarGeo);
    const topCollar = new THREE.Mesh(topCollarGeo, stainlessMat);
    topCollar.position.y = 0.052;
    this.group.add(topCollar);

    // 4. High-temp ceramic heating plate top (y = 0.052 to 0.062)
    const plateGeo = new THREE.CylinderGeometry(0.108, 0.108, 0.010, 36);
    this.heatingSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      metalness: 0.5,
      roughness: 0.4,
    });
    this.disposables.push(plateGeo, this.heatingSurfaceMat);

    this.heatingSurfaceMesh = new THREE.Mesh(plateGeo, this.heatingSurfaceMat);
    this.heatingSurfaceMesh.position.y = 0.057;
    this.heatingSurfaceMesh.castShadow = true;
    this.group.add(this.heatingSurfaceMesh);

    // 5. Dynamic Thermal Infrared Glow PointLight
    this.heatGlowLight = new THREE.PointLight(0xff4500, 0, 0.4);
    this.heatGlowLight.position.set(0, 0.07, 0);
    this.group.add(this.heatGlowLight);
    this.disposables.push(this.heatGlowLight);

    // 6. Digital LED temperature readout screen with extruded front bezel pod
    // Front instrument bezel block (eliminates cylinder wall intersection/clipping)
    const bezelGeo = new THREE.BoxGeometry(0.076, 0.034, 0.012);
    this.disposables.push(bezelGeo);
    const bezelMesh = new THREE.Mesh(bezelGeo, titaniumMat);
    bezelMesh.position.set(0, 0.028, 0.125);
    bezelMesh.castShadow = true;
    this.group.add(bezelMesh);

    this.ledCanvas = document.createElement('canvas');
    this.ledCanvas.width = 256;
    this.ledCanvas.height = 96;
    this.ledTexture = new THREE.CanvasTexture(this.ledCanvas);
    this.ledTexture.minFilter = THREE.LinearFilter;
    this.disposables.push(this.ledTexture);

    const screenGeo = new THREE.PlaneGeometry(0.066, 0.026);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.ledTexture,
      transparent: true,
      depthWrite: false,
    });
    this.disposables.push(screenGeo, screenMat);

    this.ledMesh = new THREE.Mesh(screenGeo, screenMat);
    this.ledMesh.position.set(0, 0.028, 0.1312);
    this.ledMesh.renderOrder = 2;
    this.group.add(this.ledMesh);

    // 7. Knurled rotary temperature control dial (interactive knob)
    // Dial collar in titanium
    const dialCollarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24);
    this.disposables.push(dialCollarGeo);
    const dialCollar = new THREE.Mesh(dialCollarGeo, titaniumMat);
    dialCollar.rotation.x = Math.PI * 0.5;
    dialCollar.position.set(0.055, 0.026, 0.126);
    this.group.add(dialCollar);

    const knobGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 24);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.disposables.push(knobGeo, knobMat);

    this.knobMesh = new THREE.Mesh(knobGeo, knobMat);
    this.knobMesh.rotation.x = Math.PI * 0.5;
    this.knobMesh.position.set(0.055, 0.026, 0.134);
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
