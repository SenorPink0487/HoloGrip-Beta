import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-mass-spec',
  name: '磁聚焦与带电粒子质谱仪',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '离子经加速和速度选择后进入分析磁场，轨道半径由质荷比决定。收窄狭缝只放行一种速度；翻转磁场则光斑落到另一侧。',
  tags: ['电磁学', '质谱', '洛伦兹力', '速度选择器', '同位素'],
  icon: 'physics',
  equation: 'r = \\frac{mv}{qB}',
  computeIntensity: 'low',
  parameters: [
    { id: 'accelVoltage', name: '加速电压', type: 'range', defaultValue: 2000, min: 200, max: 5000, step: 20, unit: 'V' },
    { id: 'analyzerField', name: '分析磁场', type: 'range', defaultValue: 0.15, min: 0.05, max: 0.5, step: 0.01, unit: 'T' },
    { id: 'jaw', name: '狭缝开度', type: 'range', defaultValue: 1, min: 0.02, max: 1, step: 0.01 },
    { id: 'plateVoltage', name: '选择器电压', type: 'range', defaultValue: 0, min: 0, max: 900, step: 1, unit: 'V' },
    {
      id: 'sample',
      name: '离子样品',
      type: 'select',
      defaultValue: 'hydrogen',
      options: [
        { label: '氢氦轻离子', value: 'hydrogen' },
        { label: '氖同位素', value: 'neon' },
        { label: '镁同位素', value: 'magnesium' },
        { label: '氯同位素', value: 'chlorine' },
      ],
    },
  ],
};

export default metadata;
