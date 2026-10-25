/**
 * 气体实验三定律物理求解器 (Three Experimental Gas Laws Solver)
 *
 * 严格遵循理想气体状态方程 pV = nRT 及其三个经典等值过程定律：
 * 1. 玻意耳定律 (Boyle's Law · 等温过程 T = T₀ = 300 K)：
 *    - 活塞锁止插销松开，恒温水浴夹套维持 T₀ = 300.0 K 不变；
 *    - 用户手动上下拖拽 3D 活塞 T 形手柄改变体积 V ∈ [18.0, 60.0] mL；
 *    - 气体压强严格遵循 pV = C₁ = p₀V₀ = 3545.5 kPa·mL。
 *
 * 2. 查理定律 (Charles's Law · 等容过程 V = V₀ = 35.0 mL)：
 *    - 黄铜机械定容锁止插销物理插入锁死活塞杆，保持体积 V₀ = 35.0 mL 恒定；
 *    - 用户手动旋转/拖拽底座黄铜滚花温控旋钮改变热力学温度 T ∈ [200.0, 440.0] K；
 *    - 气体压强严格遵循 p / T = C₂ = p₀ / T₀ ≈ 0.3377 kPa/K（外推过绝对零度原点 0 K）。
 *
 * 3. 盖-吕萨克定律 (Gay-Lussac's Law · 等压过程 p = p₀ = 101.3 kPa)：
 *    - 活塞锁止插销松开，活塞在恒定大气压与配重负载下自由浮动，维持压强 p₀ = 101.3 kPa 恒定；
 *    - 用户手动旋转/拖拽底座黄铜滚花温控旋钮改变热力学温度 T ∈ [180.0, 480.0] K；
 *    - 气缸内气体体积随温度线性膨胀或收缩 V / T = C₃ = V₀ / T₀ ≈ 0.1167 mL/K，驱动 3D 活塞实时升降。
 */

export type GasLawMode = 'boyle' | 'charles' | 'gay-lussac';

/** 标准基准状态常量 (Reference State) */
export const REF_PRESSURE_KPA = 101.3;
export const REF_VOLUME_ML = 35.0;
export const REF_TEMPERATURE_K = 300.0;
export const ABSOLUTE_ZERO_CELSIUS = -273.15;

/** 气缸物理量程边界 */
export const MIN_CYLINDER_VOLUME_ML = 18.0;
export const MAX_CYLINDER_VOLUME_ML = 60.0;

/** 查理定律（等容）温控范围 [K] */
export const CHARLES_MIN_TEMP_K = 200.0;
export const CHARLES_MAX_TEMP_K = 440.0;

/** 盖-吕萨克定律（等压）温控范围 [K] */
export const GAY_LUSSAC_MIN_TEMP_K = 180.0;
export const GAY_LUSSAC_MAX_TEMP_K = 480.0;

/** 三个定律的受控不变量理论常数 */
export const BOYLE_INVARIANT_PV = REF_PRESSURE_KPA * REF_VOLUME_ML; // 3545.5 kPa·mL
export const CHARLES_INVARIANT_P_OVER_T = REF_PRESSURE_KPA / REF_TEMPERATURE_K; // ~0.33767 kPa/K
export const GAY_LUSSAC_INVARIANT_V_OVER_T = REF_VOLUME_ML / REF_TEMPERATURE_K; // ~0.11667 mL/K

export interface GasLawCurvePoint {
  /** 横轴物理量：玻意耳定律为 V (mL)，查理/盖-吕萨克定律为 T (K) */
  x: number;
  /** 纵轴物理量：玻意耳/查理定律为 p (kPa)，盖-吕萨克定律为 V (mL) */
  y: number;
}

export interface GasLawsTelemetry {
  /** 当前所选定律模式 */
  mode: GasLawMode;
  /** 气体压强 p [kPa] */
  pressureKPa: number;
  /** 气体体积 V [mL] */
  volumeML: number;
  /** 热力学温度 T [K] */
  temperatureK: number;
  /** 摄氏温度 t [°C] */
  temperatureC: number;
  /** 黄铜机械定容锁止插销是否插入锁死活塞（查理定律等容模式下为 true） */
  pistonLocked: boolean;
  /** 活塞高度归一化比例 [0, 1]（0 对应 18 mL，1 对应 60 mL） */
  pistonNormalized: number;
  /** 温控旋钮归一化比例 [0, 1] */
  tempNormalized: number;
  /** 温控黄铜旋钮旋转弧度 [rad] */
  knobAngleRad: number;
  /** 波登机械压力表指针归一化比例 [0, 1]（满量程 220 kPa） */
  gaugeNormalized: number;
  /** 理想气体分子方均根速率相对因子 sqrt(T / 300) */
  molecularSpeedFactor: number;
  /** 理想气体分子数密度相对因子 V₀ / V */
  molecularDensityFactor: number;
  /** 当前定律不变量公式名称 */
  invariantExpression: string;
  /** 当前定律不变量数值 */
  invariantValue: number;
  /** 当前定律不变量单位 */
  invariantUnit: string;
  /** 玻意耳模式下用户已拖拽探索过的最小/最大体积区间 [mL] */
  sweptVolumeRangeML: [number, number];
  /** 查理模式下用户已拖拽探索过的最小/最大温度区间 [K] */
  sweptCharlesTempRangeK: [number, number];
  /** 盖-吕萨克模式下用户已拖拽探索过的最小/最大温度区间 [K] */
  sweptGayLussacTempRangeK: [number, number];
}

export interface GasLawsSolverConfig {
  mode?: GasLawMode;
  volumeML?: number;
  temperatureK?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 理想气体等温过程压强计算（玻意耳定律 p = C₁ / V）
 */
export function evaluateBoylePressureKPa(volumeML: number): number {
  const safeV = clamp(volumeML, MIN_CYLINDER_VOLUME_ML, MAX_CYLINDER_VOLUME_ML);
  return BOYLE_INVARIANT_PV / safeV;
}

/**
 * 理想气体等容过程压强计算（查理定律 p = C₂ · T）
 */
export function evaluateCharlesPressureKPa(temperatureK: number): number {
  const safeT = Math.max(1.0, temperatureK);
  return CHARLES_INVARIANT_P_OVER_T * safeT;
}

/**
 * 理想气体等压过程体积计算（盖-吕萨克定律 V = C₃ · T）
 */
export function evaluateGayLussacVolumeML(temperatureK: number): number {
  const safeT = Math.max(1.0, temperatureK);
  return GAY_LUSSAC_INVARIANT_V_OVER_T * safeT;
}

export class GasLawsSolver {
  public mode: GasLawMode;
  public pressureKPa: number = REF_PRESSURE_KPA;
  public volumeML: number = REF_VOLUME_ML;
  public temperatureK: number = REF_TEMPERATURE_K;

  // 记录用户在各模式下手动拖拽探索过的参数范围，用于 3D 屏幕实时点亮已探索轨迹段
  private sweptVolumeRangeML: [number, number] = [REF_VOLUME_ML, REF_VOLUME_ML];
  private sweptCharlesTempRangeK: [number, number] = [REF_TEMPERATURE_K, REF_TEMPERATURE_K];
  private sweptGayLussacTempRangeK: [number, number] = [REF_TEMPERATURE_K, REF_TEMPERATURE_K];

  constructor(config: GasLawsSolverConfig = {}) {
    this.mode = config.mode ?? 'boyle';
    this.applyModeReset(this.mode);

    if (config.volumeML !== undefined && this.mode === 'boyle') {
      this.setVolumeML(config.volumeML);
    }
    if (config.temperatureK !== undefined && this.mode !== 'boyle') {
      this.setTemperatureK(config.temperatureK);
    }
  }

  /**
   * 切换气体定律模式（玻意耳等温 / 查理等容 / 盖-吕萨克等压）
   * 切换时锁定该定律对应的受控不变量基准值
   */
  public setMode(nextMode: GasLawMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.applyModeReset(nextMode);
  }

  private applyModeReset(mode: GasLawMode): void {
    if (mode === 'boyle') {
      // 等温过程：锁定 T₀ = 300 K，活塞恢复基准容积 35 mL（若此前已在玻意耳范围则保持当前合理值）
      this.temperatureK = REF_TEMPERATURE_K;
      this.volumeML = clamp(this.volumeML, MIN_CYLINDER_VOLUME_ML, MAX_CYLINDER_VOLUME_ML);
      this.pressureKPa = evaluateBoylePressureKPa(this.volumeML);
      this.sweptVolumeRangeML[0] = Math.min(this.sweptVolumeRangeML[0], this.volumeML);
      this.sweptVolumeRangeML[1] = Math.max(this.sweptVolumeRangeML[1], this.volumeML);
    } else if (mode === 'charles') {
      // 等容过程：黄铜插销物理锁死活塞于 V₀ = 35.0 mL
      this.volumeML = REF_VOLUME_ML;
      this.temperatureK = clamp(this.temperatureK, CHARLES_MIN_TEMP_K, CHARLES_MAX_TEMP_K);
      this.pressureKPa = evaluateCharlesPressureKPa(this.temperatureK);
      this.sweptCharlesTempRangeK[0] = Math.min(this.sweptCharlesTempRangeK[0], this.temperatureK);
      this.sweptCharlesTempRangeK[1] = Math.max(this.sweptCharlesTempRangeK[1], this.temperatureK);
    } else {
      // 等压过程：维持 p₀ = 101.3 kPa，活塞随温度自由升降
      this.pressureKPa = REF_PRESSURE_KPA;
      this.temperatureK = clamp(this.temperatureK, GAY_LUSSAC_MIN_TEMP_K, GAY_LUSSAC_MAX_TEMP_K);
      this.volumeML = evaluateGayLussacVolumeML(this.temperatureK);
      this.sweptGayLussacTempRangeK[0] = Math.min(this.sweptGayLussacTempRangeK[0], this.temperatureK);
      this.sweptGayLussacTempRangeK[1] = Math.max(this.sweptGayLussacTempRangeK[1], this.temperatureK);
    }
  }

  /**
   * 点击 3D 黄铜定容锁止插销：
   * - 若当前未锁止（玻意耳或盖-吕萨克），点击后插入锁销切换至「查理定律（等容）」；
   * - 若当前已锁止（查理定律），点击后拔出锁销切换至「玻意耳定律（等温）」。
   */
  public togglePistonLockPin(): GasLawMode {
    if (this.mode === 'charles') {
      this.setMode('boyle');
    } else {
      this.setMode('charles');
    }
    return this.mode;
  }

  /**
   * 手动上下拖拽 3D 活塞 T 形手柄设置气体体积 V [mL]
   * 仅在玻意耳定律（等温过程）下允许直接手推拉活塞改变体积；
   * 若在等容或等压下误拖活塞手柄，仅在玻意耳模式下响应。
   */
  public setVolumeML(targetVolumeML: number): boolean {
    if (this.mode !== 'boyle') {
      return false;
    }
    const nextV = clamp(targetVolumeML, MIN_CYLINDER_VOLUME_ML, MAX_CYLINDER_VOLUME_ML);
    this.volumeML = nextV;
    this.temperatureK = REF_TEMPERATURE_K;
    this.pressureKPa = evaluateBoylePressureKPa(nextV);

    if (nextV < this.sweptVolumeRangeML[0]) this.sweptVolumeRangeML[0] = nextV;
    if (nextV > this.sweptVolumeRangeML[1]) this.sweptVolumeRangeML[1] = nextV;
    return true;
  }

  /**
   * 通过归一化活塞行程 [0, 1] 拖拽设置体积 V
   */
  public setPistonNormalized(norm: number): boolean {
    const clampedNorm = clamp(norm, 0, 1);
    const targetV =
      MIN_CYLINDER_VOLUME_ML +
      clampedNorm * (MAX_CYLINDER_VOLUME_ML - MIN_CYLINDER_VOLUME_ML);
    return this.setVolumeML(targetV);
  }

  /**
   * 手动拖拽底座 3D 黄铜滚花温控旋钮设置温度 T [K]
   * 在查理定律（等容）与盖-吕萨克定律（等压）下直接改变水浴与气体温度；
   * 在玻意耳定律（等温锁定 T₀=300K）下保持恒温锁死。
   */
  public setTemperatureK(targetTempK: number): boolean {
    if (this.mode === 'boyle') {
      return false;
    }

    if (this.mode === 'charles') {
      const nextT = clamp(targetTempK, CHARLES_MIN_TEMP_K, CHARLES_MAX_TEMP_K);
      this.temperatureK = nextT;
      this.volumeML = REF_VOLUME_ML;
      this.pressureKPa = evaluateCharlesPressureKPa(nextT);
      if (nextT < this.sweptCharlesTempRangeK[0]) this.sweptCharlesTempRangeK[0] = nextT;
      if (nextT > this.sweptCharlesTempRangeK[1]) this.sweptCharlesTempRangeK[1] = nextT;
      return true;
    }

    // gay-lussac
    const nextT = clamp(targetTempK, GAY_LUSSAC_MIN_TEMP_K, GAY_LUSSAC_MAX_TEMP_K);
    this.temperatureK = nextT;
    this.pressureKPa = REF_PRESSURE_KPA;
    this.volumeML = evaluateGayLussacVolumeML(nextT);
    if (nextT < this.sweptGayLussacTempRangeK[0]) this.sweptGayLussacTempRangeK[0] = nextT;
    if (nextT > this.sweptGayLussacTempRangeK[1]) this.sweptGayLussacTempRangeK[1] = nextT;
    return true;
  }

  /**
   * 通过归一化温控旋钮行程 [0, 1] 拖拽设置温度 T
   */
  public setTemperatureNormalized(norm: number): boolean {
    const clampedNorm = clamp(norm, 0, 1);
    if (this.mode === 'charles') {
      const targetT =
        CHARLES_MIN_TEMP_K + clampedNorm * (CHARLES_MAX_TEMP_K - CHARLES_MIN_TEMP_K);
      return this.setTemperatureK(targetT);
    }
    if (this.mode === 'gay-lussac') {
      const targetT =
        GAY_LUSSAC_MIN_TEMP_K +
        clampedNorm * (GAY_LUSSAC_MAX_TEMP_K - GAY_LUSSAC_MIN_TEMP_K);
      return this.setTemperatureK(targetT);
    }
    return false;
  }

  /**
   * 步进函数（纯手动拖拽操控模式下保持状态稳定，不执行自动扫描）
   */
  public step(_dt: number): void {
    // 状态完全由用户手动 3D 拖拽活塞或温控旋钮驱动
  }

  /**
   * 重置当前及所有模式的探索轨迹与基准状态
   */
  public reset(): void {
    this.mode = 'boyle';
    this.pressureKPa = REF_PRESSURE_KPA;
    this.volumeML = REF_VOLUME_ML;
    this.temperatureK = REF_TEMPERATURE_K;
    this.sweptVolumeRangeML = [REF_VOLUME_ML, REF_VOLUME_ML];
    this.sweptCharlesTempRangeK = [REF_TEMPERATURE_K, REF_TEMPERATURE_K];
    this.sweptGayLussacTempRangeK = [REF_TEMPERATURE_K, REF_TEMPERATURE_K];
  }

  /**
   * 获取当前完整遥测快照，驱动 3D 机械装置与右侧数据采集终端
   */
  public getTelemetry(): GasLawsTelemetry {
    const pistonNormalized = clamp(
      (this.volumeML - MIN_CYLINDER_VOLUME_ML) /
        (MAX_CYLINDER_VOLUME_ML - MIN_CYLINDER_VOLUME_ML),
      0,
      1
    );

    let tempMin = CHARLES_MIN_TEMP_K;
    let tempMax = CHARLES_MAX_TEMP_K;
    if (this.mode === 'gay-lussac') {
      tempMin = GAY_LUSSAC_MIN_TEMP_K;
      tempMax = GAY_LUSSAC_MAX_TEMP_K;
    }
    const tempNormalized = clamp(
      (this.temperatureK - tempMin) / (tempMax - tempMin),
      0,
      1
    );

    // 旋钮旋转角度 [-135°, +135°]
    const knobAngleRad = (tempNormalized - 0.5) * 1.5 * Math.PI;
    const gaugeNormalized = clamp(this.pressureKPa / 220.0, 0, 1);

    const molecularSpeedFactor = Math.sqrt(Math.max(0.2, this.temperatureK / REF_TEMPERATURE_K));
    const molecularDensityFactor = REF_VOLUME_ML / Math.max(10.0, this.volumeML);

    let invariantExpression = 'p · V = C₁';
    let invariantValue = this.pressureKPa * this.volumeML;
    let invariantUnit = 'kPa·mL';

    if (this.mode === 'charles') {
      invariantExpression = 'p / T = C₂';
      invariantValue = this.pressureKPa / this.temperatureK;
      invariantUnit = 'kPa/K';
    } else if (this.mode === 'gay-lussac') {
      invariantExpression = 'V / T = C₃';
      invariantValue = this.volumeML / this.temperatureK;
      invariantUnit = 'mL/K';
    }

    return {
      mode: this.mode,
      pressureKPa: this.pressureKPa,
      volumeML: this.volumeML,
      temperatureK: this.temperatureK,
      temperatureC: this.temperatureK + ABSOLUTE_ZERO_CELSIUS,
      pistonLocked: this.mode === 'charles',
      pistonNormalized,
      tempNormalized,
      knobAngleRad,
      gaugeNormalized,
      molecularSpeedFactor,
      molecularDensityFactor,
      invariantExpression,
      invariantValue,
      invariantUnit,
      sweptVolumeRangeML: [this.sweptVolumeRangeML[0], this.sweptVolumeRangeML[1]],
      sweptCharlesTempRangeK: [
        this.sweptCharlesTempRangeK[0],
        this.sweptCharlesTempRangeK[1],
      ],
      sweptGayLussacTempRangeK: [
        this.sweptGayLussacTempRangeK[0],
        this.sweptGayLussacTempRangeK[1],
      ],
    };
  }
}
