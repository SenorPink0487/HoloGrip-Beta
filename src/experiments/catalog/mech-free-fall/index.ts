import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import { NewtonTubeMesh } from '../../../scene/mech/NewtonTubeMesh.ts';
import {
  FreeFallDynamicsSolver,
  type FreeFallTelemetry,
  STANDARD_ATMOSPHERE_KPA,
} from '../../../physics/mech/freeFallDynamics.ts';
import { metadata } from './meta.ts';

export default class MechFreeFallExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.75;
  public override hideCenterEmitter = true;

  private mesh!: NewtonTubeMesh;
  private solver!: FreeFallDynamicsSolver;
  private isDisposed = false;
  private timeScale = 1.0;
  private lastHoveredTarget: string | null = null;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  public init(context: ExperimentContext): void {
    // 将实验设备平稳置于实验台上表面正前方 (Y=0.08, Z=1.35)，大尺寸正面朝向用户
    this.rootGroup.position.set(0, 0.08, 1.35);

    // 实例化 3D 设备总成
    this.mesh = new NewtonTubeMesh();
    this.rootGroup.add(this.mesh.group);
    this.addDisposable(() => this.mesh.dispose());

    // 实例化自由落体与空气阻力动力学解算器
    this.solver = new FreeFallDynamicsSolver({
      gravity: 9.80,
      airPressureKPa: STANDARD_ATMOSPHERE_KPA,
      fallDistanceM: this.mesh.FALL_DISTANCE_M,
    });

    // 监听键盘快捷操作 (空格键 / R 旋转倒转，V 键切换抽气机)
    if (typeof window !== 'undefined') {
      this.keydownListener = (e: KeyboardEvent) => {
        if (this.isDisposed) return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

        if (e.code === 'Space' || e.code === 'KeyR') {
          e.preventDefault();
          this.invertTube();
        } else if (e.code === 'KeyV') {
          e.preventDefault();
          this.togglePump();
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

    // 同步初始状态
    this.syncVisuals();

    // 浏览器交互环境下，首次进入 600ms 后自动执行一次倒转演示，使自由落体实验直观呈现
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      const demoTimer = window.setTimeout(() => {
        if (!this.isDisposed && !this.solver.isTubeRotating && !this.solver.isFalling) {
          this.invertTube();
        }
      }, 600);
      this.addDisposable(() => window.clearTimeout(demoTimer));
    }
  }

  /**
   * 射线检测悬停目标（供 Crosshair 准星与 HUD 工具提示使用）
   */
  public override getHoverTarget(raycaster: THREE.Raycaster): {
    id: string;
    label: string;
    cursor?: string;
  } | null {
    if (this.isDisposed) return null;

    const hits = raycaster.intersectObjects(this.mesh.group.children, true);
    if (hits.length === 0) {
      if (this.lastHoveredTarget) {
        this.mesh.setRotateButtonHovered(false);
        this.lastHoveredTarget = null;
      }
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.mesh.group) {
        // 1. 旋转倒转按钮
        if (cur.name === 'freefall-rotate-button' || cur.userData?.isRotateButton) {
          this.mesh.setRotateButtonHovered(true);
          this.lastHoveredTarget = 'freefall-rotate-button';
          const isRotating = this.solver.isTubeRotating;
          return {
            id: 'freefall-rotate-button',
            label: isRotating
              ? '牛顿管正在翻转倒转中...'
              : '3D 旋转倒转按钮 (↻ 180°) · 点击倒转以观察管内物体自由落体 (快捷键: 空格 / R)',
            cursor: 'pointer',
          };
        }

        // 2. 抽气机电源按键或机体
        if (cur.name === 'freefall-pump-switch' || cur.userData?.isPumpSwitch) {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-pump-switch';
          const isRunning = this.solver.isPumpRunning;
          const p = this.solver.airPressureKPa.toFixed(1);
          return {
            id: 'freefall-pump-switch',
            label: isRunning
              ? `真空抽气机 [运行中 · 当前气压: ${p} kPa] · 单击关闭抽气`
              : `真空抽气机 [待机中 · 当前气压: ${p} kPa] · 单击启动抽气机排尽空气 (快捷键: V)`,
            cursor: 'pointer',
          };
        }

        // 3. 抽气与排气阀门
        if (cur.name === 'freefall-valve' || cur.userData?.isValve) {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-valve';
          const isVacuum = this.solver.airPressureKPa < 1.0;
          return {
            id: 'freefall-valve',
            label: isVacuum
              ? '高真空排气阀 · 单击开启充气阀门 (使管内恢复标准大气压)'
              : '抽气密封旋塞阀 · 连接真空导管',
            cursor: 'pointer',
          };
        }

        // 4. 管内对比物体 (羽毛、硬币、软木塞)
        if (cur.name === 'freefall-feather') {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-feather';
          const isVacuum = this.solver.airPressureKPa < 1.0;
          return {
            id: 'freefall-feather',
            label: isVacuum
              ? '纯白轻羽 [真空状态] · 完全摆脱空气阻力，与硬币、软木塞同步自由落体！'
              : '纯白轻羽 [常压空气状态] · 质量极轻(0.15g)、受显著空气阻力，轻盈飘浮迟缓下落',
            cursor: 'default',
          };
        }

        if (cur.name === 'freefall-coin') {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-coin';
          return {
            id: 'freefall-coin',
            label: '硬币 (24K纯金) [6.2g 金属] · 密度高且空气阻力小，迅速冲向管底',
            cursor: 'default',
          };
        }

        if (cur.name === 'freefall-cork') {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-cork';
          return {
            id: 'freefall-cork',
            label: '软木塞 (天然软木) [3.5g 木质] · 密度中等，常压下略落后于硬币',
            cursor: 'default',
          };
        }

        cur = cur.parent;
      }
    }

    // 次选：检测牛顿管玻璃管体
    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.mesh.group) {
        if (cur.name === 'freefall-tube' || cur.userData?.isNewtonTube) {
          this.mesh.setRotateButtonHovered(false);
          this.lastHoveredTarget = 'freefall-tube';
          const p = this.solver.airPressureKPa.toFixed(1);
          const envDesc = this.solver.airPressureKPa < 1.0 ? '高真空环境 (无空气阻力)' : '常压空气环境 (存在空气阻力)';
          return {
            id: 'freefall-tube',
            label: `牛顿真空管 [${envDesc} · ${p} kPa] · 点击亦可直接倒转 180°`,
            cursor: 'pointer',
          };
        }
        cur = cur.parent;
      }
    }

    if (this.lastHoveredTarget) {
      this.mesh.setRotateButtonHovered(false);
      this.lastHoveredTarget = null;
    }
    return null;
  }

  /**
   * 鼠标/触控指针按下交互
   */
  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean | void {
    if (!hit) return false;

    let targetType: 'rotate_button' | 'pump' | 'valve' | 'tube' | 'none' = 'none';
    let obj: THREE.Object3D | null = hit.object;

    while (obj && obj !== this.mesh.group) {
      if (obj.name === 'freefall-rotate-button' || obj.userData?.isRotateButton) {
        targetType = 'rotate_button';
        break;
      }
      if (obj.name === 'freefall-pump-switch' || obj.userData?.isPumpSwitch) {
        targetType = 'pump';
        break;
      }
      if (obj.name === 'freefall-valve' || obj.userData?.isValve) {
        targetType = 'valve';
        break;
      }
      if (obj.name === 'freefall-tube' || obj.userData?.isNewtonTube) {
        targetType = 'tube';
        break;
      }
      obj = obj.parent;
    }

    if (targetType === 'rotate_button' || targetType === 'tube') {
      this.invertTube();
      this.mesh.pulseRotateButton();
      return true;
    }

    if (targetType === 'pump') {
      this.togglePump();
      return true;
    }

    if (targetType === 'valve') {
      this.solver.toggleVenting();
      return true;
    }

    return false;
  }

  /**
   * 触发牛顿管倒转 (180°)
   */
  public invertTube(): void {
    if (this.solver.isTubeRotating) return;
    this.solver.triggerInversion();
    this.mesh.pulseRotateButton();
  }

  /**
   * 切换抽气机开关
   */
  public togglePump(forceState?: boolean): boolean {
    const isRunning = this.solver.togglePump(forceState);
    return isRunning;
  }

  /**
   * 切换排气泄压阀（充入空气恢复常压）
   */
  public ventTube(forceState?: boolean): boolean {
    return this.solver.toggleVenting(forceState);
  }

  /**
   * 物理与动画逐帧主循环
   */
  public override update(delta: number, _elapsed: number, context: ExperimentContext): void {
    if (this.isDisposed) return;

    // 步进动力学解算器
    const simDt = Math.min(0.033, Math.max(0.001, delta)) * this.timeScale;
    this.solver.step(simDt);

    // 同步 3D 渲染图元
    this.syncVisuals();

    // 当抽气机抽取或充气过程中气压动态变动时，实时通知上下文参数
    if (this.solver.isPumpRunning || this.solver.isVenting) {
      context.setParameter?.('airPressure', parseFloat(this.solver.airPressureKPa.toFixed(1)));
    }
  }

  /**
   * 响应参数面板参数变化
   */
  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (id === 'airPressure') {
      this.solver.setPressure(Number(value));
      this.mesh.setPumpState(this.solver.isPumpRunning, this.solver.airPressureKPa);
    } else if (id === 'timeScale') {
      this.timeScale = Math.max(0.1, Math.min(2.0, Number(value)));
    } else if (id === 'gravity') {
      this.solver.gravity = Math.max(0.5, Number(value));
    }
  }

  /**
   * 获取遥测数据
   */
  public getTelemetry(): FreeFallTelemetry {
    return this.solver.getTelemetry();
  }

  /**
   * 销毁清理
   */
  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    if (this.keydownListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }
    super.dispose(context);
  }

  /**
   * 将动力学数据精确投影至 3D 渲染图元
   */
  private syncVisuals(): void {
    // 1. 同步牛顿管旋转
    this.mesh.setTubeRotation(this.solver.tubeRotationAngleRad);

    // 2. 同步管内对比物体的空间位置与飘摆姿态
    const feather = this.solver.getObjectState('feather');
    const coin = this.solver.getObjectState('coin');
    const cork = this.solver.getObjectState('cork');

    this.mesh.setObjectsState(
      feather.yM,
      coin.yM,
      cork.yM,
      feather.flutterX,
      feather.flutterAngleRad,
      this.solver.isTubeRotating,
      this.solver.tubeRotationAngleRad,
      this.solver.tubeStartAngleRad
    );

    // 3. 同步抽气机指示灯与压力表指针
    this.mesh.setPumpState(this.solver.isPumpRunning, this.solver.airPressureKPa);
  }
}
