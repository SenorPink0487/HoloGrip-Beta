/**
 * 焦耳热功当量与做功-传热等效实验 —— 物理动力学与热力学第一定律求解器
 * (Joule's Mechanical & Electrical Equivalent of Heat Physics Solver)
 *
 * 核心物理规律：
 * 1. 机械做功 (重锤下落驱动叶轮湍流剪切摩擦生热)：
 *    - 双侧对称重锤总质量 2m，下落高度 Δh：
 *      ΔW_mech = 2 * m * g * Δh * η_baffle
 *    - 定子阻流隔板啮合效应 (Stator Baffle Interlocking)：
 *      * 当定子阻流片啮合 (bafflesEngaged = true) 时，旋转叶轮与固定隔板交错剪切，
 *        99.5% 以上的机械功直接通过粘性湍流耗散转化为液体内能 ΔU；
 *      * 当定子阻流片抽离 (bafflesEngaged = false) 时，液体随叶轮发生整体刚体式旋转涡流，
 *        相当一部分机械能暂存为宏观旋涡动能 E_vortex = 1/2 I_fluid ω_vortex^2，
 *        重锤下落阻力减小、速度加快，而瞬时摩擦生热效率显著降低。
 *
 * 2. 电热做功 (焦耳定律康铜电热丝通电生热)：
 *    - 电功率 P_elec = I^2 * R
 *    - 累积电功 ΔW_elec = ∫ I^2 * R dt
 *
 * 3. 热力学第一定律与做功-传热等效性：
 *    - ΔU = W_mech + W_elec + Q_loss
 *    - 温度升高 ΔT = ΔU / (c_fluid * m_fluid + C_calorimeter)
 *    - 热功当量测定值：
 *      J_measured = W_total / Q_cal  (标准理论值 J_0 = 4.186 J/cal)
 */

export type JouleFluidType = 'water' | 'kerosene' | 'glycerin' | 'mercury';

export type JouleOperationMode =
  | 'free_explore'          // 自由三维交互 (直接拖拽重锤、摇动曲柄、拨动离合器与电热刀闸)
  | 'auto_mech_cycle'       // 自动重锤往复下落做功循环 (连续测定多组 (W, ΔT) 数据点)
  | 'elec_heating'          // 纯电热焦耳做功模式 (W_elec = I^2 R t)
  | 'equivalence_benchmark';// 机械功与电功等值对比实验 (先后输入相同功 W，验证 ΔT 完全相等)

export type JouleInsulationMode = 'ideal_adiabatic' | 'realistic_loss';

export interface JouleFluidSpec {
  id: JouleFluidType;
  name: string;
  formula: string;
  specificHeatJkgK: number; // 比热容 c [J/(kg·K)]
  densityKgM3: number;      // 密度 ρ [kg/m³]
  fluidMassKg: number;      // 量热器内盛装标准质量 m [kg]
  viscosityFactor: number;  // 相对粘滞阻尼系数 (影响重锤终端下落速度)
  colorHex: number;         // 液体光学色彩
  emissiveHex: number;      // 液体微光色泽
  opacity: number;          // 光学透明度
}

export const JOULE_FLUID_SPECS: Record<JouleFluidType, JouleFluidSpec> = {
  water: {
    id: 'water',
    name: '去离子纯水',
    formula: 'H₂O',
    specificHeatJkgK: 4186,
    densityKgM3: 1000,
    fluidMassKg: 0.080, // 80g 精密微量量热腔，保证单次重锤下落即可在贝克曼温度计上产生 ~0.42℃ 清晰温升
    viscosityFactor: 1.0,
    colorHex: 0x38bdf8,
    emissiveHex: 0x0284c7,
    opacity: 0.52,
  },
  kerosene: {
    id: 'kerosene',
    name: '精炼导热煤油',
    formula: 'C₁₂H₂₆',
    specificHeatJkgK: 2100,
    densityKgM3: 800,
    fluidMassKg: 0.080,
    viscosityFactor: 1.35,
    colorHex: 0xfbbf24,
    emissiveHex: 0xd97706,
    opacity: 0.58,
  },
  glycerin: {
    id: 'glycerin',
    name: '高粘度医用甘油',
    formula: 'C₃H₈O₃',
    specificHeatJkgK: 2430,
    densityKgM3: 1260,
    fluidMassKg: 0.080,
    viscosityFactor: 2.65,
    colorHex: 0x34d399,
    emissiveHex: 0x059669,
    opacity: 0.62,
  },
  mercury: {
    id: 'mercury',
    name: '高纯液态水银',
    formula: 'Hg',
    specificHeatJkgK: 140,
    densityKgM3: 13534,
    fluidMassKg: 0.400, // 水银密度高但比热容极小 (c=140)，400g 热容仅 56 J/K，温升极其显著
    viscosityFactor: 1.18,
    colorHex: 0xe2e8f0,
    emissiveHex: 0x64748b,
    opacity: 0.94,
  },
};

export const JOULE_FLUID_ORDER: JouleFluidType[] = ['water', 'kerosene', 'glycerin', 'mercury'];

export interface JouleDataSample {
  workTotalJ: number;
  deltaTC: number;
  heatCal: number;
  source: 'mechanical' | 'electrical' | 'mixed';
  fluidId: JouleFluidType;
}

export interface JouleTelemetry {
  // 环境与核心状态
  operationMode: JouleOperationMode;
  fluidType: JouleFluidType;
  fluidSpec: JouleFluidSpec;
  insulationMode: JouleInsulationMode;
  bafflesEngaged: boolean;

  // 重锤与机械运动状态
  weightMassKg: number;          // 单侧重锤质量 m (kg)，双锤总重 2m
  maxDropHeightM: number;        // 最大可提升高度 (1.20 m)
  weightHeightM: number;         // 当前重锤高度 h (0.00 ~ 1.20 m)
  normalizedHeight: number;      // 归一化高度 (0 ~ 1)
  weightVelocityMS: number;      // 重锤下落线速度 v (m/s, 向下为正)
  isDropping: boolean;           // 重锤是否正处于自由下落做功状态
  isHoisting: boolean;           // 是否正处于自动绞升复位状态
  isManualDraggingWeight: boolean;
  isManualCranking: boolean;
  dropCount: number;             // 累计完成下落次数 N

  // 叶轮与流体旋涡状态
  paddleAngleRad: number;        // 叶轮累积旋转角度 (rad)
  paddleOmegaRadS: number;       // 叶轮旋转角速度 ω_paddle (rad/s)
  fluidVortexOmegaRadS: number;  // 液体宏观旋涡角速度 ω_vortex (rad/s)
  turbulentShearIntensity: number; // 湍流剪切强度 (0 ~ 1)
  vortexKineticEnergyJ: number;  // 宏观旋涡暂存动能 (J)

  // 焦耳电热模块状态
  heaterActive: boolean;         // 电热刀闸是否闭合通电
  currentAmp: number;            // 电流强度 I (A, 0.5 ~ 6.0 A)
  coilResistanceOhm: number;     // 康铜加热线圈电阻 R (5.0 Ω)
  electricalPowerW: number;      // 实时电热功率 P = I^2 R (W)
  heaterGlowIntensity: number;   // 电热丝炽热发光强度 (0 ~ 1)

  // 能量与热力学读数
  ambientTempC: number;          // 初始环境基准温度 T_0 (20.000 ℃)
  temperatureC: number;          // 当前量热器液体精确温度 T (℃)
  temperatureK: number;          // 当前绝对温度 (K)
  deltaTC: number;               // 累积温升 ΔT = T - T_0 (℃)
  mechanicalWorkJ: number;       // 累积机械功 W_mech (J)
  electricalWorkJ: number;       // 累积电热功 W_elec (J)
  heatLossJ: number;             // 散失热量 Q_loss (J, <= 0)
  internalEnergyDeltaUJ: number; // 液体内能增量 ΔU (J)
  equivalentHeatCal: number;     // 等效热量 Q (cal)
  measuredJouleEquivalent: number; // 实测热功当量 J = W_total / Q_cal (J/cal)
  potentialEnergyJ: number;      // 当前悬挂重锤重力势能 E_p = 2 m g h (J)
  molecularRmsSpeedMS: number;   // 分子热运动方均根速率相对指示 (m/s)

  // 等效性对比实验阶段与采样曲线
  benchmarkStage: 'idle' | 'mech_phase' | 'elec_phase' | 'complete';
  benchmarkMechDeltaT: number;
  benchmarkElecDeltaT: number;
  samples: JouleDataSample[];
}

export class JouleDynamicsSolver {
  public static readonly GRAVITY = 9.80665;
  public static readonly STANDARD_JOULE_J_PER_CAL = 4.186;
  public static readonly MAX_HEIGHT_M = 1.20;
  public static readonly AMBIENT_TEMP_C = 20.0;
  public static readonly COIL_RESISTANCE_OHM = 5.0;

  // 实验配置参数
  public operationMode: JouleOperationMode = 'free_explore';
  public fluidType: JouleFluidType = 'water';
  public insulationMode: JouleInsulationMode = 'ideal_adiabatic';
  public bafflesEngaged = true;

  // 重锤与机械系统状态
  public weightMassKg = 6.0; // 单侧重锤 6.0 kg (双侧共 12.0 kg)
  public weightHeightM = 1.20; // 初始位于顶部 H = 1.20 m 待释放位置
  public weightVelocityMS = 0.0;
  public isDropping = false;
  public isHoisting = false;
  public isManualDraggingWeight = false;
  public isManualCranking = false;
  public dropCount = 0;

  // 旋转与流体湍流状态
  public paddleAngleRad = 0.0;
  public paddleOmegaRadS = 0.0;
  public fluidVortexOmegaRadS = 0.0;
  public turbulentShearIntensity = 0.0;
  public vortexKineticEnergyJ = 0.0;

  // 焦耳电热系统状态
  public heaterActive = false;
  public currentAmp = 3.5; // 默认 3.5 A -> P = 3.5^2 * 5 = 61.25 W
  public heaterGlowIntensity = 0.0;

  // 能量与热力学累积状态
  public temperatureC = JouleDynamicsSolver.AMBIENT_TEMP_C;
  public mechanicalWorkJ = 0.0;
  public electricalWorkJ = 0.0;
  public heatLossJ = 0.0;
  public internalEnergyDeltaUJ = 0.0;

  // 自动循环与等效对比状态
  private hoistPauseTimer = 0.0;
  public benchmarkStage: 'idle' | 'mech_phase' | 'elec_phase' | 'complete' = 'idle';
  public benchmarkMechDeltaT = 0.0;
  public benchmarkElecDeltaT = 0.0;
  private benchmarkTargetWorkJ = 141.22; // 对应 2 * 6kg * 9.80665 * 1.20m 的单次标准下落功

  // 采样数据点 (用于绘制 ΔT - W 线性回归曲线)
  public samples: JouleDataSample[] = [];
  private lastSampleWorkJ = 0.0;

  constructor() {
    this.reset();
  }

  /**
   * 获取当前工作液体物理属性
   */
  public getFluidSpec(): JouleFluidSpec {
    return JOULE_FLUID_SPECS[this.fluidType];
  }

  /**
   * 获取当前液体总热容 C = c * m (J/K)
   */
  public getHeatCapacityJK(): number {
    const spec = this.getFluidSpec();
    return spec.specificHeatJkgK * spec.fluidMassKg;
  }

  /**
   * 释放棘轮离合器，启动重锤重力下落做功
   */
  public releaseClutchDrop(): void {
    if (this.isManualDraggingWeight || this.isManualCranking) return;
    if (this.weightHeightM <= 0.02) {
      // 若重锤已在底部，先快速摇升至顶部再释放下落
      this.isHoisting = true;
      this.isDropping = false;
      this.weightVelocityMS = 0;
    } else {
      this.isDropping = true;
      this.isHoisting = false;
    }
  }

  /**
   * 绞盘摇升重锤至顶部 (不计入叶轮搅拌生热，因棘轮单向离合器脱开叶轮)
   */
  public hoistWeightsToTop(): void {
    this.isDropping = false;
    this.isHoisting = true;
    this.weightVelocityMS = 0;
  }

  /**
   * 切换定子阻流隔板啮合状态 (Stator Baffles)
   */
  public toggleBaffles(): boolean {
    this.bafflesEngaged = !this.bafflesEngaged;
    return this.bafflesEngaged;
  }

  /**
   * 切换电热刀闸开关
   */
  public toggleHeater(): boolean {
    this.heaterActive = !this.heaterActive;
    return this.heaterActive;
  }

  /**
   * 循环切换工作液体 (水 -> 煤油 -> 甘油 -> 水银)
   */
  public cycleFluidType(): JouleFluidType {
    const idx = JOULE_FLUID_ORDER.indexOf(this.fluidType);
    const nextIdx = (idx + 1) % JOULE_FLUID_ORDER.length;
    this.setFluidType(JOULE_FLUID_ORDER[nextIdx]);
    return this.fluidType;
  }

  /**
   * 设置工作液体并重置量热器初始热平衡
   */
  public setFluidType(type: JouleFluidType): void {
    if (!JOULE_FLUID_SPECS[type]) return;
    this.fluidType = type;
    this.resetThermalStateOnly();
  }

  /**
   * 设置实验操作模式
   */
  public setOperationMode(mode: JouleOperationMode): void {
    this.operationMode = mode;
    this.isManualDraggingWeight = false;
    this.isManualCranking = false;

    if (mode === 'auto_mech_cycle') {
      this.heaterActive = false;
      this.benchmarkStage = 'idle';
      if (this.weightHeightM <= 0.05) {
        this.isHoisting = true;
        this.isDropping = false;
      } else {
        this.isDropping = true;
        this.isHoisting = false;
      }
    } else if (mode === 'elec_heating') {
      this.isDropping = false;
      this.isHoisting = false;
      this.heaterActive = true;
      this.benchmarkStage = 'idle';
    } else if (mode === 'equivalence_benchmark') {
      this.startEquivalenceBenchmark();
    } else {
      this.benchmarkStage = 'idle';
    }
  }

  /**
   * 启动“机械功 vs 电功”等值做功等效对比实验
   */
  public startEquivalenceBenchmark(): void {
    this.reset();
    this.operationMode = 'equivalence_benchmark';
    this.bafflesEngaged = true;
    this.insulationMode = 'ideal_adiabatic';
    this.weightHeightM = JouleDynamicsSolver.MAX_HEIGHT_M;
    this.benchmarkTargetWorkJ =
      2.0 * this.weightMassKg * JouleDynamicsSolver.GRAVITY * JouleDynamicsSolver.MAX_HEIGHT_M;
    this.benchmarkStage = 'mech_phase';
    this.benchmarkMechDeltaT = 0.0;
    this.benchmarkElecDeltaT = 0.0;
    this.heaterActive = false;
    this.isDropping = true;
  }

  /**
   * 手动拖拽重锤升降 (Direct 3D Weight Dragging)
   * - 向上拖拽：绞盘单向棘轮脱开叶轮，将重锤提升储备重力势能 E_p = 2mgh；
   * - 向下拖拽：强制拉动卷筒旋转叶轮对液体做机械功！
   */
  public updateManualWeightDrag(targetHeightM: number, dt: number): void {
    const clampedH = Math.max(0.0, Math.min(JouleDynamicsSolver.MAX_HEIGHT_M, targetHeightM));
    const dh = clampedH - this.weightHeightM;
    const safeDt = Math.max(0.001, dt);

    this.isManualDraggingWeight = true;
    this.isDropping = false;
    this.isHoisting = false;

    if (dh < -1e-5) {
      // 向下拉动重锤：驱动叶轮旋转并对液体做功
      const dropDist = -dh;
      this.weightVelocityMS = dropDist / safeDt;
      const dW = 2.0 * this.weightMassKg * JouleDynamicsSolver.GRAVITY * dropDist;
      this.applyMechanicalWorkIncrement(dW, dropDist, safeDt);
    } else {
      // 向上提起重锤：棘轮离合器脱开，仅提升势能
      this.weightVelocityMS = dh / safeDt;
    }

    this.weightHeightM = clampedH;
  }

  /**
   * 结束手动拖拽重锤：若重锤处于高位且在自由探索模式下松手，自动释放下落做功！
   */
  public endManualWeightDrag(autoDropOnRelease = true): void {
    if (!this.isManualDraggingWeight) return;
    this.isManualDraggingWeight = false;
    this.weightVelocityMS = 0.0;
    if (autoDropOnRelease && this.weightHeightM > 0.08) {
      this.isDropping = true;
    }
  }

  /**
   * 手动摇动顶部曲柄手柄 (Direct 3D Hand-Crank Manipulation)
   * - 当重锤未达顶部且向上摇动时，可提升重锤；
   * - 同时手摇曲柄直接旋转叶轮对量热器内液体做剪切机械功！
   */
  public updateManualCrank(deltaAngleRad: number, dt: number): void {
    const safeDt = Math.max(0.001, dt);
    this.isManualCranking = true;
    this.isDropping = false;
    this.isHoisting = false;

    const absAngle = Math.abs(deltaAngleRad);
    if (absAngle < 1e-5) return;

    // 卷筒半径 R_drum = 0.024 m
    const drumRadius = 0.024;
    if (deltaAngleRad > 0 && this.weightHeightM < JouleDynamicsSolver.MAX_HEIGHT_M) {
      // 正向摇动绞盘：优先将重锤向上卷起提升高度
      const dH = Math.min(
        JouleDynamicsSolver.MAX_HEIGHT_M - this.weightHeightM,
        deltaAngleRad * drumRadius * 2.5
      );
      this.weightHeightM += dH;
      this.weightVelocityMS = -dH / safeDt;
      this.paddleAngleRad += deltaAngleRad * 0.25;
    } else {
      // 直接手摇驱动叶轮搅拌做功
      const omega = absAngle / safeDt;
      this.paddleOmegaRadS = Math.min(45.0, omega * 3.5);
      this.paddleAngleRad += deltaAngleRad * 3.5;
      const spec = this.getFluidSpec();
      const torque = (this.bafflesEngaged ? 0.65 : 0.18) * spec.viscosityFactor;
      const dW = torque * absAngle * 8.0;
      this.applyMechanicalWorkIncrement(dW, absAngle * drumRadius, safeDt);
    }
  }

  public endManualCrank(): void {
    this.isManualCranking = false;
  }

  /**
   * 将机械功增量分配至湍流剪切内能与宏观旋涡动能
   */
  private applyMechanicalWorkIncrement(dW: number, dropDistM: number, dt: number): void {
    if (dW <= 0) return;
    this.mechanicalWorkJ += dW;

    // 卷筒等效半径 r_eff = 0.022 m -> 旋转角增量 dθ = dropDist / r_eff
    const dTheta = dropDistM / 0.022;
    this.paddleAngleRad += dTheta;
    this.paddleOmegaRadS = dTheta / Math.max(0.001, dt);

    if (this.bafflesEngaged) {
      // 定子阻流片啮合：强烈湍流剪切，机械功 100% 转化为流体热力学内能
      this.internalEnergyDeltaUJ += dW;
      this.fluidVortexOmegaRadS = this.paddleOmegaRadS * 0.08;
      this.turbulentShearIntensity = Math.min(1.0, this.paddleOmegaRadS / 18.0);
    } else {
      // 定子阻流片抽离：液体整体旋转，仅 32% 即时摩擦生热，68% 转化为宏观涡旋动能
      const immediateHeatFraction = 0.32;
      const vortexFraction = 1.0 - immediateHeatFraction;
      this.internalEnergyDeltaUJ += dW * immediateHeatFraction;
      this.vortexKineticEnergyJ += dW * vortexFraction;
      this.fluidVortexOmegaRadS = Math.min(
        this.paddleOmegaRadS * 0.85,
        this.fluidVortexOmegaRadS + (dTheta / Math.max(0.001, dt)) * 0.45
      );
      this.turbulentShearIntensity = Math.min(0.45, (this.paddleOmegaRadS * 0.25) / 18.0);
    }

    this.syncTemperatureFromInternalEnergy();
    this.checkAndRecordSample('mechanical');
  }

  /**
   * 主物理时间步进积分 (60~120 Hz)
   */
  public update(delta: number): void {
    const dt = Math.min(0.05, Math.max(0.0, delta));
    if (dt <= 0) return;

    const spec = this.getFluidSpec();

    // 1. 处理自动绞升复位过程 (Hoisting)
    if (this.isHoisting && !this.isManualDraggingWeight && !this.isManualCranking) {
      const hoistSpeed = 0.85; // 0.85 m/s 快速平稳绞升
      this.weightVelocityMS = -hoistSpeed;
      this.weightHeightM += hoistSpeed * dt;
      if (this.weightHeightM >= JouleDynamicsSolver.MAX_HEIGHT_M) {
        this.weightHeightM = JouleDynamicsSolver.MAX_HEIGHT_M;
        this.weightVelocityMS = 0.0;
        this.isHoisting = false;
        if (this.operationMode === 'auto_mech_cycle') {
          this.hoistPauseTimer = 0.35; // 到达上死点短暂驻留 0.35s 后自动释放
        }
      }
    } else if (this.hoistPauseTimer > 0) {
      this.hoistPauseTimer -= dt;
      if (this.hoistPauseTimer <= 0 && this.operationMode === 'auto_mech_cycle') {
        this.isDropping = true;
      }
    }

    // 2. 处理重锤重力下落驱动叶轮搅拌做功过程 (Gravity Drop)
    if (this.isDropping && !this.isManualDraggingWeight && !this.isManualCranking) {
      // 终端下落速度受液体粘滞系数与定子阻流片啮合状态共同决定：
      // 阻流片啮合时湍流阻力大，重锤以约 0.42 m/s 匀速平稳下落；
      // 阻流片抽离时液体随转，阻力小，重锤加速至约 0.78 m/s 下落。
      const baffleDragFactor = this.bafflesEngaged ? 1.0 : 0.52;
      const terminalVel = 0.46 / (Math.pow(spec.viscosityFactor, 0.38) * baffleDragFactor);
      const accel = 3.8;
      this.weightVelocityMS = Math.min(terminalVel, this.weightVelocityMS + accel * dt);

      const dropStep = Math.min(this.weightHeightM, this.weightVelocityMS * dt);
      if (dropStep > 0) {
        this.weightHeightM -= dropStep;
        const dW = 2.0 * this.weightMassKg * JouleDynamicsSolver.GRAVITY * dropStep;
        this.applyMechanicalWorkIncrement(dW, dropStep, dt);
      }

      // 到达下止点 (h = 0)
      if (this.weightHeightM <= 1e-4) {
        this.weightHeightM = 0.0;
        this.weightVelocityMS = 0.0;
        this.isDropping = false;
        this.dropCount += 1;
        this.recordDropSample('mechanical');

        if (this.operationMode === 'auto_mech_cycle') {
          this.isHoisting = true;
        } else if (
          this.operationMode === 'equivalence_benchmark' &&
          this.benchmarkStage === 'mech_phase'
        ) {
          // 机械做功阶段完成，记录机械温升，切换至等量电热做功阶段
          this.benchmarkMechDeltaT = this.temperatureC - JouleDynamicsSolver.AMBIENT_TEMP_C;
          this.benchmarkStage = 'elec_phase';
          this.heaterActive = true;
        }
      }
    } else if (!this.isManualDraggingWeight && !this.isManualCranking) {
      // 叶轮旋转阻尼衰减
      const paddleDamping = this.bafflesEngaged ? 8.5 : 2.8;
      this.paddleOmegaRadS *= Math.exp(-paddleDamping * dt);
      if (this.paddleOmegaRadS < 0.02) this.paddleOmegaRadS = 0.0;
      this.paddleAngleRad += this.paddleOmegaRadS * dt;
      this.turbulentShearIntensity *= Math.exp(-6.0 * dt);
    }

    // 3. 宏观旋涡动能缓慢粘滞耗散 (当定子阻流片未啮合时，涡流缓慢衰减并滞后转化为少许热量)
    if (this.vortexKineticEnergyJ > 1e-4 || this.fluidVortexOmegaRadS > 1e-3) {
      const vortexDecayRate = this.bafflesEngaged ? 4.5 : 0.65;
      const decayFraction = 1.0 - Math.exp(-vortexDecayRate * dt);
      const dissipatedJ = this.vortexKineticEnergyJ * decayFraction;
      this.vortexKineticEnergyJ -= dissipatedJ;
      // 未啮合阻流片时，部分涡流能量在液面晃动与轴封处损失，仅 55% 缓慢回收为内能
      this.internalEnergyDeltaUJ += dissipatedJ * (this.bafflesEngaged ? 0.95 : 0.55);
      this.fluidVortexOmegaRadS *= Math.exp(-vortexDecayRate * dt);
      this.syncTemperatureFromInternalEnergy();
    }

    // 4. 处理焦耳电热做功过程 (W_elec = I^2 * R * dt)
    if (this.heaterActive) {
      const powerW =
        this.currentAmp * this.currentAmp * JouleDynamicsSolver.COIL_RESISTANCE_OHM;
      let dWelec = powerW * dt;

      // 若处于等效对比实验的电热阶段，精确截止在相同目标功
      if (
        this.operationMode === 'equivalence_benchmark' &&
        this.benchmarkStage === 'elec_phase'
      ) {
        const remainingJ = Math.max(0.0, this.benchmarkTargetWorkJ - this.electricalWorkJ);
        if (dWelec >= remainingJ) {
          dWelec = remainingJ;
          this.heaterActive = false;
          this.benchmarkStage = 'complete';
        }
      }

      if (dWelec > 0) {
        this.electricalWorkJ += dWelec;
        this.internalEnergyDeltaUJ += dWelec;
        this.syncTemperatureFromInternalEnergy();
        this.checkAndRecordSample('electrical');
      }

      if (this.benchmarkStage === 'complete' && this.benchmarkElecDeltaT === 0) {
        this.benchmarkElecDeltaT =
          this.temperatureC - JouleDynamicsSolver.AMBIENT_TEMP_C - this.benchmarkMechDeltaT;
        this.recordDropSample('electrical');
      }

      // 电热丝炽热发光强度平滑过渡
      const targetGlow = Math.min(1.0, (this.currentAmp / 5.0) * 0.9 + 0.1);
      this.heaterGlowIntensity += (targetGlow - this.heaterGlowIntensity) * Math.min(1.0, dt * 8.0);
    } else {
      this.heaterGlowIntensity *= Math.exp(-5.0 * dt);
      if (this.heaterGlowIntensity < 0.005) this.heaterGlowIntensity = 0.0;
    }

    // 5. 处理非理想绝热模式下的牛顿冷却散热损失 (Q_loss = -k * (T - T_env) * dt)
    if (this.insulationMode === 'realistic_loss') {
      const deltaT = this.temperatureC - JouleDynamicsSolver.AMBIENT_TEMP_C;
      if (deltaT > 1e-4) {
        const lossPowerW = 2.4 * deltaT; // 散热传导系数 2.4 W/K
        const dQ = Math.min(this.internalEnergyDeltaUJ, lossPowerW * dt);
        this.heatLossJ -= dQ;
        this.internalEnergyDeltaUJ = Math.max(0.0, this.internalEnergyDeltaUJ - dQ);
        this.syncTemperatureFromInternalEnergy();
      }
    }
  }

  /**
   * 根据液体内能增量 ΔU 同步计算当前温度 T = T_0 + ΔU / (c * m)
   */
  private syncTemperatureFromInternalEnergy(): void {
    const heatCap = this.getHeatCapacityJK();
    const dT = this.internalEnergyDeltaUJ / Math.max(1e-3, heatCap);
    this.temperatureC = JouleDynamicsSolver.AMBIENT_TEMP_C + dT;
  }

  /**
   * 满一定做功增量时自动记录实验数据点
   */
  private checkAndRecordSample(source: 'mechanical' | 'electrical'): void {
    const totalW = this.mechanicalWorkJ + this.electricalWorkJ;
    if (totalW - this.lastSampleWorkJ >= 45.0) {
      this.recordDropSample(source);
    }
  }

  /**
   * 记录单个 (W, ΔT, Q_cal) 实验采样点
   */
  private recordDropSample(source: 'mechanical' | 'electrical' | 'mixed'): void {
    const totalW = this.mechanicalWorkJ + this.electricalWorkJ;
    if (totalW <= 1.0) return;
    this.lastSampleWorkJ = totalW;

    const deltaTC = this.temperatureC - JouleDynamicsSolver.AMBIENT_TEMP_C;
    const heatCal = this.internalEnergyDeltaUJ / JouleDynamicsSolver.STANDARD_JOULE_J_PER_CAL;

    this.samples.push({
      workTotalJ: totalW,
      deltaTC,
      heatCal,
      source: this.mechanicalWorkJ > 0 && this.electricalWorkJ > 0 ? 'mixed' : source,
      fluidId: this.fluidType,
    });

    if (this.samples.length > 24) {
      this.samples.shift();
    }
  }

  /**
   * 仅重置热力学统计量与温度计读数（切换液体时调用）
   */
  public resetThermalStateOnly(): void {
    this.temperatureC = JouleDynamicsSolver.AMBIENT_TEMP_C;
    this.mechanicalWorkJ = 0.0;
    this.electricalWorkJ = 0.0;
    this.heatLossJ = 0.0;
    this.internalEnergyDeltaUJ = 0.0;
    this.vortexKineticEnergyJ = 0.0;
    this.fluidVortexOmegaRadS = 0.0;
    this.turbulentShearIntensity = 0.0;
    this.dropCount = 0;
    this.lastSampleWorkJ = 0.0;
    this.samples = [];
    this.benchmarkStage = 'idle';
    this.benchmarkMechDeltaT = 0.0;
    this.benchmarkElecDeltaT = 0.0;
  }

  /**
   * 完全复位焦耳实验仪
   */
  public reset(): void {
    this.resetThermalStateOnly();
    this.bafflesEngaged = true;
    this.weightHeightM = JouleDynamicsSolver.MAX_HEIGHT_M;
    this.weightVelocityMS = 0.0;
    this.isDropping = false;
    this.isHoisting = false;
    this.isManualDraggingWeight = false;
    this.isManualCranking = false;
    this.paddleOmegaRadS = 0.0;
    this.heaterActive = false;
    this.heaterGlowIntensity = 0.0;
    this.hoistPauseTimer = 0.0;
  }

  /**
   * 输出完整实时物理遥测数据包
   */
  public getTelemetry(): JouleTelemetry {
    const spec = this.getFluidSpec();
    const deltaTC = this.temperatureC - JouleDynamicsSolver.AMBIENT_TEMP_C;
    const temperatureK = this.temperatureC + 273.15;
    const totalWorkJ = this.mechanicalWorkJ + this.electricalWorkJ;
    const equivalentHeatCal =
      this.internalEnergyDeltaUJ / JouleDynamicsSolver.STANDARD_JOULE_J_PER_CAL;

    // 实测热功当量 J = W_total / Q_cal
    // 在理想绝热且阻流片啮合时 J = 4.186 J/cal；
    // 若存在热耗散或未啮合阻流片导致涡流动能未完全耗散，则表观需要更多机械功才能产生 1 cal 温升 (J_app > 4.186)
    let measuredJ = JouleDynamicsSolver.STANDARD_JOULE_J_PER_CAL;
    if (equivalentHeatCal > 0.05 && totalWorkJ > 0.2) {
      measuredJ = totalWorkJ / equivalentHeatCal;
    }

    const potentialEnergyJ =
      2.0 * this.weightMassKg * JouleDynamicsSolver.GRAVITY * this.weightHeightM;
    const electricalPowerW = this.heaterActive
      ? this.currentAmp * this.currentAmp * JouleDynamicsSolver.COIL_RESISTANCE_OHM
      : 0.0;

    // 水分子在温度 T 下的热运动方均根速率 v_rms = sqrt(3 R T / M)
    const molarMassKg =
      this.fluidType === 'water'
        ? 0.018015
        : this.fluidType === 'kerosene'
        ? 0.170
        : this.fluidType === 'glycerin'
        ? 0.09209
        : 0.20059;
    const molecularRmsSpeedMS = Math.sqrt((3.0 * 8.31446 * temperatureK) / molarMassKg);

    return {
      operationMode: this.operationMode,
      fluidType: this.fluidType,
      fluidSpec: spec,
      insulationMode: this.insulationMode,
      bafflesEngaged: this.bafflesEngaged,

      weightMassKg: this.weightMassKg,
      maxDropHeightM: JouleDynamicsSolver.MAX_HEIGHT_M,
      weightHeightM: this.weightHeightM,
      normalizedHeight: this.weightHeightM / JouleDynamicsSolver.MAX_HEIGHT_M,
      weightVelocityMS: this.weightVelocityMS,
      isDropping: this.isDropping,
      isHoisting: this.isHoisting,
      isManualDraggingWeight: this.isManualDraggingWeight,
      isManualCranking: this.isManualCranking,
      dropCount: this.dropCount,

      paddleAngleRad: this.paddleAngleRad,
      paddleOmegaRadS: this.paddleOmegaRadS,
      fluidVortexOmegaRadS: this.fluidVortexOmegaRadS,
      turbulentShearIntensity: this.turbulentShearIntensity,
      vortexKineticEnergyJ: this.vortexKineticEnergyJ,

      heaterActive: this.heaterActive,
      currentAmp: this.currentAmp,
      coilResistanceOhm: JouleDynamicsSolver.COIL_RESISTANCE_OHM,
      electricalPowerW,
      heaterGlowIntensity: this.heaterGlowIntensity,

      ambientTempC: JouleDynamicsSolver.AMBIENT_TEMP_C,
      temperatureC: this.temperatureC,
      temperatureK,
      deltaTC,
      mechanicalWorkJ: this.mechanicalWorkJ,
      electricalWorkJ: this.electricalWorkJ,
      heatLossJ: this.heatLossJ,
      internalEnergyDeltaUJ: this.internalEnergyDeltaUJ,
      equivalentHeatCal,
      measuredJouleEquivalent: measuredJ,
      potentialEnergyJ,
      molecularRmsSpeedMS,

      benchmarkStage: this.benchmarkStage,
      benchmarkMechDeltaT: this.benchmarkMechDeltaT,
      benchmarkElecDeltaT: this.benchmarkElecDeltaT,
      samples: this.samples,
    };
  }
}
