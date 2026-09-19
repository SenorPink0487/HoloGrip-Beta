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
  private toggleSwitch: THREE.Mesh;
  public isOn = true;

  constructor(wavelength = 632.8) {
    this.wavelengthNm = wavelength;
    this.group.name = 'LaserEmitterMesh';
    this.createLaserAssembly();
    this.updateWavelength(wavelength);
  }

  private createWarningLabel(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Yellow hazard background
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Hazard symbol: Sunburst star
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ DANGER ▲', 128, 38);

    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.fillText('LASER RADIATION', 128, 68);

    ctx.font = '12px monospace';
    ctx.fillText('CLASS 3B · MAX 50mW', 128, 92);
    ctx.fillText('AVOID DIRECT EXPOSURE', 128, 110);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.warningTexture = tex;
    return tex;
  }

  private createLaserAssembly(): void {
    const darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      metalness: 0.9,
      roughness: 0.28,
    });

    const brushedSilverMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e2,
      metalness: 0.95,
      roughness: 0.2,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.22,
    });

    // 1. Vertical mounting post (Ø12mm stainless steel)
    const postHeight = 0.14;
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, postHeight, 24);
    const post = new THREE.Mesh(postGeo, brushedSilverMat);
    post.position.y = postHeight * 0.5;
    post.castShadow = true;
    this.group.add(post);

    // 2. Kinematic gimbal mounting block on top of post
    const gimbalGeo = new THREE.BoxGeometry(0.038, 0.032, 0.046);
    const gimbal = new THREE.Mesh(gimbalGeo, darkAnodizedMat);
    gimbal.position.y = postHeight + 0.016;
    gimbal.castShadow = true;
    this.group.add(gimbal);

    // Gimbal brass micrometer screws for pitch and yaw fine tuning
    const screw1 = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.014, 16), brassMat);
    screw1.rotation.x = Math.PI * 0.5;
    screw1.position.set(-0.012, postHeight + 0.016, -0.028);
    this.group.add(screw1);

    const screw2 = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.014, 16), brassMat);
    screw2.rotation.z = Math.PI * 0.5;
    screw2.position.set(0.024, postHeight + 0.016, -0.012);
    this.group.add(screw2);

    // 3. Laser Barrel Assembly (centered at optical axis: y = postHeight + 0.052)
    const barrelY = postHeight + 0.052;
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, barrelY, 0);

    // Main cylindrical housing (Ø40mm, length 160mm along Z)
    const mainBarrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 32);
    const mainBarrel = new THREE.Mesh(mainBarrelGeo, darkAnodizedMat);
    mainBarrel.rotation.x = Math.PI * 0.5;
    mainBarrel.castShadow = true;
    barrelGroup.add(mainBarrel);

    // Lathed heat-sink cooling fins (6 radial grooves)
    for (let i = -2; i <= 2; i++) {
      const finGeo = new THREE.TorusGeometry(0.0215, 0.002, 12, 32);
      const fin = new THREE.Mesh(finGeo, brushedSilverMat);
      fin.position.z = i * 0.016;
      barrelGroup.add(fin);
    }

    // Front collimator lens collar
    const collarGeo = new THREE.CylinderGeometry(0.017, 0.02, 0.032, 32);
    const collar = new THREE.Mesh(collarGeo, brushedSilverMat);
    collar.rotation.x = Math.PI * 0.5;
    collar.position.z = 0.09;
    barrelGroup.add(collar);

    // Front brass beam aperture nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.008, 0.012, 0.016, 24);
    const nozzle = new THREE.Mesh(nozzleGeo, brassMat);
    nozzle.rotation.x = Math.PI * 0.5;
    nozzle.position.z = 0.114;
    barrelGroup.add(nozzle);

    // Optical exit aperture hole
    const holeGeo = new THREE.CircleGeometry(0.0035, 24);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.z = 0.1221;
    barrelGroup.add(hole);

    // Global beam origin coordinates
    this.beamOrigin.set(0, barrelY, 0.123);

    // Rear end cap with power switch and LED
    const rearCapGeo = new THREE.CylinderGeometry(0.0205, 0.0205, 0.018, 32);
    const rearCap = new THREE.Mesh(rearCapGeo, brushedSilverMat);
    rearCap.rotation.x = Math.PI * 0.5;
    rearCap.position.z = -0.082;
    barrelGroup.add(rearCap);

    // Metal toggle switch
    const toggleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.005, 16), brassMat);
    toggleBase.rotation.x = Math.PI * 0.5;
    toggleBase.position.set(-0.008, 0, -0.093);
    barrelGroup.add(toggleBase);

    const toggleLever = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 0.012, 16), brushedSilverMat);
    toggleLever.position.set(-0.008, 0.004, -0.098);
    toggleLever.rotation.x = 0.4;
    this.toggleSwitch = toggleLever;
    barrelGroup.add(toggleLever);

    // Wavelength Status Indicator LED
    const ledGeo = new THREE.SphereGeometry(0.004, 16, 16);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.ledMesh = new THREE.Mesh(ledGeo, this.ledMat);
    this.ledMesh.position.set(0.008, 0, -0.093);
    barrelGroup.add(this.ledMesh);

    this.ledLight = new THREE.PointLight(0xff0000, 0.4, 0.25);
    this.ledLight.position.set(0.008, 0, -0.098);
    barrelGroup.add(this.ledLight);

    // Hazard Warning Label on top side of barrel
    const warnTex = this.createWarningLabel();
    const labelGeo = new THREE.PlaneGeometry(0.038, 0.02);
    const labelMat = new THREE.MeshBasicMaterial({ map: warnTex, side: THREE.DoubleSide });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 0.0202, 0.035);
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

  public dispose(): void {
    if (this.warningTexture) {
      this.warningTexture.dispose();
      this.warningTexture = null;
    }
  }
}
