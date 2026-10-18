/**
 * 牛顿第三定律与弹簧测力计物理动力学求解器
 *
 * 核心物理原理：
 * 1. 牛顿第三运动定律 (Newton's Third Law)：
 *    两个物体之间的作用力和反作用力，总是大小相等、方向相反，作用在同一条直线上。
 *    \vec{F}_{A \to B} = - \vec{F}_{B \to A}
 * 2. 作用力与反作用力的本质特征：
 *    - 大小相等 (|F_A| = |F_B|)
 *    - 方向相反 (180° 相背)
 *    - 作用在同一条直线上 (共线)
 *    - 同时产生、同时变化、同时消失 (同增、同减、同生同灭)
 *    - 作用在不同的物体上 (A对B与B对A，不可相互抵消)
 *    - 性质相同 (均为弹簧形变产生的弹力)
 * 3. 弹簧测力计工作原理 (胡克定律 Hooke's Law)：
 *    在弹性限度内，弹簧的伸长量 \Delta x 与所受拉力 F 成正比：F = k \cdot \Delta x
 */

import { STANDARD_GRAVITY } from './constants.ts';

export type NewtonThirdMode = 'manual_drag' | 'oscillation' | 'step_preset';

export interface StandaloneDynamometerState {
  forceN: number;             // 当前示数 (0 ~ 5.0 N)
  displacementM: number;      // 弹簧伸长量 (m)
  suspendedWeightKg: number;  // 悬挂钩码质量 (kg, 0 表示手动拉拽)
  isHandDragging: boolean;    // 是否处于手动拖拽状态
}

export interface ConnectedDynamometersState {
  forceN: number;             // 两测力计共同受力大小 (N)
  forceA_N: number;           // 测力计 A 示数 (N)
  forceB_N: number;           // 测力计 B 示数 (N)
  deltaForceN: number;        // 两者示数之差 (|F_A - F_B| = 0.000)
  displacementA_M: number;    // 测力计 A 弹簧伸长量 (m)
  displacementB_M: number;    // 测力计 B 弹簧伸长量 (m)
  pullHandleOffsetM: number;  // 右侧拉动手柄总位移 (m)
  mode: NewtonThirdMode;      // 探究模式
  isDraggingRight: boolean;   // 是否正在拖拽右侧测力计手柄
}

export interface TelemetryPoint {
  timeS: number;
  forceA: number;
  forceB: number;
}

export class NewtonThirdDynamicsSolver {
  // 弹簧物理劲度系数 (N/m): 5.0N 量程对应 0.08m (8cm) 最大伸长量
  public readonly springStiffnessK = 62.5; // N/m (5.0 N / 0.08 m)
  public readonly maxForceN = 5.0;         // 满量程 5.0 N
  public readonly maxDisplacementM = 0.08; // 8 cm

  // 单独测力计状态
  public soloState: StandaloneDynamometerState = {
    forceN: 0,
    displacementM: 0,
    suspendedWeightKg: 0,
    isHandDragging: false,
  };

  // 两个连接测力计状态
  public pairState: ConnectedDynamometersState = {
    forceN: 0,
    forceA_N: 0,
    forceB_N: 0,
    deltaForceN: 0,
    displacementA_M: 0,
    displacementB_M: 0,
    pullHandleOffsetM: 0,
    mode: 'manual_drag',
    isDraggingRight: false,
  };

  // 目标拉力平滑阻尼过渡 (用于鼠标松开或预设点击)
  private targetPairForceN = 0;
  private currentPairForceN = 0;
  private targetSoloForceN = 0;
  private currentSoloForceN = 0;

  // 正弦波动态振荡参数 (演示“同时产生、同时变化、同时消失”)
  private oscillationTime = 0;
  private oscillationFreqHz = 0.6; // 0.6 Hz 舒缓的物理拉伸波动

  // 示波波形历史缓冲 (最近 120 个采样点)
  public readonly historyCapacity = 100;
  public history: TelemetryPoint[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.soloState = {
      forceN: 0,
      displacementM: 0,
      suspendedWeightKg: 0,
      isHandDragging: false,
    };
    this.pairState = {
      forceN: 0,
      forceA_N: 0,
      forceB_N: 0,
      deltaForceN: 0,
      displacementA_M: 0,
      displacementB_M: 0,
      pullHandleOffsetM: 0,
      mode: 'manual_drag',
      isDraggingRight: false,
    };
    this.targetPairForceN = 0;
    this.currentPairForceN = 0;
    this.targetSoloForceN = 0;
    this.currentSoloForceN = 0;
    this.oscillationTime = 0;
    this.history = [];
  }

  /**
   * 手动直接拖拽右侧测力计手柄 (传入位移增量或目标力)
   */
  public setPairTargetForce(forceN: number, immediate = false): void {
    const clamped = Math.max(0, Math.min(this.maxForceN, forceN));
    this.targetPairForceN = clamped;
    if (immediate) {
      this.currentPairForceN = clamped;
    }
  }

  /**
   * 手动设置单独测力计拉力
   */
  public setSoloTargetForce(forceN: number, immediate = false): void {
    const clamped = Math.max(0, Math.min(this.maxForceN, forceN));
    this.targetSoloForceN = clamped;
    if (immediate) {
      this.currentSoloForceN = clamped;
    }
  }

  /**
   * 挂载指定质量钩码到独立测力计 (kg)
   */
  public hangWeightOnSolo(massKg: number): void {
    this.soloState.suspendedWeightKg = Math.max(0, massKg);
    const gravityForce = this.soloState.suspendedWeightKg * STANDARD_GRAVITY;
    this.setSoloTargetForce(gravityForce, false);
  }

  /**
   * 切换探究模式
   */
  public setMode(mode: NewtonThirdMode): void {
    this.pairState.mode = mode;
    if (mode === 'manual_drag') {
      // 保持当前拉力，等待用户拖拽
    } else if (mode === 'oscillation') {
      this.oscillationTime = 0;
    } else if (mode === 'step_preset') {
      this.setPairTargetForce(2.5, false);
    }
  }

  /**
   * 物理求解循环更新 (每帧执行)
   */
  public update(delta: number, elapsed: number): void {
    const dt = Math.min(0.05, Math.max(0.001, delta));

    // 1. 更新双测力计系统
    if (this.pairState.mode === 'oscillation') {
      this.oscillationTime += dt;
      // 正弦波在 0.4N 到 4.6N 之间平滑变动
      const baseForce = 2.5;
      const amplitude = 1.9;
      const wave = Math.sin(this.oscillationTime * Math.PI * 2 * this.oscillationFreqHz);
      this.targetPairForceN = baseForce + amplitude * wave;
    }

    // 弹簧平滑惯性阻尼跟踪 (临界阻尼弹簧响应)
    const pairTrackingSpeed = this.pairState.isDraggingRight ? 35.0 : 16.0;
    this.currentPairForceN += (this.targetPairForceN - this.currentPairForceN) * Math.min(1.0, pairTrackingSpeed * dt);
    if (Math.abs(this.targetPairForceN - this.currentPairForceN) < 0.0005) {
      this.currentPairForceN = this.targetPairForceN;
    }

    // 牛顿第三定律核心物理保证：F_A 始终严格等于 F_B！
    const fA = this.currentPairForceN;
    const fB = this.currentPairForceN;
    const dispA = fA / this.springStiffnessK;
    const dispB = fB / this.springStiffnessK;
    const totalPullOffset = dispA + dispB; // 两根串联弹簧的总伸长量

    this.pairState.forceN = fA;
    this.pairState.forceA_N = fA;
    this.pairState.forceB_N = fB;
    this.pairState.deltaForceN = Math.abs(fA - fB);
    this.pairState.displacementA_M = dispA;
    this.pairState.displacementB_M = dispB;
    this.pairState.pullHandleOffsetM = totalPullOffset;

    // 2. 更新单独测力计系统
    const soloTrackingSpeed = this.soloState.isHandDragging ? 35.0 : 18.0;
    this.currentSoloForceN += (this.targetSoloForceN - this.currentSoloForceN) * Math.min(1.0, soloTrackingSpeed * dt);
    if (Math.abs(this.targetSoloForceN - this.currentSoloForceN) < 0.0005) {
      this.currentSoloForceN = this.targetSoloForceN;
    }

    this.soloState.forceN = this.currentSoloForceN;
    this.soloState.displacementM = this.currentSoloForceN / this.springStiffnessK;

    // 3. 记录示波历史数据
    if (this.history.length === 0 || elapsed - this.history[this.history.length - 1].timeS >= 0.033) {
      this.history.push({
        timeS: elapsed,
        forceA: fA,
        forceB: fB,
      });
      if (this.history.length > this.historyCapacity) {
        this.history.shift();
      }
    }
  }
}
