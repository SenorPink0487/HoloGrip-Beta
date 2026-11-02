import type { IExperiment, ExperimentContext } from '../../core/types.ts';
import type { DemonstrationStep, ExperimentDemonstration } from './DemonstrationPlayer.ts';
import type Lever from '../catalog/mech-lever-pulley/index.ts';
import type Fall from '../catalog/mech-free-fall/index.ts';
import type Galileo from '../catalog/mech-galileo/index.ts';
import type Suspension from '../catalog/mech-center-of-gravity/index.ts';
import type Cannon from '../catalog/mech-newton-cannon/index.ts';
import type Hall from '../catalog/em-hall/index.ts';
import type Field from '../catalog/em-field/index.ts';
import type Capacitor from '../catalog/em-capacitor-discharge/index.ts';
import type HandRules from '../catalog/em-hand-rules/index.ts';
import type Polarization from '../catalog/optics-polarization/index.ts';
import type Reflection from '../catalog/optics-reflection-refraction/index.ts';
import type Carnot from '../catalog/thermo-carnot/index.ts';
import type Syringe from '../catalog/thermo-fire-syringe/index.ts';
import type Fourier from '../catalog/thermo-fourier/index.ts';
import type Phase from '../catalog/thermo-phase-change/index.ts';

export const PHYSICS_DEMONSTRATION_IDS = [
  'mech-lever-pulley', 'mech-free-fall', 'mech-galileo', 'mech-center-of-gravity', 'mech-newton-third', 'mech-newton-cannon',
  'em-hall', 'em-field', 'em-capacitor-discharge', 'em-hand-rules',
  'optics-reflection-refraction', 'optics-dispersion', 'optics-diffraction', 'optics-double-slit', 'optics-polarization',
  'thermo-carnot', 'thermo-fire-syringe', 'thermo-fourier', 'thermo-phase-change', 'thermo-gas-laws',
] as const;

/** Scripts call the same controls as hands and instrument knobs; they never animate fake readouts. */
export function createPhysicsDemonstration(experiment: IExperiment, context: ExperimentContext): ExperimentDemonstration | null {
  const set = (id: string, value: unknown) => {
    context.setParameter(id, value);
    experiment.onParameterChange?.(id, value, context);
  };
  const setup = (values: Record<string, unknown>) => () => { for (const [id, value] of Object.entries(values)) set(id, value); };
  const hold = (caption: string, duration: number, enter?: () => void, complete?: () => boolean): DemonstrationStep => ({ caption, duration, enter, complete });
  const sweep = (caption: string, id: string, from: number, to: number, duration = 8): DemonstrationStep => ({
    caption, duration, enter: () => set(id, from), update: p => set(id, from + (to - from) * (p * p * (3 - 2 * p))),
  });
  let steps: DemonstrationStep[];
  let dispose: (() => void) | undefined;
  switch (experiment.metadata.id) {
    case 'mech-lever-pulley': {
      const e = experiment as Lever;
      steps = [
        hold('将钩码挂到杠杆两侧，观察力矩相等时的平衡。', 6, () => {
          e.resetExperiment(); e.solver.hangWeight(0, -0.2); e.solver.hangWeight(1, 0.2);
        }),
        hold('移动右侧钩码，力臂改变后，杠杆向力矩较大的一侧转动。', 7, () => e.solver.hangWeight(1, 0.35)),
        { caption: '定滑轮改变拉力方向：拉绳距离与重物上升距离相同。', duration: 6,
          enter: () => e.solver.setMode('fixed'), update: p => e.solver.pullTo(p * 0.08) },
        { caption: '换成四段绳承重的滑轮组：更省力，也需要拉出更长的绳。', duration: 7,
          enter: () => e.solver.setMode('quad'), update: p => e.solver.pullTo(p * 0.32) },
        hold('理想情况下，省力不会省功；观察测力计和提升高度的对应关系。', 4,
          undefined, () => e.solver.lift > 0.075),
      ]; break;
    }
    case 'mech-free-fall': {
      const e = experiment as Fall;
      steps = [
        hold('先在有空气的牛顿管中倒转，观察不同物体的下落。', 10, () => { set('airPressure', 101.3); set('timeScale', 0.6); e.invertTube(); }, () => e.getTelemetry().allLanded),
        hold('启动抽气机，减小空气阻力，再进行一次对比。', 7, () => { e.togglePump(true); }),
        hold('在近真空条件下倒转，比较羽毛与硬币的下落。', 8, () => { e.togglePump(false); set('airPressure', 0); e.invertTube(); }, () => e.getTelemetry().allLanded),
        hold('空气阻力消失后，各物体具有相同的重力加速度。', 5),
      ]; break;
    }
    case 'mech-galileo': {
      const e = experiment as Galileo;
      steps = [
        hold('小球从相同高度释放，先观察右侧较陡的斜面。', 10, () => { set('frictionMu', 0); set('allowOscillation', true); set('rightAngle', 30); e.resetBall(); }),
        hold('减小右侧倾角并延长斜面，再次从原高度释放。', 10, () => { e.applyRightInclineTransform(15, 1.2); e.resetBall(); }),
        hold('倾角越小，达到相同高度需要经过的距离越长。', 5, undefined, () => e.getTelemetry().rightAngleDeg < 16),
        hold('将这一趋势延伸到水平面，可以理解理想无阻力条件下的惯性运动。', 5),
      ]; break;
    }
    case 'mech-center-of-gravity': {
      const e = experiment as Suspension;
      steps = [
        hold('选择第一个悬挂孔，让薄板在重力作用下摆动。', 8, () => { set('damping', 0.055); e.animateHangPlateOnHole('hole-a'); }, () => e.getTelemetry().markedLinesCount >= 1),
        hold('薄板静止后留下铅垂线，再换一个悬挂孔。', 9, () => { e.detachPlateFromPin(); e.animateHangPlateOnHole('hole-b'); }, () => e.getTelemetry().markedLinesCount >= 2),
        hold('两条铅垂线的交点给出了薄板重心的位置。', 7, undefined, () => e.getTelemetry().measuredCenterOfGravity !== null),
        hold('将交点置于支点上，观察重心位置的平衡验证。', 6, () => set('verifyBalance', true)),
      ]; break;
    }
    case 'mech-newton-third':
      steps = [hold('连接两个测力计，缓慢增大互拉力。', 4, setup({ mode: 'manual_drag', pairPullForce: 0 })),
        sweep('拉力逐渐增大，观察两侧测力计同时变化。', 'pairPullForce', 0, 4, 10),
        sweep('再减小拉力，比较两侧读数。', 'pairPullForce', 4, 1, 10),
        hold('相互作用的两个力大小相等、方向相反，作用在不同物体上。', 6)]; break;
    case 'mech-newton-cannon': {
      const e = experiment as Cannon;
      const penetration = e.solver.allowPenetration;
      dispose = () => { e.solver.allowPenetration = penetration; };
      const launch = (preset: 'suborbital' | 'orbital' | 'escape') => () => { e.solver.allowPenetration = false; e.clearTrails(); e.applyPreset(preset); };
      steps = [hold('较小的水平发射速度下，炮弹沿弯曲轨迹落回地面。', 8, launch('suborbital'), () => e.getTelemetryData().landedCount > 0),
        { ...hold('以加速时间增大发射速度，观察围绕地球的轨道。', 9, launch('orbital'), () => e.getTelemetryData().orbitingCount > 0), simulationSpeed: 16 },
        { ...hold('继续增大发射速度，以加速时间观察逃逸轨迹。', 9, launch('escape'), () => e.getTelemetryData().escapedCount > 0), simulationSpeed: 16 },
        hold('发射速度与地球引力共同决定轨迹；本演示使用加速的轨道时间。', 4)]; break;
    }
    case 'em-hall': {
      const e = experiment as Hall;
      steps = [hold('给样品通电并施加磁场，观察载流子的横向偏转。', 10, () => { e.setCurrent(5); e.setMagField(0.3); e.setToggles(true, true); }),
        hold('反转磁场，比较偏转方向与霍尔电压极性。', 10, () => e.toggleFieldPolarity()),
        hold('再反转电流，观察电压方向随之变化。', 6, () => e.toggleCurrentPolarity()),
        hold('霍尔效应把电流、磁场和载流子性质联系起来。', 4)]; break;
    }
    case 'em-field': {
      const e = experiment as Field;
      steps = [hold('先放置两个同号电荷，观察它们之间的电场线。', 10, () => { e.loadPreset('likeCharges'); e.setToggles(true, true); }),
        hold('改成一正一负，观察从正电荷指向负电荷的场线。', 10, () => e.loadPreset('dipole')),
        { caption: '移动试探电荷，观察不同位置的电场与受力方向。', duration: 6, update: p => e.moveTestCharge(-0.25 + p * 0.5, 0.15) },
        hold('电场线表示方向与分布，试探电荷的受力由其所在位置决定。', 4)]; break;
    }
    case 'em-capacitor-discharge': {
      const e = experiment as Capacitor;
      steps = [hold('接通充电电路，电容电压上升，充电电流逐渐减小。', 9, () => { e.resetExperiment(); e.setVoltage(6); e.setCapacitance(1000); e.setResistance(1000); e.setSwitchPosition('charge'); }, () => e.getTelemetryData().voltageCapacitor > 5.5),
        hold('拨到放电位置，观察电压和电流的变化。', 8, () => e.setSwitchPosition('discharge'), () => e.getTelemetryData().voltageCapacitor < 0.5),
        hold('增大电阻后再次充放电，观察变化变慢。', 8, () => { e.setResistance(4000); e.setSwitchPosition('charge'); }),
        hold('时间常数 τ = RC：电阻或电容越大，电压变化越慢。', 5, () => e.setSwitchPosition('discharge'))]; break;
    }
    case 'em-hand-rules': {
      const e = experiment as HandRules;
      const gestureEnabled = e.isGestureEnabled();
      dispose = () => { e.setDesktopDemonstration(false); e.setGestureEnabled(gestureEnabled); };
      steps = [hold('右手握住通电导线：拇指沿电流方向，四指指示磁场环绕方向。', 8, () => { e.setRuleMode('right-hand-screw'); e.setDesktopDemonstration(true); }),
        hold('反转电流，磁场的环绕方向同时反转。', 7, () => e.reverseCurrent()),
        hold('切换右手定则，观察磁场、导体运动和感应电流的方向。', 7, () => e.setRuleMode('right-hand-rule')),
        hold('反转导体运动方向，感应电流方向随之反转。', 8, () => e.reverseMotion())]; break;
    }
    case 'optics-reflection-refraction': {
      const e = experiment as Reflection;
      steps = [hold('光从空气进入水中，观察入射光、反射光与折射光。', 4, setup({ incidentAngle: 20, isAirToWater: 'airToWater', mediumType: 'water' })),
        sweep('增大入射角，比较反射角和折射角的变化。', 'incidentAngle', 20, 65, 10),
        hold('将传播方向改为从水射向空气。', 4, setup({ isAirToWater: 'waterToAir', incidentAngle: 30 })),
        sweep('继续增大入射角，越过临界角后观察全反射。', 'incidentAngle', 30, 65, 8),
        hold('全反射发生在光由光密介质射向光疏介质、且入射角超过临界角时。', 4,
          undefined, () => e.getTelemetry().isTotalInternalReflection)]; break;
    }
    case 'optics-dispersion':
      steps = [hold('打开白光光源，狭缝后的光束进入三棱镜。', 6, setup({ lampOn: true, incidentAngle: 42 })),
        sweep('缓慢转动入射方向，观察各色光的出射位置。', 'incidentAngle', 42, 55, 10),
        sweep('再反向调节，比较光谱展开的变化。', 'incidentAngle', 55, 45, 9),
        hold('不同波长的折射率不同，白光因此分解为不同颜色的光。', 5)]; break;
    case 'optics-diffraction':
      steps = [hold('用单色光照射单缝，观察中央亮纹与两侧条纹。', 5, setup({ diffractionType: 'single', laserPower: true, wavelength: 532, slitWidth: 0.1 })),
        sweep('缩小狭缝，观察中央亮纹变宽。', 'slitWidth', 0.1, 0.03, 10),
        sweep('重新加宽狭缝，观察亮纹收窄。', 'slitWidth', 0.03, 0.15, 10),
        hold('在其他条件相同时，狭缝越窄，衍射越明显。', 5)]; break;
    case 'optics-double-slit':
      steps = [hold('单色光通过双缝，在屏上形成明暗相间的干涉条纹。', 5, setup({ laserPower: true, wavelength: 532, slitDistance: 0.25, lightSourceMode: 'monochromatic' })),
        sweep('增大双缝间距，比较相邻亮纹的距离。', 'slitDistance', 0.25, 0.5, 10),
        sweep('保持双缝间距，增大波长，观察条纹间距变化。', 'wavelength', 405, 650, 10),
        hold('条纹间距与波长和屏距成正比，与双缝间距成反比。', 5)]; break;
    case 'optics-polarization': {
      const e = experiment as Polarization;
      steps = [hold('使起偏器和检偏器的透振轴平行，观察接收屏亮度。', 5, setup({ sampleMode: 'malus_free', polarizerAngle: 0, analyzerAngle: 0, laserPower: true })),
        sweep('旋转检偏器至正交，光斑逐渐减暗并消失。', 'analyzerAngle', 0, 90, 9),
        hold('两轴正交时发生消光；出射电场沿检偏轴振动。', 3, undefined, () => e.getTelemetry().transmittedIntensity < 1e-6),
        sweep('将检偏器转回平行，观察光斑重新变亮。', 'analyzerAngle', 90, 0, 8),
        hold('光强遵循马吕斯定律 I = I₀ cos²θ，I₀ 为起偏器后的光强。', 5)]; break;
    }
    case 'thermo-carnot': {
      const e = experiment as Carnot;
      steps = [hold('以加速过程观察热机完成吸热、膨胀、放热和压缩。', 12, () => { e.resetExperiment(); e.setHotTempC(80); e.setColdTempC(20); e.setSpeedMultiplier(2); }, () => e.getTelemetryData().completedCycles >= 1),
        sweep('逐渐提高高温热源温度，观察效率读数与循环曲线。', 'hotTempC', 80, 140, 12),
        hold('理想卡诺效率取决于两热源的热力学温度：η = 1 − Tc/Th。', 6)]; break;
    }
    case 'thermo-fire-syringe': {
      const e = experiment as Syringe;
      steps = [hold('先缓慢压缩气体，观察温度升高与热量散失。', 10, () => { e.resetExperiment(); e.triggerSlowPress(); }),
        hold('提起活塞复位，准备比较快速压缩。', 4, () => e.resetExperiment()),
        hold('快速下压活塞，观察气体升温与引火棉燃烧。', 10, () => e.triggerQuickSlam(), () => e.getTelemetryData().charProgress > 0),
        hold('快速压缩时，外界做功使气体内能增加，温度可升至着火点。', 6)]; break;
    }
    case 'thermo-fourier': {
      const e = experiment as Fourier;
      steps = [hold('以加速过程观察热量从高温端向低温端传递。', 10, () => { e.setMaterial('copper'); e.setHotTempC(100); e.setColdTempC(20); e.resetExperiment(); }),
        hold('换成导热较慢的不锈钢，重新观察各测温点的变化。', 14, () => { e.setMaterial('stainless'); e.resetExperiment(); }),
        hold('热流与材料的导热系数和温度梯度有关，方向由高温端指向低温端。', 6)]; break;
    }
    case 'thermo-phase-change': {
      const e = experiment as Phase;
      steps = [hold('点燃两侧酒精灯，以压缩的实验时间观察两种试样受热。', 6, setup({ leftLampLit: true, rightLampLit: true, showChannel1: true, showChannel2: true })),
        hold('继续加热，观察晶体曲线的平台与固液共存状态。', 12, undefined, () => e.getTelemetryData().channel1MeltFraction > 0),
        hold('晶体熔化完成后温度继续上升；另一试样的曲线连续变化。', 8, undefined, () => e.getTelemetryData().channel1MeltFraction >= 1),
        hold('恒温熔化阶段仍在吸热，这部分能量称为熔化潜热。', 4)]; break;
    }
    case 'thermo-gas-laws':
      steps = [hold('选择等温过程，保持气体温度不变。', 4, setup({ mode: 'boyle', temperatureK: 300, volumeML: 50 })),
        sweep('缓慢压缩气体，观察体积减小与压强增大。', 'volumeML', 50, 25, 10),
        hold('切换为定容过程，锁定活塞。', 3, setup({ mode: 'charles', temperatureK: 300 })),
        sweep('提高气体温度，观察定容条件下的压强变化。', 'temperatureK', 300, 400, 9),
        hold('等温时 pV 不变；定容时 p/T 不变，其中 T 使用开尔文温度。', 4)]; break;
    default: return null;
  }
  return { steps, dispose };
}
