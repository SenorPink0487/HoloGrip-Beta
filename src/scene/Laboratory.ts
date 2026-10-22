import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';
import { createCeilingMaterials, createLaboratoryCeiling } from './LaboratoryCeiling.ts';
import { createWallMaterials, createLaboratoryWallPanels, createLaboratoryBaseboard, LAB_WALLS } from './LaboratoryWalls.ts';

/**
 * 纯白极简未来主义圆形实验室场景（参考图：Apple-style 穹顶同心光环实验室）：
 * 包含同心环形灯槽吊顶与五向银灰分隔肋、
 * 高反射环氧自流平地面带深色嵌条导轨、
 * 竖向分板式洁白墙面与隐入式实心滑门。
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;

  constructor() {
    this.materials = {
      // ── 墙面材质 ──
      wallTitanium: new THREE.MeshStandardMaterial({ color: 0xeaf0f4, roughness: 0.58, metalness: 0.02, side: THREE.FrontSide }),
      ...createWallMaterials(),
      // 精密铝压条
      aluminumTrim: new THREE.MeshStandardMaterial({ color: 0xdce4eb, roughness: 0.22, metalness: 0.50, side: THREE.FrontSide }),

      // ── 光源材质 ──
      coveLight: new THREE.MeshBasicMaterial({ color: 0xfffcf7, side: THREE.DoubleSide }),
      // 参考图中的天花板灯带为纯白暖调
      hairlineLightSlot: new THREE.MeshBasicMaterial({ color: 0xfff8ee, side: THREE.DoubleSide, toneMapped: false }),
      wallWashCove: new THREE.MeshBasicMaterial({ color: 0xfaf6f0, side: THREE.DoubleSide }),
      // ── 壁龛与功能区 ──
      nicheInterior: new THREE.MeshStandardMaterial({ color: 0xd4dee5, roughness: 0.65, metalness: 0.02, side: THREE.FrontSide }),
      nicheWarmLight: new THREE.MeshBasicMaterial({ color: 0xffeed8, side: THREE.DoubleSide, toneMapped: false }),

      ...createCeilingMaterials(),
      // 地面嵌条
      floorInlay: new THREE.MeshStandardMaterial({
        color: 0x5a636c,
        roughness: 0.28,
        metalness: 0.45,
        side: THREE.FrontSide,
      }),
      // 竖向条纹面板
      flutedPanel: new THREE.MeshStandardMaterial({ color: 0xe4ebf0, roughness: 0.62, metalness: 0.02, side: THREE.FrontSide }),
    };

    this.createFloor();
    this.createCeiling();
    this.createRoomWalls();
    this.createBaseboard();
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 地面系统 — 高反射抛光环氧自流平地面 + 深色同心嵌条导轨
   * ═══════════════════════════════════════════════════════════════════ */
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
        bumpScale: 0.0015,
        roughness: 0.10,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.0,
        reflectivity: 0.98,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'reference-floor';
    this.floorMesh = floor;
    this.group.add(floor);

    const seamMat = new THREE.MeshBasicMaterial({ color: 0x8294a0, transparent: true, opacity: 0.45, depthWrite: false });
    const seams = new THREE.Group();
    seams.name = 'reference-floor-seams';

    // 参考图中标志性的地面深色同心圆嵌条（约 60% 半径处）
    const inlay = new THREE.Mesh(new THREE.RingGeometry(4.71, 4.79, 160), this.materials.floorInlay);
    inlay.position.z = 0.008;
    inlay.name = 'floor-inlay-ring';
    seams.add(inlay);

    // 嵌条内外精密微倒角工艺缝
    const inlayInnerLip = new THREE.Mesh(new THREE.RingGeometry(4.704, 4.71, 160), seamMat);
    inlayInnerLip.position.z = 0.0082;
    const inlayOuterLip = new THREE.Mesh(new THREE.RingGeometry(4.79, 4.796, 160), seamMat);
    inlayOuterLip.position.z = 0.0082;
    seams.add(inlayInnerLip, inlayOuterLip);

    // 外围同心细环基准缝（呼应墙面下沿）
    const outerSeam = new THREE.Mesh(new THREE.RingGeometry(6.592, 6.608, 160), seamMat);
    outerSeam.position.z = 0.008;
    seams.add(outerSeam);

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

  /** Reference ceiling: opaque disc, five silver bridges and recessed concentric lighting. */
  private createCeiling(): void {
    this.group.add(createLaboratoryCeiling(this.materials));
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 踢脚线系统
   * ═══════════════════════════════════════════════════════════════════ */
  private createBaseboard(): void {
    this.group.add(createLaboratoryBaseboard(this.materials));
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 形状工具辅助函数
   * ═══════════════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 墙面系统 — 竖向分板式纯白洁净墙面
   *    参考图风格：规整的竖向矩形面板，细缝分隔，纯白无装饰
   * ═══════════════════════════════════════════════════════════════════ */
  private createRoomWalls(): void {
    const walls = new THREE.Group();
    walls.name = 'reference-walls';

    // 基础圆柱外壳
    const shellHeight = 3.9;
    const shellMat = this.materials.wallSeamDark.clone();
    shellMat.side = THREE.BackSide;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius, this.roomRadius, shellHeight, 160, 1, true),
      shellMat,
    );
    shell.position.y = shellHeight / 2;
    shell.receiveShadow = true;
    shell.name = 'reference-shell';
    walls.add(shell);

    // Closed, chamfered wall panels with physically proud vertical piers.
    walls.add(createLaboratoryWallPanels(this.materials));

    // Conceal the emitter behind the wall/ceiling return. A bare ring at 3.42 m
    // became a second long bright stripe directly in the normal experiment view.
    const warmSlotMat = this.materials.hairlineLightSlot.clone() as THREE.MeshBasicMaterial;
    warmSlotMat.side = THREE.BackSide;
    const warmSlot = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius + 0.012, this.roomRadius + 0.012, 0.012, 160, 1, true),
      warmSlotMat,
    );
    warmSlot.position.y = 3.90;
    warmSlot.name = 'upper-cyan-light-slot';
    walls.add(warmSlot);

    // A graduated wash fades down the wall instead of exposing another LED line.
    const washHeight = 0.22;
    const washGeometry = new THREE.CylinderGeometry(this.roomRadius - 0.012, this.roomRadius - 0.012, washHeight, 128, 12, true);
    const washPositions = washGeometry.getAttribute('position');
    const washColors = new Float32Array(washPositions.count * 3);
    for (let i = 0; i < washPositions.count; i++) {
      const t = (washPositions.getY(i) + washHeight / 2) / washHeight;
      const strength = t * t;
      washColors.set([strength, strength, strength], i * 3);
    }
    washGeometry.setAttribute('color', new THREE.BufferAttribute(washColors, 3));
    const warmGlow = new THREE.Mesh(
      washGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xfff5e6, vertexColors: true, transparent: true, opacity: 0.14, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    warmGlow.position.y = 3.89 - washHeight / 2;
    warmGlow.name = 'ceiling-wall-wash';
    walls.add(warmGlow);

    // Hidden legacy niches remain available to the experiment architecture.
    this.createSideNiches(walls);
    // 参考图中右侧可见的内嵌式滑门
    this.createEntryDoor(walls);

    this.group.add(walls);
  }

  /**
   * 建筑立面各功能舱位分布：
   * phi +-0.92：深凹带照明置物壁龛
   * phi ≈ 0.96：带细倒角边框与内凹把手的实心滑门
   */
  private featureLayout() {
    const y = 2.15;
    return {
      y,
      niche: { width: 2.25, height: 1.36, y, phis: [0.92, -0.92, 2.25, -2.25] as const },
      cyan: [0.66, -0.66, 1.20, -1.22] as const,
      door: { phi: LAB_WALLS.doorAngle, width: LAB_WALLS.doorWidth, height: LAB_WALLS.doorHeight, y: LAB_WALLS.doorBottom + LAB_WALLS.doorHeight / 2 },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 壁龛系统（默认隐藏 — 参考图为纯净白墙）
   * ═══════════════════════════════════════════════════════════════════ */
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

      // 默认隐藏壁龛 — 参考图为纯净白墙
      mount.visible = false;

      walls.add(mount);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  ▼ 入口滑门 — 参考图中右侧可见的极简嵌入式滑门
   * ═══════════════════════════════════════════════════════════════════ */
  private createEntryDoor(walls: THREE.Group): void {
    const { door } = this.featureLayout();
    const { width, height } = door;
    const mount = this.mountOnWall(door.phi, door.y, LAB_WALLS.faceRadius + 0.025);
    mount.name = 'right-entry-door';

    const solid = (shape: THREE.Shape, depth: number, material: THREE.Material | THREE.Material[]) => {
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003,
        bevelSegments: 3, curveSegments: 6, steps: 1,
      }), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const hole = (shape: THREE.Shape, w: number, h: number, radius: number, x = 0, y = 0) => {
      const points = this.roundedShape(w, h, radius).getPoints(24).reverse();
      points.forEach(point => point.add(new THREE.Vector2(x, y)));
      shape.holes.push(new THREE.Path(points));
    };

    const seal = solid(this.roundedShape(width + 0.06, height + 0.06, 0.018), 0.012, this.materials.wallSeamDark);
    mount.add(seal);
    const frameShape = this.roundedShape(width + 0.04, height + 0.04, 0.018);
    hole(frameShape, width, height, 0.010);
    const frame = solid(frameShape, 0.025, this.materials.wallTrim);
    frame.position.z = 0.021;
    frame.name = 'right-entry-door-frame';
    mount.add(frame);

    // Solid silver leaf; the observation window has been removed and filled.
    const leafShape = this.roundedShape(width - 0.010, height - 0.010, 0.012);
    for (const sign of [-1, 1]) hole(leafShape, 0.031, 0.23, 0.007, sign * (width / 2 - 0.105), -0.12);
    const leaf = solid(leafShape, 0.037, [this.materials.wallWhite, this.materials.wallPanelReturn]);
    leaf.name = 'right-entry-door-leaf';
    mount.add(leaf);

    // Recessed finger pulls sit behind the leaf face rather than protruding handles.
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x727a80, roughness: 0.47, metalness: 0.35 });
    for (const sign of [-1, 1]) {
      const channel = solid(this.roundedShape(0.031, 0.23, 0.007), 0.004, handleMaterial);
      channel.position.set(sign * (width / 2 - 0.105), -0.12, 0.020);
      mount.add(channel);
    }
    walls.add(mount);
  }

  public update(_delta: number, _elapsed: number): void {
    // 静态建筑结构；动态实验交互内容由全息舞台呈现。
  }
}
