import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'optics-propagation',
  name: '光的传播与折射色散',
  category: 'optics',
  categoryName: '光学物理',
  description: '精密三棱镜与介质折射实验台，深入研究光的直线传播、斯涅尔折射定律、全反射与牛顿白光/多波长七彩色散分光。',
  tags: ['光学', '几何光学', '折射', '色散', '三棱镜', '斯涅尔定律'],
  icon: 'optics',
  equation: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'wavelength',
      name: '激光波长',
      type: 'range',
      defaultValue: 532.0,
      min: 400.0,
      max: 700.0,
      step: 1.0,
      unit: 'nm',
      description: '输入单色激光波长（绿色532nm、红色650nm等）',
    },
    {
      id: 'prismAngle',
      name: '棱镜旋转角',
      type: 'range',
      defaultValue: 0.0,
      min: -35.0,
      max: 35.0,
      step: 1.0,
      unit: '°',
      description: '精密360°测角台旋转角度，观察偏折角变化与临界反射',
    },
    {
      id: 'prismType',
      name: '光学介质类型',
      type: 'select',
      defaultValue: 'equilateral',
      options: [
        { label: '60°等边色散三棱镜', value: 'equilateral' },
        { label: '半圆柱介质透镜 (全反射)', value: 'semicircular' },
      ],
      description: '切换等边三棱镜或半圆柱透镜',
    },
    {
      id: 'refractiveIndex',
      name: '折射率 n',
      type: 'range',
      defaultValue: 1.54,
      min: 1.33,
      max: 1.80,
      step: 0.01,
      unit: '',
      description: '玻璃介质基准折射率（冕牌1.52 / 火石1.66 / 重火石1.75）',
    },
    {
      id: 'multiSpectrum',
      name: '七彩色散光谱束',
      type: 'boolean',
      defaultValue: true,
      description: '开启白光连续多谱线色散折射分解（红橙黄绿青蓝紫）',
    },
  ],
};

export default metadata;
