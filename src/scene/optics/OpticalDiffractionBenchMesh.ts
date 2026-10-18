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
 * 高精度单缝光的衍射实验台 (Apple Pro / 顶级科研实验室白金科技美学)
 * 纯实心阳极氧化亮银铝合金床身、双镜面液态铬导杆、香槟金机械锁环与精密测微双刀口可调单缝仪。
 * 正面横向展开 (沿 X 轴从左至右：准直激光源 -> 测微可调单缝仪 -> 极简纯光像观测屏)。
 * 纯净三维物理交互，严禁粗糙几何拼凑，严禁黑色塑料，严禁悬浮弹窗与卡片。
 */
export class OpticalDiffractionBenchMesh {
  public readonly group = new THREE.Group();

  // 物理与几何尺寸 (横向 X 轴展开，正面对着操作者)
  public readonly railLength = 1.08;  // X 轴总长
  public readonly railWidth = 0.14;   // Z 轴前后进深
  public readonly railHeight = 0.040; // Y 轴厚度
  public readonly beamHeightY = 0.22; // 沿导轨上方光轴高度
  public readonly laserX = -0.38;     // 激光发射器安装坐标 (左侧)
  public readonly slitX = -0.14;      // 单缝光轴坐标 (中央偏左)
  public minScreenX = 0.12;           // 观测屏滑行极限最近端 (距狭缝 0.26m)
  public maxScreenX = 0.46;           // 观测屏滑行极限最远端 (距狭缝 0.60m)

  // 状态参数
  public diffractionType: DiffractionType = 'single';
  public wavelengthNm = 532.0;
  public laserPower = true;
  public slitWidthMm = 0.08;
  public slitDistanceMm = 0.25;
  public apertureDiameterMm = 0.25;
  public gratingLinesPerMm = 300;
  public screenDistanceM = 0.50; // 狭缝至屏物理换算距离 (默认 500mm)
  public showProfileCurve = false; // 屏幕保持纯净简约，不显示任何杂乱图表
  public showBeamsInAir = true;

  // 3D 核心运动装配节点
  public railGroup!: THREE.Group;
  public laserGroup!: THREE.Group;
  public slitStageGroup!: THREE.Group;
  public turretGroup!: THREE.Group; // 保持向后兼容别名
  public turretWheel!: THREE.Group; // 保持向后兼容别名
  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public micrometerKnob!: THREE.Mesh;
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};

  // 精密双研磨合金刀口片 (物理可调狭缝)
  public leftJawMesh!: THREE.Mesh;
  public rightJawMesh!: THREE.Mesh;
  private micrometerThimbleGroup!: THREE.Group;

  // 3D 光束几何与材质
  public preBeamMesh!: THREE.Mesh;
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
  private slitPlateMesh!: THREE.Mesh;

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
    // A. 航空亮银氧化铝导轨与前置激光刻度标尺 (沿 X 轴横向展开)
    this.buildOpticalRail();

    // B. 半导体准直激光发射器 (置于左侧 X=-0.38，沿 +X 射向单缝)
    this.buildLaserModule();

    // C. 工业级精密双刀口可调单缝仪 (置于中央 X=-0.14)
    this.buildAdjustableSingleSlitStage();

    // D. 极简亮银光电投影观测屏 (置于右侧 X>0，正对操作者视线)
    this.buildObservationScreen();

    // E. 3D 空气漫散射光路系统 (从左到右，经狭缝衍射发散)
    this.buildOpticalBeams();
  }

  // ==================== A. 光学导轨与毫米标尺 (亮银精密加工) ====================
  private buildOpticalRail(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'RailGroup';

    // 导轨床身主体：高质感阳极氧化喷砂银白铝合金 (拒绝黑沉粗糙)
    const railBodyGeo = new THREE.BoxGeometry(this.railLength, this.railHeight, this.railWidth);
    const railBodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.88,
      roughness: 0.18,
    });
    const railBody = new THREE.Mesh(railBodyGeo, railBodyMat);
    railBody.position.set(0, this.railHeight * 0.5, 0);
    railBody.castShadow = true;
    railBody.receiveShadow = true;
    this.railGroup.add(railBody);

    // 双精密镜面镀铬导向滑杆 (316L 不锈钢超高光洁度，贯穿两端)
    const rodRadius = 0.007;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, this.railLength + 0.024, 32);
    rodGeo.rotateZ(Math.PI / 2); // 沿 X 轴横放
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.04,
    });
    const rodFront = new THREE.Mesh(rodGeo, rodMat);
    rodFront.position.set(0, this.railHeight + rodRadius * 0.65, this.railWidth * 0.38);
    const rodBack = new THREE.Mesh(rodGeo, rodMat);
    rodBack.position.set(0, this.railHeight + rodRadius * 0.65, -this.railWidth * 0.38);
    this.railGroup.add(rodFront);
    this.railGroup.add(rodBack);

    // 导轨两端精密铝合金端盖封口 (工业级机械倒角封头)
    const endCapGeo = new THREE.BoxGeometry(0.016, this.railHeight + 0.006, this.railWidth + 0.008);
    const endCapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.16 });
    const endCapLeft = new THREE.Mesh(endCapGeo, endCapMat);
    endCapLeft.position.set(-this.railLength * 0.5 - 0.008, this.railHeight * 0.5, 0);
    const endCapRight = new THREE.Mesh(endCapGeo, endCapMat);
    endCapRight.position.set(this.railLength * 0.5 + 0.008, this.railHeight * 0.5, 0);
    this.railGroup.add(endCapLeft);
    this.railGroup.add(endCapRight);

    // 4个防震降噪硅胶底座与香槟金水平微调调平旋钮
    const footBaseGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.010, 24);
    const footPadMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.80, metalness: 0.15 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });
    const screwRingGeo = new THREE.TorusGeometry(0.014, 0.003, 16, 24);
    screwRingGeo.rotateX(Math.PI / 2);

    const xOffsets = [-this.railLength * 0.44, this.railLength * 0.44];
    const zOffsets = [-this.railWidth * 0.40, this.railWidth * 0.40];

    for (const x of xOffsets) {
      for (const z of zOffsets) {
        const foot = new THREE.Mesh(footBaseGeo, footPadMat);
        foot.position.set(x, 0.005, z);
        this.railGroup.add(foot);

        const screwRing = new THREE.Mesh(screwRingGeo, brassMat);
        screwRing.position.set(x, 0.012, z);
        this.railGroup.add(screwRing);
      }
    }

    // 导轨正面高精激光刻度铭牌 (0 ~ 1000mm，面向 +Z 操作者)
    this.railScaleCanvas = safeCanvas(2048, 128);
    if (this.railScaleCanvas) {
      const ctx = this.railScaleCanvas.getContext('2d');
      if (ctx) {
        // 清爽纯净白银底色配深蓝激光刻度线
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 2048, 128);

        // 顶边与底边阳极氧化浅蓝金属边线
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 2048, 4);
        ctx.fillRect(0, 124, 2048, 4);

        ctx.strokeStyle = '#0284c7';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 30px "SF Mono", monospace, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 沿 0~1000mm 绘制清晰刻度线 (从左到右递增)
        for (let mm = 0; mm <= 1000; mm += 10) {
          const px = (mm / 1000) * 1960 + 44;
          const isMajor = mm % 50 === 0;
          const isMid = mm % 10 === 0 && !isMajor;

          ctx.lineWidth = isMajor ? 3.2 : 1.6;
          ctx.beginPath();
          ctx.moveTo(px, 4);
          ctx.lineTo(px, isMajor ? 46 : isMid ? 28 : 16);
          ctx.stroke();

          if (isMajor) {
            ctx.fillText(`${mm}`, px, 54);
          }
        }
      }
      this.railScaleTexture = new THREE.CanvasTexture(this.railScaleCanvas);
      this.railScaleTexture.anisotropy = 4;

      const scalePlateGeo = new THREE.PlaneGeometry(this.railLength * 0.94, this.railHeight * 0.65);
      const scalePlateMat = new THREE.MeshStandardMaterial({
        map: this.railScaleTexture,
        roughness: 0.25,
        metalness: 0.40,
      });
      // 正面朝向 +Z 轴，即正对用户操作视界！
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.501);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 半导体准直激光发射器 (左侧，亮银/香槟金/高质感散热鳍片) ====================
  private buildLaserModule(): void {
    this.laserGroup = new THREE.Group();
    this.laserGroup.name = 'LaserGroup';
    this.laserGroup.position.set(this.laserX, 0, 0);

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });

    // 1. 导轨固定滑鞍与精密燕尾锁紧手轮
    const saddleGeo = new THREE.BoxGeometry(0.10, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    this.laserGroup.add(saddle);

    // 正面香槟金滚花锁紧旋钮 (正对 +Z 操作者)
    const clampKnobGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 24);
    clampKnobGeo.rotateX(Math.PI / 2);
    const clampKnob = new THREE.Mesh(clampKnobGeo, brassMat);
    clampKnob.position.set(0, this.railHeight + 0.012, this.railWidth * 0.45);
    this.laserGroup.add(clampKnob);

    // 2. 镜面不锈钢支撑立柱与香槟金限位锁环
    const postGeo = new THREE.CylinderGeometry(0.016, 0.018, this.beamHeightY - (this.railHeight + 0.024), 24);
    const post = new THREE.Mesh(postGeo, saddleMat);
    post.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0);
    this.laserGroup.add(post);

    const ringGeo = new THREE.TorusGeometry(0.019, 0.003, 16, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, brassMat);
    ring.position.set(0, this.beamHeightY - 0.035, 0);
    this.laserGroup.add(ring);

    // 3. 激光发射器航空铝合金 CNC 筒身与散热鳍片 (横置圆柱体，沿 +X 射向右侧单缝)
    const barrelLength = 0.14;
    const barrelRadius = 0.024;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLength, 32);
    barrelGeo.rotateZ(Math.PI / 2); // 沿 X 轴横放
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.85,
      roughness: 0.18,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0.01, this.beamHeightY, 0);
    this.laserGroup.add(barrel);

    // 5道精密圆环散热鳍片 (CNC 车削环形凹凸质感)
    const finMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.15 });
    for (let i = -2; i <= 2; i++) {
      const finGeo = new THREE.CylinderGeometry(barrelRadius + 0.004, barrelRadius + 0.004, 0.004, 32);
      finGeo.rotateZ(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(i * 0.014 - 0.01, this.beamHeightY, 0);
      this.laserGroup.add(fin);
    }

    // 4. 香槟金前置准直出射环与聚焦镜 (+X 端口朝向右侧单缝)
    const nozzleGeo = new THREE.TorusGeometry(0.013, 0.0035, 16, 32);
    nozzleGeo.rotateY(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, brassMat);
    nozzle.position.set(barrelLength * 0.5 + 0.01, this.beamHeightY, 0);
    this.laserGroup.add(nozzle);

    // 激光出射聚焦透镜芯片
    const lensGeo = new THREE.CircleGeometry(0.009, 24);
    lensGeo.rotateY(Math.PI / 2);
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const lensMat = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.95 : 0.20,
    });
    this.laserLedMesh = new THREE.Mesh(lensGeo, lensMat);
    this.laserLedMesh.position.set(barrelLength * 0.5 + 0.011, this.beamHeightY, 0);
    this.laserGroup.add(this.laserLedMesh);

    // 5. 3D 机械翘板电源开关 (位于激光发射器前上方，正对用户视线 +Z)
    const switchBaseGeo = new THREE.BoxGeometry(0.024, 0.008, 0.018);
    const switchBase = new THREE.Mesh(switchBaseGeo, saddleMat);
    switchBase.position.set(0.02, this.beamHeightY + barrelRadius + 0.004, 0.015);
    this.laserGroup.add(switchBase);

    const switchRockerGeo = new THREE.BoxGeometry(0.016, 0.008, 0.012);
    const switchMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.35,
      roughness: 0.25,
    });
    this.laserSwitchMesh = new THREE.Mesh(switchRockerGeo, switchMat);
    this.laserSwitchMesh.name = 'LaserPowerSwitch';
    this.laserSwitchMesh.userData = { interactiveId: 'laser_power' };
    this.laserSwitchMesh.position.set(0.02, this.beamHeightY + barrelRadius + 0.009, 0.015);
    this.laserSwitchMesh.rotation.z = this.laserPower ? -0.25 : 0.25;
    this.laserGroup.add(this.laserSwitchMesh);

    // 6. 3个波长轻触切换按钮 (650nm红、532nm绿、405nm蓝，整齐排布在正面)
    const wavelengths = [650, 532, 405];
    const zSpacing = 0.016;

    wavelengths.forEach((wl, idx) => {
      const btnGeo = new THREE.CylinderGeometry(0.0055, 0.006, 0.006, 16);
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
      btnMesh.position.set(-0.025, this.beamHeightY + barrelRadius + 0.004, (idx - 1) * zSpacing);
      this.laserGroup.add(btnMesh);
      this.wlButtons[wl] = btnMesh;
    });

    this.group.add(this.laserGroup);
  }

  // ==================== C. 工业级精密双刀口可调单缝仪 (彻底重做，仅保留单缝且缝宽物理可调) ====================
  private buildAdjustableSingleSlitStage(): void {
    this.slitStageGroup = new THREE.Group();
    this.slitStageGroup.name = 'AdjustableSingleSlitStage';
    this.slitStageGroup.position.set(this.slitX, 0, 0);

    // 维持向后兼容性别名
    this.turretGroup = this.slitStageGroup;

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });
    const titaniumMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.88, roughness: 0.20 });

    // 1. 导轨滑鞍与正面香槟金锁紧手轮
    const saddleGeo = new THREE.BoxGeometry(0.10, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    this.slitStageGroup.add(saddle);

    // 正面香槟金锁紧手轮
    const clampKnobGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.016, 24);
    clampKnobGeo.rotateX(Math.PI / 2);
    const clampKnob = new THREE.Mesh(clampKnobGeo, brassMat);
    clampKnob.position.set(0, this.railHeight + 0.012, this.railWidth * 0.45);
    this.slitStageGroup.add(clampKnob);

    // 红色游标指示指针 (伸向导轨正前方刻度尺)
    const cursorGeo = new THREE.BoxGeometry(0.005, 0.004, 0.018);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cursor = new THREE.Mesh(cursorGeo, cursorMat);
    cursor.position.set(0, this.railHeight + 0.014, this.railWidth * 0.48);
    this.slitStageGroup.add(cursor);

    // 2. 双立柱精密支撑架构 (左右双不锈钢精密柱)
    const colGeo = new THREE.CylinderGeometry(0.008, 0.008, this.beamHeightY - (this.railHeight + 0.024), 24);
    const colLeft = new THREE.Mesh(colGeo, saddleMat);
    colLeft.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, -0.032);
    const colRight = new THREE.Mesh(colGeo, saddleMat);
    colRight.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0.032);
    this.slitStageGroup.add(colLeft);
    this.slitStageGroup.add(colRight);

    // 立柱横梁锁紧压板
    const crossBarGeo = new THREE.BoxGeometry(0.024, 0.012, 0.084);
    const crossBar = new THREE.Mesh(crossBarGeo, saddleMat);
    crossBar.position.set(0, this.beamHeightY - 0.048, 0);
    this.slitStageGroup.add(crossBar);

    // 3. 单缝仪光学主装配壳体 (精雕航空铝合金外框，中央贯穿光路通孔)
    const chassisW = 0.032; // 沿 X 轴厚度
    const chassisH = 0.110; // 沿 Y 轴高度
    const chassisD = 0.100; // 沿 Z 轴宽度
    const chassisGeo = new THREE.BoxGeometry(chassisW, chassisH, chassisD);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.88,
      roughness: 0.16,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.set(0, this.beamHeightY, 0);
    this.slitStageGroup.add(chassis);

    // 前后两面香槟金光学通光孔径压环 (圆环，光线穿透其中心)
    const apertureRingGeo = new THREE.TorusGeometry(0.026, 0.0035, 16, 32);
    apertureRingGeo.rotateY(Math.PI / 2);
    const ringFront = new THREE.Mesh(apertureRingGeo, brassMat);
    ringFront.position.set(-chassisW * 0.501, this.beamHeightY, 0);
    const ringBack = new THREE.Mesh(apertureRingGeo, brassMat);
    ringBack.position.set(chassisW * 0.501, this.beamHeightY, 0);
    this.slitStageGroup.add(ringFront);
    this.slitStageGroup.add(ringBack);

    // 4. 精密双研磨钛合金刀口片 (左刀口与右刀口，物理可变间隙)
    // 刀口片置于 YZ 平面垂直竖立，光沿 +X 穿过两刀口之间的微米缝隙
    const jawHeight = 0.046;
    const jawThickX = 0.0025;
    const jawDepthZ = 0.022;

    const jawGeo = new THREE.BoxGeometry(jawThickX, jawHeight, jawDepthZ);

    // 左刀口片 (负 Z 侧)
    this.leftJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.leftJawMesh.name = 'SlitLeftJaw';
    this.leftJawMesh.position.set(0, this.beamHeightY, -jawDepthZ * 0.5);
    this.slitStageGroup.add(this.leftJawMesh);

    // 右刀口片 (正 Z 侧)
    this.rightJawMesh = new THREE.Mesh(jawGeo, titaniumMat);
    this.rightJawMesh.name = 'SlitRightJaw';
    this.rightJawMesh.position.set(0, this.beamHeightY, jawDepthZ * 0.5);
    this.slitStageGroup.add(this.rightJawMesh);

    // 5. 侧向高精密测微套筒与测微鼓轮 (Micrometer Drum Mechanism)
    // 沿 +Z 方向伸出，正对操作者，操作者可轻松直观拖拽调节单缝缝隙！
    this.micrometerThimbleGroup = new THREE.Group();
    this.micrometerThimbleGroup.name = 'MicrometerThimbleGroup';
    this.micrometerThimbleGroup.position.set(0, this.beamHeightY, chassisD * 0.5 + 0.002);

    // A. 固定套管 (Barrel Sleeve，刻有轴向基准线与毫米螺距线)
    const barrelSleeveGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.022, 24);
    barrelSleeveGeo.rotateX(Math.PI / 2);
    const barrelSleeve = new THREE.Mesh(barrelSleeveGeo, saddleMat);
    barrelSleeve.position.set(0, 0, 0.011);
    this.micrometerThimbleGroup.add(barrelSleeve);

    // B. 旋转测微鼓轮 (Rotating Thimble，外圆周精密滚花与游标微分环)
    const knobGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.030, 32);
    knobGeo.rotateX(Math.PI / 2); // 沿 Z 轴放置
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    this.micrometerKnob = new THREE.Mesh(knobGeo, knobMat);
    this.micrometerKnob.name = 'SlitMicrometerKnob';
    this.micrometerKnob.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.position.set(0, 0, 0.037);

    // 鼓轮端面香槟金旋钮螺母
    const knobEndGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 24);
    knobEndGeo.rotateX(Math.PI / 2);
    const knobEnd = new THREE.Mesh(knobEndGeo, brassMat);
    knobEnd.position.set(0, 0, 0.016);
    this.micrometerKnob.add(knobEnd);

    // 鼓轮防滑滚花金色环带
    const knurlRingGeo = new THREE.TorusGeometry(0.0137, 0.0018, 16, 32);
    const knurlRing = new THREE.Mesh(knurlRingGeo, brassMat);
    knurlRing.position.set(0, 0, -0.004);
    this.micrometerKnob.add(knurlRing);

    this.micrometerThimbleGroup.add(this.micrometerKnob);
    this.slitStageGroup.add(this.micrometerThimbleGroup);

    // 将向后兼容的 turretWheel 指向鼓轮组，保证旧测试或 API 不会报错
    this.turretWheel = this.micrometerThimbleGroup;
    this.turretWheel.name = 'SlitTurretWheel';
    this.turretWheel.userData = { interactiveId: 'slit_turret' };

    // 6. 单缝仪正面高精激光蚀刻铭牌 (面向 +Z 用户，实时显示当前缝宽 a = 0.08 mm)
    this.slitPlateCanvas = safeCanvas(512, 128);
    if (this.slitPlateCanvas) {
      this.slitPlateTexture = new THREE.CanvasTexture(this.slitPlateCanvas);
      const plateGeo = new THREE.PlaneGeometry(0.076, 0.022);
      const plateMat = new THREE.MeshStandardMaterial({
        map: this.slitPlateTexture,
        roughness: 0.20,
        metalness: 0.35,
      });
      this.slitPlateMesh = new THREE.Mesh(plateGeo, plateMat);
      this.slitPlateMesh.position.set(0, this.beamHeightY + chassisH * 0.5 + 0.014, 0.024);
      this.slitStageGroup.add(this.slitPlateMesh);
      this.updateSlitPlateLabel();
    }

    this.group.add(this.slitStageGroup);
  }

  // ==================== D. 极简亮银光电投影观测屏 (右侧，纯粹光像，严禁杂乱 UI) ====================
  private buildObservationScreen(): void {
    this.screenCarrierGroup = new THREE.Group();
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });

    // 1. 导轨滑行滑鞍与锁紧手轮
    const saddleGeo = new THREE.BoxGeometry(0.12, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    saddle.userData = { interactiveId: 'screen_handle' };
    this.screenCarrierGroup.add(saddle);

    // 正面香槟金锁紧手轮
    const clampKnobGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.016, 24);
    clampKnobGeo.rotateX(Math.PI / 2);
    const clampKnob = new THREE.Mesh(clampKnobGeo, brassMat);
    clampKnob.position.set(0, this.railHeight + 0.012, this.railWidth * 0.45);
    this.screenCarrierGroup.add(clampKnob);

    // 红色游标指示指针 (伸向导轨正前方刻度尺)
    const cursorGeo = new THREE.BoxGeometry(0.006, 0.004, 0.025);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cursor = new THREE.Mesh(cursorGeo, cursorMat);
    cursor.position.set(0, this.railHeight + 0.014, this.railWidth * 0.48);
    this.screenCarrierGroup.add(cursor);

    // 2. 屏幕精密支撑立柱
    const postGeo = new THREE.CylinderGeometry(0.015, 0.017, this.beamHeightY - (this.railHeight + 0.024), 24);
    const post = new THREE.Mesh(postGeo, saddleMat);
    post.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0);
    this.screenCarrierGroup.add(post);

    // 3. 屏幕总成面板 (正对操作者：微偏转 ~28° 迎合左侧入射光，同时完全端正面向操作者视界)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamHeightY, 0);
    this.screenPanelGroup.rotation.y = -0.48;

    // 航空亮银氧化铝工业外框 (宽 0.34m, 高 0.24m)
    const frameW = 0.34;
    const frameH = 0.24;
    const frameD = 0.016;

    const frameGeo = new THREE.BoxGeometry(frameW, frameH, frameD);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.88,
      roughness: 0.16,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    this.screenPanelGroup.add(frame);

    // 顶部人体工学镜面镀铬握持把手
    const handleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.09, 16);
    handleGeo.rotateX(Math.PI / 2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.05 });
    const handleTop = new THREE.Mesh(handleGeo, handleMat);
    handleTop.name = 'ScreenHandleTop';
    handleTop.userData = { interactiveId: 'screen_handle' };
    handleTop.position.set(0, frameH * 0.5 + 0.012, 0);
    this.screenPanelGroup.add(handleTop);

    // 4. 屏幕核心显示平面 (1024x1024 高精动态 CanvasTexture，深海宝石暗黑底色，仅显示纯粹光像)
    this.screenCanvas = safeCanvas(1024, 1024);
    if (this.screenCanvas) {
      this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
      this.screenTexture.anisotropy = 8;
    }

    const screenGeo = new THREE.PlaneGeometry(frameW - 0.022, frameH - 0.022);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
    });
    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.name = 'ScreenSurfaceMesh';
    this.screenMesh.userData = { interactiveId: 'screen_surface' };
    this.screenMesh.position.set(0, 0, frameD * 0.505);
    this.screenPanelGroup.add(this.screenMesh);

    this.screenCarrierGroup.add(this.screenPanelGroup);
    this.group.add(this.screenCarrierGroup);
  }

  // ==================== E. 3D 空气漫散射光路系统 (从左到右传播) ====================
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

    // 1. 单缝前半段准直光束 (沿 +X 传播，圆柱体横卧)
    const distPre = Math.abs(this.slitX - this.laserX);
    const preGeo = new THREE.CylinderGeometry(0.003, 0.003, distPre, 16);
    preGeo.rotateZ(Math.PI / 2);
    this.preBeamMesh = new THREE.Mesh(preGeo, this.beamMaterial);
    this.preBeamMesh.position.set((this.laserX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamMesh);

    // 2. 单缝后半段发散光羽 (BufferGeometry 三角面，随狭缝开度与屏距动态展开)
    const postGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(9);
    postGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.postBeamMesh = new THREE.Mesh(postGeo, this.beamMaterial);
    this.group.add(this.postBeamMesh);

    // 3. 向后兼容的光栅离散光束组节点
    this.gratingRaysGroup = new THREE.Group();
    this.gratingRaysGroup.name = 'GratingRaysGroup';
    this.group.add(this.gratingRaysGroup);
  }

  // ==================== 物理运动学与刀口开度同步 ====================
  private updateSlitKinematics(): void {
    // 物理缝宽 0.02mm ~ 0.25mm 换算为 3D 视觉肉眼清晰可见的机械开度 (放大便于观察机械运动)
    // a = 0.02mm 时微张紧贴 (0.0006m)，a = 0.25mm 时明显开阔 (0.0076m)
    const visualGap = 0.0006 + (this.slitWidthMm / 0.25) * 0.0070;
    const halfJawDepth = 0.022 * 0.5;

    if (this.leftJawMesh) {
      this.leftJawMesh.position.z = -halfJawDepth - visualGap * 0.5;
    }
    if (this.rightJawMesh) {
      this.rightJawMesh.position.z = halfJawDepth + visualGap * 0.5;
    }

    // 测微鼓轮旋转：随缝宽连续旋转，呈现极真实的微分螺杆旋拧动感
    if (this.micrometerKnob) {
      this.micrometerKnob.rotation.z = (this.slitWidthMm / 0.25) * Math.PI * 8.0;
    }

    this.updateSlitPlateLabel();
  }

  private updateSlitPlateLabel(): void {
    if (!this.slitPlateCanvas || !this.slitPlateTexture) return;
    const ctx = this.slitPlateCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 500, 116);

    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 38px "SF Mono", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(`单缝 a = ${this.slitWidthMm.toFixed(2)} mm`, 256, 64);
    this.slitPlateTexture.needsUpdate = true;
  }

  // ==================== 屏距换算与运动 ====================
  public syncScreenPositionFromDistance(): void {
    const distClamped = THREE.MathUtils.clamp(this.screenDistanceM, 0.30, 0.85);
    this.screenDistanceM = distClamped;

    // 导轨滑移范围：[0.12, 0.46]，跨度 0.34m
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
    return this.screenCarrierGroup ? this.screenCarrierGroup.position.x : 0.26;
  }

  // ==================== 参数设置 API ====================
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
      (this.laserLedMesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.15;
    }
    if (this.laserSwitchMesh) {
      this.laserSwitchMesh.rotation.z = on ? -0.25 : 0.25;
    }
    this.isScreenDirty = true;
  }

  // 维持 API 签名向后兼容
  public setDiffractionType(type: DiffractionType): void {
    this.diffractionType = type;
    this.isScreenDirty = true;
  }

  public cycleNextDiffractionType(): void {
    const order: DiffractionType[] = ['single', 'double', 'circular', 'grating'];
    const idx = order.indexOf(this.diffractionType);
    this.diffractionType = order[(idx + 1) % order.length];
    this.isScreenDirty = true;
  }

  public setSlitDistance(dMm: number): void {
    this.slitDistanceMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.isScreenDirty = true;
  }

  public setApertureDiameter(dMm: number): void {
    this.apertureDiameterMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.isScreenDirty = true;
  }

  public setGratingDensity(linesPerMm: number): void {
    this.gratingLinesPerMm = THREE.MathUtils.clamp(linesPerMm, 50, 1000);
    this.isScreenDirty = true;
  }

  public update(_delta: number): void {
    if (this.isScreenDirty) {
      this.updateScreenTexture();
      this.updateBeams();
      this.isScreenDirty = false;
    }
  }

  // ==================== 屏幕动态物理单缝衍射纹理渲染 (极致简约，纯物理光像) ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.diffractionType}_${this.wavelengthNm}_${this.laserPower}_${this.slitWidthMm.toFixed(3)}_${this.screenDistanceM.toFixed(3)}`;
    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 纯净极简投影屏底色：深邃高阶磨砂黑蓝 (#070d18)
    ctx.fillStyle = '#070d18';
    ctx.fillRect(0, 0, w, h);

    // 激光关闭时，屏幕纯黑，无任何多余文字或图标
    if (!this.laserPower) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 2. 纯粹单缝夫琅禾费衍射光强条纹呈现 (Sinc² 包络)
    const colorInfo = OpticalPhysics.wavelengthToRGB(this.wavelengthNm);
    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // 屏幕水平物理跨度：-35mm 到 +35mm (70mm 总宽)
    const physicalHalfSpanMm = 35.0;
    const pxPerMm = (w * 0.5) / physicalHalfSpanMm;

    const rBase = Math.round(colorInfo.r * 255);
    const gBase = Math.round(colorInfo.g * 255);
    const bBase = Math.round(colorInfo.b * 255);

    const patternHalfHeight = 360;

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

        const r = Math.min(255, Math.round(rBase + coreBoost));
        const g = Math.min(255, Math.round(gBase + coreBoost));
        const b = Math.min(255, Math.round(bBase + coreBoost));

        grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.25).toFixed(3)})`);
        grad.addColorStop(0.50, `rgba(${r}, ${g}, ${b}, ${gammaI.toFixed(3)})`);
        grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.25).toFixed(3)})`);
        grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(px, centerY - patternHalfHeight, 1, patternHalfHeight * 2);
      }
    }

    this.screenTexture.needsUpdate = true;
  }

  // ==================== 3D 漫散射光路形状更新 (随狭缝开度动态张合) ====================
  public updateBeams(): void {
    if (!this.showBeamsInAir || !this.laserPower) {
      if (this.preBeamMesh) this.preBeamMesh.visible = false;
      if (this.postBeamMesh) this.postBeamMesh.visible = false;
      if (this.gratingRaysGroup) this.gratingRaysGroup.visible = false;
      return;
    }

    if (this.preBeamMesh) this.preBeamMesh.visible = true;
    if (this.postBeamMesh) this.postBeamMesh.visible = true;

    const screenX = this.getScreenCarrierX();
    const beamY = this.beamHeightY;

    // 单缝中央明纹宽度 Delta x_0 = (2 * lambda * L) / a
    // 缝越窄，衍射发散角越大，光羽展开越宽！缝越宽，光羽收敛接近准直光！
    const w0Mm = (2.0 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitWidthMm * 1e-3) * 1e3;
    const halfSpan = Math.min(0.13, Math.max(0.022, w0Mm * 1e-3 * 1.5));

    const pOrigin = [this.slitX, beamY, 0];
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
    const doubleSpacing = OpticalPhysics.getDoubleSlitFringeSpacing(
      this.wavelengthNm,
      this.slitDistanceMm,
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
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    });

    if (this.screenTexture) this.screenTexture.dispose();
    if (this.railScaleTexture) this.railScaleTexture.dispose();
    if (this.slitPlateTexture) this.slitPlateTexture.dispose();
  }
}
