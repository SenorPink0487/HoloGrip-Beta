/**
 * HoloGrip Classical Mechanics Physical Constants & Presets
 */

export const STANDARD_GRAVITY = 9.80; // m/s^2 (Standard Earth gravity)

export const GRAVITY_PRESETS = {
  earth: { name: '地球', g: 9.80 },
  moon: { name: '月球', g: 1.62 },
  mars: { name: '火星', g: 3.72 },
  jupiter: { name: '木星', g: 24.79 },
} as const;

export const TICKER_FREQUENCY_HZ = 50.0; // 50 Hz electric spark ticker
export const TICKER_PERIOD_S = 1.0 / TICKER_FREQUENCY_HZ; // 0.02 s per tick

export const DEFAULT_PHOTOGATE_WIDTH_M = 0.010; // 10 mm shutter width

export const MATERIAL_DENSITIES_KG_M3 = {
  steel: 7850,
  copper: 8960,
  aluminum: 2700,
  wood: 700,
} as const;
