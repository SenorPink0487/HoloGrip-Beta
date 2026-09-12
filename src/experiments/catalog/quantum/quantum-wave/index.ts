import * as THREE from 'three';
import { BaseExperiment } from '../../../base/BaseExperiment.ts';
import type { ExperimentMetadata, ExperimentContext } from '../../../../core/types.ts';
import { metadata } from './meta.ts';

export default class QuantumWaveExperiment extends BaseExperiment {
  public readonly metadata: ExperimentMetadata = metadata;

  private waveMesh: THREE.Mesh;
  private wavePoints: THREE.Points;
  private barrierMesh: THREE.Group;
  private wavePositions: THREE.BufferAttribute;
  private originalPos: THREE.BufferAttribute;
  private waveTime = 0;

  private gridX = 48;
  private gridZ = 36;
  private waveWidth = 1.6;
  private waveDepth = 1.2;

  public init(context: ExperimentContext): void {
    const geo = this.track(
      new THREE.PlaneGeometry(this.waveWidth, this.waveDepth, this.gridX - 1, this.gridZ - 1)
    );
    geo.rotateX(-Math.PI / 2);

    this.wavePositions = geo.attributes.position as THREE.BufferAttribute;
    this.originalPos = this.wavePositions.clone();

    // 1. Quantum Wave surface mesh
    const waveMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        wireframe: context.getParameter('wireframe') ?? true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.waveMesh = this.track(new THREE.Mesh(geo, waveMat));
    this.waveMesh.position.set(0, 0.08, 0);
    this.rootGroup.add(this.waveMesh);

    // 2. Vertex Node Particles
    const pointsMat = this.track(
      new THREE.PointsMaterial({
        color: 0x58f7ff,
        size: 0.016,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.wavePoints = this.track(new THREE.Points(geo, pointsMat));
    this.wavePoints.position.copy(this.waveMesh.position);
    this.rootGroup.add(this.wavePoints);

    // 3. Dual-Slit Barrier Hologram
    this.createDoubleSlitBarrier();
  }

  private createDoubleSlitBarrier(): void {
    this.barrierMesh = this.track(new THREE.Group());
    const barrierMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.2,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.85,
      })
    );

    // Wall plates on left, center and right leaving two slits
    const h = 0.22;
    const thickness = 0.02;
    const plateGeo = this.track(new THREE.BoxGeometry(0.55, h, thickness));

    const leftPlate = this.track(new THREE.Mesh(plateGeo, barrierMat));
    leftPlate.position.set(-0.55, h / 2, 0);
    this.barrierMesh.add(leftPlate);

    const rightPlate = this.track(new THREE.Mesh(plateGeo, barrierMat));
    rightPlate.position.set(0.55, h / 2, 0);
    this.barrierMesh.add(rightPlate);

    const centerPlate = this.track(new THREE.Mesh(new THREE.BoxGeometry(0.18, h, thickness), barrierMat));
    centerPlate.position.set(0, h / 2, 0);
    this.barrierMesh.add(centerPlate);

    this.rootGroup.add(this.barrierMesh);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    this.waveTime += delta;
    const speed = context.getParameter<number>('waveSpeed') ?? 2.2;
    const slitDist = context.getParameter<number>('slitSeparation') ?? 0.38;
    const t = this.waveTime * speed;

    const count = this.wavePositions.count;
    const orig = this.originalPos;
    const pos = this.wavePositions;

    const slit1X = -slitDist / 2;
    const slit2X = slitDist / 2;

    for (let i = 0; i < count; i++) {
      const x = orig.getX(i);
      const z = orig.getZ(i);

      let y = 0;
      if (z < 0) {
        // Incident wave packet approaching slit
        y = Math.sin(z * 10.0 + t * 2.0) * 0.06 * Math.exp(-Math.abs(x) * 1.5);
      } else {
        // Interference pattern past the double slit
        const d1 = Math.hypot(x - slit1X, z);
        const d2 = Math.hypot(x - slit2X, z);

        const psi1 = Math.sin(d1 * 14.0 - t * 2.4) / (1.0 + d1 * 2.0);
        const psi2 = Math.sin(d2 * 14.0 - t * 2.4) / (1.0 + d2 * 2.0);

        // Wave superposition: Ψ_total = Ψ₁ + Ψ₂
        y = (psi1 + psi2) * 0.08;
      }

      pos.setY(i, y);
    }

    this.wavePositions.needsUpdate = true;
    this.rootGroup.rotation.y = Math.sin(elapsed * 0.2) * 0.08;
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (id === 'wireframe' && this.waveMesh) {
      (this.waveMesh.material as THREE.MeshBasicMaterial).wireframe = !!value;
    }
    if (id === 'showParticles' && this.wavePoints) {
      this.wavePoints.visible = !!value;
    }
  }
}
