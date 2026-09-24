import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-phase',
  name: '物态相变与潜热曲线',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description: '高精度智能量热烧瓶相变实验台。完整模拟水物质固态冰晶 (T < 0°C) -> 固液共存融化潜热平台 -> 液态水升温 -> 剧烈沸腾汽化潜热平台 (100°C) -> 过热蒸汽全过程。实时三维呈现冰块融化缩积、沸腾气泡翻滚与蒸汽羽流，全息记录 T-t 动态升温曲线并结算显热、相变潜热与熵增规律。',
  tags: ['热学', '相变', '熔化潜热', '汽化潜热', '加热曲线', '三相点', '比热容', '量热学', '沸腾'],
  icon: 'thermo',
  equation: 'Q = m c \\Delta T \\quad Q = m L \\quad \\Delta S = \\int \\frac{dQ}{T}',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'heatPower',
      name: '加热电功率 P',
      type: 'range',
      defaultValue: 800,
      min: 100,
      max: 2000,
      step: 50,
      unit: 'W',
      description: '量热底座电加热盘输出恒定功率',
    },
    {
      id: 'substanceMass',
      name: '初始冰样质量 m',
      type: 'range',
      defaultValue: 150,
      min: 50,
      max: 500,
      step: 10,
      unit: 'g',
      description: '烧瓶内初始冰块总质量（决定各潜热平台持续时间长度）',
    },
    {
      id: 'initialTemp',
      name: '初始冰温 T₀',
      type: 'range',
      defaultValue: 253,
      min: 240,
      max: 270,
      step: 2,
      unit: 'K',
      description: '初始冷冻固态冰块温度（-33°C 至 -3°C）',
    },
    {
      id: 'timeAcceleration',
      name: '时间加速倍率',
      type: 'select',
      defaultValue: '5',
      options: [
        { label: '1x (真实物理流速)', value: '1' },
        { label: '5x (标准演示倍速)', value: '5' },
        { label: '20x (高速快进)', value: '20' },
        { label: '50x (极速全相扫描)', value: '50' },
      ],
      description: '倍速推进相变与汽化历程',
    },
  ],
};

export default metadata;
