import * as THREE from 'three';
import type { StereometryMesh } from './StereometryMesh.ts';
import { GeometrySolver, type KeyPoint } from './GeometrySolver.ts';
import type { ExperimentContext } from '../../core/types.ts';

export type InteractionMode =
  | 'orbit'           // 自由空间拖拽旋转
  | 'connect-line'    // 两点连线
  | 'three-point-cut' // 三点定面截面
  | 'set-origin';     // 选取原点建系

export interface StereometryInteractionCallbacks {
  onKeyPointClick?: (point: KeyPoint, mode: InteractionMode) => void;
  onKeyPointHover?: (point: KeyPoint | null) => void;
  onSegmentCreated?: (segLabel: string, length: number) => void;
  onCrossSectionCreated?: (type: string, area: number) => void;
  onOriginChanged?: (point: KeyPoint) => void;
}

export class StereometryInteractionManager {
  private mesh: StereometryMesh;
  private callbacks: StereometryInteractionCallbacks;
  private currentMode: InteractionMode = 'orbit';

  // Rotation dragging state
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private rotationVelocity = new THREE.Vector2(0, 0);

  // Line creation buffer
  private selectedPointForLine: KeyPoint | null = null;

  // 3-point cross section buffer
  private selectedPointsForCut: KeyPoint[] = [];

  constructor(mesh: StereometryMesh, callbacks: StereometryInteractionCallbacks = {}) {
    this.mesh = mesh;
    this.callbacks = callbacks;
  }

  public setMode(mode: InteractionMode): void {
    this.currentMode = mode;
    this.selectedPointForLine = null;
    this.selectedPointsForCut = [];
  }

  public getMode(): InteractionMode {
    return this.currentMode;
  }

  public getSelectedCutPoints(): KeyPoint[] {
    return [...this.selectedPointsForCut];
  }

  public resetSelection(): void {
    this.selectedPointForLine = null;
    this.selectedPointsForCut = [];
  }

  /**
   * Pointer Down Hook called by Engine.
   */
  public onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    _context: ExperimentContext
  ): boolean {
    if (event.button !== 0) return false;

    // 1. Check if clicked on a KeyPoint mesh
    const kpMeshes = this.mesh.getKeyPointMeshes();
    if (hit) {
      const hitObj = hit.object;
      const hitKpMesh = kpMeshes.find((m) => m === hitObj || m.children.includes(hitObj as any));

      if (hitKpMesh && hitKpMesh.userData.keyPoint) {
        const kp: KeyPoint = hitKpMesh.userData.keyPoint;
        this.handleKeyPointClick(kp);
        return true;
      }
    }

    // 2. Otherwise start free 3D orbit rotation
    this.isDragging = true;
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
    _context: ExperimentContext
  ): void {
    if (this.isDragging) {
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
    const kpMeshes = this.mesh.getKeyPointMeshes();
    if (hit) {
      const hitObj = hit.object;
      const hitKpMesh = kpMeshes.find((m) => m === hitObj || m.children.includes(hitObj as any));

      if (hitKpMesh && hitKpMesh.userData.keyPoint) {
        const kp: KeyPoint = hitKpMesh.userData.keyPoint;
        this.mesh.setHoveredKeyPoint(kp.id);
        this.callbacks.onKeyPointHover?.(kp);
        document.body.style.cursor = 'pointer';
        return;
      }
    }

    this.mesh.setHoveredKeyPoint(null);
    this.callbacks.onKeyPointHover?.(null);
    document.body.style.cursor = 'default';
  }

  /**
   * Pointer Up Hook.
   */
  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.isDragging = false;
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

  // -------------------------------------------------------------
  // KeyPoint Click Logic based on Active Tool Mode
  // -------------------------------------------------------------
  private handleKeyPointClick(kp: KeyPoint): void {
    this.callbacks.onKeyPointClick?.(kp, this.currentMode);

    switch (this.currentMode) {
      case 'connect-line': {
        if (!this.selectedPointForLine) {
          this.selectedPointForLine = kp;
        } else {
          if (this.selectedPointForLine.id !== kp.id) {
            const seg = this.mesh.addSegment(this.selectedPointForLine.id, kp.id);
            if (seg) {
              this.callbacks.onSegmentCreated?.(seg.label, seg.length);
            }
          }
          this.selectedPointForLine = null;
        }
        break;
      }

      case 'three-point-cut': {
        if (!this.selectedPointsForCut.some((p) => p.id === kp.id)) {
          this.selectedPointsForCut.push(kp);
        }

        if (this.selectedPointsForCut.length === 3) {
          const [p1, p2, p3] = this.selectedPointsForCut;
          const plane = GeometrySolver.solvePlaneFrom3Points(p1.position, p2.position, p3.position);
          this.mesh.setOptions({ crossSectionPlane: plane });

          const res = this.mesh.getCrossSectionResult();
          if (res) {
            this.callbacks.onCrossSectionCreated?.(res.polygonType, res.area);
          }
          this.selectedPointsForCut = [];
        }
        break;
      }

      case 'set-origin': {
        this.mesh.setOptions({ originKeyPointId: kp.id });
        this.callbacks.onOriginChanged?.(kp);
        break;
      }

      case 'orbit':
      default:
        break;
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
