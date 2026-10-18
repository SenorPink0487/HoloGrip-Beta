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

  // 3D 核心场景组件
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

  // 速度导轨双游标拖拽交互状态
  private draggingSlider: 'vmin' | 'vmax' | null = null;
  private dragStartClientX = 0;
  private dragStartVelocity = 0;

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

    // 3. 实例化 3D 航天发射控制台与粒子轨迹渲染系统
    this.bench = new NewtonCannonBenchMesh(
      this.earth.EARTH_RADIUS_SCENE,
      this.solver.earthRadius
    );
    // 将粒子与轨迹中心精确对准桌子中心的地球球心 (0, 0.68, 0)
    this.bench.setOrbitalCenter(this.earth.group.position);
    this.bench.group.position.set(0, 0, 0);
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 4. 绑定全局键盘操作监听 (Enter 发射, C 清空, R 重置, [ / ] 增减粒子, 1-4 预设；空格键专用于视角上升，绝不拦截)
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

    // 5. 初始化 3D 液晶遥测监视大屏
    this.syncLcd();

    // 6. 初始待命状态：粒子静止置于地球正上方待命，等用户按下发射按钮才开始运动
    this.earth.setStandbyVisible(true);
  }

  /**
   * 同步 3D 液晶屏幕遥测数据
   */
  private syncLcd(): void {
    const telemetry = this.solver.getTelemetry();
    this.bench.updateLcdScreen(
      {
        particleCount: this.particleCount,
        minVelocityKmS: this.minVelocityKmS,
        maxVelocityKmS: this.maxVelocityKmS,
      },
      telemetry
    );
  }

  /**
   * 触发发射粒子群
   */
  public triggerLaunch(): void {
    // 1. 控制台物理大按钮机械下陷与回弹动画
    this.bench.triggerLaunchButtonPress();

    // 2. 隐藏静态待命小球，运动粒子群正式发射
    this.earth.setStandbyVisible(false);

    // 3. 高能等离子发射闪光与冲击环
    this.earth.triggerMuzzleFlash();

    // 4. 动力学求解器发射粒子群 (粒子开始运动)
    this.solver.launch({
      particleCount: this.particleCount,
      minVelocityKmS: this.minVelocityKmS,
      maxVelocityKmS: this.maxVelocityKmS,
    });

    // 5. 同步 3D 粒子和轨迹
    this.bench.syncParticlesAndTrails(this.solver.particles);
    this.syncLcd();
  }

  /**
   * 清空所有轨迹与已发射粒子，粒子重新回到地球正上方待命
   */
  public clearTrails(): void {
    this.solver.clear();
    this.bench.clearVisuals();
    // 粒子重新在地球正上方静止待命
    this.earth.setStandbyVisible(true);
    this.syncLcd();
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
    this.particleCount = Math.max(1, Math.min(32, this.particleCount + delta));
    this.syncLcd();
  }

  /**
   * 微调最小初速度
   */
  public adjustMinVelocity(delta: number): void {
    this.minVelocityKmS = Math.max(
      1.0,
      Math.min(this.maxVelocityKmS - 0.2, Number((this.minVelocityKmS + delta).toFixed(1)))
    );
    this.syncLcd();
  }

  /**
   * 微调最大初速度
   */
  public adjustMaxVelocity(delta: number): void {
    this.maxVelocityKmS = Math.max(
      this.minVelocityKmS + 0.2,
      Math.min(15.0, Number((this.maxVelocityKmS + delta).toFixed(1)))
    );
    this.syncLcd();
  }

  /**
   * 快速应用 4 种经典物理场景预设
   */
  public applyPreset(type: 'suborbital' | 'orbital' | 'escape' | 'spectrum'): void {
    switch (type) {
      case 'suborbital':
        // 全部落回地面 (次轨道落体)
        this.particleCount = 6;
        this.minVelocityKmS = 3.0;
        this.maxVelocityKmS = 6.8;
        break;
      case 'orbital':
        // 第一宇宙速度入轨环绕成为人造卫星
        this.particleCount = 8;
        this.minVelocityKmS = 7.6;
        this.maxVelocityKmS = 8.8;
        break;
      case 'escape':
        // 跨越第二宇宙速度逃逸深空
        this.particleCount = 6;
        this.minVelocityKmS = 10.6;
        this.maxVelocityKmS = 12.5;
        break;
      case 'spectrum':
        // 全景完整速度光谱演化
        this.particleCount = 10;
        this.minVelocityKmS = 3.5;
        this.maxVelocityKmS = 11.5;
        break;
    }
    this.syncLcd();
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

    const hits = raycaster.intersectObjects(
      [this.bench.group, this.earth.group],
      true
    );

    if (hits.length === 0) {
      if (this.lastHoveredTarget) {
        this.bench.setLaunchButtonHovered(false);
        this.lastHoveredTarget = null;
      }
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.bench.group && cur !== this.earth.group) {
        // 1. 🚀 红色水晶大号发射按钮
        if (cur.name === 'cannon-btn-launch' || cur.userData?.isLaunchButton) {
          this.bench.setLaunchButtonHovered(true);
          this.lastHoveredTarget = 'cannon-btn-launch';
          return {
            id: 'cannon-btn-launch',
            label: `🚀 发射牛顿大炮 · 发射 ${this.particleCount} 颗粒子 [${this.minVelocityKmS.toFixed(1)}~${this.maxVelocityKmS.toFixed(1)} km/s] (点击发射 · 快捷键: 回车 Enter)`,
            cursor: 'pointer',
          };
        }

        // 2. 粒子数量调节：步进手轮与 [-] / [+] 实体按键
        if (cur.name === 'cannon-dial-count' || cur.userData?.isDial) {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-dial-count';
          return {
            id: 'cannon-dial-count',
            label: `[粒子个数步进手轮 N] 当前设定: ${this.particleCount} 颗 (点击步进 +2 · 范围 1~32 颗)`,
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-btn-count-minus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-count-minus';
          return {
            id: 'cannon-btn-count-minus',
            label: `[-] 减少发射粒子数量 (当前: ${this.particleCount} 颗 · 快捷键: [)`,
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-btn-count-plus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-count-plus';
          return {
            id: 'cannon-btn-count-plus',
            label: `[+] 增加发射粒子数量 (当前: ${this.particleCount} 颗 · 快捷键: ])`,
            cursor: 'pointer',
          };
        }

        // 3. 初速度调节：双游标微米导轨滑块与微调按键
        if (cur.name === 'cannon-slider-vmin' || cur.userData?.sliderType === 'vmin') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-slider-vmin';
          return {
            id: 'cannon-slider-vmin',
            label: `[Vmin 初速下限游标滑块] 当前: ${this.minVelocityKmS.toFixed(1)} km/s (可左右拖拽或点击微调)`,
            cursor: 'ew-resize',
          };
        }
        if (cur.name === 'cannon-slider-vmax' || cur.userData?.sliderType === 'vmax') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-slider-vmax';
          return {
            id: 'cannon-slider-vmax',
            label: `[Vmax 初速上限游标滑块] 当前: ${this.maxVelocityKmS.toFixed(1)} km/s (可左右拖拽或点击微调)`,
            cursor: 'ew-resize',
          };
        }
        if (cur.name === 'cannon-btn-vmin-minus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-vmin-minus';
          return {
            id: 'cannon-btn-vmin-minus',
            label: `[Vmin -] 降低最小初速 (当前下限: ${this.minVelocityKmS.toFixed(1)} km/s)`,
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-btn-vmin-plus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-vmin-plus';
          return {
            id: 'cannon-btn-vmin-plus',
            label: `[Vmin +] 提高最小初速 (当前下限: ${this.minVelocityKmS.toFixed(1)} km/s)`,
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-btn-vmax-minus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-vmax-minus';
          return {
            id: 'cannon-btn-vmax-minus',
            label: `[Vmax -] 降低最大初速 (当前上限: ${this.maxVelocityKmS.toFixed(1)} km/s)`,
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-btn-vmax-plus') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-vmax-plus';
          return {
            id: 'cannon-btn-vmax-plus',
            label: `[Vmax +] 提高最大初速 (当前上限: ${this.maxVelocityKmS.toFixed(1)} km/s)`,
            cursor: 'pointer',
          };
        }

        // 4. 清空历史轨迹
        if (cur.name === 'cannon-btn-clear') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-btn-clear';
          return {
            id: 'cannon-btn-clear',
            label: '清空所有飞行轨迹与记录 (快捷键: C)',
            cursor: 'pointer',
          };
        }

        // 5. 预设场景按键
        if (cur.name === 'cannon-preset-suborbital') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = cur.name;
          return {
            id: cur.name,
            label: '预设一: 全部落回地面 (初速 3.0~6.8 km/s · 观察地表撞击点弧度)',
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-preset-orbital') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = cur.name;
          return {
            id: cur.name,
            label: '预设二: 第一宇宙速度入轨 (初速 7.6~8.8 km/s · 永不坠地成为人造地球卫星)',
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-preset-escape') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = cur.name;
          return {
            id: cur.name,
            label: '预设三: 逃逸深空 (初速 10.6~12.5 km/s · 达到第二宇宙速度脱离地球)',
            cursor: 'pointer',
          };
        }
        if (cur.name === 'cannon-preset-spectrum') {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = cur.name;
          return {
            id: cur.name,
            label: '预设四: 全景对比谱 (初速 3.5~11.5 km/s · 同屏对比落体、卫星与逃逸)',
            cursor: 'pointer',
          };
        }

        // 6. 地球上方待命粒子
        if (
          cur.name === 'cannon-standby-particle' ||
          cur === this.earth.standbyParticleMesh ||
          cur === this.earth.standbyParticleGroup
        ) {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'cannon-standby-particle';
          return {
            id: 'cannon-standby-particle',
            label: `待命粒子 (静止等待发射) · 初速区间: [${this.minVelocityKmS.toFixed(1)}~${this.maxVelocityKmS.toFixed(1)} km/s] · 点击发射 (快捷键: 回车 Enter)`,
            cursor: 'pointer',
          };
        }

        // 7. 地球本体
        if (cur === this.earth.earthSphere) {
          this.bench.setLaunchButtonHovered(false);
          this.lastHoveredTarget = 'earth-sphere';
          return {
            id: 'earth-sphere',
            label: '逼真地球天体模型 · 倾角 23.4° · 质量 M=5.972×10²⁴kg · 半径 R=6371km',
          };
        }

        cur = cur.parent;
      }
    }

    if (this.lastHoveredTarget) {
      this.bench.setLaunchButtonHovered(false);
      this.lastHoveredTarget = null;
    }
    return null;
  }

  /**
   * 指针按下事件处理
   */
  public override onPointerDown(
    _event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean | void {
    if (this.isDisposed || !hit) return;

    let cur: THREE.Object3D | null = hit.object;
    while (cur && cur !== this.bench.group && cur !== this.earth.group) {
      // 1. 发射按钮或待命粒子
      if (
        cur.name === 'cannon-btn-launch' ||
        cur.userData?.isLaunchButton ||
        cur.name === 'cannon-standby-particle' ||
        cur === this.earth.standbyParticleMesh
      ) {
        this.triggerLaunch();
        return true;
      }

      // 2. 粒子数量调节：手轮与步进按键
      if (cur.name === 'cannon-dial-count' || cur.userData?.isDial) {
        const next = this.particleCount >= 32 ? 1 : Math.min(32, this.particleCount + 2);
        this.particleCount = next;
        this.syncLcd();
        return true;
      }
      if (cur.name === 'cannon-btn-count-minus') {
        this.adjustParticleCount(-1);
        return true;
      }
      if (cur.name === 'cannon-btn-count-plus') {
        this.adjustParticleCount(1);
        return true;
      }

      // 3. 初速度范围调节：双游标微米导轨滑块拖拽与按键微调
      if (cur.name === 'cannon-slider-vmin' || cur.userData?.sliderType === 'vmin') {
        this.draggingSlider = 'vmin';
        this.dragStartClientX = _event.clientX;
        this.dragStartVelocity = this.minVelocityKmS;
        return true;
      }
      if (cur.name === 'cannon-slider-vmax' || cur.userData?.sliderType === 'vmax') {
        this.draggingSlider = 'vmax';
        this.dragStartClientX = _event.clientX;
        this.dragStartVelocity = this.maxVelocityKmS;
        return true;
      }
      if (cur.name === 'cannon-btn-vmin-minus') {
        this.adjustMinVelocity(-0.5);
        return true;
      }
      if (cur.name === 'cannon-btn-vmin-plus') {
        this.adjustMinVelocity(0.5);
        return true;
      }
      if (cur.name === 'cannon-btn-vmax-minus') {
        this.adjustMaxVelocity(-0.5);
        return true;
      }
      if (cur.name === 'cannon-btn-vmax-plus') {
        this.adjustMaxVelocity(0.5);
        return true;
      }

      // 4. 清空按键
      if (cur.name === 'cannon-btn-clear') {
        this.clearTrails();
        return true;
      }

      // 5. 预设按键
      if (cur.name === 'cannon-preset-suborbital') {
        this.applyPreset('suborbital');
        return true;
      }
      if (cur.name === 'cannon-preset-orbital') {
        this.applyPreset('orbital');
        return true;
      }
      if (cur.name === 'cannon-preset-escape') {
        this.applyPreset('escape');
        return true;
      }
      if (cur.name === 'cannon-preset-spectrum') {
        this.applyPreset('spectrum');
        return true;
      }

      cur = cur.parent;
    }
  }

  /**
   * 指针滑动事件：驱动双游标微米导轨滑块无级调节初速度范围
   */
  public override onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): void {
    if (this.isDisposed || !this.draggingSlider) return;

    const deltaPixels = event.clientX - this.dragStartClientX;
    const deltaV = deltaPixels * 0.05; // 20px 对应 1.0 km/s

    if (this.draggingSlider === 'vmin') {
      const newV = Math.max(
        1.0,
        Math.min(this.maxVelocityKmS - 0.2, Number((this.dragStartVelocity + deltaV).toFixed(1)))
      );
      if (newV !== this.minVelocityKmS) {
        this.minVelocityKmS = newV;
        this.syncLcd();
      }
    } else if (this.draggingSlider === 'vmax') {
      const newV = Math.max(
        this.minVelocityKmS + 0.2,
        Math.min(16.0, Number((this.dragStartVelocity + deltaV).toFixed(1)))
      );
      if (newV !== this.maxVelocityKmS) {
        this.maxVelocityKmS = newV;
        this.syncLcd();
      }
    }
  }

  /**
   * 指针抬起事件：释放滑块拖拽
   */
  public override onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.draggingSlider = null;
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
      this.particleCount = Math.max(1, Math.min(32, Math.floor(Number(value))));
      this.syncLcd();
    } else if (id === 'minVelocity') {
      this.minVelocityKmS = Math.max(1.0, Number(value));
      this.syncLcd();
    } else if (id === 'maxVelocity') {
      this.maxVelocityKmS = Math.max(this.minVelocityKmS + 0.1, Number(value));
      this.syncLcd();
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

    // 4. 控制台机械下压与光晕动画
    this.bench.update(delta);

    // 5. 遥测屏幕周期性低开销同步
    this.syncLcd();
  }

  /**
   * 安全销毁实验
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }
}
