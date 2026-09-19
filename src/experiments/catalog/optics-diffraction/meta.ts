import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'optics-diffraction',
  name: '单缝与光栅衍射',
  category: 'optics',
  categoryName: '光学物理',
  description: '精密单缝与透射衍射光栅实验台，观察夫琅禾费衍射图样、Sinc平方光强分布及高分辨分光多级光谱。',
  tags: ['光学', '波动光学', '单缝衍射', '衍射光栅', '夫琅禾费', '分光光谱'],
  icon: 'optics',
  equation: 'd \\sin\\theta = m\\lambda',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'diffractionType',
      name: '元件类型',
      type: 'select',
      defaultValue: 'grating',
      options: [
        { label: '衍射光栅 (多级分光)', value: 'grating' },
        { label: '精密单缝 (Sinc包络)', value: 'single' },
      ],
      description: '在精密单缝与透射光栅组件之间切换',
    },
    {
      id: 'wavelength',
      name: '激光波长',
      type: 'range',
      defaultValue: 532.0,
      min: 400.0,
      max: 700.0,
      step: 1.0,
      unit: 'nm',
      description: '输入激光波长',
    },
    {
      id: 'slitWidth',
      name: '狭缝宽度 a',
      type: 'range',
      defaultValue: 0.05,
      min: 0.02,
      max: 0.15,
      step: 0.01,
      unit: 'mm',
      description: '单缝宽度（单缝模式下有效）',
    },
    {
      id: 'gratingDensity',
      name: '光栅刻线 N',
      type: 'select',
      defaultValue: '300',
      options: [
        { label: '100 lines/mm', value: '100' },
        { label: '300 lines/mm', value: '300' },
        { label: '600 lines/mm', value: '600' },
      ],
      description: '衍射光栅刻线密度（光栅模式下有效）',
    },
  ],
};

export default metadata;
