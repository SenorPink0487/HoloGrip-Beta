import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalDiffractionBenchMesh,
  type DiffractionType,
  type OpticalDiffractionTelemetry,
} from '../../../scene/optics/OpticalDiffractionBenchMesh.ts';
import { OpticalDiffractionInteractionManager } from '../../../scene/optics/OpticalDiffractionInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsDiffractionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.40;
  public override hideCenterEmitter = true;

  // 核心 3D 设备与交互管理器
  private bench!: OpticalDiffractionBenchMesh;
  public interactionManager!: OpticalDiffractionInteractionManager;

  // 遥测缓存
  private latestTelemetry: OpticalDiffractionTelemetry | null = null;

  public init(context: ExperimentContext): void {
    // 将光学导轨水平正对操作者横放于实验桌面中央 (Y=0.063, Z=1.28)，平正无偏角，正对操作者视界
    this.rootGroup.position.set(0, 0.063, 1.28);
    this.rootGroup.rotation.set(0, 0, 0);

    // 1. 实例化 3D 光学导轨与衍射仪器
    this.bench = this.track(new OpticalDiffractionBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. 实例化 3D 鼠标指针交互管理器
    this.interactionManager = new OpticalDiffractionInteractionManager(
      this.bench,
      this.rootGroup,
      {
        onDiffractionTypeChange: (type) => {
          context.setParameter('diffractionType', type);
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onWavelengthChange: (wl) => {
          context.setParameter('wavelength', wl);
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onLaserPowerToggle: (on) => {
          context.setParameter('laserPower', on);
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onScreenDistanceChange: (dist, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('screenDistance', Number(dist.toFixed(2)));
        },
        onSlitWidthChange: (w) => {
          context.setParameter('slitWidth', Number(w.toFixed(2)));
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onApertureDiameterChange: (dia) => {
          context.setParameter('apertureDiameter', Number(dia.toFixed(2)));
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onProfileCurveToggle: (show) => {
          context.setParameter('showProfileCurve', show);
        },
      }
    );

    this.latestTelemetry = this.bench.getTelemetry();
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.bench) {
      this.bench.update(delta);
      this.latestTelemetry = this.bench.getTelemetry();
    }
  }

  public getTelemetry(): OpticalDiffractionTelemetry {
    if (!this.latestTelemetry && this.bench) {
      this.latestTelemetry = this.bench.getTelemetry();
    }
    return this.latestTelemetry!;
  }

  public getBench(): OpticalDiffractionBenchMesh {
    return this.bench;
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (!this.bench) return;

    switch (id) {
      case 'diffractionType':
        this.bench.setDiffractionType(value as DiffractionType);
        break;
      case 'wavelength':
        this.bench.setWavelength(Number(value));
        break;
      case 'laserPower':
        this.bench.setLaserPower(Boolean(value));
        break;
      case 'slitWidth':
        this.bench.setSlitWidth(Number(value));
        break;
      case 'slitDistance':
        this.bench.setSlitDistance(Number(value));
        break;
      case 'apertureDiameter':
        this.bench.setApertureDiameter(Number(value));
        break;
      case 'gratingDensity':
        this.bench.setGratingDensity(Number(value));
        break;
      case 'screenDistance':
        this.bench.screenDistanceM = Number(value);
        this.bench.syncScreenPositionFromDistance();
        this.bench.updateScreenTexture();
        this.bench.updateBeams();
        break;
      case 'showProfileCurve':
        this.bench.showProfileCurve = Boolean(value);
        this.bench.updateScreenTexture();
        break;
      case 'showBeamsInAir':
        this.bench.showBeamsInAir = Boolean(value);
        this.bench.updateBeams();
        break;
    }

    this.latestTelemetry = this.bench.getTelemetry();
  }

  /**
   * 3D 鼠标拾取悬停目标
   */
  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  /**
   * 3D 指针事件转发
   */
  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit) ?? false;
  }

  private mouseNDC = new THREE.Vector2();
  private internalRaycaster = new THREE.Raycaster();

  public override onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    if (this.interactionManager?.isDragging) {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const height = typeof window !== 'undefined' ? window.innerHeight : 1080;
      this.mouseNDC.set(
        (event.clientX / width) * 2 - 1,
        -(event.clientY / height) * 2 + 1
      );
      this.internalRaycaster.setFromCamera(this.mouseNDC, context.camera);
      this.interactionManager.onPointerMove(event, this.internalRaycaster);
    }
  }

  public override onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event);
  }
}
