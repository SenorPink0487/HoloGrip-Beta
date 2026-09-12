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
        color: 0xedf1f5,
        roughness: 0.32,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      wallTrim: new THREE.MeshStandardMaterial({
        color: 0xc4cdd6,
        roughness: 0.28,
        metalness: 0.2,
        side: THREE.DoubleSide,
      }),
      darkAccent: new THREE.MeshStandardMaterial({
        color: 0x14181e,
        roughness: 0.5,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
      coveLight: new THREE.MeshBasicMaterial({
        color: 0xd6e2ec,
        side: THREE.DoubleSide,
      }),
      cyanLight: new THREE.MeshBasicMaterial({
        color: 0x00d8f0,
        side: THREE.DoubleSide,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: 0x759dbd,
        transparent: true,
        opacity: 0.14,
        roughness: 0.05,
        metalness: 0.8,
        side: THREE.DoubleSide,
      }),
      partitionGlass: new THREE.MeshStandardMaterial({
        color: 0x88c4e8,
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
    };

    this.createFloor();
    this.createCeiling();
    this.createRoomWallsAndWindow();
    this.createLeftWallPartition();
    this.createRightWallArchitecture();
  }

  private createFloor(): void {
    const floorGeo = new THREE.CircleGeometry(this.roomRadius, 96);
    const floorTex = TextureGenerator.createFloorTexture();
    const roughnessMap = TextureGenerator.createFloorRoughnessMap();

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: roughnessMap,
      roughness: 0.18,
      metalness: 0.22,
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private createCeiling(): void {
    const ceilingGroup = new THREE.Group();

    // 1. Outer ceiling tier (r = 6.4m to 8.2m, y = 4.0m)
    const outerCeilingGeo = new THREE.RingGeometry(6.4, this.roomRadius, 80);
    const outerCeiling = new THREE.Mesh(outerCeilingGeo, this.materials.wallWhite);
    outerCeiling.rotation.x = Math.PI / 2;
    outerCeiling.position.y = 4.0;
    ceilingGroup.add(outerCeiling);

    // Outer cove riser & light strip 1
    const riser1Geo = new THREE.CylinderGeometry(6.4, 6.4, 0.26, 80, 1, true);
    const riser1 = new THREE.Mesh(riser1Geo, this.materials.wallTrim);
    riser1.position.y = 4.13;
    ceilingGroup.add(riser1);

    const coveLight1Geo = new THREE.CylinderGeometry(6.38, 6.38, 0.08, 80, 1, true);
    const coveLight1 = new THREE.Mesh(coveLight1Geo, this.materials.coveLight);
    coveLight1.position.y = 4.17;
    ceilingGroup.add(coveLight1);

    // 2. Middle ceiling tier (r = 4.6m to 6.4m, y = 4.26m)
    const midCeilingGeo = new THREE.RingGeometry(4.6, 6.4, 80);
    const midCeiling = new THREE.Mesh(midCeilingGeo, this.materials.wallWhite);
    midCeiling.rotation.x = Math.PI / 2;
    midCeiling.position.y = 4.26;
    ceilingGroup.add(midCeiling);

    // Middle cove riser & light strip 2
    const riser2Geo = new THREE.CylinderGeometry(4.6, 4.6, 0.26, 80, 1, true);
    const riser2 = new THREE.Mesh(riser2Geo, this.materials.wallTrim);
    riser2.position.y = 4.39;
    ceilingGroup.add(riser2);

    const coveLight2Geo = new THREE.CylinderGeometry(4.58, 4.58, 0.08, 80, 1, true);
    const coveLight2 = new THREE.Mesh(coveLight2Geo, this.materials.coveLight);
    coveLight2.position.y = 4.43;
    ceilingGroup.add(coveLight2);

    // 3. Inner dome ceiling tier (r = 0 to 4.6m, y = 4.52m)
    const innerDomeGeo = new THREE.CircleGeometry(4.6, 80);
    const innerDome = new THREE.Mesh(innerDomeGeo, this.materials.wallWhite);
    innerDome.rotation.x = Math.PI / 2;
    innerDome.position.y = 4.52;
    ceilingGroup.add(innerDome);

    // Recessed circular downlights along inner ring (r = 3.6m)
    const downlightCount = 14;
    const downlightRadius = 3.6;
    const fixtureGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24);
    const lensGeo = new THREE.CircleGeometry(0.08, 24);
    const downlightLensMat = new THREE.MeshBasicMaterial({ color: 0xdbe5f0 });

    for (let i = 0; i < downlightCount; i++) {
      const angle = (i / downlightCount) * Math.PI * 2;
      const x = Math.sin(angle) * downlightRadius;
      const z = Math.cos(angle) * downlightRadius;

      const fixture = new THREE.Mesh(fixtureGeo, this.materials.darkAccent);
      fixture.position.set(x, 4.51, z);
      ceilingGroup.add(fixture);

      const lens = new THREE.Mesh(lensGeo, downlightLensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, 4.505, z);
      ceilingGroup.add(lens);
    }

    this.group.add(ceilingGroup);
  }

  private createRoomWallsAndWindow(): void {
    const r = this.roomRadius;
    const windowCenter = Math.PI;
    const windowHalfSpan = 0.58;
    const windowStart = windowCenter - windowHalfSpan;
    const windowLen = windowHalfSpan * 2;

    const sillY = 0.74;
    const lintelY = 3.54;
    const jambH = lintelY - sillY;

    // 1. Lower Curved White Wall below Window
    const lowerWallGeo = new THREE.CylinderGeometry(r, r, sillY, 48, 1, true, windowStart, windowLen);
    const lowerWall = new THREE.Mesh(lowerWallGeo, this.materials.wallWhite);
    lowerWall.position.y = sillY / 2;
    lowerWall.receiveShadow = true;
    this.group.add(lowerWall);

    // 2. Upper Curved White Wall above Window
    const upperWallH = 4.0 - lintelY;
    const upperWallGeo = new THREE.CylinderGeometry(r, r, upperWallH, 48, 1, true, windowStart, windowLen);
    const upperWall = new THREE.Mesh(upperWallGeo, this.materials.wallWhite);
    upperWall.position.y = lintelY + upperWallH / 2;
    this.group.add(upperWall);

    // 3. Moldings
    const sillGeo = new THREE.CylinderGeometry(r - 0.08, r - 0.08, 0.12, 48, 1, true, windowStart, windowLen);
    const sill = new THREE.Mesh(sillGeo, this.materials.wallTrim);
    sill.position.y = sillY;
    this.group.add(sill);

    const lintelGeo = new THREE.CylinderGeometry(r - 0.08, r - 0.08, 0.12, 48, 1, true, windowStart, windowLen);
    const lintel = new THREE.Mesh(lintelGeo, this.materials.wallTrim);
    lintel.position.y = lintelY;
    this.group.add(lintel);

    // Vertical window jambs
    const leftAngle = windowStart;
    const rightAngle = windowStart + windowLen;
    const jambGeo = new THREE.CylinderGeometry(0.24, 0.24, jambH, 32);

    const leftJamb = new THREE.Mesh(jambGeo, this.materials.wallWhite);
    leftJamb.position.set(Math.sin(leftAngle) * (r - 0.1), sillY + jambH / 2, Math.cos(leftAngle) * (r - 0.1));
    this.group.add(leftJamb);

    const rightJamb = new THREE.Mesh(jambGeo, this.materials.wallWhite);
    rightJamb.position.set(Math.sin(rightAngle) * (r - 0.1), sillY + jambH / 2, Math.cos(rightAngle) * (r - 0.1));
    this.group.add(rightJamb);

    // Panoramic window glass
    const glassGeo = new THREE.CylinderGeometry(r, r, jambH, 48, 1, true, windowStart, windowLen);
    const glass = new THREE.Mesh(glassGeo, this.materials.windowGlass);
    glass.position.y = sillY + jambH / 2;
    this.group.add(glass);

    // Rear curved wall
    const rearStart = Math.PI * 1.55;
    const rearLen = Math.PI * 0.85;
    const rearWallGeo = new THREE.CylinderGeometry(r, r, 4.0, 48, 1, true, rearStart, rearLen);
    const rearWall = new THREE.Mesh(rearWallGeo, this.materials.wallWhite);
    rearWall.position.y = 2.0;
    rearWall.receiveShadow = true;
    this.group.add(rearWall);
  }

  private createLeftWallPartition(): void {
    const r = this.roomRadius;
    const startAngle = Math.PI + 0.58;
    const endAngle = Math.PI * 1.55;
    const angleLen = endAngle - startAngle;

    const solidBackWallGeo = new THREE.CylinderGeometry(r, r, 4.0, 32, 1, true, startAngle, angleLen);
    const solidBackWall = new THREE.Mesh(solidBackWallGeo, this.materials.wallWhite);
    solidBackWall.position.y = 2.0;
    solidBackWall.receiveShadow = true;
    this.group.add(solidBackWall);

    const glassGeo = new THREE.CylinderGeometry(
      r - 0.08,
      r - 0.08,
      2.6,
      24,
      1,
      true,
      startAngle + 0.05,
      angleLen - 0.1
    );
    const glassPartition = new THREE.Mesh(glassGeo, this.materials.partitionGlass);
    glassPartition.position.y = 2.1;
    this.group.add(glassPartition);

    const numMullions = 4;
    for (let i = 0; i <= numMullions; i++) {
      const a = startAngle + (i / numMullions) * angleLen;
      const mullionGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.7, 16);
      const mullion = new THREE.Mesh(mullionGeo, this.materials.wallTrim);
      mullion.position.set(Math.sin(a) * (r - 0.08), 2.1, Math.cos(a) * (r - 0.08));
      this.group.add(mullion);
    }

    const topFrameGeo = new THREE.CylinderGeometry(r - 0.08, r - 0.08, 0.08, 24, 1, true, startAngle, angleLen);
    const topFrame = new THREE.Mesh(topFrameGeo, this.materials.wallTrim);
    topFrame.position.y = 3.45;
    this.group.add(topFrame);

    const bottomFrameGeo = new THREE.CylinderGeometry(r - 0.08, r - 0.08, 0.08, 24, 1, true, startAngle, angleLen);
    const bottomFrame = new THREE.Mesh(bottomFrameGeo, this.materials.wallTrim);
    bottomFrame.position.y = 0.75;
    this.group.add(bottomFrame);
  }

  private createRightWallArchitecture(): void {
    const r = this.roomRadius;
    const startAngle = Math.PI * 0.4;
    const endAngle = Math.PI - 0.58;
    const angleLen = endAngle - startAngle;

    const wallGeo = new THREE.CylinderGeometry(r, r, 4.0, 32, 1, true, startAngle, angleLen);
    const wall = new THREE.Mesh(wallGeo, this.materials.wallWhite);
    wall.position.y = 2.0;
    wall.receiveShadow = true;
    this.group.add(wall);

    const doorAngle = Math.PI - 0.78;
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
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.03,
      bevelThickness: 0.03,
    };

    const outerFrameGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const outerFrame = new THREE.Mesh(outerFrameGeo, this.materials.wallTrim);
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

    const innerGeo = new THREE.ShapeGeometry(innerShape);
    const innerMesh = new THREE.Mesh(innerGeo, this.materials.darkAccent);
    innerMesh.position.z = 0.07;
    doorGroup.add(innerMesh);

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
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const wallPanel = new THREE.Mesh(wallPanelGeo, wallPanelMat);
    wallPanel.position.set(dx - 1.25, 1.85, dz - 0.35);
    wallPanel.rotation.y = doorAngle + Math.PI;
    this.group.add(wallPanel);
  }

  public update(delta: number, elapsed: number): void {
    // Environmental room updates if needed
  }
}
