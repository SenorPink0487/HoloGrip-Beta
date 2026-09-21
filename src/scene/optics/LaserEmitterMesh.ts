import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export class LaserEmitterMesh {
  public readonly group = new THREE.Group();

  public wavelengthNm = 632.8;
  public beamOrigin = new THREE.Vector3();

  private ledLight: THREE.PointLight;
  private ledMesh: THREE.Mesh;
  private ledMat: THREE.MeshBasicMaterial;
  private warningTexture: THREE.CanvasTexture | null = null;
  public toggleSwitch: THREE.Mesh;
  public mainBarrel: THREE.Mesh;
  public isOn = true;

  constructor(wavelength = 632.8) {
    this.wavelengthNm = wavelength;
    this.group.name = 'LaserEmitterMesh';
    this.group.userData = { isLaserBarrel: true, laser: this };
    this.createLaserAssembly();
    this.updateWavelength(wavelength);
  }

  private createWarningLabel(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Yellow hazard background
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ DANGER ▲', 128, 36);

    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.fillText('LASER RADIATION', 128, 64);

    ctx.font = '12px monospace';
    ctx.fillText('CLASS 3B · CW 50mW', 128, 90);
    ctx.fillText('COLLIMATED APERTURE', 128, 110);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.warningTexture = tex;
    return tex;
  }

  private createLaserAssembly(): void {
    // High-texture satin clear-anodized aluminum (银白喷砂航空铝)
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2eaf2,
      metalness: 0.75,
      roughness: 0.25,
    });

    // Polished stainless steel / chrome (拉丝镜面不锈钢)
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.90,
      roughness: 0.16,
    });

    // Knurled titanium accent (质感轻钛灰滚花)
    const knurledMat = new THREE.MeshStandardMaterial({
      color: 0xc4cfdc,
      metalness: 0.82,
      roughness: 0.22,
    });

    // Anti-reflection aperture recess
    const darkApertureMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.40,
      roughness: 0.50,
    });

    // 1. Vertical mounting post (Ø12mm stainless steel)
    const postHeight = 0.14;
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, postHeight, 24);
    const post = new THREE.Mesh(postGeo, stainlessMat);
    post.position.y = postHeight * 0.5;
    post.castShadow = true;
    post.userData = { isLaserBarrel: true, laser: this };
    this.group.add(post);

    // 2. Kinematic gimbal mounting bracket on top of post
    const gimbalGeo = new THREE.BoxGeometry(0.038, 0.032, 0.046);
    const gimbal = new THREE.Mesh(gimbalGeo, satinSilverMat);
    gimbal.position.y = postHeight + 0.016;
    gimbal.castShadow = true;
    gimbal.userData = { isLaserBarrel: true, laser: this };
    this.group.add(gimbal);

    // Kinematic adjustment thumbscrews for pitch and yaw fine alignment
    const screwGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.014, 16);
    const screw1 = new THREE.Mesh(screwGeo, knurledMat);
    screw1.rotation.x = Math.PI * 0.5;
    screw1.position.set(-0.012, postHeight + 0.016, -0.028);
    this.group.add(screw1);

    const screw2 = new THREE.Mesh(screwGeo, knurledMat);
    screw2.rotation.z = Math.PI * 0.5;
    screw2.position.set(0.024, postHeight + 0.016, -0.012);
    this.group.add(screw2);

    // 3. Precision Laser Barrel Assembly (centered at optical axis: y = postHeight + 0.052)
    const barrelY = postHeight + 0.052;
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, barrelY, 0);

    // Main cylindrical housing (Ø40mm, length 140mm along Z) in satin silver
    const mainBarrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.14, 36);
    const mainBarrel = new THREE.Mesh(mainBarrelGeo, satinSilverMat);
    mainBarrel.rotation.x = Math.PI * 0.5;
    mainBarrel.castShadow = true;
    mainBarrel.name = 'LaserBarrel';
    mainBarrel.userData = { isLaserBarrel: true, laser: this };
    this.mainBarrel = mainBarrel;
    barrelGroup.add(mainBarrel);

    // Machined accent rings (fine recessed grooves)
    for (let i = -1; i <= 1; i++) {
      const ringGeo = new THREE.CylinderGeometry(0.0203, 0.0203, 0.003, 36);
      const ring = new THREE.Mesh(ringGeo, knurledMat);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.z = i * 0.025 - 0.01;
      barrelGroup.add(ring);
    }

    // Front Knurled Focus Ring (Ø41mm, length 20mm) in knurled titanium
    const focusRingGeo = new THREE.CylinderGeometry(0.0205, 0.0205, 0.020, 36);
    const focusRing = new THREE.Mesh(focusRingGeo, knurledMat);
    focusRing.rotation.x = Math.PI * 0.5;
    focusRing.position.z = 0.075;
    barrelGroup.add(focusRing);

    // Front Collimator Nose Cone in satin silver
    const noseGeo = new THREE.CylinderGeometry(0.015, 0.0198, 0.024, 36);
    const nose = new THREE.Mesh(noseGeo, satinSilverMat);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.z = 0.097;
    barrelGroup.add(nose);

    // Precision Stainless Steel Aperture Bezel
    const bezelGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.005, 32);
    const bezel = new THREE.Mesh(bezelGeo, stainlessMat);
    bezel.rotation.x = Math.PI * 0.5;
    bezel.position.z = 0.111;
    barrelGroup.add(bezel);

    // Recessed dark aperture face with central pinhole
    const faceGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 32);
    const face = new THREE.Mesh(faceGeo, darkApertureMat);
    face.rotation.x = Math.PI * 0.5;
    face.position.z = 0.115;
    barrelGroup.add(face);

    // Optical exit aperture hole
    const holeGeo = new THREE.CircleGeometry(0.0035, 24);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.z = 0.1221;
    barrelGroup.add(hole);

    // Global beam origin coordinates
    this.beamOrigin.set(0, barrelY, 0.123);

    // Rear End Cap Assembly
    const rearCapGeo = new THREE.CylinderGeometry(0.0202, 0.0202, 0.016, 36);
    const rearCap = new THREE.Mesh(rearCapGeo, satinSilverMat);
    rearCap.rotation.x = Math.PI * 0.5;
    rearCap.position.z = -0.078;
    rearCap.userData = { isLaserSwitch: true, laser: this };
    barrelGroup.add(rearCap);

    // Metal toggle switch in polished chrome
    const toggleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.005, 16), stainlessMat);
    toggleBase.rotation.x = Math.PI * 0.5;
    toggleBase.position.set(-0.008, 0, -0.088);
    toggleBase.userData = { isLaserSwitch: true, laser: this };
    barrelGroup.add(toggleBase);

    const toggleLever = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 0.012, 16), stainlessMat);
    toggleLever.position.set(-0.008, 0.004, -0.093);
    toggleLever.rotation.x = 0.4;
    toggleLever.name = 'LaserSwitch';
    toggleLever.userData = { isLaserSwitch: true, laser: this };
    this.toggleSwitch = toggleLever;
    barrelGroup.add(toggleLever);

    // Wavelength Status Indicator LED
    const ledGeo = new THREE.SphereGeometry(0.0035, 16, 16);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.ledMesh = new THREE.Mesh(ledGeo, this.ledMat);
    this.ledMesh.position.set(0.008, 0, -0.087);
    barrelGroup.add(this.ledMesh);

    this.ledLight = new THREE.PointLight(0xff0000, 0.4, 0.25);
    this.ledLight.position.set(0.008, 0, -0.092);
    barrelGroup.add(this.ledLight);

    // Hazard Warning Label on top side of barrel
    const warnTex = this.createWarningLabel();
    const labelGeo = new THREE.PlaneGeometry(0.038, 0.019);
    const labelMat = new THREE.MeshBasicMaterial({ map: warnTex, side: THREE.DoubleSide });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 0.0202, 0.018);
    label.rotation.x = -Math.PI * 0.5;
    barrelGroup.add(label);

    this.group.add(barrelGroup);
  }

  public updateWavelength(wavelengthNm: number): void {
    this.wavelengthNm = wavelengthNm;
    const color = OpticalPhysics.wavelengthToColor(wavelengthNm);
    this.ledMat.color.copy(color);
    this.ledLight.color.copy(color);
  }

  public setPower(on: boolean): void {
    this.isOn = on;
    this.ledLight.intensity = on ? 0.4 : 0.0;
    this.toggleSwitch.rotation.x = on ? 0.4 : -0.4;
  }

  public togglePower(): boolean {
    this.setPower(!this.isOn);
    return this.isOn;
  }

  public cycleWavelength(): number {
    const list = [632.8, 532.0, 405.0, 589.0];
    const idx = list.indexOf(this.wavelengthNm);
    const next = idx >= 0 ? list[(idx + 1) % list.length] : 632.8;
    this.updateWavelength(next);
    return next;
  }

  public dispose(): void {
    if (this.warningTexture) {
      this.warningTexture.dispose();
      this.warningTexture = null;
    }
  }
}
