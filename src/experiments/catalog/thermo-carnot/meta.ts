import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-carnot',
  name: '卡诺热机与循环效率',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description: '经典卡诺热机四冲程准静态循环模拟，动态探索等温膨胀、绝热膨胀、等温压缩与绝热压缩过程，解析热机极限热效率与热力学第二定律。',
  tags: ['热学', '卡诺循环', '热机', '热效率', '热力学第二定律', 'PV图'],
  icon: 'thermo',
  equation: '\\eta = 1 - \\frac{T_C}{T_H} = \\frac{W}{Q_H}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'tempHigh',
      name: '高温热源温度 T_H',
      type: 'range',
      defaultValue: 600,
      min: 400,
      max: 1000,
      step: 10,
      unit: 'K',
      description: '卡诺循环吸热高温热源温度',
    },
    {
      id: 'tempLow',
      name: '低温热源温度 T_C',
      type: 'range',
      defaultValue: 300,
      min: 150,
      max: 380,
      step: 10,
      unit: 'K',
      description: '卡诺循环放热低温冷源温度',
    },
  ],
};

export default metadata;
