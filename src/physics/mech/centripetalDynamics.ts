/**
 * 匀速圆周运动与向心力探究实验动力学
 */

export interface CentripetalConfig {
  massKg: number;              // 质量 m (kg)
  radiusM: number;            // 旋转半径 r (m)
  angularVelocityRadS: number;// 角速度 omega (rad/s)
  springConstantNpm?: number; // 测力计弹簧劲度系数 k (N/m)
}

export interface CentripetalTelemetry {
  massKg: number;
  radiusM: number;
  angularVelocityRadS: number;
  frequencyHz: number;        // 转动频率 f = omega / (2 * pi)
  linearVelocityMs: number;   // 线速度 v = omega * r
  centripetalAccMs2: number;  // 向心加速度 an = omega^2 * r
  centripetalForceN: number;  // 向心力 Fn = m * omega^2 * r
  springDisplacementMm: number; // 指针弹簧伸长量 (mm)
  indicatorScaleMarks: number;  // 刻度线格数 (每格 0.5 N)
}

export function solveCentripetalDynamics(config: CentripetalConfig): CentripetalTelemetry {
  const m = Math.max(0.01, config.massKg);
  const r = Math.max(0.01, config.radiusM);
  const omega = Math.max(0.1, config.angularVelocityRadS);
  const k = config.springConstantNpm ?? 500.0;

  const frequencyHz = omega / (2 * Math.PI);
  const linearVelocityMs = omega * r;
  const centripetalAccMs2 = omega * omega * r;
  const centripetalForceN = m * centripetalAccMs2;

  const springDisplacementM = centripetalForceN / k;
  const springDisplacementMm = springDisplacementM * 1000.0;
  const indicatorScaleMarks = centripetalForceN / 0.5; // 每格刻度对应 0.5 N

  return {
    massKg: m,
    radiusM: r,
    angularVelocityRadS: omega,
    frequencyHz,
    linearVelocityMs,
    centripetalAccMs2,
    centripetalForceN,
    springDisplacementMm,
    indicatorScaleMarks,
  };
}
