import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-center-of-gravity',
  name: '悬挂法测物体重心',
  category: 'mechanics',
  categoryName: '经典力学',
  description:
    '利用二力平衡原理测定不规则薄板的重心：拖动塑料薄板将孔套挂在铁架台横杆的挂钩上，待薄板自由摆动至静止稳定后，沿铅垂方向自动标出红线；向下拖动取下薄板，再使另一孔套挂在挂钩上，待稳定后画出第二条红线，两条红线的交点即为该物体的重心。',
  tags: [
    '力学',
    '悬挂法',
    '重心',
    '质心',
    '二力平衡',
    '刚体复摆',
    '铅垂线',
    '力矩平衡',
  ],
  icon: 'physics',
  equation: '\\sum \\vec{\\tau}_P = 0 \\implies G \\in \\text{Line}_1 \\cap \\text{Line}_2',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'shape',
      name: '待测薄板形状',
      type: 'select',
      defaultValue: 'irregular',
      options: [
        { label: '不规则多边形板 (经典异形件)', value: 'irregular' },
        { label: 'L型折角薄板 (重心在物体外)', value: 'lshape' },
        { label: '非等边三角形板 (中线交点)', value: 'triangle' },
      ],
      description: '选择不同几何外形的亚克力待测薄板，探究不同质量分布下的重心特征',
    },
    {
      id: 'damping',
      name: '摆动阻尼因数',
      type: 'range',
      defaultValue: 0.055,
      min: 0.02,
      max: 0.15,
      step: 0.005,
      unit: '',
      description: '空气与悬挂轴阻尼系数；值越大薄板稳定越快',
    },
    {
      id: 'stabilizeImmediately',
      name: '立即稳定',
      type: 'button',
      defaultValue: false,
      description: '跳过物理阻尼摆动，直接使当前悬挂薄板静止稳定',
    },
    {
      id: 'verifyBalance',
      name: '顶针重心平衡验证',
      type: 'boolean',
      defaultValue: false,
      description: '从下方伸出尖锐顶针顶在测得的重心 G 处，验证薄板在重心支承下的完美水平平衡',
    },
    {
      id: 'resetExperiment',
      name: '重置实验',
      type: 'button',
      defaultValue: false,
      description: '清除所有绘制的红线与重心标记，并将塑料板放回初始桌面位置',
    },
  ],
};

export default metadata;
