import * as THREE from 'three';

export type HighSchoolModelType =
  | 'cube'            // 正方体 / 长方体
  | 'corner-pyramid'  // 墙角模型 / 直角三棱锥 (PA ⊥ PB ⊥ PC)
  | 'tetrahedron'     // 正四面体 (嵌入正方体模型)
  | 'square-pyramid'  // 正四棱锥 (埃及金字塔模型)
  | 'triangular-prism'// 直三棱柱
  | 'cylinder-cone';  // 圆柱与圆锥 (旋转体与截线)

export interface KeyPoint {
  id: string;
  label: string;
  type: 'vertex' | 'midpoint' | 'center' | 'apex' | 'custom';
  position: THREE.Vector3;
  connectedEdges?: string[];
}

export interface PolygonFace {
  id: string;
  label: string;
  vertexIndices: number[]; // Indices into model vertices
  normal: THREE.Vector3;
  hingeEdge?: [number, number]; // Edge around which to unfold
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
  edges: [number, number][]; // pairs of vertex indices
  keyPoints: KeyPoint[];
  defaultParams: Record<string, number>;
  boundingRadius: number;
}

export interface CrossSectionResult {
  plane: THREE.Plane;
  polygon: THREE.Vector3[]; // Ordered vertices of cross section
  polygonType: string;      // e.g. "等边三角形", "等腰梯形", "正六边形"
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
  embeddingCuboidSize?: THREE.Vector3; // For corner pyramid & tetrahedron
}

export class GeometrySolver {
  /**
   * Generate 6 high-school models with parametric dimensions.
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
      default:
        return this.createCubeModel(a, b, c);
    }
  }

  // -------------------------------------------------------------
  // 1. 正方体 / 长方体 (Cube / Cuboid)
  // -------------------------------------------------------------
  private static createCubeModel(a: number, b: number, c: number): PolyhedronModelDef {
    const x2 = a / 2;
    const y2 = c / 2;
    const z2 = b / 2;

    // Bottom vertices: ABCD (y = -y2), Top: A1B1C1D1 (y = +y2)
    // Standard high school orientation:
    // D is back-left-bottom (0,0,0) or centered
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

    // 12 edges
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Bottom: AB, BC, CD, DA
      [4, 5], [5, 6], [6, 7], [7, 4], // Top: A1B1, B1C1, C1D1, D1A1
      [0, 4], [1, 5], [2, 6], [3, 7], // Vertical: AA1, BB1, CC1, DD1
    ];

    // 6 faces
    const faces: PolygonFace[] = [
      { id: 'bottom', label: '底面 ABCD', vertexIndices: [0, 1, 2, 3], normal: new THREE.Vector3(0, -1, 0) },
      { id: 'top', label: '顶面 A₁B₁C₁D₁', vertexIndices: [4, 7, 6, 5], normal: new THREE.Vector3(0, 1, 0) },
      { id: 'front', label: '侧面 AA₁D₁D', vertexIndices: [0, 3, 7, 4], normal: new THREE.Vector3(0, 0, 1) },
      { id: 'back', label: '侧面 BB₁C₁C', vertexIndices: [1, 5, 6, 2], normal: new THREE.Vector3(0, 0, -1) },
      { id: 'right', label: '侧面 ABB₁A₁', vertexIndices: [0, 4, 5, 1], normal: new THREE.Vector3(1, 0, 0) },
      { id: 'left', label: '侧面 DCC₁D₁', vertexIndices: [3, 2, 6, 7], normal: new THREE.Vector3(-1, 0, 0) },
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

    // 12 Midpoints of edges (高中截面极高频点)
    edges.forEach(([i1, i2], idx) => {
      const mid = new THREE.Vector3().addVectors(vertices[i1], vertices[i2]).multiplyScalar(0.5);
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${vertexLabels[i1]}${vertexLabels[i2]})`,
        type: 'midpoint',
        position: mid,
      });
    });

    // Face Centers (面心)
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

    // Body Center (体心 / 对角线交点)
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
    // Vertex P is origin (0, 0, 0).
    // PA along X axis, PB along Z axis, PC along Y axis (三条侧棱两两垂直)
    // Offset center of gravity to origin for natural rotation
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
      { id: 'base', label: '底面 ABC', vertexIndices: [1, 2, 3], normal: new THREE.Vector3(b * c, a * b, a * c).normalize() },
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

    edges.forEach(([i1, i2]) => {
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${vertexLabels[i1]}${vertexLabels[i2]})`,
        type: 'midpoint',
        position: new THREE.Vector3().addVectors(vertices[i1], vertices[i2]).multiplyScalar(0.5),
      });
    });

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
  // 3. 正四面体 / 嵌入正方体模型 (Regular Tetrahedron)
  // -------------------------------------------------------------
  private static createRegularTetrahedronModel(L: number): PolyhedronModelDef {
    // A regular tetrahedron of edge length L can be embedded in a cube of side a = L / sqrt(2)
    // Vertices of cube alternating:
    // (1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)
    const a = L / Math.SQRT2;
    const r = a / 2;

    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(r, r, r),    // 0: A
      new THREE.Vector3(r, -r, -r),  // 1: B
      new THREE.Vector3(-r, r, -r),  // 2: C
      new THREE.Vector3(-r, -r, r),  // 3: D
    ];

    const vertexLabels = ['A', 'B', 'C', 'D'];

    // 6 edges: all pairs
    const edges: [number, number][] = [
      [0, 1], [0, 2], [0, 3],
      [1, 2], [2, 3], [3, 1],
    ];

    const faces: PolygonFace[] = [
      { id: 'bcd', label: '底面 BCD', vertexIndices: [1, 2, 3], normal: new THREE.Vector3(-1, -1, -1).normalize() },
      { id: 'abc', label: '侧面 ABC', vertexIndices: [0, 1, 2], normal: new THREE.Vector3(1, 1, -1).normalize() },
      { id: 'acd', label: '侧面 ACD', vertexIndices: [0, 2, 3], normal: new THREE.Vector3(-1, 1, 1).normalize() },
      { id: 'adb', label: '侧面 ADB', vertexIndices: [0, 3, 1], normal: new THREE.Vector3(1, -1, 1).normalize() },
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

    edges.forEach(([i1, i2]) => {
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${vertexLabels[i1]}${vertexLabels[i2]})`,
        type: 'midpoint',
        position: new THREE.Vector3().addVectors(vertices[i1], vertices[i2]).multiplyScalar(0.5),
      });
    });

    // Face Centers
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

    // Body Center O (0,0,0) - also circumcenter and incenter
    keyPoints.push({
      id: 'body_center',
      label: 'O (外心/内心)',
      type: 'center',
      position: new THREE.Vector3(0, 0, 0),
    });

    return {
      id: 'tetrahedron',
      name: '正四面体 (嵌正方体模型)',
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
    const yBase = -h / 3; // Center of mass offset
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
      [1, 2], [2, 3], [3, 4], [4, 1], // Base edges
      [0, 1], [0, 2], [0, 3], [0, 4], // Lateral edges
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

    edges.forEach(([i1, i2]) => {
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${vertexLabels[i1]}${vertexLabels[i2]})`,
        type: 'midpoint',
        position: new THREE.Vector3().addVectors(vertices[i1], vertices[i2]).multiplyScalar(0.5),
      });
    });

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
    // Equilateral triangle base side a, height of base = a * sqrt(3) / 2
    const hBase = (a * Math.sqrt(3)) / 2;
    const rCircum = a / Math.sqrt(3);
    const rIn = hBase / 3;
    const y2 = h / 2;

    // Bottom triangle: ABC (y = -y2)
    // Top triangle: A1B1C1 (y = y2)
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
      [0, 1], [1, 2], [2, 0], // Bottom: AB, BC, CA
      [3, 4], [4, 5], [5, 3], // Top: A1B1, B1C1, C1A1
      [0, 3], [1, 4], [2, 5], // Vertical edges: AA1, BB1, CC1
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

    edges.forEach(([i1, i2]) => {
      keyPoints.push({
        id: `mid_${i1}_${i2}`,
        label: `M(${vertexLabels[i1]}${vertexLabels[i2]})`,
        type: 'midpoint',
        position: new THREE.Vector3().addVectors(vertices[i1], vertices[i2]).multiplyScalar(0.5),
      });
    });

    // Bottom and top circumcenters
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

    // Circumcenter of prism
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
    // 12-gon approximation for geometric keypoint snapping
    const segments = 12;
    const y2 = h / 2;
    const vertices: THREE.Vector3[] = [
      new THREE.Vector3(0, y2, 0), // 0: S (圆锥顶点)
    ];
    const vertexLabels: string[] = ['S'];

    // Bottom circle vertices 1..12
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
      edges.push([i, next]); // Bottom circle edge
      edges.push([0, i]);    // Cone generatrix
    }

    const faces: PolygonFace[] = [
      {
        id: 'base',
        label: '底面圆',
        vertexIndices: Array.from({ length: segments }, (_, i) => i + 1),
        normal: new THREE.Vector3(0, -1, 0),
      },
    ];

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

    // 4 cardinal points on bottom circle (A, B, C, D)
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
   * Solve plane equation Ax + By + Cz + D = 0 from 3 points.
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
      // Degenerate points (collinear)
      return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    }
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p1);
  }

  /**
   * Angle between two spatial lines and skew distance.
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

    // Cosine of angle in [0, 90 deg]: |u . v| / (|u| |v|)
    const dot = Math.abs(uNorm.dot(vNorm));
    const clampedDot = Math.min(1.0, Math.max(0.0, dot));
    const angleRad = Math.acos(clampedDot);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Cross product to check parallel vs skew
    const cross = new THREE.Vector3().crossVectors(uNorm, vNorm);
    const crossLen = cross.length();

    if (crossLen < 1e-5) {
      // Lines are parallel
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

    // Skew lines or intersecting in 3D:
    // Distance = |(q1 - p1) . (u x v)| / |u x v|
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
   * Line-Plane angle: sin(phi) = |u . n| / (|u| |n|), phi in [0, 90 deg].
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
   * Dihedral angle: cos(theta) = |n1 . n2| / (|n1| |n2|), theta in [0, 180 deg].
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
   * Slice a polyhedron by a plane and extract the closed planar cross-section polygon.
   */
  public static computePolyhedronCrossSection(
    model: PolyhedronModelDef,
    plane: THREE.Plane
  ): CrossSectionResult | null {
    const intersectionSegments: [THREE.Vector3, THREE.Vector3][] = [];

    // For every polygonal face of the polyhedron, clip its edges against the plane
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

    // Connect segments into an ordered polygon loop
    const polygon = this.orderIntersectionSegments(intersectionSegments);
    if (polygon.length < 3) {
      return null;
    }

    // Area and Perimeter
    let area = 0;
    let perimeter = 0;
    const n = polygon.length;
    const edgeLengths: number[] = [];

    // Planar 3D polygon area using cross product accumulation
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

    // Classify polygon
    const polygonType = this.classifyPolygon(polygon, edgeLengths);

    // Base area approximation
    const baseArea = (model.defaultParams.a ?? 1) * (model.defaultParams.b ?? model.defaultParams.a ?? 1);
    const areaRatioToBase = baseArea > 1e-4 ? area / baseArea : 1.0;

    // Dihedral angle with horizontal base plane (0, 1, 0)
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

      // Check if edge crosses plane
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

    // Remove duplicate closing point if present
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
        // Cuboid: 2R = sqrt(a² + b² + c²)
        circumRadius = 0.5 * Math.hypot(a, b, c);
        circumCenter.set(0, 0, 0);
        inRadius = Math.min(a, b, c) / 2;
        inCenter.set(0, 0, 0);
        embeddingCuboid = new THREE.Vector3(a, c, b);
        break;
      }

      case 'corner-pyramid': {
        // Corner pyramid PA ⊥ PB ⊥ PC:
        // Embed into cuboid a x c x b
        // 2R = sqrt(a² + b² + c²)
        circumRadius = 0.5 * Math.hypot(a, b, c);
        // Center relative to offset (-a/4, -c/4, -b/4)
        circumCenter.set(a / 4, c / 4, b / 4);
        embeddingCuboid = new THREE.Vector3(a, c, b);

        // Inscribed sphere: r = 3V / S_total
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
        // Regular tetrahedron of edge L = a
        // Embedded into cube of edge L / sqrt(2)
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
        // Regular square pyramid: base side a, height h
        // R = (a² + 2h²) / (4h)
        circumRadius = (a * a + 2 * h * h) / (4 * h);
        const yBase = -h / 3;
        circumCenter.set(0, yBase + h - circumRadius, 0);

        // Inradius: r = 3V / S_total
        const slantHeight = Math.hypot(h, a / 2);
        const sBase = a * a;
        const sLateral = 2 * a * slantHeight;
        const v = (1 / 3) * sBase * h;
        inRadius = (3 * v) / (sBase + sLateral);
        inCenter.set(0, yBase + inRadius, 0);
        break;
      }

      case 'triangular-prism': {
        // Right regular triangular prism: base side a, height h
        // R² = r_base² + (h/2)², r_base = a / sqrt(3)
        const rBaseCircum = a / Math.sqrt(3);
        circumRadius = Math.hypot(rBaseCircum, h / 2);
        circumCenter.set(0, 0, 0);
        inRadius = Math.min((a * Math.sqrt(3)) / 6, h / 2);
        inCenter.set(0, 0, 0);
        break;
      }

      case 'cylinder-cone': {
        // Cone: apex to base center
        const l = Math.hypot(r, h);
        circumRadius = (l * l) / (2 * h);
        circumCenter.set(0, h / 2 - circumRadius, 0);
        inRadius = (r * h) / (r + l);
        inCenter.set(0, -h / 2 + inRadius, 0);
        break;
      }
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
}
