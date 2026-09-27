import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-centripetal',
  name: '圆周运动向心力定量探究',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '精密向心力演示仪，通过变速塔轮调节角速度，控制变量法定量探究向心力与质量、半径、角速度平方的正比关系。',
  tags: ['力学', '圆周运动', '向心力', '角速度', '控制变量法', '变速塔轮'],
  icon: 'physics',
  equation: 'F_n = m \\omega^2 r = m \\frac{v^2}{r}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'mass',
      name: '测试球质量 m',
      type: 'select',
      defaultValue: 100,
      options: [
        { label: '50 g (铝合金球)', value: 50 },
        { label: '100 g (轻型钢球)', value: 100 },
        { label: '150 g (重型钢球)', value: 150 },
      ],
      description: '回转测试小球质量',
    },
    {
      id: 'radius',
      name: '旋转半径 r',
      type: 'select',
      defaultValue: 0.10,
      options: [
        { label: '5.0 cm (内档卡槽)', value: 0.05 },
        { label: '7.5 cm (中档卡槽)', value: 0.075 },
        { label: '10.0 cm (标准卡槽)', value: 0.10 },
        { label: '12.5 cm (外档卡槽)', value: 0.125 },
      ],
      description: '小球中心到主旋转轴距离',
    },
    {
      id: 'angularVelocity',
      name: '旋转角速度 ω',
      type: 'range',
      defaultValue: 8.0,
      min: 2.0,
      max: 18.0,
      step: 0.5,
      unit: 'rad/s',
      description: '通过变速塔轮或电机驱动的主轴角速度',
    },
  ],
};

export default metadata;
