/**
 * HoloGrip Mechanics 3D Lab Equipment Material & Mesh Utilities
 */

import * as THREE from 'three';

export function mechMetal(color: number = 0x94a3b8, metalness = 0.85, roughness = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

export function mechIron(color: number = 0x1e293b, metalness = 0.5, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

export function mechWood(color: number = 0xb45309, roughness = 0.65): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

export function mechGlow(color: number, intensity = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.2,
    roughness: 0.3,
  });
}

export function mechGlass(opacity = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    metalness: 0.1,
    roughness: 0.05,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createForceArrow(
  color: number,
  headLength = 0.06,
  headWidth = 0.035,
): { group: THREE.Group; setVector: (dir: THREE.Vector3, length: number) => void; setVisible: (v: boolean) => void } {
  const group = new THREE.Group();
  const mat = mechGlow(color, 0.8);
  mat.toneMapped = false;

  const shaftGeom = new THREE.CylinderGeometry(0.006, 0.006, 1, 8);
  shaftGeom.translate(0, 0.5, 0);
  const shaftMesh = new THREE.Mesh(shaftGeom, mat);

  const headGeom = new THREE.ConeGeometry(headWidth, headLength, 12);
  headGeom.translate(0, headLength * 0.5, 0);
  const headMesh = new THREE.Mesh(headGeom, mat);

  group.add(shaftMesh);
  group.add(headMesh);

  const setVector = (dir: THREE.Vector3, length: number) => {
    if (length < 1e-4) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const normDir = dir.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normDir);
    group.quaternion.copy(quat);

    const actualHead = Math.min(headLength, length * 0.4);
    const actualShaft = Math.max(0.001, length - actualHead);

    shaftMesh.scale.set(1, actualShaft, 1);
    headMesh.scale.set(actualHead / headLength, actualHead / headLength, actualHead / headLength);
    headMesh.position.set(0, actualShaft, 0);
  };

  const setVisible = (v: boolean) => {
    group.visible = v;
  };

  return { group, setVector, setVisible };
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of list) {
      materials.add(item);
      for (const value of Object.values(item)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
