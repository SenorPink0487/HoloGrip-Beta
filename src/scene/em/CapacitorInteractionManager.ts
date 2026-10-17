import * as THREE from 'three';
import type { CapacitorDischargeBenchMesh } from './CapacitorDischargeBenchMesh.ts';
import type { SwitchPosition } from '../../physics/em/capacitorDischarge.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface CapacitorInteractionCallbacks {
  bench: CapacitorDischargeBenchMesh;
  onSetSwitchPosition: (pos: SwitchPosition) => void;
  onCycleSwitch: () => void;
  onAdjustVoltage?: () => void;
}

export class CapacitorInteractionManager {
  private callbacks: CapacitorInteractionCallbacks;

  constructor(callbacks: CapacitorInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    const hits = raycaster.intersectObject(this.callbacks.bench.group, true);

    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj !== this.callbacks.bench.group) {
        if (
          obj === this.callbacks.bench.switchKnifeMesh ||
          obj === this.callbacks.bench.switchHandleMesh ||
          obj.name === 'switchKnifeBlade' ||
          obj.name === 'switchHandle'
        ) {
          return {
            id: 'cap_switch_knife',
            label: '单刀双掷开关动触刀（点击依次循环：充电 ↔ 断开 ↔ 放电）',
            cursor: 'pointer',
          };
        }
        if (obj === this.callbacks.bench.switchLeftContactMesh || obj.name === 'switchLeftContact') {
          return {
            id: 'cap_switch_left',
            label: '电源侧触点（点击将刀闸掷于电源侧：给电容器充电）',
            cursor: 'pointer',
          };
        }
        if (obj === this.callbacks.bench.switchRightContactMesh || obj.name === 'switchRightContact') {
          return {
            id: 'cap_switch_right',
            label: '放电侧触点（点击将刀闸掷于放电侧：电容器放电）',
            cursor: 'pointer',
          };
        }
        if (obj === this.callbacks.bench.powerKnobMesh || obj.name === 'powerKnobMesh') {
          return {
            id: 'cap_power_knob',
            label: '直流电源电压旋钮（点击循环调节电压：5V → 10V → 15V）',
            cursor: 'pointer',
          };
        }
        if (obj === this.callbacks.bench.powerSwitchMesh || obj.name === 'powerSwitchMesh') {
          return {
            id: 'cap_power_switch',
            label: '电源总开关（点击重置/启闭电源）',
            cursor: 'pointer',
          };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  public onPointerDown(_event: PointerEvent, hit: THREE.Intersection | null, _context: ExperimentContext): boolean {
    if (!hit) return false;

    let obj: THREE.Object3D | null = hit.object;
    while (obj && obj !== this.callbacks.bench.group) {
      if (
        obj === this.callbacks.bench.switchKnifeMesh ||
        obj === this.callbacks.bench.switchHandleMesh ||
        obj.name === 'switchKnifeBlade' ||
        obj.name === 'switchHandle'
      ) {
        this.callbacks.onCycleSwitch();
        return true;
      }
      if (obj === this.callbacks.bench.switchLeftContactMesh || obj.name === 'switchLeftContact') {
        this.callbacks.onSetSwitchPosition('charge');
        return true;
      }
      if (obj === this.callbacks.bench.switchRightContactMesh || obj.name === 'switchRightContact') {
        this.callbacks.onSetSwitchPosition('discharge');
        return true;
      }
      if (obj === this.callbacks.bench.powerKnobMesh || obj.name === 'powerKnobMesh') {
        this.callbacks.onAdjustVoltage?.();
        return true;
      }
      if (obj === this.callbacks.bench.powerSwitchMesh || obj.name === 'powerSwitchMesh') {
        this.callbacks.onAdjustVoltage?.();
        return true;
      }
      obj = obj.parent;
    }

    return false;
  }
}
