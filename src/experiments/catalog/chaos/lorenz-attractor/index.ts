import * as THREE from 'three';
import { BaseExperiment } from '../../../base/BaseExperiment.ts';
import type { ExperimentMetadata, ExperimentContext } from '../../../../core/types.ts';
import { metadata } from './meta.ts';

export default class LorenzAttractorExperiment extends BaseExperiment {
  public readonly metadata: ExperimentMetadata = metadata;

  private particles: THREE.Points;
  private particlePositions: Float32Array;
  private particleColors: Float32Array;
  private isComputing = false;
  private isDisposed = false;
  private scale = 0.022;

  public init(context: ExperimentContext): void {
    const count = 1800;
    this.particlePositions = new Float32Array(count * 3);
    this.particleColors = new Float32Array(count * 3);

    // Seed particles near origin with small perturbations
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.particlePositions[i3] = (Math.random() - 0.5) * 4.0;
      this.particlePositions[i3 + 1] = (Math.random() - 0.5) * 4.0;
      this.particlePositions[i3 + 2] = 20.0 + (Math.random() - 0.5) * 6.0;

      // Color based on particle index for visual differentiation of trajectory divergence
      const hue = (i / count) * 0.3 + 0.5; // Cyan to purple
      const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
      this.particleColors[i3] = color.r;
      this.particleColors[i3 + 1] = color.g;
      this.particleColors[i3 + 2] = color.b;
    }

    const geo = this.track(new THREE.BufferGeometry());
    // Dedicated stable render buffer for Three.js so posAttr.array is never detached by Web Worker transfers
    const renderPositions = new Float32Array(this.particlePositions);
    geo.setAttribute('position', new THREE.BufferAttribute(renderPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));

    const mat = this.track(
      new THREE.PointsMaterial({
        size: 0.014,
        vertexColors: true,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    this.particles = this.track(new THREE.Points(geo, mat));
    this.particles.scale.set(this.scale, this.scale, this.scale);
    this.particles.position.set(0, -0.45, 0); // Center in hologram view volume
    this.rootGroup.add(this.particles);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    const sigma = context.getParameter<number>('sigma') ?? 10.0;
    const rho = context.getParameter<number>('rho') ?? 28.0;
    const beta = context.getParameter<number>('beta') ?? 2.667;
    const flowSpeed = context.getParameter<number>('flowSpeed') ?? 1.2;

    const dt = Math.min(delta * flowSpeed * 0.7, 0.025);

    if (!this.isComputing && this.particlePositions) {
      this.isComputing = true;
      context.computeBridge
        .simulateLorenz(this.particlePositions, sigma, rho, beta, dt)
        .then((newPositions) => {
          if (this.isDisposed) return;
          this.particlePositions = newPositions;
          const posAttr = this.particles?.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
          if (posAttr) {
            if (posAttr.array.length === newPositions.length && !(posAttr.array.buffer as any).detached) {
              posAttr.copyArray(newPositions);
            } else {
              posAttr.array = new Float32Array(newPositions);
            }
            posAttr.needsUpdate = true;
          }
          this.isComputing = false;
        })
        .catch(() => {
          this.isComputing = false;
        });
    }

    this.rootGroup.rotation.y += delta * 0.25;
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
