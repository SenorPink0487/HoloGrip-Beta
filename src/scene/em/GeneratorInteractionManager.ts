import * as THREE from 'three';
import type { GeneratorBenchMesh } from './GeneratorBenchMesh.ts';
import type { ExperimentContext } from '../../core/types.ts';
import type { GeneratorOutputType } from '../../physics/em/generator.ts';

export interface GeneratorInteractionCallbacks {
  bench: GeneratorBenchMesh;
  onCrankDrive?: (torqueNm: number, deltaAngleRad: number) => void;
  onToggleOutputType?: (type: GeneratorOutputType) => void;
  onToggleBulb?: () => void;
  onSpeedBoost?: () => void;
}

export class GeneratorInteractionManager {
  private bench: GeneratorBenchMesh;
  private callbacks: GeneratorInteractionCallbacks;

  private isDraggingCrank = false;
  private lastDragAngle = 0;
  private lastDragTime = 0;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dragPlane = new THREE.Plane();
  private planeHitPoint = new THREE.Vector3();

  constructor(callbacks: GeneratorInteractionCallbacks) {
    this.bench = callbacks.bench;
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObjects(this.bench.group.children, true);
    if (hits.length === 0) return null;

    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.bench.group) {
        if (obj === this.bench.crankHandleGroup || obj === this.bench.crankGripMesh) {
          return { id: 'crank', label: '手摇发电机曲柄手柄 (拖拽旋转驱动 / 手摇加速)', cursor: 'grab' };
        }
        if (
          obj === this.bench.slipRingsGroup ||
          obj === this.bench.commutatorGroup ||
          obj === this.bench.brushGroup
        ) {
          const mode = this.bench.getOutputType() === 'ac' ? '交流双滑环' : '直流换向器';
          return { id: 'commutator', label: `输出机构 [当前: ${mode}] (点击切换 AC/DC)`, cursor: 'pointer' };
        }
        if (obj === this.bench.bulbGroup) {
          return { id: 'bulb', label: '负载小灯泡 (随发电功率发光)', cursor: 'pointer' };
        }
        if (obj === this.bench.galvanometer.group) {
          return { id: 'galvanometer', label: '微安演示检流计 G (观察正弦交变与脉动直流偏转)', cursor: 'default' };
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  public onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (!context?.camera) return false;

    this.lastDragTime = performance.now();

    // 1. 抓取手柄
    if (this.isHitGroup(hit, this.bench.crankHandleGroup) || this.isHitGroup(hit, this.bench.crankGripMesh)) {
      this.isDraggingCrank = true;
      this.setupCrankDragPlane(context.camera, this.bench.rotorShaftGroup.position);
      this.lastDragAngle = this.computeAngleFromPointer(event, context.camera);
      return true;
    }

    // 2. 点击换向器 / 滑环切换模式
    if (
      this.isHitGroup(hit, this.bench.slipRingsGroup) ||
      this.isHitGroup(hit, this.bench.commutatorGroup) ||
      this.isHitGroup(hit, this.bench.brushGroup)
    ) {
      const nextType = this.bench.getOutputType() === 'ac' ? 'dc' : 'ac';
      this.bench.setOutputType(nextType);
      this.callbacks.onToggleOutputType?.(nextType);
      return true;
    }

    // 3. 点击灯泡
    if (this.isHitGroup(hit, this.bench.bulbGroup)) {
      this.callbacks.onToggleBulb?.();
      return true;
    }

    return false;
  }

  public onPointerMove(
    event: PointerEvent,
    _hit?: THREE.Intersection | null,
    context?: ExperimentContext
  ): void {
    if (!this.isDraggingCrank || !context?.camera) return;

    const currentAngle = this.computeAngleFromPointer(event, context.camera);
    let deltaAngle = currentAngle - this.lastDragAngle;

    // 处理跨越 -PI ~ +PI 的突变
    if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    else if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

    this.lastDragAngle = currentAngle;

    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastDragTime) / 1000.0);
    this.lastDragTime = now;

    if (Math.abs(deltaAngle) > 1e-4) {
      const angularVel = deltaAngle / dt;
      // 施加驱动力矩
      const driveTorque = Math.sign(angularVel) * Math.min(0.04, Math.abs(angularVel) * 0.003);
      this.callbacks.onCrankDrive?.(driveTorque, deltaAngle);
    }
  }

  public onPointerUp(_event?: PointerEvent, _context?: ExperimentContext): void {
    if (this.isDraggingCrank) {
      this.isDraggingCrank = false;
    }
  }

  private setupCrankDragPlane(camera: THREE.Camera, shaftPos: THREE.Vector3): void {
    const normal = new THREE.Vector3(0, 0, 1); // 垂直于转轴 Z 的 XY 平面
    const worldCenter = shaftPos.clone().applyMatrix4(this.bench.group.matrixWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, worldCenter);
  }

  private computeAngleFromPointer(event: PointerEvent, camera: THREE.Camera): number {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1;
    this.ndc.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, camera);

    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHitPoint)) {
      const shaftWorld = this.bench.rotorShaftGroup.position.clone().applyMatrix4(this.bench.group.matrixWorld);
      const dx = this.planeHitPoint.x - shaftWorld.x;
      const dy = this.planeHitPoint.y - shaftWorld.y;
      return Math.atan2(dy, dx);
    }
    return 0;
  }

  private isHitGroup(hit: THREE.Intersection | null, group: THREE.Object3D): boolean {
    if (!hit) return false;
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj === group) return true;
      obj = obj.parent;
    }
    return false;
  }
}
