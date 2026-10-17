import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-free-fall',
  name: '自由落体运动与牛顿管实验',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '经典牛顿管自由落体与空气阻力对比实验：管内装有羽毛、硬币与软木塞，经高密封导管与抽气机相连。点击旋转按钮倒转牛顿管，观察常压空气中羽毛轻盈飘舞迟缓下落与硬币快速直落；启动抽气机排尽空气后再次倒转，见证羽毛与硬币、软木塞完全同速、同时触底的物理学奇迹。',
  tags: ['力学', '自由落体', '牛顿管', '伽利略实验', '空气阻力', '真空落体', '等效原理'],
  icon: 'physics',
  equation: 'h = \\frac{1}{2}gt^2 \\quad v = gt \\quad (F_d = \\frac{1}{2}C_d \\rho A v^2)',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'airPressure',
      name: '管内气压 P',
      type: 'range',
      defaultValue: 101.3,
      min: 0.0,
      max: 101.3,
      step: 0.5,
      unit: 'kPa',
      description: '管内空气压强（101.3 kPa 为标准大气压；0.0 kPa 为理想绝对真空；可通过抽气机排空或阀门充气）',
    },
    {
      id: 'timeScale',
      name: '时间倍率 (慢动作)',
      type: 'range',
      defaultValue: 1.0,
      min: 0.1,
      max: 1.0,
      step: 0.05,
      unit: 'x',
      description: '物理下落时间演化倍率（可开启 0.2x ~ 0.5x 慢动作精细观察触底瞬间）',
    },
    {
      id: 'gravity',
      name: '重力加速度 g',
      type: 'range',
      defaultValue: 9.80,
      min: 1.62,
      max: 24.79,
      step: 0.01,
      unit: 'm/s²',
      description: '重力加速度环境（默认地球表面 9.80 m/s²，支持对比月球 1.62 与木星 24.79）',
    },
  ],
};

export default metadata;
