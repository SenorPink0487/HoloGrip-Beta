import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';

/**
 * 环形纯白高精实验室场景：
 * 包含多面藻井穹顶与十字立柱采光天窗、青色基准光带、
 * 双隔间内嵌置物壁龛、条纹吸音墙板及玻璃感应门。
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;
  private observationWindowGroup: THREE.Group | null = null;

  constructor() {
    this.materials = {
      wallTitanium: new THREE.MeshStandardMaterial({ color: 0xeaf0f4, roughness: 0.58, metalness: 0.02, side: THREE.FrontSide }),
      obsidianGlass: new THREE.MeshPhysicalMaterial({
        color: 0xd8eaf4,
        roughness: 0.06,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        reflectivity: 0.90,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      wallWhite: new THREE.MeshStandardMaterial({ color: 0xe6edf2, roughness: 0.65, metalness: 0.02, side: THREE.FrontSide }),
      wallTrim: new THREE.MeshStandardMaterial({ color: 0xc4d2dc, roughness: 0.35, metalness: 0.22, side: THREE.FrontSide }),
      wallSeamDark: new THREE.MeshStandardMaterial({ color: 0x8ea2af, roughness: 0.5, metalness: 0.15, side: THREE.FrontSide }),
      aluminumTrim: new THREE.MeshStandardMaterial({ color: 0xdce4eb, roughness: 0.22, metalness: 0.50, side: THREE.FrontSide }),
      coveLight: new THREE.MeshBasicMaterial({ color: 0xfffcf7, side: THREE.DoubleSide }),
      hairlineLightSlot: new THREE.MeshBasicMaterial({ color: 0x56d4f5, side: THREE.DoubleSide, toneMapped: false }),
      wallWashCove: new THREE.MeshBasicMaterial({ color: 0xd2edfa, side: THREE.DoubleSide }),
      glassBackglow: new THREE.MeshBasicMaterial({
        color: 0x8eddf5, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      nicheInterior: new THREE.MeshStandardMaterial({ color: 0xd4dee5, roughness: 0.65, metalness: 0.02, side: THREE.FrontSide }),
      nicheWarmLight: new THREE.MeshBasicMaterial({ color: 0xffeed8, side: THREE.DoubleSide, toneMapped: false }),
      ceilingWhite: new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.60, metalness: 0.02, side: THREE.FrontSide }),
      ceilingTrim: new THREE.MeshStandardMaterial({ color: 0xcbd8e2, roughness: 0.30, metalness: 0.22, side: THREE.FrontSide }),
      ceilingGroove: new THREE.MeshBasicMaterial({ color: 0xa4b8c6, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      flutedPanel: new THREE.MeshStandardMaterial({ color: 0xe4ebf0, roughness: 0.62, metalness: 0.02, side: THREE.FrontSide }),
    };

    this.createFloor();
    this.createCeiling();
    this.createRoomWalls();
    this.createBaseboard();
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
        bumpScale: 0.003,
        roughness: 0.18,
        metalness: 0.04,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
        envMapIntensity: 0.75,
        reflectivity: 0.82,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'reference-floor';
    this.floorMesh = floor;
    this.group.add(floor);

    const seamMat = new THREE.MeshBasicMaterial({ color: 0x90a4ae, transparent: true, opacity: 0.48, depthWrite: false });
    const seams = new THREE.Group();
    seams.name = 'reference-floor-seams';
    // 地面同心圆装饰环带
    for (const radius of [1.82, 3.75, 6.25]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.008, radius + 0.008, 160), seamMat);
      ring.position.z = 0.008;
      seams.add(ring);
    }
    // 8 条径向伸缩缝
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(this.roomRadius * 1.58, 0.012), seamMat);
      line.rotation.z = (i / 8) * Math.PI;
      line.position.z = 0.009;
      seams.add(line);
    }
    // 中环上的地面定位对齐凹槽标记
    const notch = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.28), seamMat);
    notch.position.set(0, -3.75, 0.01);
    seams.add(notch);

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

  private haloTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);
    const glow = ctx.createRadialGradient(256, 256, 120, 256, 256, 256);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    glow.addColorStop(0.60, 'rgba(255,250,242,0.65)');
    glow.addColorStop(0.76, 'rgba(255,255,255,1.0)');
    glow.addColorStop(0.88, 'rgba(255,248,238,0.45)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * 连接内外半径的平滑四边形穹顶藻井环带，具备高精度建筑细节
   */
  private facetBand(innerR: number, outerR: number, segments: number, y0: number, y1: number, phase = 0): THREE.BufferGeometry {
    const positions: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = phase + (i / segments) * Math.PI * 2;
      const a1 = phase + ((i + 1) / segments) * Math.PI * 2;
      const cos0 = Math.cos(a0);
      const sin0 = Math.sin(a0);
      const cos1 = Math.cos(a1);
      const sin1 = Math.sin(a1);

      const o0 = [cos0 * outerR, y0, sin0 * outerR];
      const o1 = [cos1 * outerR, y0, sin1 * outerR];
      const i0 = [cos0 * innerR, y1, sin0 * innerR];
      const i1 = [cos1 * innerR, y1, sin1 * innerR];

      // 两个三角形拼合为平滑的四边形藻井嵌板
      positions.push(...o0, ...i0, ...o1, ...o1, ...i0, ...i1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  private createCeiling(): void {
    const ceiling = new THREE.Group();
    ceiling.name = 'reference-ceiling';

    // 1. 外侧建筑穹顶藻井环带（从墙壁向中间跨度平滑隆起）
    const outerFacets = new THREE.Mesh(
      this.facetBand(4.85, this.roomRadius - 0.04, 32, 3.86, 4.12, 0),
      this.materials.ceilingWhite,
    );
    outerFacets.name = 'ceiling-facets';
    outerFacets.receiveShadow = true;
    ceiling.add(outerFacets);

    // 精细的径向藻井阴影凹槽
    ceiling.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(outerFacets.geometry, 1),
      this.materials.ceilingGroove,
    ));

    // 2. 内侧建筑穹顶藻井环带（从跨中向天窗灯槽平滑隆起）
    const innerFacets = new THREE.Mesh(
      this.facetBand(3.32, 4.85, 32, 4.12, 4.28, 0),
      this.materials.ceilingWhite,
    );
    innerFacets.receiveShadow = true;
    ceiling.add(innerFacets);

    const innerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(innerFacets.geometry, 1),
      this.materials.ceilingGroove,
    );
    innerEdges.position.y = 0.002;
    ceiling.add(innerEdges);

    // 3. 内嵌圆形间接照明暗藏灯槽台阶
    const step = new THREE.Mesh(new THREE.RingGeometry(2.45, 3.32, 128), this.materials.ceilingWhite);
    step.rotation.x = Math.PI / 2;
    step.position.y = 4.34;
    ceiling.add(step);

    const stepLip = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.024, 12, 128), this.materials.ceilingTrim);
    stepLip.rotation.x = Math.PI / 2;
    stepLip.position.y = 4.28;
    ceiling.add(stepLip);

    // 圆形间接漫反射光晕
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(3.30, 96),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture(), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 4.33;
    halo.name = 'oculus-halo';
    ceiling.add(halo);

    // 4. 天窗边框压条
    const bezel = new THREE.Mesh(new THREE.RingGeometry(2.36, 2.45, 96), this.materials.ceilingTrim);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 4.38;
    ceiling.add(bezel);

    // 5. 中央圆形透光天窗（纯净漫射白日光盘）
    const skylight = new THREE.Mesh(
      new THREE.CircleGeometry(2.40, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }),
    );
    skylight.rotation.x = Math.PI / 2;
    skylight.position.y = 4.40;
    skylight.name = 'central-skylight';
    ceiling.add(skylight);

    const skylightRing = new THREE.Mesh(new THREE.TorusGeometry(2.40, 0.02, 12, 96), this.materials.aluminumTrim);
    skylightRing.rotation.x = Math.PI / 2;
    skylightRing.position.y = 4.39;
    ceiling.add(skylightRing);

    // 6. 8 分割径向天窗立柱骨架组件
    const cross = new THREE.Group();
    cross.name = 'skylight-cross';
    const mullionMat = new THREE.MeshStandardMaterial({
      color: 0xecf2f7, roughness: 0.28, metalness: 0.35, side: THREE.FrontSide,
    });

    // 中央圆形立柱轮毂核心
    const centerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 48), mullionMat);
    centerHub.position.y = 4.385;
    cross.add(centerHub);

    // 连接中心轮毂与外围圆环的 8 根径向辐条
    const spokeCount = 8;
    const spokeLength = 2.40 - 0.28;
    const spokeGeom = new THREE.BoxGeometry(spokeLength, 0.028, 0.04);
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i * Math.PI * 2) / spokeCount;
      const spoke = new THREE.Mesh(spokeGeom, mullionMat);
      const midDist = 0.28 + spokeLength / 2;
      spoke.position.set(Math.cos(angle) * midDist, 4.385, Math.sin(angle) * midDist);
      spoke.rotation.y = -angle;
      cross.add(spoke);
    }
    ceiling.add(cross);

    // 7. 天花板与墙壁交接处的外圈暗藏灯槽
    const perimeterCove = new THREE.Mesh(
      new THREE.TorusGeometry(this.roomRadius - 0.20, 0.04, 12, 128),
      this.materials.coveLight,
    );
    perimeterCove.rotation.x = Math.PI / 2;
    perimeterCove.position.y = 3.84;
    perimeterCove.name = 'perimeter-cove';
    ceiling.add(perimeterCove);

    this.group.add(ceiling);
  }

  private createBaseboard(): void {
    const base = new THREE.Group();
    base.name = 'reference-baseboard';
    const trim = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius - 0.03, this.roomRadius - 0.03, 0.045, 128, 1, true),
      this.materials.wallTrim,
    );
    trim.position.y = 0.022;
    base.add(trim);

    const shadowGap = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius - 0.015, this.roomRadius - 0.015, 0.012, 128, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9aa8b0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    shadowGap.position.y = 0.006;
    base.add(shadowGap);
    this.group.add(base);
  }

  private roundedShape(width: number, height: number, radius: number): THREE.Shape {
    const shape = new THREE.Shape();
    const r = Math.min(radius, width / 2 - 0.001, height / 2 - 0.001);
    const x = -width / 2;
    const y = -height / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  private roundedPanel(width: number, height: number, radius: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new THREE.ShapeGeometry(this.roundedShape(width, height, radius), 8), material);
  }

  private roundedFrame(outerW: number, outerH: number, innerW: number, innerH: number, radius: number, material: THREE.Material): THREE.Mesh {
    const shape = this.roundedShape(outerW, outerH, radius);
    const inner = this.roundedShape(innerW, innerH, Math.max(0.04, radius * 0.72));
    const hole = new THREE.Path(inner.getPoints(40).reverse());
    shape.holes.push(hole);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), material);
  }

  /** phi = 0 面向后墙 (−Z)。正 phi 偏向 +X（屏幕右侧）。局部 +Z 指向室内。 */
  private mountOnWall(phi: number, y: number, radius: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(Math.sin(phi) * radius, y, -Math.cos(phi) * radius);
    group.rotation.y = -phi;
    return group;
  }

  private createRoomWalls(): void {
    const walls = new THREE.Group();
    walls.name = 'reference-walls';

    const shellHeight = 3.9;
    const shellMat = (this.materials.wallWhite as THREE.MeshStandardMaterial).clone();
    shellMat.side = THREE.BackSide;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius, this.roomRadius, shellHeight, 160, 1, true),
      shellMat,
    );
    shell.position.y = shellHeight / 2;
    shell.receiveShadow = true;
    shell.name = 'reference-shell';
    walls.add(shell);

    this.createPanelJoints(walls);
    this.createRibbedWallPanels(walls);

    const cyanSlotMat = (this.materials.hairlineLightSlot as THREE.MeshBasicMaterial).clone();
    cyanSlotMat.side = THREE.BackSide;
    const cyanSlot = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius - 0.02, this.roomRadius - 0.02, 0.02, 160, 1, true),
      cyanSlotMat,
    );
    cyanSlot.position.y = 3.42;
    cyanSlot.name = 'upper-cyan-light-slot';
    walls.add(cyanSlot);

    const cyanGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius - 0.045, this.roomRadius - 0.045, 0.055, 128, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x9ae8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    cyanGlow.position.y = 3.42;
    walls.add(cyanGlow);

    this.createObservationWindow(walls);
    this.createSideNiches(walls);
    this.createEntryDoor(walls);
    this.createVerticalCyanLights(walls);
    this.group.add(walls);
  }

  /**
   * 建筑立面各功能舱位分布：
   * phi 0：带背光远景的观察视窗
   * phi +-0.38：竖向条纹质感墙板
   * phi +-0.66：垂直青色基准 LED 灯带凹槽
   * phi +-0.92：深凹带照明置物壁龛（左侧壁龛内嵌全息 HUD 屏幕）
   * phi 1.42：带圆角与内嵌把手的玻璃感应移门
   */
  private featureLayout() {
    const y = 2.15;
    return {
      y,
      window: { phi: 0, width: 2.85, height: 1.25, y },
      niche: { width: 2.25, height: 1.36, y, phis: [0.92, -0.92, 2.25, -2.25] as const },
      cyan: [0.66, -0.66, 1.20, -1.22] as const,
      door: { phi: 1.42, width: 1.45, height: 2.62, y: 1.36 },
    };
  }

  private wallHalfAngle(width: number, radius: number): number {
    return Math.atan((width / 2) / radius);
  }

  private blockedWallSpans(): Array<[number, number]> {
    const layout = this.featureLayout();
    const radius = this.roomRadius - 0.16;
    const spans: Array<[number, number]> = [];
    const block = (phi: number, width: number, pad = 0.045) => {
      const half = this.wallHalfAngle(width, radius) + pad;
      spans.push([phi - half, phi + half]);
    };
    block(layout.window.phi, layout.window.width, 0.05);
    for (const phi of layout.niche.phis) block(phi, layout.niche.width);
    for (const phi of layout.cyan) block(phi, 0.14, 0.02);
    block(layout.door.phi, layout.door.width, 0.06);
    return spans;
  }

  private spanContains(phi: number, span: [number, number]): boolean {
    const wrap = (angle: number) => {
      let value = angle;
      while (value > Math.PI) value -= Math.PI * 2;
      while (value < -Math.PI) value += Math.PI * 2;
      return value;
    };
    const target = wrap(phi);
    const start = wrap(span[0]);
    const end = wrap(span[1]);
    if (start <= end) return target >= start && target <= end;
    return target >= start || target <= end;
  }

  private createPanelJoints(walls: THREE.Group): void {
    const spans = this.blockedWallSpans();
    const seamMat = new THREE.MeshBasicMaterial({ color: 0xc5d0d6, transparent: true, opacity: 0.4 });
    const count = 24;
    for (let i = 0; i < count; i++) {
      const phi = -Math.PI + (i / count) * Math.PI * 2;
      if (spans.some(span => this.spanContains(phi, span))) continue;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 3.05, 0.01), seamMat);
      const radius = this.roomRadius - 0.012;
      seam.position.set(Math.sin(phi) * radius, 1.72, -Math.cos(phi) * radius);
      seam.rotation.y = -phi;
      walls.add(seam);
    }
  }

  /**
   * 位于视窗与壁龛两侧的竖向条纹质感墙板
   */
  private createRibbedWallPanels(walls: THREE.Group): void {
    const panels = [
      { phi: -0.38, width: 1.15, count: 18 },
      { phi: 0.38, width: 1.15, count: 18 },
      { phi: -1.48, width: 1.35, count: 20 },
      { phi: 2.55, width: 1.45, count: 22 },
      { phi: -2.55, width: 1.45, count: 22 },
    ];
    const slatH = 2.45;
    const slatW = 0.024;
    const slatD = 0.022;
    const slatMat = this.materials.flutedPanel || this.materials.wallWhite;
    const slatGeom = new THREE.BoxGeometry(slatW, slatH, slatD);

    const dummy = new THREE.Object3D();
    for (const p of panels) {
      const mount = this.mountOnWall(p.phi, 2.15, this.roomRadius - 0.04);
      mount.name = `ribbed-panel-phi-${Math.round(p.phi * 100)}`;

      const step = p.width / (p.count - 1);
      const startX = -p.width / 2;
      const instMesh = new THREE.InstancedMesh(slatGeom, slatMat, p.count);
      instMesh.castShadow = false;
      instMesh.receiveShadow = true;
      for (let i = 0; i < p.count; i++) {
        dummy.position.set(startX + i * step, 0, 0.012);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }
      instMesh.instanceMatrix.needsUpdate = true;
      mount.add(instMesh);
      walls.add(mount);
    }
  }

  private createObservationWindow(walls: THREE.Group): void {
    const { window: spec } = this.featureLayout();
    const { width, height } = spec;
    const mount = this.mountOnWall(spec.phi, spec.y, this.roomRadius - 0.2);
    mount.name = 'central-observation-window';

    const frame = this.roundedFrame(width, height, width - 0.16, height - 0.14, 0.24, this.materials.wallTrim);
    frame.position.z = 0.02;
    frame.name = 'central-observation-window-frame';
    mount.add(frame);

    const bead = this.roundedFrame(width - 0.16, height - 0.14, width - 0.24, height - 0.22, 0.18, this.materials.aluminumTrim);
    bead.position.z = 0.012;
    mount.add(bead);

    // 全景无尘实验室观察窗背景
    const obsTex = TextureGenerator.createWindowObservationTexture();
    const obsMat = new THREE.MeshBasicMaterial({
      map: obsTex,
      side: THREE.DoubleSide,
    });
    const back = this.roundedPanel(width - 0.28, height - 0.26, 0.16, obsMat);
    back.position.z = -0.14;
    mount.add(back);

    const glass = this.roundedPanel(width - 0.26, height - 0.24, 0.16, this.materials.obsidianGlass);
    glass.position.z = 0.004;
    glass.name = 'central-observation-window-glass';
    mount.add(glass);

    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.62, 0.014), this.materials.glassBackglow);
    reflection.position.set(0, 0.02, 0.028);
    mount.add(reflection);

    walls.add(mount);
    this.observationWindowGroup = mount;
  }

  public setObservationWindowVisible(visible: boolean): void {
    if (this.observationWindowGroup) {
      this.observationWindowGroup.visible = visible;
    }
  }

  private createSideNiches(walls: THREE.Group): void {
    const { niche } = this.featureLayout();
    const labels = ['right', 'left', 'quarter-right', 'quarter-left'] as const;
    niche.phis.forEach((phi, index) => {
      const label = labels[index];
      const { width, height } = niche;
      const mount = this.mountOnWall(phi, niche.y, this.roomRadius - 0.18);
      mount.name = `side-niche-${label}`;

      const shadow = this.roundedPanel(width + 0.08, height + 0.08, 0.26, new THREE.MeshBasicMaterial({
        color: 0x93a3ac, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide,
      }));
      shadow.position.z = -0.02;
      mount.add(shadow);

      const frame = this.roundedFrame(width, height, width - 0.14, height - 0.12, 0.2, this.materials.wallTrim);
      frame.position.z = 0.018;
      frame.name = `side-niche-frame-${label}`;
      mount.add(frame);

      const interior = this.roundedPanel(width - 0.2, height - 0.18, 0.14, new THREE.MeshStandardMaterial({
        color: 0xc5d3dc, roughness: 0.7, metalness: 0.02, side: THREE.FrontSide,
      }));
      interior.position.z = -0.16;
      mount.add(interior);

      const returnMat = this.materials.wallWhite;
      const inset = 0.2;
      const sideReturn = new THREE.Mesh(new THREE.BoxGeometry(0.028, height - inset * 2, 0.16), returnMat);
      sideReturn.position.set(-width / 2 + 0.11, 0, -0.07);
      const sideReturnRight = sideReturn.clone();
      sideReturnRight.position.x *= -1;
      const head = new THREE.Mesh(new THREE.BoxGeometry(width - inset * 2, 0.028, 0.16), returnMat);
      head.position.set(0, height / 2 - 0.1, -0.07);
      const sill = head.clone();
      sill.position.y *= -1;
      mount.add(sideReturn, sideReturnRight, head, sill);

      const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.018, 0.14), this.materials.wallWhite);
      shelf.position.set(0, 0.02, -0.07);
      shelf.name = `side-niche-shelf-${label}`;
      mount.add(shelf);

      // 左侧壁龛内嵌浮空全息遥测 HUD 屏幕
      if (label === 'left') {
        const hudTex = TextureGenerator.createNicheHudTexture();
        const hudMat = new THREE.MeshBasicMaterial({
          map: hudTex,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const hudPlane = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.72, height * 0.52), hudMat);
        hudPlane.position.set(-width * 0.08, -0.02, 0.04);
        mount.add(hudPlane);
      }

      const lightWidth = width - 0.5;
      const upperGlow = new THREE.Mesh(new THREE.BoxGeometry(lightWidth, 0.035, 0.045), this.materials.nicheWarmLight);
      upperGlow.position.set(0, height / 2 - 0.2, -0.05);
      mount.add(upperGlow);

      const lowerGlow = new THREE.Mesh(new THREE.BoxGeometry(lightWidth, 0.032, 0.04), this.materials.nicheWarmLight);
      lowerGlow.position.set(0, -0.08, -0.045);
      lowerGlow.name = `side-niche-warm-shelf-${label}`;
      mount.add(lowerGlow);

      walls.add(mount);
    });
  }

  private createEntryDoor(walls: THREE.Group): void {
    const { door } = this.featureLayout();
    const { width, height } = door;
    const mount = this.mountOnWall(door.phi, door.y, this.roomRadius - 0.16);
    mount.name = 'right-entry-door';

    const seal = this.roundedPanel(width + 0.1, height + 0.08, 0.22, this.materials.wallSeamDark);
    seal.position.z = -0.15;
    mount.add(seal);

    const frame = this.roundedFrame(width, height, width - 0.14, height - 0.12, 0.16, this.materials.aluminumTrim);
    frame.position.z = 0.02;
    frame.name = 'right-entry-door-frame';
    mount.add(frame);

    const glass = this.roundedPanel(width - 0.18, height - 0.16, 0.12, this.materials.obsidianGlass);
    glass.position.z = 0.004;
    glass.name = 'right-entry-door-glass';
    mount.add(glass);

    // 垂直内凹门把手
    const handleMat = this.materials.wallTrim;
    const handleRecess = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.02), handleMat);
    handleRecess.position.set(-width / 2 + 0.12, 0, 0.03);
    mount.add(handleRecess);

    walls.add(mount);
  }

  private createVerticalCyanLights(walls: THREE.Group): void {
    const layout = this.featureLayout();
    const slots = [
      { phi: layout.cyan[1], name: 'vertical-cyan-light-left' },
      { phi: layout.cyan[0], name: 'vertical-cyan-light-right' },
      { phi: layout.cyan[2], name: 'vertical-cyan-light-rear-right' },
      { phi: layout.cyan[3], name: 'vertical-cyan-light-rear-left' },
    ];
    const height = 3.28;
    for (const slot of slots) {
      const radius = this.roomRadius - 0.02;
      const group = new THREE.Group();
      group.name = slot.name;
      group.position.set(Math.sin(slot.phi) * radius, 1.74, -Math.cos(slot.phi) * radius);
      group.rotation.y = -slot.phi;

      const core = new THREE.Mesh(new THREE.BoxGeometry(0.014, height, 0.01), this.materials.hairlineLightSlot);
      group.add(core);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07, height - 0.08),
        new THREE.MeshBasicMaterial({
          color: 0x9ae8ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      glow.position.z = 0.012;
      group.add(glow);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), this.materials.aluminumTrim);
      cap.position.y = height / 2;
      const foot = cap.clone();
      foot.position.y = -height / 2;
      group.add(cap, foot);
      walls.add(group);
    }
  }

  public update(_delta: number, _elapsed: number): void {
    // 静态建筑结构；动态实验交互内容由全息舞台呈现。
  }
}
