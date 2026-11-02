import { labPointerNDC } from '../../controls/LabPointerInput.ts';
import * as THREE from 'three';
import type { StereometryMesh, DrawnSegment } from './StereometryMesh.ts';
import { GeometrySolver, type KeyPoint } from './GeometrySolver.ts';
import type { AuxiliaryFace } from './AuxiliaryFaceSolver.ts';
import type { ExperimentContext } from '../../core/types.ts';
import { AppleHapticAudio } from './AppleHapticAudio.ts';

export type InteractionMode =
  | 'direct'          // 自然交互 (模型内选点连线，模型外空白旋转)
  | 'orbit'           // 显式自由旋转模式
  | 'connect-line'    // 两点接线模式
  | 'three-point-cut' // 三点定面截面模式
  | 'set-origin';     // 选取原点建系模式

export interface StereometryInteractionCallbacks {
  onKeyPointClick?: (point: KeyPoint, mode: InteractionMode) => void;
  onKeyPointHover?: (point: KeyPoint | null, snapLabel?: string) => void;
  onSegmentCreated?: (segLabel: string, length: number) => void;
  onSegmentRemoved?: (segLabel: string, length: number) => void;
  onAuxiliaryFaceCreated?: (face: AuxiliaryFace) => void;
  onAuxiliaryFaceRemoved?: (faceId: string) => void;
  onCrossSectionCreated?: (type: string, area: number) => void;
  onOriginChanged?: (point: KeyPoint) => void;
  onScaleChange?: (scale: number) => void;
  onClearSegments?: () => void;
  onGuidanceChange?: (hint: string, type?: 'info' | 'active' | 'success' | 'warn', colorHex?: number) => void;
}

type PointerZone = 'keypoint' | 'model-surface' | 'outside';

interface ResolvedPointerTarget {
  zone: PointerZone;
  keyPoint: KeyPoint | null;
  snapLabel: string;
  isHittingSurface: boolean;
}

interface RecentSnapLock {
  kp: KeyPoint;
  snapLabel: string;
  screenX: number;
  screenY: number;
  timestamp: number;
}

type PointerSession =
  | { kind: 'idle' }
  | { kind: 'pinch-zoom'; initialDist: number; initialScale: number }
  | { kind: 'pinch-cooldown' }
  | {
      kind: 'segment-long-press';
      pointerId: number;
      segment: DrawnSegment;
      hitPoint3D: THREE.Vector3;
      downX: number;
      downY: number;
      downTime: number;
      isVision: boolean;
      isTouch: boolean;
      completed: boolean;
    }
  | {
      kind: 'point-gesture';
      pointerId: number;
      startKp: KeyPoint;
      downX: number;
      downY: number;
      downTime: number;
      movedPastThreshold: boolean;
      isVision: boolean;
      isTouch: boolean;
    }
  | {
      kind: 'model-surface';
      pointerId: number;
      downX: number;
      downY: number;
      lastX: number;
      lastY: number;
      downTime: number;
      movedPastThreshold: boolean;
      orbiting: boolean;
      isVision: boolean;
      isTouch: boolean;
    }
  | {
      kind: 'orbit-outside';
      pointerId: number;
      downX: number;
      downY: number;
      lastX: number;
      lastY: number;
      downTime: number;
      orbiting: boolean;
      isVision: boolean;
      isTouch: boolean;
    };

export class StereometryInteractionManager {
  private mesh: StereometryMesh;
  private callbacks: StereometryInteractionCallbacks;
  private currentMode: InteractionMode = 'direct';

  // 连线与剖切业务状态
  private pendingStartPoint: KeyPoint | null = null;
  private chainStartPoint: KeyPoint | null = null;
  private currentHoveredKp: KeyPoint | null = null;
  private currentSnapLabel = '';
  private selectedCutPoints: KeyPoint[] = [];

  // 单一判别式指针会话状态机（消除多重布尔标志冲突）
  private session: PointerSession = { kind: 'idle' };
  private activePointers = new Map<number, { x: number; y: number }>();

  // 捏合前时间窗悬停锁定：抵消隔空手指闭合瞬间的光标微移
  private recentSnapLock: RecentSnapLock | null = null;

  // 平滑轨道旋转与惯性状态
  private rotationVelocity = new THREE.Vector2(0, 0);
  private targetRotationX = 0;
  private targetRotationY = 0;

  // 交互像素与空间阈值配置
  private readonly TAP_SLOP_VISION = 48;
  private readonly TAP_SLOP_TOUCH = 26;
  private readonly TAP_SLOP_MOUSE = 12;
  private readonly ORBIT_DRAG_THRESHOLD_VISION = 8;
  private readonly ORBIT_DRAG_THRESHOLD_TOUCH = 12;
  private readonly ORBIT_DRAG_THRESHOLD_MOUSE = 5;

  private readonly SNAP_THRESHOLD_VISION = 0.096;
  private readonly SNAP_THRESHOLD_TOUCH = 0.084;
  private readonly SNAP_THRESHOLD_MOUSE = 0.058;
  private readonly PRE_PINCH_LOCK_MS = 300;

  // 零分配复用计算对象
  private readonly internalRaycaster = new THREE.Raycaster();
  private readonly scratchScale = new THREE.Vector3(1, 1, 1);
  private readonly scratchWorldPos = new THREE.Vector3();
  private readonly scratchLabelDir = new THREE.Vector3();
  private readonly scratchLabelWorld = new THREE.Vector3();
  private readonly scratchProjected = new THREE.Vector3();
  private readonly scratchPlaneNormal = new THREE.Vector3();
  private readonly scratchPlaneHit = new THREE.Vector3();
  private readonly scratchInvMatrix = new THREE.Matrix4();
  private readonly scratchDragPlane = new THREE.Plane();

  constructor(mesh: StereometryMesh, callbacks: StereometryInteractionCallbacks = {}) {
    this.mesh = mesh;
    this.callbacks = callbacks;
  }

  // -------------------------------------------------------------
  // 状态机派生只读访问器（完整兼容诊断遥测与单元测试断言）
  // -------------------------------------------------------------
  public get isPointerDown(): boolean {
    return (
      this.session.kind === 'point-gesture' ||
      this.session.kind === 'model-surface' ||
      this.session.kind === 'orbit-outside' ||
      this.session.kind === 'segment-long-press'
    );
  }

  public set isPointerDown(val: boolean) {
    if (!val && this.isPointerDown) {
      this.session = { kind: 'idle' };
    } else if (val && !this.isPointerDown) {
      this.session = {
        kind: 'orbit-outside',
        pointerId: 1,
        downX: 0,
        downY: 0,
        lastX: 0,
        lastY: 0,
        downTime: performance.now(),
        orbiting: false,
        isVision: false,
        isTouch: false,
      };
    }
  }

  public get dragStartKp(): KeyPoint | null {
    return this.session.kind === 'point-gesture' ? this.session.startKp : null;
  }

  public get isConnectingDrag(): boolean {
    return this.session.kind === 'point-gesture';
  }

  public get isOrbitDragging(): boolean {
    return (
      (this.session.kind === 'orbit-outside' && this.session.orbiting) ||
      (this.session.kind === 'model-surface' && this.session.orbiting)
    );
  }

  public set isOrbitDragging(val: boolean) {
    if (!val && this.isOrbitDragging) {
      if (this.session.kind === 'orbit-outside' || this.session.kind === 'model-surface') {
        this.session.orbiting = false;
      }
    } else if (val && !this.isOrbitDragging) {
      this.session = {
        kind: 'orbit-outside',
        pointerId: 1,
        downX: 0,
        downY: 0,
        lastX: 0,
        lastY: 0,
        downTime: performance.now(),
        orbiting: true,
        isVision: false,
        isTouch: false,
      };
    }
  }

  public get hasMovedPastDragThreshold(): boolean {
    if (this.session.kind === 'point-gesture' || this.session.kind === 'model-surface') {
      return this.session.movedPastThreshold;
    }
    if (this.session.kind === 'orbit-outside') {
      return this.session.orbiting;
    }
    return false;
  }

  public get isPointerDownOnModel(): boolean {
    return this.session.kind === 'point-gesture' || this.session.kind === 'model-surface';
  }

  public get isPinching(): boolean {
    return this.session.kind === 'pinch-zoom';
  }

  public get pinchCooldown(): boolean {
    return this.session.kind === 'pinch-cooldown';
  }

  // -------------------------------------------------------------
  // 模式与选择生命周期
  // -------------------------------------------------------------
  public setMode(mode: InteractionMode): void {
    this.currentMode = mode;
    this.resetSelection();
  }

  public getMode(): InteractionMode {
    return this.currentMode;
  }

  public getSelectedCutPoints(): KeyPoint[] {
    return [...this.selectedCutPoints];
  }

  public resetSelection(suppressGuidance = false): void {
    const wasPending = Boolean(this.pendingStartPoint) || this.session.kind === 'point-gesture';
    this.chainStartPoint = null;
    this.pendingStartPoint = null;
    this.selectedCutPoints = [];
    if (this.session.kind === 'point-gesture') {
      this.session = { kind: 'idle' };
    }
    this.mesh.setSelectedKeyPoints([]);
    this.mesh.clearPreviewWire();
    if (wasPending && !suppressGuidance) {
      this.callbacks.onGuidanceChange?.('已取消连线选择', 'info');
    }
  }

  public undoLastSegment(): any {
    const prevFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const seg = this.mesh.undoLastSegment();
    if (seg) {
      const newFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
      this.callbacks.onSegmentRemoved?.(seg.label, seg.length);
      if (prevFaces.length > newFaces.length) {
        const removedFace =
          prevFaces.find((pf) => !newFaces.some((nf) => nf.id === pf.id)) ||
          prevFaces[prevFaces.length - 1];
        this.callbacks.onAuxiliaryFaceRemoved?.(removedFace.id);
        this.callbacks.onGuidanceChange?.(
          `已撤销辅助线 ${seg.label}，并移除关联辅助面 ${removedFace.faceLabel}`,
          'warn'
        );
      } else {
        this.callbacks.onGuidanceChange?.(`已撤销辅助线 ${seg.label}`, 'warn');
      }
    }
    return seg;
  }

  public clearAll(): void {
    this.resetSelection();
    this.mesh.clearAllSegments();
    this.mesh.setOptions({ crossSectionPlane: undefined, clippingEnabled: false });
    this.callbacks.onClearSegments?.();
    this.callbacks.onGuidanceChange?.('已清空所有辅助线与辅助面', 'warn');
  }

  public clearHover(): void {
    if (this.session.kind === 'segment-long-press') {
      if (typeof this.mesh.cancelSegmentLongPress === 'function') {
        this.mesh.cancelSegmentLongPress();
      }
    }
    if (typeof this.mesh.setHoveredSegment === 'function') {
      this.mesh.setHoveredSegment(null);
    }
    this.currentHoveredKp = null;
    this.currentSnapLabel = '';
    this.recentSnapLock = null;
    this.session = { kind: 'idle' };
    this.activePointers.clear();
    this.rotationVelocity.set(0, 0);
    this.mesh?.setHoveredKeyPoint(null);
    this.mesh?.clearPreviewWire();
    this.callbacks.onKeyPointHover?.(null);
    this.callbacks.onGuidanceChange?.(
      '在模型上轻触或拖拽棱上端点/中点/三等分点接线 · 在模型外空白处滑动旋转视角',
      'info'
    );
    if (typeof document !== 'undefined' && document.body?.style) {
      document.body.style.cursor = 'default';
    }
  }

  public isInteractingWithModel(): boolean {
    return this.session.kind !== 'idle';
  }

  public isVisionModelInteractionActive(): boolean {
    return Boolean(
      this.session.kind !== 'idle' ||
        this.pendingStartPoint !== null ||
        this.selectedCutPoints.length > 0 ||
        this.currentHoveredKp !== null
    );
  }

  public findKeyPointNearRay(raycaster: THREE.Raycaster, threshold?: number): KeyPoint | null {
    const effectiveThreshold = threshold ?? this.SNAP_THRESHOLD_MOUSE * this.getModelWorldScale();
    const res = this.mesh.findClosestSnapPoint(raycaster.ray, effectiveThreshold, { onlyOnEdgeOrLine: true });
    return res ? res.keyPoint : null;
  }

  // -------------------------------------------------------------
  // 统一空间 + 屏幕像素混合目标解析器（彻底隔离模型内选点与模型外旋转）
  // -------------------------------------------------------------
  private isVisionGestureEvent(event?: Partial<PointerEvent> | null): boolean {
    return Boolean(event && (event as any).__visionGesture);
  }

  private getModelWorldScale(): number {
    if (this.mesh?.modelContainer) {
      this.mesh.modelContainer.updateMatrixWorld(false);
      this.mesh.modelContainer.getWorldScale(this.scratchScale);
      if (Number.isFinite(this.scratchScale.x) && this.scratchScale.x > 0.01) {
        return this.scratchScale.x;
      }
    }
    return this.mesh?.getScale?.() ?? 1.0;
  }

  private getEffectiveSnapThreshold(isVision: boolean, isTouch: boolean): number {
    const base = isVision
      ? this.SNAP_THRESHOLD_VISION
      : isTouch
      ? this.SNAP_THRESHOLD_TOUCH
      : this.SNAP_THRESHOLD_MOUSE;
    return base * this.getModelWorldScale();
  }

  private getEffectiveTapSlop(isVision: boolean, isTouch: boolean): number {
    if (isVision) return this.TAP_SLOP_VISION;
    if (isTouch) return this.TAP_SLOP_TOUCH;
    return this.TAP_SLOP_MOUSE;
  }

  private getOrbitDragThreshold(isVision: boolean, isTouch: boolean): number {
    if (isVision) return this.ORBIT_DRAG_THRESHOLD_VISION;
    if (isTouch) return this.ORBIT_DRAG_THRESHOLD_TOUCH;
    return this.ORBIT_DRAG_THRESHOLD_MOUSE;
  }

  private getViewportBounds(context?: ExperimentContext): { left: number; top: number; width: number; height: number } {
    const dom = context?.renderer?.domElement as any;
    if (dom && typeof dom.getBoundingClientRect === 'function') {
      const rect = dom.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }
    const w = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1920;
    const h = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 1080;
    return { left: 0, top: 0, width: w, height: h };
  }

  /**
   * 计算指针与关键点（及其外偏字母标号）的真实屏幕 2D 像素距离，
   * 确保在任意缩放倍率 (35%~300%) 下模型外部空白处绝不会被 3D 阈值越界劫持。
   */
  private computeKeyPointScreenDistancePx(
    kp: KeyPoint,
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    bounds: { left: number; top: number; width: number; height: number }
  ): number {
    this.mesh.modelContainer.updateMatrixWorld(false);
    this.scratchWorldPos.copy(kp.position).applyMatrix4(this.mesh.modelContainer.matrixWorld);
    this.scratchProjected.copy(this.scratchWorldPos).project(camera);
    const sx = bounds.left + ((this.scratchProjected.x + 1) * 0.5) * bounds.width;
    const sy = bounds.top + ((-this.scratchProjected.y + 1) * 0.5) * bounds.height;
    let minPx = Math.hypot(clientX - sx, clientY - sy);

    if (kp.type === 'vertex' || kp.type === 'custom') {
      this.scratchLabelDir.copy(kp.position);
      if (this.scratchLabelDir.lengthSq() < 1e-4) {
        this.scratchLabelDir.set(0, 1, 0);
      } else {
        this.scratchLabelDir.normalize();
      }
      this.scratchLabelWorld
        .copy(kp.position)
        .addScaledVector(this.scratchLabelDir, 0.042)
        .applyMatrix4(this.mesh.modelContainer.matrixWorld);
      this.scratchProjected.copy(this.scratchLabelWorld).project(camera);
      const lx = bounds.left + ((this.scratchProjected.x + 1) * 0.5) * bounds.width;
      const ly = bounds.top + ((-this.scratchProjected.y + 1) * 0.5) * bounds.height;
      const labelPx = Math.hypot(clientX - lx, clientY - ly);
      if (labelPx < minPx) {
        minPx = labelPx;
      }
    }

    return minPx;
  }

  private isSurfaceHit(hit: THREE.Intersection | null | undefined): boolean {
    const obj = hit?.object;
    if (!obj) return false;
    if (typeof (this.mesh as any).isSurfaceObject === 'function') {
      return this.mesh.isSurfaceObject(obj);
    }
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.name === 'math_hit_envelope') return false;
      if (cur === this.mesh.modelContainer) return true;
      cur = cur.parent;
    }
    return false;
  }

  private resolvePointerTarget(
    clientX: number,
    clientY: number,
    hit: THREE.Intersection | null | undefined,
    isVision: boolean,
    isTouch: boolean,
    context?: ExperimentContext,
    snapMultiplier = 1.0
  ): ResolvedPointerTarget {
    if (!context?.camera) {
      const surfaceHit = hit ? this.isSurfaceHit(hit) : true;
      return {
        zone: surfaceHit ? 'model-surface' : 'outside',
        keyPoint: null,
        snapLabel: '',
        isHittingSurface: surfaceHit,
      };
    }

    const mouseNDC = labPointerNDC({ clientX, clientY }, context?.renderer?.domElement);
    this.internalRaycaster.setFromCamera(mouseNDC, context.camera);

    const isHittingSurface =
      this.isSurfaceHit(hit) ||
      (typeof this.mesh.isRayHittingModel === 'function'
        ? this.mesh.isRayHittingModel(this.internalRaycaster.ray)
        : false);

    if (this.currentMode === 'orbit') {
      return {
        zone: isHittingSurface ? 'model-surface' : 'outside',
        keyPoint: null,
        snapLabel: '',
        isHittingSurface,
      };
    }

    const snapThreshold3D = this.getEffectiveSnapThreshold(isVision, isTouch) * snapMultiplier;
    const snapRes =
      typeof this.mesh.getModelDef === 'function'
        ? this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold3D, {
            onlyOnEdgeOrLine: true,
          })
        : null;

    if (snapRes) {
      const bounds = this.getViewportBounds(context);
      const screenPx = this.computeKeyPointScreenDistancePx(
        snapRes.keyPoint,
        clientX,
        clientY,
        context.camera,
        bounds
      );
      const isPrimaryVertex = snapRes.keyPoint.type === 'vertex' || snapRes.keyPoint.type === 'custom';

      // 屏幕像素双重门控：
      // 1) 在几何体轮廓外：允许精准吸附轮廓顶点及外偏字母标号 (A, B, A₁...)，严禁向远处空白区域外溢而阻断右手捏合旋转模型
      // 2) 在几何体表面内：允许舒适磁吸棱上关键点，同时保留宽敞面中心空白区不被远端棱抢占
      const maxOutsidePx = (isVision ? (isPrimaryVertex ? 42 : 28) : isTouch ? (isPrimaryVertex ? 36 : 24) : (isPrimaryVertex ? 26 : 18)) * snapMultiplier;
      const maxInsidePx = (isVision ? 58 : isTouch ? 48 : 34) * snapMultiplier;
      const allowedPx = isHittingSurface ? maxInsidePx : maxOutsidePx;

      if (screenPx <= allowedPx) {
        return {
          zone: 'keypoint',
          keyPoint: snapRes.keyPoint,
          snapLabel: snapRes.snapLabel,
          isHittingSurface: true,
        };
      }
    }

    return {
      zone: isHittingSurface ? 'model-surface' : 'outside',
      keyPoint: null,
      snapLabel: '',
      isHittingSurface,
    };
  }

  private projectRayToLocalPlane(anchorLocalPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 | null {
    camera.getWorldDirection(this.scratchPlaneNormal).negate();
    this.mesh.modelContainer.updateMatrixWorld(false);
    this.scratchWorldPos.copy(anchorLocalPos).applyMatrix4(this.mesh.modelContainer.matrixWorld);
    this.scratchDragPlane.setFromNormalAndCoplanarPoint(this.scratchPlaneNormal, this.scratchWorldPos);
    if (!this.internalRaycaster.ray.intersectPlane(this.scratchDragPlane, this.scratchPlaneHit)) {
      return null;
    }
    this.scratchInvMatrix.copy(this.mesh.modelContainer.matrixWorld).invert();
    return this.scratchPlaneHit.applyMatrix4(this.scratchInvMatrix).clone();
  }

  // -------------------------------------------------------------
  // 核心指针事件流：onPointerDown / onPointerMove / onPointerUp
  // -------------------------------------------------------------
  public onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (event.button !== 0) return false;

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // 1. 双指触控捏合缩放：高于一切单指手势，立即干净接管
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const initialDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const initialScale = this.mesh.getScale();
      this.session = { kind: 'pinch-zoom', initialDist, initialScale };
      this.rotationVelocity.set(0, 0);
      this.mesh.setHoveredKeyPoint(null);
      if (!this.pendingStartPoint) {
        this.mesh.clearPreviewWire();
      }
      this.callbacks.onGuidanceChange?.(`双指捏合缩放 · 当前: ${Math.round(initialScale * 100)}%`, 'info');
      return true;
    }

    if (this.session.kind === 'pinch-cooldown') {
      return false;
    }

    const isTouch = event.pointerType === 'touch';
    const isVision = this.isVisionGestureEvent(event);
    const now = performance.now();

    let resolved = this.resolvePointerTarget(event.clientX, event.clientY, hit, isVision, isTouch, context);

    // 2. 捏合前时间窗悬停锁定补偿：
    // 用户瞄准顶点/中点后捏合手指的 200~300ms 内，即使食指与拇指靠拢引起轻微屏幕偏移，依然精准锁定目标点！
    // 若右手已明确移至模型外空白区域 (!resolved.isHittingSurface)，则使用紧凑半径 (26px) 防止模型外旋转被刚刚滑过的边缘关键点拦截。
    if (
      resolved.zone !== 'keypoint' &&
      this.currentMode !== 'orbit' &&
      this.recentSnapLock &&
      now - this.recentSnapLock.timestamp <= this.PRE_PINCH_LOCK_MS
    ) {
      const lockRadiusPx = resolved.isHittingSurface
        ? (isVision ? 52 : isTouch ? 36 : 20)
        : (isVision ? 26 : isTouch ? 20 : 14);
      const driftPx = Math.hypot(
        event.clientX - this.recentSnapLock.screenX,
        event.clientY - this.recentSnapLock.screenY
      );
      if (driftPx <= lockRadiusPx) {
        resolved = {
          zone: 'keypoint',
          keyPoint: this.recentSnapLock.kp,
          snapLabel: this.recentSnapLock.snapLabel,
          isHittingSurface: true,
        };
      }
    }

    this.syncTargetRotationWithMesh();
    this.rotationVelocity.set(0, 0);

    // 分支 A：锁定关键点 -> 进入选点/拖拽连线会话（严禁触发任何旋转）
    if (resolved.zone === 'keypoint' && resolved.keyPoint) {
      const snapKp = resolved.keyPoint;
      const snapLabel = resolved.snapLabel || snapKp.label;
      this.session = {
        kind: 'point-gesture',
        pointerId: event.pointerId,
        startKp: snapKp,
        downX: event.clientX,
        downY: event.clientY,
        downTime: now,
        movedPastThreshold: false,
        isVision,
        isTouch,
      };

      this.currentHoveredKp = snapKp;
      this.currentSnapLabel = snapLabel;
      this.mesh.setHoveredKeyPoint(snapKp.id, snapLabel);

      const snapColor = this.getKeyPointColor(snapKp);
      if (this.pendingStartPoint && this.pendingStartPoint.id !== snapKp.id) {
        const len = this.pendingStartPoint.position.distanceTo(snapKp.position);
        const badgeText = this.mesh.formatNormalizedDistance(len);
        this.mesh.updatePreviewWire(
          this.pendingStartPoint.position,
          snapKp.position,
          0x7c3aed,
          badgeText,
          context?.camera,
          { snapped: true, smooth: false }
        );
        this.callbacks.onGuidanceChange?.(
          `已锁定目标 ${snapLabel} · 松开完成接线`,
          'active',
          snapColor
        );
      } else {
        this.callbacks.onGuidanceChange?.(
          `已按住起点 ${snapLabel} · 拖拽至目标点接线 (或松开选定)`,
          'active',
          snapColor
        );
      }
      return true;
    }

    // 优先检测：是否点中或按住了已绘制的辅助线（含其长度数值标牌） -> 触发苹果原生动效长按消除
    const bounds = this.getViewportBounds(context);
    const maxSegmentHitPx = isVision ? 44 : isTouch ? 34 : 22;
    const hitSeg = typeof this.mesh.findClosestDrawnSegment === 'function'
      ? this.mesh.findClosestDrawnSegment(
          this.internalRaycaster.ray,
          event.clientX,
          event.clientY,
          context?.camera,
          bounds,
          maxSegmentHitPx
        )
      : null;

    if (hitSeg && (!resolved.keyPoint || resolved.zone !== 'keypoint')) {
      if (this.pendingStartPoint) {
        this.resetSelection(true);
      }
      this.currentHoveredKp = null;
      this.currentSnapLabel = '';
      this.recentSnapLock = null;
      this.mesh.setHoveredKeyPoint(null);
      this.mesh.clearPreviewWire();

      this.session = {
        kind: 'segment-long-press',
        pointerId: event.pointerId,
        segment: hitSeg.segment,
        hitPoint3D: hitSeg.hitPoint3D,
        downX: event.clientX,
        downY: event.clientY,
        downTime: now,
        isVision,
        isTouch,
        completed: false,
      };

      if (typeof this.mesh.startSegmentLongPress === 'function') {
        this.mesh.startSegmentLongPress(hitSeg.segment.id, hitSeg.hitPoint3D);
      }
      AppleHapticAudio.playTick();
      this.callbacks.onGuidanceChange?.(
        `按住消除辅助线 ${hitSeg.segment.label}...`,
        'active',
        0xf43f5e
      );
      return true;
    }

    // 分支 B：落在几何体外部空白区 -> 立即终止任何活跃连线，并准备自由顺畅旋转模型
    if (resolved.zone === 'outside') {
      if (this.pendingStartPoint || this.selectedCutPoints.length > 0) {
        this.resetSelection(true);
        const cancelMsg = isVision ? '右手在模型外捏合，接线已停止' : '在模型外点击，接线已停止';
        this.callbacks.onGuidanceChange?.(cancelMsg, 'info');
      }
      this.currentHoveredKp = null;
      this.currentSnapLabel = '';
      this.recentSnapLock = null;
      this.mesh.setHoveredKeyPoint(null);
      this.mesh.clearPreviewWire();

      this.session = {
        kind: 'orbit-outside',
        pointerId: event.pointerId,
        downX: event.clientX,
        downY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        downTime: now,
        orbiting: false,
        isVision,
        isTouch,
      };
      return true;
    }

    // 分支 C：落在几何体晶面内部（非关键点） -> 屏蔽误触旋转（除非显式处于 'orbit' 模式）
    this.session = {
      kind: 'model-surface',
      pointerId: event.pointerId,
      downX: event.clientX,
      downY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      downTime: now,
      movedPastThreshold: false,
      orbiting: false,
      isVision,
      isTouch,
    };
    return true;
  }

  public onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // 1. 双指捏合缩放
    if (this.session.kind === 'pinch-zoom' && this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.session.initialDist > 5) {
        const factor = currentDist / this.session.initialDist;
        const newScale = THREE.MathUtils.clamp(this.session.initialScale * factor, 0.35, 3.0);
        this.mesh.setScale(newScale);
        this.callbacks.onScaleChange?.(newScale);
        this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'active');
      }
      return;
    }

    if (this.session.kind === 'pinch-cooldown') {
      return;
    }

    // 2. 连线长按会话：位移一旦超出容差 tapSlop，立即取消长按蓄力，平滑转为轨道旋转
    if (this.session.kind === 'segment-long-press') {
      const dist = Math.hypot(event.clientX - this.session.downX, event.clientY - this.session.downY);
      const tapSlop = this.getEffectiveTapSlop(this.session.isVision, this.session.isTouch);
      if (dist > tapSlop) {
        if (typeof this.mesh.cancelSegmentLongPress === 'function') {
          this.mesh.cancelSegmentLongPress();
        }
        AppleHapticAudio.playCancel();
        this.session = {
          kind: 'model-surface',
          pointerId: event.pointerId,
          downX: this.session.downX,
          downY: this.session.downY,
          lastX: event.clientX,
          lastY: event.clientY,
          downTime: this.session.downTime,
          movedPastThreshold: true,
          orbiting: true,
          isVision: this.session.isVision,
          isTouch: this.session.isTouch,
        };
        this.callbacks.onGuidanceChange?.('已取消消除操作', 'info');
      }
      return;
    }

    // 3. 模型外部轨道旋转会话
    if (this.session.kind === 'orbit-outside') {
      const totalDist = Math.hypot(event.clientX - this.session.downX, event.clientY - this.session.downY);
      const orbitThreshold = this.getOrbitDragThreshold(this.session.isVision, this.session.isTouch);

      if (!this.session.orbiting) {
        if (totalDist < orbitThreshold) {
          this.session.lastX = event.clientX;
          this.session.lastY = event.clientY;
          return;
        }
        this.session.orbiting = true;
      }

      const dx = event.clientX - this.session.lastX;
      const dy = event.clientY - this.session.lastY;
      this.session.lastX = event.clientX;
      this.session.lastY = event.clientY;
      this.applyPointerOrbitDelta(dx, dy);
      return;
    }

    // 3. 模型晶面内部按压滑动会话
    if (this.session.kind === 'model-surface') {
      const totalDist = Math.hypot(event.clientX - this.session.downX, event.clientY - this.session.downY);

      if (this.currentMode === 'orbit') {
        const orbitThreshold = this.getOrbitDragThreshold(this.session.isVision, this.session.isTouch);
        if (!this.session.orbiting && totalDist >= orbitThreshold) {
          this.session.orbiting = true;
          this.session.movedPastThreshold = true;
        }
        if (this.session.orbiting) {
          const dx = event.clientX - this.session.lastX;
          const dy = event.clientY - this.session.lastY;
          this.session.lastX = event.clientX;
          this.session.lastY = event.clientY;
          this.applyPointerOrbitDelta(dx, dy);
        }
        return;
      }

      if (totalDist >= (this.session.isVision || this.session.isTouch ? 8 : 4)) {
        this.session.movedPastThreshold = true;
      }

      // 在模型表面滑向目标点：若已有起点，实时提供平滑目标磁吸预览，绝不触发模型旋转
      if (this.pendingStartPoint && context?.camera) {
        const target = this.resolvePointerTarget(
          event.clientX,
          event.clientY,
          null,
          this.session.isVision,
          this.session.isTouch,
          context,
          1.08
        );
        if (target.keyPoint && target.keyPoint.id !== this.pendingStartPoint.id) {
          this.renderSnappedPreview(this.pendingStartPoint, target.keyPoint, target.snapLabel, context.camera, true);
        } else if (target.isHittingSurface) {
          const hitLocal = this.projectRayToLocalPlane(this.pendingStartPoint.position, context.camera);
          if (hitLocal) {
            this.mesh.updatePreviewWire(
              this.pendingStartPoint.position,
              hitLocal,
              0xa78bfa,
              undefined,
              context.camera,
              { snapped: false, smooth: true }
            );
          }
          this.mesh.setHoveredKeyPoint(null);
        } else {
          this.mesh.clearPreviewWire();
          this.mesh.setHoveredKeyPoint(null);
        }
      }
      return;
    }

    // 4. 关键点拖拽接线会话（按住起点直接拖向另一关键点）
    if (this.session.kind === 'point-gesture') {
      const totalDist = Math.hypot(event.clientX - this.session.downX, event.clientY - this.session.downY);
      if (totalDist >= 4) {
        this.session.movedPastThreshold = true;
      }

      if (!context?.camera) return;

      const anchorKp =
        this.pendingStartPoint && this.pendingStartPoint.id !== this.session.startKp.id && totalDist <= this.getEffectiveTapSlop(this.session.isVision, this.session.isTouch)
          ? this.pendingStartPoint
          : this.session.startKp;

      const target = this.resolvePointerTarget(
        event.clientX,
        event.clientY,
        null,
        this.session.isVision,
        this.session.isTouch,
        context,
        1.12
      );

      if (target.keyPoint && target.keyPoint.id !== anchorKp.id) {
        this.renderSnappedPreview(anchorKp, target.keyPoint, target.snapLabel, context.camera, true);
      } else if (target.isHittingSurface || totalDist <= this.getEffectiveTapSlop(this.session.isVision, this.session.isTouch)) {
        const hitLocal = this.projectRayToLocalPlane(anchorKp.position, context.camera);
        if (hitLocal) {
          this.mesh.updatePreviewWire(
            anchorKp.position,
            hitLocal,
            0xa78bfa,
            undefined,
            context.camera,
            { snapped: false, smooth: true }
          );
        }
        this.mesh.setHoveredKeyPoint(anchorKp.id, anchorKp.label);
        this.callbacks.onGuidanceChange?.(
          `正在从 ${anchorKp.label} 拖拽接线 · 移至目标点松手连接`,
          'info'
        );
      } else {
        this.mesh.clearPreviewWire();
        this.mesh.setHoveredKeyPoint(null);
      }
      return;
    }

    // 5. 空闲悬停态 (Idle Hover)：精确识别磁吸关键点、优雅引导线与区域过渡
    if (!context?.camera) return;

    const isVision = this.isVisionGestureEvent(event);
    const isTouch = event.pointerType === 'touch';
    const now = performance.now();
    const resolved = this.resolvePointerTarget(event.clientX, event.clientY, null, isVision, isTouch, context);

    const hoveredKp = resolved.keyPoint;
    const hoveredLabel = resolved.snapLabel;

    if (hoveredKp) {
      this.recentSnapLock = {
        kp: hoveredKp,
        snapLabel: hoveredLabel || hoveredKp.label,
        screenX: event.clientX,
        screenY: event.clientY,
        timestamp: now,
      };
    }

    if (this.pendingStartPoint) {
      if (hoveredKp && hoveredKp.id !== this.pendingStartPoint.id) {
        this.renderSnappedPreview(this.pendingStartPoint, hoveredKp, hoveredLabel, context.camera, false);
      } else if (resolved.isHittingSurface) {
        // 光标在几何体内部游走：呈现静稳阻尼半透明引导游丝（不显示杂乱悬空数字）
        const hitLocal = this.projectRayToLocalPlane(this.pendingStartPoint.position, context.camera);
        if (hitLocal) {
          this.mesh.updatePreviewWire(
            this.pendingStartPoint.position,
            hitLocal,
            0xa78bfa,
            undefined,
            context.camera,
            { snapped: false, smooth: true }
          );
        }
        this.callbacks.onGuidanceChange?.(
          `已选起点 ${this.pendingStartPoint.label} · 移至目标点捏合接线 (在模型外捏合停止并可旋转)`,
          'info'
        );
      } else {
        // 光标移出几何体进入外部旋转域：优雅收起预览引线，避免悬空紫线跨屏拖拽干扰视线
        this.mesh.clearPreviewWire();
        this.callbacks.onGuidanceChange?.(
          `已选起点 ${this.pendingStartPoint.label} · 在此处捏合可停止接线并自由旋转模型`,
          'info'
        );
      }
    } else if (hoveredKp) {
      const snapColor = this.getKeyPointColor(hoveredKp);
      this.callbacks.onGuidanceChange?.(
        `已吸附 ${hoveredLabel || hoveredKp.label} · 轻触或拖拽接线`,
        'info',
        snapColor
      );
    } else {
      let hoveredSegId: string | null = null;
      if (!this.pendingStartPoint && context.camera && typeof this.mesh.findClosestDrawnSegment === 'function') {
        const bounds = this.getViewportBounds(context);
        const maxSegmentHoverPx = isVision ? 40 : isTouch ? 30 : 20;
        const hitSeg = this.mesh.findClosestDrawnSegment(
          this.internalRaycaster.ray,
          event.clientX,
          event.clientY,
          context.camera,
          bounds,
          maxSegmentHoverPx
        );
        if (hitSeg) {
          hoveredSegId = hitSeg.segment.id;
          this.callbacks.onGuidanceChange?.(
            `辅助线 ${hitSeg.segment.label} · 长按消除`,
            'info'
          );
        }
      }
      if (typeof this.mesh.setHoveredSegment === 'function') {
        this.mesh.setHoveredSegment(hoveredSegId);
      }

      if (!hoveredSegId) {
        this.callbacks.onGuidanceChange?.(
          '右手在模型上捏合端点/中点/三等分点接线 · 长按已连线消除 · 右手在模型外捏合旋转模型',
          'info'
        );
      }
    }

    this.currentHoveredKp = hoveredKp;
    this.currentSnapLabel = hoveredLabel;

    if (hoveredKp) {
      this.mesh.setHoveredKeyPoint(hoveredKp.id, hoveredLabel);
      this.callbacks.onKeyPointHover?.(hoveredKp, hoveredLabel);
      if (typeof document !== 'undefined' && document.body?.style) {
        document.body.style.cursor = 'pointer';
      }
    } else {
      this.mesh.setHoveredKeyPoint(null);
      this.callbacks.onKeyPointHover?.(null);
      if (typeof document !== 'undefined' && document.body?.style) {
        const isHovered = typeof this.mesh.getHoveredSegmentId === 'function'
          ? Boolean(this.mesh.getHoveredSegmentId())
          : false;
        document.body.style.cursor = isHovered ? 'pointer' : 'default';
      }
    }
  }

  public onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.activePointers.delete(event.pointerId);

    // 1. 双指捏合缩放释放与单指防抖冷却
    if (this.session.kind === 'pinch-zoom') {
      if (this.activePointers.size === 0) {
        this.session = { kind: 'idle' };
        this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
      } else {
        this.session = { kind: 'pinch-cooldown' };
      }
      return;
    }

    if (this.session.kind === 'pinch-cooldown') {
      if (this.activePointers.size === 0) {
        this.session = { kind: 'idle' };
      }
      return;
    }

    if (this.session.kind === 'idle') return;

    const prevSession = this.session;
    this.session = { kind: 'idle' };

    // 2. 连线长按释放：未达 520ms 阈值则柔和回弹并取消消除
    if (prevSession.kind === 'segment-long-press') {
      if (!prevSession.completed) {
        if (typeof this.mesh.cancelSegmentLongPress === 'function') {
          this.mesh.cancelSegmentLongPress();
        }
        AppleHapticAudio.playCancel();
        this.callbacks.onGuidanceChange?.(
          `长按可消除辅助线 ${prevSession.segment.label}`,
          'info'
        );
      }
      return;
    }

    // 3. 模型外部空白区释放：旋转自然收尾（松手保留丝滑阻尼惯性）
    if (prevSession.kind === 'orbit-outside') {
      return;
    }

    const tapSlop = this.getEffectiveTapSlop(prevSession.isVision, prevSession.isTouch);
    const dist = Math.hypot(event.clientX - prevSession.downX, event.clientY - prevSession.downY);
    const duration = performance.now() - prevSession.downTime;

    // 3. 关键点交互释放：兼顾“轻触点击选点/连线”与“按住起点直接拖至终点连线”
    if (prevSession.kind === 'point-gesture') {
      const startKp = prevSession.startKp;
      const endResolved = this.resolvePointerTarget(
        event.clientX,
        event.clientY,
        null,
        prevSession.isVision,
        prevSession.isTouch,
        context,
        1.15
      );

      // 3.1 若拖拽到了另一个有效关键点且超出点击容差 -> 直接完成两点连线！
      if (dist > tapSlop && endResolved.keyPoint && endResolved.keyPoint.id !== startKp.id) {
        if (this.currentMode === 'three-point-cut' || this.currentMode === 'set-origin') {
          this.handleClickOnPoint(endResolved.keyPoint);
          return;
        }
        if (!this.chainStartPoint) {
          this.chainStartPoint = startKp;
        }
        const { segment, faceCreated } = this.connectTwoPoints(startKp, endResolved.keyPoint);
        if (segment && !faceCreated && endResolved.keyPoint.id !== this.chainStartPoint?.id) {
          this.pendingStartPoint = endResolved.keyPoint;
          this.mesh.setSelectedKeyPoints([endResolved.keyPoint.id]);
          this.mesh.clearPreviewWire();
        } else {
          this.resetSelection(true);
        }
        return;
      }

      // 3.2 宽容轻触判定：
      // - 位移在 tapSlop 内；或
      // - 松开时依然吸附在同一关键点上；或
      // - 隔空捏合张开手指引起的自然回弹漂移（耗时 <= 550ms 且未拖出模型外远处）
      const isForgivingTap =
        dist <= tapSlop ||
        endResolved.keyPoint?.id === startKp.id ||
        (prevSession.isVision && duration <= 550 && dist <= tapSlop * 1.75 && endResolved.isHittingSurface);

      if (isForgivingTap) {
        this.handleClickOnPoint(startKp);
        return;
      }

      // 3.3 明确将线段拖出到空白处放弃：若此前已有待连起点则仅清理本次预览，否则复位
      this.mesh.clearPreviewWire();
      if (!this.pendingStartPoint) {
        this.resetSelection(true);
        this.callbacks.onGuidanceChange?.('未对准有效目标点，已取消连线', 'info');
      }
      return;
    }

    // 4. 模型晶面内部释放：
    // - 若滑到了某个有效目标点且已有待连起点 -> 顺畅完成接线！
    // - 若不小心点偏在晶面上 -> 绝不误清已选起点 pendingStartPoint，让用户从容再点目标点！
    if (prevSession.kind === 'model-surface') {
      if (prevSession.orbiting) {
        return;
      }

      const endResolved = this.resolvePointerTarget(
        event.clientX,
        event.clientY,
        null,
        prevSession.isVision,
        prevSession.isTouch,
        context,
        1.10
      );

      if (this.pendingStartPoint && endResolved.keyPoint && endResolved.keyPoint.id !== this.pendingStartPoint.id) {
        this.handleClickOnPoint(endResolved.keyPoint);
        return;
      }

      if (dist <= tapSlop && endResolved.keyPoint) {
        this.handleClickOnPoint(endResolved.keyPoint);
        return;
      }

      if (this.pendingStartPoint) {
        // 保护已选起点不被晶面误触擦除
        this.callbacks.onGuidanceChange?.(
          `已保留起点 ${this.pendingStartPoint.label} · 请对准棱上顶点/中点/三等分点接线 (在模型外捏合停止)`,
          'info'
        );
      } else {
        this.callbacks.onGuidanceChange?.(
          '起点须在线上，请轻触棱上端点、中点 (1/2) 或三等分点 (1/3)',
          'info'
        );
      }
    }
  }

  private renderSnappedPreview(
    startKp: KeyPoint,
    targetKp: KeyPoint,
    snapLabel: string,
    camera: THREE.Camera,
    isDragging: boolean
  ): void {
    const len = startKp.position.distanceTo(targetKp.position);
    const badgeText = this.mesh.formatNormalizedDistance(len);
    this.mesh.updatePreviewWire(
      startKp.position,
      targetKp.position,
      0x7c3aed,
      badgeText,
      camera,
      { snapped: true, smooth: false }
    );
    this.mesh.setHoveredKeyPoint(targetKp.id, snapLabel);
    const snapColor = this.getKeyPointColor(targetKp);
    const actionVerb = isDragging ? '松手完成接线' : '轻触完成接线';
    this.callbacks.onGuidanceChange?.(
      `起点 ${startKp.label} → 目标: ${snapLabel || targetKp.label} (长: ${badgeText}) · ${actionVerb}`,
      'active',
      snapColor
    );
  }

  // -------------------------------------------------------------
  // 选点与空间连线核心业务规则
  // -------------------------------------------------------------
  private handleClickOnPoint(kp: KeyPoint): void {
    if (this.currentMode === 'three-point-cut') {
      const idx = this.selectedCutPoints.findIndex((p) => p.id === kp.id);
      if (idx !== -1) {
        this.selectedCutPoints.splice(idx, 1);
      } else {
        this.selectedCutPoints.push(kp);
      }
      this.mesh.setSelectedKeyPoints(this.selectedCutPoints.map((p) => p.id));
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);

      if (this.selectedCutPoints.length === 3) {
        const [p1, p2, p3] = this.selectedCutPoints;
        const plane = GeometrySolver.solvePlaneFrom3Points(p1.position, p2.position, p3.position);
        this.mesh.setOptions({ crossSectionPlane: plane, clippingEnabled: true });
        const res = this.mesh.getCrossSectionResult();
        if (res) {
          this.callbacks.onCrossSectionCreated?.(res.polygonType, res.area);
        }
        this.selectedCutPoints = [];
        this.mesh.setSelectedKeyPoints([]);
      }
      return;
    }

    if (this.currentMode === 'set-origin') {
      this.callbacks.onOriginChanged?.(kp);
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
      return;
    }

    if (!this.pendingStartPoint) {
      this.chainStartPoint = kp;
      this.pendingStartPoint = kp;
      this.mesh.setSelectedKeyPoints([kp.id]);
      this.callbacks.onGuidanceChange?.(
        `已选起点 ${kp.label} · 移动至目标点完成接线 (在模型外捏合或轻触可停止)`,
        'info'
      );
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
    } else if (this.pendingStartPoint.id === kp.id) {
      this.resetSelection();
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
    } else {
      const start = this.pendingStartPoint;
      if (!this.chainStartPoint) {
        this.chainStartPoint = start;
      }
      const { segment, faceCreated } = this.connectTwoPoints(start, kp);
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
      if (segment && !faceCreated && kp.id !== this.chainStartPoint?.id) {
        // 连续接线：以上一段终点作为新起点继续接，直至闭合生成平面或在模型外捏合终止
        this.pendingStartPoint = kp;
        this.mesh.setSelectedKeyPoints([kp.id]);
        this.mesh.clearPreviewWire();
      } else {
        this.resetSelection(true);
      }
    }
  }

  private connectTwoPoints(p1: KeyPoint, p2: KeyPoint): { segment: any; faceCreated: boolean } {
    const prevFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const seg = this.mesh.addSegment(p1.id, p2.id);
    if (!seg) {
      return { segment: null, faceCreated: false };
    }
    this.callbacks.onSegmentCreated?.(seg.label, seg.length);
    const newFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const faceCreated = newFaces.length > prevFaces.length;
    if (faceCreated) {
      const latestFace = newFaces[newFaces.length - 1];
      this.callbacks.onAuxiliaryFaceCreated?.(latestFace);
      this.callbacks.onGuidanceChange?.(
        `已闭合生成辅助面: ${latestFace.faceLabel} (${latestFace.polygonType}, 面积: ${latestFace.area.toFixed(3)}m²) · 平面构建完成`,
        'success'
      );
    } else {
      this.callbacks.onGuidanceChange?.(
        `成功生成辅助线 ${seg.label} (长 ${this.mesh.formatNormalizedDistance(seg.length)}) · 以 ${p2.label} 为新起点继续接线`,
        'success'
      );
    }
    return { segment: seg, faceCreated };
  }

  private getKeyPointColor(kp: KeyPoint): number {
    if (kp.type === 'vertex') return 0x38bdf8;
    if (kp.type === 'midpoint') return 0xfbbf24;
    if (kp.type === 'third') return 0x10b981;
    if (kp.type === 'center') return 0xc084fc;
    return 0x38bdf8;
  }

  // -------------------------------------------------------------
  // 丝滑轨道旋转与帧率无关指数阻尼 (支持右手外部拖拽 + 左手长捏合旋转)
  // -------------------------------------------------------------
  private syncTargetRotationWithMesh(): void {
    if (this.mesh?.modelContainer?.rotation) {
      this.targetRotationX = this.mesh.modelContainer.rotation.x;
      this.targetRotationY = this.mesh.modelContainer.rotation.y;
    }
  }

  private applyPointerOrbitDelta(dx: number, dy: number): void {
    const moveDist = Math.hypot(dx, dy);
    if (moveDist < 0.4) return;

    const rotSpeed = 0.0054;
    const stepY = dx * rotSpeed;
    const stepX = dy * rotSpeed;

    this.targetRotationY += stepY;
    this.targetRotationX = THREE.MathUtils.clamp(
      this.targetRotationX + stepX,
      -Math.PI * 0.42,
      Math.PI * 0.42
    );

    // 同步推进 50% 位移保证零延迟跟手性，剩余 50% 由 update() 指数平滑收敛
    const immediateRatio = 0.50;
    this.mesh.modelContainer.rotation.y +=
      (this.targetRotationY - this.mesh.modelContainer.rotation.y) * immediateRatio;
    this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
      this.mesh.modelContainer.rotation.x +
        (this.targetRotationX - this.mesh.modelContainer.rotation.x) * immediateRatio,
      -Math.PI * 0.42,
      Math.PI * 0.42
    );

    const vx = THREE.MathUtils.clamp(this.rotationVelocity.x * 0.4 + stepY * 0.6, -0.055, 0.055);
    const vy = THREE.MathUtils.clamp(this.rotationVelocity.y * 0.4 + stepX * 0.6, -0.055, 0.055);
    this.rotationVelocity.set(vx, vy);
  }

  /**
   * 外部手势（如左手长捏合）平滑驱动 3D 几何体旋转，无需转动实验室房间视角。
   */
  public orbitByDelta(dx: number, dy: number): void {
    if (Math.hypot(dx, dy) < 0.3) return;
    if (
      Math.abs(this.targetRotationY - this.mesh.modelContainer.rotation.y) > 0.35 ||
      Math.abs(this.targetRotationX - this.mesh.modelContainer.rotation.x) > 0.35
    ) {
      this.syncTargetRotationWithMesh();
    }
    const rotSpeed = 0.0048;
    this.targetRotationY += dx * rotSpeed;
    this.targetRotationX = THREE.MathUtils.clamp(
      this.targetRotationX + dy * rotSpeed,
      -Math.PI * 0.42,
      Math.PI * 0.42
    );
    this.rotationVelocity.set(0, 0);
  }

  public update(delta: number): void {
    const dt = Math.max(0, Math.min(delta, 0.1));
    if (dt <= 0) return;

    // 苹果原生辅助线长按蓄力推进 (520ms 触控阈值)
    if (this.session.kind === 'segment-long-press') {
      const elapsed = performance.now() - this.session.downTime;
      const LONG_PRESS_DURATION = 520;
      const progress = Math.min(1.0, elapsed / LONG_PRESS_DURATION);

      if (typeof this.mesh.updateSegmentLongPress === 'function') {
        this.mesh.updateSegmentLongPress(this.session.segment.id, progress, this.session.hitPoint3D);
      }

      if (progress >= 1.0 && !this.session.completed) {
        this.session.completed = true;
        const targetSeg = this.session.segment;
        this.session = { kind: 'idle' };
        this.executeElimination(targetSeg);
      }
    }

    if (!this.isOrbitDragging && this.rotationVelocity.lengthSq() > 1e-8) {
      const frameScale = dt * 60;
      this.targetRotationY += this.rotationVelocity.x * frameScale;
      this.targetRotationX = THREE.MathUtils.clamp(
        this.targetRotationX + this.rotationVelocity.y * frameScale,
        -Math.PI * 0.42,
        Math.PI * 0.42
      );
      const decay = Math.exp(-6.5 * dt);
      this.rotationVelocity.multiplyScalar(decay);
      if (this.rotationVelocity.lengthSq() < 1e-8) {
        this.rotationVelocity.set(0, 0);
      }
    }

    const diffY = this.targetRotationY - this.mesh.modelContainer.rotation.y;
    const diffX = this.targetRotationX - this.mesh.modelContainer.rotation.x;
    if (Math.abs(diffY) > 1e-5 || Math.abs(diffX) > 1e-5) {
      const alpha = 1 - Math.exp(-24 * dt);
      this.mesh.modelContainer.rotation.y += diffY * alpha;
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x + diffX * alpha,
        -Math.PI * 0.42,
        Math.PI * 0.42
      );
    }
  }

  private executeElimination(segment: DrawnSegment): void {
    const prevFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const finishElimination = () => {
      this.mesh.removeSegment(segment.id);
      this.callbacks.onSegmentRemoved?.(segment.label, segment.length);
      const newFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
      if (prevFaces.length > newFaces.length) {
        const removedFace =
          prevFaces.find((pf) => !newFaces.some((nf) => nf.id === pf.id)) ||
          prevFaces[prevFaces.length - 1];
        this.callbacks.onAuxiliaryFaceRemoved?.(removedFace.id);
        this.callbacks.onGuidanceChange?.(
          `已消除辅助线 ${segment.label}，并移除关联辅助面 ${removedFace.faceLabel}`,
          'warn'
        );
      } else {
        this.callbacks.onGuidanceChange?.(
          `已消除辅助线 ${segment.label}`,
          'warn'
        );
      }
    };

    if (typeof this.mesh.playSegmentEliminationAnimation === 'function') {
      this.mesh.playSegmentEliminationAnimation(segment.id, finishElimination);
    } else {
      finishElimination();
    }
  }

  // -------------------------------------------------------------
  // 标准视角预设、缩放、键盘与多端事件适配
  // -------------------------------------------------------------
  public resetToIsometricView(): void {
    this.mesh.modelContainer.rotation.set(0.12, 0.42, 0);
    this.targetRotationX = 0.12;
    this.targetRotationY = 0.42;
    this.rotationVelocity.set(0, 0);
  }

  public resetToTextbookObliqueView(): void {
    this.mesh.modelContainer.rotation.set(0.22, -0.34, 0);
    this.targetRotationX = 0.22;
    this.targetRotationY = -0.34;
    this.rotationVelocity.set(0, 0);
  }

  public resetToFrontView(): void {
    this.mesh.modelContainer.rotation.set(0, 0, 0);
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.rotationVelocity.set(0, 0);
  }

  public resetToSideView(): void {
    this.mesh.modelContainer.rotation.set(0, Math.PI / 2, 0);
    this.targetRotationX = 0;
    this.targetRotationY = Math.PI / 2;
    this.rotationVelocity.set(0, 0);
  }

  public resetToTopView(): void {
    this.mesh.modelContainer.rotation.set(-Math.PI / 2, 0, 0);
    this.targetRotationX = -Math.PI / 2;
    this.targetRotationY = 0;
    this.rotationVelocity.set(0, 0);
  }

  public onPointerCancel(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size === 0) {
      this.session = { kind: 'idle' };
      if (!this.pendingStartPoint) {
        this.mesh?.clearPreviewWire();
      }
    }
  }

  public onWheel(event: WheelEvent): void {
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const newScale = this.mesh.zoom(factor);
    this.callbacks.onScaleChange?.(newScale);
  }

  public onKeyDown(event: KeyboardEvent): boolean {
    if ((event.code === 'KeyZ' && (event.metaKey || event.ctrlKey)) || event.code === 'Backspace') {
      event.preventDefault();
      this.undoLastSegment();
      return true;
    }

    if (
      event.code === 'Equal' ||
      event.code === 'NumpadAdd' ||
      event.code === 'BracketRight' ||
      event.key === '+' ||
      event.key === '=' ||
      event.key === ']'
    ) {
      event.preventDefault();
      const newScale = this.mesh.zoom(1.10);
      this.callbacks.onScaleChange?.(newScale);
      return true;
    }

    if (
      event.code === 'Minus' ||
      event.code === 'NumpadSubtract' ||
      event.code === 'BracketLeft' ||
      event.key === '-' ||
      event.key === '_' ||
      event.key === '['
    ) {
      event.preventDefault();
      const newScale = this.mesh.zoom(0.90);
      this.callbacks.onScaleChange?.(newScale);
      return true;
    }

    if (event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0') {
      event.preventDefault();
      this.mesh.setScale(1.0);
      this.callbacks.onScaleChange?.(1.0);
      return true;
    }

    if (event.code === 'Escape') {
      if (this.pendingStartPoint) {
        this.resetSelection();
      } else {
        this.clearAll();
      }
      return true;
    }

    if (event.code === 'KeyC') {
      this.clearAll();
      return true;
    }

    if (event.code === 'KeyR') {
      this.resetToIsometricView();
      return true;
    }

    return false;
  }

  public getInteractionHint(): string {
    if (this.currentMode === 'three-point-cut') {
      const count = this.selectedCutPoints.length;
      if (count === 0) return '剖切模式：请点击第 1 个点';
      if (count === 1) return `剖切模式：已选 [${this.selectedCutPoints[0].label}]，请点击第 2 个点`;
      if (count === 2) {
        return `剖切模式：已选 [${this.selectedCutPoints[0].label}, ${this.selectedCutPoints[1].label}]，请点击第 3 个点剖切`;
      }
    }

    if (this.pendingStartPoint) {
      if (this.currentHoveredKp && this.currentHoveredKp.id !== this.pendingStartPoint.id) {
        const len = this.pendingStartPoint.position.distanceTo(this.currentHoveredKp.position);
        return `已选起点 ${this.pendingStartPoint.label} → 目标: ${this.currentSnapLabel} (距离: ${this.mesh.formatNormalizedDistance(len)}) · 轻触完成接线`;
      }
      return `已选起点 ${this.pendingStartPoint.label} · 轻触目标点继续接线 (在模型外捏合或轻触可停止)`;
    }

    if (this.currentHoveredKp) {
      return `吸附到: ${this.currentSnapLabel} · 轻触选为起点或拖拽接线`;
    }

    return '右手在模型上捏合端点/中点/三等分点接线 · 右手在模型外捏合拖拽旋转模型 · 左手长捏合转动视角';
  }

  public onTouchStart(event: TouchEvent, _context?: ExperimentContext): boolean {
    if (event.touches.length >= 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const initialDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const initialScale = this.mesh.getScale();
      this.session = { kind: 'pinch-zoom', initialDist, initialScale };
      this.mesh.setHoveredKeyPoint(null);
      if (!this.pendingStartPoint) {
        this.mesh.clearPreviewWire();
      }
      this.callbacks.onGuidanceChange?.(`双指捏合缩放 · 当前: ${Math.round(initialScale * 100)}%`, 'info');
      if (event.cancelable) event.preventDefault();
      return true;
    }
    return false;
  }

  public onTouchMove(event: TouchEvent, _context?: ExperimentContext): boolean {
    if (event.touches.length >= 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (this.session.kind !== 'pinch-zoom') {
        this.session = { kind: 'pinch-zoom', initialDist: currentDist, initialScale: this.mesh.getScale() };
      }
      if (this.session.initialDist > 5) {
        const factor = currentDist / this.session.initialDist;
        const newScale = THREE.MathUtils.clamp(this.session.initialScale * factor, 0.35, 3.0);
        this.mesh.setScale(newScale);
        this.callbacks.onScaleChange?.(newScale);
        this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'active');
      }
      if (event.cancelable) event.preventDefault();
      return true;
    }
    return false;
  }

  public onTouchEnd(event: TouchEvent, _context?: ExperimentContext): void {
    if (this.session.kind === 'pinch-zoom' && event.touches.length < 2) {
      this.session = event.touches.length === 0 ? { kind: 'idle' } : { kind: 'pinch-cooldown' };
      this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
    } else if (this.session.kind === 'pinch-cooldown' && event.touches.length === 0) {
      this.session = { kind: 'idle' };
    }
  }

  public onTouchCancel(_event: TouchEvent): void {
    this.session = { kind: 'idle' };
    this.activePointers.clear();
  }

  public onGestureStart(event: any): void {
    this.session = { kind: 'pinch-zoom', initialDist: 100, initialScale: this.mesh.getScale() };
    if (typeof event.preventDefault === 'function' && event.cancelable) {
      event.preventDefault();
    }
  }

  public onGestureChange(event: any): void {
    if (this.session.kind === 'pinch-zoom' && typeof event.scale === 'number') {
      const newScale = THREE.MathUtils.clamp(this.session.initialScale * event.scale, 0.35, 3.0);
      this.mesh.setScale(newScale);
      this.callbacks.onScaleChange?.(newScale);
      this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'active');
      if (typeof event.preventDefault === 'function' && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  public onGestureEnd(event: any): void {
    if (this.session.kind === 'pinch-zoom') {
      this.session = { kind: 'idle' };
      this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
      if (typeof event.preventDefault === 'function' && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  public zoomIn(factor = 1.10): number {
    const newScale = this.mesh.zoom(factor);
    this.callbacks.onScaleChange?.(newScale);
    this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'info');
    return newScale;
  }

  public zoomOut(factor = 0.90): number {
    const newScale = this.mesh.zoom(factor);
    this.callbacks.onScaleChange?.(newScale);
    this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'info');
    return newScale;
  }

  public resetScale(): number {
    this.mesh.setScale(1.0);
    this.callbacks.onScaleChange?.(1.0);
    this.callbacks.onGuidanceChange?.('已重置图像大小 (100%)', 'info');
    return 1.0;
  }

  public setScale(scale: number): number {
    this.mesh.setScale(scale);
    const newScale = this.mesh.getScale();
    this.callbacks.onScaleChange?.(newScale);
    return newScale;
  }

  public getScale(): number {
    return this.mesh.getScale();
  }

  public isPinchingActive(): boolean {
    return this.session.kind === 'pinch-zoom';
  }

  /**
   * 隔空手势帧同步兜底（无冗余冲突设计）：
   * 当 VisionProCursor 已通过标准 PointerEvent 接管本次捏合 (this.session.kind !== 'idle') 时绝不重复干预，
   * 彻底根除“捏合外侧顶点/标号刚被 onPointerDown 捕获，同一帧又被 onHandGestureFrame 误判为模型外清空”的自相矛盾缺陷。
   */
  public onHandGestureFrame(frame: any, context?: ExperimentContext): void {
    if (!frame || this.session.kind !== 'idle') return;
    const right = frame.rightHand || (frame.hasHand && !frame.leftHand ? frame : null);
    if (!right || !right.justPinchStarted || !this.pendingStartPoint) return;

    if (context?.camera) {
      const resolved = this.resolvePointerTarget(right.screenX, right.screenY, null, true, false, context);
      if (resolved.zone === 'outside') {
        this.resetSelection(true);
        this.callbacks.onGuidanceChange?.('右手在模型外捏合，接线已停止', 'info');
      }
    } else {
      this.resetSelection(true);
      this.callbacks.onGuidanceChange?.('右手在模型外捏合，接线已停止', 'info');
    }
  }
}
