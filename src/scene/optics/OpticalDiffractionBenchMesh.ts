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
 * 高精密光学导轨衍射实验台 (Apple Pro / 现代未来主义科研实验室银白科技美学)
 * 采用全实心阳极氧化亮银铝合金床身、镜面液态铬双滑行导杆、香槟金光学锁环与高亮磨砂显色观测屏。
 * 正面横向展开 (沿 X 轴从左往右：激光源 -> 狭缝转盘 -> 观测屏)，正对操作者视界，杜绝沉重黑色块。
 */
export class OpticalDiffractionBenchMesh {
  public readonly group = new THREE.Group();

  // 物理与几何尺寸 (横向 X 轴展开，正面对着操作者)
  public readonly railLength = 1.08;  // X 轴总长
  public readonly railWidth = 0.14;   // Z 轴前后进深
  public readonly railHeight = 0.040; // Y 轴厚度
  public readonly beamHeightY = 0.22; // 沿导轨上方光轴高度
  public readonly laserX = -0.38;     // 激光发射器安装坐标 (左侧)
  public readonly slitX = -0.14;      // 狭缝/光阑光轴坐标 (中央偏左)
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
  public showProfileCurve = true;
  public showBeamsInAir = true;

  // 3D 核心运动装配节点
  public railGroup!: THREE.Group;
  public laserGroup!: THREE.Group;
  public turretGroup!: THREE.Group;
  public turretWheel!: THREE.Group;
  public screenCarrierGroup!: THREE.Group;
  public screenPanelGroup!: THREE.Group;
  public micrometerKnob!: THREE.Mesh;
  public laserSwitchMesh!: THREE.Mesh;
  public laserLedMesh!: THREE.Mesh;
  public wlButtons: { [wl: number]: THREE.Mesh } = {};

  // 3D 光束几何与材质
  public preBeamMesh!: THREE.Mesh;
  public postBeamMesh!: THREE.Mesh;
  public gratingRaysGroup!: THREE.Group;
  private beamMaterial!: THREE.MeshBasicMaterial;

  // 屏幕纹理与 Canvas
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenTexture: THREE.CanvasTexture | null = null;
  private screenMesh!: THREE.Mesh;
  private railScaleCanvas: HTMLCanvasElement | null = null;
  private railScaleTexture: THREE.CanvasTexture | null = null;
  private turretLabelCanvas: HTMLCanvasElement | null = null;
  private turretLabelTexture: THREE.CanvasTexture | null = null;
  private turretLabelMesh!: THREE.Mesh;

  // 旋转目标角与动画阻尼
  private targetTurretAngle = 0;
  private currentTurretAngle = 0;

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

    this.initTurretAngleForType(this.diffractionType);
    this.buildBenchApparatus();
    this.syncScreenPositionFromDistance();
    this.updateScreenTexture();
    this.updateBeams();
  }

  private initTurretAngleForType(type: DiffractionType): void {
    switch (type) {
      case 'single':
        this.targetTurretAngle = 0;
        break;
      case 'double':
        this.targetTurretAngle = Math.PI * 0.5;
        break;
      case 'circular':
        this.targetTurretAngle = Math.PI;
        break;
      case 'grating':
        this.targetTurretAngle = Math.PI * 1.5;
        break;
    }
    this.currentTurretAngle = this.targetTurretAngle;
  }

  // ==================== 1. 主装配构建 ====================
  private buildBenchApparatus(): void {
    // A. 航空亮银氧化铝导轨与前置刻度标尺 (沿 X 轴横向展开)
    this.buildOpticalRail();

    // B. 半导体准直激光发射器 (置于左侧，射向右方 +X)
    this.buildLaserModule();

    // C. 4 工位多孔狭缝转盘台架 (置于中央偏左 X=-0.14)
    this.buildSlitTurretStage();

    // D. 极简亮银光电投影屏与滑动滑块 (置于右侧 X>0，正对操作者)
    this.buildObservationScreen();

    // E. 3D 空气漫散射光路系统 (从左往右传播)
    this.buildOpticalBeams();
  }

  // ==================== A. 光学导轨与毫米标尺 (亮银未来感材质) ====================
  private buildOpticalRail(): void {
    this.railGroup = new THREE.Group();
    this.railGroup.name = 'RailGroup';

    // 导轨床身主体：高质感阳极氧化喷砂银白铝合金 (拒绝黑沉)
    const railBodyGeo = new THREE.BoxGeometry(this.railLength, this.railHeight, this.railWidth);
    const railBodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.85,
      roughness: 0.18,
    });
    const railBody = new THREE.Mesh(railBodyGeo, railBodyMat);
    railBody.position.set(0, this.railHeight * 0.5, 0);
    railBody.castShadow = true;
    railBody.receiveShadow = true;
    this.railGroup.add(railBody);

    // 双精密镜面镀铬导向滑杆 (对称置于主体前后两侧，沿 X 轴贯穿)
    const rodRadius = 0.007;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, this.railLength + 0.02, 32);
    rodGeo.rotateZ(Math.PI / 2); // 沿 X 轴横放
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.04,
    });
    const rodFront = new THREE.Mesh(rodGeo, rodMat);
    rodFront.position.set(0, this.railHeight + rodRadius * 0.6, this.railWidth * 0.38);
    const rodBack = new THREE.Mesh(rodGeo, rodMat);
    rodBack.position.set(0, this.railHeight + rodRadius * 0.6, -this.railWidth * 0.38);
    this.railGroup.add(rodFront);
    this.railGroup.add(rodBack);

    // 4个防震降噪硅胶底座支脚 (清爽浅深灰/冰川灰)
    const footGeo = new THREE.CylinderGeometry(0.016, 0.020, 0.012, 24);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75, metalness: 0.1 });
    const xOffsets = [-this.railLength * 0.44, this.railLength * 0.44];
    const zOffsets = [-this.railWidth * 0.40, this.railWidth * 0.40];

    for (const x of xOffsets) {
      for (const z of zOffsets) {
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(x, 0.006, z);
        this.railGroup.add(foot);
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

        // 沿 0~1000mm 进行刻度线绘制 (从左到右递增)
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
        metalness: 0.4,
      });
      // 正面朝向 +Z 轴，即正对用户！
      const scalePlateFront = new THREE.Mesh(scalePlateGeo, scalePlateMat);
      scalePlateFront.position.set(0, this.railHeight * 0.5, this.railWidth * 0.501);
      this.railGroup.add(scalePlateFront);
    }

    this.group.add(this.railGroup);
  }

  // ==================== B. 半导体准直激光发射器 (左侧，亮银/香槟金) ====================
  private buildLaserModule(): void {
    this.laserGroup = new THREE.Group();
    this.laserGroup.name = 'LaserGroup';
    this.laserGroup.position.set(this.laserX, 0, 0);

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });

    // 导轨固定滑鞍
    const saddleGeo = new THREE.BoxGeometry(0.10, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    this.laserGroup.add(saddle);

    // 支撑立柱与滚花高度环
    const postGeo = new THREE.CylinderGeometry(0.016, 0.018, this.beamHeightY - (this.railHeight + 0.024), 24);
    const post = new THREE.Mesh(postGeo, saddleMat);
    post.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0);
    this.laserGroup.add(post);

    const ringGeo = new THREE.TorusGeometry(0.019, 0.003, 16, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, brassMat);
    ring.position.set(0, this.beamHeightY - 0.035, 0);
    this.laserGroup.add(ring);

    // 激光发射器主壳体 (横置圆柱体，沿光轴 +X 射向右侧中央狭缝)
    const barrelLength = 0.13;
    const barrelRadius = 0.024;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLength, 32);
    barrelGeo.rotateZ(Math.PI / 2); // 沿 X 轴横放
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.82,
      roughness: 0.20,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0.01, this.beamHeightY, 0);
    this.laserGroup.add(barrel);

    // 纯铜/香槟金准直出射环 (+X 端口朝向右侧狭缝)
    const nozzleGeo = new THREE.TorusGeometry(0.012, 0.0035, 16, 32);
    nozzleGeo.rotateY(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, brassMat);
    nozzle.position.set(barrelLength * 0.5 + 0.01, this.beamHeightY, 0);
    this.laserGroup.add(nozzle);

    // 激光出射聚焦透镜芯片
    const lensGeo = new THREE.CircleGeometry(0.008, 24);
    lensGeo.rotateY(Math.PI / 2);
    const colorRGB = OpticalPhysics.wavelengthToColor(this.wavelengthNm);
    const lensMat = new THREE.MeshBasicMaterial({
      color: colorRGB,
      transparent: true,
      opacity: this.laserPower ? 0.95 : 0.2,
    });
    this.laserLedMesh = new THREE.Mesh(lensGeo, lensMat);
    this.laserLedMesh.position.set(barrelLength * 0.5 + 0.011, this.beamHeightY, 0);
    this.laserGroup.add(this.laserLedMesh);

    // 3D 机械翘板电源开关 (位于激光发射器前上方，正对用户视线 +Z)
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

    // 3个波长轻触切换按钮 (650nm红、532nm绿、405nm蓝，整齐排布在正面)
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

  // ==================== C. 4 工位多孔狭缝转盘台架 (中央偏左，亮银/香槟金) ====================
  private buildSlitTurretStage(): void {
    this.turretGroup = new THREE.Group();
    this.turretGroup.name = 'SlitTurretGroup';
    this.turretGroup.position.set(this.slitX, 0, 0);

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.15 });

    // 导轨固定滑鞍
    const saddleGeo = new THREE.BoxGeometry(0.09, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    this.turretGroup.add(saddle);

    // 精密升降立柱
    const pillarGeo = new THREE.CylinderGeometry(0.014, 0.016, this.beamHeightY - (this.railHeight + 0.024), 24);
    const pillar = new THREE.Mesh(pillarGeo, saddleMat);
    pillar.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0);
    this.turretGroup.add(pillar);

    // 旋转狭缝四工位转盘 (圆盘位于 YZ 平面，光线沿 X 穿透孔位)
    this.turretWheel = new THREE.Group();
    this.turretWheel.name = 'SlitTurretWheel';
    this.turretWheel.userData = { interactiveId: 'slit_turret' };

    const turretRadius = 0.068;
    const turretCenterY = this.beamHeightY - turretRadius; // 转盘中心置于光轴正下方
    this.turretWheel.position.set(0, turretCenterY, 0);

    // 外部滚花金属圆盘 (亮银铝合金)
    const diskGeo = new THREE.CylinderGeometry(turretRadius + 0.022, turretRadius + 0.022, 0.007, 48);
    diskGeo.rotateZ(Math.PI / 2); // 圆盘面置于 YZ 平面
    const diskMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.88,
      roughness: 0.20,
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    this.turretWheel.add(disk);

    // 4个精密光学孔径元件窗口 (分布在半径 R 处，相隔 90度)
    // 0度: 单缝 (顶部，对准光轴中心)
    // 90度: 双缝
    // 180度: 圆孔
    // 270度: 光栅
    const apertureAngles = [
      { angle: 0, type: 'single' },
      { angle: Math.PI * 0.5, type: 'double' },
      { angle: Math.PI, type: 'circular' },
      { angle: Math.PI * 1.5, type: 'grating' },
    ];

    apertureAngles.forEach(({ angle, type }) => {
      const az = -Math.sin(angle) * turretRadius;
      const ay = Math.cos(angle) * turretRadius;

      // 香槟金色安装圆环
      const collarGeo = new THREE.TorusGeometry(0.015, 0.0024, 16, 32);
      collarGeo.rotateY(Math.PI / 2);
      const collar = new THREE.Mesh(collarGeo, brassMat);
      collar.position.set(0.004, ay, az);
      this.turretWheel.add(collar);

      // 孔径窗口清澈光学深海蓝滤光膜底板 (避免纯黑)
      const foilGeo = new THREE.CircleGeometry(0.013, 24);
      foilGeo.rotateY(Math.PI / 2);
      const foilMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.3,
        metalness: 0.5,
        transparent: true,
        opacity: 0.85,
      });
      const foil = new THREE.Mesh(foilGeo, foilMat);
      foil.position.set(0.0042, ay, az);
      this.turretWheel.add(foil);

      // 窗口中实物几何
      if (type === 'single') {
        const sGeo = new THREE.PlaneGeometry(0.016, 0.0018);
        sGeo.rotateY(Math.PI / 2);
        const sMesh = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        sMesh.position.set(0.0045, ay, az);
        this.turretWheel.add(sMesh);
      } else if (type === 'double') {
        const s1Geo = new THREE.PlaneGeometry(0.016, 0.0009);
        s1Geo.rotateY(Math.PI / 2);
        const s1 = new THREE.Mesh(s1Geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        const s2 = s1.clone();
        s1.position.set(0.0045, ay, az - 0.002);
        s2.position.set(0.0045, ay, az + 0.002);
        this.turretWheel.add(s1);
        this.turretWheel.add(s2);
      } else if (type === 'circular') {
        const pinholeGeo = new THREE.CircleGeometry(0.0028, 20);
        pinholeGeo.rotateY(Math.PI / 2);
        const pinhole = new THREE.Mesh(pinholeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        pinhole.position.set(0.0045, ay, az);
        this.turretWheel.add(pinhole);
      } else if (type === 'grating') {
        const gGeo = new THREE.PlaneGeometry(0.014, 0.014);
        gGeo.rotateY(Math.PI / 2);
        const gratingGlass = new THREE.Mesh(
          gGeo,
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            metalness: 0.6,
            roughness: 0.1,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
          })
        );
        gratingGlass.position.set(0.0045, ay, az);
        this.turretWheel.add(gratingGlass);
      }
    });

    this.turretGroup.add(this.turretWheel);

    // 正面微调测微鼓轮 (Micrometer Drum，面向 +Z 操作者)
    const knobGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.026, 32);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.20,
    });
    this.micrometerKnob = new THREE.Mesh(knobGeo, knobMat);
    this.micrometerKnob.name = 'SlitMicrometerKnob';
    this.micrometerKnob.userData = { interactiveId: 'slit_micrometer' };
    this.micrometerKnob.position.set(0, this.beamHeightY, this.railWidth * 0.40);
    this.turretGroup.add(this.micrometerKnob);

    // 状态指示铭牌 (正面朝向 +Z 操作者)
    this.turretLabelCanvas = safeCanvas(512, 128);
    if (this.turretLabelCanvas) {
      this.turretLabelTexture = new THREE.CanvasTexture(this.turretLabelCanvas);
      const labelGeo = new THREE.PlaneGeometry(0.080, 0.022);
      const labelMat = new THREE.MeshStandardMaterial({
        map: this.turretLabelTexture,
        roughness: 0.2,
        metalness: 0.4,
      });
      this.turretLabelMesh = new THREE.Mesh(labelGeo, labelMat);
      this.turretLabelMesh.position.set(0, this.beamHeightY + 0.046, this.railWidth * 0.401);
      this.turretGroup.add(this.turretLabelMesh);
      this.updateTurretLabel();
    }

    this.group.add(this.turretGroup);
  }

  // ==================== D. 磨砂投影光电探测屏 (右侧，亮银未来感，正对操作者) ====================
  private buildObservationScreen(): void {
    this.screenCarrierGroup = new THREE.Group();
    this.screenCarrierGroup.name = 'ScreenCarrierGroup';

    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.90, roughness: 0.18 });

    // 导轨滑行滑鞍
    const saddleGeo = new THREE.BoxGeometry(0.12, 0.024, this.railWidth * 0.88);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.position.set(0, this.railHeight + 0.012, 0);
    saddle.userData = { interactiveId: 'screen_handle' };
    this.screenCarrierGroup.add(saddle);

    // 红色游标指示指针 (伸向导轨正前方刻度尺)
    const cursorGeo = new THREE.BoxGeometry(0.006, 0.004, 0.025);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const cursor = new THREE.Mesh(cursorGeo, cursorMat);
    cursor.position.set(0, this.railHeight + 0.014, this.railWidth * 0.48);
    this.screenCarrierGroup.add(cursor);

    // 屏幕刚性支撑立柱
    const postGeo = new THREE.CylinderGeometry(0.014, 0.016, this.beamHeightY - (this.railHeight + 0.024), 24);
    const post = new THREE.Mesh(postGeo, saddleMat);
    post.position.set(0, (this.railHeight + 0.024 + this.beamHeightY) * 0.5, 0);
    this.screenCarrierGroup.add(post);

    // 屏幕总成面板 (正对操作者：微偏转 ~28° 既迎合左侧射来的光束，又完完全全正对前方用户视线)
    this.screenPanelGroup = new THREE.Group();
    this.screenPanelGroup.name = 'ScreenPanelGroup';
    this.screenPanelGroup.position.set(0, this.beamHeightY, 0);
    // 向左偏转 28 度 (Y轴负旋转)，使屏幕正面完全面向前方用户，同时斜向截取左方入射光
    this.screenPanelGroup.rotation.y = -0.48;

    // 航空亮银氧化铝边框 (宽 0.34m, 高 0.24m)
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

    // 顶部人体工学镜面合金把手
    const handleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.09, 16);
    handleGeo.rotateX(Math.PI / 2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.05 });
    const handleTop = new THREE.Mesh(handleGeo, handleMat);
    handleTop.name = 'ScreenHandleTop';
    handleTop.userData = { interactiveId: 'screen_handle' };
    handleTop.position.set(0, frameH * 0.5 + 0.012, 0);
    this.screenPanelGroup.add(handleTop);

    // 屏幕核心显示平面 (1024x1024 高精动态 CanvasTexture)
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

    // 1. 狭缝前半段准直光束 (沿 +X 传播，圆柱体横卧)
    const distPre = Math.abs(this.slitX - this.laserX);
    const preGeo = new THREE.CylinderGeometry(0.003, 0.003, distPre, 16);
    preGeo.rotateZ(Math.PI / 2); // 沿 X 轴卧放
    this.preBeamMesh = new THREE.Mesh(preGeo, this.beamMaterial);
    this.preBeamMesh.position.set((this.laserX + this.slitX) * 0.5, this.beamHeightY, 0);
    this.group.add(this.preBeamMesh);

    // 2. 狭缝后半段发散光羽 (BufferGeometry 三角面，动态更新顶点)
    const postGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(9);
    postGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.postBeamMesh = new THREE.Mesh(postGeo, this.beamMaterial);
    this.group.add(this.postBeamMesh);

    // 3. 光栅分光多级离散衍射光束组
    this.gratingRaysGroup = new THREE.Group();
    this.gratingRaysGroup.name = 'GratingRaysGroup';
    this.group.add(this.gratingRaysGroup);
  }

  // ==================== 同步与渲染逻辑 ====================

  /**
   * 将 screenDistanceM 换算为滑块 local X 坐标
   * 狭缝位于 X=-0.14，屏位于 X>0，物理屏距 300mm ~ 850mm
   */
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

  public setDiffractionType(type: DiffractionType): void {
    if (this.diffractionType === type) return;
    this.diffractionType = type;
    switch (type) {
      case 'single':
        this.targetTurretAngle = 0;
        break;
      case 'double':
        this.targetTurretAngle = Math.PI * 0.5;
        break;
      case 'circular':
        this.targetTurretAngle = Math.PI;
        break;
      case 'grating':
        this.targetTurretAngle = Math.PI * 1.5;
        break;
    }
    this.updateTurretLabel();
    this.isScreenDirty = true;
  }

  public cycleNextDiffractionType(): void {
    const order: DiffractionType[] = ['single', 'double', 'circular', 'grating'];
    const idx = order.indexOf(this.diffractionType);
    const nextType = order[(idx + 1) % order.length];
    this.setDiffractionType(nextType);
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

    // 更新波长按键高亮
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

  public setSlitWidth(wMm: number): void {
    this.slitWidthMm = THREE.MathUtils.clamp(wMm, 0.02, 0.25);
    this.updateTurretLabel();
    this.isScreenDirty = true;
  }

  public setSlitDistance(dMm: number): void {
    this.slitDistanceMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.updateTurretLabel();
    this.isScreenDirty = true;
  }

  public setApertureDiameter(dMm: number): void {
    this.apertureDiameterMm = THREE.MathUtils.clamp(dMm, 0.10, 0.60);
    this.updateTurretLabel();
    this.isScreenDirty = true;
  }

  public setGratingDensity(linesPerMm: number): void {
    this.gratingLinesPerMm = THREE.MathUtils.clamp(linesPerMm, 50, 1000);
    this.updateTurretLabel();
    this.isScreenDirty = true;
  }

  private updateTurretLabel(): void {
    if (!this.turretLabelCanvas || !this.turretLabelTexture) return;
    const ctx = this.turretLabelCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 128);

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 36px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let txt = '';
    switch (this.diffractionType) {
      case 'single':
        txt = `单缝 a = ${this.slitWidthMm.toFixed(2)} mm`;
        break;
      case 'double':
        txt = `双缝 d = ${this.slitDistanceMm.toFixed(2)} mm`;
        break;
      case 'circular':
        txt = `圆孔 D = ${this.apertureDiameterMm.toFixed(2)} mm`;
        break;
      case 'grating':
        txt = `光栅 N = ${Math.round(this.gratingLinesPerMm)} 线/mm`;
        break;
    }

    ctx.fillText(txt, 256, 64);
    this.turretLabelTexture.needsUpdate = true;
  }

  public update(delta: number): void {
    const diff = this.targetTurretAngle - this.currentTurretAngle;
    if (Math.abs(diff) > 0.001) {
      this.currentTurretAngle += diff * Math.min(1.0, delta * 12.0);
      if (this.turretWheel) {
        this.turretWheel.rotation.x = this.currentTurretAngle;
      }
    }

    if (this.isScreenDirty) {
      this.updateScreenTexture();
      this.updateBeams();
      this.isScreenDirty = false;
    }
  }

  // ==================== 屏幕动态物理衍射纹理渲染 (清澈深海宝石蓝高反差底色，拒绝脏黑) ====================
  public updateScreenTexture(): void {
    if (!this.screenCanvas || !this.screenTexture) return;

    const hash = `${this.diffractionType}_${this.wavelengthNm}_${this.laserPower}_${this.slitWidthMm.toFixed(3)}_${this.slitDistanceMm.toFixed(3)}_${this.apertureDiameterMm.toFixed(3)}_${this.gratingLinesPerMm}_${this.screenDistanceM.toFixed(3)}_${this.showProfileCurve}`;
    if (hash === this.lastRenderHash) return;
    this.lastRenderHash = hash;

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    const w = 1024;
    const h = 1024;

    // 1. 屏幕背景：高科技深海宝石深蓝底色 (#08101e)，绝非丑陋死黑
    ctx.fillStyle = '#08101e';
    ctx.fillRect(0, 0, w, h);

    // 细致坐标测量网格 (清澈深冰蓝虚线)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 64; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 64; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. 若激光未开，仅显示网格与通电提示
    if (!this.laserPower) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 36px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('激光光源未开启 · 请按下激光头红色电源开关', w * 0.5, h * 0.45);
      this.screenTexture.needsUpdate = true;
      return;
    }

    // 3. 衍射条纹物理计算与渲染
    const colorInfo = OpticalPhysics.wavelengthToRGB(this.wavelengthNm);
    const centerY = this.showProfileCurve ? h * 0.36 : h * 0.50;
    const patternHalfHeight = 120;

    // 屏幕水平物理跨度：-35mm 到 +35mm
    const physicalHalfSpanMm = 35.0;
    const pxPerMm = (w * 0.5) / physicalHalfSpanMm;

    const intensityArray = new Float32Array(w);

    if (this.diffractionType === 'circular') {
      const imgData = ctx.createImageData(w, Math.round(patternHalfHeight * 2.2));
      const py0 = centerY - patternHalfHeight * 1.1;

      for (let py = 0; py < imgData.height; py++) {
        const worldYMm = ((py + py0) - centerY) / pxPerMm;
        for (let px = 0; px < w; px++) {
          const worldXMm = (px - w * 0.5) / pxPerMm;
          const rMm = Math.sqrt(worldXMm * worldXMm + worldYMm * worldYMm);
          const rM = rMm * 1e-3;

          const I = OpticalPhysics.calculateCircularApertureIntensity(
            rM,
            this.wavelengthNm,
            this.apertureDiameterMm,
            this.screenDistanceM
          );

          if (py === Math.round(imgData.height * 0.5)) {
            intensityArray[px] = I;
          }

          const gammaI = Math.pow(Math.min(1.0, I), 0.72);
          const idx = (py * w + px) * 4;
          imgData.data[idx] = Math.round(colorInfo.r * gammaI * 255);
          imgData.data[idx + 1] = Math.round(colorInfo.g * gammaI * 255);
          imgData.data[idx + 2] = Math.round(colorInfo.b * gammaI * 255);
          imgData.data[idx + 3] = Math.round(gammaI * 255);
        }
      }
      ctx.putImageData(imgData, 0, Math.round(py0));
    } else {
      for (let px = 0; px < w; px++) {
        const xMm = (px - w * 0.5) / pxPerMm;
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
        intensityArray[px] = I;

        if (I > 0.001) {
          const grad = ctx.createLinearGradient(0, centerY - patternHalfHeight, 0, centerY + patternHalfHeight);
          const gammaI = Math.pow(Math.min(1.0, I), 0.75);

          const r = Math.round(colorInfo.r * 255);
          const g = Math.round(colorInfo.g * 255);
          const b = Math.round(colorInfo.b * 255);

          grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0)`);
          grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.35).toFixed(3)})`);
          grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${gammaI.toFixed(3)})`);
          grad.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${(gammaI * 0.35).toFixed(3)})`);
          grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.fillStyle = grad;
          ctx.fillRect(px, centerY - patternHalfHeight, 1, patternHalfHeight * 2);
        }
      }
    }

    // 4. 毫米刻度基准横线 (经过中心光轴)
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(32, centerY);
    ctx.lineTo(w - 32, centerY);
    ctx.stroke();

    // 刻度线与毫米读数 (-30mm ~ +30mm)
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 22px "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let mm = -30; mm <= 30; mm += 5) {
      const px = w * 0.5 + mm * pxPerMm;
      const isMajor = mm % 10 === 0;

      ctx.lineWidth = isMajor ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.moveTo(px, centerY - (isMajor ? 14 : 8));
      ctx.lineTo(px, centerY + (isMajor ? 14 : 8));
      ctx.stroke();

      if (isMajor && mm !== 0) {
        ctx.fillText(`${mm > 0 ? '+' : ''}${mm}`, px, centerY + 18);
      }
    }
    ctx.fillText('0', w * 0.5, centerY + 18);

    // 5. 实时光强分布包络曲线
    if (this.showProfileCurve) {
      const graphTop = h * 0.60;
      const graphBottom = h * 0.90;
      const graphH = graphBottom - graphTop;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(48, graphTop - 24, w - 96, graphH + 48);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(48, graphTop - 24, w - 96, graphH + 48);

      ctx.strokeStyle = '#475569';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(56, graphTop);
      ctx.lineTo(w - 56, graphTop);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(56, graphBottom);
      ctx.lineTo(w - 56, graphBottom);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '20px "SF Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('I / I₀', 60, graphTop - 28);
      ctx.fillText('1.0', 60, graphTop + 4);
      ctx.fillText('0.0', 60, graphBottom - 4);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.0;
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let px = 56; px <= w - 56; px++) {
        const I = intensityArray[px];
        const py = graphBottom - I * graphH;
        if (px === 56) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 6. 顶角参数与遥测实况 HUD
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(48, 24, 480, 116);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(48, 24, 480, 116);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px "SF Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lambdaText = `λ = ${this.wavelengthNm.toFixed(1)} nm`;
    const distText = `L = ${(this.screenDistanceM * 1000).toFixed(1)} mm`;
    ctx.fillText(`${lambdaText}    ${distText}`, 64, 38);

    let paramText = '';
    let resultText = '';
    if (this.diffractionType === 'single') {
      paramText = `狭缝 a = ${this.slitWidthMm.toFixed(2)} mm`;
      const w0 = (2.0 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitWidthMm * 1e-3) * 1e3;
      resultText = `中央明纹宽 Δx₀ = ${w0.toFixed(2)} mm`;
    } else if (this.diffractionType === 'double') {
      paramText = `缝距 d = ${this.slitDistanceMm.toFixed(2)} mm (a=${this.slitWidthMm.toFixed(2)})`;
      const dy = (this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitDistanceMm * 1e-3) * 1e3;
      resultText = `干涉条纹间距 Δy = ${dy.toFixed(2)} mm`;
    } else if (this.diffractionType === 'circular') {
      paramText = `圆孔孔径 D = ${this.apertureDiameterMm.toFixed(2)} mm`;
      const rAiry = (1.2196696 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.apertureDiameterMm * 1e-3) * 1e3;
      resultText = `艾里斑半径 r₁ = ${rAiry.toFixed(2)} mm`;
    } else if (this.diffractionType === 'grating') {
      paramText = `光栅密度 N = ${Math.round(this.gratingLinesPerMm)} lines/mm`;
      const sinT = (this.wavelengthNm * 1e-9) / ((1 / this.gratingLinesPerMm) * 1e-3);
      const angle = THREE.MathUtils.radToDeg(Math.asin(Math.min(1.0, sinT)));
      resultText = `一级衍射角 θ₁ = ${angle.toFixed(2)}°`;
    }

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(paramText, 64, 70);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(resultText, 64, 102);

    this.screenTexture.needsUpdate = true;
  }

  // ==================== 3D 漫散射光路形状更新 (从左至右沿 X 轴传播) ====================
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

    if (this.gratingRaysGroup) {
      while (this.gratingRaysGroup.children.length > 0) {
        const c = this.gratingRaysGroup.children[0];
        this.gratingRaysGroup.remove(c);
        if ((c as any).geometry) (c as any).geometry.dispose();
      }
    }

    if (this.diffractionType === 'grating') {
      if (this.postBeamMesh) this.postBeamMesh.visible = false;
      if (this.gratingRaysGroup) {
        this.gratingRaysGroup.visible = true;
        const peaks = OpticalPhysics.getGratingPeakPositions(
          this.wavelengthNm,
          this.gratingLinesPerMm,
          this.screenDistanceM,
          2
        );

        peaks.forEach((pk) => {
          const zOffset = pk.xMm * 1e-3 * 0.75;
          const pStart = new THREE.Vector3(this.slitX, beamY, 0);
          const pEnd = new THREE.Vector3(screenX, beamY, zOffset);

          const dir = new THREE.Vector3().subVectors(pEnd, pStart);
          const len = dir.length();
          const mid = new THREE.Vector3().addVectors(pStart, pEnd).multiplyScalar(0.5);

          const rGeo = new THREE.CylinderGeometry(0.0024, 0.0035, len, 12);
          rGeo.rotateZ(Math.PI / 2);
          const rMesh = new THREE.Mesh(rGeo, this.beamMaterial);
          rMesh.position.copy(mid);
          rMesh.lookAt(pEnd);
          this.gratingRaysGroup.add(rMesh);
        });
      }
    } else {
      if (this.gratingRaysGroup) this.gratingRaysGroup.visible = false;
      if (this.postBeamMesh) {
        this.postBeamMesh.visible = true;

        let halfSpan = 0.045;
        if (this.diffractionType === 'single') {
          const w0Mm = (2.0 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitWidthMm * 1e-3) * 1e3;
          halfSpan = Math.min(0.12, Math.max(0.025, w0Mm * 1e-3 * 1.5));
        } else if (this.diffractionType === 'double') {
          const dyMm = (this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.slitDistanceMm * 1e-3) * 1e3;
          halfSpan = Math.min(0.12, Math.max(0.025, dyMm * 6 * 1e-3));
        } else if (this.diffractionType === 'circular') {
          const rAiryMm = (1.2196696 * this.wavelengthNm * 1e-9 * this.screenDistanceM) / (this.apertureDiameterMm * 1e-3) * 1e3;
          halfSpan = Math.min(0.12, Math.max(0.025, rAiryMm * 1e-3 * 2.0));
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
    if (this.turretLabelTexture) this.turretLabelTexture.dispose();
  }
}
