import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { RealisticEarthMesh } from '../../../scene/mech/RealisticEarthMesh.ts';
import { NewtonCannonBenchMesh } from '../../../scene/mech/NewtonCannonBenchMesh.ts';
import {
  NewtonCannonDynamicsSolver,
  EARTH_RADIUS_M,
  type NewtonCannonTelemetry,
} from '../../../physics/mech/newtonCannonDynamics.ts';
import { metadata } from './meta.ts';

export default class MechNewtonCannonExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.45;
  public override hideCenterEmitter = true;

  // 3D 核心场景组件 (桌面纯净无多余遮挡)
  public earth!: RealisticEarthMesh;
  public bench!: NewtonCannonBenchMesh;
  public solver!: NewtonCannonDynamicsSolver;

  // 交互配置状态
  public particleCount = 8;
  public minVelocityKmS = 3.5;
  public maxVelocityKmS = 11.2;
  public timeScale = 120.0;

  private isDisposed = false;
  private lastHoveredTarget: string | null = null;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  public init(context: ExperimentContext): void {
    // 将实验根节点平稳放置于全息实验台桌子正中心 (X=0, Y=0.08, Z=0)
    this.rootGroup.position.set(0, 0.08, 0);

    // 1. 实例化逼真 3D 地球模型，端正置于实验桌几何正中心
    this.earth = new RealisticEarthMesh();
    // 地球半径 0.52m，球心置于桌子中心正上方 (0, 0.68, 0)
    this.earth.group.position.set(0, 0.68, 0);
    this.rootGroup.add(this.earth.group);
    this.addDisposable(() => this.earth.dispose());

    // 2. 实例化天体力学与开普勒轨道求解器 (开启穿模地心轨道透视演化)
    this.solver = new NewtonCannonDynamicsSolver({
      earthRadius: EARTH_RADIUS_M,
      timeScale: this.timeScale,
      allowPenetration: true,
    });

    // 3. 实例化粒子与轨道轨迹渲染系统 (桌面上无实体控制台，完全通过 Apple 悬浮窗口操控)
    this.bench = new NewtonCannonBenchMesh(
      this.earth.EARTH_RADIUS_SCENE,
      this.solver.earthRadius
    );
    // 将粒子与轨迹中心精确对准桌子中心的地球球心 (0, 0.68, 0)
    this.bench.setOrbitalCenter(this.earth.group.position);
    this.bench.group.position.set(0, 0, 0);
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 4. 绑定全局键盘操作监听 (Enter 发射, C 清空, R 重置, [ / ] 增减粒子；空格键专用于视角上升，绝不拦截)
    if (typeof window !== 'undefined') {
      this.keydownListener = (e: KeyboardEvent) => {
        if (this.isDisposed) return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

        if (e.code === 'Enter') {
          e.preventDefault();
          this.triggerLaunch();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          this.clearTrails();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          this.resetExperiment();
        } else if (e.code === 'BracketLeft') {
          e.preventDefault();
          this.adjustParticleCount(-1);
        } else if (e.code === 'BracketRight') {
          e.preventDefault();
          this.adjustParticleCount(1);
        } else if (e.code === 'Digit1') {
          e.preventDefault();
          this.applyPreset('suborbital');
        } else if (e.code === 'Digit2') {
          e.preventDefault();
          this.applyPreset('orbital');
        } else if (e.code === 'Digit3') {
          e.preventDefault();
          this.applyPreset('escape');
        } else if (e.code === 'Digit4') {
          e.preventDefault();
          this.applyPreset('spectrum');
        }
      };
      window.addEventListener('keydown', this.keydownListener);
      this.addDisposable(() => {
        if (this.keydownListener) {
          window.removeEventListener('keydown', this.keydownListener);
          this.keydownListener = null;
        }
      });
    }

    // 5. 初始待命状态：粒子静止置于地球正上方待命，等用户发射才开始运动
    this.earth.setStandbyVisible(true);
  }

  /**
   * 触发发射粒子群
   */
  public triggerLaunch(): void {
    // 0. 发射前清空旧轨迹，保证新发射的粒子清晰可见
    this.solver.clear();
    this.bench.clearVisuals();

    // 1. 隐藏静态待命小球，运动粒子群正式发射
    this.earth.setStandbyVisible(false);

    // 2. 高能等离子发射闪光与冲击环
    this.earth.triggerMuzzleFlash();

    // 3. 动力学求解器发射粒子群 (粒子开始运动)
    this.solver.launch({
      particleCount: this.particleCount,
      minVelocityKmS: this.minVelocityKmS,
      maxVelocityKmS: this.maxVelocityKmS,
    });

    // 4. 同步 3D 粒子和轨迹
    this.bench.syncParticlesAndTrails(this.solver.particles);
  }

  /**
   * 清空所有轨迹与已发射粒子，粒子重新回到地球正上方待命
   */
  public clearTrails(): void {
    this.solver.clear();
    this.bench.clearVisuals();
    // 粒子重新在地球正上方静止待命
    this.earth.setStandbyVisible(true);
  }

  /**
   * 重置实验到默认参数
   */
  public resetExperiment(): void {
    this.particleCount = 8;
    this.minVelocityKmS = 3.5;
    this.maxVelocityKmS = 11.2;
    this.clearTrails();
  }

  /**
   * 微调粒子数量
   */
  public adjustParticleCount(delta: number): void {
    this.particleCount = Math.max(1, Math.min(15, this.particleCount + delta));
  }

  /**
   * 设置粒子数量
   */
  public setParticleCount(count: number): void {
    this.particleCount = Math.max(1, Math.min(15, Math.round(count)));
  }

  /**
   * 设置最小初速度
   */
  public setMinVelocity(v: number): void {
    this.minVelocityKmS = Math.max(
      1.0,
      Math.min(this.maxVelocityKmS - 0.2, Number(v.toFixed(1)))
    );
  }

  /**
   * 设置最大初速度
   */
  public setMaxVelocity(v: number): void {
    this.maxVelocityKmS = Math.max(
      this.minVelocityKmS + 0.2,
      Math.min(16.0, Number(v.toFixed(1)))
    );
  }

  /**
   * 微调最小初速度
   */
  public adjustMinVelocity(delta: number): void {
    this.setMinVelocity(this.minVelocityKmS + delta);
  }

  /**
   * 微调最大初速度
   */
  public adjustMaxVelocity(delta: number): void {
    this.setMaxVelocity(this.maxVelocityKmS + delta);
  }

  /**
   * 获取当前遥测数据
   */
  public getTelemetryData(): NewtonCannonTelemetry {
    return this.solver.getTelemetry();
  }

  /**
   * 获取发射参数配置
   */
  public getLaunchConfig(): { particleCount: number; minVelocityKmS: number; maxVelocityKmS: number } {
    return {
      particleCount: this.particleCount,
      minVelocityKmS: this.minVelocityKmS,
      maxVelocityKmS: this.maxVelocityKmS,
    };
  }

  /**
   * 快速应用 4 种经典物理场景预设
   */
  public applyPreset(type: 'suborbital' | 'orbital' | 'escape' | 'spectrum'): void {
    switch (type) {
      case 'suborbital':
        this.particleCount = 6;
        this.minVelocityKmS = 3.0;
        this.maxVelocityKmS = 6.8;
        break;
      case 'orbital':
        this.particleCount = 8;
        this.minVelocityKmS = 7.6;
        this.maxVelocityKmS = 8.8;
        break;
      case 'escape':
        this.particleCount = 6;
        this.minVelocityKmS = 10.6;
        this.maxVelocityKmS = 12.5;
        break;
      case 'spectrum':
        this.particleCount = 10;
        this.minVelocityKmS = 3.5;
        this.maxVelocityKmS = 11.5;
        break;
    }
    this.triggerLaunch();
  }

  /**
   * 射线检测悬停目标 (供 Crosshair 准星与鼠标悬停使用)
   */
  public override getHoverTarget(raycaster: THREE.Raycaster): {
    id: string;
    label: string;
    cursor?: string;
  } | null {
    if (this.isDisposed) return null;

    const targets = [this.earth.standbyParticleGroup, this.earth.standbyParticleMesh, this.earth.earthSphere].filter(Boolean) as THREE.Object3D[];
    const hits = raycaster.intersectObjects(targets.length > 0 ? targets : [this.earth.group], true);

    if (hits.length === 0) {
      this.lastHoveredTarget = null;
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.earth.group) {
        // 1. 地球上方待命粒子
        if (
          cur.name === 'cannon-standby-particle' ||
          cur === this.earth.standbyParticleMesh ||
          cur === this.earth.standbyParticleGroup
        ) {
          this.lastHoveredTarget = 'cannon-standby-particle';
          return {
            id: 'cannon-standby-particle',
            label: `待命粒子 · 初速 [${this.minVelocityKmS.toFixed(1)}~${this.maxVelocityKmS.toFixed(1)} km/s] (点击发射 · 快捷键: 回车 Enter)`,
            cursor: 'pointer',
          };
        }

        // 2. 地球天体本体
        if (cur === this.earth.earthSphere) {
          this.lastHoveredTarget = 'earth-sphere';
          return {
            id: 'earth-sphere',
            label: '逼真地球天体模型 · 倾角 23.4° · 质量 M=5.972×10²⁴kg · 半径 R=6371km',
          };
        }

        cur = cur.parent;
      }
    }

    this.lastHoveredTarget = null;
    return null;
  }

  /**
   * 指针按下事件处理 (支持直接点击地球待命粒子发射)
   */
  public override onPointerDown(
    _event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean | void {
    if (this.isDisposed || !hit) return;

    let cur: THREE.Object3D | null = hit.object;
    while (cur && cur !== this.earth.group) {
      if (
        cur.name === 'cannon-standby-particle' ||
        cur === this.earth.standbyParticleMesh
      ) {
        this.triggerLaunch();
        return true;
      }
      cur = cur.parent;
    }
  }

  /**
   * 响应参数配置更改
   */
  public override onParameterChange(
    id: string,
    value: any,
    _context: ExperimentContext
  ): void {
    if (id === 'particleCount') {
      this.particleCount = Math.max(1, Math.min(15, Math.floor(Number(value))));
    } else if (id === 'minVelocity') {
      this.setMinVelocity(Number(value));
    } else if (id === 'maxVelocity') {
      this.setMaxVelocity(Number(value));
    } else if (id === 'timeScale') {
      this.timeScale = Math.max(10.0, Number(value));
      this.solver.timeScale = this.timeScale;
    }
  }

  /**
   * 高频动画与物理动力学循环更新
   */
  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 1. 地球自转、云层漂移与点火光环动画
    this.earth.update(delta);

    // 2. 万有引力轨道动力学步进
    this.solver.update(delta);

    // 3. 同步粒子球体与开普勒轨道轨迹
    this.bench.syncParticlesAndTrails(this.solver.particles);
  }

  /**
   * 安全销毁实验
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
