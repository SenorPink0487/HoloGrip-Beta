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
      coveLight: new THREE.MeshBasicMaterial({
        color: 0xffffff,
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
    this.createRoomWalls();
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

  private createRoomWalls(): void {
    const r = this.roomRadius;
    const wallGeo = new THREE.CylinderGeometry(r, r, 4.0, 128, 1, true);
    const wall = new THREE.Mesh(wallGeo, this.materials.wallWhite);
    wall.position.y = 2.0;
    wall.receiveShadow = true;
    this.group.add(wall);
  }

  public update(delta: number, elapsed: number): void {
    // Environmental room updates if needed
  }
}
