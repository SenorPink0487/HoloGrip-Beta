import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-conduction',
  name: '热传导与傅里叶定律',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description: '固体与多材料导热棒一维/三维稳态热传导仿真，实时红外伪彩热成像展示温度梯度降落与热通量分布。',
  tags: ['热学', '热传导', '傅里叶定律', '热成像', '热导率', '导热'],
  icon: 'thermo',
  equation: 'q = -k \\nabla T \\quad \\frac{\\partial T}{\\partial t} = \\alpha \\nabla^2 T',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'heatSourceTemp',
      name: '加热端温度',
      type: 'range',
      defaultValue: 373,
      min: 300,
      max: 600,
      step: 5,
      unit: 'K',
      description: '导热杆热端受热恒温源温度',
    },
    {
      id: 'material',
      name: '导热介质材质',
      type: 'select',
      defaultValue: 'copper',
      options: [
        { label: '紫铜 (k = 385 W/m·K)', value: 'copper' },
        { label: '铝合金 (k = 205 W/m·K)', value: 'aluminum' },
        { label: '不锈钢 (k = 16 W/m·K)', value: 'steel' },
        { label: '石英玻璃 (k = 1.4 W/m·K)', value: 'glass' },
      ],
      description: '不同材质热导率对热扩散速率的影响',
    },
  ],
};

export default metadata;
