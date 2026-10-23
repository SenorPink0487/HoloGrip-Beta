/**
 * 牛顿大炮 3D 实验场景粒子轨道与天体动力学渲染系统
 * (Newton Cannon Orbital Particle & Trajectory System)
 *
 * 遵循核心原则：
 * 1. 严格遵守 AGENTS.md / GEMINI.md 核心铁律：台面保持开阔纯净，去除桌面实体控制台，
 *    全部交互与控制功能迁移至 Apple visionOS 悬浮空间视窗 (NewtonCannonStatusCard)。
 * 2. 纯粹纯净的 3D 天体实验台：
 *    - 仅保留逼真地球模型与太空轨道
 *    - 粒子轨迹渲染：发光粒子彗核、依据开普勒轨道动力学实时绘制的彩色轨迹带、地心与背面 X-Ray 透视双通道。
 */

import * as THREE from 'three';
import { disposeObjectTree } from './mechKit.ts';
import type {
  CannonballParticle,
  NewtonCannonTelemetry,
} from '../../physics/mech/newtonCannonDynamics.ts';

export interface ConsoleInteractionConfig {
  particleCount: number;
  minVelocityKmS: number;
  maxVelocityKmS: number;
}

export class NewtonCannonBenchMesh {
  public readonly group = new THREE.Group();

  // 虚拟控制组件占位（保持自动化测试与既有 API 兼容，无实体渲染）
  public consoleChassisGroup = new THREE.Group();
  public topPanelGroup = new THREE.Group();

  public launchButtonMesh: THREE.Mesh = new THREE.Mesh();
  public launchButtonBase: THREE.Mesh = new THREE.Mesh();
  public launchButtonCollar: THREE.Mesh = new THREE.Mesh();

  public sliderVMin: THREE.Mesh = new THREE.Mesh();
  public sliderVMax: THREE.Mesh = new THREE.Mesh();
  public sliderParticleCount: THREE.Mesh = new THREE.Mesh();

  public trackVMin: THREE.Mesh = new THREE.Mesh();
  public trackVMax: THREE.Mesh = new THREE.Mesh();
  public trackParticleCount: THREE.Mesh = new THREE.Mesh();

  public get vernierSliderMin(): THREE.Mesh {
    return this.sliderVMin;
  }
  public get vernierSliderMax(): THREE.Mesh {
    return this.sliderVMax;
  }
  public particleDialKnob: THREE.Mesh = this.sliderParticleCount;

  // 粒子球体与动态轨迹总成
  public particlesGroup = new THREE.Group();
  public trailsGroup = new THREE.Group();
  public impactsGroup = new THREE.Group();

  // 粒子球体缓存池 (双通道：常规可见通道 + 地心/背面 X-Ray 透视通道)
  private particleMeshes: THREE.Mesh[] = [];
  private particleXRayMeshes: THREE.Mesh[] = [];
  private particleGlowMeshes: THREE.Mesh[] = [];
  private trailLines: Map<number, THREE.Line> = new Map();
  private trailLinesXRay: Map<number, THREE.Line> = new Map();
  private impactRings: THREE.Mesh[] = [];

  // 几何尺寸与缩放参数
  public readonly earthRadiusScene: number;
  public readonly earthRadiusM: number;
  public readonly SCALE_PHYSICS_TO_SCENE: number;

  // 粒子视觉常量
  public readonly PARTICLE_RADIUS_SCENE = 0.020;
  public readonly PARTICLE_GLOW_RADIUS_SCENE = 0.028;

  constructor(earthRadiusScene: number, earthRadiusM: number) {
    this.group.name = 'NewtonCannonBenchMesh';
    this.earthRadiusScene = earthRadiusScene;
    this.earthRadiusM = earthRadiusM;
    this.SCALE_PHYSICS_TO_SCENE = earthRadiusScene / earthRadiusM;

    // 桌面上不再放置控制台机箱，功能完全转移至悬浮空间视窗
    // 仅添加粒子与轨迹容器
    this.group.add(this.particlesGroup);
    this.group.add(this.trailsGroup);
    this.group.add(this.impactsGroup);
  }

  /**
   * 将轨道粒子与轨迹的中心点与地球球心精确对齐
   */
  public setOrbitalCenter(center: THREE.Vector3): void {
    this.particlesGroup.position.copy(center);
    this.trailsGroup.position.copy(center);
    this.impactsGroup.position.copy(center);
  }

  /**
   * 触发发射物理动作（兼容接口）
   */
  public triggerLaunchButtonPress(): void {}

  /**
   * 设置发射按钮悬停状态（兼容接口）
   */
  public setLaunchButtonHovered(_hovered: boolean): void {}

  /**
   * 更新滑块与控制台配置（兼容接口）
   */
  public updateValues(_config: ConsoleInteractionConfig): void {}

  /**
   * 设置滑块位置（兼容接口）
   */
  public setSliderPositions(_minV: number, _maxV: number): void {}

  /**
   * 设置粒子手轮（兼容接口）
   */
  public setParticleDialAngle(_count: number): void {}

  /**
   * 刷新控制台（兼容接口）
   */
  public updateLcdScreen(
    _config: ConsoleInteractionConfig,
    _telemetry?: NewtonCannonTelemetry
  ): void {}

  /**
   * 高频同步物理粒子与彩色开普勒轨迹渲染
   */
  public syncParticlesAndTrails(particles: CannonballParticle[]): void {
    const scale = this.SCALE_PHYSICS_TO_SCENE;

    // 1. 扩容粒子网格缓存池
    while (this.particleMeshes.length < particles.length) {
      const pGeo = new THREE.SphereGeometry(this.PARTICLE_RADIUS_SCENE, 24, 24);

      // A. 常规可视通道
      const pMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.15,
        emissive: 0xffffff,
        emissiveIntensity: 0.35,
        depthFunc: THREE.LessEqualDepth,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.renderOrder = 6;

      // 柔和外层发光晕轮
      const glowGeo = new THREE.SphereGeometry(this.PARTICLE_GLOW_RADIUS_SCENE, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      pMesh.add(glowMesh);

      // B. 地心与背面透视通道 (X-Ray 透视)
      const xrayMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const xrayMesh = new THREE.Mesh(pGeo, xrayMat);
      xrayMesh.renderOrder = 26;

      this.particlesGroup.add(pMesh);
      this.particlesGroup.add(xrayMesh);
      this.particleMeshes.push(pMesh);
      this.particleXRayMeshes.push(xrayMesh);
      this.particleGlowMeshes.push(glowMesh);
    }

    // 隐藏多余粒子
    for (let i = particles.length; i < this.particleMeshes.length; i++) {
      this.particleMeshes[i].visible = false;
      this.particleXRayMeshes[i].visible = false;
    }

    // 2. 更新活跃粒子
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mesh = this.particleMeshes[i];
      const xrayMesh = this.particleXRayMeshes[i];
      const glow = this.particleGlowMeshes[i];

      mesh.visible = true;
      xrayMesh.visible = true;

      const posX = p.position.x * scale;
      const posY = p.position.y * scale;
      const posZ = p.position.z * scale;

      mesh.position.set(posX, posY, posZ);
      xrayMesh.position.set(posX, posY, posZ);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(p.color);
      mat.emissive.copy(p.color);
      mat.emissiveIntensity = 0.35;

      (glow.material as THREE.MeshBasicMaterial).color.copy(p.color);
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.22;

      const xmat = xrayMesh.material as THREE.MeshBasicMaterial;
      xmat.color.copy(p.color);
      xmat.opacity = 0.75;

      // 3. 动态轨迹线渲染
      let lineNormal = this.trailLines.get(p.id);
      let lineXRay = this.trailLinesXRay.get(p.id);
      if (!lineNormal) {
        const lineGeo = new THREE.BufferGeometry();
        const initialCapacity = 1200;
        const initialAttr = new THREE.BufferAttribute(new Float32Array(initialCapacity * 3), 3);
        initialAttr.setUsage(THREE.DynamicDrawUsage);
        lineGeo.setAttribute('position', initialAttr);
        lineGeo.setDrawRange(0, 0);
        lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10.0);

        const lineMatNormal = new THREE.LineBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.95,
          linewidth: 3,
          depthFunc: THREE.LessEqualDepth,
        });
        lineNormal = new THREE.Line(lineGeo, lineMatNormal);
        lineNormal.renderOrder = 5;
        this.trailsGroup.add(lineNormal);
        this.trailLines.set(p.id, lineNormal);

        const lineMatXRay = new THREE.LineBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.65,
          linewidth: 2,
          depthFunc: THREE.GreaterDepth,
          depthWrite: false,
        });
        lineXRay = new THREE.Line(lineGeo, lineMatXRay);
        lineXRay.renderOrder = 25;
        this.trailsGroup.add(lineXRay);
        this.trailLinesXRay.set(p.id, lineXRay);
      }

      const trailPoints = p.trail;
      const count = trailPoints.length;
      let posAttr = lineNormal.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (!posAttr || posAttr.count < count) {
        const capacity = Math.max(1200, count * 2);
        posAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        posAttr.setUsage(THREE.DynamicDrawUsage);
        lineNormal.geometry.setAttribute('position', posAttr);
      }
      const posArray = posAttr.array as Float32Array;

      for (let pt = 0; pt < count; pt++) {
        posArray[pt * 3 + 0] = trailPoints[pt].x * scale;
        posArray[pt * 3 + 1] = trailPoints[pt].y * scale;
        posArray[pt * 3 + 2] = trailPoints[pt].z * scale;
      }
      posAttr.needsUpdate = true;
      lineNormal.geometry.setDrawRange(0, count);
    }
  }

  /**
   * 清空所有轨迹线与粒子视觉元素
   */
  public clearVisuals(): void {
    for (const mesh of this.particleMeshes) {
      mesh.visible = false;
    }
    for (const mesh of this.particleXRayMeshes) {
      mesh.visible = false;
    }
    for (const line of this.trailLines.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.trailsGroup.remove(line);
    }
    this.trailLines.clear();

    for (const line of this.trailLinesXRay.values()) {
      (line.material as THREE.Material).dispose();
      this.trailsGroup.remove(line);
    }
    this.trailLinesXRay.clear();

    for (const impact of this.impactRings) {
      impact.geometry.dispose();
      (impact.material as THREE.Material).dispose();
      this.impactsGroup.remove(impact);
    }
    this.impactRings = [];
  }

  /**
   * 动画循环更新
   */
  public update(_deltaSeconds: number): void {}

  /**
   * 彻底安全释放
   */
  public dispose(): void {
    this.clearVisuals();
    disposeObjectTree(this.group);
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }
}
