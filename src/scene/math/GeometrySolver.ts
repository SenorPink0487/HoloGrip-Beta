import * as THREE from 'three';

export type HighSchoolModelType =
  | 'cube'            // 正方体 / 长方体
  | 'corner-pyramid'  // 墙角模型 / 直角三棱锥 (PA ⊥ PB ⊥ PC)
  | 'tetrahedron'     // 正四面体 (嵌入正方体模型)
  | 'square-pyramid'  // 正四棱锥 (埃及金字塔模型)
  | 'triangular-prism'// 直三棱柱
  | 'cylinder-cone'   // 圆柱与圆锥 (旋转体与截线)
  | 'recognized';     // 题目照片还原的立体

export interface AuxEdge {
  a: string;
  b: string;
}

export interface KeyPoint {
  id: string;
  label: string;
  subLabel?: string;
  type: 'vertex' | 'midpoint' | 'third' | 'center' | 'apex' | 'custom';
  position: THREE.Vector3;
  connectedEdges?: string[];
  ratio?: number;
  edgeVertices?: [string, string];
}

export interface PolygonFace {
  id: string;
  label: string;
  vertexIndices: number[]; // 模型顶点索引列表
  normal: THREE.Vector3;
  hingeEdge?: [number, number]; // 展开旋转所围绕的铰链棱
  unfoldAxis?: THREE.Vector3;
  unfoldAngle?: number;
}

export interface PolyhedronModelDef {
  id: HighSchoolModelType;
  name: string;
  subtitle: string;
  description: string;
  vertices: THREE.Vector3[];
  vertexLabels: string[];
  faces: PolygonFace[];
  edges: [number, number][]; // 顶点索引对组成的棱列表
  keyPoints: KeyPoint[];
  auxEdges?: AuxEdge[]; // 辅助作图线（如中点连线等），由关键点 id 标识
  defaultParams: Record<string, number>;
  boundingRadius: number;
}

export interface CrossSectionResult {
  plane: THREE.Plane;
  polygon: THREE.Vector3[]; // 截面多边形的有序顶点列表
  polygonType: string;      // 例如："等边三角形"、"等腰梯形"、"正六边形"
  perimeter: number;
  area: number;
  areaRatioToBase: number;
  normal: THREE.Vector3;
  dihedralAngleWithBaseDeg: number;
}

export interface SkewLineResult {
  type: 'intersecting' | 'parallel' | 'skew';
  angleDeg: number;         // 0 .. 90
  angleRad: number;
  distance: number;         // 公垂线距离
  directionA: THREE.Vector3;
  directionB: THREE.Vector3;
}

export interface VectorPlaneAngleResult {
  angleDeg: number;         // 线面角 0 .. 90
  normal: THREE.Vector3;
}

export interface DihedralAngleResult {
  angleDeg: number;         // 二面角 0 .. 180
  normalA: THREE.Vector3;
  normalB: THREE.Vector3;
}

export interface SphereAnalysisResult {
  hasCircumSphere: boolean;
  circumRadius: number;
  circumCenter: THREE.Vector3;
  circumArea: number;
  circumVolume: number;
  hasInSphere: boolean;
  inRadius: number;
  inCenter: THREE.Vector3;
  inArea: number;
  inVolume: number;
  radiusRatio: number;     // R / r
  embeddingCuboidSize?: THREE.Vector3; // 墙角模型与正四面体的外接长方体尺寸
}

export class GeometrySolver {
  /**
   * 生成带参数化尺寸的高中 6 大经典几何模型。
   */
  public static createModel(
    type: HighSchoolModelType,
    params: { a?: number; b?: number; c?: number; h?: number; r?: number } = {}
  ): PolyhedronModelDef {
    const a = params.a ?? 1.0;
    const b = params.b ?? a;
    const c = params.c ?? a;
    const h = params.h ?? a;
    const r = params.r ?? a * 0.5;

    switch (type) {
      case 'cube':
        return this.createCubeModel(a, b, c);
      case 'corner-pyramid':
        return this.createCornerPyramidModel(a, b, c);
      case 'tetrahedron':
        return this.createRegularTetrahedronModel(a);
      case 'square-pyramid':
        return this.createSquarePyramidModel(a, h);
      case 'triangular-prism':
        return this.createTriangularPrismModel(a, h);
      case 'cylinder-cone':
        return this.createCylinderConeModel(r, h);
      case 'recognized':
        throw new Error('识图模型要由题目生成');
      default:
        return this.createCubeModel(a, b, c);
    }
  }

  /**
   * 为模型所有棱生成中点 (1/2) 与三等分点 (1/3, 2/3)。
   */
  public static populateEdgeSpecialPoints(
    vertices: THREE.Vector3[],
    vertexLabels: string[],
    edges: [number, number][],
    keyPoints: KeyPoint[]
  ): void {
    edges.forEach(([i1, i2]) => {
      const v1 = vertices[i1];
      const v2 = vertices[i2];
      const l1 = vertexLabels[i1] || `V${i1}`;
      const l2 = vertexLabels[i2] || `V${i2}`;

      // 1. 棱中点 (1/2)
      const midPos = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${l1}${l2})`,
        subLabel: '1/2',
        type: 'midpoint',
        position: midPos,
        ratio: 0.5,
        edgeVertices: [l1, l2],
      });

      // 2. 靠近 v1 的三等分点 (1/3)
      const tri1Pos = new THREE.Vector3().lerpVectors(v1, v2, 1 / 3);
      keyPoints.push({
        id: `tri1_${i1}_${i2}`,
        label: `T₁(${l1}${l2})`,
        subLabel: '1/3',
        type: 'third',
        position: tri1Pos,
        ratio: 1 / 3,
        edgeVertices: [l1, l2],
      });

      // 3. 靠近 v2 的三等分点 (2/3)
      const tri2Pos = new THREE.Vector3().lerpVectors(v1, v2, 2 / 3);
      keyPoints.push({
        id: `tri2_${i1}_${i2}`,
        label: `T₂(${l1}${l2})`,
        subLabel: '2/3',
        type: 'third',
        position: tri2Pos,
        ratio: 2 / 3,
        edgeVertices: [l1, l2],
      });
    });
  }

  /**
   * 查找离射线最近的磁吸目标：
   * 检查与关键点的直接射线距离，以及棱向投影并吸附到 0, 1/3, 1/2, 2/3, 1.0。
   */
  public static findClosestSnapPoint(
    ray: THREE.Ray,
    model: PolyhedronModelDef,
    modelMatrixWorld: THREE.Matrix4,
    threshold = 0.055
  ): { keyPoint: KeyPoint; snapType: 'vertex' | 'midpoint' | 'third' | 'center' | 'apex'; distance: number; snapLabel: string } | null {
    let bestKp: KeyPoint | null = null;
    let minDistance = threshold;
    const worldPos = new THREE.Vector3();

    // 1. 关键点直接距离判定
    for (const kp of model.keyPoints) {
      worldPos.copy(kp.position).applyMatrix4(modelMatrixWorld);
      const dist = ray.distanceToPoint(worldPos);
      let effectiveDist = dist;
      if (kp.type === 'vertex') effectiveDist *= 0.85;
      else if (kp.type === 'midpoint' || kp.type === 'third') effectiveDist *= 0.90;

      if (effectiveDist < minDistance) {
        minDistance = effectiveDist;
        bestKp = kp;
      }
    }

    // 2. 棱向引导磁吸
    const edgeThreshold = threshold * 1.25;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const edgeDir = new THREE.Vector3();
    const w0 = new THREE.Vector3();

    for (const [i1, i2] of model.edges) {
      vA.copy(model.vertices[i1]).applyMatrix4(modelMatrixWorld);
      vB.copy(model.vertices[i2]).applyMatrix4(modelMatrixWorld);
      edgeDir.subVectors(vB, vA);
      const edgeLenSq = edgeDir.lengthSq();
      if (edgeLenSq < 1e-8) continue;

      w0.subVectors(ray.origin, vA);
      const b = ray.direction.dot(edgeDir);
      const c = edgeLenSq;
      const d = ray.direction.dot(w0);
      const e = edgeDir.dot(w0);
      const denom = c - b * b;

      let s = 0;
      let t = 0;
      if (denom < 1e-6) {
        t = THREE.MathUtils.clamp(e / c, 0, 1);
      } else {
        s = (b * e - c * d) / denom;
        if (s < 0) continue; // 位于相机后方
        t = THREE.MathUtils.clamp((e - b * d) / denom, 0, 1);
      }

      const ptOnEdge = new THREE.Vector3().copy(vA).addScaledVector(edgeDir, t);
      const ptOnRay = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.direction, Math.max(0, s));
      const dist = ptOnEdge.distanceTo(ptOnRay);

      if (dist < edgeThreshold && dist < minDistance) {
        // 将参数 t 吸附到 0 (vA), 1/3 (tri1), 1/2 (mid), 2/3 (tri2), 1.0 (vB)
        let targetId = '';
        if (t < 0.16) {
          targetId = `v_${i1}`;
        } else if (t < 0.41) {
          targetId = `tri1_${i1}_${i2}`;
        } else if (t < 0.59) {
          targetId = `mid_${i1}_${i2}`;
        } else if (t < 0.84) {
          targetId = `tri2_${i1}_${i2}`;
        } else {
          targetId = `v_${i2}`;
        }

        const candidateKp = model.keyPoints.find((k) => k.id === targetId);
        if (candidateKp) {
          minDistance = dist;
          bestKp = candidateKp;
        }
      }
    }

    if (!bestKp) return null;

    let snapLabel = bestKp.label;
    if (bestKp.subLabel) {
      const edge = bestKp.edgeVertices ? `${bestKp.edgeVertices[0]}${bestKp.edgeVertices[1]}` : '';
      if (bestKp.subLabel === '1/2') {
        snapLabel = `棱 ${edge} 中点 (1/2)`;
      } else if (bestKp.subLabel === '1/3') {
        snapLabel = `棱 ${edge} 三等分点 (1/3)`;
      } else if (bestKp.subLabel === '2/3') {
        snapLabel = `棱 ${edge} 三等分点 (2/3)`;
      }
    } else if (bestKp.type === 'vertex') {
      snapLabel = `顶点 ${bestKp.label}`;
    }

    return {
      keyPoint: bestKp,
      snapType: bestKp.type as any,
      distance: minDistance,
      snapLabel,
    };
  }

  // -------------------------------------------------------------
  // 1. 正方体 / 长方体
  // -------------------------------------------------------------
  private static createCubeModel(a: number, b: number, c: number): PolyhedronModelDef {
    const x2 = a / 2;
    const y2 = c / 2;
    const z2 = b / 2;

    // 底面顶点：ABCD (y = -y2)，顶面顶点：A1B1C1D1 (y = +y2)
    // 高中课本标准直观图方位：
    // D 点位于左后下方 (0,0,0) 或居中
    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(x2, -y2, z2),   // 0: A
      new THREE.Vector3(x2, -y2, -z2),  // 1: B
      new THREE.Vector3(-x2, -y2, -z2), // 2: C
      new THREE.Vector3(-x2, -y2, z2),  // 3: D
      new THREE.Vector3(x2, y2, z2),    // 4: A1
      new THREE.Vector3(x2, y2, -z2),   // 5: B1
      new THREE.Vector3(-x2, y2, -z2),  // 6: C1
      new THREE.Vector3(-x2, y2, z2),   // 7: D1
    ];

    const vertexLabels = ['A', 'B', 'C', 'D', 'A₁', 'B₁', 'C₁', 'D₁'];

    // 12 条棱
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // 底面：AB, BC, CD, DA
      [4, 5], [5, 6], [6, 7], [7, 4], // 顶面：A1B1, B1C1, C1D1, D1A1
      [0, 4], [1, 5], [2, 6], [3, 7], // 侧棱：AA1, BB1, CC1, DD1
    ];

    // 6 个面（逆时针朝外环绕）
    const faces: PolygonFace[] = [
      { id: 'bottom', label: '底面 ABCD', vertexIndices: [0, 3, 2, 1], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'top', label: '顶面 A₁B₁C₁D₁', vertexIndices: [4, 5, 6, 7], normal: new THREE.Vector3(0, 1, 0) },
      { id: 'front', label: '侧面 AA₁D₁D', vertexIndices: [0, 4, 7, 3], normal: new THREE.Vector3(0, 0, 1) },
      { id: 'back', label: '侧面 BB₁C₁C', vertexIndices: [1, 2, 6, 5], normal: new THREE.Vector3(0, 0, -1) },
      { id: 'right', label: '侧面 ABB₁A₁', vertexIndices: [0, 1, 5, 4], normal: new THREE.Vector3(1, 0, 0) },
      { id: 'left', label: '侧面 DCC₁D₁', vertexIndices: [3, 7, 6, 2], normal: new THREE.Vector3(-1, 0, 0) },
    ];

    const keyPoints: KeyPoint[] = [];
    vertices.forEach((v, idx) => {
      keyPoints.push({
        id: `v_${idx}`,
        label: vertexLabels[idx],
        type: 'vertex',
        position: v.clone(),
      });
    });

    // 棱特殊点：12 个中点 (1/2) 与 24 个三等分点 (1/3, 2/3)
    this.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

    // 面心
    faces.forEach((f) => {
      const center = new THREE.Vector3();
      f.vertexIndices.forEach((vi) => center.add(vertices[vi]));
      center.multiplyScalar(1 / f.vertexIndices.length);
      keyPoints.push({
        id: `face_${f.id}`,
        label: `O_${f.id}`,
        type: 'center',
        position: center,
      });
    });

    // 体心（对角线交点）
    keyPoints.push({
      id: 'body_center',
      label: 'O (体心)',
      type: 'center',
      position: new THREE.Vector3(0, 0, 0),
    });

    return {
      id: 'cube',
      name: a === b && b === c ? '正方体' : '长方体',
      subtitle: a === b && b === c ? '棱长 a' : `${a} × ${b} × ${c}`,
      description: '高中立体几何经典母体。支持8顶点、12棱中点、6面心、体心交互，截面可形成三角形、梯形、五边形、正六边形。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { a, b, c },
      boundingRadius: Math.hypot(x2, y2, z2),
    };
  }

  // -------------------------------------------------------------
  // 2. 墙角模型 / 直角三棱锥 (PA ⊥ PB ⊥ PC)
  // -------------------------------------------------------------
  private static createCornerPyramidModel(a: number, b: number, c: number): PolyhedronModelDef {
    // 顶点 P 为原点 (0, 0, 0)
    // PA 沿 X 轴，PB 沿 Z 轴，PC 沿 Y 轴（三条侧棱两两垂直）
    // 将质心平移至原点以实现自然旋转
    const cx = a / 4;
    const cy = c / 4;
    const cz = b / 4;

    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(-cx, -cy, -cz),          // 0: P (直角墙角顶点)
      new THREE.Vector3(a - cx, -cy, -cz),      // 1: A (X轴端点)
      new THREE.Vector3(-cx, -cy, b - cz),      // 2: B (Z轴端点)
      new THREE.Vector3(-cx, c - cy, -cz),      // 3: C (Y轴端点)
    ];

    const vertexLabels = ['P', 'A', 'B', 'C'];

    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3], // 侧棱 PA, PB, PC (两两垂直)
      [1, 2], [2, 3], [3, 1], // 底面边 AB, BC, CA
    ];

    const faces: PolygonFace[] = [
      { id: 'base', label: '底面 ABC', vertexIndices: [1, 3, 2], normal: new THREE.Vector3(b * c, a * b, a * c).normalize() },
      { id: 'pab', label: '侧面 PAB', vertexIndices: [0, 1, 2], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'pbc', label: '侧面 PBC', vertexIndices: [0, 2, 3], normal: new THREE.Vector3(-1, 0, 0) },
      { id: 'pca', label: '侧面 PCA', vertexIndices: [0, 3, 1], normal: new THREE.Vector3(0, 0, -1) },
    ];

    const keyPoints: KeyPoint[] = [];
    vertices.forEach((v, idx) => {
      keyPoints.push({
        id: `v_${idx}`,
        label: vertexLabels[idx],
        type: 'vertex',
        position: v.clone(),
      });
    });

    // 棱特殊点：6 个中点 (1/2) 与 12 个三等分点 (1/3, 2/3)
    this.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

    // 底面中心 (ABC重心)
    const baseCenter = new THREE.Vector3()
      .add(vertices[1]).add(vertices[2]).add(vertices[3])
      .multiplyScalar(1 / 3);
    keyPoints.push({
      id: 'center_abc',
      label: 'O_底 (ABC重心)',
      type: 'center',
      position: baseCenter,
    });

    return {
      id: 'corner-pyramid',
      name: '墙角模型 (直角三棱锥)',
      subtitle: `PA=${a}, PB=${b}, PC=${c} (两两垂直)`,
      description: '高考外接球第一大母题！PA ⊥ PB ⊥ PC，补形成长方体即可直接证明外接球直径 2R = √(a²+b²+c²)。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { a, b, c },
      boundingRadius: Math.max(a, b, c) * 0.85,
    };
  }

  // -------------------------------------------------------------
  // 3. 正四面体 / 正三棱锥 (Regular Tetrahedron)
  // -------------------------------------------------------------
  private static createRegularTetrahedronModel(L: number): PolyhedronModelDef {
    // 标准正立正四面体：
    // 底面 BCD 水平（平行于 XZ 平面）平放，顶点 A 沿 Y 轴正方向直立向上。
    const h = (Math.sqrt(6) / 3) * L;            // 正四面体总高
    const yBase = -h / 4;                        // -sqrt(6)/12 * L（质心位于原点 (0,0,0)）
    const yApex = (3 * h) / 4;                   // +sqrt(6)/4 * L
    const rCircum = (Math.sqrt(3) / 3) * L;      // 底面外接圆半径 R_base = L / sqrt(3)
    const rIn = (Math.sqrt(3) / 6) * L;          // 底面内切圆半径 r_base = L / (2 * sqrt(3))

    // 前棱 BC 平行于 X 轴，后顶点 D 位于 Z 轴负半轴：
    // 0: A (顶角)
    // 1: B (底面前左)
    // 2: C (底面前右)
    // 3: D (底面后)
    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(0, yApex, 0),        // 0: A (顶角)
      new THREE.Vector3(-L / 2, yBase, rIn), // 1: B (底面前左)
      new THREE.Vector3(L / 2, yBase, rIn),  // 2: C (底面前右)
      new THREE.Vector3(0, yBase, -rCircum), // 3: D (底面后)
    ];

    const vertexLabels = ['A', 'B', 'C', 'D'];

    // 6 条棱：所有顶点对
    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3], // 侧棱：AB, AC, AD
      [1, 2], [2, 3], [3, 1], // 底棱：BC, CD, DB
    ];

    const faces: PolygonFace[] = [
      { id: 'bcd', label: '底面 BCD', vertexIndices: [1, 2, 3], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'abc', label: '侧面 ABC', vertexIndices: [0, 1, 2], normal: new THREE.Vector3(0, 1 / 3, (2 * Math.SQRT2) / 3).normalize() },
      { id: 'acd', label: '侧面 ACD', vertexIndices: [0, 2, 3], normal: new THREE.Vector3(Math.sqrt(6) / 3, 1 / 3, -Math.SQRT2 / 3).normalize() },
      { id: 'adb', label: '侧面 ADB', vertexIndices: [0, 3, 1], normal: new THREE.Vector3(-Math.sqrt(6) / 3, 1 / 3, -Math.SQRT2 / 3).normalize() },
    ];

    const keyPoints: KeyPoint[] = [];
    vertices.forEach((v, idx) => {
      keyPoints.push({
        id: `v_${idx}`,
        label: vertexLabels[idx],
        type: 'vertex',
        position: v.clone(),
      });
    });

    // 棱特殊点：6 个中点 (1/2) 与 12 个三等分点 (1/3, 2/3)
    this.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

    // 各面中心
    faces.forEach((f) => {
      const fc = new THREE.Vector3();
      f.vertexIndices.forEach((vi) => fc.add(vertices[vi]));
      fc.multiplyScalar(1 / 3);
      keyPoints.push({
        id: `face_${f.id}`,
        label: `O_${f.label.split(' ')[1]}`,
        type: 'center',
        position: fc,
      });
    });

    // 体心 O (0,0,0)，同时也是外心与内心
    keyPoints.push({
      id: 'body_center',
      label: 'O (外心/内心)',
      type: 'center',
      position: new THREE.Vector3(0, 0, 0),
    });

    return {
      id: 'tetrahedron',
      name: '正四面体',
      subtitle: `棱长 L = ${L.toFixed(2)}`,
      description: '高中对称性最强的三棱锥。对棱互相垂直，四条高线交于一点，外接球半径与内切球半径之比恒为 3:1。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { a: L },
      boundingRadius: (Math.sqrt(6) / 4) * L,
    };
  }

  // -------------------------------------------------------------
  // 4. 正四棱锥 (Square Pyramid / 金字塔模型)
  // -------------------------------------------------------------
  private static createSquarePyramidModel(a: number, h: number): PolyhedronModelDef {
    const a2 = a / 2;
    const yBase = -h / 3; // 质心偏移
    const yApex = h * 2 / 3;

    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(0, yApex, 0),    // 0: P (顶点)
      new THREE.Vector3(a2, yBase, a2),   // 1: A
      new THREE.Vector3(a2, yBase, -a2),  // 2: B
      new THREE.Vector3(-a2, yBase, -a2), // 3: C
      new THREE.Vector3(-a2, yBase, a2),  // 4: D
    ];

    const vertexLabels = ['P', 'A', 'B', 'C', 'D'];

    const edges: [number, number][] = [
      [1, 2], [2, 3], [3, 4], [4, 1], // 底棱
      [0, 1], [0, 2], [0, 3], [0, 4], // 侧棱
    ];

    const faces: PolygonFace[] = [
      { id: 'base', label: '底面 ABCD', vertexIndices: [1, 4, 3, 2], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'pab', label: '侧面 PAB', vertexIndices: [0, 1, 2], normal: new THREE.Vector3(h, a2, 0).normalize() },
      { id: 'pbc', label: '侧面 PBC', vertexIndices: [0, 2, 3], normal: new THREE.Vector3(0, a2, -h).normalize() },
      { id: 'pcd', label: '侧面 PCD', vertexIndices: [0, 3, 4], normal: new THREE.Vector3(-h, a2, 0).normalize() },
      { id: 'pda', label: '侧面 PDA', vertexIndices: [0, 4, 1], normal: new THREE.Vector3(0, a2, h).normalize() },
    ];

    const keyPoints: KeyPoint[] = [];
    vertices.forEach((v, idx) => {
      keyPoints.push({
        id: `v_${idx}`,
        label: vertexLabels[idx],
        type: 'vertex',
        position: v.clone(),
      });
    });

    // 棱特殊点：8 个中点 (1/2) 与 16 个三等分点 (1/3, 2/3)
    this.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

    // 底面中心 O (顶点 P 在底面的垂足)
    keyPoints.push({
      id: 'base_center',
      label: 'O (底面中心/高线垂足)',
      type: 'center',
      position: new THREE.Vector3(0, yBase, 0),
    });

    return {
      id: 'square-pyramid',
      name: '正四棱锥 (金字塔模型)',
      subtitle: `底面 a=${a}, 高 h=${h}`,
      description: '高考立体几何大题高频考点。PO ⊥ 底面 ABCD，斜高、高与底面边长勾股定理，侧面与底面所成二面角教学母体。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { a, h },
      boundingRadius: Math.hypot(a2, yApex),
    };
  }

  // -------------------------------------------------------------
  // 5. 直三棱柱 (Right Triangular Prism)
  // -------------------------------------------------------------
  private static createTriangularPrismModel(a: number, h: number): PolyhedronModelDef {
    // 正三角形底面边长 a，底面高 = a * sqrt(3) / 2
    const hBase = (a * Math.sqrt(3)) / 2;
    const rCircum = a / Math.sqrt(3);
    const rIn = hBase / 3;
    const y2 = h / 2;

    // 底面三角形：ABC (y = -y2)
    // 顶面三角形：A1B1C1 (y = y2)
    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(0, -y2, rCircum),                         // 0: A
      new THREE.Vector3(a / 2, -y2, rCircum - hBase),             // 1: B
      new THREE.Vector3(-a / 2, -y2, rCircum - hBase),            // 2: C
      new THREE.Vector3(0, y2, rCircum),                          // 3: A₁
      new THREE.Vector3(a / 2, y2, rCircum - hBase),              // 4: B₁
      new THREE.Vector3(-a / 2, y2, rCircum - hBase),             // 5: C₁
    ];

    const vertexLabels = ['A', 'B', 'C', 'A₁', 'B₁', 'C₁'];

    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 0], // 底面：AB, BC, CA
      [3, 4], [4, 5], [5, 3], // 顶面：A1B1, B1C1, C1A1
      [0, 3], [1, 4], [2, 5], // 侧棱：AA1, BB1, CC1
    ];

    const faces: PolygonFace[] = [
      { id: 'bottom', label: '底面 ABC', vertexIndices: [0, 2, 1], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'top', label: '顶面 A₁B₁C₁', vertexIndices: [3, 4, 5], normal: new THREE.Vector3(0, 1, 0) },
      { id: 'side_ab', label: '侧面 ABB₁A₁', vertexIndices: [0, 1, 4, 3], normal: new THREE.Vector3(hBase, 0, a / 2).normalize() },
      { id: 'side_bc', label: '侧面 BCC₁B₁', vertexIndices: [1, 2, 5, 4], normal: new THREE.Vector3(0, 0, -1) },
      { id: 'side_ca', label: '侧面 CAA₁C₁', vertexIndices: [2, 0, 3, 5], normal: new THREE.Vector3(-hBase, 0, a / 2).normalize() },
    ];

    const keyPoints: KeyPoint[] = [];
    vertices.forEach((v, idx) => {
      keyPoints.push({
        id: `v_${idx}`,
        label: vertexLabels[idx],
        type: 'vertex',
        position: v.clone(),
      });
    });

    // 棱特殊点：9 个中点 (1/2) 与 18 个三等分点 (1/3, 2/3)
    this.populateEdgeSpecialPoints(vertices, vertexLabels, edges, keyPoints);

    // 上下底面外心
    keyPoints.push({
      id: 'center_bottom',
      label: 'O_底 (ABC外心)',
      type: 'center',
      position: new THREE.Vector3(0, -y2, 0),
    });
    keyPoints.push({
      id: 'center_top',
      label: 'O_顶 (A₁B₁C₁外心)',
      type: 'center',
      position: new THREE.Vector3(0, y2, 0),
    });

    // 三棱柱外接球心
    keyPoints.push({
      id: 'body_center',
      label: 'O (外接球心)',
      type: 'center',
      position: new THREE.Vector3(0, 0, 0),
    });

    return {
      id: 'triangular-prism',
      name: '正三棱柱 (柱体模型)',
      subtitle: `底面正三角形 a=${a}, 高 h=${h}`,
      description: '高考柱体外接球与截面折叠母题。外接球心是上、下底面外心连线中点，半径公式 R² = r_底² + (h/2)²。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { a, h },
      boundingRadius: Math.hypot(rCircum, y2),
    };
  }

  // -------------------------------------------------------------
  // 6. 圆柱与圆锥 (Cylinder & Cone)
  // -------------------------------------------------------------
  private static createCylinderConeModel(r: number, h: number): PolyhedronModelDef {
    // 12 边形逼近用于几何关键点吸附
    const segments = 12;
    const y2 = h / 2;
    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(0, y2, 0), // 0: S (圆锥顶点)
    ];
    const vertexLabels: string[] = ['S'];

    // 底面圆周顶点 1..12
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      vertices.push(new THREE.Vector3(x, -y2, z));
      vertexLabels.push(`P${i + 1}`);
    }

    const edges: [number, number][] = [];
    for (let i = 1; i <= segments; i++) {
      const next = i === segments ? 1 : i + 1;
      edges.push([i, next]); // 底圆周棱
      edges.push([0, i]);    // 圆锥母线
    }

    const faces: PolygonFace[] = [
      {
        id: 'base',
        label: '底面圆',
        vertexIndices: Array.from({ length: segments }, (_, i) => segments - i),
        normal: new THREE.Vector3(0, -1, 0),
      },
    ];

    // 连接锥顶 S (0) 与圆周各点的圆锥侧面
    for (let i = 1; i <= segments; i++) {
      const next = i === segments ? 1 : i + 1;
      const p1 = vertices[i];
      const p2 = vertices[next];
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(p1, vertices[0]),
        new THREE.Vector3().subVectors(p2, vertices[0])
      ).normalize();
      faces.push({
        id: `cone_side_${i}`,
        label: `侧面 ${i}`,
        vertexIndices: [0, i, next],
        normal: n,
      });
    }

    const keyPoints: KeyPoint[] = [];
    keyPoints.push({
      id: 'apex',
      label: 'S (锥顶)',
      type: 'apex',
      position: vertices[0].clone(),
    });
    keyPoints.push({
      id: 'base_center',
      label: 'O (底面圆心)',
      type: 'center',
      position: new THREE.Vector3(0, -y2, 0),
    });

    // 底面圆周 4 个基准点 (A, B, C, D)
    const cardinals = [
      { idx: 1, label: 'A' },
      { idx: Math.floor(segments * 0.25) + 1, label: 'B' },
      { idx: Math.floor(segments * 0.5) + 1, label: 'C' },
      { idx: Math.floor(segments * 0.75) + 1, label: 'D' },
    ];
    cardinals.forEach(({ idx, label }) => {
      keyPoints.push({
        id: `cardinal_${label}`,
        label: `${label} (底面点)`,
        type: 'vertex',
        position: vertices[idx].clone(),
      });
    });

    // 沿关键母线（S 到 A, B, C, D）的特殊点
    const cardinalEdges: [number, number][] = cardinals.map(({ idx }) => [0, idx]);
    this.populateEdgeSpecialPoints(vertices, vertexLabels, cardinalEdges, keyPoints);

    return {
      id: 'cylinder-cone',
      name: '圆柱与圆锥 (旋转体截面)',
      subtitle: `底面半径 r=${r}, 高 h=${h}`,
      description: '祖暅原理与圆锥曲线截面母题。截面平行母线得抛物线，截面平行轴心线得双曲线，侧面展开为扇形。',
      vertices,
      vertexLabels,
      faces,
      edges,
      keyPoints,
      defaultParams: { r, h },
      boundingRadius: Math.hypot(r, y2),
    };
  }

  // -------------------------------------------------------------
  // 空间解析几何与向量计算 (Vector Analytical Geometry)
  // -------------------------------------------------------------

  /**
   * 由三点求解平面方程 Ax + By + Cz + D = 0。
   */
  public static solvePlaneFrom3Points(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3
  ): THREE.Plane {
    const v12 = new THREE.Vector3().subVectors(p2, p1);
    const v13 = new THREE.Vector3().subVectors(p3, p1);
    const normal = new THREE.Vector3().crossVectors(v12, v13).normalize();
    if (normal.lengthSq() < 1e-6) {
      // 退化点（三点共线）
      return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    }
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p1);
  }

  /**
   * 计算两条空间直线夹角与异面直线公垂线距离。
   */
  public static computeSkewLineMetrics(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    q1: THREE.Vector3,
    q2: THREE.Vector3
  ): SkewLineResult {
    const u = new THREE.Vector3().subVectors(p2, p1);
    const v = new THREE.Vector3().subVectors(q2, q1);
    const lenU = u.length();
    const lenV = v.length();

    if (lenU < 1e-6 || lenV < 1e-6) {
      return {
        type: 'intersecting',
        angleDeg: 0,
        angleRad: 0,
        distance: 0,
        directionA: u.normalize(),
        directionB: v.normalize(),
      };
    }

    const uNorm = u.clone().normalize();
    const vNorm = v.clone().normalize();

    // 夹角余弦在 [0, 90°] 内：|u . v| / (|u| |v|)
    const dot = Math.abs(uNorm.dot(vNorm));
    const clampedDot = Math.min(1.0, Math.max(0.0, dot));
    const angleRad = Math.acos(clampedDot);
    const angleDeg = (angleRad * 180) / Math.PI;

    // 叉乘判定平行还是异面
    const cross = new THREE.Vector3().crossVectors(uNorm, vNorm);
    const crossLen = cross.length();

    if (crossLen < 1e-5) {
      // 两直线平行
      const p1q1 = new THREE.Vector3().subVectors(q1, p1);
      const perpDist = new THREE.Vector3().crossVectors(p1q1, uNorm).length();
      return {
        type: perpDist < 1e-4 ? 'intersecting' : 'parallel',
        angleDeg: 0,
        angleRad: 0,
        distance: perpDist,
        directionA: uNorm,
        directionB: vNorm,
      };
    }

    // 空间异面直线或相交直线：
    // 距离 = |(q1 - p1) . (u x v)| / |u x v|
    const p1q1 = new THREE.Vector3().subVectors(q1, p1);
    const dist = Math.abs(p1q1.dot(cross)) / crossLen;

    return {
      type: dist < 1e-4 ? 'intersecting' : 'skew',
      angleDeg,
      angleRad,
      distance: dist,
      directionA: uNorm,
      directionB: vNorm,
    };
  }

  /**
   * 线面角计算：sin(phi) = |u . n| / (|u| |n|)，phi 范围 [0, 90°]。
   */
  public static computeLinePlaneAngle(
    lineP1: THREE.Vector3,
    lineP2: THREE.Vector3,
    plane: THREE.Plane
  ): VectorPlaneAngleResult {
    const u = new THREE.Vector3().subVectors(lineP2, lineP1).normalize();
    const n = plane.normal.clone().normalize();
    const sinPhi = Math.abs(u.dot(n));
    const angleRad = Math.asin(Math.min(1.0, Math.max(0.0, sinPhi)));
    return {
      angleDeg: (angleRad * 180) / Math.PI,
      normal: n,
    };
  }

  /**
   * 二面角计算：cos(theta) = |n1 . n2| / (|n1| |n2|)，theta 范围 [0, 180°]。
   */
  public static computeDihedralAngle(
    planeA: THREE.Plane,
    planeB: THREE.Plane
  ): DihedralAngleResult {
    const nA = planeA.normal.clone().normalize();
    const nB = planeB.normal.clone().normalize();
    const dot = nA.dot(nB);
    const clamped = Math.min(1.0, Math.max(-1.0, dot));
    const angleRad = Math.acos(clamped);
    return {
      angleDeg: (angleRad * 180) / Math.PI,
      normalA: nA,
      normalB: nB,
    };
  }

  // -------------------------------------------------------------
  // 3D 截面剖切多边形裁切 (Sutherland-Hodgman Polygon-Plane Clipping)
  // -------------------------------------------------------------

  /**
   * 使用平面剖切多面体并提取闭合平面截面多边形。
   */
  public static computePolyhedronCrossSection(
    model: PolyhedronModelDef,
    plane: THREE.Plane
  ): CrossSectionResult | null {
    const intersectionSegments: [THREE.Vector3, THREE.Vector3][] = [];

    // 对多面体的每个多边形面，将其各棱与剖切平面求交
    for (const face of model.faces) {
      const faceVerts = face.vertexIndices.map((idx) => model.vertices[idx]);
      const seg = this.intersectFaceWithPlane(faceVerts, plane);
      if (seg) {
        intersectionSegments.push(seg);
      }
    }

    if (intersectionSegments.length < 3) {
      return null;
    }

    // 将交线段拼接为有序多边形环
    const polygon = this.orderIntersectionSegments(intersectionSegments);
    if (polygon.length < 3) {
      return null;
    }

    // 面积与周长
    let area = 0;
    let perimeter = 0;
    const n = polygon.length;
    const edgeLengths: number[] = [];

    // 利用叉乘累加计算空间平面多边形面积
    const normalAcc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % n];
      const edgeLen = p1.distanceTo(p2);
      edgeLengths.push(edgeLen);
      perimeter += edgeLen;
      normalAcc.add(new THREE.Vector3().crossVectors(p1, p2));
    }
    area = normalAcc.dot(plane.normal.clone().normalize()) * 0.5;
    area = Math.abs(area);

    // 多边形分类判定
    const polygonType = this.classifyPolygon(polygon, edgeLengths);

    // 底面积近似值
    const baseArea = (model.defaultParams.a ?? 1) * (model.defaultParams.b ?? model.defaultParams.a ?? 1);
    const areaRatioToBase = baseArea > 1e-4 ? area / baseArea : 1.0;

    // 与水平底面 (0, 1, 0) 所成二面角
    const basePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dihedral = this.computeDihedralAngle(plane, basePlane);

    return {
      plane,
      polygon,
      polygonType,
      perimeter,
      area,
      areaRatioToBase,
      normal: plane.normal.clone(),
      dihedralAngleWithBaseDeg: dihedral.angleDeg,
    };
  }

  private static intersectFaceWithPlane(
    faceVertices: THREE.Vector3[],
    plane: THREE.Plane
  ): [THREE.Vector3, THREE.Vector3] | null {
    const hits: THREE.Vector3[] = [];
    const n = faceVertices.length;

    for (let i = 0; i < n; i++) {
      const p1 = faceVertices[i];
      const p2 = faceVertices[(i + 1) % n];
      const d1 = plane.distanceToPoint(p1);
      const d2 = plane.distanceToPoint(p2);

      // 检查边是否穿过平面
      if (Math.abs(d1) < 1e-6) {
        if (!hits.some((h) => h.distanceTo(p1) < 1e-4)) {
          hits.push(p1.clone());
        }
      } else if (d1 * d2 < 0) {
        const t = d1 / (d1 - d2);
        const intersectPt = new THREE.Vector3().lerpVectors(p1, p2, t);
        if (!hits.some((h) => h.distanceTo(intersectPt) < 1e-4)) {
          hits.push(intersectPt);
        }
      }
    }

    if (hits.length === 2) {
      return [hits[0], hits[1]];
    }
    return null;
  }

  private static orderIntersectionSegments(
    segments: [THREE.Vector3, THREE.Vector3][]
  ): THREE.Vector3[] {
    if (segments.length === 0) return [];

    const ordered: THREE.Vector3[] = [segments[0][0], segments[0][1]];
    const used = new Set<number>([0]);

    while (used.size < segments.length) {
      const currentTail = ordered[ordered.length - 1];
      let foundNext = false;

      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const [p1, p2] = segments[i];

        if (currentTail.distanceTo(p1) < 1e-4) {
          ordered.push(p2);
          used.add(i);
          foundNext = true;
          break;
        } else if (currentTail.distanceTo(p2) < 1e-4) {
          ordered.push(p1);
          used.add(i);
          foundNext = true;
          break;
        }
      }

      if (!foundNext) break;
    }

    // 若首尾重合则移除闭合重复点
    if (ordered.length > 3 && ordered[0].distanceTo(ordered[ordered.length - 1]) < 1e-4) {
      ordered.pop();
    }

    return ordered;
  }

  private static classifyPolygon(points: THREE.Vector3[], edgeLengths: number[]): string {
    const count = points.length;
    if (count === 3) {
      const [e1, e2, e3] = edgeLengths;
      const isEquilateral = Math.abs(e1 - e2) < 1e-3 && Math.abs(e2 - e3) < 1e-3;
      if (isEquilateral) return '正三角形 (等边三角形)';
      const isIsosceles = Math.abs(e1 - e2) < 1e-3 || Math.abs(e2 - e3) < 1e-3 || Math.abs(e3 - e1) < 1e-3;
      if (isIsosceles) return '等腰三角形';
      return '一般三角形';
    }

    if (count === 4) {
      const [e1, e2, e3, e4] = edgeLengths;
      const isSquare =
        Math.abs(e1 - e2) < 1e-3 &&
        Math.abs(e2 - e3) < 1e-3 &&
        Math.abs(e3 - e4) < 1e-3;
      if (isSquare) return '正方形';
      const isRectangle = Math.abs(e1 - e3) < 1e-3 && Math.abs(e2 - e4) < 1e-3;
      if (isRectangle) return '矩形 / 平行四边形';
      const isTrapezoid = Math.abs(e1 - e3) > 1e-3 && (Math.abs(e2 - e4) < 1e-3);
      if (isTrapezoid) return '等腰梯形';
      return '四边形 (梯形)';
    }

    if (count === 5) {
      return '五边形 (截角截面)';
    }

    if (count === 6) {
      const isRegular = edgeLengths.every((len) => Math.abs(len - edgeLengths[0]) < 1e-2);
      if (isRegular) return '正六边形 (六棱中点经典截面)';
      return '六边形';
    }

    return `${count} 边形`;
  }

  // -------------------------------------------------------------
  // 高考四大外接球与内切球求解 (Circumscribed & Inscribed Sphere)
  // -------------------------------------------------------------

  public static computeSphereAnalysis(
    modelType: HighSchoolModelType,
    params: { a?: number; b?: number; c?: number; h?: number; r?: number } = {}
  ): SphereAnalysisResult {
    const a = params.a ?? 1.0;
    const b = params.b ?? a;
    const c = params.c ?? a;
    const h = params.h ?? a;
    const r = params.r ?? a * 0.5;

    let circumRadius = 0;
    let circumCenter = new THREE.Vector3(0, 0, 0);
    let inRadius = 0;
    let inCenter = new THREE.Vector3(0, 0, 0);
    let embeddingCuboid: THREE.Vector3 | undefined;

    switch (modelType) {
      case 'cube': {
        // 长方体：2R = sqrt(a² + b² + c²)
        circumRadius = 0.5 * Math.hypot(a, b, c);
        circumCenter.set(0, 0, 0);
        inRadius = Math.min(a, b, c) / 2;
        inCenter.set(0, 0, 0);
        embeddingCuboid = new THREE.Vector3(a, c, b);
        break;
      }

      case 'corner-pyramid': {
        // 墙角模型 PA ⊥ PB ⊥ PC：
        // 补形为 a x c x b 长方体
        // 2R = sqrt(a² + b² + c²)
        circumRadius = 0.5 * Math.hypot(a, b, c);
        // 球心相对于偏移 (-a/4, -c/4, -b/4) 的位置
        circumCenter.set(a / 4, c / 4, b / 4);
        embeddingCuboid = new THREE.Vector3(a, c, b);

        // 内切球：r = 3V / S_total
        const v = (1 / 6) * a * b * c;
        const sPAB = 0.5 * a * b;
        const sPBC = 0.5 * b * c;
        const sPCA = 0.5 * c * a;
        const sABC = 0.5 * Math.hypot(a * b, b * c, c * a);
        const sTotal = sPAB + sPBC + sPCA + sABC;
        inRadius = (3 * v) / sTotal;
        inCenter.set(-a / 4 + inRadius, -c / 4 + inRadius, -b / 4 + inRadius);
        break;
      }

      case 'tetrahedron': {
        // 棱长 L = a 的正四面体
        // 嵌入棱长为 L / sqrt(2) 的正方体
        // R = sqrt(6)/4 * L, r = sqrt(6)/12 * L, R/r = 3:1
        circumRadius = (Math.sqrt(6) / 4) * a;
        circumCenter.set(0, 0, 0);
        inRadius = (Math.sqrt(6) / 12) * a;
        inCenter.set(0, 0, 0);
        const cubeSide = a / Math.SQRT2;
        embeddingCuboid = new THREE.Vector3(cubeSide, cubeSide, cubeSide);
        break;
      }

      case 'square-pyramid': {
        // 正四棱锥：底边长 a，高 h
        // R = (a² + 2h²) / (4h)
        circumRadius = (a * a + 2 * h * h) / (4 * h);
        const yBase = -h / 3;
        circumCenter.set(0, yBase + h - circumRadius, 0);

        // 内切球半径：r = 3V / S_total
        const slantHeight = Math.hypot(h, a / 2);
        const sBase = a * a;
        const sLateral = 2 * a * slantHeight;
        const v = (1 / 3) * sBase * h;
        inRadius = (3 * v) / (sBase + sLateral);
        inCenter.set(0, yBase + inRadius, 0);
        break;
      }

      case 'triangular-prism': {
        // 正三棱柱：底边长 a，高 h
        // R² = r_base² + (h/2)², r_base = a / sqrt(3)
        const rBaseCircum = a / Math.sqrt(3);
        circumRadius = Math.hypot(rBaseCircum, h / 2);
        circumCenter.set(0, 0, 0);
        inRadius = Math.min((a * Math.sqrt(3)) / 6, h / 2);
        inCenter.set(0, 0, 0);
        break;
      }

      case 'cylinder-cone': {
        // 圆锥：锥顶到底面中心
        const l = Math.hypot(r, h);
        circumRadius = (l * l) / (2 * h);
        circumCenter.set(0, h / 2 - circumRadius, 0);
        inRadius = (r * h) / (r + l);
        inCenter.set(0, -h / 2 + inRadius, 0);
        break;
      }

      case 'recognized':
        break;
    }

    const circumArea = 4 * Math.PI * circumRadius * circumRadius;
    const circumVolume = (4 / 3) * Math.PI * Math.pow(circumRadius, 3);
    const inArea = 4 * Math.PI * inRadius * inRadius;
    const inVolume = (4 / 3) * Math.PI * Math.pow(inRadius, 3);
    const radiusRatio = inRadius > 1e-4 ? circumRadius / inRadius : 1.0;

    return {
      hasCircumSphere: circumRadius > 0,
      circumRadius,
      circumCenter,
      circumArea,
      circumVolume,
      hasInSphere: inRadius > 0,
      inRadius,
      inCenter,
      inArea,
      inVolume,
      radiusRatio,
      embeddingCuboidSize: embeddingCuboid,
    };
  }

  /**
   * 当所有顶点共球时计算外接球，以及四面体的内切球半径。
   * 用于拍照识别出的立体几何图形（其尺寸不属于预设公式）。
   */
  public static analyzeRecognizedModel(model: PolyhedronModelDef): SphereAnalysisResult {
    const verts = model.vertices;
    const empty = new THREE.Vector3();
    let circumCenter = empty.clone();
    let circumRadius = 0;
    let inCenter = empty.clone();
    let inRadius = 0;
    let embeddingCuboid: THREE.Vector3 | undefined;

    if (verts.length > 0) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      verts.forEach((v) => {
        min.min(v);
        max.max(v);
      });
      embeddingCuboid = max.clone().sub(min);

      const tetra = this.findTetraBasis(verts);
      if (tetra) {
        const solved = this.circumcenterOfTetra(tetra[0], tetra[1], tetra[2], tetra[3]);
        if (solved) {
          const radius = solved.distanceTo(tetra[0]);
          const onSphere = verts.every((v) => Math.abs(v.distanceTo(solved) - radius) < 1e-3);
          if (onSphere && radius > 1e-6) {
            circumCenter = solved;
            circumRadius = radius;
          }
        }
      }
    }

    if (verts.length === 4 && model.faces.length === 4 && circumRadius > 0) {
      const [a, b, c, d] = verts;
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      const ad = d.clone().sub(a);
      const volume = Math.abs(ab.dot(ac.clone().cross(ad))) / 6;
      let surface = 0;
      for (const face of model.faces) {
        surface += this.fanArea(verts, face.vertexIndices);
      }
      if (volume > 1e-8 && surface > 1e-8) {
        inRadius = (3 * volume) / surface;
        const weighted = new THREE.Vector3();
        let weightSum = 0;
        for (let i = 0; i < 4; i++) {
          const opposite = model.faces.find((face) => !face.vertexIndices.includes(i));
          const area = opposite ? this.fanArea(verts, opposite.vertexIndices) : 0;
          weighted.addScaledVector(verts[i], area);
          weightSum += area;
        }
        if (weightSum > 1e-8) inCenter = weighted.multiplyScalar(1 / weightSum);
      }
    }

    const circumArea = 4 * Math.PI * circumRadius * circumRadius;
    const circumVolume = (4 / 3) * Math.PI * Math.pow(circumRadius, 3);
    const inArea = 4 * Math.PI * inRadius * inRadius;
    const inVolume = (4 / 3) * Math.PI * Math.pow(inRadius, 3);

    return {
      hasCircumSphere: circumRadius > 0,
      circumRadius,
      circumCenter,
      circumArea,
      circumVolume,
      hasInSphere: inRadius > 0,
      inRadius,
      inCenter,
      inArea,
      inVolume,
      radiusRatio: inRadius > 1e-6 ? circumRadius / inRadius : 1,
      embeddingCuboidSize: embeddingCuboid,
    };
  }

  private static fanArea(verts: THREE.Vector3[], indices: number[]): number {
    if (indices.length < 3) return 0;
    const v0 = verts[indices[0]];
    let area = 0;
    for (let i = 1; i < indices.length - 1; i++) {
      const e1 = verts[indices[i]].clone().sub(v0);
      const e2 = verts[indices[i + 1]].clone().sub(v0);
      area += e1.cross(e2).length() * 0.5;
    }
    return area;
  }

  private static findTetraBasis(verts: THREE.Vector3[]): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] | null {
    const origin = verts[0];
    for (let i = 1; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        for (let k = j + 1; k < verts.length; k++) {
          const ab = verts[i].clone().sub(origin);
          const ac = verts[j].clone().sub(origin);
          const ad = verts[k].clone().sub(origin);
          if (Math.abs(ab.dot(ac.clone().cross(ad))) > 1e-6) {
            return [origin, verts[i], verts[j], verts[k]];
          }
        }
      }
    }
    return null;
  }

  private static circumcenterOfTetra(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3
  ): THREE.Vector3 | null {
    const rows = [b.clone().sub(a), c.clone().sub(a), d.clone().sub(a)];
    const rhs = [
      b.lengthSq() - a.lengthSq(),
      c.lengthSq() - a.lengthSq(),
      d.lengthSq() - a.lengthSq(),
    ];
    const matrix = rows.map((row, index) => [2 * row.x, 2 * row.y, 2 * row.z, rhs[index]]);
    for (let col = 0; col < 3; col++) {
      let pivot = col;
      for (let row = col + 1; row < 3; row++) {
        if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
      }
      if (Math.abs(matrix[pivot][col]) < 1e-10) return null;
      const hold = matrix[col];
      matrix[col] = matrix[pivot];
      matrix[pivot] = hold;
      const div = matrix[col][col];
      for (let k = col; k < 4; k++) matrix[col][k] /= div;
      for (let row = 0; row < 3; row++) {
        if (row === col) continue;
        const factor = matrix[row][col];
        for (let k = col; k < 4; k++) matrix[row][k] -= factor * matrix[col][k];
      }
    }
    return new THREE.Vector3(matrix[0][3], matrix[1][3], matrix[2][3]);
  }
}
