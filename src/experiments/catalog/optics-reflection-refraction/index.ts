import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  OpticalDiskApparatusMesh,
  type LiquidMediumType,
  type OpticalTelemetry,
} from '../../../scene/optics/OpticalDiskApparatusMesh.ts';
import { OpticalDiskInteractionManager } from '../../../scene/optics/OpticalDiskInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsReflectionRefractionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.45;
  public override hideCenterEmitter = true;

  // 核心 3D 设备与交互管理器
  private apparatus: OpticalDiskApparatusMesh;
  public interactionManager: OpticalDiskInteractionManager;

  // 缓存遥测数据
  private latestTelemetry: OpticalTelemetry | null = null;

  public init(context: ExperimentContext): void {
    // 橡胶脚垫稳固贴合 HoloTable 桌面 (Y = 0.063)，沿 Z 轴向前移至近景视觉交互区 (Z = 1.35)
    // 正面朝向 +Z 轴（面朝相机与用户），呈现更加高大气派的大尺寸视效
    this.rootGroup.position.set(0, 0.063, 1.35);
    this.rootGroup.rotation.set(0, 0, 0);

    // 1. 实例化 3D 圆形光学分度水容器仪器
    this.apparatus = this.track(new OpticalDiskApparatusMesh());
    this.rootGroup.add(this.apparatus.group);
    this.addDisposable(() => this.apparatus.dispose());

    // 2. 实例化 3D 鼠标与触控指针交互管理器
    this.interactionManager = new OpticalDiskInteractionManager(
      this.apparatus,
      this.rootGroup,
      {
        onAngleChange: (angleDeg, telemetry) => {
          this.latestTelemetry = telemetry;
          context.setParameter('incidentAngle', parseFloat(angleDeg.toFixed(1)));
        },
        onDirectionToggle: (isAirToWater) => {
          context.setParameter('isAirToWater', isAirToWater ? 'airToWater' : 'waterToAir');
        },
      }
    );

    // 初始化初始遥测
    this.latestTelemetry = this.apparatus.updateOpticalPaths();
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    // 动态水体波动与悬浮微气泡微浮动
    this.apparatus.animateWater(elapsed);

    // 持续同步最新光学遥测数据
    this.latestTelemetry = this.apparatus.updateOpticalPaths();
  }

  /**
   * 供 Engine.ts 遥测同步读取
   */
  public getTelemetry(): OpticalTelemetry {
    if (!this.latestTelemetry) {
      this.latestTelemetry = this.apparatus.updateOpticalPaths();
    }
    return this.latestTelemetry;
  }

  /**
   * 获取 apparatus 实例
   */
  public getApparatus(): OpticalDiskApparatusMesh {
    return this.apparatus;
  }

  /**
   * 响应参数面板变更
   */
  public override onParameterChange(id: string, value: any, context: ExperimentContext): void {
    switch (id) {
      case 'incidentAngle':
        this.apparatus.setIncidentAngle(Number(value));
        break;
      case 'isAirToWater':
        this.apparatus.setIncidentDirection(value === 'airToWater' || value === true);
        break;
      case 'mediumType':
        this.apparatus.setLiquidMedium(value as LiquidMediumType);
        break;
      case 'liquidTint': {
        const tintColors: Record<string, number> = {
          cyan: 0x38bdf8,
          sapphire: 0x2563eb,
          lime: 0x84cc16,
          amber: 0xf59e0b,
          rose: 0xf43f5e,
        };
        const hex = tintColors[String(value)] ?? 0x38bdf8;
        this.apparatus.setLiquidColor(hex);
        break;
      }
      case 'refractiveIndex':
        this.apparatus.setLiquidMedium('custom', Number(value));
        break;
      case 'laserWavelength':
        this.apparatus.setLaserWavelength(Number(value));
        break;
      case 'showNormalLine':
        this.apparatus.showNormalLine = Boolean(value);
        this.apparatus.updateOpticalPaths();
        break;
      case 'showAngleArcs':
        this.apparatus.showAngleArcs = Boolean(value);
        this.apparatus.updateOpticalPaths();
        break;
      case 'showTyndallGlow':
        this.apparatus.showTyndallGlow = Boolean(value);
        this.apparatus.updateOpticalPaths();
        break;
    }
    this.latestTelemetry = this.apparatus.updateOpticalPaths();
  }

  /**
   * 手势与交互式连续几何缩放
   */
  public setScale(scale: number): void {
    const s = THREE.MathUtils.clamp(scale, 1.2, 4.0);
    this.rootGroup.scale.setScalar(s);
  }

  public getScale(): number {
    return this.rootGroup.scale.x;
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
  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit) ?? false;
  }

  private mouseNDC = new THREE.Vector2();
  private internalRaycaster = new THREE.Raycaster();

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
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

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event);
  }
}
