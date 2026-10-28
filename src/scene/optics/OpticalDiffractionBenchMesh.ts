import * as THREE from 'three';
import { OpticalPhysics } from './OpticalPhysics.ts';

export type DiffractionType = 'single' | 'double' | 'circular' | 'grating';

export interface OpticalDiffractionTelemetry {
  diffractionType: DiffractionType;
  wavelengthNm: number;
  laserPower: boolean;
  slitWidthMm: number;
  slitDistanceMm: number;
  apertureDiameterMm: number;
  gratingLinesPerMm: number;
  screenDistanceM: number;
  centralWidthMm: number;
  secondarySpacingMm: number;
  airyDiskRadiusMm: number;
  firstGratingAngleDeg: number;
}

export interface OpticalDiffractionOptions {
  diffractionType?: DiffractionType;
  wavelengthNm?: number;
  laserPower?: boolean;
  slitWidthMm?: number;
  slitDistanceMm?: number;
  apertureDiameterMm?: number;
  gratingLinesPerMm?: number;
  screenDistanceM?: number;
  showProfileCurve?: boolean;
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
 * 工业科研级光具座光的衍射与干涉实验台 (德系科研级深空钛晶灰蓝·标准三滑座架构)
 * 架构规范 (方案 A):
 * 1. 德系科研级阳极氧化深空钛晶灰蓝双槽精密导轨 (0~100cm 激光蚀刻毫米双边刻度、两端香槟金调平旋钮与限位销)
 * 2. 精准三滑座架构 (无冗余器件，符合真实物理光路)：
 *    - 滑座 1: 准直聚光灯箱 (钛晶灰蓝哑光机箱、侧边散热百叶槽、实验室高品质柔性电缆、香槟金镜圈、翘板开关与波长轻触键，X=-0.36)
 *    - 滑座 2: 通用精密衍射变换台 (钛晶灰蓝八角倒角承载板、微米精密对置钛合金刀口、香槟金测微鼓轮、旋转转换轮与光栅夹片，X=-0.08)
 *    - 滑座 3: 深邃海洋蓝黑高对比度投影接收屏 (钛晶灰蓝精致外框、深海蓝黑感光面板、真实 Fraunhofer 衍射与艾里斑高动态光斑，X=0.16~0.46)
 * 3. 3D 空气漫散射真实光路系统 (出光口直达衍射台，衍射台直达观测屏，无中间冗余夹具干扰)
 */
export class OpticalDiffractionBenchMesh {
  public readonly group = new THREE.Group();

  // 物理与几何尺寸 (横向 X 轴展开，正面对着操作者 +Z)
  public readonly railLength = 1.08;   // X 轴导轨总长
  public readonly railWidth = 0.064;   // Z 轴前后进深
  public readonly railHeight = 0.042;  // Y 轴导轨厚度
  public readonly beamHeightY = 0.200; // 沿导轨上方光轴标准高度
  public readonly laserX = -0.36;      // 光源灯箱安装坐标 (标尺 ~14cm 处)
  public readonly slitX = -0.08;       // 中央通用精密衍射工作台坐标 (标尺 ~46cm 处)
  public readonly gratingX = -0.08;     // 保持与 slitX 一致 (向后兼容)
  public minScreenX = 0.16;            // 观测屏滑行最近端 (标尺 ~66cm 处)
  public maxScreenX = 0.46;            // 观测屏滑行最远端 (标尺 ~96cm 处)

  // 状态参数
  public diffractionType: DiffractionType = 'single';
  public wavelengthNm = 532.0;
  public laserPower = true;
  public slitWidthMm = 0.08;
  public slitDistanceMm = 0.25;
  public apertureDiameterMm = 0.25;
  public gratingLinesPerMm = 300;
  public screenDistanceM = 0.50; // 狭缝至屏物理换算距离 (默认 500mm)
  public showProfileCurve = false;
  public showBeamsInAir = true;

  // 3D 核心装配节点
  public railGroup!: THREE.Group;
  public laserGroup!: THREE.Group;
  public slitStageGroup!: THREE.Group;
  public gratingHolderGroup!: THREE.Group;
  public turretGroup!: THREE.Group; // 保持向后兼容别名
  public turretWheel!: THREE.Group; // 保持向后兼容别名
  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public micrometerKnob!: THREE.Mesh;
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};
  public micrometerThimbleGroup!: THREE.Group;
  public micrometerHoverCue!: THREE.Mesh;
  public turretHoverCue!: THREE.Mesh;
  public hasInteractedWithMicrometer = false;
  public hasInteractedWithTurret = false;
  public currentTurretAngle = 0;
  public targetTurretAngle = 0;

  // 精密双研磨合金刀口片 (物理可调狭缝)
  public leftJawMesh!: THREE.Mesh;
  public rightJawMesh!: THREE.Mesh;
  public slitLightMesh!: THREE.Mesh;
  public laserIncidentSpotMesh!: THREE.Mesh;
  private slitLightMaterial!: THREE.MeshBasicMaterial;
  public doubleSlitInsertMesh!: THREE.Group;
  public circularInsertMesh!: THREE.Group;
  public gratingSlideMesh!: THREE.Mesh;

  // 3D 光束几何与材质
  public preBeamMesh!: THREE.Mesh;
  public midBeamMesh!: THREE.Mesh;
  public postBeamMesh!: THREE.Mesh;
  public gratingRaysGroup!: THREE.Group;
  private beamMaterial!: THREE.MeshBasicMaterial;

  // 屏幕纹理与 Canvas
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  public screenMesh!: THREE.Mesh;
  private railScaleCanvas: HTMLCanvasElement | null = null;
  private railScaleTexture: THREE.CanvasTexture | null = null;
  private slitPlateCanvas: HTMLCanvasElement | null = null;
  private slitPlateTexture: THREE.CanvasTexture | null = null;
  private slitPlateMesh!: THREE.Sprite;

  // 脏标记与重绘节流
  private isScreenDirty = true;
  private lastRenderHash = '';

  constructor(options: OpticalDiffractionOptions = {}) {
    this.group.name = 'OpticalDiffractionBenchMesh';

    if (options.diffractionType) this.diffractionType = options.diffractionType;
    if (options.wavelengthNm !== undefined) this.wavelengthNm = options.wavelengthNm;
    if (options.laserPower !== undefined) this.laserPower = options.laserPower;
    if (options.slitWidthMm !== undefined) this.slitWidthMm = options.slitWidthMm;
    if (options.slitDistanceMm !== undefined) this.slitDistanceMm = options.slitDistanceMm;
    if (options.apertureDiameterMm !== undefined) this.apertureDiameterMm = options.apertureDiameterMm;
    if (options.gratingLinesPerMm !== undefined) this.gratingLinesPerMm = options.gratingLinesPerMm;
    if (options.screenDistanceM !== undefined) this.screenDistanceM = options.screenDistanceM;
    if (options.showProfileCurve !== undefined) this.showProfileCurve = options.showProfileCurve;
    if (options.showBeamsInAir !== undefined) this.showBeamsInAir = options.showBeamsInAir;

    this.buildBenchApparatus();
    this.syncScreenPositionFromDistance();
    this.updateElementVisibility();
    this.updateSlitKinematics();
    this.updateScreenTexture();
    this.updateBeams();
  }

  // ==================== 1. 主装配构建 (标准科研三滑座) ====================
  private buildBenchApparatus(): void {
    // A. 阳极氧化宝石蓝双槽导轨、0-100cm 毫米刻度与两端调平支脚
    this.buildOpticalRail();

    // B. 第 1 组滑鞍与准直聚光灯箱 (置于左侧 X=-0.36)
    this.buildLaserModule();

    // C. 第 2 组滑鞍：中央通用高精度衍射变换工作台 (置于中央 X=-0.08，集成单缝微米刀口、双缝、圆孔、光栅与模式旋转轮)
    this.buildUniversalDiffractionStage();

    // D. 第 3 组滑鞍：深海蓝黑高对比度投影接收屏 (置于右侧 X=0.16~0.46，沿导轨平滑滑动)
    this.buildObservationScreen();

    // E. 3D 空气漫散射真实激光光路系统
    this.buildOpticalBeams();
  }

  // ==================== 通用精密滑鞍构造助手 (与参考图完全一致) ====================
  private createSliderSaddle(
    xPos: number,
    name: string,
    rodHeight: number
  ): { saddleGroup: THREE.Group; collar: THREE.Mesh; rod: THREE.Mesh } {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(xPos, 0, 0);

    // 德系科研级阳极氧化深空钛晶灰蓝与精密五金体系 (沉稳奢华工业配色，低金属度哑光质感，杜绝视角变色，清晰区分于浅白背景)
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.20,
      roughness: 0.45,
    });
    const trimSlateMat = new THREE.MeshStandardMaterial({
      color: 0x3d546b,
      metalness: 0.24,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.60,
      roughness: 0.18,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.38,
      roughness: 0.30,
    });

    // 1. 滑鞍主体基座 (精密切削德系阳极氧化深空钛晶灰蓝铝块，跨接于导轨顶部)
    const baseW = 0.068; // 沿 X 轴宽度
    const baseH = 0.022; // 沿 Y 轴厚度
    const baseD = 0.076; // 沿 Z 轴深度
    const baseGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
    const base = new THREE.Mesh(baseGeo, titaniumSlateMat);
    base.position.set(0, this.railHeight + baseH * 0.5, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 正面高精度对齐读数指针 (对准下方的毫米刻度尺，白色指针在蓝底上极为鲜明)
    const indexLineGeo = new THREE.BoxGeometry(0.002, 0.016, 0.002);
    const indexLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const indexLine = new THREE.Mesh(indexLineGeo, indexLineMat);
    indexLine.position.set(0, this.railHeight + 0.006, baseD * 0.501);
    group.add(indexLine);

    // 2. 中央立柱锁紧圆柱套筒 (香槟金精密锁紧套筒)
    const collarRadius = 0.011;
    const collarH = 0.032;
    const collarGeo = new THREE.CylinderGeometry(collarRadius, collarRadius, collarH, 28);
    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.position.set(0, this.railHeight + baseH + collarH * 0.5, 0);
    collar.castShadow = true;
    group.add(collar);

    // 3. 套筒右侧滚花锁紧手轮 (香槟金微米滚花旋钮与不锈钢连接轴，紧凑精工造型)
    const screwShaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 16);
    screwShaftGeo.rotateZ(Math.PI / 2);
    const screwShaft = new THREE.Mesh(screwShaftGeo, chromeRodMat);
    screwShaft.position.set(collarRadius + 0.002, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwShaft);

    const screwHeadGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.008, 24);
    screwHeadGeo.rotateZ(Math.PI / 2);
    const screwHead = new THREE.Mesh(screwHeadGeo, brassMat);
    screwHead.position.set(collarRadius + 0.008, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwHead);

    // 4. 精密镜面 316L 不锈钢升降立柱导杆 (贯穿套筒向上伸展)
    const rodRadius = 0.007;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodHeight, 32);
    const rod = new THREE.Mesh(rodGeo, chromeRodMat);
    rod.position.set(0, this.railHeight + baseH + rodHeight * 0.5, 0);
    rod.castShadow = true;
    group.add(rod);

    return { saddleGroup: group, collar, rod };
  }

  // ==================== A. 德系科研级阳极氧化深空钛晶灰蓝双槽导轨与调平底座 ====================
  private buildOpticalRail(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'RailGroup';

    // 导轨床身与端盖材质：德系科研级深空钛晶灰蓝与精工切削修边
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.20,
      roughness: 0.45,
    });
    const trimSlateMat = new THREE.MeshStandardMaterial({
      color: 0x3d546b,
      metalness: 0.24,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.60,
      roughness: 0.18,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.38,
      roughness: 0.30,
    });

    // 1. 导轨床身主体：工业级阳极氧化深空钛晶灰蓝型材 (高级沉稳，清晰区别于浅白背景)
    const railBodyGeo = new THREE.BoxGeometry(this.railLength, this.railHeight, this.railWidth);
    const railBody = new THREE.Mesh(railBodyGeo, titaniumSlateMat);
    railBody.position.set(0, this.railHeight * 0.5, 0);
    railBody.castShadow = true;
    railBody.receiveShadow = true;
    this.railGroup.add(railBody);

    // 2. 导轨顶部双镜面液态铬导向凹槽滑杆 (完全贯通全长)
    const rodRadius = 0.0042;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, this.railLength + 0.016, 32);
    rodGeo.rotateZ(Math.PI / 2);
    const rodFront = new THREE.Mesh(rodGeo, chromeRodMat);
    rodFront.position.set(0, this.railHeight + rodRadius * 0.7, this.railWidth * 0.28);
    const rodBack = new THREE.Mesh(rodGeo, chromeRodMat);
    rodBack.position.set(0, this.railHeight + rodRadius * 0.7, -this.railWidth * 0.28);
    this.railGroup.add(rodFront);
    this.railGroup.add(rodBack);

    // 3. 两端精工端盖与香槟金调平螺栓系统 (左右各一组)
    const endCapW = 0.024;
    const endCapH = this.railHeight + 0.008;
    const endCapD = this.railWidth + 0.006;
    const endCapGeo = new THREE.BoxGeometry(endCapW, endCapH, endCapD);

    const xEnds = [-this.railLength * 0.5 - endCapW * 0.5, this.railLength * 0.5 + endCapW * 0.5];

    xEnds.forEach((xPos) => {
      // 钛晶端盖封头
      const endCap = new THREE.Mesh(endCapGeo, trimSlateMat);
      endCap.position.set(xPos, this.railHeight * 0.5, 0);
      endCap.castShadow = true;
      this.railGroup.add(endCap);

      // 顶部香槟金限位防滑脱止动螺钉 (垂直滚花螺钉)
      const stopScrewGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.018, 24);
      const stopScrew = new THREE.Mesh(stopScrewGeo, brassMat);
      stopScrew.position.set(xPos, this.railHeight + 0.013, 0);
      this.railGroup.add(stopScrew);

      // 下部横向防倾覆支脚横梁 (深空钛晶灰蓝，沿 Z 轴横向舒展)
      const crossFootW = 0.026;
      const crossFootH = 0.014;
      const crossFootD = 0.144;
      const crossFootGeo = new THREE.BoxGeometry(crossFootW, crossFootH, crossFootD);
      const crossFoot = new THREE.Mesh(crossFootGeo, titaniumSlateMat);
      crossFoot.position.set(xPos, 0.002, 0);
      crossFoot.castShadow = true;
      this.railGroup.add(crossFoot);

      // 左右两侧前后 2 个高精密防震水平调平旋钮 (镜面铬立轴、香槟金锁紧套与滚花底脚)
      const zFootOffsets = [-crossFootD * 0.40, crossFootD * 0.40];
      zFootOffsets.forEach((zPos) => {
        // 螺纹不锈钢立轴
        const studGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.024, 16);
        const stud = new THREE.Mesh(studGeo, chromeRodMat);
        stud.position.set(xPos, -0.008, zPos);
        this.railGroup.add(stud);

        // 香槟金锁紧压套
        const lockNutGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 24);
        const lockNut = new THREE.Mesh(lockNutGeo, brassMat);
        lockNut.position.set(xPos, -0.002, zPos);
        this.railGroup.add(lockNut);

        // 底部香槟金精密防滑滚花底脚
        const footPadGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.009, 28);
        const footPad = new THREE.Mesh(footPadGeo, brassMat);
        footPad.position.set(xPos, -0.018, zPos);
        this.railGroup.add(footPad);
      });
    });

    // 4. 正面高精激光蚀刻毫米与厘米双重标尺 (0 ~ 100 cm，完全对应参考图实物)
    this.railScaleCanvas = safeCanvas(2048, 128);
    if (this.railScaleCanvas) {
      const ctx = this.railScaleCanvas.getContext('2d');
      if (ctx) {
        // 银亮细腻氧化铝标尺底带
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, 2048, 128);

        // 顶边与底边清晰工业基准黑线
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 2048, 3);
        ctx.fillRect(0, 125, 2048, 3);

        ctx.strokeStyle = '#0f172a';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 32px -apple-system, "SF Mono", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 绘制 0 到 100 cm 的精密刻度线 (包含 1mm 细线、5mm 中长线、10mm/1cm 主刻度与数字)
        const scaleStartX = 60;
        const scaleEndX = 1920;
        const scaleSpan = scaleEndX - scaleStartX;

        for (let cm = 0; cm <= 100; cm++) {
          const pxCm = scaleStartX + (cm / 100) * scaleSpan;

          // 1cm 主刻度线
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(pxCm, 3);
          ctx.lineTo(pxCm, 48);
          ctx.stroke();

          // 数字标号：0, 10, 20, ..., 100
          if (cm % 10 === 0) {
            ctx.fillText(`${cm}`, pxCm, 58);
          }

          // 毫米分度线 (每 1mm 细线，5mm 中长线)
          if (cm < 100) {
            for (let mm = 1; mm < 10; mm++) {
              const pxMm = pxCm + (mm / 10) * (scaleSpan / 100);
              const is5 = mm === 5;
              ctx.lineWidth = is5 ? 2.0 : 1.2;
              ctx.beginPath();
              ctx.moveTo(pxMm, 3);
              ctx.lineTo(pxMm, is5 ? 30 : 18);
              ctx.stroke();
            }
          }
        }

        // 最右侧单位 "cm" 标识
        ctx.font = 'bold 30px "SF Mono", sans-serif';
        ctx.fillText('cm', scaleEndX + 56, 58);
      }

      this.railScaleTexture = new THREE.CanvasTexture(this.railScaleCanvas);
      this.railScaleTexture.anisotropy = 8;

      const scalePlateGeo = new THREE.PlaneGeometry(this.railLength * 0.96, this.railHeight * 0.62);
      const scalePlateMat = new THREE.MeshStandardMaterial({
        map: this.railScaleTexture,
        roughness: 0.35,
        metalness: 0.12,
      });
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.502);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 准直聚光灯箱 (第 1 组滑鞍，实物 1:1 复刻) ====================
  private buildLaserModule(): void {
    // 实例化第 1 组标准滑鞍 (X = -0.36，立柱高度严密贴合底部连接件)
    const saddleData = this.createSliderSaddle(this.laserX, 'LaserSliderSaddle', 0.090);
    this.laserGroup = saddleData.saddleGroup;
    this.laserGroup.name = 'LaserGroup';

    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.20,
      roughness: 0.45,
    });
    const trimSlateMat = new THREE.MeshStandardMaterial({
      color: 0x3d546b,
      metalness: 0.24,
      roughness: 0.40,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.60,
      roughness: 0.18,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.38,
      roughness: 0.30,
    });
    const slateSlotMat = new THREE.MeshStandardMaterial({
      color: 0x1a2634,
      metalness: 0.18,
      roughness: 0.48,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.08,
    });

    // 1. 灯箱下部俯仰微调云台连接件 (深空钛晶灰蓝，与不锈钢立柱顶部紧密咬合)
    const cradleGeo = new THREE.BoxGeometry(0.046, 0.016, 0.052);
    const cradle = new THREE.Mesh(cradleGeo, titaniumSlateMat);
    cradle.position.set(0, this.beamHeightY - 0.046, 0);
    cradle.castShadow = true;
    this.laserGroup.add(cradle);

    // 云台锁紧滚花手轮 (香槟金精密滚花旋钮)
    const tiltKnobGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.016, 24);
    tiltKnobGeo.rotateX(Math.PI / 2);
    const tiltKnob = new THREE.Mesh(tiltKnobGeo, brassMat);
    tiltKnob.position.set(-0.012, this.beamHeightY - 0.056, 0);
    this.laserGroup.add(tiltKnob);

    // 2. 德系深空钛晶灰蓝高精矩形灯箱外壳 (沿 X 轴长 0.120m，高 0.082m，深 0.082m，与浅白背景高对比清晰分明)
    const boxW = 0.120;
    const boxH = 0.082;
    const boxD = 0.082;
    const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    const lampBox = new THREE.Mesh(boxGeo, titaniumSlateMat);
    lampBox.position.set(-0.010, this.beamHeightY, 0);
    lampBox.castShadow = true;
    this.laserGroup.add(lampBox);

    // 3. 侧面散热排风百叶槽 (左后侧 6 道平行通风槽，深空蓝灰金属槽)
    for (let i = -2; i <= 3; i++) {
      const louverGeo = new THREE.BoxGeometry(0.004, 0.042, 0.0025);
      const louver = new THREE.Mesh(louverGeo, slateSlotMat);
      louver.position.set(-0.038 + i * 0.0085, this.beamHeightY + 0.008, -boxD * 0.501);
      this.laserGroup.add(louver);
    }

    // 4. 后部实验室高品质柔性电源电缆与防折应力护套 (深空灰高弹性护套)
    const bootGeo = new THREE.CylinderGeometry(0.005, 0.007, 0.020, 16);
    bootGeo.rotateZ(Math.PI / 2);
    const boot = new THREE.Mesh(bootGeo, cableMat);
    boot.position.set(-boxW * 0.5 - 0.018, this.beamHeightY - 0.022, -0.018);
    this.laserGroup.add(boot);

    // 曲线电缆管 (利用三维平滑样条曲线模拟自然物理悬垂)
    const cableCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-boxW * 0.5 - 0.028, this.beamHeightY - 0.022, -0.018),
      new THREE.Vector3(-boxW * 0.5 - 0.075, this.beamHeightY - 0.045, -0.025),
      new THREE.Vector3(-boxW * 0.5 - 0.110, this.beamHeightY - 0.120, -0.045),
      new THREE.Vector3(-boxW * 0.5 - 0.145, 0.020, -0.070)
    );
    const cableGeo = new THREE.TubeGeometry(cableCurve, 24, 0.0035, 12, false);
    const cable = new THREE.Mesh(cableGeo, cableMat);
    this.laserGroup.add(cable);

    // 5. 前置出光镜头镜筒与香槟金倒角反光圈 (+X 端口朝向单缝，镜面镀铬镜筒)
    const lensBarrelGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.016, 32);
    lensBarrelGeo.rotateZ(Math.PI / 2);
    const lensBarrel = new THREE.Mesh(lensBarrelGeo, chromeRodMat);
    lensBarrel.position.set(boxW * 0.5 - 0.002, this.beamHeightY, 0);
    this.laserGroup.add(lensBarrel);

    // 香槟金聚光内衬环
    const brassRingGeo = new THREE.TorusGeometry(0.021, 0.0038, 16, 32);
    brassRingGeo.rotateY(Math.PI / 2);
    const brassRing = new THREE.Mesh(brassRingGeo, brassMat);
    brassRing.position.set(boxW * 0.5 + 0.006, this.beamHeightY, 0);
    this.laserGroup.add(brassRing);

    // 发光聚光透镜片 (发光核心，支持光源开关与波长色彩实时联动)
    const lensGeo = new THREE.CircleGeometry(0.018, 32);
    lensGeo.rotateY(Math.PI / 2);
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const lensMat = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.98 : 0.20,
    });
    this.laserLedMesh = new THREE.Mesh(lensGeo, lensMat);
    this.laserLedMesh.position.set(boxW * 0.5 + 0.007, this.beamHeightY, 0);
    this.laserGroup.add(this.laserLedMesh);

    // 6. 顶部机械翘板电源开关 (钛晶修边底座与红色按键)
    const switchBaseGeo = new THREE.BoxGeometry(0.022, 0.006, 0.016);
    const switchBase = new THREE.Mesh(switchBaseGeo, trimSlateMat);
    switchBase.position.set(-0.010, this.beamHeightY + boxH * 0.5 + 0.003, 0.018);
    this.laserGroup.add(switchBase);

    const switchRockerGeo = new THREE.BoxGeometry(0.015, 0.007, 0.011);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.35,
      roughness: 0.25,
    });
    this.laserSwitchMesh = new THREE.Mesh(switchRockerGeo, switchMat);
    this.laserSwitchMesh.name = 'LaserPowerSwitch';
    this.laserSwitchMesh.userData = { interactiveId: 'laser_power' };
    this.laserSwitchMesh.position.set(-0.010, this.beamHeightY + boxH * 0.5 + 0.007, 0.018);
    this.laserSwitchMesh.rotation.z = this.laserPower ? -0.25 : 0.25;
    this.laserGroup.add(this.laserSwitchMesh);

    // 7. 顶部 3 个波长轻触切换键 (650nm 红、532nm 绿、405nm 蓝)
    const wavelengths = [650, 532, 405];
    const zSpacing = 0.015;

    wavelengths.forEach((wl, idx) => {
      const btnGeo = new THREE.CylinderGeometry(0.0045, 0.005, 0.005, 16);
      const isCurrent = Math.round(this.wavelengthNm) === wl;
      const btnColor = OpticalPhysics.wavelengthToColor(wl);
      const btnMat = new THREE.MeshStandardMaterial({
        color: isCurrent ? btnColor : 0x94a3b8,
        emissive: isCurrent ? btnColor : 0x000000,
        emissiveIntensity: isCurrent ? 0.6 : 0,
        metalness: 0.7,
        roughness: 0.2,
      });
      const btnMesh = new THREE.Mesh(btnGeo, btnMat);
      btnMesh.name = `LaserWlButton_${wl}`;
      btnMesh.userData = { interactiveId: `laser_wavelength_${wl}`, wavelength: wl };
      btnMesh.position.set(0.022, this.beamHeightY + boxH * 0.5 + 0.003, (idx - 1) * zSpacing);
      this.laserGroup.add(btnMesh);
      this.wlButtons[wl] = btnMesh;
    });

    this.group.add(this.laserGroup);
  }

  // ==================== C. 中央通用精密衍射变换台 (第 2 组滑鞍，方案 A 核心集成) ====================
  private buildUniversalDiffractionStage(): void {
    // 实例化第 2 组标准滑鞍 (X = -0.08，立柱高度严密贴合底部插套)
    const saddleData = this.createSliderSaddle(this.slitX, 'SlitSliderSaddle', 0.084);
    this.slitStageGroup = saddleData.saddleGroup;
    this.slitStageGroup.name = 'AdjustableSingleSlitStage';

    // 保持向后兼容别名与交互管理
    this.turretGroup = this.slitStageGroup;
    this.gratingHolderGroup = this.slitStageGroup;

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.38,
      roughness: 0.22,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.20,
      roughness: 0.45,
    });
    const trimSlateMat = new THREE.MeshStandardMaterial({
      color: 0x3d546b,
      metalness: 0.24,
      roughness: 0.40,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.32,
      roughness: 0.26,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.38,
      roughness: 0.30,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.60,
      roughness: 0.18,
    });
    const slateSlotMat = new THREE.MeshStandardMaterial({
      color: 0x1a2634,
      metalness: 0.18,
      roughness: 0.48,
    });

    // 1. 挡板底部镜面导杆夹持插套与锁紧螺钉 (钛晶灰蓝)
    const holderSocketGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.020, 24);
    const holderSocket = new THREE.Mesh(holderSocketGeo, titaniumSlateMat);
    holderSocket.position.set(0, this.beamHeightY - 0.052, 0);
    this.slitStageGroup.add(holderSocket);

    // 2. 德系精工航天级喷砂银铝挡板主体 (45° 倒角外廓，中央开设 Ø20mm 精密圆形光学通光孔径)
    const plateW = 0.068; // 宽度 (沿 Z 轴)
    const plateH = 0.098; // 高度 (沿 Y 轴)
    const chamfer = 0.014;

    const shape = new THREE.Shape();
    shape.moveTo(-plateW * 0.5, -plateH * 0.5);
    shape.lineTo(plateW * 0.5, -plateH * 0.5);
    shape.lineTo(plateW * 0.5, plateH * 0.5 - chamfer);
    shape.lineTo(plateW * 0.5 - chamfer, plateH * 0.5);
    shape.lineTo(-plateW * 0.5 + chamfer, plateH * 0.5);
    shape.lineTo(-plateW * 0.5, plateH * 0.5 - chamfer);
    shape.closePath();

    // 中央精密光学通光孔：直径 Ø20mm 标准科研通光口径 (彻底消除空洞大门感，符合科研级光学镜架造型)
    const apRadius = 0.010;
    const hole = new THREE.Path();
    hole.absarc(0, 0, apRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const plateGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.0032,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 2,
    });
    plateGeo.rotateY(Math.PI / 2); // 沿 YZ 平面竖立，迎向 X 轴光路

    const slitPlate = new THREE.Mesh(plateGeo, satinSilverMat);
    slitPlate.position.set(0, this.beamHeightY, 0);
    slitPlate.castShadow = true;
    this.slitStageGroup.add(slitPlate);

    // 通光孔精密香槟金光学镜圈 (面向激光器 +X 侧，外径 26mm，内径 18mm)
    const frontBezelGeo = new THREE.RingGeometry(0.009, 0.0135, 36);
    frontBezelGeo.rotateY(Math.PI / 2);
    const frontBezel = new THREE.Mesh(frontBezelGeo, brassMat);
    frontBezel.position.set(0.0020, this.beamHeightY, 0);
    this.slitStageGroup.add(frontBezel);

    const frontStepGeo = new THREE.TorusGeometry(0.0132, 0.0008, 16, 36);
    frontStepGeo.rotateY(Math.PI / 2);
    const frontStep = new THREE.Mesh(frontStepGeo, brassMat);
    frontStep.position.set(0.0022, this.beamHeightY, 0);
    this.slitStageGroup.add(frontStep);

    // 4 枚均布精密香槟金固定螺栓
    for (let i = 0; i < 4; i++) {
      const bAngle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bPinGeo = new THREE.CylinderGeometry(0.0010, 0.0010, 0.0018, 12);
      bPinGeo.rotateZ(Math.PI / 2);
      const bPin = new THREE.Mesh(bPinGeo, brassMat);
      bPin.position.set(0.0022, this.beamHeightY + Math.sin(bAngle) * 0.0115, Math.cos(bAngle) * 0.0115);
      this.slitStageGroup.add(bPin);
    }

    // 后端精密液态铬光学保护压环 (面向观察屏 -X 侧)
    const backBezelGeo = new THREE.RingGeometry(0.009, 0.0135, 36);
    backBezelGeo.rotateY(-Math.PI / 2);
    const backBezel = new THREE.Mesh(backBezelGeo, chromeRodMat);
    backBezel.position.set(-0.0020, this.beamHeightY, 0);
    this.slitStageGroup.add(backBezel);

    // 通光孔上下精密双铬合金导轨 (为两刀口片提供微米级横向导向滑槽)
    const railRodGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 0.030, 16);
    railRodGeo.rotateX(Math.PI / 2); // 沿 Z 轴横向架设
    const topGuideRail = new THREE.Mesh(railRodGeo, chromeRodMat);
    topGuideRail.position.set(0, this.beamHeightY + 0.0135, 0);
    this.slitStageGroup.add(topGuideRail);

    const bottomGuideRail = new THREE.Mesh(railRodGeo, chromeRodMat);
    bottomGuideRail.position.set(0, this.beamHeightY - 0.0135, 0);
    this.slitStageGroup.add(bottomGuideRail);

    // 挡板正面精细激光蚀刻对中十字刻线
    const crosshairMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.30,
      roughness: 0.50,
    });
    const chPositions = [
      { y: 0.016, z: 0, w: 0.0006, h: 0.004 },   // 12 点钟
      { y: -0.016, z: 0, w: 0.0006, h: 0.004 },  // 6 点钟
      { y: 0, z: -0.016, w: 0.004, h: 0.0006 },  // 9 点钟
      { y: 0, z: 0.016, w: 0.004, h: 0.0006 },   // 3 点钟
    ];
    chPositions.forEach(({ y, z, w, h }) => {
      const chGeo = new THREE.BoxGeometry(0.0004, h, w);
      const chMesh = new THREE.Mesh(chGeo, crosshairMat);
      chMesh.position.set(0.0020, this.beamHeightY + y, z);
      this.slitStageGroup.add(chMesh);
    });

    // 两侧经典 U 型压折导轨边缘 (可插放滤色片或狭缝插片)
    const lipGeo = new THREE.BoxGeometry(0.005, plateH, 0.0035);
    const lipLeft = new THREE.Mesh(lipGeo, trimSlateMat);
    lipLeft.position.set(0.002, this.beamHeightY, -plateW * 0.5 + 0.002);
    const lipRight = new THREE.Mesh(lipGeo, trimSlateMat);
    lipRight.position.set(0.002, this.beamHeightY, plateW * 0.5 - 0.002);
    this.slitStageGroup.add(lipLeft);
    this.slitStageGroup.add(lipRight);

    // 3. 多功能模式快速转换滚轮 (turretWheel，精密指槽铣切、双色轴盖、机械定位卡珠与悬浮提示)
    this.turretWheel = new THREE.Group();
    this.turretWheel.name = 'SlitTurretWheel';
    this.turretWheel.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.position.set(0, this.beamHeightY - 0.038, -plateW * 0.5 - 0.016);

    // 香槟金滚轮主体 (外径 28mm，厚 13mm)
    const wheelGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.013, 32);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMesh = new THREE.Mesh(wheelGeo, brassMat);
    wheelMesh.name = 'SlitTurretWheelMesh';
    wheelMesh.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.add(wheelMesh);

    // 16 道真实机械圆弧防滑指槽 (立体圆柱咬合切槽)
    for (let f = 0; f < 16; f++) {
      const fAngle = (f / 16) * Math.PI * 2;
      const fluteGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.0132, 8);
      fluteGeo.rotateX(Math.PI / 2);
      const flute = new THREE.Mesh(fluteGeo, brassMat);
      flute.position.set(Math.cos(fAngle) * 0.0138, Math.sin(fAngle) * 0.0138, 0);
      flute.userData = { interactiveId: 'slit_turret' };
      this.turretWheel.add(flute);
    }

    // 镜面液态铬中心端盖与轴套
    const wheelCapGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.015, 24);
    wheelCapGeo.rotateX(Math.PI / 2);
    const wheelCap = new THREE.Mesh(wheelCapGeo, chromeRodMat);
    wheelCap.userData = { interactiveId: 'slit_turret' };
    this.turretWheel.add(wheelCap);

    // 4个象限精密模式激光蚀刻指示刻度
    const quadrantOffsets = [
      { angle: 0, count: 1 },             // 0°: 单缝 (I)
      { angle: Math.PI * 0.5, count: 2 }, // 90°: 双缝 (II)
      { angle: Math.PI, count: 0 },       // 180°: 圆孔 (○)
      { angle: Math.PI * 1.5, count: 3 }, // 270°: 光栅 (III)
    ];
    quadrantOffsets.forEach(({ angle, count }) => {
      if (count === 0) {
        const ringGeo = new THREE.RingGeometry(0.002, 0.0032, 16);
        const ringMesh = new THREE.Mesh(ringGeo, titaniumSlateMat);
        ringMesh.position.set(Math.cos(angle) * 0.0095, Math.sin(angle) * 0.0095, 0.0068);
        this.turretWheel.add(ringMesh);
      } else {
        for (let i = 0; i < count; i++) {
          const tickGeo = new THREE.BoxGeometry(0.0006, 0.0035, 0.0004);
          const tick = new THREE.Mesh(tickGeo, titaniumSlateMat);
          const offset = (i - (count - 1) * 0.5) * 0.0016;
          tick.position.set(Math.cos(angle) * 0.0095 + offset, Math.sin(angle) * 0.0095, 0.0068);
          this.turretWheel.add(tick);
        }
      }
    });

    // 依据用户反馈与光学实验室人体工学规范：
    // 中间实验器材设计必须合理自然，旋钮仅需在面对操作者一侧 (+Z) 存在即可，
    // 背对操作者一侧 (-Z) 绝不出现多余、突兀的旋钮或部件。
    // 因此 turretWheel、detentPin、turretHoverCue 不挂载入 slitStageGroup 场景树
    // (仅保留对象引用以确保向后兼容与接口稳定性)
    // this.slitStageGroup.add(this.turretWheel);

    // 转换轮顶部机械弹簧钢珠定位销 (弹簧卡珠物理实体)
    const detentPinGeo = new THREE.SphereGeometry(0.0028, 16, 16);
    const detentPin = new THREE.Mesh(detentPinGeo, chromeRodMat);
    detentPin.position.set(0, this.beamHeightY - 0.038 + 0.0145, -plateW * 0.5 - 0.016);
    // this.slitStageGroup.add(detentPin);

    // 转换轮 3D 原生悬浮提示引导环 (未接触前呈现柔和微光，交互后彻底消失)
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
    this.turretHoverCue.position.set(0, this.beamHeightY - 0.038, -plateW * 0.5 - 0.016);
    this.turretHoverCue.visible = false;
    // this.slitStageGroup.add(this.turretHoverCue);

    // 4. 中心精密光学发蓝钢可调单缝刀口 (左刀口与右刀口，精研超窄斜面刃口，严密遮光无漏光)
    const jawHeight = 0.024; // 高度 24mm，完全覆盖 18mm 通光孔径，杜绝上下露空
    const jawThickX = 0.0022;
    const jawDepthZ = 0.015; // 宽度 15mm，单片覆盖半边通光孔
    const jawGeo = new THREE.BoxGeometry(jawThickX, jawHeight, jawDepthZ);

    const bluedSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // 深沉发蓝光学研磨钢，纯正工业级遮光吸光刀口
      metalness: 0.52,
      roughness: 0.30,
    });
    const groundEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // 镜面抛光液态铬精研刃口，捕获清脆高光
      metalness: 0.88,
      roughness: 0.10,
    });

    // 左刀口片主体与精研刃口倒角斜面
    this.leftJawMesh = new THREE.Mesh(jawGeo, bluedSteelMat);
    this.leftJawMesh.name = 'SlitLeftJaw';
    this.leftJawMesh.position.set(0, this.beamHeightY, -jawDepthZ * 0.5);
    this.leftJawMesh.castShadow = true;

    // 左刃口精研 45° 高反光高精度倒角倒棱
    const bevelEdgeGeo = new THREE.BoxGeometry(0.0006, jawHeight, 0.0008);
    const leftBevelEdge = new THREE.Mesh(bevelEdgeGeo, groundEdgeMat);
    leftBevelEdge.position.set(0.0008, 0, jawDepthZ * 0.5 - 0.0004);
    this.leftJawMesh.add(leftBevelEdge);

    // 左滑块导套配件 (黄铜精密轴套)
    const leftSleeveGeo = new THREE.BoxGeometry(0.0030, 0.0025, 0.0040);
    const leftTopSleeve = new THREE.Mesh(leftSleeveGeo, brassMat);
    leftTopSleeve.position.set(0, 0.011, 0);
    this.leftJawMesh.add(leftTopSleeve);
    const leftBotSleeve = new THREE.Mesh(leftSleeveGeo, brassMat);
    leftBotSleeve.position.set(0, -0.011, 0);
    this.leftJawMesh.add(leftBotSleeve);

    this.slitStageGroup.add(this.leftJawMesh);

    // 右刀口片主体与精研刃口倒角斜面
    this.rightJawMesh = new THREE.Mesh(jawGeo, bluedSteelMat);
    this.rightJawMesh.name = 'SlitRightJaw';
    this.rightJawMesh.position.set(0, this.beamHeightY, jawDepthZ * 0.5);
    this.rightJawMesh.castShadow = true;

    const rightBevelEdge = new THREE.Mesh(bevelEdgeGeo, groundEdgeMat);
    rightBevelEdge.position.set(0.0008, 0, -jawDepthZ * 0.5 + 0.0004);
    this.rightJawMesh.add(rightBevelEdge);

    const rightTopSleeve = new THREE.Mesh(leftSleeveGeo, brassMat);
    rightTopSleeve.position.set(0, 0.011, 0);
    this.rightJawMesh.add(rightTopSleeve);
    const rightBotSleeve = new THREE.Mesh(leftSleeveGeo, brassMat);
    rightBotSleeve.position.set(0, -0.011, 0);
    this.rightJawMesh.add(rightBotSleeve);

    this.slitStageGroup.add(this.rightJawMesh);

    // 刀口正面激光入射截光光斑 (呈现准直激光束照射在金属刀口上的真实截光光斑)
    const incidentSpotGeo = new THREE.CircleGeometry(0.0022, 24);
    incidentSpotGeo.rotateY(Math.PI / 2);
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const incidentSpotMat = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: 0.90,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.laserIncidentSpotMesh = new THREE.Mesh(incidentSpotGeo, incidentSpotMat);
    this.laserIncidentSpotMesh.name = 'LaserIncidentSpotMesh';
    this.laserIncidentSpotMesh.position.set(0.0024, this.beamHeightY, 0);
    this.laserIncidentSpotMesh.visible = this.laserPower && (this.diffractionType === 'single');
    this.slitStageGroup.add(this.laserIncidentSpotMesh);

    // 狭缝内高亮立体透光细缝光芯 (从缝隙穿透的高亮度纤细激光束)
    const slitLightGeo = new THREE.BoxGeometry(0.004, 0.020, 1.0);
    this.slitLightMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.slitLightMesh = new THREE.Mesh(slitLightGeo, this.slitLightMaterial);
    this.slitLightMesh.name = 'SlitLightBeam';
    this.slitLightMesh.position.set(0, this.beamHeightY, 0);

    // 内部极亮高对比度中心光芯 (重现激光透射中心白炽辉光)
    const slitCoreGeo = new THREE.BoxGeometry(0.0042, 0.018, 1.0);
    const slitCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slitCoreMesh = new THREE.Mesh(slitCoreGeo, slitCoreMat);
    slitCoreMesh.name = 'SlitLightCore';
    this.slitLightMesh.add(slitCoreMesh);

    this.slitStageGroup.add(this.slitLightMesh);

    // 双缝模式插片 (当模式切换至双缝时呈现：深色光学插片 + 两条平行相干透光狭缝 S1 & S2)
    this.doubleSlitInsertMesh = new THREE.Group();
    this.doubleSlitInsertMesh.name = 'DoubleSlitInsertMesh';
    this.doubleSlitInsertMesh.position.set(0, this.beamHeightY, 0);
    this.doubleSlitInsertMesh.visible = false;

    const insertDiskGeo = new THREE.CylinderGeometry(0.0088, 0.0088, 0.0020, 32);
    insertDiskGeo.rotateZ(Math.PI / 2);
    const insertPlate = new THREE.Mesh(insertDiskGeo, bluedSteelMat);
    this.doubleSlitInsertMesh.add(insertPlate);

    const dsBeamGeo = new THREE.BoxGeometry(0.004, 0.016, 0.0009);
    const dsBeam1 = new THREE.Mesh(dsBeamGeo, this.slitLightMaterial);
    dsBeam1.position.set(0, 0, -0.0022);
    this.doubleSlitInsertMesh.add(dsBeam1);
    const dsBeam2 = new THREE.Mesh(dsBeamGeo, this.slitLightMaterial);
    dsBeam2.position.set(0, 0, 0.0022);
    this.doubleSlitInsertMesh.add(dsBeam2);

    this.slitStageGroup.add(this.doubleSlitInsertMesh);

    // 精密圆孔模式插片 (当模式切换至圆孔时呈现：带中央透光小孔的深色遮光插片)
    this.circularInsertMesh = new THREE.Group();
    this.circularInsertMesh.name = 'CircularApertureInsertMesh';
    this.circularInsertMesh.position.set(0, this.beamHeightY, 0);
    this.circularInsertMesh.visible = false;

    const circPlate = new THREE.Mesh(insertDiskGeo, bluedSteelMat);
    this.circularInsertMesh.add(circPlate);

    const circBezelGeo = new THREE.TorusGeometry(0.0035, 0.0006, 16, 32);
    circBezelGeo.rotateY(Math.PI / 2);
    const circBezel = new THREE.Mesh(circBezelGeo, brassMat);
    this.circularInsertMesh.add(circBezel);

    const circSpotGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.004, 24);
    circSpotGeo.rotateZ(Math.PI / 2);
    const circSpot = new THREE.Mesh(circSpotGeo, this.slitLightMaterial);
    this.circularInsertMesh.add(circSpot);

    this.slitStageGroup.add(this.circularInsertMesh);

    // 5. 精密微米鼓轮与侧边测微调节把手 (Mitutoyo/Thorlabs 精密测微螺杆装配体，旋钮加大且扁平紧凑，严禁长管突起)
    this.micrometerThimbleGroup = new THREE.Group();
    this.micrometerThimbleGroup.name = 'MicrometerThimbleGroup';
    this.micrometerThimbleGroup.position.set(0, this.beamHeightY - 0.038, plateW * 0.5 + 0.002);

    // a. 基座精密刻度固定套筒与锁母 (Fixed Vernier Barrel Sleeve & Hex Locknut)
    // 根部香槟金精密锁母 (Locknut Collar)
    const locknutGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.0022, 32);
    locknutGeo.rotateX(Math.PI / 2);
    const locknut = new THREE.Mesh(locknutGeo, brassMat);
    locknut.position.set(0, 0, 0.0011);
    locknut.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(locknut);

    // 基座固定套筒 (Sleeve Mesh)
    const sleeveGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.0042, 32);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, chromeRodMat);
    sleeveMesh.position.set(0, 0, 0.0028);
    sleeveMesh.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(sleeveMesh);

    // 套筒基准读数水平基线与微米分度刻线 (Laser-Etched Datum Line & Graduations)
    const datumGeo = new THREE.BoxGeometry(0.0006, 0.0004, 0.0036);
    const datumMesh = new THREE.Mesh(datumGeo, titaniumSlateMat);
    datumMesh.position.set(0, 0.0136, 0.0028);
    datumMesh.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(datumMesh);

    for (let i = 0; i <= 3; i++) {
      const tickGeo = new THREE.BoxGeometry(0.0024, 0.0004, 0.0004);
      const tick = new THREE.Mesh(tickGeo, titaniumSlateMat);
      tick.position.set(0, 0.0136, 0.0014 + i * 0.0009);
      tick.userData = { interactiveId: 'slit_micrometer' };
      this.micrometerThimbleGroup.add(tick);
    }

    // b. 可旋转大直径紧凑精密测微手轮/微分筒 (Rotating Thimble Handwheel Assembly)
    // 旋钮做大 (直径由原来的 18.4mm 加大到 35mm)，轴向厚度紧凑平整 (由原来的 41mm 突起缩短为约 14mm)，杜绝多余长杆
    const knobRadius = 0.0175; // 大直径 35mm
    const knobLength = 0.0080; // 紧凑轴向厚度 8mm
    const knobGeo = new THREE.CylinderGeometry(knobRadius, knobRadius, knobLength, 36);
    knobGeo.rotateX(Math.PI / 2);
    this.micrometerKnob = new THREE.Mesh(knobGeo, brassMat);
    this.micrometerKnob.name = 'SlitMicrometerKnob';
    this.micrometerKnob.position.set(0, 0, 0.0068);
    this.micrometerKnob.userData = { interactiveId: 'slit_micrometer' };

    // 读数端精密 45° 倒角游标环 (Beveled Vernier Collar)
    const bevelGeo = new THREE.CylinderGeometry(0.0138, knobRadius, 0.0024, 36);
    bevelGeo.rotateX(Math.PI / 2);
    const bevelCollar = new THREE.Mesh(bevelGeo, chromeRodMat);
    bevelCollar.position.set(0, 0, -knobLength * 0.5 - 0.0010);
    bevelCollar.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(bevelCollar);

    // 倒角游标环周向激光分度线 (12 条等分微米分度线)
    for (let i = 0; i < 12; i++) {
      const vAngle = (i / 12) * Math.PI * 2;
      const vTickGeo = new THREE.BoxGeometry(0.0005, 0.0018, 0.0022);
      const vTick = new THREE.Mesh(vTickGeo, titaniumSlateMat);
      vTick.position.set(Math.cos(vAngle) * 0.0152, Math.sin(vAngle) * 0.0152, -knobLength * 0.5 - 0.0010);
      vTick.rotation.z = vAngle;
      vTick.userData = { interactiveId: 'slit_micrometer' };
      bevelCollar.add(vTick);
    }

    // 32 道精密机械防滑滚花棱纹 (Precision Knurling Flutes)
    for (let i = 0; i < 32; i++) {
      const kAngle = (i / 32) * Math.PI * 2;
      const ribGeo = new THREE.BoxGeometry(0.0007, 0.0007, knobLength - 0.0006);
      const rib = new THREE.Mesh(ribGeo, brassMat);
      rib.position.set(Math.cos(kAngle) * (knobRadius + 0.0001), Math.sin(kAngle) * (knobRadius + 0.0001), 0);
      rib.rotation.z = kAngle;
      rib.userData = { interactiveId: 'slit_micrometer' };
      this.micrometerKnob.add(rib);
    }

    // 滚花鼓轮两端高光镜面滚边倒角 (Liquid Chrome Chamfered Rims)
    const rimFrontGeo = new THREE.CylinderGeometry(knobRadius + 0.0001, knobRadius + 0.0001, 0.0006, 36);
    rimFrontGeo.rotateX(Math.PI / 2);
    const rimFront = new THREE.Mesh(rimFrontGeo, chromeRodMat);
    rimFront.position.set(0, 0, knobLength * 0.5 - 0.0003);
    rimFront.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(rimFront);

    const rimBackGeo = new THREE.CylinderGeometry(knobRadius + 0.0001, knobRadius + 0.0001, 0.0006, 36);
    rimBackGeo.rotateX(Math.PI / 2);
    const rimBack = new THREE.Mesh(rimBackGeo, chromeRodMat);
    rimBack.position.set(0, 0, -knobLength * 0.5 + 0.0003);
    rimBack.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(rimBack);

    // 正面精致同心倒角阶梯端面 (Front Face Chamfer & Inset Precision Dial Cap, 平整紧凑不向外突伸)
    const frontBevelGeo = new THREE.CylinderGeometry(0.0150, knobRadius, 0.0014, 36);
    frontBevelGeo.rotateX(Math.PI / 2);
    const frontBevel = new THREE.Mesh(frontBevelGeo, brassMat);
    frontBevel.position.set(0, 0, knobLength * 0.5 + 0.0007);
    frontBevel.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(frontBevel);

    const stepRingGeo = new THREE.CylinderGeometry(0.0110, 0.0110, 0.0010, 32);
    stepRingGeo.rotateX(Math.PI / 2);
    const stepRing = new THREE.Mesh(stepRingGeo, chromeRodMat);
    stepRing.position.set(0, 0, knobLength * 0.5 + 0.0012);
    stepRing.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(stepRing);

    const centerHubGeo = new THREE.CylinderGeometry(0.0070, 0.0070, 0.0014, 24);
    centerHubGeo.rotateX(Math.PI / 2);
    const centerHub = new THREE.Mesh(centerHubGeo, brassMat);
    centerHub.position.set(0, 0, knobLength * 0.5 + 0.0018);
    centerHub.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(centerHub);

    // 顶端精密车削对中凹坑 (Lathe Center Dimple)
    const dimpleGeo = new THREE.SphereGeometry(0.0022, 16, 16);
    const dimple = new THREE.Mesh(dimpleGeo, titaniumSlateMat);
    dimple.position.set(0, 0, knobLength * 0.5 + 0.0022);
    dimple.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.add(dimple);

    this.micrometerThimbleGroup.add(this.micrometerKnob);

    // c. 测微鼓轮 3D 原生悬浮提示引导光晕环 (适配大旋钮轮廓，未接触前柔和微光)
    const micrometerCueGeo = new THREE.TorusGeometry(0.0210, 0.0008, 16, 48, Math.PI * 1.6);
    micrometerCueGeo.rotateX(Math.PI / 2);
    const micrometerCueMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    });
    this.micrometerHoverCue = new THREE.Mesh(micrometerCueGeo, micrometerCueMat);
    this.micrometerHoverCue.name = 'MicrometerHoverCue';
    this.micrometerHoverCue.position.set(0, 0, 0.0068);
    this.micrometerHoverCue.visible = false;
    this.micrometerThimbleGroup.add(this.micrometerHoverCue);

    this.slitStageGroup.add(this.micrometerThimbleGroup);

    // 6. 光栅透射元件玻片与顶部香槟金滚花螺母压紧结构 (当模式切换至光栅时呈现)
    const slideCanvas = safeCanvas(512, 512);
    let slideTex: THREE.CanvasTexture | null = null;
    if (slideCanvas) {
      const ctx = slideCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        ctx.strokeStyle = 'rgba(70, 75, 85, 0.75)';
        ctx.lineWidth = 1.2;
        for (let x = 60; x <= 452; x += 6) {
          ctx.beginPath();
          ctx.moveTo(x, 40);
          ctx.lineTo(x, 472);
          ctx.stroke();
        }
      }
      slideTex = new THREE.CanvasTexture(slideCanvas);
    }

    const slideGeo = new THREE.BoxGeometry(0.002, 0.060, 0.054);
    const slideMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.60,
      roughness: 0.10,
      metalness: 0.20,
      map: slideTex,
    });
    this.gratingSlideMesh = new THREE.Mesh(slideGeo, slideMat);
    this.gratingSlideMesh.name = 'GratingSlideMesh';
    this.gratingSlideMesh.position.set(0, this.beamHeightY, 0);
    this.gratingSlideMesh.visible = (this.diffractionType === 'grating');
    this.slitStageGroup.add(this.gratingSlideMesh);

    // 顶部横梁与两枚精致香槟金滚花手轮螺栓 (压紧玻片)
    const topBarGeo = new THREE.BoxGeometry(0.005, 0.010, plateW * 0.75);
    const topBar = new THREE.Mesh(topBarGeo, titaniumSlateMat);
    topBar.position.set(0, this.beamHeightY + plateH * 0.44, 0);
    this.slitStageGroup.add(topBar);

    const screwZOffsets = [-plateW * 0.26, plateW * 0.26];
    screwZOffsets.forEach((zOffset) => {
      const screwGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.010, 20);
      screwGeo.rotateZ(Math.PI / 2);
      const screw = new THREE.Mesh(screwGeo, brassMat);
      screw.position.set(0.004, this.beamHeightY + plateH * 0.44, zOffset);
      this.slitStageGroup.add(screw);
    });

    // 7. 缝宽纯文字 3D 浮空显示 (大字号、深色高对比度、纯文字无背景/边框方形UI)
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
      this.slitPlateMesh.position.set(0, this.beamHeightY + plateH * 0.5 + 0.030, 0);
      this.slitStageGroup.add(this.slitPlateMesh);
      this.updateSlitPlateLabel();
    } else {
      const dummyMat = new THREE.SpriteMaterial();
      this.slitPlateMesh = new THREE.Sprite(dummyMat);
      this.slitPlateMesh.raycast = () => {};
    }

    this.group.add(this.slitStageGroup);
  }

  // 向后兼容接口存根
  public buildAdjustableSingleSlitStage(): void {
    if (!this.slitStageGroup) this.buildUniversalDiffractionStage();
  }
  public buildGratingHolder(): void {
    // 方案 A 已合并至通用衍射台，无需生成冗余滑鞍
  }

  // ==================== E. 深海蓝黑高对比度投影接收屏 (第 4 组滑鞍，实物 1:1 复刻) ====================
  private buildObservationScreen(): void {
    // 实例化第 4 组标准滑鞍 (X = 0.38，立柱高度 0.034m 恰好承托底部卡座，杜绝立柱穿屏遮挡光路)
    const saddleData = this.createSliderSaddle(this.maxScreenX, 'ScreenCarrierGroup', 0.034);
    this.screenCarrierGroup = saddleData.saddleGroup;
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';
    this.screenCarrierGroup.userData = { interactiveId: 'screen_handle' };

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.60,
      roughness: 0.18,
    });
    const titaniumSlateMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.20,
      roughness: 0.45,
    });
    const trimSlateMat = new THREE.MeshStandardMaterial({
      color: 0x3d546b,
      metalness: 0.24,
      roughness: 0.40,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.38,
      roughness: 0.30,
    });

    // 1. 屏幕总成面板 (面向操作者视角，微偏转迎向左侧入射光轴)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamHeightY, 0);
    this.screenPanelGroup.rotation.y = -0.28; // 正对操作者视界，同时平滑迎向光束

    // 2. 德系深空钛晶灰蓝精工背板与边框 (宽 0.28m, 高 0.20m，工业级倒角与金属质感，与浅白背景清晰分明)
    const screenW = 0.28;
    const screenH = 0.20;
    const screenD = 0.003;

    const boardGeo = new THREE.BoxGeometry(screenW, screenH, screenD);
    const screenBoard = new THREE.Mesh(boardGeo, titaniumSlateMat);
    screenBoard.castShadow = true;
    screenBoard.name = 'ScreenBoardMesh';
    screenBoard.userData = { interactiveId: 'screen_handle' };
    this.screenPanelGroup.add(screenBoard);

    // 底部钛晶灰蓝立柱夹持锁紧块 (配香槟金锁紧手轮)
    const mountGeo = new THREE.BoxGeometry(0.032, 0.016, 0.018);
    const mountMesh = new THREE.Mesh(mountGeo, titaniumSlateMat);
    mountMesh.position.set(0, -screenH * 0.5 - 0.008, 0);
    this.screenPanelGroup.add(mountMesh);

    const mountKnobGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.008, 16);
    mountKnobGeo.rotateZ(Math.PI / 2);
    const mountKnob = new THREE.Mesh(mountKnobGeo, brassMat);
    mountKnob.position.set(0.018, -screenH * 0.5 - 0.008, 0);
    this.screenPanelGroup.add(mountKnob);

    // 3. 屏幕核心显示平面 (1024x1024 高精动态 CanvasTexture，深邃海洋蓝黑高对比底色，极致生动呈现物理光斑)
    this.screenCanvas = safeCanvas(1024, 1024);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.anisotropy = 8;
    }

    const screenSurfaceGeo = new THREE.PlaneGeometry(screenW - 0.006, screenH - 0.006);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
    });
    this.screenMesh = new THREE.Mesh(screenSurfaceGeo, screenMat);
    this.screenMesh.name = 'ScreenSurfaceMesh';
    this.screenMesh.userData = { interactiveId: 'screen_surface' };
    this.screenMesh.position.set(0, 0, screenD * 0.505);
    this.screenPanelGroup.add(this.screenMesh);

    this.screenCarrierGroup.add(this.screenPanelGroup);
    this.group.add(this.screenCarrierGroup);
  }

  // ==================== F. 3D 空气漫散射真实激光光路系统 ====================
  private buildOpticalBeams(): void {
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.75 : 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 1. 灯箱到通用衍射台的准直激光光束 (精细准直激光，光束纤细明亮，沿 +X 传播)
    const distPre = Math.abs(this.slitX - this.laserX);
    const preGeo = new THREE.CylinderGeometry(0.0016, 0.0016, distPre, 16);
    preGeo.rotateZ(Math.PI / 2);
    this.preBeamMesh = new THREE.Mesh(preGeo, this.beamMaterial);
    this.preBeamMesh.position.set((this.laserX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamMesh);

    // 2. 占位中间光束 (保持向后兼容接口，方案 A 无冗余中间光束，设为不可见)
    const midGeo = new THREE.BufferGeometry();
    this.midBeamMesh = new THREE.Mesh(midGeo, this.beamMaterial);
    this.midBeamMesh.visible = false;
    this.group.add(this.midBeamMesh);

    // 3. 通用衍射台到观测屏的衍射发散光羽 (随狭缝/孔径与屏距动态展开)
    const postGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(9);
    postGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.postBeamMesh = new THREE.Mesh(postGeo, this.beamMaterial);
    this.group.add(this.postBeamMesh);

    // 4. 光栅离散分光衍射射线组
    this.gratingRaysGroup = new THREE.Group();
    this.gratingRaysGroup.name = 'GratingRaysGroup';
    this.group.add(this.gratingRaysGroup);
  }

  // ==================== 物理运动学与刀口开度同步 ====================
  private updateSlitKinematics(): void {
    // 依据真实光学单缝尺度设计，在 3D 台前呈现精致、清晰、纤细的真实物理细缝 (决非空洞大窗)
    // a = 0.02mm 对应 3D 视觉开度 ~0.6mm; a = 0.08mm 对应 ~1.2mm; a = 0.25mm 对应 ~2.8mm
    const visualGap = 0.0004 + (this.slitWidthMm / 0.25) * 0.0024;
    const halfJawDepth = 0.015 * 0.5;

    if (this.leftJawMesh) {
      this.leftJawMesh.position.z = -halfJawDepth - visualGap * 0.5;
    }
    if (this.rightJawMesh) {
      this.rightJawMesh.position.z = halfJawDepth + visualGap * 0.5;
    }

    // 缝隙透光立体光柱随缝宽同步开合
    if (this.slitLightMesh) {
      this.slitLightMesh.scale.z = Math.max(0.0004, visualGap * 0.96);
      this.slitLightMesh.scale.x = 0.8 + (this.slitWidthMm / 0.25) * 1.5;
      this.slitLightMesh.visible = this.laserPower && (this.diffractionType === 'single');
    }

    if (this.laserIncidentSpotMesh) {
      this.laserIncidentSpotMesh.visible = this.laserPower && (this.diffractionType === 'single');
    }

    if (this.micrometerKnob) {
      this.micrometerKnob.rotation.z = (this.slitWidthMm / 0.25) * Math.PI * 8.0;
      const axialTravel = ((this.slitWidthMm - 0.02) / (0.25 - 0.02)) * 0.0018;
      this.micrometerKnob.position.z = 0.0068 + axialTravel;
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

    // 缝隙只用大的颜色深的字来显示，彻底杜绝任何方形 UI、边框或背景框
    let labelText = '';
    switch (this.diffractionType) {
      case 'single':
        labelText = `单缝 a = ${this.slitWidthMm.toFixed(2)} mm`;
        break;
      case 'double':
        labelText = `双缝 d = ${this.slitDistanceMm.toFixed(2)} mm`;
        break;
      case 'circular':
        labelText = `圆孔 D = ${this.apertureDiameterMm.toFixed(2)} mm`;
        break;
      case 'grating':
        labelText = `光栅 N = ${this.gratingLinesPerMm} lines/mm`;
        break;
      default:
        labelText = `单缝 a = ${this.slitWidthMm.toFixed(2)} mm`;
        break;
    }

    if (typeof ctx.save === 'function') ctx.save();
    // 纯文字、大号粗体、深色高对比度 (Slate-900)，带柔和微弱白色光晕确保任何环境下一目了然
    ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#0f172a'; // 纯净深沉 Slate-900，颜色深且醒目
    ctx.fillText(labelText, w / 2, h / 2);
    if (typeof ctx.restore === 'function') ctx.restore();

    this.slitPlateTexture.needsUpdate = true;
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
  }

  public setScreenCarrierX(localX: number): void {
    const clampedX = THREE.MathUtils.clamp(localX, this.minScreenX, this.maxScreenX);
    if (this.screenCarrierGroup) {
      this.screenCarrierGroup.position.x = clampedX;
    }

    const norm = (clampedX - this.minScreenX) / (this.maxScreenX - this.minScreenX);
    this.screenDistanceM = 0.30 + norm * (0.85 - 0.30);
    this.isScreenDirty = true;
  }

  public getScreenCarrierX(): number {
    return this.screenCarrierGroup ? this.screenCarrierGroup.position.x : this.maxScreenX;
  }

  // ==================== 参数设定方法 ====================
  public setSlitWidth(wMm: number): void {
    this.slitWidthMm = THREE.MathUtils.clamp(wMm, 0.02, 0.25);
    this.updateSlitKinematics();
    this.isScreenDirty = true;
  }

  public setWavelength(wlNm: number): void {
    this.wavelengthNm = THREE.MathUtils.clamp(wlNm, 380, 750);
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    if (this.beamMaterial) {
      this.beamMaterial.color.copy(colorRGB);
    }
    if (this.slitLightMaterial) {
      this.slitLightMaterial.color.copy(colorRGB);
    }
    if (this.laserIncidentSpotMesh) {
      (this.laserIncidentSpotMesh.material as THREE.MeshBasicMaterial).color.copy(colorRGB);
    }
    if (this.laserLedMesh) {
      (this.laserLedMesh.material as THREE.MeshBasicMaterial).color.copy(colorRGB);
    }

    for (const [wlStr, btn] of Object.entries(this.wlButtons)) {
      const wl = Number(wlStr);
      const isCur = Math.abs(this.wavelengthNm - wl) < 15;
      const bColor = OpticalPhysics.wavelengthToColor(wl);
      const mat = btn.material as THREE.MeshStandardMaterial;
      mat.color.copy(isCur ? bColor : new THREE.Color(0x94a3b8));
      mat.emissive.copy(isCur ? bColor : new THREE.Color(0x000000));
      mat.emissiveIntensity = isCur ? 0.6 : 0;
    }

    this.isScreenDirty = true;
  }

  public setLaserPower(on: boolean): void {
    this.laserPower = on;
    if (this.beamMaterial) {
      this.beamMaterial.opacity = on ? 0.70 : 0.0;
    }
    if (this.slitLightMesh) {
      this.slitLightMesh.visible = on && (this.diffractionType === 'single');
    }
    if (this.laserIncidentSpotMesh) {
      this.laserIncidentSpotMesh.visible = on && (this.diffractionType === 'single');
    }
    if (this.laserLedMesh) {
      (this.laserLedMesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.98 : 0.15;
    }
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.isScreenDirty = true;
  }

  public updateElementVisibility(): void {
    const rotMap: Record<DiffractionType, number> = {
      single: 0,
      double: Math.PI * 0.5,
      circular: Math.PI,
      grating: Math.PI * 1.5,
    };
    this.targetTurretAngle = rotMap[this.diffractionType] ?? 0;

    if (this.leftJawMesh) {
      this.leftJawMesh.visible = (this.diffractionType === 'single');
    }
    if (this.rightJawMesh) {
      this.rightJawMesh.visible = (this.diffractionType === 'single');
    }
    if (this.micrometerThimbleGroup) {
      this.micrometerThimbleGroup.visible = (this.diffractionType === 'single');
    }
    if (this.slitLightMesh) {
      this.slitLightMesh.visible = this.laserPower && (this.diffractionType === 'single');
    }
    if (this.laserIncidentSpotMesh) {
      this.laserIncidentSpotMesh.visible = this.laserPower && (this.diffractionType === 'single');
    }
    if (this.doubleSlitInsertMesh) {
      this.doubleSlitInsertMesh.visible = (this.diffractionType === 'double');
    }
    if (this.circularInsertMesh) {
      this.circularInsertMesh.visible = (this.diffractionType === 'circular');
    }
    if (this.gratingSlideMesh) {
      this.gratingSlideMesh.visible = (this.diffractionType === 'grating');
    }
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

  public setDiffractionType(type: DiffractionType): void {
    this.diffractionType = type;
    this.updateElementVisibility();
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public cycleNextDiffractionType(): void {
    const order: DiffractionType[] = ['single', 'double', 'circular', 'grating'];
    const idx = order.indexOf(this.diffractionType);
    this.diffractionType = order[(idx + 1) % order.length];
    this.updateElementVisibility();
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public setSlitDistance(dMm: number): void {
    this.slitDistanceMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public setApertureDiameter(dMm: number): void {
    this.apertureDiameterMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public setGratingDensity(linesPerMm: number): void {
    this.gratingLinesPerMm = THREE.MathUtils.clamp(linesPerMm, 50, 1000);
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public update(delta: number): void {
    const dt = delta || 0.016;

    // 转换轮阻尼机械弹簧棘爪平滑旋转动效 (Damped mechanical snap rotation)
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

    // 悬浮提示环细腻微光缓动旋转
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
  }

  // ==================== 深邃海洋蓝黑观测屏物理衍射光像渲染 (高对比度科研呈现) ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.diffractionType}_${this.wavelengthNm}_${this.laserPower}_${this.slitWidthMm.toFixed(3)}_${this.slitDistanceMm.toFixed(3)}_${this.apertureDiameterMm.toFixed(3)}_${this.gratingLinesPerMm}_${this.screenDistanceM.toFixed(3)}`;
    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 深邃海洋蓝黑高对比底色 (Deep Oceanic Sapphire: #08101e)
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    // 光源关闭时，屏幕为纯净深邃蓝黑底色，无任何多余文字或图案
    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 2. 真实物理 Fraunhofer 衍射与干涉高动态光像渲染
    const colorInfo = OpticalPhysics.wavelengthToRGB(this.wavelengthNm);
    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // 屏幕水平物理跨度：-35mm 到 +35mm (70mm 总宽)
    const physicalHalfSpanMm = 35.0;
    const pxPerMm = (w * 0.5) / physicalHalfSpanMm;

    const rBase = Math.round(colorInfo.r * 255);
    const gBase = Math.round(colorInfo.g * 255);
    const bBase = Math.round(colorInfo.b * 255);

    if (this.diffractionType === 'circular') {
      // 圆孔衍射：高精度真实二维同心圆环艾里斑 (Airy Disk)
      const maxRadiusPx = Math.min(centerX, centerY);
      for (let rPx = 0; rPx <= maxRadiusPx; rPx++) {
        const rM = (rPx / pxPerMm) * 1e-3;
        const I = OpticalPhysics.calculateCircularApertureIntensity(
          rM,
          this.wavelengthNm,
          this.apertureDiameterMm,
          this.screenDistanceM
        );

        if (I > 0.0001) {
          // 伽马非线性映射 (gamma = 0.38)，使第 1、第 2 次级亮环清晰可辨
          const gammaI = Math.pow(Math.min(1.0, I), 0.38);
          const coreMix = Math.max(0, (I - 0.20) / 0.80);
          const r = Math.min(255, Math.round(rBase + (255 - rBase) * coreMix));
          const g = Math.min(255, Math.round(gBase + (255 - gBase) * coreMix));
          const b = Math.min(255, Math.round(bBase + (255 - bBase) * coreMix));

          const alpha = Math.min(1.0, gammaI * 1.35);
          ctx.beginPath();
          ctx.arc(centerX, centerY, rPx, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    } else {
      // 单缝、双缝、光栅衍射：高清晰、高饱和度竖直干涉与衍射条纹
      const patternHalfH = 380;

      for (let px = 0; px < w; px++) {
        const xMm = (px - centerX) / pxPerMm;
        const xM = xMm * 1e-3;

        let I = 0;
        if (this.diffractionType === 'single') {
          I = OpticalPhysics.calculateSingleSlitIntensity(
            xM,
            this.wavelengthNm,
            this.slitWidthMm,
            this.screenDistanceM
          );
        } else if (this.diffractionType === 'double') {
          I = OpticalPhysics.calculateDoubleSlitIntensity(
            xM,
            this.wavelengthNm,
            this.slitWidthMm,
            this.slitDistanceMm,
            this.screenDistanceM
          );
        } else if (this.diffractionType === 'grating') {
          I = OpticalPhysics.calculateGratingIntensity(
            xM,
            this.wavelengthNm,
            this.gratingLinesPerMm,
            this.screenDistanceM,
            16
          );
        }

        if (I > 0.0001) {
          // 伽马非线性色调映射 (gamma = 0.38)，极大提升弱级次亮纹对比度与清晰度
          const gammaI = Math.pow(Math.min(1.0, I), 0.38);

          // 核心白炽化饱和提升：高能量中心呈现白炽亮核，外缘呈现纯净荧光激光色彩
          const coreMix = Math.max(0, (I - 0.25) / 0.75);
          const r = Math.min(255, Math.round(rBase + (255 - rBase) * Math.pow(coreMix, 1.2)));
          const g = Math.min(255, Math.round(gBase + (255 - gBase) * Math.pow(coreMix, 1.2)));
          const b = Math.min(255, Math.round(bBase + (255 - bBase) * Math.pow(coreMix, 1.2)));

          const grad = ctx.createLinearGradient(0, centerY - patternHalfH, 0, centerY + patternHalfH);
          const peakAlpha = Math.min(1.0, gammaI * 1.35);
          const midAlpha = peakAlpha * 0.70;
          const edgeAlpha = peakAlpha * 0.22;

          grad.addColorStop(0.00, `rgba(${r}, ${g}, ${b}, 0)`);
          grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${peakAlpha.toFixed(3)})`);
          grad.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, ${midAlpha.toFixed(3)})`);
          grad.addColorStop(0.82, `rgba(${r}, ${g}, ${b}, ${edgeAlpha.toFixed(3)})`);
          grad.addColorStop(1.00, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.fillStyle = grad;
          ctx.fillRect(px, centerY - patternHalfH, 1, patternHalfH * 2);
        }
      }
    }

    this.screenTexture.needsUpdate = true;
  }

  // ==================== 3D 漫散射光路形状更新 ====================
  public updateBeams(): void {
    if (!this.showBeamsInAir || !this.laserPower) {
      if (this.preBeamMesh) this.preBeamMesh.visible = false;
      if (this.midBeamMesh) this.midBeamMesh.visible = false;
      if (this.postBeamMesh) this.postBeamMesh.visible = false;
      if (this.gratingRaysGroup) this.gratingRaysGroup.visible = false;
      if (this.slitLightMesh) this.slitLightMesh.visible = false;
      if (this.laserIncidentSpotMesh) this.laserIncidentSpotMesh.visible = false;
      return;
    }

    if (this.preBeamMesh) this.preBeamMesh.visible = true;
    if (this.midBeamMesh) this.midBeamMesh.visible = false;
    if (this.slitLightMesh) this.slitLightMesh.visible = (this.diffractionType === 'single');
    if (this.laserIncidentSpotMesh) this.laserIncidentSpotMesh.visible = (this.diffractionType === 'single');

    const screenX = this.getScreenCarrierX();
    const beamY = this.beamHeightY;

    if (this.diffractionType === 'grating') {
      if (this.postBeamMesh) this.postBeamMesh.visible = false;
      if (this.gratingRaysGroup) {
        this.gratingRaysGroup.visible = true;
        this.gratingRaysGroup.clear();

        const peaks = OpticalPhysics.getGratingPeakPositions(
          this.wavelengthNm,
          this.gratingLinesPerMm,
          this.screenDistanceM,
          3
        );

        const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
        const rayMat = new THREE.MeshBasicMaterial({
          color: colorRGB,
          transparent: true,
          opacity: 0.70,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        for (const peak of peaks) {
          const zScreen = peak.xMm * 1e-3;
          const pStart = new THREE.Vector3(this.slitX, beamY, 0);
          const pEnd = new THREE.Vector3(screenX, beamY, -zScreen);
          const dir = new THREE.Vector3().subVectors(pEnd, pStart);
          const len = dir.length();
          if (len < 0.001) continue;

          const rayGeo = new THREE.CylinderGeometry(0.0010, 0.0014, len, 8);
          rayGeo.rotateZ(Math.PI / 2);
          const rayMesh = new THREE.Mesh(rayGeo, rayMat);
          rayMesh.position.copy(pStart).addScaledVector(dir, 0.5);
          rayMesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
          this.gratingRaysGroup.add(rayMesh);
        }
      }
    } else {
      if (this.gratingRaysGroup) {
        this.gratingRaysGroup.visible = false;
        this.gratingRaysGroup.clear();
      }
      if (this.postBeamMesh) {
        this.postBeamMesh.visible = true;

        let halfSpan = 0.035;
        if (this.diffractionType === 'single') {
          const w0Mm = (2.0 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitWidthMm * 1e-3) * 1e3;
          halfSpan = Math.min(0.13, Math.max(0.022, w0Mm * 1e-3 * 1.5));
        } else if (this.diffractionType === 'double') {
          const spacingMm = (this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitDistanceMm * 1e-3) * 1e3;
          halfSpan = Math.min(0.13, Math.max(0.025, spacingMm * 1e-3 * 6.0));
        } else if (this.diffractionType === 'circular') {
          const r1Mm = OpticalPhysics.getAiryDiskRadius(this.wavelengthNm, this.apertureDiameterMm, this.screenDistanceM);
          halfSpan = Math.min(0.13, Math.max(0.025, r1Mm * 1e-3 * 2.5));
        }

        const pOrigin = [this.slitX, beamY, 0];
        const pBack = [screenX, beamY, -halfSpan];
        const pFront = [screenX, beamY, halfSpan];

        const posAttr = this.postBeamMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, pOrigin[0], pOrigin[1], pOrigin[2]);
        posAttr.setXYZ(1, pBack[0], pBack[1], pBack[2]);
        posAttr.setXYZ(2, pFront[0], pFront[1], pFront[2]);
        posAttr.needsUpdate = true;
      }
    }
  }

  // ==================== 遥测导出 ====================
  public getTelemetry(): OpticalDiffractionTelemetry {
    const singleData = OpticalPhysics.getSingleSlitFringeWidth(
      this.wavelengthNm,
      this.slitWidthMm,
      this.screenDistanceM
    );

    const airyRadius = OpticalPhysics.getAiryDiskRadius(
      this.wavelengthNm,
      this.apertureDiameterMm,
      this.screenDistanceM
    );

    const sinT1 = (this.wavelengthNm * 1e-9) / ((1 / Math.max(1, this.gratingLinesPerMm)) * 1e-3);
    const angle1 = THREE.MathUtils.radToDeg(Math.asin(Math.min(1.0, sinT1)));

    return {
      diffractionType: this.diffractionType,
      wavelengthNm: this.wavelengthNm,
      laserPower: this.laserPower,
      slitWidthMm: this.slitWidthMm,
      slitDistanceMm: this.slitDistanceMm,
      apertureDiameterMm: this.apertureDiameterMm,
      gratingLinesPerMm: this.gratingLinesPerMm,
      screenDistanceM: this.screenDistanceM,
      centralWidthMm: singleData.centralWidthMm,
      secondarySpacingMm: singleData.secondarySpacingMm,
      airyDiskRadiusMm: airyRadius,
      firstGratingAngleDeg: angle1,
    };
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    if (this.laserGroup) list.push(this.laserGroup);
    if (this.slitStageGroup) list.push(this.slitStageGroup);
    if (this.screenCarrierGroup) list.push(this.screenCarrierGroup);
    return list;
  }

  // ==================== 内存释放 ====================
  public dispose(): void {
    this.group.traverse((obj) => {
      const anyObj = obj as any;
      if (anyObj.isMesh || anyObj.isSprite) {
        if (anyObj.geometry) anyObj.geometry.dispose();
        if (Array.isArray(anyObj.material)) {
          anyObj.material.forEach((m: THREE.Material) => m.dispose());
        } else if (anyObj.material) {
          anyObj.material.dispose();
        }
      }
    });

    if (this.turretWheel) {
      this.turretWheel.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: THREE.Material) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      });
    }
    if (this.turretHoverCue) {
      if (this.turretHoverCue.geometry) this.turretHoverCue.geometry.dispose();
      if (this.turretHoverCue.material) {
        if (Array.isArray(this.turretHoverCue.material)) {
          this.turretHoverCue.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          this.turretHoverCue.material.dispose();
        }
      }
    }

    if (this.screenTexture) this.screenTexture.dispose();
    if (this.railScaleTexture) this.railScaleTexture.dispose();
    if (this.slitPlateTexture) this.slitPlateTexture.dispose();
    if (this.slitLightMaterial) this.slitLightMaterial.dispose();
  }
}
