import * as THREE from 'three';
import { extractJsonObject } from './extractJson.ts';
import {
  GeometrySolver,
  type AuxEdge,
  type KeyPoint,
  type PolygonFace,
  type PolyhedronModelDef,
} from './GeometrySolver.ts';

/** 识别多面体的最长轴尺寸（场景单位），使其与预设模型比例协调。 */
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

function findBestPlaneNormal(pts: THREE.Vector3[]): THREE.Vector3 {
  const best = new THREE.Vector3();
  let bestLenSq = 0;
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      ab.subVectors(pts[j], pts[i]);
      for (let k = j + 1; k < pts.length; k++) {
        ac.subVectors(pts[k], pts[i]);
        cross.crossVectors(ab, ac);
        const lenSq = cross.lengthSq();
        if (lenSq > bestLenSq) {
          bestLenSq = lenSq;
          best.copy(cross);
        }
      }
    }
  }
  if (bestLenSq > 1e-14) best.normalize();
  return best;
}

function cross2D(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsProperlyIntersect2D(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const d1 = cross2D(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1]);
  const d2 = cross2D(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1]);
  const d3 = cross2D(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1]);
  const d4 = cross2D(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1]);
  return ((d1 > 1e-7 && d2 < -1e-7) || (d1 < -1e-7 && d2 > 1e-7)) &&
    ((d3 > 1e-7 && d4 < -1e-7) || (d3 < -1e-7 && d4 > 1e-7));
}

/**
 * 若四顶点及以上的共面多边形被按交叉“蝴蝶形”顺序给出（如 [A,C,B,D]），
 * 自动投影至该平面并按质心极角排序恢复合法周界环绕顺序。
 */
function repairCoplanarFaceOrder(ids: string[], indexOf: Map<string, number>, vertices: THREE.Vector3[]): string[] {
  if (ids.length < 4) return ids;
  const pts = ids.map((id) => vertices[indexOf.get(id)!]);
  const planeNormal = findBestPlaneNormal(pts);
  if (planeNormal.lengthSq() < 1e-12) return ids;

  const center = new THREE.Vector3();
  pts.forEach((p) => center.add(p));
  center.multiplyScalar(1 / pts.length);

  for (const p of pts) {
    if (Math.abs(planeNormal.dot(p.clone().sub(center))) > 0.015) {
      return ids; // 非共面扭曲环不强行极角重排
    }
  }

  const ref = Math.abs(planeNormal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const uAxis = new THREE.Vector3().crossVectors(planeNormal, ref).normalize();
  const vAxis = new THREE.Vector3().crossVectors(planeNormal, uAxis).normalize();

  const coords2D: [number, number][] = pts.map((p) => {
    const rel = p.clone().sub(center);
    return [rel.dot(uAxis), rel.dot(vAxis)];
  });

  let selfIntersecting = newellNormal(pts).lengthSq() < 1e-12;
  const n = coords2D.length;
  for (let i = 0; i < n && !selfIntersecting; i++) {
    const a1 = coords2D[i];
    const a2 = coords2D[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = coords2D[j];
      const b2 = coords2D[(j + 1) % n];
      if (segmentsProperlyIntersect2D(a1, a2, b1, b2)) {
        selfIntersecting = true;
        break;
      }
    }
  }

  if (!selfIntersecting) return ids;

  return ids
    .map((id, idx) => ({ id, angle: Math.atan2(coords2D[idx][1], coords2D[idx][0]) }))
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.id);
}

/**
 * 若大模型将同一个平整多边形面（例如四边形底面 ABCD）沿对角线拆成了两个共面三角形面，
 * 自动将其合并回单一平整外表面，避免面内对角线被误判为多面体外棱并保持欧拉示性数准确。
 */
function mergeCoplanarSplitFaces(
  rawFaces: PolygonFace[],
  vertices: THREE.Vector3[],
  vertexLabels: string[]
): PolygonFace[] {
  const result = rawFaces.map((f) => ({
    ...f,
    vertexIndices: [...f.vertexIndices],
    normal: f.normal.clone(),
  }));

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < result.length && !mergedAny; i++) {
      const f1 = result[i];
      for (let j = i + 1; j < result.length && !mergedAny; j++) {
        const f2 = result[j];
        if (f1.normal.dot(f2.normal) < 0.996) continue;
        const planeOffset = Math.abs(
          f1.normal.dot(vertices[f2.vertexIndices[0]].clone().sub(vertices[f1.vertexIndices[0]]))
        );
        if (planeOffset > 1e-3) continue;

        const set2 = new Set(f2.vertexIndices);
        const sharedVerts = f1.vertexIndices.filter((v) => set2.has(v));
        if (sharedVerts.length !== 2) continue;

        // 查找反向共享有向边 (u -> v in f1, v -> u in f2)
        const n1 = f1.vertexIndices.length;
        const n2 = f2.vertexIndices.length;
        let e1 = -1;
        let e2 = -1;
        for (let k1 = 0; k1 < n1; k1++) {
          const u = f1.vertexIndices[k1];
          const v = f1.vertexIndices[(k1 + 1) % n1];
          for (let k2 = 0; k2 < n2; k2++) {
            if (f2.vertexIndices[k2] === v && f2.vertexIndices[(k2 + 1) % n2] === u) {
              e1 = k1;
              e2 = k2;
              break;
            }
          }
          if (e1 !== -1) break;
        }
        if (e1 === -1 || e2 === -1) continue;

        const combined: number[] = [];
        for (let step = 0; step <= e1; step++) {
          combined.push(f1.vertexIndices[step]);
        }
        for (let step = 1; step < n2 - 1; step++) {
          combined.push(f2.vertexIndices[(e2 + 1 + step) % n2]);
        }
        for (let step = e1 + 1; step < n1; step++) {
          combined.push(f1.vertexIndices[step]);
        }

        const mergedNormal = newellNormal(combined.map((idx) => vertices[idx]));
        if (mergedNormal.lengthSq() < 1e-12) continue;
        mergedNormal.normalize();
        if (mergedNormal.dot(f1.normal) < 0) {
          mergedNormal.negate();
          combined.reverse();
        }

        result[i] = {
          id: f1.id,
          label: combined.map((idx) => vertexLabels[idx]).join(''),
          vertexIndices: combined,
          normal: mergedNormal,
        };
        result.splice(j, 1);
        mergedAny = true;
      }
    }
  }

  result.forEach((f, idx) => {
    f.id = `face_${idx}`;
  });
  return result;
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
 * 将识别到的直观图转换为居中且定标的多面体模型。
 * 辅助点保留标号与磁吸捕捉能力，作图线转化为辅助线段。
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
  const rawVertexEdges: [string, string][] = [];
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
      rawVertexEdges.push([a, b]);
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

  const rawFaces: PolygonFace[] = [];
  faceIds.forEach((ids, faceIndex) => {
    const deduped: string[] = [];
    for (const id of ids) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    if (deduped.length < 3) return;
    const orderedIds = repairCoplanarFaceOrder(deduped, indexOf, vertices);
    const pts = orderedIds.map((id) => vertices[indexOf.get(id)!]);
    const normal = newellNormal(pts);
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    const faceCenter = new THREE.Vector3();
    pts.forEach((p) => faceCenter.add(p));
    faceCenter.multiplyScalar(1 / pts.length);
    let indices = orderedIds.map((id) => indexOf.get(id)!);
    if (normal.dot(faceCenter.clone().sub(centroid)) < 0) {
      normal.negate();
      indices = indices.slice().reverse();
    }
    rawFaces.push({
      id: `face_${faceIndex}`,
      label: indices.map((idx) => vertexLabels[idx]).join(''),
      vertexIndices: indices,
      normal,
    });
  });

  const faces = mergeCoplanarSplitFaces(rawFaces, vertices, vertexLabels);
  if (faces.length < 4) throw new Error('没有认出完整的立体');

  // 以多面体全部外表面周界边作为权威外棱集合：
  // 1) 自动补齐大模型在 edges 中遗漏的面边界棱（例如四棱锥漏写某条侧棱 ED）；
  // 2) 自动将误写入 edges 的面内对角线或体对角线（例如底面对角线 AC）降级归入 auxEdges。
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

  for (const [a, b] of rawVertexEdges) {
    const i = indexOf.get(a)!;
    const j = indexOf.get(b)!;
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (!solidEdgeKeys.has(key)) {
      pushAux(a, b);
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
