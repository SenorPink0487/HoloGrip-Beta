import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-lever-pulley',
  name: '杠杆与滑轮组',
  category: 'mechanics',
  categoryName: '经典力学',
  description: '直接拖动黄铜支点、将标准钩码挂到杠杆刻度孔，观察力矩平衡；转动滑轮组档位旋钮，对比定滑轮、一定一动与二定二动，向下拉绳端测量省力与费距离。全部读数位于器材本体。',
  tags: ['力学', '杠杆', '力矩平衡', '定滑轮', '动滑轮', '滑轮组', '机械功', '机械利益'],
  icon: 'physics',
  equation: 'F_1 l_1 = F_2 l_2,\\quad F = G/n,\\quad s = nh',
  computeIntensity: 'low',
  parameters: [],
};
export default metadata;
