import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-field',
  name: '静电场探索与电力线叠加',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '经典科研级静电场探索实验台。支持自由在空间添加正负点电荷并交互拖动、调节电量大小。高精度求解库仑定律与电场叠加原理（E = ∑ k·q_i/r_i²），动态生成弯曲光滑的电力线流束，支持正负电偶极子、同号电荷互斥、电四极子等经典物理场态一键构型。',
  tags: ['电磁学', '静电场', '库仑定律', '电场线', '电势叠加', '电偶极子', '高斯定理'],
  icon: 'physics',
  equation: '\\vec{E} = \\sum_{i} \\frac{k_e q_i}{r_i^2} \\hat{r}_i \\quad V = \\sum_{i} \\frac{k_e q_i}{r_i}',
  computeIntensity: 'medium',
  parameters: [
    {
      id: 'preset',
      name: '物理场型预设',
      type: 'select',
      defaultValue: 'dipole',
      options: [
        { label: '正负电偶极子 (Dipole, +q / -q)', value: 'dipole' },
        { label: '同号电荷互斥 (Like Charges, +q / +q)', value: 'likeCharges' },
        { label: '平面电四极子 (Quadrupole)', value: 'quadrupole' },
        { label: '非对称双电荷 (+3µC / -1µC)', value: 'asymmetric' },
        { label: '孤立单电荷 (Single Point Charge)', value: 'single' },
      ],
      description: '快速切换经典静电场电荷分布格局',
    },
    {
      id: 'showLines',
      name: '电场线显示',
      type: 'boolean',
      defaultValue: true,
      description: '显示根据麦克斯韦电场叠加方程计算的连续电力线',
    },
    {
      id: 'showFlow',
      name: '电场流束光子动效',
      type: 'boolean',
      defaultValue: true,
      description: '动态展示检验正电荷在电场线上的受力加速流动趋势',
    },
  ],
};

export default metadata;
