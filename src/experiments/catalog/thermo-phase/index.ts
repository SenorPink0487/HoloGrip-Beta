import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { PhaseCalorimeterMesh } from '../../../scene/thermo/PhaseCalorimeterMesh.ts';
import type { PhaseTelemetryData } from '../../../ui/vision/PhaseStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoPhaseExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D 场景装配组件
  private calorimeter: PhaseCalorimeterMesh;

  // 物理参数
  private heatPowerW = 800;      // 加热功率，单位：W
  private substanceMassKg = 0.15; // 物质质量: 150g = 0.15 kg
  private initialTempK = 253.15;  // 初始温度: -20°C
  private timeAcceleration = 5.0; // 5倍演示加速
  private isHeating = true;

  // 水 (H2O) 的物理常数
  private readonly cIce = 2100;     // 冰的比热容，单位：J/(kg·K)
  private readonly cWater = 4184;   // 水的比热容，单位：J/(kg·K)
  private readonly cSteam = 2000;   // 水蒸气的比热容，单位：J/(kg·K)
  private readonly LMelting = 334000;// 熔化潜热，单位：J/kg (334 kJ/kg)
  private readonly LBoiling = 2260000;// 汽化潜热，单位：J/kg (2260 kJ/kg)

  // 动态状态变量
  private currentTempK = 253.15;
  private totalEnergyJ = 0;
  private timeElapsedS = 0;
  private entropyJPerK = 0;

  private meltingEnergyAccum = 0;
  private boilingEnergyAccum = 0;

  private iceFraction = 1.0;
  private waterFraction = 0.0;
  private vaporFraction = 0.0;
  private isBoiling = false;

  private currentStage: 'subzero_ice' | 'melting_plateau' | 'liquid_water' | 'boiling_plateau' | 'superheated_steam' = 'subzero_ice';

  // 曲线历史采样记录
  private timeHistory: number[] = [0];
  private tempHistory: number[] = [-20];
  private lastSampleTime = 0;

  public init(_context: ExperimentContext): void {
    // 直接置于前方交互区台面上
    this.rootGroup.position.set(0, -0.056, 0.92);

    // 1. 高精度 3D 量热计实验装置
    this.calorimeter = this.track(new PhaseCalorimeterMesh());
    this.rootGroup.add(this.calorimeter.group);
    this.addDisposable(() => this.calorimeter.dispose());

    this.resetExperiment();
  }

  public resetExperiment(): void {
    this.currentTempK = this.initialTempK;
    this.totalEnergyJ = 0;
    this.timeElapsedS = 0;
    this.entropyJPerK = 0;
    this.meltingEnergyAccum = 0;
    this.boilingEnergyAccum = 0;
    this.iceFraction = 1.0;
    this.waterFraction = 0.0;
    this.vaporFraction = 0.0;
    this.isBoiling = false;
    this.currentStage = 'subzero_ice';

    this.timeHistory = [0];
    this.tempHistory = [this.currentTempK - 273.15];
    this.lastSampleTime = 0;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    const dt = Math.min(delta, 0.033);

    if (this.isHeating) {
      const simDt = dt * this.timeAcceleration;
      this.timeElapsedS += simDt;

      const dQ = this.heatPowerW * simDt;
      this.totalEnergyJ += dQ;
      this.entropyJPerK += dQ / Math.max(100, this.currentTempK);

      this.stepPhaseThermodynamics(dQ);

      // 模拟时间每隔约 0.5s 记录一次曲线采样点
      if (this.timeElapsedS - this.lastSampleTime >= 0.5) {
        this.lastSampleTime = this.timeElapsedS;
        this.timeHistory.push(this.timeElapsedS);
        this.tempHistory.push(this.currentTempK - 273.15);

        // 保留最近 300 个采样点
        if (this.timeHistory.length > 300) {
          this.timeHistory.shift();
          this.tempHistory.shift();
        }
      }
    }

    // 2. 更新 3D 实验装置视觉状态
    this.calorimeter.setPhaseState(
      this.currentTempK,
      this.iceFraction,
      this.waterFraction,
      this.vaporFraction,
      this.isBoiling,
      this.isHeating ? this.heatPowerW : 0,
      dt
    );
  }

  private stepPhaseThermodynamics(dQ: number): void {
    const m = this.substanceMassKg;
    const T_MELT = 273.15; // 0°C
    const T_BOIL = 373.15; // 100°C

    if (this.currentStage === 'subzero_ice') {
      // 1. 固态冰显热升温: Q = m * c_ice * dT
      this.iceFraction = 1.0;
      this.waterFraction = 0.0;
      this.vaporFraction = 0.0;
      this.isBoiling = false;

      const dT = dQ / (m * this.cIce);
      this.currentTempK += dT;

      if (this.currentTempK >= T_MELT) {
        this.currentTempK = T_MELT;
        this.currentStage = 'melting_plateau';
        this.meltingEnergyAccum = 0;
      }
    } else if (this.currentStage === 'melting_plateau') {
      // 2. 0°C 熔化潜热平台 (Q = m * L_melting)
      this.currentTempK = T_MELT;
      this.isBoiling = false;

      this.meltingEnergyAccum += dQ;
      const totalMeltingNeeded = m * this.LMelting;

      const frac = THREE.MathUtils.clamp(this.meltingEnergyAccum / totalMeltingNeeded, 0, 1);
      this.waterFraction = frac;
      this.iceFraction = 1.0 - frac;
      this.vaporFraction = 0.0;

      if (this.meltingEnergyAccum >= totalMeltingNeeded) {
        this.currentStage = 'liquid_water';
        this.iceFraction = 0.0;
        this.waterFraction = 1.0;
      }
    } else if (this.currentStage === 'liquid_water') {
      // 3. 液态水显热升温: Q = m * c_water * dT
      this.iceFraction = 0.0;
      this.waterFraction = 1.0;
      this.vaporFraction = 0.0;
      this.isBoiling = false;

      const dT = dQ / (m * this.cWater);
      this.currentTempK += dT;

      if (this.currentTempK >= T_BOIL) {
        this.currentTempK = T_BOIL;
        this.currentStage = 'boiling_plateau';
        this.boilingEnergyAccum = 0;
      }
    } else if (this.currentStage === 'boiling_plateau') {
      // 4. 100°C 沸腾汽化潜热平台 (Q = m * L_boiling)
      this.currentTempK = T_BOIL;
      this.isBoiling = true;

      this.boilingEnergyAccum += dQ;
      const totalBoilingNeeded = m * this.LBoiling;

      const frac = THREE.MathUtils.clamp(this.boilingEnergyAccum / totalBoilingNeeded, 0, 1);
      this.vaporFraction = frac;
      this.waterFraction = 1.0 - frac;
      this.iceFraction = 0.0;

      if (this.boilingEnergyAccum >= totalBoilingNeeded) {
        this.currentStage = 'superheated_steam';
        this.waterFraction = 0.0;
        this.vaporFraction = 1.0;
        this.isBoiling = false;
      }
    } else {
      // 5. 过热蒸汽显热升温: Q = m * c_steam * dT
      this.iceFraction = 0.0;
      this.waterFraction = 0.0;
      this.vaporFraction = 1.0;
      this.isBoiling = false;

      const dT = dQ / (m * this.cSteam);
      this.currentTempK += dT;
    }
  }

  // =========================================================================
  // UI 状态卡片遥测数据提供器
  // =========================================================================
  public getPhaseTelemetry(): PhaseTelemetryData {
    const stageNames: Record<string, string> = {
      subzero_ice: '固态冰相 · 显热升温 (T < 0°C)',
      melting_plateau: '固液共存 · 冰晶融化潜热平台 (0°C)',
      liquid_water: '液态水相 · 显热升温 (0°C ~ 100°C)',
      boiling_plateau: '剧烈沸腾 · 汽化潜热平台 (100°C)',
      superheated_steam: '过热蒸汽 · 气态显热升温 (T > 100°C)',
    };

    return {
      temperatureK: this.currentTempK,
      temperatureC: this.currentTempK - 273.15,
      heatPowerW: this.heatPowerW,
      substanceMassG: Math.round(this.substanceMassKg * 1000),
      totalEnergyKj: this.totalEnergyJ / 1000,
      timeElapsedS: this.timeElapsedS,
      iceFraction: this.iceFraction,
      waterFraction: this.waterFraction,
      vaporFraction: this.vaporFraction,
      entropyJPerK: this.entropyJPerK,
      currentPhaseStage: this.currentStage,
      phaseStageName: stageNames[this.currentStage] || '热平衡相态',
      isBoiling: this.isBoiling,
      isHeating: this.isHeating,
      timePoints: Array.from(this.timeHistory),
      tempPoints: Array.from(this.tempHistory),
    };
  }

  public getThermodynamicTelemetry(): any {
    return this.getPhaseTelemetry();
  }

  // =========================================================================
  // 交互控制处理函数
  // =========================================================================
  public setHeatPower(powerW: number): void {
    this.heatPowerW = Math.max(100, Math.min(2000, powerW));
  }

  public setSubstanceMass(massG: number): void {
    this.substanceMassKg = Math.max(50, Math.min(500, massG)) / 1000;
  }

  public setTimeAcceleration(scale: number): void {
    this.timeAcceleration = scale;
  }

  public toggleHeating(): void {
    this.isHeating = !this.isHeating;
  }

  public override onParameterChange(paramId: string, value: any): void {
    if (paramId === 'heatPower') {
      this.setHeatPower(Number(value));
    } else if (paramId === 'substanceMass') {
      this.setSubstanceMass(Number(value));
    } else if (paramId === 'timeAcceleration') {
      this.setTimeAcceleration(Number(value));
    } else if (paramId === 'initialTemp') {
      this.initialTempK = Number(value);
      this.resetExperiment();
    }
  }
}
