/**
 * 晶体与非晶体物态相变与潜热 (Crystalline vs. Amorphous Phase Transition & Latent Heat)
 * 水浴加热热力学相变、固液共存潜热吸收与双通道 T-t 曲线物理求解器
 *
 * 核心物理原理：
 * 1. 晶体（Channel 1，冰晶/海波模型）：
 *    具有规则的空间点阵结构（长程有序），因而具有固定的熔点 T_m：
 *    - 阶段 I（固态升温段，0 ~ 6 min）：吸收的热量转化为晶格格点分子振动动能，温度由 0 °C 升至熔点 T_m = 56 °C，Q = c_s * m * ΔT；
 *    - 阶段 II（固液共存恒温潜热段，6 ~ 18 min）：达到熔点 T_m 后继续吸热，但温度保持恒定不变（ΔT = 0），
 *      所吸收的熔化潜热 Q_L = m * L_f 完全用于瓦解空间晶格点阵束缚（增加分子势能），熔化分数 α_1 从 0 线性增至 1；
 *    - 阶段 III（液态升温段，18 ~ 25 min）：晶体完全熔化为透明液体（α_1 = 1），继续吸热使液态分子热运动加剧，温度由 56 °C 继续升至 85 °C。
 *
 * 2. 非晶体（Channel 2，石蜡）：
 *    分子排列短程有序、长程无序，无固定熔点与恒温潜热平台：
 *    - 在 0 ~ 25 min 全程水浴受热过程中，温度随时间呈平滑单调递增弧线（0 °C -> ~60.5 °C），
 *      状态由硬质固态连续变软、变为粘稠半流体，最终平稳过渡为透明液态。
 */

export type CrystallinePhaseState = 'solid' | 'coexistence' | 'liquid';
export type AmorphousPhaseState = 'solid' | 'softening' | 'liquid';

export interface PhaseCurvePoint {
  /** 实验时间 t (min, 0 ~ 25) */
  timeMin: number;
  /** 摄氏温度 T (°C, 0 ~ 100) */
  tempC: number;
}

export interface PhaseChangeSolverOptions {
  /** 左侧晶体酒精灯初始是否点燃（默认 true） */
  leftLampLit?: boolean;
  /** 右侧非晶体酒精灯初始是否点燃（默认 true） */
  rightLampLit?: boolean;
  /** 采集器通道 1（晶体）曲线初始是否显示（默认 true） */
  showChannel1?: boolean;
  /** 采集器通道 2（非晶体）曲线初始是否显示（默认 true） */
  showChannel2?: boolean;
  /** 真实时间每秒推进的实验分钟数（默认 0.92 min/s，约 27 秒跑完 0~25 min 全周期） */
  simMinutesPerSecond?: number;
}

export interface PhaseChangeTelemetry {
  /** 左侧酒精灯（晶体水浴）点燃状态 */
  leftLampLit: boolean;
  /** 右侧酒精灯（非晶体水浴）点燃状态 */
  rightLampLit: boolean;
  /** 采集器通道 1（晶体红线）显示状态 */
  showChannel1: boolean;
  /** 采集器通道 2（非晶体蓝线）显示状态 */
  showChannel2: boolean;

  /** 通道 1（晶体）当前有效热力演化时间 (0 ~ 25 min) */
  channel1TimeMin: number;
  /** 通道 1（晶体）当前温度 (°C) */
  channel1TempC: number;
  /** 通道 1（晶体）水浴烧杯水温 (°C) */
  channel1BathTempC: number;
  /** 通道 1（晶体）熔化分数 α_1 (0 = 纯固态晶粒, 0~1 = 固液共存潜热吸收, 1 = 纯液态) */
  channel1MeltFraction: number;
  /** 通道 1（晶体）当前物态阶段 */
  channel1Phase: CrystallinePhaseState;
  /** 通道 1（晶体）累计吸收比焓 / 比热容能量 (kJ/kg) */
  channel1AbsorbedHeatKJPerKg: number;
  /** 通道 1（晶体）吸收的熔化潜热占比 (0 ~ 1) */
  channel1LatentHeatProgress: number;

  /** 通道 2（非晶体·石蜡）当前有效热力演化时间 (0 ~ 25 min) */
  channel2TimeMin: number;
  /** 通道 2（非晶体·石蜡）当前温度 (°C) */
  channel2TempC: number;
  /** 通道 2（非晶体·石蜡）水浴烧杯水温 (°C) */
  channel2BathTempC: number;
  /** 通道 2（非晶体·石蜡）连续软化/流化度 α_2 (0 = 硬质石蜡, 0~1 = 粘稠软化, 1 = 透明液态蜡) */
  channel2SoftenFraction: number;
  /** 通道 2（非晶体·石蜡）当前物态描述 */
  channel2Phase: AmorphousPhaseState;

  /** 通道 1 历史采样轨迹点 (用于采集器绘制红色曲线) */
  channel1Curve: readonly PhaseCurvePoint[];
  /** 通道 2 历史采样轨迹点 (用于采集器绘制蓝色曲线) */
  channel2Curve: readonly PhaseCurvePoint[];
}

/** 实验时间坐标轴上限 (min) */
export const MAX_EXPERIMENT_TIME_MIN = 25.0;
/** 晶体固态升温至熔点平台的拐点时间 (min) */
export const CRYSTAL_MELT_START_MIN = 6.0;
/** 晶体固液共存恒温潜热段结束时间 (min) */
export const CRYSTAL_MELT_END_MIN = 18.0;
/** 晶体固定熔点平台温度 T_m (°C) */
export const CRYSTAL_MELTING_POINT_C = 56.0;
/** 晶体完全熔化后在 25 min 时达到的液态最高温度 (°C) */
export const CRYSTAL_FINAL_TEMP_C = 85.0;
/** 晶体单位质量熔化潜热 L_f (kJ/kg) */
export const CRYSTAL_LATENT_HEAT_KJ_KG = 210.0;
/** 晶体固态比热容 c_s (kJ/(kg·°C)) */
export const CRYSTAL_SOLID_CP_KJ_KG_C = 1.65;
/** 晶体液态比热容 c_l (kJ/(kg·°C)) */
export const CRYSTAL_LIQUID_CP_KJ_KG_C = 2.40;

/**
 * 根据晶体受热时间 t (0 ~ 25 min) 计算晶体温度 T_1(t)
 * 严格呈现：
 * - 0 ~ 6 min: 固态升温 (0 °C -> 56 °C，带真实热传导平滑入平台过渡)
 * - 6 ~ 18 min: 固液共存恒温潜热平台 (恒定 56.0 °C，ΔT = 0)
 * - 18 ~ 25 min: 完全熔化后液态继续升温 (56 °C -> 85 °C)
 */
export function evaluateCrystallineTempC(timeMin: number): number {
  const t = Math.max(0, Math.min(MAX_EXPERIMENT_TIME_MIN, timeMin));
  if (t <= 0) return 0;

  if (t < CRYSTAL_MELT_START_MIN) {
    // 0 -> 6 min: 从 0 °C 升温至 56 °C，在接近 6 min 处斜率平滑过渡到 0
    const u = t / CRYSTAL_MELT_START_MIN; // 0 -> 1
    // 使用带微凹导数收敛的多项式曲线：f(0)=0, f(1)=1, f'(0)>0, f'(1)=0
    const profile = 1 - Math.pow(1 - u, 1.85);
    return CRYSTAL_MELTING_POINT_C * profile;
  }

  if (t <= CRYSTAL_MELT_END_MIN) {
    // 6 -> 18 min: 严格恒温熔化潜热平台 (固液共存态 T = T_m)
    return CRYSTAL_MELTING_POINT_C;
  }

  // 18 -> 25 min: 液态继续升温 (56 °C -> 85 °C)
  const v = (t - CRYSTAL_MELT_END_MIN) / (MAX_EXPERIMENT_TIME_MIN - CRYSTAL_MELT_END_MIN); // 0 -> 1
  // 刚脱离潜热平台时斜率平滑抬升，随后稳步上升至 85 °C
  const liquidRise = Math.pow(v, 1.18) * (CRYSTAL_FINAL_TEMP_C - CRYSTAL_MELTING_POINT_C);
  return CRYSTAL_MELTING_POINT_C + liquidRise;
}

/**
 * 根据非晶体（石蜡）受热时间 t (0 ~ 25 min) 计算非晶体温度 T_2(t)
 * 无固定熔点平台，全程呈现平滑单调上升弧线 (0 °C -> ~60.5 °C)
 */
export function evaluateAmorphousTempC(timeMin: number): number {
  const t = Math.max(0, Math.min(MAX_EXPERIMENT_TIME_MIN, timeMin));
  if (t <= 0) return 0;
  return 73.5 * (1 - Math.exp(-t / 14.5));
}

export class PhaseChangeSolver {
  public leftLampLit: boolean;
  public rightLampLit: boolean;
  public showChannel1: boolean;
  public showChannel2: boolean;
  public simMinutesPerSecond: number;

  /** 熄灭酒精灯后的快速冷却复位速率 (min/s) */
  private readonly coolingMinutesPerSecond = 6.8;

  private channel1TimeMin = 0;
  private channel2TimeMin = 0;

  private channel1Curve: PhaseCurvePoint[] = [{ timeMin: 0, tempC: 0 }];
  private channel2Curve: PhaseCurvePoint[] = [{ timeMin: 0, tempC: 0 }];

  /** 标记某通道是否正在熄火冷却归零途中 */
  private channel1CoolingResetPending = false;
  private channel2CoolingResetPending = false;

  constructor(options: PhaseChangeSolverOptions = {}) {
    this.leftLampLit = options.leftLampLit ?? true;
    this.rightLampLit = options.rightLampLit ?? true;
    this.showChannel1 = options.showChannel1 ?? true;
    this.showChannel2 = options.showChannel2 ?? true;
    this.simMinutesPerSecond = options.simMinutesPerSecond ?? 0.92;
  }

  /**
   * 独立切换左侧（通道1 晶体）酒精灯点火/熄灭状态
   */
  public toggleLeftLamp(): boolean {
    this.setLeftLampLit(!this.leftLampLit);
    return this.leftLampLit;
  }

  public setLeftLampLit(lit: boolean): void {
    if (this.leftLampLit === lit) return;
    this.leftLampLit = lit;
    if (!lit && this.channel1TimeMin > 0) {
      this.channel1CoolingResetPending = true;
    } else if (lit && this.channel1TimeMin <= 0.001) {
      this.channel1CoolingResetPending = false;
      this.rebuildCurve1(0);
    }
  }

  /**
   * 独立切换右侧（通道2 非晶体）酒精灯点火/熄灭状态
   */
  public toggleRightLamp(): boolean {
    this.setRightLampLit(!this.rightLampLit);
    return this.rightLampLit;
  }

  public setRightLampLit(lit: boolean): void {
    if (this.rightLampLit === lit) return;
    this.rightLampLit = lit;
    if (!lit && this.channel2TimeMin > 0) {
      this.channel2CoolingResetPending = true;
    } else if (lit && this.channel2TimeMin <= 0.001) {
      this.channel2CoolingResetPending = false;
      this.rebuildCurve2(0);
    }
  }

  /**
   * 切换采集器「通道1 晶体」曲线显示/隐藏
   */
  public toggleChannel1Visibility(): boolean {
    this.showChannel1 = !this.showChannel1;
    return this.showChannel1;
  }

  /**
   * 切换采集器「通道2 非晶体」曲线显示/隐藏
   */
  public toggleChannel2Visibility(): boolean {
    this.showChannel2 = !this.showChannel2;
    return this.showChannel2;
  }

  /**
   * 步进相变与热传导动力学状态
   */
  public step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const clampedDt = Math.min(dt, 0.1);

    // 1. 步进通道 1（左侧：晶体·冰晶）
    if (this.leftLampLit) {
      // 若之前处于熄火冷却中途被重新点燃，直接从当前温度对应的时间点平滑继续加热
      this.channel1CoolingResetPending = false;
      if (this.channel1TimeMin < MAX_EXPERIMENT_TIME_MIN) {
        this.channel1TimeMin = Math.min(
          MAX_EXPERIMENT_TIME_MIN,
          this.channel1TimeMin + clampedDt * this.simMinutesPerSecond
        );
        this.rebuildCurve1(this.channel1TimeMin);
      }
    } else {
      // 酒精灯已熄灭：水浴与试管快速降温回初始态 (0 °C)，归零后自动清空重置该通道曲线
      if (this.channel1TimeMin > 0) {
        this.channel1TimeMin = Math.max(
          0,
          this.channel1TimeMin - clampedDt * this.coolingMinutesPerSecond
        );
        this.rebuildCurve1(this.channel1TimeMin);
        if (this.channel1TimeMin <= 0.0001) {
          this.channel1TimeMin = 0;
          this.channel1CoolingResetPending = false;
          this.channel1Curve = [{ timeMin: 0, tempC: 0 }];
        }
      } else if (this.channel1CoolingResetPending) {
        this.channel1CoolingResetPending = false;
        this.channel1Curve = [{ timeMin: 0, tempC: 0 }];
      }
    }

    // 2. 步进通道 2（右侧：非晶体·石蜡）
    if (this.rightLampLit) {
      this.channel2CoolingResetPending = false;
      if (this.channel2TimeMin < MAX_EXPERIMENT_TIME_MIN) {
        this.channel2TimeMin = Math.min(
          MAX_EXPERIMENT_TIME_MIN,
          this.channel2TimeMin + clampedDt * this.simMinutesPerSecond
        );
        this.rebuildCurve2(this.channel2TimeMin);
      }
    } else {
      // 酒精灯已熄灭：快速冷却回 0 °C 并自动清空重置该通道曲线
      if (this.channel2TimeMin > 0) {
        this.channel2TimeMin = Math.max(
          0,
          this.channel2TimeMin - clampedDt * this.coolingMinutesPerSecond
        );
        this.rebuildCurve2(this.channel2TimeMin);
        if (this.channel2TimeMin <= 0.0001) {
          this.channel2TimeMin = 0;
          this.channel2CoolingResetPending = false;
          this.channel2Curve = [{ timeMin: 0, tempC: 0 }];
        }
      } else if (this.channel2CoolingResetPending) {
        this.channel2CoolingResetPending = false;
        this.channel2Curve = [{ timeMin: 0, tempC: 0 }];
      }
    }
  }

  /**
   * 立即重置整个实验回 t = 0 初始态
   */
  public reset(keepLampsLit = true): void {
    this.leftLampLit = keepLampsLit;
    this.rightLampLit = keepLampsLit;
    this.channel1TimeMin = 0;
    this.channel2TimeMin = 0;
    this.channel1CoolingResetPending = false;
    this.channel2CoolingResetPending = false;
    this.channel1Curve = [{ timeMin: 0, tempC: 0 }];
    this.channel2Curve = [{ timeMin: 0, tempC: 0 }];
  }

  /**
   * 获取当前完整热力学相变遥测数据
   */
  public getTelemetry(): PhaseChangeTelemetry {
    const t1 = this.channel1TimeMin;
    const temp1 = evaluateCrystallineTempC(t1);

    let meltFraction1 = 0;
    let phase1: CrystallinePhaseState = 'solid';
    if (t1 < CRYSTAL_MELT_START_MIN) {
      meltFraction1 = 0;
      phase1 = 'solid';
    } else if (t1 <= CRYSTAL_MELT_END_MIN) {
      meltFraction1 = Math.max(
        0,
        Math.min(1, (t1 - CRYSTAL_MELT_START_MIN) / (CRYSTAL_MELT_END_MIN - CRYSTAL_MELT_START_MIN))
      );
      phase1 = 'coexistence';
    } else {
      meltFraction1 = 1;
      phase1 = 'liquid';
    }

    const sensibleSolidKJ =
      Math.min(temp1, CRYSTAL_MELTING_POINT_C) * CRYSTAL_SOLID_CP_KJ_KG_C;
    const latentKJ = meltFraction1 * CRYSTAL_LATENT_HEAT_KJ_KG;
    const sensibleLiquidKJ =
      Math.max(0, temp1 - CRYSTAL_MELTING_POINT_C) * CRYSTAL_LIQUID_CP_KJ_KG_C;
    const absorbedHeat1 = sensibleSolidKJ + latentKJ + sensibleLiquidKJ;

    // 水浴水温略高于试管内样品温度（提供温差驱动传热）
    const bathTemp1 = this.leftLampLit
      ? Math.min(96.0, Math.max(temp1 + 6.5, 22.0 + (t1 / MAX_EXPERIMENT_TIME_MIN) * 70.0))
      : Math.max(20.0, temp1 + 1.5);

    const t2 = this.channel2TimeMin;
    const temp2 = evaluateAmorphousTempC(t2);

    // 石蜡非晶体连续软化度：从 14 °C 开始逐渐变软，到 58 °C 完全呈透明流体
    const rawSoft = Math.max(0, Math.min(1, (temp2 - 14.0) / 44.0));
    const softenFraction2 = rawSoft * rawSoft * (3 - 2 * rawSoft);

    let phase2: AmorphousPhaseState = 'solid';
    if (softenFraction2 < 0.12) {
      phase2 = 'solid';
    } else if (softenFraction2 < 0.90) {
      phase2 = 'softening';
    } else {
      phase2 = 'liquid';
    }

    const bathTemp2 = this.rightLampLit
      ? Math.min(96.0, Math.max(temp2 + 6.5, 22.0 + (t2 / MAX_EXPERIMENT_TIME_MIN) * 70.0))
      : Math.max(20.0, temp2 + 1.5);

    return {
      leftLampLit: this.leftLampLit,
      rightLampLit: this.rightLampLit,
      showChannel1: this.showChannel1,
      showChannel2: this.showChannel2,

      channel1TimeMin: t1,
      channel1TempC: temp1,
      channel1BathTempC: bathTemp1,
      channel1MeltFraction: meltFraction1,
      channel1Phase: phase1,
      channel1AbsorbedHeatKJPerKg: absorbedHeat1,
      channel1LatentHeatProgress: meltFraction1,

      channel2TimeMin: t2,
      channel2TempC: temp2,
      channel2BathTempC: bathTemp2,
      channel2SoftenFraction: softenFraction2,
      channel2Phase: phase2,

      channel1Curve: this.channel1Curve,
      channel2Curve: this.channel2Curve,
    };
  }

  private rebuildCurve1(maxTimeMin: number): void {
    const pts: PhaseCurvePoint[] = [];
    const stepMin = 0.25;
    for (let t = 0; t < maxTimeMin; t += stepMin) {
      pts.push({
        timeMin: t,
        tempC: evaluateCrystallineTempC(t),
      });
    }
    // 确保包含熔点起止特征拐点，使平台段棱角与过渡极致丝滑精确
    if (maxTimeMin >= CRYSTAL_MELT_START_MIN) {
      pts.push({
        timeMin: CRYSTAL_MELT_START_MIN,
        tempC: evaluateCrystallineTempC(CRYSTAL_MELT_START_MIN),
      });
    }
    if (maxTimeMin >= CRYSTAL_MELT_END_MIN) {
      pts.push({
        timeMin: CRYSTAL_MELT_END_MIN,
        tempC: evaluateCrystallineTempC(CRYSTAL_MELT_END_MIN),
      });
    }
    pts.push({
      timeMin: maxTimeMin,
      tempC: evaluateCrystallineTempC(maxTimeMin),
    });
    pts.sort((a, b) => a.timeMin - b.timeMin);
    this.channel1Curve = pts;
  }

  private rebuildCurve2(maxTimeMin: number): void {
    const pts: PhaseCurvePoint[] = [];
    const stepMin = 0.25;
    for (let t = 0; t < maxTimeMin; t += stepMin) {
      pts.push({
        timeMin: t,
        tempC: evaluateAmorphousTempC(t),
      });
    }
    pts.push({
      timeMin: maxTimeMin,
      tempC: evaluateAmorphousTempC(maxTimeMin),
    });
    this.channel2Curve = pts;
  }
}
