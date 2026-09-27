import * as THREE from 'three';
import { extractJsonObject } from './extractJson.ts';
import {
  GeometrySolver,
  type AuxEdge,
  type KeyPoint,
  type PolygonFace,
  type PolyhedronModelDef,
} from './GeometrySolver.ts';

/** Longest axis of a recognized solid, in scene units, so it sits with the preset models. */
export const RECOGNIZED_MODEL_SPAN = 0.58;

export interface FigureVertex {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface FigurePoint {
  id: string;
  from?: string;
  to?: string;
  t?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface RecognizedFigure {
  name: string;
  subtitle: string;
  vertices: FigureVertex[];
  edges: [string, string][];
  faces: string[][];
  points: FigurePoint[];
  aux: [string, string][];
}

function cleanText(value: unknown, fallback: string, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.slice(0, max);
}

function cleanId(value: unknown): string {
  const id = String(value ?? '').trim().replace(/\s+/g, '');
  if (!id || id.length > 12 || /[<>]/.test(id)) {
    throw new Error('图中的字母没有读清');
  }
  return id;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return NaN;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pairFrom(value: unknown): [string, string] | null {
  if (Array.isArray(value) && value.length >= 2) {
    return [cleanId(value[0]), cleanId(value[1])];
  }
  const rec = asRecord(value);
  if (!rec) return null;
  const a = rec.a ?? rec.from ?? rec[0];
  const b = rec.b ?? rec.to ?? rec[1];
  if (a === undefined || b === undefined) return null;
  return [cleanId(a), cleanId(b)];
}

function faceFrom(value: unknown): string[] | null {
  const list = Array.isArray(value)
    ? value
    : asRecord(value)?.verts ?? asRecord(value)?.vertices ?? asRecord(value)?.ids;
  if (!Array.isArray(list)) return null;
  const ids = list.map((item) => cleanId(item));
  return ids.length >= 3 ? ids : null;
}

function pointFrom(value: unknown): FigurePoint | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const id = cleanId(rec.id ?? rec.label);
  const on = rec.on ?? rec.at;
  if (Array.isArray(on) && on.length >= 2) {
    return {
      id,
      from: cleanId(on[0]),
      to: cleanId(on[1]),
      t: num(on[2] ?? rec.t),
    };
  }
  const x = num(rec.x);
  const y = num(rec.y);
  const z = num(rec.z);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && rec.from === undefined && rec.to === undefined) {
    return { id, x, y, z };
  }
  if (rec.from === undefined || rec.to === undefined) return null;
  return {
    id,
    from: cleanId(rec.from),
    to: cleanId(rec.to),
    t: num(rec.t),
  };
}

export function parseRecognizedFigure(raw: unknown): RecognizedFigure {
  const data = typeof raw === 'string' ? extractJsonObject(raw) : raw;
  const rec = asRecord(data);
  if (!rec) throw new Error('没有认出图里的立体');

  const vertexList = Array.isArray(rec.vertices) ? rec.vertices : [];
  const vertices: FigureVertex[] = [];
  const seen = new Set<string>();
  for (const item of vertexList.slice(0, 24)) {
    const row = asRecord(item);
    if (!row) continue;
    const id = cleanId(row.id ?? row.label);
    if (seen.has(id)) throw new Error(`顶点 ${id} 重复了`);
    const x = num(row.x);
    const y = num(row.y);
    const z = num(row.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`顶点 ${id} 的坐标没有读清`);
    }
    seen.add(id);
    vertices.push({ id, x, y, z });
  }
  if (vertices.length < 4) throw new Error('没有认出完整的立体');

  const edges: [string, string][] = [];
  const edgeList = Array.isArray(rec.edges) ? rec.edges : [];
  for (const item of edgeList.slice(0, 64)) {
    const pair = pairFrom(item);
    if (pair && pair[0] !== pair[1]) edges.push(pair);
  }

  const faces: string[][] = [];
  const faceList = Array.isArray(rec.faces) ? rec.faces : [];
  for (const item of faceList.slice(0, 24)) {
    const face = faceFrom(item);
    if (face) faces.push(face);
  }

  const points: FigurePoint[] = [];
  const pointList = Array.isArray(rec.points) ? rec.points : [];
  for (const item of pointList.slice(0, 24)) {
    const point = pointFrom(item);
    if (!point) continue;
    if (seen.has(point.id) && !vertices.some((vertex) => vertex.id === point.id)) {
      throw new Error(`点 ${point.id} 重复了`);
    }
    seen.add(point.id);
    points.push(point);
  }

  let solidVertices = vertices;
  if (faces.length > 0) {
    const usedByFace = new Set(faces.flat());
    solidVertices = [];
    for (const vertex of vertices) {
      if (usedByFace.has(vertex.id)) {
        solidVertices.push(vertex);
        continue;
      }
      if (!points.some((point) => point.id === vertex.id)) {
        points.push({ id: vertex.id, x: vertex.x, y: vertex.y, z: vertex.z });
      }
    }
  }
  if (solidVertices.length < 4) throw new Error('没有认出完整的立体');
  const solidIds = new Set(solidVertices.map((vertex) => vertex.id));
  const auxiliaryPoints = points.filter((point) => !solidIds.has(point.id));

  const aux: [string, string][] = [];
  const auxList = Array.isArray(rec.aux) ? rec.aux : Array.isArray(rec.auxEdges) ? rec.auxEdges : [];
  for (const item of auxList.slice(0, 32)) {
    const pair = pairFrom(item);
    if (pair && pair[0] !== pair[1]) aux.push(pair);
  }

  return {
    name: cleanText(rec.name, '识图立体', 32),
    subtitle: cleanText(rec.subtitle, '由题目照片还原', 48),
    vertices: solidVertices,
    edges,
    faces,
    points: auxiliaryPoints,
    aux,
  };
}

function pointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): boolean {
  const ab = b.clone().sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-12) return p.distanceTo(a) < 1e-4;
  const t = p.clone().sub(a).dot(ab) / lenSq;
  if (t < -1e-3 || t > 1 + 1e-3) return false;
  return a.clone().addScaledVector(ab, t).distanceTo(p) < 1e-4;
}

function newellNormal(pts: THREE.Vector3[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    n.x += (cur.y - next.y) * (cur.z + next.z);
    n.y += (cur.z - next.z) * (cur.x + next.x);
    n.z += (cur.x - next.x) * (cur.y + next.y);
  }
  return n;
}

function resolvePoints(figure: RecognizedFigure): Map<string, THREE.Vector3> {
  const known = new Map<string, THREE.Vector3>();
  for (const vertex of figure.vertices) {
    known.set(vertex.id, new THREE.Vector3(vertex.x, vertex.y, vertex.z));
  }

  const pending = figure.points.map((point) => ({ ...point }));
  let guard = pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const point = pending[i];
      if (
        point.x !== undefined &&
        point.y !== undefined &&
        point.z !== undefined &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z) &&
        !point.from &&
        !point.to
      ) {
        known.set(point.id, new THREE.Vector3(point.x, point.y, point.z));
        pending.splice(i, 1);
        progressed = true;
        continue;
      }
      if (!point.from || !point.to) continue;
      const a = known.get(point.from);
      const b = known.get(point.to);
      if (!a || !b) continue;
      const t = point.t !== undefined && Number.isFinite(point.t) ? point.t : 0.5;
      known.set(point.id, a.clone().lerp(b, t));
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  if (pending.length > 0) {
    throw new Error(`辅助点 ${pending[0].id} 对不上图中的线段`);
  }
  return known;
}

/**
 * Turn a recognized oblique-drawing figure into a centered, scaled polyhedron.
 * Auxiliary points stay labeled and snappable. Construction lines are aux edges.
 */
export function buildRecognizedModel(figure: RecognizedFigure): PolyhedronModelDef {
  const known = resolvePoints(figure);
  const vertexIds = figure.vertices.map((vertex) => vertex.id);
  const indexOf = new Map(vertexIds.map((id, index) => [id, index]));

  const positions = vertexIds.map((id) => known.get(id)!);
  const customOrder = figure.points.map((point) => point.id);
  const customPositions = customOrder.map((id) => known.get(id)!);
  const all = [...positions, ...customPositions];

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of all) {
    min.min(p);
    max.max(p);
  }
  const size = max.clone().sub(min);
  const span = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span < 1e-6) {
    throw new Error('图里的尺寸没有读出来');
  }
  const scale = RECOGNIZED_MODEL_SPAN / span;
  const center = min.clone().add(max).multiplyScalar(0.5);
  for (const p of all) p.sub(center).multiplyScalar(scale);

  const vertices = positions.map((p) => p.clone());
  const vertexLabels = [...vertexIds];

  const solidEdgeKeys = new Set<string>();
  const edges: [number, number][] = [];
  const auxPairs: [string, string][] = [];

  const pushAux = (a: string, b: string) => {
    if (!known.has(a) || !known.has(b) || a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (solidEdgeKeys.has(`aux:${key}`)) return;
    solidEdgeKeys.add(`aux:${key}`);
    auxPairs.push([a, b]);
  };

  for (const [a, b] of figure.edges) {
    if (indexOf.has(a) && indexOf.has(b)) {
      const i = indexOf.get(a)!;
      const j = indexOf.get(b)!;
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (solidEdgeKeys.has(key)) continue;
      solidEdgeKeys.add(key);
      edges.push(i < j ? [i, j] : [j, i]);
    } else {
      pushAux(a, b);
    }
  }
  for (const [a, b] of figure.aux) pushAux(a, b);

  let faceIds = figure.faces
    .map((face) => face.filter((id) => indexOf.has(id)))
    .filter((face) => face.length >= 3);
  if (faceIds.length === 0 && vertices.length === 4) {
    faceIds = [
      [vertexIds[0], vertexIds[1], vertexIds[2]],
      [vertexIds[0], vertexIds[1], vertexIds[3]],
      [vertexIds[0], vertexIds[2], vertexIds[3]],
      [vertexIds[1], vertexIds[2], vertexIds[3]],
    ];
  }

  const centroid = new THREE.Vector3();
  vertices.forEach((v) => centroid.add(v));
  centroid.multiplyScalar(1 / vertices.length);

  const faces: PolygonFace[] = [];
  faceIds.forEach((ids, faceIndex) => {
    const unique: string[] = [];
    for (const id of ids) {
      if (unique[unique.length - 1] !== id) unique.push(id);
    }
    if (unique.length >= 2 && unique[0] === unique[unique.length - 1]) unique.pop();
    if (unique.length < 3) return;
    const pts = unique.map((id) => vertices[indexOf.get(id)!]);
    const normal = newellNormal(pts);
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    const faceCenter = new THREE.Vector3();
    pts.forEach((p) => faceCenter.add(p));
    faceCenter.multiplyScalar(1 / pts.length);
    let indices = unique.map((id) => indexOf.get(id)!);
    if (normal.dot(faceCenter.clone().sub(centroid)) < 0) {
      normal.negate();
      indices = indices.slice().reverse();
    }
    faces.push({
      id: `face_${faceIndex}`,
      label: unique.join(''),
      vertexIndices: indices,
      normal,
    });
  });

  if (faces.length < 4) throw new Error('没有认出完整的立体');

  if (edges.length === 0) {
    for (const face of faces) {
      const ids = face.vertexIndices;
      for (let i = 0; i < ids.length; i++) {
        const a = ids[i];
        const b = ids[(i + 1) % ids.length];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (solidEdgeKeys.has(key)) continue;
        solidEdgeKeys.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  }

  const keyPoints: KeyPoint[] = vertices.map((position, index) => ({
    id: `v_${index}`,
    label: vertexLabels[index],
    type: 'vertex' as const,
    position: position.clone(),
  }));

  const labelToKey = new Map<string, string>();
  vertexLabels.forEach((label, index) => labelToKey.set(label, `v_${index}`));

  customOrder.forEach((label, index) => {
    const id = `pt_${label}`;
    labelToKey.set(label, id);
    const source = figure.points[index];
    keyPoints.push({
      id,
      label,
      type: 'custom',
      position: customPositions[index].clone(),
      ratio: source.t !== undefined && Number.isFinite(source.t) ? source.t : undefined,
      edgeVertices: source.from && source.to ? [source.from, source.to] : undefined,
    });
  });

  GeometrySolver.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

  const customPts = keyPoints.filter((kp) => kp.type === 'custom');
  const filtered = keyPoints.filter((kp) => {
    if (kp.type !== 'midpoint' && kp.type !== 'third') return true;
    return !customPts.some((custom) => custom.position.distanceTo(kp.position) < 1e-4);
  });

  const auxEdges: AuxEdge[] = [];
  const positionById = new Map(filtered.map((kp) => [kp.id, kp.position]));
  for (const [a, b] of auxPairs) {
    const idA = labelToKey.get(a);
    const idB = labelToKey.get(b);
    if (!idA || !idB) continue;
    const pa = positionById.get(idA);
    const pb = positionById.get(idB);
    if (!pa || !pb) continue;
    const liesOnPrismEdge = edges.some(([i, j]) =>
      pointOnSegment(pa, vertices[i], vertices[j]) && pointOnSegment(pb, vertices[i], vertices[j])
    );
    if (liesOnPrismEdge) continue;
    auxEdges.push({ a: idA, b: idB });
  }

  let boundingRadius = 0;
  for (const vertex of vertices) boundingRadius = Math.max(boundingRadius, vertex.length());

  return {
    id: 'recognized',
    name: figure.name,
    subtitle: figure.subtitle,
    description: '由题目照片还原的立体。可以旋转，并吸附顶点、辅助点来连线或剖切。',
    vertices,
    vertexLabels,
    faces,
    edges,
    keyPoints: filtered,
    auxEdges,
    defaultParams: { a: RECOGNIZED_MODEL_SPAN },
    boundingRadius,
  };
}
