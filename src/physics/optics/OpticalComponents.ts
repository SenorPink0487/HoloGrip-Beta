import * as THREE from 'three';
import { OpticsMath, ColorRGB } from './OpticsMath';
import { FringeTextureGenerator } from './FringeTextureGenerator';

/**
 * Common Apple-grade industrial finishes
 */
const SPACE_GRAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x242830,
  metalness: 0.88,
  roughness: 0.24,
});

const SILVER_ALU_MAT = new THREE.MeshStandardMaterial({
  color: 0xd0d7de,
  metalness: 0.92,
  roughness: 0.18,
});

const SATIN_DARK_MAT = new THREE.MeshStandardMaterial({
  color: 0x16181d,
  metalness: 0.7,
  roughness: 0.4,
});

/**
 * Premium anti-reflective optical glass material
 */
export function createOpticalGlassMaterial(ior = 1.52): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.94,
    opacity: 1.0,
    transparent: true,
    roughness: 0.03,
    metalness: 0.05,
    ior: ior,
    thickness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    specularColor: new THREE.Color(0xd6f0ff), // subtle AR coating cyan sheen
  });
}

/**
 * 1. Precision Semiconductor Laser Emitter
 */
export class LaserEmitterMesh {
  public readonly group = new THREE.Group();
  public apertureWorldPos = new THREE.Vector3();
  private beamGlowMat: THREE.MeshBasicMaterial;
  private powerLedMat: THREE.MeshBasicMaterial;

  constructor() {
    this.createModel();
  }

  private createModel(): void {
    // Main cylindrical unibody barrel
    const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.09, 32);
    barrelGeo.rotateZ(Math.PI / 2); // align along X axis (pointing +X)
    const barrel = new THREE.Mesh(barrelGeo, SPACE_GRAY_MAT);
    barrel.position.set(-0.02, 0.06, 0);
    this.group.add(barrel);

    // Front silver collar & aperture ring
    const collarGeo = new THREE.CylinderGeometry(0.0175, 0.0175, 0.015, 32);
    collarGeo.rotateZ(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, SILVER_ALU_MAT);
    collar.position.set(0.028, 0.06, 0);
    this.group.add(collar);

    // Laser output orifice / lens bezel
    const bezelGeo = new THREE.CylinderGeometry(0.007, 0.012, 0.006, 32);
    bezelGeo.rotateZ(Math.PI / 2);
    const bezel = new THREE.Mesh(bezelGeo, SATIN_DARK_MAT);
    bezel.position.set(0.038, 0.06, 0);
    this.group.add(bezel);

    // Aperture emitter glow disc
    const glowGeo = new THREE.CircleGeometry(0.005, 24);
    glowGeo.rotateY(Math.PI / 2);
    this.beamGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      side: THREE.DoubleSide,
    });
    const glowDisc = new THREE.Mesh(glowGeo, this.beamGlowMat);
    glowDisc.position.set(0.0415, 0.06, 0);
    this.group.add(glowDisc);

    // Mechanical top push button
    const btnGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.005, 16);
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x0a84ff,
      metalness: 0.5,
      roughness: 0.3,
    });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.name = 'laser-power-btn';
    btn.position.set(-0.02, 0.078, 0);
    this.group.add(btn);

    // Power status indicator LED
    const ledGeo = new THREE.SphereGeometry(0.0018, 12, 12);
    this.powerLedMat = new THREE.MeshBasicMaterial({ color: 0x34c759 });
    const led = new THREE.Mesh(ledGeo, this.powerLedMat);
    led.position.set(-0.04, 0.076, 0);
    this.group.add(led);

    // Vertical mounting rod to carrier
    const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 24);
    const rod = new THREE.Mesh(rodGeo, SILVER_ALU_MAT);
    rod.position.set(0, 0.03, 0);
    this.group.add(rod);
  }

  public updateWavelength(wlNm: number, isOn = true): void {
    const col = OpticsMath.wavelengthToRGB(wlNm);
    this.beamGlowMat.color.setHex(isOn ? col.hex : 0x222222);
    this.powerLedMat.color.setHex(isOn ? 0x34c759 : 0x555555);
  }
}

/**
 * 2. High-Precision Observation Screen Mesh
 */
export class ScreenMesh {
  public readonly group = new THREE.Group();
  public screenFaceMesh: THREE.Mesh;
  private screenMat: THREE.MeshBasicMaterial;

  constructor(generator: FringeTextureGenerator) {
    this.createModel(generator);
  }

  private createModel(generator: FringeTextureGenerator): void {
    // 1. Sleek unibody aluminum screen chassis
    const chassisGeo = new THREE.BoxGeometry(0.008, 0.095, 0.14);
    const chassis = new THREE.Mesh(chassisGeo, SPACE_GRAY_MAT);
    chassis.position.set(0, 0.07, 0);
    this.group.add(chassis);

    // 2. Beveled diamond-cut silver trim
    const trimGeo = new THREE.BoxGeometry(0.001, 0.096, 0.141);
    const trim = new THREE.Mesh(trimGeo, SILVER_ALU_MAT);
    trim.position.set(-0.0042, 0.07, 0);
    this.group.add(trim);

    // 3. Screen display face (matte diffuse projection surface mapped with texture)
    const faceGeo = new THREE.PlaneGeometry(0.134, 0.088);
    // Face faces -X (towards the laser beam)
    faceGeo.rotateY(-Math.PI / 2);

    this.screenMat = new THREE.MeshBasicMaterial({
      map: generator.texture,
      side: THREE.DoubleSide,
    });
    this.screenFaceMesh = new THREE.Mesh(faceGeo, this.screenMat);
    this.screenFaceMesh.position.set(-0.0046, 0.07, 0);
    this.group.add(this.screenFaceMesh);

    // 4. Mounting vertical post & knurled height adjuster
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 24);
    const post = new THREE.Mesh(postGeo, SILVER_ALU_MAT);
    post.position.set(0, 0.02, 0);
    this.group.add(post);
  }
}

/**
 * 3. Modular Slit / Aperture / Grating Holder
 */
export class SlitHolderMesh {
  public readonly group = new THREE.Group();
  public labelMesh: THREE.Mesh;
  private labelTexture: THREE.CanvasTexture;

  constructor() {
    this.createModel();
  }

  private createModel(): void {
    // 1. Post mounting rod
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 24);
    const post = new THREE.Mesh(postGeo, SILVER_ALU_MAT);
    post.position.set(0, 0.03, 0);
    this.group.add(post);

    // 2. U-shaped optical mounting ring / clamp
    const ringGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.008, 36);
    ringGeo.rotateZ(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, SPACE_GRAY_MAT);
    ring.position.set(0, 0.06, 0);
    this.group.add(ring);

    // 3. Inner slide cartridge (insertable plate)
    const plateGeo = new THREE.BoxGeometry(0.004, 0.05, 0.05);
    const plate = new THREE.Mesh(plateGeo, SATIN_DARK_MAT);
    plate.position.set(0, 0.06, 0);
    this.group.add(plate);

    // 4. Aperture center slot
    const slotGeo = new THREE.BoxGeometry(0.005, 0.022, 0.004);
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, 0.06, 0);
    this.group.add(slot);

    // 5. Laser-etched label on plate side
    this.updateLabel('DOUBLE SLIT');
  }

  public updateLabel(text: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#8b949e';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    if (!this.labelTexture) {
      this.labelTexture = new THREE.CanvasTexture(canvas);
      this.labelTexture.colorSpace = THREE.SRGBColorSpace;
      const labelGeo = new THREE.PlaneGeometry(0.036, 0.009);
      labelGeo.rotateY(Math.PI / 2);
      const labelMat = new THREE.MeshBasicMaterial({
        map: this.labelTexture,
        side: THREE.DoubleSide,
      });
      this.labelMesh = new THREE.Mesh(labelGeo, labelMat);
      this.labelMesh.position.set(0.0022, 0.038, 0);
      this.group.add(this.labelMesh);
    } else {
      this.labelTexture.image = canvas;
      this.labelTexture.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.labelTexture?.dispose();
  }
}

/**
 * 4. Precision Polarizer / Analyzer Disk with Knurled Bezel & Graduations
 */
export class PolarizerDiskMesh {
  public readonly group = new THREE.Group();
  public rotatingDialGroup = new THREE.Group();
  private dialTexture: THREE.CanvasTexture;
  private filterMat: THREE.MeshPhysicalMaterial;
  private pointerLine: THREE.Mesh;
  public angleRad = 0;

  constructor(public isAnalyzer = false) {
    this.createModel();
  }

  private createModel(): void {
    // 1. Supporting rod to carrier
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 24);
    const post = new THREE.Mesh(postGeo, SILVER_ALU_MAT);
    post.position.set(0, 0.03, 0);
    this.group.add(post);

    // 2. Fixed outer housing bracket with vernier pointer
    const bracketGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.008, 36);
    bracketGeo.rotateZ(Math.PI / 2);
    const bracket = new THREE.Mesh(bracketGeo, SPACE_GRAY_MAT);
    bracket.position.set(0, 0.06, 0);
    this.group.add(bracket);

    // 3. Rotating inner bezel (Apple diamond knurling + dial markings)
    this.rotatingDialGroup.position.set(0, 0.06, 0);
    this.group.add(this.rotatingDialGroup);

    // Knurled outer ring
    const ringGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.009, 36, 1, true);
    ringGeo.rotateZ(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, SILVER_ALU_MAT);
    this.rotatingDialGroup.add(ring);

    // Dial scale disk (0 - 360 degrees)
    this.createDialFace();

    // Central polarizing sheet filter
    const filterGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.002, 32);
    filterGeo.rotateZ(Math.PI / 2);
    this.filterMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a424e,
      transmission: 0.72,
      opacity: 0.85,
      transparent: true,
      roughness: 0.05,
      metalness: 0.2,
      ior: 1.5,
      thickness: 0.002,
      clearcoat: 0.8,
    });
    const filterMesh = new THREE.Mesh(filterGeo, this.filterMat);
    this.rotatingDialGroup.add(filterMesh);

    // Transmission axis glowing hairline indicator line across filter
    const pointerGeo = new THREE.BoxGeometry(0.003, 0.046, 0.0008);
    const pointerMat = new THREE.MeshBasicMaterial({
      color: 0x0a84ff,
      transparent: true,
      opacity: 0.75,
    });
    this.pointerLine = new THREE.Mesh(pointerGeo, pointerMat);
    this.pointerLine.position.set(0.002, 0, 0);
    this.rotatingDialGroup.add(this.pointerLine);
  }

  private createDialFace(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const cx = 256;
    const cy = 256;
    const rOuter = 240;
    const rInner = 190;

    ctx.clearRect(0, 0, 512, 512);

    // Ring background
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
    ctx.fillStyle = '#21262d';
    ctx.fill();

    // Subtle edge circle
    ctx.strokeStyle = '#6e7681';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter - 2, 0, Math.PI * 2);
    ctx.stroke();

    // 0 - 360 degree tick marks
    ctx.fillStyle = '#f0f6fc';
    ctx.font = '600 16px -apple-system, "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      let tickLen = 6;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#8b949e';

      if (deg % 30 === 0) {
        tickLen = 14;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#c9d1d9';

        const textR = rInner + 26;
        const tx = cx + cos * textR;
        const ty = cy + sin * textR;
        ctx.fillText(`${deg}°`, tx, ty);
      } else if (deg % 10 === 0) {
        tickLen = 10;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#a5b4fc';
      }

      ctx.beginPath();
      ctx.moveTo(cx + cos * rOuter, cy + sin * rOuter);
      ctx.lineTo(cx + cos * (rOuter - tickLen), cy + sin * (rOuter - tickLen));
      ctx.stroke();
    }

    this.dialTexture = new THREE.CanvasTexture(canvas);
    this.dialTexture.colorSpace = THREE.SRGBColorSpace;

    const faceGeo = new THREE.RingGeometry(0.024, 0.034, 36);
    faceGeo.rotateY(Math.PI / 2);
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.dialTexture,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0.0035, 0, 0);
    this.rotatingDialGroup.add(face);
  }

  public setAngleRad(angleRad: number): void {
    this.angleRad = angleRad;
    // Rotate dial around X axis (optical propagation axis)
    this.rotatingDialGroup.rotation.x = angleRad;
  }

  public setAngleDeg(angleDeg: number): void {
    this.setAngleRad((angleDeg * Math.PI) / 180);
  }

  public dispose(): void {
    this.dialTexture?.dispose();
  }
}

/**
 * 5. Optical Stage for Semicircular Glass Block & Prism
 */
export class PrismStageMesh {
  public readonly group = new THREE.Group();
  public rotaryPlatform = new THREE.Group();
  public glassBlockMesh: THREE.Mesh;
  public prismMesh: THREE.Mesh;
  private currentMode: 'block' | 'prism' = 'block';

  constructor() {
    this.createModel();
  }

  private createModel(): void {
    // 1. Post to carrier
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 24);
    const post = new THREE.Mesh(postGeo, SILVER_ALU_MAT);
    post.position.set(0, 0.03, 0);
    this.group.add(post);

    // 2. Rotary stage plate with circular angle graduations
    this.rotaryPlatform.position.set(0, 0.06, 0);
    this.group.add(this.rotaryPlatform);

    const plateGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.006, 36);
    const plate = new THREE.Mesh(plateGeo, SPACE_GRAY_MAT);
    this.rotaryPlatform.add(plate);

    // 3. Semicircular Optical Glass Block
    const blockShape = new THREE.Shape();
    const R = 0.028;
    blockShape.absarc(0, 0, R, 0, Math.PI, false);
    blockShape.closePath();

    const blockExtrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 2,
    };
    const blockGeo = new THREE.ExtrudeGeometry(blockShape, blockExtrudeSettings);
    blockGeo.rotateX(Math.PI / 2); // Lay flat on rotary platform
    blockGeo.center();

    const glassMat = createOpticalGlassMaterial(1.52);
    this.glassBlockMesh = new THREE.Mesh(blockGeo, glassMat);
    this.glassBlockMesh.position.set(0, 0.013, 0);
    this.rotaryPlatform.add(this.glassBlockMesh);

    // 4. Equilateral Triangular Prism (60-60-60 degrees)
    const prismShape = new THREE.Shape();
    const side = 0.036;
    const hPrism = (Math.sqrt(3) / 2) * side;
    prismShape.moveTo(-side / 2, -hPrism / 3);
    prismShape.lineTo(side / 2, -hPrism / 3);
    prismShape.lineTo(0, (2 * hPrism) / 3);
    prismShape.closePath();

    const prismExtrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 2,
    };
    const prismGeo = new THREE.ExtrudeGeometry(prismShape, prismExtrudeSettings);
    prismGeo.rotateX(Math.PI / 2);
    prismGeo.center();

    this.prismMesh = new THREE.Mesh(prismGeo, glassMat);
    this.prismMesh.position.set(0, 0.016, 0);
    this.prismMesh.visible = false;
    this.rotaryPlatform.add(this.prismMesh);
  }

  public setMode(mode: 'block' | 'prism'): void {
    this.currentMode = mode;
    this.glassBlockMesh.visible = mode === 'block';
    this.prismMesh.visible = mode === 'prism';
  }

  public setRotationAngleRad(rad: number): void {
    this.rotaryPlatform.rotation.y = rad;
  }
}

/**
 * 6. Multi-Modal 3D Light Visualizer
 * Renders:
 * - 3D Luminous laser beams (smooth cylindrical tubes with Fresnel glow)
 * - 3D Spherical wavefront phase ripples (coherent wave arcs expanding in space)
 * - 3D Propagating sinusoidal electric field vector (E) oscillations for polarization
 */
export class LightVisualizer {
  public readonly group = new THREE.Group();

  // Beam segments
  private beamMeshes: THREE.Mesh[] = [];
  private beamMat: THREE.MeshBasicMaterial;

  // Wavefront ripples (Interference / Diffraction)
  private wavefrontGroup = new THREE.Group();
  private wavefrontRings: THREE.Mesh[] = [];

  // Polarization E-field sinusoidal ribbon & vectors
  private eFieldGroup = new THREE.Group();
  private eFieldSineLine: THREE.Line;
  private eFieldArrows: THREE.LineSegments;

  constructor() {
    this.initMaterials();
    this.group.add(this.wavefrontGroup);
    this.group.add(this.eFieldGroup);
  }

  private initMaterials(): void {
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Update continuous light beam segment between two world positions.
   */
  public updateBeam(index: number, start: THREE.Vector3, end: THREE.Vector3, radius = 0.0022, colorHex = 0xff3b30): void {
    let mesh = this.beamMeshes[index];
    if (!mesh) {
      const geo = new THREE.CylinderGeometry(radius, radius, 1.0, 16);
      mesh = new THREE.Mesh(geo, this.beamMat.clone());
      this.beamMeshes[index] = mesh;
      this.group.add(mesh);
    }

    const dir = end.clone().sub(start);
    const length = dir.length();
    if (length < 1e-4) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);

    mesh.scale.set(1, length, 1);
    mesh.position.copy(start).addScaledVector(dir, 0.5);

    // Orient cylinder from Y-up along dir vector
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  public hideBeamsFrom(startIndex: number): void {
    for (let i = startIndex; i < this.beamMeshes.length; i++) {
      if (this.beamMeshes[i]) {
        this.beamMeshes[i].visible = false;
      }
    }
  }

  /**
   * Render 3D coherent spherical wave ripples expanding from slits towards the screen.
   */
  public updateWavefrontRipples(
    slitPos: THREE.Vector3,
    screenX: number,
    colorHex: number,
    timeSec: number,
    active = true
  ): void {
    if (!active) {
      this.wavefrontGroup.visible = false;
      return;
    }

    this.wavefrontGroup.visible = true;
    const ringCount = 10;
    const distanceToScreen = Math.max(0.05, screenX - slitPos.x);

    while (this.wavefrontRings.length < ringCount) {
      const ringGeo = new THREE.RingGeometry(0.01, 0.012, 32, 1, -Math.PI / 2.5, (Math.PI / 2.5) * 2);
      ringGeo.rotateY(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      this.wavefrontRings.push(ring);
      this.wavefrontGroup.add(ring);
    }

    for (let i = 0; i < ringCount; i++) {
      const ring = this.wavefrontRings[i];
      // Wave travel animation
      const phase = (timeSec * 0.8 + i / ringCount) % 1.0;
      const r = phase * distanceToScreen;

      ring.scale.set(r * 50, r * 50, r * 50);
      ring.position.copy(slitPos);
      const ringMat = ring.material as THREE.MeshBasicMaterial;
      ringMat.color.setHex(colorHex);
      ringMat.opacity = 0.45 * (1.0 - phase);
      ring.visible = r > 0.01 && r < distanceToScreen;
    }
  }

  /**
   * Render 3D sinusoidal Electric Field (E) vector vibration for polarization demonstration.
   * Visualizes unpolarized (random orientation) -> linearly polarized sine wave -> analyzer component E*cos(theta).
   */
  public updatePolarizationEField(
    laserPos: THREE.Vector3,
    polarizerPos: THREE.Vector3,
    analyzerPos: THREE.Vector3,
    screenPos: THREE.Vector3,
    polAngleRad: number,
    anaAngleRad: number,
    colorHex: number,
    timeSec: number
  ): void {
    this.eFieldGroup.visible = true;

    // Segment 2: Linearly polarized wave between Polarizer and Analyzer
    const startX = polarizerPos.x;
    const endX = analyzerPos.x;
    const len = Math.max(0.01, endX - startX);
    const samplePoints = 64;

    const points: THREE.Vector3[] = [];
    const spatialFreq = (Math.PI * 2 * 6) / len; // 6 wave periods
    const temporalOmega = 6.0;

    for (let i = 0; i <= samplePoints; i++) {
      const t = i / samplePoints;
      const x = startX + t * len;
      const wavePhase = (x - startX) * spatialFreq - timeSec * temporalOmega;
      const amplitude = 0.012 * Math.sin(wavePhase);

      // Transverse vibration in plane at polAngleRad
      const dy = amplitude * Math.cos(polAngleRad);
      const dz = amplitude * Math.sin(polAngleRad);

      points.push(new THREE.Vector3(x, polarizerPos.y + dy, polarizerPos.z + dz));
    }

    if (!this.eFieldSineLine) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      this.eFieldSineLine = new THREE.Line(lineGeo, lineMat);
      this.eFieldGroup.add(this.eFieldSineLine);
    } else {
      this.eFieldSineLine.geometry.dispose();
      this.eFieldSineLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      (this.eFieldSineLine.material as THREE.LineBasicMaterial).color.setHex(colorHex);
    }
  }

  public setWavefrontVisible(visible: boolean): void {
    this.wavefrontGroup.visible = visible;
  }

  public setEFieldVisible(visible: boolean): void {
    this.eFieldGroup.visible = visible;
  }

  public dispose(): void {
    this.beamMat?.dispose();
    this.beamMeshes.forEach((m) => m.geometry.dispose());
  }
}
