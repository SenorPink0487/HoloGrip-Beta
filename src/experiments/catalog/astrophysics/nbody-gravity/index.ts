import * as THREE from 'three';
import { BaseExperiment } from '../../../base/BaseExperiment.ts';
import type { ExperimentMetadata, ExperimentContext } from '../../../../core/types.ts';
import { metadata } from './meta.ts';

export default class NBodyGravityExperiment extends BaseExperiment {
  public readonly metadata: ExperimentMetadata = metadata;

  private majorBodies: THREE.Mesh[] = [];
  private particlePoints: THREE.Points;
  private particlePositions: Float32Array;
  private particleVelocities: Float32Array;
  private particleMasses: Float32Array;
  private isComputing = false;
  private isDisposed = false;

  public init(context: ExperimentContext): void {
    // 1. Create 3 major gravitational stars (The Three-Body System)
    const starColors = [0x00f0ff, 0xff7700, 0xbf55ec];
    const starGeo = this.track(new THREE.SphereGeometry(0.045, 32, 32));

    for (let i = 0; i < 3; i++) {
      const starMat = this.track(
        new THREE.MeshStandardMaterial({
          color: starColors[i],
          emissive: starColors[i],
          emissiveIntensity: 1.2,
          roughness: 0.1,
        })
      );
      const star = this.track(new THREE.Mesh(starGeo, starMat));
      this.majorBodies.push(star);
      this.rootGroup.add(star);

      // Star point glow light
      const starLight = this.track(new THREE.PointLight(starColors[i], 0.6, 1.8, 2.0));
      star.add(starLight);
    }

    // 2. Accretion swarm particles
    const count = context.getParameter<number>('particleCount') ?? 400;
    this.particlePositions = new Float32Array(count * 3);
    this.particleVelocities = new Float32Array(count * 3);
    this.particleMasses = new Float32Array(count);

    // Initial stable disc orbit setup
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 0.15 + Math.random() * 0.55;
      const theta = Math.random() * Math.PI * 2;
      const v = Math.sqrt(0.8 / r) * 0.45;

      this.particlePositions[i3] = Math.cos(theta) * r;
      this.particlePositions[i3 + 1] = (Math.random() - 0.5) * 0.04;
      this.particlePositions[i3 + 2] = Math.sin(theta) * r;

      this.particleVelocities[i3] = -Math.sin(theta) * v;
      this.particleVelocities[i3 + 1] = 0;
      this.particleVelocities[i3 + 2] = Math.cos(theta) * v;

      this.particleMasses[i] = 0.0001;
    }

    // Assign major masses to first 3 entities
    this.particleMasses[0] = 1.0;
    this.particleMasses[1] = 0.85;
    this.particleMasses[2] = 0.95;

    const pGeo = this.track(new THREE.BufferGeometry());
    // Dedicated stable render buffer for Three.js so posAttr.array is never detached by Web Worker transfers
    const renderPositions = new Float32Array(this.particlePositions);
    pGeo.setAttribute('position', new THREE.BufferAttribute(renderPositions, 3));

    const pMat = this.track(
      new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.012,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    this.particlePoints = this.track(new THREE.Points(pGeo, pMat));
    this.rootGroup.add(this.particlePoints);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    const speed = context.getParameter<number>('simulationSpeed') ?? 1.0;
    const g = context.getParameter<number>('gravitationalConstant') ?? 1.2;
    const dt = Math.min(delta * speed, 0.04);

    // Offload simulation computation to multi-core worker/Rust bridge
    if (!this.isComputing && this.particlePositions) {
      this.isComputing = true;

      context.computeBridge
        .simulateNBody(
          this.particlePositions,
          this.particleVelocities,
          this.particleMasses,
          dt,
          g,
          0.05 // Softening factor
        )
        .then((result) => {
          if (this.isDisposed) return;
          this.particlePositions = result.positions;
          this.particleVelocities = result.velocities;

          // Update Three.js buffer attribute smoothly without breaking typed array binding
          const posAttr = this.particlePoints?.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
          if (posAttr) {
            if (posAttr.array.length === result.positions.length && !(posAttr.array.buffer as any).detached) {
              posAttr.copyArray(result.positions);
            } else {
              posAttr.array = new Float32Array(result.positions);
            }
            posAttr.needsUpdate = true;
          }

          // Sync major star positions
          for (let i = 0; i < 3; i++) {
            const i3 = i * 3;
            if (this.majorBodies[i]) {
              this.majorBodies[i].position.set(
                this.particlePositions[i3],
                this.particlePositions[i3 + 1],
                this.particlePositions[i3 + 2]
              );
            }
          }

          this.isComputing = false;
        })
        .catch(() => {
          this.isComputing = false;
        });
    }

    this.rootGroup.rotation.y += delta * 0.15;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
