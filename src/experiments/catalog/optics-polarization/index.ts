import { labPointerNDC } from '../../../controls/LabPointerInput.ts';
import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalPolarizationApparatusMesh,
  type PolarizationLightSourceMode,
  type OpticalPolarizationTelemetry,
} from '../../../scene/optics/OpticalPolarizationApparatusMesh.ts';
import { OpticalPolarizationInteractionManager } from '../../../scene/optics/OpticalPolarizationInteractionManager.ts';
import type { PolarizationSampleMode } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsPolarizationExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.40;
  public override hideCenterEmitter = true;

  // 核心 3D 偏振与双折射椭偏仪及交互管理器
  private apparatus!: OpticalPolarizationApparatusMesh;
  public interactionManager!: OpticalPolarizationInteractionManager;

  // 遥测缓存
  private latestTelemetry: OpticalPolarizationTelemetry | null = null;

  public init(context: ExperimentContext): void {
    // 水平端正安放于全息实验桌近景交互区 (Y=0.1365 使四角防震底脚稳固平贴桌面，彻底消除桌面穿模与Z-fighting闪烁，Z=1.28)，正面 (+Z) 朝向操作者视线
    this.rootGroup.position.set(0, 0.1365, 1.28);
    this.rootGroup.rotation.set(0, 0, 0);

    // 1. 实例化 3D 偏振光学、圆偏振螺旋波、冰洲石双折射与光弹应力综合实验仪
    this.apparatus = this.track(new OpticalPolarizationApparatusMesh());
    this.rootGroup.add(this.apparatus.group);
    this.addDisposable(() => this.apparatus.dispose());

    // 2. 实例化 3D 鼠标与准星直接操作交互管理器
    this.interactionManager = new OpticalPolarizationInteractionManager(
      this.apparatus,
      this.rootGroup,
      {
        onLightSourceModeChange: (mode) => {
          context.setParameter('lightSourceMode', mode);
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
        onPolarizerAngleChange: (angleDeg, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('polarizerAngle', Number(angleDeg.toFixed(1)));
        },
        onAnalyzerAngleChange: (angleDeg, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('analyzerAngle', Number(angleDeg.toFixed(1)));
        },
        onSampleModeChange: (mode, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('sampleMode', mode);
        },
        onWaveplateFastAxisChange: (angleDeg, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('waveplateFastAxis', Number(angleDeg.toFixed(1)));
        },
        onStressLoadChange: (loadMPa, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('stressLoad', Number(loadMPa.toFixed(0)));
        },
        onBrewsterToggle: (enabled, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('enableBrewsterPlate', enabled);
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

  public getTelemetry(): OpticalPolarizationTelemetry {
    if (!this.latestTelemetry && this.apparatus) {
      this.latestTelemetry = this.apparatus.getTelemetry();
    }
    return this.latestTelemetry!;
  }

  public getApparatus(): OpticalPolarizationApparatusMesh {
    return this.apparatus;
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (!this.apparatus) return;

    switch (id) {
      case 'sampleMode':
        this.apparatus.setSampleMode(value as PolarizationSampleMode);
        break;
      case 'polarizerAngle':
        this.apparatus.setPolarizerAngle(Number(value));
        break;
      case 'analyzerAngle':
        this.apparatus.setAnalyzerAngle(Number(value));
        break;
      case 'waveplateFastAxis':
        this.apparatus.setWaveplateFastAxis(Number(value));
        break;
      case 'stressLoad':
        this.apparatus.setStressLoad(Number(value));
        break;
      case 'enableBrewsterPlate':
        this.apparatus.setBrewsterPlateEnabled(Boolean(value));
        break;
      case 'lightSourceMode':
        this.apparatus.setLightSourceMode(value as PolarizationLightSourceMode);
        break;
      case 'wavelength':
        this.apparatus.setWavelength(Number(value));
        break;
      case 'screenDistance':
        this.apparatus.screenDistanceM = Number(value);
        this.apparatus.syncScreenPositionFromDistance();
        this.apparatus.updateOpticalPaths();
        this.apparatus.updateScreenTexture();
        break;
      case 'laserPower':
        this.apparatus.setLaserPower(Boolean(value));
        break;
      case 'showVectorDecomposition':
        this.apparatus.showVectorDecomposition = Boolean(value);
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
}
