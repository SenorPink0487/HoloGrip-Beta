import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';

/**
 * Architectural shell for the reference laboratory.
 * The room is intentionally quiet: white curved panels, a single cyan datum
 * light, warm recessed shelves and a large circular ceiling oculus.
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;

  constructor() {
    this.materials = {
      wallTitanium: new THREE.MeshStandardMaterial({ color: 0xe4e9ed, roughness: 0.58, metalness: 0.08, side: THREE.DoubleSide }),
      obsidianGlass: new THREE.MeshPhysicalMaterial({
        color: 0xc5d4de, roughness: 0.2, metalness: 0.04, transmission: 0.16,
        transparent: true, opacity: 0.58, clearcoat: 0.28, side: THREE.DoubleSide,
      }),
      wallWhite: new THREE.MeshStandardMaterial({ color: 0xeaf0f3, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide }),
      wallTrim: new THREE.MeshStandardMaterial({ color: 0xb7c2c9, roughness: 0.38, metalness: 0.48, side: THREE.DoubleSide }),
      wallSeamDark: new THREE.MeshStandardMaterial({ color: 0xa9b6bf, roughness: 0.5, metalness: 0.34, side: THREE.DoubleSide }),
      aluminumTrim: new THREE.MeshStandardMaterial({ color: 0xd5dde2, roughness: 0.3, metalness: 0.55, side: THREE.DoubleSide }),
      coveLight: new THREE.MeshBasicMaterial({ color: 0xfffbf3, side: THREE.DoubleSide }),
      hairlineLightSlot: new THREE.MeshBasicMaterial({ color: 0x9beaff, side: THREE.DoubleSide }),
      wallWashCove: new THREE.MeshBasicMaterial({ color: 0xc8f2ff, side: THREE.DoubleSide }),
      glassBackglow: new THREE.MeshBasicMaterial({
        color: 0xc9edff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }),
      nicheInterior: new THREE.MeshStandardMaterial({ color: 0xd5dde1, roughness: 0.46, metalness: 0.08, side: THREE.DoubleSide }),
      nicheWarmLight: new THREE.MeshBasicMaterial({ color: 0xfff8e9, side: THREE.DoubleSide }),
      ceilingWhite: new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.52, metalness: 0.02, side: THREE.DoubleSide }),
      ceilingTrim: new THREE.MeshStandardMaterial({ color: 0xc2ccd2, roughness: 0.32, metalness: 0.42, side: THREE.DoubleSide }),
      ceilingGroove: new THREE.MeshBasicMaterial({ color: 0xaab6bd, side: THREE.DoubleSide }),
    };

    this.createFloor();
    this.createBaseboardCoveLight();
    this.createCeiling();
    this.createRoomWalls();
  }

  private createFloor(): void {
    const floorTex = TextureGenerator.createFloorTexture();
    const roughnessMap = TextureGenerator.createFloorRoughnessMap();
    const bumpMap = TextureGenerator.createFloorBumpMap();
    floorTex.anisotropy = 4;
    roughnessMap.anisotropy = 4;
    bumpMap.anisotropy = 4;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(this.roomRadius, 128),
      new THREE.MeshStandardMaterial({
        map: floorTex, roughnessMap, bumpMap, bumpScale: 0.00055,
        roughness: 0.28, metalness: 0.035, envMapIntensity: 0.72,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.floorMesh = floor;
    this.group.add(floor);

    const seamMat = new THREE.MeshBasicMaterial({ color: 0x9aa7af, transparent: true, opacity: 0.24 });
    const seams = new THREE.Group();
    seams.name = 'reference-floor-seams';
    for (const radius of [2.55, 4.65, 6.85]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.006, radius + 0.006, 128), seamMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.003;
      seams.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(this.roomRadius * 1.65, 0.008), seamMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = (i / 8) * Math.PI;
      line.position.y = 0.0035;
      seams.add(line);
    }
    floor.add(seams);
  }

  public updateFloorTextures(textures: { floorTex: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }): void {
    if (!(this.floorMesh?.material instanceof THREE.MeshStandardMaterial)) return;
    textures.floorTex.anisotropy = 4;
    textures.roughnessMap.anisotropy = 4;
    textures.bumpMap.anisotropy = 4;
    this.floorMesh.material.map = textures.floorTex;
    this.floorMesh.material.roughnessMap = textures.roughnessMap;
    this.floorMesh.material.bumpMap = textures.bumpMap;
    this.floorMesh.material.needsUpdate = true;
  }

  private createCeiling(): void {
    const ceiling = new THREE.Group();
    ceiling.name = 'reference-ceiling';

    const outer = new THREE.Mesh(new THREE.RingGeometry(4.15, this.roomRadius, 128), this.materials.ceilingWhite);
    outer.rotation.x = Math.PI / 2;
    outer.position.y = 4.03;
    ceiling.add(outer);

    const cove = new THREE.Mesh(new THREE.CylinderGeometry(8.08, 8.12, 0.055, 128, 1, true), this.materials.coveLight);
    cove.position.y = 3.96;
    ceiling.add(cove);

    const middle = new THREE.Mesh(new THREE.RingGeometry(2.72, 4.15, 128), this.materials.ceilingWhite);
    middle.rotation.x = Math.PI / 2;
    middle.position.y = 4.16;
    ceiling.add(middle);

    const halo = new THREE.Mesh(new THREE.CylinderGeometry(2.68, 2.74, 0.08, 128, 1, true), this.materials.coveLight);
    halo.position.y = 4.14;
    ceiling.add(halo);

    const oculusFrame = new THREE.Mesh(new THREE.RingGeometry(1.78, 2.68, 128), this.materials.ceilingTrim);
    oculusFrame.rotation.x = Math.PI / 2;
    oculusFrame.position.y = 4.22;
    ceiling.add(oculusFrame);

    const skylight = new THREE.Mesh(
      new THREE.CircleGeometry(1.78, 96),
      new THREE.MeshBasicMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
    );
    skylight.rotation.x = Math.PI / 2;
    skylight.position.y = 4.235;
    ceiling.add(skylight);

    const skylightRing = new THREE.Mesh(new THREE.RingGeometry(1.74, 1.8, 96), this.materials.aluminumTrim);
    skylightRing.rotation.x = Math.PI / 2;
    skylightRing.position.y = 4.245;
    ceiling.add(skylightRing);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 3.52), this.materials.ceilingTrim);
      spoke.position.y = 4.25;
      spoke.rotation.y = (i / 8) * Math.PI;
      ceiling.add(spoke);
    }
    this.group.add(ceiling);
  }

  private createBaseboardCoveLight(): void {
    const base = new THREE.Group();
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(8.14, 8.14, 0.035, 128, 1, true), this.materials.wallTrim);
    trim.position.y = 0.02;
    base.add(trim);
    this.group.add(base);
  }

  private roundedShape(width: number, height: number, radius: number): THREE.Shape {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
  }

  private roundedPanel(width: number, height: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new THREE.ShapeGeometry(this.roundedShape(width, height, Math.min(0.18, height * 0.18))), material);
  }

  private createRoomWalls(): void {
    const walls = new THREE.Group();
    walls.name = 'reference-walls';

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius, this.roomRadius, 3.84, 128, 1, true),
      this.materials.wallTitanium,
    );
    shell.position.y = 2.05;
    walls.add(shell);

    const seamMat = new THREE.MeshBasicMaterial({ color: 0xb1bdc4, transparent: true, opacity: 0.28 });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 3.55, 0.025), seamMat);
      seam.position.set(Math.cos(angle) * 8.175, 2.05, Math.sin(angle) * 8.175);
      seam.rotation.y = -angle;
      walls.add(seam);
    }

    const cyanSlot = new THREE.Mesh(new THREE.CylinderGeometry(8.16, 8.16, 0.018, 128, 1, true), this.materials.hairlineLightSlot);
    cyanSlot.position.y = 3.48;
    cyanSlot.name = 'upper-cyan-light-slot';
    walls.add(cyanSlot);

    this.createObservationWindow(walls);
    this.createSideNiches(walls);
    this.createAcousticFins(walls, seamMat);
    this.group.add(walls);
  }

  private createObservationWindow(walls: THREE.Group): void {
    const frame = this.roundedPanel(3.25, 1.32, this.materials.wallTrim);
    frame.position.set(0, 2.35, -8.14);
    frame.name = 'central-observation-window-frame';
    walls.add(frame);

    const glass = this.roundedPanel(2.96, 1.06, this.materials.obsidianGlass);
    // The smaller glass sits toward the camera, leaving the frame visible around it.
    glass.position.set(0, 2.35, -8.11);
    glass.name = 'central-observation-window-glass';
    walls.add(glass);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.68, 0.02), this.materials.glassBackglow);
    glow.position.set(0, 2.35, -8.10);
    walls.add(glow);

    const mullionMat = new THREE.MeshBasicMaterial({ color: 0xb6c5ce, transparent: true, opacity: 0.58 });
    for (const x of [-0.55, 0.55]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.82, 0.012), mullionMat);
      mullion.position.set(x, 2.35, -8.09);
      walls.add(mullion);
    }
  }

  private createSideNiches(walls: THREE.Group): void {
    for (const x of [-5.05, 5.05]) {
      const outer = this.roundedPanel(3.0, 1.52, this.materials.wallTrim);
      outer.position.set(x, 2.18, -6.385);
      outer.name = `side-niche-frame-${x < 0 ? 'left' : 'right'}`;
      walls.add(outer);

      const interior = this.roundedPanel(2.7, 1.27, this.materials.nicheInterior);
      interior.position.set(x, 2.18, -6.34);
      walls.add(interior);

      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.026, 0.07), this.materials.nicheWarmLight);
      shelf.position.set(x, 1.9, -6.29);
      shelf.name = `side-niche-warm-shelf-${x < 0 ? 'left' : 'right'}`;
      walls.add(shelf);

      const shelfLight = new THREE.PointLight(0xffe5bb, 0.16, 2.6, 2.0);
      shelfLight.position.set(x, 1.96, -6.18);
      walls.add(shelfLight);
    }
  }

  private createAcousticFins(walls: THREE.Group, material: THREE.Material): void {
    for (const x of [-3.35, 3.35]) {
      for (let i = 0; i < 10; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.5, 0.035), material);
        fin.position.set(x + (i - 4.5) * 0.08, 2.18, -8.13);
        walls.add(fin);
      }
    }
  }

  public update(_delta: number, _elapsed: number): void {
    // Static architecture; animated experiment content lives on HologramStage.
  }
}
