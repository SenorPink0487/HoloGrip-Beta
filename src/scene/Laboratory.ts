import * as THREE from 'three';
import { TextureGenerator } from './Textures';

export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;

  constructor() {
    this.materials = {
      wallWhite: new THREE.MeshStandardMaterial({
        color: 0xfbfcfe,
        roughness: 0.16,
        metalness: 0.02,
        emissive: 0x1e2734,
        side: THREE.DoubleSide,
      }),
      wallTrim: new THREE.MeshStandardMaterial({
        color: 0xe2ebf4,
        roughness: 0.20,
        metalness: 0.15,
        emissive: 0x18202c,
        side: THREE.DoubleSide,
      }),
      darkAccent: new THREE.MeshStandardMaterial({
        color: 0x161e28,
        roughness: 0.40,
        metalness: 0.30,
        side: THREE.DoubleSide,
      }),
      coveLight: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      }),
      cyanLight: new THREE.MeshBasicMaterial({
        color: 0x00e6f6,
        side: THREE.DoubleSide,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: 0x82a8c8,
        transparent: true,
        opacity: 0.10,
        roughness: 0.04,
        metalness: 0.85,
        side: THREE.DoubleSide,
      }),
      partitionGlass: new THREE.MeshStandardMaterial({
        color: 0x88c4e8,
        transparent: true,
        opacity: 0.22,
        roughness: 0.06,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
      ceilingWhite: new THREE.MeshStandardMaterial({
        color: 0xfdfefe,
        roughness: 0.18,
        metalness: 0.01,
        emissive: 0x526070,
        side: THREE.DoubleSide,
      }),
      ceilingTrim: new THREE.MeshStandardMaterial({
        color: 0xeef4fa,
        roughness: 0.22,
        metalness: 0.06,
        emissive: 0x465464,
        side: THREE.DoubleSide,
      }),
      ceilingGroove: new THREE.MeshBasicMaterial({
        color: 0x889aa8,
        side: THREE.DoubleSide,
      }),
    };

    this.createFloor();
    this.createBaseboardCoveLight();
    this.createCeiling();
    this.createRoomWallsAndWindow();
    this.createCitySkyline();
    this.createLeftWallPartition();
    this.createRightWallArchitecture();
    this.createRearWallArchitecture();
  }

  private createFloor(): void {
    const floorGeo = new THREE.CircleGeometry(this.roomRadius, 128);
    const floorTex = TextureGenerator.createFloorTexture();
    const roughnessMap = TextureGenerator.createFloorRoughnessMap();
    const bumpMap = TextureGenerator.createFloorBumpMap();

    floorTex.anisotropy = 16;
    roughnessMap.anisotropy = 16;
    bumpMap.anisotropy = 16;

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: roughnessMap,
      bumpMap: bumpMap,
      bumpScale: 0.0012,
      roughness: 0.18,
      metalness: 0.10,
      envMapIntensity: 1.15,
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private createCeiling(): void {
    const ceilingGroup = new THREE.Group();
    const r = this.roomRadius; // 8.2m

    // -------------------------------------------------------------
    // Tier 1: Outer Perimeter Soffit & Cove Light (r = 5.8m ~ 8.2m, y = 4.02m)
    // -------------------------------------------------------------
    // Continuous glowing perimeter cove light ribbon washing upper wall & window header
    const perimCoveGeo = new THREE.CylinderGeometry(8.12, 8.16, 0.10, 96, 1, true);
    const perimCove = new THREE.Mesh(perimCoveGeo, this.materials.coveLight);
    perimCove.position.y = 3.97;
    ceilingGroup.add(perimCove);

    const perimTrimGeo = new THREE.CylinderGeometry(8.12, 8.12, 0.02, 96, 1, true);
    const perimTrim = new THREE.Mesh(perimTrimGeo, this.materials.ceilingTrim);
    perimTrim.position.y = 4.02;
    ceilingGroup.add(perimTrim);

    // Outer flat ceiling ring
    const outerCeilingGeo = new THREE.RingGeometry(5.8, r, 96);
    const outerCeiling = new THREE.Mesh(outerCeilingGeo, this.materials.ceilingWhite);
    outerCeiling.rotation.x = Math.PI / 2;
    outerCeiling.position.y = 4.02;
    ceilingGroup.add(outerCeiling);

    // -------------------------------------------------------------
    // Tier 2: Main Halo Light Cove & Middle Coffer (r = 3.8m ~ 5.8m, y = 4.24m)
    // -------------------------------------------------------------
    // Beveled architectural coffer riser transitioning from y = 4.02 to 4.24
    const riser1Geo = new THREE.CylinderGeometry(5.66, 5.80, 0.22, 96, 1, true);
    const riser1 = new THREE.Mesh(riser1Geo, this.materials.ceilingTrim);
    riser1.position.y = 4.13;
    ceilingGroup.add(riser1);

    // Main halo continuous cove light (beveled glowing band facing downward-inward)
    const halo1Geo = new THREE.CylinderGeometry(5.68, 5.78, 0.16, 96, 1, true);
    const halo1 = new THREE.Mesh(halo1Geo, this.materials.coveLight);
    halo1.position.y = 4.12;
    ceilingGroup.add(halo1);

    // Middle coffer flat ceiling ring
    const midCeilingGeo = new THREE.RingGeometry(3.8, 5.66, 96);
    const midCeiling = new THREE.Mesh(midCeilingGeo, this.materials.ceilingWhite);
    midCeiling.rotation.x = Math.PI / 2;
    midCeiling.position.y = 4.24;
    ceilingGroup.add(midCeiling);

    // Crisp hairline concentric seam reveal at r = 4.75m
    const reveal1Geo = new THREE.RingGeometry(4.745, 4.755, 96);
    const reveal1 = new THREE.Mesh(reveal1Geo, this.materials.ceilingGroove);
    reveal1.rotation.x = Math.PI / 2;
    reveal1.position.y = 4.238;
    ceilingGroup.add(reveal1);

    // -------------------------------------------------------------
    // Tier 3: Secondary Halo Light Cove & Inner Coffer (r = 2.4m ~ 3.8m, y = 4.42m)
    // -------------------------------------------------------------
    // Secondary beveled coffer riser transitioning from y = 4.24 to 4.42
    const riser2Geo = new THREE.CylinderGeometry(3.68, 3.80, 0.18, 96, 1, true);
    const riser2 = new THREE.Mesh(riser2Geo, this.materials.ceilingTrim);
    riser2.position.y = 4.33;
    ceilingGroup.add(riser2);

    // Secondary halo continuous cove light
    const halo2Geo = new THREE.CylinderGeometry(3.70, 3.78, 0.13, 96, 1, true);
    const halo2 = new THREE.Mesh(halo2Geo, this.materials.coveLight);
    halo2.position.y = 4.32;
    ceilingGroup.add(halo2);

    // Inner coffer flat ceiling ring
    const innerCeilingGeo = new THREE.RingGeometry(2.38, 3.68, 96);
    const innerCeiling = new THREE.Mesh(innerCeilingGeo, this.materials.ceilingWhite);
    innerCeiling.rotation.x = Math.PI / 2;
    innerCeiling.position.y = 4.42;
    ceilingGroup.add(innerCeiling);

    // Crisp hairline concentric seam reveal at r = 3.0m
    const reveal2Geo = new THREE.RingGeometry(2.995, 3.005, 96);
    const reveal2 = new THREE.Mesh(reveal2Geo, this.materials.ceilingGroove);
    reveal2.rotation.x = Math.PI / 2;
    reveal2.position.y = 4.418;
    ceilingGroup.add(reveal2);

    // -------------------------------------------------------------
    // Tier 4: Central Recessed Dome & Center Micro-Ring (r = 0 ~ 2.4m, y = 4.42m ~ 4.54m)
    // -------------------------------------------------------------
    // Riser to dome base
    const domeRiserGeo = new THREE.CylinderGeometry(2.34, 2.38, 0.08, 96, 1, true);
    const domeRiser = new THREE.Mesh(domeRiserGeo, this.materials.ceilingTrim);
    domeRiser.position.y = 4.46;
    ceilingGroup.add(domeRiser);

    // Dome base micro-cove glow
    const domeCoveGeo = new THREE.CylinderGeometry(2.33, 2.37, 0.05, 96, 1, true);
    const domeCove = new THREE.Mesh(domeCoveGeo, this.materials.coveLight);
    domeCove.position.y = 4.45;
    ceilingGroup.add(domeCove);

    // Smooth parabolic concave dome (r = 0.42 to 2.34)
    const domeProfilePoints: THREE.Vector2[] = [];
    const domeSteps = 20;
    for (let i = 0; i <= domeSteps; i++) {
      const u = i / domeSteps;
      const curR = 0.42 + (2.34 - 0.42) * u;
      // Parabolic curvature rising towards center
      const curY = 4.54 - 0.08 * (u * u);
      domeProfilePoints.push(new THREE.Vector2(curR, curY));
    }
    const domeGeo = new THREE.LatheGeometry(domeProfilePoints, 96);
    const domeMesh = new THREE.Mesh(domeGeo, this.materials.ceilingWhite);
    ceilingGroup.add(domeMesh);

    // Center focal micro-cove ring echoing holographic projector below
    const centerMicroRingGeo = new THREE.RingGeometry(0.38, 0.44, 64);
    const centerMicroRing = new THREE.Mesh(centerMicroRingGeo, this.materials.coveLight);
    centerMicroRing.rotation.x = Math.PI / 2;
    centerMicroRing.position.y = 4.536;
    ceilingGroup.add(centerMicroRing);

    // Center focal circular plate
    const centerPlateGeo = new THREE.CircleGeometry(0.38, 64);
    const centerPlate = new THREE.Mesh(centerPlateGeo, this.materials.ceilingWhite);
    centerPlate.rotation.x = Math.PI / 2;
    centerPlate.position.y = 4.538;
    ceilingGroup.add(centerPlate);

    this.group.add(ceilingGroup);
  }

  private createBaseboardCoveLight(): void {
    const r = this.roomRadius;
    const baseboardGroup = new THREE.Group();

    // 1. Soft architectural plinth along floor edge (tone-on-tone)
    const plinthGeo = new THREE.CylinderGeometry(r - 0.015, r - 0.015, 0.025, 96, 1, true);
    const plinth = new THREE.Mesh(plinthGeo, this.materials.wallTrim);
    plinth.position.y = 0.0125;
    baseboardGroup.add(plinth);

    // 2. Bold, continuous glowing white baseboard cove light ribbon
    const coveGeo = new THREE.CylinderGeometry(r - 0.025, r - 0.025, 0.08, 96, 1, true);
    const cove = new THREE.Mesh(coveGeo, this.materials.coveLight);
    cove.position.y = 0.065;
    baseboardGroup.add(cove);

    // 3. Crisp architectural top trim lip
    const trimGeo = new THREE.CylinderGeometry(r - 0.018, r - 0.018, 0.025, 96, 1, true);
    const trim = new THREE.Mesh(trimGeo, this.materials.wallTrim);
    trim.position.y = 0.1175;
    baseboardGroup.add(trim);

    this.group.add(baseboardGroup);
  }

  private createStadiumCurve(
    r: number,
    phiCenter: number,
    halfSpan: number,
    sillY: number,
    lintelY: number,
    cornerR: number
  ): THREE.CatmullRomCurve3 {
    const dPhiCorner = cornerR / r;
    const phiMin = phiCenter - halfSpan;
    const phiMax = phiCenter + halfSpan;
    const yMin = sillY;
    const yMax = lintelY;

    const phiTL = phiMin + dPhiCorner;
    const yTL = yMax - cornerR;

    const phiTR = phiMax - dPhiCorner;
    const yTR = yMax - cornerR;

    const phiBR = phiMax - dPhiCorner;
    const yBR = yMin + cornerR;

    const phiBL = phiMin + dPhiCorner;
    const yBL = yMin + cornerR;

    const points: THREE.Vector3[] = [];

    // 1. Top horizontal straight segment: from phiTL to phiTR at yMax
    const topSteps = 16;
    for (let i = 0; i <= topSteps; i++) {
      const u = i / topSteps;
      const phi = phiTL + u * (phiTR - phiTL);
      points.push(new THREE.Vector3(Math.sin(phi) * r, yMax, Math.cos(phi) * r));
    }

    // 2. Top-Right fillet: angle alpha from PI/2 down to 0
    const cornerSteps = 14;
    for (let i = 1; i <= cornerSteps; i++) {
      const alpha = Math.PI / 2 - (i / cornerSteps) * (Math.PI / 2);
      const phi = phiTR + dPhiCorner * Math.cos(alpha);
      const y = yTR + cornerR * Math.sin(alpha);
      points.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r));
    }

    // 3. Right vertical straight segment: from yTR down to yBR at phiMax
    const sideSteps = 16;
    for (let i = 1; i <= sideSteps; i++) {
      const u = i / sideSteps;
      const y = yTR - u * (yTR - yBR);
      points.push(new THREE.Vector3(Math.sin(phiMax) * r, y, Math.cos(phiMax) * r));
    }

    // 4. Bottom-Right fillet: angle alpha from 0 down to -PI/2
    for (let i = 1; i <= cornerSteps; i++) {
      const alpha = -(i / cornerSteps) * (Math.PI / 2);
      const phi = phiBR + dPhiCorner * Math.cos(alpha);
      const y = yBR + cornerR * Math.sin(alpha);
      points.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r));
    }

    // 5. Bottom horizontal straight segment: from phiBR down to phiBL at yMin
    for (let i = 1; i <= topSteps; i++) {
      const u = i / topSteps;
      const phi = phiBR - u * (phiBR - phiBL);
      points.push(new THREE.Vector3(Math.sin(phi) * r, yMin, Math.cos(phi) * r));
    }

    // 6. Bottom-Left fillet: angle alpha from -PI/2 down to -PI
    for (let i = 1; i <= cornerSteps; i++) {
      const alpha = -Math.PI / 2 - (i / cornerSteps) * (Math.PI / 2);
      const phi = phiBL + dPhiCorner * Math.cos(alpha);
      const y = yBL + cornerR * Math.sin(alpha);
      points.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r));
    }

    // 7. Left vertical straight segment: from yBL up to yTL at phiMin
    for (let i = 1; i <= sideSteps; i++) {
      const u = i / sideSteps;
      const y = yBL + u * (yTL - yBL);
      points.push(new THREE.Vector3(Math.sin(phiMin) * r, y, Math.cos(phiMin) * r));
    }

    // 8. Top-Left fillet: angle alpha from PI down to PI/2
    for (let i = 1; i < cornerSteps; i++) {
      const alpha = Math.PI - (i / cornerSteps) * (Math.PI / 2);
      const phi = phiTL + dPhiCorner * Math.cos(alpha);
      const y = yTL + cornerR * Math.sin(alpha);
      points.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r));
    }

    return new THREE.CatmullRomCurve3(points, true);
  }

  private createRoomWallsAndWindow(): void {
    const r = this.roomRadius;
    const windowCenter = Math.PI;
    // Expansive widescreen panoramic field matching target reference image
    const windowHalfSpan = 0.82;
    const windowStart = windowCenter - windowHalfSpan;
    const windowLen = windowHalfSpan * 2;

    const sillY = 0.74;
    const lintelY = 3.68;
    const jambH = lintelY - sillY;
    const cornerR = 0.92;
    const dPhiCorner = cornerR / r;

    // 1. Lower Curved White Wall below Window (overlaps 0.04m behind sill tube)
    const lowerH = sillY + 0.04;
    const lowerWallGeo = new THREE.CylinderGeometry(r, r, lowerH, 96, 1, true, windowStart - 0.03, windowLen + 0.06);
    const lowerWall = new THREE.Mesh(lowerWallGeo, this.materials.wallWhite);
    lowerWall.position.y = lowerH / 2;
    lowerWall.receiveShadow = true;
    this.group.add(lowerWall);

    // 2. Upper Curved White Wall above Window (overlaps 0.04m behind lintel tube)
    const upperWallH = 4.0 - (lintelY - 0.04);
    const upperWallGeo = new THREE.CylinderGeometry(r, r, upperWallH, 96, 1, true, windowStart - 0.03, windowLen + 0.06);
    const upperWall = new THREE.Mesh(upperWallGeo, this.materials.wallWhite);
    upperWall.position.y = (lintelY - 0.04) + upperWallH / 2;
    this.group.add(upperWall);

    // 3. Precise Corner Spandrel Fillers (fill behind rounded corners with exact triangles)
    const phiTL = windowStart + dPhiCorner;
    const yTL = lintelY - cornerR;
    const phiTR = windowCenter + windowHalfSpan - dPhiCorner;
    const yTR = lintelY - cornerR;
    const phiBL = windowStart + dPhiCorner;
    const yBL = sillY + cornerR;
    const phiBR = windowCenter + windowHalfSpan - dPhiCorner;
    const yBR = sillY + cornerR;

    const createCornerPatch = (phiCorner: number, yCorner: number, phiTang: number, yTang: number) => {
      const geo = new THREE.BufferGeometry();
      const p1 = new THREE.Vector3(Math.sin(phiCorner) * r, yCorner, Math.cos(phiCorner) * r);
      const p2 = new THREE.Vector3(Math.sin(phiTang) * r, yCorner, Math.cos(phiTang) * r);
      const p3 = new THREE.Vector3(Math.sin(phiCorner) * r, yTang, Math.cos(phiCorner) * r);

      const positions = new Float32Array([
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z,
        p3.x, p3.y, p3.z,
        // Double-sided triangle vertices
        p1.x, p1.y, p1.z,
        p3.x, p3.y, p3.z,
        p2.x, p2.y, p2.z,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, this.materials.wallWhite);
      this.group.add(mesh);
    };

    createCornerPatch(windowStart, lintelY, phiTL, yTL);
    createCornerPatch(windowCenter + windowHalfSpan, lintelY, phiTR, yTR);
    createCornerPatch(windowStart, sillY, phiBL, yBL);
    createCornerPatch(windowCenter + windowHalfSpan, sillY, phiBR, yBR);

    // 4. Iconic Grand Stadium Capsule Tube Frame & Continuous Inner Cove Light
    const frameCurve = this.createStadiumCurve(r - 0.05, windowCenter, windowHalfSpan, sillY, lintelY, cornerR);
    const outerFrameGeo = new THREE.TubeGeometry(frameCurve, 200, 0.09, 16, true);
    const outerFrame = new THREE.Mesh(outerFrameGeo, this.materials.wallWhite);
    this.group.add(outerFrame);

    const coveCurve = this.createStadiumCurve(r - 0.035, windowCenter, windowHalfSpan, sillY, lintelY, cornerR);
    const coveLightGeo = new THREE.TubeGeometry(coveCurve, 200, 0.040, 12, true);
    const coveLight = new THREE.Mesh(coveLightGeo, this.materials.coveLight);
    this.group.add(coveLight);

    // 5. Panoramic Window Glass
    const glassGeo = new THREE.CylinderGeometry(r, r, jambH, 96, 1, true, windowStart, windowLen);
    const glass = new THREE.Mesh(glassGeo, this.materials.windowGlass);
    glass.position.y = sillY + jambH / 2;
    this.group.add(glass);

    // 6. Vertical Architectural Division Mullion separating Adjoining Lab Wing from Outdoor Window
    // Exactly matches the cleanroom division mullion seen in target_reference.jpg at phi = PI + 0.35
    const divAngle = Math.PI + 0.35;
    const divMullionGeo = new THREE.CylinderGeometry(0.045, 0.045, jambH, 16);
    const divMullion = new THREE.Mesh(divMullionGeo, this.materials.wallWhite);
    divMullion.position.set(Math.sin(divAngle) * (r - 0.04), sillY + jambH / 2, Math.cos(divAngle) * (r - 0.04));
    this.group.add(divMullion);

    // 7. Rear Curved Wall
    const rearStart = Math.PI * 1.55;
    const rearLen = Math.PI * 2 + Math.PI * 0.40 - rearStart;
    const rearWallGeo = new THREE.CylinderGeometry(r, r, 4.0, 64, 1, true, rearStart, rearLen);
    const rearWall = new THREE.Mesh(rearWallGeo, this.materials.wallWhite);
    rearWall.position.y = 2.0;
    rearWall.receiveShadow = true;
    this.group.add(rearWall);
  }

  private createCitySkyline(): void {
    const skylineGroup = new THREE.Group();

    // 1. Deep Midnight Black Night Sky Backdrop
    const skyGeo = new THREE.CylinderGeometry(48, 48, 36, 48, 1, true, Math.PI - 0.95, 1.90);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x010204, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.y = 8;
    skylineGroup.add(sky);

    // 2. Atmospheric City Smog / Horizon Glow
    const horizonGeo = new THREE.CylinderGeometry(44, 44, 1.2, 48, 1, true, Math.PI - 0.90, 1.80);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0x050f1b,
      transparent: true,
      opacity: 0.70,
      side: THREE.DoubleSide,
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    horizon.position.y = 0.72;
    skylineGroup.add(horizon);

    // 3. Elevated Transit Line Amber Glow along the horizon (subtle atmospheric streak)
    const transitGeo = new THREE.CylinderGeometry(42, 42, 0.06, 48, 1, true, Math.PI - 0.85, 1.70);
    const transitMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const transit = new THREE.Mesh(transitGeo, transitMat);
    transit.position.y = 0.62;
    skylineGroup.add(transit);

    // 4. Distant City Skyscrapers sitting on the lower horizon (matching target reference image)
    const facadeTex = TextureGenerator.createBuildingFacadeTexture();
    facadeTex.repeat.set(1, 2);
    const buildingMat = new THREE.MeshBasicMaterial({ map: facadeTex });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x060910, roughness: 0.8, metalness: 0.2 });
    const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const beaconCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x303a48, metalness: 0.8, roughness: 0.2 });

    // Sunk base: -6.0m. Heights: 7.2m to 8.4m, so tops sit at 1.2m to 2.4m, leaving open night sky above!
    const buildingDefs = [
      { angle: Math.PI - 0.54, dist: 42, w: 1.8, d: 1.8, h: 7.6, spire: true, spireColor: 'cyan', spireH: 1.2 },
      { angle: Math.PI - 0.40, dist: 36, w: 1.5, d: 1.5, h: 8.2, spire: true, spireColor: 'red', spireH: 1.4 },
      { angle: Math.PI - 0.24, dist: 46, w: 2.4, d: 2.2, h: 8.8, spire: true, spireColor: 'cyan', spireH: 1.8 },
      { angle: Math.PI - 0.10, dist: 38, w: 1.6, d: 1.6, h: 7.4, spire: false, spireColor: '', spireH: 0 },
      { angle: Math.PI + 0.06, dist: 44, w: 2.0, d: 1.8, h: 8.5, spire: true, spireColor: 'red', spireH: 1.5 },
      { angle: Math.PI + 0.18, dist: 34, w: 1.4, d: 1.4, h: 7.2, spire: false, spireColor: '', spireH: 0 },
      { angle: Math.PI + 0.28, dist: 40, w: 1.8, d: 1.6, h: 8.0, spire: true, spireColor: 'cyan', spireH: 1.3 },
    ];

    const baseY = -6.0;

    for (const b of buildingDefs) {
      const bx = Math.sin(b.angle) * b.dist;
      const bz = Math.cos(b.angle) * b.dist;
      const by = baseY + b.h / 2;

      const buildingGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
      buildingMesh.position.set(bx, by, bz);
      buildingMesh.rotation.y = b.angle + Math.PI;
      skylineGroup.add(buildingMesh);

      // Roof cap
      const roofGeo = new THREE.BoxGeometry(b.w * 1.05, 0.15, b.d * 1.05);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(bx, baseY + b.h + 0.075, bz);
      roofMesh.rotation.y = b.angle + Math.PI;
      skylineGroup.add(roofMesh);

      if (b.spire) {
        const spireGeo = new THREE.CylinderGeometry(0.03, 0.06, b.spireH, 8);
        const spireMesh = new THREE.Mesh(spireGeo, spireMat);
        const spireY = baseY + b.h + 0.15 + b.spireH / 2;
        spireMesh.position.set(bx, spireY, bz);
        skylineGroup.add(spireMesh);

        const beaconGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const beaconMat = b.spireColor === 'cyan' ? beaconCyanMat : beaconRedMat;
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(bx, baseY + b.h + 0.15 + b.spireH, bz);
        skylineGroup.add(beaconMesh);
      }
    }

    // 5. Adjoining Cleanroom Laboratory Scene (visible through the left panoramic window)
    // Matches the adjoining research wing seen in target_reference.jpg
    const adjoiningLab = new THREE.Group();
    const adjAngle = Math.PI + 0.58;
    const adjDist = 11.5;
    adjoiningLab.position.set(Math.sin(adjAngle) * adjDist, 0, Math.cos(adjAngle) * adjDist);
    adjoiningLab.rotation.y = adjAngle + Math.PI;

    // Adjoining lab console desk
    const deskGeo = new THREE.BoxGeometry(3.6, 0.85, 1.2);
    const deskMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.18, metalness: 0.04 });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.set(0, 0.425, 0);
    adjoiningLab.add(desk);

    // Adjoining lab secondary hologram (cyan quantum orb)
    const holoWireGeo = new THREE.IcosahedronGeometry(0.35, 1);
    const holoWireMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
    const holoWire = new THREE.Mesh(holoWireGeo, holoWireMat);
    holoWire.position.set(0, 1.25, 0);
    adjoiningLab.add(holoWire);

    // Adjoining lab ceiling lighting strip
    const adjLightGeo = new THREE.BoxGeometry(3.8, 0.04, 0.25);
    const adjLight = new THREE.Mesh(adjLightGeo, this.materials.coveLight);
    adjLight.position.set(0, 3.55, 0);
    adjoiningLab.add(adjLight);

    // Adjoining lab background wall panel for realistic room enclosure
    const adjWallGeo = new THREE.BoxGeometry(4.2, 3.8, 0.08);
    const adjWallMat = new THREE.MeshStandardMaterial({ color: 0xe2eaf2, roughness: 0.35, metalness: 0.05 });
    const adjWall = new THREE.Mesh(adjWallGeo, adjWallMat);
    adjWall.position.set(0, 1.9, -1.8);
    adjoiningLab.add(adjWall);

    skylineGroup.add(adjoiningLab);

    this.group.add(skylineGroup);
  }

  private createLeftWallPartition(): void {
    const r = this.roomRadius;
    // Overlaps 0.03 rad behind the left frame tube at PI + 0.82
    const startAngle = Math.PI + 0.79;
    const endAngle = Math.PI * 1.55;
    const angleLen = endAngle - startAngle;

    // 1. Curved White Architectural Wall Panel
    const solidBackWallGeo = new THREE.CylinderGeometry(r, r, 4.0, 64, 1, true, startAngle, angleLen);
    const solidBackWall = new THREE.Mesh(solidBackWallGeo, this.materials.wallWhite);
    solidBackWall.position.y = 2.0;
    solidBackWall.receiveShadow = true;
    this.group.add(solidBackWall);

    // 2. Sci-Fi Horizontal Recessed Architectural Seams
    const seamLowerGeo = new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.02, 64, 1, true, startAngle, angleLen);
    const seamLower = new THREE.Mesh(seamLowerGeo, this.materials.darkAccent);
    seamLower.position.y = 1.35;
    this.group.add(seamLower);

    const seamUpperGeo = new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.02, 64, 1, true, startAngle, angleLen);
    const seamUpper = new THREE.Mesh(seamUpperGeo, this.materials.darkAccent);
    seamUpper.position.y = 3.00;
    this.group.add(seamUpper);

    // 3. Embedded Holographic Telemetry HUD Display
    const hudAngle = Math.PI + 1.10;
    const hudGroup = new THREE.Group();
    const hudX = Math.sin(hudAngle) * (r - 0.08);
    const hudZ = Math.cos(hudAngle) * (r - 0.08);
    hudGroup.position.set(hudX, 2.15, hudZ);
    hudGroup.lookAt(0, 2.15, 0);

    // Wall mounting plate
    const backingGeo = new THREE.BoxGeometry(1.68, 0.88, 0.03);
    const backingMesh = new THREE.Mesh(backingGeo, this.materials.darkAccent);
    hudGroup.add(backingMesh);

    // Thin frame trim
    const frameGeo = new THREE.BoxGeometry(1.72, 0.92, 0.015);
    const frameMesh = new THREE.Mesh(frameGeo, this.materials.wallTrim);
    frameMesh.position.z = -0.01;
    hudGroup.add(frameMesh);

    // Glowing cyan accent lines along display top and bottom
    const topAccentGeo = new THREE.BoxGeometry(1.62, 0.025, 0.04);
    const topAccent = new THREE.Mesh(topAccentGeo, this.materials.cyanLight);
    topAccent.position.set(0, 0.43, 0.01);
    hudGroup.add(topAccent);

    const bottomAccentGeo = new THREE.BoxGeometry(1.62, 0.025, 0.04);
    const bottomAccent = new THREE.Mesh(bottomAccentGeo, this.materials.cyanLight);
    bottomAccent.position.set(0, -0.43, 0.01);
    hudGroup.add(bottomAccent);

    // Telemetry display surface
    const telemetryTex = TextureGenerator.createWallTelemetryTexture();
    const telemetryMat = new THREE.MeshBasicMaterial({
      map: telemetryTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const telemetryScreenGeo = new THREE.PlaneGeometry(1.60, 0.80);
    const telemetryScreen = new THREE.Mesh(telemetryScreenGeo, telemetryMat);
    telemetryScreen.position.z = 0.022;
    hudGroup.add(telemetryScreen);

    this.group.add(hudGroup);
  }

  private createRightWallArchitecture(): void {
    const r = this.roomRadius;
    const startAngle = Math.PI * 0.40;
    // Overlaps 0.03 rad behind the right frame tube at PI - 0.82
    const endAngle = Math.PI - 0.79;
    const angleLen = endAngle - startAngle;

    // 1. Curved White Wall Panel
    const wallGeo = new THREE.CylinderGeometry(r, r, 4.0, 48, 1, true, startAngle, angleLen);
    const wall = new THREE.Mesh(wallGeo, this.materials.wallWhite);
    wall.position.y = 2.0;
    wall.receiveShadow = true;
    this.group.add(wall);

    // 2. Horizontal Panel Seams connecting to room datum lines
    const seamLowerGeo = new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.02, 48, 1, true, startAngle, angleLen);
    const seamLower = new THREE.Mesh(seamLowerGeo, this.materials.darkAccent);
    seamLower.position.y = 1.35;
    this.group.add(seamLower);

    const seamUpperGeo = new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.02, 48, 1, true, startAngle, angleLen);
    const seamUpper = new THREE.Mesh(seamUpperGeo, this.materials.darkAccent);
    seamUpper.position.y = 3.00;
    this.group.add(seamUpper);

    // 3. Hexagonal / Chamfered Airlock Door (Pristine White Frame matching reference image)
    const doorAngle = Math.PI - 1.05;
    const dx = Math.sin(doorAngle) * (r - 0.14);
    const dz = Math.cos(doorAngle) * (r - 0.14);

    const doorGroup = new THREE.Group();
    doorGroup.position.set(dx, 2.15, dz);
    doorGroup.rotation.y = doorAngle + Math.PI;

    const shape = new THREE.Shape();
    const w = 2.4;
    const h = 2.8;
    const c = 0.48;

    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2 - c);
    shape.lineTo(w / 2 - c, h / 2);
    shape.lineTo(-w / 2 + c, h / 2);
    shape.lineTo(-w / 2, h / 2 - c);
    shape.closePath();

    const extrudeSettings = {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    };

    // White outer casing
    const outerFrameGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const outerFrame = new THREE.Mesh(outerFrameGeo, this.materials.wallWhite);
    outerFrame.position.z = -0.06;
    doorGroup.add(outerFrame);

    const innerShape = new THREE.Shape();
    const iw = 2.05;
    const ih = 2.45;
    const ic = 0.4;

    innerShape.moveTo(-iw / 2, -ih / 2);
    innerShape.lineTo(iw / 2, -ih / 2);
    innerShape.lineTo(iw / 2, ih / 2 - ic);
    innerShape.lineTo(iw / 2 - ic, ih / 2);
    innerShape.lineTo(-iw / 2 + ic, ih / 2);
    innerShape.lineTo(-iw / 2, ih / 2 - ic);
    innerShape.closePath();

    // Light satin silver inner door leaf
    const innerGeo = new THREE.ShapeGeometry(innerShape);
    const innerMesh = new THREE.Mesh(innerGeo, this.materials.wallTrim);
    innerMesh.position.z = 0.07;
    doorGroup.add(innerMesh);

    // Glowing cyan status indicator bar
    const cyanBarGeo = new THREE.BoxGeometry(1.9, 0.035, 0.08);
    const cyanBar = new THREE.Mesh(cyanBarGeo, this.materials.cyanLight);
    cyanBar.position.set(0, -0.65, 0.08);
    doorGroup.add(cyanBar);

    this.group.add(doorGroup);

    // Wall touch panel
    const wallPanelGeo = new THREE.PlaneGeometry(0.72, 0.42);
    const wallPanelMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const wallPanel = new THREE.Mesh(wallPanelGeo, wallPanelMat);
    wallPanel.position.set(dx - 1.25, 1.85, dz - 0.35);
    wallPanel.rotation.y = doorAngle + Math.PI;
    this.group.add(wallPanel);
  }

  private createRearWallArchitecture(): void {
    const r = this.roomRadius;
    const rearGroup = new THREE.Group();

    const rearStart = Math.PI * 1.55;
    const rearLen = Math.PI * 2 + Math.PI * 0.40 - rearStart;

    // 1. Subtle, tone-on-tone hairline datum lines (soft satin silver, NOT dark black)
    const seamLowerGeo = new THREE.CylinderGeometry(r - 0.008, r - 0.008, 0.008, 96, 1, true, rearStart, rearLen);
    const seamLower = new THREE.Mesh(seamLowerGeo, this.materials.ceilingTrim);
    seamLower.position.y = 1.35;
    rearGroup.add(seamLower);

    const seamUpperGeo = new THREE.CylinderGeometry(r - 0.008, r - 0.008, 0.008, 96, 1, true, rearStart, rearLen);
    const seamUpper = new THREE.Mesh(seamUpperGeo, this.materials.ceilingTrim);
    seamUpper.position.y = 3.00;
    rearGroup.add(seamUpper);

    // -------------------------------------------------------------
    // 2. Central Grand Architectural Portal (theta = 0)
    // Pure White, Sculptural, Minimalist Cleanroom Gateway
    // -------------------------------------------------------------
    const portalGroup = new THREE.Group();
    const portalZ = r - 0.10;
    portalGroup.position.set(0, 0, portalZ);
    portalGroup.lookAt(0, 0, 0);

    // Architectural Doorway Sill / Threshold plate
    const thresholdGeo = new THREE.BoxGeometry(3.30, 0.008, 0.36);
    const threshold = new THREE.Mesh(thresholdGeo, this.materials.ceilingTrim);
    threshold.position.set(0, 0.004, 0.06);
    portalGroup.add(threshold);

    // Sculptural Chamfered White Portal Frame
    const frameShape = new THREE.Shape();
    const fw = 3.30;
    const fh = 3.32;
    const fc = 0.48;

    frameShape.moveTo(-fw / 2, 0);
    frameShape.lineTo(fw / 2, 0);
    frameShape.lineTo(fw / 2, fh - fc);
    frameShape.lineTo(fw / 2 - fc, fh);
    frameShape.lineTo(-fw / 2 + fc, fh);
    frameShape.lineTo(-fw / 2, fh - fc);
    frameShape.closePath();

    const holePath = new THREE.Path();
    const iw = 2.72;
    const ih = 2.92;
    const ic = 0.38;

    holePath.moveTo(-iw / 2, 0);
    holePath.lineTo(iw / 2, 0);
    holePath.lineTo(iw / 2, ih - ic);
    holePath.lineTo(iw / 2 - ic, ih);
    holePath.lineTo(-iw / 2 + ic, ih);
    holePath.lineTo(-iw / 2, ih - ic);
    holePath.closePath();
    frameShape.holes.push(holePath);

    const frameExtrudeSettings = {
      depth: 0.10,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    };
    const portalFrameGeo = new THREE.ExtrudeGeometry(frameShape, frameExtrudeSettings);
    const portalFrame = new THREE.Mesh(portalFrameGeo, this.materials.wallWhite);
    portalFrame.position.z = -0.05;
    portalGroup.add(portalFrame);

    // Continuous glowing cove ribbon tracing the inner portal chamfer contour
    const covePoints: THREE.Vector3[] = [
      new THREE.Vector3(-iw / 2, 0.02, 0.072),
      new THREE.Vector3(-iw / 2, ih - ic, 0.072),
      new THREE.Vector3(-iw / 2 + ic, ih, 0.072),
      new THREE.Vector3(iw / 2 - ic, ih, 0.072),
      new THREE.Vector3(iw / 2, ih - ic, 0.072),
      new THREE.Vector3(iw / 2, 0.02, 0.072),
    ];
    const coveCurve = new THREE.CatmullRomCurve3(covePoints, false, 'catmullrom', 0.1);
    const coveGeo = new THREE.TubeGeometry(coveCurve, 64, 0.016, 12, false);
    const coveMesh = new THREE.Mesh(coveGeo, this.materials.coveLight);
    portalGroup.add(coveMesh);

    // Integrated soft lintel downlight wash
    const portalDownlight = new THREE.PointLight(0xf0f7ff, 0.65, 4.5, 1.6);
    portalDownlight.position.set(0, 3.12, 0.20);
    portalGroup.add(portalDownlight);

    // Double Sliding Cleanroom Doors in Pure White Satin
    const doorLeafW = 1.34;
    const doorLeafH = 2.90;
    const doorLeafDepth = 0.04;

    // Left Leaf (Pure White Satin)
    const leftDoorGroup = new THREE.Group();
    leftDoorGroup.position.set(-doorLeafW / 2 - 0.005, doorLeafH / 2, 0.01);
    const leftDoorGeo = new THREE.BoxGeometry(doorLeafW, doorLeafH, doorLeafDepth);
    const leftDoor = new THREE.Mesh(leftDoorGeo, this.materials.wallWhite);
    leftDoorGroup.add(leftDoor);

    // Subtle, elegant recessed inset panel (tone-on-tone light satin silver)
    const leftInsetGeo = new THREE.BoxGeometry(doorLeafW - 0.22, doorLeafH - 0.32, 0.008);
    const leftInset = new THREE.Mesh(leftInsetGeo, this.materials.ceilingTrim);
    leftInset.position.z = 0.022;
    leftDoorGroup.add(leftInset);
    portalGroup.add(leftDoorGroup);

    // Right Leaf (Pure White Satin)
    const rightDoorGroup = new THREE.Group();
    rightDoorGroup.position.set(doorLeafW / 2 + 0.005, doorLeafH / 2, 0.01);
    const rightDoorGeo = new THREE.BoxGeometry(doorLeafW, doorLeafH, doorLeafDepth);
    const rightDoor = new THREE.Mesh(rightDoorGeo, this.materials.wallWhite);
    rightDoorGroup.add(rightDoor);

    const rightInsetGeo = new THREE.BoxGeometry(doorLeafW - 0.22, doorLeafH - 0.32, 0.008);
    const rightInset = new THREE.Mesh(rightInsetGeo, this.materials.ceilingTrim);
    rightInset.position.z = 0.022;
    rightDoorGroup.add(rightInset);
    portalGroup.add(rightDoorGroup);

    // Ethereal cyan magnetic lock vertical laser seal
    const centerSealGeo = new THREE.BoxGeometry(0.008, doorLeafH, 0.018);
    const centerSeal = new THREE.Mesh(centerSealGeo, this.materials.cyanLight);
    centerSeal.position.set(0, doorLeafH / 2, 0.038);
    portalGroup.add(centerSeal);

    // Minimalist Overhead Transom Glass Sign
    const signBoardGeo = new THREE.PlaneGeometry(1.92, 0.33);
    const signMat = new THREE.MeshBasicMaterial({
      map: TextureGenerator.createPortalSignTexture(),
      transparent: true,
      side: THREE.DoubleSide,
    });
    const signBoard = new THREE.Mesh(signBoardGeo, signMat);
    signBoard.position.set(0, 3.12, 0.075);
    portalGroup.add(signBoard);

    // Minimalist capacitive wall touch control plate
    const accessPlateGeo = new THREE.PlaneGeometry(0.24, 0.44);
    const accessPlateMat = new THREE.MeshStandardMaterial({
      color: 0x14202e,
      roughness: 0.1,
      metalness: 0.8,
    });
    const accessPlate = new THREE.Mesh(accessPlateGeo, accessPlateMat);
    accessPlate.position.set(1.86, 1.35, -0.01);
    accessPlate.rotation.y = -0.18;

    const accessRingGeo = new THREE.RingGeometry(0.045, 0.055, 32);
    const accessRing = new THREE.Mesh(accessRingGeo, this.materials.cyanLight);
    accessRing.position.set(1.86, 1.38, -0.005);
    accessRing.rotation.y = -0.18;
    portalGroup.add(accessPlate);
    portalGroup.add(accessRing);

    rearGroup.add(portalGroup);

    // Helper for chamfered niche casing frame with inner opening
    const createNicheFrame = (nw: number, nh: number, nc: number) => {
      const s = new THREE.Shape();
      s.moveTo(-nw / 2 + nc, -nh / 2);
      s.lineTo(nw / 2 - nc, -nh / 2);
      s.lineTo(nw / 2, -nh / 2 + nc);
      s.lineTo(nw / 2, nh / 2 - nc);
      s.lineTo(nw / 2 - nc, nh / 2);
      s.lineTo(-nw / 2 + nc, nh / 2);
      s.lineTo(-nw / 2, nh / 2 - nc);
      s.lineTo(-nw / 2, -nh / 2 + nc);
      s.closePath();

      const border = 0.09;
      const inw = nw - border * 2;
      const inh = nh - border * 2;
      const inc = nc * 0.75;
      const hole = new THREE.Path();
      hole.moveTo(-inw / 2 + inc, -inh / 2);
      hole.lineTo(inw / 2 - inc, -inh / 2);
      hole.lineTo(inw / 2, -inh / 2 + inc);
      hole.lineTo(inw / 2, inh / 2 - inc);
      hole.lineTo(inw / 2 - inc, inh / 2);
      hole.lineTo(-inw / 2 + inc, inh / 2);
      hole.lineTo(-inw / 2, inh / 2 - inc);
      hole.lineTo(-inw / 2, -inh / 2 + inc);
      hole.closePath();
      s.holes.push(hole);
      return { shape: s, inw, inh };
    };

    const nicheExtrude = {
      depth: 0.05,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
    };

    const nw = 2.40;
    const nh = 1.25;
    const nc = 0.22;
    const nicheFrameData = createNicheFrame(nw, nh, nc);

    // -------------------------------------------------------------
    // 3. Left Wing: Chamfered Niche with Frosted Glass HUD (theta = +0.40 rad)
    // -------------------------------------------------------------
    const leftAngle = 0.40;
    const lx = Math.sin(leftAngle) * (r - 0.08);
    const lz = Math.cos(leftAngle) * (r - 0.08);
    const leftHudGroup = new THREE.Group();
    leftHudGroup.position.set(lx, 2.15, lz);
    leftHudGroup.lookAt(0, 2.15, 0);

    const leftCasingGeo = new THREE.ExtrudeGeometry(nicheFrameData.shape, nicheExtrude);
    const leftCasing = new THREE.Mesh(leftCasingGeo, this.materials.wallWhite);
    leftCasing.position.z = -0.01;
    leftHudGroup.add(leftCasing);

    // Delicate frosted glass HUD
    const hudPlaneGeo = new THREE.PlaneGeometry(nicheFrameData.inw, nicheFrameData.inh);
    const hudMat = new THREE.MeshBasicMaterial({
      map: TextureGenerator.createMinimalRearHudTexture(),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const hudPlane = new THREE.Mesh(hudPlaneGeo, hudMat);
    hudPlane.position.z = 0.018;
    leftHudGroup.add(hudPlane);

    // Soft backlight behind HUD
    const hudBacklightGeo = new THREE.PlaneGeometry(nicheFrameData.inw - 0.04, nicheFrameData.inh - 0.04);
    const hudBacklightMat = new THREE.MeshBasicMaterial({
      color: 0x00e6f6,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const hudBacklight = new THREE.Mesh(hudBacklightGeo, hudBacklightMat);
    hudBacklight.position.z = 0.008;
    leftHudGroup.add(hudBacklight);

    // Minimalist glowing cyan accent line below HUD
    const leftAccentGeo = new THREE.BoxGeometry(nicheFrameData.inw, 0.016, 0.02);
    const leftAccent = new THREE.Mesh(leftAccentGeo, this.materials.cyanLight);
    leftAccent.position.set(0, -nicheFrameData.inh / 2 + 0.02, 0.025);
    leftHudGroup.add(leftAccent);

    rearGroup.add(leftHudGroup);

    // -------------------------------------------------------------
    // 4. Right Wing: Chamfered Niche with Inspection Aperture (theta = -0.40 rad)
    // Symmetrical, pure white chamfered niche matching the right wall architecture
    // -------------------------------------------------------------
    const rightAngle = -0.40;
    const rx = Math.sin(rightAngle) * (r - 0.08);
    const rz = Math.cos(rightAngle) * (r - 0.08);
    const rightWingGroup = new THREE.Group();
    rightWingGroup.position.set(rx, 2.15, rz);
    rightWingGroup.lookAt(0, 2.15, 0);

    const rightCasingGeo = new THREE.ExtrudeGeometry(nicheFrameData.shape, nicheExtrude);
    const rightCasing = new THREE.Mesh(rightCasingGeo, this.materials.wallWhite);
    rightCasing.position.z = -0.01;
    rightWingGroup.add(rightCasing);

    // Backlit frosted glass observation panel
    const glassPanelGeo = new THREE.PlaneGeometry(nicheFrameData.inw, nicheFrameData.inh);
    const glassPanel = new THREE.Mesh(glassPanelGeo, this.materials.partitionGlass);
    glassPanel.position.z = 0.018;
    rightWingGroup.add(glassPanel);

    // Soft internal cove glow behind glass
    const glassGlowGeo = new THREE.PlaneGeometry(nicheFrameData.inw - 0.04, nicheFrameData.inh - 0.04);
    const glassGlowMat = new THREE.MeshBasicMaterial({
      color: 0x88c4e8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const glassGlow = new THREE.Mesh(glassGlowGeo, glassGlowMat);
    glassGlow.position.z = 0.008;
    rightWingGroup.add(glassGlow);

    // Minimalist glowing cyan accent line below aperture
    const rightAccentGeo = new THREE.BoxGeometry(nicheFrameData.inw, 0.016, 0.02);
    const rightAccent = new THREE.Mesh(rightAccentGeo, this.materials.cyanLight);
    rightAccent.position.set(0, -nicheFrameData.inh / 2 + 0.02, 0.025);
    rightWingGroup.add(rightAccent);

    rearGroup.add(rightWingGroup);

    // -------------------------------------------------------------
    // 5. Signature Chamfered Wall Grooves (Matching Left & Right Walls)
    // -------------------------------------------------------------
    const createAngledPanelLine = (phiCenter: number, isMirrored: boolean) => {
      const lineGroup = new THREE.Group();
      const px = Math.sin(phiCenter) * (r - 0.008);
      const pz = Math.cos(phiCenter) * (r - 0.008);
      lineGroup.position.set(px, 0, pz);
      lineGroup.lookAt(0, 0, 0);

      const sign = isMirrored ? -1 : 1;
      const points: THREE.Vector3[] = [
        new THREE.Vector3(sign * 1.8, 1.35, 0),
        new THREE.Vector3(sign * 1.3, 1.35, 0),
        new THREE.Vector3(sign * 1.1, 2.80, 0),
        new THREE.Vector3(sign * 0.4, 2.80, 0),
      ];
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.005, 8, false);
      const tube = new THREE.Mesh(tubeGeo, this.materials.ceilingTrim);
      lineGroup.add(tube);
      return lineGroup;
    };

    rearGroup.add(createAngledPanelLine(0.68, false));
    rearGroup.add(createAngledPanelLine(-0.68, true));

    this.group.add(rearGroup);
  }

  public update(delta: number, elapsed: number): void {
    // Environmental room updates if needed
  }
}
