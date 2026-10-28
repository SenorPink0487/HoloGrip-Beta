import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';
import { HOLO_TABLE_RADIUS } from './HoloTable.ts';
import { PortraitGallery } from './gallery/PortraitGallery.ts';
import { galleryPalette, type GalleryPaletteId } from './gallery/palette.ts';

/**
 * 圆形实验室：连续灰泥壳、檐口光带、竖向分缝，
 * 地面用一圈铜线呼应中央圆桌。墙上隔一格挂一幅肖像。
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  public readonly portraits: PortraitGallery;
  private floorMesh: THREE.Mesh | null = null;
  private echoMat!: THREE.MeshStandardMaterial;
  private bezelMat!: THREE.MeshStandardMaterial;

  private readonly wallRadius = 8.04;

  constructor() {
    const plaster = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.72,
      metalness: 0.0,
      envMapIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xc6a56e,
      roughness: 0.3,
      metalness: 0.9,
      envMapIntensity: 1.05,
      side: THREE.DoubleSide,
    });

    this.materials = {
      plaster,
      brass,
      stone: new THREE.MeshStandardMaterial({
        color: 0xe7e0d4,
        roughness: 0.38,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
      floorBorder: new THREE.MeshStandardMaterial({
        color: 0xcfc6b8,
        roughness: 0.55,
        metalness: 0.02,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      }),
      joint: new THREE.MeshStandardMaterial({
        color: 0xc9c1b4,
        roughness: 0.84,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      shadowGap: new THREE.MeshStandardMaterial({
        color: 0xc9c2b6,
        roughness: 0.94,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      oculus: new THREE.MeshStandardMaterial({
        color: 0xfff8f1,
        emissive: 0xfff3e6,
        emissiveIntensity: 0.95,
        roughness: 0.5,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      well: new THREE.MeshStandardMaterial({
        color: 0xddd6cc,
        roughness: 0.82,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      cove: new THREE.MeshStandardMaterial({
        color: 0xfff6ee,
        emissive: 0xfff1e4,
        emissiveIntensity: 0.62,
        roughness: 0.45,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
    };

    this.createFloor();
    this.createShell();
    this.createWallJoints();
    this.createOculus();
    this.createSkirting();
    this.portraits = new PortraitGallery(this.wallRadius);
    this.group.add(this.portraits.group);
  }

  public setPortraitsVisible(visible: boolean): void {
    this.portraits.group.visible = visible;
  }

  public applyPalette(id: GalleryPaletteId): void {
    const palette = galleryPalette(id);
    const paint = (material: THREE.Material | undefined, color: number, extras?: {
      roughness?: number;
      metalness?: number;
      env?: number;
      emissive?: number;
      emissiveIntensity?: number;
    }) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      material.color.set(color);
      if (extras?.roughness !== undefined) material.roughness = extras.roughness;
      if (extras?.metalness !== undefined) material.metalness = extras.metalness;
      if (extras?.env !== undefined) material.envMapIntensity = extras.env;
      if (extras?.emissive !== undefined) material.emissive.set(extras.emissive);
      if (extras?.emissiveIntensity !== undefined) material.emissiveIntensity = extras.emissiveIntensity;
    };

    paint(this.materials.plaster, palette.plaster);
    paint(this.materials.brass, palette.metal, {
      roughness: palette.metalRoughness,
      metalness: palette.metalness,
      env: palette.metalEnv,
    });
    paint(this.materials.stone, palette.stone);
    paint(this.materials.floorBorder, palette.floorBorder);
    paint(this.materials.joint, palette.joint);
    paint(this.materials.shadowGap, palette.shadowGap);
    paint(this.materials.oculus, palette.oculus, {
      emissive: palette.oculusEmissive,
      emissiveIntensity: palette.oculusEmissiveIntensity,
    });
    paint(this.materials.well, palette.well);
    paint(this.materials.cove, palette.cove, {
      emissive: palette.coveEmissive,
      emissiveIntensity: palette.coveEmissiveIntensity,
    });
    paint(this.echoMat, palette.metal, {
      roughness: palette.echoRoughness,
      metalness: palette.metalness,
      env: palette.metalEnv,
    });
    paint(this.bezelMat, palette.bezel, {
      roughness: palette.bezelRoughness,
      metalness: palette.bezelMetalness,
      env: palette.bezelEnv,
    });
    if (this.floorMesh?.material instanceof THREE.MeshPhysicalMaterial) {
      this.floorMesh.material.color.set(palette.floor);
    }
    this.portraits.applyPalette(palette);
  }

  private lathe(points: THREE.Vector2[], segments = 128): THREE.LatheGeometry {
    return new THREE.LatheGeometry(points, segments);
  }

  /** 墙面垂直升起，经四分之一圆角进入浅碟穹顶，收在中央圆光口。 */
  private shellProfile(): THREE.Vector2[] {
    const pts: THREE.Vector2[] = [];
    const wallTop = 3.36;
    const wallBottom = 0.1;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(new THREE.Vector2(this.wallRadius, wallBottom + (wallTop - wallBottom) * t));
    }

    const coveR = 0.46;
    const coveSteps = 16;
    for (let i = 1; i <= coveSteps; i++) {
      const t = (i / coveSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(
        this.wallRadius - coveR + Math.cos(t) * coveR,
        wallTop + Math.sin(t) * coveR,
      ));
    }

    const rStart = this.wallRadius - coveR;
    const yStart = wallTop + coveR;
    const rEnd = 1.44;
    const rise = 0.36;
    const capSteps = 22;
    for (let i = 1; i <= capSteps; i++) {
      const t = i / capSteps;
      const eased = Math.sin(t * Math.PI / 2);
      pts.push(new THREE.Vector2(
        rStart + (rEnd - rStart) * t,
        yStart + rise * eased,
      ));
    }
    return pts;
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
      new THREE.MeshPhysicalMaterial({
        map: floorTex,
        roughnessMap,
        bumpMap,
        bumpScale: 0.002,
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0.02,
        clearcoat: 0.28,
        clearcoatRoughness: 0.42,
        envMapIntensity: 0.42,
        reflectivity: 0.4,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'reference-floor';
    this.floorMesh = floor;
    this.group.add(floor);

    const border = new THREE.Mesh(
      new THREE.RingGeometry(7.48, this.wallRadius - 0.02, 160),
      this.materials.floorBorder,
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.003;
    border.receiveShadow = true;
    border.name = 'reference-floor-border';
    this.group.add(border);

    const echoMat = (this.materials.brass as THREE.MeshStandardMaterial).clone();
    echoMat.roughness = 0.4;
    this.echoMat = echoMat;
    const echoRadius = HOLO_TABLE_RADIUS + 0.56;
    const echo = new THREE.Mesh(
      new THREE.RingGeometry(echoRadius - 0.012, echoRadius + 0.012, 160),
      echoMat,
    );
    echo.rotation.x = -Math.PI / 2;
    echo.position.y = 0.004;
    echo.name = 'floor-brass-echo';
    this.group.add(echo);
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

  private createShell(): void {
    const shell = new THREE.Mesh(this.lathe(this.shellProfile(), 160), this.materials.plaster);
    shell.name = 'reference-shell';
    shell.receiveShadow = true;
    this.group.add(shell);
  }

  /** 灯口翻进顶里：圆角收口、直筒井壁、井底发光盘。 */
  private oculusWellProfile(): THREE.Vector2[] {
    const mouth = 1.44;
    const lipY = 4.18;
    const fillet = 0.055;
    const depth = 0.36;
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(mouth + 0.05, lipY - 0.018),
    ];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(
        mouth - fillet + Math.cos(t) * fillet,
        lipY + Math.sin(t) * fillet,
      ));
    }
    const wallR = mouth - fillet;
    const wallTop = lipY + fillet + depth;
    pts.push(new THREE.Vector2(wallR, wallTop));
    pts.push(new THREE.Vector2(wallR - 0.018, wallTop + 0.014));
    pts.push(new THREE.Vector2(1.16, wallTop + 0.014));
    return pts;
  }

  private createOculus(): void {
    const ceiling = new THREE.Group();
    ceiling.name = 'reference-ceiling';

    const lipY = 4.18;
    const well = new THREE.Mesh(this.lathe(this.oculusWellProfile(), 128), this.materials.well);
    well.name = 'oculus-well';
    well.receiveShadow = true;
    ceiling.add(well);

    const diffuserY = lipY + 0.055 + 0.36 + 0.004;
    const skylight = new THREE.Mesh(this.lathe([
      new THREE.Vector2(0.01, diffuserY),
      new THREE.Vector2(1.2, diffuserY),
      new THREE.Vector2(1.218, diffuserY + 0.008),
      new THREE.Vector2(1.2, diffuserY + 0.02),
      new THREE.Vector2(0.01, diffuserY + 0.02),
    ], 96), this.materials.oculus);
    skylight.name = 'central-skylight';
    ceiling.add(skylight);

    const bezelMat = (this.materials.brass as THREE.MeshStandardMaterial).clone();
    bezelMat.color.set(0xd7b56a);
    bezelMat.roughness = 0.32;
    bezelMat.metalness = 0.42;
    bezelMat.envMapIntensity = 0.55;
    this.bezelMat = bezelMat;
    const bezel = new THREE.Mesh(this.lathe([
      new THREE.Vector2(1.4, lipY - 0.008),
      new THREE.Vector2(1.458, lipY - 0.002),
      new THREE.Vector2(1.47, lipY + 0.01),
      new THREE.Vector2(1.45, lipY + 0.022),
      new THREE.Vector2(1.39, lipY + 0.016),
      new THREE.Vector2(1.378, lipY + 0.006),
    ], 128), bezelMat);
    bezel.name = 'oculus-bezel';
    ceiling.add(bezel);

    const cove = new THREE.Mesh(new THREE.RingGeometry(7.58, 7.86, 180), this.materials.cove);
    cove.rotation.x = Math.PI / 2;
    cove.position.y = 3.735;
    cove.name = 'perimeter-cove';
    ceiling.add(cove);

    const coveLip = new THREE.Mesh(new THREE.TorusGeometry(7.87, 0.007, 8, 160), this.materials.joint);
    coveLip.rotation.x = Math.PI / 2;
    coveLip.position.y = 3.748;
    coveLip.name = 'cove-lip';
    ceiling.add(coveLip);

    this.group.add(ceiling);
  }

  /** 十二道竖缝，把圆柱收成可以读出尺度的墙面。 */
  private createWallJoints(): void {
    const count = 12;
    const height = 2.64;
    const geom = new THREE.BoxGeometry(0.007, height, 0.01);
    const mesh = new THREE.InstancedMesh(geom, this.materials.joint, count);
    mesh.name = 'wall-joints';
    const dummy = new THREE.Object3D();
    const radius = this.wallRadius - 0.016;
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * Math.PI * 2;
      dummy.position.set(Math.sin(phi) * radius, 0.22 + height / 2, -Math.cos(phi) * radius);
      dummy.rotation.y = -phi;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private createSkirting(): void {
    const base = new THREE.Group();
    base.name = 'reference-baseboard';

    const gap = new THREE.Mesh(
      new THREE.CylinderGeometry(this.wallRadius - 0.012, this.wallRadius - 0.012, 0.012, 128, 1, true),
      this.materials.shadowGap,
    );
    gap.position.y = 0.006;
    gap.name = 'shadow-gap';
    base.add(gap);

    const skirt = new THREE.Mesh(this.lathe([
      new THREE.Vector2(this.wallRadius - 0.01, 0.012),
      new THREE.Vector2(this.wallRadius - 0.045, 0.022),
      new THREE.Vector2(this.wallRadius - 0.052, 0.034),
      new THREE.Vector2(this.wallRadius - 0.052, 0.072),
      new THREE.Vector2(this.wallRadius - 0.028, 0.088),
      new THREE.Vector2(this.wallRadius - 0.006, 0.1),
    ], 128), this.materials.plaster);
    skirt.name = 'plaster-skirting';
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    base.add(skirt);

    this.group.add(base);
  }

  /** 圆形实验室没有墙面窗。接口保留，避免打开浮窗时去改建筑可见性。 */
  public setObservationWindowVisible(_visible: boolean): void {}

  public isObservationWindowVisible(): boolean {
    return true;
  }

  public update(_delta: number, _elapsed: number): void {
    // 静态建筑。实验内容由全息舞台挂到圆桌上。
  }
}
