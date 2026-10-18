/**
 * 悬挂法测物体重心 (Determination of Center of Gravity by Suspension)
 * 物理动力学与几何求解器
 */

export interface PlateHoleDef {
  id: string;
  label: string;
  x: number; // 米，板局部坐标系
  y: number; // 米，板局部坐标系
  radius: number; // 孔半径 (米)
}

export interface PlateShapeDef {
  id: string;
  name: string;
  description: string;
  vertices: Array<[number, number]>; // 顺时针或逆时针顶点序列 (米)
  holes: PlateHoleDef[];
}

export interface Line2D {
  origin: { x: number; y: number }; // 直线过点 (米)
  direction: { x: number; y: number }; // 单位方向向量
  holeId: string;
  holeLabel: string;
  timestamp: number;
}

export interface SuspensionTelemetry {
  plateShapeId: string;
  currentHoleId: string | null;
  currentHoleLabel: string | null;
  state: 'idle' | 'swinging' | 'stabilized' | 'detached';
  angleRad: number;
  angleDeg: number;
  angularVelocityRadS: number;
  isStable: boolean;
  stabilityProgress: number; // 0.0 ~ 1.0
  markedLinesCount: number;
  measuredCenterOfGravity: { x: number; y: number } | null;
  theoreticalCenterOfGravity: { x: number; y: number };
  errorMm: number | null;
  massKg: number;
  distanceToCgM: number;
}

/**
 * 预设典型待测薄板形状
 */
export const PRESET_PLATE_SHAPES: Record<string, PlateShapeDef> = {
  irregular: {
    id: 'irregular',
    name: '不规则多边形亚克力板',
    description: '经典的非对称异形薄板，重心不在任何几何中心，最能体现悬挂法测重心的通用性与准确性',
    vertices: [
      [-0.10, -0.08],
      [0.12, -0.06],
      [0.09, 0.07],
      [-0.01, 0.10],
      [-0.11, 0.04],
    ],
    holes: [
      { id: 'hole-a', label: 'A', x: -0.08, y: 0.03, radius: 0.005 },
      { id: 'hole-b', label: 'B', x: 0.06, y: 0.06, radius: 0.005 },
      { id: 'hole-c', label: 'C', x: -0.07, y: -0.05, radius: 0.005 },
      { id: 'hole-d', label: 'D', x: 0.08, y: -0.04, radius: 0.005 },
    ],
  },
  lshape: {
    id: 'lshape',
    name: 'L型凹角薄板 (重心在物体外)',
    description: '经典反直觉物理演示件：由于凹折结构，该薄板的真实重心位于实体外部空间',
    vertices: [
      [-0.09, -0.09],
      [0.09, -0.09],
      [0.09, -0.02],
      [-0.02, -0.02],
      [-0.02, 0.09],
      [-0.09, 0.09],
    ],
    holes: [
      { id: 'hole-a', label: 'A', x: -0.06, y: 0.07, radius: 0.005 },
      { id: 'hole-b', label: 'B', x: 0.06, y: -0.06, radius: 0.005 },
      { id: 'hole-c', label: 'C', x: -0.06, y: -0.06, radius: 0.005 },
    ],
  },
  triangle: {
    id: 'triangle',
    name: '非等边三角形薄板',
    description: '任意三角形薄板，理论重心精确位于三条几何中线的交点',
    vertices: [
      [-0.10, -0.08],
      [0.11, -0.05],
      [-0.01, 0.10],
    ],
    holes: [
      { id: 'hole-a', label: 'A', x: -0.01, y: 0.08, radius: 0.005 },
      { id: 'hole-b', label: 'B', x: 0.08, y: -0.04, radius: 0.005 },
      { id: 'hole-c', label: 'C', x: -0.07, y: -0.06, radius: 0.005 },
    ],
  },
};

/**
 * 几何多边形计算实用工具
 */
export class PolygonGeometryHelper {
  /**
   * 采用格林公式精确计算多边形面积与理论几何重心 (Centroid)
   */
  public static computeCentroidAndArea(vertices: Array<[number, number]>): {
    area: number;
    centroid: { x: number; y: number };
  } {
    const n = vertices.length;
    if (n < 3) {
      return { area: 0, centroid: { x: 0, y: 0 } };
    }

    let signedArea = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < n; i++) {
      const x0 = vertices[i][0];
      const y0 = vertices[i][1];
      const x1 = vertices[(i + 1) % n][0];
      const y1 = vertices[(i + 1) % n][1];

      const cross = x0 * y1 - x1 * y0;
      signedArea += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }

    signedArea *= 0.5;
    if (Math.abs(signedArea) < 1e-9) {
      return { area: 0, centroid: { x: 0, y: 0 } };
    }

    const factor = 1.0 / (6.0 * signedArea);
    return {
      area: Math.abs(signedArea),
      centroid: {
        x: cx * factor,
        y: cy * factor,
      },
    };
  }

  /**
   * 计算均匀多边形绕其质心的转动惯量 I_G (kg·m²)
   * 利用原点三角剖分求 I_O，再通过平行轴定理得到 I_G = I_O - M * |C|²
   */
  public static computeMomentOfInertia(
    vertices: Array<[number, number]>,
    totalMassKg: number,
    centroid: { x: number; y: number }
  ): number {
    const n = vertices.length;
    let totalSignedArea = 0;
    let totalIO = 0;

    for (let i = 0; i < n; i++) {
      const x0 = vertices[i][0];
      const y0 = vertices[i][1];
      const x1 = vertices[(i + 1) % n][0];
      const y1 = vertices[(i + 1) % n][1];

      const triSignedArea = 0.5 * (x0 * y1 - x1 * y0);
      totalSignedArea += triSignedArea;

      // 三角形绕原点 (0,0) 的面积二阶矩
      const iO_sub =
        (triSignedArea / 6.0) *
        (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1);
      totalIO += iO_sub;
    }

    if (Math.abs(totalSignedArea) < 1e-9) return 0.001;

    // 面积密度
    const sigma = totalMassKg / Math.abs(totalSignedArea);
    const IO = Math.abs(totalIO) * sigma;

    // 平行轴定理: I_G = I_O - M * (cx² + cy²)
    const distSq = centroid.x * centroid.x + centroid.y * centroid.y;
    const IG = Math.max(1e-5, IO - totalMassKg * distSq);
    return IG;
  }

  /**
   * 计算两条直线的交点
   */
  public static intersectTwoLines(
    line1: Line2D,
    line2: Line2D
  ): { x: number; y: number } | null {
    const p1 = line1.origin;
    const d1 = line1.direction;
    const p2 = line2.origin;
    const d2 = line2.direction;

    // 2D 叉乘计算行列式: d1.x * d2.y - d1.y * d2.x
    const det = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(det) < 1e-5) {
      // 平行或重合，无单一定交点
      return null;
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const t1 = (dx * d2.y - dy * d2.x) / det;
    return {
      x: p1.x + t1 * d1.x,
      y: p1.y + t1 * d1.y,
    };
  }
}

/**
 * 悬挂法测重心动力学解算器
 */
export class SuspensionDynamicsSolver {
  public plateDef: PlateShapeDef;
  public totalMassKg = 0.18; // 塑料板质量约 180g
  public gravity = 9.80; // 重力加速度 (m/s²)
  public damping = 0.055; // 阻尼系数

  // 几何计算缓存
  public centroid: { x: number; y: number };
  public area: number;
  public inertiaCg: number;

  // 悬挂状态
  public state: 'idle' | 'swinging' | 'stabilized' | 'detached' = 'idle';
  public currentHole: PlateHoleDef | null = null;
  public angleRad = 0; // 当前偏离平衡位置的摆角 (弧度)
  public angularVelocity = 0; // 角速度 (rad/s)
  public stableTimeAccum = 0; // 稳定持续计时 (秒)
  public readonly requiredStableDuration = 0.35; // 稳定判据需保持 0.35s

  // 记录的红线列表
  public markedLines: Line2D[] = [];

  constructor(shapeId: string = 'irregular') {
    this.plateDef = PRESET_PLATE_SHAPES[shapeId] || PRESET_PLATE_SHAPES.irregular;
    const { area, centroid } = PolygonGeometryHelper.computeCentroidAndArea(
      this.plateDef.vertices
    );
    this.area = area;
    this.centroid = centroid;
    this.inertiaCg = PolygonGeometryHelper.computeMomentOfInertia(
      this.plateDef.vertices,
      this.totalMassKg,
      this.centroid
    );
  }

  /**
   * 切换板形
   */
  public setPlateShape(shapeId: string): void {
    if (!PRESET_PLATE_SHAPES[shapeId]) return;
    this.plateDef = PRESET_PLATE_SHAPES[shapeId];
    const { area, centroid } = PolygonGeometryHelper.computeCentroidAndArea(
      this.plateDef.vertices
    );
    this.area = area;
    this.centroid = centroid;
    this.inertiaCg = PolygonGeometryHelper.computeMomentOfInertia(
      this.plateDef.vertices,
      this.totalMassKg,
      this.centroid
    );
    this.resetAll();
  }

  /**
   * 重置全部实验记录
   */
  public resetAll(): void {
    this.state = 'idle';
    this.currentHole = null;
    this.angleRad = 0;
    this.angularVelocity = 0;
    this.stableTimeAccum = 0;
    this.markedLines = [];
  }

  /**
   * 清除绘制的红线
   */
  public clearLines(): void {
    this.markedLines = [];
  }

  /**
   * 将板套挂在指定孔上
   * @param holeId 悬挂孔 ID
   * @param initialDisplacementDeg 初始扰动偏角 (度)
   */
  public hangOnHole(holeId: string, initialDisplacementDeg = 24): boolean {
    const hole = this.plateDef.holes.find((h) => h.id === holeId);
    if (!hole) return false;

    this.currentHole = hole;
    this.state = 'swinging';
    // 初始扰动角 (转为弧度)
    this.angleRad = (initialDisplacementDeg * Math.PI) / 180.0;
    this.angularVelocity = 0;
    this.stableTimeAccum = 0;
    return true;
  }

  /**
   * 向下拖拽取下塑料板
   */
  public detachPlate(): void {
    this.currentHole = null;
    this.state = 'detached';
    this.angleRad = 0;
    this.angularVelocity = 0;
    this.stableTimeAccum = 0;
  }

  /**
   * 立即稳定 (跳过物理等待)
   */
  public stabilizeImmediately(): void {
    if (this.state === 'swinging' && this.currentHole) {
      this.angleRad = 0;
      this.angularVelocity = 0;
      this.stableTimeAccum = this.requiredStableDuration;
      this.triggerStabilization();
    }
  }

  /**
   * 动力学时间步积分 (半隐式 Euler)
   */
  public step(dt: number): void {
    if (this.state !== 'swinging' || !this.currentHole) {
      return;
    }

    // 限制单步最大 dt 防止数值溢出
    const safeDt = Math.min(dt, 0.05);

    // 悬挂点到质心的距离 d (米)
    const dx = this.centroid.x - this.currentHole.x;
    const dy = this.centroid.y - this.currentHole.y;
    const d = Math.max(1e-4, Math.hypot(dx, dy));

    // 绕悬挂点轴心的总转动惯量 I_pivot = I_G + M * d²
    const iPivot = this.inertiaCg + this.totalMassKg * d * d;

    // 刚体复摆恢复力矩: tau = -M * g * d * sin(theta)
    const restoringTorque = -this.totalMassKg * this.gravity * d * Math.sin(this.angleRad);
    // 阻尼力矩: tau_damp = -damping * omega
    const dampingTorque = -this.damping * this.angularVelocity;

    const angularAcc = (restoringTorque + dampingTorque) / iPivot;

    // 积分更新
    this.angularVelocity += angularAcc * safeDt;
    this.angleRad += this.angularVelocity * safeDt;

    // 稳定判据: 摆角与角速度皆极小
    const isStationary =
      Math.abs(this.angleRad) < 0.0035 && Math.abs(this.angularVelocity) < 0.008;

    if (isStationary) {
      this.stableTimeAccum += safeDt;
      if (this.stableTimeAccum >= this.requiredStableDuration) {
        this.triggerStabilization();
      }
    } else {
      this.stableTimeAccum = Math.max(0, this.stableTimeAccum - safeDt * 0.5);
    }
  }

  /**
   * 触发稳定状态并生成铅垂线记录
   */
  public triggerStabilization(): void {
    this.state = 'stabilized';
    this.angleRad = 0;
    this.angularVelocity = 0;

    if (!this.currentHole) return;

    // 检查该孔是否已经记录过红线
    const alreadyMarked = this.markedLines.some((l) => l.holeId === this.currentHole!.id);
    if (!alreadyMarked) {
      // 在薄板局部坐标系下，平衡时从孔指向铅垂向下的矢量正是从孔指向质心的方向向量
      const dx = this.centroid.x - this.currentHole.x;
      const dy = this.centroid.y - this.currentHole.y;
      const len = Math.hypot(dx, dy);

      const dir =
        len > 1e-6
          ? { x: dx / len, y: dy / len }
          : { x: 0, y: -1 };

      const newLine: Line2D = {
        origin: { x: this.currentHole.x, y: this.currentHole.y },
        direction: dir,
        holeId: this.currentHole.id,
        holeLabel: this.currentHole.label,
        timestamp: Date.now(),
      };
      this.markedLines.push(newLine);
    }
  }

  /**
   * 计算当前测得的重心交点 (由前两条红线解算)
   */
  public getMeasuredCenterOfGravity(): { x: number; y: number } | null {
    if (this.markedLines.length < 2) {
      return null;
    }
    return PolygonGeometryHelper.intersectTwoLines(
      this.markedLines[0],
      this.markedLines[1]
    );
  }

  /**
   * 计算测得重心与理论重心的绝对偏差 (毫米)
   */
  public getErrorMm(): number | null {
    const measured = this.getMeasuredCenterOfGravity();
    if (!measured) return null;
    const distM = Math.hypot(
      measured.x - this.centroid.x,
      measured.y - this.centroid.y
    );
    return distM * 1000.0;
  }

  /**
   * 导出遥测数据
   */
  public getTelemetry(): SuspensionTelemetry {
    const measured = this.getMeasuredCenterOfGravity();
    const errorMm = this.getErrorMm();
    const d = this.currentHole
      ? Math.hypot(
          this.centroid.x - this.currentHole.x,
          this.centroid.y - this.currentHole.y
        )
      : 0;

    return {
      plateShapeId: this.plateDef.id,
      currentHoleId: this.currentHole ? this.currentHole.id : null,
      currentHoleLabel: this.currentHole ? this.currentHole.label : null,
      state: this.state,
      angleRad: this.angleRad,
      angleDeg: (this.angleRad * 180.0) / Math.PI,
      angularVelocityRadS: this.angularVelocity,
      isStable: this.state === 'stabilized',
      stabilityProgress: Math.min(1.0, this.stableTimeAccum / this.requiredStableDuration),
      markedLinesCount: this.markedLines.length,
      measuredCenterOfGravity: measured,
      theoreticalCenterOfGravity: { ...this.centroid },
      errorMm,
      massKg: this.totalMassKg,
      distanceToCgM: d,
    };
  }
}
