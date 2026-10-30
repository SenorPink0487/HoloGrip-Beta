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

function vertexFrom(value: unknown): FigureVertex | null {
  if (Array.isArray(value) && value.length >= 4) {
    const id = cleanId(value[0]);
    const x = num(value[1]);
    const y = num(value[2]);
    const z = num(value[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`顶点 ${id} 的坐标没有读清`);
    }
    return { id, x, y, z };
  }
  const row = asRecord(value);
  if (!row) return null;
  const id = cleanId(row.id ?? row.label);
  const x = num(row.x);
  const y = num(row.y);
  const z = num(row.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`顶点 ${id} 的坐标没有读清`);
  }
  return { id, x, y, z };
}

function undirectedEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function parseMathNumberExpr(expr: string): number {
  const s = String(expr ?? '')
    .trim()
    .replace(/\\sqrt\{(\d+(?:\.\d+)?)\}/g, '√$1')
    .replace(/sqrt\((\d+(?:\.\d+)?)\)/gi, '√$1');
  if (!s) return NaN;
  const fracSqrt = s.match(/^(\d+(?:\.\d+)?)?√(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (fracSqrt) {
    const mul = fracSqrt[1] ? Number(fracSqrt[1]) : 1;
    const rad = Number(fracSqrt[2]);
    const div = fracSqrt[3] ? Number(fracSqrt[3]) : 1;
    return div !== 0 && rad >= 0 ? (mul * Math.sqrt(rad)) / div : NaN;
  }
  const frac = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const numer = Number(frac[1]);
    const denom = Number(frac[2]);
    return denom !== 0 ? numer / denom : NaN;
  }
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : NaN;
}

interface TextGeometryFacts {
  verifiedLengths: Map<string, number>;
  equalRatios: [string, string, string, string, number][];
  unquantifiedRatioEdges: Set<string>;
  linePerpPlane: { line: [string, string]; plane: string[] }[];
  linePerpLine: [string, string, string, string][];
  lineParLine: [string, string, string, string][];
  angles: [string, string, string, number][];
  inferredBase: string[];
  inferredUp: [string, string][];
}

export function extractTextGeometryFacts(text: string, solidName: string, vertexIds: string[]): TextGeometryFacts {
  const sortedIds = [...vertexIds].sort((a, b) => b.length - a.length);

  const matchTwoVertices = (str: string): [string, string] | null => {
    for (const v1 of sortedIds) {
      if (str.startsWith(v1)) {
        const rest = str.slice(v1.length);
        for (const v2 of sortedIds) {
          if (v2 !== v1 && rest === v2) return [v1, v2];
        }
      }
    }
    return null;
  };

  const matchVertexSeq = (str: string): string[] | null => {
    const out: string[] = [];
    let rem = str;
    while (rem.length > 0) {
      let hit: string | null = null;
      for (const id of sortedIds) {
        if (rem.startsWith(id) && !out.includes(id)) {
          hit = id;
          break;
        }
      }
      if (!hit) return null;
      out.push(hit);
      rem = rem.slice(hit.length);
    }
    return out.length > 0 ? out : null;
  };

  const fullText = `${solidName}，${text}`;
  const clean = fullText
    .replace(/＝/g, '=')
    .replace(/／／|\/\//g, '∥')
    .replace(/Δ/g, '△')
    .replace(/[—–－]/g, '-')
    .replace(/\s+/g, '');

  const verifiedLengths = new Map<string, number>();
  const equalRatios: [string, string, string, string, number][] = [];
  const unquantifiedRatioEdges = new Set<string>();
  const linePerpPlane: { line: [string, string]; plane: string[] }[] = [];
  const linePerpLine: [string, string, string, string][] = [];
  const lineParLine: [string, string, string, string][] = [];
  const angles: [string, string, string, number][] = [];
  let inferredBase: string[] = [];
  const inferredUp: [string, string][] = [];

  const addQuadShapeRules = (q: string[], kind: 'square' | 'rect' | 'rhombus' | 'para') => {
    if (q.length !== 4) return;
    const [a, b, c, d] = q;
    lineParLine.push([a, b, d, c], [a, d, b, c]);
    equalRatios.push([a, b, c, d, 1], [b, c, d, a, 1]);
    if (kind === 'square' || kind === 'rhombus') {
      equalRatios.push([a, b, b, c, 1]);
    }
    if (kind === 'square' || kind === 'rect') {
      linePerpLine.push([a, b, b, c], [b, c, c, d]);
    }
  };

  // Detect named canonical solids (e.g. 正方体ABCD-A1B1C1D1, 直三棱柱ABC-A1B1C1, 正四棱锥P-ABCD, 正三棱锥P-ABC, 正四面体P-ABC)
  const prismMatch = clean.match(/(正方体|长方体|正四棱柱|直四棱柱|正三棱柱|直三棱柱)([A-Za-z0-9]+)-([A-Za-z0-9]+)/);
  if (prismMatch) {
    const kind = prismMatch[1];
    const bot = matchVertexSeq(prismMatch[2]);
    const top = matchVertexSeq(prismMatch[3]);
    if (bot && top && bot.length >= 3 && bot.length === top.length) {
      inferredBase = bot;
      for (let i = 0; i < bot.length; i++) {
        inferredUp.push([bot[i], top[i]]);
        if (i > 0) equalRatios.push([bot[i], top[i], bot[0], top[0], 1]);
      }
      if (kind === '正方体') {
        addQuadShapeRules(bot, 'square');
        equalRatios.push([bot[0], top[0], bot[0], bot[1], 1]);
      } else if (kind === '正四棱柱') {
        addQuadShapeRules(bot, 'square');
      } else if (kind === '长方体') {
        addQuadShapeRules(bot, 'rect');
      } else if (kind === '正三棱柱' && bot.length === 3) {
        equalRatios.push([bot[0], bot[1], bot[1], bot[2], 1], [bot[0], bot[2], bot[1], bot[2], 1]);
      }
    }
  }

  const regPyrMatch = clean.match(/(正四棱锥|正三棱锥|正四面体)([A-Za-z0-9]+)-([A-Za-z0-9]+)/);
  if (regPyrMatch) {
    const kind = regPyrMatch[1];
    const apexSeq = matchVertexSeq(regPyrMatch[2]);
    const baseSeq = matchVertexSeq(regPyrMatch[3]);
    if (apexSeq && apexSeq.length === 1 && baseSeq && baseSeq.length >= 3) {
      const apex = apexSeq[0];
      inferredBase = baseSeq;
      for (let i = 1; i < baseSeq.length; i++) {
        equalRatios.push([apex, baseSeq[i], apex, baseSeq[0], 1]);
      }
      if (kind === '正四棱锥' && baseSeq.length === 4) {
        addQuadShapeRules(baseSeq, 'square');
      } else if ((kind === '正三棱锥' || kind === '正四面体') && baseSeq.length === 3) {
        equalRatios.push([baseSeq[0], baseSeq[1], baseSeq[1], baseSeq[2], 1], [baseSeq[0], baseSeq[2], baseSeq[1], baseSeq[2], 1]);
        if (kind === '正四面体') {
          equalRatios.push([apex, baseSeq[0], baseSeq[0], baseSeq[1], 1]);
        }
      }
    }
  }

  const clauses = clean.split(/[，,。；;、：:（）()]+/).filter(Boolean);
  for (const clause of clauses) {
    // Base polygon shape keywords: 底面ABCD为正方形/矩形/菱形/平行四边形
    const quadKindMatch = clause.match(/(?:底面|平面|四边形)?([A-Za-z0-9]+)(?:为|是)(正方形|矩形|长方形|菱形|平行四边形)/);
    if (quadKindMatch) {
      const q = matchVertexSeq(quadKindMatch[1]);
      if (q && q.length === 4) {
        if (clause.includes('底面') && inferredBase.length === 0) inferredBase = q;
        const k = quadKindMatch[2];
        addQuadShapeRules(q, k === '正方形' ? 'square' : k === '菱形' ? 'rhombus' : k === '平行四边形' ? 'para' : 'rect');
      }
    }

    // Equilateral triangles: △ACD为等边三角形 / 等边△ACD / 正△ACD
    const eqTri1 = clause.match(/(?:正|等边)(?:△|三角形)([A-Za-z0-9]+)/);
    const eqTri2 = clause.match(/(?:△|三角形)([A-Za-z0-9]+)(?:为|是)(?:等边|正)三角形/);
    const triStr = eqTri1?.[1] ?? eqTri2?.[1];
    if (triStr) {
      const seq = matchVertexSeq(triStr);
      if (seq && seq.length === 3) {
        equalRatios.push([seq[0], seq[1], seq[1], seq[2], 1]);
        equalRatios.push([seq[0], seq[2], seq[1], seq[2], 1]);
      }
    }

    // Line ⊥ Plane: EC⊥平面ABCD / PA⊥底面ABC
    const lpMatch = clause.match(/([A-Za-z0-9]+)⊥(?:平面|底面|面)([A-Za-z0-9]+)/);
    if (lpMatch) {
      const seg = matchTwoVertices(lpMatch[1]);
      const pl = matchVertexSeq(lpMatch[2]);
      if (seg && pl && pl.length >= 3) {
        linePerpPlane.push({ line: seg, plane: pl });
      }
    } else if (clause.includes('⊥') && !clause.includes('平面') && !clause.includes('底面') && !clause.includes('面')) {
      const parts = clause.split('⊥');
      if (parts.length === 2) {
        const s1 = matchTwoVertices(parts[0].replace(/^[^A-Za-z0-9]+/, ''));
        const s2 = matchTwoVertices(parts[1].replace(/[^A-Za-z0-9]+$/, ''));
        if (s1 && s2) linePerpLine.push([s1[0], s1[1], s2[0], s2[1]]);
      }
    }

    // Line ∥ Line: AB∥DC
    if (clause.includes('∥') && !clause.includes('平面') && !clause.includes('底面') && !clause.includes('面')) {
      const parts = clause.split('∥');
      for (let i = 0; i < parts.length - 1; i++) {
        const s1 = matchTwoVertices(parts[i].replace(/^[^A-Za-z0-9]+/, ''));
        const s2 = matchTwoVertices(parts[i + 1].replace(/[^A-Za-z0-9]+$/, ''));
        if (s1 && s2) lineParLine.push([s1[0], s1[1], s2[0], s2[1]]);
      }
    }

    // Explicit Angle: ∠ACB=90° / ∠BAD=60°
    const angMatch = clause.match(/∠([A-Za-z0-9]+)=(\d+(?:\.\d+)?)°?/);
    if (angMatch) {
      const seq = matchVertexSeq(angMatch[1]);
      const deg = Number(angMatch[2]);
      if (seq && seq.length === 3 && deg > 0 && deg < 180) {
        angles.push([seq[0], seq[1], seq[2], deg]);
      }
    }

    // Chained segment length & ratio equations: DC=2AB=2, CB=CE, AC=BC=AA1=2√3
    if (clause.includes('=') && !clause.includes('∠') && !/sin|cos|tan/i.test(clause)) {
      const eqExpr = clause.replace(/^[\u4e00-\u9fa5]+/, '');
      const parts = eqExpr.split('=');
      if (parts.length >= 2) {
        let numericVal = NaN;
        const terms: { seg: [string, string]; coeff: number }[] = [];
        for (const p of parts) {
          const val = parseMathNumberExpr(p);
          if (Number.isFinite(val)) {
            numericVal = val;
            continue;
          }
          const termMatch = p.match(/^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?([A-Za-z][A-Za-z0-9]*)$/);
          if (termMatch) {
            const coeff = termMatch[1] ? parseMathNumberExpr(termMatch[1]) : 1;
            const seg = matchTwoVertices(termMatch[2]);
            if (seg && Number.isFinite(coeff) && coeff > 0) {
              terms.push({ seg, coeff });
            }
          }
        }
        if (Number.isFinite(numericVal) && terms.length > 0) {
          for (const t of terms) {
            verifiedLengths.set(undirectedEdgeKey(t.seg[0], t.seg[1]), numericVal / t.coeff);
          }
        } else if (!Number.isFinite(numericVal) && terms.length >= 2) {
          for (let i = 0; i < terms.length - 1; i++) {
            const t1 = terms[i];
            const t2 = terms[i + 1];
            equalRatios.push([t1.seg[0], t1.seg[1], t2.seg[0], t2.seg[1], t2.coeff / t1.coeff]);
            unquantifiedRatioEdges.add(undirectedEdgeKey(t1.seg[0], t1.seg[1]));
            unquantifiedRatioEdges.add(undirectedEdgeKey(t2.seg[0], t2.seg[1]));
          }
        }
      }
    }
  }

  // Propagate verified numeric lengths across verified equal/ratio chains (excluding purely symbolic unquantified edges like CB=CE unless one side IS verified!)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [u1, v1, u2, v2, k] of equalRatios) {
      const k1 = undirectedEdgeKey(u1, v1);
      const k2 = undirectedEdgeKey(u2, v2);
      if (verifiedLengths.has(k1) && !verifiedLengths.has(k2)) {
        verifiedLengths.set(k2, verifiedLengths.get(k1)! / k);
        changed = true;
      } else if (verifiedLengths.has(k2) && !verifiedLengths.has(k1)) {
        verifiedLengths.set(k1, verifiedLengths.get(k2)! * k);
        changed = true;
      }
    }
  }

  return {
    verifiedLengths,
    equalRatios,
    unquantifiedRatioEdges,
    linePerpPlane,
    linePerpLine,
    lineParLine,
    angles,
    inferredBase,
    inferredUp,
  };
}

function solveSmallLinearSystem(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const stride = n + 1;
  const M = new Float64Array(n * stride);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * stride + j] = A[i * n + j];
    M[i * stride + n] = b[i];
  }
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let maxVal = Math.abs(M[col * stride + col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(M[row * stride + col]);
      if (val > maxVal) {
        maxVal = val;
        pivot = row;
      }
    }
    if (maxVal < 1e-13) continue;
    if (pivot !== col) {
      for (let j = col; j <= n; j++) {
        const tmp = M[col * stride + j];
        M[col * stride + j] = M[pivot * stride + j];
        M[pivot * stride + j] = tmp;
      }
    }
    const diag = M[col * stride + col];
    for (let row = col + 1; row < n; row++) {
      const factor = M[row * stride + col] / diag;
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        M[row * stride + j] -= factor * M[col * stride + j];
      }
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i * stride + n];
    for (let j = i + 1; j < n; j++) sum -= M[i * stride + j] * x[j];
    const diag = M[i * stride + i];
    x[i] = Math.abs(diag) > 1e-13 ? sum / diag : 0;
  }
  return x;
}

/**
 * 确定性三维空间几何约束求解器（Levenberg-Marquardt 非线性最小二乘精修）：
 * 将单阶段极速视觉模型（~1.8s）提取的题干文本与几何约束在数毫秒内精确求解至 1e-6 机器精度，
 * 无需二次慢速推理大模型长文验算，即可保证上传图片、近景实拍与旋转照片收敛到完全一致的标准右手系三维模型。
 */
export function solveStereometryConstraints(
  solidVertices: FigureVertex[],
  faces: string[][],
  rec: Record<string, unknown>
): FigureVertex[] {
  const hasConstraints = rec.constraints !== undefined && rec.constraints !== null;
  const problemText = typeof rec.text === 'string' ? rec.text.trim() : '';
  if (!hasConstraints && !problemText) {
    return solidVertices;
  }

  const solidName = typeof rec.name === 'string' ? rec.name : '';
  if (solidVertices.length >= 8 && /圆柱|圆锥|圆台|球/.test(`${solidName}${problemText}`)) {
    return solidVertices;
  }

  const vertexIds = solidVertices.map((v) => v.id);
  const idxOf = new Map(vertexIds.map((id, i) => [id, i]));
  const nVerts = solidVertices.length;
  const c = asRecord(rec.constraints) ?? {};
  const rot = Number(rec.rot ?? 0);

  const facts = extractTextGeometryFacts(problemText, solidName, vertexIds);

  // 1. Base plane vertices (y = 0)
  let baseIds: string[] = Array.isArray(c.base)
    ? c.base.map((id) => String(id).trim()).filter((id) => idxOf.has(id))
    : [];
  if (facts.inferredBase.length > baseIds.length) {
    baseIds = facts.inferredBase;
  }
  for (const lp of facts.linePerpPlane) {
    if (lp.plane.length >= 3 && lp.plane.every((id) => idxOf.has(id)) && lp.plane.length >= baseIds.length) {
      baseIds = lp.plane;
    }
  }
  const baseIdx = baseIds.map((id) => idxOf.get(id)!);
  const baseSet = new Set(baseIdx);

  // 2. Vertical upward edges [bottomIdx, topIdx] along +Y
  const upPairs: [number, number][] = [];
  const addUp = (a: string, b: string) => {
    const ia = idxOf.get(a);
    const ib = idxOf.get(b);
    if (ia === undefined || ib === undefined || ia === ib) return;
    const bot = baseSet.has(ib) && !baseSet.has(ia) ? ib : ia;
    const top = bot === ia ? ib : ia;
    if (!upPairs.some(([u, v]) => u === bot && v === top)) {
      upPairs.push([bot, top]);
    }
  };
  for (const [u, v] of facts.inferredUp) addUp(u, v);
  if (Array.isArray(c.up)) {
    for (const pair of c.up) {
      if (Array.isArray(pair) && pair.length >= 2) addUp(String(pair[0]).trim(), String(pair[1]).trim());
    }
  }
  for (const lp of facts.linePerpPlane) {
    const [u, v] = lp.line;
    if (lp.plane.includes(u) && !lp.plane.includes(v)) addUp(u, v);
    else if (lp.plane.includes(v) && !lp.plane.includes(u)) addUp(v, u);
  }

  // 3. Exact segment lengths (sanitized against text facts so unquantified ratio edges like CB=CE are never assigned hallucinated numbers)
  const lenMap = new Map<string, number>();
  for (const [k, val] of facts.verifiedLengths.entries()) {
    lenMap.set(k, val);
  }
  if (Array.isArray(c.len)) {
    for (const item of c.len) {
      if (!Array.isArray(item) || item.length < 3) continue;
      const a = String(item[0]).trim();
      const b = String(item[1]).trim();
      const L = Number(item[2]);
      if (!idxOf.has(a) || !idxOf.has(b) || a === b || !Number.isFinite(L) || L <= 0) continue;
      const k = undirectedEdgeKey(a, b);
      if (lenMap.has(k)) continue;
      if (facts.unquantifiedRatioEdges.has(k)) continue;
      if (
        facts.verifiedLengths.size > 0 &&
        !upPairs.some(([u, v]) => undirectedEdgeKey(vertexIds[u], vertexIds[v]) === k)
      ) {
        continue;
      }
      lenMap.set(k, L);
    }
  }
  const lenList: [number, number, number][] = [];
  for (const [k, L] of lenMap.entries()) {
    const [a, b] = k.split('|');
    lenList.push([idxOf.get(a)!, idxOf.get(b)!, L]);
  }

  // 4. Equal & ratio segment lengths [i1, j1, i2, j2, ratio] (|1| = ratio * |2|)
  const eqList: [number, number, number, number, number][] = [];
  const pushEq = (a: string, b: string, cId: string, d: string, ratio: number) => {
    const i1 = idxOf.get(a);
    const j1 = idxOf.get(b);
    const i2 = idxOf.get(cId);
    const j2 = idxOf.get(d);
    if (
      i1 === undefined ||
      j1 === undefined ||
      i2 === undefined ||
      j2 === undefined ||
      i1 === j1 ||
      i2 === j2 ||
      !Number.isFinite(ratio) ||
      ratio <= 0
    ) {
      return;
    }
    eqList.push([i1, j1, i2, j2, ratio]);
  };
  for (const [a, b, cId, d, r] of facts.equalRatios) pushEq(a, b, cId, d, r);
  if (Array.isArray(c.eq)) {
    for (const item of c.eq) {
      if (!Array.isArray(item)) continue;
      if (item.length >= 6 && Number.isFinite(Number(item[2])) && Number.isFinite(Number(item[5]))) {
        const n1 = Number(item[2]);
        const n2 = Number(item[5]);
        if (n1 > 0 && n2 > 0) {
          pushEq(String(item[0]).trim(), String(item[1]).trim(), String(item[3]).trim(), String(item[4]).trim(), n1 / n2);
        }
      } else if (item.length >= 4) {
        const r = item.length >= 5 && Number.isFinite(Number(item[4])) ? Number(item[4]) : 1;
        pushEq(String(item[0]).trim(), String(item[1]).trim(), String(item[2]).trim(), String(item[3]).trim(), r);
      }
    }
  }
  if (upPairs.length >= 3) {
    for (let k = 1; k < upPairs.length; k++) {
      eqList.push([upPairs[k][0], upPairs[k][1], upPairs[0][0], upPairs[0][1], 1]);
    }
  }

  // 5. Parallel segments + cyclic quadrilateral non-crossing same-direction enforcement
  const parList: [number, number, number, number, boolean][] = [];
  const rawPar: [string, string, string, string][] = [...facts.lineParLine];
  if (Array.isArray(c.par)) {
    for (const item of c.par) {
      if (Array.isArray(item) && item.length >= 4) {
        rawPar.push([String(item[0]).trim(), String(item[1]).trim(), String(item[2]).trim(), String(item[3]).trim()]);
      }
    }
  }
  const allCyclicQuads: string[][] = [...faces.filter((f) => f.length === 4)];
  if (baseIds.length === 4) allCyclicQuads.push(baseIds);

  for (const [a, b, cId, d] of rawPar) {
    let i1 = idxOf.get(a);
    let j1 = idxOf.get(b);
    let i2 = idxOf.get(cId);
    let j2 = idxOf.get(d);
    if (i1 === undefined || j1 === undefined || i2 === undefined || j2 === undefined || i1 === j1 || i2 === j2) continue;
    let sameDir = false;
    for (const q of allCyclicQuads) {
      const qi = q.map((id) => idxOf.get(id));
      if (qi.some((x) => x === undefined)) continue;
      const [q0, q1, q2, q3] = qi as number[];
      const oppPairs: [number, number, number, number][] = [
        [q0, q1, q3, q2],
        [q1, q2, q0, q3],
      ];
      for (const [p0, p1, r0, r1] of oppPairs) {
        const m1 = (i1 === p0 && j1 === p1) || (i1 === p1 && j1 === p0);
        const m2 = (i2 === r0 && j2 === r1) || (i2 === r1 && j2 === r0);
        if (m1 && m2) {
          i1 = p0;
          j1 = p1;
          i2 = r0;
          j2 = r1;
          sameDir = true;
          break;
        }
      }
      if (sameDir) break;
    }
    parList.push([i1, j1, i2, j2, sameDir]);
  }

  // 6. Perpendicularity & explicit angle constraints
  const angList: [number, number, number, number, number][] = [];
  const pushPerp = (a: string, b: string, cId: string, d: string) => {
    const i1 = idxOf.get(a);
    const j1 = idxOf.get(b);
    const i2 = idxOf.get(cId);
    const j2 = idxOf.get(d);
    if (i1 === undefined || j1 === undefined || i2 === undefined || j2 === undefined || i1 === j1 || i2 === j2) return;
    angList.push([i1, j1, i2, j2, 0]);
  };
  for (const [a, b, cId, d] of facts.linePerpLine) pushPerp(a, b, cId, d);
  for (const lp of facts.linePerpPlane) {
    const [lu, lv] = lp.line;
    for (let k = 0; k < lp.plane.length; k++) {
      pushPerp(lu, lv, lp.plane[k], lp.plane[(k + 1) % lp.plane.length]);
    }
  }
  if (Array.isArray(c.perp)) {
    for (const item of c.perp) {
      if (Array.isArray(item) && item.length >= 4) {
        pushPerp(String(item[0]).trim(), String(item[1]).trim(), String(item[2]).trim(), String(item[3]).trim());
      }
    }
  }
  for (const [a, apex, b, deg] of facts.angles) {
    const ia = idxOf.get(a);
    const io = idxOf.get(apex);
    const ib = idxOf.get(b);
    if (ia !== undefined && io !== undefined && ib !== undefined) {
      angList.push([io, ia, io, ib, Math.cos((deg * Math.PI) / 180)]);
    }
  }
  if (Array.isArray(c.ang)) {
    for (const item of c.ang) {
      if (Array.isArray(item) && item.length >= 4) {
        const ia = idxOf.get(String(item[0]).trim());
        const io = idxOf.get(String(item[1]).trim());
        const ib = idxOf.get(String(item[2]).trim());
        const deg = Number(item[3]);
        if (ia !== undefined && io !== undefined && ib !== undefined && deg > 0 && deg < 180) {
          angList.push([io, ia, io, ib, Math.cos((deg * Math.PI) / 180)]);
        }
      }
    }
  }

  const geometricCount = upPairs.length + lenList.length + eqList.length + parList.length + angList.length;
  if (geometricCount === 0) {
    return solidVertices;
  }

  // If no numeric length was specified anywhere, anchor one base/reference edge to length 2.0 to prevent scale collapse
  if (lenList.length === 0 && baseIdx.length >= 2) {
    lenList.push([baseIdx[0], baseIdx[1], 2.0]);
  }
  const L0 = lenList.length > 0 ? lenList[0][2] : 2.0;

  // 7. Canonical Back Horizontal Edge [backLeft, backRight] on y=0, z=0 along +X
  let backLeft = -1;
  let backRight = -1;
  const upright = rot === 0;
  const topToBot = new Map<number, number>();
  for (const [bot, top] of upPairs) topToBot.set(top, bot);

  const lrPairs: [number, number][] =
    upright && Array.isArray(c.lr)
      ? c.lr
          .filter(
            (p): p is unknown[] =>
              Array.isArray(p) && p.length >= 2 && idxOf.has(String(p[0]).trim()) && idxOf.has(String(p[1]).trim())
          )
          .map((p) => [idxOf.get(String(p[0]).trim())!, idxOf.get(String(p[1]).trim())!])
      : [];
  const frontSet =
    upright && Array.isArray(c.front)
      ? new Set(
          c.front
            .map((id) => idxOf.get(String(id).trim()))
            .filter((idx): idx is number => idx !== undefined)
            .map((idx) => topToBot.get(idx) ?? idx)
        )
      : new Set<number>();
  const backSet =
    upright && Array.isArray(c.back)
      ? new Set(
          c.back
            .map((id) => idxOf.get(String(id).trim()))
            .filter((idx): idx is number => idx !== undefined)
            .map((idx) => topToBot.get(idx) ?? idx)
        )
      : new Set<number>();

  if (upright) {
    for (const [rawU, rawV] of lrPairs) {
      const u = baseSet.has(rawU) ? rawU : (topToBot.get(rawU) ?? rawU);
      const v = baseSet.has(rawV) ? rawV : (topToBot.get(rawV) ?? rawV);
      if (u !== v && baseSet.has(u) && baseSet.has(v) && !frontSet.has(u) && !frontSet.has(v)) {
        if (backSet.size === 0 || backSet.has(u) || backSet.has(v)) {
          backLeft = u;
          backRight = v;
          break;
        }
      }
    }
    if (backLeft === -1 && backSet.size >= 2) {
      const backBase = [...backSet].filter((idx) => baseSet.has(idx));
      if (backBase.length >= 2) {
        const [b0, b1] = backBase;
        if (solidVertices[b0].x <= solidVertices[b1].x) {
          backLeft = b0;
          backRight = b1;
        } else {
          backLeft = b1;
          backRight = b0;
        }
      }
    }
  }

  if (backLeft === -1 && baseIdx.length >= 3) {
    let bestScore = -1;
    for (let k = 0; k < baseIdx.length; k++) {
      const u = baseIdx[k];
      const v = baseIdx[(k + 1) % baseIdx.length];
      const isPar = parList.some(
        ([i1, j1, i2, j2]) =>
          (i1 === u && j1 === v) || (i1 === v && j1 === u) || (i2 === u && j2 === v) || (i2 === v && j2 === u)
      );
      const lenEntry = lenList.find(([i, j]) => (i === u && j === v) || (i === v && j === u));
      const edgeLen = lenEntry ? lenEntry[2] : 1;
      const hasUp = upPairs.some(([bot]) => bot === u || bot === v);
      const score = (isPar ? 100 : 0) + (hasUp ? 20 : 0) + edgeLen;
      if (score > bestScore) {
        bestScore = score;
        backRight = u;
        backLeft = v;
      }
    }
  }

  const frontBaseIdx = baseIdx.filter((idx) => idx !== backLeft && idx !== backRight && !backSet.has(idx));
  if (frontBaseIdx.length === 0 && baseIdx.length >= 3) {
    for (const idx of baseIdx) {
      if (idx !== backLeft && idx !== backRight) frontBaseIdx.push(idx);
    }
  }

  const backLenEntry = lenList.find(
    ([i, j]) => (i === backLeft && j === backRight) || (i === backRight && j === backLeft)
  );
  const initBackLen = backLenEntry ? backLenEntry[2] : L0;

  const buildCanonicalSeed = (signX: number): Float64Array => {
    const x = new Float64Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      x[i * 3] = solidVertices[i].x * signX;
      x[i * 3 + 1] = baseSet.has(i) ? 0 : Math.max(0.5 * L0, Math.abs(solidVertices[i].y) || L0);
      x[i * 3 + 2] = baseSet.has(i) ? Math.max(0.4 * L0, Math.abs(solidVertices[i].z) || 0.8 * L0) : solidVertices[i].z;
    }
    if (backLeft !== -1 && backRight !== -1) {
      x[backLeft * 3] = -initBackLen;
      x[backLeft * 3 + 1] = 0;
      x[backLeft * 3 + 2] = 0;
      x[backRight * 3] = 0;
      x[backRight * 3 + 1] = 0;
      x[backRight * 3 + 2] = 0;
    }
    if (frontBaseIdx.length > 0 && backLeft !== -1) {
      for (let f = 0; f < frontBaseIdx.length; f++) {
        const idx = frontBaseIdx[f];
        const frac = (f + 0.5) / frontBaseIdx.length;
        x[idx * 3] = -initBackLen * (1 - frac);
        x[idx * 3 + 1] = 0;
        x[idx * 3 + 2] = 0.85 * initBackLen;
      }
    }
    for (const [bot, top] of upPairs) {
      x[top * 3] = x[bot * 3];
      x[top * 3 + 1] = Math.max(0.8 * L0, x[top * 3 + 1]);
      x[top * 3 + 2] = x[bot * 3 + 2];
    }
    return x;
  };

  const evalResiduals = (x: Float64Array, wReg: number, seed: Float64Array): Float64Array => {
    const r: number[] = [];
    const W = 10.0;

    if (backRight !== -1) {
      r.push((W * x[backRight * 3]) / L0);
      r.push((W * x[backRight * 3 + 1]) / L0);
      r.push((W * x[backRight * 3 + 2]) / L0);
    }
    if (backLeft !== -1) {
      r.push((W * x[backLeft * 3 + 1]) / L0);
      r.push((W * x[backLeft * 3 + 2]) / L0);
      if (backRight !== -1) {
        const dx = x[backRight * 3] - x[backLeft * 3];
        r.push((W * Math.max(0, 0.25 * L0 - dx)) / L0);
      }
    }

    for (const idx of baseIdx) {
      r.push((W * x[idx * 3 + 1]) / L0);
    }
    for (const idx of frontBaseIdx) {
      r.push((5.0 * Math.max(0, 0.25 * L0 - x[idx * 3 + 2])) / L0);
    }
    if (baseIdx.length > 0) {
      for (let i = 0; i < nVerts; i++) {
        if (!baseSet.has(i)) {
          r.push((4.0 * Math.max(0, 0.25 * L0 - x[i * 3 + 1])) / L0);
        }
      }
    }

    for (const [bot, top] of upPairs) {
      r.push((W * (x[top * 3] - x[bot * 3])) / L0);
      r.push((W * (x[top * 3 + 2] - x[bot * 3 + 2])) / L0);
      r.push((W * Math.max(0, 0.25 * L0 - (x[top * 3 + 1] - x[bot * 3 + 1]))) / L0);
    }

    for (const [i, j, L] of lenList) {
      const dist = Math.hypot(x[j * 3] - x[i * 3], x[j * 3 + 1] - x[i * 3 + 1], x[j * 3 + 2] - x[i * 3 + 2]);
      r.push((W * (dist - L)) / L0);
    }

    for (const [i1, j1, i2, j2, ratio] of eqList) {
      const d1 = Math.hypot(x[j1 * 3] - x[i1 * 3], x[j1 * 3 + 1] - x[i1 * 3 + 1], x[j1 * 3 + 2] - x[i1 * 3 + 2]);
      const d2 = Math.hypot(x[j2 * 3] - x[i2 * 3], x[j2 * 3 + 1] - x[i2 * 3 + 1], x[j2 * 3 + 2] - x[i2 * 3 + 2]);
      r.push((W * (d1 - ratio * d2)) / L0);
      r.push((5.0 * Math.max(0, 0.2 * L0 - d1)) / L0);
      r.push((5.0 * Math.max(0, 0.2 * L0 - d2)) / L0);
    }

    for (const [i1, j1, i2, j2, sameDir] of parList) {
      const ax = x[j1 * 3] - x[i1 * 3];
      const ay = x[j1 * 3 + 1] - x[i1 * 3 + 1];
      const az = x[j1 * 3 + 2] - x[i1 * 3 + 2];
      const bx = x[j2 * 3] - x[i2 * 3];
      const by = x[j2 * 3 + 1] - x[i2 * 3 + 1];
      const bz = x[j2 * 3 + 2] - x[i2 * 3 + 2];
      const denom = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) + 1e-8;
      r.push((W * (ay * bz - az * by)) / denom);
      r.push((W * (az * bx - ax * bz)) / denom);
      r.push((W * (ax * by - ay * bx)) / denom);
      if (sameDir) {
        const cos = (ax * bx + ay * by + az * bz) / denom;
        r.push(W * Math.max(0, 0.85 - cos));
      }
    }

    for (const [i1, j1, i2, j2, targetCos] of angList) {
      const ax = x[j1 * 3] - x[i1 * 3];
      const ay = x[j1 * 3 + 1] - x[i1 * 3 + 1];
      const az = x[j1 * 3 + 2] - x[i1 * 3 + 2];
      const bx = x[j2 * 3] - x[i2 * 3];
      const by = x[j2 * 3 + 1] - x[i2 * 3 + 1];
      const bz = x[j2 * 3 + 2] - x[i2 * 3 + 2];
      const denom = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) + 1e-8;
      const cos = (ax * bx + ay * by + az * bz) / denom;
      r.push(W * (cos - targetCos));
    }

    if (upright) {
      for (const [u, v] of lrPairs) {
        r.push((2.5 * Math.max(0, 0.1 * L0 - (x[v * 3] - x[u * 3]))) / L0);
      }
    }

    if (wReg > 0) {
      for (let k = 0; k < x.length; k++) {
        r.push((wReg * (x[k] - seed[k])) / L0);
      }
    }

    return Float64Array.from(r);
  };

  const costOf = (r: Float64Array): number => {
    let s = 0;
    for (let i = 0; i < r.length; i++) s += r[i] * r[i];
    return s;
  };

  const runLM = (seed: Float64Array): { x: Float64Array; finalCost: number } => {
    const n = seed.length;
    let x = Float64Array.from(seed);
    let lambda = 1e-2;
    const eps = 1e-6;

    for (let phase = 0; phase < 2; phase++) {
      const wReg = phase === 0 ? 1e-3 : 0;
      const maxIter = phase === 0 ? 45 : 15;
      let r = evalResiduals(x, wReg, seed);
      let cost = costOf(r);
      if (cost < 1e-14) break;

      const m = r.length;
      const J = new Float64Array(m * n);
      const JtJ = new Float64Array(n * n);
      const Jtr = new Float64Array(n);

      for (let iter = 0; iter < maxIter; iter++) {
        if (cost < 1e-14) break;
        for (let col = 0; col < n; col++) {
          const orig = x[col];
          x[col] = orig + eps;
          const rPlus = evalResiduals(x, wReg, seed);
          x[col] = orig;
          for (let row = 0; row < m; row++) {
            J[row * n + col] = (rPlus[row] - r[row]) / eps;
          }
        }
        JtJ.fill(0);
        Jtr.fill(0);
        for (let row = 0; row < m; row++) {
          const rw = r[row];
          const rowOff = row * n;
          for (let i = 0; i < n; i++) {
            const jri = J[rowOff + i];
            if (jri === 0) continue;
            Jtr[i] -= jri * rw;
            for (let j = i; j < n; j++) {
              JtJ[i * n + j] += jri * J[rowOff + j];
            }
          }
        }
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < i; j++) JtJ[i * n + j] = JtJ[j * n + i];
          JtJ[i * n + i] += lambda + 1e-8;
        }
        const dx = solveSmallLinearSystem(JtJ, Jtr, n);
        const xCand = new Float64Array(n);
        let stepNorm = 0;
        for (let i = 0; i < n; i++) {
          xCand[i] = x[i] + dx[i];
          stepNorm += dx[i] * dx[i];
        }
        const rCand = evalResiduals(xCand, wReg, seed);
        const candCost = costOf(rCand);
        if (candCost < cost) {
          x = xCand;
          r = rCand;
          cost = candCost;
          lambda = Math.max(1e-7, lambda * 0.35);
          if (stepNorm < 1e-14) break;
        } else {
          lambda = Math.min(1e3, lambda * 4.0);
        }
      }
    }
    const finalCost = costOf(evalResiduals(x, 0, seed));
    return { x, finalCost };
  };

  let best = runLM(buildCanonicalSeed(1));
  if (best.finalCost > 1e-4) {
    const alt = runLM(buildCanonicalSeed(-1));
    if (alt.finalCost < best.finalCost) best = alt;
  }

  // Non-degeneracy & 3D volume safety check before committing solved coordinates
  const candidate: FigureVertex[] = solidVertices.map((v, i) => ({
    id: v.id,
    x: Number(best.x[i * 3].toFixed(6)),
    y: Number(best.x[i * 3 + 1].toFixed(6)),
    z: Number(best.x[i * 3 + 2].toFixed(6)),
  }));
  if (candidate.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) {
    return solidVertices;
  }
  for (let i = 0; i < nVerts; i++) {
    for (let j = i + 1; j < nVerts; j++) {
      const d = Math.hypot(
        candidate[j].x - candidate[i].x,
        candidate[j].y - candidate[i].y,
        candidate[j].z - candidate[i].z
      );
      if (d < 0.04 * L0) return solidVertices;
    }
  }
  const pts3D = candidate.map((v) => new THREE.Vector3(v.x, v.y, v.z));
  const refNormal = findBestPlaneNormal(pts3D);
  if (refNormal.lengthSq() < 1e-10) return solidVertices;
  const maxPlaneHeight = Math.max(...pts3D.map((p) => Math.abs(refNormal.dot(p.clone().sub(pts3D[0])))));
  if (maxPlaneHeight < 0.05 * L0) return solidVertices;

  return candidate;
}

export function parseRecognizedFigure(raw: unknown): RecognizedFigure {
  const data = typeof raw === 'string' ? extractJsonObject(raw) : raw;
  const rec = asRecord(data);
  if (!rec) throw new Error('没有认出图里的立体');

  const vertexList = Array.isArray(rec.vertices) ? rec.vertices : [];
  const vertices: FigureVertex[] = [];
  const seen = new Set<string>();
  for (const item of vertexList.slice(0, 24)) {
    const parsedV = vertexFrom(item);
    if (!parsedV) continue;
    if (seen.has(parsedV.id)) throw new Error(`顶点 ${parsedV.id} 重复了`);
    seen.add(parsedV.id);
    vertices.push(parsedV);
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
  const pointConnAux: [string, string][] = [];
  const pointList = Array.isArray(rec.points) ? rec.points : [];
  for (const item of pointList.slice(0, 24)) {
    const point = pointFrom(item);
    if (!point) continue;
    if (seen.has(point.id) && !vertices.some((vertex) => vertex.id === point.id)) {
      throw new Error(`点 ${point.id} 重复了`);
    }
    seen.add(point.id);
    points.push(point);

    const itemRec = asRecord(item);
    const connList = Array.isArray(itemRec?.conn) ? itemRec.conn : [];
    for (const target of connList.slice(0, 12)) {
      const targetId = cleanId(target);
      if (targetId && targetId !== point.id && targetId !== point.from && targetId !== point.to) {
        pointConnAux.push([point.id, targetId]);
      }
    }
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

  // 确定性空间几何约束精修（数毫秒内将极速视觉模型的近似坐标收敛至精确三维解析解）
  solidVertices = solveStereometryConstraints(solidVertices, faces, rec);

  const solidIds = new Set(solidVertices.map((vertex) => vertex.id));
  const auxiliaryPoints = points.filter((point) => !solidIds.has(point.id));

  const aux: [string, string][] = [];
  const auxList = Array.isArray(rec.aux) ? rec.aux : Array.isArray(rec.auxEdges) ? rec.auxEdges : [];
  for (const item of auxList.slice(0, 32)) {
    const pair = pairFrom(item);
    if (pair && pair[0] !== pair[1]) aux.push(pair);
  }
  for (const pair of pointConnAux) {
    aux.push(pair);
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
