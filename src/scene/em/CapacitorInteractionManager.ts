import * as THREE from 'three';
import type { CapacitorDischargeBenchMesh } from './CapacitorDischargeBenchMesh.ts';
import type { SwitchPosition } from '../../physics/em/capacitorDischarge.ts';
import type { ExperimentContext } from '../../core/types.ts';

export interface CapacitorInteractionCallbacks {
  bench: CapacitorDischargeBenchMesh;
  onSetSwitchPosition: (pos: SwitchPosition) => void;
  onCycleSwitch: () => void;
  onAdjustVoltage?: () => void;
  onAdjustResistance?: () => void;
  onSetResistance?: (rOhm: number) => void;
  onAdjustCapacitance?: () => void;
  onClearSamples?: () => void;
}

export class CapacitorInteractionManager {
  private callbacks: CapacitorInteractionCallbacks;
  private dragMode: 'none' | 'rheostat_slider' | 'switch_blade' = 'none';
  private dragPlane = new THREE.Plane();
  private dragStartPointerPos = new THREE.Vector2();
  private hasDragged = false;
  private switchAccumX = 0;

  constructor(callbacks: CapacitorInteractionCallbacks) {
    this.callbacks = callbacks;
  }

  private isRheostatSlider(obj: THREE.Object3D | null): boolean {
    let curr = obj;
    while (curr && curr !== this.callbacks.bench.group) {
      if (curr === this.callbacks.bench.rheostatSliderGroup || curr.name === 'rheostatSliderGroup') {
        return true;
      }
      curr = curr.parent;
    }
    return false;
  }

  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragMode === 'rheostat_slider') {
      return {
        id: 'cap_rheostat_slider',
        label: 'J2354 变阻器滑块（横向拖拽调节阻值中）',
        cursor: 'grabbing',
      };
    }
    if (this.dragMode === 'switch_blade') {
      return {
        id: 'cap_switch_knife',
        label: '单刀双掷动触刀（拖拽拨动中）',
        cursor: 'grabbing',
      };
    }

    const hits = raycaster.intersectObject(this.callbacks.bench.group, true);

    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj !== this.callbacks.bench.group) {
        // 1. 动触刀及其手柄旋转总成
        if (
          obj === this.callbacks.bench.switchKnifeMesh ||
          obj === this.callbacks.bench.switchHandleMesh ||
          obj === this.callbacks.bench.switchLeverGroup ||
          obj.name === 'switchKnifeBlade' ||
          obj.name === 'switchHandle' ||
          obj.name === 'switchHandleTip' ||
          obj.name === 'switchHandleGroup' ||
          obj.name === 'switchLeverGroup'
        ) {
          return {
            id: 'cap_switch_knife',
            label: '单刀双掷动触刀（左右拖拽拨动或点击切换：充电 ↔ 断开 ↔ 放电）',
            cursor: 'grab',
          };
        }
        // 2. 左侧电源充电触点
        if (
          obj === this.callbacks.bench.switchLeftContactMesh ||
          obj.name === 'switchLeftContact' ||
          obj.name?.includes('LeftContact')
        ) {
          return {
            id: 'cap_switch_left',
            label: '电源侧触点（点击将刀闸掷于电源侧：给电容器充电）',
            cursor: 'pointer',
          };
        }
        // 3. 右侧放电电阻触点
        if (
          obj === this.callbacks.bench.switchRightContactMesh ||
          obj.name === 'switchRightContact' ||
          obj.name?.includes('RightContact')
        ) {
          return {
            id: 'cap_switch_right',
            label: '放电侧触点（点击将刀闸掷于放电侧：电容器放电）',
            cursor: 'pointer',
          };
        }
        // 4. 双掷开关电木底座整组
        if (obj === this.callbacks.bench.spdtSwitchGroup || obj.name === 'spdtSwitchGroup') {
          return {
            id: 'cap_switch_base',
            label: '单刀双掷开关（点击左侧充电 / 点击右侧放电）',
            cursor: 'pointer',
          };
        }
        // 5. 电池组与电压调节旋钮
        if (
          obj === this.callbacks.bench.powerKnobMesh ||
          obj === this.callbacks.bench.batteryPackGroup ||
          obj.name === 'powerKnobMesh' ||
          obj.name === 'powerSwitchMesh' ||
          obj.name === 'powerSupplyGroup' ||
          obj.name === 'batteryPackGroup'
        ) {
          return {
            id: 'cap_power_knob',
            label: '双节干电池串联组（点击切换供电电压：3.0V ➔ 4.5V ➔ 6.0V）',
            cursor: 'pointer',
          };
        }
        // 6. 滑动变阻器滑块 (支持沿滑杆横向平滑拖拽)
        if (this.isRheostatSlider(obj)) {
          return {
            id: 'cap_rheostat_slider',
            label: 'J2354 变阻器滑块（按住横向拖拽调节阻值）',
            cursor: 'grab',
          };
        }
        // 7. 滑动变阻器整体
        if (obj === this.callbacks.bench.rheostatGroup || obj.name === 'rheostatGroup') {
          return {
            id: 'cap_rheostat',
            label: 'J2354 瓷管滑动变阻器（点击或拖拽滑块微调阻值）',
            cursor: 'pointer',
          };
        }
        // 8. 储能电容器
        if (obj === this.callbacks.bench.capacitorGroup || obj.name === 'capacitorGroup') {
          return {
            id: 'cap_capacitor',
            label: 'CD293 储能电容器组件（点击切换容量：470µF ➔ 1000µF ➔ 2200µF）',
            cursor: 'pointer',
          };
        }
        // 9. 电流传感器
        if (obj === this.callbacks.bench.currentSensorGroup || obj.name === 'currentSensorGroup') {
          return {
            id: 'cap_sensor',
            label: 'DIS 数字化微电流传感器（高灵敏双向电流检测仪）',
            cursor: 'default',
          };
        }
        // 10. 桌面台式数字存储示波器
        if (
          obj === this.callbacks.bench.scopeScreenMesh ||
          obj === this.callbacks.bench.scopeChassisMesh ||
          obj === this.callbacks.bench.scopeClearBtnMesh ||
          obj.name === 'scopeScreenMesh' ||
          obj.name === 'scopeChassisMesh' ||
          obj.name === 'scopeClearBtn'
        ) {
          return {
            id: 'cap_scope_screen',
            label: '台式数字存储示波器（点击清屏重测 / 重新采样）',
            cursor: 'pointer',
          };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    if (!hit) return false;

    let obj: THREE.Object3D | null = hit.object;
    while (obj && obj !== this.callbacks.bench.group) {
      // 1. 动触刀旋转总成：支持左右拨动拖拽与点击档位切换
      if (
        obj === this.callbacks.bench.switchKnifeMesh ||
        obj === this.callbacks.bench.switchHandleMesh ||
        obj === this.callbacks.bench.switchLeverGroup ||
        obj.name === 'switchKnifeBlade' ||
        obj.name === 'switchHandle' ||
        obj.name === 'switchHandleTip' ||
        obj.name === 'switchHandleGroup' ||
        obj.name === 'switchLeverGroup'
      ) {
        this.dragMode = 'switch_blade';
        this.dragStartPointerPos.set(event.clientX, event.clientY);
        this.hasDragged = false;
        return true;
      }
      // 2. 左侧充电触点
      if (
        obj === this.callbacks.bench.switchLeftContactMesh ||
        obj.name === 'switchLeftContact' ||
        obj.name?.includes('LeftContact')
      ) {
        this.callbacks.onSetSwitchPosition('charge');
        return true;
      }
      // 3. 右侧放电触点
      if (
        obj === this.callbacks.bench.switchRightContactMesh ||
        obj.name === 'switchRightContact' ||
        obj.name?.includes('RightContact')
      ) {
        this.callbacks.onSetSwitchPosition('discharge');
        return true;
      }
      // 4. 双掷开关底座
      if (obj === this.callbacks.bench.spdtSwitchGroup || obj.name === 'spdtSwitchGroup') {
        if (hit.point.x < -0.195) {
          this.callbacks.onSetSwitchPosition('charge');
        } else if (hit.point.x > -0.165) {
          this.callbacks.onSetSwitchPosition('discharge');
        } else {
          this.callbacks.onCycleSwitch();
        }
        return true;
      }
      // 5. 电池组电压切换
      if (
        obj === this.callbacks.bench.powerKnobMesh ||
        obj === this.callbacks.bench.batteryPackGroup ||
        obj.name === 'powerKnobMesh' ||
        obj.name === 'powerSwitchMesh' ||
        obj.name === 'powerSupplyGroup' ||
        obj.name === 'batteryPackGroup'
      ) {
        this.callbacks.onAdjustVoltage?.();
        return true;
      }
      // 6. 滑动变阻器滑块或变阻器整体：支持直接拖拽滑块与点击管身快速定位
      if (this.isRheostatSlider(obj) || obj === this.callbacks.bench.rheostatGroup || obj.name === 'rheostatGroup') {
        this.dragMode = 'rheostat_slider';
        this.dragStartPointerPos.set(event.clientX, event.clientY);
        this.hasDragged = false;

        // 构造正对相机朝向、经过滑杆轴线的拖拽平面
        const rodWorldPos = new THREE.Vector3();
        if (this.callbacks.bench.rheostatSliderGroup) {
          this.callbacks.bench.rheostatSliderGroup.getWorldPosition(rodWorldPos);
        } else {
          rodWorldPos.copy(hit.point);
        }

        const camDir = new THREE.Vector3();
        context.camera.getWorldDirection(camDir);
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), rodWorldPos);

        // 若直接点击在瓷管线圈表面，快速定位滑块至点击位置
        const localHit = this.callbacks.bench.rheostatGroup.worldToLocal(hit.point.clone());
        const minX = -0.050;
        const maxX = 0.050;
        const clampedX = Math.max(minX, Math.min(maxX, localHit.x));
        const ratio = (clampedX - minX) / (maxX - minX);
        const resistance = Math.round(200 + ratio * 2800);
        this.callbacks.bench.setSliderX(clampedX, resistance);
        this.callbacks.onSetResistance?.(resistance);

        return true;
      }
      // 7. 电容器容量切换
      if (obj === this.callbacks.bench.capacitorGroup || obj.name === 'capacitorGroup') {
        this.callbacks.onAdjustCapacitance?.();
        return true;
      }
      // 8. 示波器清屏
      if (
        obj === this.callbacks.bench.scopeScreenMesh ||
        obj === this.callbacks.bench.scopeChassisMesh ||
        obj === this.callbacks.bench.scopeClearBtnMesh ||
        obj.name === 'scopeScreenMesh' ||
        obj.name === 'scopeChassisMesh' ||
        obj.name === 'scopeClearBtn'
      ) {
        this.callbacks.onClearSamples?.();
        return true;
      }
      obj = obj.parent;
    }

    return false;
  }

  public onPointerMove(event: PointerEvent, _hit: THREE.Intersection | null, context: ExperimentContext): void {
    const isLocked = typeof document !== 'undefined' && document.pointerLockElement !== null;

    if (this.dragMode === 'rheostat_slider') {
      if (isLocked) {
        // 第一人称准星锁定模式：使用鼠标相对水平位移 (movementX) 灵敏平滑微调
        const sensitivity = 0.00035;
        const currentX = this.callbacks.bench.rheostatSliderGroup?.position.x ?? 0;
        const newX = Math.max(-0.050, Math.min(0.050, currentX + (event.movementX ?? 0) * sensitivity));
        const ratio = (newX - (-0.050)) / 0.100;
        const resistance = Math.round(200 + ratio * 2800);

        this.hasDragged = true;
        this.callbacks.bench.setSliderX(newX, resistance);
        this.callbacks.onSetResistance?.(resistance);
        return;
      }

      // 未锁定模式：使用 3D 射线与投影平面精确求交
      const rect = context.renderer?.domElement?.getBoundingClientRect();
      const mouseNDC = new THREE.Vector2();
      if (rect && rect.width > 0 && rect.height > 0) {
        mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      } else {
        mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
      }

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseNDC, context.camera);

      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this.dragPlane, hitPoint)) {
        const localHit = this.callbacks.bench.rheostatGroup.worldToLocal(hitPoint);
        const minX = -0.050;
        const maxX = 0.050;
        const clampedX = Math.max(minX, Math.min(maxX, localHit.x));
        const ratio = (clampedX - minX) / (maxX - minX);
        const resistance = Math.round(200 + ratio * 2800);

        this.hasDragged = true;
        this.callbacks.bench.setSliderX(clampedX, resistance);
        this.callbacks.onSetResistance?.(resistance);
      }
      return;
    }

    if (this.dragMode === 'switch_blade') {
      if (isLocked) {
        this.switchAccumX += event.movementX ?? 0;
      } else {
        this.switchAccumX = event.clientX - this.dragStartPointerPos.x;
      }

      if (Math.abs(this.switchAccumX) > 6) {
        this.hasDragged = true;
        if (this.switchAccumX < -35) {
          this.callbacks.bench.setBladeAngle(0.96);
        } else if (this.switchAccumX > 35) {
          this.callbacks.bench.setBladeAngle(-0.96);
        } else {
          this.callbacks.bench.setBladeAngle((-this.switchAccumX / 35) * 0.96);
        }
      }
      return;
    }
  }

  public onPointerUp(event: PointerEvent, _context: ExperimentContext): void {
    if (this.dragMode === 'switch_blade') {
      if (this.hasDragged) {
        if (this.switchAccumX < -20) {
          this.callbacks.onSetSwitchPosition('charge');
        } else if (this.switchAccumX > 20) {
          this.callbacks.onSetSwitchPosition('discharge');
        } else {
          this.callbacks.onSetSwitchPosition('neutral');
        }
      } else {
        this.callbacks.onCycleSwitch();
      }
      this.dragMode = 'none';
      this.switchAccumX = 0;
      return;
    }

    if (this.dragMode === 'rheostat_slider') {
      this.dragMode = 'none';
      return;
    }

    this.dragMode = 'none';
  }
}
