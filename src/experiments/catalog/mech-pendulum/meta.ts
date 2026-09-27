import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-pendulum',
  name: '单摆简谐运动测重力加速度',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '重型铁架台单摆实验装置，精密测定摆线长度与摆球直径，通过激光光电门累计多周期测定当地重力加速度 g 及 T²-L 图像拟合。',
  tags: ['力学', '单摆', '简谐振动', '重力加速度', '周期公式', 'T²-L拟合'],
  icon: 'physics',
  equation: 'T = 2 \\pi \\sqrt{\\frac{L}{g}} \\quad T^2 = \\frac{4\\pi^2}{g} L',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'lineLength',
      name: '悬线长度 l',
      type: 'range',
      defaultValue: 0.80,
      min: 0.40,
      max: 1.10,
      step: 0.05,
      unit: 'm',
      description: '悬挂夹具到摆球顶部的细线长度',
    },
    {
      id: 'ballDiameter',
      name: '摆球直径 d',
      type: 'select',
      defaultValue: 20.0,
      options: [
        { label: '16.0 mm (轻型碳钢)', value: 16.0 },
        { label: '20.0 mm (标准碳钢)', value: 20.0 },
        { label: '25.0 mm (重型碳钢)', value: 25.0 },
      ],
      description: '由游标卡尺测定的小球直径 (有效摆长 L = l + d/2)',
    },
    {
      id: 'initialAngle',
      name: '释放摆角 θ₀',
      type: 'range',
      defaultValue: 4.0,
      min: 1.0,
      max: 12.0,
      step: 0.5,
      unit: '°',
      description: '初始释放偏角 (小角度近似条件 θ ≤ 5°)',
    },
    {
      id: 'ballMass',
      name: '摆球质量 m',
      type: 'range',
      defaultValue: 30,
      min: 15,
      max: 80,
      step: 5,
      unit: 'g',
      description: '摆球质量 (验证单摆周期与小球质量无关)',
    },
  ],
};

export default metadata;
