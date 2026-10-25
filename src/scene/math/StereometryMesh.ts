import * as THREE from 'three';
import {
  GeometrySolver,
  type HighSchoolModelType,
  type PolyhedronModelDef,
  type KeyPoint,
  type CrossSectionResult,
  type SphereAnalysisResult,
} from './GeometrySolver.ts';
import { AuxiliaryFaceSolver, type AuxiliaryFace } from './AuxiliaryFaceSolver.ts';

export type { AuxiliaryFace };

export interface StereometryDisplayOptions {
  modelType: HighSchoolModelType;
  dimensions: { a?: number; b?: number; c?: number; h?: number; r?: number };
  showKeyPoints: boolean;
  showMidpoints: boolean;
  showFaceCenters: boolean;
  showLabels: boolean;
  showDashedLines: boolean;
  showCoordinateSystem: boolean;
  originKeyPointId?: string;
  showCircumSphere: boolean;
  showInSphere: boolean;
  showEmbeddingBox: boolean; // 补形透视 (长方体/正方体封套)
  showThreeViews: boolean;
  unfoldProgress: number;     // 0 .. 1 (表面展开图)
  clippingEnabled: boolean;   // 剖切裁剪
  explodeDistance: number;    // 剖切分离推开距离
  crossSectionPlane?: THREE.Plane;
}

export interface DrawnSegment {
  id: string;
  pointIdA: string;
  pointIdB: string;
  label: string;
  color: number;
  length: number;
}

export class StereometryMesh {
  public readonly group = new THREE.Group();

  // 根级子容器
  public readonly modelContainer = new THREE.Group();

  // 挂载至 modelContainer 的子编组
  private solidGroup = new THREE.Group();
  private edgesSolidGroup = new THREE.Group();
  private edgesDashedGroup = new THREE.Group();
  private embeddingBoxGroup = new THREE.Group();
  private keyPointsGroup = new THREE.Group();
  private labelsGroup = new THREE.Group();
  private segmentsGroup = new THREE.Group();
  private crossSectionGroup = new THREE.Group();
  private coordinateGroup = new THREE.Group();
  private spheresGroup = new THREE.Group();
  private unfoldGroup = new THREE.Group();
  private threeViewsGroup = new THREE.Group();
  private snapCursorGroup = new THREE.Group();
  private selectedMarkersGroup = new THREE.Group();
  private previewSegmentGroup = new THREE.Group();
  private segmentAnimGroup = new THREE.Group();
  private auxGroup = new THREE.Group();
  private auxFacesGroup = new THREE.Group();
  private auxiliaryFaces: AuxiliaryFace[] = [];
  private hitEnvelopeMesh: THREE.Mesh | null = null;
  private modelScale = 1.0;

  // 新连线空间线段的动态生长动画
  private activeSegmentAnimations: Array<{
    id: string;
    pipeMesh: THREE.Mesh;
    glowTipMesh: THREE.Mesh;
    posA: THREE.Vector3;
    posB: THREE.Vector3;
    finalLength: number;
    dir: THREE.Vector3;
    color: number;
    progress: number;
    duration: number;
  }> = [];

  // 可复用动态预览连线资源（零内存分配保障 120 FPS）
  private previewPipeMesh: THREE.Mesh | null = null;
  private previewLineMesh: THREE.Line | null = null;
  private previewStartBead: THREE.Mesh | null = null;
  private previewEndBead: THREE.Mesh | null = null;
  private previewBadgeSprite: THREE.Sprite | null = null;
  private previewBadgeCanvas: HTMLCanvasElement | null = null;
  private previewBadgeTex: THREE.CanvasTexture | null = null;
  private lastPreviewBadgeKey = '';
  private lastPreviewStartPos: THREE.Vector3 | null = null;
  private lastPreviewEndPos: THREE.Vector3 | null = null;

  // 聚焦光晕与准星公告板精灵（无裁剪，始终面向相机）
  private snapCursorSprite: THREE.Sprite | null = null;
  private snapRippleSprite: THREE.Sprite | null = null;
  private snapHoverBead: THREE.Mesh | null = null;
  private snapHoverBeadMat: THREE.MeshStandardMaterial | null = null;
  private snapBadgeSprite: THREE.Sprite | null = null;
  private snapBadgeCanvas: HTMLCanvasElement | null = null;
  private snapBadgeTex: THREE.CanvasTexture | null = null;
  private lastSnapBadgeKey = '';
  private snapEnterTime = 0;
  private snapRipplePhase = 0;
  private selectedBeaconSprites: Map<string, THREE.Sprite> = new Map();
  private lastHoveredMeshId: string | null = null;
  private lastCamLocal = new THREE.Vector3(Infinity, Infinity, Infinity);
  private edgeScratchCamLocal = new THREE.Vector3();
  private edgeScratchUp = new THREE.Vector3(0, 1, 0);
  private edgeScratchDir = new THREE.Vector3();
  private edgeScratchMid = new THREE.Vector3();
  private edgeScratchQuat = new THREE.Quaternion();
  private edgeScratchScale = new THREE.Vector3();
  private edgeScratchMat = new THREE.Matrix4();
  private lastSelectedIds: string[] = [];
  private lastCamera: THREE.Camera | null = null;

  // 当前模型状态
  private currentModelDef: PolyhedronModelDef;
  private recognizedModel: PolyhedronModelDef | null = null;
  private currentOptions: StereometryDisplayOptions;
  private currentCrossSection: CrossSectionResult | null = null;
  private currentSphereAnalysis: SphereAnalysisResult;
  private drawnSegments: DrawnSegment[] = [];

  // 射线投射关键点缓存
  private keyPointMeshes: Map<string, THREE.Mesh> = new Map();
  private hoveredKeyPointId: string | null = null;

  // 空中悬浮状态（纯 3D 几何浮空展示）
  public baseHoverY = 0.22;
  public readonly minClearance = 0.055; // 距桌面至少 5.5cm 净空，防止模型穿透台面
  private hoverTime = 0;

  // 舞台展示编组（投影光环、接触阴影、氛围照明）
  private stagePresentationGroup = new THREE.Group();

  // 共享可复用几何体（精微节点与高精度结构杆）
  private sharedVertexGeo = new THREE.SphereGeometry(0.0048, 16, 16);
  private sharedMidpointGeo = new THREE.SphereGeometry(0.0036, 12, 12);
  private sharedThirdGeo = new THREE.SphereGeometry(0.0032, 12, 12);
  private sharedCenterGeo = new THREE.SphereGeometry(0.0032, 12, 12);
  private unitCylinderGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 8);

  // 材质定义 - 水晶玻璃美学与深度测试消隐
  private depthMaskMaterial: THREE.MeshBasicMaterial;
  private solidBackMaterial: THREE.MeshPhysicalMaterial;
  private solidFrontMaterial: THREE.MeshPhysicalMaterial;
  private solidCutMaterial: THREE.MeshPhysicalMaterial;
  private strutMaterial: THREE.MeshStandardMaterial;
  private solidEdgeMaterial: THREE.LineBasicMaterial;
  private dashedEdgeMaterial: THREE.LineDashedMaterial;
  private auxEdgeMaterial: THREE.LineDashedMaterial;
  private crossSectionFillMat: THREE.MeshStandardMaterial;
  private crossSectionLineMat: THREE.LineBasicMaterial;
  private circumSphereMat: THREE.MeshStandardMaterial;
  private inSphereMat: THREE.MeshStandardMaterial;
  private auxFaceFillMat: THREE.MeshStandardMaterial;
  private auxFaceContourMat: THREE.LineBasicMaterial;

  // 珍珠节点材质（高对比度空间珍珠锚点）
  private vertexNodeMat: THREE.MeshStandardMaterial;
  private midpointNodeMat: THREE.MeshStandardMaterial;
  private thirdNodeMat: THREE.MeshStandardMaterial;
  private centerNodeMat: THREE.MeshStandardMaterial;
  private originNodeMat: THREE.MeshStandardMaterial;

  // 棱与面邻接关系缓存，用于精确判定视线消隐遮挡
  private edgeAdjacencies: Array<{
    edgeIndex: number;
    i1: number;
    i2: number;
    faceIndices: number[];
  }> = [];
  private solidEdgesMesh: THREE.LineSegments | null = null;
  private dashedEdgesMesh: THREE.LineSegments | null = null;
  private solidStrutsMesh: THREE.InstancedMesh | null = null;

  // 展开动画多边形面组缓存
  private unfoldingFaceGroups: THREE.Group[] = [];

  public static readonly CANONICAL_VISUAL_SIZE = 0.58;
  public static readonly CANONICAL_VISUAL_DIMENSIONS = {
    a: 0.58,
    b: 0.58,
    c: 0.58,
    h: 0.58,
    r: 0.29,
  };

  private numericalDimensions: { a: number; h: number; b?: number; c?: number; r?: number } = { a: 1, h: 1 };

  constructor() {
    this.group.name = 'StereometryMesh';
    this.initMaterials();
    this.assembleGroups();

    // 默认配置：标准高中正方体，课本标准斜二测视角，精确整数归一化
    this.currentOptions = {
      modelType: 'cube',
      dimensions: { a: 1, b: 1, c: 1, h: 1 },
      showKeyPoints: true,
      showMidpoints: false,      // 默认绝不平铺中点
      showFaceCenters: false,    // 默认绝不平铺面心
      showLabels: true,          // 清晰的顶点公告板标号 (A, B, C, D, ...)
      showDashedLines: false,    // 默认所有棱均使用实线（被遮挡的棱也用实线）
      showCoordinateSystem: false, // 默认保持界面清爽，可在空间向量标签中开启
      showCircumSphere: false,
      showInSphere: false,
      showEmbeddingBox: false,
      showThreeViews: false,
      unfoldProgress: 0,
      clippingEnabled: false,
      explodeDistance: 0,
    };
    this.numericalDimensions = { a: 1, h: 1 };

    // 视觉实体始终采用标准归一化基准尺寸构建，确保无论数值如何修改，显示大小均保持稳定
    this.currentModelDef = GeometrySolver.createModel('cube', StereometryMesh.CANONICAL_VISUAL_DIMENSIONS);
    this.currentSphereAnalysis = GeometrySolver.computeSphereAnalysis('cube', this.numericalDimensions);

    this.rebuildAll();
    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;
  }

  private initMaterials(): void {
    // 1. 深度遮罩通道：仅写入前向面深度而不写入颜色
    // 这允许被遮挡的后向棱精确通过 GreaterDepth 测试
    this.depthMaskMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    // 1.5 后向面光学折射层，营造水晶体积深度感（深邃发光蔚蓝）
    this.solidBackMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0369a1,            // 发光深邃蔚蓝色（非暗沉炭黑）
      roughness: 0.15,
      metalness: 0.10,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.14,              // 柔和的水晶内部折射
      side: THREE.BackSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      emissive: 0x0284c7,
      emissiveIntensity: 0.08,
    });

    // 2. 半透明纯净光学水晶玻璃前向面（蔚蓝水晶色）
    this.solidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,            // 明亮发光蔚蓝水晶色
      roughness: 0.08,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.22,              // 清透光学透光度（内部连线清晰显现）
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.75,
      sheenColor: 0x38bdf8,
      sheenRoughness: 0.10,
      emissive: 0x0369a1,
      emissiveIntensity: 0.16,
    });

    this.solidCutMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,            // 天空青蓝水晶色
      roughness: 0.08,
      metalness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.92,
      transparent: true,
      opacity: 0.44,
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.60,
      sheenColor: 0x7dd3fc,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
    });

    // 3. 高精度 3D 棱清晰结构杆（清晰适度、哑光无刺目反光金属管道感）
    this.strutMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,            // 高精钴钛合金
      metalness: 0.05,            // 消除粗大反光金属管道感
      roughness: 0.85,            // 哑光质感
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.96,
    });

    // 3.1 内部锐利发光核心线
    this.solidEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,            // 电光青蓝核心线
      linewidth: 2.5,
      transparent: true,
      opacity: 0.95,
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
    });

    // 4. 被遮挡消隐棱：课本标准清晰虚线线框（暖琥珀金色）
    this.dashedEdgeMaterial = new THREE.LineDashedMaterial({
      color: 0xf59e0b,            // 暖琥珀金色（在青色和浅色背景下均具备高对比度）
      dashSize: 0.015,
      gapSize: 0.008,
      depthFunc: THREE.LessEqualDepth, // 解析消隐判定已处理后向面，无需 GreaterDepth 技巧
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });

    this.auxEdgeMaterial = new THREE.LineDashedMaterial({
      color: 0xf8fafc,
      dashSize: 0.012,
      gapSize: 0.008,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });

    // 5. 截面：鲜艳发光珊瑚玫瑰磨砂玻璃，配绯红轮廓边缘
    this.crossSectionFillMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,            // 明亮发光珊瑚玫瑰色
      roughness: 0.16,
      metalness: 0.10,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      emissive: 0xe11d48,
      emissiveIntensity: 0.35,
    });

    this.crossSectionLineMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,            // 与截面填充色保持严格一致
      linewidth: 3,
    });

    // 6. 球体：精致单色全息力场
    this.circumSphereMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,            // 半透明皇家紫
      transparent: true,
      opacity: 0.16,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.12,
    });

    this.inSphereMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,            // 半透明翡翠绿
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0x059669,
      emissiveIntensity: 0.15,
    });

    // 7. 辅助面（高性能共享水晶玻璃，零着色器重编译卡顿）
    this.auxFaceFillMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,            // 蔚蓝水晶色
      emissive: 0x0284c7,
      emissiveIntensity: 0.15,
      roughness: 0.18,
      metalness: 0.10,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.auxFaceContourMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,            // 耀眼天青色轮廓光晕
      linewidth: 2,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    });

    // 8. 数据节点（高对比度空间珍珠锚点）
    this.vertexNodeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,            // 青白金珍珠锚点（顶点）
      roughness: 0.08,
      metalness: 0.90,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
    });

    this.originNodeMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,            // 电光金珍珠锚点（坐标系原点）
      roughness: 0.05,
      metalness: 0.95,
      emissive: 0xd97706,
      emissiveIntensity: 0.85,
    });

    this.midpointNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,            // 暖琥珀珍珠锚点（1/2 棱中点）
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });

    this.thirdNodeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,            // 薄荷翠绿珍珠锚点（1/3、2/3 三等分点）
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });

    this.centerNodeMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,            // 紫罗兰珍珠锚点（面心与体心）
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });
  }

  private assembleGroups(): void {
    // 模型容器在空中平稳悬浮 (y = baseHoverY)
    this.modelContainer.position.y = this.baseHoverY;

    this.modelContainer.add(this.solidGroup);
    this.modelContainer.add(this.edgesSolidGroup);
    this.modelContainer.add(this.edgesDashedGroup);
    this.modelContainer.add(this.embeddingBoxGroup);
    this.modelContainer.add(this.keyPointsGroup);
    this.modelContainer.add(this.labelsGroup);
    this.modelContainer.add(this.segmentsGroup);
    this.modelContainer.add(this.crossSectionGroup);
    this.modelContainer.add(this.coordinateGroup);
    this.modelContainer.add(this.spheresGroup);
    this.modelContainer.add(this.unfoldGroup);
    this.modelContainer.add(this.threeViewsGroup);
    this.modelContainer.add(this.snapCursorGroup);
    this.modelContainer.add(this.selectedMarkersGroup);
    this.modelContainer.add(this.previewSegmentGroup);
    this.modelContainer.add(this.segmentAnimGroup);
    this.auxGroup.name = 'auxEdges';
    this.modelContainer.add(this.auxGroup);
    this.auxFacesGroup.name = 'auxFaces';
    this.modelContainer.add(this.auxFacesGroup);

    // 隐形交互碰撞包络体，用于实现轻松自然的直接拖拽旋转
    const hitGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitEnvelopeMesh = new THREE.Mesh(hitGeo, hitMat);
    this.hitEnvelopeMesh.name = 'math_hit_envelope';
    this.modelContainer.add(this.hitEnvelopeMesh);

    this.group.add(this.modelContainer);
    this.group.add(this.stagePresentationGroup);

    this.createSnapCursor();
    this.buildStagePresentation();
  }

  private buildStagePresentation(): void {
    this.clearGroup(this.stagePresentationGroup);

    // 1. 台面柔和径向渐变接触阴影圆盘
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = typeof (shadowCanvas as any).getContext === 'function' ? (shadowCanvas as any).getContext('2d') : null;
    if (sctx) {
      if (typeof sctx.createRadialGradient === 'function') {
        const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(3, 12, 26, 0.45)');
        grad.addColorStop(0.45, 'rgba(2, 10, 24, 0.22)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 128, 128);
      } else {
        sctx.fillStyle = 'rgba(3, 12, 26, 0.3)';
        sctx.fillRect(0, 0, 128, 128);
      }
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.88), shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.001;
    this.stagePresentationGroup.add(shadowMesh);

    // 2. 全息极坐标激光投影光环（电光青蓝准星光圈）
    const ringGeo = new THREE.RingGeometry(0.38, 0.386, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f7ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.stagePresentationGroup.add(ring);

    // 内同心圆环
    const innerRingGeo = new THREE.RingGeometry(0.19, 0.194, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.002;
    this.stagePresentationGroup.add(innerRing);
  }

  private createSnapCursor(): void {
    // 1. 生成面向相机的公告板精灵，打造清晰、无裁切的对焦准星
    // 高分辨率 256x256 单色白画布确保纯净饱满的乘法着色
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      const cx = 128, cy = 128;

      // 柔和径向发光光晕（纯白渐变保证丰富的乘法颜色饱和度）
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 120);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.50)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.22)');
        grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.05)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 120, 0, Math.PI * 2);
        ctx.fill();
      }

      // 外层高精度虚线刻度环
      ctx.beginPath();
      ctx.arc(cx, cy, 96, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([6, 6]);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.stroke();
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([]);
      }

      // 内层实线聚焦瞄准环
      ctx.beginPath();
      ctx.arc(cx, cy, 64, 0, Math.PI * 2);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.stroke();

      // 4 个向内指向的正交对准刻度/括号
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
      const tickAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const ang of tickAngles) {
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx + cos * 84, cy + sin * 84);
        ctx.lineTo(cx + cos * 52, cy + sin * 52);
        ctx.stroke();
      }

      // 中心十字准星微点
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    this.snapCursorSprite = new THREE.Sprite(mat);
    this.snapCursorSprite.scale.set(0.024, 0.024, 1);
    this.snapCursorSprite.renderOrder = 8;
    this.snapCursorGroup.add(this.snapCursorSprite);

    // 2. 磁吸声呐波纹精灵（脉冲全息光波环）
    const rippleCanvas = document.createElement('canvas');
    rippleCanvas.width = 128;
    rippleCanvas.height = 128;
    const rctx = typeof (rippleCanvas as any).getContext === 'function' ? (rippleCanvas as any).getContext('2d') : null;
    if (rctx) {
      const cx = 64, cy = 64;
      if (typeof rctx.createRadialGradient === 'function') {
        const rGrad = rctx.createRadialGradient(cx, cy, 25, cx, cy, 60);
        rGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        rGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.70)');
        rGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.95)');
        rGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        rctx.fillStyle = rGrad;
        rctx.beginPath();
        rctx.arc(cx, cy, 60, 0, Math.PI * 2);
        rctx.fill();
      } else {
        rctx.beginPath();
        rctx.arc(cx, cy, 50, 0, Math.PI * 2);
        rctx.lineWidth = 3;
        rctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        rctx.stroke();
      }
    }
    const rippleTex = new THREE.CanvasTexture(rippleCanvas);
    rippleTex.minFilter = THREE.LinearFilter;
    const rippleMat = new THREE.SpriteMaterial({
      map: rippleTex,
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
    });
    this.snapRippleSprite = new THREE.Sprite(rippleMat);
    this.snapRippleSprite.scale.set(0.04, 0.04, 1);
    this.snapRippleSprite.renderOrder = 8;
    this.snapCursorGroup.add(this.snapRippleSprite);

    // 3. 3D 悬停锚点珍珠珠体（确保未渲染的中点/三等分点同样拥有清晰的触觉 3D 锚点）
    const beadGeo = new THREE.SphereGeometry(0.0075, 16, 16);
    this.snapHoverBeadMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.2,
      roughness: 0.10,
      metalness: 0.85,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.snapHoverBead = new THREE.Mesh(beadGeo, this.snapHoverBeadMat);
    this.snapHoverBead.renderOrder = 8;
    this.snapCursorGroup.add(this.snapHoverBead);

    // 4. 浮动 3D 全息吸附标签徽标（例如：棱 D₁A₁ 中点 (1/2)）
    this.snapBadgeCanvas = document.createElement('canvas');
    this.snapBadgeCanvas.width = 320;
    this.snapBadgeCanvas.height = 72;
    this.snapBadgeTex = new THREE.CanvasTexture(this.snapBadgeCanvas);
    this.snapBadgeTex.minFilter = THREE.LinearFilter;
    const badgeMat = new THREE.SpriteMaterial({
      map: this.snapBadgeTex,
      transparent: true,
      depthTest: false,
    });
    this.snapBadgeSprite = new THREE.Sprite(badgeMat);
    this.snapBadgeSprite.scale.set(0.076, 0.0171, 1);
    this.snapBadgeSprite.position.set(0, 0.038, 0);
    this.snapBadgeSprite.renderOrder = 9;
    this.snapCursorGroup.add(this.snapBadgeSprite);

    // 保留 snapRing 与 snapRingOuter 以向后兼容任何现有属性查找
    const dummyRing = new THREE.Object3D();
    dummyRing.name = 'snapRing';
    this.snapCursorGroup.add(dummyRing);
    const dummyOuter = new THREE.Object3D();
    dummyOuter.name = 'snapRingOuter';
    this.snapCursorGroup.add(dummyOuter);

    this.snapCursorGroup.visible = false;
  }

  // -------------------------------------------------------------
  // 完整重建生命周期
  // -------------------------------------------------------------

  public loadRecognizedModel(def: PolyhedronModelDef): void {
    this.recognizedModel = def;
    this.drawnSegments = [];
    this.currentCrossSection = null;
    this.currentOptions = {
      ...this.currentOptions,
      modelType: 'recognized',
      showDashedLines: true,
      showLabels: true,
      showKeyPoints: true,
      showMidpoints: false,
      showFaceCenters: false,
      showEmbeddingBox: false,
      showCircumSphere: false,
      showInSphere: false,
      showThreeViews: false,
      unfoldProgress: 0,
      clippingEnabled: false,
      explodeDistance: 0,
      crossSectionPlane: undefined,
    };
    this.currentModelDef = def;
    this.currentSphereAnalysis = GeometrySolver.analyzeRecognizedModel(def);
    this.rebuildAll();
  }

  public setOptions(options: Partial<StereometryDisplayOptions>): void {
    const modelChanged = !!(options.modelType && options.modelType !== this.currentOptions.modelType);
    const dimsChanged = options.dimensions !== undefined;
    if (modelChanged && options.modelType !== 'recognized') {
      this.recognizedModel = null;
    }
    const unfoldOnly =
      options.unfoldProgress !== undefined &&
      Object.keys(options).length === 1 &&
      this.unfoldingFaceGroups.length > 0;

    // 表面展开滑块的快速路径（无需重新分配几何体）
    if (unfoldOnly && this.currentOptions.unfoldProgress > 0.01) {
      this.currentOptions.unfoldProgress = options.unfoldProgress!;
      this.updateUnfoldingAngles(options.unfoldProgress!);
      return;
    }

    if (options.dimensions) {
      if (options.dimensions.a !== undefined) this.numericalDimensions.a = Math.max(1, Math.round(options.dimensions.a));
      if (options.dimensions.h !== undefined) this.numericalDimensions.h = Math.max(1, Math.round(options.dimensions.h));
      if (options.dimensions.b !== undefined) this.numericalDimensions.b = Math.max(1, Math.round(options.dimensions.b));
      if (options.dimensions.c !== undefined) this.numericalDimensions.c = Math.max(1, Math.round(options.dimensions.c));
    }

    this.currentOptions = { ...this.currentOptions, ...options };

    const keepFigure = this.recognizedModel !== null && this.currentOptions.modelType === 'recognized';
    if (!keepFigure && modelChanged && this.currentOptions.modelType !== 'recognized') {
      this.currentModelDef = GeometrySolver.createModel(
        this.currentOptions.modelType,
        StereometryMesh.CANONICAL_VISUAL_DIMENSIONS
      );
      this.currentSphereAnalysis = GeometrySolver.computeSphereAnalysis(
        this.currentOptions.modelType,
        this.numericalDimensions
      );
      if (!options.crossSectionPlane) {
        this.currentCrossSection = null;
      }
      this.rebuildAll();
    } else if (dimsChanged && !modelChanged) {
      // 关键：修改尺寸只改变数值不改变显示的大小，显示的大小只由 +- 或触摸屏缩放决定
      this.currentSphereAnalysis = GeometrySolver.computeSphereAnalysis(
        this.currentOptions.modelType,
        this.numericalDimensions
      );
      // 仅同步更新已绘制辅助线的归一化整数长度，不重新生成 3D 几何实体
      if (this.drawnSegments.length > 0) {
        for (const seg of this.drawnSegments) {
          const kpA = this.currentModelDef?.keyPoints.find((k) => k.id === seg.pointIdA);
          const kpB = this.currentModelDef?.keyPoints.find((k) => k.id === seg.pointIdB);
          if (kpA && kpB) {
            seg.length = this.calculateNormalizedSegmentLength(kpA.position, kpB.position);
          }
        }
      }
    } else if (modelChanged && this.currentOptions.modelType === 'recognized') {
      this.rebuildAll();
    }

    const otherVisualOptionsChanged = (
      options.showKeyPoints !== undefined ||
      options.showMidpoints !== undefined ||
      options.showFaceCenters !== undefined ||
      options.showLabels !== undefined ||
      options.showDashedLines !== undefined ||
      options.showCoordinateSystem !== undefined ||
      options.showCircumSphere !== undefined ||
      options.showInSphere !== undefined ||
      options.showEmbeddingBox !== undefined ||
      options.showThreeViews !== undefined ||
      options.clippingEnabled !== undefined ||
      options.explodeDistance !== undefined
    );
    if (otherVisualOptionsChanged && !modelChanged) {
      this.rebuildAll();
    }

    if (options.crossSectionPlane !== undefined) {
      if (options.crossSectionPlane) {
        this.currentCrossSection = GeometrySolver.computePolyhedronCrossSection(
          this.currentModelDef,
          options.crossSectionPlane
        );
      } else {
        this.currentCrossSection = null;
      }
      this.rebuildCrossSection();
    }
  }

  public rebuildAll(): void {
    this.clearGroup(this.solidGroup);
    this.clearGroup(this.edgesSolidGroup);
    this.clearGroup(this.edgesDashedGroup);
    this.clearGroup(this.embeddingBoxGroup);
    this.clearGroup(this.keyPointsGroup);
    this.clearGroup(this.labelsGroup);
    this.clearGroup(this.crossSectionGroup);
    this.clearGroup(this.coordinateGroup);
    this.clearGroup(this.spheresGroup);
    this.clearGroup(this.unfoldGroup);
    this.clearGroup(this.threeViewsGroup);
    this.clearGroup(this.auxGroup);
    this.clearGroup(this.auxFacesGroup);
    this.auxiliaryFaces = [];
    this.keyPointMeshes.clear();
    this.unfoldingFaceGroups = [];
    this.solidEdgesMesh = null;
    this.dashedEdgesMesh = null;
    this.solidStrutsMesh = null;

    if (this.currentOptions.unfoldProgress > 0.01) {
      this.solidGroup.visible = false;
      this.edgesSolidGroup.visible = false;
      this.edgesDashedGroup.visible = false;
      this.rebuildUnfoldingNet();
    } else {
      this.solidGroup.visible = true;
      this.edgesSolidGroup.visible = true;
      this.edgesDashedGroup.visible = this.currentOptions.showDashedLines;
      this.rebuildSolidMesh();
      this.rebuildEdges();
    }

    this.rebuildEmbeddingBox();
    this.rebuildKeyPoints();
    this.rebuildAuxEdges();
    this.rebuildLabels();
    this.rebuildSegments();
    this.rebuildCrossSection();
    this.rebuildCoordinateSystem();
    this.rebuildSpheres();
    this.rebuildThreeViews();
    this.updateHitEnvelope();

    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;
  }

  private updateHitEnvelope(): void {
    if (this.hitEnvelopeMesh && this.currentModelDef) {
      const r = Math.max(0.75, (this.currentModelDef.boundingRadius || 0.8) * 1.35);
      this.hitEnvelopeMesh.scale.set(r, r, r);
    }
  }

  // -------------------------------------------------------------
  // 1. 带深度预通道的水晶玻璃实体网格
  // -------------------------------------------------------------
  private rebuildSolidMesh(): void {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];

    if (this.currentOptions.clippingEnabled && this.currentCrossSection) {
      this.depthMaskMaterial.clippingPlanes = [this.currentCrossSection.plane];
      this.solidCutMaterial.clippingPlanes = [this.currentCrossSection.plane];
      this.solidCutMaterial.clipShadows = true;
    } else {
      this.depthMaskMaterial.clippingPlanes = [];
      this.solidCutMaterial.clippingPlanes = [];
    }

    for (const face of this.currentModelDef.faces) {
      const vIndices = face.vertexIndices;
      const v0 = this.currentModelDef.vertices[vIndices[0]];

      for (let i = 1; i < vIndices.length - 1; i++) {
        const v1 = this.currentModelDef.vertices[vIndices[i]];
        const v2 = this.currentModelDef.vertices[vIndices[i + 1]];

        positions.push(v0.x, v0.y, v0.z);
        positions.push(v1.x, v1.y, v1.z);
        positions.push(v2.x, v2.y, v2.z);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    // 通道 1：深层内部后向面，提供光学折射与水晶体积深度
    const backMesh = new THREE.Mesh(
      geo,
      this.currentOptions.clippingEnabled ? this.solidCutMaterial : this.solidBackMaterial
    );
    backMesh.name = 'solidBackMesh';
    backMesh.renderOrder = 2;
    this.solidGroup.add(backMesh);

    // 通道 2：纯净半透明水晶玻璃前向面
    const frontMesh = new THREE.Mesh(
      geo,
      this.currentOptions.clippingEnabled ? this.solidCutMaterial : this.solidFrontMaterial
    );
    frontMesh.name = 'solidMesh';
    frontMesh.renderOrder = 4;
    this.solidGroup.add(frontMesh);
  }

  // -------------------------------------------------------------
  // 2. 解析消隐棱渲染（纯实线棱 + 课本标准虚线）
  // -------------------------------------------------------------
  private rebuildEdges(): void {
    const edgeCount = this.currentModelDef.edges.length;
    this.edgeAdjacencies = [];

    // 预计算棱与面的相邻关系，实现相机视角的瞬时消隐判定
    for (let i = 0; i < edgeCount; i++) {
      const [i1, i2] = this.currentModelDef.edges[i];
      const faceIndices: number[] = [];
      this.currentModelDef.faces.forEach((f, fIdx) => {
        const idxs = f.vertexIndices;
        if (idxs.includes(i1) && idxs.includes(i2)) {
          faceIndices.push(fIdx);
        }
      });
      this.edgeAdjacencies.push({ edgeIndex: i, i1, i2, faceIndices });
    }

    if (edgeCount === 0) return;

    // 1. 动态实线棱（轮廓线与可见前向棱的核心亮线）
    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3)
    );
    this.solidEdgesMesh = new THREE.LineSegments(solidGeo, this.solidEdgeMaterial);
    this.solidEdgesMesh.name = 'solidEdges';
    this.solidEdgesMesh.renderOrder = 5;
    this.edgesSolidGroup.add(this.solidEdgesMesh);

    // 2. 高精度 3D 精微结构杆（仅用于可见棱，绝不用于被遮挡棱）
    this.solidStrutsMesh = new THREE.InstancedMesh(this.unitCylinderGeo, this.strutMaterial, edgeCount);
    this.solidStrutsMesh.name = 'solidStruts';
    this.solidStrutsMesh.renderOrder = 4;
    this.edgesSolidGroup.add(this.solidStrutsMesh);

    // 3. 被遮挡消隐虚线（用于内部背面棱的标准课本虚线）
    const dashedGeo = new THREE.BufferGeometry();
    dashedGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3)
    );
    this.dashedEdgesMesh = new THREE.LineSegments(dashedGeo, this.dashedEdgeMaterial);
    this.dashedEdgesMesh.name = 'dashedEdges';
    this.dashedEdgesMesh.renderOrder = 3;
    this.edgesDashedGroup.add(this.dashedEdgesMesh);

    // 初始分类判定
    this.updateEdgeVisibility(undefined, true);
  }

  /**
   * 从摄像机视角对可见棱与被遮挡棱进行精确解析分类：
   * 在任意凸多面体中，当且仅当某条棱至少有一个相邻面朝向摄像机时，该棱可见；
   * 若所有相邻面皆背向摄像机，则该棱必定被遮挡（背面消隐虚线）。
   */
  public updateEdgeVisibility(camera?: THREE.Camera, force = false): void {
    if (!this.currentModelDef || this.edgeAdjacencies.length === 0) return;
    if (!this.solidEdgesMesh || !this.dashedEdgesMesh || !this.solidStrutsMesh) return;

    // 1. 确定模型局部空间中的摄像机位置
    const camLocal = this.edgeScratchCamLocal;
    if (camera) {
      camera.getWorldPosition(camLocal);
    } else {
      // 默认经典教材直观图视角：右前上方
      camLocal.set(0.6, 1.35, 1.6);
    }
    this.modelContainer.worldToLocal(camLocal);

    if (!force && camLocal.distanceToSquared(this.lastCamLocal) < 1e-6) {
      return;
    }
    this.lastCamLocal.copy(camLocal);

    // 2. 判定各多边形面朝向摄像机的前后背向状态
    const faces = this.currentModelDef.faces;
    const isFaceFront: boolean[] = new Array(faces.length);
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      const v0 = this.currentModelDef.vertices[face.vertexIndices[0]];
      const viewX = camLocal.x - v0.x;
      const viewY = camLocal.y - v0.y;
      const viewZ = camLocal.z - v0.z;
      const dot = viewX * face.normal.x + viewY * face.normal.y + viewZ * face.normal.z;
      isFaceFront[f] = dot > 0.001;
    }

    // 3. 将棱分类为可见实线与被遮挡虚线
    const solidPos = this.solidEdgesMesh.geometry.attributes.position.array as Float32Array;
    const dashedPos = this.dashedEdgesMesh.geometry.attributes.position.array as Float32Array;
    let solidCount = 0;
    let dashedCount = 0;

    const up = this.edgeScratchUp;
    const dir = this.edgeScratchDir;
    const mid = this.edgeScratchMid;
    const quat = this.edgeScratchQuat;
    const scale = this.edgeScratchScale;
    const mat = this.edgeScratchMat;

    for (const adj of this.edgeAdjacencies) {
      const p1 = this.currentModelDef.vertices[adj.i1];
      const p2 = this.currentModelDef.vertices[adj.i2];

      let isVisible = false;
      if (adj.faceIndices.length === 0) {
        isVisible = true;
      } else {
        for (const fIdx of adj.faceIndices) {
          if (isFaceFront[fIdx]) {
            isVisible = true;
            break;
          }
        }
      }

      // 当 showDashedLines 为 false（默认）时，所有棱（含被遮挡棱）均作为实线渲染
      const renderAsSolid = isVisible || !this.currentOptions.showDashedLines;

      if (renderAsSolid) {
        // 可见实棱或全局实线：实线段 + 微型棱柱
        const off = solidCount * 6;
        solidPos[off] = p1.x;
        solidPos[off + 1] = p1.y;
        solidPos[off + 2] = p1.z;
        solidPos[off + 3] = p2.x;
        solidPos[off + 4] = p2.y;
        solidPos[off + 5] = p2.z;

        dir.subVectors(p2, p1);
        const len = dir.length();
        mid.addVectors(p1, p2).multiplyScalar(0.5);
        if (len > 1e-4) {
          quat.setFromUnitVectors(up, dir.normalize());
        } else {
          quat.identity();
        }
        scale.set(1, len, 1);
        mat.compose(mid, quat, scale);
        this.solidStrutsMesh.setMatrixAt(solidCount, mat);
        solidCount++;
      } else {
        // 被遮挡棱：教材消隐虚线（仅在显式启用 showDashedLines 时激活）
        const off = dashedCount * 6;
        dashedPos[off] = p1.x;
        dashedPos[off + 1] = p1.y;
        dashedPos[off + 2] = p1.z;
        dashedPos[off + 3] = p2.x;
        dashedPos[off + 4] = p2.y;
        dashedPos[off + 5] = p2.z;
        dashedCount++;
      }
    }

    // 4. 更新实线与棱柱几何体缓冲区
    this.solidEdgesMesh.geometry.setDrawRange(0, solidCount * 2);
    this.solidEdgesMesh.geometry.attributes.position.needsUpdate = true;
    this.solidStrutsMesh.count = solidCount;
    this.solidStrutsMesh.instanceMatrix.needsUpdate = true;

    // 5. 更新虚线几何体缓冲区
    this.dashedEdgesMesh.geometry.setDrawRange(0, dashedCount * 2);
    this.dashedEdgesMesh.geometry.attributes.position.needsUpdate = true;
    if (dashedCount > 0) {
      this.dashedEdgesMesh.computeLineDistances();
    }
  }

  // -------------------------------------------------------------
  // 3. 高考补形透视 (长方体/正方体封套骨架)
  // -------------------------------------------------------------
  private rebuildEmbeddingBox(): void {
    if (!this.currentOptions.showEmbeddingBox) return;

    const size = this.currentSphereAnalysis.embeddingCuboidSize;
    if (!size) return;

    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const wireframeGeo = new THREE.WireframeGeometry(boxGeo);
    const boxMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.02,
      gapSize: 0.015,
      transparent: true,
      opacity: 0.55,
    });

    const boxLines = new THREE.LineSegments(wireframeGeo, boxMat);
    boxLines.computeLineDistances();

    if (this.currentModelDef.id === 'corner-pyramid') {
      boxLines.position.set(size.x / 4, size.y / 4, size.z / 4);
    }

    this.embeddingBoxGroup.add(boxLines);
  }

  // -------------------------------------------------------------
  // 4. 关键点与磁吸标记锚点
  // -------------------------------------------------------------
  private rebuildKeyPoints(): void {
    if (!this.currentOptions.showKeyPoints) return;

    const originId = this.currentOptions.originKeyPointId ?? 'v_0';

    for (const kp of this.currentModelDef.keyPoints) {
      // 默认仅显示几何体顶点，除非显式请求，否则不展示中点、三等分点或面中心
      if ((kp.type === 'midpoint' || kp.type === 'third') && !this.currentOptions.showMidpoints) {
        continue;
      }
      if (kp.type === 'center' && !this.currentOptions.showFaceCenters) {
        continue;
      }

      let geo = this.sharedVertexGeo;
      let mat = this.vertexNodeMat;

      if (kp.id === originId) {
        geo = this.sharedVertexGeo;
        mat = this.originNodeMat;
      } else if (kp.type === 'midpoint') {
        geo = this.sharedMidpointGeo;
        mat = this.midpointNodeMat;
      } else if (kp.type === 'third') {
        geo = this.sharedThirdGeo;
        mat = this.thirdNodeMat;
      } else if (kp.type === 'center') {
        geo = this.sharedCenterGeo;
        mat = this.centerNodeMat;
      } else if (kp.type === 'custom') {
        geo = this.sharedMidpointGeo;
        mat = this.midpointNodeMat;
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(kp.position);
      mesh.userData = { keyPoint: kp };
      mesh.name = `kp_${kp.id}`;
      mesh.renderOrder = 6;

      this.keyPointsGroup.add(mesh);
      this.keyPointMeshes.set(kp.id, mesh);
    }
  }

  // -------------------------------------------------------------
  // 5. 3D 顶点数学标号公告板
  // -------------------------------------------------------------
  private rebuildLabels(): void {
    if (!this.currentOptions.showLabels) return;

    for (const kp of this.currentModelDef.keyPoints) {
      if (kp.type !== 'vertex' && kp.type !== 'custom') continue;

      const sprite = this.createLabelSprite(kp.label);
      // 沿中心向外微移，避免标号遮挡顶点珠
      const dir = kp.position.clone();
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 1, 0);
      } else {
        dir.normalize();
      }

      sprite.position.copy(kp.position).addScaledVector(dir, 0.042);
      this.labelsGroup.add(sprite);
    }
  }

  private createLabelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);

      // 高分辨率教材字体：大号、粗体与高对比度
      ctx.font = 'bold 136px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Times New Roman", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 柔和空间环境投影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 10;

      // 深色描边边缘，确保在明暗背景下均清晰可读
      ctx.lineWidth = 11.0;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10, 16, 32, 0.95)';
      if (typeof ctx.strokeText === 'function') {
        ctx.strokeText(text, 128, 128);
      }

      // 纯白字形填充
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 128, 128);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    // 缩放尺寸：保证默认摄像机视角下清晰易读
    sprite.scale.set(0.082, 0.082, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private rebuildAuxEdges(): void {
    const aux = this.currentModelDef.auxEdges;
    if (!aux || aux.length === 0) return;
    for (const edge of aux) {
      const kpA = this.currentModelDef.keyPoints.find((kp) => kp.id === edge.a);
      const kpB = this.currentModelDef.keyPoints.find((kp) => kp.id === edge.b);
      if (!kpA || !kpB) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([kpA.position, kpB.position]);
      const line = new THREE.Line(geo, this.auxEdgeMaterial);
      line.computeLineDistances();
      line.name = `aux_${edge.a}_${edge.b}`;
      line.renderOrder = 6;
      this.auxGroup.add(line);
    }
  }

  /**
   * 将 3D 几何顶点坐标间距计算并归一化为高中立体几何尺寸（精确到整数）。
   */
  public calculateNormalizedSegmentLength(posA: THREE.Vector3, posB: THREE.Vector3): number {
    const base = this.getBaseUnit();
    const unitA = this.numericalDimensions?.a ?? 1;
    const unitH = this.numericalDimensions?.h ?? unitA;

    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dz = posB.z - posA.z;
    const dxz = Math.hypot(dx, dz);

    const normXZ = (dxz / (base > 1e-6 ? base : 1)) * unitA;
    const normY = (Math.abs(dy) / (base > 1e-6 ? base : 1)) * unitH;
    const dist = Math.hypot(normXZ, normY);
    return Math.max(1, Math.round(dist));
  }

  // -------------------------------------------------------------
  // 6. 空间连线绘制（附带生成动画）
  // -------------------------------------------------------------
  public addSegment(pointIdA: string, pointIdB: string, color = 0x38d9a9): DrawnSegment | null {
    const kpA = this.currentModelDef.keyPoints.find((k) => k.id === pointIdA);
    const kpB = this.currentModelDef.keyPoints.find((k) => k.id === pointIdB);
    if (!kpA || !kpB || pointIdA === pointIdB) return null;

    const existing = this.drawnSegments.find(
      (s) => (s.pointIdA === pointIdA && s.pointIdB === pointIdB) || (s.pointIdA === pointIdB && s.pointIdB === pointIdA)
    );
    if (existing) return existing;

    const length = this.calculateNormalizedSegmentLength(kpA.position, kpB.position);
    const seg: DrawnSegment = {
      id: `seg_${pointIdA}_${pointIdB}`,
      pointIdA,
      pointIdB,
      label: `${kpA.label}${kpB.label}`,
      color,
      length,
    };
    this.drawnSegments.push(seg);

    // 启动发光光束伸展动画
    this.startSegmentBirthAnimation(seg, kpA.position, kpB.position);

    // 构建永久空间线段
    this.rebuildSegments();
    return seg;
  }

  private startSegmentBirthAnimation(seg: DrawnSegment, posA: THREE.Vector3, posB: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(posB, posA);
    const len = dir.length();
    if (len < 1e-4) return;

    // 醒目平光线芯（无光照阴影，消除立体圆柱高光，粗细清晰适中）
    const pipeGeo = new THREE.CylinderGeometry(0.0020, 0.0020, 1.0, 10);
    const pipeMat = new THREE.MeshBasicMaterial({
      color: seg.color,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: false,
    });
    const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
    pipeMesh.position.copy(posA);
    pipeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    pipeMesh.scale.set(1, 0.001, 1);
    pipeMesh.renderOrder = 6;
    this.segmentAnimGroup.add(pipeMesh);

    // 从 posA 运动至 posB 的发光端点指示器
    const tipGeo = new THREE.SphereGeometry(0.0050, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const glowTipMesh = new THREE.Mesh(tipGeo, tipMat);
    glowTipMesh.position.copy(posA);
    glowTipMesh.renderOrder = 7;
    this.segmentAnimGroup.add(glowTipMesh);

    this.activeSegmentAnimations.push({
      id: seg.id,
      pipeMesh,
      glowTipMesh,
      posA: posA.clone(),
      posB: posB.clone(),
      finalLength: len,
      dir: dir.clone().normalize(),
      color: seg.color,
      progress: 0,
      duration: 0.22,
    });
  }

  public undoLastSegment(): DrawnSegment | null {
    if (this.drawnSegments.length === 0) return null;
    const removed = this.drawnSegments.pop()!;
    // 清理当前线段对应的活跃动画
    const animIdx = this.activeSegmentAnimations.findIndex((a) => a.id === removed.id);
    if (animIdx !== -1) {
      const anim = this.activeSegmentAnimations[animIdx];
      this.segmentAnimGroup.remove(anim.pipeMesh);
      this.segmentAnimGroup.remove(anim.glowTipMesh);
      anim.pipeMesh.geometry.dispose();
      (anim.pipeMesh.material as THREE.Material).dispose();
      anim.glowTipMesh.geometry.dispose();
      (anim.glowTipMesh.material as THREE.Material).dispose();
      this.activeSegmentAnimations.splice(animIdx, 1);
    }
    this.rebuildSegments();
    return removed;
  }

  public removeSegment(id: string): void {
    this.drawnSegments = this.drawnSegments.filter((s) => s.id !== id);
    this.rebuildSegments();
  }

  public clearAllSegments(): void {
    this.drawnSegments = [];
    this.clearGroup(this.segmentAnimGroup);
    this.activeSegmentAnimations = [];
    this.auxiliaryFaces = [];
    this.clearGroup(this.auxFacesGroup);
    this.rebuildSegments();
  }

  public getSegments(): DrawnSegment[] {
    return [...this.drawnSegments];
  }

  public getAuxiliaryFaces(): AuxiliaryFace[] {
    return [...this.auxiliaryFaces];
  }

  public getAuxFacesGroup(): THREE.Group {
    return this.auxFacesGroup;
  }

  private rebuildSegments(): void {
    this.clearGroup(this.segmentsGroup);

    for (const seg of this.drawnSegments) {
      const kpA = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdA);
      const kpB = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdB);
      if (!kpA || !kpB) continue;

      const dir = new THREE.Vector3().subVectors(kpB.position, kpA.position);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(kpA.position, kpB.position).multiplyScalar(0.5);

      // 1. 原生 3D 几何线段
      const lineGeo = new THREE.BufferGeometry().setFromPoints([kpA.position, kpB.position]);
      const lineMat = new THREE.LineBasicMaterial({
        color: seg.color,
        linewidth: 2.5,
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthWrite: false,
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      lineMesh.name = `perm_seg_line_${seg.id}`;
      lineMesh.renderOrder = 7;
      this.segmentsGroup.add(lineMesh);

      // 2. 醒目平光微型线芯（清晰粗细 4mm，纯平无光照阴影，消除立体圆柱高光与侧边阴影，绝不呈现金属管道效果）
      const coreGeo = new THREE.CylinderGeometry(0.0020, 0.0020, len, 10);
      const coreMat = new THREE.MeshBasicMaterial({
        color: seg.color,
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthWrite: false,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.name = `perm_seg_${seg.id}`;
      core.position.copy(mid);
      core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      core.renderOrder = 6;
      this.segmentsGroup.add(core);
    }

    this.rebuildAuxiliaryFaces();
  }

  private rebuildAuxiliaryFaces(): void {
    this.clearGroup(this.auxFacesGroup);
    this.auxiliaryFaces = AuxiliaryFaceSolver.findAuxiliaryFaces(
      this.drawnSegments,
      this.currentModelDef.keyPoints
    );

    if (this.auxiliaryFaces.length === 0) return;

    for (const face of this.auxiliaryFaces) {
      const verts = face.vertices3D;
      if (!verts || verts.length < 3) continue;

      const faceColor = typeof face.color === 'number' ? face.color : 0x38d9a9;

      // 1. 半透明辅助面多边形（切面颜色与线严格一致）
      const fillPositions: number[] = [];
      const centroid = face.centroid;
      for (let i = 0; i < verts.length; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % verts.length];
        fillPositions.push(centroid.x, centroid.y, centroid.z);
        fillPositions.push(p1.x, p1.y, p1.z);
        fillPositions.push(p2.x, p2.y, p2.z);
      }

      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
      fillGeo.computeVertexNormals();

      const faceMat = new THREE.MeshStandardMaterial({
        color: faceColor,
        emissive: faceColor,
        emissiveIntensity: 0.22,
        roughness: 0.20,
        metalness: 0.05,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const faceMesh = new THREE.Mesh(fillGeo, faceMat);
      faceMesh.name = `aux_face_${face.id}`;
      faceMesh.renderOrder = 4;
      this.auxFacesGroup.add(faceMesh);

      // 2. 发光轮廓闭合线框（与线颜色严格一致）
      const contourPositions: number[] = [];
      for (const v of verts) {
        contourPositions.push(v.x, v.y, v.z);
      }
      const contourGeo = new THREE.BufferGeometry();
      contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(contourPositions, 3));
      const contourMat = new THREE.LineBasicMaterial({
        color: faceColor,
        linewidth: 2,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const contourLoop = new THREE.LineLoop(contourGeo, contourMat);
      contourLoop.name = `aux_face_contour_${face.id}`;
      contourLoop.renderOrder = 6;
      this.auxFacesGroup.add(contourLoop);

      // 3. 保持面部纯净：面上不附加气泡标记，保持清晰视线
    }
  }

  // -------------------------------------------------------------
  // 7. 截面剖切多边形与爆破分离
  // -------------------------------------------------------------
  private rebuildCrossSection(): void {
    if (!this.currentCrossSection || this.currentCrossSection.polygon.length < 3) return;

    const poly = this.currentCrossSection.polygon;
    const normal = this.currentCrossSection.normal.clone().normalize();
    const explodeOffset = normal.clone().multiplyScalar(this.currentOptions.explodeDistance);

    // 发光截面边界闭合线
    const lineVerts: number[] = [];
    for (let i = 0; i <= poly.length; i++) {
      const pt = poly[i % poly.length].clone().add(explodeOffset);
      lineVerts.push(pt.x, pt.y, pt.z);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    const line = new THREE.Line(lineGeo, this.crossSectionLineMat);
    line.renderOrder = 6;
    this.crossSectionGroup.add(line);

    // 半透明截面填充多边形
    const centroid = new THREE.Vector3();
    poly.forEach((p) => centroid.add(p));
    centroid.multiplyScalar(1 / poly.length).add(explodeOffset);

    const fillPositions: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i].clone().add(explodeOffset);
      const p2 = poly[(i + 1) % poly.length].clone().add(explodeOffset);

      fillPositions.push(centroid.x, centroid.y, centroid.z);
      fillPositions.push(p1.x, p1.y, p1.z);
      fillPositions.push(p2.x, p2.y, p2.z);
    }

    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
    fillGeo.computeVertexNormals();
    const fillMesh = new THREE.Mesh(fillGeo, this.crossSectionFillMat);
    fillMesh.name = 'crossSectionFill';
    fillMesh.renderOrder = 5;
    this.crossSectionGroup.add(fillMesh);
  }

  // -------------------------------------------------------------
  // 8. 空间直角坐标系（向量三轴构架）
  // -------------------------------------------------------------
  private rebuildCoordinateSystem(): void {
    if (!this.currentOptions.showCoordinateSystem) return;

    const originId = this.currentOptions.originKeyPointId ?? 'v_0';
    const originKp = this.currentModelDef.keyPoints.find((k) => k.id === originId);
    const originPos = originKp ? originKp.position : new THREE.Vector3(0, 0, 0);

    const axisLength = 0.35;
    const shaftRadius = 0.002;
    const coneRadius = 0.0055;
    const coneHeight = 0.024;

    const createAxis = (dir: THREE.Vector3, color: number, label: string) => {
      const axisGroup = new THREE.Group();

      // 轴身
      const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, axisLength - coneHeight, 12);
      const shaftMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.8,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.y = (axisLength - coneHeight) / 2;

      // 锥体箭头
      const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
      const cone = new THREE.Mesh(coneGeo, shaftMat);
      cone.position.y = axisLength - coneHeight / 2;

      axisGroup.add(shaft, cone);
      axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      axisGroup.position.copy(originPos);

      // 轴标签精灵
      const sprite = this.createAxisBadgeSprite(label, color);
      sprite.position.copy(originPos).addScaledVector(dir, axisLength + 0.022);
      this.coordinateGroup.add(axisGroup, sprite);
    };

    // +X 轴：红，+Y 轴：绿，+Z 轴：青
    createAxis(new THREE.Vector3(1, 0, 0), 0xff1744, 'x');
    createAxis(new THREE.Vector3(0, 1, 0), 0x00e676, 'y');
    createAxis(new THREE.Vector3(0, 0, 1), 0x00e5ff, 'z');
  }

  private createAxisBadgeSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      ctx.clearRect(0, 0, 96, 96);
      const hex = '#' + color.toString(16).padStart(6, '0');
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(48, 48, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 44px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 48, 50);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.028, 0.028, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // -------------------------------------------------------------
  // 9. 外接球与内切球
  // -------------------------------------------------------------
  private rebuildSpheres(): void {
    const analysis = this.currentSphereAnalysis;

    if (this.currentOptions.showCircumSphere && analysis.hasCircumSphere) {
      const circumGeo = new THREE.SphereGeometry(analysis.circumRadius, 32, 24);
      const circumMesh = new THREE.Mesh(circumGeo, this.circumSphereMat);
      circumMesh.position.copy(analysis.circumCenter);

      const ringGeo = new THREE.RingGeometry(analysis.circumRadius * 0.995, analysis.circumRadius * 1.005, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, opacity: 0.25, transparent: true });
      const equator = new THREE.Mesh(ringGeo, ringMat);
      equator.rotation.x = Math.PI / 2;
      circumMesh.add(equator);

      this.spheresGroup.add(circumMesh);
    }

    if (this.currentOptions.showInSphere && analysis.hasInSphere) {
      const inGeo = new THREE.SphereGeometry(analysis.inRadius, 28, 20);
      const inMesh = new THREE.Mesh(inGeo, this.inSphereMat);
      inMesh.position.copy(analysis.inCenter);

      this.spheresGroup.add(inMesh);
    }
  }

  // -------------------------------------------------------------
  // 10. 表面展开图与折叠动画
  // -------------------------------------------------------------
  private rebuildUnfoldingNet(): void {
    const unfoldMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.85 });

    const verts = this.currentModelDef.vertices;
    this.currentModelDef.faces.forEach((face) => {
      const faceGroup = new THREE.Group();
      faceGroup.userData = { face };

      const positions: number[] = [];
      const v0 = verts[face.vertexIndices[0]];
      for (let i = 1; i < face.vertexIndices.length - 1; i++) {
        const v1 = verts[face.vertexIndices[i]];
        const v2 = verts[face.vertexIndices[i + 1]];
        positions.push(v0.x, v0.y, v0.z);
        positions.push(v1.x, v1.y, v1.z);
        positions.push(v2.x, v2.y, v2.z);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, unfoldMat);
      faceGroup.add(mesh);

      const edgeVerts: number[] = [];
      for (let i = 0; i < face.vertexIndices.length; i++) {
        const p1 = verts[face.vertexIndices[i]];
        const p2 = verts[face.vertexIndices[(i + 1) % face.vertexIndices.length]];
        edgeVerts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
      const line = new THREE.LineSegments(edgeGeo, wireMat);
      faceGroup.add(line);

      this.unfoldGroup.add(faceGroup);
      this.unfoldingFaceGroups.push(faceGroup);
    });

    this.updateUnfoldingAngles(this.currentOptions.unfoldProgress);
  }

  private updateUnfoldingAngles(progress: number): void {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const angle = t * (Math.PI / 2);

    for (const fg of this.unfoldingFaceGroups) {
      const face: any = fg.userData.face;
      if (!face || face.id === 'bottom' || face.id === 'base') continue;

      if (Math.abs(face.normal.x) > 0.5) {
        fg.rotation.z = Math.sign(face.normal.x) * -angle;
      } else if (Math.abs(face.normal.z) > 0.5) {
        fg.rotation.x = Math.sign(face.normal.z) * angle;
      }
    }
  }

  // -------------------------------------------------------------
  // 11. 三视图正交投影幕布
  // -------------------------------------------------------------
  private rebuildThreeViews(): void {
    if (!this.currentOptions.showThreeViews) return;

    const r = this.currentModelDef.boundingRadius * 1.4;
    const planeGeo = new THREE.PlaneGeometry(r * 2, r * 2);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
    });
    const gridHelperMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
    });

    const frontScreen = new THREE.Mesh(planeGeo, screenMat);
    frontScreen.position.set(0, 0, -r);
    this.threeViewsGroup.add(frontScreen);

    const sideScreen = new THREE.Mesh(planeGeo, screenMat);
    sideScreen.rotation.y = Math.PI / 2;
    sideScreen.position.set(-r, 0, 0);
    this.threeViewsGroup.add(sideScreen);

    const topScreen = new THREE.Mesh(planeGeo, screenMat);
    topScreen.rotation.x = -Math.PI / 2;
    topScreen.position.set(0, -r, 0);
    this.threeViewsGroup.add(topScreen);

    const frontVerts: number[] = [];
    const sideVerts: number[] = [];
    const topVerts: number[] = [];

    for (const [i1, i2] of this.currentModelDef.edges) {
      const p1 = this.currentModelDef.vertices[i1];
      const p2 = this.currentModelDef.vertices[i2];

      frontVerts.push(p1.x, p1.y, -r + 0.002, p2.x, p2.y, -r + 0.002);
      sideVerts.push(-r + 0.002, p1.y, p1.z, -r + 0.002, p2.y, p2.z);
      topVerts.push(p1.x, -r + 0.002, p1.z, p2.x, -r + 0.002, p2.z);
    }

    const frontGeo = new THREE.BufferGeometry();
    frontGeo.setAttribute('position', new THREE.Float32BufferAttribute(frontVerts, 3));
    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sideVerts, 3));
    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topVerts, 3));

    this.threeViewsGroup.add(new THREE.LineSegments(frontGeo, gridHelperMat));
    this.threeViewsGroup.add(new THREE.LineSegments(sideGeo, gridHelperMat));
    this.threeViewsGroup.add(new THREE.LineSegments(topGeo, gridHelperMat));
  }

  // -------------------------------------------------------------
  // 磁吸捕捉与光线投射十字准星（面向摄像机）
  // -------------------------------------------------------------
  public setHoveredKeyPoint(id: string | null, snapLabel?: string): void {
    if (this.hoveredKeyPointId === id) return;

    // 重置上一悬停关键点的网格缩放
    if (this.lastHoveredMeshId && !this.lastSelectedIds.includes(this.lastHoveredMeshId)) {
      const prevMesh = this.keyPointMeshes.get(this.lastHoveredMeshId);
      if (prevMesh) {
        prevMesh.scale.set(1.0, 1.0, 1.0);
      }
    }
    this.lastHoveredMeshId = id;
    this.hoveredKeyPointId = id;

    if (id) {
      const kp = this.currentModelDef.keyPoints.find((k) => k.id === id);
      if (kp) {
        this.snapCursorGroup.position.copy(kp.position);
        this.snapCursorGroup.visible = true;
        this.snapEnterTime = 0;

        // 触觉缩放反馈：平滑放大当前节点
        const currMesh = this.keyPointMeshes.get(id);
        if (currMesh && !this.lastSelectedIds.includes(id)) {
          currMesh.scale.set(1.55, 1.55, 1.55);
          if (this.snapHoverBead) this.snapHoverBead.visible = false;
        } else {
          // 若未渲染静态网格（默认不显示的中点/三等分点），则显示发光 3D 悬停珠
          if (this.snapHoverBead) this.snapHoverBead.visible = true;
        }

        let hex = 0x00f0ff; // 顶点：亮青色
        if (kp.type === 'midpoint') {
          hex = 0xfbbf24; // 1/2 中点：琥珀金
        } else if (kp.type === 'third') {
          hex = 0x10b981; // 1/3 三等分点：翡翠绿
        } else if (kp.type === 'center') {
          hex = 0xc084fc; // 面中心：紫罗兰色
        }

        if (this.snapCursorSprite) {
          (this.snapCursorSprite.material as THREE.SpriteMaterial).color.setHex(hex);
          this.snapCursorSprite.scale.set(0.065, 0.065, 1);
        }
        if (this.snapRippleSprite) {
          this.snapRippleSprite.visible = false;
        }
        if (this.snapHoverBeadMat) {
          this.snapHoverBeadMat.color.setHex(hex);
          this.snapHoverBeadMat.emissive.setHex(hex);
        }

        // 更新磁吸捕捉标签状态
        const badgeText = this.formatKeyPointSnapLabel(kp, snapLabel);
        this.updateSnapBadge(badgeText, hex);
        if (this.snapBadgeSprite) {
          this.snapBadgeSprite.visible = false;
        }
        return;
      }
    }

    this.snapCursorGroup.visible = false;
    if (this.snapCursorSprite) {
      this.snapCursorSprite.scale.set(0.024, 0.024, 1);
    }
    if (this.snapRippleSprite) {
      this.snapRippleSprite.visible = false;
    }
    if (this.snapHoverBead) {
      this.snapHoverBead.visible = false;
    }
    if (this.snapBadgeSprite) {
      this.snapBadgeSprite.visible = false;
    }
  }

  private formatKeyPointSnapLabel(kp: KeyPoint, customLabel?: string): string {
    if (customLabel && customLabel.trim().length > 0) {
      return customLabel.replace(/^(✦\s*|磁吸捕捉[:：]\s*)/, '');
    }
    if (kp.subLabel) {
      const edge = kp.edgeVertices ? `${kp.edgeVertices[0]}${kp.edgeVertices[1]}` : '';
      if (kp.subLabel === '1/2') {
        return edge ? `棱 ${edge} 中点 (1/2)` : `${kp.label} 中点 (1/2)`;
      } else if (kp.subLabel === '1/3') {
        return edge ? `棱 ${edge} 三等分点 (1/3)` : `${kp.label} (1/3)`;
      } else if (kp.subLabel === '2/3') {
        return edge ? `棱 ${edge} 三等分点 (2/3)` : `${kp.label} (2/3)`;
      }
    }
    if (kp.type === 'vertex') {
      return `顶点 ${kp.label}`;
    }
    if (kp.type === 'center') {
      return `${kp.label} 中心`;
    }
    return kp.label;
  }

  private updateSnapBadge(labelToDisplay: string, colorHex: number): void {
    if (!this.snapBadgeCanvas || !this.snapBadgeTex) return;
    if (this.lastSnapBadgeKey === `${labelToDisplay}_${colorHex}`) return;
    this.lastSnapBadgeKey = `${labelToDisplay}_${colorHex}`;

    const bctx = this.snapBadgeCanvas.getContext('2d');
    if (!bctx) return;

    bctx.clearRect(0, 0, 320, 72);

    const r = (colorHex >> 16) & 255;
    const g = (colorHex >> 8) & 255;
    const b = colorHex & 255;
    const strokeColor = `rgba(${r}, ${g}, ${b}, 0.95)`;
    const glowColor = `rgba(${r}, ${g}, ${b}, 0.40)`;

    // 胶囊背景：毛玻璃风格
    bctx.fillStyle = 'rgba(11, 19, 38, 0.90)';
    if (typeof (bctx as any).roundRect === 'function') {
      bctx.beginPath();
      (bctx as any).roundRect(8, 8, 304, 56, 28);
      bctx.fill();
    } else {
      bctx.fillRect(8, 8, 304, 56);
    }

    // 外发光边框
    bctx.lineWidth = 2.5;
    bctx.strokeStyle = strokeColor;
    if (typeof (bctx as any).roundRect === 'function') {
      bctx.beginPath();
      (bctx as any).roundRect(8, 8, 304, 56, 28);
      bctx.stroke();
    }

    // 柔和光晕高对比度文本
    bctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';

    bctx.shadowColor = glowColor;
    bctx.shadowBlur = 10;
    bctx.fillStyle = '#ffffff';
    bctx.fillText(`✦ ${labelToDisplay}`, 160, 36);

    bctx.shadowBlur = 0;
    this.snapBadgeTex.needsUpdate = true;
  }

  public isRayHittingModel(ray: THREE.Ray): boolean {
    if (!this.modelContainer) return false;
    const center = new THREE.Vector3();
    this.modelContainer.getWorldPosition(center);
    const r = Math.max(0.75, (this.currentModelDef?.boundingRadius ?? 0.8) * this.modelScale * 1.35);
    const sphere = new THREE.Sphere(center, r);
    return ray.intersectsSphere(sphere);
  }

  public findClosestSnapPoint(
    ray: THREE.Ray,
    threshold = 0.045,
    options?: { onlyOnEdgeOrLine?: boolean; drawnSegments?: Array<{ pointIdA: string; pointIdB: string; label?: string }> }
  ): { keyPoint: KeyPoint; snapType: string; distance: number; snapLabel: string } | null {
    return GeometrySolver.findClosestSnapPoint(
      ray,
      this.currentModelDef,
      this.modelContainer.matrixWorld,
      threshold,
      {
        drawnSegments: options?.drawnSegments ?? this.drawnSegments,
        ...options,
      }
    );
  }

  public getKeyPointMeshes(): THREE.Mesh[] {
    return Array.from(this.keyPointMeshes.values());
  }

  public getModelDef(): PolyhedronModelDef {
    return this.currentModelDef;
  }

  public getCrossSectionResult(): CrossSectionResult | null {
    return this.currentCrossSection;
  }

  public getSphereAnalysisResult(): SphereAnalysisResult {
    return this.currentSphereAnalysis;
  }

  public getOptions(): StereometryDisplayOptions {
    return {
      ...this.currentOptions,
      dimensions: { ...this.numericalDimensions },
    };
  }

  public getBaseUnit(): number {
    return StereometryMesh.CANONICAL_VISUAL_SIZE;
  }

  /**
   * 将 3D 空间测量的绝对几何距离归一化为高中立体几何尺寸（精确到整数）。
   */
  public formatNormalizedDistance(len: number): string {
    if (len < 1e-4) return '0';
    const base = this.getBaseUnit();
    const unitScale = this.numericalDimensions?.a ?? 1;
    const val = (len / (base > 1e-6 ? base : 1)) * unitScale;
    return Math.max(1, Math.round(val)).toString();
  }

  public setScale(scale: number): void {
    this.modelScale = THREE.MathUtils.clamp(scale, 0.35, 3.0);
    this.modelContainer.scale.setScalar(this.modelScale);

    // 动态提升模型高度，确保底部顶点不穿透桌面
    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;

    // 随模型缩放动态调整投影光环与阴影比例
    const stageScale = Math.max(0.7, this.modelScale * 0.95);
    this.stagePresentationGroup.scale.set(stageScale, 1, stageScale);
  }

  public getScale(): number {
    return this.modelScale;
  }

  public zoom(factor: number): number {
    this.setScale(this.modelScale * factor);
    return this.modelScale;
  }

  public setSelectedKeyPoints(ids: string[]): void {
    // 重置上一批选中关键点的网格缩放
    for (const prevId of this.lastSelectedIds) {
      const mesh = this.keyPointMeshes.get(prevId);
      if (mesh) {
        mesh.scale.set(1.0, 1.0, 1.0);
      }
    }
    this.lastSelectedIds = [...ids];
    this.clearGroup(this.selectedMarkersGroup);
    this.selectedBeaconSprites.clear();

    if (!ids || ids.length === 0) return;

    for (const id of ids) {
      const kp = this.currentModelDef.keyPoints.find((k) => k.id === id);
      if (!kp) continue;

      // 放大关键点网格作为选中标记
      const currMesh = this.keyPointMeshes.get(id);
      if (currMesh) {
        currMesh.scale.set(1.40, 1.40, 1.40);
      }

      // 金色呼吸光环公告板精灵
      const beaconCanvas = document.createElement('canvas');
      beaconCanvas.width = 128;
      beaconCanvas.height = 128;
      const bctx = typeof (beaconCanvas as any).getContext === 'function' ? (beaconCanvas as any).getContext('2d') : null;
      if (bctx) {
        const cx = 64, cy = 64;
        if (typeof bctx.createRadialGradient === 'function') {
          const grad = bctx.createRadialGradient(cx, cy, 18, cx, cy, 58);
          grad.addColorStop(0, 'rgba(251, 191, 36, 0.65)');
          grad.addColorStop(0.65, 'rgba(251, 191, 36, 0.22)');
          grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
          bctx.fillStyle = grad;
          bctx.beginPath();
          bctx.arc(cx, cy, 58, 0, Math.PI * 2);
          bctx.fill();
        }
        bctx.beginPath();
        bctx.arc(cx, cy, 38, 0, Math.PI * 2);
        bctx.lineWidth = 4;
        bctx.strokeStyle = '#fbbf24';
        bctx.stroke();

        bctx.beginPath();
        bctx.arc(cx, cy, 48, 0, Math.PI * 2);
        bctx.lineWidth = 1.8;
        if (typeof bctx.setLineDash === 'function') {
          bctx.setLineDash([4, 6]);
        }
        bctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        bctx.stroke();
      }

      const tex = new THREE.CanvasTexture(beaconCanvas);
      tex.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(kp.position);
      sprite.scale.set(0.026, 0.026, 1);
      sprite.renderOrder = 8;
      this.selectedMarkersGroup.add(sprite);
      this.selectedBeaconSprites.set(id, sprite);
    }
  }

  public updatePreviewWire(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    color = 0x38d9a9,
    badgeText?: string,
    camera?: THREE.Camera
  ): void {
    const dir = new THREE.Vector3().subVectors(endPos, startPos);
    const len = dir.length();
    if (len < 1e-4) {
      this.previewSegmentGroup.visible = false;
      return;
    }

    const mid = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);

    // 1. 可复用的动态预览连线微芯（醒目平光线芯，消除立体圆柱高光，粗细清晰适中）
    if (!this.previewPipeMesh) {
      const pipeGeo = new THREE.CylinderGeometry(0.0020, 0.0020, 1.0, 10);
      const pipeMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.96,
        depthTest: true,
        depthWrite: false,
      });
      this.previewPipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
      this.previewPipeMesh.renderOrder = 7;
      this.previewSegmentGroup.add(this.previewPipeMesh);
    }

    const pMat = this.previewPipeMesh.material as THREE.MeshBasicMaterial;
    if (pMat && typeof pMat.color?.setHex === 'function') {
      pMat.color.setHex(color);
    }

    this.previewPipeMesh.scale.set(1, len, 1);
    this.previewPipeMesh.position.copy(mid);
    this.previewPipeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    // 1.1 原生 3D 预览线段（真实几何线条）
    if (!this.previewLineMesh) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
      const lineMat = new THREE.LineBasicMaterial({
        color,
        linewidth: 2,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
      });
      this.previewLineMesh = new THREE.Line(lineGeo, lineMat);
      this.previewLineMesh.renderOrder = 8;
      this.previewSegmentGroup.add(this.previewLineMesh);
    } else {
      const posAttr = this.previewLineMesh.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, startPos.x, startPos.y, startPos.z);
      posAttr.setXYZ(1, endPos.x, endPos.y, endPos.z);
      posAttr.needsUpdate = true;
      (this.previewLineMesh.material as THREE.LineBasicMaterial).color.setHex(color);
    }

    // 2. 可复用的端点锚点珠
    if (!this.previewStartBead) {
      const beadGeo = new THREE.SphereGeometry(0.0052, 12, 12);
      const beadMat = new THREE.MeshStandardMaterial({
        color: 0xffd43b,
        emissive: 0xffd43b,
        emissiveIntensity: 0.9,
      });
      this.previewStartBead = new THREE.Mesh(beadGeo, beadMat);
      this.previewStartBead.renderOrder = 7;
      this.previewSegmentGroup.add(this.previewStartBead);
    }
    this.previewStartBead.position.copy(startPos);

    if (!this.previewEndBead) {
      const beadGeo = new THREE.SphereGeometry(0.0052, 12, 12);
      const beadMat = new THREE.MeshStandardMaterial({
        color: 0x38d9a9,
        emissive: 0x38d9a9,
        emissiveIntensity: 0.9,
      });
      this.previewEndBead = new THREE.Mesh(beadGeo, beadMat);
      this.previewEndBead.renderOrder = 7;
      this.previewSegmentGroup.add(this.previewEndBead);
    }
    this.previewEndBead.position.copy(endPos);
    (this.previewEndBead.material as THREE.MeshStandardMaterial).color.setHex(color);
    (this.previewEndBead.material as THREE.MeshStandardMaterial).emissive.setHex(color);

    // 3. 沿连线对齐的纯文本度量指示器（加大文字、去除单位、归一化）
    const labelToDisplay = badgeText || this.formatNormalizedDistance(len);
    if (!this.previewBadgeSprite) {
      this.previewBadgeCanvas = document.createElement('canvas');
      this.previewBadgeCanvas.width = 768;
      this.previewBadgeCanvas.height = 256;
      this.previewBadgeTex = new THREE.CanvasTexture(this.previewBadgeCanvas);
      this.previewBadgeTex.minFilter = THREE.LinearFilter;
      const bMat = new THREE.SpriteMaterial({
        map: this.previewBadgeTex,
        transparent: true,
        depthTest: false,
      });
      this.previewBadgeSprite = new THREE.Sprite(bMat);
      this.previewBadgeSprite.scale.set(0.240, 0.080, 1);
      this.previewBadgeSprite.renderOrder = 9;
      this.previewSegmentGroup.add(this.previewBadgeSprite);
    }

    if (this.previewBadgeCanvas && this.previewBadgeTex && this.lastPreviewBadgeKey !== `${labelToDisplay}_${color}`) {
      this.lastPreviewBadgeKey = `${labelToDisplay}_${color}`;
      const bctx = this.previewBadgeCanvas.getContext('2d');
      if (bctx) {
        bctx.clearRect(0, 0, 768, 256);
        const isEmerald = (color === 0x10b981 || color === 0x38d9a9);

        // 沿线直接渲染纯文本标号，不添加背景框，加大文字尺寸
        bctx.font = 'bold 120px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';

        // 深色描边以确保在 3D 几何体上方清晰可辨
        bctx.lineWidth = 16.0;
        bctx.lineJoin = 'round';
        bctx.strokeStyle = 'rgba(8, 14, 26, 0.95)';
        if (typeof bctx.strokeText === 'function') {
          bctx.strokeText(labelToDisplay, 384, 128);
        }

        // 清晰字形填充
        bctx.fillStyle = isEmerald ? '#34d399' : '#ffffff';
        bctx.fillText(labelToDisplay, 384, 128);
        this.previewBadgeTex.needsUpdate = true;
      }
    }

    this.lastPreviewStartPos = startPos.clone();
    this.lastPreviewEndPos = endPos.clone();

    // 动态姿态与位置：在透视投影视图空间中沿真实屏幕 2D 连线严密对齐
    const cam = camera || this.lastCamera;
    if (cam && typeof (cam as any).matrixWorldInverse !== 'undefined' && typeof (cam as any).matrixWorld !== 'undefined') {
      this.updatePreviewBadgePose(startPos, endPos, cam);
    } else {
      this.previewBadgeSprite.position.copy(mid).add(new THREE.Vector3(0, 0.032, 0));
      (this.previewBadgeSprite.material as THREE.SpriteMaterial).rotation = 0;
    }

    this.previewBadgeSprite.visible = true;
    this.previewSegmentGroup.visible = true;
  }

  /**
   * 将连线两端经由透视投影矩阵精确映射到屏幕像素坐标系，
   * 消除三维近大远小引起的视角斜率偏差，保证字与线始终平齐。
   */
  private updatePreviewBadgePose(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    cam: THREE.Camera
  ): void {
    if (!this.previewBadgeSprite) return;
    const mid = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    const startWorld = startPos.clone().applyMatrix4(this.modelContainer.matrixWorld);
    const endWorld = endPos.clone().applyMatrix4(this.modelContainer.matrixWorld);
    const midWorld = mid.clone().applyMatrix4(this.modelContainer.matrixWorld);

    // 将 3D 空间端点精确投影至屏幕 NDC 空间，结合视口宽高比计算透视投影下的真实屏幕 2D 倾角
    const sStart = startWorld.clone().project(cam);
    const sEnd = endWorld.clone().project(cam);
    const aspect = (cam as any).aspect || (typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1.0);

    const dx = (sEnd.x - sStart.x) * aspect;
    const dy = sEnd.y - sStart.y;
    const len2D = Math.hypot(dx, dy);

    let angle = 0;
    if (len2D > 1e-4) {
      angle = Math.atan2(dy, dx);
      // 确保文字始终从左至右可读（避免倒置）
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;

      // 在摄像机视图空间中垂直于直线偏移，使文本清晰悬浮于连线上方
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const offsetDist = 0.032; // 连线上方 3.2cm

      const midView = midWorld.clone().applyMatrix4((cam as any).matrixWorldInverse);
      midView.x += nx * offsetDist;
      midView.y += ny * offsetDist;
      const targetWorld = midView.applyMatrix4((cam as any).matrixWorld);
      const targetLocal = targetWorld.applyMatrix4(this.modelContainer.matrixWorld.clone().invert());
      this.previewBadgeSprite.position.copy(targetLocal);
    } else {
      this.previewBadgeSprite.position.copy(mid).add(new THREE.Vector3(0, 0.032, 0));
    }

    (this.previewBadgeSprite.material as THREE.SpriteMaterial).rotation = angle;
  }

  public clearPreviewWire(): void {
    this.previewSegmentGroup.visible = false;
    this.lastPreviewStartPos = null;
    this.lastPreviewEndPos = null;
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (
        (child as any).geometry &&
        (child as any).geometry !== this.sharedVertexGeo &&
        (child as any).geometry !== this.sharedMidpointGeo &&
        (child as any).geometry !== this.sharedThirdGeo &&
        (child as any).geometry !== this.sharedCenterGeo
      ) {
        (child as any).geometry.dispose();
      }
    }
  }

  public getLowestVertexY(): number {
    if (!this.currentModelDef || !this.currentModelDef.vertices || this.currentModelDef.vertices.length === 0) {
      return -0.19 * this.modelScale;
    }
    let lowest = Infinity;
    const vRot = new THREE.Vector3();
    const quat = this.modelContainer.quaternion;
    for (const v of this.currentModelDef.vertices) {
      vRot.copy(v).applyQuaternion(quat);
      if (vRot.y < lowest) {
        lowest = vRot.y;
      }
    }
    return lowest * this.modelScale;
  }

  public updateBaseHoverHeight(): void {
    const lowestY = this.getLowestVertexY();
    // 保持距桌面 (Y=0) 至少 minClearance (0.055) 的安全高度
    // 当 lowestY 为负（如 -0.28）时，minClearance - lowestY 为 0.055 - (-0.28) = 0.335
    const requiredHover = Math.max(0.20, this.minClearance - lowestY);
    this.baseHoverY = requiredHover;
  }

  /**
   * 逐帧动画连续更新：
   * 1. 模型在空中的微悬浮呼吸律动
   * 2. 根据摄像机视角动态计算可见实线与遮挡虚线
   * 3. 更新连线生成展开动画与脉冲指示器
   */
  public update(delta: number, elapsed?: number, camera?: THREE.Camera): void {
    if (camera) {
      this.lastCamera = camera;
    }
    const t = elapsed !== undefined ? elapsed : (this.hoverTime += delta);
    this.hoverTime = t;

    // 动态调整悬浮高度，确保模型无论如何旋转或缩放均不穿透桌面
    this.updateBaseHoverHeight();

    // 微悬浮呼吸律动（平滑微幅上下浮动）
    const hoverOffset = Math.sin(t * 1.5) * 0.005;
    this.modelContainer.position.y = this.baseHoverY + hoverOffset;

    // 从当前摄像机视角动态更新可见实棱与遮挡虚线
    this.updateEdgeVisibility(camera);

    // 全息展示环缓慢旋转
    const stageRing = this.stagePresentationGroup.children[1];
    if (stageRing) {
      stageRing.rotation.z += delta * 0.12;
    }

    // 稳定的磁吸捕捉指示器（无多余闪烁与旋转）
    if (this.snapCursorGroup.visible) {
      // 1. 面向摄像机的瞄准准星：保持稳定尺度，无旋转
      if (this.snapCursorSprite) {
        this.snapCursorSprite.scale.set(0.065, 0.065, 1);
        this.snapCursorSprite.material.rotation = 0;
      }

      // 2. 禁用波纹扩散以防视觉闪烁
      if (this.snapRippleSprite) {
        this.snapRippleSprite.visible = false;
      }

      // 3. 3D 悬停珠：稳定的空间锚点
      if (this.snapHoverBead && this.snapHoverBead.visible) {
        this.snapHoverBead.scale.setScalar(1.0);
      }

      // 4. 浮空 3D 标牌：稳定悬浮于点位上方
      if (this.snapBadgeSprite && this.snapBadgeSprite.visible) {
        if (camera) {
          const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          const upLocal = upWorld.applyQuaternion(this.modelContainer.quaternion.clone().invert());
          this.snapBadgeSprite.position.copy(upLocal.multiplyScalar(0.040));
        } else {
          this.snapBadgeSprite.position.set(0, 0.038, 0);
        }
      }
    }

    // 选中关键点信标：清晰稳定的高亮显示
    const beaconScale = 0.026;
    for (const sprite of this.selectedBeaconSprites.values()) {
      sprite.scale.set(beaconScale, beaconScale, 1);
    }

    // 动态刷新预览连线标牌姿态（确保任何旋转视角下文字与连线严密平齐）
    const activeCam = camera || this.lastCamera;
    if (this.previewSegmentGroup.visible && this.lastPreviewStartPos && this.lastPreviewEndPos && activeCam) {
      this.updatePreviewBadgePose(this.lastPreviewStartPos, this.lastPreviewEndPos, activeCam);
    }

    // 更新空间连线生成动画
    for (let i = this.activeSegmentAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeSegmentAnimations[i];
      anim.progress += delta / anim.duration;
      const p = Math.min(anim.progress, 1.0);
      const ease = 1 - Math.pow(1 - p, 3); // 三次缓出插值
      const currentLen = anim.finalLength * ease;

      const halfLen = currentLen * 0.5;
      anim.pipeMesh.position.copy(anim.posA).addScaledVector(anim.dir, halfLen);
      anim.pipeMesh.scale.set(1, Math.max(0.001, currentLen), 1);
      anim.glowTipMesh.position.copy(anim.posA).addScaledVector(anim.dir, currentLen);

      if (p >= 1.0) {
        this.segmentAnimGroup.remove(anim.pipeMesh);
        this.segmentAnimGroup.remove(anim.glowTipMesh);
        anim.pipeMesh.geometry.dispose();
        (anim.pipeMesh.material as THREE.Material).dispose();
        anim.glowTipMesh.geometry.dispose();
        (anim.glowTipMesh.material as THREE.Material).dispose();
        this.activeSegmentAnimations.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    this.clearGroup(this.group);
    this.clearGroup(this.modelContainer);
    this.clearGroup(this.stagePresentationGroup);
    this.clearGroup(this.auxFacesGroup);
    this.auxiliaryFaces = [];
    this.sharedVertexGeo.dispose();
    this.sharedMidpointGeo.dispose();
    this.sharedThirdGeo.dispose();
    this.sharedCenterGeo.dispose();
    this.unitCylinderGeo.dispose();
    this.depthMaskMaterial.dispose();
    this.solidBackMaterial.dispose();
    this.solidFrontMaterial.dispose();
    this.solidCutMaterial.dispose();
    this.strutMaterial.dispose();
    this.solidEdgeMaterial.dispose();
    this.dashedEdgeMaterial.dispose();
    this.crossSectionFillMat.dispose();
    this.crossSectionLineMat.dispose();
    this.circumSphereMat.dispose();
    this.inSphereMat.dispose();
    this.auxFaceFillMat.dispose();
    this.auxFaceContourMat.dispose();
    this.vertexNodeMat.dispose();
    this.midpointNodeMat.dispose();
    this.thirdNodeMat.dispose();
    this.centerNodeMat.dispose();
    this.originNodeMat.dispose();
    if (this.snapHoverBead) {
      this.snapHoverBead.geometry.dispose();
    }
    if (this.snapHoverBeadMat) {
      this.snapHoverBeadMat.dispose();
    }
    if (this.snapRippleSprite) {
      this.snapRippleSprite.material.dispose();
    }
    if (this.snapBadgeTex) {
      this.snapBadgeTex.dispose();
    }
    if (this.snapBadgeSprite) {
      this.snapBadgeSprite.material.dispose();
    }
    if (this.snapCursorSprite) {
      this.snapCursorSprite.material.dispose();
    }
    if (this.previewPipeMesh) {
      this.previewPipeMesh.geometry.dispose();
      (this.previewPipeMesh.material as THREE.Material).dispose();
      this.previewPipeMesh = null;
    }
    if (this.previewLineMesh) {
      this.previewLineMesh.geometry.dispose();
      (this.previewLineMesh.material as THREE.Material).dispose();
      this.previewLineMesh = null;
    }
  }
}
