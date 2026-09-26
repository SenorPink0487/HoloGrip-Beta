import * as THREE from 'three';
import { labLookDirection, smootherstep, type LabEntryFrame, type LabEntryPose } from './labEntry.ts';

/** Shorter than the entry push, and it steps backward instead of focusing in. */
export const LAB_RETURN_BACK = 0.42;
/** World-up lift, so the gaze leaves the table instead of pushing toward it. */
export const LAB_RETURN_LIFT = 0.14;
/** Added to pitch. Positive raises the view for the entry pose's downward tilt. */
export const LAB_RETURN_PITCH = 0.05;
export const LAB_RETURN_DURATION = 1.08;
export const LAB_RETURN_FEATHER = 42;

export interface LabReturnBounds {
  roomRadius: number;
  tableRadius: number;
  minHeight: number;
  maxHeight: number;
  minPitch: number;
  maxPitch: number;
}

export interface LabReturnClock {
  elapsed: number;
  duration: number;
  from: LabEntryPose;
  to: LabEntryPose;
}

const look = new THREE.Vector3();

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Same settle as the camera, so the far corner of the lab stays visible through the middle of the return. */
export function sheetEase(t: number): number {
  return smootherstep(t);
}

/** Tools and the dock arrive after the paper has covered most of the view. */
export function returnChrome(linear: number): number {
  return smoothstep(0.42, 0.88, linear);
}

export function returnStartRadius(covered: number, cover: number): number {
  const button = 28;
  return button + clamp01(covered) * Math.max(0, cover - button);
}

/** Radius that pushes the soft edge past every corner of the viewport. */
export function returnCoverRadius(width: number, height: number, originX: number, originY: number): number {
  const far = Math.hypot(Math.max(originX, width - originX), Math.max(originY, height - originY));
  return far + LAB_RETURN_FEATHER + 24;
}

export function returnMask(originX: number, originY: number, radius: number): string {
  const edge = Math.max(0, radius);
  const solid = Math.max(0, edge - LAB_RETURN_FEATHER);
  return `radial-gradient(circle at ${originX.toFixed(1)}px ${originY.toFixed(1)}px, #fff ${solid.toFixed(1)}px, rgba(255,255,255,0) ${edge.toFixed(1)}px)`;
}

function fits(from: LabEntryPose, forward: THREE.Vector3, distance: number, bounds: LabReturnBounds): boolean {
  const lift = LAB_RETURN_BACK <= 0 ? 0 : distance / LAB_RETURN_BACK;
  const x = from.x - forward.x * distance;
  const y = from.y - forward.y * distance + LAB_RETURN_LIFT * lift;
  const z = from.z - forward.z * distance;
  const flat = Math.hypot(x, z);
  if (flat > bounds.roomRadius - 0.18) return false;
  if (flat < bounds.tableRadius + 0.08) return false;
  if (y < bounds.minHeight + 0.02 || y > bounds.maxHeight - 0.02) return false;
  return true;
}

function allowedDistance(from: LabEntryPose, forward: THREE.Vector3, bounds: LabReturnBounds): number {
  if (!fits(from, forward, 0, bounds)) return 0;
  if (fits(from, forward, LAB_RETURN_BACK, bounds)) return LAB_RETURN_BACK;
  let lo = 0;
  let hi = LAB_RETURN_BACK;
  for (let step = 0; step < 14; step += 1) {
    const mid = (lo + hi) / 2;
    if (fits(from, forward, mid, bounds)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** End of the return: a short step backward and a lift. Field of view stays put. */
export function labReturnEnd(from: LabEntryPose, bounds: LabReturnBounds): LabEntryPose {
  labLookDirection(from.yaw, from.pitch, look);
  const distance = allowedDistance(from, look, bounds);
  const lift = LAB_RETURN_BACK <= 0 ? 0 : distance / LAB_RETURN_BACK;
  const pitch = Math.min(bounds.maxPitch, Math.max(bounds.minPitch, from.pitch + LAB_RETURN_PITCH));
  return {
    x: from.x - look.x * distance,
    y: from.y - look.y * distance + LAB_RETURN_LIFT * lift,
    z: from.z - look.z * distance,
    yaw: from.yaw,
    pitch,
    fov: from.fov,
  };
}

export function createLabReturnClock(from: LabEntryPose, bounds: LabReturnBounds, duration = LAB_RETURN_DURATION): LabReturnClock {
  return { elapsed: 0, duration, from, to: labReturnEnd(from, bounds) };
}

function lerpPose(from: LabEntryPose, to: LabEntryPose, t: number): LabEntryPose {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
    yaw: from.yaw + (to.yaw - from.yaw) * t,
    pitch: from.pitch + (to.pitch - from.pitch) * t,
    fov: from.fov + (to.fov - from.fov) * t,
  };
}

export function advanceLabReturn(clock: LabReturnClock, dt: number): LabEntryFrame {
  clock.elapsed += Math.max(0, dt);
  const linear = clock.duration <= 0 ? 1 : Math.min(1, clock.elapsed / clock.duration);
  const u = linear >= 1 ? 1 : smootherstep(linear);
  return {
    linear,
    u,
    done: linear >= 1,
    pose: lerpPose(clock.from, clock.to, u),
  };
}
