import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';

/**
 * 圆形展厅：一整圈连续灰泥壳、浅碟穹顶与中央圆光，
 * 地面只留一圈石材边带。实验发生在房间中心的圆桌上。
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;

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
        color: 0xddd4c6,
        roughness: 0.5,
        metalness: 0.02,
        envMapIntensity: 0.2,
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
        emissiveIntensity: 0.82,
        roughness: 0.62,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      cove: new THREE.MeshStandardMaterial({
        color: 0xfff6ee,
        emissive: 0xfff1e4,
        emissiveIntensity: 0.28,
        roughness: 0.45,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
    };

    this.createFloor();
    this.createShell();
    this.createOculus();
    this.createSkirting();
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
    const rEnd = 1.3;
    const rise = 0.36;
    const lipY = yStart + rise;
    const capSteps = 22;
    for (let i = 1; i <= capSteps; i++) {
      const t = i / capSteps;
      const eased = Math.sin(t * Math.PI / 2);
      pts.push(new THREE.Vector2(
        rStart + (rEnd - rStart) * t,
        yStart + rise * eased,
      ));
    }
    pts.push(new THREE.Vector2(1.16, lipY));
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
      new THREE.RingGeometry(7.78, this.wallRadius - 0.02, 160),
      this.materials.floorBorder,
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.003;
    border.receiveShadow = true;
    border.name = 'reference-floor-border';
    this.group.add(border);
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

  private createOculus(): void {
    const ceiling = new THREE.Group();
    ceiling.name = 'reference-ceiling';

    const lipY = 4.18;
    const skylight = new THREE.Mesh(new THREE.CircleGeometry(1.2, 96), this.materials.oculus);
    skylight.rotation.x = Math.PI / 2;
    skylight.position.y = lipY - 0.012;
    skylight.name = 'central-skylight';
    ceiling.add(skylight);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.011, 12, 128), this.materials.brass);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = lipY - 0.02;
    bezel.name = 'oculus-bezel';
    ceiling.add(bezel);

    const cove = new THREE.Mesh(new THREE.TorusGeometry(7.856, 0.012, 10, 180), this.materials.cove);
    cove.rotation.x = Math.PI / 2;
    cove.position.y = 3.7;
    cove.name = 'perimeter-cove';
    ceiling.add(cove);

    this.group.add(ceiling);
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

  /** 圆形展厅没有墙面窗。接口保留，避免打开浮窗时去改建筑可见性。 */
  public setObservationWindowVisible(_visible: boolean): void {}

  public isObservationWindowVisible(): boolean {
    return true;
  }

  public update(_delta: number, _elapsed: number): void {
    // 静态建筑。实验内容由全息舞台挂到圆桌上。
  }
}
