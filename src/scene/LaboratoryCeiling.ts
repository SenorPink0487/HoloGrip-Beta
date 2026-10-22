import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Dimensions shared by the visible architecture and its reflection environment. */
export const LAB_CEILING = {
  radius: 8.2,
  discRadius: 4.20,
  lightInnerRadius: 4.95,
  lightOuterRadius: 5.90,
  diffuserDrop: 0.14,
  haloRadius: 7.30,
  discY: 4.355,
  diffuserY: 4.345,
  bridgeFaceY: 4.405,
  soffitY: 3.90,
  bridgeWidth: 0.28,
  // One near bridge, two side bridges and two rear diagonals, seen from +Z.
  bridgeAngles: [Math.PI / 6, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 11 * Math.PI / 6],
} as const;

export function createCeilingMaterials(): Record<string, THREE.Material> {
  return {
    // 航天级冷调太空舱天花板板面体系：与参考图墙面完全呼应的纯净冰灰科技配色
    ceilingWhite: new THREE.MeshStandardMaterial({
      color: 0xc8d4e2,
      emissive: 0x182636,
      emissiveIntensity: 0.28,
      roughness: 0.38,
      metalness: 0.20,
      envMapIntensity: 0.90,
    }),
    // 镜面抛光 316L 不锈钢 / 液态铬卷边精密压条
    ceilingTrim: new THREE.MeshStandardMaterial({
      color: 0xf1f6fb,
      emissive: 0x223448,
      emissiveIntensity: 0.22,
      roughness: 0.14,
      metalness: 0.95,
      envMapIntensity: 1.35,
    }),
    // 五向径向银灰结构肋：参考图风格的阳极氧化冷银金属肋与精密倒角光泽
    ceilingBridgeFace: new THREE.MeshStandardMaterial({
      color: 0xd8e4ef,
      emissive: 0x1a2c40,
      emissiveIntensity: 0.24,
      roughness: 0.18,
      metalness: 0.90,
      envMapIntensity: 1.20,
    }),
    // 阶梯阴影壁面与暗槽：深邃太空暗影，强化精密机械卡槽明暗对比
    ceilingRecessWall: new THREE.MeshStandardMaterial({
      color: 0x182534,
      emissive: 0x0d1622,
      emissiveIntensity: 0.20,
      roughness: 0.48,
      metalness: 0.50,
      envMapIntensity: 0.45,
    }),
    ceilingGroove: new THREE.MeshBasicMaterial({ color: 0x121c28 }),
    // 五分区同心主漫射光带：参考图顶部的纯净高亮冷白/冰白科研漫射光
    quadrantDiffuser: new THREE.MeshStandardMaterial({
      color: 0xf4faff,
      emissive: 0xe4f4ff,
      emissiveIntensity: 3.0,
      roughness: 0.18,
      metalness: 0.0,
    }),
    // 外围天际线极薄同心连续光环：参考图天花板边沿的纯净冷白光带
    haloRingLight: new THREE.MeshBasicMaterial({ color: 0xf2faff, toneMapped: false }),
    // 结构边缘精密嵌条与嵌槽
    mullionDark: new THREE.MeshStandardMaterial({
      color: 0x223246,
      emissive: 0x121e2c,
      emissiveIntensity: 0.20,
      roughness: 0.25,
      metalness: 0.80,
      envMapIntensity: 0.90,
    }),
    mullionGroove: new THREE.MeshStandardMaterial({
      color: 0x152230,
      roughness: 0.38,
      metalness: 0.60,
    }),
    // 筒灯防眩光与精密冷光出光镜片
    downlightLens: new THREE.MeshBasicMaterial({ color: 0xf0f8ff, toneMapped: false }),
  };
}

type Profile = ReadonlyArray<readonly [number, number]>;
const TAU = Math.PI * 2;

/** Weld the extrusion's cap triangles before shading a curved, deformed surface. */
function smoothSurfaceNormals(geometry: THREE.BufferGeometry): void {
  geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry, 0.00001);
  geometry.copy(welded);
  welded.dispose();
  geometry.computeVertexNormals();
}

/** Closed turned profiles give each panel real thickness and rolled/chamfered edges. */
function turned(profile: Profile, material: THREE.Material, name: string): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 256);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function ringProfile(inner: number, outer: number, y: number, depth = 0.045, bevel = 0.008): Profile {
  return [
    [inner + bevel, y], [outer - bevel, y], [outer, y + bevel],
    [outer, y + depth - bevel], [outer - bevel, y + depth],
    [inner + bevel, y + depth], [inner, y + depth - bevel],
    [inner, y + bevel], [inner + bevel, y],
  ];
}

/** Parallel bridge edges, rather than wedge-shaped gaps, match the machined ribs. */
function annularSector(inner: number, outer: number, start: number, end: number,
  halfGap: number, bottom: number, depth: number): THREE.ExtrudeGeometry {
  const innerGap = Math.asin(halfGap / inner);
  const outerGap = Math.asin(halfGap / outer);
  const a = start - Math.PI / 2;
  const b = end - Math.PI / 2;
  const shape = new THREE.Shape();
  shape.moveTo(inner * Math.cos(a + innerGap), inner * Math.sin(a + innerGap));
  shape.lineTo(outer * Math.cos(a + outerGap), outer * Math.sin(a + outerGap));
  shape.absarc(0, 0, outer, a + outerGap, b - outerGap, false);
  shape.lineTo(inner * Math.cos(b - innerGap), inner * Math.sin(b - innerGap));
  shape.absarc(0, 0, inner, b - innerGap, a + innerGap, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.004,
    bevelThickness: 0.004, bevelSegments: 2, steps: 1, curveSegments: 48,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, bottom + depth + 0.004, 0);
  return geometry;
}

/** Rounded cross-section, finely sampled along its length so a recess follows the coffer. */
function curvedStrip(width: number, height: number, length: number, radius: number,
  midRadius: number, drop: (radius: number) => number): THREE.ExtrudeGeometry {
  const x = width / 2;
  const y = height / 2;
  const r = Math.min(radius, y * 0.8);
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length - 0.008, steps: 48, curveSegments: 4,
    bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.004, bevelSegments: 2,
  });
  geometry.translate(0, 0, -length / 2 + 0.004);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, positions.getY(i) - drop(midRadius - positions.getZ(i)));
  }
  smoothSurfaceNormals(geometry);
  return geometry;
}

export function createLaboratoryCeiling(materials: Record<string, THREE.Material>): THREE.Group {
  const ceiling = new THREE.Group();
  ceiling.name = 'reference-ceiling';
  const c = LAB_CEILING;
  const panel = materials.ceilingWhite;
  const trim = materials.ceilingTrim;
  const groove = materials.ceilingGroove;
  const collarInner = c.discRadius + 0.032;
  const collarOuter = c.lightInnerRadius - 0.008;
  const collarDrop = (radius: number): number => {
    const t = THREE.MathUtils.clamp((radius - collarInner) / (collarOuter - collarInner), 0, 1);
    return 0.105 * t * t * (3 - 2 * t);
  };
  // Tilt the broad lens toward the room so it remains a visible surface at the
  // normal bench eye height, rather than projecting into a thin horizontal line.
  const lightDrop = (radius: number): number => c.diffuserDrop * THREE.MathUtils.clamp(
    (radius - c.lightInnerRadius) / (c.lightOuterRadius - c.lightInnerRadius), 0, 1,
  );
  const bridgeDrop = (radius: number): number => collarDrop(radius) + lightDrop(radius);

  ceiling.add(turned([
    [0, c.discY], [c.discRadius - 0.012, c.discY],
    [c.discRadius, c.discY + 0.012], [c.discRadius, c.discY + 0.065],
    [c.discRadius - 0.012, c.discY + 0.077], [0, c.discY + 0.077],
  ], panel, 'central-skylight'));

  // A narrow recessed reveal separates the opaque disc from the surrounding panels.
  ceiling.add(turned(ringProfile(c.discRadius - 0.002, collarInner, 4.366, 0.035, 0.003), groove, 'central-disc-reveal'));
  // Cut five real radial recesses into the collar. A continuous ring would conceal
  // the recessed bridge faces and make them look like raised bars underneath it.
  const collarSectors: THREE.BufferGeometry[] = [];
  for (let i = 0; i < c.bridgeAngles.length; i++) {
    const start = c.bridgeAngles[i];
    const end = c.bridgeAngles[(i + 1) % c.bridgeAngles.length] + (i === c.bridgeAngles.length - 1 ? TAU : 0);
    const geometry = annularSector(collarInner, collarOuter, start, end, c.bridgeWidth / 2 + 0.018, 4.365, 0.060);
    const positions = geometry.getAttribute('position');
    for (let j = 0; j < positions.count; j++) {
      const radius = Math.hypot(positions.getX(j), positions.getZ(j));
      positions.setY(j, positions.getY(j) - collarDrop(radius));
    }
    smoothSurfaceNormals(geometry);
    collarSectors.push(geometry);
  }
  const collarGeometry = mergeGeometries(collarSectors)!;
  // Preserve the extrusion's cap/wall groups when merging. The vertical recess
  // walls need a shadowed finish; panel-white walls become bright stripes in side views.
  let groupOffset = 0;
  for (const geometry of collarSectors) {
    for (const group of geometry.groups) {
      collarGeometry.addGroup(groupOffset + group.start, group.count, group.materialIndex);
    }
    groupOffset += geometry.index?.count ?? geometry.getAttribute('position').count;
  }
  collarSectors.forEach(geometry => geometry.dispose());
  const collar = new THREE.Mesh(collarGeometry, [panel, materials.ceilingRecessWall]);
  collar.name = 'inner-ceiling-ring';
  collar.receiveShadow = true;
  ceiling.add(collar);

  // In section: panel < recessed silver bridge < diffuser < light-well back.
  const lightWellProfile: Profile = [
    [c.lightInnerRadius - 0.005, 4.380], [5.945, 4.380 - c.diffuserDrop],
    [5.945, 4.410 - c.diffuserDrop], [c.lightInnerRadius - 0.005, 4.410],
    [c.lightInnerRadius - 0.005, 4.380],
  ];
  ceiling.add(turned(lightWellProfile, groove, 'annular-light-well'));

  // 保持天花板分隔区域竖长条（radial bridge）中间连续不断开：
  // 光环内侧与外侧卷边饰条均采用与漫射片严格对齐的分区结构（sectorized），
  // 在 5 道径向银灰分隔肋处完整避让，绝不横向截断竖长条。
  const innerTrimSectors: THREE.BufferGeometry[] = [];
  const outerTrimSectors: THREE.BufferGeometry[] = [];
  const bridgeGap = c.bridgeWidth / 2 + 0.018;

  for (let i = 0; i < c.bridgeAngles.length; i++) {
    const start = c.bridgeAngles[i];
    const end = c.bridgeAngles[(i + 1) % c.bridgeAngles.length] + (i === c.bridgeAngles.length - 1 ? TAU : 0);

    // 1. 光环内侧卷边饰条扇区（避让竖长条，在分隔肋边缘利落收口）
    const innerTrimGeo = annularSector(
      c.lightInnerRadius - 0.012,
      c.lightInnerRadius + 0.014,
      start,
      end,
      bridgeGap,
      4.273,
      0.111
    );
    smoothSurfaceNormals(innerTrimGeo);
    innerTrimSectors.push(innerTrimGeo);

    // 2. 光环外侧卷边饰条扇区（避让竖长条）
    const outerTrimGeo = annularSector(
      5.891,
      5.919,
      start,
      end,
      bridgeGap,
      4.277 - c.diffuserDrop,
      0.107
    );
    smoothSurfaceNormals(outerTrimGeo);
    outerTrimSectors.push(outerTrimGeo);
  }

  const mergedInnerTrim = mergeGeometries(innerTrimSectors)!;
  innerTrimSectors.forEach(g => g.dispose());
  const innerTrimMesh = new THREE.Mesh(mergedInnerTrim, trim);
  innerTrimMesh.name = 'light-inner-rolled-trim';
  innerTrimMesh.receiveShadow = true;
  ceiling.add(innerTrimMesh);

  const mergedOuterTrim = mergeGeometries(outerTrimSectors)!;
  outerTrimSectors.forEach(g => g.dispose());
  const outerTrimMesh = new THREE.Mesh(mergedOuterTrim, trim);
  outerTrimMesh.name = 'light-outer-rolled-trim';
  outerTrimMesh.receiveShadow = true;
  ceiling.add(outerTrimMesh);

  const diffusers = new THREE.Group();
  diffusers.name = 'main-quadrant-diffusers';
  for (let i = 0; i < c.bridgeAngles.length; i++) {
    const start = c.bridgeAngles[i];
    const end = c.bridgeAngles[(i + 1) % c.bridgeAngles.length] + (i === c.bridgeAngles.length - 1 ? TAU : 0);
    const geometry = annularSector(c.lightInnerRadius, c.lightOuterRadius, start, end,
      c.bridgeWidth / 2 + 0.018, c.diffuserY, 0.024);
    const positions = geometry.getAttribute('position');
    for (let j = 0; j < positions.count; j++) {
      const radius = Math.hypot(positions.getX(j), positions.getZ(j));
      positions.setY(j, positions.getY(j) - lightDrop(radius));
    }
    smoothSurfaceNormals(geometry);
    const diffuser = new THREE.Mesh(geometry, materials.quadrantDiffuser);
    diffuser.name = `diffuser-sector-${i}`;
    diffusers.add(diffuser);
  }
  ceiling.add(diffusers);

  const bridges = new THREE.Group();
  bridges.name = 'skylight-cross';
  const bridgeInner = c.discRadius + 0.018;
  const bridgeOuter = c.lightOuterRadius + 0.025;
  const bridgeLength = bridgeOuter - bridgeInner;
  const bridgeRadius = (bridgeOuter + bridgeInner) / 2;
  const bridgeHeight = 0.035;
  const bridgeGeometry = curvedStrip(c.bridgeWidth, bridgeHeight, bridgeLength, 0.008, bridgeRadius, bridgeDrop);
  const bridgeBed = curvedStrip(c.bridgeWidth + 0.032, 0.027, bridgeLength, 0.006, bridgeRadius, bridgeDrop);
  const edgeGeometry = curvedStrip(0.012, 0.012, bridgeLength - 0.028, 0.004, bridgeRadius, bridgeDrop);
  c.bridgeAngles.forEach((angle, index) => {
    const bridge = new THREE.Group();
    bridge.name = `radial-bridge-${index}`;
    bridge.position.set(Math.sin(angle) * bridgeRadius, c.bridgeFaceY + bridgeHeight / 2, -Math.cos(angle) * bridgeRadius);
    bridge.rotation.y = -angle;
    const bed = new THREE.Mesh(bridgeBed, materials.mullionGroove);
    bed.position.y = 0.028;
    const face = new THREE.Mesh(bridgeGeometry, materials.ceilingBridgeFace);
    face.name = 'recessed-bridge-face';
    face.castShadow = true;
    bridge.add(bed, face);
    for (const sign of [-1, 1]) {
      const edge = new THREE.Mesh(edgeGeometry, materials.mullionDark);
      edge.position.set(sign * (c.bridgeWidth / 2 - 0.009), -0.010, 0);
      bridge.add(edge);
    }
    bridges.add(bridge);
  });
  ceiling.add(bridges);

  // A shallow, smooth coffer, not a polygonal cone. The return closes against the wall.
  const outerProfile: Profile = [
    [5.931, 4.138], [6.08, 4.136], [6.40, 4.132], [6.78, 4.124],
    [7.04, 4.115], [7.22, 4.108], [7.265, 4.106], [7.278, 4.104],
    [7.286, 4.112], [7.286, 4.174], [7.22, 4.179], [7.04, 4.186],
    [6.78, 4.195], [6.40, 4.203], [6.08, 4.207], [5.931, 4.209], [5.931, 4.138],
  ];
  ceiling.add(turned(outerProfile, panel, 'ceiling-facets'));

  // Real narrow engraving strips follow the panel curvature, with one concentric joint.
  const seams: THREE.BufferGeometry[] = [];
  const surface = outerProfile.slice(0, 8);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU + Math.PI / 12;
    const points = surface.map(([r, y]) => new THREE.Vector2(r, y - 0.001));
    const seam = new THREE.LatheGeometry(points, 1, angle - 0.00045, 0.0009);
    seams.push(seam);
  }
  const merged = mergeGeometries(seams);
  seams.forEach(geometry => geometry.dispose());
  if (merged) {
    const radialJoints = new THREE.Mesh(merged, groove);
    radialJoints.name = 'outer-panel-radial-joints';
    ceiling.add(radialJoints);
  }
  ceiling.add(turned(ringProfile(6.776, 6.784, 4.122, 0.012, 0.001), groove, 'outer-panel-circular-joint'));

  ceiling.add(turned(ringProfile(7.282, 7.350, 4.107, 0.045, 0.004), groove, 'halo-recess'));
  ceiling.add(turned(ringProfile(7.286, 7.325, 4.101, 0.018, 0.003), materials.haloRingLight, 'perimeter-halo-ring'));
  ceiling.add(turned([
    [7.340, 4.097], [7.357, 4.086], [7.40, 4.053], [7.48, 4.015],
    [7.60, 3.974], [7.78, 3.931], [8.02, 3.905], [8.22, 3.900],
    [8.23, 3.913], [8.23, 3.990], [8.02, 3.990], [7.78, 4.016],
    [7.60, 4.059], [7.48, 4.100], [7.40, 4.138], [7.340, 4.182], [7.340, 4.097],
  ], panel, 'perimeter-ceiling-soffit'));

  const downlights = new THREE.Group();
  downlights.name = 'ceiling-downlights';
  const spotRadius = 7.78;
  const lensGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.052, 0),
    new THREE.Vector2(0.057, 0.005), new THREE.Vector2(0.057, 0.014),
    new THREE.Vector2(0, 0.014),
  ], 32);
  for (let i = 0; i < 12; i++) {
    const angle = (i + 0.5) / 12 * TAU;
    const spot = new THREE.Group();
    spot.name = `ceiling-downlight-${i}`;
    spot.position.set(Math.sin(angle) * spotRadius, 3.925, -Math.cos(angle) * spotRadius);
    const bezel = turned(ringProfile(0.059, 0.078, 0, 0.014, 0.003), trim, 'downlight-bezel');
    const baffle = turned(ringProfile(0.050, 0.062, 0.002, 0.018, 0.002), materials.mullionGroove, 'downlight-baffle');
    const lens = new THREE.Mesh(lensGeometry, materials.downlightLens);
    lens.position.y = 0.006;
    spot.add(bezel, baffle, lens);
    downlights.add(spot);
  }
  ceiling.add(downlights);
  return ceiling;
}
