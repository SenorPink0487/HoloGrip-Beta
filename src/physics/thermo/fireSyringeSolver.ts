/**
 * 空气压缩引火仪 (Fire Syringe / Adiabatic Air Compression Igniter)
 * 绝热压缩热力学、活塞气垫回弹动力学与引火棉燃爆状态机求解器
 *
 * 核心物理方程：
 * 1. 热力学第一定律：dU = δW + δQ
 *    - 快速下压时近似绝热过程 (δQ ≈ 0)，外界对气体做正功 (W > 0)，内能急剧增加 (ΔU > 0)，温度飙升：
 *      T2 = T1 * (V1 / V2)^(γ - 1),  P2 = P1 * (V1 / V2)^γ
 *    - 缓慢下压时存在气缸壁导热散失 δQ = -h_loss * (T - T_env) dt，热量散失导致温度无法达到火绒燃点。
 * 2. 引火棉（硝化棉/干燥火绒）燃点判定：
 *    - 当缸内压缩空气温度 T >= T_ignition (260 °C) 且火绒处于待燃状态时，触发瞬间爆燃发光！
 * 3. 高压气垫弹性回弹动力学：
 *    - 松开手柄后，缸内高压气体 (P >> P0) 对活塞产生向上推力，结合密封圈阻尼形成真实的气垫微回弹振荡。
 */

export const KELVIN_OFFSET = 273.15;
export const ADIABATIC_GAMMA = 1.4; // 双原子理想气体（干燥空气）绝热指数 γ = Cp / Cv = 1.4
export const AMBIENT_TEMP_C = 20.0; // 实验室环境温度 (°C)
export const AMBIENT_TEMP_K = AMBIENT_TEMP_C + KELVIN_OFFSET; // 293.15 K
export const AMBIENT_PRESSURE_MPA = 0.101325; // 标准大气压 (MPa)
export const TINDER_IGNITION_TEMP_C = 260.0; // 引火棉（火绒）着火点温度 (°C)

// 气缸几何容积参数 (mL / cm³)
export const MAX_VOLUME_ML = 36.0; // 活塞位于顶部 (stroke = 0) 时的气缸总容积
export const MIN_CLEARANCE_VOLUME_ML = 2.25; // 活塞压至最底部 (stroke = 1) 时底部燃烧室余隙容积 (最大压缩比 16:1)

export type TinderState = 'fresh' | 'igniting' | 'ember' | 'charred';

export type CompressionActionMode =
  | 'idle'
  | 'dragging'
  | 'slamming'
  | 'slow_pressing'
  | 'rebounding'
  | 'resetting';

export interface FireSyringeTelemetry {
  /** 归一化活塞下压行程 s ∈ [0, 1] (0 = 顶部初始位, 1 = 底部极限压缩位) */
  stroke: number;
  /** 活塞瞬时运动速度 ds/dt (1/s，正值为向下压缩，负值为向上提拉/回弹) */
  pistonVelocity: number;
  /** 气缸内当前气体体积 V (mL) */
  volumeML: number;
  /** 当前压缩比 V_max / V */
  compressionRatio: number;
  /** 气缸内气体摄氏温度 T (°C) */
  temperatureC: number;
  /** 气缸内气体绝对温度 T (K) */
  temperatureK: number;
  /** 气缸内气体绝对压强 P (MPa) */
  pressureMPa: number;
  /** 本次按压过程累计外界对气体做功 W (J) */
  workDoneJ: number;
  /** 气体内能增量 ΔU (J) */
  internalEnergyDeltaJ: number;
  /** 本次按压峰值温度 (°C) */
  peakTemperatureC: number;
  /** 引火棉当前状态 */
  tinderState: TinderState;
  /** 当前操作/动画阶段 */
  actionMode: CompressionActionMode;
  /** 火焰强度 (0 ~ 1)，用于驱动 3D 多层火焰网格、点光源与火星粒子 */
  flameIntensity: number;
  /** 爆燃瞬间闪光脉冲强度 (0 ~ 1)，用于驱动引火瞬间的高亮冲击波与热辐射闪光 */
  flashIntensity: number;
  /** 余烬暗红发光强度 (0 ~ 1) */
  emberIntensity: number;
  /** 燃烧室青烟浓度 (0 ~ 1) */
  smokeIntensity: number;
  /** 绝热压缩热浪光晕强度 (0 ~ 1) */
  thermalGlowIntensity: number;
  /** 下压冲击波环强度 (0 ~ 1) */
  compressionWaveIntensity: number;
  /** 空气分子热运动速率倍率 (1.0 ~ 4.5) */
  moleculeSpeedMultiplier: number;
  /** 火绒碳化程度 (0 = 洁白蓬松新火绒, 1 = 焦黑碳化) */
  charProgress: number;
  /** 是否刚刚发生慢压未燃提示态 */
  slowPressFailedIgnition: boolean;
}

export interface FireSyringeSolverOptions {
  ignitionTempC?: number;
  heatLossRate?: number;
}

export class FireSyringeSolver {
  public stroke = 0; // 0 (top) ~ 1 (bottom)
  public pistonVelocity = 0; // ds/dt (1/s)
  public temperatureK = AMBIENT_TEMP_K;
  public pressureMPa = AMBIENT_PRESSURE_MPA;
  public workDoneJ = 0;
  public peakTemperatureC = AMBIENT_TEMP_C;

  public tinderState: TinderState = 'fresh';
  public actionMode: CompressionActionMode = 'idle';
  public ignitionTempC: number;
  public heatLossRate: number;

  // 燃烧与动效计时器
  private burnElapsed = 0;
  private charProgress = 0;
  private smokeIntensity = 0;
  private compressionWaveIntensity = 0;
  private slowPressFailedIgnition = false;

  // 自动冲击/复位动画状态
  private slamTargetStroke = 0.96;
  private reboundEquilibriumStroke = 0.76;

  // 气体物质的量 n*R (J/K): P0 * V0 / T0
  // P0 = 0.101325 MPa = 101325 Pa, V0 = 36e-6 m³ => P0*V0 = 3.6477 J
  private readonly nR = (AMBIENT_PRESSURE_MPA * 1e6 * (MAX_VOLUME_ML * 1e-6)) / AMBIENT_TEMP_K;
  // 定容摩尔热容对应的 n*Cv = nR / (γ - 1)
  private readonly nCv =
    (AMBIENT_PRESSURE_MPA * 1e6 * (MAX_VOLUME_ML * 1e-6)) /
    (AMBIENT_TEMP_K * (ADIABATIC_GAMMA - 1));

  constructor(options: FireSyringeSolverOptions = {}) {
    this.ignitionTempC = options.ignitionTempC ?? TINDER_IGNITION_TEMP_C;
    this.heatLossRate = options.heatLossRate ?? 3.6; // 气缸壁热传导散热系数 (1/s)
  }

  /**
   * 由行程 s ∈ [0, 1] 计算当前气缸容积 (mL)
   */
  public static volumeFromStroke(stroke: number): number {
    const s = Math.max(0, Math.min(0.985, stroke));
    return MAX_VOLUME_ML - s * (MAX_VOLUME_ML - MIN_CLEARANCE_VOLUME_ML);
  }

  /**
   * 开始手动拖拽 T 形手柄
   */
  public beginDrag(): void {
    this.actionMode = 'dragging';
    this.pistonVelocity = 0;
    if (this.stroke < 0.15) {
      this.peakTemperatureC = this.temperatureC;
      this.workDoneJ = 0;
      this.slowPressFailedIgnition = false;
    }
  }

  /**
   * 拖拽过程中更新目标行程（通过微小步长积分热力学方程，忠实反映拖拽速度对升温的影响）
   */
  public dragToStroke(targetStroke: number, dt: number): void {
    const clampedTarget = Math.max(0, Math.min(0.965, targetStroke));
    const safeDt = Math.max(0.001, Math.min(0.1, dt));
    const prevStroke = this.stroke;
    const ds = clampedTarget - prevStroke;
    const instVel = ds / safeDt;

    // 平滑速度估计，兼顾灵敏度与抗抖动
    this.pistonVelocity = this.pistonVelocity * 0.35 + instVel * 0.65;
    this.actionMode = 'dragging';

    this.integrateThermodynamics(clampedTarget, safeDt);

    // 若用户将活塞拉回顶部附近 (stroke <= 0.12)，自动排空烟雾并换上洁白新火绒
    if (this.stroke <= 0.12 && prevStroke > 0.12) {
      this.refreshTinderOnTopReturn();
    }
  }

  /**
   * 结束手动拖拽：若处于高压缩区则触发真实的高压气垫微回弹
   */
  public endDrag(): void {
    if (this.stroke > 0.42) {
      // 检查是否刚刚完成了慢速下压但未能达到着火点
      if (
        this.stroke > 0.78 &&
        this.tinderState === 'fresh' &&
        this.peakTemperatureC < this.ignitionTempC
      ) {
        this.slowPressFailedIgnition = true;
      }
      this.startPneumaticRebound();
    } else if (this.stroke <= 0.12) {
      this.refreshTinderOnTopReturn();
      this.actionMode = 'idle';
      this.pistonVelocity = 0;
    } else {
      this.actionMode = 'idle';
      this.pistonVelocity = 0;
    }
  }

  /**
   * 触发一键快速猛压（绝热压缩引火演示）
   * 若当前手柄已在底部或火绒已燃尽，则先执行平滑上提复位再允许下压，或直接上提复原
   */
  public triggerQuickSlam(): void {
    if (this.stroke > 0.55 || this.tinderState !== 'fresh') {
      // 若当前处于压下状态或火绒已碳化，先确保火绒刷新并从顶部发起猛压
      this.stroke = 0;
      this.temperatureK = AMBIENT_TEMP_K;
      this.pressureMPa = AMBIENT_PRESSURE_MPA;
      this.tinderState = 'fresh';
      this.charProgress = 0;
      this.burnElapsed = 0;
      this.smokeIntensity = 0;
    }
    this.workDoneJ = 0;
    this.peakTemperatureC = AMBIENT_TEMP_C;
    this.slowPressFailedIgnition = false;
    this.actionMode = 'slamming';
    this.slamTargetStroke = 0.96;
    this.pistonVelocity = 2.8;
  }

  /**
   * 触发慢速下压对比实验（演示等温散失热量、无法点燃火绒）
   */
  public triggerSlowPress(): void {
    if (this.stroke > 0.35 || this.tinderState !== 'fresh') {
      this.stroke = 0;
      this.temperatureK = AMBIENT_TEMP_K;
      this.pressureMPa = AMBIENT_PRESSURE_MPA;
      this.tinderState = 'fresh';
      this.charProgress = 0;
      this.burnElapsed = 0;
      this.smokeIntensity = 0;
    }
    this.workDoneJ = 0;
    this.peakTemperatureC = AMBIENT_TEMP_C;
    this.slowPressFailedIgnition = false;
    this.actionMode = 'slow_pressing';
    this.pistonVelocity = 0.38;
  }

  /**
   * 触发平滑上提活塞并更换洁白新火绒
   */
  public triggerPullUpReset(): void {
    this.actionMode = 'resetting';
    this.slowPressFailedIgnition = false;
  }

  /**
   * 立即重置为标准初始状态
   */
  public reset(): void {
    this.stroke = 0;
    this.pistonVelocity = 0;
    this.temperatureK = AMBIENT_TEMP_K;
    this.pressureMPa = AMBIENT_PRESSURE_MPA;
    this.workDoneJ = 0;
    this.peakTemperatureC = AMBIENT_TEMP_C;
    this.tinderState = 'fresh';
    this.actionMode = 'idle';
    this.burnElapsed = 0;
    this.charProgress = 0;
    this.smokeIntensity = 0;
    this.compressionWaveIntensity = 0;
    this.slowPressFailedIgnition = false;
  }

  /**
   * 启动高压气垫微回弹过程
   */
  private startPneumaticRebound(): void {
    this.actionMode = 'rebounding';
    // 回弹平衡位置取决于当前压缩深度（模拟O型圈静摩擦与残余气压平衡）
    this.reboundEquilibriumStroke = Math.max(0.42, this.stroke - 0.18);
    // 初始向上气垫反冲速度
    const overPressure = Math.max(0, this.pressureMPa - AMBIENT_PRESSURE_MPA);
    this.pistonVelocity = -Math.min(2.6, 0.55 + overPressure * 0.45);
  }

  /**
   * 当手柄被拉回顶部时，排出废气并恢复洁白新火绒
   */
  private refreshTinderOnTopReturn(): void {
    if (this.tinderState !== 'fresh') {
      this.tinderState = 'fresh';
      this.burnElapsed = 0;
      this.charProgress = 0;
    }
    this.smokeIntensity *= 0.25;
    this.slowPressFailedIgnition = false;
  }

  /**
   * 步进求解热力学微分方程与燃烧状态机
   */
  public step(dt: number): void {
    if (dt <= 0) return;
    const clampedDt = Math.min(dt, 0.05);

    if (this.actionMode === 'slamming') {
      // 快速猛压：模拟人手全力向下猛击 T 形手柄的加速冲击过程 (~0.16s 到底)
      const accel = 36.0;
      this.pistonVelocity = Math.min(8.5, this.pistonVelocity + accel * clampedDt);
      const nextStroke = Math.min(this.slamTargetStroke, this.stroke + this.pistonVelocity * clampedDt);
      this.integrateThermodynamics(nextStroke, clampedDt);

      if (nextStroke >= this.slamTargetStroke - 1e-4) {
        this.stroke = this.slamTargetStroke;
        // 到达底部极限压缩点后立即触发高压气垫微回弹
        this.startPneumaticRebound();
      }
    } else if (this.actionMode === 'slow_pressing') {
      // 慢速下压对比模式：约 2.5 秒匀速缓压到底，热量经缸壁散失
      this.pistonVelocity = 0.36;
      const nextStroke = Math.min(0.92, this.stroke + this.pistonVelocity * clampedDt);
      this.integrateThermodynamics(nextStroke, clampedDt);

      if (nextStroke >= 0.92 - 1e-4) {
        this.slowPressFailedIgnition = this.tinderState === 'fresh';
        this.startPneumaticRebound();
      }
    } else if (this.actionMode === 'rebounding') {
      // 高压气垫阻尼弹簧振荡回弹
      const stiffness = 68.0;
      const damping = 11.5;
      const displacement = this.stroke - this.reboundEquilibriumStroke;
      const springForce = -stiffness * displacement - damping * this.pistonVelocity;
      this.pistonVelocity += springForce * clampedDt;
      const nextStroke = Math.max(0, Math.min(0.97, this.stroke + this.pistonVelocity * clampedDt));
      this.integrateThermodynamics(nextStroke, clampedDt);

      if (Math.abs(displacement) < 0.003 && Math.abs(this.pistonVelocity) < 0.02) {
        this.stroke = this.reboundEquilibriumStroke;
        this.pistonVelocity = 0;
        this.actionMode = 'idle';
      }
    } else if (this.actionMode === 'resetting') {
      // 平滑上提活塞回顶
      const pullSpeed = -3.2;
      this.pistonVelocity = pullSpeed;
      const nextStroke = Math.max(0, this.stroke + pullSpeed * clampedDt);
      this.integrateThermodynamics(nextStroke, clampedDt);

      if (nextStroke <= 0.001) {
        this.stroke = 0;
        this.pistonVelocity = 0;
        this.temperatureK = AMBIENT_TEMP_K;
        this.pressureMPa = AMBIENT_PRESSURE_MPA;
        this.refreshTinderOnTopReturn();
        this.smokeIntensity = 0;
        this.actionMode = 'idle';
      }
    } else if (this.actionMode === 'idle') {
      // 静止状态下，气体与气缸外壁缓慢进行牛顿冷却热交换，温度逐渐回归室温
      this.pistonVelocity *= Math.exp(-10 * clampedDt);
      this.integrateThermodynamics(this.stroke, clampedDt);
    }

    // 更新燃烧与烟雾生命周期动效
    this.updateCombustionLifecycle(clampedDt);
  }

  /**
   * 分子级子步积分：含热传导散热的变多方/绝热压缩能量方程
   */
  private integrateThermodynamics(targetStroke: number, dt: number): void {
    const substeps = 8;
    const subDt = dt / substeps;
    const startStroke = this.stroke;
    const dStrokeTotal = targetStroke - startStroke;
    const strokeRate = dStrokeTotal / Math.max(1e-5, dt);

    for (let i = 1; i <= substeps; i++) {
      const sPrev = startStroke + dStrokeTotal * ((i - 1) / substeps);
      const sCurr = startStroke + dStrokeTotal * (i / substeps);
      const vPrev = FireSyringeSolver.volumeFromStroke(sPrev);
      const vCurr = FireSyringeSolver.volumeFromStroke(sCurr);
      const dV = vCurr - vPrev;

      // 1. 绝热体积功项：dT_work = -(γ - 1) * T * (dV / V)
      // 当快速下压 (strokeRate 大) 时，极短时间内冷壁来不及吸热，有效散热率降低
      const adiabaticFactor =
        strokeRate > 0
          ? Math.min(1.0, 0.72 + 0.28 * Math.min(1.0, strokeRate / 2.2))
          : 0.65;
      const dTWork =
        -(ADIABATIC_GAMMA - 1) *
        this.temperatureK *
        (dV / Math.max(vCurr, MIN_CLEARANCE_VOLUME_ML)) *
        adiabaticFactor;

      // 2. 气缸壁热传导散失项：dT_loss = -k_loss * (T - T_env) * subDt
      // 慢压时 (strokeRate < 0.8) 热量充分传导至玻璃缸壁与金属底座；猛压时接触时间极短
      const effectiveLossRate =
        strokeRate > 1.6 ? this.heatLossRate * 0.28 : this.heatLossRate * 1.35;
      const dTLoss = -effectiveLossRate * (this.temperatureK - AMBIENT_TEMP_K) * subDt;

      this.temperatureK = Math.max(
        AMBIENT_TEMP_K - 15,
        Math.min(950, this.temperatureK + dTWork + dTLoss)
      );

      // 3. 理想气体状态方程更新绝对压强 P = nRT / V
      const vMeters3 = vCurr * 1e-6;
      this.pressureMPa = (this.nR * this.temperatureK) / vMeters3 / 1e6;

      // 4. 累计压缩机械功 δW = -P dV
      if (dV < 0) {
        const workStepJ = -this.pressureMPa * 1e6 * (dV * 1e-6);
        this.workDoneJ += workStepJ;
      }

      // 5. 更新峰值温度与引火判定
      const currentTempC = this.temperatureK - KELVIN_OFFSET;
      if (currentTempC > this.peakTemperatureC) {
        this.peakTemperatureC = currentTempC;
      }

      if (
        this.tinderState === 'fresh' &&
        currentTempC >= this.ignitionTempC &&
        sCurr >= 0.75
      ) {
        this.igniteTinder();
      }
    }

    this.stroke = targetStroke;

    // 更新压缩冲击波视觉强度
    if (strokeRate > 0.4) {
      const waveTarget = Math.min(1.0, strokeRate / 3.5);
      this.compressionWaveIntensity = Math.max(this.compressionWaveIntensity, waveTarget);
    }
  }

  /**
   * 触发火绒瞬间爆燃！
   */
  private igniteTinder(): void {
    this.tinderState = 'igniting';
    this.burnElapsed = 0;
    this.slowPressFailedIgnition = false;
    // 火绒放热使缸内局部温度额外跃升
    this.temperatureK = Math.min(920, this.temperatureK + 85);
    const vMeters3 = FireSyringeSolver.volumeFromStroke(this.stroke) * 1e-6;
    this.pressureMPa = (this.nR * this.temperatureK) / vMeters3 / 1e6;
    const tempC = this.temperatureK - KELVIN_OFFSET;
    if (tempC > this.peakTemperatureC) {
      this.peakTemperatureC = tempC;
    }
  }

  /**
   * 更新火绒燃烧、余烬与青烟的动态演化
   */
  private updateCombustionLifecycle(dt: number): void {
    // 压缩冲击波自然衰减
    this.compressionWaveIntensity = Math.max(0, this.compressionWaveIntensity - dt * 2.4);

    if (this.tinderState === 'igniting') {
      this.burnElapsed += dt;
      this.charProgress = Math.min(0.75, this.burnElapsed / 1.85);
      this.smokeIntensity = Math.min(0.85, this.burnElapsed * 0.65);

      // 燃烧室微量氧气在约 1.85 秒内耗尽，转入暗红余烬阶段
      if (this.burnElapsed >= 1.85) {
        this.tinderState = 'ember';
      }
    } else if (this.tinderState === 'ember') {
      this.burnElapsed += dt;
      this.charProgress = Math.min(1.0, 0.75 + ((this.burnElapsed - 1.85) / 2.2) * 0.25);
      this.smokeIntensity = Math.min(1.0, this.smokeIntensity + dt * 0.25);

      if (this.burnElapsed >= 4.2) {
        this.tinderState = 'charred';
      }
    } else if (this.tinderState === 'charred') {
      this.burnElapsed += dt;
      // 烟雾在密闭燃烧室中缓慢沉降，上拉活塞时迅速排空
      const decayRate = this.stroke < 0.25 ? 1.8 : 0.12;
      this.smokeIntensity = Math.max(0, this.smokeIntensity - dt * decayRate);
    } else {
      // fresh 状态
      this.smokeIntensity = Math.max(0, this.smokeIntensity - dt * 2.5);
    }
  }

  public get temperatureC(): number {
    return this.temperatureK - KELVIN_OFFSET;
  }

  /**
   * 获取完整实时遥测与动效驱动参数
   */
  public getTelemetry(): FireSyringeTelemetry {
    const volumeML = FireSyringeSolver.volumeFromStroke(this.stroke);
    const compressionRatio = MAX_VOLUME_ML / volumeML;
    const tempC = this.temperatureK - KELVIN_OFFSET;
    const internalEnergyDeltaJ = this.nCv * (this.temperatureK - AMBIENT_TEMP_K);

    // 计算火焰、闪光、余烬的平滑曲线强度
    let flameIntensity = 0;
    let flashIntensity = 0;
    let emberIntensity = 0;

    if (this.tinderState === 'igniting') {
      // 0 ~ 0.22s 为爆燃强闪光脉冲
      if (this.burnElapsed < 0.25) {
        flashIntensity = Math.sin((this.burnElapsed / 0.25) * Math.PI);
      }
      // 火焰在 0.08s 内迅速窜起，随后跃动燃烧并在 1.85s 末收拢
      const rise = Math.min(1.0, this.burnElapsed / 0.08);
      const tail = Math.max(0, 1.0 - Math.pow(Math.max(0, this.burnElapsed - 1.1) / 0.75, 2));
      const flicker =
        0.86 +
        0.14 * Math.sin(this.burnElapsed * 38.0) * Math.cos(this.burnElapsed * 23.0);
      flameIntensity = rise * tail * flicker;
      emberIntensity = Math.min(1.0, this.burnElapsed / 0.5);
    } else if (this.tinderState === 'ember') {
      const emberAge = this.burnElapsed - 1.85;
      const fade = Math.max(0, 1.0 - emberAge / 2.35);
      const pulse = 0.82 + 0.18 * Math.sin(this.burnElapsed * 9.5);
      emberIntensity = fade * pulse;
    }

    // 绝热压缩热浪光晕强度：随温度升高 (超过 35°C) 漸显橙红辐射光晕
    const tempNormalized = Math.max(0, Math.min(1.0, (tempC - 32.0) / (this.ignitionTempC - 32.0)));
    const thermalGlowIntensity = Math.max(
      tempNormalized * 0.92,
      flameIntensity * 0.85,
      emberIntensity * 0.35
    );

    // 分子热运动速率倍率：正比于 sqrt(T / T0) 并在猛压时叠加对流冲击感
    const thermalSpeedRatio = Math.sqrt(Math.max(1.0, this.temperatureK / AMBIENT_TEMP_K));
    const moleculeSpeedMultiplier = Math.min(
      4.5,
      thermalSpeedRatio * (1.0 + Math.min(1.2, Math.abs(this.pistonVelocity) * 0.35)) +
        flameIntensity * 1.4
    );

    return {
      stroke: this.stroke,
      pistonVelocity: this.pistonVelocity,
      volumeML,
      compressionRatio,
      temperatureC: tempC,
      temperatureK: this.temperatureK,
      pressureMPa: this.pressureMPa,
      workDoneJ: this.workDoneJ,
      internalEnergyDeltaJ,
      peakTemperatureC: this.peakTemperatureC,
      tinderState: this.tinderState,
      actionMode: this.actionMode,
      flameIntensity,
      flashIntensity,
      emberIntensity,
      smokeIntensity: this.smokeIntensity,
      thermalGlowIntensity,
      compressionWaveIntensity: this.compressionWaveIntensity,
      moleculeSpeedMultiplier,
      charProgress: this.charProgress,
      slowPressFailedIgnition: this.slowPressFailedIgnition,
    };
  }
}
