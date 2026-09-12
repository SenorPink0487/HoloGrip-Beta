import type { ExperimentMetadata } from '../../../../core/types';

export const metadata: ExperimentMetadata = {
  id: 'laser-diffraction',
  name: '激光单孔衍射与艾里斑图样',
  category: 'optics',
  categoryName: '光学与光子学',
  description: '模拟相干激光通过微米级圆形小孔产生的夫琅禾费圆孔衍射图样（艾里斑 Airy Disk）与双缝干涉条纹。展示光学的波动性与分辨率极限（瑞利判据）。',
  tags: ['物理光学', '夫琅禾费衍射', '艾里斑', '波动光学', '瑞利判据'],
  icon: '🎯',
  equation: 'I(θ) = I_0 [2 J_1(ka sin θ) / (ka sin θ)]²',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'wavelength',
      name: '激光波长 (Laser Wavelength)',
      type: 'range',
      defaultValue: 532,
      min: 400,
      max: 700,
      step: 10,
      unit: 'nm',
    },
    {
      id: 'apertureRadius',
      name: '微孔半径 (Aperture Radius)',
      type: 'range',
      defaultValue: 45,
      min: 10,
      max: 120,
      step: 5,
      unit: 'μm',
    },
    {
      id: 'laserPower',
      name: '激光强度 (Laser Intensity)',
      type: 'range',
      defaultValue: 1.0,
      min: 0.2,
      max: 2.0,
      step: 0.1,
    },
  ],
};

export default metadata;
