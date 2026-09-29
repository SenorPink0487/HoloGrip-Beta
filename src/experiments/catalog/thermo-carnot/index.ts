import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { CarnotEngineMesh } from '../../../scene/thermo/CarnotEngineMesh.ts';
import { CarnotMolecularSystem } from '../../../scene/thermo/CarnotMolecularSystem.ts';
import { CarnotInteractionManager } from '../../../scene/thermo/CarnotInteractionManager.ts';
import type { CarnotTelemetryData } from '../../../ui/vision/CarnotStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoCarnotExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D 场景装配组件
  private engine: CarnotEngineMesh;
  private molecularSystem: CarnotMolecularSystem;
  private interactionManager: CarnotInteractionManager;

  // 热力学状态参数
  private tempHigh = 600;       // 高温热源温度，单位：K
  private tempLow = 300;        // 低温热源温度，单位：K
  private compressionRatio = 2.2; // 压缩比 V2 / V1
  private gasMoles = 0.10;      // 气体摩尔数，单位：mol
  private readonly gamma = 1.40;// 双原子气体绝热指数 (热容比)
  private readonly R_GAS = 8.314;// 摩尔气体常数，单位：J/(mol·K)

  // 运行状态
  private isRunning = true;
  private isReversed = false;
  private operationMode: 'continuous' | 'step' = 'continuous';
  private showParticles = true;
  private theta = 0;            // 飞轮/曲轴转角 [0, 2pi)
  private angularVelocity = 4.2;// 角速度，单位：rad/s
  private speedMultiplier = 1.0;

  // 预计算循环特征量
  private v1 = 1.50; // 状态点 1 体积，单位：L
  private v2 = 3.30; // 状态点 2 体积，单位：L
  private v3 = 5.65; // 状态点 3 体积，单位：L
  private v4 = 2.57; // 状态点 4 体积，单位：L
  private p1 = 332.6; // 状态点 1 压强，单位：kPa
  private p2 = 151.2; // 状态点 2 压强，单位：kPa
  private p3 = 44.1;  // 状态点 3 压强，单位：kPa
  private p4 = 97.0;  // 状态点 4 压强，单位：kPa
  private s1 = 1.0;   // 状态点 1 熵值，单位：J/K
  private s2 = 1.65;  // 状态点 2 熵值，单位：J/K
  private qHigh = 393.5;// 吸热量，单位：J
  private qLow = 196.7; // 放热量，单位：J
  private netWork = 196.8;// 净做功量，单位：J
  private efficiency = 50.0;// 热机效率，单位：%

  // 遥测数据缓存
  private currentStage: 1 | 2 | 3 | 4 = 1;
  private stageProgress = 0;
  private currentTemp = 600;
  private currentVol = 1.50;
  private currentPress = 332.6;
  private currentEntropy = 1.0;

  public init(_context: ExperimentContext): void {
    // 将实验主体直接放置于前方交互区的台面上
    this.rootGroup.position.set(0, -0.056, 0.92);

    // 1. 高精度 3D 运动学曲柄飞轮卡诺热机
    this.engine = this.track(new CarnotEngineMesh());
    this.rootGroup.add(this.engine.group);
    this.addDisposable(() => this.engine.dispose());

    // 2. 石英气缸内微观分子气体运动模拟
    this.molecularSystem = this.track(new CarnotMolecularSystem());
    this.molecularSystem.group.position.copy(this.engine.cylinderCenter);
    this.rootGroup.add(this.molecularSystem.group);
    this.molecularSystem.setVisible(this.showParticles);
    this.addDisposable(() => this.molecularSystem.dispose());

    // 3. 3D 交互管理器
    this.interactionManager = new CarnotInteractionManager({
      engine: this.engine,
      onToggleRunning: () => this.toggleRunning(),
      onToggleDirection: () => this.toggleDirection(),
      onRotateFlywheel: (deltaTheta) => this.rotateFlywheelManually(deltaTheta),
    });

    this.recalculateCycleMath();
  }

  /**
   * 重新计算热力学循环的四个顶点状态与循环不变量
   */
  private recalculateCycleMath(): void {
    // 1. 最小体积 V1（位于上止点 TDC）
    this.v1 = 1.50;

    // 2. 等温膨胀体积 V2
    this.v2 = this.v1 * this.compressionRatio;

    // 3. 绝热膨胀至低温 Tc: Th * V2^(gamma-1) = Tc * V3^(gamma-1)
    const tempRatio = this.tempHigh / this.tempLow;
    const volExpansionFactor = Math.pow(tempRatio, 1 / (this.gamma - 1));
    this.v3 = this.v2 * volExpansionFactor;

    // 4. 从 V4 到 V1 绝热压缩至高温 Th:
    this.v4 = this.v1 * volExpansionFactor;

    // 4 个顶点的压强 (P = nRT / V)，单位 kPa（V 为升，R 为 8.314 J/mol·K）
    // 1 mol * 8.314 J/(mol K) * K / (10^-3 m^3) = 8.314 kPa·L
    const R_KPA = 8.314;
    this.p1 = (this.gasMoles * R_KPA * this.tempHigh) / this.v1;
    this.p2 = (this.gasMoles * R_KPA * this.tempHigh) / this.v2;
    this.p3 = (this.gasMoles * R_KPA * this.tempLow) / this.v3;
    this.p4 = (this.gasMoles * R_KPA * this.tempLow) / this.v4;

    // 熵与热量
    const deltaS = this.gasMoles * this.R_GAS * Math.log(this.v2 / this.v1);
    this.s1 = 1.0;
    this.s2 = this.s1 + deltaS;

    this.qHigh = this.gasMoles * this.R_GAS * this.tempHigh * Math.log(this.v2 / this.v1);
    this.qLow = this.gasMoles * this.R_GAS * this.tempLow * Math.log(this.v2 / this.v1);
    this.netWork = this.qHigh - this.qLow;
    this.efficiency = ((this.tempHigh - this.tempLow) / this.tempHigh) * 100;

    // 基于净做功和温差梯度的动态稳态角速度
    const baseW = Math.max(1.0, Math.sqrt((this.tempHigh - this.tempLow) / 300) * 4.5);
    this.angularVelocity = baseW;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    // 1. 更新飞轮运动学
    if (this.isRunning && this.operationMode === 'continuous') {
      const dirSign = this.isReversed ? -1 : 1;
      const dTheta = this.angularVelocity * this.speedMultiplier * delta * dirSign;
      this.theta = (this.theta + dTheta) % (Math.PI * 2);
      if (this.theta < 0) this.theta += Math.PI * 2;
    }

    // 2. 求解 3D 连杆几何运动
    const kin = this.engine.updateKinematics(this.theta);

    // 3. 根据曲轴转角 theta 插值计算热力学循环瞬时状态
    this.evaluateInstantaneousState();

    // 4. 更新热机视觉特效、灯光与导热板材质
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);

    // 5. 更新微观分子气体动力学
    if (this.showParticles) {
      this.molecularSystem.setThermodynamicState(this.currentTemp, kin.pistonHeight);
      this.molecularSystem.update(delta);
    }
  }

  /**
   * 根据当前曲轴循环转角求解精确瞬时状态 (P, V, T, S)
   */
  private evaluateInstantaneousState(): void {
    // 整个曲轴圆周 (2pi) 分为 4 个循环冲程阶段
    // 阶段 1 (0 至 pi/2): 高温等温膨胀 (Th)
    // 阶段 2 (pi/2 至 pi): 绝热膨胀 (Th -> Tc)
    // 阶段 3 (pi 至 3pi/2): 低温等温压缩 (Tc)
    // 阶段 4 (3pi/2 至 2pi): 绝热压缩 (Tc -> Th)

    const normAngle = this.theta / (Math.PI * 2); // 归一化角度 [0, 1)
    const stageIndex = Math.floor(normAngle * 4); // 阶段索引 0, 1, 2, 3
    this.stageProgress = (normAngle * 4) % 1;
    this.currentStage = (stageIndex + 1) as 1 | 2 | 3 | 4;

    const u = this.stageProgress;
    const R_KPA = 8.314;

    if (this.currentStage === 1) {
      // 高温 Th 下等温膨胀：体积从 v1 增加到 v2
      this.currentTemp = this.tempHigh;
      this.currentVol = this.v1 + (this.v2 - this.v1) * u;
      this.currentPress = (this.gasMoles * R_KPA * this.tempHigh) / this.currentVol;
      this.currentEntropy = this.s1 + (this.s2 - this.s1) * u;
    } else if (this.currentStage === 2) {
      // 绝热膨胀：体积从 v2 增加到 v3，温度由 Th 降至 Tc
      this.currentVol = this.v2 + (this.v3 - this.v2) * u;
      this.currentTemp = this.tempHigh * Math.pow(this.v2 / this.currentVol, this.gamma - 1);
      this.currentPress = (this.gasMoles * R_KPA * this.currentTemp) / this.currentVol;
      this.currentEntropy = this.s2;
    } else if (this.currentStage === 3) {
      // 低温 Tc 下等温压缩：体积从 v3 减小到 v4
      this.currentTemp = this.tempLow;
      this.currentVol = this.v3 - (this.v3 - this.v4) * u;
      this.currentPress = (this.gasMoles * R_KPA * this.tempLow) / this.currentVol;
      this.currentEntropy = this.s2 - (this.s2 - this.s1) * u;
    } else {
      // 绝热压缩：体积从 v4 减小到 v1，温度由 Tc 升至 Th
      this.currentVol = this.v4 - (this.v4 - this.v1) * u;
      this.currentTemp = this.tempLow * Math.pow(this.v4 / this.currentVol, this.gamma - 1);
      this.currentPress = (this.gasMoles * R_KPA * this.currentTemp) / this.currentVol;
      this.currentEntropy = this.s1;
    }
  }

  // =========================================================================
  // UI 状态卡片遥测数据提供器
  // =========================================================================
  public getCarnotTelemetry(): CarnotTelemetryData {
    const stageNames: Record<number, string> = {
      1: this.isReversed ? '等温放热 (逆向排热)' : '等温膨胀 (吸热做功)',
      2: this.isReversed ? '绝热压缩 (耗功升温)' : '绝热膨胀 (做功降温)',
      3: this.isReversed ? '等温吸热 (逆向深冷)' : '等温压缩 (放热耗功)',
      4: this.isReversed ? '绝热膨胀 (降温归零)' : '绝热压缩 (耗功升温)',
    };

    const freqHz = (this.angularVelocity * this.speedMultiplier) / (Math.PI * 2);
    const rpm = this.isRunning ? Math.round(freqHz * 60) : 0;
    const powerW = this.isRunning ? this.netWork * freqHz : 0;

    return {
      tempHigh: this.tempHigh,
      tempLow: this.tempLow,
      currentTemp: this.currentTemp,
      currentVol: this.currentVol,
      currentPress: this.currentPress,
      currentEntropy: this.currentEntropy,
      efficiency: this.efficiency,
      qHigh: this.qHigh,
      qLow: this.qLow,
      netWork: this.netWork,
      mechPower: powerW,
      flywheelRpm: rpm,
      currentStage: this.currentStage,
      stageName: stageNames[this.currentStage] || '稳态循环',
      stageProgress: this.stageProgress,
      isReversed: this.isReversed,
      isRunning: this.isRunning,
      v1: this.v1,
      v2: this.v2,
      v3: this.v3,
      v4: this.v4,
      p1: this.p1,
      p2: this.p2,
      p3: this.p3,
      p4: this.p4,
      s1: this.s1,
      s2: this.s2,
    };
  }

  // 兼容通用热力学遥测查询的后备调用
  public getThermodynamicTelemetry(): any {
    return this.getCarnotTelemetry();
  }

  // =========================================================================
  // 交互控制处理函数
  // =========================================================================
  public setTempHigh(tempK: number): void {
    this.tempHigh = Math.max(this.tempLow + 30, tempK);
    this.recalculateCycleMath();
  }

  public setTempLow(tempK: number): void {
    this.tempLow = Math.min(this.tempHigh - 30, tempK);
    this.recalculateCycleMath();
  }

  public toggleRunning(): void {
    this.isRunning = !this.isRunning;
    this.engine.setRunning(this.isRunning);
  }

  public toggleDirection(): void {
    this.isReversed = !this.isReversed;
    this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
  }

  public stepStage(step: 1 | -1): void {
    this.operationMode = 'step';
    const deltaQuarter = (Math.PI * 0.5) * step;
    this.theta = (this.theta + deltaQuarter) % (Math.PI * 2);
    if (this.theta < 0) this.theta += Math.PI * 2;
    this.engine.updateKinematics(this.theta);
    this.evaluateInstantaneousState();
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);
  }

  public rotateFlywheelManually(deltaTheta: number): void {
    this.theta = (this.theta + deltaTheta) % (Math.PI * 2);
    if (this.theta < 0) this.theta += Math.PI * 2;
    this.engine.updateKinematics(this.theta);
    this.evaluateInstantaneousState();
    this.engine.setCycleState(this.currentStage, this.stageProgress, this.currentTemp, this.isReversed);
  }

  public applyPreset(preset: 'steam' | 'extreme' | 'stirling' | 'refrig'): void {
    if (preset === 'steam') {
      this.tempHigh = 650;
      this.tempLow = 300;
      this.compressionRatio = 2.2;
      this.isReversed = false;
    } else if (preset === 'extreme') {
      this.tempHigh = 950;
      this.tempLow = 200;
      this.compressionRatio = 2.8;
      this.isReversed = false;
    } else if (preset === 'stirling') {
      this.tempHigh = 360;
      this.tempLow = 290;
      this.compressionRatio = 1.6;
      this.isReversed = false;
    } else if (preset === 'refrig') {
      this.tempHigh = 320;
      this.tempLow = 240;
      this.compressionRatio = 1.8;
      this.isReversed = true;
    }
    this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
    this.recalculateCycleMath();
  }

  public override onParameterChange(paramId: string, value: any): void {
    if (paramId === 'tempHigh') {
      this.setTempHigh(Number(value));
    } else if (paramId === 'tempLow') {
      this.setTempLow(Number(value));
    } else if (paramId === 'compressionRatio') {
      this.compressionRatio = Number(value);
      this.recalculateCycleMath();
    } else if (paramId === 'gasMoles') {
      this.gasMoles = Number(value);
      this.recalculateCycleMath();
    } else if (paramId === 'cycleDirection') {
      this.isReversed = value === 'reverse';
      this.engine.setDirection(this.isReversed ? 'reverse' : 'forward');
    } else if (paramId === 'operationMode') {
      this.operationMode = value as 'continuous' | 'step';
    } else if (paramId === 'showParticles') {
      this.showParticles = Boolean(value);
      this.molecularSystem.setVisible(this.showParticles);
    }
  }

  // =========================================================================
  // 指针与射线检测委托给 CarnotInteractionManager
  // =========================================================================
  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event, context);
  }
}
