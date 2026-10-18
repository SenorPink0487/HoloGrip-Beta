import * as THREE from 'three';
import type { CapacitorDischargeBenchMesh } from './CapacitorDischargeBenchMesh.ts';
import type { SwitchPosition } from '../../physics/em/capacitorDischarge.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface CapacitorInteractionCallbacks {
  bench: CapacitorDischargeBenchMesh;
  onSetSwitchPosition: (pos: SwitchPosition) => void;
  onCycleSwitch: () => void;
  onAdjustVoltage?: () => void;
  onClearSamples?: () => void;
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
        if (
          obj === this.callbacks.bench.powerKnobMesh ||
          obj.name === 'powerKnobMesh'
        ) {
          return {
            id: 'cap_power_knob',
            label: '电池组紧固旋钮（点击调节串联电池电压预设：3.0V ➔ 4.5V ➔ 6.0V）',
            cursor: 'pointer',
          };
        }
        if (
          obj === this.callbacks.bench.batteryPackGroup ||
          obj.name === 'powerSupplyGroup' ||
          obj.name === 'batteryPackGroup'
        ) {
          return {
            id: 'cap_power_supply',
            label: '双节干电池串联组（两节1.5V干电池串联，输出 3.0V 直流电压）',
            cursor: 'default',
          };
        }
        if (obj === this.callbacks.bench.rheostatGroup || obj.name === 'rheostatGroup') {
          return {
            id: 'cap_rheostat',
            label: 'J2354 瓷管滑动变阻器（1000Ω 0.5A 密绕电阻线圈）',
            cursor: 'default',
          };
        }
        if (obj === this.callbacks.bench.capacitorGroup || obj.name === 'capacitorGroup') {
          return {
            id: 'cap_capacitor',
            label: 'CD293 储能电容器组件（1000 µF 25V 铝电解储能电容）',
            cursor: 'default',
          };
        }
        if (obj === this.callbacks.bench.currentSensorGroup || obj.name === 'currentSensorGroup') {
          return {
            id: 'cap_sensor',
            label: 'DIS 数字化微电流传感器（高灵敏双向电流检测仪）',
            cursor: 'default',
          };
        }
        if (
          obj === this.callbacks.bench.scopeScreenMesh ||
          obj === this.callbacks.bench.scopeClearBtnMesh ||
          obj.name === 'scopeScreenMesh' ||
          obj.name === 'scopeClearBtn'
        ) {
          return {
            id: 'cap_scope_screen',
            label: '台面示波器波形屏（点击清除历史波形并重新触发采样）',
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
      if (
        obj === this.callbacks.bench.powerKnobMesh ||
        obj.name === 'powerKnobMesh'
      ) {
        this.callbacks.onAdjustVoltage?.();
        return true;
      }
      if (
        obj === this.callbacks.bench.scopeScreenMesh ||
        obj === this.callbacks.bench.scopeClearBtnMesh ||
        obj.name === 'scopeScreenMesh' ||
        obj.name === 'scopeClearBtn'
      ) {
        this.callbacks.onClearSamples?.();
        return true;
      }
      obj = obj.parent;
    }

    return false;
  }
}
