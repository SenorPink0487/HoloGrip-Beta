import { labPointerNDC } from '../../controls/LabPointerInput.ts';
import * as THREE from 'three';
import type { StereometryMesh } from './StereometryMesh.ts';
import { GeometrySolver, type KeyPoint } from './GeometrySolver.ts';
import type { AuxiliaryFace } from './AuxiliaryFaceSolver.ts';
import type { ExperimentContext } from '../../core/types.ts';

export type InteractionMode =
  | 'direct'          // 自然交互 (接线为主，空白拖拽旋转)
  | 'orbit'           // 自由空间拖拽旋转
  | 'connect-line'    // 两点接线
  | 'three-point-cut' // 三点定面截面
  | 'set-origin';     // 选取原点建系

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

export class StereometryInteractionManager {
  private mesh: StereometryMesh;
  private callbacks: StereometryInteractionCallbacks;
  private currentMode: InteractionMode = 'direct';

  // 交互状态机
  private pendingStartPoint: KeyPoint | null = null;
  private currentHoveredKp: KeyPoint | null = null;
  private currentSnapLabel = '';
  private selectedCutPoints: KeyPoint[] = [];

  // 指针与多指拖拽交互状态
  private isPointerDown = false;
  private isOrbitDragging = false;
  private isConnectingDrag = false;
  private dragStartKp: KeyPoint | null = null;
  private hasMovedPastDragThreshold = false;
  private isPointerDownOnModel = false;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownTime = 0;
  private rotationVelocity = new THREE.Vector2(0, 0);
  private targetRotationX = 0;
  private targetRotationY = 0;

  // 交互阈值（像素）
  // 触屏端点击容差 22px，滑动旋转容差 14px；鼠标端点击容差 8px，滑动旋转 5px
  private readonly TAP_SLOP_TOUCH = 22;
  private readonly TAP_SLOP_MOUSE = 8;
  private readonly ORBIT_DRAG_THRESHOLD_TOUCH = 14;
  private readonly ORBIT_DRAG_THRESHOLD_MOUSE = 5;

  // 磁吸阈值（米/世界单位）
  // 触屏端由于手指遮挡与接触面较粗，采用更宽松的自适应磁吸捕获半径 (0.080)
  private readonly SNAP_THRESHOLD_TOUCH = 0.080;
  private readonly SNAP_THRESHOLD_MOUSE = 0.045;

  // 双指捏合缩放状态（iPad 与触控设备）
  private activePointers = new Map<number, { x: number; y: number }>();
  private isPinching = false;
  private pinchCooldown = false;
  private initialPinchDist = 0;
  private initialPinchScale = 1.0;
  private internalRaycaster = new THREE.Raycaster();

  constructor(mesh: StereometryMesh, callbacks: StereometryInteractionCallbacks = {}) {
    this.mesh = mesh;
    this.callbacks = callbacks;
  }

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

  public resetSelection(): void {
    const wasPending = Boolean(this.pendingStartPoint) || Boolean(this.dragStartKp);
    this.pendingStartPoint = null;
    this.dragStartKp = null;
    this.isConnectingDrag = false;
    this.selectedCutPoints = [];
    this.mesh.setSelectedKeyPoints([]);
    this.mesh.clearPreviewWire();
    if (wasPending) {
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
        const removedFace = prevFaces.find((pf) => !newFaces.some((nf) => nf.id === pf.id)) || prevFaces[prevFaces.length - 1];
        this.callbacks.onAuxiliaryFaceRemoved?.(removedFace.id);
        this.callbacks.onGuidanceChange?.(`已撤销辅助线 ${seg.label}，并移除关联辅助面 ${removedFace.faceLabel}`, 'warn');
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

  /**
   * 查找离射线最近的关键点，严格保证起点只在线上（顶点、1/2 中点、1/3 与 2/3 三等分点）。
   */
  public findKeyPointNearRay(raycaster: THREE.Raycaster, threshold = 0.045): KeyPoint | null {
    const res = this.mesh.findClosestSnapPoint(raycaster.ray, threshold, { onlyOnEdgeOrLine: true });
    return res ? res.keyPoint : null;
  }

  /**
   * 引擎调用的指针按下事件钩子。
   */
  public onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (event.button !== 0) return false;

    // 记录多指触控指针（用于 iPad 及触控设备双指缩放）
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size >= 2) {
      // 检测到双指：立即切换为捏合缩放模式，彻底重置单指拖拽与连线状态
      const pts = Array.from(this.activePointers.values());
      this.isPinching = true;
      this.pinchCooldown = false;
      this.isOrbitDragging = false;
      this.isConnectingDrag = false;
      this.dragStartKp = null;
      this.hasMovedPastDragThreshold = false;
      this.mesh.setHoveredKeyPoint(null);
      this.mesh.clearPreviewWire();
      this.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.initialPinchScale = this.mesh.getScale();
      this.callbacks.onGuidanceChange?.(`双指捏合缩放 · 当前: ${Math.round(this.initialPinchScale * 100)}%`, 'info');
      return true;
    }

    // 若刚从双指缩放释放（其中一指抬起），在所有手指完全离开前，严格抑制单指接管旋转与误触
    if (this.pinchCooldown) {
      return false;
    }

    const isTouch = event.pointerType === 'touch';
    const snapThreshold = isTouch ? this.SNAP_THRESHOLD_TOUCH : this.SNAP_THRESHOLD_MOUSE;

    // 1. 优先探测磁吸关键点（顶点、中点、三等分点）
    let snapKp: KeyPoint | null = null;
    let snapLabel = '';

    if (context?.camera && typeof this.mesh.getModelDef === 'function') {
      const mouseNDC = labPointerNDC(event, context?.renderer?.domElement);
      this.internalRaycaster.setFromCamera(mouseNDC, context.camera);
      const snapRes = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
        onlyOnEdgeOrLine: true,
      });
      if (snapRes) {
        snapKp = snapRes.keyPoint;
        snapLabel = snapRes.snapLabel;
      }
    }

    // 2. 若命中了关键点：立即进入关键点交互模式（支持点击选点与直接拖拽接线）
    if (snapKp) {
      this.isPointerDown = true;
      this.isConnectingDrag = true;
      this.dragStartKp = snapKp;
      this.isOrbitDragging = false;
      this.hasMovedPastDragThreshold = false;
      this.isPointerDownOnModel = true;

      this.pointerDownX = event.clientX;
      this.pointerDownY = event.clientY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.pointerDownTime = performance.now();
      this.rotationVelocity.set(0, 0);

      this.currentHoveredKp = snapKp;
      this.currentSnapLabel = snapLabel;
      this.mesh.setHoveredKeyPoint(snapKp.id, snapLabel);

      const snapColor = this.getKeyPointColor(snapKp);
      if (this.pendingStartPoint) {
        this.callbacks.onGuidanceChange?.(
          `已按住 ${snapLabel || snapKp.label} · 拖拽或轻触完成接线`,
          'active',
          snapColor
        );
      } else {
        this.callbacks.onGuidanceChange?.(
          `已按住起点 ${snapLabel || snapKp.label} · 拖拽至目标点接线 (或轻触选定)`,
          'active',
          snapColor
        );
      }
      return true;
    }

    // 3. 检测是否触碰了 3D 模型实体或模型周围的操作包络区
    let isHittingModel = Boolean(hit);
    if (!isHittingModel && context?.camera) {
      isHittingModel = typeof this.mesh.isRayHittingModel === 'function'
        ? this.mesh.isRayHittingModel(this.internalRaycaster.ray)
        : true;
    } else if (!context?.camera) {
      // 单元测试无相机环境默认保留交互响应
      isHittingModel = true;
    }

    // 无论触碰点是在模型实体表面还是在模型外部空白区域，均接管单指交互：
    // - 滑动拖拽（位移 >= 14px）：顺畅旋转 3D 模型视角（空旷区域拖拽视角极佳，不遮挡模型）
    // - 顶点/棱线拖拽：直接拉出辅助线（drag-to-connect）
    // - 轻触空白（位移 <= 22px）：取消已选起点，且模型绝对不转动
    this.isPointerDown = true;
    this.isConnectingDrag = false;
    this.dragStartKp = null;
    this.isOrbitDragging = false;
    this.hasMovedPastDragThreshold = false;
    this.isPointerDownOnModel = isHittingModel;

    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.pointerDownTime = performance.now();
    this.rotationVelocity.set(0, 0);
    this.targetRotationX = this.mesh.modelContainer?.rotation ? this.mesh.modelContainer.rotation.x : 0;
    this.targetRotationY = this.mesh.modelContainer?.rotation ? this.mesh.modelContainer.rotation.y : 0;
    return true;
  }

  /**
   * 引擎调用的指针移动事件钩子。
   */
  public onPointerMove(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    // 持续更新活跃指针坐标
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // 1. 双指捏合缩放
    if (this.isPinching && this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.initialPinchDist > 5) {
        const factor = currentDist / this.initialPinchDist;
        const newScale = THREE.MathUtils.clamp(this.initialPinchScale * factor, 0.35, 3.0);
        this.mesh.setScale(newScale);
        this.callbacks.onScaleChange?.(newScale);
        this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'active');
      }
      return;
    }

    const isTouch = event.pointerType === 'touch';
    const orbitDragThreshold = isTouch ? this.ORBIT_DRAG_THRESHOLD_TOUCH : this.ORBIT_DRAG_THRESHOLD_MOUSE;
    const snapThreshold = isTouch ? this.SNAP_THRESHOLD_TOUCH : this.SNAP_THRESHOLD_MOUSE;

    // 2. 判定是关键点拖拽接线，还是模型视角旋转
    if (this.isPointerDown && !this.isConnectingDrag && !this.isOrbitDragging) {
      const dragDist = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);
      if (dragDist >= (isTouch ? 8 : 4)) {
        // 延迟检查触摸起始点是否落在关键点附近
        if (context?.camera) {
          const downNDC = labPointerNDC(
            { clientX: this.pointerDownX, clientY: this.pointerDownY },
            context?.renderer?.domElement
          );
          this.internalRaycaster.setFromCamera(downNDC, context.camera);
          const startSnap = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
            onlyOnEdgeOrLine: true,
          });
          if (startSnap) {
            this.isConnectingDrag = true;
            this.dragStartKp = startSnap.keyPoint;
            this.hasMovedPastDragThreshold = true;
            this.mesh.setHoveredKeyPoint(startSnap.keyPoint.id, startSnap.snapLabel);
          } else if (dragDist >= orbitDragThreshold) {
            this.isOrbitDragging = true;
            this.hasMovedPastDragThreshold = true;
          }
        } else if (dragDist >= orbitDragThreshold) {
          this.isOrbitDragging = true;
          this.hasMovedPastDragThreshold = true;
        }
      }
    }

    // 3. 关键点拖拽连线状态（手指从端点/中点按下向外拖动）
    // 核心保证：拖拽连线时，绝对不旋转 3D 模型！
    if (this.isPointerDown && this.isConnectingDrag && this.dragStartKp) {
      if (context?.camera) {
        const mouseNDC = labPointerNDC(event, context?.renderer?.domElement);
        this.internalRaycaster.setFromCamera(mouseNDC, context.camera);
        const snapRes = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
          onlyOnEdgeOrLine: true,
        });

        if (snapRes && snapRes.keyPoint.id !== this.dragStartKp.id) {
          // 动态磁吸吸附到目标关键点
          const len = this.dragStartKp.position.distanceTo(snapRes.keyPoint.position);
          const badgeText = this.mesh.formatNormalizedDistance(len);
          this.mesh.updatePreviewWire(this.dragStartKp.position, snapRes.keyPoint.position, 0x10b981, badgeText, context.camera);
          this.mesh.setHoveredKeyPoint(snapRes.keyPoint.id, snapRes.snapLabel);
          const snapColor = this.getKeyPointColor(snapRes.keyPoint);
          this.callbacks.onGuidanceChange?.(
            `起点 ${this.dragStartKp.label} → 目标: ${snapRes.snapLabel || snapRes.keyPoint.label} (长: ${badgeText}) · 松手完成接线`,
            'active',
            snapColor
          );
        } else {
          // 悬空拖拽：将光标投影至过起点且平行于相机平面的空间平面上
          const normal = new THREE.Vector3();
          context.camera.getWorldDirection(normal).negate();
          const startWorld = this.dragStartKp.position.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, startWorld);
          const hitWorld = new THREE.Vector3();
          if (this.internalRaycaster.ray.intersectPlane(plane, hitWorld)) {
            const hitLocal = hitWorld.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld.clone().invert());
            const len = this.dragStartKp.position.distanceTo(hitLocal);
            const badgeText = this.mesh.formatNormalizedDistance(len);
            this.mesh.updatePreviewWire(this.dragStartKp.position, hitLocal, 0x38bdf8, badgeText, context.camera);
            this.mesh.setHoveredKeyPoint(this.dragStartKp.id, this.dragStartKp.label);
            this.callbacks.onGuidanceChange?.(
              `正在从 ${this.dragStartKp.label} 拖拽接线 · 移至目标点松手连接 (松在空白处取消)`,
              'info'
            );
          }
        }
      }
      return;
    }

    // 4. 单指或鼠标按住拖拽状态：顺畅执行 3D 视角旋转（模型表面与外部空白区域拖拽均支持旋转视角）
    if (this.isPointerDown && this.isOrbitDragging) {
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      const moveDist = Math.hypot(dx, dy);
      // 抖动死区抑制：过滤传感器底噪与手部轻颤
      if (moveDist >= 0.6) {
        const rotSpeed = 0.0055;
        this.targetRotationY += dx * rotSpeed;
        this.targetRotationX += dy * rotSpeed;

        // 限制仰俯角，防止模型倒转
        this.targetRotationX = THREE.MathUtils.clamp(
          this.targetRotationX,
          -Math.PI * 0.40,
          Math.PI * 0.40
        );

        const immediateRatio = 0.55;
        this.mesh.modelContainer.rotation.y += (this.targetRotationY - this.mesh.modelContainer.rotation.y) * immediateRatio;
        this.mesh.modelContainer.rotation.x += (this.targetRotationX - this.mesh.modelContainer.rotation.x) * immediateRatio;
        this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
          this.mesh.modelContainer.rotation.x,
          -Math.PI * 0.40,
          Math.PI * 0.40
        );

        this.rotationVelocity.x = this.rotationVelocity.x * 0.35 + (dx * rotSpeed) * 0.65;
        this.rotationVelocity.y = this.rotationVelocity.y * 0.35 + (dy * rotSpeed) * 0.65;
      }

      this.mesh.setHoveredKeyPoint(null);
      if (!this.pendingStartPoint) {
        this.mesh.clearPreviewWire();
      }
      return;
    }

    // 5. 非按下状态下的鼠标悬停磁吸检测（PC 鼠标端）
    if (!this.isPointerDown && context?.camera) {
      let hoveredKp: KeyPoint | null = null;
      let hoveredLabel = '';
      const mouseNDC = labPointerNDC(event, context?.renderer?.domElement);
      this.internalRaycaster.setFromCamera(mouseNDC, context.camera);
      const snapRes = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
        onlyOnEdgeOrLine: true,
      });
      if (snapRes) {
        hoveredKp = snapRes.keyPoint;
        hoveredLabel = snapRes.snapLabel;
      }

      if (this.pendingStartPoint) {
        if (hoveredKp && hoveredKp.id !== this.pendingStartPoint.id) {
          const len = this.pendingStartPoint.position.distanceTo(hoveredKp.position);
          const badgeText = this.mesh.formatNormalizedDistance(len);
          this.mesh.updatePreviewWire(this.pendingStartPoint.position, hoveredKp.position, 0x10b981, badgeText, context.camera);
          const snapColor = this.getKeyPointColor(hoveredKp);
          this.callbacks.onGuidanceChange?.(
            `已选起点 ${this.pendingStartPoint.label} → 目标: ${hoveredLabel || hoveredKp.label} (长: ${badgeText}) · 轻触完成接线`,
            'active',
            snapColor
          );
        } else {
          const normal = new THREE.Vector3();
          context.camera.getWorldDirection(normal).negate();
          const startWorld = this.pendingStartPoint.position.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, startWorld);
          const hitWorld = new THREE.Vector3();
          if (this.internalRaycaster.ray.intersectPlane(plane, hitWorld)) {
            const hitLocal = hitWorld.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld.clone().invert());
            const len = this.pendingStartPoint.position.distanceTo(hitLocal);
            const badgeText = this.mesh.formatNormalizedDistance(len);
            this.mesh.updatePreviewWire(this.pendingStartPoint.position, hitLocal, 0x38bdf8, badgeText, context.camera);
            this.callbacks.onGuidanceChange?.(`已选起点 ${this.pendingStartPoint.label} · 轻触目标点接线 (轻触空白取消)`, 'info');
          }
        }
      } else if (hoveredKp) {
        const snapColor = this.getKeyPointColor(hoveredKp);
        this.callbacks.onGuidanceChange?.(`已吸附 ${hoveredLabel || hoveredKp.label} · 轻触或拖拽接线`, 'info', snapColor);
      } else {
        this.callbacks.onGuidanceChange?.('滑动模型旋转视角 · 轻触或拖拽棱线上端点/中点/三等分点接线', 'info');
      }

      this.currentHoveredKp = hoveredKp;
      this.currentSnapLabel = hoveredLabel;

      if (hoveredKp) {
        this.mesh.setHoveredKeyPoint(hoveredKp.id, hoveredLabel);
        this.callbacks.onKeyPointHover?.(hoveredKp, hoveredLabel);
        document.body.style.cursor = 'pointer';
      } else {
        this.mesh.setHoveredKeyPoint(null);
        this.callbacks.onKeyPointHover?.(null);
        document.body.style.cursor = 'default';
      }
    }
  }

  /**
   * 当模态弹窗开启或视图失去焦点时，重置所有悬停状态、预览连线与拖拽状态。
   */
  public clearHover(): void {
    this.currentHoveredKp = null;
    this.currentSnapLabel = '';
    this.isOrbitDragging = false;
    this.isConnectingDrag = false;
    this.dragStartKp = null;
    this.hasMovedPastDragThreshold = false;
    this.isPointerDown = false;
    this.isPointerDownOnModel = false;
    this.isPinching = false;
    this.pinchCooldown = false;
    this.activePointers.clear();
    this.rotationVelocity.set(0, 0);
    this.mesh?.setHoveredKeyPoint(null);
    this.mesh?.clearPreviewWire();
    this.callbacks.onKeyPointHover?.(null);
    this.callbacks.onGuidanceChange?.('滑动模型旋转视角 · 轻触或拖拽棱线上端点/中点/三等分点接线', 'info');
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'default';
    }
  }

  /**
   * 指针抬起事件钩子：严格区分滑动旋转视角与轻触点选接线。
   */
  public onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.activePointers.delete(event.pointerId);

    // 双指捏合释放处理
    if (this.isPinching) {
      if (this.activePointers.size === 0) {
        this.isPinching = false;
        this.pinchCooldown = false;
        this.isOrbitDragging = false;
        this.isConnectingDrag = false;
        this.dragStartKp = null;
        this.isPointerDown = false;
        this.hasMovedPastDragThreshold = false;
        this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
      } else {
        // 其中一指抬起：保持捏合冷却状态，禁止剩余手指突然触发旋转与误触
        this.isPinching = false;
        this.pinchCooldown = true;
        this.isOrbitDragging = false;
        this.isConnectingDrag = false;
        this.dragStartKp = null;
        this.isPointerDown = false;
        this.hasMovedPastDragThreshold = false;
      }
      return;
    }

    if (this.pinchCooldown) {
      if (this.activePointers.size === 0) {
        this.pinchCooldown = false;
      }
      return;
    }

    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const isTouch = event.pointerType === 'touch';
    const tapSlop = isTouch ? this.TAP_SLOP_TOUCH : this.TAP_SLOP_MOUSE;
    const snapThreshold = isTouch ? this.SNAP_THRESHOLD_TOUCH : this.SNAP_THRESHOLD_MOUSE;
    const dist = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);

    // ==========================================
    // 分支 1: 关键点按下后的释放 (拖拽接线 / 轻触选点)
    // ==========================================
    if (this.isConnectingDrag && this.dragStartKp) {
      const startKp = this.dragStartKp;
      this.isConnectingDrag = false;
      this.dragStartKp = null;
      this.isOrbitDragging = false;
      this.hasMovedPastDragThreshold = false;

      // 1.1 若位移在轻触容差内 (Tap Slop)：判定为轻触点击选定该关键点！
      if (dist <= tapSlop) {
        this.handleClickOnPoint(startKp);
        return;
      }

      // 1.2 若位移超出轻触容差：判定为拖拽接线释放
      if (context?.camera) {
        const mouseNDC = labPointerNDC(event, context?.renderer?.domElement);
        this.internalRaycaster.setFromCamera(mouseNDC, context.camera);
        const snapRes = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
          onlyOnEdgeOrLine: true,
        });

        if (snapRes && snapRes.keyPoint.id !== startKp.id) {
          // 成功拖拽连线！
          this.connectTwoPoints(startKp, snapRes.keyPoint);
          this.resetSelection();
          return;
        }
      }

      // 拖出空白处松手：取消连线预览
      this.resetSelection();
      this.callbacks.onGuidanceChange?.('未对准有效目标点，已取消连线', 'info');
      return;
    }

    // ==========================================
    // 分支 2: 模型区域旋转拖拽释放
    // ==========================================
    if (this.isOrbitDragging || (this.hasMovedPastDragThreshold && dist >= tapSlop)) {
      this.isOrbitDragging = false;
      this.hasMovedPastDragThreshold = false;
      this.isPointerDownOnModel = false;
      return;
    }

    // ==========================================
    // 分支 3: 轻触（Tap）判定（位移在容差范围内）
    // ==========================================
    this.isOrbitDragging = false;
    this.hasMovedPastDragThreshold = false;
    this.isPointerDownOnModel = false;

    if (context?.camera) {
      const mouseNDC = labPointerNDC(event, context?.renderer?.domElement);
      this.internalRaycaster.setFromCamera(mouseNDC, context.camera);
      const snapRes = this.mesh.findClosestSnapPoint(this.internalRaycaster.ray, snapThreshold, {
        onlyOnEdgeOrLine: true,
      });

      if (snapRes?.keyPoint) {
        this.handleClickOnPoint(snapRes.keyPoint);
        return;
      }
    }

    if (this.pendingStartPoint) {
      // 若已有选中的起点，轻触空白处取消选择
      this.resetSelection();
    } else if (this.selectedCutPoints.length > 0) {
      // 若在剖切模式下有选中点，轻触空白处取消选择
      this.resetSelection();
    } else {
      this.callbacks.onGuidanceChange?.('起点须在线上，请轻触棱上端点、中点 (1/2) 或三等分点 (1/3)', 'info');
    }
  }

  /**
   * 处理关键点的点击事件。
   */
  private handleClickOnPoint(kp: KeyPoint): void {
    if (this.currentMode === 'three-point-cut') {
      // 截面剖切定面模式
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

    // 默认及两点连线模式：两点连线
    if (!this.pendingStartPoint) {
      // 第一次点击：选择连线起点
      this.pendingStartPoint = kp;
      this.mesh.setSelectedKeyPoints([kp.id]);
      this.callbacks.onGuidanceChange?.(`已选起点 ${kp.label} · 移动至目标点完成接线 (按 Esc 取消)`, 'info');
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
    } else if (this.pendingStartPoint.id === kp.id) {
      // 再次点击相同点：取消选择
      this.resetSelection();
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
    } else {
      // 第二次点击：完成连线
      const start = this.pendingStartPoint;
      this.connectTwoPoints(start, kp);
      this.resetSelection();
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
    }
  }

  /**
   * 在两个关键点之间创建空间线段。
   */
  private connectTwoPoints(p1: KeyPoint, p2: KeyPoint): void {
    const prevFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
    const seg = this.mesh.addSegment(p1.id, p2.id);
    if (seg) {
      this.callbacks.onSegmentCreated?.(seg.label, seg.length);
      const newFaces = this.mesh.getAuxiliaryFaces ? this.mesh.getAuxiliaryFaces() : [];
      if (newFaces.length > prevFaces.length) {
        const latestFace = newFaces[newFaces.length - 1];
        this.callbacks.onAuxiliaryFaceCreated?.(latestFace);
        this.callbacks.onGuidanceChange?.(
          `已闭合生成辅助面: ${latestFace.faceLabel} (${latestFace.polygonType}, 面积: ${latestFace.area.toFixed(3)}m²)`,
          'success'
        );
      } else {
        this.callbacks.onGuidanceChange?.(`成功生成辅助线 ${seg.label} (长 ${this.mesh.formatNormalizedDistance(seg.length)})`, 'success');
      }
    }
  }

  private getKeyPointColor(kp: KeyPoint): number {
    if (kp.type === 'vertex') return 0x38bdf8;
    if (kp.type === 'midpoint') return 0xfbbf24;
    if (kp.type === 'third') return 0x10b981;
    if (kp.type === 'center') return 0xc084fc;
    return 0x38bdf8;
  }

  /**
   * 滚轮缩放事件处理器。
   */
  public onWheel(event: WheelEvent): void {
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const newScale = this.mesh.zoom(factor);
    this.callbacks.onScaleChange?.(newScale);
  }

  /**
   * 键盘快捷键（缩放与操作撤销）。
   */
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

  /**
   * 状态栏实时交互引导文案。
   */
  public getInteractionHint(): string {
    if (this.currentMode === 'three-point-cut') {
      const count = this.selectedCutPoints.length;
      if (count === 0) return '剖切模式：请点击第 1 个点';
      if (count === 1) return `剖切模式：已选 [${this.selectedCutPoints[0].label}]，请点击第 2 个点`;
      if (count === 2) return `剖切模式：已选 [${this.selectedCutPoints[0].label}, ${this.selectedCutPoints[1].label}]，请点击第 3 个点剖切`;
    }

    if (this.pendingStartPoint) {
      if (this.currentHoveredKp && this.currentHoveredKp.id !== this.pendingStartPoint.id) {
        const len = this.pendingStartPoint.position.distanceTo(this.currentHoveredKp.position);
        return `已选起点 ${this.pendingStartPoint.label} → 目标: ${this.currentSnapLabel} (距离: ${this.mesh.formatNormalizedDistance(len)}) · 轻触完成接线`;
      }
      return `已选起点 ${this.pendingStartPoint.label} · 滑动旋转视角，轻触目标点完成接线 (轻触空白取消)`;
    }

    if (this.currentHoveredKp) {
      return `吸附到: ${this.currentSnapLabel} · 轻触选为起点`;
    }

    return '滑动模型旋转立体几何 · 轻触或拖拽棱线上端点/中点/三等分点接线';
  }

  /**
   * 每帧持续动画更新（手势旋转平滑阻尼与松手惯性阻尼）。
   */
  public update(delta: number): void {
    const dt = Math.min(delta, 0.1);

    if (this.isOrbitDragging) {
      // 拖拽过程中以高阶指数阻尼平滑逼近 targetRotation，彻底消除手势追踪 24-30Hz 阶跃与微颤
      if (
        Math.abs(this.targetRotationY - this.mesh.modelContainer.rotation.y) > 1e-4 ||
        Math.abs(this.targetRotationX - this.mesh.modelContainer.rotation.x) > 1e-4
      ) {
        const rotFactor = 1 - Math.exp(-26 * dt);
        this.mesh.modelContainer.rotation.y +=
          (this.targetRotationY - this.mesh.modelContainer.rotation.y) * rotFactor;
        this.mesh.modelContainer.rotation.x +=
          (this.targetRotationX - this.mesh.modelContainer.rotation.x) * rotFactor;
        this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
          this.mesh.modelContainer.rotation.x,
          -Math.PI * 0.40,
          Math.PI * 0.40
        );
      }
    } else if (
      Math.abs(this.rotationVelocity.x) > 1e-4 ||
      Math.abs(this.rotationVelocity.y) > 1e-4
    ) {
      this.mesh.modelContainer.rotation.y += this.rotationVelocity.x;
      this.mesh.modelContainer.rotation.x += this.rotationVelocity.y;
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x,
        -Math.PI * 0.40,
        Math.PI * 0.40
      );
      this.targetRotationX = this.mesh.modelContainer.rotation.x;
      this.targetRotationY = this.mesh.modelContainer.rotation.y;

      // 惯性阻尼衰减
      const damping = Math.max(0, 1 - dt * 4.5);
      this.rotationVelocity.multiplyScalar(damping);
    }
  }

  /**
   * 重置旋转至课本标准直观图斜二测视角（底面水平、侧棱竖直）。
   */
  public resetToIsometricView(): void {
    this.mesh.modelContainer.rotation.set(0.12, 0.42, 0);
    this.targetRotationX = 0.12;
    this.targetRotationY = 0.42;
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

  /**
   * 指针取消事件钩子。
   */
  public onPointerCancel(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) {
      this.isPinching = false;
    }
    if (this.activePointers.size === 0) {
      this.isPointerDown = false;
      this.isOrbitDragging = false;
      this.isConnectingDrag = false;
      this.dragStartKp = null;
      this.hasMovedPastDragThreshold = false;
      this.isPointerDownOnModel = false;
      this.pinchCooldown = false;
      if (!this.pendingStartPoint) {
        this.mesh?.clearPreviewWire();
      }
    }
  }

  /**
   * iPad 与触控屏幕的原生 Touch 触摸事件处理器。
   */
  public onTouchStart(event: TouchEvent, _context?: ExperimentContext): boolean {
    if (event.touches.length >= 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      this.isPinching = true;
      this.isOrbitDragging = false;
      this.hasMovedPastDragThreshold = false;
      this.mesh.setHoveredKeyPoint(null);
      this.mesh.clearPreviewWire();
      this.initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      this.initialPinchScale = this.mesh.getScale();
      this.callbacks.onGuidanceChange?.(`双指捏合缩放 · 当前: ${Math.round(this.initialPinchScale * 100)}%`, 'info');
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
      if (!this.isPinching) {
        this.isPinching = true;
        this.initialPinchDist = currentDist;
        this.initialPinchScale = this.mesh.getScale();
      }
      if (this.initialPinchDist > 5) {
        const factor = currentDist / this.initialPinchDist;
        const newScale = THREE.MathUtils.clamp(this.initialPinchScale * factor, 0.35, 3.0);
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
    if (this.isPinching && event.touches.length < 2) {
      this.isPinching = false;
      this.isOrbitDragging = false;
      this.hasMovedPastDragThreshold = false;
      if (event.touches.length === 1) {
        this.lastPointerX = event.touches[0].clientX;
        this.lastPointerY = event.touches[0].clientY;
        this.pointerDownX = event.touches[0].clientX;
        this.pointerDownY = event.touches[0].clientY;
      }
      this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
    }
  }

  public onTouchCancel(_event: TouchEvent): void {
    this.isPinching = false;
    this.pinchCooldown = false;
    this.isOrbitDragging = false;
    this.isConnectingDrag = false;
    this.dragStartKp = null;
    this.hasMovedPastDragThreshold = false;
    this.isPointerDownOnModel = false;
  }

  /**
   * Safari WebKit 手势处理器 (iPadOS)。
   */
  public onGestureStart(event: any): void {
    this.isPinching = true;
    this.initialPinchScale = this.mesh.getScale();
    if (typeof event.preventDefault === 'function' && event.cancelable) {
      event.preventDefault();
    }
  }

  public onGestureChange(event: any): void {
    if (this.isPinching && typeof event.scale === 'number') {
      const newScale = THREE.MathUtils.clamp(this.initialPinchScale * event.scale, 0.35, 3.0);
      this.mesh.setScale(newScale);
      this.callbacks.onScaleChange?.(newScale);
      this.callbacks.onGuidanceChange?.(`立体几何缩放: ${Math.round(newScale * 100)}%`, 'active');
      if (typeof event.preventDefault === 'function' && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  public onGestureEnd(event: any): void {
    if (this.isPinching) {
      this.isPinching = false;
      this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
      if (typeof event.preventDefault === 'function' && event.cancelable) {
        event.preventDefault();
      }
    }
  }

  /**
   * 编程式与触控 UI 缩放方法。
   */
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
    return this.isPinching;
  }
}
