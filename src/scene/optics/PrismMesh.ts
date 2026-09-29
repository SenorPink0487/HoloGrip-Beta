import * as THREE from 'three';

export type PrismGeometryType = 'equilateral' | 'semicircular';

export class PrismMesh {
  public readonly group = new THREE.Group();

  public prismType: PrismGeometryType = 'equilateral';
  public refractiveIndex = 1.54;

  private equilateralMesh: THREE.Mesh;
  private semicircularMesh: THREE.Mesh;
  private glassMaterial: THREE.MeshPhysicalMaterial;

  constructor(type: PrismGeometryType = 'equilateral', index = 1.54) {
    this.prismType = type;
    this.refractiveIndex = index;
    this.group.name = 'PrismMesh';
    this.group.userData = { isPrism: true, prism: this };
    this.createGlassMaterial();
    this.createGeometries();
    this.setType(type);
  }

  private createGlassMaterial(): void {
    // 高性能物理玻璃材质：采用前向镜面清漆高光瓣，避免传输帧缓冲拷贝，
    // 在保持 120+ FPS 超高帧率的同时呈现晶莹剔透的光学玻璃质感
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf0f7ff,
      roughness: 0.04,
      metalness: 0.04,
      ior: this.refractiveIndex,
      reflectivity: 0.90,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private createGeometries(): void {
    const prismHeight = 0.065;
    const side = 0.075;

    // 1. 60 度等边三棱镜
    const triShape = new THREE.Shape();
    const h = side * Math.sin(Math.PI / 3);
    triShape.moveTo(0, h * 0.667);
    triShape.lineTo(-side * 0.5, -h * 0.333);
    triShape.lineTo(side * 0.5, -h * 0.333);
    triShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: prismHeight,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
    };

    const triGeo = new THREE.ExtrudeGeometry(triShape, extrudeSettings);
    triGeo.center();
    this.equilateralMesh = new THREE.Mesh(triGeo, this.glassMaterial);
    this.equilateralMesh.rotation.x = Math.PI * 0.5;
    this.equilateralMesh.position.y = prismHeight * 0.5;
    this.equilateralMesh.castShadow = true;
    this.equilateralMesh.name = 'EquilateralPrism';
    this.equilateralMesh.userData = { isPrism: true, prism: this };
    this.group.add(this.equilateralMesh);

    // 2. 半圆柱透镜棱镜（半径 40mm）
    const semiShape = new THREE.Shape();
    const r = 0.042;
    semiShape.absarc(0, 0, r, 0, Math.PI, false);
    semiShape.lineTo(r, 0);
    semiShape.closePath();

    const semiGeo = new THREE.ExtrudeGeometry(semiShape, extrudeSettings);
    semiGeo.center();
    this.semicircularMesh = new THREE.Mesh(semiGeo, this.glassMaterial);
    this.semicircularMesh.rotation.x = Math.PI * 0.5;
    this.semicircularMesh.position.y = prismHeight * 0.5;
    this.semicircularMesh.castShadow = true;
    this.semicircularMesh.visible = false;
    this.semicircularMesh.name = 'SemicircularPrism';
    this.semicircularMesh.userData = { isPrism: true, prism: this };
    this.group.add(this.semicircularMesh);
  }

  public setType(type: PrismGeometryType): void {
    this.prismType = type;
    this.equilateralMesh.visible = type === 'equilateral';
    this.semicircularMesh.visible = type === 'semicircular';
  }

  public toggleType(): PrismGeometryType {
    const next = this.prismType === 'equilateral' ? 'semicircular' : 'equilateral';
    this.setType(next);
    return next;
  }

  public setRefractiveIndex(index: number): void {
    this.refractiveIndex = index;
    this.glassMaterial.ior = index;
  }

  public dispose(): void {
    this.glassMaterial.dispose();
  }
}
