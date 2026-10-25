import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-gas-laws',
  name: '气体实验三定律',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '通过一体式精密恒温夹套气缸与三维多定律自适应数据采集终端，定量探究一定质量的理想气体在三个经典等值过程中的实验定律：玻意耳定律（等温过程 pV = C₁，手动推拉 3D 活塞改变体积 V 观测压强 p 双曲线变化）、查理定律（等容过程 p/T = C₂，黄铜机械插销物理锁死活塞，旋转底座温控旋钮改变热力学温度 T 观测 p-T 绝对零度外推直线）与盖-吕萨克定律（等压过程 V/T = C₃，松开锁销保持恒压，调节温控旋钮驱动活塞随温度线性升降）。',
  tags: [
    '热学',
    '气体实验三定律',
    '玻意耳定律',
    '查理定律',
    '盖-吕萨克定律',
    '等温过程',
    '等容过程',
    '等压过程',
    '理想气体',
  ],
  icon: 'physics',
  equation: 'pV = C_1 \\cdot \\frac{p}{T} = C_2 \\cdot \\frac{V}{T} = C_3',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'mode',
      name: '气体实验定律模式',
      type: 'select',
      defaultValue: 'boyle',
      options: [
        { label: '玻意耳定律（等温过程 T = 300 K）', value: 'boyle' },
        { label: '查理定律（等容过程 V = 35 mL）', value: 'charles' },
        { label: '盖-吕萨克定律（等压过程 p = 101.3 kPa）', value: 'gay-lussac' },
      ],
      description: '在 3D 采集终端点击模式实体键或插拔气缸黄铜锁销切换气体实验定律',
    },
    {
      id: 'volumeML',
      name: '气体体积 V (mL)',
      type: 'range',
      defaultValue: 35.0,
      min: 18.0,
      max: 60.0,
      step: 0.5,
      unit: 'mL',
      description: '玻意耳定律等温模式下通过上下拖拽 3D 活塞 T 形手柄调节气体体积',
    },
    {
      id: 'temperatureK',
      name: '热力学温度 T (K)',
      type: 'range',
      defaultValue: 300.0,
      min: 180.0,
      max: 480.0,
      step: 1.0,
      unit: 'K',
      description: '查理定律（等容）与盖-吕萨克定律（等压）模式下拖拽底座黄铜温控旋钮调节温度',
    },
  ],
};

export default metadata;
