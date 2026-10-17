import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'em-capacitor-discharge',
  name: '电容器充放电与RC过程',
  category: 'electromagnetism',
  categoryName: '电磁学',
  description: '3D电容器充放电与RC暂态电路实验台。配备直流稳压电源、单刀双掷开关、电容器、放电电阻与高精度电流传感器。将单刀双掷开关掷向电源侧给电容器充电，掷向另一侧放电。以独立悬浮波形窗口形式实时呈现I-t电流图像与U-t电压图像，支持时间常数τ=RC与曲线积分电量科研分析。',
  tags: ['电磁学', '电容器', '充放电', 'RC电路', '单刀双掷开关', '电流传感器', '时间常数', '暂态响应'],
  icon: 'physics',
  equation: 'I(t) = \\frac{E}{R} e^{-t/RC} \\quad U_c(t) = E(1 - e^{-t/RC}) \\quad \\tau = RC',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'voltage',
      name: '电源输出电压 E',
      type: 'range',
      defaultValue: 10.0,
      min: 2.0,
      max: 20.0,
      step: 0.5,
      unit: 'V',
      description: '直流稳压电源输出电压',
    },
    {
      id: 'capacitance',
      name: '电容器容量 C',
      type: 'range',
      defaultValue: 1000.0,
      min: 100.0,
      max: 3000.0,
      step: 50.0,
      unit: 'µF',
      description: '储能滤波电容器标称电容量',
    },
    {
      id: 'resistance',
      name: '放电负载电阻 R',
      type: 'range',
      defaultValue: 1000.0,
      min: 200.0,
      max: 3000.0,
      step: 50.0,
      unit: 'Ω',
      description: '放电回路大功率水泥线绕负载电阻阻值',
    },
    {
      id: 'switchPosition',
      name: '单刀双掷开关档位',
      type: 'select',
      defaultValue: 'neutral',
      options: [
        { label: '掷于电源侧（充电模式）', value: 'charge' },
        { label: '中立断开（电荷保持）', value: 'neutral' },
        { label: '掷于放电侧（放电模式）', value: 'discharge' },
      ],
      description: '单刀双掷开关动触刀档位切换',
    },
    {
      id: 'showLabels',
      name: '3D器材悬浮标牌',
      type: 'boolean',
      defaultValue: true,
      description: '显示电源、开关、电容、电阻与传感器3D浮动注解',
    },
  ],
};

export default metadata;
