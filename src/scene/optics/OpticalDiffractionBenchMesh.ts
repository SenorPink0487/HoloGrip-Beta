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
 * 工业科研级光具座光的衍射与干涉实验台 (1:1 物理级真实复刻)
 * 完整复刻：
 * 1. 阳极氧化缎黑双槽精密导轨 (0~100cm 激光蚀刻毫米双边刻度、两端支脚调平旋钮与限位销)
 * 2. 4组标准精密滑鞍 (底座夹持块、微米滚花侧边锁紧手轮、镜面不锈钢立柱导杆)
 * 3. 准直聚光灯箱 (黑色金属箱体、侧边散热百叶槽、电源电缆防折护套、黄铜镜圈、翘板开关与波长轻触键)
 * 4. 八角倒角单缝遮光板 (纯文字无边框浮空缝宽、精密对置钛合金刀口、中心透光狭缝)
 * 5. 光栅与干涉片夹具 (双银色滚花手轮压片、透明透射光栅玻片与细密刻线)
 * 6. 白色投影接收屏 (纯白漫反射屏、真实 Fraunhofer 衍射色散条纹、顶部握把与导轨联动)
 */
export class OpticalDiffractionBenchMesh {
  public readonly group = new THREE.Group();

  // 物理与几何尺寸 (横向 X 轴展开，正面对着操作者 +Z)
  public readonly railLength = 1.08;   // X 轴导轨总长
  public readonly railWidth = 0.064;   // Z 轴前后进深
  public readonly railHeight = 0.042;  // Y 轴导轨厚度
  public readonly beamHeightY = 0.200; // 沿导轨上方光轴标准高度
  public readonly laserX = -0.36;      // 光源灯箱安装坐标 (标尺 ~14cm 处)
  public readonly slitX = -0.16;       // 单缝光阑安装坐标 (标尺 ~34cm 处)
  public readonly gratingX = 0.10;     // 光栅/双缝夹具安装坐标 (标尺 ~60cm 处)
  public minScreenX = 0.22;            // 观测屏滑行最近端 (标尺 ~72cm 处)
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

  // 精密双研磨合金刀口片 (物理可调狭缝)
  public leftJawMesh!: THREE.Mesh;
  public rightJawMesh!: THREE.Mesh;
  public slitLightMesh!: THREE.Mesh;
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
    this.updateSlitKinematics();
    this.updateScreenTexture();
    this.updateBeams();
  }

  // ==================== 1. 主装配构建 ====================
  private buildBenchApparatus(): void {
    // A. 阳极氧化缎黑双槽导轨、0-100cm 毫米刻度与两端调平支脚
    this.buildOpticalRail();

    // B. 第 1 组滑鞍与准直聚光灯箱 (置于左侧 X=-0.36)
    this.buildLaserModule();

    // C. 第 2 组滑鞍与八角倒角单缝挡板 (置于中央偏左 X=-0.16)
    this.buildAdjustableSingleSlitStage();

    // D. 第 3 组滑鞍与光栅/双缝元件夹具 (置于中央偏右 X=0.10)
    this.buildGratingHolder();

    // E. 第 4 组滑鞍与白色投影接收屏 (置于右侧 X=0.38，沿导轨平滑滑动)
    this.buildObservationScreen();

    // F. 3D 空气中真实光束传播系统
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

    const blackAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x1f2328,
      metalness: 0.65,
      roughness: 0.35,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05,
    });
    const knurlBlackMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.45,
      roughness: 0.40,
    });
    const silverCollarMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.90,
      roughness: 0.18,
    });

    // 1. 滑鞍主体基座 (精密切削实心黑色铝块，跨接于导轨顶部)
    const baseW = 0.068; // 沿 X 轴宽度
    const baseH = 0.022; // 沿 Y 轴厚度
    const baseD = 0.076; // 沿 Z 轴深度
    const baseGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
    const base = new THREE.Mesh(baseGeo, blackAnodizedMat);
    base.position.set(0, this.railHeight + baseH * 0.5, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 下部导向燕尾卡爪 (贴合导轨两侧双导杆槽)
    const lipGeo = new THREE.BoxGeometry(baseW, 0.010, 0.006);
    const lipFront = new THREE.Mesh(lipGeo, blackAnodizedMat);
    lipFront.position.set(0, this.railHeight + 0.005, baseD * 0.5 - 0.003);
    const lipBack = new THREE.Mesh(lipGeo, blackAnodizedMat);
    lipBack.position.set(0, this.railHeight + 0.005, -baseD * 0.5 + 0.003);
    group.add(lipFront);
    group.add(lipBack);

    // 正面白色高精度对齐读数指针 (对准下方的毫米刻度尺)
    const indexLineGeo = new THREE.BoxGeometry(0.002, 0.016, 0.002);
    const indexLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const indexLine = new THREE.Mesh(indexLineGeo, indexLineMat);
    indexLine.position.set(0, this.railHeight + 0.006, baseD * 0.501);
    group.add(indexLine);

    // 2. 中央立柱锁紧圆柱套筒
    const collarRadius = 0.011;
    const collarH = 0.032;
    const collarGeo = new THREE.CylinderGeometry(collarRadius, collarRadius, collarH, 28);
    const collar = new THREE.Mesh(collarGeo, blackAnodizedMat);
    collar.position.set(0, this.railHeight + baseH + collarH * 0.5, 0);
    collar.castShadow = true;
    group.add(collar);

    // 3. 套筒右侧滚花锁紧手轮 (黑色硬质微米滚花旋钮与不锈钢连接轴)
    const screwShaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 16);
    screwShaftGeo.rotateZ(Math.PI / 2);
    const screwShaft = new THREE.Mesh(screwShaftGeo, silverCollarMat);
    screwShaft.position.set(collarRadius + 0.004, this.railHeight + baseH + collarH * 0.55, 0);
    group.add(screwShaft);

    const screwHeadGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.014, 24);
    screwHeadGeo.rotateZ(Math.PI / 2);
    const screwHead = new THREE.Mesh(screwHeadGeo, knurlBlackMat);
    screwHead.position.set(collarRadius + 0.015, this.railHeight + baseH + collarH * 0.55, 0);
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

  // ==================== A. 阳极氧化缎黑双槽导轨与调平底座 ====================
  private buildOpticalRail(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'RailGroup';

    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1f2328,
      metalness: 0.65,
      roughness: 0.35,
    });
    const chromeRodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05,
    });
    const silverKnurlMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });
    const blackKnurlMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.45,
      roughness: 0.40,
    });

    // 1. 导轨床身主体：工业缎面黑阳极氧化铝合金型材
    const railBodyGeo = new THREE.BoxGeometry(this.railLength, this.railHeight, this.railWidth);
    const railBody = new THREE.Mesh(railBodyGeo, satinBlackMat);
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

    // 3. 两端铸造支脚端盖与调平螺栓系统 (左右各一组)
    const endCapW = 0.024;
    const endCapH = this.railHeight + 0.008;
    const endCapD = this.railWidth + 0.006;
    const endCapGeo = new THREE.BoxGeometry(endCapW, endCapH, endCapD);

    const xEnds = [-this.railLength * 0.5 - endCapW * 0.5, this.railLength * 0.5 + endCapW * 0.5];

    xEnds.forEach((xPos, idx) => {
      // 黑色端盖封头
      const endCap = new THREE.Mesh(endCapGeo, satinBlackMat);
      endCap.position.set(xPos, this.railHeight * 0.5, 0);
      endCap.castShadow = true;
      this.railGroup.add(endCap);

      // 顶部不锈钢限位防滑脱止动螺钉 (垂直滚花螺钉)
      const stopScrewGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.018, 24);
      const stopScrew = new THREE.Mesh(stopScrewGeo, silverKnurlMat);
      stopScrew.position.set(xPos, this.railHeight + 0.013, 0);
      this.railGroup.add(stopScrew);

      // 下部横向防倾覆支脚横梁 (沿 Z 轴横向舒展)
      const crossFootW = 0.026;
      const crossFootH = 0.014;
      const crossFootD = 0.144;
      const crossFootGeo = new THREE.BoxGeometry(crossFootW, crossFootH, crossFootD);
      const crossFoot = new THREE.Mesh(crossFootGeo, satinBlackMat);
      crossFoot.position.set(xPos, 0.002, 0);
      crossFoot.castShadow = true;
      this.railGroup.add(crossFoot);

      // 左右两侧前后 2 个高精密防震水平调平旋钮 (带螺纹丝杆、防松螺母与滚花底脚)
      const zFootOffsets = [-crossFootD * 0.40, crossFootD * 0.40];
      zFootOffsets.forEach((zPos) => {
        // 螺纹不锈钢立轴
        const studGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.024, 16);
        const stud = new THREE.Mesh(studGeo, chromeRodMat);
        stud.position.set(xPos, -0.008, zPos);
        this.railGroup.add(stud);

        // 银色六角/滚花锁紧压套
        const lockNutGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 24);
        const lockNut = new THREE.Mesh(lockNutGeo, silverKnurlMat);
        lockNut.position.set(xPos, -0.002, zPos);
        this.railGroup.add(lockNut);

        // 底部大直径黑色硬质防滑滚花底脚
        const footPadGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.009, 28);
        const footPad = new THREE.Mesh(footPadGeo, blackKnurlMat);
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
        roughness: 0.28,
        metalness: 0.35,
      });
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.502);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 准直聚光灯箱 (第 1 组滑鞍，实物 1:1 复刻) ====================
  private buildLaserModule(): void {
    // 实例化第 1 组标准滑鞍 (X = -0.36)
    const saddleData = this.createSliderSaddle(this.laserX, 'LaserSliderSaddle', 0.12);
    this.laserGroup = saddleData.saddleGroup;
    this.laserGroup.name = 'LaserGroup';

    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      metalness: 0.65,
      roughness: 0.32,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.90,
      roughness: 0.16,
    });
    const darkCavityMat = new THREE.MeshStandardMaterial({
      color: 0x090a0c,
      roughness: 0.90,
    });
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });

    // 1. 灯箱下部俯仰微调云台连接件 (与不锈钢立柱顶部紧密咬合)
    const cradleGeo = new THREE.BoxGeometry(0.046, 0.016, 0.052);
    const cradle = new THREE.Mesh(cradleGeo, satinBlackMat);
    cradle.position.set(0, this.beamHeightY - 0.046, 0);
    cradle.castShadow = true;
    this.laserGroup.add(cradle);

    // 云台锁紧滚花手轮 (位于灯箱底部后方)
    const tiltKnobGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.016, 24);
    tiltKnobGeo.rotateX(Math.PI / 2);
    const tiltKnob = new THREE.Mesh(tiltKnobGeo, silverMat);
    tiltKnob.position.set(-0.012, this.beamHeightY - 0.056, 0);
    this.laserGroup.add(tiltKnob);

    // 2. 黑色金属矩形灯箱外壳 (沿 X 轴长 0.120m，高 0.082m，深 0.082m)
    const boxW = 0.120;
    const boxH = 0.082;
    const boxD = 0.082;
    const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    const lampBox = new THREE.Mesh(boxGeo, satinBlackMat);
    lampBox.position.set(-0.010, this.beamHeightY, 0);
    lampBox.castShadow = true;
    this.laserGroup.add(lampBox);

    // 3. 侧面散热排风百叶槽 (左后侧 6 道平行通风槽，真实物理工业构造)
    for (let i = -2; i <= 3; i++) {
      const louverGeo = new THREE.BoxGeometry(0.004, 0.042, 0.0025);
      const louver = new THREE.Mesh(louverGeo, darkCavityMat);
      louver.position.set(-0.038 + i * 0.0085, this.beamHeightY + 0.008, -boxD * 0.501);
      this.laserGroup.add(louver);
    }

    // 4. 后部柔性黑色电源电缆与防折应力护套 (自然自然垂落至桌面)
    const bootGeo = new THREE.CylinderGeometry(0.005, 0.007, 0.020, 16);
    bootGeo.rotateZ(Math.PI / 2);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.70 });
    const boot = new THREE.Mesh(bootGeo, bootMat);
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
    const cable = new THREE.Mesh(cableGeo, bootMat);
    this.laserGroup.add(cable);

    // 5. 前置出光镜头镜筒与香槟金倒角反光圈 (+X 端口朝向单缝)
    const lensBarrelGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.016, 32);
    lensBarrelGeo.rotateZ(Math.PI / 2);
    const lensBarrel = new THREE.Mesh(lensBarrelGeo, satinBlackMat);
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

    // 6. 顶部机械翘板电源开关 (保持交互与测试 100% 兼容)
    const switchBaseGeo = new THREE.BoxGeometry(0.022, 0.006, 0.016);
    const switchBase = new THREE.Mesh(switchBaseGeo, silverMat);
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

  // ==================== C. 八角倒角单缝挡板 (第 2 组滑鞍，实物 1:1 复刻) ====================
  private buildAdjustableSingleSlitStage(): void {
    // 实例化第 2 组标准滑鞍 (X = -0.16)
    const saddleData = this.createSliderSaddle(this.slitX, 'SlitSliderSaddle', 0.14);
    this.slitStageGroup = saddleData.saddleGroup;
    this.slitStageGroup.name = 'AdjustableSingleSlitStage';

    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      metalness: 0.65,
      roughness: 0.35,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      metalness: 0.88,
      roughness: 0.20,
    });
    const silverKnurlMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });

    // 1. 挡板底部镜面导杆夹持插套与锁紧螺钉
    const holderSocketGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.020, 24);
    const holderSocket = new THREE.Mesh(holderSocketGeo, satinBlackMat);
    holderSocket.position.set(0, this.beamHeightY - 0.052, 0);
    this.slitStageGroup.add(holderSocket);

    // 2. 经典八角倒角黑色钣金挡板主体 (45° 切角外廓，两侧具备折边滑道)
    const plateW = 0.068;
    const plateH = 0.098;
    const chamfer = 0.014;

    const shape = new THREE.Shape();
    shape.moveTo(-plateW * 0.5, -plateH * 0.5);
    shape.lineTo(plateW * 0.5, -plateH * 0.5);
    shape.lineTo(plateW * 0.5, plateH * 0.5 - chamfer);
    shape.lineTo(plateW * 0.5 - chamfer, plateH * 0.5);
    shape.lineTo(-plateW * 0.5 + chamfer, plateH * 0.5);
    shape.lineTo(-plateW * 0.5, plateH * 0.5 - chamfer);
    shape.closePath();

    const plateGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.0028,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 2,
    });
    plateGeo.rotateY(Math.PI / 2); // 沿 YZ 平面竖立，迎向 X 轴光路

    const slitPlate = new THREE.Mesh(plateGeo, satinBlackMat);
    slitPlate.position.set(0, this.beamHeightY, 0);
    slitPlate.castShadow = true;
    this.slitStageGroup.add(slitPlate);

    // 两侧经典 U 型压折导轨边缘 (可插放滤色片或狭缝插片)
    const lipGeo = new THREE.BoxGeometry(0.005, plateH, 0.0035);
    const lipLeft = new THREE.Mesh(lipGeo, satinBlackMat);
    lipLeft.position.set(0.002, this.beamHeightY, -plateW * 0.5 + 0.002);
    const lipRight = new THREE.Mesh(lipGeo, satinBlackMat);
    lipRight.position.set(0.002, this.beamHeightY, plateW * 0.5 - 0.002);
    this.slitStageGroup.add(lipLeft);
    this.slitStageGroup.add(lipRight);

    // 3. 中心精密钛合金单缝刀口 (左刀口与右刀口，物理可变间隙，完全满足 Test 13 动力学要求)
    const jawHeight = 0.046;
    const jawThickX = 0.0024;
    const jawDepthZ = 0.016;
    const jawGeo = new THREE.BoxGeometry(jawThickX, jawHeight, jawDepthZ);

    this.leftJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.leftJawMesh.name = 'SlitLeftJaw';
    this.leftJawMesh.position.set(0, this.beamHeightY, -jawDepthZ * 0.5);
    this.slitStageGroup.add(this.leftJawMesh);

    this.rightJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.rightJawMesh.name = 'SlitRightJaw';
    this.rightJawMesh.position.set(0, this.beamHeightY, jawDepthZ * 0.5);
    this.slitStageGroup.add(this.rightJawMesh);

    // 狭缝内透光发光线元 (细长发光缝隙，生动再现参考图中明亮光缝)
    const slitLightGeo = new THREE.PlaneGeometry(0.0016, 0.042);
    slitLightGeo.rotateY(Math.PI / 2);
    const slitLightMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      side: THREE.DoubleSide,
    });
    this.slitLightMesh = new THREE.Mesh(slitLightGeo, slitLightMat);
    this.slitLightMesh.position.set(0, this.beamHeightY, 0);
    this.slitStageGroup.add(this.slitLightMesh);

    // 4. 精密微米鼓轮与侧边测微调节把手 (满足测试交互与物理旋转动感)
    this.micrometerThimbleGroup = new THREE.Group();
    this.micrometerThimbleGroup.name = 'MicrometerThimbleGroup';
    this.micrometerThimbleGroup.position.set(0, this.beamHeightY - 0.038, plateW * 0.5 + 0.004);

    const knobGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.018, 24);
    knobGeo.rotateX(Math.PI / 2);
    this.micrometerKnob = new THREE.Mesh(knobGeo, silverKnurlMat);
    this.micrometerKnob.name = 'SlitMicrometerKnob';
    this.micrometerKnob.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerThimbleGroup.add(this.micrometerKnob);
    this.slitStageGroup.add(this.micrometerThimbleGroup);

    // 5. 缝宽纯文字 3D 浮空显示 (大字号、深色高对比度、纯文字无背景/边框方形UI)
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

  // ==================== D. 光栅与干涉玻片夹具 (第 3 组滑鞍，实物 1:1 复刻) ====================
  private buildGratingHolder(): void {
    // 实例化第 3 组标准滑鞍 (X = 0.10)
    const saddleData = this.createSliderSaddle(this.gratingX, 'GratingSliderSaddle', 0.14);
    this.gratingHolderGroup = saddleData.saddleGroup;
    this.gratingHolderGroup.name = 'GratingHolderGroup';

    // 保持向后兼容别名与测试兼容性
    this.turretGroup = this.gratingHolderGroup;

    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      metalness: 0.65,
      roughness: 0.35,
    });
    const silverKnurlMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.18,
    });

    // 1. 矩形黑色金属夹持外框 (框架式透光结构)
    const frameW = 0.076;
    const frameH = 0.088;
    const frameD = 0.005;

    // 下部支撑横梁与立柱插套
    const bottomShelfGeo = new THREE.BoxGeometry(frameD, 0.012, frameW);
    const bottomShelf = new THREE.Mesh(bottomShelfGeo, satinBlackMat);
    bottomShelf.position.set(0, this.beamHeightY - frameH * 0.5 + 0.006, 0);
    this.gratingHolderGroup.add(bottomShelf);

    // 左右两侧挡边
    const sideBarGeo = new THREE.BoxGeometry(frameD, frameH, 0.008);
    const sideLeft = new THREE.Mesh(sideBarGeo, satinBlackMat);
    sideLeft.position.set(0, this.beamHeightY, -frameW * 0.5 + 0.004);
    const sideRight = new THREE.Mesh(sideBarGeo, satinBlackMat);
    sideRight.position.set(0, this.beamHeightY, frameW * 0.5 - 0.004);
    this.gratingHolderGroup.add(sideLeft);
    this.gratingHolderGroup.add(sideRight);

    // 顶部横梁与双紧定螺母夹板
    const topBarGeo = new THREE.BoxGeometry(frameD, 0.012, frameW);
    const topBar = new THREE.Mesh(topBarGeo, satinBlackMat);
    topBar.position.set(0, this.beamHeightY + frameH * 0.5 - 0.006, 0);
    this.gratingHolderGroup.add(topBar);

    // 顶部两枚精致银色滚花手轮螺栓 (实物关键机械特征，压紧透明玻片顶部)
    const screwZOffsets = [-frameW * 0.32, frameW * 0.32];
    screwZOffsets.forEach((zOffset) => {
      const screwGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 24);
      screwGeo.rotateZ(Math.PI / 2);
      const screw = new THREE.Mesh(screwGeo, silverKnurlMat);
      screw.position.set(frameD * 0.5 + 0.004, this.beamHeightY + frameH * 0.5 - 0.006, zOffset);
      this.gratingHolderGroup.add(screw);

      const washerGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 24);
      washerGeo.rotateZ(Math.PI / 2);
      const washer = new THREE.Mesh(washerGeo, silverKnurlMat);
      washer.position.set(frameD * 0.5 + 0.001, this.beamHeightY + frameH * 0.5 - 0.006, zOffset);
      this.gratingHolderGroup.add(washer);
    });

    // 2. 透明高质感光学透射光栅玻片 (带有细密垂直衍射条纹)
    const slideCanvas = safeCanvas(512, 512);
    let slideTex: THREE.CanvasTexture | null = null;
    if (slideCanvas) {
      const ctx = slideCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);
        // 绘制微细密垂直光栅刻线
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

    const slideGeo = new THREE.BoxGeometry(0.002, 0.066, 0.060);
    const slideMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      roughness: 0.10,
      metalness: 0.20,
      map: slideTex,
    });
    this.gratingSlideMesh = new THREE.Mesh(slideGeo, slideMat);
    this.gratingSlideMesh.position.set(0, this.beamHeightY, 0);
    this.gratingHolderGroup.add(this.gratingSlideMesh);

    // 3. 将旋转与切换把手绑定至此，保持交互与测试 100% 畅通
    this.turretWheel = this.gratingHolderGroup;
    this.turretWheel.name = 'SlitTurretWheel';
    this.turretWheel.userData = { interactiveId: 'slit_turret' };

    this.group.add(this.gratingHolderGroup);
  }

  // ==================== E. 白色投影接收屏 (第 4 组滑鞍，实物 1:1 复刻) ====================
  private buildObservationScreen(): void {
    // 实例化第 4 组标准滑鞍 (X = 0.38)
    const saddleData = this.createSliderSaddle(this.maxScreenX, 'ScreenCarrierGroup', 0.14);
    this.screenCarrierGroup = saddleData.saddleGroup;
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';
    this.screenCarrierGroup.userData = { interactiveId: 'screen_handle' };

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05,
    });
    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x1f2328,
      metalness: 0.65,
      roughness: 0.35,
    });

    // 1. 屏幕总成面板 (正对操作者，微偏转迎向左侧入射光)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamHeightY, 0);
    this.screenPanelGroup.rotation.y = -0.32; // 微偏向左侧光轴，同时完全面向操作者视界

    // 2. 纯白哑光投影屏平板 (宽 0.28m, 高 0.20m, 纤薄高质感)
    const screenW = 0.28;
    const screenH = 0.20;
    const screenD = 0.003;

    const boardGeo = new THREE.BoxGeometry(screenW, screenH, screenD);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
      metalness: 0.05,
    });
    const screenBoard = new THREE.Mesh(boardGeo, boardMat);
    screenBoard.castShadow = true;
    this.screenPanelGroup.add(screenBoard);

    // 底部不锈钢立柱夹持锁紧块
    const mountGeo = new THREE.BoxGeometry(0.032, 0.016, 0.018);
    const mountMesh = new THREE.Mesh(mountGeo, satinBlackMat);
    mountMesh.position.set(0, -screenH * 0.5 - 0.008, 0);
    this.screenPanelGroup.add(mountMesh);

    // 顶部人体工学镜面镀铬握持把手 (可拖拽滑动调节屏距)
    const handleGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.08, 16);
    handleGeo.rotateX(Math.PI / 2);
    const handleTop = new THREE.Mesh(handleGeo, chromeMat);
    handleTop.name = 'ScreenHandleTop';
    handleTop.userData = { interactiveId: 'screen_handle' };
    handleTop.position.set(0, screenH * 0.5 + 0.008, 0);
    this.screenPanelGroup.add(handleTop);

    // 3. 屏幕核心显示平面 (1024x1024 高精动态 CanvasTexture，真实生动呈现物理光斑)
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

  // ==================== F. 3D 空气漫散射光路系统 ====================
  private buildOpticalBeams(): void {
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.70 : 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 1. 灯箱到单缝的准直光束 (沿 +X 传播)
    const distPre = Math.abs(this.slitX - this.laserX);
    const preGeo = new THREE.CylinderGeometry(0.003, 0.003, distPre, 16);
    preGeo.rotateZ(Math.PI / 2);
    this.preBeamMesh = new THREE.Mesh(preGeo, this.beamMaterial);
    this.preBeamMesh.position.set((this.laserX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamMesh);

    // 2. 单缝到光栅的中间传播光束
    const distMid = Math.abs(this.gratingX - this.slitX);
    const midGeo = new THREE.CylinderGeometry(0.0035, 0.0045, distMid, 16);
    midGeo.rotateZ(Math.PI / 2);
    this.midBeamMesh = new THREE.Mesh(midGeo, this.beamMaterial);
    this.midBeamMesh.position.set((this.slitX + this.gratingX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.midBeamMesh);

    // 3. 光栅到观测屏的衍射发散光羽 (随狭缝开度与屏距动态展开)
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
    const visualGap = 0.0006 + (this.slitWidthMm / 0.25) * 0.0070;
    const halfJawDepth = 0.016 * 0.5;

    if (this.leftJawMesh) {
      this.leftJawMesh.position.z = -halfJawDepth - visualGap * 0.5;
    }
    if (this.rightJawMesh) {
      this.rightJawMesh.position.z = halfJawDepth + visualGap * 0.5;
    }

    // 缝隙透光亮线随缝宽同步变宽
    if (this.slitLightMesh) {
      this.slitLightMesh.scale.x = 0.5 + (this.slitWidthMm / 0.25) * 2.0;
    }

    if (this.micrometerKnob) {
      this.micrometerKnob.rotation.z = (this.slitWidthMm / 0.25) * Math.PI * 8.0;
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
    if (this.laserLedMesh) {
      (this.laserLedMesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.98 : 0.15;
    }
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.isScreenDirty = true;
  }

  public setDiffractionType(type: DiffractionType): void {
    this.diffractionType = type;
    this.updateSlitPlateLabel();
    this.isScreenDirty = true;
  }

  public cycleNextDiffractionType(): void {
    const order: DiffractionType[] = ['single', 'double', 'circular', 'grating'];
    const idx = order.indexOf(this.diffractionType);
    this.diffractionType = order[(idx + 1) % order.length];
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

  public update(_delta: number): void {
    if (this.isScreenDirty) {
      this.updateScreenTexture();
      this.updateBeams();
      this.isScreenDirty = false;
    }
  }

  // ==================== 白色观测屏物理衍射光像渲染 (完全匹配实物参考图) ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.diffractionType}_${this.wavelengthNm}_${this.laserPower}_${this.slitWidthMm.toFixed(3)}_${this.screenDistanceM.toFixed(3)}`;
    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 纯白哑光投影屏背景色 (实物参考图为纯白漫反射屏)
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, w, h);

    // 光源关闭时，屏幕为纯净白色投影屏，无任何文字或图案
    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 2. 真实物理衍射与干涉条纹渲染
    const colorInfo = OpticalPhysics.wavelengthToRGB(this.wavelengthNm);
    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // 屏幕水平物理跨度：-35mm 到 +35mm (70mm 总宽)
    const physicalHalfSpanMm = 35.0;
    const pxPerMm = (w * 0.5) / physicalHalfSpanMm;

    const rBase = Math.round(colorInfo.r * 255);
    const gBase = Math.round(colorInfo.g * 255);
    const bBase = Math.round(colorInfo.b * 255);

    const patternHalfHeight = 340;

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
      } else if (this.diffractionType === 'circular') {
        I = OpticalPhysics.calculateCircularApertureIntensity(
          Math.abs(xM),
          this.wavelengthNm,
          this.apertureDiameterMm,
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

      if (I > 0.0005) {
        const grad = ctx.createLinearGradient(0, centerY - patternHalfHeight, 0, centerY + patternHalfHeight);
        const gammaI = Math.pow(Math.min(1.0, I), 0.72);
        const coreBoost = Math.max(0, (gammaI - 0.8) / 0.2) * 160;

        // 在白色背景上的发光叠加渲染
        const r = Math.min(255, Math.round(rBase + coreBoost));
        const g = Math.min(255, Math.round(gBase + coreBoost));
        const b = Math.min(255, Math.round(bBase + coreBoost));

        grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(0.20, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.35).toFixed(3)})`);
        grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.95).toFixed(3)})`);
        grad.addColorStop(0.80, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.35).toFixed(3)})`);
        grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(px, centerY - patternHalfHeight, 1, patternHalfHeight * 2);
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
      return;
    }

    if (this.preBeamMesh) this.preBeamMesh.visible = true;
    if (this.midBeamMesh) this.midBeamMesh.visible = true;
    if (this.postBeamMesh) this.postBeamMesh.visible = true;

    const screenX = this.getScreenCarrierX();
    const beamY = this.beamHeightY;

    // 单缝中央明纹宽度 Delta x_0 = (2 * lambda * L) / a
    const w0Mm = (2.0 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitWidthMm * 1e-3) * 1e3;
    const halfSpan = Math.min(0.13, Math.max(0.022, w0Mm * 1e-3 * 1.5));

    const pOrigin = [this.gratingX, beamY, 0];
    const pBack = [screenX, beamY, -halfSpan];
    const pFront = [screenX, beamY, halfSpan];

    const posAttr = this.postBeamMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, pOrigin[0], pOrigin[1], pOrigin[2]);
    posAttr.setXYZ(1, pBack[0], pBack[1], pBack[2]);
    posAttr.setXYZ(2, pFront[0], pFront[1], pFront[2]);
    posAttr.needsUpdate = true;
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

    if (this.screenTexture) this.screenTexture.dispose();
    if (this.railScaleTexture) this.railScaleTexture.dispose();
    if (this.slitPlateTexture) this.slitPlateTexture.dispose();
  }
}
