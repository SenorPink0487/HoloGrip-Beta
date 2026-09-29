/**
 * HoloGrip 经典力学物理常数与预设配置
 */

export const STANDARD_GRAVITY = 9.80; // m/s^2 (标准地球重力加速度)

export const GRAVITY_PRESETS = {
  earth: { name: '地球', g: 9.80 },
  moon: { name: '月球', g: 1.62 },
  mars: { name: '火星', g: 3.72 },
  jupiter: { name: '木星', g: 24.79 },
} as const;

export const TICKER_FREQUENCY_HZ = 50.0; // 50 Hz 电火花打点计时器频率
export const TICKER_PERIOD_S = 1.0 / TICKER_FREQUENCY_HZ; // 打点周期 0.02 s
 
export const DEFAULT_PHOTOGATE_WIDTH_M = 0.010; // 挡光片默认宽度 10 mm

export const MATERIAL_DENSITIES_KG_M3 = {
  steel: 7850,
  copper: 8960,
  aluminum: 2700,
  wood: 700,
} as const;
