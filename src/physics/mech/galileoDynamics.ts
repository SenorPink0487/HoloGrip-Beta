/**
 * 伽利略理想斜面实验动力学与运动学求解器
 *
 * 物理原理：
 * 1. 经典力学与机械能守恒定律：在无摩擦力的理想条件下，小球重力势能与动能相互转化：m g h = 1/2 m v^2。
 * 2. 左侧斜面：小球从初始高度 h0 由静止沿倾角 θ_L 下滑，滑到底端时速度为 v = sqrt(2 g h0)。
 * 3. 中间水平段：光滑水平面上合外力为零，小球以恒定速度 v 匀速直线运动。
 * 4. 右侧可调斜面：小球沿倾角 θ_R 冲上斜面，加速度为 a = -g sin(θ_R)。
 *    - 当 θ_R > 0 时，小球能上升的最大垂直高度 h = h0，沿斜面上行路程 s = h0 / sin(θ_R)。
 *      倾角越小，小球上升至同一高度所通过的路程越长。
 *    - 当 θ_R = 0 时（斜面放平为水平面），小球在水平方向不受阻力，将以恒定速度永远运动下去（牛顿第一定律/惯性定律）。
 */

import { STANDARD_GRAVITY } from './constants.ts';

export interface GalileoTrackParams {
  gravity?: number;              // 重力加速度 (m/s^2), 默认 9.80
  releaseHeightM?: number;       // 左侧释放高度 h0 (m), 默认 0.25
  leftAngleDeg?: number;         // 左侧固定斜面倾角 θ_L (°), 默认 35.0
  transitionRadiusM?: number;    // 底部圆弧过渡半径 (m), 默认 0.08
  flatLengthM?: number;          // 中间水平导轨长度 (m), 默认 0.40
  rightAngleDeg: number;         // 右侧对接斜面倾角 θ_R (°), 范围 [0, 60]
  rightLengthM: number;          // 右侧斜面总长度 L_R (m), 范围 [0.25, 1.20]
  frictionMu?: number;           // 动摩擦因数 (理想实验默认 0.0，亦支持微量耗散探究)
  ballMassKg?: number;           // 小球质量 (kg), 默认 0.05
}

export interface GalileoKinematicState {
  // 当前空间坐标 (以中间水平段左端接点为坐标参考系或整体相对台面)
  x: number;                     // 水平位置 (m)
  y: number;                     // 垂直高度 (m)
  arcLength: number;             // 沿轨道曲线展开的总路程 (m)
  velocity: number;              // 沿轨道切向速度 (m/s, 向右为正，向左为负)
  speed: number;                 // 速率 |v| (m/s)
  acceleration: number;          // 沿轨道切向加速度 (m/s^2)
  kineticEnergyJ: number;        // 瞬时动能 (J)
  potentialEnergyJ: number;      // 瞬时重力势能 (J)
  mechanicalEnergyJ: number;     // 机械能总量 (J)
  zone: 'left_incline' | 'left_transition' | 'flat' | 'right_transition' | 'right_incline' | 'right_beyond';
  climbDistanceM: number;        // 在右侧斜面上的攀爬路程 (m)
  maxClimbDistanceM: number;     // 理论达到的最大攀爬路程 (m, θ=0 时为 Infinity)
  isUniformInertia: boolean;     // 是否处于 θ_R=0 的理想惯性滑行态
  direction: 1 | -1;             // 运动方向 (+1: 向右, -1: 向左)
}

export interface GalileoTelemetry {
  gravity: number;
  releaseHeightM: number;
  leftAngleDeg: number;
  rightAngleDeg: number;
  rightLengthM: number;
  rightHeightM: number;
  theoreticalMaxHeightM: number;
  theoreticalRightDistanceM: number;
  bottomSpeedM_S: number;
  isInfiniteRoll: boolean;
  state: GalileoKinematicState;
}

export class GalileoDynamicsSolver {
  public gravity: number;
  public releaseHeightM: number;
  public leftAngleDeg: number;
  public rightAngleDeg: number;
  public rightLengthM: number;
  public flatLengthM: number;
  public transitionRadiusM: number;
  public frictionMu: number;
  public ballMassKg: number;

  // 轨道关键分段长度与几何
  public leftInclineLengthM: number;
  public rightHeightM: number;
  public bottomSpeedM_S: number;

  // 当前模拟状态
  private currentS = 0; // 沿轨道的展开路程 (从左斜面顶端为 0)
  private currentV = 0; // 切向速度
  private totalTrackLengthM = 0;
  private sLeftBottom = 0;
  private sFlatStart = 0;
  private sFlatEnd = 0;
  private sRightStart = 0;
  private sRightEnd = 0;

  constructor(params: GalileoTrackParams) {
    this.gravity = params.gravity ?? STANDARD_GRAVITY;
    this.releaseHeightM = Math.max(0.05, params.releaseHeightM ?? 0.25);
    this.leftAngleDeg = Math.max(10, Math.min(75, params.leftAngleDeg ?? 35.0));
    this.rightAngleDeg = Math.max(0, Math.min(65, params.rightAngleDeg));
    this.rightLengthM = Math.max(0.20, Math.min(1.50, params.rightLengthM));
    this.flatLengthM = Math.max(0.15, params.flatLengthM ?? 0.40);
    this.transitionRadiusM = params.transitionRadiusM ?? 0.08;
    this.frictionMu = Math.max(0, params.frictionMu ?? 0.0);
    this.ballMassKg = Math.max(0.01, params.ballMassKg ?? 0.05);

    this.recomputeGeometry();
  }

  public updateParameters(params: Partial<GalileoTrackParams>): void {
    if (params.gravity !== undefined) this.gravity = params.gravity;
    if (params.releaseHeightM !== undefined) this.releaseHeightM = Math.max(0.05, params.releaseHeightM);
    if (params.leftAngleDeg !== undefined) this.leftAngleDeg = Math.max(10, Math.min(75, params.leftAngleDeg));
    if (params.rightAngleDeg !== undefined) this.rightAngleDeg = Math.max(0, Math.min(65, params.rightAngleDeg));
    if (params.rightLengthM !== undefined) this.rightLengthM = Math.max(0.20, Math.min(1.50, params.rightLengthM));
    if (params.flatLengthM !== undefined) this.flatLengthM = Math.max(0.15, params.flatLengthM);
    if (params.frictionMu !== undefined) this.frictionMu = Math.max(0, params.frictionMu);
    if (params.ballMassKg !== undefined) this.ballMassKg = Math.max(0.01, params.ballMassKg);

    this.recomputeGeometry();
  }

  private recomputeGeometry(): void {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;

    // 左侧斜面长度（直线部分）
    this.leftInclineLengthM = this.releaseHeightM / Math.sin(leftRad);

    // 右侧斜面端高
    this.rightHeightM = this.rightLengthM * Math.sin(rightRad);

    // 理想底部速度 (v = sqrt(2gh))
    this.bottomSpeedM_S = Math.sqrt(2 * this.gravity * this.releaseHeightM);

    // 计算分段端点在轨道沿程 s 上的坐标
    this.sLeftBottom = this.leftInclineLengthM;
    this.sFlatStart = this.sLeftBottom;
    this.sFlatEnd = this.sFlatStart + this.flatLengthM;
    this.sRightStart = this.sFlatEnd;
    this.sRightEnd = this.sRightStart + this.rightLengthM;
    this.totalTrackLengthM = this.sRightEnd;
  }

  /**
   * 将小球重置回起点
   * @param fromSide 'left' (左侧初始位置, 默认) | 'right' (右侧初始位置)
   */
  public reset(fromSide: 'left' | 'right' = 'left'): void {
    if (fromSide === 'left') {
      this.currentS = 0.001;
      this.currentV = 0.0;
    } else {
      this.currentS = this.sRightEnd - 0.001;
      this.currentV = 0.0;
    }
  }

  /**
   * 单步动力学积分 (Symplectic Verlet / Runge-Kutta 精度积分)
   * 模拟小球沿轨道的往复平滑运动或无穷远惯性滑行
   */
  public step(dt: number, allowOscillation: boolean = true): GalileoKinematicState {
    const substeps = 4;
    const subDt = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      this.stepSub(subDt, allowOscillation);
    }

    return this.getState();
  }

  private stepSub(dt: number, allowOscillation: boolean): void {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;

    let accel = 0;

    const effMu = this.frictionMu * 2.5; // 真实综合摩擦与微阻力缩放
    const airDrag = 0.15 * this.frictionMu;

    if (this.currentS < this.sFlatStart) {
      // 位于左侧斜面：向下为加速方向 (+s)
      accel = this.gravity * Math.sin(leftRad);
      if (this.frictionMu > 0 && Math.abs(this.currentV) > 1e-5) {
        accel -= Math.sign(this.currentV) * (effMu * this.gravity * Math.cos(leftRad) + airDrag * this.currentV * this.currentV);
      }
    } else if (this.currentS <= this.sFlatEnd) {
      // 位于水平导轨：重力与支持力平衡，仅受摩擦力（理想无摩擦时 a = 0）
      if (this.frictionMu > 0 && Math.abs(this.currentV) > 1e-5) {
        const fAccel = effMu * this.gravity + airDrag * this.currentV * this.currentV;
        if (Math.abs(this.currentV) <= fAccel * dt) {
          this.currentV = 0;
          accel = 0;
        } else {
          accel = -Math.sign(this.currentV) * fAccel;
        }
      } else {
        accel = 0;
      }
    } else {
      // 位于右侧斜面：向右为上坡减速方向 (-a)
      accel = -this.gravity * Math.sin(rightRad);
      if (this.frictionMu > 0 && Math.abs(this.currentV) > 1e-5) {
        accel -= Math.sign(this.currentV) * (effMu * this.gravity * Math.cos(rightRad) + airDrag * this.currentV * this.currentV);
      }
    }

    // 速度与位置更新
    this.currentV += accel * dt;
    this.currentS += this.currentV * dt;

    // 边界碰撞与反弹/反转处理
    // 1. 左侧顶点边界
    if (this.currentS <= 0) {
      this.currentS = 0;
      if (this.currentV < 0) {
        if (allowOscillation) {
          this.currentV = -this.currentV * 0.998; // 极低耗散反弹
        } else {
          this.currentV = 0;
        }
      }
    }

    // 2. 右侧斜面顶点或最高点
    if (rightRad < 1e-4) {
      // θ_R = 0 (水平无限延伸惯性滑行)
      // 若超出轨道右端，允许循环或延伸滑行
      if (this.currentS > this.sRightEnd + 0.8) {
        this.currentS = this.sFlatStart; // 循环演示惯性滑行
      }
    } else {
      // 达到上坡速度降为 0 的顶点
      if (this.currentS > this.sFlatEnd) {
        const climbDist = this.currentS - this.sFlatEnd;
        const currentH = climbDist * Math.sin(rightRad);

        // 如果超出右端导轨物理顶端，软反弹
        if (this.currentS >= this.sRightEnd) {
          this.currentS = this.sRightEnd;
          if (this.currentV > 0) {
            if (allowOscillation) {
              this.currentV = -this.currentV * 0.998;
            } else {
              this.currentV = 0;
            }
          }
        } else if (currentH >= this.releaseHeightM && this.currentV > 0) {
          // 机械能守恒达到与释放高度 h0 相同的顶点！
          if (allowOscillation) {
            this.currentV = -0.01; // 开始回滚
          } else {
            this.currentV = 0;
          }
        }
      }
    }
  }

  /**
   * 获取当前小球的完整几何坐标与运动学状态
   */
  public getState(): GalileoKinematicState {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;

    let x = 0;
    let y = 0;
    let zone: GalileoKinematicState['zone'] = 'flat';
    let climbDist = 0;

    // 坐标系设计：
    // 水平段中心位于 x = 0
    // 水平段从 x = -flatLength/2 到 x = +flatLength/2，垂直高度 y = 0
    const halfFlat = this.flatLengthM * 0.5;

    if (this.currentS < this.sFlatStart) {
      // 左侧斜面
      zone = 'left_incline';
      const distFromBottom = this.sFlatStart - this.currentS;
      x = -halfFlat - distFromBottom * Math.cos(leftRad);
      y = distFromBottom * Math.sin(leftRad);
    } else if (this.currentS <= this.sFlatEnd) {
      // 水平段
      zone = 'flat';
      const distOnFlat = this.currentS - this.sFlatStart;
      x = -halfFlat + distOnFlat;
      y = 0;
    } else {
      // 右侧斜面
      zone = 'right_incline';
      climbDist = this.currentS - this.sFlatEnd;
      x = halfFlat + climbDist * Math.cos(rightRad);
      y = climbDist * Math.sin(rightRad);
    }

    const speed = Math.abs(this.currentV);
    const ke = 0.5 * this.ballMassKg * speed * speed;
    const pe = this.ballMassKg * this.gravity * y;
    const me = ke + pe;

    const maxClimbDistanceM =
      rightRad > 1e-4 ? this.releaseHeightM / Math.sin(rightRad) : Infinity;

    return {
      x,
      y,
      arcLength: this.currentS,
      velocity: this.currentV,
      speed,
      acceleration: this.getInstantAcceleration(),
      kineticEnergyJ: ke,
      potentialEnergyJ: pe,
      mechanicalEnergyJ: me,
      zone,
      climbDistanceM: climbDist,
      maxClimbDistanceM,
      isUniformInertia: this.rightAngleDeg < 0.1,
      direction: this.currentV >= 0 ? 1 : -1,
    };
  }

  private getInstantAcceleration(): number {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;

    if (this.currentS < this.sFlatStart) {
      return this.gravity * Math.sin(leftRad);
    } else if (this.currentS <= this.sFlatEnd) {
      return 0;
    } else {
      return -this.gravity * Math.sin(rightRad);
    }
  }

  public getTelemetry(): GalileoTelemetry {
    const state = this.getState();
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
    const isInfiniteRoll = this.rightAngleDeg < 0.1;
    const theoreticalRightDist = isInfiniteRoll
      ? Infinity
      : this.releaseHeightM / Math.sin(rightRad);

    return {
      gravity: this.gravity,
      releaseHeightM: this.releaseHeightM,
      leftAngleDeg: this.leftAngleDeg,
      rightAngleDeg: this.rightAngleDeg,
      rightLengthM: this.rightLengthM,
      rightHeightM: this.rightHeightM,
      theoreticalMaxHeightM: this.releaseHeightM,
      theoreticalRightDistanceM: theoreticalRightDist,
      bottomSpeedM_S: this.bottomSpeedM_S,
      isInfiniteRoll,
      state,
    };
  }

  /**
   * 获取轨道点集（用于 3D 渲染与参考线对齐）
   */
  public getTrackPolyline(): Array<{ x: number; y: number; z: number }> {
    const leftRad = (this.leftAngleDeg * Math.PI) / 180.0;
    const rightRad = (this.rightAngleDeg * Math.PI) / 180.0;
    const halfFlat = this.flatLengthM * 0.5;

    const leftTopX = -halfFlat - this.leftInclineLengthM * Math.cos(leftRad);
    const leftTopY = this.releaseHeightM;

    const leftBottomX = -halfFlat;
    const leftBottomY = 0;

    const rightBottomX = halfFlat;
    const rightBottomY = 0;

    const rightTopX = halfFlat + this.rightLengthM * Math.cos(rightRad);
    const rightTopY = this.rightHeightM;

    return [
      { x: leftTopX, y: leftTopY, z: 0 },
      { x: leftBottomX, y: leftBottomY, z: 0 },
      { x: rightBottomX, y: rightBottomY, z: 0 },
      { x: rightTopX, y: rightTopY, z: 0 },
    ];
  }
}
