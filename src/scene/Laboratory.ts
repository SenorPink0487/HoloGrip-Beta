import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';
import { createCeilingMaterials, createLaboratoryCeiling } from './LaboratoryCeiling.ts';
import { createWallMaterials, createLaboratoryWallPanels, createLaboratoryBaseboard, LAB_WALLS } from './LaboratoryWalls.ts';

/**
 * 纯白极简未来主义圆形实验室场景（参考图：Apple-style 穹顶同心光环实验室）：
 * 包含同心环形灯槽吊顶与五向银灰分隔肋、
 * 高反射环氧自流平地面带深色嵌条导轨、
 * 墙上无任何装饰，保持一个平滑完整的纯白正圆。
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;

  constructor() {
    this.materials = {
      // ── 墙面材质（参考图纯净冰灰太空舱配色体系） ──
      wallTitanium: new THREE.MeshStandardMaterial({
        color: 0xc4d1de,
        emissive: 0x182636,
        emissiveIntensity: 0.28,
        roughness: 0.38,
        metalness: 0.20,
        side: THREE.FrontSide,
      }),
      ...createWallMaterials(),
      // 精密铝压条
      aluminumTrim: new THREE.MeshStandardMaterial({ color: 0xedf3f8, roughness: 0.18, metalness: 0.88, side: THREE.FrontSide }),

      // ── 光源材质（参考图中的纯净冷白冰光带） ──
      coveLight: new THREE.MeshBasicMaterial({ color: 0xf0f7ff, side: THREE.DoubleSide }),
      // 高科技冷调冰白窄缝光槽
      hairlineLightSlot: new THREE.MeshBasicMaterial({ color: 0xebf5ff, side: THREE.DoubleSide, toneMapped: false }),
      wallWashCove: new THREE.MeshBasicMaterial({ color: 0x14283c, side: THREE.DoubleSide }),
      // ── 壁龛与功能区 ──
      nicheInterior: new THREE.MeshStandardMaterial({ color: 0x182434, roughness: 0.55, metalness: 0.15, side: THREE.FrontSide }),
      nicheWarmLight: new THREE.MeshBasicMaterial({ color: 0x8ae6ff, side: THREE.DoubleSide, toneMapped: false }),

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
   *  ▼ 墙面系统 — 纯白极简平滑完整正圆墙面
   *    墙上无任何装饰与分缝，保持极致平滑、纯净无瑕的 360° 正圆柱面
   * ═══════════════════════════════════════════════════════════════════ */
  private createRoomWalls(): void {
    const walls = new THREE.Group();
    walls.name = 'reference-walls';

    // 基础室内圆柱外壳（室内哑光基底层，对齐参考图纯净冷灰太空舱配色）
    const shellHeight = 3.9;
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xc4d1de,
      emissive: 0x182636,
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0.20,
      side: THREE.BackSide,
    });
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius + 0.01, this.roomRadius + 0.01, shellHeight, 128, 1, true),
      shellMat,
    );
    shell.position.y = shellHeight / 2;
    shell.receiveShadow = true;
    shell.name = 'reference-shell';
    shell.visible = false;
    walls.add(shell);

    // 纯白平滑完整正圆墙面系统（墙上无任何装饰，纯净平滑正圆）
    walls.add(createLaboratoryWallPanels(this.materials));

    // 天花板边缘隐藏式冷调冰白反光暗槽（保持结构供天花板反射与测试，视觉不外露）
    const warmSlotMat = this.materials.hairlineLightSlot.clone() as THREE.MeshBasicMaterial;
    warmSlotMat.side = THREE.BackSide;
    const warmSlot = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius + 0.012, this.roomRadius + 0.012, 0.012, 160, 1, true),
      warmSlotMat,
    );
    warmSlot.position.y = 3.90;
    warmSlot.name = 'upper-cyan-light-slot';
    warmSlot.visible = false;
    walls.add(warmSlot);

    // 沿弧形天际线的漫射微光槽（参考图顶部天际线柔和下照冷白光晕）
    const washHeight = 0.40;
    const washGeometry = new THREE.CylinderGeometry(this.roomRadius - 0.012, this.roomRadius - 0.012, washHeight, 128, 12, true);
    const warmGlow = new THREE.Mesh(
      washGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xd8eaf8, transparent: true, opacity: 0.24, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    warmGlow.position.y = 3.89 - washHeight / 2;
    warmGlow.name = 'ceiling-wall-wash';
    warmGlow.visible = false;
    walls.add(warmGlow);

    // 内部壁龛保持结构可用但默认隐藏（纯平滑墙面）
    this.createSideNiches(walls);
    // 平齐门系统结构保留供测试与架构引用，默认隐藏以保持平滑圆墙面
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
        color: 0x14202e, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide,
      }));
      shadow.position.z = -0.02;
      mount.add(shadow);

      const frame = this.roundedFrame(width, height, width - 0.14, height - 0.12, 0.2, this.materials.wallTrim);
      frame.position.z = 0.018;
      frame.name = `side-niche-frame-${label}`;
      mount.add(frame);

      const interior = this.roundedPanel(width - 0.2, height - 0.18, 0.14, new THREE.MeshStandardMaterial({
        color: 0x182436, roughness: 0.55, metalness: 0.20, side: THREE.FrontSide,
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
   *  ▼ 入口平齐建筑门 — Apple Park 标志性室内平齐一体化极简门
   *    融入墙面垂直微缝节奏，配备纯白高精缎面板、全高 316L 不锈钢管状拉手与微倒角五金
   * ═══════════════════════════════════════════════════════════════════ */
  private createEntryDoor(walls: THREE.Group): void {
    const { door } = this.featureLayout();
    const { width, height } = door;
    const mount = this.mountOnWall(door.phi, door.y, LAB_WALLS.faceRadius + 0.012);
    mount.name = 'right-entry-door';

    // 1. 极简航天铝微倒角门框套口（Slim Anodized Aluminum Portal Trim）
    const frameShape = this.roundedShape(width + 0.04, height + 0.04, 0.012);
    const innerPoints = this.roundedShape(width, height, 0.006).getPoints(24).reverse();
    frameShape.holes.push(new THREE.Path(innerPoints));

    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.038,
      bevelEnabled: true,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      bevelSegments: 2,
    });
    const frame = new THREE.Mesh(frameGeo, this.materials.mullionSilver ?? this.materials.wallTrim);
    frame.position.z = 0.010;
    frame.name = 'right-entry-door-frame';
    frame.castShadow = true;
    mount.add(frame);

    // 2. 纯白极简缎面平齐门翼（Satin White Architectural Flush Door Leaf）
    const leafGeo = new THREE.BoxGeometry(width - 0.016, height - 0.016, 0.032);
    const leaf = new THREE.Mesh(leafGeo, this.materials.wallWhite);
    leaf.position.z = 0.024;
    leaf.name = 'right-entry-door-leaf';
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    mount.add(leaf);

    // 3. Apple 标志性 316L 不锈钢垂直管状长把手（Ø28mm Stainless Pull Bars）
    const handleMat = this.materials.chromeSteel ?? new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.98,
    });
    const handleHeight = 2.10;
    const handleRadius = 0.014;

    for (const sign of [-1, 1]) {
      const hx = sign * 0.14;
      // 垂直把手主柱
      const barGeo = new THREE.CylinderGeometry(handleRadius, handleRadius, handleHeight, 16);
      barGeo.translate(hx, 0, 0.062);
      const bar = new THREE.Mesh(barGeo, handleMat);
      bar.castShadow = true;
      mount.add(bar);

      // 上下精密机加工不锈钢支座（Standoff Brackets）
      for (const sy of [-handleHeight * 0.38, handleHeight * 0.38]) {
        const standoffGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.032, 12);
        standoffGeo.rotateX(Math.PI / 2);
        standoffGeo.translate(hx, sy, 0.046);
        const standoff = new THREE.Mesh(standoffGeo, handleMat);
        standoff.castShadow = true;
        mount.add(standoff);
      }
    }

    // 4. 地坪不锈钢转轴五金件与平整导轨（Flush Stainless Threshold & Pivot Patches）
    for (const px of [-width / 2 + 0.10, width / 2 - 0.10]) {
      const patchGeo = new THREE.BoxGeometry(0.10, 0.028, 0.034);
      patchGeo.translate(px, -height / 2 + 0.014, 0.024);
      const patch = new THREE.Mesh(patchGeo, handleMat);
      mount.add(patch);
    }

    // 默认隐藏门体与把手五金（墙上无任何装饰，保持一个平滑完整的圆）
    mount.visible = false;

    walls.add(mount);
  }

  public update(_delta: number, _elapsed: number): void {
    // 静态建筑结构；动态实验交互内容由全息舞台呈现。
  }
}
