import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-phase-change',
  name: '晶体与非晶体相变与潜热',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '通过水浴加热对比实验与多通道温度采集器，探究晶体（冰晶）与非晶体（石蜡）在受热熔化过程中的物态相变规律：晶体具有固定熔点，在固液共存阶段持续吸收熔化潜热而温度保持不变，完全熔化后液态温度继续上升；非晶体无固定熔点，受热时由硬变软、连续过渡为液态且温度持续上升。',
  tags: ['热学', '晶体与非晶体', '物态相变', '熔化潜热', '固液共存', '水浴加热', '熔点'],
  icon: 'physics',
  equation: 'Q_L = m L_f,\\; \\Delta T_{\\text{crystal}} = 0\\; (\\text{固液共存})',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'leftLampLit',
      name: '左侧酒精灯（晶体水浴）',
      type: 'boolean',
      defaultValue: true,
      description: '点击左侧酒精灯点火或熄灭（熄火后快速冷却回 0 °C 并自动重置曲线）',
    },
    {
      id: 'rightLampLit',
      name: '右侧酒精灯（非晶体水浴）',
      type: 'boolean',
      defaultValue: true,
      description: '点击右侧酒精灯点火或熄灭（熄火后快速冷却回 0 °C 并自动重置曲线）',
    },
    {
      id: 'showChannel1',
      name: '采集器：通道1 晶体曲线',
      type: 'boolean',
      defaultValue: true,
      description: '控制多通道温度采集器屏幕上红色「晶体」通道曲线的显示与隐藏',
    },
    {
      id: 'showChannel2',
      name: '采集器：通道2 非晶体曲线',
      type: 'boolean',
      defaultValue: true,
      description: '控制多通道温度采集器屏幕上蓝色「非晶体」通道曲线的显示与隐藏',
    },
  ],
};

export default metadata;
