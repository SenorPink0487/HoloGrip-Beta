import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'optics-polarization',
  name: '光的偏振与马吕斯定律',
  category: 'optics',
  categoryName: '光学物理',
  description: '精密双偏振角盘实验台，定量验证马吕斯余弦平方定律 $I = I_0 \\cos^2\\theta$、消光现象与1/4波片空间椭圆/圆偏振螺旋态。',
  tags: ['光学', '矢量光学', '偏振', '马吕斯定律', '消光', '四分之一波片', '圆偏振'],
  icon: 'optics',
  equation: 'I = I_0 \\cos^2(\\theta_2 - \\theta_1)',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'polarizerAngle',
      name: '起偏器角度 θ₁',
      type: 'range',
      defaultValue: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      unit: '°',
      description: '起偏器P1透光轴角度',
    },
    {
      id: 'analyzerAngle',
      name: '检偏器角度 θ₂',
      type: 'range',
      defaultValue: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      unit: '°',
      description: '检偏器P2透光轴角度（两者夹角为90°时完全消光）',
    },
    {
      id: 'quarterWavePlate',
      name: '1/4波片 (λ/4)',
      type: 'boolean',
      defaultValue: false,
      description: '在起偏器与检偏器间插入四分之一波片，产生空间圆偏振/椭圆偏振',
    },
    {
      id: 'wavelength',
      name: '激光波长',
      type: 'range',
      defaultValue: 632.8,
      min: 400.0,
      max: 700.0,
      step: 1.0,
      unit: 'nm',
      description: '偏振光工作波长',
    },
    {
      id: 'show3DWave',
      name: '3D空间电场矢量',
      type: 'boolean',
      defaultValue: true,
      description: '在光束轴向直观展现光波电场矢量E的动态振荡与偏振状态',
    },
  ],
};

export default metadata;
