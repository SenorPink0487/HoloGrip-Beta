import * as THREE from 'three';
import type { PistonCylinderMesh } from './PistonCylinderMesh';
import type { ThermostatHeaterMesh } from './ThermostatHeaterMesh';
import type { ExperimentContext } from '../../core/types';

export interface ThermoInteractionCallbacks {
  piston: PistonCylinderMesh;
  heater: ThermostatHeaterMesh;
  onVolumeChange: (volL: number) => void;
  onTemperatureChange: (tempK: number) => void;
}

export type ThermoDragTarget = 'none' | 'piston_handle' | 'heater_knob';

export class ThermoInteractionManager {
  private callbacks: ThermoInteractionCallbacks;
  private dragTarget: ThermoDragTarget = 'none';

  private startClientY = 0;
  private startClientX = 0;
  private startVolume = 2.5;
  private startTempK = 300;

  constructor(callbacks: ThermoInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragTarget === 'piston_handle') {
      return { id: 'piston_handle', label: '垂直拖动活塞调整容积 V', cursor: 'ns-resize' };
    }
    if (this.dragTarget === 'heater_knob') {
      return { id: 'heater_knob', label: '水平拖动旋钮调节温度 T', cursor: 'ew-resize' };
    }

    // Raycast against interactive meshes
    const hits = raycaster.intersectObjects([
      this.callbacks.piston.handleMesh,
      this.callbacks.heater.knobMesh,
    ], true);

    if (hits.length > 0) {
      const obj = hits[0].object;
      if (obj === this.callbacks.piston.handleMesh || obj.parent === this.callbacks.piston.handleMesh) {
        return { id: 'piston_handle', label: '拖拽活塞调整容积 V (1.0L - 5.0L)', cursor: 'ns-resize' };
      }
      if (obj === this.callbacks.heater.knobMesh || obj.parent === this.callbacks.heater.knobMesh) {
        return { id: 'heater_knob', label: '旋转旋钮调节加热温度 T (100K - 800K)', cursor: 'ew-resize' };
      }
    }

    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) {
      this.dragTarget = 'none';
      return false;
    }

    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj === this.callbacks.piston.handleMesh) {
        this.dragTarget = 'piston_handle';
        this.startClientY = event.clientY;
        this.startVolume = this.callbacks.piston.getPistonVolume();
        return true;
      }
      if (obj === this.callbacks.heater.knobMesh) {
        this.dragTarget = 'heater_knob';
        this.startClientX = event.clientX;
        this.startTempK = 300; // Will be passed via current temp
        return true;
      }
      obj = obj.parent;
    }

    this.dragTarget = 'none';
    return false;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, _context: ExperimentContext): void {
    if (this.dragTarget === 'piston_handle') {
      // Invert Y: dragging mouse up increases volume, dragging down decreases
      const deltaY = this.startClientY - event.clientY;
      const sensitivity = 0.015; // liters per pixel
      const newVol = Math.max(1.0, Math.min(5.0, this.startVolume + deltaY * sensitivity));
      this.callbacks.onVolumeChange(newVol);
    } else if (this.dragTarget === 'heater_knob') {
      const deltaX = event.clientX - this.startClientX;
      const sensitivity = 1.8; // Kelvin per pixel
      const newTemp = Math.max(100, Math.min(800, this.startTempK + deltaX * sensitivity));
      this.callbacks.onTemperatureChange(newTemp);
    }
  }

  public onPointerUp(_event: PointerEvent, _context: ExperimentContext): void {
    this.dragTarget = 'none';
  }

  public setStartTemp(t: number): void {
    this.startTempK = t;
  }

  public isDragging(): boolean {
    return this.dragTarget !== 'none';
  }
}
