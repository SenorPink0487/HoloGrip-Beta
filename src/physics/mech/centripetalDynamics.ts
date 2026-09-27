/**
 * Uniform Circular Motion & Centripetal Force Inquiry
 */

export interface CentripetalConfig {
  massKg: number;              // m (kg)
  radiusM: number;            // r (m)
  angularVelocityRadS: number;// omega (rad/s)
  springConstantNpm?: number; // k (N/m) for indicator spring
}

export interface CentripetalTelemetry {
  massKg: number;
  radiusM: number;
  angularVelocityRadS: number;
  frequencyHz: number;        // f = omega / (2 pi)
  linearVelocityMs: number;   // v = omega * r
  centripetalAccMs2: number;  // an = omega^2 * r
  centripetalForceN: number;  // Fn = m * omega^2 * r
  springDisplacementMm: number; // Indicator displacement
  indicatorScaleMarks: number;  // 1 mark per 0.5 N
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
  const indicatorScaleMarks = centripetalForceN / 0.5; // 0.5 N per mark

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
