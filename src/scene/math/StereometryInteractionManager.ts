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

  // 指针与多指拖拽状态
  private isPointerDown = false;
  private isOrbitDragging = false;
  private isConnectingDrag = false;
  private dragStartKp: KeyPoint | null = null;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private rotationVelocity = new THREE.Vector2(0, 0);

  // 双指捏合缩放状态（iPad 与触控设备）
  private activePointers = new Map<number, { x: number; y: number }>();
  private isPinching = false;
  private initialPinchDist = 0;
  private initialPinchScale = 1.0;

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
    const wasPending = Boolean(this.pendingStartPoint);
    this.pendingStartPoint = null;
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
   * 查找离射线最近的关键点，支持磁吸（顶点、1/2 中点、1/3 与 2/3 三等分点、面心）。
   */
  public findKeyPointNearRay(raycaster: THREE.Raycaster, threshold = 0.055): KeyPoint | null {
    const res = this.mesh.findClosestSnapPoint(raycaster.ray, threshold);
    return res ? res.keyPoint : null;
  }

  /**
   * 引擎调用的指针按下事件钩子。
   */
  public onPointerDown(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    context: ExperimentContext
  ): boolean {
    if (event.button !== 0) return false;

    // 记录多指触控指针（用于 iPad 及触控设备双指缩放）
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size >= 2) {
      // 检测到双指：立即切换为捏合缩放模式
      const pts = Array.from(this.activePointers.values());
      this.isPinching = true;
      this.isOrbitDragging = false;
      this.isConnectingDrag = false;
      this.dragStartKp = null;
      this.mesh.setHoveredKeyPoint(null);
      this.mesh.clearPreviewWire();
      this.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.initialPinchScale = this.mesh.getScale();
      this.callbacks.onGuidanceChange?.(`双指捏合缩放 · 当前: ${Math.round(this.initialPinchScale * 100)}%`, 'info');
      return true;
    }

    this.isPointerDown = true;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.rotationVelocity.set(0, 0);

    let snapKp: KeyPoint | null = null;
    let snapLabel = '';

    if (context?.camera) {
      const mouseNDC = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, context.camera);
      // 自适应磁吸半径：iPad 触摸触控拥有更大的吸附容差
      const isTouchPointer = event.pointerType === 'touch';
      const snapThreshold = this.currentHoveredKp
        ? (isTouchPointer ? 0.095 : 0.075)
        : (isTouchPointer ? 0.080 : 0.060);
      const snapRes = this.mesh.findClosestSnapPoint(raycaster.ray, snapThreshold);
      if (snapRes) {
        snapKp = snapRes.keyPoint;
        snapLabel = snapRes.snapLabel;
      }
    }

    if (snapKp) {
      // 按在磁吸关键点上：开始准备连线
      this.isConnectingDrag = true;
      this.isOrbitDragging = false;
      this.dragStartKp = snapKp;
      this.currentHoveredKp = snapKp;
      this.currentSnapLabel = snapLabel;
      this.mesh.setHoveredKeyPoint(snapKp.id, snapLabel);
    } else {
      // 按在空白区域/模型背景上：开始视角旋转拖拽
      this.isConnectingDrag = false;
      this.isOrbitDragging = true;
      this.dragStartKp = null;
    }

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

    if (this.isOrbitDragging) {
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      const rotSpeed = 0.007;
      this.mesh.modelContainer.rotation.y += dx * rotSpeed;
      this.mesh.modelContainer.rotation.x += dy * rotSpeed;

      // 限制垂直仰俯角，防止模型翻转颠倒
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x,
        -Math.PI * 0.40,
        Math.PI * 0.40
      );

      this.rotationVelocity.set(dx * rotSpeed, dy * rotSpeed);
      return;
    }

    // 带磁吸判定的射线投射检测
    let hoveredKp: KeyPoint | null = null;
    let hoveredLabel = '';
    const mouseNDC = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    if (context?.camera) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, context.camera);
      const isTouchPointer = event.pointerType === 'touch';
      const snapThreshold = this.currentHoveredKp
        ? (isTouchPointer ? 0.095 : 0.075)
        : (isTouchPointer ? 0.075 : 0.055);
      const snapRes = this.mesh.findClosestSnapPoint(raycaster.ray, snapThreshold);
      if (snapRes) {
        hoveredKp = snapRes.keyPoint;
        hoveredLabel = snapRes.snapLabel;
      }

      // 实时橡皮筋动态预览连线更新
      const activeStart = this.isConnectingDrag ? this.dragStartKp : this.pendingStartPoint;
      if (activeStart) {
        if (hoveredKp && hoveredKp.id !== activeStart.id) {
          // 吸附到目标点
          const len = activeStart.position.distanceTo(hoveredKp.position);
          let targetName = hoveredKp.label;
          if (hoveredKp.subLabel === '1/2') {
            targetName = hoveredKp.edgeVertices ? `${hoveredKp.edgeVertices[0]}${hoveredKp.edgeVertices[1]} 中点` : `${hoveredKp.label} 中点`;
          } else if (hoveredKp.subLabel === '1/3') {
            targetName = hoveredKp.edgeVertices ? `${hoveredKp.edgeVertices[0]}${hoveredKp.edgeVertices[1]} (1/3)` : `${hoveredKp.label} (1/3)`;
          } else if (hoveredKp.subLabel === '2/3') {
            targetName = hoveredKp.edgeVertices ? `${hoveredKp.edgeVertices[0]}${hoveredKp.edgeVertices[1]} (2/3)` : `${hoveredKp.label} (2/3)`;
          } else if (hoveredKp.type === 'center') {
            targetName = `${hoveredKp.label} 中心`;
          }
          const badgeText = `→ ${targetName} · ${len.toFixed(3)}m`;
          this.mesh.updatePreviewWire(activeStart.position, hoveredKp.position, 0x10b981, badgeText, context.camera);
          const snapColor = this.getKeyPointColor(hoveredKp);
          this.callbacks.onGuidanceChange?.(
            `已选起点 ${activeStart.label} → 目标: ${hoveredLabel || hoveredKp.label} (距离: ${len.toFixed(3)}m) · 单击完成接线`,
            'active',
            snapColor
          );
        } else {
          // 将光标投影至过起点且平行于相机平面的空间平面上
          const normal = new THREE.Vector3();
          context.camera.getWorldDirection(normal).negate();
          const startWorld = activeStart.position.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, startWorld);
          const hitWorld = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(plane, hitWorld)) {
            const hitLocal = hitWorld.clone().applyMatrix4(this.mesh.modelContainer.matrixWorld.clone().invert());
            const len = activeStart.position.distanceTo(hitLocal);
            const badgeText = `${len.toFixed(3)}m`;
            this.mesh.updatePreviewWire(activeStart.position, hitLocal, 0x38bdf8, badgeText, context.camera);
            this.callbacks.onGuidanceChange?.(`已选起点 ${activeStart.label} · 移动至目标点完成接线 (按 Esc 取消)`, 'info');
          }
        }
      } else if (hoveredKp) {
        const snapColor = this.getKeyPointColor(hoveredKp);
        this.callbacks.onGuidanceChange?.(`已吸附 ${hoveredLabel || hoveredKp.label} · 单击或拖拽连线`, 'info', snapColor);
      } else {
        this.callbacks.onGuidanceChange?.('悬停吸附端点 / 中点 (1/2) / 三等分点 (1/3) 接线 · 空白处拖拽旋转视角', 'info');
      }
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

  /**
   * 当模态弹窗开启或视图失去焦点时，重置所有悬停状态、预览连线与拖拽状态。
   */
  public clearHover(): void {
    this.currentHoveredKp = null;
    this.currentSnapLabel = '';
    this.isOrbitDragging = false;
    this.isConnectingDrag = false;
    this.isPointerDown = false;
    this.isPinching = false;
    this.activePointers.clear();
    this.rotationVelocity.set(0, 0);
    this.mesh?.setHoveredKeyPoint(null);
    this.mesh?.clearPreviewWire();
    this.callbacks.onKeyPointHover?.(null);
    this.callbacks.onGuidanceChange?.('悬停吸附端点 / 中点 (1/2) / 三等分点 (1/3) 接线 · 空白处拖拽旋转视角', 'info');
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'default';
    }
  }

  /**
   * 指针抬起事件钩子：区分拖拽连线与单击交互。
   */
  public onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.activePointers.delete(event.pointerId);

    // 双指捏合释放处理
    if (this.isPinching) {
      if (this.activePointers.size < 2) {
        this.isPinching = false;
        this.isConnectingDrag = false;
        this.dragStartKp = null;
        this.isOrbitDragging = false;
        if (this.activePointers.size === 1) {
          const remaining = Array.from(this.activePointers.values())[0];
          this.lastPointerX = remaining.x;
          this.lastPointerY = remaining.y;
          this.pointerDownX = remaining.x;
          this.pointerDownY = remaining.y;
        } else {
          this.isPointerDown = false;
        }
        this.callbacks.onGuidanceChange?.(`缩放完成 · 当前: ${Math.round(this.mesh.getScale() * 100)}%`, 'success');
      }
      return;
    }

    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const dist = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);

    if (this.isOrbitDragging) {
      this.isOrbitDragging = false;
      // 若用户仅在空白处轻点：取消正在进行的连线等待
      if (dist < 5 && this.pendingStartPoint) {
        this.resetSelection();
      }
      return;
    }

    if (context?.camera) {
      const mouseNDC = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, context.camera);
      const snapRes = this.mesh.findClosestSnapPoint(raycaster.ray, 0.055);
      const targetKp = snapRes?.keyPoint ?? null;

      if (dist > 8 && this.dragStartKp) {
        // 拖拽接线：在目标关键点上释放
        if (targetKp && targetKp.id !== this.dragStartKp.id) {
          this.connectTwoPoints(this.dragStartKp, targetKp);
          this.resetSelection();
        } else {
          // 在空中空白区域释放：将拖拽起点保留为连线待确认起点
          this.pendingStartPoint = this.dragStartKp;
          this.mesh.setSelectedKeyPoints([this.dragStartKp.id]);
        }
      } else {
        // 单击点选交互
        if (targetKp) {
          this.handleClickOnPoint(targetKp);
        } else {
          // 点击空白区域：清空待连线选择
          this.resetSelection();
        }
      }
    }

    this.isConnectingDrag = false;
    this.dragStartKp = null;
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
        this.callbacks.onGuidanceChange?.(`成功生成辅助线 ${seg.label} (长 ${seg.length.toFixed(3)}m)`, 'success');
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
        return `已选起点 ${this.pendingStartPoint.label} → 目标: ${this.currentSnapLabel} (距离: ${len.toFixed(3)}m) · 单击完成接线`;
      }
      return `已选起点 ${this.pendingStartPoint.label} · 移动鼠标吸附端点/中点/三等分点 (单击空白取消)`;
    }

    if (this.currentHoveredKp) {
      return `吸附到: ${this.currentSnapLabel} · 单击或拖拽开始接线`;
    }

    return '悬停吸附端点 / 中点 (1/2) / 三等分点 (1/3) 接线 · 空白处拖拽旋转视角';
  }

  /**
   * 每帧持续动画更新（惯性阻尼）。
   */
  public update(delta: number): void {
    if (!this.isOrbitDragging && !this.isConnectingDrag && (Math.abs(this.rotationVelocity.x) > 1e-4 || Math.abs(this.rotationVelocity.y) > 1e-4)) {
      this.mesh.modelContainer.rotation.y += this.rotationVelocity.x;
      this.mesh.modelContainer.rotation.x += this.rotationVelocity.y;
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x,
        -Math.PI * 0.40,
        Math.PI * 0.40
      );

      // 惯性阻尼衰减
      const damping = Math.max(0, 1 - delta * 4.5);
      this.rotationVelocity.multiplyScalar(damping);
    }
  }

  /**
   * 重置旋转至课本标准直观图斜二测视角（底面水平、侧棱竖直）。
   */
  public resetToIsometricView(): void {
    this.mesh.modelContainer.rotation.set(0.12, 0.42, 0);
    this.rotationVelocity.set(0, 0);
  }

  public resetToFrontView(): void {
    this.mesh.modelContainer.rotation.set(0, 0, 0);
    this.rotationVelocity.set(0, 0);
  }

  public resetToSideView(): void {
    this.mesh.modelContainer.rotation.set(0, Math.PI / 2, 0);
    this.rotationVelocity.set(0, 0);
  }

  public resetToTopView(): void {
    this.mesh.modelContainer.rotation.set(-Math.PI / 2, 0, 0);
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
      this.isConnectingDrag = false;
      this.dragStartKp = null;
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
      this.isConnectingDrag = false;
      this.dragStartKp = null;
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
    this.isOrbitDragging = false;
    this.isConnectingDrag = false;
    this.dragStartKp = null;
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
