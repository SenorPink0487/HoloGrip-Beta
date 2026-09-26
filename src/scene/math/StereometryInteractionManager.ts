import * as THREE from 'three';
import type { StereometryMesh } from './StereometryMesh.ts';
import { GeometrySolver, type KeyPoint } from './GeometrySolver.ts';
import type { ExperimentContext } from '../../core/types.ts';

export type InteractionMode =
  | 'direct'          // 直接自然交互 (旋转/连线/剖切自适应)
  | 'orbit'           // 兼容旧接口：自由空间拖拽旋转
  | 'connect-line'    // 兼容旧接口：两点连线
  | 'three-point-cut' // 兼容旧接口：三点定面截面
  | 'set-origin';     // 选取原点建系

export interface StereometryInteractionCallbacks {
  onKeyPointClick?: (point: KeyPoint, mode: InteractionMode) => void;
  onKeyPointHover?: (point: KeyPoint | null) => void;
  onSegmentCreated?: (segLabel: string, length: number) => void;
  onCrossSectionCreated?: (type: string, area: number) => void;
  onOriginChanged?: (point: KeyPoint) => void;
  onScaleChange?: (scale: number) => void;
  onClearSegments?: () => void;
}

export class StereometryInteractionManager {
  private mesh: StereometryMesh;
  private callbacks: StereometryInteractionCallbacks;
  private currentMode: InteractionMode = 'direct';

  // Rotation dragging state
  private isDragging = false;
  private hasDragged = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private rotationVelocity = new THREE.Vector2(0, 0);

  // Direct interactive selection buffer
  private selectedKeyPoints: KeyPoint[] = [];

  constructor(mesh: StereometryMesh, callbacks: StereometryInteractionCallbacks = {}) {
    this.mesh = mesh;
    this.callbacks = callbacks;
  }

  public setMode(mode: InteractionMode): void {
    this.currentMode = mode;
  }

  public getMode(): InteractionMode {
    return this.currentMode;
  }

  public getSelectedCutPoints(): KeyPoint[] {
    return [...this.selectedKeyPoints];
  }

  public resetSelection(): void {
    this.selectedKeyPoints = [];
    this.mesh.setSelectedKeyPoints([]);
  }

  public clearAll(): void {
    this.selectedKeyPoints = [];
    this.mesh.setSelectedKeyPoints([]);
    this.mesh.clearAllSegments();
    this.mesh.setOptions({ crossSectionPlane: undefined, clippingEnabled: false });
    this.callbacks.onClearSegments?.();
  }

  /**
   * Find the closest KeyPoint within a generous 3D screen-space ray snap distance.
   */
  public findKeyPointNearRay(raycaster: THREE.Raycaster, threshold = 0.045): KeyPoint | null {
    const kpMeshes = this.mesh.getKeyPointMeshes();
    let closestKp: KeyPoint | null = null;
    let minDistance = threshold;
    const worldPos = new THREE.Vector3();

    for (const m of kpMeshes) {
      if (!m.userData?.keyPoint) continue;
      m.getWorldPosition(worldPos);
      const dist = raycaster.ray.distanceToPoint(worldPos);
      if (dist < minDistance) {
        minDistance = dist;
        closestKp = m.userData.keyPoint;
      }
    }

    return closestKp;
  }

  /**
   * Pointer Down Hook called by Engine.
   */
  public onPointerDown(
    event: PointerEvent,
    _hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean {
    if (event.button !== 0) return false;

    this.isDragging = true;
    this.hasDragged = false;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.rotationVelocity.set(0, 0);
    return true;
  }

  /**
   * Pointer Move Hook called by Engine.
   */
  public onPointerMove(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext
  ): void {
    if (this.isDragging) {
      const dist = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);
      if (dist > 4) {
        this.hasDragged = true;
      }

      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      const rotSpeed = 0.007;
      this.mesh.modelContainer.rotation.y += dx * rotSpeed;
      this.mesh.modelContainer.rotation.x += dy * rotSpeed;

      // Clamp vertical tilt to prevent tumbling upside down
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x,
        -Math.PI * 0.40,
        Math.PI * 0.40
      );

      this.rotationVelocity.set(dx * rotSpeed, dy * rotSpeed);
      return;
    }

    // Raycast hover check against KeyPoints
    let hoveredKp: KeyPoint | null = null;
    const kpMeshes = this.mesh.getKeyPointMeshes();
    if (hit) {
      const hitObj = hit.object;
      const hitKpMesh = kpMeshes.find((m) => m === hitObj || m.children.includes(hitObj as any));
      if (hitKpMesh && hitKpMesh.userData.keyPoint) {
        hoveredKp = hitKpMesh.userData.keyPoint;
      }
    }

    if (!hoveredKp && context?.camera) {
      const mouseNDC = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouseNDC, context.camera);
      hoveredKp = this.findKeyPointNearRay(ray);
    }

    if (hoveredKp) {
      this.mesh.setHoveredKeyPoint(hoveredKp.id);
      this.callbacks.onKeyPointHover?.(hoveredKp);
      document.body.style.cursor = 'pointer';
    } else {
      this.mesh.setHoveredKeyPoint(null);
      this.callbacks.onKeyPointHover?.(null);
      document.body.style.cursor = 'default';
    }
  }

  /**
   * Pointer Up Hook - Dispatches clean clicks vs drag operations.
   */
  public onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    const wasDragging = this.isDragging;
    const hasDragged = this.hasDragged;
    this.isDragging = false;

    if (!wasDragging || hasDragged) {
      return;
    }

    // This was a clean CLICK! Determine target keypoint
    let clickedKp: KeyPoint | null = null;
    if (context?.camera) {
      const mouseNDC = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, context.camera);

      // 1. Direct hit on keypoint sphere
      const hits = raycaster.intersectObjects(this.mesh.getKeyPointMeshes(), false);
      if (hits.length > 0 && hits[0].object.userData?.keyPoint) {
        clickedKp = hits[0].object.userData.keyPoint;
      }

      // 2. Or magnetic snap within 4.5cm radius
      if (!clickedKp) {
        clickedKp = this.findKeyPointNearRay(raycaster, 0.045);
      }
    }

    if (clickedKp) {
      this.handleDirectKeyPointClick(clickedKp);
    } else {
      // Clicked on empty space: clear active vertex buffer if nothing was drawn
      if (this.selectedKeyPoints.length === 1) {
        this.resetSelection();
      }
    }
  }

  /**
   * Direct Natural KeyPoint Interaction:
   * 1st click: selects vertex (glowing pulse ring)
   * 2nd click: connects vertex 1 & 2 (line segment, measures distance)
   * 3rd click: solves cutting plane from 1, 2, 3 (creates 3D cross section, measures area)
   * 4th click: connects vertex 3 & 4 (second line segment, analyzes skew angle)
   * 5th click: starts fresh cycle
   */
  private handleDirectKeyPointClick(kp: KeyPoint): void {
    // If clicking the same vertex that was just clicked, deselect it
    if (this.selectedKeyPoints.length > 0 && this.selectedKeyPoints[this.selectedKeyPoints.length - 1].id === kp.id) {
      this.selectedKeyPoints.pop();
      this.mesh.setSelectedKeyPoints(this.selectedKeyPoints.map((p) => p.id));
      this.callbacks.onKeyPointClick?.(kp, this.currentMode);
      return;
    }

    if (this.selectedKeyPoints.length >= 4) {
      this.selectedKeyPoints = [];
    }

    this.selectedKeyPoints.push(kp);
    this.mesh.setSelectedKeyPoints(this.selectedKeyPoints.map((p) => p.id));
    this.callbacks.onKeyPointClick?.(kp, this.currentMode);

    const count = this.selectedKeyPoints.length;

    if (count === 2) {
      // Create connection segment between point 1 and point 2
      const [p1, p2] = this.selectedKeyPoints;
      const seg = this.mesh.addSegment(p1.id, p2.id);
      if (seg) {
        this.callbacks.onSegmentCreated?.(seg.label, seg.length);
      }
    } else if (count === 3) {
      // 3 points: solve cutting plane!
      const [p1, p2, p3] = this.selectedKeyPoints;
      const plane = GeometrySolver.solvePlaneFrom3Points(p1.position, p2.position, p3.position);
      this.mesh.setOptions({ crossSectionPlane: plane, clippingEnabled: true });
      const res = this.mesh.getCrossSectionResult();
      if (res) {
        this.callbacks.onCrossSectionCreated?.(res.polygonType, res.area);
      }
    } else if (count === 4) {
      // 4th point: connect point 3 and point 4 into a second line segment!
      const p3 = this.selectedKeyPoints[2];
      const p4 = this.selectedKeyPoints[3];
      const seg = this.mesh.addSegment(p3.id, p4.id);
      if (seg) {
        this.callbacks.onSegmentCreated?.(seg.label, seg.length);
      }
    }
  }

  /**
   * Mouse Wheel Zoom Handler.
   */
  public onWheel(event: WheelEvent): void {
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const newScale = this.mesh.zoom(factor);
    this.callbacks.onScaleChange?.(newScale);
  }

  /**
   * Keyboard shortcuts for Zooming and Shortcuts.
   */
  public onKeyDown(event: KeyboardEvent): boolean {
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

    if (event.code === 'Escape' || event.code === 'KeyC') {
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
   * Real-Time User Interaction Hint for Status Card.
   */
  public getInteractionHint(): string {
    const count = this.selectedKeyPoints.length;
    if (count === 0) {
      return '点击顶点连线或定面剖切';
    } else if (count === 1) {
      const p1 = this.selectedKeyPoints[0];
      return `已选顶点 ${p1.label}`;
    } else if (count === 2) {
      const [p1, p2] = this.selectedKeyPoints;
      return `线段 ${p1.label}${p2.label}`;
    } else if (count === 3) {
      const [p1, p2, p3] = this.selectedKeyPoints;
      return `截面 (${p1.label}, ${p2.label}, ${p3.label})`;
    } else {
      return '空间几何分析已就绪';
    }
  }

  /**
   * Continuous animation update (inertial damping).
   */
  public update(delta: number): void {
    if (!this.isDragging && (Math.abs(this.rotationVelocity.x) > 1e-4 || Math.abs(this.rotationVelocity.y) > 1e-4)) {
      this.mesh.modelContainer.rotation.y += this.rotationVelocity.x;
      this.mesh.modelContainer.rotation.x += this.rotationVelocity.y;
      this.mesh.modelContainer.rotation.x = THREE.MathUtils.clamp(
        this.mesh.modelContainer.rotation.x,
        -Math.PI * 0.40,
        Math.PI * 0.40
      );

      // Inertial damping
      const damping = Math.max(0, 1 - delta * 4.5);
      this.rotationVelocity.multiplyScalar(damping);
    }
  }

  /**
   * Reset rotation to canonical textbook oblique view (horizontal base, vertical edges).
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
}
