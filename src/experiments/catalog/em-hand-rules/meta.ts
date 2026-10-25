import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-hand-rules',
  name: '右手螺旋与左右手定则 (3D手部骨骼)',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description:
    '电磁学三大手势定则（安培右手螺旋定则、左手定则、右手定则）专属 T-800 机械内骨骼手互动实验室。摒弃传统白色平面光标，采用 21 节点镜面超合金液态铬、双侧液压肌腱推杆与掌背分流阀桥板的 T-800 机械手部内骨骼模型实时映射真人手势，通过已知物理量方向比划推导未知场与受力方向。',
  tags: ['电磁学', '右手螺旋定则', '安培定则', '左手定则', '右手定则', '安培力', '电磁感应', '手部骨骼'],
  icon: 'physics',
  equation: '\\vec{F} = I \\vec{L} \\times \\vec{B}, \\quad \\mathcal{E} = B L v, \\quad \\oint \\vec{B}\\cdot d\\vec{l} = \\mu_0 I',
  computeIntensity: 'medium',
  parameters: [],
};

export default metadata;
