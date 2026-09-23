import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-phase',
  name: '物态相变与潜热曲线',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description: '冰水相变与水蒸气汽化实验，记录恒定加热功率下升温-平台-升温过程，探究潜热与分子聚集态转化规律。',
  tags: ['热学', '相变', '熔化潜热', '汽化潜热', '加热曲线', '三相点'],
  icon: 'thermo',
  equation: 'Q = m \\cdot L \\quad \\Delta S = \\frac{Q_{rev}}{T}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'heatPower',
      name: '加热功率',
      type: 'range',
      defaultValue: 500,
      min: 100,
      max: 1200,
      step: 50,
      unit: 'W',
      description: '电加热底座供给恒定功率',
    },
  ],
};

export default metadata;
