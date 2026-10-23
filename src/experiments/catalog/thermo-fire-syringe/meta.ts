import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'thermo-fire-syringe',
  name: '空气压缩引火仪',
  category: 'thermodynamics',
  categoryName: '热学物理',
  description:
    '探究绝热压缩做功改变气体内能的经典热力学实验：快速下压 T 形手柄时，气缸内空气来不及与外界热交换（近似绝热压缩 Q ≈ 0），外界对气体做功使内能剧增、温度飙升超过火绒着火点（260 °C）并瞬间引燃火绒；缓慢下压则因热量散失无法引燃。',
  tags: ['热学', '空气压缩引火仪', '绝热压缩', '热力学第一定律', '做功改变内能', '分子热运动'],
  icon: 'physics',
  equation: '\\Delta U = W + Q,\\; Q \\approx 0 \\implies T_2 = T_1 \\left(\\frac{V_1}{V_2}\\right)^{\\gamma - 1}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'quickSlam',
      name: '快速猛压手柄（绝热引火）',
      type: 'button',
      defaultValue: false,
      description: '模拟高速猛压活塞（Q ≈ 0），观察气体分子急剧升温变红并瞬间点燃底部火绒',
    },
    {
      id: 'slowPress',
      name: '缓慢下压手柄（散热不燃对比）',
      type: 'button',
      defaultValue: false,
      description: '模拟缓慢下压活塞，热量经气缸壁散失，温度无法达到火绒燃点',
    },
    {
      id: 'ignitionTempC',
      name: '引火棉着火点温度',
      type: 'range',
      defaultValue: 260.0,
      min: 180.0,
      max: 340.0,
      step: 5.0,
      unit: '°C',
      description: '调节底部引火棉（硝化棉/干燥火绒）的自燃着火点温度阈值',
    },
    {
      id: 'resetExperiment',
      name: '上提复位并更换新火绒',
      type: 'button',
      defaultValue: false,
      description: '将活塞拉回顶部排出余烟，并装填洁白干燥的新火绒',
    },
  ],
};

export default metadata;
