/**
 * 经典RC电路电容器充放电与暂态动力学物理计算引擎
 * 严密遵循电磁学与电路理论方程：
 * 
 * 1. 充电过程（开关掷于电源侧，回路包含电源E、限流电阻R_ch、电流传感器与电容器C）：
 *    回路方程：E = i(t) * R_ch + u_c(t)
 *    电容方程：i(t) = C * du_c / dt
 *    解析解（初态 u_c0）：
 *      u_c(t) = E + (u_c0 - E) * exp(-t / (R_ch * C))
 *      i(t)   = ((E - u_c0) / R_ch) * exp(-t / (R_ch * C))
 *    时间常数：tau_ch = R_ch * C
 * 
 * 2. 放电过程（开关掷于放电侧，回路包含电容器C、电流传感器与放电电阻R_dis）：
 *    回路方程：u_c(t) + i(t) * R_dis = 0 （取流入电容正极方向为正，放电时电流反向流出）
 *    解析解（初态 u_c0）：
 *      u_c(t) = u_c0 * exp(-t / (R_dis * C))
 *      i(t)   = - (u_c0 / R_dis) * exp(-t / (R_dis * C))
 *    时间常数：tau_dis = R_dis * C
 * 
 * 3. 断开中立状态（开关处于中间空档）：
 *    i(t) = 0, u_c(t) = const (极微弱自放电)
 */

export type SwitchPosition = 'charge' | 'neutral' | 'discharge';

export interface CapacitorCircuitParams {
  voltageSupply: number;         // 电源电压 E，单位：V，默认 10.0 V
  capacitanceMicroFarad: number; // 电容 C，单位：µF，默认 1000 µF
  dischargeResistance: number;   // 放电电阻 R_dis，单位：Ω，默认 1000 Ω
  chargeResistance: number;      // 充电电阻 R_ch，单位：Ω，默认 1000 Ω
}

export interface WaveformSample {
  time: number;                  // 实验时间 t，单位：s
  currentMa: number;             // 瞬时电流 I，单位：mA（充电为正，放电为负）
  voltageCapacitor: number;      // 电容器两端电压 U_c，单位：V
  state: SwitchPosition;         // 开关档位状态
}

export interface CapacitorTelemetry {
  time: number;
  switchPosition: SwitchPosition;
  currentMa: number;
  voltageCapacitor: number;
  voltageSupply: number;
  capacitanceUf: number;
  dischargeResistanceOhm: number;
  chargeResistanceOhm: number;
  activeResistanceOhm: number;
  chargeMilliCoulomb: number;    // Q = C * U_c (mC)
  energyMilliJoule: number;      // W = 1/2 * C * U_c^2 (mJ)
  timeConstantTau: number;       // tau = R * C (s)
  chargeIntegratedMilliCoulomb: number;   // 充电阶段电流积分所得电量 Q_ch = ∫ I dt (mC)
  dischargeIntegratedMilliCoulomb: number;// 放电阶段电流积分所得电量 Q_dis = ∫ |I| dt (mC)
  peakChargeCurrentMa: number;
  peakDischargeCurrentMa: number;
  sampleCount: number;
}

export class CapacitorDischargeModel {
  // 电路元件科研参数
  public voltageSupply = 10.0;          // V
  public capacitanceMicroFarad = 1000.0; // µF (1.0e-3 F)
  public dischargeResistance = 1000.0;   // Ω
  public chargeResistance = 1000.0;      // Ω

  // 运行暂态状态
  public switchPosition: SwitchPosition = 'neutral';
  public voltageCapacitor = 0.0;         // U_c (V)
  public currentMa = 0.0;                // I (mA)
  public simTime = 0.0;                  // s

  // 统计与积分指标
  public chargeIntegratedMilliCoulomb = 0.0;
  public dischargeIntegratedMilliCoulomb = 0.0;
  public peakChargeCurrentMa = 0.0;
  public peakDischargeCurrentMa = 0.0;

  // 采样波形缓冲区
  private samples: WaveformSample[] = [];
  public maxSampleBuffer = 4000;
  private sampleAccumulator = 0;
  private readonly sampleInterval = 0.01; // 100 Hz 采样率以精准捕捉 RC 瞬态尖峰

  constructor(params?: Partial<CapacitorCircuitParams>) {
    if (params) {
      if (params.voltageSupply !== undefined) this.voltageSupply = params.voltageSupply;
      if (params.capacitanceMicroFarad !== undefined) this.capacitanceMicroFarad = params.capacitanceMicroFarad;
      if (params.dischargeResistance !== undefined) this.dischargeResistance = params.dischargeResistance;
      if (params.chargeResistance !== undefined) this.chargeResistance = params.chargeResistance;
    }

    // 初始采样点
    this.recordSample();
  }

  /**
   * 切换单刀双掷开关掷向
   */
  public setSwitchPosition(pos: SwitchPosition): void {
    if (this.switchPosition === pos) return;
    this.switchPosition = pos;

    // 立即重新计算切刀瞬时的初态瞬时电流
    this.computeInstantaneousCurrent();
    this.recordSample();
  }

  /**
   * 动力学步进求解：采用解析指数积分，确保高时间精度与数值零发散
   */
  public step(dt: number): void {
    if (dt <= 0) return;
    // 限制单帧最大时间步长，防止后台切换标签后巨幅跳帧
    const clampedDt = Math.min(dt, 0.1);

    const C_Farad = this.capacitanceMicroFarad * 1e-6;

    if (this.switchPosition === 'charge') {
      const R = Math.max(10.0, this.chargeResistance);
      const tau = R * C_Farad;
      const decay = Math.exp(-clampedDt / tau);

      // u_c(t + dt) = E + (u_c(t) - E) * exp(-dt / tau)
      const u0 = this.voltageCapacitor;
      this.voltageCapacitor = this.voltageSupply + (u0 - this.voltageSupply) * decay;

      // i(t + dt) = (E - u_c(t + dt)) / R (单位：A -> mA)
      const iAmp = (this.voltageSupply - this.voltageCapacitor) / R;
      this.currentMa = iAmp * 1000.0;

      // 梯形数值积分累计电荷量：Q_ch = ∫ i dt (mC)
      const avgCurrentMa = ((this.voltageSupply - u0) / R * 1000.0 + this.currentMa) * 0.5;
      if (avgCurrentMa > 0) {
        this.chargeIntegratedMilliCoulomb += avgCurrentMa * clampedDt;
      }
      if (this.currentMa > this.peakChargeCurrentMa) {
        this.peakChargeCurrentMa = this.currentMa;
      }
    } else if (this.switchPosition === 'discharge') {
      const R = Math.max(10.0, this.dischargeResistance);
      const tau = R * C_Farad;
      const decay = Math.exp(-clampedDt / tau);

      // u_c(t + dt) = u_c(t) * exp(-dt / tau)
      const u0 = this.voltageCapacitor;
      this.voltageCapacitor = u0 * decay;

      // i(t + dt) = - u_c(t + dt) / R (单位：A -> mA，电流流向反向)
      const iAmp = - this.voltageCapacitor / R;
      this.currentMa = iAmp * 1000.0;

      // 累计放电电荷量：Q_dis = ∫ |i| dt (mC)
      const avgCurrentMa = Math.abs(( - u0 / R * 1000.0 + this.currentMa) * 0.5);
      this.dischargeIntegratedMilliCoulomb += avgCurrentMa * clampedDt;

      if (Math.abs(this.currentMa) > this.peakDischargeCurrentMa) {
        this.peakDischargeCurrentMa = Math.abs(this.currentMa);
      }
    } else {
      // 中立断开状态：无电流，极低漏电 (10 MΩ 漏电阻)
      this.currentMa = 0.0;
      const rLeak = 1e7;
      const tauLeak = rLeak * C_Farad;
      this.voltageCapacitor *= Math.exp(-clampedDt / tauLeak);
    }

    this.simTime += clampedDt;

    // 定频采样存入时间序列波形缓冲区
    this.sampleAccumulator += clampedDt;
    if (this.sampleAccumulator >= this.sampleInterval) {
      this.sampleAccumulator = 0;
      this.recordSample();
    }
  }

  private computeInstantaneousCurrent(): void {
    const C_Farad = this.capacitanceMicroFarad * 1e-6;
    if (this.switchPosition === 'charge') {
      const R = Math.max(10.0, this.chargeResistance);
      const iAmp = (this.voltageSupply - this.voltageCapacitor) / R;
      this.currentMa = iAmp * 1000.0;
      if (this.currentMa > this.peakChargeCurrentMa) {
        this.peakChargeCurrentMa = this.currentMa;
      }
    } else if (this.switchPosition === 'discharge') {
      const R = Math.max(10.0, this.dischargeResistance);
      const iAmp = - this.voltageCapacitor / R;
      this.currentMa = iAmp * 1000.0;
      if (Math.abs(this.currentMa) > this.peakDischargeCurrentMa) {
        this.peakDischargeCurrentMa = Math.abs(this.currentMa);
      }
    } else {
      this.currentMa = 0.0;
    }
  }

  private recordSample(): void {
    this.samples.push({
      time: Number(this.simTime.toFixed(3)),
      currentMa: Number(this.currentMa.toFixed(4)),
      voltageCapacitor: Number(this.voltageCapacitor.toFixed(4)),
      state: this.switchPosition,
    });

    if (this.samples.length > this.maxSampleBuffer) {
      // 保持滚动窗口，移除最老的一半采样点以减少数组开销
      this.samples.splice(0, 500);
    }
  }

  public getSamples(): readonly WaveformSample[] {
    return this.samples;
  }

  public clearSamples(): void {
    this.samples = [];
    this.simTime = 0;
    this.chargeIntegratedMilliCoulomb = 0;
    this.dischargeIntegratedMilliCoulomb = 0;
    this.peakChargeCurrentMa = 0;
    this.peakDischargeCurrentMa = 0;
    this.recordSample();
  }

  public resetExperiment(): void {
    this.switchPosition = 'neutral';
    this.voltageCapacitor = 0.0;
    this.currentMa = 0.0;
    this.clearSamples();
  }

  public setVoltageSupply(v: number): void {
    this.voltageSupply = Math.max(0.5, Math.min(30.0, v));
    this.computeInstantaneousCurrent();
  }

  public setCapacitance(cMicroFarad: number): void {
    this.capacitanceMicroFarad = Math.max(10.0, Math.min(10000.0, cMicroFarad));
  }

  public setDischargeResistance(rOhm: number): void {
    this.dischargeResistance = Math.max(10.0, Math.min(50000.0, rOhm));
    this.computeInstantaneousCurrent();
  }

  public setChargeResistance(rOhm: number): void {
    this.chargeResistance = Math.max(10.0, Math.min(50000.0, rOhm));
    this.computeInstantaneousCurrent();
  }

  public getTelemetry(): CapacitorTelemetry {
    const C_Farad = this.capacitanceMicroFarad * 1e-6;
    const activeR = this.switchPosition === 'charge' 
      ? this.chargeResistance 
      : (this.switchPosition === 'discharge' ? this.dischargeResistance : 0);
    const tau = (this.switchPosition === 'charge' ? this.chargeResistance : this.dischargeResistance) * C_Farad;

    const chargeMilliCoulomb = (C_Farad * this.voltageCapacitor) * 1000.0;
    const energyMilliJoule = (0.5 * C_Farad * this.voltageCapacitor * this.voltageCapacitor) * 1000.0;

    return {
      time: this.simTime,
      switchPosition: this.switchPosition,
      currentMa: this.currentMa,
      voltageCapacitor: this.voltageCapacitor,
      voltageSupply: this.voltageSupply,
      capacitanceUf: this.capacitanceMicroFarad,
      dischargeResistanceOhm: this.dischargeResistance,
      chargeResistanceOhm: this.chargeResistance,
      activeResistanceOhm: activeR,
      chargeMilliCoulomb,
      energyMilliJoule,
      timeConstantTau: tau,
      chargeIntegratedMilliCoulomb: this.chargeIntegratedMilliCoulomb,
      dischargeIntegratedMilliCoulomb: this.dischargeIntegratedMilliCoulomb,
      peakChargeCurrentMa: this.peakChargeCurrentMa,
      peakDischargeCurrentMa: this.peakDischargeCurrentMa,
      sampleCount: this.samples.length,
    };
  }
}
