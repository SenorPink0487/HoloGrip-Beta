import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'optics-dispersion',
  name: '光的色散',
  category: 'optics',
  categoryName: '光学物理',
  description: '光具座式白光色散实验。白光灯箱、竖直三棱镜与毛玻璃屏构成水平光路。拖动三棱镜改变入射角，转动材料套环切换冕牌、火石与金刚石，接光臂跟随主光方向转动，沿臂滑动白屏观察光谱展宽。按实际界面法线、材料色散关系与斯涅尔定律实时追迹，紫光偏折大于红光。',
  tags: ['光学', '几何光学', '光的色散', '三棱镜', '柯西公式', '光具座'],
  icon: 'optics',
  equation: 'n(\\lambda) = A + B/\\lambda^2 \\quad \\delta = \\theta_1 + \\theta_4 - \\alpha',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'lampOn',
      name: '白光灯',
      type: 'boolean',
      defaultValue: true,
      description: '打开或关闭灯箱',
    },
    {
      id: 'incidentAngle',
      name: '入射角 θ₁',
      type: 'range',
      defaultValue: 58,
      min: 42,
      max: 82,
      step: 0.5,
      unit: '°',
      description: '白光对棱镜第一面的入射角，可在三棱镜上直接拖动',
    },
    {
      id: 'prismMaterial',
      name: '棱镜材料',
      type: 'select',
      defaultValue: 'flint',
      options: [
        { label: '熔融石英', value: 'quartz' },
        { label: 'K9 冕牌玻璃', value: 'crown' },
        { label: 'BaF10 钡火石', value: 'bariumFlint' },
        { label: 'ZF7 重火石', value: 'flint' },
        { label: '光学金刚石', value: 'diamond' },
      ],
      description: '点击棱镜座上的滚花套环可依次切换',
    },
    {
      id: 'screenDistance',
      name: '棱镜至屏',
      type: 'range',
      defaultValue: 0.38,
      min: 0.2,
      max: 0.5,
      step: 0.01,
      unit: 'm',
      description: '沿导轨拖动白屏',
    },
  ],
};

export default metadata;
