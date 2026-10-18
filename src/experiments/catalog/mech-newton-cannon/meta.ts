import type { ExperimentMetadata } from '../../../core/types.ts';

export const metadata: ExperimentMetadata = {
  id: 'mech-newton-cannon',
  name: '牛顿大炮',
  category: 'mechanics',
  categoryName: '经典力学',
  description:
    '经典牛顿大炮 (Newton\'s Cannonball) 思想实验与开普勒引力轨道精密 3D 实验台：在一座巍峨的高山之巅架设大炮向水平方向发射炮弹。设定发射粒子的初速度范围与数量，观察物体受地球万有引力作用下的不同运动轨迹。当初速度较小时，物体走抛物线落回地面；当速度增大到第一宇宙速度 (v₁ ≈ 7.91 km/s) 时，重力恰好充当向心力，物体不再坠落回地面，而是绕地球做匀速圆周运动，成为人造地球卫星！继续增大速度，物体将沿椭圆轨道运行；若达到第二宇宙速度 (v₂ ≈ 11.18 km/s)，则挣脱地球引力束缚飞向深空。',
  tags: [
    '力学',
    '万有引力',
    '牛顿大炮',
    '第一宇宙速度',
    '人造卫星',
    '开普勒定律',
    '第二宇宙速度',
    '天体力学',
    '卫星轨道',
  ],
  icon: 'physics',
  equation:
    'v_1 = \\sqrt{\\frac{GM}{R}} \\approx 7.91\\text{ km/s} \\quad v_2 = \\sqrt{\\frac{2GM}{R}} \\approx 11.18\\text{ km/s} \\quad \\vec{a} = -\\frac{GM}{r^3}\\vec{r}',
  computeIntensity: 'low',
  parameters: [
    {
      id: 'particleCount',
      name: '发射粒子个数 N',
      type: 'range',
      defaultValue: 8,
      min: 1,
      max: 32,
      step: 1,
      unit: '个',
      description: '单次并发发射的炮弹粒子数量 (可在 3D 控制台通过 [-]/[+] 或快捷键调整)',
    },
    {
      id: 'minVelocity',
      name: '最小发射初速 V_min',
      type: 'range',
      defaultValue: 3.5,
      min: 1.0,
      max: 12.0,
      step: 0.1,
      unit: 'km/s',
      description: '粒子群初速度区间的下限 (千米/秒)',
    },
    {
      id: 'maxVelocity',
      name: '最大发射初速 V_max',
      type: 'range',
      defaultValue: 11.2,
      min: 1.0,
      max: 15.0,
      step: 0.1,
      unit: 'km/s',
      description: '粒子群初速度区间的上限 (千米/秒，涵盖落体、卫星与逃逸速度)',
    },
    {
      id: 'timeScale',
      name: '时间流速倍率',
      type: 'range',
      defaultValue: 120.0,
      min: 20.0,
      max: 300.0,
      step: 10.0,
      unit: 'x',
      description: '天体物理轨道演化时间倍率 (默认 120x 使卫星在数十秒内完成公转)',
    },
  ],
};

export default metadata;
