import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-projectile',
  name: '平抛运动与机械能守恒',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '斜槽轨道平抛实验台，通过坐标网格与可调接球挡板验证平抛抛物线方程及动能与势能守恒转换。',
  tags: ['力学', '平抛运动', '机械能守恒', '斜槽轨道', '铅垂线', '动能与势能'],
  icon: 'physics',
  equation: 'y = \\frac{g}{2 v_0^2} x^2 \\quad \\Delta E_k = \\Delta E_p',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'releaseHeight',
      name: '释放高度 H',
      type: 'range',
      defaultValue: 0.25,
      min: 0.10,
      max: 0.50,
      step: 0.02,
      unit: 'm',
      description: '小球在斜槽轨道上的初始释放高度',
    },
    {
      id: 'targetY',
      name: '下落高度 y',
      type: 'range',
      defaultValue: 0.40,
      min: 0.10,
      max: 0.70,
      step: 0.05,
      unit: 'm',
      description: '接球挡板与发射口的竖直距离',
    },
    {
      id: 'ballMass',
      name: '小球质量 m',
      type: 'range',
      defaultValue: 30,
      min: 10,
      max: 100,
      step: 10,
      unit: 'g',
      description: '镀铬精密钢球质量',
    },
    {
      id: 'gravity',
      name: '环境重力 g',
      type: 'select',
      defaultValue: 9.80,
      options: [
        { label: '地球 (9.80 m/s²)', value: 9.80 },
        { label: '月球 (1.62 m/s²)', value: 1.62 },
        { label: '火星 (3.72 m/s²)', value: 3.72 },
      ],
      description: '切换不同星球重力场环境',
    },
  ],
};

export default metadata;
