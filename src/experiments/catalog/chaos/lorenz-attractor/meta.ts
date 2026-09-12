import type { ExperimentMetadata } from '../../../../core/types';

export const metadata: ExperimentMetadata = {
  id: 'lorenz-attractor',
  name: '洛伦兹混沌吸引子与蝴蝶效应',
  category: 'chaos',
  categoryName: '非线性混沌力学',
  description: '模拟常微分方程非线性动力系统中的典型奇怪吸引子（Strange Attractor）。展示轨迹在相空间中对初始条件的极端敏感性（蝴蝶效应）与确定性混沌。',
  tags: ['非线性动力学', '混沌理论', '蝴蝶效应', '相空间流线'],
  icon: '🦋',
  equation: 'dx/dt = σ(y-x), dy/dt = x(ρ-z)-y, dz/dt = xy-βz',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'sigma',
      name: '普朗特数 σ (Prandtl Number)',
      type: 'range',
      defaultValue: 10.0,
      min: 2.0,
      max: 20.0,
      step: 0.5,
    },
    {
      id: 'rho',
      name: '瑞利数 ρ (Rayleigh Number)',
      type: 'range',
      defaultValue: 28.0,
      min: 5.0,
      max: 50.0,
      step: 0.5,
    },
    {
      id: 'beta',
      name: '几何纵横比 β (Geometric Aspect)',
      type: 'range',
      defaultValue: 2.667,
      min: 0.5,
      max: 6.0,
      step: 0.1,
    },
    {
      id: 'flowSpeed',
      name: '演化步长 (Flow Speed)',
      type: 'range',
      defaultValue: 1.2,
      min: 0.2,
      max: 3.0,
      step: 0.1,
    },
  ],
};

export default metadata;
