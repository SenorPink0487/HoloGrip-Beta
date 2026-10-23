import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-carnot',
  name: '卡诺热机',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '探究理想气体可逆卡诺循环的四个热力学过程（等温膨胀吸热、绝热膨胀、等温压缩放热、绝热压缩），实时观测 P-V 动态循环图、活塞曲柄连杆做功与卡诺热效率定理 η = 1 - Tc / Th。',
  tags: ['热学', '卡诺热机', '卡诺循环', '热力学第二定律', 'P-V图', '等温过程', '绝热过程'],
  icon: 'physics',
  equation: '\\eta = 1 - \\frac{T_c}{T_h} = \\frac{W}{Q_h}',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'hotTempC',
      name: '高温热源温度 Th',
      type: 'range',
      defaultValue: 80.0,
      min: 50.0,
      max: 150.0,
      step: 1.0,
      unit: '°C',
      description: '调节左侧高温热源（加热器）摄氏温度 Th (50 ~ 150 °C)',
    },
    {
      id: 'coldTempC',
      name: '低温冷源温度 Tc',
      type: 'range',
      defaultValue: 20.0,
      min: 0.0,
      max: 40.0,
      step: 1.0,
      unit: '°C',
      description: '调节右侧低温冷源（冷却水）摄氏温度 Tc (0 ~ 40 °C)',
    },
    {
      id: 'speedMultiplier',
      name: '运转速率倍率',
      type: 'range',
      defaultValue: 1.0,
      min: 0.3,
      max: 2.5,
      step: 0.1,
      unit: 'x',
      description: '调节卡诺热机自动循环演示速率倍率',
    },
    {
      id: 'resetExperiment',
      name: '重置实验标准态',
      type: 'button',
      defaultValue: false,
      description: '恢复 Th = 80.0 °C 与 Tc = 20.0 °C 标准初始状态',
    },
  ],
};

export default metadata;
