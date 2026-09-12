import type { ExperimentMetadata } from '../../../../core/types';

export const metadata: ExperimentMetadata = {
  id: 'quantum-wave',
  name: '量子波包与双缝干涉实验',
  category: 'quantum',
  categoryName: '量子物理学',
  description: '通过时间演化波动力学模拟粒子波粒二象性、双缝干涉条纹与势垒波包散射。可实时调节波长、狭缝间距与势垒高度。',
  tags: ['量子力学', '双缝干涉', '波粒二象性', '薛定谔方程'],
  icon: '🌊',
  equation: 'iħ ∂ψ/∂t = (-ħ²/2m ∇² + V)ψ',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'waveSpeed',
      name: '波速 (Phase Velocity)',
      type: 'range',
      defaultValue: 2.2,
      min: 0.5,
      max: 5.0,
      step: 0.1,
      unit: 'c₀',
    },
    {
      id: 'slitSeparation',
      name: '狭缝间距 (Slit Separation)',
      type: 'range',
      defaultValue: 0.38,
      min: 0.1,
      max: 0.8,
      step: 0.02,
      unit: 'm',
    },
    {
      id: 'damping',
      name: '吸收边界阻尼 (Damping)',
      type: 'range',
      defaultValue: 0.985,
      min: 0.9,
      max: 0.999,
      step: 0.005,
    },
    {
      id: 'wireframe',
      name: '网格模式 (Wireframe)',
      type: 'boolean',
      defaultValue: true,
    },
    {
      id: 'showParticles',
      name: '概率云粒子 (Probability Cloud)',
      type: 'boolean',
      defaultValue: true,
    },
  ],
};

export default metadata;
