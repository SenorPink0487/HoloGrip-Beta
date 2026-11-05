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
import { AppleHapticAudio } from './AppleHapticAudio.ts';

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

export interface DrawnAngle {
  id: string;
  lineId1: string;
  lineId2: string;
  label1: string;
  label2: string;
  angleDeg: number;
  angleType: 'intersecting' | 'skew' | 'parallel';
  vertexPos: THREE.Vector3;
  badgePos: THREE.Vector3;
  dir1: THREE.Vector3;
  dir2: THREE.Vector3;
  isRightAngle: boolean;
  color: number;
}

export interface InteractableLine {
  id: string;
  pointIdA: string;
  pointIdB: string;
  label: string;
  isDrawnSegment: boolean;
  posA: THREE.Vector3;
  posB: THREE.Vector3;
  hitPoint3D: THREE.Vector3;
  screenDistPx: number;
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
  private segmentBadgesGroup = new THREE.Group();
  private segmentBadges = new Map<
    string,
    {
      sprite: THREE.Sprite;
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
      material: THREE.SpriteMaterial;
      posA: THREE.Vector3;
      posB: THREE.Vector3;
      text: string;
      color: number;
    }
  >();
  private auxGroup = new THREE.Group();
  private auxFacesGroup = new THREE.Group();
  private auxiliaryFaces: AuxiliaryFace[] = [];
  private hitEnvelopeMesh: THREE.Mesh | null = null;
  private modelScale = 1.0;

  // 苹果原生连线长按消除交互与粒子消散动效系统
  private eliminationEffectsGroup = new THREE.Group();
  private chargingRingGroup = new THREE.Group();
  private chargingRingSprite: THREE.Sprite | null = null;
  private chargingRingCanvas: HTMLCanvasElement | null = null;
  private chargingRingTex: THREE.CanvasTexture | null = null;
  private chargingProgress = 0;
  private chargingSpringScale = 0;
  private chargingTargetScale = 0;
  private chargingSegmentId: string | null = null;
  private chargingHitPoint = new THREE.Vector3();
  private hoveredSegmentId: string | null = null;
  private eliminatingSegmentIds = new Set<string>();

  // 空间线线夹角测量与长按消除体系
  private drawnAngles: DrawnAngle[] = [];
  private anglesGroup = new THREE.Group();
  private angleBadges = new Map<
    string,
    {
      sprite: THREE.Sprite;
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
      material: THREE.SpriteMaterial;
      pos: THREE.Vector3;
      text: string;
      color: number;
    }
  >();
  private selectedAngleLineId: string | null = null;
  private selectedAngleLineHighlightMesh: THREE.Mesh | null = null;
  private hoveredAngleId: string | null = null;
  private chargingAngleId: string | null = null;
  private eliminatingAngleIds = new Set<string>();

  private activeAngleEliminations: Array<{
    id: string;
    pointsMesh?: THREE.Points;
    particles?: Array<{
      pos: THREE.Vector3;
      vel: THREE.Vector3;
    }>;
    badgeSprite?: THREE.Sprite;
    arcMesh?: THREE.Line;
    fanMesh?: THREE.Mesh;
    progress: number;
    duration: number;
    onComplete?: () => void;
  }> = [];

  private activeEliminations: Array<{
    id: string;
    seg: DrawnSegment;
    posA: THREE.Vector3;
    posB: THREE.Vector3;
    pointsMesh?: THREE.Points;
    particles?: Array<{
      pos: THREE.Vector3;
      vel: THREE.Vector3;
    }>;
    badgeSprite?: THREE.Sprite;
    badgeBaseScale?: THREE.Vector3;
    coreMesh?: THREE.Mesh;
    lineMesh?: THREE.Line;
    affectedFaceMeshes?: Array<{
      mesh: THREE.Mesh;
      contour?: THREE.LineLoop;
      origFaceOpacity: number;
      origContourOpacity: number;
    }>;
    progress: number;
    duration: number;
    onComplete?: () => void;
  }> = [];

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
  private knownAuxFaceIds = new Set<string>();
  private activeAuxFaceAnimations: Array<{
    faceMat: THREE.MeshStandardMaterial;
    contourMat: THREE.LineBasicMaterial;
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
  private smoothedPreviewEndPos: THREE.Vector3 | null = null;
  private targetPreviewEndPos: THREE.Vector3 | null = null;
  private previewIsSnapped = true;
  private previewUseSmoothing = false;
  private previewColor = 0x7c3aed;

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

  private numericalDimensions: { a: number; h: number; b?: number; c?: number; r?: number } = { a: 10, h: 10 };

  constructor() {
    this.group.name = 'StereometryMesh';
    this.initMaterials();
    this.assembleGroups();

    // 默认配置：标准高中正方体，课本标准斜二测视角，精确整数归一化（棱长默认为 10）
    this.currentOptions = {
      modelType: 'cube',
      dimensions: { a: 10, b: 10, c: 10, h: 10 },
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
    this.numericalDimensions = { a: 10, h: 10 };

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

    // 1.5 后向面光学折射层，营造水晶体积深度感（深邃冰川蓝折射层，杜绝绿调）
    this.solidBackMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4f8eff,            // 纯净冰川蓝折射层（消除青绿分量）
      roughness: 0.20,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.10,
      transparent: true,
      opacity: 0.18,              // 柔和通透的水晶内部折射
      side: THREE.BackSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      emissive: 0x2563eb,
      emissiveIntensity: 0.12,
    });

    // 2. 半透明纯净光学水晶玻璃前向面（纯正冰川蓝晶体，在展厅暖灰背景下依然保持纯粹天蓝与柔白高光）
    this.solidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4f8eff,            // 纯正冰川蓝水晶色 (Glacier Ice Blue，彻底根除发绿偏青问题)
      roughness: 0.14,            // 细腻亚光水晶漫反射
      metalness: 0.02,
      clearcoat: 1.0,             // 顶部晶体清漆保护层，产生优雅柔和的高光聚焦点
      clearcoatRoughness: 0.05,
      reflectivity: 0.96,
      transparent: true,
      opacity: 0.38,              // 适度半透明冰晶质感（立体感分明且内部连线清晰显现）
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.90,
      sheenColor: 0xffffff,       // 纯白晶体光晕
      sheenRoughness: 0.12,
      emissive: 0x3b82f6,         // 鲜艳纯天蓝自发光（抵消暖色展厅墙面引起的偏绿偏移）
      emissiveIntensity: 0.24,
    });

    this.solidCutMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4f8eff,            // 冰川蓝水晶色
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.94,
      transparent: true,
      opacity: 0.45,
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.70,
      sheenColor: 0xffffff,
      emissive: 0x2563eb,
      emissiveIntensity: 0.25,
    });

    // 3. 高精度 3D 棱清晰结构杆（鲜明耀眼电光蓝微型结构杆）
    this.strutMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,            // 纯正天蓝结构杆 (Electric Sky Blue)
      metalness: 0.15,
      roughness: 0.30,            // 顺滑缎面光泽
      emissive: 0x2563eb,         // 鲜艳纯正的电光天蓝发光，精准勾勒棱骨架
      emissiveIntensity: 0.75,
      transparent: true,
      opacity: 0.96,
    });

    // 3.1 内部锐利发光核心线
    this.solidEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x3b82f6,            // 鲜亮纯正的湛蓝/电光蓝高精核心亮线
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
      color: 0x059669,            // 高对比度翡翠青绿（在白色全息桌面与蔚蓝晶体中均清晰醒目）
      dashSize: 0.014,
      gapSize: 0.007,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.96,
    });

    // 5. 截面：鲜艳发光电光紫磨砂玻璃，配炫紫轮廓边缘
    this.crossSectionFillMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,            // 明亮发光电光紫水晶玻璃 (Electric Purple)
      roughness: 0.16,
      metalness: 0.10,
      transparent: true,
      opacity: 0.50,
      side: THREE.DoubleSide,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.35,
    });

    this.crossSectionLineMat = new THREE.LineBasicMaterial({
      color: 0x7c3aed,            // 鲜亮纯正电光紫轮廓边缘
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

    // 7. 辅助面（高性能共享电光紫水晶玻璃，零着色器重编译卡顿）
    this.auxFaceFillMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,            // 纯正电光紫水晶色 (Electric Purple)
      emissive: 0x7c3aed,
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.10,
      transparent: true,
      opacity: 0.50,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.auxFaceContourMat = new THREE.LineBasicMaterial({
      color: 0x7c3aed,            // 鲜亮电光紫轮廓光晕
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    // 8. 数据节点（晶亮冰白高对比度空间珍珠锚点）
    this.vertexNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf0f9ff,            // 晶亮冰白珍珠锚点（顶点，非死板纯白）
      roughness: 0.10,
      metalness: 0.35,
      emissive: 0x3b82f6,         // 鲜亮天蓝外发光光晕
      emissiveIntensity: 0.75,
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

  private static readonly NOOP_RAYCAST = (): void => {};

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
    this.segmentBadgesGroup.name = 'segmentBadges';
    this.modelContainer.add(this.segmentBadgesGroup);
    this.eliminationEffectsGroup.name = 'eliminationEffects';
    this.modelContainer.add(this.eliminationEffectsGroup);
    this.chargingRingGroup.name = 'chargingRingGroup';
    this.modelContainer.add(this.chargingRingGroup);
    this.anglesGroup.name = 'drawnAngles';
    this.modelContainer.add(this.anglesGroup);

    // 隐形交互碰撞包络体（禁用默认射线命中，避免阻断模型外部空白区域的自由旋转）
    const hitGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitEnvelopeMesh = new THREE.Mesh(hitGeo, hitMat);
    this.hitEnvelopeMesh.name = 'math_hit_envelope';
    this.hitEnvelopeMesh.raycast = StereometryMesh.NOOP_RAYCAST;
    this.modelContainer.add(this.hitEnvelopeMesh);

    this.group.add(this.modelContainer);
    this.group.add(this.stagePresentationGroup);

    this.createSnapCursor();
    this.initChargingRing();
    this.buildStagePresentation();
  }

  private buildStagePresentation(): void {
    this.clearGroup(this.stagePresentationGroup);
    // 移除立体几何下方的全息投影光环与多余底盘，保持桌面纯净物理视界
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
    this.snapCursorSprite.raycast = StereometryMesh.NOOP_RAYCAST;
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
    this.snapRippleSprite.raycast = StereometryMesh.NOOP_RAYCAST;
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
    this.snapHoverBead.raycast = StereometryMesh.NOOP_RAYCAST;
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
    this.snapBadgeSprite.raycast = StereometryMesh.NOOP_RAYCAST;
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
      showDashedLines: false, // 立体几何外轮廓被遮挡的棱也用实线（默认所有棱均使用纯净实线）
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
        this.rebuildSegments();
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
    this.knownAuxFaceIds.clear();
    this.activeAuxFaceAnimations = [];
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
      const r = Math.max(0.18, (this.currentModelDef.boundingRadius || 0.8) * 1.08);
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

    // 预计算棱与面的相邻关系（严格检测多边形周界相邻顶点对，排除面内对角线），实现相机视角的瞬时消隐判定
    for (let i = 0; i < edgeCount; i++) {
      const [i1, i2] = this.currentModelDef.edges[i];
      const faceIndices: number[] = [];
      this.currentModelDef.faces.forEach((f, fIdx) => {
        const idxs = f.vertexIndices;
        const n = idxs.length;
        for (let k = 0; k < n; k++) {
          const a = idxs[k];
          const b = idxs[(k + 1) % n];
          if ((a === i1 && b === i2) || (a === i2 && b === i1)) {
            faceIndices.push(fIdx);
            break;
          }
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
    this.solidEdgesMesh.raycast = StereometryMesh.NOOP_RAYCAST;
    this.edgesSolidGroup.add(this.solidEdgesMesh);

    // 2. 高精度 3D 精微结构杆（仅用于可见棱，绝不用于被遮挡棱）
    this.solidStrutsMesh = new THREE.InstancedMesh(this.unitCylinderGeo, this.strutMaterial, edgeCount);
    this.solidStrutsMesh.name = 'solidStruts';
    this.solidStrutsMesh.renderOrder = 4;
    this.solidStrutsMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
    this.dashedEdgesMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
    boxLines.raycast = StereometryMesh.NOOP_RAYCAST;

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
    sprite.raycast = StereometryMesh.NOOP_RAYCAST;
    return sprite;
  }

  private rebuildAuxEdges(): void {
    const aux = this.currentModelDef.auxEdges;
    if (!aux || aux.length === 0) return;
    const up = new THREE.Vector3(0, 1, 0);
    for (const edge of aux) {
      const kpA = this.currentModelDef.keyPoints.find((kp) => kp.id === edge.a);
      const kpB = this.currentModelDef.keyPoints.find((kp) => kp.id === edge.b);
      if (!kpA || !kpB) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([kpA.position, kpB.position]);
      const line = new THREE.Line(geo, this.auxEdgeMaterial);
      line.computeLineDistances();
      line.name = `aux_${edge.a}_${edge.b}`;
      line.renderOrder = 6;
      line.raycast = StereometryMesh.NOOP_RAYCAST;

      // 附加超细无反光微芯（解决 Retina/iPad WebGL 单像素 Line 过细难辨识问题，且保持 auxGroup 顶层子节点数不变）
      const dir = kpB.position.clone().sub(kpA.position);
      const len = dir.length();
      if (len > 1e-4) {
        const coreGeo = new THREE.CylinderGeometry(0.0012, 0.0012, len, 6);
        const coreMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.52,
          depthTest: false,
          depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.copy(kpA.position).add(kpB.position).multiplyScalar(0.5);
        core.quaternion.setFromUnitVectors(up, dir.normalize());
        core.renderOrder = 5;
        core.raycast = StereometryMesh.NOOP_RAYCAST;
        line.add(core);
      }

      this.auxGroup.add(line);
    }
  }

  /**
   * 将 3D 几何顶点坐标间距计算并归一化为高中立体几何尺寸（精确到整数）。
   */
  public calculateNormalizedSegmentLength(posA: THREE.Vector3, posB: THREE.Vector3): number {
    const base = this.getBaseUnit();
    const unitA = this.numericalDimensions?.a ?? 10;
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
  // 6. 空间连线绘制（附带生成动画，默认使用纯正电光紫 0x7c3aed）
  // -------------------------------------------------------------
  public addSegment(pointIdA: string, pointIdB: string, color = 0x7c3aed): DrawnSegment | null {
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
    pipeMesh.raycast = StereometryMesh.NOOP_RAYCAST;
    this.segmentAnimGroup.add(pipeMesh);

    // 从 posA 运动至 posB 的发光端点指示器
    const tipGeo = new THREE.SphereGeometry(0.0050, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const glowTipMesh = new THREE.Mesh(tipGeo, tipMat);
    glowTipMesh.position.copy(posA);
    glowTipMesh.renderOrder = 7;
    glowTipMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
    this.drawnAngles = this.drawnAngles.filter((a) => a.lineId1 !== removed.id && a.lineId2 !== removed.id);
    this.rebuildSegments();
    this.rebuildAngles();
    return removed;
  }

  public removeSegment(id: string): void {
    this.drawnSegments = this.drawnSegments.filter((s) => s.id !== id);
    this.drawnAngles = this.drawnAngles.filter((a) => a.lineId1 !== id && a.lineId2 !== id);
    this.rebuildSegments();
    this.rebuildAngles();
  }

  public clearAllSegments(): void {
    this.drawnSegments = [];
    this.clearGroup(this.segmentAnimGroup);
    this.activeSegmentAnimations = [];
    this.auxiliaryFaces = [];
    this.knownAuxFaceIds.clear();
    this.activeAuxFaceAnimations = [];
    this.clearGroup(this.auxFacesGroup);
    this.clearAllAngles();
    for (const badge of this.segmentBadges.values()) {
      badge.material.dispose();
      badge.texture.dispose();
    }
    this.segmentBadges.clear();
    this.clearGroup(this.segmentBadgesGroup);
    this.clearGroup(this.eliminationEffectsGroup);
    this.activeEliminations = [];
    this.eliminatingSegmentIds.clear();
    this.cancelSegmentLongPress();
    this.rebuildSegments();
  }

  public isSegmentEliminating(id: string): boolean {
    return this.eliminatingSegmentIds.has(id);
  }

  // -------------------------------------------------------------
  // 苹果原生连线命中检测与长按消除交互体系
  // -------------------------------------------------------------
  public findClosestDrawnSegment(
    ray: THREE.Ray,
    clientX?: number,
    clientY?: number,
    camera?: THREE.Camera,
    viewport?: { left: number; top: number; width: number; height: number },
    maxScreenDistPx: number = 32
  ): { segment: DrawnSegment; hitPoint3D: THREE.Vector3; screenDistPx: number } | null {
    if (this.drawnSegments.length === 0) return null;

    let bestSeg: DrawnSegment | null = null;
    let bestDist = maxScreenDistPx;
    let bestHitLocal = new THREE.Vector3();

    this.modelContainer.updateWorldMatrix(true, false);
    const mWorld = this.modelContainer.matrixWorld;

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const projA = new THREE.Vector3();
    const projB = new THREE.Vector3();
    const bWorld = new THREE.Vector3();
    const projBadge = new THREE.Vector3();

    for (const seg of this.drawnSegments) {
      if (this.eliminatingSegmentIds.has(seg.id)) continue;
      const kpA = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdA);
      const kpB = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdB);
      if (!kpA || !kpB) continue;

      vA.copy(kpA.position).applyMatrix4(mWorld);
      vB.copy(kpB.position).applyMatrix4(mWorld);

      if (camera && viewport && typeof clientX === 'number' && typeof clientY === 'number') {
        projA.copy(vA).project(camera);
        projB.copy(vB).project(camera);

        if (projA.z > 1.0 || projB.z > 1.0) continue;

        const sxA = viewport.left + ((projA.x + 1) * 0.5) * viewport.width;
        const syA = viewport.top + ((-projA.y + 1) * 0.5) * viewport.height;
        const sxB = viewport.left + ((projB.x + 1) * 0.5) * viewport.width;
        const syB = viewport.top + ((-projB.y + 1) * 0.5) * viewport.height;

        const dx = sxB - sxA;
        const dy = syB - syA;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq < 1e-4 ? 0.5 : ((clientX - sxA) * dx + (clientY - syA) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = sxA + t * dx;
        const cy = syA + t * dy;
        let dist = Math.hypot(clientX - cx, clientY - cy);

        // 连线上方标牌 (Sprite) 容差命中检测，使点击标牌也可轻松选中该线
        const badge = this.segmentBadges.get(seg.id);
        if (badge && badge.sprite) {
          bWorld.copy(badge.sprite.position).applyMatrix4(mWorld);
          projBadge.copy(bWorld).project(camera);
          if (projBadge.z <= 1.0) {
            const bx = viewport.left + ((projBadge.x + 1) * 0.5) * viewport.width;
            const by = viewport.top + ((-projBadge.y + 1) * 0.5) * viewport.height;
            const badgeDist = Math.hypot(clientX - bx, clientY - by);
            if (badgeDist < dist) {
              dist = badgeDist;
              t = 0.5;
            }
          }
        }

        if (dist <= maxScreenDistPx && dist < bestDist) {
          bestDist = dist;
          bestSeg = seg;
          bestHitLocal.copy(kpA.position).lerp(kpB.position, t);
        }
      } else {
        // 无屏幕信息时退化为三维空间中射线与线段的最短距离判断
        const segVec = vB.clone().sub(vA);
        const segLen = segVec.length();
        if (segLen < 1e-4) continue;
        const segDir = segVec.clone().normalize();
        const diff = ray.origin.clone().sub(vA);
        const a01 = -ray.direction.dot(segDir);
        const b0 = diff.dot(ray.direction);
        const b1 = -diff.dot(segDir);
        const det = Math.abs(1.0 - a01 * a01);
        let s = 0;
        let t = 0;
        if (det >= 1e-4) {
          s = a01 * b1 - b0;
          t = a01 * b0 - b1;
          s /= det;
          t /= det;
        } else {
          s = -b0;
          t = 0;
        }
        s = Math.max(0, s);
        t = Math.max(0, Math.min(segLen, t));
        const ptOnRay = ray.origin.clone().addScaledVector(ray.direction, s);
        const ptOnSeg = vA.clone().addScaledVector(segDir, t);
        const rayDist = ptOnRay.distanceTo(ptOnSeg);
        const maxRayDist = 0.045 * this.modelScale;
        if (rayDist <= maxRayDist) {
          bestDist = rayDist;
          bestSeg = seg;
          const ratio = t / segLen;
          bestHitLocal.copy(kpA.position).lerp(kpB.position, ratio);
        }
      }
    }

    if (!bestSeg) return null;
    return {
      segment: bestSeg,
      hitPoint3D: bestHitLocal,
      screenDistPx: bestDist,
    };
  }

  public setHoveredSegment(segId: string | null): void {
    if (this.hoveredSegmentId === segId) return;

    // 复原前一个悬停线段
    if (this.hoveredSegmentId) {
      const prevCore = this.segmentsGroup.getObjectByName(`perm_seg_${this.hoveredSegmentId}`) as THREE.Mesh;
      if (prevCore && (prevCore as any).userData?.baseColor) {
        prevCore.scale.set(1, 1, 1);
        (prevCore.material as THREE.MeshBasicMaterial).color.setHex((prevCore as any).userData.baseColor);
      }
      const prevBadge = this.segmentBadges.get(this.hoveredSegmentId);
      if (prevBadge && prevBadge.sprite) {
        prevBadge.sprite.scale.set(0.240, 0.080, 1);
      }
    }

    this.hoveredSegmentId = segId;

    // 应用新悬停线段的苹果微光高亮 (微加粗 1.35x + 荧光紫 0xa855f7)
    if (segId && !this.eliminatingSegmentIds.has(segId)) {
      const core = this.segmentsGroup.getObjectByName(`perm_seg_${segId}`) as THREE.Mesh;
      if (core) {
        core.scale.set(1.35, 1, 1.35);
        (core.material as THREE.MeshBasicMaterial).color.setHex(0xa855f7);
      }
      const badge = this.segmentBadges.get(segId);
      if (badge && badge.sprite) {
        badge.sprite.scale.set(0.260, 0.086, 1);
      }
    }
  }

  public getHoveredSegmentId(): string | null {
    return this.hoveredSegmentId;
  }

  public startSegmentLongPress(segmentId: string, hitPoint3D: THREE.Vector3): void {
    if (this.eliminatingSegmentIds.has(segmentId)) return;
    this.chargingSegmentId = segmentId;
    this.chargingHitPoint.copy(hitPoint3D);
    this.chargingProgress = 0;
    this.chargingTargetScale = 1.0;
    this.chargingSpringScale = 0.35;

    if (this.chargingRingSprite) {
      this.chargingRingSprite.position.copy(hitPoint3D);
      this.chargingRingSprite.visible = true;
    }
    this.renderChargingRingCanvas(0, this.chargingSpringScale);

    // 激发线芯初态微弹触感
    const core = this.segmentsGroup.getObjectByName(`perm_seg_${segmentId}`) as THREE.Mesh;
    if (core) {
      core.scale.set(1.25, 1, 1.25);
    }
  }

  public updateSegmentLongPress(segmentId: string, progress: number, hitPoint3D?: THREE.Vector3): void {
    if (this.eliminatingSegmentIds.has(segmentId)) return;
    this.chargingSegmentId = segmentId;
    this.chargingProgress = Math.max(0, Math.min(1.0, progress));
    if (hitPoint3D) {
      this.chargingHitPoint.copy(hitPoint3D);
    }

    // 弹性平滑缩放
    this.chargingSpringScale += (this.chargingTargetScale - this.chargingSpringScale) * 0.24;

    if (this.chargingRingSprite) {
      this.chargingRingSprite.position.copy(this.chargingHitPoint);
      this.chargingRingSprite.visible = true;
    }

    this.renderChargingRingCanvas(this.chargingProgress, this.chargingSpringScale);

    // 蓄力过程中线芯逐渐加粗增亮至热粉/洋红 (0xf43f5e)
    const core = this.segmentsGroup.getObjectByName(`perm_seg_${segmentId}`) as THREE.Mesh;
    if (core) {
      const thick = 1.0 + 1.25 * Math.pow(this.chargingProgress, 1.1);
      core.scale.set(thick, 1, thick);
      const cMat = core.material as THREE.MeshBasicMaterial;
      const cStart = new THREE.Color(0x7c3aed);
      const cTarget = new THREE.Color(0xf43f5e);
      cMat.color.lerpColors(cStart, cTarget, this.chargingProgress);
    }

    // 标牌微受压缩放 (模拟实体按键下压弹性)
    const badge = this.segmentBadges.get(segmentId);
    if (badge && badge.sprite) {
      const compress = 1.0 - 0.12 * Math.sin(this.chargingProgress * Math.PI * 0.5);
      badge.sprite.scale.set(0.240 * compress, 0.080 * compress, 1);
    }
  }

  public cancelSegmentLongPress(): void {
    const segId = this.chargingSegmentId;
    this.chargingTargetScale = 0;
    this.chargingProgress = 0;
    this.chargingSegmentId = null;

    if (segId) {
      const core = this.segmentsGroup.getObjectByName(`perm_seg_${segId}`) as THREE.Mesh;
      if (core && (core as any).userData?.baseColor) {
        core.scale.set(1, 1, 1);
        (core.material as THREE.MeshBasicMaterial).color.setHex((core as any).userData.baseColor);
      }
      const badge = this.segmentBadges.get(segId);
      if (badge && badge.sprite) {
        badge.sprite.scale.set(0.240, 0.080, 1);
      }
    }
  }

  public playSegmentEliminationAnimation(segmentId: string, onComplete: () => void): void {
    const seg = this.drawnSegments.find((s) => s.id === segmentId);
    if (!seg) {
      onComplete();
      return;
    }

    this.eliminatingSegmentIds.add(segmentId);
    if (this.chargingRingSprite) {
      this.chargingRingSprite.visible = false;
    }
    this.chargingSegmentId = null;
    this.chargingProgress = 0;

    // 播放苹果原生触感 Pop
    AppleHapticAudio.playPop();

    const kpA = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdA);
    const kpB = this.currentModelDef.keyPoints.find((k) => k.id === seg.pointIdB);
    const posA = (kpA ? kpA.position : new THREE.Vector3()).clone();
    const posB = (kpB ? kpB.position : new THREE.Vector3()).clone();

    // 1. 苹果原生量子微火花粒子消散系统 (36 颗微晶粒子沿线段径向炸开)
    const count = 36;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const particleData: Array<{ pos: THREE.Vector3; vel: THREE.Vector3 }> = [];

    const dir = new THREE.Vector3().subVectors(posB, posA);
    const axis = dir.clone().normalize();
    const u = new THREE.Vector3();
    if (Math.abs(axis.y) < 0.9) {
      u.crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      u.crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();

    const applePalette = [
      new THREE.Color(0xffffff),
      new THREE.Color(0xc084fc),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xa855f7),
      new THREE.Color(0xfbbf24),
    ];

    for (let i = 0; i < count; i++) {
      const t = (i + Math.random() * 0.5) / count;
      const p = posA.clone().lerp(posB, Math.min(1.0, Math.max(0, t)));
      p.x += (Math.random() - 0.5) * 0.003;
      p.y += (Math.random() - 0.5) * 0.003;
      p.z += (Math.random() - 0.5) * 0.003;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.24 + Math.random() * 0.38;
      const radial = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      const vel = radial.multiplyScalar(speed).add(new THREE.Vector3(0, 0.06 + Math.random() * 0.04, 0));

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      const col = applePalette[i % applePalette.length];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      particleData.push({ pos: p, vel });
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.010,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const pointsMesh = new THREE.Points(pGeo, pMat);
    pointsMesh.renderOrder = 22;
    pointsMesh.raycast = StereometryMesh.NOOP_RAYCAST;
    this.eliminationEffectsGroup.add(pointsMesh);

    // 2. 线芯与几何线网格
    const coreMesh = this.segmentsGroup.getObjectByName(`perm_seg_${segmentId}`) as THREE.Mesh;
    const lineMesh = this.segmentsGroup.getObjectByName(`perm_seg_line_${segmentId}`) as THREE.Line;

    // 3. 标牌 Sprite
    const badge = this.segmentBadges.get(segmentId);

    // 4. 关联闭合平面的渐隐解体
    const affectedFaces: Array<{
      mesh: THREE.Mesh;
      contour?: THREE.LineLoop;
      origFaceOpacity: number;
      origContourOpacity: number;
    }> = [];

    for (const face of this.auxiliaryFaces) {
      if (face.pointIds.includes(seg.pointIdA) && face.pointIds.includes(seg.pointIdB)) {
        const fMesh = this.auxFacesGroup.getObjectByName(`aux_face_${face.id}`) as THREE.Mesh;
        const cLoop = this.auxFacesGroup.getObjectByName(`aux_face_contour_${face.id}`) as THREE.LineLoop;
        if (fMesh) {
          affectedFaces.push({
            mesh: fMesh,
            contour: cLoop,
            origFaceOpacity: (fMesh.material as THREE.MeshStandardMaterial).opacity || 0.35,
            origContourOpacity: cLoop ? ((cLoop.material as THREE.LineBasicMaterial).opacity || 0.95) : 0.95,
          });
        }
      }
    }

    this.activeEliminations.push({
      id: segmentId,
      seg,
      posA,
      posB,
      pointsMesh,
      particles: particleData,
      badgeSprite: badge?.sprite,
      badgeBaseScale: badge ? new THREE.Vector3(0.240, 0.080, 1) : undefined,
      coreMesh,
      lineMesh,
      affectedFaceMeshes: affectedFaces,
      progress: 0,
      duration: 0.34,
      onComplete,
    });
  }

  // -------------------------------------------------------------
  // 空间直线夹角标出与长按消除体系 (Click-to-Measure & Long-Press Eliminate)
  // 铁律：高中立体几何交互规范中，能标角度的只能是紫线 (DrawnSegment 辅助线)
  // -------------------------------------------------------------
  public findClosestLine(
    ray: THREE.Ray,
    clientX?: number,
    clientY?: number,
    camera?: THREE.Camera,
    viewport?: { left: number; top: number; width: number; height: number },
    maxScreenDistPx: number = 32,
    onlyDrawnSegments: boolean = true
  ): InteractableLine | null {
    // 1. 优先且仅检测已绘制的辅助线 (紫线)
    const drawnHit = this.findClosestDrawnSegment(ray, clientX, clientY, camera, viewport, maxScreenDistPx);
    if (drawnHit) {
      const kpA = this.currentModelDef.keyPoints.find((k) => k.id === drawnHit.segment.pointIdA);
      const kpB = this.currentModelDef.keyPoints.find((k) => k.id === drawnHit.segment.pointIdB);
      if (kpA && kpB) {
        return {
          id: drawnHit.segment.id,
          pointIdA: drawnHit.segment.pointIdA,
          pointIdB: drawnHit.segment.pointIdB,
          label: drawnHit.segment.label,
          isDrawnSegment: true,
          posA: kpA.position.clone(),
          posB: kpB.position.clone(),
          hitPoint3D: drawnHit.hitPoint3D,
          screenDistPx: drawnHit.screenDistPx,
        };
      }
    }

    // 2. 只有在明确关闭 onlyDrawnSegments 时才允许回退检测几何体原始棱边
    if (
      !onlyDrawnSegments &&
      this.currentModelDef &&
      this.currentModelDef.edges &&
      camera &&
      viewport &&
      typeof clientX === 'number' &&
      typeof clientY === 'number'
    ) {
      let bestEdge: InteractableLine | null = null;
      let bestDist = maxScreenDistPx;

      this.modelContainer.updateWorldMatrix(true, false);
      const mWorld = this.modelContainer.matrixWorld;

      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const projA = new THREE.Vector3();
      const projB = new THREE.Vector3();

      for (const [idxA, idxB] of this.currentModelDef.edges) {
        const lblA = this.currentModelDef.vertexLabels[idxA];
        const lblB = this.currentModelDef.vertexLabels[idxB];
        const kpA = this.currentModelDef.keyPoints.find((k) => k.type === 'vertex' && k.label === lblA);
        const kpB = this.currentModelDef.keyPoints.find((k) => k.type === 'vertex' && k.label === lblB);
        if (!kpA || !kpB) continue;

        vA.copy(kpA.position).applyMatrix4(mWorld);
        vB.copy(kpB.position).applyMatrix4(mWorld);

        projA.copy(vA).project(camera);
        projB.copy(vB).project(camera);
        if (projA.z > 1.0 || projB.z > 1.0) continue;

        const sxA = viewport.left + ((projA.x + 1) * 0.5) * viewport.width;
        const syA = viewport.top + ((-projA.y + 1) * 0.5) * viewport.height;
        const sxB = viewport.left + ((projB.x + 1) * 0.5) * viewport.width;
        const syB = viewport.top + ((-projB.y + 1) * 0.5) * viewport.height;

        const dx = sxB - sxA;
        const dy = syB - syA;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq < 1e-4 ? 0.5 : ((clientX - sxA) * dx + (clientY - syA) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = sxA + t * dx;
        const cy = syA + t * dy;
        const dist = Math.hypot(clientX - cx, clientY - cy);

        if (dist <= maxScreenDistPx && dist < bestDist) {
          bestDist = dist;
          bestEdge = {
            id: `edge_${kpA.id}_${kpB.id}`,
            pointIdA: kpA.id,
            pointIdB: kpB.id,
            label: `${kpA.label}${kpB.label}`,
            isDrawnSegment: false,
            posA: kpA.position.clone(),
            posB: kpB.position.clone(),
            hitPoint3D: kpA.position.clone().lerp(kpB.position, t),
            screenDistPx: dist,
          };
        }
      }

      if (bestEdge) return bestEdge;
    }

    return null;
  }

  public findClosestAngle(
    ray: THREE.Ray,
    clientX?: number,
    clientY?: number,
    camera?: THREE.Camera,
    viewport?: { left: number; top: number; width: number; height: number },
    maxScreenDistPx: number = 34
  ): { angle: DrawnAngle; hitPoint3D: THREE.Vector3; screenDistPx: number } | null {
    if (this.drawnAngles.length === 0) return null;

    let bestAngle: DrawnAngle | null = null;
    let bestDist = maxScreenDistPx;
    let bestHit = new THREE.Vector3();

    this.modelContainer.updateWorldMatrix(true, false);
    const mWorld = this.modelContainer.matrixWorld;

    const bWorld = new THREE.Vector3();
    const vWorld = new THREE.Vector3();
    const projB = new THREE.Vector3();
    const projV = new THREE.Vector3();

    for (const ang of this.drawnAngles) {
      if (this.eliminatingAngleIds.has(ang.id)) continue;

      if (camera && viewport && typeof clientX === 'number' && typeof clientY === 'number') {
        // 1. 优先测试标牌距离
        bWorld.copy(ang.badgePos).applyMatrix4(mWorld);
        projB.copy(bWorld).project(camera);
        if (projB.z <= 1.0) {
          const bx = viewport.left + ((projB.x + 1) * 0.5) * viewport.width;
          const by = viewport.top + ((-projB.y + 1) * 0.5) * viewport.height;
          const distB = Math.hypot(clientX - bx, clientY - by);
          if (distB <= maxScreenDistPx && distB < bestDist) {
            bestDist = distB;
            bestAngle = ang;
            bestHit.copy(ang.badgePos);
            continue;
          }
        }

        // 2. 测试顶点/弧线中心距离
        vWorld.copy(ang.vertexPos).applyMatrix4(mWorld);
        projV.copy(vWorld).project(camera);
        if (projV.z <= 1.0) {
          const vx = viewport.left + ((projV.x + 1) * 0.5) * viewport.width;
          const vy = viewport.top + ((-projV.y + 1) * 0.5) * viewport.height;
          const distV = Math.hypot(clientX - vx, clientY - vy);
          if (distV <= maxScreenDistPx && distV < bestDist) {
            bestDist = distV;
            bestAngle = ang;
            bestHit.copy(ang.vertexPos);
          }
        }
      } else {
        bWorld.copy(ang.badgePos).applyMatrix4(mWorld);
        const distRay = ray.distanceToPoint(bWorld);
        if (distRay <= 0.05 * this.modelScale && distRay < bestDist) {
          bestDist = distRay;
          bestAngle = ang;
          bestHit.copy(ang.badgePos);
        }
      }
    }

    if (!bestAngle) return null;
    return {
      angle: bestAngle,
      hitPoint3D: bestHit,
      screenDistPx: bestDist,
    };
  }

  public setSelectedAngleLine(lineId: string | null): void {
    if (this.selectedAngleLineId === lineId) return;

    // 清理前一条选中的高亮
    if (this.selectedAngleLineId) {
      const prevCore = this.segmentsGroup.getObjectByName(`perm_seg_${this.selectedAngleLineId}`) as THREE.Mesh;
      if (prevCore && (prevCore as any).userData?.baseColor) {
        prevCore.scale.set(1, 1, 1);
        (prevCore.material as THREE.MeshBasicMaterial).color.setHex((prevCore as any).userData.baseColor);
      }
      if (this.selectedAngleLineHighlightMesh) {
        this.modelContainer.remove(this.selectedAngleLineHighlightMesh);
        this.selectedAngleLineHighlightMesh.geometry.dispose();
        (this.selectedAngleLineHighlightMesh.material as THREE.Material).dispose();
        this.selectedAngleLineHighlightMesh = null;
      }
    }

    this.selectedAngleLineId = lineId;

    if (lineId) {
      const core = this.segmentsGroup.getObjectByName(`perm_seg_${lineId}`) as THREE.Mesh;
      if (core) {
        core.scale.set(1.5, 1, 1.5);
        (core.material as THREE.MeshBasicMaterial).color.setHex(0xc084fc); // 纯正高亮电光紫微光
      } else {
        const parts = lineId.replace('edge_', '').split('_');
        const pAId = parts.slice(0, 2).join('_');
        const pBId = parts.slice(2).join('_');
        const kpA = this.currentModelDef.keyPoints.find((k) => k.id === pAId);
        const kpB = this.currentModelDef.keyPoints.find((k) => k.id === pBId);
        if (kpA && kpB) {
          const dir = new THREE.Vector3().subVectors(kpB.position, kpA.position);
          const len = dir.length();
          const mid = new THREE.Vector3().addVectors(kpA.position, kpB.position).multiplyScalar(0.5);
          const hGeo = new THREE.CylinderGeometry(0.0032, 0.0032, len, 10);
          const hMat = new THREE.MeshBasicMaterial({
            color: 0xc084fc,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
          });
          const hMesh = new THREE.Mesh(hGeo, hMat);
          hMesh.position.copy(mid);
          hMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          hMesh.renderOrder = 18;
          hMesh.raycast = StereometryMesh.NOOP_RAYCAST;
          this.selectedAngleLineHighlightMesh = hMesh;
          this.modelContainer.add(hMesh);
        }
      }
    }
  }

  public getSelectedAngleLineId(): string | null {
    return this.selectedAngleLineId;
  }

  public setHoveredAngle(angleId: string | null): void {
    if (this.hoveredAngleId === angleId) return;

    if (this.hoveredAngleId) {
      const prevBadge = this.angleBadges.get(this.hoveredAngleId);
      if (prevBadge && prevBadge.sprite) {
        prevBadge.sprite.scale.set(0.220, 0.110, 1);
      }
      const prevArc = this.anglesGroup.getObjectByName(`ang_arc_${this.hoveredAngleId}`) as THREE.Line;
      if (prevArc) {
        (prevArc.material as THREE.LineBasicMaterial).color.setHex(0xa855f7);
      }
    }

    this.hoveredAngleId = angleId;

    if (angleId && !this.eliminatingAngleIds.has(angleId)) {
      const badge = this.angleBadges.get(angleId);
      if (badge && badge.sprite) {
        badge.sprite.scale.set(0.245, 0.122, 1);
      }
      const arc = this.anglesGroup.getObjectByName(`ang_arc_${angleId}`) as THREE.Line;
      if (arc) {
        (arc.material as THREE.LineBasicMaterial).color.setHex(0xf43f5e);
      }
    }
  }

  public getHoveredAngleId(): string | null {
    return this.hoveredAngleId;
  }

  public addAngle(line1: InteractableLine, line2: InteractableLine): DrawnAngle {
    const existing = this.drawnAngles.find(
      (a) => (a.lineId1 === line1.id && a.lineId2 === line2.id) || (a.lineId1 === line2.id && a.lineId2 === line1.id)
    );
    if (existing) return existing;

    const p1A = line1.posA;
    const p1B = line1.posB;
    const p2A = line2.posA;
    const p2B = line2.posB;

    let vertexPos: THREE.Vector3;
    let d1 = new THREE.Vector3();
    let d2 = new THREE.Vector3();
    let angleType: 'intersecting' | 'skew' | 'parallel' = 'intersecting';

    // 1. 判断是否共端点 (三角形/多面体顶点处的天然角)
    if (p1A.distanceTo(p2A) < 1e-4) {
      vertexPos = p1A.clone();
      d1.subVectors(p1B, p1A).normalize();
      d2.subVectors(p2B, p2A).normalize();
    } else if (p1A.distanceTo(p2B) < 1e-4) {
      vertexPos = p1A.clone();
      d1.subVectors(p1B, p1A).normalize();
      d2.subVectors(p2A, p2B).normalize();
    } else if (p1B.distanceTo(p2A) < 1e-4) {
      vertexPos = p1B.clone();
      d1.subVectors(p1A, p1B).normalize();
      d2.subVectors(p2B, p2A).normalize();
    } else if (p1B.distanceTo(p2B) < 1e-4) {
      vertexPos = p1B.clone();
      d1.subVectors(p1A, p1B).normalize();
      d2.subVectors(p2A, p2B).normalize();
    } else {
      // 2. 异面直线或未共端点相交直线
      const skew = GeometrySolver.computeSkewLineMetrics(p1A, p1B, p2A, p2B);
      angleType = skew.type;
      const u = p1B.clone().sub(p1A);
      const v = p2B.clone().sub(p2A);
      const w0 = p1A.clone().sub(p2A);
      const a = u.dot(u);
      const b = u.dot(v);
      const c = v.dot(v);
      const d = u.dot(w0);
      const e = v.dot(w0);
      const denom = a * c - b * b;
      let sc = 0.5;
      let tc = 0.5;
      if (Math.abs(denom) > 1e-6) {
        sc = THREE.MathUtils.clamp((b * e - c * d) / denom, 0.1, 0.9);
        tc = THREE.MathUtils.clamp((a * e - b * d) / denom, 0.1, 0.9);
      }
      const pt1 = p1A.clone().addScaledVector(u, sc);
      const pt2 = p2A.clone().addScaledVector(v, tc);
      vertexPos = pt1.clone().add(pt2).multiplyScalar(0.5);
      d1 = skew.directionA.clone();
      d2 = skew.directionB.clone();
      // 高中教材规范：空间异面直线夹角定义为锐角/直角 [0, 90°]
      if (d1.dot(d2) < 0 && skew.type !== 'parallel') {
        d2.negate();
      }
    }

    // 计算两条射线夹角
    const cosAngle = THREE.MathUtils.clamp(d1.dot(d2), -1, 1);
    const rad = Math.acos(cosAngle);
    const angleDeg = Math.round((rad * 180 / Math.PI) * 10) / 10;
    const isRightAngle = Math.abs(angleDeg - 90) < 0.6;

    // 建立两条射线所在平面的精确 2D 正交基底 (e1, e2)，保证角标符号与两线严格共面
    const e1 = d1.clone().normalize();
    const w = d2.clone().addScaledVector(e1, -cosAngle);
    let e2: THREE.Vector3;
    if (w.lengthSq() < 1e-6) {
      let temp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(e1.dot(temp)) > 0.9) temp.set(1, 0, 0);
      e2 = new THREE.Vector3().crossVectors(e1, temp).normalize();
    } else {
      e2 = w.normalize();
    }

    // 角平分线方向 (在两条线所在平面内)
    const halfRad = rad * 0.5;
    const bisector = new THREE.Vector3()
      .addScaledVector(e1, Math.cos(halfRad))
      .addScaledVector(e2, Math.sin(halfRad))
      .normalize();

    const R = 0.052 * this.modelScale;
    const badgePos = vertexPos.clone().addScaledVector(bisector, R * 1.62);

    const drawnAngle: DrawnAngle = {
      id: `ang_${line1.id}_${line2.id}`,
      lineId1: line1.id,
      lineId2: line2.id,
      label1: line1.label,
      label2: line2.label,
      angleDeg,
      angleType,
      vertexPos,
      badgePos,
      dir1: d1,
      dir2: d2,
      isRightAngle,
      color: 0x8b5cf6,
    };

    this.drawnAngles.push(drawnAngle);
    this.rebuildAngles();
    AppleHapticAudio.playPop();
    return drawnAngle;
  }

  public removeAngle(id: string): void {
    this.drawnAngles = this.drawnAngles.filter((a) => a.id !== id);
    this.rebuildAngles();
  }

  public clearAllAngles(): void {
    this.drawnAngles = [];
    this.rebuildAngles();
  }

  public getAngles(): DrawnAngle[] {
    return [...this.drawnAngles];
  }

  public isAngleEliminating(id: string): boolean {
    return this.eliminatingAngleIds.has(id);
  }

  private rebuildAngles(): void {
    // 缓存标牌会复用，先移出图层，避免清理时释放 Sprite 共享的几何体。
    for (const badge of this.angleBadges.values()) {
      this.anglesGroup.remove(badge.sprite);
    }
    this.clearGroup(this.anglesGroup);
    const activeAngleIds = new Set<string>();

    for (const ang of this.drawnAngles) {
      activeAngleIds.add(ang.id);
      const V = ang.vertexPos;
      const R = 0.052 * this.modelScale;

      const d1 = ang.dir1;
      const d2 = ang.dir2;
      const cosAngle = THREE.MathUtils.clamp(d1.dot(d2), -1, 1);
      const totalRad = Math.acos(cosAngle);

      // 计算当前两条线形成平面内的精确正交基底 (e1, e2)
      const e1 = d1.clone().normalize();
      const w = d2.clone().addScaledVector(e1, -cosAngle);
      let e2: THREE.Vector3;
      if (w.lengthSq() < 1e-6) {
        let temp = new THREE.Vector3(0, 1, 0);
        if (Math.abs(e1.dot(temp)) > 0.9) temp.set(1, 0, 0);
        e2 = new THREE.Vector3().crossVectors(e1, temp).normalize();
      } else {
        e2 = w.normalize();
      }

      // 1. 构建角标符号 (在两线精确共面内绘制，严禁方向偏差或垂直下垂)
      // 增强对比度与实体感：提供高对比发光弧线 + 半透明扇面 (ang_fan_)，彻底告别单像素虚淡
      if (ang.isRightAngle) {
        // 直角方框 (Perpendicular Square Corner)
        const s = 0.036 * this.modelScale;
        const p1 = V.clone().addScaledVector(e1, s);
        const pCorner = V.clone().addScaledVector(e1, s).addScaledVector(e2, s);
        const p2 = V.clone().addScaledVector(e2, s);

        // 1.1 直角小方块半透明填充面 (清晰高对比度扇形/方块)
        const fanGeo = new THREE.BufferGeometry();
        const fanPositions = new Float32Array([
          V.x, V.y, V.z,
          p1.x, p1.y, p1.z,
          pCorner.x, pCorner.y, pCorner.z,
          p2.x, p2.y, p2.z,
        ]);
        const fanIndices = new Uint16Array([
          0, 1, 2,
          0, 2, 3,
        ]);
        fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPositions, 3));
        fanGeo.setIndex(new THREE.BufferAttribute(fanIndices, 1));
        const fanMat = new THREE.MeshBasicMaterial({
          color: 0x8b5cf6, // 纯正电光紫水晶扇面 (与辅助面体系完全一致)
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        const fanMesh = new THREE.Mesh(fanGeo, fanMat);
        fanMesh.name = `ang_fan_${ang.id}`;
        fanMesh.renderOrder = 7;
        fanMesh.raycast = StereometryMesh.NOOP_RAYCAST;
        this.anglesGroup.add(fanMesh);

        // 1.2 直角高对比轮廓折线 (纯正发光电光紫线)
        const bracketGeo = new THREE.BufferGeometry().setFromPoints([p1, pCorner, p2]);
        const bracketMat = new THREE.LineBasicMaterial({
          color: 0xa855f7, // 鲜亮发光电光紫
          linewidth: 3.0,
          transparent: true,
          opacity: 1.0,
          depthTest: true,
          depthWrite: false,
        });
        const bracketMesh = new THREE.Line(bracketGeo, bracketMat);
        bracketMesh.name = `ang_arc_${ang.id}`;
        bracketMesh.renderOrder = 9;
        bracketMesh.raycast = StereometryMesh.NOOP_RAYCAST;
        this.anglesGroup.add(bracketMesh);
      } else {
        // 经典共面空间圆弧 (Circular Arc)
        const arcPoints: THREE.Vector3[] = [];
        const segments = 24;

        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const currentA = t * totalRad;
          const pt = V.clone()
            .addScaledVector(e1, R * Math.cos(currentA))
            .addScaledVector(e2, R * Math.sin(currentA));
          arcPoints.push(pt);
        }

        // 1.1 半透明空间夹角扇面 (纯正电光紫水晶扇面，一眼可辨)
        const fanGeo = new THREE.BufferGeometry();
        const fanPositions = new Float32Array((segments + 2) * 3);
        const fanIndices = new Uint16Array(segments * 3);

        fanPositions[0] = V.x;
        fanPositions[1] = V.y;
        fanPositions[2] = V.z;

        for (let i = 0; i <= segments; i++) {
          const pt = arcPoints[i];
          const idx = (i + 1) * 3;
          fanPositions[idx] = pt.x;
          fanPositions[idx + 1] = pt.y;
          fanPositions[idx + 2] = pt.z;

          if (i < segments) {
            fanIndices[i * 3] = 0;
            fanIndices[i * 3 + 1] = i + 1;
            fanIndices[i * 3 + 2] = i + 2;
          }
        }

        fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPositions, 3));
        fanGeo.setIndex(new THREE.BufferAttribute(fanIndices, 1));
        const fanMat = new THREE.MeshBasicMaterial({
          color: 0x8b5cf6, // 纯正电光紫水晶扇面
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        const fanMesh = new THREE.Mesh(fanGeo, fanMat);
        fanMesh.name = `ang_fan_${ang.id}`;
        fanMesh.renderOrder = 7;
        fanMesh.raycast = StereometryMesh.NOOP_RAYCAST;
        this.anglesGroup.add(fanMesh);

        // 1.2 高对比饱满圆弧标线 (纯正发光电光紫线)
        const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0xa855f7, // 鲜亮发光电光紫
          linewidth: 3.0,
          transparent: true,
          opacity: 1.0,
          depthTest: true,
          depthWrite: false,
        });
        const arcMesh = new THREE.Line(arcGeo, arcMat);
        arcMesh.name = `ang_arc_${ang.id}`;
        arcMesh.renderOrder = 9;
        arcMesh.raycast = StereometryMesh.NOOP_RAYCAST;
        this.anglesGroup.add(arcMesh);
      }

      // 2. 纯数字排版角度 Sprite (彻底移除气泡背景，与棱长 6, 8, 10 风格一致)
      const degRounded = Math.round(ang.angleDeg * 10) / 10;
      const text = `${degRounded % 1 === 0 ? degRounded.toFixed(0) : degRounded.toFixed(1)}°`;

      let badge = this.angleBadges.get(ang.id);
      if (!badge) {
        let canvas: HTMLCanvasElement | null = null;
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 256;
        }
        const tex = canvas ? new THREE.CanvasTexture(canvas) : (new THREE.Texture() as THREE.CanvasTexture);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.name = `badge_ang_${ang.id}`;
        sprite.scale.set(0.220, 0.110, 1);
        sprite.position.copy(ang.badgePos);
        sprite.renderOrder = 12;
        sprite.raycast = StereometryMesh.NOOP_RAYCAST;

        badge = {
          sprite,
          canvas: canvas!,
          texture: tex,
          material: mat,
          pos: ang.badgePos.clone(),
          text,
          color: ang.color,
        };
        this.angleBadges.set(ang.id, badge);

        if (canvas) {
          this.renderAngleBadgeToCanvas(canvas, text, ang.color);
          tex.needsUpdate = true;
        }
      } else {
        badge.pos.copy(ang.badgePos);
        badge.sprite.position.copy(ang.badgePos);
        if (badge.text !== text || badge.color !== ang.color) {
          badge.text = text;
          badge.color = ang.color;
          if (badge.canvas) {
            this.renderAngleBadgeToCanvas(badge.canvas, text, ang.color);
            badge.texture.needsUpdate = true;
          }
        }
      }
      // 新建和缓存的标牌都必须重新挂回场景，确保多个夹角同时可见。
      this.anglesGroup.add(badge.sprite);
    }

    for (const [id, badge] of this.angleBadges.entries()) {
      if (!activeAngleIds.has(id)) {
        this.anglesGroup.remove(badge.sprite);
        badge.material.dispose();
        badge.texture.dispose();
        this.angleBadges.delete(id);
      }
    }
  }

  private renderAngleBadgeToCanvas(canvas: HTMLCanvasElement, text: string, _color: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;

    // 严禁绘制任何气泡背景、底色或圆角边框！纯数字高对比度排版 (Pure Typography)
    ctx.font = 'bold 112px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Times New Roman", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 纯正电光紫微光晕与深邃黑曜对比描边边缘 (16.0px)，确保任何背景下极其锐利饱满
    ctx.shadowColor = 'rgba(168, 85, 247, 0.85)';
    ctx.shadowBlur = 12;

    ctx.lineWidth = 16.0;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(15, 7, 36, 0.98)';
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeText(text, cx, cy);
    }

    // 纯白高亮字形填充
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
  }

  public startAngleLongPress(angleId: string, hitPoint3D: THREE.Vector3): void {
    if (this.eliminatingAngleIds.has(angleId)) return;
    this.chargingAngleId = angleId;
    this.startSegmentLongPress(`angle_proxy_${angleId}`, hitPoint3D);
  }

  public updateAngleLongPress(angleId: string, progress: number, hitPoint3D?: THREE.Vector3): void {
    if (this.eliminatingAngleIds.has(angleId)) return;
    this.chargingAngleId = angleId;
    this.updateSegmentLongPress(`angle_proxy_${angleId}`, progress, hitPoint3D);

    const badge = this.angleBadges.get(angleId);
    if (badge && badge.sprite) {
      const compress = 1.0 - 0.12 * Math.sin(progress * Math.PI * 0.5);
      badge.sprite.scale.set(0.220 * compress, 0.110 * compress, 1);
    }
  }

  public cancelAngleLongPress(): void {
    const angId = this.chargingAngleId;
    this.chargingAngleId = null;
    this.cancelSegmentLongPress();
    if (angId) {
      const badge = this.angleBadges.get(angId);
      if (badge && badge.sprite) {
        badge.sprite.scale.set(0.220, 0.110, 1);
      }
    }
  }

  public playAngleEliminationAnimation(angleId: string, onComplete: () => void): void {
    const ang = this.drawnAngles.find((a) => a.id === angleId);
    if (!ang) {
      onComplete();
      return;
    }

    this.eliminatingAngleIds.add(angleId);
    if (this.chargingRingSprite) {
      this.chargingRingSprite.visible = false;
    }
    this.chargingAngleId = null;
    this.cancelSegmentLongPress();

    // 播放苹果 Pop
    AppleHapticAudio.playPop();

    const count = 24;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const particleData: Array<{ pos: THREE.Vector3; vel: THREE.Vector3 }> = [];

    const V = ang.vertexPos;
    const B = ang.badgePos;
    const applePalette = [
      new THREE.Color(0xffffff),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xc084fc),
      new THREE.Color(0xf43f5e),
    ];

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const p = V.clone().lerp(B, t);
      p.x += (Math.random() - 0.5) * 0.005;
      p.y += (Math.random() - 0.5) * 0.005;
      p.z += (Math.random() - 0.5) * 0.005;

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        0.10 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.35
      );

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      const col = applePalette[i % applePalette.length];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      particleData.push({ pos: p, vel });
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.010,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const pointsMesh = new THREE.Points(pGeo, pMat);
    pointsMesh.renderOrder = 24;
    pointsMesh.raycast = StereometryMesh.NOOP_RAYCAST;
    this.eliminationEffectsGroup.add(pointsMesh);

    const arcMesh = this.anglesGroup.getObjectByName(`ang_arc_${angleId}`) as THREE.Line;
    const fanMesh = this.anglesGroup.getObjectByName(`ang_fan_${angleId}`) as THREE.Mesh;
    const badge = this.angleBadges.get(angleId);

    this.activeAngleEliminations.push({
      id: angleId,
      pointsMesh,
      particles: particleData,
      badgeSprite: badge?.sprite,
      arcMesh,
      fanMesh,
      progress: 0,
      duration: 0.32,
      onComplete: () => {
        this.eliminatingAngleIds.delete(angleId);
        onComplete();
      },
    });
  }

  private initChargingRing(): void {
    if (typeof document === 'undefined') return;
    this.chargingRingCanvas = document.createElement('canvas');
    this.chargingRingCanvas.width = 512;
    this.chargingRingCanvas.height = 512;
    this.chargingRingTex = new THREE.CanvasTexture(this.chargingRingCanvas);
    this.chargingRingTex.minFilter = THREE.LinearFilter;
    this.chargingRingTex.magFilter = THREE.LinearFilter;

    const ringMat = new THREE.SpriteMaterial({
      map: this.chargingRingTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.chargingRingSprite = new THREE.Sprite(ringMat);
    this.chargingRingSprite.name = 'apple_charging_ring';
    this.chargingRingSprite.scale.set(0.096, 0.096, 1);
    this.chargingRingSprite.renderOrder = 24;
    this.chargingRingSprite.raycast = StereometryMesh.NOOP_RAYCAST;
    this.chargingRingSprite.visible = false;
    this.chargingRingGroup.add(this.chargingRingSprite);
  }

  private renderChargingRingCanvas(progress: number, springScale: number): void {
    if (!this.chargingRingCanvas || !this.chargingRingTex) return;
    const ctx = this.chargingRingCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.chargingRingCanvas.width;
    const h = this.chargingRingCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (springScale <= 0.01) {
      this.chargingRingTex.needsUpdate = true;
      return;
    }

    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = 135;

    ctx.save();
    // 弹性平滑缩放与临界高能微震 (Apple Haptic Tension Tremble)
    const jitter = progress > 0.75 ? (Math.random() - 0.5) * 5.0 * ((progress - 0.75) / 0.25) : 0;
    ctx.translate(cx + jitter, cy + jitter);
    ctx.scale(springScale, springScale);

    // 1. 半透明微晶磨砂底盘 (Glassmorphism Disc)
    ctx.beginPath();
    ctx.arc(0, 0, radius + 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.60)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();

    // 2. 待充灰色轨道环
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 3. 苹果原生荧光蓄力进度弧
    if (progress > 0.005) {
      const startAngle = -Math.PI * 0.5;
      const endAngle = startAngle + progress * Math.PI * 2;

      ctx.save();
      ctx.shadowColor = progress > 0.8 ? '#f43f5e' : '#c084fc';
      ctx.shadowBlur = 24 * Math.min(1.0, progress * 1.5);

      const grad = ctx.createLinearGradient(0, -radius, 0, radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#c084fc');
      grad.addColorStop(1, '#f43f5e');

      ctx.beginPath();
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.lineWidth = 16;
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // 弧头高亮光珠 (Leading Light Bead)
      const leadX = Math.cos(endAngle) * radius;
      const leadY = Math.sin(endAngle) * radius;
      ctx.beginPath();
      ctx.arc(leadX, leadY, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fill();
    }

    // 4. 中心极简消除符号（优雅细胶囊横线 "—"）
    ctx.save();
    const barLen = 44 * (0.85 + 0.15 * Math.sin(progress * Math.PI));
    const barHeight = 8;
    const barRadius = barHeight * 0.5;
    const barColor = progress > 0.8 ? '#f43f5e' : '#ffffff';
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 12 * progress;

    ctx.beginPath();
    ctx.roundRect(-barLen * 0.5, -barHeight * 0.5, barLen, barHeight, barRadius);
    ctx.fill();
    ctx.restore();

    ctx.restore();
    this.chargingRingTex.needsUpdate = true;
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

  public getSegmentBadgesGroup(): THREE.Group {
    return this.segmentBadgesGroup;
  }

  public getAnglesGroup(): THREE.Group {
    return this.anglesGroup;
  }

  public getSegmentBadges(): Map<string, { sprite: THREE.Sprite; text: string; length: number }> {
    const map = new Map<string, { sprite: THREE.Sprite; text: string; length: number }>();
    for (const [id, record] of this.segmentBadges.entries()) {
      map.set(id, { sprite: record.sprite, text: record.text, length: Math.max(1, Math.round(Number(record.text) || 1)) });
    }
    return map;
  }

  private rebuildSegments(): void {
    this.clearGroup(this.segmentsGroup);
    const activeSegIds = new Set<string>();

    for (const seg of this.drawnSegments) {
      activeSegIds.add(seg.id);
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
      lineMesh.userData = { segId: seg.id, baseColor: seg.color };
      lineMesh.renderOrder = 7;
      lineMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
      core.userData = { segId: seg.id, baseColor: seg.color, baseLen: len };
      core.position.copy(mid);
      core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      core.renderOrder = 6;
      core.raycast = StereometryMesh.NOOP_RAYCAST;
      this.segmentsGroup.add(core);

      // 3. 连线完成后持久保留的线段长度标志 (纯三维实体 Sprite，文字清晰悬浮于连线上方，绝不消失)
      const text = String(Math.max(1, Math.round(seg.length)));
      let badge = this.segmentBadges.get(seg.id);
      if (!badge) {
        let canvas: HTMLCanvasElement | null = null;
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          canvas = document.createElement('canvas');
          canvas.width = 768;
          canvas.height = 256;
        }
        const tex = canvas ? new THREE.CanvasTexture(canvas) : (new THREE.Texture() as THREE.CanvasTexture);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.name = `badge_seg_${seg.id}`;
        sprite.scale.set(0.240, 0.080, 1);
        sprite.renderOrder = 9;
        sprite.raycast = StereometryMesh.NOOP_RAYCAST;
        this.segmentBadgesGroup.add(sprite);

        badge = {
          sprite,
          canvas: canvas!,
          texture: tex,
          material: mat,
          posA: kpA.position.clone(),
          posB: kpB.position.clone(),
          text,
          color: seg.color,
        };
        this.segmentBadges.set(seg.id, badge);

        if (canvas) {
          this.renderBadgeToCanvas(canvas, text, seg.color);
          tex.needsUpdate = true;
        }
      } else {
        badge.posA.copy(kpA.position);
        badge.posB.copy(kpB.position);
        if (badge.text !== text || badge.color !== seg.color) {
          badge.text = text;
          badge.color = seg.color;
          if (badge.canvas) {
            this.renderBadgeToCanvas(badge.canvas, text, seg.color);
            badge.texture.needsUpdate = true;
          }
        }
      }

      // 更新姿态与位置
      const activeCam = this.lastCamera;
      if (
        activeCam &&
        typeof (activeCam as any).matrixWorldInverse !== 'undefined' &&
        typeof (activeCam as any).matrixWorld !== 'undefined'
      ) {
        this.updateSegmentBadgePose(badge.sprite, badge.posA, badge.posB, activeCam);
      } else {
        badge.sprite.position.copy(mid).add(new THREE.Vector3(0, 0.032, 0));
        (badge.sprite.material as THREE.SpriteMaterial).rotation = 0;
      }
    }

    // 清理已删除线段的标牌
    for (const [id, badge] of this.segmentBadges.entries()) {
      if (!activeSegIds.has(id)) {
        this.segmentBadgesGroup.remove(badge.sprite);
        badge.material.dispose();
        badge.texture.dispose();
        this.segmentBadges.delete(id);
      }
    }

    this.rebuildAuxiliaryFaces();
  }

  private rebuildAuxiliaryFaces(): void {
    this.clearGroup(this.auxFacesGroup);
    this.activeAuxFaceAnimations = [];
    this.auxiliaryFaces = AuxiliaryFaceSolver.findAuxiliaryFaces(
      this.drawnSegments,
      this.currentModelDef.keyPoints
    );

    if (this.auxiliaryFaces.length === 0) {
      this.knownAuxFaceIds.clear();
      return;
    }

    const currentFaceIds = new Set<string>();
    for (const face of this.auxiliaryFaces) {
      currentFaceIds.add(face.id);
      const verts = face.vertices3D;
      if (!verts || verts.length < 3) continue;

      const faceColor = typeof face.color === 'number' ? face.color : 0x7c3aed;
      const isNewlyCreated = !this.knownAuxFaceIds.has(face.id);
      this.knownAuxFaceIds.add(face.id);

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
        opacity: isNewlyCreated ? 0.30 : 0.50,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const faceMesh = new THREE.Mesh(fillGeo, faceMat);
      faceMesh.name = `aux_face_${face.id}`;
      faceMesh.renderOrder = 4;
      faceMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
        opacity: isNewlyCreated ? 0.45 : 0.95,
        depthWrite: false,
      });
      const contourLoop = new THREE.LineLoop(contourGeo, contourMat);
      contourLoop.name = `aux_face_contour_${face.id}`;
      contourLoop.renderOrder = 6;
      contourLoop.raycast = StereometryMesh.NOOP_RAYCAST;
      this.auxFacesGroup.add(contourLoop);

      if (isNewlyCreated) {
        this.activeAuxFaceAnimations.push({
          faceMat,
          contourMat,
          progress: 0,
          duration: 0.24,
        });
      }

      // 3. 保持面部纯净：面上不附加气泡标记，保持清晰视线
    }

    for (const knownId of Array.from(this.knownAuxFaceIds)) {
      if (!currentFaceIds.has(knownId)) {
        this.knownAuxFaceIds.delete(knownId);
      }
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
    line.raycast = StereometryMesh.NOOP_RAYCAST;
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
    fillMesh.raycast = StereometryMesh.NOOP_RAYCAST;
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
      shaft.raycast = StereometryMesh.NOOP_RAYCAST;

      // 锥体箭头
      const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
      const cone = new THREE.Mesh(coneGeo, shaftMat);
      cone.position.y = axisLength - coneHeight / 2;
      cone.raycast = StereometryMesh.NOOP_RAYCAST;

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
    sprite.raycast = StereometryMesh.NOOP_RAYCAST;
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
      circumMesh.raycast = StereometryMesh.NOOP_RAYCAST;

      const ringGeo = new THREE.RingGeometry(analysis.circumRadius * 0.995, analysis.circumRadius * 1.005, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, opacity: 0.25, transparent: true });
      const equator = new THREE.Mesh(ringGeo, ringMat);
      equator.rotation.x = Math.PI / 2;
      equator.raycast = StereometryMesh.NOOP_RAYCAST;
      circumMesh.add(equator);

      this.spheresGroup.add(circumMesh);
    }

    if (this.currentOptions.showInSphere && analysis.hasInSphere) {
      const inGeo = new THREE.SphereGeometry(analysis.inRadius, 28, 20);
      const inMesh = new THREE.Mesh(inGeo, this.inSphereMat);
      inMesh.position.copy(analysis.inCenter);
      inMesh.raycast = StereometryMesh.NOOP_RAYCAST;

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
      line.raycast = StereometryMesh.NOOP_RAYCAST;
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
    frontScreen.raycast = StereometryMesh.NOOP_RAYCAST;
    this.threeViewsGroup.add(frontScreen);

    const sideScreen = new THREE.Mesh(planeGeo, screenMat);
    sideScreen.rotation.y = Math.PI / 2;
    sideScreen.position.set(-r, 0, 0);
    sideScreen.raycast = StereometryMesh.NOOP_RAYCAST;
    this.threeViewsGroup.add(sideScreen);

    const topScreen = new THREE.Mesh(planeGeo, screenMat);
    topScreen.rotation.x = -Math.PI / 2;
    topScreen.position.set(0, -r, 0);
    topScreen.raycast = StereometryMesh.NOOP_RAYCAST;
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

    const frontLines = new THREE.LineSegments(frontGeo, gridHelperMat);
    frontLines.raycast = StereometryMesh.NOOP_RAYCAST;
    const sideLines = new THREE.LineSegments(sideGeo, gridHelperMat);
    sideLines.raycast = StereometryMesh.NOOP_RAYCAST;
    const topLines = new THREE.LineSegments(topGeo, gridHelperMat);
    topLines.raycast = StereometryMesh.NOOP_RAYCAST;

    this.threeViewsGroup.add(frontLines);
    this.threeViewsGroup.add(sideLines);
    this.threeViewsGroup.add(topLines);
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
          if (this.snapHoverBead) {
            this.snapHoverBead.visible = true;
            this.snapHoverBead.scale.setScalar(0.76);
          }
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
          const sMat = this.snapCursorSprite.material as THREE.SpriteMaterial;
          sMat.color.setHex(hex);
          sMat.opacity = 0.72;
          this.snapCursorSprite.scale.set(0.080, 0.080, 1);
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
      (this.snapCursorSprite.material as THREE.SpriteMaterial).opacity = 1.0;
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

  public hasHoveredKeyPoint(): boolean {
    return this.hoveredKeyPointId !== null;
  }

  /**
   * 严格判定射线命中的 Object3D 是否属于立体几何模型实体表面或关键点锚点珠。
   * 过滤一切辅助线、预览引导线、字牌精灵、三视图幕布与外接球，彻底杜绝模型外部误判。
   */
  public isSurfaceObject(obj: THREE.Object3D | null | undefined): boolean {
    let cur: THREE.Object3D | null | undefined = obj;
    while (cur) {
      if (cur === this.solidGroup || cur === this.keyPointsGroup) {
        return true;
      }
      if (cur === this.unfoldGroup) {
        return obj instanceof THREE.Mesh;
      }
      if (cur === this.modelContainer || cur === this.group) {
        return false;
      }
      cur = cur.parent;
    }
    return false;
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

  private readonly hitTestRaycaster = new THREE.Raycaster();

  public isRayHittingModel(ray: THREE.Ray): boolean {
    if (!this.modelContainer) return false;
    this.modelContainer.updateMatrixWorld(true);
    const targetMeshes =
      this.solidGroup && this.solidGroup.visible && this.solidGroup.children.length > 0
        ? this.solidGroup.children
        : this.unfoldGroup.children;
    if (targetMeshes && targetMeshes.length > 0) {
      this.hitTestRaycaster.ray.copy(ray);
      const hits = this.hitTestRaycaster.intersectObjects(targetMeshes, true);
      return hits.length > 0;
    }
    return false;
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
    const unitScale = this.numericalDimensions?.a ?? 10;
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
      sprite.raycast = StereometryMesh.NOOP_RAYCAST;
      this.selectedMarkersGroup.add(sprite);
      this.selectedBeaconSprites.set(id, sprite);
    }
  }

  private applyPreviewWirePose(startPos: THREE.Vector3, effectiveEndPos: THREE.Vector3, isSnapped: boolean): number {
    const dir = new THREE.Vector3().subVectors(effectiveEndPos, startPos);
    const len = dir.length();
    if (len < 1e-4) return 0;

    const mid = new THREE.Vector3().addVectors(startPos, effectiveEndPos).multiplyScalar(0.5);
    const radiusScale = isSnapped ? 1 : 0.75;

    if (this.previewPipeMesh) {
      const pMat = this.previewPipeMesh.material as THREE.MeshBasicMaterial;
      pMat.opacity = isSnapped ? 0.96 : 0.44;
      this.previewPipeMesh.scale.set(radiusScale, len, radiusScale);
      this.previewPipeMesh.position.copy(mid);
      this.previewPipeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }

    if (this.previewLineMesh) {
      const posAttr = this.previewLineMesh.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, startPos.x, startPos.y, startPos.z);
      posAttr.setXYZ(1, effectiveEndPos.x, effectiveEndPos.y, effectiveEndPos.z);
      posAttr.needsUpdate = true;
      (this.previewLineMesh.material as THREE.LineBasicMaterial).opacity = isSnapped ? 0.95 : 0.56;
    }

    if (this.previewStartBead) {
      this.previewStartBead.position.copy(startPos);
    }
    if (this.previewEndBead) {
      this.previewEndBead.position.copy(effectiveEndPos);
      this.previewEndBead.scale.setScalar(isSnapped ? 1.06 : 0.66);
    }

    return len;
  }

  public updatePreviewWire(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    color = 0x7c3aed,
    badgeText?: string,
    camera?: THREE.Camera,
    options?: { snapped?: boolean; smooth?: boolean }
  ): void {
    const isSnapped = options?.snapped ?? true;
    const useSmooth = Boolean(options?.smooth) && !isSnapped;
    this.previewIsSnapped = isSnapped;
    this.previewUseSmoothing = useSmooth;
    this.previewColor = color;

    if (!this.targetPreviewEndPos) {
      this.targetPreviewEndPos = new THREE.Vector3();
    }
    this.targetPreviewEndPos.copy(endPos);

    if (
      useSmooth &&
      this.smoothedPreviewEndPos &&
      this.lastPreviewStartPos &&
      this.lastPreviewStartPos.distanceToSquared(startPos) < 1e-6 &&
      this.previewSegmentGroup.visible
    ) {
      this.smoothedPreviewEndPos.lerp(endPos, 0.44);
    } else {
      if (!this.smoothedPreviewEndPos) {
        this.smoothedPreviewEndPos = new THREE.Vector3();
      }
      this.smoothedPreviewEndPos.copy(endPos);
    }

    const effectiveEndPos = this.smoothedPreviewEndPos;
    const rawLen = startPos.distanceTo(endPos);
    if (rawLen < 1e-4) {
      this.previewSegmentGroup.visible = false;
      return;
    }

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
      this.previewPipeMesh.raycast = StereometryMesh.NOOP_RAYCAST;
      this.previewSegmentGroup.add(this.previewPipeMesh);
    }

    const pMat = this.previewPipeMesh.material as THREE.MeshBasicMaterial;
    if (pMat && typeof pMat.color?.setHex === 'function') {
      pMat.color.setHex(color);
    }

    // 1.1 原生 3D 预览线段（真实几何线条）
    if (!this.previewLineMesh) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([startPos, effectiveEndPos]);
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
      this.previewLineMesh.raycast = StereometryMesh.NOOP_RAYCAST;
      this.previewSegmentGroup.add(this.previewLineMesh);
    } else {
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
      this.previewStartBead.raycast = StereometryMesh.NOOP_RAYCAST;
      this.previewSegmentGroup.add(this.previewStartBead);
    }

    if (!this.previewEndBead) {
      const beadGeo = new THREE.SphereGeometry(0.0052, 12, 12);
      const beadMat = new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        emissive: 0x7c3aed,
        emissiveIntensity: 0.9,
      });
      this.previewEndBead = new THREE.Mesh(beadGeo, beadMat);
      this.previewEndBead.renderOrder = 7;
      this.previewEndBead.raycast = StereometryMesh.NOOP_RAYCAST;
      this.previewSegmentGroup.add(this.previewEndBead);
    }
    (this.previewEndBead.material as THREE.MeshStandardMaterial).color.setHex(color);
    (this.previewEndBead.material as THREE.MeshStandardMaterial).emissive.setHex(color);

    const effectiveLen = this.applyPreviewWirePose(startPos, effectiveEndPos, isSnapped);
    if (effectiveLen < 1e-4) {
      this.previewSegmentGroup.visible = false;
      return;
    }

    // 3. 沿连线对齐的纯文本度量指示器（仅在锁定有效关键点或显式传入标牌时显示，半空自由牵引时不悬浮杂乱数字）
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
      this.previewBadgeSprite.raycast = StereometryMesh.NOOP_RAYCAST;
      this.previewSegmentGroup.add(this.previewBadgeSprite);
    }

    this.lastPreviewStartPos = startPos.clone();
    this.lastPreviewEndPos = effectiveEndPos.clone();

    if (isSnapped) {
      const labelToDisplay = badgeText || this.formatNormalizedDistance(rawLen);
      if (this.previewBadgeCanvas && this.previewBadgeTex && this.lastPreviewBadgeKey !== `${labelToDisplay}_${color}`) {
        this.lastPreviewBadgeKey = `${labelToDisplay}_${color}`;
        this.renderBadgeToCanvas(this.previewBadgeCanvas, labelToDisplay, color);
        this.previewBadgeTex.needsUpdate = true;
      }

      const cam = camera || this.lastCamera;
      if (cam && typeof (cam as any).matrixWorldInverse !== 'undefined' && typeof (cam as any).matrixWorld !== 'undefined') {
        this.updatePreviewBadgePose(startPos, effectiveEndPos, cam);
      } else {
        const mid = new THREE.Vector3().addVectors(startPos, effectiveEndPos).multiplyScalar(0.5);
        this.previewBadgeSprite.position.copy(mid).add(new THREE.Vector3(0, 0.032, 0));
        (this.previewBadgeSprite.material as THREE.SpriteMaterial).rotation = 0;
      }
      this.previewBadgeSprite.visible = true;
    } else {
      this.previewBadgeSprite.visible = false;
    }

    this.previewSegmentGroup.visible = true;
  }

  /**
   * 将标牌文本清晰绘制到 Canvas 纹理中（纯三维实体 Sprite，文字加大且具备深色轮廓描边）。
   */
  private renderBadgeToCanvas(canvas: HTMLCanvasElement, text: string, color: number): void {
    const bctx = canvas.getContext('2d');
    if (!bctx) return;
    bctx.clearRect(0, 0, canvas.width, canvas.height);
    const isPurple = color === 0x7c3aed || color === 0x8b5cf6 || color === 0x6d28d9;
    const isEmerald = color === 0x10b981 || color === 0x38d9a9;

    bctx.font = 'bold 120px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';

    bctx.lineWidth = 16.0;
    bctx.lineJoin = 'round';
    bctx.strokeStyle = 'rgba(8, 14, 26, 0.95)';
    if (typeof bctx.strokeText === 'function') {
      bctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    }

    bctx.fillStyle = isPurple ? '#c4b5fd' : (isEmerald ? '#34d399' : '#ffffff');
    bctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  /**
   * 将连线两端经由透视投影矩阵精确映射到屏幕像素坐标系，
   * 消除三维近大远小引起的视角斜率偏差，保证字与线始终平齐。
   */
  private updateSegmentBadgePose(
    sprite: THREE.Sprite,
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    cam: THREE.Camera
  ): void {
    if (!sprite) return;
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
      sprite.position.copy(targetLocal);
    } else {
      sprite.position.copy(mid).add(new THREE.Vector3(0, 0.032, 0));
    }

    (sprite.material as THREE.SpriteMaterial).rotation = angle;
  }

  private updatePreviewBadgePose(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    cam: THREE.Camera
  ): void {
    if (this.previewBadgeSprite) {
      this.updateSegmentBadgePose(this.previewBadgeSprite, startPos, endPos, cam);
    }
  }

  public clearPreviewWire(): void {
    this.previewSegmentGroup.visible = false;
    this.lastPreviewStartPos = null;
    this.lastPreviewEndPos = null;
    this.smoothedPreviewEndPos = null;
    this.targetPreviewEndPos = null;
    this.previewUseSmoothing = false;
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
   * 3. 更新光学聚焦准星、引导游丝平滑阻尼、辅助面渐显与连线生长动画
   */
  public update(delta: number, elapsed?: number, camera?: THREE.Camera): void {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (camera) {
      this.lastCamera = camera;
    }
    const t = elapsed !== undefined ? elapsed : (this.hoverTime += safeDelta);
    this.hoverTime = t;

    // 动态调整悬浮高度，确保模型无论如何旋转或缩放均不穿透桌面
    this.updateBaseHoverHeight();

    // 微悬浮呼吸律动（平滑微幅上下浮动）
    const hoverOffset = Math.sin(t * 1.5) * 0.004;
    this.modelContainer.position.y = this.baseHoverY + hoverOffset;

    // 从当前摄像机视角动态更新可见实棱与遮挡虚线
    this.updateEdgeVisibility(camera);

    // 光学微距定焦准星动画：由 0.080 平滑收敛锁定至 0.062，稳重无旋转无闪烁
    if (this.snapCursorGroup.visible) {
      this.snapEnterTime = Math.min(0.12, this.snapEnterTime + safeDelta);
      const focusProgress = this.snapEnterTime / 0.12;
      const focusEase = 1 - Math.pow(1 - focusProgress, 3);

      if (this.snapCursorSprite) {
        const reticleScale = THREE.MathUtils.lerp(0.080, 0.062, focusEase);
        this.snapCursorSprite.scale.set(reticleScale, reticleScale, 1);
        const sMat = this.snapCursorSprite.material as THREE.SpriteMaterial;
        sMat.rotation = 0;
        sMat.opacity = THREE.MathUtils.lerp(0.72, 0.98, focusEase);
      }

      if (this.snapRippleSprite) {
        this.snapRippleSprite.visible = false;
      }

      if (this.snapHoverBead && this.snapHoverBead.visible) {
        this.snapHoverBead.scale.setScalar(THREE.MathUtils.lerp(0.76, 1.04, focusEase));
      }

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

    // 选中起点信标：极其克制的微光静稳律动
    const beaconScale = 0.0256 + Math.sin(t * 2.2) * 0.0012;
    for (const sprite of this.selectedBeaconSprites.values()) {
      sprite.scale.set(beaconScale, beaconScale, 1);
    }

    // 未吸附自由引导游丝的逐帧指数平滑追赶，消除手势微颤
    if (
      this.previewSegmentGroup.visible &&
      this.previewUseSmoothing &&
      !this.previewIsSnapped &&
      this.lastPreviewStartPos &&
      this.smoothedPreviewEndPos &&
      this.targetPreviewEndPos
    ) {
      const wireAlpha = 1 - Math.exp(-26 * safeDelta);
      this.smoothedPreviewEndPos.lerp(this.targetPreviewEndPos, wireAlpha);
      this.lastPreviewEndPos = this.smoothedPreviewEndPos.clone();
      this.applyPreviewWirePose(this.lastPreviewStartPos, this.smoothedPreviewEndPos, false);
    }

    // 动态刷新预览连线标牌与持久线段长度标牌姿态（确保任何旋转视角下文字与连线严密平齐）
    const activeCam = camera || this.lastCamera;
    if (activeCam) {
      this.lastCamera = activeCam;
      if (this.previewSegmentGroup.visible && this.previewIsSnapped && this.lastPreviewStartPos && this.lastPreviewEndPos) {
        this.updatePreviewBadgePose(this.lastPreviewStartPos, this.lastPreviewEndPos, activeCam);
      }
      if (
        typeof (activeCam as any).matrixWorldInverse !== 'undefined' &&
        typeof (activeCam as any).matrixWorld !== 'undefined'
      ) {
        for (const badge of this.segmentBadges.values()) {
          this.updateSegmentBadgePose(badge.sprite, badge.posA, badge.posB, activeCam);
        }
      }
    }

    // 更新新闭合辅助面的丝滑水晶渐显动画
    for (let i = this.activeAuxFaceAnimations.length - 1; i >= 0; i--) {
      const fAnim = this.activeAuxFaceAnimations[i];
      fAnim.progress += safeDelta / fAnim.duration;
      const p = Math.min(fAnim.progress, 1.0);
      const ease = 1 - Math.pow(1 - p, 3);
      fAnim.faceMat.opacity = THREE.MathUtils.lerp(0.30, 0.50, ease);
      fAnim.contourMat.opacity = THREE.MathUtils.lerp(0.45, 0.95, ease);
      if (p >= 1.0) {
        this.activeAuxFaceAnimations.splice(i, 1);
      }
    }

    // 更新空间连线生成动画
    for (let i = this.activeSegmentAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeSegmentAnimations[i];
      anim.progress += safeDelta / anim.duration;
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

    // 更新苹果原生连线消散粒子与解体动画
    for (let i = this.activeEliminations.length - 1; i >= 0; i--) {
      const anim = this.activeEliminations[i];
      anim.progress += safeDelta / anim.duration;
      const p = Math.min(anim.progress, 1.0);

      // 1. 粒子运动与渐隐
      if (anim.pointsMesh && anim.particles) {
        const posAttr = anim.pointsMesh.geometry.attributes.position as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;
        for (let j = 0; j < anim.particles.length; j++) {
          const pt = anim.particles[j];
          pt.pos.addScaledVector(pt.vel, safeDelta);
          pt.vel.multiplyScalar(0.91); // 柔性空气阻力
          positions[j * 3] = pt.pos.x;
          positions[j * 3 + 1] = pt.pos.y;
          positions[j * 3 + 2] = pt.pos.z;
        }
        posAttr.needsUpdate = true;
        const pMat = anim.pointsMesh.material as THREE.PointsMaterial;
        pMat.opacity = Math.max(0, 1.0 - Math.pow(p, 1.6));
      }

      // 2. 线芯膨胀后急速回缩
      if (anim.coreMesh && anim.lineMesh) {
        if (p < 0.16) {
          const pop = 1.0 + (p / 0.16) * 0.45;
          anim.coreMesh.scale.set(pop, 1.0, pop);
        } else {
          const collapse = 1.45 * (1.0 - (p - 0.16) / 0.84);
          const lenShrink = Math.max(0.001, 1.0 - Math.pow((p - 0.16) / 0.84, 2));
          anim.coreMesh.scale.set(Math.max(0, collapse), lenShrink, Math.max(0, collapse));
          const op = Math.max(0, 1.0 - (p - 0.16) / 0.84);
          (anim.coreMesh.material as THREE.MeshBasicMaterial).opacity = op;
          (anim.lineMesh.material as THREE.LineBasicMaterial).opacity = op;
        }
      }

      // 3. 标牌 Sprite 弹跳消散
      if (anim.badgeSprite && anim.badgeBaseScale) {
        let s = 1.0;
        if (p < 0.18) {
          s = 1.0 + (p / 0.18) * 0.35;
        } else {
          s = 1.35 * Math.max(0, 1.0 - (p - 0.18) / 0.82);
        }
        anim.badgeSprite.scale.set(anim.badgeBaseScale.x * s, anim.badgeBaseScale.y * s, 1);
        (anim.badgeSprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1.0 - p * 1.5);
        (anim.badgeSprite.material as THREE.SpriteMaterial).rotation += safeDelta * 3.2;
      }

      // 4. 关联辅助面平滑晶体解体
      if (anim.affectedFaceMeshes) {
        for (const aff of anim.affectedFaceMeshes) {
          const fMat = aff.mesh.material as THREE.MeshStandardMaterial;
          fMat.emissiveIntensity = THREE.MathUtils.lerp(0.65, 0.0, p);
          fMat.opacity = THREE.MathUtils.lerp(aff.origFaceOpacity, 0.0, Math.pow(p, 1.5));
          if (aff.contour) {
            const cMat = aff.contour.material as THREE.LineBasicMaterial;
            cMat.opacity = THREE.MathUtils.lerp(aff.origContourOpacity, 0.0, p);
          }
        }
      }

      // 5. 动画完成收尾
      if (p >= 1.0) {
        if (anim.pointsMesh) {
          this.eliminationEffectsGroup.remove(anim.pointsMesh);
          anim.pointsMesh.geometry.dispose();
          (anim.pointsMesh.material as THREE.Material).dispose();
        }
        this.activeEliminations.splice(i, 1);
        this.eliminatingSegmentIds.delete(anim.id);
        anim.onComplete?.();
      }
    }

    // 更新长按蓄力环的弹性平滑淡出
    if (!this.chargingSegmentId && this.chargingSpringScale > 0.001) {
      this.chargingSpringScale += (0 - this.chargingSpringScale) * 0.26;
      if (this.chargingSpringScale <= 0.01) {
        this.chargingSpringScale = 0;
        if (this.chargingRingSprite) {
          this.chargingRingSprite.visible = false;
        }
      } else {
        this.renderChargingRingCanvas(0, this.chargingSpringScale);
      }
    }

    // 更新夹角标注消散粒子与坍缩动画
    for (let i = this.activeAngleEliminations.length - 1; i >= 0; i--) {
      const anim = this.activeAngleEliminations[i];
      anim.progress += safeDelta / anim.duration;
      const p = Math.min(anim.progress, 1.0);

      if (anim.pointsMesh && anim.particles) {
        const posAttr = anim.pointsMesh.geometry.attributes.position as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;
        for (let j = 0; j < anim.particles.length; j++) {
          const pt = anim.particles[j];
          pt.pos.addScaledVector(pt.vel, safeDelta);
          pt.vel.multiplyScalar(0.91);
          positions[j * 3] = pt.pos.x;
          positions[j * 3 + 1] = pt.pos.y;
          positions[j * 3 + 2] = pt.pos.z;
        }
        posAttr.needsUpdate = true;
        (anim.pointsMesh.material as THREE.PointsMaterial).opacity = Math.max(0, 1.0 - Math.pow(p, 1.6));
      }

      if (anim.arcMesh) {
        (anim.arcMesh.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1.0 - p);
      }
      if (anim.fanMesh) {
        (anim.fanMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.18 * (1.0 - p));
      }

      if (anim.badgeSprite) {
        let s = 1.0;
        if (p < 0.18) {
          s = 1.0 + (p / 0.18) * 0.35;
        } else {
          s = 1.35 * Math.max(0, 1.0 - (p - 0.18) / 0.82);
        }
        anim.badgeSprite.scale.set(0.180 * s, 0.090 * s, 1);
        (anim.badgeSprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1.0 - p * 1.5);
        (anim.badgeSprite.material as THREE.SpriteMaterial).rotation += safeDelta * 3.5;
      }

      if (p >= 1.0) {
        if (anim.pointsMesh) {
          this.eliminationEffectsGroup.remove(anim.pointsMesh);
          anim.pointsMesh.geometry.dispose();
          (anim.pointsMesh.material as THREE.Material).dispose();
        }
        this.activeAngleEliminations.splice(i, 1);
        this.eliminatingAngleIds.delete(anim.id);
        anim.onComplete?.();
      }
    }
  }

  public dispose(): void {
    this.clearGroup(this.group);
    this.clearGroup(this.modelContainer);
    this.clearGroup(this.stagePresentationGroup);
    this.clearGroup(this.auxFacesGroup);
    this.clearGroup(this.eliminationEffectsGroup);
    this.clearGroup(this.chargingRingGroup);
    this.clearGroup(this.anglesGroup);
    for (const badge of this.angleBadges.values()) {
      badge.material.dispose();
      badge.texture.dispose();
    }
    this.angleBadges.clear();
    if (this.chargingRingSprite) {
      this.chargingRingSprite.material.dispose();
    }
    if (this.chargingRingTex) {
      this.chargingRingTex.dispose();
    }
    this.auxiliaryFaces = [];
    for (const badge of this.segmentBadges.values()) {
      badge.material.dispose();
      badge.texture.dispose();
    }
    this.segmentBadges.clear();
    this.clearGroup(this.segmentBadgesGroup);
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
