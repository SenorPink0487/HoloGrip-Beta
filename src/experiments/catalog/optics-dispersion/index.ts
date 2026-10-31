import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalDispersionBenchMesh,
  type OpticalDispersionTelemetry,
} from '../../../scene/optics/OpticalDispersionBenchMesh.ts';
import { OpticalDispersionInteractionManager } from '../../../scene/optics/OpticalDispersionInteractionManager.ts';
import type { PrismMaterialType } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsDispersionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.80;
  public override hideCenterEmitter = true;

  private bench!: OpticalDispersionBenchMesh;
  public interactionManager!: OpticalDispersionInteractionManager;
  private latestTelemetry: OpticalDispersionTelemetry | null = null;
  private mouseNDC = new THREE.Vector2();
  private internalRaycaster = new THREE.Raycaster();

  public init(context: ExperimentContext): void {
    // 器材靠近操作者一侧桌沿，回转接光臂在全调角范围内保持位于桌面上。
    this.rootGroup.position.set(-0.12, 0.114, 0.72);
    this.rootGroup.rotation.set(0, 0, 0);

    this.bench = this.track(new OpticalDispersionBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.interactionManager = new OpticalDispersionInteractionManager(this.bench, this.rootGroup, {
      onLampToggle: (on) => {
        context.setParameter('lampOn', on);
        this.latestTelemetry = this.bench.getTelemetry();
      },
      onIncidentAngleChange: (deg) => {
        context.setParameter('incidentAngle', Number(deg.toFixed(1)));
        this.latestTelemetry = this.bench.getTelemetry();
      },
      onMaterialChange: (material) => {
        context.setParameter('prismMaterial', material);
        this.latestTelemetry = this.bench.getTelemetry();
      },
      onScreenDistanceChange: (meters, telemetry) => {
        context.setParameter('screenDistance', Number(meters.toFixed(2)));
        this.latestTelemetry = telemetry;
      },
    });

    this.latestTelemetry = this.bench.getTelemetry();
  }

  public update(_delta: number, elapsed: number, _context: ExperimentContext): void {
    this.bench?.update(elapsed);
  }

  public getTelemetry(): OpticalDispersionTelemetry {
    if (!this.latestTelemetry && this.bench) this.latestTelemetry = this.bench.getTelemetry();
    return this.latestTelemetry!;
  }

  public getBench(): OpticalDispersionBenchMesh {
    return this.bench;
  }

  public override onParameterChange(id: string, value: unknown, _context: ExperimentContext): void {
    if (!this.bench) return;
    switch (id) {
      case 'lampOn':
        this.bench.setLampOn(Boolean(value));
        break;
      case 'incidentAngle':
        this.bench.setIncidentAngle(Number(value));
        break;
      case 'prismMaterial':
        this.bench.setMaterial(String(value) as PrismMaterialType);
        break;
      case 'slitWidth':
        this.bench.setSlitWidth(Number(value));
        break;
      case 'screenDistance':
        this.bench.setScreenDistance(Number(value));
        break;
      default:
        break;
    }
    this.latestTelemetry = this.bench.getTelemetry();
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit) ?? false;
  }

  public override onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (!this.interactionManager?.isDragging) return;
    this.mouseNDC.copy(labPointerNDC(event, context?.renderer?.domElement));
    this.internalRaycaster.setFromCamera(this.mouseNDC, context.camera);
    this.interactionManager.onPointerMove(event, this.internalRaycaster);
  }

  public override onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event);
  }
}
