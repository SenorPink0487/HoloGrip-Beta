/**
 * 牛顿大炮 3D 实体实验台、操作控制台与粒子轨迹渲染系统
 * (Newton Cannon Aerospace Command Console & Particle Trajectory System)
 *
 * 核心设计遵循：
 * 1. 严格遵守 AGENTS.md / GEMINI.md 核心铁律：严禁出现任何 DOM 悬浮弹窗与 Banner！
 * 2. 纯三维物理实体交互：
 *    - 航天级阳极氧化喷砂银铝与深海蓝钛精密机箱 (倒角过渡、散热格栅、沉头六角螺栓、防滑减震黄铜调平脚垫)
 *    - 初速度范围调节机构 (Velocity Range Controls)：双游标微米导轨速度标尺 (Dual Vernier Micrometer Rail)
 *      配备双液态铬滑杆、激光蚀刻 0~16 km/s 标尺、第一/第二宇宙速度醒目标记、双滑动游标滑块 (Vmin / Vmax)
 *      以及 CNC 阳极氧化铝激光雕刻 [Vmin -/+]、[Vmax -/+] 微调步进键
 *    - 粒子个数调节机构 (Particle Count Controls)：香槟金精密滚花步进旋钮手轮 (Knurled Brass Dial) 与 [-]/[+] 步进键，
 *      带动态数显刻度盘，支持 1~32 颗粒子无级/步进调节
 *    - 动能发射主按钮 (Master Launch Trigger)：红宝石水晶大号发射按钮，带抛光镀铬安全护圈与黄铜内套，支持真实物理行程下沉与回弹
 *    - 4 档经典力学轨道场景预设琴键与清空轨迹按键 (带真实 3D 激光蚀刻微纹理键帽)
 *    - 深邃海洋蓝黑 3D 高清全息液晶遥测监视大屏 (Oceanic Sapphire LCD Monitor)，实时呈现速度光谱、粒子阵列、轨道遥测与天体定律公式
 * 3. 粒子轨迹渲染：发光粒子彗核、依据开普勒轨道动力学实时绘制的彩色轨迹带、地心与背面 X-Ray 透视双通道。
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

/**
 * 辅助生成 3D 按键顶面高清晰度激光蚀刻纹理
 */
function createButtonTexture(
  mainText: string,
  subText = '',
  bgColor = '#1e293b',
  textColor = '#f8fafc',
  accentColor = '#38bdf8'
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 填充按键底色
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 128);

    // 外倒角高光边框
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 116);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 232, 104);

    // 主标题文字
    ctx.fillStyle = textColor;
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = subText ? 'bottom' : 'middle';
    ctx.fillText(mainText, 128, subText ? 68 : 64);

    // 副标题文字
    if (subText) {
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(subText, 128, 76);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  } catch {
    return null;
  }
}

export class NewtonCannonBenchMesh {
  public readonly group = new THREE.Group();

  // 1. 发射控制台机箱总成
  public consoleChassisGroup = new THREE.Group();

  // 动能发射主按钮
  public launchButtonMesh!: THREE.Mesh;
  public launchButtonBase!: THREE.Mesh;
  public launchButtonCollar!: THREE.Mesh;
  private launchButtonDepression = 0; // 下压行程 (米)
  private isLaunchButtonHovered = false;

  // 粒子个数调节组件
  public particleDialKnob!: THREE.Mesh; // 香槟金滚花手轮
  public btnCountMinus!: THREE.Mesh;
  public btnCountPlus!: THREE.Mesh;
  private particleCountPlateMesh!: THREE.Mesh;
  private particleCountTexture: THREE.CanvasTexture | null = null;
  private particleCountCanvas: HTMLCanvasElement | null = null;
  private lastRenderedParticleCount = -1;

  // 初速度范围调节组件 (双游标微米导轨速度标尺)
  public vernierRailGroup = new THREE.Group();
  public vernierSliderMin!: THREE.Mesh; // Vmin 青色游标滑块
  public vernierSliderMax!: THREE.Mesh; // Vmax 金色游标滑块
  public btnVMinMinus!: THREE.Mesh;
  public btnVMinPlus!: THREE.Mesh;
  public btnVMaxMinus!: THREE.Mesh;
  public btnVMaxPlus!: THREE.Mesh;
  public thumbwheelVMin!: THREE.Mesh; // 测微旋钮
  public thumbwheelVMax!: THREE.Mesh;

  // 速度导轨几何参数
  private readonly RAIL_START_X = 0.08;
  private readonly RAIL_END_X = 0.38;
  private readonly RAIL_SPAN = 0.30;
  private readonly VELOCITY_SCALE_MAX = 16.0; // 0 ~ 16 km/s

  // 清空轨迹与复位
  public btnClearTrails!: THREE.Mesh;

  // 4 个经典物理场景快速预设琴键
  public btnPresetSuborbital!: THREE.Mesh;
  public btnPresetOrbital!: THREE.Mesh;
  public btnPresetEscape!: THREE.Mesh;
  public btnPresetFullSpectrum!: THREE.Mesh;

  // 2. 3D 液晶遥测监视大屏 (深邃海洋蓝黑)
  public lcdScreenMesh!: THREE.Mesh;
  private lcdCanvas!: HTMLCanvasElement;
  private lcdContext!: CanvasRenderingContext2D;
  private lcdTexture!: THREE.CanvasTexture;
  private lastRenderedTelemetry: string = '';

  // 3. 粒子球体与动态轨迹总成
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
  public readonly PARTICLE_RADIUS_SCENE = 0.020; // 20mm 粒子球半径
  public readonly PARTICLE_GLOW_RADIUS_SCENE = 0.028; // 28mm 外层微光晕轮

  constructor(earthRadiusScene: number, earthRadiusM: number) {
    this.group.name = 'NewtonCannonBenchMesh';
    this.earthRadiusScene = earthRadiusScene;
    this.earthRadiusM = earthRadiusM;
    this.SCALE_PHYSICS_TO_SCENE = earthRadiusScene / earthRadiusM;

    // 构建工业级 3D 发射控制台总成
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
   * 1. 构建工业级航天发射指挥控制台总成
   * 放置于实验台台面正前方操作区 (Y=0.04, Z=1.15)
   */
  private buildLaunchConsole(): void {
    this.consoleChassisGroup.position.set(0, 0.04, 1.15);

    // A. 航天级阳极氧化喷砂银铝机箱底座 (带真实机械倒角与工艺台阶)
    const baseGeo = new THREE.BoxGeometry(0.94, 0.065, 0.38);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // 航天银白阳极氧化铝
      metalness: 0.35,
      roughness: 0.28,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.032;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.consoleChassisGroup.add(baseMesh);

    // 机箱底层防倾覆配重裙边与底座凹槽
    const skirtGeo = new THREE.BoxGeometry(0.96, 0.015, 0.40);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      metalness: 0.45,
      roughness: 0.3,
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.y = 0.0075;
    this.consoleChassisGroup.add(skirtMesh);

    // 四角减震调平黄铜脚垫 (Knurled Brass Leveling Footpads)
    const footOffsets = [
      [-0.43, -0.16],
      [0.43, -0.16],
      [-0.43, 0.16],
      [0.43, 0.16],
    ];
    const footGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.016, 24);
    const footMat = mechMetal(0xd97706, 0.92, 0.2); // 抛光黄铜
    const rubberGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.005, 24);
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });

    footOffsets.forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(fx, 0.008, fz);
      this.consoleChassisGroup.add(foot);

      const rubber = new THREE.Mesh(rubberGeo, rubberMat);
      rubber.position.set(fx, 0.0025, fz);
      this.consoleChassisGroup.add(rubber);
    });

    // 双侧不锈钢液态铬提手 (Mirror Polished Liquid Chrome Grab Handles)
    const handleMat = mechMetal(0xffffff, 0.98, 0.08);
    const handleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.22, 16);
    handleGeo.rotateX(Math.PI / 2);

    const leftHandle = new THREE.Mesh(handleGeo, handleMat);
    leftHandle.position.set(-0.46, 0.065, 0);
    this.consoleChassisGroup.add(leftHandle);

    const rightHandle = new THREE.Mesh(handleGeo, handleMat);
    rightHandle.position.set(0.46, 0.065, 0);
    this.consoleChassisGroup.add(rightHandle);

    // 倾斜操作面板底座 (沉头安装，倾角 -14° 端正正对操作者视线)
    const topPanelGroup = new THREE.Group();
    topPanelGroup.position.set(0, 0.072, 0.01);
    topPanelGroup.rotation.x = THREE.MathUtils.degToRad(-14);
    this.consoleChassisGroup.add(topPanelGroup);

    // 沉邃深海蓝钛主操作台板
    const deckGeo = new THREE.BoxGeometry(0.90, 0.014, 0.33);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // 深邃蓝黑
      metalness: 0.78,
      roughness: 0.32,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = 0.007;
    deckMesh.receiveShadow = true;
    topPanelGroup.add(deckMesh);

    // 香槟金金属内镶嵌边条
    const trimGeo = new THREE.BoxGeometry(0.91, 0.004, 0.34);
    const trimMat = mechMetal(0xf59e0b, 0.9, 0.22);
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.y = 0.002;
    topPanelGroup.add(trimMesh);

    // ==========================================
    // B. 左侧区域：深邃海洋蓝黑 3D 液晶遥测监视大屏
    // ==========================================
    this.buildLcdScreen(topPanelGroup);

    // ==========================================
    // C. 右上区域：初速度范围双游标微米导轨速度标尺 (0 ~ 16 km/s)
    // ==========================================
    this.buildVelocityVernierRail(topPanelGroup);

    // ==========================================
    // D. 右中区域：粒子个数香槟金滚花步进旋钮与微调按键 (1 ~ 32 颗)
    // ==========================================
    this.buildParticleCountDial(topPanelGroup);

    // ==========================================
    // E. 右侧：红宝石水晶大号发射主控物理按钮
    // ==========================================
    this.buildLaunchMasterButton(topPanelGroup);

    // ==========================================
    // F. 前置置底托盘：4 档经典物理场景快速预设琴键与清空按键
    // ==========================================
    this.buildPresetButtons(topPanelGroup);
  }

  /**
   * 构建 3D 液晶遥测监视屏幕
   */
  private buildLcdScreen(parent: THREE.Group): void {
    const screenGeo = new THREE.PlaneGeometry(0.42, 0.21);
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 1024;
    this.lcdCanvas.height = 512;
    this.lcdContext = this.lcdCanvas.getContext('2d')!;

    this.lcdTexture = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTexture.minFilter = THREE.LinearFilter;
    this.lcdTexture.magFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({
      map: this.lcdTexture,
      toneMapped: false,
    });

    this.lcdScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.lcdScreenMesh.position.set(-0.21, 0.016, -0.025);
    this.lcdScreenMesh.rotation.x = -Math.PI / 2;
    parent.add(this.lcdScreenMesh);

    // 屏幕精密航天铝合金防眩光外框
    const bezelGeo = new THREE.BoxGeometry(0.435, 0.008, 0.225);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(-0.21, 0.012, -0.025);
    parent.add(bezel);

    // 屏幕四角沉头内六角黄铜定位螺栓
    const screwGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 12);
    const screwMat = mechMetal(0xd97706, 0.9, 0.2);
    const screwOffsets = [
      [-0.21 - 0.205, -0.025 - 0.10],
      [-0.21 + 0.205, -0.025 - 0.10],
      [-0.21 - 0.205, -0.025 + 0.10],
      [-0.21 + 0.205, -0.025 + 0.10],
    ];
    screwOffsets.forEach(([sx, sz]) => {
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(sx, 0.018, sz);
      parent.add(screw);
    });
  }

  /**
   * 构建初速度范围双游标微米导轨标尺 (Dual Vernier Micrometer Rail)
   */
  private buildVelocityVernierRail(parent: THREE.Group): void {
    this.vernierRailGroup.position.set(0, 0.015, -0.08);
    parent.add(this.vernierRailGroup);

    // 1. 导轨基座铝台槽
    const stageWidth = this.RAIL_SPAN + 0.06;
    const stageGeo = new THREE.BoxGeometry(stageWidth, 0.008, 0.065);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.set(0.23, 0.004, 0);
    this.vernierRailGroup.add(stage);

    // 2. 双液态铬镜面不锈钢精密导杆 (Dual Liquid Chrome Rails)
    const railMat = mechMetal(0xffffff, 0.98, 0.06);
    const railGeo = new THREE.CylinderGeometry(0.003, 0.003, this.RAIL_SPAN + 0.04, 16);
    railGeo.rotateZ(Math.PI / 2);

    const frontRail = new THREE.Mesh(railGeo, railMat);
    frontRail.position.set(0.23, 0.010, -0.016);
    this.vernierRailGroup.add(frontRail);

    const backRail = new THREE.Mesh(railGeo, railMat);
    backRail.position.set(0.23, 0.010, 0.016);
    this.vernierRailGroup.add(backRail);

    // 3. 激光蚀刻毫米与速度标尺板 (Laser-Etched Velocity Scale Plate)
    const scalePlateGeo = new THREE.PlaneGeometry(this.RAIL_SPAN + 0.02, 0.024);
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 512;
    scaleCanvas.height = 64;
    const sCtx = scaleCanvas.getContext('2d')!;

    sCtx.fillStyle = '#0f172a';
    sCtx.fillRect(0, 0, 512, 64);

    // 刻度底线
    sCtx.strokeStyle = '#38bdf8';
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    sCtx.moveTo(16, 32);
    sCtx.lineTo(496, 32);
    sCtx.stroke();

    // 绘制 0 ~ 16 km/s 刻度线
    for (let i = 0; i <= 16; i++) {
      const x = 16 + (i / 16.0) * (496 - 16);
      const isMajor = i % 2 === 0;
      sCtx.beginPath();
      sCtx.moveTo(x, isMajor ? 12 : 22);
      sCtx.lineTo(x, 32);
      sCtx.strokeStyle = i === 8 || i === 11 ? '#fbbf24' : '#94a3b8';
      sCtx.lineWidth = isMajor ? 2.5 : 1.2;
      sCtx.stroke();

      if (isMajor) {
        sCtx.fillStyle = '#cbd5e1';
        sCtx.font = 'bold 16px system-ui, sans-serif';
        sCtx.textAlign = 'center';
        sCtx.fillText(`${i}`, x, 52);
      }
    }

    // 标注第一宇宙速度 v1 (7.9) 与第二宇宙速度 v2 (11.2)
    const v1X = 16 + (7.91 / 16.0) * 480;
    sCtx.fillStyle = '#34d399';
    sCtx.font = 'bold 13px system-ui, sans-serif';
    sCtx.fillText('v₁', v1X, 16);

    const v2X = 16 + (11.18 / 16.0) * 480;
    sCtx.fillStyle = '#c084fc';
    sCtx.fillText('v₂', v2X, 16);

    const scaleTex = new THREE.CanvasTexture(scaleCanvas);
    const scaleMat = new THREE.MeshBasicMaterial({ map: scaleTex });
    const scalePlate = new THREE.Mesh(scalePlateGeo, scaleMat);
    scalePlate.position.set(0.23, 0.009, 0);
    scalePlate.rotation.x = -Math.PI / 2;
    this.vernierRailGroup.add(scalePlate);

    // 4. 初速度下限游标滑块 (V_min Cyan Vernier Slider)
    const sliderGeo = new THREE.BoxGeometry(0.018, 0.016, 0.042);
    const sliderMatMin = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // 极光青蓝
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
    });
    this.vernierSliderMin = new THREE.Mesh(sliderGeo, sliderMatMin);
    this.vernierSliderMin.name = 'cannon-slider-vmin';
    this.vernierSliderMin.userData = { isSlider: true, sliderType: 'vmin' };
    this.vernierSliderMin.position.set(0.14, 0.014, 0);
    this.vernierSliderMin.castShadow = true;
    this.vernierRailGroup.add(this.vernierSliderMin);

    // 游标指示顶针与滚花锁紧螺钉
    const screwPinGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.008, 16);
    const screwPinMat = mechMetal(0xd97706, 0.9, 0.2); // 黄铜锁钉
    const pinMin = new THREE.Mesh(screwPinGeo, screwPinMat);
    pinMin.position.set(0, 0.010, 0);
    this.vernierSliderMin.add(pinMin);

    // 5. 初速度上限游标滑块 (V_max Amber Vernier Slider)
    const sliderMatMax = new THREE.MeshStandardMaterial({
      color: 0xd97706, // 琥珀亮橙
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0xb45309,
      emissiveIntensity: 0.35,
    });
    this.vernierSliderMax = new THREE.Mesh(sliderGeo, sliderMatMax);
    this.vernierSliderMax.name = 'cannon-slider-vmax';
    this.vernierSliderMax.userData = { isSlider: true, sliderType: 'vmax' };
    this.vernierSliderMax.position.set(0.29, 0.014, 0);
    this.vernierSliderMax.castShadow = true;
    this.vernierRailGroup.add(this.vernierSliderMax);

    const pinMax = new THREE.Mesh(screwPinGeo, screwPinMat);
    pinMax.position.set(0, 0.010, 0);
    this.vernierSliderMax.add(pinMax);

    // 6. 速度步进调节按键组 (Vmin -/+, Vmax -/+)
    this.btnVMinMinus = this.createMachinedButton(
      parent,
      'cannon-btn-vmin-minus',
      'Vmin -',
      '下限 -0.5',
      0.08,
      -0.035,
      0x0284c7,
      0.046,
      0.024
    );
    this.btnVMinPlus = this.createMachinedButton(
      parent,
      'cannon-btn-vmin-plus',
      'Vmin +',
      '下限 +0.5',
      0.135,
      -0.035,
      0x0284c7,
      0.046,
      0.024
    );

    this.btnVMaxMinus = this.createMachinedButton(
      parent,
      'cannon-btn-vmax-minus',
      'Vmax -',
      '上限 -0.5',
      0.23,
      -0.035,
      0xd97706,
      0.046,
      0.024
    );
    this.btnVMaxPlus = this.createMachinedButton(
      parent,
      'cannon-btn-vmax-plus',
      'Vmax +',
      '上限 +0.5',
      0.285,
      -0.035,
      0xd97706,
      0.046,
      0.024
    );
  }

  /**
   * 构建粒子个数香槟金滚花步进手轮与调节按键
   */
  private buildParticleCountDial(parent: THREE.Group): void {
    const dialCenterX = 0.09;
    const dialCenterZ = 0.035;

    // 1. 香槟金精密滚花步进旋钮手轮 (Knurled Brass Selector Dial)
    const dialGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.018, 32);
    const dialMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // 香槟金
      metalness: 0.88,
      roughness: 0.22,
    });
    this.particleDialKnob = new THREE.Mesh(dialGeo, dialMat);
    this.particleDialKnob.name = 'cannon-dial-count';
    this.particleDialKnob.userData = { isDial: true, label: '粒子个数调节手轮' };
    this.particleDialKnob.position.set(dialCenterX, 0.016, dialCenterZ);
    this.particleDialKnob.castShadow = true;
    parent.add(this.particleDialKnob);

    // 旋钮顶端激光指示刻线
    const indexLineGeo = new THREE.BoxGeometry(0.003, 0.002, 0.020);
    const indexLineMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const indexLine = new THREE.Mesh(indexLineGeo, indexLineMat);
    indexLine.position.set(0, 0.0095, -0.010);
    this.particleDialKnob.add(indexLine);

    // 旋钮外圈防尘保护底座
    const collarGeo = new THREE.CylinderGeometry(0.030, 0.032, 0.006, 32);
    const collarMat = mechMetal(0x64748b, 0.85, 0.3);
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(dialCenterX, 0.011, dialCenterZ);
    parent.add(collar);

    // 2. 粒子个数步进按键 [-] 与 [+]
    this.btnCountMinus = this.createMachinedButton(
      parent,
      'cannon-btn-count-minus',
      '[-]',
      '粒子 -1',
      0.155,
      dialCenterZ,
      0x0284c7,
      0.038,
      0.028
    );
    this.btnCountPlus = this.createMachinedButton(
      parent,
      'cannon-btn-count-plus',
      '[+]',
      '粒子 +1',
      0.20,
      dialCenterZ,
      0x0284c7,
      0.038,
      0.028
    );

    // 3. 粒子个数数显小标牌 (Digital Tally Badge)
    const plateGeo = new THREE.PlaneGeometry(0.065, 0.026);
    this.particleCountCanvas = document.createElement('canvas');
    this.particleCountCanvas.width = 256;
    this.particleCountCanvas.height = 100;
    this.particleCountTexture = new THREE.CanvasTexture(this.particleCountCanvas);

    const plateMat = new THREE.MeshBasicMaterial({
      map: this.particleCountTexture,
      toneMapped: false,
    });
    this.particleCountPlateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.particleCountPlateMesh.position.set(dialCenterX, 0.014, dialCenterZ + 0.045);
    this.particleCountPlateMesh.rotation.x = -Math.PI / 2;
    parent.add(this.particleCountPlateMesh);
    this.updateParticleCountPlate(8);
  }

  /**
   * 刷新粒子个数数显标牌
   */
  public updateParticleCountPlate(count: number): void {
    if (this.lastRenderedParticleCount === count || !this.particleCountCanvas) return;
    this.lastRenderedParticleCount = count;

    const ctx = this.particleCountCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 100);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 92);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 44px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${count < 10 ? '0' : ''}${count} 颗`, 128, 50);

    if (this.particleCountTexture) {
      this.particleCountTexture.needsUpdate = true;
    }
  }

  /**
   * 构建动能发射主按钮 (Master Launch Trigger)
   */
  private buildLaunchMasterButton(parent: THREE.Group): void {
    const launchX = 0.33;
    const launchZ = 0.030;

    // 抛光镀铬安全圈底座
    const btnBaseGeo = new THREE.CylinderGeometry(0.044, 0.048, 0.016, 32);
    const btnBaseMat = mechMetal(0xffffff, 0.95, 0.1); // 液态铬镜面
    this.launchButtonBase = new THREE.Mesh(btnBaseGeo, btnBaseMat);
    this.launchButtonBase.position.set(launchX, 0.014, launchZ);
    this.launchButtonBase.castShadow = true;
    parent.add(this.launchButtonBase);

    // 香槟金紧固衬套
    const collarGeo = new THREE.CylinderGeometry(0.038, 0.040, 0.008, 32);
    const collarMat = mechMetal(0xd97706, 0.9, 0.2);
    this.launchButtonCollar = new THREE.Mesh(collarGeo, collarMat);
    this.launchButtonCollar.position.set(0, 0.010, 0);
    this.launchButtonBase.add(this.launchButtonCollar);

    // 动能发射红宝石水晶大按钮
    const btnCapGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.024, 32);
    const btnCapMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // 鲜明发光红宝石
      emissive: 0xb91c1c,
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.2,
    });
    this.launchButtonMesh = new THREE.Mesh(btnCapGeo, btnCapMat);
    this.launchButtonMesh.name = 'cannon-btn-launch';
    this.launchButtonMesh.position.set(0, 0.016, 0);
    this.launchButtonMesh.userData = { isLaunchButton: true, label: '动能发射主按钮' };
    this.launchButtonBase.add(this.launchButtonMesh);
  }

  /**
   * 辅助构建精密 3D 机械按键
   */
  private createMachinedButton(
    parent: THREE.Group,
    name: string,
    label: string,
    sublabel: string,
    x: number,
    z: number,
    accentColor = 0x0284c7,
    width = 0.048,
    depth = 0.026
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, 0.016, depth);
    const hexStr = `#${accentColor.toString(16).padStart(6, '0')}`;
    const tex = createButtonTexture(label, sublabel, '#1e293b', '#f8fafc', hexStr);

    let mat: THREE.Material;
    if (tex) {
      const topMat = new THREE.MeshBasicMaterial({ map: tex });
      const sideMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.8,
        roughness: 0.3,
      });
      // 材质数组: [右, 左, 顶, 底, 前, 后]
      mat = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat] as any;
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: accentColor,
        metalness: 0.75,
        roughness: 0.25,
      });
    }

    const mesh = new THREE.Mesh(geo, mat as any);
    mesh.name = name;
    mesh.userData = { isButton: true, buttonName: name, label: `${label} (${sublabel})` };
    mesh.position.set(x, 0.015, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /**
   * 构建 4 个经典物理场景快速预设琴键与清空按键
   */
  private buildPresetButtons(parent: THREE.Group): void {
    const startX = -0.34;
    const zPos = 0.115;
    const spacing = 0.110;
    const w = 0.100;
    const d = 0.026;

    this.btnPresetSuborbital = this.createMachinedButton(
      parent,
      'cannon-preset-suborbital',
      '落体',
      '3.0~6.8km/s',
      startX + spacing * 0,
      zPos,
      0xd97706,
      w,
      d
    );
    this.btnPresetOrbital = this.createMachinedButton(
      parent,
      'cannon-preset-orbital',
      '卫星 v₁',
      '7.6~8.8km/s',
      startX + spacing * 1,
      zPos,
      0x0284c7,
      w,
      d
    );
    this.btnPresetEscape = this.createMachinedButton(
      parent,
      'cannon-preset-escape',
      '逃逸 v₂',
      '10.6~12.5km/s',
      startX + spacing * 2,
      zPos,
      0x7c3aed,
      w,
      d
    );
    this.btnPresetFullSpectrum = this.createMachinedButton(
      parent,
      'cannon-preset-spectrum',
      '全谱对比',
      '3.5~11.5km/s',
      startX + spacing * 3,
      zPos,
      0x059669,
      w,
      d
    );

    // 清空历史轨迹按键
    this.btnClearTrails = this.createMachinedButton(
      parent,
      'cannon-btn-clear',
      '清空轨迹',
      'CLEAR',
      startX + spacing * 4 + 0.02,
      zPos,
      0x64748b,
      0.110,
      d
    );
  }

  /**
   * 动态设置游标滑块位置 (0 ~ 16 km/s 映射到物理导轨行程)
   */
  public setSliderPositions(minV: number, maxV: number): void {
    const vMinClamped = Math.max(0, Math.min(this.VELOCITY_SCALE_MAX, minV));
    const vMaxClamped = Math.max(0, Math.min(this.VELOCITY_SCALE_MAX, maxV));

    const xMin = this.RAIL_START_X + (vMinClamped / this.VELOCITY_SCALE_MAX) * this.RAIL_SPAN;
    const xMax = this.RAIL_START_X + (vMaxClamped / this.VELOCITY_SCALE_MAX) * this.RAIL_SPAN;

    if (this.vernierSliderMin) {
      this.vernierSliderMin.position.x = xMin;
    }
    if (this.vernierSliderMax) {
      this.vernierSliderMax.position.x = xMax;
    }
  }

  /**
   * 动态旋转粒子个数手轮
   */
  public setParticleDialAngle(particleCount: number): void {
    if (this.particleDialKnob) {
      // 粒子数 1~32 映射到 0 ~ 2π 旋转角
      const angle = (particleCount - 1) * ((Math.PI * 2) / 32);
      this.particleDialKnob.rotation.y = angle;
    }
    this.updateParticleCountPlate(particleCount);
  }

  /**
   * 刷新渲染 3D 液晶遥测监视大屏 (深邃海洋蓝黑)
   */
  public updateLcdScreen(
    config: ConsoleInteractionConfig,
    telemetry: NewtonCannonTelemetry
  ): void {
    // 同步物理滑块与手轮
    this.setSliderPositions(config.minVelocityKmS, config.maxVelocityKmS);
    this.setParticleDialAngle(config.particleCount);

    const key = `${config.particleCount}_${config.minVelocityKmS.toFixed(1)}_${config.maxVelocityKmS.toFixed(1)}_${telemetry.totalParticles}_${telemetry.orbitingCount}_${telemetry.landedCount}_${telemetry.escapedCount}_${telemetry.flyingCount}`;
    if (key === this.lastRenderedTelemetry) return;
    this.lastRenderedTelemetry = key;

    const ctx = this.lcdContext;
    if (!ctx) return;
    const w = this.lcdCanvas.width;
    const h = this.lcdCanvas.height;

    // 屏幕深邃海洋蓝黑背景
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    // 科技感背景网格
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.35)';
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

    // 状态指示指示灯
    const isFlying = telemetry.flyingCount > 0;
    ctx.fillStyle = isFlying ? '#22c55e' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(w - 180, 58, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isFlying ? '#4ade80' : '#94a3b8';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(isFlying ? 'LAUNCH ACTIVE' : 'SYSTEM STANDBY', w - 160, 64);

    // 分隔线
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 86);
    ctx.lineTo(w - 32, 86);
    ctx.stroke();

    // ==========================================
    // 左列：发射参数配置与速度光谱条
    // ==========================================
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('【发射设定与初速区间】', 32, 126);

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

    // 动态速度光谱分布条 (Velocity Spectrum Bar)
    const barX = 32;
    const barY = 224;
    const barW = 440;
    const barH = 24;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(barX, barY, barW, barH);

    // 活跃速度区间渐变高亮填充
    const vScale = 16.0;
    const activeStart = barX + (Math.max(0, config.minVelocityKmS) / vScale) * barW;
    const activeEnd = barX + (Math.min(vScale, config.maxVelocityKmS) / vScale) * barW;
    const grad = ctx.createLinearGradient(activeStart, 0, activeEnd, 0);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = grad;
    ctx.fillRect(activeStart, barY + 2, Math.max(2, activeEnd - activeStart), barH - 4);

    // 标记 v1 与 v2
    const v1MarkerX = barX + (telemetry.firstCosmicVelocityKmS / vScale) * barW;
    ctx.fillStyle = '#34d399';
    ctx.fillRect(v1MarkerX - 1.5, barY - 4, 3, barH + 8);

    const v2MarkerX = barX + (telemetry.secondCosmicVelocityKmS / vScale) * barW;
    ctx.fillStyle = '#c084fc';
    ctx.fillRect(v2MarkerX - 1.5, barY - 4, 3, barH + 8);

    // 理论宇宙速度对比标尺
    ctx.fillStyle = '#94a3b8';
    ctx.font = '19px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `第一宇宙速度 v₁: ${telemetry.firstCosmicVelocityKmS.toFixed(2)} km/s (环绕卫星)`,
      32,
      280
    );
    ctx.fillText(
      `第二宇宙速度 v₂: ${telemetry.secondCosmicVelocityKmS.toFixed(2)} km/s (逃逸深空)`,
      32,
      308
    );

    // ==========================================
    // 右列：当前轨道遥测统计
    // ==========================================
    const rx = 520;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('【实时轨道遥测】', rx, 126);

    // 在轨卫星 (高亮绿/青)
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 23px system-ui, -apple-system, sans-serif';
    ctx.fillText(`🛰️ 在轨人造卫星: ${telemetry.orbitingCount} 颗 (永不坠地)`, rx, 164);

    // 地心穿透闭合轨道 (橙红，透视可见)
    const penetCount = Math.max(
      0,
      telemetry.totalParticles - telemetry.orbitingCount - telemetry.escapedCount
    );
    ctx.fillStyle = '#fb923c';
    ctx.fillText(`🌐 地心穿透闭合轨道: ${penetCount} 颗 (透视可见)`, rx, 204);

    // 深空逃逸 (紫光)
    ctx.fillStyle = '#c084fc';
    ctx.fillText(`🌌 逃逸深空: ${telemetry.escapedCount} 颗`, rx, 244);

    // 飞行中
    ctx.fillStyle = '#67e8f9';
    ctx.fillText(`🚀 飞行中: ${telemetry.flyingCount} 颗`, rx, 284);

    // ==========================================
    // 底部：万有引力与开普勒定律公式卡片
    // ==========================================
    ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
    ctx.fillRect(32, 345, w - 64, 135);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.strokeRect(32, 345, w - 64, 135);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('开普勒与牛顿万有引力定律:', 48, 380);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '19px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      '初速达到第一宇宙速度 v₁ = √(GM / R) 时，万有引力充当向心力 (GMm/r² = mv²/r)',
      48,
      412
    );
    ctx.fillText(
      '落体轨迹曲率与地球曲率完全重合，永不坠落，诞生人类第一颗人造地球卫星！',
      48,
      444
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
      const posArray = new Float32Array(count * 3);

      for (let pt = 0; pt < count; pt++) {
        posArray[pt * 3 + 0] = trailPoints[pt].x * scale;
        posArray[pt * 3 + 1] = trailPoints[pt].y * scale;
        posArray[pt * 3 + 2] = trailPoints[pt].z * scale;
      }
      lineNormal.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      lineNormal.geometry.computeBoundingSphere();
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
  public update(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1);

    // 机械发射按钮回弹
    if (this.launchButtonDepression > 0) {
      this.launchButtonDepression = Math.max(0, this.launchButtonDepression - 0.04 * dt);
      this.launchButtonMesh.position.y = 0.016 - this.launchButtonDepression;
    } else {
      this.launchButtonMesh.position.y = 0.016;
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
    if (this.particleCountTexture) {
      this.particleCountTexture.dispose();
    }
  }
}
