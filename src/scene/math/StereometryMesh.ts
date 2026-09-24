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
  private pedestalGroup = new THREE.Group();

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

  // Current Model State
  private currentModelDef: PolyhedronModelDef;
  private currentOptions: StereometryDisplayOptions;
  private currentCrossSection: CrossSectionResult | null = null;
  private currentSphereAnalysis: SphereAnalysisResult;
  private drawnSegments: DrawnSegment[] = [];

  // Keypoints cache for raycasting
  private keyPointMeshes: Map<string, THREE.Mesh> = new Map();
  private hoveredKeyPointId: string | null = null;

  // Shared reusable geometries (Ultra-refined micro pips)
  private sharedVertexGeo = new THREE.SphereGeometry(0.0045, 16, 16);
  private sharedMidpointGeo = new THREE.SphereGeometry(0.0035, 12, 12);
  private sharedCenterGeo = new THREE.SphereGeometry(0.0035, 12, 12);

  // Materials - Apple VisionOS Crystal Glass Aesthetics (Two-Pass Physical Refraction)
  private solidBackMaterial: THREE.MeshPhysicalMaterial;
  private solidFrontMaterial: THREE.MeshPhysicalMaterial;
  private solidCutMaterial: THREE.MeshPhysicalMaterial;
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
    this.initPedestal();
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
    // Apple VisionOS Two-Pass Crystal Glass
    // Pass 1: Back faces pass (creates authentic volumetric internal depth)
    this.solidBackMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc7d2fe,
      roughness: 0.06,
      metalness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    });

    // Pass 2: Front faces pass (crisp specular highlights, diamond clearcoat reflection)
    this.solidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.03,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.98,
      ior: 1.54,
      transparent: true,
      opacity: 0.44,
      side: THREE.FrontSide,
      depthWrite: false,
      emissive: 0x0284c7,
      emissiveIntensity: 0.06, // subtle volumetric internal blue-white luminosity
    });

    this.solidCutMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x60a5fa,
      roughness: 0.08,
      metalness: 0.08,
      clearcoat: 0.95,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.46,
      side: THREE.FrontSide,
      depthWrite: false,
      emissive: 0x0284c7,
      emissiveIntensity: 0.08,
    });

    // Visible edges: luminous crisp white seam
    this.solidEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
    });

    // Hidden occluded edges: refined subtle dashed line
    this.dashedEdgeMaterial = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.018,
      gapSize: 0.014,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      transparent: true,
      opacity: 0.32,
    });

    // Cross section: glowing amber glass with neon border
    this.crossSectionFillMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      emissive: 0xd97706,
      emissiveIntensity: 0.25,
    });

    this.crossSectionLineMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      linewidth: 2,
    });

    // Spheres: refined luminous glass shells
    this.circumSphereMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      roughness: 0.1,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.inSphereMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Apple VisionOS Platinum Pearl Nodes (subtle, unified, zero gaudy beads)
    this.vertexNodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.85,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.25,
    });

    this.originNodeMat = new THREE.MeshStandardMaterial({
      color: 0xfff1f2,
      roughness: 0.15,
      metalness: 0.85,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.5,
    });

    this.midpointNodeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x64748b,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.75,
    });

    this.centerNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x475569,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.7,
    });
  }

  /**
   * Museum-grade Apple VisionOS Holographic Pedestal Turntable.
   * Grounds the solid geometry cleanly on the tabletop without falling into any aperture.
   */
  private initPedestal(): void {
    // 1. Dark titanium plinth disc
    const baseGeo = new THREE.CylinderGeometry(0.28, 0.29, 0.012, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x161a20,
      metalness: 0.9,
      roughness: 0.25,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.006;
    base.receiveShadow = true;
    this.pedestalGroup.add(base);

    // 2. Beveled silver-chrome rim ring
    const rimGeo = new THREE.RingGeometry(0.278, 0.288, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8e3,
      metalness: 0.95,
      roughness: 0.15,
      side: THREE.DoubleSide,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.0121;
    this.pedestalGroup.add(rim);

    // 3. Frosted smoked glass turntable inlay disc
    const discGeo = new THREE.RingGeometry(0.04, 0.276, 64);
    const discMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e242f,
      metalness: 0.3,
      roughness: 0.15,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0123;
    disc.receiveShadow = true;
    this.pedestalGroup.add(disc);

    // 4. Subtle concentric laser-etched graduation ring
    const ringGeo = new THREE.RingGeometry(0.245, 0.248, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const graduationRing = new THREE.Mesh(ringGeo, ringMat);
    graduationRing.rotation.x = -Math.PI / 2;
    graduationRing.position.y = 0.0125;
    this.pedestalGroup.add(graduationRing);

    // 5. Diffused upward holographic aura halo
    const auraGeo = new THREE.RingGeometry(0.16, 0.25, 48);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.0126;
    this.pedestalGroup.add(aura);

    this.group.add(this.pedestalGroup);
  }

  private assembleGroups(): void {
    // Model container hovers 3cm above the pedestal plate (y = 0.20)
    this.modelContainer.position.y = 0.20;

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

    this.group.add(this.modelContainer);

    this.createSnapCursor();
  }

  private createSnapCursor(): void {
    const ringGeo = new THREE.RingGeometry(0.012, 0.018, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'snapRing';
    this.snapCursorGroup.add(ring);
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
  // 1. Two-Pass Crystal Glass Solid Mesh
  // -------------------------------------------------------------
  private rebuildSolidMesh(): void {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];

    if (this.currentOptions.clippingEnabled && this.currentCrossSection) {
      this.solidCutMaterial.clippingPlanes = [this.currentCrossSection.plane];
      this.solidCutMaterial.clipShadows = true;
    } else {
      this.solidCutMaterial.clippingPlanes = [];
    }

    for (const face of this.currentModelDef.faces) {
      const vIndices = face.vertexIndices;
      const v0 = this.currentModelDef.vertices[vIndices[0]];
      const norm = face.normal;

      for (let i = 1; i < vIndices.length - 1; i++) {
        const v1 = this.currentModelDef.vertices[vIndices[i]];
        const v2 = this.currentModelDef.vertices[vIndices[i + 1]];

        positions.push(v0.x, v0.y, v0.z);
        positions.push(v1.x, v1.y, v1.z);
        positions.push(v2.x, v2.y, v2.z);

        normals.push(norm.x, norm.y, norm.z);
        normals.push(norm.x, norm.y, norm.z);
        normals.push(norm.x, norm.y, norm.z);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    // Two-pass optical crystal rendering: Back faces first, Front faces second
    if (!this.currentOptions.clippingEnabled) {
      const backMesh = new THREE.Mesh(geo, this.solidBackMaterial);
      backMesh.name = 'solidMeshBack';
      backMesh.renderOrder = 2;
      this.solidGroup.add(backMesh);
    }

    const frontMesh = new THREE.Mesh(
      geo,
      this.currentOptions.clippingEnabled ? this.solidCutMaterial : this.solidFrontMaterial
    );
    frontMesh.name = 'solidMesh';
    frontMesh.renderOrder = 3;
    this.solidGroup.add(frontMesh);
  }

  // -------------------------------------------------------------
  // 2. Dual-Channel Edge Rendering
  // -------------------------------------------------------------
  private rebuildEdges(): void {
    const edgeVerts: number[] = [];

    for (const [i1, i2] of this.currentModelDef.edges) {
      const p1 = this.currentModelDef.vertices[i1];
      const p2 = this.currentModelDef.vertices[i2];
      edgeVerts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
    const solidEdges = new THREE.LineSegments(solidGeo, this.solidEdgeMaterial);
    solidEdges.name = 'solidEdges';
    solidEdges.renderOrder = 4;
    this.edgesSolidGroup.add(solidEdges);

    if (this.currentOptions.showDashedLines) {
      const dashedGeo = solidGeo.clone();
      const dashedEdges = new THREE.LineSegments(dashedGeo, this.dashedEdgeMaterial);
      dashedEdges.computeLineDistances();
      dashedEdges.name = 'dashedEdges';
      dashedEdges.renderOrder = 1;
      this.edgesDashedGroup.add(dashedEdges);
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
      color: 0xf59e0b,
      dashSize: 0.02,
      gapSize: 0.015,
      transparent: true,
      opacity: 0.75,
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
    const ctx = typeof (canvas as any).getContext === 'function' ? (canvas as any).getContext('2d') : null;
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);

      // Translucent frosted glass badge backing
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      const r = 24;
      const x = 16, y = 24, w = 96, h = 80;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();

      // Border highlight
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.stroke();

      // Bold SF Pro / Apple Typography
      ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.fillText(text, 64, 66);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.042, 0.042, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // -------------------------------------------------------------
  // 6. 空间连线绘制 (Drawn Spatial Segments)
  // -------------------------------------------------------------
  public addSegment(pointIdA: string, pointIdB: string, color = 0x38bdf8): DrawnSegment | null {
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
        emissive: seg.color,
        emissiveIntensity: 0.6,
        roughness: 0.15,
        metalness: 0.8,
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

    // +X: Coral Red, +Y: Mint Emerald, +Z: Azure Cyan
    createAxis(new THREE.Vector3(1, 0, 0), 0xf43f5e, 'x');
    createAxis(new THREE.Vector3(0, 1, 0), 0x10b981, 'y');
    createAxis(new THREE.Vector3(0, 0, 1), 0x0ea5e9, 'z');
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
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
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
      color: 0x60a5fa,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });

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
      color: 0x0284c7,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const gridHelperMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
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

  public dispose(): void {
    this.clearGroup(this.group);
    this.clearGroup(this.modelContainer);
    this.clearGroup(this.pedestalGroup);
    this.sharedVertexGeo.dispose();
    this.sharedMidpointGeo.dispose();
    this.sharedCenterGeo.dispose();
    this.solidBackMaterial.dispose();
    this.solidFrontMaterial.dispose();
    this.solidCutMaterial.dispose();
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
