import * as THREE from 'three';
import type { IExperiment, ExperimentContext } from './types.ts';

export class HologramStage {
  public readonly group = new THREE.Group();
  private currentExperiment: IExperiment | null = null;
  private transitionGroup = new THREE.Group();
  private isTransitioning = false;
  private transitionTime = 0;
  private transitionDuration = 0.65; // 全息切换过渡时长（秒）

  // 全息投影光束特效
  private emitterRing: THREE.Mesh;
  private hologramApertureLight: THREE.PointLight;
  private transitionParticles: THREE.Points;

  constructor() {
    this.group.name = 'HologramStage';
    this.group.position.set(0, 0.908, 0); // 直接位于实验台圆形孔径托盘上方
    this.group.add(this.transitionGroup);

    this.initTransitionEffects();
    this.setStageVisible(false);
  }

  private initTransitionEffects(): void {
    // 位于实验台孔径正上方的全息投影光环
    const ringGeo = new THREE.RingGeometry(0.35, 0.48, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f7ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    this.emitterRing = new THREE.Mesh(ringGeo, ringMat);
    this.emitterRing.rotation.x = -Math.PI / 2;
    this.emitterRing.position.y = 0.003;
    this.group.add(this.emitterRing);

    // 动态全息舞台灯光
    this.hologramApertureLight = new THREE.PointLight(0x00e5ff, 0.8, 3.5, 2.0);
    this.hologramApertureLight.position.set(0, 0.35, 0);
    this.group.add(this.hologramApertureLight);

    // 过渡量子粒子特效
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.9;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.8;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.015,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.transitionParticles = new THREE.Points(geo, mat);
    this.group.add(this.transitionParticles);
  }

  private currentSwitchToken = 0;

  public get activeExperiment(): IExperiment | null {
    return this.currentExperiment;
  }

  public get transitioning(): boolean {
    return this.isTransitioning;
  }

  public setViewMode(mode: 'whiteboard' | 'laboratory'): void {
    if (this.currentExperiment && typeof (this.currentExperiment as any).onViewModeChange === 'function') {
      (this.currentExperiment as any).onViewModeChange(mode);
    }
  }

  /**
   * 平滑切换至新实验，包含全息动画过渡与 GPU 着色器异步预编译。
   * 采用基于令牌（Token）的异步时序守卫，安全处理快速连续切换请求。
   */
  public async switchExperiment(
    newExperiment: IExperiment,
    context: ExperimentContext,
    onProgress?: (text: string) => void
  ): Promise<boolean> {
    const token = ++this.currentSwitchToken;
    this.isTransitioning = true;
    this.transitionTime = 0;

    onProgress?.('Initializing experiment...');

    // 1. 预加载新实验资产
    if (newExperiment.preload) {
      await newExperiment.preload(context, (percent) => {
        if (this.currentSwitchToken === token) {
          onProgress?.(`Loading assets: ${Math.round(percent)}%`);
        }
      });
    }
    if (this.currentSwitchToken !== token) {
      newExperiment.dispose(context);
      return false;
    }

    // 2. 初始化新实验几何体与结构
    await newExperiment.init(context);
    if (this.currentSwitchToken !== token) {
      newExperiment.dispose(context);
      return false;
    }

    // 3. 在展示前于 GPU 上预编译着色器（避免首帧卡顿）
    if (this.currentSwitchToken === token) {
      onProgress?.('Compiling GPU shaders...');
    }

    if (context.renderer.compileAsync) {
      try {
        await Promise.race([
          context.renderer.compileAsync(newExperiment.rootGroup, context.camera, context.scene),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      } catch (err) {
        console.warn('[HologramStage] compileAsync fallback:', err);
        try {
          context.renderer.compile(newExperiment.rootGroup, context.camera, context.scene);
        } catch {}
      }
    } else if (context.renderer.compile) {
      try {
        context.renderer.compile(newExperiment.rootGroup, context.camera, context.scene);
      } catch {}
    }
    if (this.currentSwitchToken !== token) {
      newExperiment.dispose(context);
      return false;
    }

    // 4. 执行旧实验的全息退场过渡
    const oldExperiment = this.currentExperiment;
    if (oldExperiment) {
      oldExperiment.unmount(context);
      this.group.remove(oldExperiment.rootGroup);
      oldExperiment.dispose(context);
    }

    // 5. 挂载并淡入新实验
    this.currentExperiment = newExperiment;
    newExperiment.mount(context);
    newExperiment.rootGroup.scale.set(0.01, 0.01, 0.01);
    this.group.add(newExperiment.rootGroup);

    const hideEmitter = Boolean((newExperiment as any)?.hideCenterEmitter);
    this.emitterRing.visible = !hideEmitter;
    this.hologramApertureLight.visible = !hideEmitter;
    this.transitionParticles.visible = !hideEmitter;

    this.setStageVisible(true);

    // 6. 完成过渡
    if (this.currentSwitchToken === token) {
      onProgress?.('Complete');
      this.isTransitioning = false;
    }
    return true;
  }

  public setStageVisible(visible: boolean): void {
    this.group.visible = visible;
    if (visible && this.currentExperiment) {
      const targetScale = (this.currentExperiment as any).targetScale ?? 1.0;
      if (this.currentExperiment.rootGroup.scale.x < 0.1 * targetScale) {
        // 若此前被抑制，立即触发放大展示
        const initScale = 0.2 * targetScale;
        this.currentExperiment.rootGroup.scale.set(initScale, initScale, initScale);
      }
    }
  }

  public clearExperiment(context: ExperimentContext): void {
    const oldExperiment = this.currentExperiment;
    if (oldExperiment) {
      oldExperiment.unmount(context);
      this.group.remove(oldExperiment.rootGroup);
      oldExperiment.dispose(context);
      this.currentExperiment = null;
    }
    this.emitterRing.visible = false;
    this.hologramApertureLight.visible = false;
    this.transitionParticles.visible = false;
    this.setStageVisible(false);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    if (!this.group.visible) return;

    // 驱动全息发射器动画
    if (this.emitterRing.visible) {
      this.emitterRing.rotation.z += delta * 0.5;
    }
    if (this.hologramApertureLight.visible) {
      this.hologramApertureLight.intensity = 0.8 + Math.sin(elapsed * 4.0) * 0.12;
    }

    // 过渡缩放动画
    if (this.currentExperiment) {
      const targetScale = (this.currentExperiment as any).targetScale ?? 1.0;
      const currentScale = this.currentExperiment.rootGroup.scale.x;
      if (currentScale < targetScale) {
        const nextScale = Math.min(targetScale, currentScale + delta * 3.5 * Math.max(1.0, targetScale));
        this.currentExperiment.rootGroup.scale.set(nextScale, nextScale, nextScale);
        if (nextScale >= targetScale && context.renderer?.shadowMap?.enabled) {
          context.renderer.shadowMap.needsUpdate = true;
        }
      }
    }

    // 更新当前活动实验
    if (this.currentExperiment) {
      this.currentExperiment.update(delta, elapsed, context);
    }
  }
}
