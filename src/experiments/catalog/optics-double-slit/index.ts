import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalDoubleSlitBenchMesh,
  type LightSourceMode,
  type OpticalDoubleSlitTelemetry,
} from '../../../scene/optics/OpticalDoubleSlitBenchMesh.ts';
import { OpticalDoubleSlitInteractionManager } from '../../../scene/optics/OpticalDoubleSlitInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsDoubleSlitExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.40;
  public override hideCenterEmitter = true;

  // 核心 3D 设备与交互管理器
  private bench!: OpticalDoubleSlitBenchMesh;
  public interactionManager!: OpticalDoubleSlitInteractionManager;

  // 遥测缓存
  private latestTelemetry: OpticalDoubleSlitTelemetry | null = null;

  public init(context: ExperimentContext): void {
    // 将光学导轨水平正对操作者横放于实验桌面中央 (Y=0.1365 使底脚稳固平贴桌面，Z=1.28)，平正无偏角，正对操作者视界 (+Z)
    this.rootGroup.position.set(0, 0.1365, 1.28);
    this.rootGroup.rotation.set(0, 0, 0);

    // 1. 实例化 3D 光学导轨与杨氏双缝干涉仪器
    this.bench = this.track(new OpticalDoubleSlitBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. 实例化 3D 鼠标与准星指针交互管理器
    this.interactionManager = new OpticalDoubleSlitInteractionManager(
      this.bench,
      this.rootGroup,
      {
        onLightSourceModeChange: (mode) => {
          context.setParameter('lightSourceMode', mode);
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
        onSlitDistanceChange: (dMm) => {
          context.setParameter('slitDistance', Number(dMm.toFixed(2)));
          this.latestTelemetry = this.bench.getTelemetry();
        },
        onSlitWidthChange: (aMm) => {
          context.setParameter('slitWidth', Number(aMm.toFixed(2)));
          this.latestTelemetry = this.bench.getTelemetry();
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

  public getTelemetry(): OpticalDoubleSlitTelemetry {
    if (!this.latestTelemetry && this.bench) {
      this.latestTelemetry = this.bench.getTelemetry();
    }
    return this.latestTelemetry!;
  }

  public getBench(): OpticalDoubleSlitBenchMesh {
    return this.bench;
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (!this.bench) return;

    switch (id) {
      case 'lightSourceMode':
        this.bench.setLightSourceMode(value as LightSourceMode);
        break;
      case 'wavelength':
        this.bench.setWavelength(Number(value));
        break;
      case 'laserPower':
        this.bench.setLaserPower(Boolean(value));
        break;
      case 'slitDistance':
        this.bench.setSlitDistance(Number(value));
        break;
      case 'slitWidth':
        this.bench.setSlitWidth(Number(value));
        break;
      case 'screenDistance':
        this.bench.screenDistanceM = Number(value);
        this.bench.syncScreenPositionFromDistance();
        this.bench.updateScreenTexture();
        this.bench.updateBeams();
        break;
      case 'showEnvelopeModulation':
        this.bench.showEnvelopeModulation = Boolean(value);
        this.bench.updateScreenTexture();
        break;
      case 'showOrderRays':
        this.bench.showOrderRays = Boolean(value);
        this.bench.updateBeams();
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
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean {
    return this.interactionManager?.onPointerDown(event, hit) ?? false;
  }

  private internalRaycaster = new THREE.Raycaster();

  /**
   * 换算屏幕归一化坐标 (支持指针锁定准星 (0, 0) 与自由鼠标模式)
   */
  public getNormalizedMouse(event: PointerEvent): THREE.Vector2 {
    const isLocked = typeof document !== 'undefined' && document.pointerLockElement !== null;
    if (isLocked) {
      return new THREE.Vector2(0, 0);
    }
    const width = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return new THREE.Vector2(
      (event.clientX / width) * 2 - 1,
      -(event.clientY / height) * 2 + 1
    );
  }

  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (this.interactionManager?.isDragging) {
      const mouse = this.getNormalizedMouse(event);
      this.internalRaycaster.setFromCamera(mouse, context.camera);
      this.interactionManager.onPointerMove(event, this.internalRaycaster);
    }
  }

  public override onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event);
  }
}
