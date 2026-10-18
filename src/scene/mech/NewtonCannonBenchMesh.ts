/**
 * 牛顿大炮 3D 实体实验台、操作控制台与粒子轨迹渲染系统
 * (Newton Cannon Aerospace Command Console & Particle Trajectory System)
 *
 * 核心设计遵循：
 * 1. 严格遵守 AGENTS.md / GEMINI.md 核心铁律：零 DOM 悬浮弹窗与 Banner！
 * 2. 纯三维物理实体交互：发射控制台机箱、红色水晶发射大按钮、粒子数微调键、初速度调节键、
 *    经典场景预设键、清空按键、3D 倾斜防眩光液晶遥测仪表屏。
 * 3. 粒子轨迹渲染：发光粒子彗核、依据开普勒轨道动力学实时绘制的彩色轨迹带、地表触地冲击波光环。
 */

import * as THREE from 'three';
import { disposeObjectTree, mechMetal } from './mechKit.ts';
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

  // 1. 控制台机箱总成
  public consoleChassisGroup = new THREE.Group();
  public launchButtonMesh!: THREE.Mesh;
  public launchButtonBase!: THREE.Mesh;
  private launchButtonDepression = 0; // 按下动画行程 (米)
  private isLaunchButtonHovered = false;

  // 调节按键网格 (公开以便射线拾取检测)
  public btnCountMinus!: THREE.Mesh;
  public btnCountPlus!: THREE.Mesh;
  public btnVMinMinus!: THREE.Mesh;
  public btnVMinPlus!: THREE.Mesh;
  public btnVMaxMinus!: THREE.Mesh;
  public btnVMaxPlus!: THREE.Mesh;
  public btnClearTrails!: THREE.Mesh;

  // 预设按键网格
  public btnPresetSuborbital!: THREE.Mesh;
  public btnPresetOrbital!: THREE.Mesh;
  public btnPresetEscape!: THREE.Mesh;
  public btnPresetFullSpectrum!: THREE.Mesh;

  // 2. 3D 液晶遥测监视大屏
  private lcdScreenMesh!: THREE.Mesh;
  private lcdCanvas!: HTMLCanvasElement;
  private lcdContext!: CanvasRenderingContext2D;
  private lcdTexture!: THREE.CanvasTexture;
  private lastRenderedTelemetry: string = '';

  // 3. 粒子球体与动态轨迹总成
  public particlesGroup = new THREE.Group();
  public trailsGroup = new THREE.Group();
  public impactsGroup = new THREE.Group();

  // 粒子球体缓存池
  private particleMeshes: THREE.Mesh[] = [];
  private particleGlowMeshes: THREE.Mesh[] = [];
  private trailLines: Map<number, THREE.Line> = new Map();
  private impactRings: THREE.Mesh[] = [];

  // 缩放比例：将物理世界的米制坐标 (约 6.721e6 m) 映射到 3D 实验台尺度
  // 物理地球半径 6.371e6 m -> 场景半径 0.52 m
  public readonly SCALE_PHYSICS_TO_SCENE: number;

  constructor(earthRadiusScene: number, earthRadiusM: number) {
    this.group.name = 'NewtonCannonBenchMesh';
    this.SCALE_PHYSICS_TO_SCENE = earthRadiusScene / earthRadiusM;

    // 构建 3D 控制台
    this.buildLaunchConsole();
    this.group.add(this.consoleChassisGroup);

    // 构建粒子与轨迹容器
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
   * 1. 构建航天发射指挥控制台总成
   * 放置于实验台台面正前方操作区 (Y=0.04, Z=1.15)
   */
  private buildLaunchConsole(): void {
    this.consoleChassisGroup.position.set(0, 0.04, 1.15);

    // A. 航天银白纳米陶瓷机箱斜切台座
    const baseGeo = new THREE.BoxGeometry(0.88, 0.07, 0.32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.28,
      roughness: 0.32,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.035;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.consoleChassisGroup.add(baseMesh);

    // 倾斜操作面板顶盖
    const topPanelGeo = new THREE.BoxGeometry(0.86, 0.015, 0.28);
    const topPanelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // 深空钛黑操作面板
      metalness: 0.85,
      roughness: 0.22,
    });
    const topPanel = new THREE.Mesh(topPanelGeo, topPanelMat);
    topPanel.position.set(0, 0.076, 0);
    topPanel.rotation.x = THREE.MathUtils.degToRad(-12); // 面向用户视角倾斜
    this.consoleChassisGroup.add(topPanel);

    // B. 🚀 红色水晶大号发射物理按钮
    const btnBaseGeo = new THREE.CylinderGeometry(0.042, 0.046, 0.02, 32);
    const btnBaseMat = mechMetal(0x94a3b8, 0.9, 0.15); // 抛光镀铬安全圈
    this.launchButtonBase = new THREE.Mesh(btnBaseGeo, btnBaseMat);
    this.launchButtonBase.position.set(0.30, 0.09, 0.05);
    this.launchButtonBase.rotation.x = THREE.MathUtils.degToRad(-12);
    this.consoleChassisGroup.add(this.launchButtonBase);

    const btnCapGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.022, 32);
    const btnCapMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // 鲜明发光红水晶
      emissive: 0xb91c1c,
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.2,
    });
    this.launchButtonMesh = new THREE.Mesh(btnCapGeo, btnCapMat);
    this.launchButtonMesh.name = 'cannon-btn-launch';
    this.launchButtonMesh.position.set(0, 0.014, 0);
    this.launchButtonMesh.userData = { isLaunchButton: true };
    this.launchButtonBase.add(this.launchButtonMesh);

    // C. 3D 液晶遥测监视大屏 (放置在面板左半侧)
    this.buildLcdScreen();

    // D. 粒子数与速度调节按键组 (放置在中间与右侧)
    this.buildControlButtons();

    // E. 4 个场景快捷预设按键
    this.buildPresetButtons();
  }

  /**
   * 构建 3D 液晶遥测监视屏幕
   */
  private buildLcdScreen(): void {
    const screenGeo = new THREE.PlaneGeometry(0.44, 0.20);
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 1024;
    this.lcdCanvas.height = 480;
    this.lcdContext = this.lcdCanvas.getContext('2d')!;

    this.lcdTexture = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTexture.minFilter = THREE.LinearFilter;
    this.lcdTexture.magFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({
      map: this.lcdTexture,
      toneMapped: false,
    });

    this.lcdScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.lcdScreenMesh.position.set(-0.16, 0.094, -0.01);
    this.lcdScreenMesh.rotation.x = THREE.MathUtils.degToRad(-12);
    this.consoleChassisGroup.add(this.lcdScreenMesh);

    // 屏幕深色铝合金防眩光边框
    const bezelGeo = new THREE.BoxGeometry(0.46, 0.22, 0.008);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.3,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(-0.16, 0.092, -0.015);
    bezel.rotation.x = THREE.MathUtils.degToRad(-12);
    this.consoleChassisGroup.add(bezel);
  }

  /**
   * 辅助创建 3D 物理金属微调按键
   */
  private createPushButton(
    name: string,
    label: string,
    x: number,
    z: number,
    color = 0x334155,
    w = 0.046,
    d = 0.032
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, 0.018, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.75,
      roughness: 0.25,
      emissive: color,
      emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.userData = { isButton: true, buttonName: name, label };
    mesh.position.set(x, 0.092, z);
    mesh.rotation.x = THREE.MathUtils.degToRad(-12);
    mesh.castShadow = true;
    this.consoleChassisGroup.add(mesh);
    return mesh;
  }

  /**
   * 构建调节按键
   */
  private buildControlButtons(): void {
    // 粒子数量: [-] / [+]
    this.btnCountMinus = this.createPushButton(
      'cannon-btn-count-minus',
      '粒子数 -1',
      0.15,
      -0.055,
      0x1e3a5f,
      0.038,
      0.026
    );
    this.btnCountPlus = this.createPushButton(
      'cannon-btn-count-plus',
      '粒子数 +1',
      0.21,
      -0.055,
      0x1e3a5f,
      0.038,
      0.026
    );

    // 初速范围 V_min: [-] / [+]
    this.btnVMinMinus = this.createPushButton(
      'cannon-btn-vmin-minus',
      '最小初速 Vmin -0.5',
      0.15,
      -0.015,
      0x047857,
      0.038,
      0.026
    );
    this.btnVMinPlus = this.createPushButton(
      'cannon-btn-vmin-plus',
      '最小初速 Vmin +0.5',
      0.21,
      -0.015,
      0x047857,
      0.038,
      0.026
    );

    // 初速范围 V_max: [-] / [+]
    this.btnVMaxMinus = this.createPushButton(
      'cannon-btn-vmax-minus',
      '最大初速 Vmax -0.5',
      0.15,
      0.025,
      0xb45309,
      0.038,
      0.026
    );
    this.btnVMaxPlus = this.createPushButton(
      'cannon-btn-vmax-plus',
      '最大初速 Vmax +0.5',
      0.21,
      0.025,
      0xb45309,
      0.038,
      0.026
    );

    // 清空历史轨迹按键
    this.btnClearTrails = this.createPushButton(
      'cannon-btn-clear',
      '清空所有轨迹',
      0.30,
      -0.03,
      0x475569,
      0.09,
      0.028
    );
  }

  /**
   * 构建 4 个经典物理场景快速预设按键
   */
  private buildPresetButtons(): void {
    const startX = -0.32;
    const yZ = 0.088;
    const w = 0.096;
    const spacing = 0.106;

    this.btnPresetSuborbital = this.createPushButton(
      'cannon-preset-suborbital',
      '预设: 全部落回地面 (3.0~6.5 km/s)',
      startX + spacing * 0,
      yZ,
      0xd97706,
      w,
      0.022
    );
    this.btnPresetOrbital = this.createPushButton(
      'cannon-preset-orbital',
      '预设: 第一宇宙速度入轨 (7.5~8.5 km/s)',
      startX + spacing * 1,
      yZ,
      0x0284c7,
      w,
      0.022
    );
    this.btnPresetEscape = this.createPushButton(
      'cannon-preset-escape',
      '预设: 逃逸深空 (10.5~12.0 km/s)',
      startX + spacing * 2,
      yZ,
      0x7c3aed,
      w,
      0.022
    );
    this.btnPresetFullSpectrum = this.createPushButton(
      'cannon-preset-spectrum',
      '预设: 全景渐变谱 (3.0~11.5 km/s)',
      startX + spacing * 3,
      yZ,
      0x059669,
      w,
      0.022
    );
  }

  /**
   * 刷新渲染 3D 液晶遥测监视大屏
   */
  public updateLcdScreen(
    config: ConsoleInteractionConfig,
    telemetry: NewtonCannonTelemetry
  ): void {
    const key = `${config.particleCount}_${config.minVelocityKmS.toFixed(1)}_${config.maxVelocityKmS.toFixed(1)}_${telemetry.totalParticles}_${telemetry.orbitingCount}_${telemetry.landedCount}_${telemetry.escapedCount}`;
    if (key === this.lastRenderedTelemetry) return;
    this.lastRenderedTelemetry = key;

    const ctx = this.lcdContext;
    const w = this.lcdCanvas.width;
    const h = this.lcdCanvas.height;

    // 屏幕背景
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, w, h);

    // 科技感背景网格
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 顶部发光标题栏
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.fillText("NEWTON'S CANNONBALL · ORBITAL TELEMETRY", 32, 46);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillText('万有引力与第一宇宙速度遥测中枢', 32, 74);

    // 分隔线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 86);
    ctx.lineTo(w - 32, 86);
    ctx.stroke();

    // 左列：发射参数配置区
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('【发射设定】', 32, 126);

    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`单次粒子个数: `, 32, 164);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${config.particleCount} 颗`, 180, 164);

    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`初速范围 V0: `, 32, 204);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `${config.minVelocityKmS.toFixed(2)} ~ ${config.maxVelocityKmS.toFixed(2)} km/s`,
      180,
      204
    );

    // 理论宇宙速度对比标尺
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `第一宇宙速度 v₁: ${telemetry.firstCosmicVelocityKmS.toFixed(2)} km/s (入轨环绕)`,
      32,
      246
    );
    ctx.fillText(
      `第二宇宙速度 v₂: ${telemetry.secondCosmicVelocityKmS.toFixed(2)} km/s (逃逸深空)`,
      32,
      276
    );

    // 右列：当前轨道遥测统计
    const rx = 520;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('【实时轨道遥测】', rx, 126);

    // 在轨卫星 (高亮绿/青)
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(`🛰️ 在轨人造卫星: ${telemetry.orbitingCount} 颗 (永不坠地)`, rx, 164);

    // 地面坠落 (橙红)
    ctx.fillStyle = '#f87171';
    ctx.fillText(`💥 坠落地表: ${telemetry.landedCount} 颗`, rx, 204);

    // 深空逃逸 (紫光)
    ctx.fillStyle = '#c084fc';
    ctx.fillText(`🌌 逃逸深空: ${telemetry.escapedCount} 颗`, rx, 244);

    // 飞行中
    ctx.fillStyle = '#67e8f9';
    ctx.fillText(`🚀 飞行中: ${telemetry.flyingCount} 颗`, rx, 284);

    // 底部万有引力与卫星轨道定律物理注释
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(32, 320, w - 64, 130);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeRect(32, 320, w - 64, 130);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('开普勒与牛顿万有引力定律:', 48, 354);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '19px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      '当初速达到第一宇宙速度 v₁ = √(GM / R) 时，重力恰好充当向心力 (GMm/r² = mv²/r)',
      48,
      386
    );
    ctx.fillText(
      '下落弯曲率与地球曲率完全重合，物体不再落回地面，成为第一颗人造地球卫星！',
      48,
      418
    );

    this.lcdTexture.needsUpdate = true;
  }

  /**
   * 触发发射物理按钮机械按下动画
   */
  public triggerLaunchButtonPress(): void {
    this.launchButtonDepression = 0.007; // 下压 7mm
  }

  /**
   * 高频同步物理粒子与彩色开普勒轨迹渲染
   */
  public syncParticlesAndTrails(particles: CannonballParticle[]): void {
    const scale = this.SCALE_PHYSICS_TO_SCENE;

    // 1. 扩容或缩减粒子网格缓存池
    while (this.particleMeshes.length < particles.length) {
      const pGeo = new THREE.SphereGeometry(0.0075, 16, 16);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.8,
        emissive: 0xffffff,
        emissiveIntensity: 0.8,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      // 发光耀斑
      const glowGeo = new THREE.SphereGeometry(0.015, 12, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      pMesh.add(glowMesh);

      this.particlesGroup.add(pMesh);
      this.particleMeshes.push(pMesh);
      this.particleGlowMeshes.push(glowMesh);
    }

    // 隐藏多余粒子
    for (let i = particles.length; i < this.particleMeshes.length; i++) {
      this.particleMeshes[i].visible = false;
    }

    // 2. 更新活跃粒子位置、颜色与显示
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mesh = this.particleMeshes[i];
      const glow = this.particleGlowMeshes[i];

      mesh.visible = true;
      mesh.position.set(p.position.x * scale, p.position.y * scale, p.position.z * scale);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(p.color);
      mat.emissive.copy(p.color);
      (glow.material as THREE.MeshBasicMaterial).color.copy(p.color);

      // 若撞击地面，稍微缩小变暗
      if (p.state === 'landed') {
        mesh.scale.set(0.65, 0.65, 0.65);
        mat.emissiveIntensity = 0.2;
      } else {
        mesh.scale.set(1.0, 1.0, 1.0);
        mat.emissiveIntensity = 0.9;
      }

      // 3. 动态轨迹线渲染
      let line = this.trailLines.get(p.id);
      if (!line) {
        const lineGeo = new THREE.BufferGeometry();
        const lineMat = new THREE.LineBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.85,
          linewidth: 2,
        });
        line = new THREE.Line(lineGeo, lineMat);
        this.trailsGroup.add(line);
        this.trailLines.set(p.id, line);
      }

      // 填充轨迹顶点数据
      const trailPoints = p.trail;
      const count = trailPoints.length;
      const posArray = new Float32Array(count * 3);
      for (let pt = 0; pt < count; pt++) {
        posArray[pt * 3 + 0] = trailPoints[pt].x * scale;
        posArray[pt * 3 + 1] = trailPoints[pt].y * scale;
        posArray[pt * 3 + 2] = trailPoints[pt].z * scale;
      }
      line.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      line.geometry.computeBoundingSphere();
    }
  }

  /**
   * 清空所有轨迹线与粒子视觉元素
   */
  public clearVisuals(): void {
    for (const mesh of this.particleMeshes) {
      mesh.visible = false;
    }
    for (const line of this.trailLines.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.trailsGroup.remove(line);
    }
    this.trailLines.clear();

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
  public update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1);

    // 机械发射按钮回弹
    if (this.launchButtonDepression > 0) {
      this.launchButtonDepression = Math.max(0, this.launchButtonDepression - 0.04 * dt);
      this.launchButtonMesh.position.y = 0.014 - this.launchButtonDepression;
    } else {
      this.launchButtonMesh.position.y = 0.014;
    }

    // 发射按钮悬停呼吸光晕
    const mat = this.launchButtonMesh.material as THREE.MeshStandardMaterial;
    if (this.isLaunchButtonHovered) {
      mat.emissiveIntensity = 0.85;
    } else {
      mat.emissiveIntensity = 0.45;
    }
  }

  /**
   * 设置发射按钮悬停状态
   */
  public setLaunchButtonHovered(hovered: boolean): void {
    this.isLaunchButtonHovered = hovered;
  }

  /**
   * 彻底安全释放
   */
  public dispose(): void {
    this.clearVisuals();
    disposeObjectTree(this.group);
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    if (this.lcdTexture) {
      this.lcdTexture.dispose();
    }
  }
}
