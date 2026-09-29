/**
 * 高精度最小二乘法线性回归求解器
 * 用于力学实验 HUD 状态卡片中的动态曲线拟合。
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  valid: boolean;
  count: number;
}

export function calculateLinearFit(points: Point2D[]): LinearRegressionResult {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0, valid: false, count: n };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = points[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) {
    return { slope: 0, intercept: sumY / n, r2: 0, valid: false, count: n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // 计算决定系数 R^2 (拟合优度)
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = points[i];
    const yPred = slope * x + intercept;
    ssTot += (y - meanY) * (y - meanY);
    ssRes += (y - yPred) * (y - yPred);
  }

  const r2 = ssTot < 1e-12 ? 1.0 : Math.max(0, 1.0 - ssRes / ssTot);

  return {
    slope,
    intercept,
    r2,
    valid: true,
    count: n,
  };
}
