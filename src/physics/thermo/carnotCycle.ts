/**
 * 卡诺热机 (Carnot Heat Engine) 理想气体可逆循环动力学与热力学求解器
 *
 * 物理过程（四个阶段）：
 * 1. 等温膨胀 (1 -> 2, Isothermal Expansion):
 *    与高温热源 T_h 接触，工质吸收热量 Q_h = n R T_h ln(V_2 / V_1)，等温膨胀对外做功。
 * 2. 绝热膨胀 (2 -> 3, Adiabatic Expansion):
 *    与外界无热交换 (Q = 0)，工质继续膨胀对外做功，温度从 T_h 降至 T_c，满足 T_h V_2^(γ-1) = T_c V_3^(γ-1)。
 * 3. 等温压缩 (3 -> 4, Isothermal Compression):
 *    与低温冷源 T_c 接触，工质向冷源放出热量 Q_c = n R T_c ln(V_3 / V_4)，等温压缩。
 * 4. 绝热压缩 (4 -> 1, Adiabatic Compression):
 *    与外界无热交换 (Q = 0)，工质继续被压缩，温度从 T_c 升回 T_h，满足 T_c V_4^(γ-1) = T_h V_1^(γ-1)。
 *
 * 卡诺热机效率定理：
 *   η = W / Q_h = (Q_h - Q_c) / Q_h = 1 - T_c / T_h
 */

export type CarnotStageId = 1 | 2 | 3 | 4;

export type CarnotStageKey =
  | 'isothermal_expansion'
  | 'adiabatic_expansion'
  | 'isothermal_compression'
  | 'adiabatic_compression';

export interface CarnotPointPVT {
  volumeL: number;
  pressureMPa: number;
  temperatureK: number;
  temperatureC: number;
}

export interface CarnotCycleVertices {
  state1: CarnotPointPVT;
  state2: CarnotPointPVT;
  state3: CarnotPointPVT;
  state4: CarnotPointPVT;
}

export interface CarnotPVCurveSamples {
  /** 1 -> 2 等温膨胀曲线采样点 */
  curve12: CarnotPointPVT[];
  /** 2 -> 3 绝热膨胀曲线采样点 */
  curve23: CarnotPointPVT[];
  /** 3 -> 4 等温压缩曲线采样点 */
  curve34: CarnotPointPVT[];
  /** 4 -> 1 绝热压缩曲线采样点 */
  curve41: CarnotPointPVT[];
}

export interface CarnotTelemetry {
  /** 高温热源摄氏温度 (°C) */
  hotTempC: number;
  /** 高温热源热力学温度 (K) */
  hotTempK: number;
  /** 低温冷源摄氏温度 (°C) */
  coldTempC: number;
  /** 低温冷源热力学温度 (K) */
  coldTempK: number;
  /** 当前工质瞬时温度 (K) */
  gasTempK: number;
  /** 当前工质瞬时摄氏温度 (°C) */
  gasTempC: number;
  /** 当前工质瞬时压强 (MPa, 对应 0 ~ 0.4 MPa 压力表) */
  pressureMPa: number;
  /** 当前工质瞬时体积 (L) */
  volumeL: number;
  /** 当前循环阶段序号 (1 | 2 | 3 | 4) */
  stageId: CarnotStageId;
  /** 当前循环阶段标识 */
  stageKey: CarnotStageKey;
  /** 当前阶段中文名称 */
  stageTitle: string;
  /** 当前阶段物理描述 */
  stageSubtitle: string;
  /** 当前阶段内归一化进度 [0, 1] */
  stageProgress: number;
  /** 曲柄转角 θ (rad, 0 ~ 2π) */
  crankAngleRad: number;
  /** 曲柄旋转角速度 ω (rad/s) */
  angularVelocityRad: number;
  /** 活塞归一化行程位置 s ∈ [0, 1] (0 为左止点 V1，1 为右止点 V3) */
  pistonStrokeNormalized: number;
  /** 活塞运动方向: 1 向右膨胀推动活塞, -1 向左冷却回位 */
  pistonDirection: 1 | -1;
  /** 单次循环从高温热源吸热量 Q_h (J) */
  heatAbsorbedJ: number;
  /** 单次循环向低温冷源放热量 Q_c (J) */
  heatRejectedJ: number;
  /** 单次循环净输出机械功 W = Q_h - Q_c (J) */
  netWorkJ: number;
  /** 卡诺理想热效率 η = 1 - T_c / T_h (0 ~ 1) */
  efficiency: number;
  /** 卡诺理想热效率百分比 (0 ~ 100) */
  efficiencyPercent: number;
  /** 高温管道热流脉冲强度 [0, 1] (仅阶段 1 激活) */
  hotPipeFlowIntensity: number;
  /** 低温管道热流脉冲强度 [0, 1] (仅阶段 3 激活) */
  coldPipeFlowIntensity: number;
  /** 累计完成循环次数 */
  completedCycles: number;
  /** 四个状态顶点坐标 (1, 2, 3, 4) */
  vertices: CarnotCycleVertices;
}

export interface CarnotSolverOptions {
  hotTempC?: number;
  coldTempC?: number;
  speedMultiplier?: number;
}

export const KELVIN_OFFSET = 273.15;
export const MIN_HOT_TEMP_C = 50.0;
export const MAX_HOT_TEMP_C = 150.0;
export const DEFAULT_HOT_TEMP_C = 80.0;

export const MIN_COLD_TEMP_C = 0.0;
export const MAX_COLD_TEMP_C = 40.0;
export const DEFAULT_COLD_TEMP_C = 20.0;

/** 单原子理想气体绝热指数 γ = 5/3 */
export const ADIABATIC_GAMMA = 5 / 3;
/** Minimum compressed volume V1 (L) */
export const VOLUME_V1_L = 1.00;
/** Isothermal expansion ratio V2 / V1 */
export const ISOTHERMAL_EXPANSION_RATIO = 1.65;
/**
 * 理想气体常数标定系数 n*R (MPa·L/K = kJ/K)
 * 在 Th = 80°C (353.15 K), V1 = 1.0 L 时，P1 ≈ 0.275 MPa，完美契合 0 ~ 0.4 MPa 压力表量程
 */
export const GAS_NR_MPA_L_PER_K = 0.00078;
/** 曲柄半径与连杆长度比 λ = r / L */
export const CRANK_ROD_RATIO = 0.28;

export class CarnotEngineSolver {
  public hotTempC: number;
  public coldTempC: number;
  public speedMultiplier: number;

  private crankAngle = 0; // [0, 2π)
  private completedCycles = 0;
  private cachedVertices!: CarnotCycleVertices;
  private cachedCurves!: CarnotPVCurveSamples;

  constructor(options: CarnotSolverOptions = {}) {
    this.hotTempC = this.clampHotTempC(options.hotTempC ?? DEFAULT_HOT_TEMP_C);
    this.coldTempC = this.clampColdTempC(options.coldTempC ?? DEFAULT_COLD_TEMP_C);
    this.speedMultiplier = Math.max(0.2, Math.min(3.0, options.speedMultiplier ?? 1.0));
    this.recomputeCycleGeometry();
  }

  public clampHotTempC(tempC: number): number {
    const clamped = Math.max(MIN_HOT_TEMP_C, Math.min(MAX_HOT_TEMP_C, Number.isFinite(tempC) ? tempC : DEFAULT_HOT_TEMP_C));
    return Math.round(clamped * 10) / 10;
  }

  public clampColdTempC(tempC: number): number {
    const clamped = Math.max(MIN_COLD_TEMP_C, Math.min(MAX_COLD_TEMP_C, Number.isFinite(tempC) ? tempC : DEFAULT_COLD_TEMP_C));
    return Math.round(clamped * 10) / 10;
  }

  public setHotTempC(tempC: number): void {
    const next = this.clampHotTempC(tempC);
    if (Math.abs(next - this.hotTempC) > 1e-4) {
      this.hotTempC = next;
      this.recomputeCycleGeometry();
    }
  }

  public setColdTempC(tempC: number): void {
    const next = this.clampColdTempC(tempC);
    if (Math.abs(next - this.coldTempC) > 1e-4) {
      this.coldTempC = next;
      this.recomputeCycleGeometry();
    }
  }

  public setSpeedMultiplier(mult: number): void {
    if (!Number.isFinite(mult)) return;
    this.speedMultiplier = Math.max(0.2, Math.min(3.0, mult));
  }

  public setCrankAngle(angleRad: number): void {
    if (!Number.isFinite(angleRad)) return;
    const twoPi = Math.PI * 2;
    this.crankAngle = ((angleRad % twoPi) + twoPi) % twoPi;
  }

  public reset(): void {
    this.hotTempC = DEFAULT_HOT_TEMP_C;
    this.coldTempC = DEFAULT_COLD_TEMP_C;
    this.speedMultiplier = 1.0;
    this.crankAngle = 0;
    this.completedCycles = 0;
    this.recomputeCycleGeometry();
  }

  /**
   * 由曲柄转角 θ ∈ [0, 2π) 计算精确的曲柄连杆活塞归一化行程 s(θ) ∈ [0, 1]
   * θ = 0   -> s = 0 (左止点 TDC, V = V1)
   * θ = π   -> s = 1 (右止点 BDC, V = V3)
   */
  public static strokeFromCrankAngle(thetaRad: number): number {
    const lam = CRANK_ROD_RATIO;
    const sinT = Math.sin(thetaRad);
    const cosT = Math.cos(thetaRad);
    const root = Math.sqrt(Math.max(0.01, 1 - lam * lam * sinT * sinT));
    const s = 0.5 * (1 - cosT) + (1 - root) / (2 * lam);
    return Math.max(0, Math.min(1, s));
  }

  /**
   * 重新计算卡诺循环四个状态顶点 (1, 2, 3, 4) 与 P-V 曲线采样
   */
  private recomputeCycleGeometry(): void {
    const Th = this.hotTempC + KELVIN_OFFSET;
    const Tc = this.coldTempC + KELVIN_OFFSET;
    const invGammaMinus1 = 1 / (ADIABATIC_GAMMA - 1); // 1.5
    const adiabaticRatio = Math.pow(Th / Tc, invGammaMinus1);

    const V1 = VOLUME_V1_L;
    const V2 = VOLUME_V1_L * ISOTHERMAL_EXPANSION_RATIO;
    const V3 = V2 * adiabaticRatio;
    const V4 = V1 * adiabaticRatio;

    const P1 = (GAS_NR_MPA_L_PER_K * Th) / V1;
    const P2 = (GAS_NR_MPA_L_PER_K * Th) / V2;
    const P3 = (GAS_NR_MPA_L_PER_K * Tc) / V3;
    const P4 = (GAS_NR_MPA_L_PER_K * Tc) / V4;

    this.cachedVertices = {
      state1: { volumeL: V1, pressureMPa: P1, temperatureK: Th, temperatureC: this.hotTempC },
      state2: { volumeL: V2, pressureMPa: P2, temperatureK: Th, temperatureC: this.hotTempC },
      state3: { volumeL: V3, pressureMPa: P3, temperatureK: Tc, temperatureC: this.coldTempC },
      state4: { volumeL: V4, pressureMPa: P4, temperatureK: Tc, temperatureC: this.coldTempC },
    };

    const steps = 28;
    const curve12: CarnotPointPVT[] = [];
    const curve23: CarnotPointPVT[] = [];
    const curve34: CarnotPointPVT[] = [];
    const curve41: CarnotPointPVT[] = [];

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      // 1 -> 2: 等温膨胀
      const v12 = V1 + (V2 - V1) * u;
      const p12 = (GAS_NR_MPA_L_PER_K * Th) / v12;
      curve12.push({
        volumeL: v12,
        pressureMPa: p12,
        temperatureK: Th,
        temperatureC: Th - KELVIN_OFFSET,
      });

      // 2 -> 3: 绝热膨胀
      const v23 = V2 + (V3 - V2) * u;
      const t23 = Th * Math.pow(V2 / v23, ADIABATIC_GAMMA - 1);
      const p23 = (GAS_NR_MPA_L_PER_K * t23) / v23;
      curve23.push({
        volumeL: v23,
        pressureMPa: p23,
        temperatureK: t23,
        temperatureC: t23 - KELVIN_OFFSET,
      });

      // 3 -> 4: 等温压缩
      const v34 = V3 + (V4 - V3) * u;
      const p34 = (GAS_NR_MPA_L_PER_K * Tc) / v34;
      curve34.push({
        volumeL: v34,
        pressureMPa: p34,
        temperatureK: Tc,
        temperatureC: Tc - KELVIN_OFFSET,
      });

      // 4 -> 1: 绝热压缩
      const v41 = V4 + (V1 - V4) * u;
      const t41 = Tc * Math.pow(V4 / v41, ADIABATIC_GAMMA - 1);
      const p41 = (GAS_NR_MPA_L_PER_K * t41) / v41;
      curve41.push({
        volumeL: v41,
        pressureMPa: p41,
        temperatureK: t41,
        temperatureC: t41 - KELVIN_OFFSET,
      });
    }

    this.cachedCurves = { curve12, curve23, curve34, curve41 };
  }

  public getPVCurves(): CarnotPVCurveSamples {
    return this.cachedCurves;
  }

  public getVertices(): CarnotCycleVertices {
    return this.cachedVertices;
  }

  /**
   * 计算当前温差下的飞轮旋转角速度 ω (rad/s)
   * 温差越大、卡诺热效率 η 越高、输出功 W 越大，飞轮运转越强劲有力
   */
  public getAngularVelocity(): number {
    const Th = this.hotTempC + KELVIN_OFFSET;
    const Tc = this.coldTempC + KELVIN_OFFSET;
    const eta = Math.max(0, 1 - Tc / Th);
    // 在默认 80°C / 20°C (η ≈ 0.17) 时，角速度约为 1.25 rad/s (约 5 秒完成一个完整四过程循环，便于清晰观察每个过程)
    const baseOmega = 0.45 + eta * 4.7;
    return baseOmega * this.speedMultiplier;
  }

  /**
   * 推进卡诺热机动力学步进
   */
  public step(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dt = Math.min(deltaSeconds, 0.1);
    const omega = this.getAngularVelocity();
    const prevAngle = this.crankAngle;
    const nextAngle = prevAngle + omega * dt;
    const twoPi = Math.PI * 2;
    if (nextAngle >= twoPi) {
      this.completedCycles += Math.floor(nextAngle / twoPi);
    }
    this.crankAngle = ((nextAngle % twoPi) + twoPi) % twoPi;
  }

  /**
   * 获取当前完整热力学遥测状态
   */
  public getTelemetry(): CarnotTelemetry {
    const Th = this.hotTempC + KELVIN_OFFSET;
    const Tc = this.coldTempC + KELVIN_OFFSET;
    const { state1, state2, state3, state4 } = this.cachedVertices;
    const V1 = state1.volumeL;
    const V2 = state2.volumeL;
    const V3 = state3.volumeL;
    const V4 = state4.volumeL;

    // 1 MPa·L = 1000 J
    const nR_JoulesPerK = GAS_NR_MPA_L_PER_K * 1000;
    const lnRatio = Math.log(V2 / V1);
    const heatAbsorbedJ = nR_JoulesPerK * Th * lnRatio;
    const heatRejectedJ = nR_JoulesPerK * Tc * lnRatio;
    const netWorkJ = Math.max(0, heatAbsorbedJ - heatRejectedJ);
    const efficiency = Math.max(0, 1 - Tc / Th);

    const s = CarnotEngineSolver.strokeFromCrankAngle(this.crankAngle);
    const volumeL = V1 + s * (V3 - V1);
    const isExpanding = this.crankAngle <= Math.PI;
    const pistonDirection: 1 | -1 = isExpanding ? 1 : -1;

    let stageId: CarnotStageId;
    let stageKey: CarnotStageKey;
    let stageTitle: string;
    let stageSubtitle: string;
    let stageProgress: number;
    let gasTempK: number;
    let hotPipeFlowIntensity = 0;
    let coldPipeFlowIntensity = 0;

    if (isExpanding) {
      if (volumeL <= V2) {
        // 过程 1: 等温膨胀 (1 -> 2)
        stageId = 1;
        stageKey = 'isothermal_expansion';
        stageTitle = '① 等温膨胀 (吸热)';
        stageSubtitle = '与高温热源 Th 接触，工质吸收热量 Qh，等温膨胀做功';
        stageProgress = Math.max(0, Math.min(1, (volumeL - V1) / Math.max(1e-5, V2 - V1)));
        gasTempK = Th;
        hotPipeFlowIntensity = 0.35 + 0.65 * Math.sin(stageProgress * Math.PI);
      } else {
        // 过程 2: 绝热膨胀 (2 -> 3)
        stageId = 2;
        stageKey = 'adiabatic_expansion';
        stageTitle = '② 绝热膨胀 (Q = 0)';
        stageSubtitle = '与外界无热交换，工质继续膨胀做功，温度从 Th 降至 Tc';
        stageProgress = Math.max(0, Math.min(1, (volumeL - V2) / Math.max(1e-5, V3 - V2)));
        gasTempK = Th * Math.pow(V2 / volumeL, ADIABATIC_GAMMA - 1);
      }
    } else {
      if (volumeL >= V4) {
        // 过程 3: 等温压缩 (3 -> 4)
        stageId = 3;
        stageKey = 'isothermal_compression';
        stageTitle = '③ 等温压缩 (放热)';
        stageSubtitle = '与低温冷源 Tc 接触，工质放出热量 Qc，等温压缩';
        stageProgress = Math.max(0, Math.min(1, (V3 - volumeL) / Math.max(1e-5, V3 - V4)));
        gasTempK = Tc;
        coldPipeFlowIntensity = 0.35 + 0.65 * Math.sin(stageProgress * Math.PI);
      } else {
        // 过程 4: 绝热压缩 (4 -> 1)
        stageId = 4;
        stageKey = 'adiabatic_compression';
        stageTitle = '④ 绝热压缩 (Q = 0)';
        stageSubtitle = '与外界无热交换，工质继续被压缩，温度从 Tc 升至 Th';
        stageProgress = Math.max(0, Math.min(1, (V4 - volumeL) / Math.max(1e-5, V4 - V1)));
        gasTempK = Tc * Math.pow(V4 / volumeL, ADIABATIC_GAMMA - 1);
      }
    }

    const pressureMPa = (GAS_NR_MPA_L_PER_K * gasTempK) / volumeL;

    return {
      hotTempC: this.hotTempC,
      hotTempK: Th,
      coldTempC: this.coldTempC,
      coldTempK: Tc,
      gasTempK,
      gasTempC: gasTempK - KELVIN_OFFSET,
      pressureMPa,
      volumeL,
      stageId,
      stageKey,
      stageTitle,
      stageSubtitle,
      stageProgress,
      crankAngleRad: this.crankAngle,
      angularVelocityRad: this.getAngularVelocity(),
      pistonStrokeNormalized: s,
      pistonDirection,
      heatAbsorbedJ,
      heatRejectedJ,
      netWorkJ,
      efficiency,
      efficiencyPercent: efficiency * 100,
      hotPipeFlowIntensity,
      coldPipeFlowIntensity,
      completedCycles: this.completedCycles,
      vertices: this.cachedVertices,
    };
  }
}
