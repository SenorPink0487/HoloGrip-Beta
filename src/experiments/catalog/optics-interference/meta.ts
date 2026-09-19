import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'optics-interference',
  name: '杨氏双缝干涉',
  category: 'optics',
  categoryName: '光学物理',
  description: '经典杨氏双缝空间干涉实验，展现相干波前叠加、空间柱面波包干涉场与高清晰明暗相间等间距干涉条纹。',
  tags: ['光学', '波动光学', '杨氏双缝', '波前干涉', '条纹间距', '相干光'],
  icon: 'optics',
  equation: '\\Delta y = \\frac{\\lambda L}{d}',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'wavelength',
      name: '激光波长 λ',
      type: 'range',
      defaultValue: 632.8,
      min: 400.0,
      max: 700.0,
      step: 1.0,
      unit: 'nm',
      description: '红光(632.8nm)、绿光(532nm)、蓝紫光(405nm)波长切换',
    },
    {
      id: 'slitDistance',
      name: '双缝间距 d',
      type: 'range',
      defaultValue: 0.25,
      min: 0.12,
      max: 0.55,
      step: 0.01,
      unit: 'mm',
      description: '双缝中心距离（间距越小，屏上干涉条纹越宽）',
    },
    {
      id: 'slitWidth',
      name: '狭缝宽度 a',
      type: 'range',
      defaultValue: 0.04,
      min: 0.01,
      max: 0.10,
      step: 0.01,
      unit: 'mm',
      description: '单缝狭缝宽度（决定单缝衍射主极大包络）',
    },
    {
      id: 'showWavefronts',
      name: '3D空间波前',
      type: 'boolean',
      defaultValue: true,
      description: '在三维空间中动态展示自双缝散发的同相柱面同心波前干涉环',
    },
  ],
};

export default metadata;
