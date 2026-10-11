import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-generator',
  name: '旋转线圈发电机与交直流输出',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '导体线圈在匀强磁场中旋转切割磁感线产生动生电动势。双滑环引出正弦交流电，对剖半环换向器整流引出脉动直流电。手摇加速、带载灯泡发光与反力矩阻尼。',
  tags: ['电磁学', '发电机', '动生电动势', '交流电', '换向器', '滑环'],
  icon: 'physics',
  equation: '\\mathcal{E} = NBS\\omega\\sin(\\omega t)',
  computeIntensity: 'low',
  parameters: [
    { id: 'magField', name: '磁感应强度', type: 'range', defaultValue: 0.40, min: 0.10, max: 1.00, step: 0.05, unit: 'T' },
    { id: 'turns', name: '线圈匝数', type: 'range', defaultValue: 200, min: 50, max: 600, step: 50, unit: '匝' },
  ],
};

export default metadata;
