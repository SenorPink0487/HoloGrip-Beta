import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-fourier',
  name: '固体热传导与傅里叶定律',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '基于一维非稳态与稳态热传导实验台，探究不同导热系数金属试件（黄铜、紫铜、铝合金、不锈钢）在高温电热炉与恒温循环水浴作用下的温度梯度分布 T1~T5 与傅里叶热传导定律 q = -k·(dT/dx)。',
  tags: ['热学', '固体热传导', '傅里叶定律', '导热系数', '温度梯度', '热流密度', '非稳态传热'],
  icon: 'physics',
  equation: 'q = -k \\frac{\\mathrm{d}T}{\\mathrm{d}x},\\; \\frac{\\partial T}{\\partial t} = \\alpha \\frac{\\partial^2 T}{\\partial x^2}',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'hotTempC',
      name: '高温端加热温度 Th',
      type: 'range',
      defaultValue: 100.0,
      min: 60.0,
      max: 150.0,
      step: 1.0,
      unit: '°C',
      description: '调节左侧恒温电加热炉温度 Th (60 ~ 150 °C)',
    },
    {
      id: 'coldTempC',
      name: '低温水浴温度 Tc',
      type: 'range',
      defaultValue: 20.0,
      min: 5.0,
      max: 40.0,
      step: 1.0,
      unit: '°C',
      description: '调节右侧恒温循环水浴温度 Tc (5 ~ 40 °C)',
    },
    {
      id: 'materialId',
      name: '待测导热棒材质',
      type: 'select',
      defaultValue: 'brass',
      options: [
        { label: '黄铜 H62 (k = 109 W/m·K)', value: 'brass' },
        { label: '紫铜 T2 (k = 398 W/m·K)', value: 'copper' },
        { label: '铝合金 6061 (k = 167 W/m·K)', value: 'aluminum' },
        { label: '不锈钢 304 (k = 16.2 W/m·K)', value: 'stainless' },
      ],
      description: '切换不同导热系数 k 的单质/合金金属试件',
    },
    {
      id: 'resetExperiment',
      name: '重置传热波前',
      type: 'button',
      defaultValue: false,
      description: '重置温度场并重新观察非稳态热波从 T1 传向 T5 直至傅里叶稳态的过程',
    },
  ],
};

export default metadata;
