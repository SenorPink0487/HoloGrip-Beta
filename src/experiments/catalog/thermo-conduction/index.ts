import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { ThermoBenchPlate } from '../../../scene/thermo/ThermoBenchPlate.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoConductionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  private benchPlate: ThermoBenchPlate;
  private signMesh: THREE.Mesh;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.063, 0.96);

    this.benchPlate = this.track(new ThermoBenchPlate());
    this.rootGroup.add(this.benchPlate.group);
    this.addDisposable(() => this.benchPlate.dispose());

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 504, 248);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('热传导与傅里叶定律', 256, 90);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '22px monospace';
      ctx.fillText('q = -k ∇T', 256, 140);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.fillText('研发规划中 · 即将上线', 256, 190);
    }
    const texture = new THREE.CanvasTexture(canvas);
    this.track(texture);

    const signGeo = new THREE.PlaneGeometry(0.4, 0.2);
    const signMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    this.track(signGeo);
    this.track(signMat);

    this.signMesh = new THREE.Mesh(signGeo, signMat);
    this.signMesh.position.set(0, 0.16, 0);
    this.rootGroup.add(this.signMesh);
  }

  public update(_delta: number, _elapsed: number, _context: ExperimentContext): void {}
}
