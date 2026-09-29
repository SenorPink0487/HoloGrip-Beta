import * as THREE from 'three';

const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const planeNormal = new THREE.Vector3();
const planeOrigin = new THREE.Vector3();
const facePlane = new THREE.Plane();
const raycaster = new THREE.Raycaster();

export interface Viewport {
  width: number;
  height: number;
}

/**
 * 指针光线与实验台表面的交点（局部 XY 平面，法线为局部 +Z 方向）。
 * 当相机位于 +Z 朝向 -Z 观察时，屏幕向右对应局部 +X，屏幕向上对应局部 +Y。
 */
export function localPointOnBenchFace(
  event: { clientX: number; clientY: number },
  camera: THREE.Camera,
  bench: THREE.Object3D,
  viewport?: Viewport,
  elevation = 0,
): THREE.Vector3 | null {
  const width = viewport?.width || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1;
  const height = viewport?.height || (typeof window !== 'undefined' ? window.innerHeight : 0) || 1;
  ndc.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  bench.updateWorldMatrix(true, false);
  planeNormal.set(0, 0, 1).transformDirection(bench.matrixWorld);
  planeOrigin.setFromMatrixPosition(bench.matrixWorld);
  if (elevation !== 0) {
    planeOrigin.addScaledVector(planeNormal, elevation);
  }
  facePlane.setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);
  if (!raycaster.ray.intersectPlane(facePlane, hitPoint)) return null;
  return bench.worldToLocal(hitPoint.clone());
}

export function findInteractable(
  start: THREE.Object3D | null,
  root: THREE.Object3D,
  names: readonly string[],
): string | null {
  let obj = start;
  while (obj) {
    if (names.includes(obj.name)) return obj.name;
    if (obj === root) break;
    obj = obj.parent;
  }
  return null;
}
