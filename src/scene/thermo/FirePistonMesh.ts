/**
 * 绝热压缩引火仪 3D 高精细度模型装配体 (High-Fidelity Fire Piston Apparatus 3D Mesh)
 *
 * 严格按照标准物理教学与科研级空气压缩引火仪实物工业精雕建模：
 * 1. 底座：加重防倾覆圆角矩形法兰底座，4个沉孔螺栓固定孔，阶梯安装颈与下锁套，航空级深空板岩暗金属涂层；
 * 2. 耐压气缸：大厚壁光学级透明高硼硅石英玻璃缸筒，具有真实的壁厚折射与光学通透感；
 * 3. 激光蚀刻标尺：正面精密激光蚀刻 0~50 mL 容积刻线、1:1 至 12:1 压缩比标志与鲜明燃点临界线 (T ≥ 165℃)；
 * 4. 气缸上端盖：外圈 48 齿精密机械滚花螺纹压盖，中心配备香槟金抛光黄铜低摩擦导向套筒；
 * 5. 活塞总成：
 *    - 贯通式 316L 镜面液态铬不锈钢活塞推杆；
 *    - 精密多阶金属活塞头，配有环形耐磨丁腈橡胶 O 型密封圈 (TorusGeometry)；
 *    - 顶部人体工学 T 型加力手柄，带圆润倒角与手部抓握曲面；
 * 6. 硝化棉絮体：底部放置天然蓬松松软多层有机白絮状硝化棉，具有纯白与爆燃炭化残渣双态；
 * 7. 3D 爆燃与火球火花光效：内腔高亮闪烁点光源、立体火球与飞扬火花粒子，瞬间爆燃视觉震撼；
 * 8. 原生三维浮空发光数字示数 (严格零 DOM 弹窗/浮动卡片)。
 */

import * as THREE from 'three';
import { disposeObjectTree } from '../mech/mechKit.ts';
import type { CompressionIgnitionTelemetry } from '../../physics/thermo/compressionIgnitionDynamics.ts';

export class FirePistonMesh {
  public readonly group = new THREE.Group();

  // 构件子分组
  public readonly staticGroup = new THREE.Group();        // 固定底座、气缸与端盖
  public readonly pistonMovingGroup = new THREE.Group();  // 活塞推杆、活塞头、O圈与T型手柄整体
  public readonly fxGroup = new THREE.Group();            // 火焰、火花与光效

  // 交互热区
  public readonly handleHitBox: THREE.Mesh;

  // 网格构件引用
  private baseFlangeMesh!: THREE.Mesh;
  private baseCollarMesh!: THREE.Mesh;
  private outerCylinderMesh!: THREE.Mesh;
  private innerBoreMesh!: THREE.Mesh;
  private bottomPlugMesh!: THREE.Mesh;
  private topKnurledCapMesh!: THREE.Mesh;
  private topBrassBushingMesh!: THREE.Mesh;
  private scalePlateMesh!: THREE.Mesh;
  private nameplateMesh!: THREE.Mesh;

  // 活塞网格
  private pistonRodMesh!: THREE.Mesh;
  private pistonHeadMesh!: THREE.Mesh;
  private oRingMesh!: THREE.Mesh;
  private tHandleBarMesh!: THREE.Mesh;
  private tHandleNeckMesh!: THREE.Mesh;

  // 硝化棉网格与材质
  private cottonGroup = new THREE.Group();
  private cottonClusters: THREE.Mesh[] = [];
  private ashMesh!: THREE.Mesh;
  private cottonMat!: THREE.MeshStandardMaterial;
  private ashMat!: THREE.MeshStandardMaterial;

  // 特效构件
  private fireLight!: THREE.PointLight;
  private fireballMesh!: THREE.Mesh;
  private fireballOuterMesh!: THREE.Mesh;
  private sparkPoints!: THREE.Points;
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPositions!: Float32Array;
  private sparkVelocities: THREE.Vector3[] = [];
  private readonly sparkCount = 36;

  // 原生三维悬浮发光示数 (零 DOM)
  private telemetrySprite!: THREE.Sprite;
  private telemetryCanvas!: HTMLCanvasElement;
  private telemetryCtx!: CanvasRenderingContext2D;
  private telemetryTexture!: THREE.CanvasTexture;
  private lastTelemetryText = '';

  // 标尺纹理
  private scaleTexture!: THREE.CanvasTexture;

  // 几何尺寸常量 (米)
  public readonly outerRadius = 0.018;        // 气缸外径 36 mm (半径 18 mm)
  public readonly innerRadius = 0.011;        // 气缸内径 22 mm (半径 11 mm，壁厚 7 mm)
  public readonly cylinderHeight = 0.165;     // 气缸筒身高度 165 mm
  public readonly baseHeight = 0.038;         // 底座顶端高度 38 mm
  public readonly cylinderTopY = 0.203;       // 气缸顶端绝对高度 (0.038 + 0.165)

  // 活塞行程范围
  public readonly pistonStrokeTopY = 0.170;   // 活塞头上止点 Y (mm)
  public readonly pistonStrokeBottomY = 0.048;// 活塞头下止点 Y (mm)
  public readonly strokeTravelM = 0.122;      // 活塞最大有效位移行程 (122 mm)

  constructor() {
    this.group.name = 'FirePistonMesh';
    this.group.add(this.staticGroup);
    this.group.add(this.pistonMovingGroup);
    this.group.add(this.fxGroup);

    this.buildBase();
    this.buildThickCylinder();
    this.buildTopCap();
    this.buildScaleGraduations();
    this.buildPistonAssembly();
    this.buildNitrocelluloseCotton();
    this.buildCombustionFX();
    this.buildSpatialTelemetry();

    // 创建专用加力手柄光标拾取热区
    this.handleHitBox = this.createHitBox(0.12, 0.05, 0.05);
    this.handleHitBox.name = 'FirePistonHandleHitBox';
    this.handleHitBox.position.set(0, 0.235, 0);
    this.pistonMovingGroup.add(this.handleHitBox);

    // 初始活塞定位至上死点 (stroke = 0)
    this.updatePistonPosition(0);
  }

  /**
   * 构建底座构件 (带4个沉头孔圆角方形法兰与多阶环套)
   */
  private buildBase(): void {
    // 1. 优质深空板岩暗金属涂层材质 (航天级金属质感，拒绝廉价脏黑)
    const baseMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.85,
      roughness: 0.32,
      envMapIntensity: 1.4,
    });

    const chromeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.95,
      roughness: 0.12,
    });

    // 2. 四角圆角法兰底板 (利用 Shape Extrude 制作精密工业圆角倒角)
    const size = 0.076;
    const half = size * 0.5;
    const radius = 0.014;
    const baseShape = new THREE.Shape();
    baseShape.moveTo(-half + radius, -half);
    baseShape.lineTo(half - radius, -half);
    baseShape.quadraticCurveTo(half, -half, half, -half + radius);
    baseShape.lineTo(half, half - radius);
    baseShape.quadraticCurveTo(half, half, half - radius, half);
    baseShape.lineTo(-half + radius, half);
    baseShape.quadraticCurveTo(-half, half, -half, half - radius);
    baseShape.lineTo(-half, -half + radius);
    baseShape.quadraticCurveTo(-half, -half, -half + radius, -half);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
    };

    const flangeGeo = new THREE.ExtrudeGeometry(baseShape, extrudeSettings);
    this.baseFlangeMesh = new THREE.Mesh(flangeGeo, baseMetalMat);
    this.baseFlangeMesh.rotation.x = -Math.PI / 2;
    this.baseFlangeMesh.position.y = 0.002;
    this.baseFlangeMesh.castShadow = true;
    this.baseFlangeMesh.receiveShadow = true;
    this.staticGroup.add(this.baseFlangeMesh);

    // 3. 底座 4 个沉头固定螺母孔 (带有微型沉孔倒角)
    const holeOffset = half - 0.010;
    const holePoses = [
      [-holeOffset, -holeOffset],
      [holeOffset, -holeOffset],
      [-holeOffset, holeOffset],
      [holeOffset, holeOffset],
    ];

    const holeRimGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 16);
    const holeDarkGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 16);
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x0a0c10 });

    for (const [hx, hz] of holePoses) {
      const rim = new THREE.Mesh(holeRimGeo, chromeTrimMat);
      rim.position.set(hx, 0.013, hz);
      this.staticGroup.add(rim);

      const darkCenter = new THREE.Mesh(holeDarkGeo, darkMat);
      darkCenter.position.set(hx, 0.014, hz);
      this.staticGroup.add(darkCenter);
    }

    // 4. 底座中部阶梯圆柱台与插座环套 (y = 0.012 至 0.038)
    const riserGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.016, 48);
    const riserMesh = new THREE.Mesh(riserGeo, baseMetalMat);
    riserMesh.position.y = 0.020;
    riserMesh.castShadow = true;
    this.staticGroup.add(riserMesh);

    const collarGeo = new THREE.CylinderGeometry(0.021, 0.023, 0.012, 48);
    this.baseCollarMesh = new THREE.Mesh(collarGeo, baseMetalMat);
    this.baseCollarMesh.position.y = 0.032;
    this.baseCollarMesh.castShadow = true;
    this.staticGroup.add(this.baseCollarMesh);

    // 抛光不锈钢密封锁紧环
    const lockRingGeo = new THREE.CylinderGeometry(0.0215, 0.0215, 0.0035, 48);
    const lockRingMesh = new THREE.Mesh(lockRingGeo, chromeTrimMat);
    lockRingMesh.position.y = 0.037;
    this.staticGroup.add(lockRingMesh);

    // 5. 底座正前方激光蚀刻规格铭牌
    this.buildNameplate();
  }

  /**
   * 底座正面激光蚀刻铭牌
   */
  private buildNameplate(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // 纯深蓝灰金属拉丝底板背景
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 128);

    // 双线外框
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 488, 104);

    // 文字
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('AIR COMPRESSION IGNITION APPARATUS', 256, 54);

    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('绝热压缩引火仪 · 硝化棉燃点 165℃ (γ=1.40)', 256, 96);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const plateGeo = new THREE.PlaneGeometry(0.046, 0.012);
    const plateMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.25,
      metalness: 0.65,
    });

    this.nameplateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.nameplateMesh.position.set(0, 0.020, 0.0255);
    this.staticGroup.add(this.nameplateMesh);
  }

  /**
   * 构建厚壁耐压石英玻璃气缸筒 (具有逼真的内外壁厚折射)
   */
  private buildThickCylinder(): void {
    // 1. 光学物理玻璃材质 (厚壁高透、菲涅尔高光反射)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.40,
      roughness: 0.04,
      metalness: 0.06,
      transmission: 0.94,
      ior: 1.52,
      thickness: 0.025,
      specularIntensity: 1.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 外壁圆柱 (y = 0.038 至 0.203)
    const outerGeo = new THREE.CylinderGeometry(
      this.outerRadius,
      this.outerRadius,
      this.cylinderHeight,
      48,
      1,
      true
    );
    this.outerCylinderMesh = new THREE.Mesh(outerGeo, glassMat);
    this.outerCylinderMesh.position.y = this.baseHeight + this.cylinderHeight * 0.5;
    this.outerCylinderMesh.renderOrder = 10;
    this.staticGroup.add(this.outerCylinderMesh);

    // 内壁圆柱 (展现厚壁玻璃管的真实内孔边缘)
    const innerGeo = new THREE.CylinderGeometry(
      this.innerRadius,
      this.innerRadius,
      this.cylinderHeight,
      48,
      1,
      true
    );
    const innerGlassMat = glassMat.clone();
    innerGlassMat.opacity = 0.20;
    this.innerBoreMesh = new THREE.Mesh(innerGeo, innerGlassMat);
    this.innerBoreMesh.position.y = this.outerCylinderMesh.position.y;
    this.innerBoreMesh.renderOrder = 9;
    this.staticGroup.add(this.innerBoreMesh);

    // 缸底内密封底塞 (抛光不锈钢，y = 0.038)
    const plugGeo = new THREE.CylinderGeometry(this.innerRadius, this.innerRadius, 0.005, 36);
    const plugMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.15,
    });
    this.bottomPlugMesh = new THREE.Mesh(plugGeo, plugMat);
    this.bottomPlugMesh.position.y = this.baseHeight + 0.0025;
    this.staticGroup.add(this.bottomPlugMesh);
  }

  /**
   * 激光蚀刻刻度与读数基准线 (贴于玻璃气缸正前方 +Z)
   */
  private buildScaleGraduations(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 512, 2048);

    // 标尺纵向中基线
    const centerX = 256;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX, 120);
    ctx.lineTo(centerX, 1920);
    ctx.stroke();

    // 刻度行程：对应 50 mL 到 0 mL (从顶部 y=0.170 到底部 y=0.048)
    const totalMarks = 10; // 0, 5, 10, ... 50 mL
    for (let i = 0; i <= totalMarks; i++) {
      const vol = 50 - i * 5;
      const t = i / totalMarks; // 0 为顶 (50mL), 1 为底 (0mL)
      const y = 160 + t * 1680;

      // 主刻度线
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(centerX - 48, y);
      ctx.lineTo(centerX + 48, y);
      ctx.stroke();

      // 右侧容积读数 (mL)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${vol}`, centerX + 64, y + 15);

      // 左侧压缩比刻注
      let ratioStr = '';
      if (vol === 50) ratioStr = '1:1';
      else if (vol === 25) ratioStr = '2:1';
      else if (vol === 12.5 || vol === 15) ratioStr = '4:1';
      else if (vol === 6 || vol === 5) ratioStr = '10:1';

      if (ratioStr) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(ratioStr, centerX - 64, y + 14);
      }

      // 次分度微米细线 (每 1 mL)
      if (i < totalMarks) {
        for (let sub = 1; sub < 5; sub++) {
          const subY = y + (sub / 5) * (1680 / totalMarks);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(centerX - 22, subY);
          ctx.lineTo(centerX + 22, subY);
          ctx.stroke();
        }
      }
    }

    // 燃点临界危险警示红线 (位于下部压缩比 ~8:1 处，约 1650px)
    const critY = 160 + 0.82 * 1680;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(centerX - 120, critY);
    ctx.lineTo(centerX + 120, critY);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼ 燃点临界线 (T ≥ 165℃) ▼', centerX, critY - 24);

    this.scaleTexture = new THREE.CanvasTexture(canvas);
    this.scaleTexture.minFilter = THREE.LinearFilter;

    // 弯曲刻度透明片附于气缸外壁正前方
    const plateGeo = new THREE.CylinderGeometry(
      this.outerRadius + 0.0006,
      this.outerRadius + 0.0006,
      this.cylinderHeight * 0.94,
      32,
      1,
      true,
      -Math.PI * 0.28,
      Math.PI * 0.56
    );

    const plateMat = new THREE.MeshBasicMaterial({
      map: this.scaleTexture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.scalePlateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.scalePlateMesh.position.y = this.baseHeight + this.cylinderHeight * 0.5;
    this.scalePlateMesh.rotation.y = Math.PI; // 正对 +Z 轴
    this.scalePlateMesh.renderOrder = 15;
    this.staticGroup.add(this.scalePlateMesh);
  }

  /**
   * 构建气缸顶部机械滚花螺母压盖与中心黄铜导套
   */
  private buildTopCap(): void {
    const capMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.85,
      roughness: 0.32,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.20,
    });

    const capY = this.cylinderTopY;

    // 1. 压盖下阶梯主体 (y = capY 至 capY + 0.016)
    const capBodyGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 48);
    this.topKnurledCapMesh = new THREE.Mesh(capBodyGeo, capMetalMat);
    this.topKnurledCapMesh.position.y = capY + 0.008;
    this.topKnurledCapMesh.castShadow = true;
    this.staticGroup.add(this.topKnurledCapMesh);

    // 2. 真实三维立体机械滚花凸棱 (Knurled Ribs - 48 齿细密凹凸齿，告别纸片贴图)
    const ribGeo = new THREE.BoxGeometry(0.0008, 0.015, 0.0016);
    const knurlCount = 48;
    for (let i = 0; i < knurlCount; i++) {
      const angle = (i / knurlCount) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeo, capMetalMat);
      rib.position.set(
        Math.cos(angle) * 0.0212,
        capY + 0.008,
        Math.sin(angle) * 0.0212
      );
      rib.rotation.y = -angle;
      this.staticGroup.add(rib);
    }

    // 3. 上阶梯收口环 (y = capY + 0.016 至 capY + 0.024)
    const upperCollarGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.008, 36);
    const upperCollar = new THREE.Mesh(upperCollarGeo, capMetalMat);
    upperCollar.position.y = capY + 0.020;
    this.staticGroup.add(upperCollar);

    // 4. 中心导向黄铜压套 (提供活塞杆穿入的光滑低摩擦滑动孔)
    const bushingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.026, 24);
    this.topBrassBushingMesh = new THREE.Mesh(bushingGeo, brassMat);
    this.topBrassBushingMesh.position.y = capY + 0.013;
    this.staticGroup.add(this.topBrassBushingMesh);
  }

  /**
   * 构建活塞总成 (镀铬中心杆、多阶金属活塞头、耐磨O型橡胶圈、T型手柄)
   */
  private buildPistonAssembly(): void {
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.08,
      envMapIntensity: 2.0,
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.15,
      roughness: 0.85,
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.80,
      roughness: 0.35,
    });

    // 1. 活塞推杆 (Mirror Polish Liquid Chrome Rod, 贯通式，长度 240mm)
    const rodRadius = 0.0035;
    const rodLength = 0.240;
    const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 24);
    this.pistonRodMesh = new THREE.Mesh(rodGeo, chromeMat);
    this.pistonRodMesh.position.y = rodLength * 0.5;
    this.pistonRodMesh.castShadow = true;
    this.pistonMovingGroup.add(this.pistonRodMesh);

    // 2. 活塞头 (位于推杆底端 y = 0 处，严密契合内径 22mm)
    const headGroup = new THREE.Group();

    // 活塞头上压盖 (y = 0.009 至 0.014)
    const topCapDiscGeo = new THREE.CylinderGeometry(0.0108, 0.0108, 0.005, 36);
    const topCapDisc = new THREE.Mesh(topCapDiscGeo, chromeMat);
    topCapDisc.position.y = 0.0115;
    headGroup.add(topCapDisc);

    // O型圈密封凹槽 (y = 0.005 至 0.009，槽底收紧)
    const grooveGeo = new THREE.CylinderGeometry(0.0084, 0.0084, 0.004, 36);
    const grooveMesh = new THREE.Mesh(grooveGeo, chromeMat);
    grooveMesh.position.y = 0.007;
    headGroup.add(grooveMesh);

    // 真实立体 TorusGeometry 橡胶密封圈 (外径贴紧内壁)
    const oRingGeo = new THREE.TorusGeometry(0.0095, 0.0017, 16, 36);
    this.oRingMesh = new THREE.Mesh(oRingGeo, rubberMat);
    this.oRingMesh.rotation.x = Math.PI / 2;
    this.oRingMesh.position.y = 0.007;
    headGroup.add(this.oRingMesh);

    // 活塞头下端受压承压盘 (y = 0 至 0.005，带 45° 倒角)
    const bottomDiscGeo = new THREE.CylinderGeometry(0.0108, 0.0098, 0.005, 36);
    this.pistonHeadMesh = new THREE.Mesh(bottomDiscGeo, chromeMat);
    this.pistonHeadMesh.position.y = 0.0025;
    headGroup.add(this.pistonHeadMesh);

    this.pistonMovingGroup.add(headGroup);

    // 3. 顶部人体工学 T 型加力手柄 (位于杆顶 y = rodLength 处)
    const handleGroup = new THREE.Group();
    handleGroup.position.y = rodLength;

    // 手柄横向主握把 (长 94mm, 直径 15mm, 左右对称圆润倒角)
    const barGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.088, 32);
    this.tHandleBarMesh = new THREE.Mesh(barGeo, handleMat);
    this.tHandleBarMesh.rotation.z = Math.PI / 2;
    this.tHandleBarMesh.position.y = 0.016;
    this.tHandleBarMesh.castShadow = true;
    handleGroup.add(this.tHandleBarMesh);

    // 左右半球形圆润手感端盖
    const endGeo = new THREE.SphereGeometry(0.0075, 16, 16);
    const leftEnd = new THREE.Mesh(endGeo, handleMat);
    leftEnd.position.set(-0.044, 0.016, 0);
    handleGroup.add(leftEnd);

    const rightEnd = new THREE.Mesh(endGeo, handleMat);
    rightEnd.position.set(0.044, 0.016, 0);
    handleGroup.add(rightEnd);

    // 下方流线型收腰颈套与活塞杆锁固套筒
    const neckGeo = new THREE.CylinderGeometry(0.008, 0.0055, 0.016, 24);
    this.tHandleNeckMesh = new THREE.Mesh(neckGeo, handleMat);
    this.tHandleNeckMesh.position.y = 0.008;
    this.tHandleNeckMesh.castShadow = true;
    handleGroup.add(this.tHandleNeckMesh);

    this.pistonMovingGroup.add(handleGroup);
  }

  /**
   * 构建底部硝化棉白絮结构与爆燃炭化残渣
   */
  private buildNitrocelluloseCotton(): void {
    // 1. 天然蓬松棉絮材质 (纯白象牙微光，高漫反射软阴影)
    this.cottonMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.95,
      metalness: 0.02,
    });

    // 2. 炭化残渣材质 (爆燃后留下的微量微炭化黑色碎屑)
    this.ashMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.98,
      metalness: 0.1,
    });

    this.cottonGroup.position.set(0, this.baseHeight + 0.003, 0);

    // 多个不同半径的微簇不规则堆叠成蓬松棉花团
    const clusterData = [
      { r: 0.0042, x: 0, y: 0.004, z: 0 },
      { r: 0.0035, x: 0.003, y: 0.003, z: 0.002 },
      { r: 0.0032, x: -0.003, y: 0.003, z: -0.002 },
      { r: 0.0030, x: 0.002, y: 0.006, z: -0.003 },
      { r: 0.0028, x: -0.002, y: 0.006, z: 0.003 },
      { r: 0.0025, x: 0, y: 0.008, z: 0 },
    ];

    for (const c of clusterData) {
      const geo = new THREE.SphereGeometry(c.r, 16, 16);
      const mesh = new THREE.Mesh(geo, this.cottonMat);
      mesh.position.set(c.x, c.y, c.z);
      mesh.scale.set(1.1, 0.9, 1.0);
      mesh.castShadow = true;
      this.cottonClusters.push(mesh);
      this.cottonGroup.add(mesh);
    }

    // 底部少量残渣碎片薄片 (初始隐藏)
    const ashGeo = new THREE.CylinderGeometry(0.005, 0.006, 0.001, 16);
    this.ashMesh = new THREE.Mesh(ashGeo, this.ashMat);
    this.ashMesh.position.set(0, 0.0005, 0);
    this.ashMesh.visible = false;
    this.cottonGroup.add(this.ashMesh);

    this.staticGroup.add(this.cottonGroup);
  }

  /**
   * 构建爆燃光效、3D 火球与飞散火花粒子
   */
  private buildCombustionFX(): void {
    const chamberBottomY = this.baseHeight + 0.008;

    // 1. 腔内瞬态剧烈闪烁点光源 (初始强度 0)
    this.fireLight = new THREE.PointLight(0xffa834, 0.0, 0.8, 2);
    this.fireLight.position.set(0, chamberBottomY + 0.005, 0);
    this.fxGroup.add(this.fireLight);

    // 2. 内部火球核心 (白热炽烈球体)
    const fireCoreGeo = new THREE.SphereGeometry(0.007, 16, 16);
    const fireCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    this.fireballMesh = new THREE.Mesh(fireCoreGeo, fireCoreMat);
    this.fireballMesh.position.set(0, chamberBottomY + 0.006, 0);
    this.fxGroup.add(this.fireballMesh);

    // 3. 外部火焰光晕壳 (橙红焰心，Additive 叠加发光)
    const fireOuterGeo = new THREE.SphereGeometry(0.010, 16, 16);
    const fireOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    this.fireballOuterMesh = new THREE.Mesh(fireOuterGeo, fireOuterMat);
    this.fireballOuterMesh.position.set(0, chamberBottomY + 0.006, 0);
    this.fxGroup.add(this.fireballOuterMesh);

    // 4. 火花飞散粒子系统 (36 颗火星粒子在气缸内飞舞)
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.sparkCount * 3);

    for (let i = 0; i < this.sparkCount; i++) {
      this.sparkPositions[i * 3 + 0] = 0;
      this.sparkPositions[i * 3 + 1] = chamberBottomY;
      this.sparkPositions[i * 3 + 2] = 0;

      // 初始随机向上微喷速度
      this.sparkVelocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.04,
          Math.random() * 0.08 + 0.02,
          (Math.random() - 0.5) * 0.04
        )
      );
    }
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));

    const sparkMat = new THREE.PointsMaterial({
      color: 0xffd166,
      size: 0.0035,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });

    this.sparkPoints = new THREE.Points(this.sparkGeo, sparkMat);
    this.fxGroup.add(this.sparkPoints);
  }

  /**
   * 构建原生三维浮空发光数字示数 (严格零 DOM 弹窗/浮动卡片)
   */
  private buildSpatialTelemetry(): void {
    this.telemetryCanvas = document.createElement('canvas');
    this.telemetryCanvas.width = 640;
    this.telemetryCanvas.height = 360;
    this.telemetryCtx = this.telemetryCanvas.getContext('2d')!;

    this.telemetryTexture = new THREE.CanvasTexture(this.telemetryCanvas);
    this.telemetryTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.telemetryTexture,
      transparent: true,
      depthWrite: false,
    });

    this.telemetrySprite = new THREE.Sprite(spriteMat);
    this.telemetrySprite.raycast = () => {}; // 避免拦截鼠标射线与产生无相机异常
    // 定位于气缸右侧空中，端正正对用户视线 (+Z)
    this.telemetrySprite.position.set(0.085, 0.125, 0.010);
    this.telemetrySprite.scale.set(0.125, 0.070, 1.0);
    this.group.add(this.telemetrySprite);

    this.updateSpatialTelemetry({
      stroke: 0,
      physicalHeightM: this.pistonStrokeTopY,
      velocityMS: 0,
      volumeML: 50.0,
      pressureAtm: 1.0,
      temperatureC: 20.0,
      temperatureK: 293.15,
      compressionRatio: 1.0,
      cottonState: 'ready',
      flameIntensity: 0.0,
      ignitionProgress: 0.0,
      isPneumaticRebounding: false,
    });
  }

  /**
   * 刷新三维空间悬浮发光示数
   */
  public updateSpatialTelemetry(t: CompressionIgnitionTelemetry): void {
    const textKey = `${t.volumeML.toFixed(1)}_${t.pressureAtm.toFixed(1)}_${t.temperatureC.toFixed(0)}_${t.cottonState}`;
    if (textKey === this.lastTelemetryText) return;
    this.lastTelemetryText = textKey;

    const ctx = this.telemetryCtx;
    ctx.clearRect(0, 0, 640, 360);

    // 纯透明背景，发光文字投射柔和深黑阴影保证极高对比度
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.textAlign = 'left';

    // 1. 标题
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('腔内热力学实时遥测', 24, 48);

    // 2. 容积
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`气缸容积 V: ${t.volumeML.toFixed(1)} mL`, 24, 102);

    // 3. 压强
    ctx.fillStyle = t.pressureAtm > 8.0 ? '#f59e0b' : '#f8fafc';
    ctx.fillText(`气体压强 P: ${t.pressureAtm.toFixed(2)} atm`, 24, 156);

    // 4. 温度 (颜色动态响应：20℃蓝绿 -> 100℃琥珀 -> 200℃+烈焰绯红)
    let tempColor = '#34d399';
    if (t.temperatureC > 165) tempColor = '#ef4444';
    else if (t.temperatureC > 70) tempColor = '#f59e0b';

    ctx.fillStyle = tempColor;
    ctx.fillText(`气体温度 T: ${t.temperatureC.toFixed(1)} ℃`, 24, 210);

    // 5. 压缩比
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`容积压缩比: ${t.compressionRatio.toFixed(2)} : 1`, 24, 264);

    // 6. 硝化棉状态
    let cottonStr = '硝化棉: 待点燃 (燃点 165℃)';
    let cottonColor = '#38bdf8';
    if (t.cottonState === 'igniting') {
      cottonStr = '硝化棉: ★ 瞬间剧烈爆燃中 ★';
      cottonColor = '#fbbf24';
    } else if (t.cottonState === 'burnt') {
      cottonStr = '硝化棉: 已燃尽 (完全炭化)';
      cottonColor = '#64748b';
    }

    ctx.fillStyle = cottonColor;
    ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(cottonStr, 24, 320);

    this.telemetryTexture.needsUpdate = true;
  }

  /**
   * 同步更新活塞位置 (stroke 为 0 到 1)
   */
  public updatePistonPosition(stroke: number): void {
    const s = Math.max(0.0, Math.min(1.0, stroke));
    // 活塞底面在局部坐标系中的实际高度
    const currentY = this.pistonStrokeTopY - s * (this.pistonStrokeTopY - this.pistonStrokeBottomY);
    this.pistonMovingGroup.position.y = currentY;
  }

  /**
   * 视觉主更新：同步活塞、硝化棉状态与爆燃火花
   */
  public updateVisualState(t: CompressionIgnitionTelemetry, delta: number): void {
    // 1. 同步活塞高度
    this.updatePistonPosition(t.stroke);

    // 2. 同步空间遥测示数
    this.updateSpatialTelemetry(t);

    // 3. 硝化棉三维几何形态与材质过渡
    if (t.cottonState === 'ready') {
      this.cottonGroup.visible = true;
      this.ashMesh.visible = false;
      this.cottonMat.color.setHex(0xf8fafc);
      for (const cluster of this.cottonClusters) {
        cluster.visible = true;
        cluster.scale.set(1.1, 0.9, 1.0);
      }
    } else if (t.cottonState === 'igniting') {
      this.cottonGroup.visible = true;
      this.ashMesh.visible = true;
      // 燃烧瞬间棉球变焦黄并急剧缩小
      const shrink = Math.max(0.2, 1.0 - t.ignitionProgress * 0.8);
      this.cottonMat.color.lerpColors(
        new THREE.Color(0xf8fafc),
        new THREE.Color(0xff4500),
        t.ignitionProgress
      );
      for (const cluster of this.cottonClusters) {
        cluster.scale.set(shrink, shrink * 0.7, shrink);
      }
    } else if (t.cottonState === 'burnt') {
      // 燃尽：白絮完全消失，仅留底部微黑残渣
      for (const cluster of this.cottonClusters) {
        cluster.visible = false;
      }
      this.ashMesh.visible = true;
    }

    // 4. 爆燃火焰与闪光更新
    const flame = t.flameIntensity;
    this.fireLight.intensity = flame * 7.5;
    (this.fireballMesh.material as THREE.MeshBasicMaterial).opacity = flame * 0.95;
    (this.fireballOuterMesh.material as THREE.MeshBasicMaterial).opacity = flame * 0.85;

    // 火球尺寸呼吸膨胀
    const fireballScale = 0.5 + flame * 1.8;
    this.fireballMesh.scale.setScalar(fireballScale);
    this.fireballOuterMesh.scale.setScalar(fireballScale * 1.35);

    // 5. 飞散火花粒子更新
    const sparkMat = this.sparkPoints.material as THREE.PointsMaterial;
    sparkMat.opacity = flame * 0.95;

    if (flame > 0.05) {
      const chamberBottomY = this.baseHeight + 0.008;
      const posAttr = this.sparkGeo.attributes.position as THREE.BufferAttribute;

      for (let i = 0; i < this.sparkCount; i++) {
        const vel = this.sparkVelocities[i];
        let px = this.sparkPositions[i * 3 + 0] + vel.x * delta;
        let py = this.sparkPositions[i * 3 + 1] + vel.y * delta;
        let pz = this.sparkPositions[i * 3 + 2] + vel.z * delta;

        // 内壁约束碰撞反弹 (半径 0.010m)
        const distFromCenter = Math.hypot(px, pz);
        if (distFromCenter > 0.0095) {
          vel.x *= -0.7;
          vel.z *= -0.7;
          px = (px / distFromCenter) * 0.0094;
          pz = (pz / distFromCenter) * 0.0094;
        }

        // 活塞底面下压约束 (不能穿透活塞头)
        const currentPistonY = this.pistonMovingGroup.position.y;
        if (py > currentPistonY - 0.002) {
          py = currentPistonY - 0.002;
          vel.y *= -0.5;
        }

        // 重力轻微下沉
        vel.y -= 0.15 * delta;

        this.sparkPositions[i * 3 + 0] = px;
        this.sparkPositions[i * 3 + 1] = py;
        this.sparkPositions[i * 3 + 2] = pz;
      }
      posAttr.needsUpdate = true;
    } else {
      // 火熄灭后重置火花位置至底部
      const chamberBottomY = this.baseHeight + 0.008;
      for (let i = 0; i < this.sparkCount; i++) {
        this.sparkPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.006;
        this.sparkPositions[i * 3 + 1] = chamberBottomY + Math.random() * 0.004;
        this.sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
      }
      (this.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /**
   * 创建透明无渲染的交互热区拾取盒
   */
  private createHitBox(w: number, h: number, d: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = true; // 确保参与 Raycast 拾取
    return mesh;
  }

  /**
   * 彻底释放 GPU 几何体、纹理与材质
   */
  public dispose(): void {
    if (this.telemetryTexture) this.telemetryTexture.dispose();
    if (this.scaleTexture) this.scaleTexture.dispose();
    disposeObjectTree(this.group);
  }
}
