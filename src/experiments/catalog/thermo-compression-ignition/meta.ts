import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-compression-ignition',
  name: '气体绝热压缩点火实验',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '探究做功改变气体内部能量与绝热压缩点火规律：将引火器的活塞迅速向下猛烈拖动，外界对封闭气体做功，由于时间极短来不及与外界发生热交换（Q ≈ 0），气体温度瞬时飙升并突破 165℃ 燃点，观察底部的硝化棉瞬间发生耀眼剧烈爆燃；亦可对比缓慢下压时热量充分散失、温度不升不燃的鲜明物理反差。',
  tags: [
    '热学',
    '做功与内能',
    '绝热压缩',
    '热力学第一定律',
    '空气压缩引火仪',
    '硝化棉',
    '爆燃现象',
    '气体状态方程',
  ],
  icon: 'thermo',
  equation: '\\Delta U = W + Q \\quad (Q \\to 0) \\implies T_2 = T_1 \\left(\\frac{V_1}{V_2}\\right)^{\\gamma - 1}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'pistonStroke',
      name: '活塞下压冲程',
      type: 'range',
      defaultValue: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      unit: '',
      description: '引火器活塞从上死点向下压缩的相对深度（亦可直接在三维视口中用光标拖拽 T 型手柄）',
    },
    {
      id: 'operationMode',
      name: '冲程演示模式',
      type: 'select',
      defaultValue: 'manual_drag',
      options: [
        { label: '自由光标直接拖拽 (鼠标直接抓握 T型手柄向下猛压)', value: 'manual_drag' },
        { label: '快速绝热猛压冲程 (极速做功瞬间点燃硝化棉)', value: 'rapid_stroke' },
        { label: '缓慢等温下压冲程 (热量散失，温度达不到燃点不燃烧)', value: 'slow_stroke' },
      ],
      description: '对比快速绝热做功点火与缓慢等温散热的物理差异',
    },
    {
      id: 'reboundEnabled',
      name: '高压气动回弹效应',
      type: 'select',
      defaultValue: 'enabled',
      options: [
        { label: '开启气压回弹 (松开鼠标手柄自然向上弹起)', value: 'enabled' },
        { label: '关闭气压回弹 (保持当前位移以供静态读数)', value: 'disabled' },
      ],
      description: '封闭气体受到十几倍大气压压缩后产生的真实弹性上顶反馈',
    },
    {
      id: 'cottonState',
      name: '硝化棉装填状态',
      type: 'select',
      defaultValue: 'ready',
      options: [
        { label: '装填新鲜硝化棉 (待点燃)', value: 'ready' },
        { label: '已爆燃炭化残渣 (已燃尽)', value: 'burnt' },
      ],
      description: '切换或重新填入白絮状硝化棉实验样品',
    },
    {
      id: 'resetExperiment',
      name: '重新装料并复位活塞',
      type: 'button',
      defaultValue: false,
      description: '活塞回到顶部上死点，并在底部重新装入一块松软的新鲜硝化棉',
    },
  ],
};

export default metadata;
