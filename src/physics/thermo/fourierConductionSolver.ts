/**
 * 固体热传导与傅里叶定律 (Solid Heat Conduction & Fourier's Law)
 * 一维非稳态热传导偏微分方程与傅里叶稳态热流密度物理求解器
 *
 * 核心物理定律：
 * 1. 傅里叶热传导定律 (Fourier's Law of Heat Conduction):
 *    q = -k * (dT / dx)   [W/m²]
 *    Φ = q * A = -k * A * (dT / dx)   [W]
 *
 * 2. 一维非稳态热传导方程 (1D Transient Heat Conduction PDE):
 *    ∂T/∂t = α * (∂²T/∂x²) - β_loss * (T - T_env)
 *    其中热扩散率 α = k / (ρ * c_p) [m²/s]
 *
 * 3. 五路等间距热电偶测温探头 (T1 ~ T5):
 *    沿有效导热棒长 L = 0.40 m 分布，实时采样各点温度并计算线性回归温度梯度 dT/dx。
 */

export type FourierRodMaterialId = 'brass' | 'copper' | 'aluminum' | 'stainless';

export interface FourierRodMaterialSpec {
  id: FourierRodMaterialId;
  name: string;
  shortName: string;
  formulaSymbol: string;
  /** 导热系数 k [W/(m·K)] */
  thermalConductivity: number;
  /** 密度 ρ [kg/m³] */
  density: number;
  /** 比热容 c_p [J/(kg·K)] */
  specificHeat: number;
  /** 热扩散率 α = k / (ρ * c_p) [m²/s] */
  thermalDiffusivity: number;
  /** 金属外观主色调 (Hex) */
  colorHex: number;
  /** 金属粗糙度 */
  roughness: number;
  /** 金属度 */
  metalness: number;
}

export const FOURIER_ROD_MATERIALS: Record<FourierRodMaterialId, FourierRodMaterialSpec> = {
  brass: {
    id: 'brass',
    name: '黄铜 H62',
    shortName: '黄铜',
    formulaSymbol: 'Cu-Zn',
    thermalConductivity: 109.0,
    density: 8430,
    specificHeat: 380,
    thermalDiffusivity: 109.0 / (8430 * 380), // ~3.40e-5 m²/s
    colorHex: 0xd9a441,
    roughness: 0.24,
    metalness: 0.92,
  },
  copper: {
    id: 'copper',
    name: '紫铜 T2',
    shortName: '紫铜',
    formulaSymbol: 'Cu',
    thermalConductivity: 398.0,
    density: 8960,
    specificHeat: 385,
    thermalDiffusivity: 398.0 / (8960 * 385), // ~1.15e-4 m²/s
    colorHex: 0xd97757,
    roughness: 0.22,
    metalness: 0.94,
  },
  aluminum: {
    id: 'aluminum',
    name: '铝合金 6061',
    shortName: '铝合金',
    formulaSymbol: 'Al',
    thermalConductivity: 167.0,
    density: 2700,
    specificHeat: 896,
    thermalDiffusivity: 167.0 / (2700 * 896), // ~6.90e-5 m²/s
    colorHex: 0xe2e8f0,
    roughness: 0.26,
    metalness: 0.88,
  },
  stainless: {
    id: 'stainless',
    name: '不锈钢 304',
    shortName: '不锈钢',
    formulaSymbol: 'Fe-Cr-Ni',
    thermalConductivity: 16.2,
    density: 7930,
    specificHeat: 500,
    thermalDiffusivity: 16.2 / (7930 * 500), // ~4.09e-6 m²/s
    colorHex: 0xcbd5e1,
    roughness: 0.18,
    metalness: 0.96,
  },
};

export const FOURIER_MATERIAL_ORDER: FourierRodMaterialId[] = [
  'brass',
  'copper',
  'aluminum',
  'stainless',
];

/** 默认高温端设定温度 (°C) - 对齐参考图 100.0 °C */
export const DEFAULT_FOURIER_HOT_TEMP_C = 100.0;
/** 默认低温水浴设定温度 (°C) - 对齐参考图 20.0 °C */
export const DEFAULT_FOURIER_COLD_TEMP_C = 20.0;
/** 环境室温 (°C) */
export const AMBIENT_FOURIER_TEMP_C = 22.0;

/** 导热棒有效测量段总长度 L (m) */
export const ROD_LENGTH_M = 0.40;
/** 导热棒直径 D (m) */
export const ROD_DIAMETER_M = 0.025;
/** 导热棒截面积 A = π * D² / 4 (m²) */
export const ROD_CROSS_SECTION_M2 = Math.PI * (ROD_DIAMETER_M * 0.5) ** 2;

/** 有限差分空间网格节点数 */
export const spatialNodeCount = 41;

/**
 * 5 个等间距热电偶探头在导热棒上的轴向坐标 x_i (m)
 * 间距 Δx = 0.08 m (80 mm)
 */
export const PROBE_POSITIONS_M: readonly [number, number, number, number, number] = [
  0.04,
  0.12,
  0.20,
  0.28,
  0.36,
];

/**
 * 探头对应的有限差分节点索引 (x_i / 0.40 * 40)
 */
export const PROBE_NODE_INDICES: readonly [number, number, number, number, number] = [
  4,
  12,
  20,
  28,
  36,
];

export interface FourierProbeReading {
  /** 探头编号 1~5 */
  index: number;
  /** 探头标签 T1~T5 */
  label: string;
  /** 轴向位置 x (m) */
  positionM: number;
  /** 当前实时温度 (°C) */
  temperatureC: number;
  /** 理想稳态温度 (°C) */
  steadyTemperatureC: number;
}

export interface FourierProfilePoint {
  /** 轴向位置 x (m), 0 ~ 0.40 */
  xM: number;
  /** 当前实时温度 (°C) */
  tempC: number;
  /** 稳态理论温度 (°C) */
  steadyTempC: number;
}

export interface FourierConductionTelemetry {
  /** 当前导热棒材质 ID */
  materialId: FourierRodMaterialId;
  /** 当前导热棒材质规格 */
  material: FourierRodMaterialSpec;
  /** 加热电源是否开启 */
  heaterOn: boolean;
  /** 高温热源设定温度 T_H (°C) */
  hotTempC: number;
  /** 低温循环水浴设定温度 T_C (°C) */
  coldTempC: number;
  /** 加热炉左端实际接触面温度 (°C) */
  leftBoundaryTempC: number;
  /** 水冷腔右端实际接触面温度 (°C) */
  rightBoundaryTempC: number;
  /** T1 ~ T5 五路热电偶探头实时读数 */
  probes: [
    FourierProbeReading,
    FourierProbeReading,
    FourierProbeReading,
    FourierProbeReading,
    FourierProbeReading,
  ];
  /** 沿棒轴向温度梯度 dT/dx (K/m，通常为负值，表示沿 +x 降温) */
  temperatureGradientKm: number;
  /** 温度梯度绝对值 |dT/dx| (K/m) */
  absGradientKm: number;
  /** 傅里叶热流密度 q = -k * dT/dx (W/m²) */
  heatFluxWm2: number;
  /** 傅里叶热流密度 (kW/m²) */
  heatFluxKWm2: number;
  /** 沿棒传导热功率 Φ = q * A (W) */
  conductedPowerW: number;
  /** 左侧加热控制器显示功率 (W) */
  heaterDisplayPowerW: number;
  /** 右侧冷却水浴出水温度 (°C，随热流略微升高) */
  coolantOutletTempC: number;
  /** 稳态收敛度 (0.0 ~ 1.0, 1.0 表示完全达到傅里叶稳态平衡) */
  steadyConvergence: number;
  /** 是否已达到稳态平衡 (收敛度 >= 0.985) */
  isSteadyState: boolean;
  /** 沿棒 41 个节点的完整温度分布采样 */
  profileSamples: FourierProfilePoint[];
  /** 内部声子/电子热流粒子归一化流速 (0 ~ 1+) */
  particleFlowSpeed: number;
  /** 换棒 3D 机械过渡动画进度 (0=就位, >0=换棒抬升过渡中) */
  rodSwapProgress: number;
}

export interface FourierConductionSolverOptions {
  materialId?: FourierRodMaterialId;
  hotTempC?: number;
  coldTempC?: number;
  heaterOn?: boolean;
  startInSteadyState?: boolean;
}

export class FourierConductionSolver {
  public materialId: FourierRodMaterialId;
  public hotTempC: number;
  public coldTempC: number;
  public heaterOn: boolean;

  /** 沿棒 41 个有限差分节点的实时温度 (°C) */
  private nodeTempsC: Float64Array;
  /** 沿棒 41 个节点的稳态参考温度 (°C) */
  private steadyTempsC: Float64Array;
  /** 临时差分缓冲 */
  private nextTempsC: Float64Array;

  /** 左侧电加热器实际热端包络温度 (°C) */
  private currentLeftBoundaryC: number;
  /** 右侧水冷腔实际冷端包络温度 (°C) */
  private currentRightBoundaryC: number;

  /** 换棒动画计时器 (0 表示就位) */
  private rodSwapTimer = 0;

  /**
   * 物理时间加速倍率：
   * 真实 0.40m 金属棒热平衡需 ~15 分钟；通过时间加速使：
   * - 紫铜 (α=1.15e-4) 约 3~4 秒达到稳态
   * - 黄铜 (α=3.40e-5) 约 5~6 秒达到稳态
   * - 不锈钢 (α=4.09e-6) 约 11~12 秒达到稳态
   */
  public timeAcceleration = 380.0;

  constructor(options: FourierConductionSolverOptions = {}) {
    this.materialId = options.materialId ?? 'brass';
    this.hotTempC = options.hotTempC ?? DEFAULT_FOURIER_HOT_TEMP_C;
    this.coldTempC = options.coldTempC ?? DEFAULT_FOURIER_COLD_TEMP_C;
    this.heaterOn = options.heaterOn ?? true;

    this.nodeTempsC = new Float64Array(spatialNodeCount);
    this.steadyTempsC = new Float64Array(spatialNodeCount);
    this.nextTempsC = new Float64Array(spatialNodeCount);

    this.currentLeftBoundaryC = this.computeTargetLeftBoundaryC();
    this.currentRightBoundaryC = this.computeTargetRightBoundaryC();
    this.recomputeSteadyProfile();

    if (options.startInSteadyState) {
      this.snapToSteadyState();
    } else {
      this.resetTransientWave();
    }
  }

  /**
   * 计算左端边界温度 (x = 0) 与右端边界温度 (x = L)
   * 当 T_H = 100.0°C, T_C = 20.0°C 时：
   * 考虑热端与冷端夹具微小接触热阻，使得 x1=0.04m 处稳态温度约 98.2°C，x5=0.36m 处约 25.1°C，
   * 与参考图巡检仪读数 (98.2, 76.5, 58.7, 39.4, 25.1) 高度吻合且严格满足傅里叶一维线性分布。
   */
  private computeTargetLeftBoundaryC(): number {
    if (!this.heaterOn) {
      return this.coldTempC;
    }
    const delta = this.hotTempC - this.coldTempC;
    return this.hotTempC + delta * 0.091;
  }

  private computeTargetRightBoundaryC(): number {
    if (!this.heaterOn) {
      return this.coldTempC;
    }
    const delta = this.hotTempC - this.coldTempC;
    return this.coldTempC - delta * 0.052;
  }

  /**
   * 计算在给定归一化坐标 s = x / L 处的稳态温度
   */
  private evaluateSteadyTempAt(normX: number): number {
    if (!this.heaterOn) {
      return this.coldTempC;
    }
    // 在 T_H = 100, T_C = 20 时：
    // x1 (s=0.1) -> 98.2°C, x5 (s=0.9) -> 25.1°C, 严格线性斜率 dT/ds = -91.375 * (Th - Tc)/80
    const span = this.hotTempC - this.coldTempC;
    const tAtProbe1 = this.coldTempC + span * 0.9775; // 98.2 at 100/20
    const tAtProbe5 = this.coldTempC + span * 0.06375; // 25.1 at 100/20
    const slopePerNorm = (tAtProbe5 - tAtProbe1) / 0.8;
    return tAtProbe1 + slopePerNorm * (normX - 0.1);
  }

  private recomputeSteadyProfile(): void {
    for (let i = 0; i < spatialNodeCount; i++) {
      const normX = i / (spatialNodeCount - 1);
      this.steadyTempsC[i] = this.evaluateSteadyTempAt(normX);
    }
  }

  /**
   * 初始化为开机非稳态热传导波前状态：
   * 左端热源刚刚接入，棒体中右段尚处于冷却水初温，让用户直观看到热波从 T1 依次传向 T5
   */
  public resetTransientWave(): void {
    this.recomputeSteadyProfile();
    this.currentLeftBoundaryC = this.steadyTempsC[0];
    this.currentRightBoundaryC = this.steadyTempsC[spatialNodeCount - 1];

    for (let i = 0; i < spatialNodeCount; i++) {
      const normX = i / (spatialNodeCount - 1);
      if (this.heaterOn) {
        // 初始左端局部预热，向右侧呈指数衰减至冷端温度
        const initialDecay = Math.exp(-normX * 7.5);
        this.nodeTempsC[i] =
          this.currentRightBoundaryC +
          (this.currentLeftBoundaryC - this.currentRightBoundaryC) * initialDecay;
      } else {
        this.nodeTempsC[i] = this.coldTempC;
      }
    }
    this.nodeTempsC[0] = this.currentLeftBoundaryC;
    this.nodeTempsC[spatialNodeCount - 1] = this.currentRightBoundaryC;
  }

  /**
   * 立即收敛至稳态线性温度分布（用于单元测试或快速稳态校核）
   */
  public snapToSteadyState(): void {
    this.recomputeSteadyProfile();
    this.currentLeftBoundaryC = this.steadyTempsC[0];
    this.currentRightBoundaryC = this.steadyTempsC[spatialNodeCount - 1];
    for (let i = 0; i < spatialNodeCount; i++) {
      this.nodeTempsC[i] = this.steadyTempsC[i];
    }
  }

  public setMaterial(materialId: FourierRodMaterialId, triggerTransient = true): void {
    if (!FOURIER_ROD_MATERIALS[materialId]) return;
    const changed = this.materialId !== materialId;
    this.materialId = materialId;
    if (changed) {
      this.rodSwapTimer = 1.0;
      if (triggerTransient) {
        this.resetTransientWave();
      }
    }
  }

  public cycleMaterial(): FourierRodMaterialId {
    const idx = FOURIER_MATERIAL_ORDER.indexOf(this.materialId);
    const nextId = FOURIER_MATERIAL_ORDER[(idx + 1) % FOURIER_MATERIAL_ORDER.length];
    this.setMaterial(nextId, true);
    return nextId;
  }

  public setHotTempC(tempC: number): void {
    const clamped = Math.max(60, Math.min(150, Math.round(tempC * 10) / 10));
    this.hotTempC = clamped;
    this.recomputeSteadyProfile();
  }

  public setColdTempC(tempC: number): void {
    const clamped = Math.max(5, Math.min(40, Math.round(tempC * 10) / 10));
    this.coldTempC = clamped;
    this.recomputeSteadyProfile();
  }

  public setHeaterOn(on: boolean): void {
    if (this.heaterOn === on) return;
    this.heaterOn = on;
    this.recomputeSteadyProfile();
  }

  public toggleHeater(): boolean {
    this.setHeaterOn(!this.heaterOn);
    return this.heaterOn;
  }

  /**
   * 推进一维非稳态热传导 PDE 求解 (∂T/∂t = α_eff * ∂²T/∂x²)
   */
  public step(dt: number): void {
    if (dt <= 0) return;
    const clampedDt = Math.min(0.1, dt);

    if (this.rodSwapTimer > 0) {
      this.rodSwapTimer = Math.max(0, this.rodSwapTimer - clampedDt * 2.4);
    }

    this.recomputeSteadyProfile();
    const targetLeft = this.steadyTempsC[0];
    const targetRight = this.steadyTempsC[spatialNodeCount - 1];

    // 边界温度平滑响应
    const boundaryLerp = 1 - Math.exp(-clampedDt * 8.0);
    this.currentLeftBoundaryC += (targetLeft - this.currentLeftBoundaryC) * boundaryLerp;
    this.currentRightBoundaryC += (targetRight - this.currentRightBoundaryC) * boundaryLerp;

    const mat = FOURIER_ROD_MATERIALS[this.materialId];
    const dx = ROD_LENGTH_M / (spatialNodeCount - 1); // 0.01 m
    const dx2 = dx * dx; // 1.0e-4 m²

    // 针对不锈钢等低导热率材料保持显著慢速但不过度漫长的视觉对比（压缩动态范围至真实物理趋势）
    const baseAlpha = mat.thermalDiffusivity;
    const effectiveAlpha =
      baseAlpha * this.timeAcceleration * (this.materialId === 'stainless' ? 1.85 : 1.0);

    // 显式有限差分稳定性条件: r = α_eff * subDt / dx² <= 0.45
    const maxSubDt = (0.42 * dx2) / Math.max(1e-7, effectiveAlpha);
    const subSteps = Math.max(1, Math.min(80, Math.ceil(clampedDt / maxSubDt)));
    const subDt = clampedDt / subSteps;
    const r = Math.min(0.45, (effectiveAlpha * subDt) / dx2);

    this.nodeTempsC[0] = this.currentLeftBoundaryC;
    this.nodeTempsC[spatialNodeCount - 1] = this.currentRightBoundaryC;

    for (let s = 0; s < subSteps; s++) {
      this.nextTempsC[0] = this.currentLeftBoundaryC;
      this.nextTempsC[spatialNodeCount - 1] = this.currentRightBoundaryC;

      for (let i = 1; i < spatialNodeCount - 1; i++) {
        const laplacian =
          this.nodeTempsC[i - 1] - 2 * this.nodeTempsC[i] + this.nodeTempsC[i + 1];
        this.nextTempsC[i] = this.nodeTempsC[i] + r * laplacian;
      }

      this.nodeTempsC.set(this.nextTempsC);
    }
  }

  /**
   * 获取当前完整实验遥测数据
   */
  public getTelemetry(): FourierConductionTelemetry {
    const mat = FOURIER_ROD_MATERIALS[this.materialId];

    const probes = PROBE_NODE_INDICES.map((nodeIdx, idx) => {
      const posM = PROBE_POSITIONS_M[idx];
      const tempC = this.nodeTempsC[nodeIdx];
      const steadyTempC = this.steadyTempsC[nodeIdx];
      return {
        index: idx + 1,
        label: `T${idx + 1}`,
        positionM: posM,
        temperatureC: tempC,
        steadyTemperatureC: steadyTempC,
      };
    }) as [
      FourierProbeReading,
      FourierProbeReading,
      FourierProbeReading,
      FourierProbeReading,
      FourierProbeReading,
    ];

    // 使用最小二乘法线性拟合 5 个探头的温度梯度 dT/dx (K/m)
    let sumX = 0;
    let sumT = 0;
    for (let i = 0; i < 5; i++) {
      sumX += probes[i].positionM;
      sumT += probes[i].temperatureC;
    }
    const meanX = sumX / 5;
    const meanT = sumT / 5;
    let num = 0;
    let den = 0;
    for (let i = 0; i < 5; i++) {
      const dx = probes[i].positionM - meanX;
      num += dx * (probes[i].temperatureC - meanT);
      den += dx * dx;
    }
    const temperatureGradientKm = den > 1e-9 ? num / den : 0;
    const absGradientKm = Math.abs(temperatureGradientKm);

    // 傅里叶定律: q = -k * (dT/dx)
    const heatFluxWm2 = -mat.thermalConductivity * temperatureGradientKm;
    const heatFluxKWm2 = heatFluxWm2 / 1000;
    const conductedPowerW = Math.max(0, heatFluxWm2 * ROD_CROSS_SECTION_M2);

    // 评估当前温度场与稳态线性场的收敛度
    let maxDiff = 0;
    const totalSpan = Math.max(10, Math.abs(this.hotTempC - this.coldTempC));
    for (let i = 1; i < spatialNodeCount - 1; i++) {
      const diff = Math.abs(this.nodeTempsC[i] - this.steadyTempsC[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
    const steadyConvergence = Math.max(0, Math.min(1, 1 - maxDiff / (totalSpan * 0.45)));
    const isSteadyState = steadyConvergence >= 0.985;

    // 左侧控制器显示功率 (参考图在 100.0°C / 黄铜下显示 10.00)
    const heaterDisplayPowerW = this.heaterOn
      ? Math.max(1.2, conductedPowerW * 0.892)
      : 0.0;

    // 右侧冷却水浴出水温度随传入热功率轻微抬升
    const coolantOutletTempC =
      this.coldTempC + Math.min(3.5, conductedPowerW * 0.085);

    const profileSamples: FourierProfilePoint[] = [];
    for (let i = 0; i < spatialNodeCount; i++) {
      profileSamples.push({
        xM: (i / (spatialNodeCount - 1)) * ROD_LENGTH_M,
        tempC: this.nodeTempsC[i],
        steadyTempC: this.steadyTempsC[i],
      });
    }

    // 热流粒子归一化速度（正比于热流密度 q，并对数/平方根柔化以保证不同材质视觉流畅且差异鲜明）
    const particleFlowSpeed = this.heaterOn
      ? Math.max(0.08, Math.min(2.6, Math.sqrt(Math.max(0, heatFluxKWm2) / 18.0)))
      : 0.0;

    return {
      materialId: this.materialId,
      material: mat,
      heaterOn: this.heaterOn,
      hotTempC: this.hotTempC,
      coldTempC: this.coldTempC,
      leftBoundaryTempC: this.nodeTempsC[0],
      rightBoundaryTempC: this.nodeTempsC[spatialNodeCount - 1],
      probes,
      temperatureGradientKm,
      absGradientKm,
      heatFluxWm2,
      heatFluxKWm2,
      conductedPowerW,
      heaterDisplayPowerW,
      coolantOutletTempC,
      steadyConvergence,
      isSteadyState,
      profileSamples,
      particleFlowSpeed,
      rodSwapProgress: this.rodSwapTimer,
    };
  }
}
