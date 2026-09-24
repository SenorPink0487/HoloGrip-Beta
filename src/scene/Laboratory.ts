import * as THREE from 'three';
import { TextureGenerator } from './Textures.ts';

/**
 * Circular white laboratory matched to the reference chamber:
 * faceted ceiling and cross-mullion oculus, a single cyan datum line,
 * recessed double-bay shelves, ribbed wall panels and a glazed entry.
 */
export class Laboratory {
  public readonly group = new THREE.Group();
  public readonly roomRadius = 8.2;
  public readonly roomHeight = 4.4;

  public materials: Record<string, THREE.Material>;
  private floorMesh: THREE.Mesh | null = null;

  constructor() {
    this.materials = {
      wallTitanium: new THREE.MeshStandardMaterial({ color: 0xf3f6f8, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide }),
      obsidianGlass: new THREE.MeshPhysicalMaterial({
        color: 0xd5e4ee, roughness: 0.08, metalness: 0.04, transmission: 0.42,
        thickness: 0.12, ior: 1.48, transparent: true, opacity: 0.62,
        clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15, side: THREE.DoubleSide,
      }),
      wallWhite: new THREE.MeshStandardMaterial({ color: 0xe7eef2, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide }),
      wallTrim: new THREE.MeshStandardMaterial({ color: 0xc3ced6, roughness: 0.4, metalness: 0.22, side: THREE.DoubleSide }),
      wallSeamDark: new THREE.MeshStandardMaterial({ color: 0xa9b7c0, roughness: 0.55, metalness: 0.12, side: THREE.DoubleSide }),
      aluminumTrim: new THREE.MeshStandardMaterial({ color: 0xdfe6eb, roughness: 0.28, metalness: 0.48, side: THREE.DoubleSide }),
      coveLight: new THREE.MeshBasicMaterial({ color: 0xfffdf8, side: THREE.DoubleSide }),
      hairlineLightSlot: new THREE.MeshBasicMaterial({ color: 0x8ce8ff, side: THREE.DoubleSide, toneMapped: false }),
      wallWashCove: new THREE.MeshBasicMaterial({ color: 0xc8f2ff, side: THREE.DoubleSide }),
      glassBackglow: new THREE.MeshBasicMaterial({
        color: 0xb7e7ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      nicheInterior: new THREE.MeshStandardMaterial({ color: 0xd5dfe6, roughness: 0.66, metalness: 0.03, side: THREE.DoubleSide }),
      nicheWarmLight: new THREE.MeshBasicMaterial({ color: 0xfff6e4, side: THREE.DoubleSide, toneMapped: false }),
      ceilingWhite: new THREE.MeshStandardMaterial({ color: 0xf7f8f9, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide }),
      ceilingTrim: new THREE.MeshStandardMaterial({ color: 0xd5dee4, roughness: 0.34, metalness: 0.22, side: THREE.DoubleSide }),
      ceilingGroove: new THREE.MeshBasicMaterial({ color: 0xaeb9c2, transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
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
        map: floorTex, roughnessMap, bumpMap, bumpScale: 0.008,
        roughness: 0.38, metalness: 0.02, clearcoat: 0.42, clearcoatRoughness: 0.32,
        envMapIntensity: 0.7,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'reference-floor';
    this.floorMesh = floor;
    this.group.add(floor);

    const seamMat = new THREE.MeshBasicMaterial({ color: 0x7d8e98, transparent: true, opacity: 0.42, depthWrite: false });
    const seams = new THREE.Group();
    seams.name = 'reference-floor-seams';
    // Floor is already rotated onto XZ, so child local +Z is world up. Seams stay in the parent's XY plane.
    for (const radius of [1.48, 3.42, 6.35]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.01, radius + 0.01, 160), seamMat);
      ring.position.z = 0.008;
      seams.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(this.roomRadius * 1.55, 0.016), seamMat);
      line.rotation.z = (i / 8) * Math.PI;
      line.position.z = 0.009;
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

  private haloTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);
    const glow = ctx.createRadialGradient(256, 256, 150, 256, 256, 256);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.42, 'rgba(255,253,248,0.05)');
    glow.addColorStop(0.62, 'rgba(255,252,246,0.55)');
    glow.addColorStop(0.74, 'rgba(255,255,255,1)');
    glow.addColorStop(0.86, 'rgba(255,253,248,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private facetBand(innerR: number, outerR: number, segments: number, y: number, lift: number, phase: number): THREE.BufferGeometry {
    const positions: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = phase + (i / segments) * Math.PI * 2;
      const a1 = phase + ((i + 1) / segments) * Math.PI * 2;
      const raiseOuter = i % 2 === 0 ? lift : 0;
      const raiseInner = i % 2 === 0 ? 0 : lift * 0.65;
      const point = (radius: number, angle: number, raise: number) => [
        Math.cos(angle) * radius, y + raise, Math.sin(angle) * radius,
      ];
      const o0 = point(outerR, a0, raiseOuter);
      const o1 = point(outerR, a1, 0);
      const i0 = point(innerR, a0, raiseInner);
      const i1 = point(innerR, a1, 0);
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

    const outerFacets = new THREE.Mesh(
      this.facetBand(4.85, this.roomRadius - 0.06, 28, 3.9, 0.045, 0),
      this.materials.ceilingWhite,
    );
    outerFacets.name = 'ceiling-facets';
    outerFacets.receiveShadow = true;
    ceiling.add(outerFacets);
    ceiling.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(outerFacets.geometry, 1),
      this.materials.ceilingGroove,
    ));

    const innerFacets = new THREE.Mesh(
      this.facetBand(3.28, 4.85, 20, 3.96, 0.03, Math.PI / 20),
      this.materials.ceilingWhite,
    );
    innerFacets.receiveShadow = true;
    ceiling.add(innerFacets);
    const innerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(innerFacets.geometry, 1),
      this.materials.ceilingGroove,
    );
    innerEdges.position.y = 0.004;
    ceiling.add(innerEdges);

    const step = new THREE.Mesh(new THREE.RingGeometry(2.72, 3.28, 128), this.materials.ceilingWhite);
    step.rotation.x = Math.PI / 2;
    step.position.y = 4.04;
    ceiling.add(step);

    const stepLip = new THREE.Mesh(new THREE.TorusGeometry(3.28, 0.018, 8, 128), this.materials.ceilingTrim);
    stepLip.rotation.x = Math.PI / 2;
    stepLip.position.y = 4.0;
    ceiling.add(stepLip);

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(3.22, 96),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture(), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 4.055;
    halo.name = 'oculus-halo';
    ceiling.add(halo);

    const bezel = new THREE.Mesh(new THREE.RingGeometry(2.28, 2.58, 96), this.materials.ceilingTrim);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 4.1;
    ceiling.add(bezel);

    const skylight = new THREE.Mesh(
      new THREE.CircleGeometry(2.28, 96),
      new THREE.MeshBasicMaterial({ color: 0xf7fbff, side: THREE.DoubleSide }),
    );
    skylight.rotation.x = Math.PI / 2;
    skylight.position.y = 4.18;
    skylight.name = 'central-skylight';
    ceiling.add(skylight);

    const skylightRing = new THREE.Mesh(new THREE.TorusGeometry(2.28, 0.016, 8, 96), this.materials.aluminumTrim);
    skylightRing.rotation.x = Math.PI / 2;
    skylightRing.position.y = 4.155;
    ceiling.add(skylightRing);

    const cross = new THREE.Group();
    cross.name = 'skylight-cross';
    const mullionMat = new THREE.MeshBasicMaterial({ color: 0x6a7c88 });
    // Below the glass disc so the bars sit on the near side of the oculus.
    const barX = new THREE.Mesh(new THREE.BoxGeometry(4.46, 0.03, 0.075), mullionMat);
    barX.position.y = 4.145;
    const barZ = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 4.46), mullionMat);
    barZ.position.y = 4.145;
    cross.add(barX, barZ);
    ceiling.add(cross);

    const perimeterCove = new THREE.Mesh(
      new THREE.TorusGeometry(this.roomRadius - 0.22, 0.05, 12, 128),
      this.materials.coveLight,
    );
    perimeterCove.rotation.x = Math.PI / 2;
    perimeterCove.position.y = 3.86;
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

  /** phi = 0 faces the back wall (−Z). Positive phi swings toward +X (screen right). Local +Z points into the room. */
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
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius, this.roomRadius, shellHeight, 160, 1, true),
      this.materials.wallWhite,
    );
    shell.position.y = shellHeight / 2;
    shell.receiveShadow = true;
    shell.name = 'reference-shell';
    walls.add(shell);

    this.createPanelJoints(walls);

    const cyanSlot = new THREE.Mesh(
      new THREE.CylinderGeometry(this.roomRadius - 0.02, this.roomRadius - 0.02, 0.02, 160, 1, true),
      this.materials.hairlineLightSlot,
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
   * Six equal bays around the circle. The entrance camera looks at phi 0,
   * so that first view holds only the window and one niche on each side.
   * The other three bays — two niches and the door — sit behind and to the
   * sides, and show up when the view turns. Every opening shares one centerline.
   */
  private featureLayout() {
    const y = 2.2;
    const bay = (Math.PI * 2) / 6;
    return {
      y,
      window: { phi: 0, width: 2.7, height: 1.12, y },
      niche: { width: 2.02, height: 1.34, y, phis: [bay, -bay, 2 * bay, -2 * bay] as const },
      // Pilasters sit in the side and rear piers, outside the first glance.
      cyan: [1.75, -1.75, Math.PI - 0.58, Math.PI + 0.58] as const,
      door: { phi: Math.PI, width: 1.38, height: 2.56, y: 1.36 },
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

    const voidMat = new THREE.MeshStandardMaterial({ color: 0xb7c8d2, roughness: 0.42, metalness: 0.06, side: THREE.DoubleSide });
    const back = this.roundedPanel(width - 0.28, height - 0.26, 0.16, voidMat);
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
        color: 0xc5d3dc, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide,
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

      const lightWidth = width - 0.5;
      const upperGlow = new THREE.Mesh(new THREE.BoxGeometry(lightWidth, 0.035, 0.045), this.materials.nicheWarmLight);
      upperGlow.position.set(0, height / 2 - 0.2, -0.05);
      mount.add(upperGlow);

      const lowerGlow = new THREE.Mesh(new THREE.BoxGeometry(lightWidth, 0.032, 0.04), this.materials.nicheWarmLight);
      lowerGlow.position.set(0, -0.08, -0.045);
      lowerGlow.name = `side-niche-warm-shelf-${label}`;
      mount.add(lowerGlow);

      const upperLight = new THREE.PointLight(0xfff0d2, 1.05, 2.4, 2);
      upperLight.position.set(0, 0.34, 0.02);
      const lowerLight = new THREE.PointLight(0xffe4b8, 0.7, 2.0, 2);
      lowerLight.position.set(0, -0.22, 0.02);
      mount.add(upperLight, lowerLight);

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
    // Static architecture; animated experiment content lives on HologramStage.
  }
}
