/**
 * 经典力学：自由落体运动与牛顿管空气阻力动力学解算器
 *
 * 物理原理：
 * 1. 理想真空状态下 (P = 0, ρ = 0)：
 *    物体仅受重力作用 F_g = m·g，加速度 a = g，与物体的质量、形状、密度完全无关。
 *    位移公式：h = 1/2·g·t²，速度公式：v = g·t。
 *    羽毛、硬币、软木塞在管内同步下落，同时触底。
 *
 * 2. 真实常压空气状态下 (P = 101.325 kPa, ρ ≈ 1.225 kg/m³)：
 *    物体同时受重力与空气阻力作用：
 *    m·a = m·g - F_drag
 *    其中 F_drag = 1/2 · C_d · ρ · A · v²
 *    - 硬币：密度极高、迎风面积小、质量大，F_drag 远小于重力，近似纯自由落体 (~0.46s)。
 *    - 软木塞：中等有效密度与阻力，常压下明显滞后于硬币 (~0.85s)，肉眼清晰可辨。
 *    - 羽毛：质量极轻 (约 0.045g)、有效迎风面积大、阻力系数大，收尾速度极低 (~0.50 m/s)，
 *      在空气扰动中轻盈左右飘摆迟缓降落 (~2.14s)，与硬币形成极大反差。
 */

export interface FreeFallObjectConfig {
  id: 'feather' | 'coin' | 'cork';
  name: string;
  massKg: number;
  crossSectionAreaM2: number;
  dragCoefficient: number;
  radiusM: number;
  heightM: number;
}

export interface FreeFallObjectState {
  id: 'feather' | 'coin' | 'cork';
  name: string;
  // 管内局部下落位置（从管顶 0 到管底 fallDistanceM）
  yM: number;
  velocityM_S: number;
  accelerationM_S2: number;
  dragForceN: number;
  hasLanded: boolean;
  landTimeS: number;
  // 羽毛空气中飘摆状态（横向扰动与倾角）
  flutterX: number;
  flutterAngleRad: number;
}

export interface FreeFallTelemetry {
  airPressureKPa: number;
  airDensityKg_M3: number;
  vacuumRatioPercent: number;
  gravityM_S2: number;
  fallDistanceM: number;
  isTubeRotating: boolean;
  tubeRotationAngleRad: number;
  tubeFlipProgress: number;
  tubeStartAngleRad: number;
  isPumpRunning: boolean;
  isVenting: boolean;
  isFalling: boolean;
  allLanded: boolean;
  elapsedFallTimeS: number;
  objects: FreeFallObjectState[];
}

export interface FreeFallSolverOptions {
  gravity?: number;
  airPressureKPa?: number;
  fallDistanceM?: number;
}

export const OBJECT_CONFIGS: Record<'feather' | 'coin' | 'cork', FreeFallObjectConfig> = {
  feather: {
    id: 'feather',
    name: '羽毛',
    massKg: 0.000045, // 0.045 克天然轻羽
    crossSectionAreaM2: 0.0020, // 蓬松羽丝有效受风面积
    dragCoefficient: 1.45, // 扁平多孔高阻力系数
    radiusM: 0.015,
    heightM: 0.08,
  },
  cork: {
    id: 'cork',
    name: '软木塞',
    massKg: 0.000085, // 0.085 克轻质软木片/木塞
    crossSectionAreaM2: 0.00060, // 钝体迎风投影
    dragCoefficient: 1.15, // 钝体圆柱圆台阻力系数
    radiusM: 0.014,
    heightM: 0.02,
  },
  coin: {
    id: 'coin',
    name: '硬币',
    massKg: 0.0062, // 6.2 克标准硬币
    crossSectionAreaM2: 0.00030, // 侧滑/翻滚有效平均面积
    dragCoefficient: 0.45, // 金属扁圆体低阻力
    radiusM: 0.0125,
    heightM: 0.002,
  },
};

export const STANDARD_ATMOSPHERE_KPA = 101.325;
export const STANDARD_AIR_DENSITY = 1.225; // kg/m³ at 15°C

export class FreeFallDynamicsSolver {
  public gravity: number;
  public airPressureKPa: number;
  public fallDistanceM: number;

  // 抽气与排气系统参数
  public isPumpRunning = false;
  public isVenting = false;
  private readonly pumpEvacuateRate = 1.5; // 指数抽气速率常量 (s⁻¹)
  private readonly ventRefillRate = 2.5; // 泄气回充常数 (s⁻¹)

  // 管体旋转状态 (0 = 正向，π = 180° 倒转)
  public tubeRotationAngleRad = 0;
  public targetTubeRotationAngleRad = 0;
  public isTubeRotating = false;
  public tubeFlipProgress = 1.0;
  public readonly tubeFlipDurationS = 0.65; // 0.65s 平滑翻转
  public tubeStartAngleRad = 0;

  // 下落状态
  public isFalling = false;
  public elapsedFallTimeS = 0;
  private flutterPhase = 0;

  // 物体状态集
  private objectStates: Map<'feather' | 'coin' | 'cork', FreeFallObjectState> = new Map();

  constructor(options: FreeFallSolverOptions = {}) {
    this.gravity = options.gravity ?? 9.80;
    this.airPressureKPa = options.airPressureKPa ?? STANDARD_ATMOSPHERE_KPA;
    this.fallDistanceM = options.fallDistanceM ?? 1.05;

    // 初始状态：物体在重力作用下静止落在管底缓冲垫上，杜绝悬浮反常识
    this.resetObjectsToBottom();
  }

  /**
   * 当前空气密度 (kg/m³)
   */
  public get airDensity(): number {
    const ratio = Math.max(0, this.airPressureKPa / STANDARD_ATMOSPHERE_KPA);
    return STANDARD_AIR_DENSITY * ratio;
  }

  /**
   * 真空度百分比 (100% 为绝对真空，0% 为标准大气压)
   */
  public get vacuumRatioPercent(): number {
    const ratio = 1.0 - Math.min(1.0, Math.max(0, this.airPressureKPa / STANDARD_ATMOSPHERE_KPA));
    return ratio * 100.0;
  }

  /**
   * 重置物体状态到管顶准备下落
   */
  public resetObjects(): void {
    this.isFalling = false;
    this.elapsedFallTimeS = 0;
    this.flutterPhase = 0;

    for (const key of ['feather', 'coin', 'cork'] as const) {
      this.objectStates.set(key, {
        id: key,
        name: OBJECT_CONFIGS[key].name,
        yM: 0,
        velocityM_S: 0,
        accelerationM_S2: 0,
        dragForceN: 0,
        hasLanded: false,
        landTimeS: 0,
        flutterX: 0,
        flutterAngleRad: 0,
      });
    }
  }

  /**
   * 重置物体到管底静止状态 (初始放置或落地停稳)
   */
  public resetObjectsToBottom(): void {
    this.isFalling = false;
    this.elapsedFallTimeS = 0;
    this.flutterPhase = 0;

    for (const key of ['feather', 'coin', 'cork'] as const) {
      this.objectStates.set(key, {
        id: key,
        name: OBJECT_CONFIGS[key].name,
        yM: this.fallDistanceM,
        velocityM_S: 0,
        accelerationM_S2: 0,
        dragForceN: 0,
        hasLanded: true,
        landTimeS: 0,
        flutterX: 0,
        flutterAngleRad: 0,
      });
    }
  }

  /**
   * 触发旋转倒转牛顿管 (180°)
   * 点击后，牛顿管平滑翻转 180°，翻转完成后物体从顶部释放下落
   */
  public triggerInversion(): void {
    if (this.isTubeRotating) return;

    // 若当前物体仍在下落途中被触发翻转，先平滑归位于管底，确保翻转轨迹连续不突跳
    if (this.isFalling) {
      this.resetObjectsToBottom();
    }

    this.isTubeRotating = true;
    this.tubeFlipProgress = 0.0;
    this.tubeStartAngleRad = this.tubeRotationAngleRad;
    this.targetTubeRotationAngleRad = this.tubeRotationAngleRad + Math.PI;

    // 翻转开始时暂停下落（物体将随管底端盖在旋转弧线上升至管顶）
    this.isFalling = false;
  }

  /**
   * 切换抽气机开关
   */
  public togglePump(forceState?: boolean): boolean {
    if (forceState !== undefined) {
      this.isPumpRunning = forceState;
    } else {
      this.isPumpRunning = !this.isPumpRunning;
    }
    if (this.isPumpRunning) {
      this.isVenting = false;
    }
    return this.isPumpRunning;
  }

  /**
   * 切换排气阀（充入空气恢复标准大气压）
   */
  public toggleVenting(forceState?: boolean): boolean {
    if (forceState !== undefined) {
      this.isVenting = forceState;
    } else {
      this.isVenting = !this.isVenting;
    }
    if (this.isVenting) {
      this.isPumpRunning = false;
    }
    return this.isVenting;
  }

  /**
   * 直接设置气压 (kPa)
   */
  public setPressure(pressureKPa: number): void {
    this.airPressureKPa = Math.max(0.0, Math.min(STANDARD_ATMOSPHERE_KPA, pressureKPa));
  }

  /**
   * 动力学步进更新
   * @param dt 真实渲染帧间隔 (秒)
   * @param timeScale 落体运动时间演化倍率 (默认 1.0；在慢放模式下对自由落体积分应用慢放)
   */
  public step(dt: number, timeScale = 1.0): void {
    const clampedDt = Math.min(0.05, Math.max(0.0005, dt));

    // 1. 处理气压变化（抽气中 / 充气中，保持设备机械正常速率）
    if (this.isPumpRunning) {
      // 连续指数级抽气直至接近零
      this.airPressureKPa = Math.max(
        0.0,
        this.airPressureKPa - this.airPressureKPa * this.pumpEvacuateRate * clampedDt - 0.5 * clampedDt
      );
      if (this.airPressureKPa < 0.05) {
        this.airPressureKPa = 0.0;
      }
    } else if (this.isVenting) {
      // 充入空气回升至标准大气压
      const delta = (STANDARD_ATMOSPHERE_KPA - this.airPressureKPa) * this.ventRefillRate * clampedDt + 5.0 * clampedDt;
      this.airPressureKPa = Math.min(STANDARD_ATMOSPHERE_KPA, this.airPressureKPa + delta);
      if (Math.abs(this.airPressureKPa - STANDARD_ATMOSPHERE_KPA) < 0.1) {
        this.airPressureKPa = STANDARD_ATMOSPHERE_KPA;
        this.isVenting = false;
      }
    }

    // 2. 处理牛顿管翻转插值 (保持翻转手感为 0.65s 真实利落机械翻转)
    if (this.isTubeRotating) {
      this.tubeFlipProgress += clampedDt / this.tubeFlipDurationS;
      if (this.tubeFlipProgress >= 1.0) {
        this.tubeFlipProgress = 1.0;
        this.tubeRotationAngleRad = this.targetTubeRotationAngleRad;
        this.isTubeRotating = false;

        // 翻转彻底就绪，重置物体至管顶并释放下落！
        this.resetObjects();
        this.isFalling = true;
        this.elapsedFallTimeS = 0;
      } else {
        // 使用 smoothstep 平滑缓冲
        const t = this.tubeFlipProgress;
        const ease = t * t * (3.0 - 2.0 * t);
        this.tubeRotationAngleRad =
          this.tubeStartAngleRad + (this.targetTubeRotationAngleRad - this.tubeStartAngleRad) * ease;
      }
      return;
    }

    // 3. 物体自由落体物理动力学积分 (应用 timeScale 慢放倍率，精细观察对比)
    if (!this.isFalling) return;

    const fallDt = clampedDt * Math.max(0.05, Math.min(2.0, timeScale));
    this.elapsedFallTimeS += fallDt;
    this.flutterPhase += fallDt * 8.0;

    const rho = this.airDensity;
    const g = this.gravity;
    let anyStillFalling = false;

    for (const [key, state] of this.objectStates) {
      if (state.hasLanded) continue;

      const cfg = OBJECT_CONFIGS[key];
      const m = cfg.massKg;
      const v = state.velocityM_S;

      // 空气阻力计算：F_d = 1/2 * C_d * rho * A * v²
      let dragForce = 0.5 * cfg.dragCoefficient * rho * cfg.crossSectionAreaM2 * v * v;
      // 阻力最大不能超过重力导致向上反弹
      const maxDrag = m * g;
      if (dragForce > maxDrag) {
        dragForce = maxDrag;
      }

      // 牛顿第二定律：m·a = m·g - F_drag
      const a = g - dragForce / m;
      state.accelerationM_S2 = a;
      state.dragForceN = dragForce;

      // 速度与位移数值积分 (Velocity-Verlet / 改进欧拉)
      state.velocityM_S += a * fallDt;
      state.yM += state.velocityM_S * fallDt;

      // 羽毛特有的空气飘舞动力学模拟
      if (key === 'feather') {
        const airRatio = Math.min(1.0, rho / STANDARD_AIR_DENSITY);
        if (airRatio > 0.01) {
          // 在空气中：受气流影响产生左右往复摇摆与俯仰角
          const flutterAmp = 0.024 * airRatio; // 约 2.4cm 摆幅
          state.flutterX = Math.sin(this.flutterPhase) * flutterAmp;
          state.flutterAngleRad = Math.cos(this.flutterPhase) * 0.45 * airRatio;
        } else {
          // 在真空中：完全无阻力与气流扰动，垂直挺直下落
          state.flutterX = 0;
          state.flutterAngleRad = 0;
        }
      }

      // 触底检测 (结合子步插值保证微秒级精确落地时间)
      if (state.yM >= this.fallDistanceM) {
        const overshoot = state.yM - this.fallDistanceM;
        const vStep = Math.max(1e-4, state.velocityM_S);
        const dtOver = Math.min(fallDt, Math.max(0, overshoot / vStep));
        state.yM = this.fallDistanceM;
        state.hasLanded = true;
        state.landTimeS = Math.max(0, this.elapsedFallTimeS - dtOver);
        state.velocityM_S = 0;
        state.accelerationM_S2 = 0;
        state.dragForceN = 0;
        if (key === 'feather') {
          state.flutterX = 0;
          state.flutterAngleRad = 0;
        }
      } else {
        anyStillFalling = true;
      }
    }

    if (!anyStillFalling) {
      this.isFalling = false;
    }
  }

  /**
   * 获取完整遥测状态
   */
  public getTelemetry(): FreeFallTelemetry {
    const objects = Array.from(this.objectStates.values());
    const allLanded = objects.every((o) => o.hasLanded);

    return {
      airPressureKPa: parseFloat(this.airPressureKPa.toFixed(2)),
      airDensityKg_M3: parseFloat(this.airDensity.toFixed(4)),
      vacuumRatioPercent: parseFloat(this.vacuumRatioPercent.toFixed(1)),
      gravityM_S2: this.gravity,
      fallDistanceM: this.fallDistanceM,
      isTubeRotating: this.isTubeRotating,
      tubeRotationAngleRad: this.tubeRotationAngleRad,
      tubeFlipProgress: parseFloat(this.tubeFlipProgress.toFixed(3)),
      tubeStartAngleRad: this.tubeStartAngleRad,
      isPumpRunning: this.isPumpRunning,
      isVenting: this.isVenting,
      isFalling: this.isFalling,
      allLanded,
      elapsedFallTimeS: parseFloat(this.elapsedFallTimeS.toFixed(3)),
      objects: objects.map((o) => ({ ...o })),
    };
  }

  /**
   * 获取特定物体的当前状态
   */
  public getObjectState(id: 'feather' | 'coin' | 'cork'): FreeFallObjectState {
    const s = this.objectStates.get(id);
    if (!s) throw new Error(`Unknown object id: ${id}`);
    return { ...s };
  }
}
