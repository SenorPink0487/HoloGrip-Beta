import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export type LightSourceMode = 'monochromatic' | 'white';

export type DoubleSlitPreset = 'd_015' | 'd_025' | 'd_040' | 'd_055';

export interface OpticalDoubleSlitTelemetry {
  lightSourceMode: LightSourceMode;
  wavelengthNm: number;
  laserPower: boolean;
  slitDistanceMm: number;
  slitWidthMm: number;
  screenDistanceM: number;
  fringeSpacingMm: number;
  centralEnvelopeWidthMm: number;
  missingOrderK: number | null;
  firstOrderAngleDeg: number;
  firstOrderPathDiffNm: number;
  maxVisibleOrders: number;
}

export interface OpticalDoubleSlitOptions {
  lightSourceMode?: LightSourceMode;
  wavelengthNm?: number;
  laserPower?: boolean;
  slitDistanceMm?: number;
  slitWidthMm?: number;
  screenDistanceM?: number;
  showEnvelopeModulation?: boolean;
  showOrderRays?: boolean;
  showBeamsInAir?: boolean;
}

function safeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  } catch {
    return null;
  }
}

/**
 * 创建带真实机械倒角与圆角过渡的精密工业盒体几何
 * 严禁使用毫无细节的粗糙直角 BoxGeometry 生硬拼接
 */
function createChamferedBlockGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.0012
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const b = Math.min(bevel, width * 0.2, height * 0.2);
  const hw = width * 0.5 - b;
  const hh = height * 0.5 - b;

  shape.moveTo(-hw, -hh - b);
  shape.lineTo(hw, -hh - b);
  shape.lineTo(hw + b, -hh);
  shape.lineTo(hw + b, hh);
  shape.lineTo(hw, hh + b);
  shape.lineTo(-hw, hh + b);
  shape.lineTo(-hw - b, hh);
  shape.lineTo(-hw - b, -hh);
  shape.closePath();

  const extrudeDepth = Math.max(0.0005, depth - b * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * 旗舰科研级杨氏双缝干涉与光波波长测定精密光学实验台
 * (航天级阳极氧化喷砂银铝 · 镜面液态铬 · 香槟金微调五金 · 深海蓝宝石干涉屏)
 *
 * 与《光的衍射》器材完全区分的专属工业设计架构：
 * 1. 导轨底座：航天级阳极氧化喷砂银铝（Aerospace Satin Silver, 0xe2e8f0）精铣减重槽导轨床身 + 深海蓝黑激光蚀刻 0~100cm 标尺 + 双液态铬导杆 + 香槟金调平支脚；
 * 2. 滑座 1 (X=-0.38)：圆筒形氦氖/固体相干激光谐振腔发射管（带 8 道环形散热鳍片、双 CNC 圆环万向调心支架、6 枚 120° 径向香槟金调心顶丝、倾斜式波长与白光控制面板）；
 * 3. 滑座 2 (X=-0.08)：Thorlabs 级圆形 360° 分度万向双缝镜架（外环激光角度刻线、中心深蓝宝石观察窗内嵌两条平行相干透光狭缝 S1/S2 与钛合金微米中心隔桥、右侧 Mitutoyo 差动测微鼓轮、左侧四档校准棘轮转盘）；
 * 4. 滑座 3 (X=0.16~0.46)：带精密防杂散光遮光罩檐与底部镜面丝杠测微手轮游标卡尺的杨氏干涉接收屏（默认呈现经典等间距、等亮度均匀明暗干涉条纹，底部三枚实体游标卡尺针联动指示 k=0 与 k=±1 明纹间距 Δy = λL/d）。
 */
export class OpticalDoubleSlitBenchMesh {
  public readonly group = new THREE.Group();

  // 物理与几何基准尺寸 (沿 X 轴水平展开，正面对向操作者 +Z)
  public readonly railLength = 1.10;   // X 轴导轨总长
  public readonly railWidth = 0.068;   // Z 轴前后进深
  public readonly railHeight = 0.042;  // Y 轴导轨床身厚度
  public readonly beamHeightY = 0.205; // 标准光轴中心高度
  public readonly laserX = -0.37;      // 圆筒相干激光器滑座坐标 (~14cm 刻度处)
  public readonly slitX = -0.08;       // 圆形万向杨氏双缝架坐标 (~46cm 刻度处)
  public minScreenX = 0.16;            // 干涉测微屏最近端 (~66cm 刻度处, L=0.30m)
  public maxScreenX = 0.46;            // 干涉测微屏最远端 (~96cm 刻度处, L=0.85m)

  // 核心物理状态参数
  public lightSourceMode: LightSourceMode = 'monochromatic';
  public wavelengthNm = 532.0;          // 默认 532nm 绿光相干激光
  public laserPower = true;
  public slitDistanceMm = 0.25;         // 双缝中心距 d (0.12mm ~ 0.60mm)
  public slitWidthMm = 0.04;            // 单条狭缝宽度 a (0.02mm ~ 0.12mm)
  public screenDistanceM = 0.55;        // 双缝至屏距离 L (0.30m ~ 0.85m)
  public showEnvelopeModulation = false;// 默认呈现经典杨氏等间距等幅明暗干涉条纹（开启则叠加单缝衍射包络）
  public showOrderRays = true;          // 是否显示各级相长干涉空间主极大射线 (k=0, ±1, ±2...)
  public showBeamsInAir = true;         // 是否显示空气丁达尔双波源相干交叠光锥
  public activePresetIndex = 1;         // 0: 0.15mm, 1: 0.25mm, 2: 0.40mm, 3: 0.55mm

  // 3D 核心装配节点
  public railGroup!: THREE.Group;
  public laserGroup!: THREE.Group;
  public slitStageGroup!: THREE.Group;
  public turretGroup!: THREE.Group;
  public turretWheel!: THREE.Group;
  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public micrometerKnob!: THREE.Mesh;
  public micrometerThimbleGroup!: THREE.Group;
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};
  public whiteLightBtnMesh!: THREE.Mesh;

  // 原生 3D 交互引导光晕环与首次接触状态
  public micrometerHoverCue!: THREE.Mesh;
  public turretHoverCue!: THREE.Mesh;
  public hasInteractedWithMicrometer = false;
  public hasInteractedWithTurret = false;
  public currentTurretAngle = Math.PI * 0.5;
  public targetTurretAngle = Math.PI * 0.5;

  // 杨氏双缝微米刀口与双狭缝透光实体构件 (S1 与 S2)
  public leftJawMesh!: THREE.Mesh;
  public rightJawMesh!: THREE.Mesh;
  public centerBridgeMesh!: THREE.Mesh;
  public leftSlitLightMesh!: THREE.Mesh;
  public rightSlitLightMesh!: THREE.Mesh;

  // 观测屏底部丝杠测微游标卡尺指针与手轮 (实时指示 k=0 中央明纹与 k=±1 一阶明纹物理位置 ±Δy)
  public centerCaliperMesh!: THREE.Mesh;
  public leftOrder1CaliperMesh!: THREE.Mesh;
  public rightOrder1CaliperMesh!: THREE.Mesh;
  public caliperHandwheelMesh!: THREE.Mesh;

  // 3D 空气漫散射真实准直激光光路 + 前段叠加行进正弦电磁波列与双缝出口波阵面
  public preBeamMesh!: THREE.Mesh;
  public preBeamHaloMesh!: THREE.Mesh;
  public incidentWaveRibbonMesh!: THREE.Mesh;
  public incidentWaveVectorsMesh!: THREE.LineSegments;
  public postBeamMesh!: THREE.Mesh;
  public secondaryBeamMesh!: THREE.Mesh;
  public wavefrontArcsGroup!: THREE.Group;
  public interferenceRaysGroup!: THREE.Group;
  private beamMaterial!: THREE.MeshBasicMaterial;
  private secondaryBeamMaterial!: THREE.MeshBasicMaterial;
  private waveRibbonMaterial!: THREE.MeshBasicMaterial;
  private waveVectorMaterial!: THREE.LineBasicMaterial;
  private wavefrontCrestMaterial!: THREE.MeshBasicMaterial;
  private wavePhase = 0;
  private s1WaveRings: THREE.Mesh[] = [];
  private s2WaveRings: THREE.Mesh[] = [];

  // 屏幕纹理与标尺 Canvas
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  public screenMesh!: THREE.Mesh;
  private railScaleCanvas: HTMLCanvasElement | null = null;
  private railScaleTexture: THREE.CanvasTexture | null = null;
  private bezelScaleCanvas: HTMLCanvasElement | null = null;
  private bezelScaleTexture: THREE.CanvasTexture | null = null;
  private gimbalDialCanvas: HTMLCanvasElement | null = null;
  private gimbalDialTexture: THREE.CanvasTexture | null = null;
  private slitPlateCanvas: HTMLCanvasElement | null = null;
  private slitPlateTexture: THREE.CanvasTexture | null = null;
  private slitPlateMesh!: THREE.Sprite;

  // 脏标记与重绘节流
  private isScreenDirty = true;
  private lastRenderHash = '';

  constructor(options: OpticalDoubleSlitOptions = {}) {
    this.group.name = 'OpticalDoubleSlitBenchMesh';

    if (options.lightSourceMode !== undefined) this.lightSourceMode = options.lightSourceMode;
    if (options.wavelengthNm !== undefined) this.wavelengthNm = options.wavelengthNm;
    if (options.laserPower !== undefined) this.laserPower = options.laserPower;
    if (options.slitDistanceMm !== undefined) this.slitDistanceMm = options.slitDistanceMm;
    if (options.slitWidthMm !== undefined) this.slitWidthMm = options.slitWidthMm;
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;
    if (options.showEnvelopeModulation !== undefined) this.showEnvelopeModulation = options.showEnvelopeModulation;
    if (options.showOrderRays !== undefined) this.showOrderRays = options.showOrderRays;
    if (options.showBeamsInAir !== undefined) this.showBeamsInAir = options.showBeamsInAir;

    this.buildBenchApparatus();
    this.syncScreenPositionFromDistance();
    this.updateSlitKinematics();
    this.updateLaserIndicators();
    this.updateScreenTexture();
    this.updateBeams();
  }

  // ==================== 1. 主装配构建 (专属科研级杨氏双缝干涉三滑座系统) ====================
  private buildBenchApparatus(): void {
    // A. 航天级阳极氧化喷砂银铝双导杆精密光具座、深海蓝底激光标尺与四角减震调平支脚
    this.buildOpticalRail();

    // B. 滑座 1 (左侧 X=-0.37): 圆筒形相干激光谐振腔管与双环 CNC 万向调心支架
    this.buildLaserModule();

    // C. 滑座 2 (中央 X=-0.08): Thorlabs 级圆形 360° 分度杨氏双缝工作台 (双狭缝 S1/S2、微米钛桥、微分鼓轮、四档转轮)
    this.buildDoubleSlitStage();

    // D. 滑座 3 (右侧 X=0.16~0.46): 带防杂散光遮光罩与丝杠测微手轮游标尺的深海蓝黑干涉接收屏
    this.buildObservationScreen();

    // E. 3D 空间双波源相干交叠光锥与各级相长干涉主极大射线系统
    this.buildOpticalBeams();
  }

  // ==================== 通用航天银铝与深空钛灰双色精密滑鞍构造助手 ====================
  private createSliderSaddle(
    xPos: number,
    name: string,
    rodHeight: number
  ): { saddleGroup: THREE.Group; collar: THREE.Mesh; rod: THREE.Mesh } {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(xPos, 0, 0);

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.35,
      roughness: 0.28,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.25,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.42,
      roughness: 0.26,
    });

    // 1. 滑鞍主体基座 (航天级喷砂银铝精铣滑座 + 深空钛灰下卡爪)
    const baseW = 0.072;
    const baseH = 0.022;
    const baseD = 0.080;
    const baseGeo = createChamferedBlockGeometry(baseW, baseH, baseD, 0.0016);
    const base = new THREE.Mesh(baseGeo, satinSilverMat);
    base.position.set(0, this.railHeight + baseH * 0.5, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 顶部深空钛灰装饰压板
    const topPlateGeo = createChamferedBlockGeometry(baseW * 0.86, 0.004, baseD * 0.86, 0.0008);
    const topPlate = new THREE.Mesh(topPlateGeo, titaniumSlateMat);
    topPlate.position.set(0, this.railHeight + baseH + 0.002, 0);
    group.add(topPlate);

    // 下部导向燕尾卡爪
    const lipGeo = createChamferedBlockGeometry(baseW, 0.010, 0.007, 0.0008);
    const lipFront = new THREE.Mesh(lipGeo, titaniumSlateMat);
    lipFront.position.set(0, this.railHeight + 0.005, baseD * 0.5 - 0.003);
    const lipBack = new THREE.Mesh(lipGeo, titaniumSlateMat);
    lipBack.position.set(0, this.railHeight + 0.005, -baseD * 0.5 + 0.003);
    group.add(lipFront);
    group.add(lipBack);

    // 正面香槟金游标对齐读数指针 (对准下方毫米刻度尺)
    const indexLineGeo = new THREE.BoxGeometry(0.0024, 0.018, 0.0025);
    const indexLine = new THREE.Mesh(indexLineGeo, brassMat);
    indexLine.position.set(0, this.railHeight + 0.005, baseD * 0.502);
    group.add(indexLine);

    // 2. 中央立柱锁紧套筒 (六角底座法兰 + 香槟金精密锁紧套筒)
    const flangeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.005, 6);
    const flange = new THREE.Mesh(flangeGeo, titaniumSlateMat);
    flange.position.set(0, this.railHeight + baseH + 0.004, 0);
    group.add(flange);

    const collarRadius = 0.011;
    const collarH = 0.032;
    const collarGeo = new THREE.CylinderGeometry(collarRadius, collarRadius, collarH, 28);
    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.position.set(0, this.railHeight + baseH + collarH * 0.5, 0);
    collar.castShadow = true;
    group.add(collar);

    // 3. 套筒右侧滚花锁紧手轮
    const screwShaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 16);
    screwShaftGeo.rotateZ(Math.PI / 2);
    const screwShaft = new THREE.Mesh(screwShaftGeo, chromeRodMat);
    screwShaft.position.set(collarRadius + 0.004, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwShaft);

    const screwHeadGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.014, 24);
    screwHeadGeo.rotateZ(Math.PI / 2);
    const screwHead = new THREE.Mesh(screwHeadGeo, brassMat);
    screwHead.position.set(collarRadius + 0.015, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwHead);

    // 4. 精密镜面 316L 不锈钢升降立柱导杆
    const rodRadius = 0.0072;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodHeight, 32);
    const rod = new THREE.Mesh(rodGeo, chromeRodMat);
    rod.position.set(0, this.railHeight + baseH + rodHeight * 0.5, 0);
    rod.castShadow = true;
    group.add(rod);

    return { saddleGroup: group, collar, rod };
  }

  // ==================== A. 航天级阳极氧化喷砂银铝双槽导轨与深海蓝激光标尺 ====================
  private buildOpticalRail(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'RailGroup';

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.34,
      roughness: 0.28,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.24,
      roughness: 0.42,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.42,
      roughness: 0.26,
    });

    // 1. 导轨床身主体 (航天级阳极氧化喷砂银铝挤压铝型材)
    const railBodyGeo = createChamferedBlockGeometry(this.railLength, this.railHeight, this.railWidth, 0.0022);
    const railBody = new THREE.Mesh(railBodyGeo, satinSilverMat);
    railBody.position.set(0, this.railHeight * 0.5, 0);
    railBody.castShadow = true;
    railBody.receiveShadow = true;
    this.railGroup.add(railBody);

    // 导轨顶面深空钛灰中央消光凹槽 (防止轴向杂散反射光干扰)
    const topGrooveGeo = new THREE.BoxGeometry(this.railLength - 0.01, 0.003, this.railWidth * 0.42);
    const topGroove = new THREE.Mesh(topGrooveGeo, titaniumSlateMat);
    topGroove.position.set(0, this.railHeight + 0.0005, 0);
    this.railGroup.add(topGroove);

    // 2. 导轨顶部双镜面液态铬导向滑杆 (贯通全长)
    const rodRadius = 0.0044;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, this.railLength + 0.016, 32);
    rodGeo.rotateZ(Math.PI / 2);
    const rodFront = new THREE.Mesh(rodGeo, chromeRodMat);
    rodFront.position.set(0, this.railHeight + rodRadius * 0.7, this.railWidth * 0.30);
    const rodBack = new THREE.Mesh(rodGeo, chromeRodMat);
    rodBack.position.set(0, this.railHeight + rodRadius * 0.7, -this.railWidth * 0.30);
    this.railGroup.add(rodFront);
    this.railGroup.add(rodBack);

    // 3. 两端深空钛晶灰蓝精工端盖与香槟金调平减震支脚系统
    const endCapW = 0.026;
    const endCapH = this.railHeight + 0.008;
    const endCapD = this.railWidth + 0.008;
    const endCapGeo = createChamferedBlockGeometry(endCapW, endCapH, endCapD, 0.0018);

    const xEnds = [-this.railLength * 0.5 - endCapW * 0.5, this.railLength * 0.5 + endCapW * 0.5];

    xEnds.forEach((xPos) => {
      const endCap = new THREE.Mesh(endCapGeo, titaniumSlateMat);
      endCap.position.set(xPos, this.railHeight * 0.5, 0);
      endCap.castShadow = true;
      this.railGroup.add(endCap);

      // 顶部香槟金限位止动滚花螺钉
      const stopScrewGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.018, 24);
      const stopScrew = new THREE.Mesh(stopScrewGeo, brassMat);
      stopScrew.position.set(xPos, this.railHeight + 0.013, 0);
      this.railGroup.add(stopScrew);

      // 下部横向防倾覆配重支脚横梁
      const crossFootW = 0.028;
      const crossFootH = 0.014;
      const crossFootD = 0.152;
      const crossFootGeo = createChamferedBlockGeometry(crossFootW, crossFootH, crossFootD, 0.0015);
      const crossFoot = new THREE.Mesh(crossFootGeo, titaniumSlateMat);
      crossFoot.position.set(xPos, 0.002, 0);
      crossFoot.castShadow = true;
      this.railGroup.add(crossFoot);

      // 前后 2 组高精密防震水平调平旋钮底脚
      const zFootOffsets = [-crossFootD * 0.40, crossFootD * 0.40];
      zFootOffsets.forEach((zPos) => {
        const studGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.024, 16);
        const stud = new THREE.Mesh(studGeo, chromeRodMat);
        stud.position.set(xPos, -0.008, zPos);
        this.railGroup.add(stud);

        const lockNutGeo = new THREE.CylinderGeometry(0.0082, 0.0082, 0.006, 6);
        const lockNut = new THREE.Mesh(lockNutGeo, brassMat);
        lockNut.position.set(xPos, -0.002, zPos);
        this.railGroup.add(lockNut);

        const footPadGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.009, 28);
        const footPad = new THREE.Mesh(footPadGeo, brassMat);
        footPad.position.set(xPos, -0.018, zPos);
        this.railGroup.add(footPad);
      });
    });

    // 4. 正面深海蓝底白字高对比激光蚀刻毫米/厘米标尺 (0 ~ 100 cm，与银铝床身形成鲜明科研级对比)
    this.railScaleCanvas = safeCanvas(2048, 128);
    if (this.railScaleCanvas) {
      const ctx = this.railScaleCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 2048, 128);

        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, 0, 2048, 4);
        ctx.fillRect(0, 124, 2048, 4);

        ctx.strokeStyle = '#f8fafc';
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 32px -apple-system, "SF Mono", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const scaleStartX = 60;
        const scaleEndX = 1920;
        const scaleSpan = scaleEndX - scaleStartX;

        for (let cm = 0; cm <= 100; cm++) {
          const pxCm = scaleStartX + (cm / 100) * scaleSpan;

          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(pxCm, 4);
          ctx.lineTo(pxCm, 48);
          ctx.stroke();

          if (cm % 10 === 0) {
            ctx.fillText(`${cm}`, pxCm, 58);
          }

          if (cm < 100) {
            for (let mm = 1; mm < 10; mm++) {
              const pxMm = pxCm + (mm / 10) * (scaleSpan / 100);
              const is5 = mm === 5;
              ctx.lineWidth = is5 ? 2.0 : 1.2;
              ctx.beginPath();
              ctx.moveTo(pxMm, 4);
              ctx.lineTo(pxMm, is5 ? 32 : 18);
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 30px "SF Mono", sans-serif';
        ctx.fillText('cm', scaleEndX + 56, 58);
      }

      this.railScaleTexture = new THREE.CanvasTexture(this.railScaleCanvas);
      this.railScaleTexture.anisotropy = 8;

      const scalePlateGeo = new THREE.PlaneGeometry(this.railLength * 0.96, this.railHeight * 0.64);
      const scalePlateMat = new THREE.MeshStandardMaterial({
        map: this.railScaleTexture,
        roughness: 0.30,
        metalness: 0.15,
      });
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.502);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 圆筒形氦氖/固体相干激光谐振腔管与双环 CNC 万向调心支架 (第 1 组滑鞍) ====================
  private buildLaserModule(): void {
    const saddleData = this.createSliderSaddle(this.laserX, 'LaserSliderSaddle', 0.088);
    this.laserGroup = saddleData.saddleGroup;
    this.laserGroup.name = 'LaserGroup';

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.24,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.42,
      roughness: 0.26,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.08,
    });

    // 1. 双环调心架底部U型承载横梁平台 (长 0.136m, 高 0.014m, 宽 0.068m)
    const cradleW = 0.136;
    const cradleGeo = createChamferedBlockGeometry(cradleW, 0.014, 0.068, 0.0015);
    const cradle = new THREE.Mesh(cradleGeo, titaniumSlateMat);
    cradle.position.set(-0.008, this.beamHeightY - 0.044, 0);
    cradle.castShadow = true;
    this.laserGroup.add(cradle);

    // 2. 前后两座 CNC 精铣八角万向调心圆环架 + 6 枚 120° 径向香槟金调心顶丝
    const ringXPositions = [-0.048, 0.028];
    ringXPositions.forEach((rx) => {
      // 调心环立柱支座
      const pillarGeo = createChamferedBlockGeometry(0.012, 0.020, 0.028, 0.001);
      const pillar = new THREE.Mesh(pillarGeo, satinSilverMat);
      pillar.position.set(rx, this.beamHeightY - 0.032, 0);
      this.laserGroup.add(pillar);

      // CNC 精密调心外圆环
      const ringGeo = new THREE.TorusGeometry(0.031, 0.0045, 16, 36);
      ringGeo.rotateY(Math.PI / 2);
      const ringMesh = new THREE.Mesh(ringGeo, titaniumSlateMat);
      ringMesh.position.set(rx, this.beamHeightY, 0);
      ringMesh.castShadow = true;
      this.laserGroup.add(ringMesh);

      // 3 枚 120° 均布径向香槟金滚花调心顶丝螺钉
      const angles = [Math.PI * 0.5, Math.PI * (0.5 + 2 / 3), Math.PI * (0.5 + 4 / 3)];
      angles.forEach((ang) => {
        const yOff = Math.sin(ang);
        const zOff = Math.cos(ang);
        const screwGroup = new THREE.Group();
        screwGroup.position.set(rx, this.beamHeightY + yOff * 0.033, zOff * 0.033);
        screwGroup.rotation.x = Math.atan2(zOff, yOff);

        const shaftGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.014, 12);
        const shaft = new THREE.Mesh(shaftGeo, chromeRodMat);
        screwGroup.add(shaft);

        const headGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.006, 18);
        const head = new THREE.Mesh(headGeo, brassMat);
        head.position.set(0, 0.008, 0);
        screwGroup.add(head);

        this.laserGroup.add(screwGroup);
      });
    });

    // 3. 中央圆筒形氦氖/固体相干激光谐振腔管体 (长 0.148m，外径 42mm，航天级喷砂银铝主筒)
    const barrelLen = 0.148;
    const barrelRadius = 0.021;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLen, 36);
    barrelGeo.rotateZ(Math.PI / 2);
    const laserBarrel = new THREE.Mesh(barrelGeo, satinSilverMat);
    laserBarrel.position.set(-0.010, this.beamHeightY, 0);
    laserBarrel.castShadow = true;
    this.laserGroup.add(laserBarrel);

    // 管体后段 8 道精密 CNC 环形散热鳍片 (深空钛灰与银铝交替)
    for (let i = 0; i < 8; i++) {
      const finGeo = new THREE.CylinderGeometry(barrelRadius + 0.0028, barrelRadius + 0.0028, 0.0032, 36);
      finGeo.rotateZ(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, titaniumSlateMat);
      fin.position.set(-0.068 + i * 0.0068, this.beamHeightY, 0);
      this.laserGroup.add(fin);
    }

    // 管体中段香槟金激光安全铭牌环
    const bandGeo = new THREE.CylinderGeometry(barrelRadius + 0.0008, barrelRadius + 0.0008, 0.018, 36);
    bandGeo.rotateZ(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, brassMat);
    band.position.set(-0.002, this.beamHeightY, 0);
    this.laserGroup.add(band);

    // 4. 前置多阶扩束准直光学物镜筒与香槟金出光压圈 (+X 端)
    const nozzleGeo = new THREE.CylinderGeometry(0.017, 0.020, 0.018, 32);
    nozzleGeo.rotateZ(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, titaniumSlateMat);
    nozzle.position.set(barrelLen * 0.5 - 0.004, this.beamHeightY, 0);
    this.laserGroup.add(nozzle);

    const brassRingGeo = new THREE.TorusGeometry(0.0155, 0.0030, 16, 32);
    brassRingGeo.rotateY(Math.PI / 2);
    const brassRing = new THREE.Mesh(brassRingGeo, brassMat);
    brassRing.position.set(barrelLen * 0.5 + 0.005, this.beamHeightY, 0);
    this.laserGroup.add(brassRing);

    const lensGeo = new THREE.CircleGeometry(0.0135, 32);
    lensGeo.rotateY(Math.PI / 2);
    const colorRGB = this.getActiveBeamColor();
    const lensMat = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.98 : 0.20,
    });
    this.laserLedMesh = new THREE.Mesh(lensGeo, lensMat);
    this.laserLedMesh.position.set(barrelLen * 0.5 + 0.006, this.beamHeightY, 0);
    this.laserGroup.add(this.laserLedMesh);

    // 5. 尾部香槟金航空高压锁紧接头与悬垂柔性同轴电源线
    const rearCapGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.012, 24);
    rearCapGeo.rotateZ(Math.PI / 2);
    const rearCap = new THREE.Mesh(rearCapGeo, brassMat);
    rearCap.position.set(-barrelLen * 0.5 - 0.014, this.beamHeightY, 0);
    this.laserGroup.add(rearCap);

    const bootGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.018, 16);
    bootGeo.rotateZ(Math.PI / 2);
    const boot = new THREE.Mesh(bootGeo, cableMat);
    boot.position.set(-barrelLen * 0.5 - 0.026, this.beamHeightY, 0);
    this.laserGroup.add(boot);

    const cableCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-barrelLen * 0.5 - 0.034, this.beamHeightY, 0),
      new THREE.Vector3(-barrelLen * 0.5 - 0.080, this.beamHeightY - 0.030, -0.020),
      new THREE.Vector3(-barrelLen * 0.5 - 0.115, this.beamHeightY - 0.110, -0.040),
      new THREE.Vector3(-barrelLen * 0.5 - 0.145, 0.020, -0.065)
    );
    const cableGeo = new THREE.TubeGeometry(cableCurve, 24, 0.0035, 12, false);
    const cable = new THREE.Mesh(cableGeo, cableMat);
    this.laserGroup.add(cable);

    // 6. 正面 (+Z) 人体工学倾斜式波长与电源控制面板 (正对操作者视线，一目了然)
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(-0.008, this.beamHeightY - 0.040, 0.042);
    consoleGroup.rotation.x = 0.42; // 面向操作者倾斜 24°
    this.laserGroup.add(consoleGroup);

    const panelGeo = createChamferedBlockGeometry(0.116, 0.008, 0.028, 0.0012);
    const panelMesh = new THREE.Mesh(panelGeo, titaniumSlateMat);
    consoleGroup.add(panelMesh);

    // 左侧机械红色翘板电源开关
    const switchBaseGeo = createChamferedBlockGeometry(0.020, 0.005, 0.014, 0.0006);
    const switchBase = new THREE.Mesh(switchBaseGeo, satinSilverMat);
    switchBase.position.set(-0.038, 0.005, 0);
    consoleGroup.add(switchBase);

    const switchRockerGeo = createChamferedBlockGeometry(0.014, 0.006, 0.010, 0.0006);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.35,
      roughness: 0.25,
    });
    this.laserSwitchMesh = new THREE.Mesh(switchRockerGeo, switchMat);
    this.laserSwitchMesh.name = 'LaserPowerSwitch';
    this.laserSwitchMesh.userData = { interactiveId: 'laser_power' };
    this.laserSwitchMesh.position.set(-0.038, 0.008, 0);
    this.laserSwitchMesh.rotation.z = this.laserPower ? -0.25 : 0.25;
    consoleGroup.add(this.laserSwitchMesh);

    // 中部 3 枚单色相干波长切换键 (650nm 红、532nm 绿、405nm 蓝紫，沿 X 轴横向排布正对操作者)
    const wavelengths = [650, 532, 405];
    wavelengths.forEach((wl, idx) => {
      const btnGeo = new THREE.CylinderGeometry(0.0052, 0.0058, 0.006, 20);
      const isCurrent = this.lightSourceMode === 'monochromatic' && Math.round(this.wavelengthNm) === wl;
      const btnColor = OpticalPhysics.wavelengthToColor(wl);
      const btnMat = new THREE.MeshStandardMaterial({
        color: isCurrent ? btnColor : 0x94a3b8,
        emissive: isCurrent ? btnColor : 0x000000,
        emissiveIntensity: isCurrent ? 0.65 : 0,
        metalness: 0.65,
        roughness: 0.22,
      });
      const btnMesh = new THREE.Mesh(btnGeo, btnMat);
      btnMesh.name = `LaserWlButton_${wl}`;
      btnMesh.userData = { interactiveId: `laser_wavelength_${wl}`, wavelength: wl };
      btnMesh.position.set(-0.010 + idx * 0.018, 0.006, 0);
      consoleGroup.add(btnMesh);
      this.wlButtons[wl] = btnMesh;
    });

    // 右侧复合白光模式精密轻触键 (带香槟金底座环与暖白发光顶面)
    const whiteRimGeo = new THREE.CylinderGeometry(0.0068, 0.0072, 0.004, 24);
    const whiteRim = new THREE.Mesh(whiteRimGeo, brassMat);
    whiteRim.position.set(0.044, 0.005, 0);
    whiteRim.userData = { interactiveId: 'laser_white_light' };
    consoleGroup.add(whiteRim);

    const whiteBtnGeo = new THREE.CylinderGeometry(0.0052, 0.0054, 0.0065, 24);
    const isWhite = this.lightSourceMode === 'white';
    const whiteBtnMat = new THREE.MeshStandardMaterial({
      color: isWhite ? 0xfffbeb : 0xcbd5e1,
      emissive: isWhite ? 0xfef3c7 : 0x000000,
      emissiveIntensity: isWhite ? 0.75 : 0,
      metalness: 0.50,
      roughness: 0.20,
    });
    this.whiteLightBtnMesh = new THREE.Mesh(whiteBtnGeo, whiteBtnMat);
    this.whiteLightBtnMesh.name = 'LaserWhiteLightButton';
    this.whiteLightBtnMesh.userData = { interactiveId: 'laser_white_light' };
    this.whiteLightBtnMesh.position.set(0.044, 0.0065, 0);
    consoleGroup.add(this.whiteLightBtnMesh);

    this.group.add(this.laserGroup);
  }

  // ==================== C. Thorlabs 级圆形 360° 分度万向杨氏双缝调节架 (第 2 组滑鞍) ====================
  private buildDoubleSlitStage(): void {
    const saddleData = this.createSliderSaddle(this.slitX, 'DoubleSlitSliderSaddle', 0.082);
    this.slitStageGroup = saddleData.saddleGroup;
    this.slitStageGroup.name = 'AdjustableDoubleSlitStage';
    this.turretGroup = this.slitStageGroup;

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.24,
      roughness: 0.42,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.35,
      roughness: 0.24,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.42,
      roughness: 0.26,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.72,
      roughness: 0.14,
    });

    // 1. 底部半圆形U型托架支座 (与光の衍射八角板截然不同的精密圆形万向光学镜架造型)
    const yokeBaseGeo = createChamferedBlockGeometry(0.016, 0.014, 0.056, 0.0012);
    const yokeBase = new THREE.Mesh(yokeBaseGeo, titaniumSlateMat);
    yokeBase.position.set(0, this.beamHeightY - 0.052, 0);
    this.slitStageGroup.add(yokeBase);

    // 2. 航天银铝圆形万向主外环 (外径 92mm，内径 68mm)
    const outerRingRadius = 0.046;
    const outerRingGeo = new THREE.CylinderGeometry(outerRingRadius, outerRingRadius, 0.012, 48);
    outerRingGeo.rotateZ(Math.PI / 2);
    const outerRing = new THREE.Mesh(outerRingGeo, satinSilverMat);
    outerRing.position.set(0, this.beamHeightY, 0);
    outerRing.castShadow = true;
    this.slitStageGroup.add(outerRing);

    // 外环侧面 360° 精密分度圆环刻线贴图与深空蓝内衬盘
    this.gimbalDialCanvas = safeCanvas(512, 512);
    if (this.gimbalDialCanvas) {
      const ctx = this.gimbalDialCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(256, 256, 250, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(256, 256, 242, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#e2e8f0';
        for (let deg = 0; deg < 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const rOuter = 238;
          const rInner = deg % 30 === 0 ? 206 : deg % 10 === 0 ? 218 : 228;
          ctx.lineWidth = deg % 30 === 0 ? 3.0 : 1.5;
          ctx.beginPath();
          ctx.moveTo(256 + Math.cos(rad) * rInner, 256 + Math.sin(rad) * rInner);
          ctx.lineTo(256 + Math.cos(rad) * rOuter, 256 + Math.sin(rad) * rOuter);
          ctx.stroke();
        }
      }
      this.gimbalDialTexture = new THREE.CanvasTexture(this.gimbalDialCanvas);
      const dialGeo = new THREE.CircleGeometry(outerRingRadius - 0.003, 48);
      dialGeo.rotateY(Math.PI / 2);
      const dialMat = new THREE.MeshBasicMaterial({
        map: this.gimbalDialTexture,
        side: THREE.DoubleSide,
      });
      const dialFront = new THREE.Mesh(dialGeo, dialMat);
      dialFront.position.set(0.0062, this.beamHeightY, 0);
      this.slitStageGroup.add(dialFront);

      const dialBack = new THREE.Mesh(dialGeo, dialMat);
      dialBack.position.set(-0.0062, this.beamHeightY, 0);
      this.slitStageGroup.add(dialBack);
    }

    // 中心香槟金光学压圈
    const innerBezelGeo = new THREE.TorusGeometry(0.030, 0.0022, 16, 40);
    innerBezelGeo.rotateY(Math.PI / 2);
    const innerBezel = new THREE.Mesh(innerBezelGeo, brassMat);
    innerBezel.position.set(0.0065, this.beamHeightY, 0);
    this.slitStageGroup.add(innerBezel);

    // 顶部精细锁紧香槟金滚花旋钮
    const topLockGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 24);
    const topLock = new THREE.Mesh(topLockGeo, brassMat);
    topLock.position.set(0, this.beamHeightY + outerRingRadius + 0.007, 0);
    this.slitStageGroup.add(topLock);

    // 3. 左侧：四档校准双缝快速转换转轮 (turretWheel: 16道铣切防滑槽、液态铬轴盖、激光蚀刻象限分度与弹簧卡珠)
    this.turretWheel = new THREE.Group();
    this.turretWheel.name = 'SlitTurretWheel';
    this.turretWheel.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.position.set(0, this.beamHeightY - 0.026, -outerRingRadius - 0.012);
    this.turretWheel.rotation.x = this.currentTurretAngle;

    const wheelGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.013, 32);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMesh = new THREE.Mesh(wheelGeo, brassMat);
    wheelMesh.name = 'SlitTurretWheelMesh';
    wheelMesh.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.add(wheelMesh);

    for (let f = 0; f < 16; f++) {
      const fAngle = (f / 16) * Math.PI * 2;
      const fluteGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.0132, 8);
      fluteGeo.rotateX(Math.PI / 2);
      const flute = new THREE.Mesh(fluteGeo, brassMat);
      flute.position.set(Math.cos(fAngle) * 0.0138, Math.sin(fAngle) * 0.0138, 0);
      flute.userData = { interactiveId: 'slit_turret' };
      this.turretWheel.add(flute);
    }

    const wheelCapGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.015, 24);
    wheelCapGeo.rotateX(Math.PI / 2);
    const wheelCap = new THREE.Mesh(wheelCapGeo, chromeRodMat);
    wheelCap.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.add(wheelCap);

    // 4个象限双缝校准刻线 (I, II, III, IV 档位)
    const quadrantOffsets = [
      { angle: 0, count: 1 },             // 0°:   d = 0.15 mm (宽距明显条纹)
      { angle: Math.PI * 0.5, count: 2 }, // 90°:  d = 0.25 mm (标准杨氏双缝)
      { angle: Math.PI, count: 3 },       // 180°: d = 0.40 mm (密距高阶条纹)
      { angle: Math.PI * 1.5, count: 4 }, // 270°: d = 0.55 mm (超精密微距双缝)
    ];
    quadrantOffsets.forEach(({ angle, count }) => {
      for (let i = 0; i < count; i++) {
        const tickGeo = new THREE.BoxGeometry(0.0006, 0.0035, 0.0004);
        const tick = new THREE.Mesh(tickGeo, titaniumSlateMat);
        const offset = (i - (count - 1) * 0.5) * 0.0015;
        tick.position.set(Math.cos(angle) * 0.0095 + offset, Math.sin(angle) * 0.0095, 0.0068);
        this.turretWheel.add(tick);
      }
    });

    this.slitStageGroup.add(this.turretWheel);

    // 转换轮顶部机械弹簧钢珠定位销
    const detentPinGeo = new THREE.SphereGeometry(0.0028, 16, 16);
    const detentPin = new THREE.Mesh(detentPinGeo, chromeRodMat);
    detentPin.position.set(0, this.beamHeightY - 0.026 + 0.0145, -outerRingRadius - 0.012);
    this.slitStageGroup.add(detentPin);

    // 转换轮原生 3D 悬浮提示引导光晕环
    const turretCueGeo = new THREE.TorusGeometry(0.0175, 0.0006, 16, 48, Math.PI * 1.6);
    turretCueGeo.rotateX(Math.PI / 2);
    const turretCueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    });
    this.turretHoverCue = new THREE.Mesh(turretCueGeo, turretCueMat);
    this.turretHoverCue.name = 'TurretHoverCue';
    this.turretHoverCue.position.set(0, this.beamHeightY - 0.026, -outerRingRadius - 0.012);
    this.turretHoverCue.visible = false;
    this.slitStageGroup.add(this.turretHoverCue);

    // 4. 中心精密杨氏双缝微米刀口与双相干透光狭缝 (S1 & S2 + 中央钛合金隔桥 + 左右外侧研磨刀口)
    const jawHeight = 0.038;
    const jawThickX = 0.014;
    const jawDepthZ = 0.012;
    const jawGeo = createChamferedBlockGeometry(jawThickX, jawHeight, jawDepthZ, 0.0004);

    this.leftJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.leftJawMesh.name = 'SlitLeftJaw';
    this.leftJawMesh.position.set(0, this.beamHeightY, -0.010);
    this.slitStageGroup.add(this.leftJawMesh);

    this.rightJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.rightJawMesh.name = 'SlitRightJaw';
    this.rightJawMesh.position.set(0, this.beamHeightY, 0.010);
    this.slitStageGroup.add(this.rightJawMesh);

    // 中央微米双缝分隔钛桥 (分隔左狭缝 S1 与右狭缝 S2)
    const bridgeGeo = new THREE.BoxGeometry(jawThickX * 1.04, jawHeight, 0.0020);
    this.centerBridgeMesh = new THREE.Mesh(bridgeGeo, titaniumMat);
    this.centerBridgeMesh.name = 'DoubleSlitCenterBridge';
    this.centerBridgeMesh.position.set(0, this.beamHeightY, 0);
    this.slitStageGroup.add(this.centerBridgeMesh);

    // 双狭缝 S1 与 S2 透光发光线元 (清晰再现两条平行相干线光源)
    const slitLightGeo = new THREE.BoxGeometry(0.015, 0.036, 0.0012);
    const activeColor = this.getActiveBeamColor();
    const slitLightMat = new THREE.MeshBasicMaterial({
      color: activeColor,
    });
    this.leftSlitLightMesh = new THREE.Mesh(slitLightGeo, slitLightMat);
    this.leftSlitLightMesh.name = 'LeftSlitLightS1';
    this.leftSlitLightMesh.position.set(0, this.beamHeightY, -0.0022);
    this.slitStageGroup.add(this.leftSlitLightMesh);

    this.rightSlitLightMesh = new THREE.Mesh(slitLightGeo, slitLightMat);
    this.rightSlitLightMesh.name = 'RightSlitLightS2';
    this.rightSlitLightMesh.position.set(0, this.beamHeightY, 0.0022);
    this.slitStageGroup.add(this.rightSlitLightMesh);

    // 5. 右侧：Mitutoyo/Thorlabs 精密差动测微螺杆鼓轮总成 (调节双缝间距 d)
    this.micrometerThimbleGroup = new THREE.Group();
    this.micrometerThimbleGroup.name = 'MicrometerThimbleGroup';
    this.micrometerThimbleGroup.position.set(0, this.beamHeightY - 0.026, outerRingRadius + 0.002);

    // a. 固定套筒 (Fixed Vernier Barrel Sleeve)
    const sleeveGeo = new THREE.CylinderGeometry(0.0076, 0.0076, 0.015, 32);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, chromeRodMat);
    sleeveMesh.position.set(0, 0, 0.0075);
    sleeveMesh.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(sleeveMesh);

    // 套筒根部香槟金六角锁紧螺母
    const locknutGeo = new THREE.CylinderGeometry(0.0092, 0.0092, 0.0035, 6);
    locknutGeo.rotateX(Math.PI / 2);
    const locknut = new THREE.Mesh(locknutGeo, brassMat);
    locknut.position.set(0, 0, 0.0018);
    locknut.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(locknut);

    // 套筒基准读数水平基线与毫米分度刻线
    const datumGeo = new THREE.BoxGeometry(0.0006, 0.0004, 0.012);
    const datumMesh = new THREE.Mesh(datumGeo, titaniumSlateMat);
    datumMesh.position.set(0, 0.0077, 0.008);
    datumMesh.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(datumMesh);

    for (let i = 0; i <= 5; i++) {
      const tickGeo = new THREE.BoxGeometry(0.0028, 0.0004, 0.0005);
      const tick = new THREE.Mesh(tickGeo, titaniumSlateMat);
      tick.position.set(0, 0.0077, 0.003 + i * 0.002);
      tick.userData = { interactiveId: 'slit_micrometer' };
      this.micrometerThimbleGroup.add(tick);
    }

    // b. 可旋转精密测微微分筒 (Rotating Thimble Knob Assembly)
    const knobGeo = new THREE.CylinderGeometry(0.0092, 0.0092, 0.016, 32);
    knobGeo.rotateX(Math.PI / 2);
    this.micrometerKnob = new THREE.Mesh(knobGeo, brassMat);
    this.micrometerKnob.name = 'SlitMicrometerKnob';
    this.micrometerKnob.position.set(0, 0, 0.018);
    this.micrometerKnob.userData = { interactiveId: 'slit_micrometer' };

    // 读数端 45° 精密倒角游标环
    const bevelGeo = new THREE.CylinderGeometry(0.0078, 0.0092, 0.004, 32);
    bevelGeo.rotateX(Math.PI / 2);
    const bevelCollar = new THREE.Mesh(bevelGeo, chromeRodMat);
    bevelCollar.position.set(0, 0, -0.010);
    bevelCollar.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(bevelCollar);

    for (let i = 0; i < 8; i++) {
      const vAngle = (i / 8) * Math.PI * 2;
      const vTickGeo = new THREE.BoxGeometry(0.0005, 0.0018, 0.0035);
      const vTick = new THREE.Mesh(vTickGeo, titaniumSlateMat);
      vTick.position.set(Math.cos(vAngle) * 0.0084, Math.sin(vAngle) * 0.0084, -0.010);
      vTick.rotation.z = vAngle;
      vTick.userData = { interactiveId: 'slit_micrometer' };
      bevelCollar.add(vTick);
    }

    for (let i = 0; i < 24; i++) {
      const kAngle = (i / 24) * Math.PI * 2;
      const ribGeo = new THREE.BoxGeometry(0.0006, 0.0006, 0.015);
      const rib = new THREE.Mesh(ribGeo, brassMat);
      rib.position.set(Math.cos(kAngle) * 0.0093, Math.sin(kAngle) * 0.0093, 0);
      rib.rotation.z = kAngle;
      rib.userData = { interactiveId: 'slit_micrometer' };
      this.micrometerKnob.add(rib);
    }

    const rimFrontGeo = new THREE.CylinderGeometry(0.0093, 0.0093, 0.001, 32);
    rimFrontGeo.rotateX(Math.PI / 2);
    const rimFront = new THREE.Mesh(rimFrontGeo, chromeRodMat);
    rimFront.position.set(0, 0, -0.0076);
    rimFront.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(rimFront);

    const rimBackGeo = new THREE.CylinderGeometry(0.0093, 0.0093, 0.001, 32);
    rimBackGeo.rotateX(Math.PI / 2);
    const rimBack = new THREE.Mesh(rimBackGeo, chromeRodMat);
    rimBack.position.set(0, 0, 0.0076);
    rimBack.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(rimBack);

    const neckGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 24);
    neckGeo.rotateX(Math.PI / 2);
    const neckMesh = new THREE.Mesh(neckGeo, chromeRodMat);
    neckMesh.position.set(0, 0, 0.010);
    neckMesh.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(neckMesh);

    const ratchetGeo = new THREE.CylinderGeometry(0.0062, 0.0062, 0.008, 24);
    ratchetGeo.rotateX(Math.PI / 2);
    const ratchetKnob = new THREE.Mesh(ratchetGeo, brassMat);
    ratchetKnob.position.set(0, 0, 0.015);
    ratchetKnob.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(ratchetKnob);

    for (let i = 0; i < 12; i++) {
      const rAngle = (i / 12) * Math.PI * 2;
      const rToothGeo = new THREE.BoxGeometry(0.0005, 0.0005, 0.0078);
      const rTooth = new THREE.Mesh(rToothGeo, brassMat);
      rTooth.position.set(Math.cos(rAngle) * 0.0063, Math.sin(rAngle) * 0.0063, 0.015);
      rTooth.rotation.z = rAngle;
      rTooth.userData = { interactiveId: 'slit_micrometer' };
      this.micrometerKnob.add(rTooth);
    }

    const dimpleGeo = new THREE.SphereGeometry(0.0020, 16, 16);
    const dimple = new THREE.Mesh(dimpleGeo, titaniumSlateMat);
    dimple.position.set(0, 0, 0.019);
    dimple.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(dimple);

    this.micrometerThimbleGroup.add(this.micrometerKnob);

    // c. 测微鼓轮 3D 原生悬浮提示引导光晕环
    const micrometerCueGeo = new THREE.TorusGeometry(0.0122, 0.0006, 16, 48, Math.PI * 1.6);
    micrometerCueGeo.rotateX(Math.PI / 2);
    const micrometerCueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    });
    this.micrometerHoverCue = new THREE.Mesh(micrometerCueGeo, micrometerCueMat);
    this.micrometerHoverCue.name = 'MicrometerHoverCue';
    this.micrometerHoverCue.position.set(0, 0, 0.018);
    this.micrometerHoverCue.visible = false;
    this.micrometerThimbleGroup.add(this.micrometerHoverCue);

    this.slitStageGroup.add(this.micrometerThimbleGroup);

    // 6. 双缝间距纯文字 3D 浮空显示 (大字号、深色高对比度、绝不截断、无背景框)
    this.slitPlateCanvas = safeCanvas(1024, 256);
    if (this.slitPlateCanvas) {
      this.slitPlateTexture = new THREE.CanvasTexture(this.slitPlateCanvas);
      this.slitPlateTexture.minFilter = THREE.LinearFilter;
      this.slitPlateTexture.magFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: this.slitPlateTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.slitPlateMesh = new THREE.Sprite(spriteMat);
      this.slitPlateMesh.name = 'SlitValueLabel';
      this.slitPlateMesh.scale.set(0.20, 0.050, 1.0);
      this.slitPlateMesh.renderOrder = 30;
      this.slitPlateMesh.raycast = () => {};
      this.slitPlateMesh.position.set(0, this.beamHeightY + outerRingRadius + 0.036, 0);
      this.slitStageGroup.add(this.slitPlateMesh);
      this.updateSlitPlateLabel();
    } else {
      const dummyMat = new THREE.SpriteMaterial();
      this.slitPlateMesh = new THREE.Sprite(dummyMat);
      this.slitPlateMesh.raycast = () => {};
    }

    this.group.add(this.slitStageGroup);
  }

  // ==================== D. 大口径圆形杨氏双缝干涉测微观察头与丝杠游标卡尺总成 (第 3 组滑鞍) ====================
  private buildObservationScreen(): void {
    const saddleData = this.createSliderSaddle(this.maxScreenX, 'ScreenCarrierGroup', 0.036);
    this.screenCarrierGroup = saddleData.saddleGroup;
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';
    this.screenCarrierGroup.userData = { interactiveId: 'screen_handle' };

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.38,
      roughness: 0.25,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.26,
      roughness: 0.40,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.42,
      roughness: 0.26,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.75,
      roughness: 0.14,
    });

    // 1. 圆形干涉观察头总成 (正对操作者视界，微偏转迎向左侧入射相干光锥)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamHeightY + 0.012, 0);
    this.screenPanelGroup.rotation.y = -0.24;

    const outerRadius = 0.114; // 228mm 大口径圆形干涉观察视窗
    const innerRadius = 0.098; // 196mm 核心深海蓝宝石干涉成像孔径
    const housingDepth = 0.016;

    // 2. 航天级阳极氧化喷砂银铝大口径圆形观察头主壳体 (彻底区别于衍射实验的矩形平板屏)
    const boardGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, housingDepth, 64);
    boardGeo.rotateX(Math.PI / 2);
    const screenBoard = new THREE.Mesh(boardGeo, satinSilverMat);
    screenBoard.castShadow = true;
    screenBoard.name = 'ScreenBoardMesh';
    screenBoard.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(screenBoard);

    // 外圈深空钛晶灰蓝防杂散光环形遮光罩檐 (Circular Optical Hood Visor)
    const hoodRingGeo = new THREE.TorusGeometry(outerRadius - 0.004, 0.0065, 20, 64);
    const hoodRing = new THREE.Mesh(hoodRingGeo, titaniumSlateMat);
    hoodRing.position.set(0, 0, housingDepth * 0.5 + 0.003);
    hoodRing.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(hoodRing);

    // 内圈香槟金精密光学压圈 (Champagne Brass Aperture Retaining Ring)
    const brassRetainerGeo = new THREE.TorusGeometry(innerRadius + 0.002, 0.0032, 16, 64);
    const brassRetainer = new THREE.Mesh(brassRetainerGeo, brassMat);
    brassRetainer.position.set(0, 0, housingDepth * 0.5 + 0.002);
    brassRetainer.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(brassRetainer);

    // 外周 4 枚 45° 对称 CNC 装配耳座与镜面铬内六角螺栓
    const lugAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    lugAngles.forEach((ang) => {
      const lx = Math.cos(ang) * (outerRadius + 0.004);
      const ly = Math.sin(ang) * (outerRadius + 0.004);
      const lugGeo = new THREE.CylinderGeometry(0.008, 0.008, housingDepth * 0.85, 20);
      lugGeo.rotateX(Math.PI / 2);
      const lug = new THREE.Mesh(lugGeo, satinSilverMat);
      lug.position.set(lx, ly, 0);
      lug.userData = { interactiveId: 'screen_handle' };
      this.screenPanelGroup.add(lug);

      const boltGeo = new THREE.CylinderGeometry(0.0038, 0.0038, housingDepth + 0.003, 6);
      boltGeo.rotateX(Math.PI / 2);
      const bolt = new THREE.Mesh(boltGeo, chromeMat);
      bolt.position.set(lx, ly, 0.001);
      this.screenPanelGroup.add(bolt);
    });

    // 底部立柱颈部连接座与香槟金锁紧手轮
    const neckY = -outerRadius - 0.010;
    const mountGeo = createChamferedBlockGeometry(0.038, 0.022, 0.022, 0.0014);
    const mountMesh = new THREE.Mesh(mountGeo, titaniumSlateMat);
    mountMesh.position.set(0, neckY, 0);
    this.screenPanelGroup.add(mountMesh);

    const mountKnobGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.010, 18);
    mountKnobGeo.rotateZ(Math.PI / 2);
    const mountKnob = new THREE.Mesh(mountKnobGeo, brassMat);
    mountKnob.position.set(0.023, neckY, 0);
    this.screenPanelGroup.add(mountKnob);

    // 3. 圆形视窗下方横向精密丝杠测微滑轨、右侧测量头微分鼓轮与三针联动条纹间距游标卡尺
    const caliperBarY = -outerRadius + 0.006;
    const caliperBarW = 0.220;
    const rulerHousingGeo = createChamferedBlockGeometry(caliperBarW, 0.020, 0.016, 0.0012);
    const rulerHousing = new THREE.Mesh(rulerHousingGeo, titaniumSlateMat);
    rulerHousing.position.set(0, caliperBarY, housingDepth * 0.5 + 0.006);
    rulerHousing.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(rulerHousing);

    // 贯通横向镜面液态铬精密测微丝杠
    const leadScrewGeo = new THREE.CylinderGeometry(0.0024, 0.0024, caliperBarW + 0.020, 20);
    leadScrewGeo.rotateZ(Math.PI / 2);
    const leadScrew = new THREE.Mesh(leadScrewGeo, chromeMat);
    leadScrew.position.set(0, caliperBarY - 0.003, housingDepth * 0.5 + 0.015);
    this.screenPanelGroup.add(leadScrew);

    // 右端测量头香槟金滚花微分手轮 (随条纹间距同步旋转)
    const handwheelGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.018, 28);
    handwheelGeo.rotateZ(Math.PI / 2);
    this.caliperHandwheelMesh = new THREE.Mesh(handwheelGeo, brassMat);
    this.caliperHandwheelMesh.position.set(caliperBarW * 0.5 + 0.012, caliperBarY, housingDepth * 0.5 + 0.009);
    this.caliperHandwheelMesh.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(this.caliperHandwheelMesh);

    // 微分手轮液态铬倒角读数环
    const hwCollarGeo = new THREE.CylinderGeometry(0.0082, 0.010, 0.005, 28);
    hwCollarGeo.rotateZ(Math.PI / 2);
    const hwCollar = new THREE.Mesh(hwCollarGeo, chromeMat);
    hwCollar.position.set(-0.010, 0, 0);
    this.caliperHandwheelMesh.add(hwCollar);

    this.bezelScaleCanvas = safeCanvas(1024, 64);
    if (this.bezelScaleCanvas) {
      const ctx = this.bezelScaleCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 1024, 64);
        ctx.strokeStyle = '#0f172a';
        ctx.fillStyle = '#0f172a';
        ctx.lineWidth = 2.2;
        const centerPx = 512;
        const pxPerMm = 512 / 30;
        for (let mm = -25; mm <= 25; mm++) {
          const x = centerPx + mm * pxPerMm;
          const is10 = mm % 10 === 0;
          const is5 = mm % 5 === 0;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, is10 ? 36 : is5 ? 24 : 14);
          ctx.stroke();
        }
      }
      this.bezelScaleTexture = new THREE.CanvasTexture(this.bezelScaleCanvas);
      const scalePlaneGeo = new THREE.PlaneGeometry(caliperBarW - 0.012, 0.009);
      const scalePlaneMat = new THREE.MeshBasicMaterial({ map: this.bezelScaleTexture });
      const scalePlane = new THREE.Mesh(scalePlaneGeo, scalePlaneMat);
      scalePlane.position.set(0, caliperBarY + 0.003, housingDepth * 0.5 + 0.0145);
      scalePlane.userData = { interactiveId: 'screen_handle' };
      this.screenPanelGroup.add(scalePlane);
    }

    // 中央 k=0 基准银色游标针与左右 k=±1 香槟金游标测微针
    const needleGeo = new THREE.ConeGeometry(0.0026, 0.012, 12);
    this.centerCaliperMesh = new THREE.Mesh(needleGeo, chromeMat);
    this.centerCaliperMesh.name = 'CenterCaliperPointer';
    this.centerCaliperMesh.position.set(0, caliperBarY + 0.014, housingDepth * 0.5 + 0.012);
    this.screenPanelGroup.add(this.centerCaliperMesh);

    this.leftOrder1CaliperMesh = new THREE.Mesh(needleGeo, brassMat);
    this.leftOrder1CaliperMesh.name = 'LeftOrder1CaliperPointer';
    this.leftOrder1CaliperMesh.position.set(-0.015, caliperBarY + 0.014, housingDepth * 0.5 + 0.012);
    this.screenPanelGroup.add(this.leftOrder1CaliperMesh);

    this.rightOrder1CaliperMesh = new THREE.Mesh(needleGeo, brassMat);
    this.rightOrder1CaliperMesh.name = 'RightOrder1CaliperPointer';
    this.rightOrder1CaliperMesh.position.set(0.015, caliperBarY + 0.014, housingDepth * 0.5 + 0.012);
    this.screenPanelGroup.add(this.rightOrder1CaliperMesh);

    // 4. 圆形深邃海洋蓝黑核心干涉视窗平面 (1024x1024 高精动态 CanvasTexture，100% 纯物理杨氏等间距干涉条纹)
    this.screenCanvas = safeCanvas(1024, 1024);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.anisotropy = 8;
    }

    const screenSurfaceGeo = new THREE.CircleGeometry(innerRadius, 64);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
    });
    this.screenMesh = new THREE.Mesh(screenSurfaceGeo, screenMat);
    this.screenMesh.name = 'ScreenSurfaceMesh';
    this.screenMesh.userData = { interactiveId: 'screen_surface' };
    this.screenMesh.position.set(0, 0, housingDepth * 0.5 + 0.001);
    this.screenPanelGroup.add(this.screenMesh);

    this.screenCarrierGroup.add(this.screenPanelGroup);
    this.group.add(this.screenCarrierGroup);
  }

  // ==================== E. 3D 真实准直激光与干涉光路 + 前段叠加正弦电磁波列系统 ====================
  private buildOpticalBeams(): void {
    const colorRGB = this.getActiveBeamColor();

    // 采用 NormalBlending 保证在明亮浅灰背景墙下依然呈现鲜艳高饱和度的红/绿/蓝激光色彩，杜绝泛白过曝
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.90 : 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.secondaryBeamMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.26 : 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.waveRibbonMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.85 : 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.waveVectorMaterial = new THREE.LineBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.65 : 0.0,
    });

    this.wavefrontCrestMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.48 : 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 1. 完整保留原本真实的准直激光核心光束与外层丁达尔光晕护套 (激光器 -> 双缝台)
    const startX = this.laserX + 0.072;
    const distPre = Math.abs(this.slitX - startX);
    const preGeo = new THREE.CylinderGeometry(0.0014, 0.0014, distPre, 16);
    preGeo.rotateZ(Math.PI / 2);
    this.preBeamMesh = new THREE.Mesh(preGeo, this.beamMaterial);
    this.preBeamMesh.name = 'CollimatedLaserCoreBeam';
    this.preBeamMesh.position.set((startX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamMesh);

    const preHaloGeo = new THREE.CylinderGeometry(0.0032, 0.0032, distPre, 16);
    preHaloGeo.rotateZ(Math.PI / 2);
    this.preBeamHaloMesh = new THREE.Mesh(preHaloGeo, this.secondaryBeamMaterial);
    this.preBeamHaloMesh.name = 'CollimatedLaserHaloBeam';
    this.preBeamHaloMesh.position.set((startX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamHaloMesh);

    // 2. 在激光器至双缝台这一段，围绕准直激光束叠加 3D 动态行进正弦电磁横波带与电场矢量梳 ("某一段用波的形式表现出来")
    const preSegments = 56;
    const wavePositions = new Float32Array((preSegments + 1) * 2 * 3);
    const waveIndices: number[] = [];
    for (let i = 0; i < preSegments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      waveIndices.push(a, b, c, b, d, c);
    }
    const waveRibbonGeo = new THREE.BufferGeometry();
    waveRibbonGeo.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
    waveRibbonGeo.setIndex(waveIndices);
    this.incidentWaveRibbonMesh = new THREE.Mesh(waveRibbonGeo, this.waveRibbonMaterial);
    this.incidentWaveRibbonMesh.name = 'IncidentSinusoidalWaveRibbon';
    this.group.add(this.incidentWaveRibbonMesh);

    const vectorCount = 32;
    const vecPositions = new Float32Array(vectorCount * 2 * 3);
    const vecGeo = new THREE.BufferGeometry();
    vecGeo.setAttribute('position', new THREE.BufferAttribute(vecPositions, 3));
    this.incidentWaveVectorsMesh = new THREE.LineSegments(vecGeo, this.waveVectorMaterial);
    this.incidentWaveVectorsMesh.name = 'IncidentElectricFieldVectors';
    this.group.add(this.incidentWaveVectorsMesh);

    // 3. 完整保留双缝 S1 与 S2 发出的两束水平相干发散叠加光扇 (惠更斯-菲涅耳次波相干交叠光锥)
    const postGeo1 = new THREE.BufferGeometry();
    postGeo1.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.postBeamMesh = new THREE.Mesh(postGeo1, this.secondaryBeamMaterial);
    this.postBeamMesh.name = 'PrimaryWavefrontFanS1';
    this.group.add(this.postBeamMesh);

    const postGeo2 = new THREE.BufferGeometry();
    postGeo2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.secondaryBeamMesh = new THREE.Mesh(postGeo2, this.secondaryBeamMaterial);
    this.secondaryBeamMesh.name = 'SecondaryWavefrontFanS2';
    this.group.add(this.secondaryBeamMesh);

    // 4. 双缝出口局部同心波阵面相干涟漪环 (S1 & S2，不遮挡后方干涉光线)
    this.wavefrontArcsGroup = new THREE.Group();
    this.wavefrontArcsGroup.name = 'HuygensWavefrontRipplesGroup';
    this.s1WaveRings = [];
    this.s2WaveRings = [];

    const ringCount = 6;
    const unitWaveArcGeo = new THREE.RingGeometry(0.95, 1.0, 40, 1, -Math.PI * 0.34, Math.PI * 0.68);
    for (let i = 0; i < ringCount; i++) {
      const ringS1 = new THREE.Mesh(unitWaveArcGeo, this.wavefrontCrestMaterial);
      ringS1.name = `WavefrontRippleS1_${i}`;
      ringS1.rotation.x = Math.PI * 0.5;
      this.wavefrontArcsGroup.add(ringS1);
      this.s1WaveRings.push(ringS1);

      const ringS2 = new THREE.Mesh(unitWaveArcGeo, this.wavefrontCrestMaterial);
      ringS2.name = `WavefrontRippleS2_${i}`;
      ringS2.rotation.x = Math.PI * 0.5;
      this.wavefrontArcsGroup.add(ringS2);
      this.s2WaveRings.push(ringS2);
    }
    this.group.add(this.wavefrontArcsGroup);

    // 5. 完整保留空间各级相长干涉明纹主极大准直激光射线组 (k = 0, ±1, ±2, ±3)
    this.interferenceRaysGroup = new THREE.Group();
    this.interferenceRaysGroup.name = 'InterferenceRaysGroup';
    this.group.add(this.interferenceRaysGroup);
  }

  private getActiveBeamColor(): THREE.Color {
    if (this.lightSourceMode === 'white') {
      return new THREE.Color(0xfef08a);
    }
    return OpticalPhysics.wavelengthToColor(this.wavelengthNm);
  }

  // ==================== 物理运动学与双狭缝 S1/S2 开度同步 ====================
  private updateSlitKinematics(): void {
    const normD = THREE.MathUtils.clamp((this.slitDistanceMm - 0.12) / (0.60 - 0.12), 0, 1);
    const visualHalfD = 0.0014 + normD * 0.0040;
    const visualSlitW = 0.0008 + ((this.slitWidthMm - 0.02) / (0.12 - 0.02)) * 0.0012;
    const halfJawDepth = 0.012 * 0.5;

    // 中央钛合金隔桥宽度随 d 同步伸缩
    const bridgeWidth = Math.max(0.0010, (visualHalfD - visualSlitW * 0.5) * 2.0);
    if (this.centerBridgeMesh) {
      this.centerBridgeMesh.scale.z = bridgeWidth / 0.0020;
    }

    // S1 与 S2 两条相干亮缝位置与宽度同步
    if (this.leftSlitLightMesh) {
      this.leftSlitLightMesh.position.z = -visualHalfD;
      this.leftSlitLightMesh.scale.z = 0.6 + (this.slitWidthMm / 0.12) * 1.4;
      this.leftSlitLightMesh.visible = this.laserPower;
    }
    if (this.rightSlitLightMesh) {
      this.rightSlitLightMesh.position.z = visualHalfD;
      this.rightSlitLightMesh.scale.z = 0.6 + (this.slitWidthMm / 0.12) * 1.4;
      this.rightSlitLightMesh.visible = this.laserPower;
    }

    // 外侧左右研磨刀口紧贴双缝外缘移动
    if (this.leftJawMesh) {
      this.leftJawMesh.position.z = -(visualHalfD + visualSlitW * 0.5 + halfJawDepth);
    }
    if (this.rightJawMesh) {
      this.rightJawMesh.position.z = visualHalfD + visualSlitW * 0.5 + halfJawDepth;
    }

    // 测微鼓轮多圈旋转与差动轴向微米进给
    if (this.micrometerKnob) {
      this.micrometerKnob.rotation.z = normD * Math.PI * 8.0;
      const axialTravel = normD * 0.0042;
      this.micrometerKnob.position.z = 0.018 + axialTravel;
    }

    // 同步观测屏下沿一阶条纹游标卡尺指针位置 (±Δy) 与手轮旋转
    const spacingMm = this.getFringeSpacingMm();
    const screenVisualPerMm = (0.29 - 0.010) / 28.0; // 屏面 28mm 显微观测满量程对应 0.28m
    const clampedOrder1Mm = Math.min(12.5, spacingMm);
    if (this.leftOrder1CaliperMesh) {
      this.leftOrder1CaliperMesh.position.x = -clampedOrder1Mm * screenVisualPerMm;
    }
    if (this.rightOrder1CaliperMesh) {
      this.rightOrder1CaliperMesh.position.x = clampedOrder1Mm * screenVisualPerMm;
    }
    if (this.caliperHandwheelMesh) {
      this.caliperHandwheelMesh.rotation.x = spacingMm * Math.PI * 2.5;
    }

    this.updateSlitPlateLabel();
  }

  private updateSlitPlateLabel(): void {
    if (!this.slitPlateCanvas || !this.slitPlateTexture) return;
    const ctx = this.slitPlateCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.slitPlateCanvas.width;
    const h = this.slitPlateCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // 严格遵守纯净无边框铁律：仅用大号深色粗体字显示，文字精炼不超宽截断，绝不调用 fillRect / strokeRect
    const modePrefix = this.lightSourceMode === 'white' ? '白光双缝' : '双缝';
    const labelText = `${modePrefix} d = ${this.slitDistanceMm.toFixed(2)} mm`;

    if (typeof ctx.save === 'function') ctx.save();
    ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(labelText, w / 2, h / 2);
    if (typeof ctx.restore === 'function') ctx.restore();

    this.slitPlateTexture.needsUpdate = true;
  }

  private updateLaserIndicators(): void {
    const colorRGB = this.getActiveBeamColor();

    if (this.beamMaterial) {
      this.beamMaterial.color.copy(colorRGB);
      this.beamMaterial.opacity = this.laserPower ? 0.90 : 0.0;
    }
    if (this.secondaryBeamMaterial) {
      this.secondaryBeamMaterial.color.copy(colorRGB);
      this.secondaryBeamMaterial.opacity = this.laserPower ? 0.26 : 0.0;
    }
    if (this.waveRibbonMaterial) {
      this.waveRibbonMaterial.color.copy(colorRGB);
      this.waveRibbonMaterial.opacity = this.laserPower ? 0.85 : 0.0;
    }
    if (this.waveVectorMaterial) {
      this.waveVectorMaterial.color.copy(colorRGB);
      this.waveVectorMaterial.opacity = this.laserPower ? 0.65 : 0.0;
    }
    if (this.wavefrontCrestMaterial) {
      this.wavefrontCrestMaterial.color.copy(colorRGB);
      this.wavefrontCrestMaterial.opacity = this.laserPower ? 0.48 : 0.0;
    }
    if (this.laserLedMesh) {
      const ledMat = this.laserLedMesh.material as THREE.MeshBasicMaterial;
      ledMat.color.copy(colorRGB);
      ledMat.opacity = this.laserPower ? 0.98 : 0.15;
    }
    if (this.leftSlitLightMesh) {
      (this.leftSlitLightMesh.material as THREE.MeshBasicMaterial).color.copy(colorRGB);
      this.leftSlitLightMesh.visible = this.laserPower;
    }
    if (this.rightSlitLightMesh) {
      (this.rightSlitLightMesh.material as THREE.MeshBasicMaterial).color.copy(colorRGB);
      this.rightSlitLightMesh.visible = this.laserPower;
    }

    for (const [wlStr, btn] of Object.entries(this.wlButtons)) {
      const wl = Number(wlStr);
      const isCur = this.lightSourceMode === 'monochromatic' && Math.abs(this.wavelengthNm - wl) < 15;
      const bColor = OpticalPhysics.wavelengthToColor(wl);
      const mat = btn.material as THREE.MeshStandardMaterial;
      mat.color.copy(isCur ? bColor : new THREE.Color(0x94a3b8));
      mat.emissive.copy(isCur ? bColor : new THREE.Color(0x000000));
      mat.emissiveIntensity = isCur ? 0.65 : 0;
    }

    if (this.whiteLightBtnMesh) {
      const isWhite = this.lightSourceMode === 'white';
      const wMat = this.whiteLightBtnMesh.material as THREE.MeshStandardMaterial;
      wMat.color.copy(new THREE.Color(isWhite ? 0xfffbeb : 0xcbd5e1));
      wMat.emissive.copy(new THREE.Color(isWhite ? 0xfef3c7 : 0x000000));
      wMat.emissiveIntensity = isWhite ? 0.75 : 0;
    }
  }

  // ==================== 屏距换算与运动 ====================
  public syncScreenPositionFromDistance(): void {
    const distClamped = THREE.MathUtils.clamp(this.screenDistanceM, 0.30, 0.85);
    this.screenDistanceM = distClamped;

    const norm = (distClamped - 0.30) / (0.85 - 0.30);
    const targetX = this.minScreenX + norm * (this.maxScreenX - this.minScreenX);

    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = targetX;
    }
    this.updateSlitKinematics();
  }

  public setScreenCarrierX(localX: number): void {
    const clampedX = THREE.MathUtils.clamp(localX, this.minScreenX, this.maxScreenX);
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = clampedX;
    }

    const norm = (clampedX - this.minScreenX) / (this.maxScreenX - this.minScreenX);
    this.screenDistanceM = 0.30 + norm * (0.85 - 0.30);
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public getScreenCarrierX(): number {
    return this.screenCarrierGroup ? this.screenCarrierGroup.position.x : this.maxScreenX;
  }

  // ==================== 参数控制接口 ====================
  public setSlitDistance(dMm: number): void {
    this.slitDistanceMm = THREE.MathUtils.clamp(dMm, 0.12, 0.60);
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public setSlitWidth(aMm: number): void {
    this.slitWidthMm = THREE.MathUtils.clamp(aMm, 0.02, 0.12);
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public setWavelength(wlNm: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wlNm, 380, 750);
    this.lightSourceMode = 'monochromatic';
    this.updateLaserIndicators();
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public setLightSourceMode(mode: LightSourceMode): void {
    this.lightSourceMode = mode;
    this.updateLaserIndicators();
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public toggleWhiteLightMode(): void {
    this.setLightSourceMode(this.lightSourceMode === 'white' ? 'monochromatic' : 'white');
  }

  public setLaserPower(on: boolean): void {
    this.laserPower = on;
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.updateLaserIndicators();
    this.isScreenDirty = true;
  }

  public cycleNextSlitPreset(): void {
    const presets = [0.15, 0.25, 0.40, 0.55];
    this.activePresetIndex = (this.activePresetIndex + 1) % presets.length;
    this.targetTurretAngle = this.activePresetIndex * (Math.PI * 0.5);
    this.setSlitDistance(presets[this.activePresetIndex]);
  }

  public hideMicrometerHint(): void {
    this.hasInteractedWithMicrometer = true;
    if (this.micrometerHoverCue) {
      this.micrometerHoverCue.visible = false;
    }
  }

  public hideTurretHint(): void {
    this.hasInteractedWithTurret = true;
    if (this.turretHoverCue) {
      this.turretHoverCue.visible = false;
    }
  }

  public setKnobHovered(id: 'slit_micrometer' | 'slit_turret' | null, hovered: boolean): void {
    if (this.micrometerHoverCue) {
      this.micrometerHoverCue.visible = (id === 'slit_micrometer' && hovered && !this.hasInteractedWithMicrometer);
    }
    if (this.turretHoverCue) {
      this.turretHoverCue.visible = (id === 'slit_turret' && hovered && !this.hasInteractedWithTurret);
    }
  }

  public getFringeSpacingMm(): number {
    const refWl = this.lightSourceMode === 'white' ? 550.0 : this.wavelengthNm;
    return OpticalPhysics.getDoubleSlitFringeSpacing(refWl, this.slitDistanceMm, this.screenDistanceM);
  }

  // ==================== 逐帧平滑阻尼运动、电磁波相干传播动效与重绘调度 ====================
  public update(delta: number): void {
    const dt = delta || 0.016;

    // 转换轮阻尼机械弹簧棘爪平滑旋转动效
    if (this.turretWheel) {
      const diff = this.targetTurretAngle - this.currentTurretAngle;
      if (Math.abs(diff) > 0.0005) {
        const step = diff * Math.min(1.0, dt * 14.0);
        this.currentTurretAngle += step;
        this.turretWheel.rotation.x = this.currentTurretAngle;
      } else {
        this.currentTurretAngle = this.targetTurretAngle;
        this.turretWheel.rotation.x = this.targetTurretAngle;
      }
    }

    // 悬浮提示引导环微光旋转
    if (this.micrometerHoverCue && this.micrometerHoverCue.visible) {
      this.micrometerHoverCue.rotation.z += dt * 1.8;
    }
    if (this.turretHoverCue && this.turretHoverCue.visible) {
      this.turretHoverCue.rotation.z += dt * 1.8;
    }

    if (this.isScreenDirty) {
      this.updateScreenTexture();
      this.updateBeams();
      this.isScreenDirty = false;
    }

    // 推进 3D 电磁波正弦横波相位与双波源同心波阵面扩散动画 (零内存分配原地顶点计算)
    if (this.laserPower && this.showBeamsInAir) {
      this.wavePhase = (this.wavePhase + dt * 12.0) % (Math.PI * 200);
      this.updateWaveAnimation();
    }
  }

  // ==================== 深邃海洋蓝黑观测屏纯物理杨氏等间距干涉条纹渲染 ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.lightSourceMode}_${this.wavelengthNm}_${this.laserPower}_${this.slitDistanceMm.toFixed(3)}_${this.slitWidthMm.toFixed(3)}_${this.screenDistanceM.toFixed(3)}_${this.showEnvelopeModulation}`;
    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 深邃海洋蓝黑高对比底色 (Deep Oceanic Sapphire: #08101e)
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    // 光源关闭时，屏幕保持纯净深邃蓝黑底色，无任何多余文字或图案
    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // 屏幕水平有效观测视场 (-7.0mm ~ +7.0mm)，使等间距干涉条纹饱满、清晰、锐利
    const physicalHalfSpanMm = 7.0;
    const pxPerMm = (w * 0.5) / physicalHalfSpanMm;
    const patternHalfH = 410;

    if (this.lightSourceMode === 'white') {
      // 复合白光杨氏双缝干涉：中央 k=0 纯白明纹 + 两侧“内紫外红”彩色光谱干涉条纹
      for (let px = 0; px < w; px++) {
        const xMm = (px - centerX) / pxPerMm;
        const xM = xMm * 1e-3;

        const rgb = OpticalPhysics.calculateWhiteLightDoubleSlitRGB(
          xM,
          this.slitWidthMm,
          this.slitDistanceMm,
          this.screenDistanceM,
          this.showEnvelopeModulation
        );

        // 相干长度包络使高阶白光条纹自然柔和过渡
        const coherenceFalloff = Math.exp(-Math.pow(xMm / 4.2, 2));
        const effI = rgb.intensity * (0.25 + 0.75 * coherenceFalloff);

        if (effI > 0.001) {
          const gammaR = Math.pow(rgb.r, 0.45);
          const gammaG = Math.pow(rgb.g, 0.45);
          const gammaB = Math.pow(rgb.b, 0.45);

          const r = Math.min(255, Math.round(gammaR * 255));
          const g = Math.min(255, Math.round(gammaG * 255));
          const b = Math.min(255, Math.round(gammaB * 255));

          const peakAlpha = Math.min(1.0, Math.pow(effI, 0.42) * 1.35);
          const midAlpha = peakAlpha * 0.75;
          const edgeAlpha = peakAlpha * 0.24;

          const grad = ctx.createLinearGradient(0, centerY - patternHalfH, 0, centerY + patternHalfH);
          grad.addColorStop(0.00, `rgba(${r}, ${g}, ${b}, 0)`);
          grad.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${peakAlpha.toFixed(3)})`);
          grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(1.00, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.fillStyle = grad;
          ctx.fillRect(px, centerY - patternHalfH, 1, patternHalfH * 2);
        }
      }
    } else {
      // 单色激光杨氏双缝干涉：等间距、等宽度、亮度均匀的高对比度相干明暗条纹
      const colorInfo = OpticalPhysics.wavelengthToRGB(this.wavelengthNm);
      const rBase = Math.round(colorInfo.r * 255);
      const gBase = Math.round(colorInfo.g * 255);
      const bBase = Math.round(colorInfo.b * 255);

      for (let px = 0; px < w; px++) {
        const xMm = (px - centerX) / pxPerMm;
        const xM = xMm * 1e-3;

        // 默认采用纯正杨氏双缝 cos²(α) 等幅干涉分布 + 轻微边缘视场柔化，彻底区别于单缝衍射图样
        const rawI = this.showEnvelopeModulation
          ? OpticalPhysics.calculateDoubleSlitIntensity(
              xM,
              this.wavelengthNm,
              this.slitWidthMm,
              this.slitDistanceMm,
              this.screenDistanceM
            )
          : OpticalPhysics.calculatePureDoubleSlitIntensity(
              xM,
              this.wavelengthNm,
              this.slitDistanceMm,
              this.screenDistanceM
            );

        const fieldVignette = this.showEnvelopeModulation
          ? 1.0
          : Math.exp(-Math.pow(xMm / 8.5, 4));
        const I = rawI * fieldVignette;

        if (I > 0.001) {
          const gammaI = Math.pow(Math.min(1.0, I), 0.55);
          const coreMix = Math.max(0, (I - 0.35) / 0.65);
          const r = Math.min(255, Math.round(rBase + (255 - rBase) * Math.pow(coreMix, 1.3)));
          const g = Math.min(255, Math.round(gBase + (255 - gBase) * Math.pow(coreMix, 1.3)));
          const b = Math.min(255, Math.round(bBase + (255 - bBase) * Math.pow(coreMix, 1.3)));

          const grad = ctx.createLinearGradient(0, centerY - patternHalfH, 0, centerY + patternHalfH);
          const peakAlpha = Math.min(1.0, gammaI * 1.25);
          const midAlpha = peakAlpha * 0.78;
          const edgeAlpha = peakAlpha * 0.25;

          grad.addColorStop(0.00, `rgba(${r}, ${g}, ${b}, 0)`);
          grad.addColorStop(0.14, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(0.34, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${peakAlpha.toFixed(3)})`);
          grad.addColorStop(0.66, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.86, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(1.00, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.fillStyle = grad;
          ctx.fillRect(px, centerY - patternHalfH, 1, patternHalfH * 2);
        }
      }
    }

    this.screenTexture.needsUpdate = true;
  }

  // ==================== 3D 空间真实准直激光、双波源相干光锥、各级干涉光线与前段叠加电磁波更新 ====================
  public updateBeams(): void {
    if (!this.showBeamsInAir || !this.laserPower) {
      if (this.preBeamMesh) this.preBeamMesh.visible = false;
      if (this.preBeamHaloMesh) this.preBeamHaloMesh.visible = false;
      if (this.incidentWaveRibbonMesh) this.incidentWaveRibbonMesh.visible = false;
      if (this.incidentWaveVectorsMesh) this.incidentWaveVectorsMesh.visible = false;
      if (this.postBeamMesh) this.postBeamMesh.visible = false;
      if (this.secondaryBeamMesh) this.secondaryBeamMesh.visible = false;
      if (this.wavefrontArcsGroup) this.wavefrontArcsGroup.visible = false;
      if (this.interferenceRaysGroup) this.interferenceRaysGroup.visible = false;
      return;
    }

    if (this.preBeamMesh) this.preBeamMesh.visible = true;
    if (this.preBeamHaloMesh) this.preBeamHaloMesh.visible = true;
    if (this.incidentWaveRibbonMesh) this.incidentWaveRibbonMesh.visible = true;
    if (this.incidentWaveVectorsMesh) this.incidentWaveVectorsMesh.visible = true;
    if (this.wavefrontArcsGroup) this.wavefrontArcsGroup.visible = true;

    const screenX = this.getScreenCarrierX();
    const beamY = this.beamHeightY;
    const spacingMm = this.getFringeSpacingMm();
    const halfSpan = Math.min(0.125, Math.max(0.032, spacingMm * 1e-3 * 16.0));

    // 完整保留 S1 与 S2 双波源水平相干交叠光扇
    const s1Z = this.leftSlitLightMesh ? this.leftSlitLightMesh.position.z : -0.002;
    const s2Z = this.rightSlitLightMesh ? this.rightSlitLightMesh.position.z : 0.002;

    if (this.postBeamMesh) {
      this.postBeamMesh.visible = true;
      const posAttr1 = this.postBeamMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr1.setXYZ(0, this.slitX, beamY, s1Z);
      posAttr1.setXYZ(1, screenX, beamY, -halfSpan);
      posAttr1.setXYZ(2, screenX, beamY, halfSpan * 0.85);
      posAttr1.needsUpdate = true;
      this.postBeamMesh.geometry.computeBoundingSphere();
    }

    if (this.secondaryBeamMesh) {
      this.secondaryBeamMesh.visible = true;
      const posAttr2 = this.secondaryBeamMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr2.setXYZ(0, this.slitX, beamY, s2Z);
      posAttr2.setXYZ(1, screenX, beamY, -halfSpan * 0.85);
      posAttr2.setXYZ(2, screenX, beamY, halfSpan);
      posAttr2.needsUpdate = true;
      this.secondaryBeamMesh.geometry.computeBoundingSphere();
    }

    // 完整保留空间各级相长干涉主极大准直激光射线 (k = -3..+3)
    if (this.interferenceRaysGroup) {
      for (const child of this.interferenceRaysGroup.children) {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
      }
      this.interferenceRaysGroup.clear();

      if (this.showOrderRays) {
        this.interferenceRaysGroup.visible = true;
        const refWl = this.lightSourceMode === 'white' ? 550.0 : this.wavelengthNm;
        const fringes = OpticalPhysics.getDoubleSlitFringePositions(
          refWl,
          this.slitDistanceMm,
          this.screenDistanceM,
          3
        );
        const colorRGB = this.getActiveBeamColor();
        const screenVisualPerMm = (0.29 - 0.010) / 14.0;

        for (const fringe of fringes) {
          const zScreen = THREE.MathUtils.clamp(fringe.xMm * screenVisualPerMm, -0.125, 0.125);
          const pStart = new THREE.Vector3(this.slitX, beamY, 0);
          const pEnd = new THREE.Vector3(screenX, beamY, -zScreen);
          const dir = new THREE.Vector3().subVectors(pEnd, pStart);
          const len = dir.length();
          if (len < 0.001) continue;

          const orderAttenuation = fringe.order === 0 ? 0.82 : Math.max(0.32, 0.68 - Math.abs(fringe.order) * 0.10);
          const rayMat = new THREE.MeshBasicMaterial({
            color: colorRGB,
            transparent: true,
            opacity: orderAttenuation,
            depthWrite: false,
          });

          const radius = fringe.order === 0 ? 0.0011 : 0.00075;
          const rayGeo = new THREE.CylinderGeometry(radius * 0.8, radius, len, 8);
          rayGeo.rotateZ(Math.PI / 2);
          const rayMesh = new THREE.Mesh(rayGeo, rayMat);
          rayMesh.name = `ConstructiveOrderRay_k${fringe.order}`;
          rayMesh.position.copy(pStart).addScaledVector(dir, 0.5);
          rayMesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
          this.interferenceRaysGroup.add(rayMesh);
        }
      } else {
        this.interferenceRaysGroup.visible = false;
      }
    }

    // 同步首帧叠加在准直激光束上的正弦电磁波与双缝波阵面动效
    this.updateWaveAnimation();
  }

  // ==================== 原地零分配：前段叠加 3D 正弦电磁横波与双缝出口波阵面扩散计算 ====================
  private updateWaveAnimation(): void {
    const startX = this.laserX + 0.072;
    const endPreX = this.slitX - 0.006;
    const distPre = Math.max(0.01, endPreX - startX);
    const beamY = this.beamHeightY;

    // 视觉波长随物理波长 (380nm ~ 750nm) 成比例缩放，切换红/绿/蓝激光时波长疏密直观变化
    const refWl = this.lightSourceMode === 'white' ? 550.0 : this.wavelengthNm;
    const wlNorm = (refWl - 380.0) / 370.0;
    const visualWavelength = 0.038 + wlNorm * 0.024;
    const kWave = (Math.PI * 2.0) / visualWavelength;
    const phase = this.wavePhase;

    // 1. 更新前段叠加在准直激光轴上的行进正弦电磁横波带 (IncidentSinusoidalWaveRibbon)
    if (this.incidentWaveRibbonMesh && this.incidentWaveRibbonMesh.visible) {
      const posAttr = this.incidentWaveRibbonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const preSegments = 56;
      const amp = 0.011;
      const halfThick = 0.0012;

      for (let i = 0; i <= preSegments; i++) {
        const t = i / preSegments;
        const x = startX + t * distPre;
        const env = Math.sin(t * Math.PI);
        const envFactor = 0.20 + 0.80 * Math.min(1.0, env * 2.0);
        const yWave = Math.sin(kWave * (x - startX) - phase) * amp * envFactor;

        const idx = i * 6;
        arr[idx] = x;
        arr[idx + 1] = beamY + yWave + halfThick;
        arr[idx + 2] = 0.0018;

        arr[idx + 3] = x;
        arr[idx + 4] = beamY + yWave - halfThick;
        arr[idx + 5] = 0.0018;
      }
      posAttr.needsUpdate = true;
    }

    // 2. 更新前段叠加在准直激光轴上的电场横向振幅矢量梳 (IncidentElectricFieldVectors)
    if (this.incidentWaveVectorsMesh && this.incidentWaveVectorsMesh.visible) {
      const posAttr = this.incidentWaveVectorsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const vectorCount = 32;
      const amp = 0.011;

      for (let i = 0; i < vectorCount; i++) {
        const t = (i + 0.5) / vectorCount;
        const x = startX + t * distPre;
        const env = Math.sin(t * Math.PI);
        const envFactor = 0.20 + 0.80 * Math.min(1.0, env * 2.0);
        const yWave = Math.sin(kWave * (x - startX) - phase) * amp * envFactor;

        const idx = i * 6;
        arr[idx] = x;
        arr[idx + 1] = beamY;
        arr[idx + 2] = 0.0018;

        arr[idx + 3] = x;
        arr[idx + 4] = beamY + yWave;
        arr[idx + 5] = 0.0018;
      }
      posAttr.needsUpdate = true;
    }

    // 3. 更新双缝出口局部水平面 (XZ) 双波源 (S1 & S2) 同心波阵面扩散涟漪环
    if (this.wavefrontArcsGroup && this.wavefrontArcsGroup.visible) {
      const s1Z = this.leftSlitLightMesh ? this.leftSlitLightMesh.position.z : -0.0022;
      const s2Z = this.rightSlitLightMesh ? this.rightSlitLightMesh.position.z : 0.0022;
      const maxWaveRadius = 0.085;
      const ringCount = this.s1WaveRings.length;
      const fracPhase = ((phase / (Math.PI * 2.0)) % 1.0 + 1.0) % 1.0;

      for (let i = 0; i < ringCount; i++) {
        const progress = (i + fracPhase) / ringCount;
        const radius = 0.008 + progress * (maxWaveRadius - 0.008);

        const r1 = this.s1WaveRings[i];
        r1.position.set(this.slitX + 0.002, beamY + 0.0005, s1Z * 2.2);
        r1.scale.setScalar(radius);

        const r2 = this.s2WaveRings[i];
        r2.position.set(this.slitX + 0.002, beamY - 0.0005, s2Z * 2.2);
        r2.scale.setScalar(radius);
      }
    }
  }

  // ==================== 实时遥测数据输出 ====================
  public getTelemetry(): OpticalDoubleSlitTelemetry {
    const refWl = this.lightSourceMode === 'white' ? 550.0 : this.wavelengthNm;
    const fringeSpacingMm = OpticalPhysics.getDoubleSlitFringeSpacing(
      refWl,
      this.slitDistanceMm,
      this.screenDistanceM
    );
    const singleSlitRes = OpticalPhysics.getSingleSlitFringeWidth(
      refWl,
      this.slitWidthMm,
      this.screenDistanceM
    );

    const ratioDA = this.slitDistanceMm / Math.max(0.001, this.slitWidthMm);
    const nearestInt = Math.round(ratioDA);
    const missingOrderK = Math.abs(ratioDA - nearestInt) < 0.08 && nearestInt >= 2 ? nearestInt : null;

    const sinTheta1 = Math.min(0.999, (refWl * 1e-9) / (this.slitDistanceMm * 1e-3));
    const firstOrderAngleDeg = THREE.MathUtils.radToDeg(Math.asin(sinTheta1));
    const maxVisibleOrders = Math.max(1, Math.floor(7.0 / Math.max(0.05, fringeSpacingMm)));

    return {
      lightSourceMode: this.lightSourceMode,
      wavelengthNm: this.wavelengthNm,
      laserPower: this.laserPower,
      slitDistanceMm: this.slitDistanceMm,
      slitWidthMm: this.slitWidthMm,
      screenDistanceM: this.screenDistanceM,
      fringeSpacingMm,
      centralEnvelopeWidthMm: singleSlitRes.centralWidthMm,
      missingOrderK,
      firstOrderAngleDeg,
      firstOrderPathDiffNm: refWl,
      maxVisibleOrders,
    };
  }

  // ==================== 显存与纹理安全释放 ====================
  public dispose(): void {
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
        const mesh = obj as THREE.Mesh | THREE.Line;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
      if ((obj as THREE.Sprite).isSprite) {
        const sprite = obj as THREE.Sprite;
        sprite.material?.dispose();
      }
    });

    this.screenTexture?.dispose();
    this.railScaleTexture?.dispose();
    this.bezelScaleTexture?.dispose();
    this.gimbalDialTexture?.dispose();
    this.slitPlateTexture?.dispose();
  }
}
