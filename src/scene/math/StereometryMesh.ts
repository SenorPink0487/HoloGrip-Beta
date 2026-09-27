import * as THREE from 'three';
import {
  GeometrySolver,
  type HighSchoolModelType,
  type PolyhedronModelDef,
  type KeyPoint,
  type CrossSectionResult,
  type SphereAnalysisResult,
} from './GeometrySolver.ts';

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

  // Root sub-containers
  public readonly modelContainer = new THREE.Group();

  // Subgroups attached to modelContainer
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
  private hitEnvelopeMesh: THREE.Mesh | null = null;
  private modelScale = 1.0;

  // Active birth animations for newly connected spatial segments
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

  // Reusable dynamic preview wire resources (Zero-Allocation 120 FPS)
  private previewPipeMesh: THREE.Mesh | null = null;
  private previewStartBead: THREE.Mesh | null = null;
  private previewEndBead: THREE.Mesh | null = null;
  private previewBadgeSprite: THREE.Sprite | null = null;
  private previewBadgeCanvas: HTMLCanvasElement | null = null;
  private previewBadgeTex: THREE.CanvasTexture | null = null;
  private lastPreviewBadgeKey = '';

  // Focus Halo / Reticle Billboard Sprite (No clipping, camera-facing)
  private snapCursorSprite: THREE.Sprite | null = null;
  private selectedBeaconSprites: Map<string, THREE.Sprite> = new Map();
  private lastHoveredMeshId: string | null = null;
  private lastSelectedIds: string[] = [];

  // Current Model State
  private currentModelDef: PolyhedronModelDef;
  private recognizedModel: PolyhedronModelDef | null = null;
  private currentOptions: StereometryDisplayOptions;
  private currentCrossSection: CrossSectionResult | null = null;
  private currentSphereAnalysis: SphereAnalysisResult;
  private drawnSegments: DrawnSegment[] = [];

  // Keypoints cache for raycasting
  private keyPointMeshes: Map<string, THREE.Mesh> = new Map();
  private hoveredKeyPointId: string | null = null;

  // Floating / Levitation state (pure floating 3D geometry in mid-air)
  public baseHoverY = 0.22;
  public readonly minClearance = 0.055; // Minimum 5.5cm clearance above tabletop to prevent penetration
  private hoverTime = 0;

  // Stage presentation group (projection rings, contact shadow, accent lighting)
  private stagePresentationGroup = new THREE.Group();

  // Shared reusable geometries (Refined micro pips & precision struts)
  private sharedVertexGeo = new THREE.SphereGeometry(0.0048, 16, 16);
  private sharedMidpointGeo = new THREE.SphereGeometry(0.0036, 12, 12);
  private sharedThirdGeo = new THREE.SphereGeometry(0.0032, 12, 12);
  private sharedCenterGeo = new THREE.SphereGeometry(0.0032, 12, 12);
  private unitCylinderGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1.0, 16);

  // Materials - Apple VisionOS Crystal Glass Aesthetics (Depth-Tested Hidden Lines)
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

  // Pearl Node Materials (High-contrast spatial pearl anchors)
  private vertexNodeMat: THREE.MeshStandardMaterial;
  private midpointNodeMat: THREE.MeshStandardMaterial;
  private thirdNodeMat: THREE.MeshStandardMaterial;
  private centerNodeMat: THREE.MeshStandardMaterial;
  private originNodeMat: THREE.MeshStandardMaterial;

  // Analytical edge-face adjacency cache for mathematically pure hidden line occlusion
  private edgeAdjacencies: Array<{
    edgeIndex: number;
    i1: number;
    i2: number;
    faceIndices: number[];
  }> = [];
  private solidEdgesMesh: THREE.LineSegments | null = null;
  private dashedEdgesMesh: THREE.LineSegments | null = null;
  private solidStrutsMesh: THREE.InstancedMesh | null = null;

  // Unfolding animated face groups cache
  private unfoldingFaceGroups: THREE.Group[] = [];

  constructor() {
    this.group.name = 'StereometryMesh';
    this.initMaterials();
    this.assembleGroups();

    // Default configuration: standard high school cube, canonical textbook oblique view
    this.currentOptions = {
      modelType: 'cube',
      dimensions: { a: 0.58, b: 0.58, c: 0.58 },
      showKeyPoints: true,
      showMidpoints: false,      // NEVER cluttered with midpoints by default
      showFaceCenters: false,    // NEVER cluttered with face centers by default
      showLabels: true,          // Crisp SF Pro vertex billboard labels (A, B, C, D, ...)
      showDashedLines: false,    // Default to solid lines for all edges (user request: 被遮挡的棱也用实线)
      showCoordinateSystem: false, // Clean display by default, toggleable in vectors tab
      showCircumSphere: false,
      showInSphere: false,
      showEmbeddingBox: false,
      showThreeViews: false,
      unfoldProgress: 0,
      clippingEnabled: false,
      explodeDistance: 0,
    };

    this.currentModelDef = GeometrySolver.createModel('cube', this.currentOptions.dimensions);
    this.currentSphereAnalysis = GeometrySolver.computeSphereAnalysis('cube', this.currentOptions.dimensions);

    this.rebuildAll();
    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;
  }

  private initMaterials(): void {
    // 1. Depth mask pass: writes front face depth without writing color
    // This allows occluded rear edges to accurately test with GreaterDepth!
    this.depthMaskMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    // 1.5 Back-face optical refraction layer for crystal volumetric depth (luminous deep azure)
    this.solidBackMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0369a1,            // Luminous Deep Azure (not muddy charcoal black)
      roughness: 0.15,
      metalness: 0.10,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.14,              // Soft crystal interior refraction
      side: THREE.BackSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      emissive: 0x0284c7,
      emissiveIntensity: 0.08,
    });

    // 2. Translucent vibrant optical crystal glass front faces (Apple VisionOS Azure Crystal)
    this.solidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,            // Vibrant Luminous Azure Crystal
      roughness: 0.08,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.22,              // Crisp optical transparency (interior lines shine through)
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
      color: 0x0ea5e9,            // Vivid Sky/Cyan Crystal
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

    // 3. Precision 3D Cylindrical Edge Struts (Polished Cobalt-Titanium micro-struts)
    this.strutMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,            // Precision Cobalt-Titanium
      metalness: 0.50,            // Soft satin sheen (no harsh metallic glare)
      roughness: 0.35,
      emissive: 0x0284c7,
      emissiveIntensity: 0.40,
      transparent: true,
      opacity: 0.92,
    });

    // 3.1 Inner razor-sharp glowing core line
    this.solidEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,            // Electric Cyan Core Line
      linewidth: 2.5,
      transparent: true,
      opacity: 0.95,
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
    });

    // 4. Hidden occluded edges: textbook clean dashed wireframe (Warm Amber Gold)
    this.dashedEdgeMaterial = new THREE.LineDashedMaterial({
      color: 0xf59e0b,            // Warm Amber Gold (high contrast against cyan and light background)
      dashSize: 0.015,
      gapSize: 0.008,
      depthFunc: THREE.LessEqualDepth, // Analytical occlusion handles back-face: no GreaterDepth hack needed
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

    // 5. Cross section: vibrant luminous coral rose frosted glass with crimson edge
    this.crossSectionFillMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,            // Vibrant Luminous Coral Rose
      roughness: 0.16,
      metalness: 0.10,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      emissive: 0xe11d48,
      emissiveIntensity: 0.35,
    });

    this.crossSectionLineMat = new THREE.LineBasicMaterial({
      color: 0xff1744,            // Vivid Crimson Neon Edge
      linewidth: 3,
    });

    // 6. Spheres: refined monochrome holographic forcefields
    this.circumSphereMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,            // Translucent Royal Violet
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
      color: 0x10b981,            // Translucent Emerald
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0x059669,
      emissiveIntensity: 0.15,
    });

    // 7. Data Nodes (High-contrast spatial pearl anchors)
    this.vertexNodeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,            // Cyan-Platinum Pearl Anchor (Vertices)
      roughness: 0.08,
      metalness: 0.90,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
    });

    this.originNodeMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,            // Electric Gold Pearl Anchor (Coordinate Origin)
      roughness: 0.05,
      metalness: 0.95,
      emissive: 0xd97706,
      emissiveIntensity: 0.85,
    });

    this.midpointNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,            // Warm Amber Pearl Anchor (1/2 Midpoints)
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });

    this.thirdNodeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,            // Mint Emerald Pearl Anchor (1/3, 2/3 Trisection Points)
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });

    this.centerNodeMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,            // Violet Pearl Anchor (Face/Body Centers)
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.92,
    });
  }

  private assembleGroups(): void {
    // Model container hovers cleanly in mid-air (y = baseHoverY)
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

    // Invisible interaction hit envelope for effortless direct drag-rotation
    const hitGeo = new THREE.SphereGeometry(0.75, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
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

    // 1. Soft radial gradient contact shadow disc on table
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

    // 2. Holographic polar coordinate laser projection ring (Vision Pro electric cyan reticle)
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

    // Inner concentric ring
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
    // Generate camera-facing Billboard Sprite for pristine, non-clipping focus reticle
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      const cx = 64, cy = 64;
      // Soft radial glow aura
      if (typeof ctx.createRadialGradient === 'function') {
        const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 58);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        grad.addColorStop(0.65, 'rgba(56, 189, 248, 0.15)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 58, 0, Math.PI * 2);
        ctx.fill();
      }
      // Inner crisp focus ring (radius 36 hugs the pearl cleanly without touching text at radius 60+)
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Outer delicate dashed tick ring
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.lineWidth = 1.8;
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([5, 6]);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.stroke();
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

    // Keep snapRing & snapRingOuter for backwards compatibility with any existing property lookups
    const dummyRing = new THREE.Object3D();
    dummyRing.name = 'snapRing';
    this.snapCursorGroup.add(dummyRing);
    const dummyOuter = new THREE.Object3D();
    dummyOuter.name = 'snapRingOuter';
    this.snapCursorGroup.add(dummyOuter);

    this.snapCursorGroup.visible = false;
  }

  // -------------------------------------------------------------
  // Full Rebuild Lifecycle
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

    // Fast-path for unfolding slider (no geometry re-allocation)
    if (unfoldOnly && this.currentOptions.unfoldProgress > 0.01) {
      this.currentOptions.unfoldProgress = options.unfoldProgress!;
      this.updateUnfoldingAngles(options.unfoldProgress!);
      return;
    }

    this.currentOptions = { ...this.currentOptions, ...options };

    const keepFigure = this.recognizedModel !== null && this.currentOptions.modelType === 'recognized';
    if (!keepFigure && (modelChanged || dimsChanged) && this.currentOptions.modelType !== 'recognized') {
      this.currentModelDef = GeometrySolver.createModel(
        this.currentOptions.modelType,
        this.currentOptions.dimensions
      );
      this.currentSphereAnalysis = GeometrySolver.computeSphereAnalysis(
        this.currentOptions.modelType,
        this.currentOptions.dimensions
      );
      if (modelChanged && !options.crossSectionPlane) {
        this.currentCrossSection = null;
      }
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
    }

    this.rebuildAll();
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

    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;
  }

  // -------------------------------------------------------------
  // 1. Crystal Glass Solid Mesh with Depth Pre-Pass
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

    // Pass 1: Deep interior Back-Faces for optical refraction & crystal volumetric depth
    const backMesh = new THREE.Mesh(
      geo,
      this.currentOptions.clippingEnabled ? this.solidCutMaterial : this.solidBackMaterial
    );
    backMesh.name = 'solidBackMesh';
    backMesh.renderOrder = 2;
    this.solidGroup.add(backMesh);

    // Pass 2: Pristine translucent crystal glass front faces
    const frontMesh = new THREE.Mesh(
      geo,
      this.currentOptions.clippingEnabled ? this.solidCutMaterial : this.solidFrontMaterial
    );
    frontMesh.name = 'solidMesh';
    frontMesh.renderOrder = 4;
    this.solidGroup.add(frontMesh);
  }

  // -------------------------------------------------------------
  // 2. Analytical Hidden-Line Edge Rendering (Pure Solid Edges + Textbook Dashed Lines)
  // -------------------------------------------------------------
  private rebuildEdges(): void {
    const edgeCount = this.currentModelDef.edges.length;
    this.edgeAdjacencies = [];

    // Precompute edge-face adjacencies for instant camera-relative occlusion tests
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

    // 1. Dynamic Solid Edges (Core lines for visible silhouette/front edges)
    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3)
    );
    this.solidEdgesMesh = new THREE.LineSegments(solidGeo, this.solidEdgeMaterial);
    this.solidEdgesMesh.name = 'solidEdges';
    this.solidEdgesMesh.renderOrder = 5;
    this.edgesSolidGroup.add(this.solidEdgesMesh);

    // 2. High-precision 3D Micro-Struts (ONLY for visible edges, never occluded edges!)
    this.solidStrutsMesh = new THREE.InstancedMesh(this.unitCylinderGeo, this.strutMaterial, edgeCount);
    this.solidStrutsMesh.name = 'solidStruts';
    this.solidStrutsMesh.renderOrder = 4;
    this.edgesSolidGroup.add(this.solidStrutsMesh);

    // 3. Occluded Dashed Lines (Textbook dashed lines for interior rear edges)
    const dashedGeo = new THREE.BufferGeometry();
    dashedGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3)
    );
    this.dashedEdgesMesh = new THREE.LineSegments(dashedGeo, this.dashedEdgeMaterial);
    this.dashedEdgesMesh.name = 'dashedEdges';
    this.dashedEdgesMesh.renderOrder = 3;
    this.edgesDashedGroup.add(this.dashedEdgesMesh);

    // Initial classification
    this.updateEdgeVisibility();
  }

  /**
   * Mathematically classifies visible vs occluded edges from camera viewpoint:
   * In any convex polyhedron, an edge is visible iff at least one adjacent face is front-facing.
   * If both adjacent faces are back-facing, the edge is strictly occluded (hidden back line).
   */
  public updateEdgeVisibility(camera?: THREE.Camera): void {
    if (!this.currentModelDef || this.edgeAdjacencies.length === 0) return;
    if (!this.solidEdgesMesh || !this.dashedEdgesMesh || !this.solidStrutsMesh) return;

    // 1. Determine camera position in modelContainer local space
    const camLocal = new THREE.Vector3();
    if (camera) {
      camera.getWorldPosition(camLocal);
    } else {
      // Default canonical textbook viewing position: front-top-right
      camLocal.set(0.6, 1.35, 1.6);
    }
    this.modelContainer.worldToLocal(camLocal);

    // 2. Classify front-facing vs back-facing faces from camera viewpoint
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

    // 3. Classify edges into visible (solid) and occluded (dashed)
    const solidPos = this.solidEdgesMesh.geometry.attributes.position.array as Float32Array;
    const dashedPos = this.dashedEdgesMesh.geometry.attributes.position.array as Float32Array;
    let solidCount = 0;
    let dashedCount = 0;

    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const mat = new THREE.Matrix4();

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

      // When showDashedLines is false (default), ALL edges (including occluded ones) are rendered as solid lines
      const renderAsSolid = isVisible || !this.currentOptions.showDashedLines;

      if (renderAsSolid) {
        // Visible or occluded solid edge: solid line + micro strut
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
          quat.setFromUnitVectors(up, dir.clone().normalize());
        } else {
          quat.identity();
        }
        scale.set(1, len, 1);
        mat.compose(mid, quat, scale);
        this.solidStrutsMesh.setMatrixAt(solidCount, mat);

        solidCount++;
      } else {
        // Occluded edge: textbook dashed line (active only when showDashedLines is explicitly enabled)
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

    // 4. Update solid buffers
    this.solidEdgesMesh.geometry.setDrawRange(0, solidCount * 2);
    this.solidEdgesMesh.geometry.attributes.position.needsUpdate = true;
    this.solidStrutsMesh.count = solidCount;
    this.solidStrutsMesh.instanceMatrix.needsUpdate = true;

    // 5. Update dashed buffers
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
  // 4. 关键点与磁吸标记 (Clean Platinum Pearl Anchors - No Measles)
  // -------------------------------------------------------------
  private rebuildKeyPoints(): void {
    if (!this.currentOptions.showKeyPoints) return;

    const originId = this.currentOptions.originKeyPointId ?? 'v_0';

    for (const kp of this.currentModelDef.keyPoints) {
      // By default: ONLY show vertices! Never clutter with midpoints, thirds, or centers unless requested
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
  // 5. 3D 顶点高清数学标号 (Apple Typography Billboard Sprites)
  // -------------------------------------------------------------
  private rebuildLabels(): void {
    if (!this.currentOptions.showLabels) return;

    for (const kp of this.currentModelDef.keyPoints) {
      if (kp.type !== 'vertex' && kp.type !== 'custom') continue;

      const sprite = this.createLabelSprite(kp.label);
      // Offset slightly outward from centroid
      const dir = kp.position.clone();
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 1, 0);
      } else {
        dir.normalize();
      }

      sprite.position.copy(kp.position).addScaledVector(dir, 0.024);
      this.labelsGroup.add(sprite);
    }
  }

  private createLabelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);

      // Pure Mathematical Typography (No bubble badge, unadorned letters)
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Times New Roman", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Subtle dark stroke outline for maximum legibility on light laboratory walls
      ctx.lineWidth = 5.0;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.90)';
      if (typeof ctx.strokeText === 'function') {
        ctx.strokeText(text, 64, 64);
      }

      // Pure crisp white glyph fill for contrast against azure crystal faces and dark tables
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 64, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.046, 0.046, 1);
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

  // -------------------------------------------------------------
  // 6. 空间连线绘制 (Drawn Spatial Segments with Birth Animation)
  // -------------------------------------------------------------
  public addSegment(pointIdA: string, pointIdB: string, color = 0x38d9a9): DrawnSegment | null {
    const kpA = this.currentModelDef.keyPoints.find((k) => k.id === pointIdA);
    const kpB = this.currentModelDef.keyPoints.find((k) => k.id === pointIdB);
    if (!kpA || !kpB || pointIdA === pointIdB) return null;

    const existing = this.drawnSegments.find(
      (s) => (s.pointIdA === pointIdA && s.pointIdB === pointIdB) || (s.pointIdA === pointIdB && s.pointIdB === pointIdA)
    );
    if (existing) return existing;

    const length = kpA.position.distanceTo(kpB.position);
    const seg: DrawnSegment = {
      id: `seg_${pointIdA}_${pointIdB}`,
      pointIdA,
      pointIdB,
      label: `${kpA.label}${kpB.label}`,
      color,
      length,
    };
    this.drawnSegments.push(seg);

    // Launch luminous beam expansion animation
    this.startSegmentBirthAnimation(seg, kpA.position, kpB.position);

    // Build permanent segment
    this.rebuildSegments();
    return seg;
  }

  private startSegmentBirthAnimation(seg: DrawnSegment, posA: THREE.Vector3, posB: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(posB, posA);
    const len = dir.length();
    if (len < 1e-4) return;

    const pipeGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 1.0, 16);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: seg.color,
      emissive: seg.color,
      emissiveIntensity: 0.95,
      roughness: 0.15,
      metalness: 0.85,
      transparent: true,
      opacity: 0.95,
    });
    const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
    pipeMesh.position.copy(posA);
    pipeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    pipeMesh.scale.set(1, 0.001, 1);
    pipeMesh.renderOrder = 6;
    this.segmentAnimGroup.add(pipeMesh);

    // Glowing energy tip beacon travelling from posA to posB
    const tipGeo = new THREE.SphereGeometry(0.0062, 12, 12);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: seg.color,
      emissiveIntensity: 1.6,
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
    // Clean up any active animation on this segment
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
    this.rebuildSegments();
  }

  public getSegments(): DrawnSegment[] {
    return [...this.drawnSegments];
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

      const pipeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, len, 16);
      const pipeMat = new THREE.MeshStandardMaterial({
        color: seg.color,
        emissive: seg.color,
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.85,
      });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.name = `perm_seg_${seg.id}`;
      pipe.position.copy(mid);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      pipe.renderOrder = 5;
      this.segmentsGroup.add(pipe);
    }
  }

  // -------------------------------------------------------------
  // 7. 截面剖切 (Cross-Section Polygon & Exploded Separation)
  // -------------------------------------------------------------
  private rebuildCrossSection(): void {
    if (!this.currentCrossSection || this.currentCrossSection.polygon.length < 3) return;

    const poly = this.currentCrossSection.polygon;
    const normal = this.currentCrossSection.normal.clone().normalize();
    const explodeOffset = normal.clone().multiplyScalar(this.currentOptions.explodeDistance);

    // Glowing border loop
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

    // Translucent filled polygon surface
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
  // 8. 空间向量建系 (Apple Precision Spatial Triad)
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

      // Shaft
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

      // Cone Tip
      const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
      const cone = new THREE.Mesh(coneGeo, shaftMat);
      cone.position.y = axisLength - coneHeight / 2;

      axisGroup.add(shaft, cone);
      axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      axisGroup.position.copy(originPos);

      // Label sprite
      const sprite = this.createAxisBadgeSprite(label, color);
      sprite.position.copy(originPos).addScaledVector(dir, axisLength + 0.022);
      this.coordinateGroup.add(axisGroup, sprite);
    };

    // +X: Neon Laser Crimson, +Y: Neon Laser Emerald, +Z: Neon Laser Electric Cyan
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
  // 10. 表面展开图与折叠动画 (Net Unfolding & Folding)
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
  // Magnetic Snapping & Raycast Target (Camera-Facing Reticles)
  // -------------------------------------------------------------
  public setHoveredKeyPoint(id: string | null): void {
    if (this.hoveredKeyPointId === id) return;

    // Reset previous hovered mesh scale
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

        // Tactile node scaling: smoothly grow the pearl bead
        const currMesh = this.keyPointMeshes.get(id);
        if (currMesh && !this.lastSelectedIds.includes(id)) {
          currMesh.scale.set(1.30, 1.30, 1.30);
        }

        let hex = 0x38bdf8; // vertex: vivid cyan
        if (kp.type === 'midpoint') {
          hex = 0xf59e0b; // 1/2: golden amber
        } else if (kp.type === 'third') {
          hex = 0x10b981; // 1/3: emerald mint
        } else if (kp.type === 'center') {
          hex = 0xa855f7; // center: violet
        }

        if (this.snapCursorSprite) {
          (this.snapCursorSprite.material as THREE.SpriteMaterial).color.setHex(hex);
        }
        return;
      }
    }
    this.snapCursorGroup.visible = false;
  }

  public findClosestSnapPoint(
    ray: THREE.Ray,
    threshold = 0.055
  ): { keyPoint: KeyPoint; snapType: string; distance: number; snapLabel: string } | null {
    return GeometrySolver.findClosestSnapPoint(ray, this.currentModelDef, this.modelContainer.matrixWorld, threshold);
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
    return { ...this.currentOptions };
  }

  public setScale(scale: number): void {
    this.modelScale = THREE.MathUtils.clamp(scale, 0.35, 3.0);
    this.modelContainer.scale.setScalar(this.modelScale);

    // Dynamically elevate model so bottom vertices never penetrate the tabletop
    this.updateBaseHoverHeight();
    this.modelContainer.position.y = this.baseHoverY;

    // Dynamically scale table contact shadow and projection rings with model
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
    // Reset previous selected keypoint mesh scales
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

      // Scale keypoint mesh as active selection beacon
      const currMesh = this.keyPointMeshes.get(id);
      if (currMesh) {
        currMesh.scale.set(1.40, 1.40, 1.40);
      }

      // Golden breathing beacon billboard sprite
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
    badgeText?: string
  ): void {
    const dir = new THREE.Vector3().subVectors(endPos, startPos);
    const len = dir.length();
    if (len < 1e-4) {
      this.previewSegmentGroup.visible = false;
      return;
    }

    const mid = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);

    // 1. Reusable / Dynamic Pipe
    if (!this.previewPipeMesh) {
      const pipeGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 1.0, 12);
      const pipeMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.85,
        transparent: true,
        opacity: 0.92,
      });
      this.previewPipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
      this.previewPipeMesh.renderOrder = 7;
      this.previewSegmentGroup.add(this.previewPipeMesh);
    }

    const pMat = this.previewPipeMesh.material as THREE.MeshStandardMaterial;
    pMat.color.setHex(color);
    pMat.emissive.setHex(color);
    pMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(this.hoverTime * 8);

    this.previewPipeMesh.scale.set(1, len, 1);
    this.previewPipeMesh.position.copy(mid);
    this.previewPipeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    // 2. Reusable Anchor Beads
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

    // 3. Floating Midpoint Distance Badge Sprite
    const labelToDisplay = badgeText || `${len.toFixed(3)} m`;
    if (!this.previewBadgeSprite) {
      this.previewBadgeCanvas = document.createElement('canvas');
      this.previewBadgeCanvas.width = 256;
      this.previewBadgeCanvas.height = 64;
      this.previewBadgeTex = new THREE.CanvasTexture(this.previewBadgeCanvas);
      this.previewBadgeTex.minFilter = THREE.LinearFilter;
      const bMat = new THREE.SpriteMaterial({
        map: this.previewBadgeTex,
        transparent: true,
        depthTest: false,
      });
      this.previewBadgeSprite = new THREE.Sprite(bMat);
      this.previewBadgeSprite.scale.set(0.062, 0.0155, 1);
      this.previewBadgeSprite.renderOrder = 9;
      this.previewSegmentGroup.add(this.previewBadgeSprite);
    }

    if (this.previewBadgeCanvas && this.previewBadgeTex && this.lastPreviewBadgeKey !== `${labelToDisplay}_${color}`) {
      this.lastPreviewBadgeKey = `${labelToDisplay}_${color}`;
      const bctx = this.previewBadgeCanvas.getContext('2d');
      if (bctx) {
        bctx.clearRect(0, 0, 256, 64);
        const isEmerald = (color === 0x10b981 || color === 0x38d9a9);
        bctx.fillStyle = isEmerald ? 'rgba(5, 150, 105, 0.92)' : 'rgba(15, 23, 42, 0.88)';
        if (typeof (bctx as any).roundRect === 'function') {
          bctx.beginPath();
          (bctx as any).roundRect(8, 8, 240, 48, 24);
          bctx.fill();
        } else {
          bctx.fillRect(8, 8, 240, 48);
        }
        bctx.lineWidth = 2.5;
        bctx.strokeStyle = isEmerald ? 'rgba(52, 211, 153, 0.95)' : 'rgba(56, 189, 248, 0.75)';
        if (typeof (bctx as any).roundRect === 'function') {
          bctx.beginPath();
          (bctx as any).roundRect(8, 8, 240, 48, 24);
          bctx.stroke();
        }

        bctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.fillStyle = '#ffffff';
        bctx.fillText(labelToDisplay, 128, 32);
        this.previewBadgeTex.needsUpdate = true;
      }
    }

    this.previewBadgeSprite.position.copy(mid).add(new THREE.Vector3(0, 0.015, 0));
    this.previewSegmentGroup.visible = true;
  }

  public clearPreviewWire(): void {
    this.previewSegmentGroup.visible = false;
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
    // Maintain at least minClearance (0.055) above tabletop (Y=0)
    // When lowestY is negative (e.g. -0.28), minClearance - lowestY is 0.055 - (-0.28) = 0.335
    const requiredHover = Math.max(0.20, this.minClearance - lowestY);
    this.baseHoverY = requiredHover;
  }

  /**
   * Continuous per-frame animation:
   * 1. Gentle Sci-Fi levitation / hover breathing of model in mid-air
   * 2. Dynamically update visible solid edges vs occluded dashed lines from camera viewpoint
   * 3. Update active segment birth animations and beacon pulses
   */
  public update(delta: number, elapsed?: number, camera?: THREE.Camera): void {
    const t = elapsed !== undefined ? elapsed : (this.hoverTime += delta);
    this.hoverTime = t;

    // Dynamically adjust hover height so model NEVER penetrates the tabletop regardless of tilt or zoom
    this.updateBaseHoverHeight();

    // Gentle Sci-Fi Levitation / Hover Breathing (smooth floating oscillation)
    const hoverOffset = Math.sin(t * 1.5) * 0.005;
    this.modelContainer.position.y = this.baseHoverY + hoverOffset;

    // Dynamically update visible solid edges vs occluded dashed lines from current camera viewpoint
    this.updateEdgeVisibility(camera);

    // Slow rotation of stage presentation holographic ring
    const stageRing = this.stagePresentationGroup.children[1];
    if (stageRing) {
      stageRing.rotation.z += delta * 0.12;
    }

    // Magnetic snap reticle pulse
    if (this.snapCursorGroup.visible && this.snapCursorSprite) {
      const snapPulse = 0.024 * (1.0 + 0.08 * Math.sin(this.hoverTime * 6));
      this.snapCursorSprite.scale.set(snapPulse, snapPulse, 1);
    }

    // Selected keypoints beacon pulsation
    const beaconScale = 0.026 * (1.0 + 0.12 * Math.sin(this.hoverTime * 5));
    for (const sprite of this.selectedBeaconSprites.values()) {
      sprite.scale.set(beaconScale, beaconScale, 1);
    }

    // Update active segment birth growth animations
    for (let i = this.activeSegmentAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeSegmentAnimations[i];
      anim.progress += delta / anim.duration;
      const p = Math.min(anim.progress, 1.0);
      const ease = 1 - Math.pow(1 - p, 3); // Ease-out cubic
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
    this.vertexNodeMat.dispose();
    this.midpointNodeMat.dispose();
    this.thirdNodeMat.dispose();
    this.centerNodeMat.dispose();
    this.originNodeMat.dispose();
  }
}
