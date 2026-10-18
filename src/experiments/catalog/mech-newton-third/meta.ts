import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-newton-third',
  name: '牛顿第三定律：作用力与反作用力',
  category: 'mechanics',
  categoryName: '经典力学',
  description:
    '探究作用力与反作用力的关系：左侧配备单独弹簧测力计认识测力计构造、刻度原理与二力平衡；右侧双精密镜面导轨上水平对扣两只弹簧测力计，自由光标拖拽拉伸，实时观察两表指针严格同步变化。台载深海蓝高对比度仪表板实时示波验证 F_A ≡ -F_B（大小相等、方向相反、共线同生同灭）。',
  tags: [
    '力学',
    '牛顿第三定律',
    '作用力与反作用力',
    '弹簧测力计',
    '胡克定律',
    '相互作用力',
    '矢量共线',
    '同生同灭',
  ],
  icon: 'physics',
  equation: '\\vec{F}_{A \\to B} = -\\vec{F}_{B \\to A}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'pairPullForce',
      name: '双表互拉力 F',
      type: 'range',
      defaultValue: 0.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      unit: 'N',
      description: '右侧对扣测力计的外施拉力（亦可直接在三维视口中用光标拖拽右端手柄）',
    },
    {
      id: 'mode',
      name: '探究交互模式',
      type: 'select',
      defaultValue: 'manual_drag',
      options: [
        { label: '自由直接拖拽 (光标直接拉手柄)', value: 'manual_drag' },
        { label: '动态正弦波振荡 (验证同增同减同灭)', value: 'oscillation' },
        { label: '分级阶跃拉力测试', value: 'step_preset' },
      ],
      description: '选择手动自由拖拽或正弦波动动态拉伸',
    },
    {
      id: 'soloForce',
      name: '左侧独立测力计拉力',
      type: 'range',
      defaultValue: 0.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      unit: 'N',
      description: '单独测力计的向下施加拉力（可直接拖拽秤钩）',
    },
    {
      id: 'hangWeight',
      name: '独立测力计挂载钩码',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: '无挂载 (自由拉动体验)', value: 'none' },
        { label: '挂载 1.0 N 钩码 (102g)', value: '1n' },
        { label: '挂载 2.0 N 钩码 (204g)', value: '2n' },
      ],
      description: '在左侧独立测力计下方挂载不同规格的标准钩码',
    },
    {
      id: 'resetExperiment',
      name: '一键释放复位',
      type: 'button',
      defaultValue: false,
      description: '将三只测力计拉力全部归零，回到初始静止平衡状态',
    },
  ],
};

export default metadata;
