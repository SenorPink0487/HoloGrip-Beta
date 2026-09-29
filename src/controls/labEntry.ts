import * as THREE from 'three';

/** 实验室初始化时的台前停靠位姿。推轨由此位姿后方开始。 */
export const LAB_ENTRY_REST = {
  x: 0,
  y: 1.38,
  z: 4.25,
  yaw: 0,
  pitch: -0.07,
} as const;

/** 沿相机视线轴向后拉退的距离（米）。一段平缓推进，而非大范围穿梭。 */
export const LAB_ENTRY_DOLLY_DISTANCE = 1.05;

/** 推进开始时的额外垂直视场角，随后平滑过渡至相机的基准视场角。 */
export const LAB_ENTRY_FOV_OPEN = 3.8;

/** 持续时间（秒）。足够展示毛玻璃质感，同时避免视角锁定过久。 */
export const LAB_ENTRY_DURATION = 1.42;

export interface LabEntryPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  fov: number;
}

export interface LabEntryClock {
  elapsed: number;
  duration: number;
  restFov: number;
}

export interface LabEntryFrame {
  linear: number;
  /** `linear` 的 smootherstep 平滑插值。相机依据此值运动，保证启停平稳。 */
  u: number;
  done: boolean;
  pose: LabEntryPose;
}

export interface GlassLook {
  /** 1 = 完全不透明白板，0 = 完全隐去。 */
  fill: number;
  /** 背景模糊度（CSS 像素）。在磨砂玻璃效果阶段达到峰值，随后淡出。 */
  blur: number;
  /** 点阵与网格线。随着表面变为玻璃质感而逐渐消退。 */
  dots: number;
  saturate: number;
  ink: number;
  chrome: number;
  /** 0 = 白板完全覆盖画面，1 = 中心完全透出实验室场景。 */
  aperture: number;
  sheen: number;
  sheenX: number;
}

const rig = new THREE.Object3D();
const forward = new THREE.Vector3();

/** 欧拉角 YXZ 下的相机视线方向，rotation.x 为俯仰角 (pitch)，rotation.y 为偏航角 (yaw)。朝向为局部 -Z 轴。 */
export function labLookDirection(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  rig.rotation.order = 'YXZ';
  rig.rotation.x = pitch;
  rig.rotation.y = yaw;
  rig.rotation.z = 0;
  rig.updateMatrixWorld(true);
  return out.set(0, 0, -1).transformDirection(rig.matrixWorld);
}

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 两端斜率为零。推进过程平缓切入、巡航、最终平稳停靠在实验台前。 */
export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function createLabEntryClock(restFov: number): LabEntryClock {
  return { elapsed: 0, duration: LAB_ENTRY_DURATION, restFov };
}

/**
 * 入场推轨轨迹上的位姿计算。
 * `u` 为 0 时为后退起点；`u` 为 1 时为 {@link LAB_ENTRY_REST}。
 * 偏移量采用相机视线方向：欧拉角 YXZ（rotation.x 为 pitch，rotation.y 为 yaw），
 * 与 PlayerController 的朝向一致。视线为局部 -Z 轴。
 */
export function labEntryPose(u: number, restFov: number): LabEntryPose {
  const t = clamp01(u);
  const back = (1 - t) * LAB_ENTRY_DOLLY_DISTANCE;
  labLookDirection(LAB_ENTRY_REST.yaw, LAB_ENTRY_REST.pitch, forward);
  return {
    x: LAB_ENTRY_REST.x - forward.x * back,
    y: LAB_ENTRY_REST.y - forward.y * back,
    z: LAB_ENTRY_REST.z - forward.z * back,
    yaw: LAB_ENTRY_REST.yaw,
    pitch: LAB_ENTRY_REST.pitch,
    fov: restFov + (1 - t) * LAB_ENTRY_FOV_OPEN,
  };
}

export function advanceLabEntry(clock: LabEntryClock, dt: number): LabEntryFrame {
  clock.elapsed += Math.max(0, dt);
  const linear = clock.duration <= 0 ? 1 : Math.min(1, clock.elapsed / clock.duration);
  const u = linear >= 1 ? 1 : smootherstep(linear);
  return {
    linear,
    u,
    done: linear >= 1,
    pose: labEntryPose(u, clock.restFov),
  };
}

/**
 * 毛玻璃溶解过渡，基于线性时间推进，使白板在推轨缓启阶段呈现玻璃质感，
 * 随后随着相机推进完全透明化。
 */
export function glassLook(linear: number): GlassLook {
  const t = clamp01(linear);
  const frost = smoothstep(0, 0.16, t);
  const blurMix = smoothstep(0.02, 0.12, t) * (1 - smoothstep(0.4, 0.96, t));
  return {
    fill: (1 - 0.42 * frost) * (1 - smoothstep(0.34, 0.96, t)),
    blur: 12 * blurMix,
    dots: 1 - smoothstep(0, 0.12, t),
    saturate: 1 + 0.32 * blurMix,
    ink: 1 - smoothstep(0.1, 0.48, t),
    chrome: 1 - smoothstep(0, 0.22, t),
    aperture: smoothstep(0.2, 0.82, t),
    sheen: blurMix * 0.55,
    sheenX: t,
  };
}

/**
 * 聚焦在实验台上的径向遮罩（位于入场位姿屏幕中心略偏下方）。
 * 白色保留，透明为预乘黑色，因此 Alpha 遮罩和亮度遮罩均能产生相同的镂空效果。
 */
export function glassMask(aperture: number): string {
  const a = clamp01(aperture);
  if (a <= 0.001) return 'none';
  const visible = 1 - a;
  const channel = Math.round(255 * visible);
  const color = `rgba(${channel},${channel},${channel},${visible.toFixed(4)})`;
  const hole = (a * 58).toFixed(2);
  const edge = Math.min(100, a * 58 + 22).toFixed(2);
  return `radial-gradient(circle at 50% 52%, ${color} 0%, ${color} ${hole}%, #fff ${edge}%)`;
}
