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
 * Pointer ray against the bench face (local XY, normal local +Z).
 * With the camera on +Z looking toward −Z, screen-right is local +X and screen-up is local +Y.
 */
export function localPointOnBenchFace(
  event: { clientX: number; clientY: number },
  camera: THREE.Camera,
  bench: THREE.Object3D,
  viewport?: Viewport,
): THREE.Vector3 | null {
  const width = viewport?.width || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1;
  const height = viewport?.height || (typeof window !== 'undefined' ? window.innerHeight : 0) || 1;
  ndc.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  bench.updateWorldMatrix(true, false);
  planeNormal.set(0, 0, 1).transformDirection(bench.matrixWorld);
  planeOrigin.setFromMatrixPosition(bench.matrixWorld);
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
