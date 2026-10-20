/**
 * 绝热压缩引火仪热力学动力学求解器 (Compression Ignition Dynamics Solver)
 *
 * 遵循热力学第一定律与气体状态方程：
 * 1. 绝热过程方程：P · V^γ = C, T · V^(γ-1) = C (γ ≈ 1.40 双原子分子气体)
 * 2. 真实非绝热热量耗散速率模型 (牛顿冷却定律结合做功加热)：
 *    dT/dt = (γ - 1) * (T / V) * (-dV/dt) - k_loss * (T - T_ambient)
 * 3. 硝化棉着火判据：
 *    当腔内温度 T ≥ 165 ℃ (438.15 K) 且压缩行程深入底腔时，硝化棉发生瞬时爆燃；
 *    若缓慢下压，热量通过厚壁气缸迅速散失至外界，温度始终低于燃点，硝化棉完好无损；
 * 4. 气压回弹动力学：
 *    下压压缩产生超高气压 (P 可达 15 ~ 25 atm)，松开鼠标后产生强烈的气动弹性回弹效应。
 */

export type CottonState = 'ready' | 'igniting' | 'burnt';
export type IgnitionMode = 'manual_drag' | 'rapid_stroke' | 'slow_stroke';

export interface CompressionIgnitionTelemetry {
  stroke: number;             // 归一化冲程 [0, 1] (0 为上死点，1 为下死点)
  physicalHeightM: number;    // 活塞底面实际高度 (米)
  velocityMS: number;         // 活塞移动速度 (米/秒，向下为负)
  volumeML: number;           // 气缸内部瞬时容积 (毫升)
  pressureAtm: number;        // 腔内瞬时压强 (个标准大气压 atm)
  temperatureC: number;       // 腔内瞬时温度 (摄氏度 ℃)
  temperatureK: number;       // 腔内瞬时温度 (开尔文 K)
  compressionRatio: number;   // 容积压缩比 r = V0 / V
  cottonState: CottonState;   // 硝化棉物理状态
  flameIntensity: number;     // 爆燃火光与火焰强度 [0, 1]
  ignitionProgress: number;   // 爆燃过程耗时进度 [0, 1]
  isPneumaticRebounding: boolean;
}

export class CompressionIgnitionDynamicsSolver {
  // 基础热力学物性常量
  public readonly gamma = 1.40;                     // 双原子气体绝热指数 (空气)
  public readonly ambientTempK = 293.15;            // 环境基准温度 20 ℃ (293.15 K)
  public readonly ambientPressureAtm = 1.0;         // 环境大气压 1.0 atm
  public readonly ignitionTempK = 438.15;           // 硝化棉着火温度 165 ℃ (438.15 K)
  public readonly ignitionTempC = 165.0;            // 硝化棉着火温度 (℃)

  // 几何结构尺寸 (与 3D 模型严格等比例对齐)
  public readonly maxStrokeM = 0.145;               // 最大有效冲程 145 mm
  public readonly topHeightM = 0.170;               // 活塞头上死点局部高度 (m)
  public readonly bottomHeightM = 0.025;            // 活塞头下死点局部高度 (m)
  public readonly cylinderAreaM2 = 3.1416e-4;       // 气缸内截面积 (内径 20mm, A = π * 0.01^2)
  public readonly maxVolumeML = 50.0;               // 初始最大气缸容积 50.0 mL
  public readonly minVolumeML = 3.8;                // 下止点极限压缩容积 3.8 mL (压缩比 ≈ 13.2)

  // 热耗散系数 (厚壁耐压石英/亚克力气缸导热损耗)
  public readonly kCool = 9.5;                      // 牛顿冷却衰减速率 (s^-1)

  // 状态变量
  private _stroke = 0.0;                            // 冲程进度 [0, 1]
  private _velocityMS = 0.0;                        // 活塞当前速度 (m/s)
  private _temperatureK = 293.15;                   // 腔内温度 (K)
  private _cottonState: CottonState = 'ready';      // 硝化棉状态
  private _flameIntensity = 0.0;                    // 火焰强度
  private _ignitionTimer = 0.0;                     // 爆燃持续计时
  private readonly ignitionDuration = 0.42;         // 爆燃持续时间 (s)

  // 交互控制
  public isDragging = false;
  public reboundEnabled = true;
  private _mode: IgnitionMode = 'manual_drag';

  // 自动冲程动画控制
  private autoStrokeActive = false;
  private autoStrokeElapsed = 0.0;
  private autoStrokeDuration = 0.10;
  private autoStrokeTarget = 1.0;
  private autoStrokeReturn = true;

  constructor() {
    this.reset();
  }

  /**
   * 重置实验状态与装填新鲜硝化棉
   */
  public reset(): void {
    this._stroke = 0.0;
    this._velocityMS = 0.0;
    this._temperatureK = this.ambientTempK;
    this._cottonState = 'ready';
    this._flameIntensity = 0.0;
    this._ignitionTimer = 0.0;
    this.autoStrokeActive = false;
    this.isDragging = false;
    this._mode = 'manual_drag';
  }

  /**
   * 装填新鲜硝化棉 (若活塞在底部则保留活塞位置，仅换上新棉花)
   */
  public reloadCotton(): void {
    this._cottonState = 'ready';
    this._flameIntensity = 0.0;
    this._ignitionTimer = 0.0;
  }

  /**
   * 触发快速绝热猛压冲程 (模拟人手快速强力向下按压，冲程时间 ~0.08s)
   */
  public triggerRapidStroke(): void {
    this.autoStrokeActive = true;
    this.autoStrokeElapsed = 0.0;
    this.autoStrokeDuration = 0.09; // 90毫秒极速猛压
    this.autoStrokeTarget = 0.96;
    this.autoStrokeReturn = true;
    this._mode = 'rapid_stroke';
  }

  /**
   * 触发缓慢等温下压冲程 (下压持续 2.5s，热量充分散失，棉花不燃烧)
   */
  public triggerSlowStroke(): void {
    this.autoStrokeActive = true;
    this.autoStrokeElapsed = 0.0;
    this.autoStrokeDuration = 2.4;  // 2.4秒缓慢推进
    this.autoStrokeTarget = 0.92;
    this.autoStrokeReturn = true;
    this._mode = 'slow_stroke';
  }

  /**
   * 设置交互模式
   */
  public setMode(mode: IgnitionMode): void {
    this._mode = mode;
    if (mode === 'rapid_stroke') {
      this.triggerRapidStroke();
    } else if (mode === 'slow_stroke') {
      this.triggerSlowStroke();
    }
  }

  public get mode(): IgnitionMode {
    return this._mode;
  }

  /**
   * 用户自由光标直接拖拽更新冲程深度
   * @param targetStroke 目标冲程 [0, 1]
   * @param dt 时间步长 (s)
   */
  public updateManualDrag(targetStroke: number, dt: number): void {
    this.isDragging = true;
    this.autoStrokeActive = false;
    this._mode = 'manual_drag';

    const clampedTarget = Math.max(0.0, Math.min(1.0, targetStroke));
    const deltaStroke = clampedTarget - this._stroke;
    const currentVelocity = dt > 0.0001 ? (deltaStroke * this.maxStrokeM) / dt : 0;

    // 简单一阶速度平滑
    this._velocityMS = this._velocityMS * 0.4 + currentVelocity * 0.6;
    this._stroke = clampedTarget;
  }

  /**
   * 结束手动拖拽
   */
  public endManualDrag(): void {
    this.isDragging = false;
  }

  /**
   * 动力学主步进更新
   */
  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);

    // 1. 处理自动化冲程 (快速绝热 / 缓慢等温)
    if (this.autoStrokeActive) {
      this.autoStrokeElapsed += clampedDt;
      const t = this.autoStrokeElapsed / this.autoStrokeDuration;

      if (t <= 1.0) {
        // 下压阶段：使用平滑加速曲线
        const prevStroke = this._stroke;
        // smoothstep 或者正弦下压
        const progress = Math.sin((t * Math.PI) / 2);
        this._stroke = progress * this.autoStrokeTarget;
        this._velocityMS = clampedDt > 0 ? ((this._stroke - prevStroke) * this.maxStrokeM) / clampedDt : 0;
      } else if (this.autoStrokeReturn) {
        // 回弹阶段：气压回弹或手柄自然复位
        const returnT = (this.autoStrokeElapsed - this.autoStrokeDuration) / (this.autoStrokeDuration * 1.5);
        if (returnT <= 1.0) {
          const prevStroke = this._stroke;
          const returnProgress = 1.0 - Math.sin((returnT * Math.PI) / 2);
          this._stroke = returnProgress * this.autoStrokeTarget;
          this._velocityMS = clampedDt > 0 ? ((this._stroke - prevStroke) * this.maxStrokeM) / clampedDt : 0;
        } else {
          this._stroke = 0.0;
          this._velocityMS = 0.0;
          this.autoStrokeActive = false;
        }
      } else {
        this.autoStrokeActive = false;
      }
    } else if (!this.isDragging && this.reboundEnabled && this._stroke > 0.001) {
      // 2. 气压弹性自然回弹 (Pneumatic Spring-Damper Rebound)
      // 内部高压对活塞产生向上斥力
      const currentVol = this.calculateVolumeML(this._stroke);
      const ratio = this.maxVolumeML / currentVol;
      const internalPressureAtm = Math.pow(ratio, this.gamma);
      const deltaPressureAtm = Math.max(0, internalPressureAtm - 1.0);

      // 回弹弹力与空气阻尼加速度
      const reboundAccel = deltaPressureAtm * 14.0 + 9.8; // 向上加速度 (正方向朝上，冲程减小)
      const prevStroke = this._stroke;

      // 逐步衰减回顶死点
      const strokeSpeed = Math.min(12.0, reboundAccel * clampedDt);
      this._stroke = Math.max(0.0, this._stroke - strokeSpeed * clampedDt * 2.8);
      this._velocityMS = clampedDt > 0 ? ((this._stroke - prevStroke) * this.maxStrokeM) / clampedDt : 0;
    } else if (!this.isDragging && !this.autoStrokeActive) {
      this._velocityMS *= Math.max(0, 1.0 - clampedDt * 10.0);
    }

    // 3. 热力学温度演化微分方程
    // dT/dt = (γ - 1) * (T / V) * (-dV/dt) - kCool * (T - T_ambient)
    const currentVol = this.calculateVolumeML(this._stroke);
    const dStrokeDt = (this._velocityMS) / this.maxStrokeM; // d(stroke)/dt (正为向下压缩)
    const dVdt = -dStrokeDt * (this.maxVolumeML - this.minVolumeML); // 容积随时间变化率 (mL/s)

    // 绝热做功加热项：外界做功内能增加率
    const compressionHeatingRate = (this.gamma - 1) * (this._temperatureK / currentVol) * (-dVdt);

    // 气缸外壁散热项
    const heatLossRate = this.kCool * (this._temperatureK - this.ambientTempK);

    // 综合导数并积分
    const dTdt = compressionHeatingRate - heatLossRate;
    this._temperatureK += dTdt * clampedDt;

    // 避免数值越界 (温度不低于室温)
    if (this._temperatureK < this.ambientTempK) {
      this._temperatureK = this.ambientTempK;
    }

    // 4. 硝化棉着火与爆燃逻辑
    const currentTempC = this._temperatureK - 273.15;
    if (
      this._cottonState === 'ready' &&
      currentTempC >= this.ignitionTempC &&
      this._stroke >= 0.70
    ) {
      // 触发瞬间爆燃！
      this._cottonState = 'igniting';
      this._ignitionTimer = 0.0;
      this._flameIntensity = 1.0;
      // 硝化棉燃烧瞬时化学放热，将局部瞬时温度进一步推高至 600~800 ℃
      this._temperatureK = Math.max(this._temperatureK, 873.15);
    }

    // 5. 爆燃进程计时与衰减
    if (this._cottonState === 'igniting') {
      this._ignitionTimer += clampedDt;
      const progress = this._ignitionTimer / this.ignitionDuration;

      if (progress >= 1.0) {
        this._cottonState = 'burnt';
        this._flameIntensity = 0.0;
      } else {
        // 瞬间爆发后指数/钟形迅速衰退，持续火光约 0.4s
        const peak = 0.08; // 80ms 达到峰值
        if (progress < peak) {
          this._flameIntensity = Math.min(1.0, progress / peak);
        } else {
          const decay = (progress - peak) / (1.0 - peak);
          this._flameIntensity = Math.max(0.0, Math.pow(1.0 - decay, 2.5));
        }
      }
    } else {
      this._flameIntensity = 0.0;
    }
  }

  /**
   * 根据当前冲程计算内部容积 (mL)
   */
  public calculateVolumeML(stroke: number): number {
    const s = Math.max(0.0, Math.min(1.0, stroke));
    return this.maxVolumeML - s * (this.maxVolumeML - this.minVolumeML);
  }

  /**
   * 获取实时遥测与物理状态
   */
  public getTelemetry(): CompressionIgnitionTelemetry {
    const stroke = this._stroke;
    const physicalHeightM = this.topHeightM - stroke * (this.topHeightM - this.bottomHeightM);
    const volumeML = this.calculateVolumeML(stroke);
    const compressionRatio = this.maxVolumeML / volumeML;

    // 根据理想气体状态方程计算瞬时压强：P = P0 * (T / T0) * (V0 / V)
    const pressureAtm = this.ambientPressureAtm * (this._temperatureK / this.ambientTempK) * compressionRatio;
    const temperatureC = this._temperatureK - 273.15;
    const ignitionProgress = this._cottonState === 'igniting'
      ? Math.min(1.0, this._ignitionTimer / this.ignitionDuration)
      : this._cottonState === 'burnt' ? 1.0 : 0.0;

    return {
      stroke,
      physicalHeightM,
      velocityMS: this._velocityMS,
      volumeML,
      pressureAtm,
      temperatureC,
      temperatureK: this._temperatureK,
      compressionRatio,
      cottonState: this._cottonState,
      flameIntensity: this._flameIntensity,
      ignitionProgress,
      isPneumaticRebounding: !this.isDragging && stroke > 0.01,
    };
  }

  // Getters and Setters
  public get stroke(): number {
    return this._stroke;
  }

  public set stroke(val: number) {
    this._stroke = Math.max(0.0, Math.min(1.0, val));
  }

  public get cottonState(): CottonState {
    return this._cottonState;
  }

  public set cottonState(val: CottonState) {
    this._cottonState = val;
  }

  public get flameIntensity(): number {
    return this._flameIntensity;
  }

  public get temperatureC(): number {
    return this._temperatureK - 273.15;
  }
}
