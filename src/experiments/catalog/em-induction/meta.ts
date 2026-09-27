import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-induction',
  name: '法拉第电磁感应与楞次定律',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '条形磁铁沿线圈轴线插入或抽出。只有磁通变化时才有感应电动势；磁铁静止或正过线圈中心时电动势为零。感应电流的磁场始终阻碍磁通变化。',
  tags: ['电磁学', '法拉第', '楞次定律', '磁通', '感应电动势'],
  icon: 'physics',
  equation: '\\mathcal{E} = -\\frac{d\\Psi}{dt}',
  computeIntensity: 'low',
  parameters: [
    { id: 'axial', name: '磁铁轴向位置', type: 'range', defaultValue: 0.22, min: -0.18, max: 0.26, step: 0.01, unit: 'm' },
    { id: 'turns', name: '线圈匝数', type: 'range', defaultValue: 200, min: 50, max: 800, step: 50, unit: '匝' },
    { id: 'resistance', name: '回路电阻', type: 'range', defaultValue: 8, min: 1, max: 40, step: 0.5, unit: 'Ω' },
    { id: 'probe', name: '探针轴向位置', type: 'range', defaultValue: 0, min: -0.18, max: 0.26, step: 0.01, unit: 'm' },
  ],
};

export default metadata;
