import * as THREE from 'three';

/** Front-of-table pose the laboratory opens on. The dolly starts behind it. */
export const LAB_ENTRY_REST = {
  x: 0,
  y: 1.38,
  z: 4.25,
  yaw: 0,
  pitch: -0.07,
} as const;

/** Meters of pull-back along the camera's look axis. A short push, not a fly-through. */
export const LAB_ENTRY_DOLLY_DISTANCE = 1.05;

/** Extra vertical field of view at the start of the push. It settles to the camera's own fov. */
export const LAB_ENTRY_FOV_OPEN = 3.8;

/** Seconds. Slow enough for the glass to read, short enough that the view is not locked. */
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
  /** Smootherstep of `linear`. The camera rides this so the push starts and ends at rest. */
  u: number;
  done: boolean;
  pose: LabEntryPose;
}

export interface GlassLook {
  /** 1 = opaque board, 0 = gone. */
  fill: number;
  /** Backdrop blur in CSS pixels. Peaks while the board is frosted, then falls away. */
  blur: number;
  /** Paper dots and grid lines. They leave as the surface becomes glass. */
  dots: number;
  saturate: number;
  ink: number;
  chrome: number;
  /** 0 = the board still covers the frame, 1 = the center has opened onto the lab. */
  aperture: number;
  sheen: number;
  sheenX: number;
}

const rig = new THREE.Object3D();
const forward = new THREE.Vector3();

/** Camera look direction for Euler YXZ, rotation.x = pitch, rotation.y = yaw. Look is local −Z. */
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

/** Zero slope at both ends. The push eases in, travels, then settles on the table. */
export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function createLabEntryClock(restFov: number): LabEntryClock {
  return { elapsed: 0, duration: LAB_ENTRY_DURATION, restFov };
}

/**
 * Pose along the entry dolly.
 * `u` 0 is the pulled-back start; `u` 1 is {@link LAB_ENTRY_REST}.
 * The offset uses the camera's look direction: Euler YXZ with rotation.x = pitch
 * and rotation.y = yaw, the same orientation PlayerController writes. Look is local -Z.
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
 * Frosted-glass dissolve, keyed on linear time so the board turns to glass
 * during the dolly's slow start, then transmits as the camera pushes in.
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
 * Radial mask that opens on the table (just below screen center at the entry pose).
 * White is kept, clear is premultiplied black, so both alpha and luminance masks
 * punch the same hole.
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
