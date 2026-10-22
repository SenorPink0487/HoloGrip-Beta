import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAB_WALLS = {
  radius: 8.2,
  height: 3.9,
  faceRadius: 8.10,
  thickness: 0.055,
  raisedDepth: 0.11,
  pierWidth: 1.10,
  bays: 8,
  joint: 0.008,
  horizontalJointY: 2.82,
  panelBottom: 0.078,
  panelTop: 3.884,
  doorAngle: 55 * Math.PI / 180,
  doorWidth: 1.45,
  doorHeight: 2.73,
  doorBottom: 0.06,
} as const;

export function createWallMaterials(): Record<string, THREE.Material> {
  return {
    wallWhite: new THREE.MeshStandardMaterial({
      color: 0xe4e4e5, emissive: 0xe1e1e2, emissiveIntensity: 0.22,
      roughness: 0.40, metalness: 0.15, envMapIntensity: 0.65,
    }),
    wallRaised: new THREE.MeshStandardMaterial({
      color: 0xe1e2e3, emissive: 0xdbdcde, emissiveIntensity: 0.20,
      roughness: 0.43, metalness: 0.16, envMapIntensity: 0.55,
    }),
    wallPanelReturn: new THREE.MeshStandardMaterial({
      color: 0xb3b5b8, emissive: 0x999b9e, emissiveIntensity: 0.10,
      roughness: 0.57, metalness: 0.12, envMapIntensity: 0.25,
    }),
    wallSeamDark: new THREE.MeshBasicMaterial({ color: 0x85888d }),
    wallTrim: new THREE.MeshStandardMaterial({
      color: 0xb6b9bd, emissive: 0xa9acb0, emissiveIntensity: 0.09,
      roughness: 0.33, metalness: 0.52, envMapIntensity: 0.45,
    }),
    wallPanelSeam: new THREE.MeshBasicMaterial({ color: 0x85888d }),
  };
}

interface WallSpan {
  angle: number;
  arc: number;
  raised: boolean;
}

/** Three broad infill panels between each pair of narrower, proud vertical piers. */
function wallSpans(): WallSpan[] {
  const c = LAB_WALLS;
  const pitch = Math.PI * 2 / c.bays;
  const pierArc = c.pierWidth / c.faceRadius;
  const clearArc = pitch - pierArc;
  const spans: WallSpan[] = [];
  for (let i = 0; i < c.bays; i++) {
    const center = i * pitch;
    let cursor = center - clearArc / 2;
    for (const fraction of [0.30, 0.40, 0.30]) {
      const arc = clearArc * fraction;
      spans.push({ angle: cursor + arc / 2, arc, raised: false });
      cursor += arc;
    }
    spans.push({ angle: center + pitch / 2, arc: pierArc, raised: true });
  }
  return spans;
}

/** Rounded folded-sheet section, sampled across the face before bending around the room. */
function panelGeometry(arc: number, faceRadius: number, thickness: number, bottom: number, top: number): THREE.BufferGeometry {
  const width = arc * faceRadius - LAB_WALLS.joint;
  const halfWidth = width / 2;
  const edge = 0.004;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + edge, 0);
  for (let i = 1; i <= 20; i++) shape.lineTo(THREE.MathUtils.lerp(-halfWidth + edge, halfWidth - edge, i / 20), 0);
  shape.quadraticCurveTo(halfWidth, 0, halfWidth, edge);
  shape.lineTo(halfWidth, thickness - edge);
  shape.quadraticCurveTo(halfWidth, thickness, halfWidth - edge, thickness);
  for (let i = 1; i <= 20; i++) shape.lineTo(THREE.MathUtils.lerp(halfWidth - edge, -halfWidth + edge, i / 20), thickness);
  shape.quadraticCurveTo(-halfWidth, thickness, -halfWidth, thickness - edge);
  shape.lineTo(-halfWidth, edge);
  shape.quadraticCurveTo(-halfWidth, 0, -halfWidth + edge, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: top - bottom - 0.003, steps: 1, curveSegments: 4,
    bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2,
  });
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const angle = -positions.getX(i) / faceRadius;
    const radius = faceRadius + thickness - positions.getY(i);
    const y = bottom + positions.getZ(i) + 0.0015;
    positions.setXYZ(i, Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
  }
  geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry, 0.00001);
  geometry.dispose();
  welded.computeVertexNormals();
  // The extrusion runs vertically, so its side group contains both the broad
  // room-facing skin and the folded returns. Classify those surfaces explicitly.
  const faceIndices: number[] = [];
  const returnIndices: number[] = [];
  const p = welded.getAttribute('position');
  const indices = welded.index!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let i = 0; i < indices.count; i += 3) {
    const ia = indices.getX(i), ib = indices.getX(i + 1), ic = indices.getX(i + 2);
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); d.fromBufferAttribute(p, ic);
    center.copy(a).add(b).add(d).multiplyScalar(1 / 3);
    const radius = Math.hypot(center.x, center.z);
    normal.crossVectors(b.sub(a), d.sub(a)).normalize();
    const facingRoom = -(normal.x * center.x + normal.z * center.z) / radius;
    const target = facingRoom > 0.65 && radius < faceRadius + 0.006 ? faceIndices : returnIndices;
    target.push(ia, ib, ic);
  }
  welded.setIndex([...faceIndices, ...returnIndices]);
  welded.clearGroups();
  welded.addGroup(0, faceIndices.length, 0);
  welded.addGroup(faceIndices.length, returnIndices.length, 1);
  return welded;
}

/** Batch each finish into one draw, retaining the different face and folded-return finishes. */
function batchPanels(geometries: THREE.BufferGeometry[], materials: THREE.Material[], name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
    const parts: THREE.BufferGeometry[] = [];
    for (const geometry of geometries) {
      for (const draw of geometry.groups) {
        if (draw.materialIndex !== materialIndex) continue;
        const part = new THREE.BufferGeometry();
        for (const attribute of Object.keys(geometry.attributes)) part.setAttribute(attribute, geometry.getAttribute(attribute));
        part.setIndex(Array.from(geometry.index!.array.slice(draw.start, draw.start + draw.count)));
        parts.push(part);
      }
    }
    const merged = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(merged, materials[materialIndex]);
    mesh.name = `${name}-${materialIndex === 0 ? 'faces' : 'returns'}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  geometries.forEach(geometry => geometry.dispose());
  return group;
}

export function createLaboratoryWallPanels(materials: Record<string, THREE.Material>): THREE.Group {
  const c = LAB_WALLS;
  const group = new THREE.Group();
  group.name = 'reference-wall-panels';
  const plain: THREE.BufferGeometry[] = [];
  const raised: THREE.BufferGeometry[] = [];
  for (const span of wallSpans()) {
    const projection = span.raised ? c.raisedDepth : 0;
    const faceRadius = c.faceRadius - projection;
    for (const [bottom, top] of [
      [c.panelBottom, c.horizontalJointY - c.joint / 2],
      [c.horizontalJointY + c.joint / 2, c.panelTop],
    ]) {
      let sections = [span];
      if (top < c.doorBottom + c.doorHeight + 0.04) {
        // A real portal lets the flat door and its perimeter seal sit inside
        // the curved wall, without the wall skin swallowing the frame edges.
        const halfDoor = Math.atan((c.doorWidth + 0.08) / 2 / c.faceRadius);
        const start = span.angle - span.arc / 2;
        const end = span.angle + span.arc / 2;
        const doorStart = c.doorAngle - halfDoor;
        const doorEnd = c.doorAngle + halfDoor;
        if (start < doorEnd && end > doorStart) {
          sections = [];
          if (start < doorStart) sections.push({ ...span, angle: (start + doorStart) / 2, arc: doorStart - start });
          if (end > doorEnd) sections.push({ ...span, angle: (doorEnd + end) / 2, arc: end - doorEnd });
        }
      }
      for (const section of sections) {
        const geometry = panelGeometry(section.arc, faceRadius, c.thickness + projection, bottom, top);
        geometry.rotateY(-section.angle);
        (span.raised ? raised : plain).push(geometry);
      }
    }
  }
  group.add(batchPanels(plain, [materials.wallWhite, materials.wallPanelReturn], 'wall-infill'));
  group.add(batchPanels(raised, [materials.wallRaised, materials.wallPanelReturn], 'wall-raised'));
  return group;
}

/** The satin skirting follows the same proud and recessed wall profiles. */
export function createLaboratoryBaseboard(materials: Record<string, THREE.Material>): THREE.Group {
  const c = LAB_WALLS;
  const parts = wallSpans().map(span => {
    const projection = span.raised ? c.raisedDepth : 0;
    const geometry = panelGeometry(span.arc, c.faceRadius - projection - 0.008, 0.026 + projection, 0.008, 0.064);
    geometry.rotateY(-span.angle);
    return geometry;
  });
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  const group = new THREE.Group();
  group.name = 'reference-baseboard';
  const mesh = new THREE.Mesh(geometry, materials.wallTrim);
  mesh.name = 'profiled-wall-skirting';
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
