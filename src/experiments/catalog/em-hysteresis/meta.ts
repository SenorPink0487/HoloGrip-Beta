import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-hysteresis',
  name: '铁磁材料磁化与磁滞回线',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '螺线管里的试样从初始磁化曲线进入磁滞回线。硅钢回线窄、损耗小；碳钢回线宽、剩磁和矫顽力都大。搜索线圈读取管内均匀的 B 与磁通。',
  tags: ['电磁学', '磁滞', '铁磁质', '剩磁', '矫顽力'],
  icon: 'physics',
  equation: 'B = \\mu_0 (H + M)',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'material',
      name: '试样',
      type: 'select',
      defaultValue: 'silicon-steel',
      options: [
        { label: '硅钢片', value: 'silicon-steel' },
        { label: '软铁', value: 'soft-iron' },
        { label: '碳钢', value: 'carbon-steel' },
        { label: '铁氧体', value: 'ferrite' },
      ],
    },
    { id: 'fieldH', name: '磁场强度 H', type: 'range', defaultValue: 0, min: -9000, max: 9000, step: 50, unit: 'A/m' },
    { id: 'autoSweep', name: '自动扫描', type: 'boolean', defaultValue: false },
  ],
};

export default metadata;
