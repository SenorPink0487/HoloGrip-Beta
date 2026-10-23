import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalDispersionApparatusMesh,
  type DispersionSourceMode,
  type OpticalDispersionTelemetry,
} from '../../../scene/optics/OpticalDispersionApparatusMesh.ts';
import { OpticalDispersionInteractionManager } from '../../../scene/optics/OpticalDispersionInteractionManager.ts';
import type { PrismMaterialType } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsDispersionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.40;
  public override hideCenterEmitter = true;

  // 核心 3D 分光计与三棱镜色散设备及交互管理器
  private apparatus!: OpticalDispersionApparatusMesh;
  public interactionManager!: OpticalDispersionInteractionManager;

  // 遥测缓存
  private latestTelemetry: OpticalDispersionTelemetry | null = null;

  public init(context: ExperimentContext): void {
    // 水平端正安放于全息实验桌近景交互区 (Y=0.0825 使减震脚垫稳固平贴桌面，Z=1.28)，正面 (+Z) 朝向操作者视线
    this.rootGroup.position.set(0, 0.0825, 1.28);
    this.rootGroup.rotation.set(0, 0, 0);

    // 1. 实例化 3D 精密测角分光计与三棱镜色散实验仪器
    this.apparatus = this.track(new OpticalDispersionApparatusMesh());
    this.rootGroup.add(this.apparatus.group);
    this.addDisposable(() => this.apparatus.dispose());

    // 2. 实例化 3D 鼠标与准星交互管理器
    this.interactionManager = new OpticalDispersionInteractionManager(
      this.apparatus,
      this.rootGroup,
      {
        onSourceModeChange: (mode) => {
          context.setParameter('sourceMode', mode);
          this.latestTelemetry = this.apparatus.getTelemetry();
        },
        onWavelengthChange: (wl) => {
          context.setParameter('wavelength', wl);
          this.latestTelemetry = this.apparatus.getTelemetry();
        },
        onLaserPowerToggle: (on) => {
          context.setParameter('laserPower', on);
          this.latestTelemetry = this.apparatus.getTelemetry();
        },
        onPrismMaterialChange: (material) => {
          context.setParameter('prismMaterial', material);
          this.latestTelemetry = this.apparatus.getTelemetry();
        },
        onIncidentAngleChange: (angleDeg, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('incidentAngle', Number(angleDeg.toFixed(1)));
        },
        onRecombinationToggle: (enabled) => {
          context.setParameter('enableRecombinationPrism', enabled);
          this.latestTelemetry = this.apparatus.getTelemetry();
        },
        onScreenDistanceChange: (distM, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('screenDistance', Number(distM.toFixed(2)));
        },
      }
    );

    this.latestTelemetry = this.apparatus.getTelemetry();
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.apparatus) {
      this.apparatus.update(delta);
    }
  }

  public getTelemetry(): OpticalDispersionTelemetry {
    if (!this.latestTelemetry && this.apparatus) {
      this.latestTelemetry = this.apparatus.getTelemetry();
    }
    return this.latestTelemetry!;
  }

  public getApparatus(): OpticalDispersionApparatusMesh {
    return this.apparatus;
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (!this.apparatus) return;

    switch (id) {
      case 'sourceMode':
        this.apparatus.setSourceMode(value as DispersionSourceMode);
        break;
      case 'prismMaterial':
        this.apparatus.setPrismMaterial(value as PrismMaterialType);
        break;
      case 'incidentAngle':
        this.apparatus.setIncidentAngle(Number(value));
        break;
      case 'apexAngle':
        this.apparatus.setApexAngle(Number(value));
        break;
      case 'enableRecombinationPrism':
        this.apparatus.setRecombinationPrismEnabled(Boolean(value));
        break;
      case 'screenDistance':
        this.apparatus.screenDistanceM = Number(value);
        this.apparatus.syncScreenPositionFromDistance();
        this.apparatus.updateOpticalPaths();
        this.apparatus.updateScreenTexture();
        break;
      case 'wavelength':
        this.apparatus.setWavelength(Number(value));
        break;
      case 'laserPower':
        this.apparatus.setLaserPower(Boolean(value));
        break;
      case 'showOpticalAuxiliaries':
        this.apparatus.showOpticalAuxiliaries = Boolean(value);
        this.apparatus.updateOpticalPaths();
        break;
      case 'showBeamsInAir':
        this.apparatus.showBeamsInAir = Boolean(value);
        this.apparatus.updateOpticalPaths();
        break;
    }

    this.latestTelemetry = this.apparatus.getTelemetry();
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
  public getNormalizedMouse(event: PointerEvent, context?: ExperimentContext): THREE.Vector2 {
    return labPointerNDC(event, context?.renderer?.domElement);
  }

  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (this.interactionManager?.isDragging) {
      const mouse = this.getNormalizedMouse(event, context);
      this.internalRaycaster.setFromCamera(mouse, context.camera);
      this.interactionManager.onPointerMove(event, this.internalRaycaster);
    }
  }

  public override onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event);
  }

  public override onPointerCancel(event: PointerEvent): void {
    this.interactionManager?.onPointerCancel(event);
  }
}
