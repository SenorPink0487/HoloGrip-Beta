import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import {
  StereometryMesh,
  type StereometryDisplayOptions,
} from '../../../scene/math/StereometryMesh.ts';
import {
  StereometryInteractionManager,
  type InteractionMode,
} from '../../../scene/math/StereometryInteractionManager.ts';
import {
  GeometrySolver,
  type HighSchoolModelType,
  type KeyPoint,
  type CrossSectionResult,
  type SphereAnalysisResult,
  type SkewLineResult,
} from '../../../scene/math/GeometrySolver.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export interface StereometryTelemetryData {
  modelId: HighSchoolModelType;
  modelName: string;
  modelSubtitle: string;
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  eulerCharacteristic: number; // V - E + F
  originPointId?: string;
  originLabel: string;
  vertexCoords: Array<{ id: string; label: string; coords: [number, number, number] }>;
  drawnSegments: Array<{ id: string; label: string; length: number }>;
  activeCrossSection: {
    polygonType: string;
    area: number;
    perimeter: number;
    areaRatioToBase: number;
    dihedralAngleDeg: number;
    normal: [number, number, number];
  } | null;
  sphereAnalysis: SphereAnalysisResult;
  twoLineAngle: {
    lineA: string;
    lineB: string;
    type: 'intersecting' | 'parallel' | 'skew';
    angleDeg: number;
    skewDistance: number;
  } | null;
  interactionMode: InteractionMode;
  unfoldProgress: number;
  selectedCutPoints: string[];
  modelScale?: number;
  interactionHint?: string;
}

export default class MathStereometryExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.0;
  public override hideCenterEmitter = true;

  private mesh: StereometryMesh;
  private interactionManager: StereometryInteractionManager;

  // State cache
  private modelType: HighSchoolModelType = 'cube';
  private dimA = 0.42;
  private dimH = 0.42;
  private originPointId = 'v_0';
  private interactionMode: InteractionMode = 'orbit';

  constructor() {
    super();
  }

  public init(context: ExperimentContext): void {
    // Rest experiment root on the white tabletop surface (table surface at Y=0.990, HologramStage offset Y=+0.082)
    // Positioned in front workbench interaction zone (Z=0.72)
    this.rootGroup.position.set(0, 0.082, 0.72);

    // Guarantee local clipping is enabled on renderer
    if (context.renderer) {
      context.renderer.localClippingEnabled = true;
    }

    this.mesh = new StereometryMesh();
    this.rootGroup.add(this.mesh.group);

    this.interactionManager = new StereometryInteractionManager(this.mesh, {
      onSegmentCreated: (label, len) => {
        console.log(`[Stereometry] Segment created: ${label} (len: ${len.toFixed(3)})`);
      },
      onCrossSectionCreated: (type, area) => {
        console.log(`[Stereometry] Cross-section created: ${type} (area: ${area.toFixed(3)})`);
      },
      onOriginChanged: (kp) => {
        this.originPointId = kp.id;
      },
    });

    // Default canonical textbook oblique view (base horizontal)
    this.interactionManager.resetToIsometricView();
  }

  public mount(context: ExperimentContext): void {
    if (context.renderer) {
      context.renderer.localClippingEnabled = true;
    }
  }

  public update(delta: number, elapsed: number, _context: ExperimentContext): void {
    this.interactionManager?.update(delta);
    this.mesh?.update(delta, elapsed);
  }

  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean | void {
    return this.interactionManager?.onPointerDown(event, hit, context);
  }

  public override onPointerMove(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    this.interactionManager?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event, context);
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    if (!this.mesh) return;

    switch (id) {
      case 'modelType':
        this.modelType = value as HighSchoolModelType;
        this.mesh.setOptions({
          modelType: this.modelType,
          dimensions: { a: this.dimA, h: this.dimH },
        });
        break;
      case 'dimA':
        this.dimA = parseFloat(value);
        this.mesh.setOptions({ dimensions: { a: this.dimA, h: this.dimH } });
        break;
      case 'dimH':
        this.dimH = parseFloat(value);
        this.mesh.setOptions({ dimensions: { a: this.dimA, h: this.dimH } });
        break;
      case 'showKeyPoints':
        this.mesh.setOptions({ showKeyPoints: Boolean(value) });
        break;
      case 'showDashedLines':
        this.mesh.setOptions({ showDashedLines: Boolean(value) });
        break;
      case 'showCoordinateSystem':
        this.mesh.setOptions({ showCoordinateSystem: Boolean(value) });
        break;
      case 'showEmbeddingBox':
        this.mesh.setOptions({ showEmbeddingBox: Boolean(value) });
        break;
      case 'showCircumSphere':
        this.mesh.setOptions({ showCircumSphere: Boolean(value) });
        break;
      case 'showInSphere':
        this.mesh.setOptions({ showInSphere: Boolean(value) });
        break;
      case 'clippingEnabled':
        this.mesh.setOptions({ clippingEnabled: Boolean(value) });
        break;
      case 'unfoldProgress':
        this.mesh.setOptions({ unfoldProgress: parseFloat(value) });
        break;
      case 'showThreeViews':
        this.mesh.setOptions({ showThreeViews: Boolean(value) });
        break;
    }
  }

  // -------------------------------------------------------------
  // Public Control API (called from VisionOS StereometryStatusCard)
  // -------------------------------------------------------------

  public setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
    this.interactionManager?.setMode(mode);
  }

  public setModelType(type: HighSchoolModelType): void {
    this.modelType = type;
    this.mesh.setOptions({
      modelType: type,
      dimensions: { a: this.dimA, h: this.dimH },
    });
  }

  public setDimensions(dims: { a?: number; b?: number; c?: number; h?: number; r?: number }): void {
    if (dims.a !== undefined) this.dimA = dims.a;
    if (dims.h !== undefined) this.dimH = dims.h;
    this.mesh.setOptions({ dimensions: dims });
  }

  public toggleDashedLines(show: boolean): void {
    this.mesh.setOptions({ showDashedLines: show });
  }

  public toggleCoordinateSystem(show: boolean): void {
    this.mesh.setOptions({ showCoordinateSystem: show });
  }

  public toggleEmbeddingBox(show: boolean): void {
    this.mesh.setOptions({ showEmbeddingBox: show });
  }

  public toggleCircumSphere(show: boolean): void {
    this.mesh.setOptions({ showCircumSphere: show });
  }

  public toggleInSphere(show: boolean): void {
    this.mesh.setOptions({ showInSphere: show });
  }

  public toggleClipping(enabled: boolean): void {
    this.mesh.setOptions({ clippingEnabled: enabled });
  }

  public setExplodeDistance(dist: number): void {
    this.mesh.setOptions({ explodeDistance: dist });
  }

  public setUnfoldProgress(progress: number): void {
    this.mesh.setOptions({ unfoldProgress: progress });
  }

  public toggleThreeViews(show: boolean): void {
    this.mesh.setOptions({ showThreeViews: show });
  }

  public toggleMidpoints(show: boolean): void {
    this.mesh.setOptions({ showMidpoints: show });
  }

  public toggleFaceCenters(show: boolean): void {
    this.mesh.setOptions({ showFaceCenters: show });
  }

  public toggleLabels(show: boolean): void {
    this.mesh.setOptions({ showLabels: show });
  }

  public resetView(type: 'iso' | 'front' | 'side' | 'top'): void {
    switch (type) {
      case 'iso':
        this.interactionManager.resetToIsometricView();
        break;
      case 'front':
        this.interactionManager.resetToFrontView();
        break;
      case 'side':
        this.interactionManager.resetToSideView();
        break;
      case 'top':
        this.interactionManager.resetToTopView();
        break;
    }
  }

  public clearAllSegments(): void {
    this.mesh.clearAllSegments();
  }

  public setCustomCrossSectionPlane(plane: THREE.Plane | null): void {
    this.mesh.setOptions({ crossSectionPlane: plane ?? undefined });
  }

  /**
   * Apply classic Gaokao Stereometry Presets
   */
  public applyClassicPreset(preset: 'cube-hexagon' | 'cube-skew-60' | 'tetra-orthogonal' | 'corner-box' | 'cone-conic'): void {
    switch (preset) {
      case 'cube-hexagon': {
        // Cube regular hexagon cross section: passes through 6 edge midpoints
        this.setModelType('cube');
        const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1).normalize(), 0);
        this.mesh.setOptions({
          crossSectionPlane: plane,
          showKeyPoints: true,
          showMidpoints: true,
        });
        break;
      }
      case 'cube-skew-60': {
        // Skew lines in cube: A1B and B1C angle = 60 deg
        this.setModelType('cube');
        this.mesh.clearAllSegments();
        // A1 (index 4) to B (index 1)
        this.mesh.addSegment('v_4', 'v_1', 0x38d9a9);
        // B1 (index 5) to C (index 2)
        this.mesh.addSegment('v_5', 'v_2', 0xffd43b);
        break;
      }
      case 'tetra-orthogonal': {
        // Tetrahedron orthogonal opposite edges: AB ⊥ CD
        this.setModelType('tetrahedron');
        this.mesh.clearAllSegments();
        this.mesh.addSegment('v_0', 'v_1', 0x38d9a9); // AB
        this.mesh.addSegment('v_2', 'v_3', 0xff6b6b); // CD
        this.mesh.setOptions({ showEmbeddingBox: true });
        break;
      }
      case 'corner-box': {
        // Corner pyramid with complementary cuboid embedding
        this.setModelType('corner-pyramid');
        this.mesh.setOptions({
          showEmbeddingBox: true,
          showCircumSphere: true,
        });
        break;
      }
      case 'cone-conic': {
        // Cone cross section
        this.setModelType('cylinder-cone');
        const plane = new THREE.Plane(new THREE.Vector3(0.6, 0.8, 0).normalize(), 0.05);
        this.mesh.setOptions({
          crossSectionPlane: plane,
          clippingEnabled: true,
        });
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // Live Telemetry Provider for UI Status Card
  // -------------------------------------------------------------
  public getStereometryTelemetry(): StereometryTelemetryData {
    const model = this.mesh.getModelDef();
    const opts = this.mesh.getOptions();
    const crossSection = this.mesh.getCrossSectionResult();
    const sphereAnalysis = this.mesh.getSphereAnalysisResult();
    const segments = this.mesh.getSegments();

    // Map vertex coordinates relative to origin
    const originKp = model.keyPoints.find((k) => k.id === (opts.originKeyPointId ?? 'v_0'));
    const originPos = originKp ? originKp.position : new THREE.Vector3(0, 0, 0);

    const vertexCoords = model.vertices.map((v, idx) => {
      const rel = new THREE.Vector3().subVectors(v, originPos);
      return {
        id: `v_${idx}`,
        label: model.vertexLabels[idx],
        coords: [
          parseFloat(rel.x.toFixed(2)),
          parseFloat(rel.y.toFixed(2)),
          parseFloat(rel.z.toFixed(2)),
        ] as [number, number, number],
      };
    });

    // Compute angle between first two drawn segments if at least two exist
    let twoLineAngle: StereometryTelemetryData['twoLineAngle'] = null;
    if (segments.length >= 2) {
      const s1 = segments[0];
      const s2 = segments[1];
      const kp1A = model.keyPoints.find((k) => k.id === s1.pointIdA);
      const kp1B = model.keyPoints.find((k) => k.id === s1.pointIdB);
      const kp2A = model.keyPoints.find((k) => k.id === s2.pointIdA);
      const kp2B = model.keyPoints.find((k) => k.id === s2.pointIdB);

      if (kp1A && kp1B && kp2A && kp2B) {
        const skewRes = GeometrySolver.computeSkewLineMetrics(
          kp1A.position,
          kp1B.position,
          kp2A.position,
          kp2B.position
        );
        twoLineAngle = {
          lineA: s1.label,
          lineB: s2.label,
          type: skewRes.type,
          angleDeg: parseFloat(skewRes.angleDeg.toFixed(1)),
          skewDistance: parseFloat(skewRes.distance.toFixed(3)),
        };
      }
    }

    const V = model.vertices.length;
    const E = model.edges.length;
    const F = model.faces.length;

    return {
      modelId: model.id,
      modelName: model.name,
      modelSubtitle: model.subtitle,
      vertexCount: V,
      edgeCount: E,
      faceCount: F,
      eulerCharacteristic: V - E + F,
      originPointId: opts.originKeyPointId ?? 'v_0',
      originLabel: originKp ? originKp.label : 'O',
      vertexCoords,
      drawnSegments: segments.map((s) => ({
        id: s.id,
        label: s.label,
        length: parseFloat(s.length.toFixed(3)),
      })),
      activeCrossSection: crossSection
        ? {
            polygonType: crossSection.polygonType,
            area: parseFloat(crossSection.area.toFixed(3)),
            perimeter: parseFloat(crossSection.perimeter.toFixed(3)),
            areaRatioToBase: parseFloat(crossSection.areaRatioToBase.toFixed(2)),
            dihedralAngleDeg: parseFloat(crossSection.dihedralAngleWithBaseDeg.toFixed(1)),
            normal: [
              parseFloat(crossSection.normal.x.toFixed(2)),
              parseFloat(crossSection.normal.y.toFixed(2)),
              parseFloat(crossSection.normal.z.toFixed(2)),
            ],
          }
        : null,
      sphereAnalysis,
      twoLineAngle,
      interactionMode: this.interactionMode,
      unfoldProgress: opts.unfoldProgress,
      selectedCutPoints: this.interactionManager
        ? this.interactionManager.getSelectedCutPoints().map((p) => p.label)
        : [],
      modelScale: this.mesh ? this.mesh.getScale() : 1.0,
      interactionHint: this.interactionManager ? this.interactionManager.getInteractionHint() : '',
    };
  }

  public zoom(direction: number): void {
    if (direction > 0) {
      this.interactionManager?.onKeyDown({ code: 'Equal', key: '+', preventDefault: () => {} } as any);
    } else {
      this.interactionManager?.onKeyDown({ code: 'Minus', key: '-', preventDefault: () => {} } as any);
    }
  }

  public resetScale(): void {
    this.interactionManager?.onKeyDown({ code: 'Digit0', key: '0', preventDefault: () => {} } as any);
  }

  public onWheel(event: WheelEvent): void {
    this.interactionManager?.onWheel(event);
  }

  public onKeyDown(event: KeyboardEvent): boolean {
    return this.interactionManager?.onKeyDown(event) ?? false;
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (!this.mesh) return null;
    const hits = raycaster.intersectObjects(this.mesh.getKeyPointMeshes(), false);
    let kp: KeyPoint | null = null;
    if (hits.length > 0 && hits[0].object.userData?.keyPoint) {
      kp = hits[0].object.userData.keyPoint as KeyPoint;
    } else if (this.interactionManager) {
      kp = this.interactionManager.findKeyPointNearRay(raycaster);
    }

    if (kp) {
      this.mesh.setHoveredKeyPoint(kp.id);
      return {
        id: `math_${kp.id}`,
        label: `几何顶点 ${kp.label} (点击选择/连线)`,
        cursor: 'pointer',
      };
    }

    this.mesh.setHoveredKeyPoint(null);
    return null;
  }

  public dispose(_context: ExperimentContext): void {
    this.mesh?.dispose();
    this.rootGroup.clear();
  }
}
