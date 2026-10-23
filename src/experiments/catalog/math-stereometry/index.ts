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
import { buildRecognizedModel, type RecognizedFigure } from '../../../scene/math/figureModel.ts';
import { recognizeStereometryImage } from '../../../scene/math/recognizeFigure.ts';
import { StereometryTouchZoomWidget } from '../../../ui/StereometryTouchZoomWidget.ts';

export interface StereometryTelemetryData {
  modelId: HighSchoolModelType;
  modelName: string;
  modelSubtitle: string;
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  eulerCharacteristic: number; // 欧拉示性数: V - E + F
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
  auxiliaryFaces?: Array<{
    id: string;
    labels: string[];
    faceLabel: string;
    polygonType: string;
    area: number;
    perimeter: number;
    centroid: [number, number, number];
  }>;
}

export default class MathStereometryExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.6;
  public override hideCenterEmitter = true;

  private mesh: StereometryMesh;
  private interactionManager: StereometryInteractionManager;
  private touchZoomWidget: StereometryTouchZoomWidget | null = null;
  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;

  // 状态缓存
  private modelType: HighSchoolModelType = 'cube';
  private dimA = 1;
  private dimH = 1;
  private originPointId = 'v_0';
  private interactionMode: InteractionMode = 'direct';
  private lastTelemetryStateKey = '';
  private cachedTelemetry: StereometryTelemetryData | null = null;
  private static readonly _ORIGIN_ZERO = new THREE.Vector3(0, 0, 0);

  constructor() {
    super();
  }

  public init(context: ExperimentContext): void {
    // 将实验根节点放置于白色桌面上（桌面高度 Y=0.990，HologramStage 偏移 Y=+0.082）
    // 位于前方工作台交互区域（Z=0.72）
    this.rootGroup.position.set(0, 0.082, 0.72);

    // 确保渲染器启用局部剖切 (local clipping)
    if (context.renderer) {
      context.renderer.localClippingEnabled = true;
    }

    this.mesh = new StereometryMesh();
    this.rootGroup.add(this.mesh.group);

    this.interactionManager = new StereometryInteractionManager(this.mesh, {
      onSegmentCreated: (label, len) => {
        console.log(`[Stereometry] Segment created: ${label} (len: ${len.toFixed(3)})`);
      },
      onSegmentRemoved: (label, len) => {
        console.log(`[Stereometry] Segment removed: ${label} (len: ${len.toFixed(3)})`);
      },
      onCrossSectionCreated: (type, area) => {
        console.log(`[Stereometry] Cross-section created: ${type} (area: ${area.toFixed(3)})`);
      },
      onOriginChanged: (kp) => {
        this.originPointId = kp.id;
      },
      onScaleChange: (scale) => {
        this.touchZoomWidget?.updateScale(scale);
      },
    });

    // 默认教科书经典斜二测视角（底面水平）
    this.interactionManager.resetToIsometricView();
  }

  public mount(context: ExperimentContext): void {
    if (context.renderer) {
      context.renderer.localClippingEnabled = true;
    }
    if (typeof document !== 'undefined') {
      this.touchZoomWidget?.destroy();
      this.touchZoomWidget = new StereometryTouchZoomWidget({
        onZoomIn: () => this.zoom(1),
        onZoomOut: () => this.zoom(-1),
        onResetScale: () => this.resetScale(),
      });
      this.touchZoomWidget.updateScale(this.mesh ? this.mesh.getScale() : 1.0);

      // 若白板当前位于前台，在进入实验室视图前先隐藏控件
      const wbRoot = typeof document.getElementById === 'function' ? document.getElementById('whiteboard-app-root') : null;
      if (wbRoot && typeof wbRoot.classList?.contains === 'function' && !wbRoot.classList.contains('hidden-view')) {
        this.touchZoomWidget.setVisible(false);
      }
    }
  }

  public override onViewModeChange(mode: 'whiteboard' | 'laboratory'): void {
    if (this.touchZoomWidget) {
      this.touchZoomWidget.setVisible(mode === 'laboratory');
    }
  }

  public override unmount(_context: ExperimentContext): void {
    this.touchZoomWidget?.destroy();
    this.touchZoomWidget = null;
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    this.interactionManager?.update(delta);
    this.mesh?.update(delta, elapsed, context?.camera);
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

  public override onPointerCancel(): void {
    this.interactionManager?.clearHover();
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
        this.dimA = Math.max(1, Math.round(parseFloat(value) || 1));
        this.mesh.setOptions({ dimensions: { a: this.dimA, h: this.dimH } });
        break;
      case 'dimH':
        this.dimH = Math.max(1, Math.round(parseFloat(value) || 1));
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
  // 公共控制 API（供 VisionOS StereometryStatusCard 调用）
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

  public loadRecognizedFigure(figure: RecognizedFigure): { name: string; subtitle: string } {
    const model = buildRecognizedModel(figure);
    this.modelType = 'recognized';
    this.cachedTelemetry = null;
    this.lastTelemetryStateKey = '';
    this.mesh.loadRecognizedModel(model);
    this.interactionManager?.resetSelection();
    this.interactionManager?.resetToIsometricView();
    return { name: model.name, subtitle: model.subtitle };
  }

  public async recognizeProblemImage(dataUrl: string): Promise<{ name: string; subtitle: string }> {
    const figure = await recognizeStereometryImage(dataUrl);
    return this.loadRecognizedFigure(figure);
  }

  public setDimensions(dims: { a?: number; b?: number; c?: number; h?: number; r?: number }): void {
    if (dims.a !== undefined) this.dimA = Math.max(1, Math.round(dims.a));
    if (dims.h !== undefined) this.dimH = Math.max(1, Math.round(dims.h));
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
   * 应用经典高考立体几何预设
   */
  public applyClassicPreset(preset: 'cube-hexagon' | 'cube-skew-60' | 'tetra-orthogonal' | 'corner-box' | 'cone-conic'): void {
    switch (preset) {
      case 'cube-hexagon': {
        // 正方体正六边形截面：过 6 条棱的中点
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
        // 正方体异面直线：A1B 与 B1C 所成角为 60 度
        this.setModelType('cube');
        this.mesh.clearAllSegments();
        // A1 (索引 4) 至 B (索引 1)
        this.mesh.addSegment('v_4', 'v_1', 0x38d9a9);
        // B1 (索引 5) 至 C (索引 2)
        this.mesh.addSegment('v_5', 'v_2', 0xffd43b);
        break;
      }
      case 'tetra-orthogonal': {
        // 四面体对棱垂直：AB ⊥ CD
        this.setModelType('tetrahedron');
        this.mesh.clearAllSegments();
        this.mesh.addSegment('v_0', 'v_1', 0x38d9a9); // 线段 AB
        this.mesh.addSegment('v_2', 'v_3', 0xff6b6b); // 线段 CD
        this.mesh.setOptions({ showEmbeddingBox: true });
        break;
      }
      case 'corner-box': {
        // 墙角三棱锥及其补形长方体
        this.setModelType('corner-pyramid');
        this.mesh.setOptions({
          showEmbeddingBox: true,
          showCircumSphere: true,
        });
        break;
      }
      case 'cone-conic': {
        // 圆锥截面
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
  // UI 状态卡片实时遥测数据提供器
  // -------------------------------------------------------------
  public getStereometryTelemetry(): StereometryTelemetryData {
    const opts = this.mesh.getOptions();
    const segments = this.mesh.getSegments();
    const auxFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const cutPoints = this.interactionManager ? this.interactionManager.getSelectedCutPoints() : [];
    const planeConstant = opts.crossSectionPlane ? opts.crossSectionPlane.constant.toFixed(3) : 'none';
    const stateKey = `${this.modelType}_${opts.originKeyPointId ?? 'v_0'}_${segments.length}_${auxFaces.length}_${cutPoints.length}_${opts.unfoldProgress}_${opts.clippingEnabled}_${planeConstant}_${opts.explodeDistance}_${this.interactionMode}_${this.mesh.getScale()}_${opts.dimensions?.a}_${opts.dimensions?.h}`;

    if (this.cachedTelemetry && stateKey === this.lastTelemetryStateKey) {
      return this.cachedTelemetry;
    }
    this.lastTelemetryStateKey = stateKey;

    const model = this.mesh.getModelDef();
    const crossSection = this.mesh.getCrossSectionResult();
    const sphereAnalysis = this.mesh.getSphereAnalysisResult();

    // 映射相对于原点的顶点坐标
    const originKp = model.keyPoints.find((k) => k.id === (opts.originKeyPointId ?? 'v_0'));
    const originPos = originKp ? originKp.position : MathStereometryExperiment._ORIGIN_ZERO;

    const vertexCoords = model.vertices.map((v, idx) => {
      const relX = Math.round((v.x - originPos.x) * 100) / 100;
      const relY = Math.round((v.y - originPos.y) * 100) / 100;
      const relZ = Math.round((v.z - originPos.z) * 100) / 100;
      return {
        id: `v_${idx}`,
        label: model.vertexLabels[idx],
        coords: [relX, relY, relZ] as [number, number, number],
      };
    });

    // 若存在至少两条绘制线段，则计算前两条线段所成夹角
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
          angleDeg: Math.round(skewRes.angleDeg * 10) / 10,
          skewDistance: Math.round(skewRes.distance * 1000) / 1000,
        };
      }
    }

    const V = model.vertices.length;
    const E = model.edges.length;
    const F = model.faces.length;

    const result: StereometryTelemetryData = {
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
        length: Math.round(s.length * 1000) / 1000,
      })),
      activeCrossSection: crossSection
        ? {
            polygonType: crossSection.polygonType,
            area: Math.round(crossSection.area * 1000) / 1000,
            perimeter: Math.round(crossSection.perimeter * 1000) / 1000,
            areaRatioToBase: Math.round(crossSection.areaRatioToBase * 100) / 100,
            dihedralAngleDeg: Math.round(crossSection.dihedralAngleWithBaseDeg * 10) / 10,
            normal: [
              Math.round(crossSection.normal.x * 100) / 100,
              Math.round(crossSection.normal.y * 100) / 100,
              Math.round(crossSection.normal.z * 100) / 100,
            ],
          }
        : null,
      sphereAnalysis,
      twoLineAngle,
      interactionMode: this.interactionMode,
      unfoldProgress: opts.unfoldProgress,
      selectedCutPoints: cutPoints.map((p) => p.label),
      modelScale: this.mesh ? this.mesh.getScale() : 1.0,
      interactionHint: this.interactionManager ? this.interactionManager.getInteractionHint() : '',
      auxiliaryFaces: auxFaces.map((f) => ({
        id: f.id,
        labels: f.labels,
        faceLabel: f.faceLabel,
        polygonType: f.polygonType,
        area: Math.round(f.area * 1000) / 1000,
        perimeter: Math.round(f.perimeter * 1000) / 1000,
        centroid: [
          Math.round(f.centroid.x * 1000) / 1000,
          Math.round(f.centroid.y * 1000) / 1000,
          Math.round(f.centroid.z * 1000) / 1000,
        ] as [number, number, number],
      })),
    };

    this.cachedTelemetry = result;
    return result;
  }

  public zoom(direction: number): void {
    if (direction > 0) {
      const s = this.interactionManager?.zoomIn() ?? (this.mesh ? this.mesh.zoom(1.10) : 1.0);
      this.touchZoomWidget?.updateScale(s);
    } else {
      const s = this.interactionManager?.zoomOut() ?? (this.mesh ? this.mesh.zoom(0.90) : 1.0);
      this.touchZoomWidget?.updateScale(s);
    }
  }

  public resetScale(): void {
    const s = this.interactionManager?.resetScale() ?? (this.mesh ? (this.mesh.setScale(1.0), 1.0) : 1.0);
    this.touchZoomWidget?.updateScale(s);
  }

  public setScale(scale: number): number {
    const s = this.interactionManager?.setScale(scale) ?? (this.mesh ? (this.mesh.setScale(scale), this.mesh.getScale()) : 1.0);
    this.touchZoomWidget?.updateScale(s);
    return s;
  }

  public getScale(): number {
    return this.interactionManager?.getScale() ?? (this.mesh ? this.mesh.getScale() : 1.0);
  }

  public getTouchZoomWidget(): StereometryTouchZoomWidget | null {
    return this.touchZoomWidget;
  }

  public onTouchStart(event: TouchEvent, context: ExperimentContext): boolean {
    return this.interactionManager?.onTouchStart(event, context) ?? false;
  }

  public onTouchMove(event: TouchEvent, context: ExperimentContext): boolean {
    return this.interactionManager?.onTouchMove(event, context) ?? false;
  }

  public onTouchEnd(event: TouchEvent, context: ExperimentContext): void {
    this.interactionManager?.onTouchEnd(event, context);
  }

  public onTouchCancel(event: TouchEvent): void {
    this.interactionManager?.onTouchCancel(event);
  }

  public onGestureStart(event: any): void {
    this.interactionManager?.onGestureStart(event);
  }

  public onGestureChange(event: any): void {
    this.interactionManager?.onGestureChange(event);
  }

  public onGestureEnd(event: any): void {
    this.interactionManager?.onGestureEnd(event);
  }

  public onWheel(event: WheelEvent): void {
    this.interactionManager?.onWheel(event);
    if (this.mesh && this.touchZoomWidget) {
      this.touchZoomWidget.updateScale(this.mesh.getScale());
    }
  }

  public onKeyDown(event: KeyboardEvent): boolean {
    const handled = this.interactionManager?.onKeyDown(event) ?? false;
    if (this.mesh && this.touchZoomWidget) {
      this.touchZoomWidget.updateScale(this.mesh.getScale());
    }
    return handled;
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (!this.mesh) return null;
    let kp: KeyPoint | null = null;
    if (this.interactionManager) {
      kp = this.interactionManager.findKeyPointNearRay(raycaster);
    }
    if (!kp) {
      const hits = raycaster.intersectObjects(this.mesh.getKeyPointMeshes(), false);
      if (hits.length > 0 && hits[0].object.userData?.keyPoint) {
        kp = hits[0].object.userData.keyPoint as KeyPoint;
      }
    }

    if (kp) {
      let desc = `顶点 ${kp.label}`;
      if (kp.subLabel === '1/2') {
        const edge = kp.edgeVertices ? `${kp.edgeVertices[0]}${kp.edgeVertices[1]}` : '';
        desc = `棱 ${edge} 中点 (1/2)`;
      } else if (kp.subLabel === '1/3') {
        const edge = kp.edgeVertices ? `${kp.edgeVertices[0]}${kp.edgeVertices[1]}` : '';
        desc = `棱 ${edge} 三等分点 (1/3)`;
      } else if (kp.subLabel === '2/3') {
        const edge = kp.edgeVertices ? `${kp.edgeVertices[0]}${kp.edgeVertices[1]}` : '';
        desc = `棱 ${edge} 三等分点 (2/3)`;
      } else if (kp.type === 'center') {
        desc = `${kp.label} (中心点)`;
      }
      this.mesh.setHoveredKeyPoint(kp.id, desc);
      return {
        id: `math_${kp.id}`,
        label: `${desc} · 点击或拖拽接线`,
        cursor: 'pointer',
      };
    }

    this.mesh.setHoveredKeyPoint(null);
    return null;
  }

  public undoLastSegment(): any {
    return this.interactionManager?.undoLastSegment();
  }

  public clearHover(): void {
    this.interactionManager?.clearHover();
  }

  public dispose(_context: ExperimentContext): void {
    this.touchZoomWidget?.destroy();
    this.touchZoomWidget = null;
    this.mesh?.dispose();
    this.rootGroup.clear();
  }
}
