import type { ExperimentMetadata } from '../../../../core/types';

export const metadata: ExperimentMetadata = {
  id: 'nbody-gravity',
  name: '三体问题与多体引力混沌模拟',
  category: 'astrophysics',
  categoryName: '天体物理学',
  description: '多核并行加速的 N 体万有引力动力学模拟。演示经典三体混沌轨道、拉格朗日引力束缚与吸积粒子盘演化，计算负荷充分释放至多核线程池。',
  tags: ['天体物理', '三体问题', '牛顿万有引力', '混沌动力学', '多核计算'],
  icon: '🪐',
  equation: 'F_i = G ∑_{j≠i} (m_i m_j / r_{ij}³) r_{ij}',
  computeIntensity: 'high',
  parameters: [
    {
      id: 'gravitationalConstant',
      name: '引力常数 G (Gravitational Constant)',
      type: 'range',
      defaultValue: 1.2,
      min: 0.1,
      max: 4.0,
      step: 0.1,
    },
    {
      id: 'simulationSpeed',
      name: '时间流速 (Simulation Speed)',
      type: 'range',
      defaultValue: 1.0,
      min: 0.1,
      max: 2.5,
      step: 0.1,
      unit: 'x',
    },
    {
      id: 'orbitTrails',
      name: '轨道轨迹光晕 (Orbital Trails)',
      type: 'boolean',
      defaultValue: true,
    },
    {
      id: 'particleCount',
      name: '伴随吸积粒子 (Accretion Particles)',
      type: 'range',
      defaultValue: 400,
      min: 100,
      max: 1200,
      step: 50,
    },
  ],
};

export default metadata;
