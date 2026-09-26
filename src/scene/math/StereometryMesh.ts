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
  private hitEnvelopeMesh: THREE.Mesh | null = null;
  private modelScale = 1.0;

  // Current Model State
  private currentModelDef: PolyhedronModelDef;
  private currentOptions: StereometryDisplayOptions;
  private currentCrossSection: CrossSectionResult | null = null;
  private currentSphereAnalysis: SphereAnalysisResult;
  private drawnSegments: DrawnSegment[] = [];

  // Keypoints cache for raycasting
  private keyPointMeshes: Map<string, THREE.Mesh> = new Map();
  private hoveredKeyPointId: string | null = null;

  // Floating / Levitation state (pure floating 3D geometry in mid-air)
  public baseHoverY = 0.22;
  private hoverTime = 0;

  // Stage presentation group (projection rings, contact shadow, accent lighting)
  private stagePresentationGroup = new THREE.Group();

  // Shared reusable geometries (Ultra-refined micro pips & precision struts)
  private sharedVertexGeo = new THREE.SphereGeometry(0.0055, 16, 16);
  private sharedMidpointGeo = new THREE.SphereGeometry(0.0040, 12, 12);
  private sharedCenterGeo = new THREE.SphereGeometry(0.0040, 12, 12);
  private unitCylinderGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1.0, 8);

  // Materials - Apple VisionOS Crystal Glass Aesthetics (Depth-Tested Hidden Lines)
  private depthMaskMaterial: THREE.MeshBasicMaterial;
  private solidBackMaterial: THREE.MeshPhysicalMaterial;
  private solidFrontMaterial: THREE.MeshPhysicalMaterial;
  private solidCutMaterial: THREE.MeshPhysicalMaterial;
  private strutMaterial: THREE.MeshStandardMaterial;
  private solidEdgeMaterial: THREE.LineBasicMaterial;
  private dashedEdgeMaterial: THREE.LineDashedMaterial;
  private crossSectionFillMat: THREE.MeshStandardMaterial;
  private crossSectionLineMat: THREE.LineBasicMaterial;
  private circumSphereMat: THREE.MeshStandardMaterial;
  private inSphereMat: THREE.MeshStandardMaterial;

  // Pearl Node Materials (Apple VisionOS Minimalist Platinum Style)
  private vertexNodeMat: THREE.MeshStandardMaterial;
  private midpointNodeMat: THREE.MeshStandardMaterial;
  private centerNodeMat: THREE.MeshStandardMaterial;
  private originNodeMat: THREE.MeshStandardMaterial;

  // Unfolding animated face groups cache
  private unfoldingFaceGroups: THREE.Group[] = [];

  constructor() {
    this.group.name = 'StereometryMesh';
    this.initMaterials();
    this.assembleGroups();

    // Default configuration: standard high school cube, canonical textbook oblique view
    this.currentOptions = {
      modelType: 'cube',
      dimensions: { a: 0.38, b: 0.38, c: 0.38 },
      showKeyPoints: true,
      showMidpoints: false,      // NEVER cluttered with midpoints by default
      showFaceCenters: false,    // NEVER cluttered with face centers by default
      showLabels: true,          // Crisp SF Pro vertex billboard labels (A, B, C, D, ...)
      showDashedLines: true,     // Textbook hidden dashed lines
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
  }

  private initMaterials(): void {
    // 1. Depth mask pass: writes front face depth without writing color
    // This allows occluded rear edges to accurately test with GreaterDepth!
    this.depthMaskMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    // 1.5 Back-face optical absorption layer for crystal volumetric depth (neutral dark glass)
    this.solidBackMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x18181b,
      roughness: 0.12,
      metalness: 0.10,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.20,
      side: THREE.BackSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    // 2. Translucent luxury optical crystal glass front faces (Apple VisionOS Optical Crystal)
    this.solidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.94,
      transparent: true,
      opacity: 0.24,
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.25,
      sheenColor: 0xffffff,
      sheenRoughness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    this.solidCutMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.92,
      transparent: true,
      opacity: 0.35,
      side: THREE.FrontSide,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      sheen: 0.2,
      sheenColor: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    // 3. Precision 3D Cylindrical Edge Struts (Polished liquid titanium)
    this.strutMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.92,
      roughness: 0.14,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    // 3.1 Inner razor-sharp glowing core line
    this.solidEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.90,
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
    });

    // 4. Hidden occluded edges: textbook clean dashed wireframe
    this.dashedEdgeMaterial = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.016,
      gapSize: 0.012,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      transparent: true,
      opacity: 0.38,
    });

    // 5. Cross section: pure monochrome frosted glass with white boundary
    this.crossSectionFillMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.08,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      emissive: 0xffffff,
      emissiveIntensity: 0.08,
    });

    this.crossSectionLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
    });

    // 6. Spheres: refined monochrome holographic forcefields
    this.circumSphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.09,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0xffffff,
      emissiveIntensity: 0.04,
    });

    this.inSphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0xffffff,
      emissiveIntensity: 0.06,
    });

    // 7. Data Nodes (Polished liquid platinum pearl anchors)
    this.vertexNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.92,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    });

    this.originNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.96,
      emissive: 0xffffff,
      emissiveIntensity: 0.75,
    });

    this.midpointNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.88,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85,
    });

    this.centerNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.88,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85,
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

    // Invisible interaction hit envelope for effortless direct drag-rotation
    const hitGeo = new THREE.SphereGeometry(0.55, 16, 16);
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
    const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.001;
    this.stagePresentationGroup.add(shadowMesh);

    // 2. Holographic polar coordinate laser projection ring (Vision Pro subtle translucent white)
    const ringGeo = new THREE.RingGeometry(0.24, 0.243, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.stagePresentationGroup.add(ring);

    // Inner concentric ring
    const innerRingGeo = new THREE.RingGeometry(0.12, 0.122, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.002;
    this.stagePresentationGroup.add(innerRing);

    // 3. Upward crystal refractive accent stage light (clean neutral soft white)
    const stageLight = new THREE.PointLight(0xffffff, 0.40, 1.2, 2.0);
    stageLight.position.set(0, 0.04, 0);
    this.stagePresentationGroup.add(stageLight);
  }

  private createSnapCursor(): void {
    const ringGeo = new THREE.RingGeometry(0.012, 0.017, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.90,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'snapRing';
    this.snapCursorGroup.add(ring);

    // Outer subtle tick ring
    const outerGeo = new THREE.RingGeometry(0.021, 0.023, 24);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.40,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.name = 'snapRingOuter';
    this.snapCursorGroup.add(outerRing);

    this.snapCursorGroup.visible = false;
  }

  // -------------------------------------------------------------
  // Full Rebuild Lifecycle
  // -------------------------------------------------------------

  public setOptions(options: Partial<StereometryDisplayOptions>): void {
    const modelChanged = options.modelType && options.modelType !== this.currentOptions.modelType;
    const dimsChanged = options.dimensions !== undefined;
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

    if (modelChanged || dimsChanged) {
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
    this.keyPointMeshes.clear();
    this.unfoldingFaceGroups = [];

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
    this.rebuildLabels();
    this.rebuildSegments();
    this.rebuildCrossSection();
    this.rebuildCoordinateSystem();
    this.rebuildSpheres();
    this.rebuildThreeViews();
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

    // Pass 1: Depth pre-pass mask (writes front-face depth for occluded edge GreaterDepth test)
    const depthMaskMesh = new THREE.Mesh(geo, this.depthMaskMaterial);
    depthMaskMesh.name = 'depthMaskMesh';
    depthMaskMesh.renderOrder = 1;
    this.solidGroup.add(depthMaskMesh);

    // Pass 1.5: Deep interior Back-Faces for optical refraction & crystal volumetric depth
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
  // 2. Dual-Channel Edge Rendering (Textbook Hidden Dashed Lines + 3D Struts)
  // -------------------------------------------------------------
  private rebuildEdges(): void {
    const edgeVerts: number[] = [];
    const edgeCount = this.currentModelDef.edges.length;

    for (const [i1, i2] of this.currentModelDef.edges) {
      const p1 = this.currentModelDef.vertices[i1];
      const p2 = this.currentModelDef.vertices[i2];
      edgeVerts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));

    // Hidden occluded edges: rendered with GreaterDepth (behind the front faces)
    if (this.currentOptions.showDashedLines) {
      const dashedGeo = solidGeo.clone();
      const dashedEdges = new THREE.LineSegments(dashedGeo, this.dashedEdgeMaterial);
      dashedEdges.computeLineDistances();
      dashedEdges.name = 'dashedEdges';
      dashedEdges.renderOrder = 2;
      this.edgesDashedGroup.add(dashedEdges);
    }

    // High-precision 3D cylindrical struts: liquid titanium-chrome rails that catch light specularly
    if (edgeCount > 0) {
      const struts = new THREE.InstancedMesh(this.unitCylinderGeo, this.strutMaterial, edgeCount);
      struts.name = 'solidStruts';
      struts.renderOrder = 3;

      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const mat = new THREE.Matrix4();

      for (let i = 0; i < edgeCount; i++) {
        const [i1, i2] = this.currentModelDef.edges[i];
        const p1 = this.currentModelDef.vertices[i1];
        const p2 = this.currentModelDef.vertices[i2];

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
        struts.setMatrixAt(i, mat);
      }
      struts.instanceMatrix.needsUpdate = true;
      this.edgesSolidGroup.add(struts);
    }

    // Visible front laser core lines: rendered with LessEqualDepth
    const solidEdges = new THREE.LineSegments(solidGeo, this.solidEdgeMaterial);
    solidEdges.name = 'solidEdges';
    solidEdges.renderOrder = 4;
    this.edgesSolidGroup.add(solidEdges);
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
      color: 0xffffff,
      dashSize: 0.02,
      gapSize: 0.015,
      transparent: true,
      opacity: 0.45,
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
      // By default: ONLY show vertices! Never clutter with midpoints or centers unless requested
      if (kp.type === 'midpoint' && !this.currentOptions.showMidpoints) {
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
      } else if (kp.type === 'center') {
        geo = this.sharedCenterGeo;
        mat = this.centerNodeMat;
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
      if (kp.type !== 'vertex') continue;

      const sprite = this.createLabelSprite(kp.label);
      // Offset slightly outward from centroid
      const dir = kp.position.clone();
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 1, 0);
      } else {
        dir.normalize();
      }

      sprite.position.copy(kp.position).addScaledVector(dir, 0.028);
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

      // VisionOS Frosted Capsule Glass Circular Badge
      const cx = 64, cy = 64, radius = 38;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();

      // Deep frosted dark translucent glass badge
      ctx.fillStyle = 'rgba(20, 20, 24, 0.82)';
      ctx.fill();

      // Subtle translucent white rim ring
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.stroke();

      // Inner subtle hairline ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.stroke();

      // Bold SF Pro / Apple Typography
      ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.fillText(text, 64, 65);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.040, 0.040, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // -------------------------------------------------------------
  // 6. 空间连线绘制 (Drawn Spatial Segments)
  // -------------------------------------------------------------
  public addSegment(pointIdA: string, pointIdB: string, color = 0xffffff): DrawnSegment | null {
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
    this.rebuildSegments();
    return seg;
  }

  public removeSegment(id: string): void {
    this.drawnSegments = this.drawnSegments.filter((s) => s.id !== id);
    this.rebuildSegments();
  }

  public clearAllSegments(): void {
    this.drawnSegments = [];
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

      const pipeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, len, 12);
      const pipeMat = new THREE.MeshStandardMaterial({
        color: seg.color,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
        roughness: 0.15,
        metalness: 0.85,
      });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);

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
  // Magnetic Snapping & Raycast Target
  // -------------------------------------------------------------
  public setHoveredKeyPoint(id: string | null): void {
    if (this.hoveredKeyPointId === id) return;
    this.hoveredKeyPointId = id;

    if (id) {
      const mesh = this.keyPointMeshes.get(id);
      if (mesh) {
        this.snapCursorGroup.position.copy(mesh.position);
        this.snapCursorGroup.visible = true;
        return;
      }
    }
    this.snapCursorGroup.visible = false;
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
  }

  public getScale(): number {
    return this.modelScale;
  }

  public zoom(factor: number): number {
    this.setScale(this.modelScale * factor);
    return this.modelScale;
  }

  public setSelectedKeyPoints(ids: string[]): void {
    this.clearGroup(this.selectedMarkersGroup);
    if (!ids || ids.length === 0) return;

    for (const id of ids) {
      const kpMesh = this.keyPointMeshes.get(id);
      if (!kpMesh) continue;

      const ringGeo = new THREE.RingGeometry(0.011, 0.016, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.90,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(kpMesh.position);
      this.selectedMarkersGroup.add(ring);
    }
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (
        (child as any).geometry &&
        (child as any).geometry !== this.sharedVertexGeo &&
        (child as any).geometry !== this.sharedMidpointGeo &&
        (child as any).geometry !== this.sharedCenterGeo
      ) {
        (child as any).geometry.dispose();
      }
    }
  }

  /**
   * Continuous per-frame animation:
   * 1. Gentle Sci-Fi levitation / hover breathing of model in mid-air
   * 2. Counter-rotating HUD graduation rings on the pedestal
   * 3. Quantum holographic particle flow drifting upward
  /**
   * Continuous per-frame animation:
   * Gentle Sci-Fi levitation / hover breathing of model in mid-air
   */
  public update(delta: number, elapsed?: number): void {
    const t = elapsed !== undefined ? elapsed : (this.hoverTime += delta);
    this.hoverTime = t;

    // Gentle Sci-Fi Levitation / Hover Breathing (smooth floating oscillation)
    const hoverOffset = Math.sin(t * 1.5) * 0.005;
    this.modelContainer.position.y = this.baseHoverY + hoverOffset;

    // Slow rotation of stage presentation holographic ring
    const stageRing = this.stagePresentationGroup.children[1];
    if (stageRing) {
      stageRing.rotation.z += delta * 0.12;
    }

    // Magnetic snap reticle pulse
    if (this.snapCursorGroup.visible) {
      const outer = this.snapCursorGroup.getObjectByName('snapRingOuter');
      if (outer) {
        outer.rotation.z += delta * 1.8;
      }
    }
  }

  public dispose(): void {
    this.clearGroup(this.group);
    this.clearGroup(this.modelContainer);
    this.clearGroup(this.stagePresentationGroup);
    this.sharedVertexGeo.dispose();
    this.sharedMidpointGeo.dispose();
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
    this.centerNodeMat.dispose();
    this.originNodeMat.dispose();
  }
}
