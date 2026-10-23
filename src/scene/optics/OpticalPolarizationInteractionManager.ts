import * as THREE from 'three';
import {
  OpticalPolarizationApparatusMesh,
  type PolarizationLightSourceMode,
  type OpticalPolarizationTelemetry,
} from './OpticalPolarizationApparatusMesh.ts';
import type { PolarizationSampleMode } from './OpticalPhysics.ts';

export interface OpticalPolarizationInteractionCallbacks {
  onLightSourceModeChange?: (mode: PolarizationLightSourceMode) => void;
  onWavelengthChange?: (wlNm: number) => void;
  onLaserPowerToggle?: (on: boolean) => void;
  onPolarizerAngleChange?: (angleDeg: number, telemetry: OpticalPolarizationTelemetry) => void;
  onAnalyzerAngleChange?: (angleDeg: number, telemetry: OpticalPolarizationTelemetry) => void;
  onSampleModeChange?: (mode: PolarizationSampleMode, telemetry: OpticalPolarizationTelemetry) => void;
  onWaveplateFastAxisChange?: (angleDeg: number, telemetry: OpticalPolarizationTelemetry) => void;
  onStressLoadChange?: (loadMPa: number, telemetry: OpticalPolarizationTelemetry) => void;
  onBrewsterToggle?: (enabled: boolean, telemetry: OpticalPolarizationTelemetry) => void;
  onScreenDistanceChange?: (distM: number, telemetry: OpticalPolarizationTelemetry) => void;
}

export class OpticalPolarizationInteractionManager {
  private apparatus: OpticalPolarizationApparatusMesh;
  private rootGroup: THREE.Group;
  private callbacks: OpticalPolarizationInteractionCallbacks;

  private dragMode:
    | 'none'
    | 'screen'
    | 'polarizer'
    | 'analyzer'
    | 'waveplate'
    | 'stress_screw' = 'none';

  private dragPlane = new THREE.Plane();
  private dragStartScreenX = 0;
  private dragStartPointerPos = new THREE.Vector3();
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartAngle = 0;
  private dragStartLoadMPa = 48.0;

  constructor(
    apparatus: OpticalPolarizationApparatusMesh,
    rootGroup: THREE.Group,
    callbacks: OpticalPolarizationInteractionCallbacks = {}
  ) {
    this.apparatus = apparatus;
    this.rootGroup = rootGroup;
    this.callbacks = callbacks;
  }

  public get isDragging(): boolean {
    return this.dragMode !== 'none';
  }

  /**
   * 射线检测悬停目标 (供 Engine.ts 自由鼠标光标 / 准星与原生悬停提示使用)
   */
  public getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    if (this.dragMode === 'screen') {
      this.apparatus.setKnobHovered(null, false);
      const distMm = (this.apparatus.screenDistanceM * 1000).toFixed(0);
      const telem = this.apparatus.getTelemetry();
      return {
        id: 'screen_handle',
        label: `滑动偏振光强接收屏 · 屏距 L = ${distMm} mm (透射比 I/I₀ = ${(telem.transmittedIntensity * 100).toFixed(1)}%)`,
        cursor: 'grabbing',
      };
    }

    if (this.dragMode === 'polarizer') {
      this.apparatus.setKnobHovered(null, false);
      return {
        id: 'polarizer_micrometer',
        label: this.apparatus.hasInteractedWithPolarizer
          ? ''
          : `旋转起偏器 P₁ 透振轴 · θ_P = ${this.apparatus.polarizerAngleDeg.toFixed(1)}°`,
        cursor: 'ew-resize',
      };
    }

    if (this.dragMode === 'analyzer') {
      this.apparatus.setKnobHovered(null, false);
      return {
        id: 'analyzer_micrometer',
        label: this.apparatus.hasInteractedWithAnalyzer
          ? ''
          : `旋转检偏器 P₂ 透振轴 · θ_A = ${this.apparatus.analyzerAngleDeg.toFixed(1)}°`,
        cursor: 'ew-resize',
      };
    }

    if (this.dragMode === 'waveplate') {
      this.apparatus.setKnobHovered(null, false);
      return {
        id: 'waveplate_knob',
        label: this.apparatus.hasInteractedWithWaveplate
          ? ''
          : `调节波片快轴/晶体主截面方位角 · θ_WP = ${this.apparatus.waveplateFastAxisDeg.toFixed(1)}°`,
        cursor: 'ew-resize',
      };
    }

    if (this.dragMode === 'stress_screw') {
      this.apparatus.setKnobHovered(null, false);
      return {
        id: 'stress_screw',
        label: `调节光弹机械压应力螺杆 · σ = ${this.apparatus.stressLoadMPa.toFixed(1)} MPa`,
        cursor: 'ns-resize',
      };
    }

    const targets = typeof (this.apparatus as any).getInteractiveObjects === 'function'
      ? (this.apparatus as any).getInteractiveObjects()
      : this.apparatus.group.children;
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      this.apparatus.setKnobHovered(null, false);
      return null;
    }

    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.apparatus.group) {
        const id = cur.userData?.interactiveId || cur.name;

        if (id === 'laser_power' || cur.name === 'LaserPowerSwitch') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'laser_power',
            label: `非偏振自然光源电源 · 当前[${this.apparatus.laserPower ? '开启' : '关闭'}] (点击切换)`,
            cursor: 'pointer',
          };
        }

        if (id === 'source_white' || cur.name === 'SourceWhiteButton') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'source_white',
            label: `切换复合白光模式 (用于光弹彩色应力等色线与色偏振干涉)`,
            cursor: 'pointer',
          };
        }

        if (id && id.startsWith('laser_wavelength_')) {
          this.apparatus.setKnobHovered(null, false);
          const wl = cur.userData?.wavelength || 532;
          const colorName = wl === 650 ? '绯红激光 (650nm)' : wl === 532 ? '翠绿激光 (532nm)' : '蓝紫激光 (405nm)';
          return {
            id,
            label: `切换单色激光源 · ${colorName}`,
            cursor: 'pointer',
          };
        }

        if (
          id === 'brewster_toggle' ||
          cur.name === 'BrewsterToggleKnob' ||
          cur.name === 'BrewsterGlassStackMesh' ||
          cur.name === 'BrewsterPivotArm'
        ) {
          if (!this.apparatus.hasInteractedWithBrewster) {
            this.apparatus.setKnobHovered('brewster_toggle', true);
            const stateStr = this.apparatus.enableBrewsterPlate
              ? '已切入·反射100%完全s线偏振光'
              : '已停靠·自由入射';
            return {
              id: 'brewster_toggle',
              label: `布儒斯特角玻片起偏台 (θ_B = 56.6°) · 当前[${stateStr}] (点击切入或移出)`,
              cursor: 'pointer',
            };
          } else {
            this.apparatus.setKnobHovered('brewster_toggle', false);
            return {
              id: 'brewster_toggle',
              label: '',
              cursor: 'pointer',
            };
          }
        }

        if (
          id === 'polarizer_micrometer' ||
          id === 'polarizer_rotor' ||
          cur.name === 'PolarizerMicrometerKnob' ||
          cur.name === 'PolarizerCrystalMesh' ||
          cur.name === 'PolarizerRotorGroup'
        ) {
          if (!this.apparatus.hasInteractedWithPolarizer) {
            this.apparatus.setKnobHovered('polarizer_micrometer', true);
            return {
              id: 'polarizer_micrometer',
              label: `360°旋转起偏器 P₁ (按住左右拖拽调节起偏轴 θ_P = ${this.apparatus.polarizerAngleDeg.toFixed(1)}°)`,
              cursor: 'ew-resize',
            };
          } else {
            this.apparatus.setKnobHovered('polarizer_micrometer', false);
            return {
              id: 'polarizer_micrometer',
              label: '',
              cursor: 'ew-resize',
            };
          }
        }

        if (
          id === 'analyzer_micrometer' ||
          id === 'analyzer_rotor' ||
          cur.name === 'AnalyzerMicrometerKnob' ||
          cur.name === 'AnalyzerCrystalMesh' ||
          cur.name === 'AnalyzerRotorGroup'
        ) {
          if (!this.apparatus.hasInteractedWithAnalyzer) {
            this.apparatus.setKnobHovered('analyzer_micrometer', true);
            const telem = this.apparatus.getTelemetry();
            return {
              id: 'analyzer_micrometer',
              label: `360°旋转检偏器 P₂ (按住左右拖拽调节检偏轴 θ_A = ${this.apparatus.analyzerAngleDeg.toFixed(1)}° · 透射比 ${(telem.transmittedIntensity * 100).toFixed(1)}%)`,
              cursor: 'ew-resize',
            };
          } else {
            this.apparatus.setKnobHovered('analyzer_micrometer', false);
            return {
              id: 'analyzer_micrometer',
              label: '',
              cursor: 'ew-resize',
            };
          }
        }

        if (id === 'preset_parallel' || cur.name === 'PresetParallelButton') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'preset_parallel',
            label: `快捷定位：平行透射极值位 (Δθ = 0° · I = I₀ 最亮)`,
            cursor: 'pointer',
          };
        }

        if (id === 'preset_45' || cur.name === 'Preset45Button') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'preset_45',
            label: `快捷定位：45° 半透射/圆偏振检验位 (Δθ = 45° · I = 0.5 I₀)`,
            cursor: 'pointer',
          };
        }

        if (id === 'preset_crossed' || cur.name === 'PresetCrossedButton') {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'preset_crossed',
            label: `快捷定位：正交完全消光位 (Δθ = 90° · I = 0 正交暗场)`,
            cursor: 'pointer',
          };
        }

        if (id === 'sample_turret' || cur.name === 'SampleTurretWheel') {
          if (!this.apparatus.hasInteractedWithSampleTurret) {
            this.apparatus.setKnobHovered('sample_turret', true);
            const telem = this.apparatus.getTelemetry();
            return {
              id: 'sample_turret',
              label: `五工位偏振/双折射样品转换轮 · 当前[${telem.sampleModeName}] (点击切换实验模块)`,
              cursor: 'pointer',
            };
          } else {
            this.apparatus.setKnobHovered('sample_turret', false);
            return {
              id: 'sample_turret',
              label: '',
              cursor: 'pointer',
            };
          }
        }

        if (
          id === 'waveplate_knob' ||
          cur.name === 'WaveplateMicrometerKnob' ||
          cur.name === 'WaveplateCrystalMesh' ||
          cur.name === 'CalciteCrystalMesh'
        ) {
          if (!this.apparatus.hasInteractedWithWaveplate) {
            this.apparatus.setKnobHovered('waveplate_knob', true);
            return {
              id: 'waveplate_knob',
              label: `波片快轴 / 冰洲石晶体主截面旋钮 (左右拖拽调节 θ_WP = ${this.apparatus.waveplateFastAxisDeg.toFixed(1)}°)`,
              cursor: 'ew-resize',
            };
          } else {
            this.apparatus.setKnobHovered('waveplate_knob', false);
            return {
              id: 'waveplate_knob',
              label: '',
              cursor: 'ew-resize',
            };
          }
        }

        if (
          id === 'stress_screw' ||
          cur.name === 'StressLoadScrewKnob' ||
          cur.name === 'PhotoelasticSpecimenMesh'
        ) {
          this.apparatus.setKnobHovered(null, false);
          return {
            id: 'stress_screw',
            label: `光弹机械应力加载螺杆 (按住拖拽调节载荷 σ = ${this.apparatus.stressLoadMPa.toFixed(0)} MPa)`,
            cursor: 'ns-resize',
          };
        }

        if (
          id === 'screen_handle' ||
          id === 'screen_surface' ||
          cur.name === 'ScreenCarrierGroup' ||
          cur.name === 'ScreenBoardMesh' ||
          cur.name === 'ScreenSurfaceMesh'
        ) {
          this.apparatus.setKnobHovered(null, false);
          const distMm = (this.apparatus.screenDistanceM * 1000).toFixed(0);
          return {
            id: 'screen_handle',
            label: `全景偏振/马吕斯曲线接收屏滑座 (按住沿导轨拖拽调节屏距 L = ${distMm} mm)`,
            cursor: 'grab',
          };
        }

        cur = cur.parent;
      }
    }

    this.apparatus.setKnobHovered(null, false);
    return null;
  }

  /**
   * 鼠标/触控指针按下
   */
  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null): boolean {
    if (!hit) return false;

    let cur: THREE.Object3D | null = hit.object;
    let targetId = '';
    let targetObject: THREE.Object3D | null = null;

    while (cur && cur !== this.apparatus.group) {
      if (cur.userData?.interactiveId) {
        targetId = cur.userData.interactiveId;
        targetObject = cur;
        break;
      }
      cur = cur.parent;
    }

    if (!targetId) return false;

    if (targetId === 'laser_power') {
      const nextPower = !this.apparatus.laserPower;
      this.apparatus.setLaserPower(nextPower);
      this.callbacks.onLaserPowerToggle?.(nextPower);
      return true;
    }

    if (targetId === 'source_white') {
      this.apparatus.setLightSourceMode('white');
      this.callbacks.onLightSourceModeChange?.('white');
      return true;
    }

    if (targetId.startsWith('laser_wavelength_')) {
      const wl = Number(targetObject?.userData?.wavelength || 532);
      this.apparatus.setWavelength(wl);
      this.callbacks.onLightSourceModeChange?.('monochromatic');
      this.callbacks.onWavelengthChange?.(wl);
      return true;
    }

    if (targetId === 'brewster_toggle') {
      this.apparatus.markInteracted('brewster_toggle');
      const nextEnabled = this.apparatus.toggleBrewsterPlate();
      this.callbacks.onBrewsterToggle?.(nextEnabled, this.apparatus.getTelemetry());
      return true;
    }

    if (targetId === 'sample_turret') {
      this.apparatus.markInteracted('sample_turret');
      const nextMode = this.apparatus.cycleNextSampleMode();
      this.callbacks.onSampleModeChange?.(nextMode, this.apparatus.getTelemetry());
      return true;
    }

    if (targetId === 'preset_parallel') {
      const nextA = this.apparatus.polarizerAngleDeg;
      this.apparatus.setAnalyzerAngle(nextA);
      this.callbacks.onAnalyzerAngleChange?.(nextA, this.apparatus.getTelemetry());
      return true;
    }

    if (targetId === 'preset_45') {
      const nextA = (this.apparatus.polarizerAngleDeg + 45.0) % 180;
      this.apparatus.setAnalyzerAngle(nextA);
      this.callbacks.onAnalyzerAngleChange?.(nextA, this.apparatus.getTelemetry());
      return true;
    }

    if (targetId === 'preset_crossed') {
      const nextA = (this.apparatus.polarizerAngleDeg + 90.0) % 180;
      this.apparatus.setAnalyzerAngle(nextA);
      this.callbacks.onAnalyzerAngleChange?.(nextA, this.apparatus.getTelemetry());
      return true;
    }

    if (targetId === 'polarizer_micrometer' || targetId === 'polarizer_rotor') {
      this.apparatus.markInteracted('polarizer_micrometer');
      this.dragMode = 'polarizer';
      this.dragStartClientX = event.clientX;
      this.dragStartClientY = event.clientY;
      this.dragStartAngle = this.apparatus.polarizerAngleDeg;
      return true;
    }

    if (targetId === 'analyzer_micrometer' || targetId === 'analyzer_rotor') {
      this.apparatus.markInteracted('analyzer_micrometer');
      this.dragMode = 'analyzer';
      this.dragStartClientX = event.clientX;
      this.dragStartClientY = event.clientY;
      this.dragStartAngle = this.apparatus.analyzerAngleDeg;
      return true;
    }

    if (targetId === 'waveplate_knob') {
      this.apparatus.markInteracted('waveplate_knob');
      this.dragMode = 'waveplate';
      this.dragStartClientX = event.clientX;
      this.dragStartClientY = event.clientY;
      this.dragStartAngle = this.apparatus.waveplateFastAxisDeg;
      return true;
    }

    if (targetId === 'stress_screw') {
      this.dragMode = 'stress_screw';
      this.dragStartClientX = event.clientX;
      this.dragStartClientY = event.clientY;
      this.dragStartLoadMPa = this.apparatus.stressLoadMPa;
      return true;
    }

    if (targetId === 'screen_handle' || targetId === 'screen_surface') {
      this.dragMode = 'screen';
      this.dragStartScreenX = this.apparatus.getScreenCarrierX();
      this.dragStartClientX = event.clientX;
      this.dragStartPointerPos.copy(hit.point);
      this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), hit.point);
      return true;
    }

    return false;
  }

  /**
   * 鼠标/触控指针移动
   */
  public onPointerMove(event: PointerEvent, raycaster: THREE.Raycaster): void {
    if (this.dragMode === 'none') return;

    const dxPx = event.clientX - this.dragStartClientX;
    const dyPx = event.clientY - this.dragStartClientY;

    if (this.dragMode === 'polarizer') {
      const nextAngle = ((this.dragStartAngle + dxPx * 0.45 - dyPx * 0.25) % 180 + 180) % 180;
      this.apparatus.setPolarizerAngle(nextAngle);
      this.callbacks.onPolarizerAngleChange?.(nextAngle, this.apparatus.getTelemetry());
      return;
    }

    if (this.dragMode === 'analyzer') {
      const nextAngle = ((this.dragStartAngle + dxPx * 0.45 - dyPx * 0.25) % 180 + 180) % 180;
      this.apparatus.setAnalyzerAngle(nextAngle);
      this.callbacks.onAnalyzerAngleChange?.(nextAngle, this.apparatus.getTelemetry());
      return;
    }

    if (this.dragMode === 'waveplate') {
      const nextAngle = ((this.dragStartAngle + dxPx * 0.45 - dyPx * 0.25) % 180 + 180) % 180;
      this.apparatus.setWaveplateFastAxis(nextAngle);
      this.callbacks.onWaveplateFastAxisChange?.(nextAngle, this.apparatus.getTelemetry());
      return;
    }

    if (this.dragMode === 'stress_screw') {
      const nextLoad = THREE.MathUtils.clamp(
        this.dragStartLoadMPa + (dxPx - dyPx) * 0.35,
        10.0,
        100.0
      );
      this.apparatus.setStressLoad(nextLoad);
      this.callbacks.onStressLoadChange?.(nextLoad, this.apparatus.getTelemetry());
      return;
    }

    if (this.dragMode === 'screen') {
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(this.dragPlane, hitPoint)) {
        const localDelta = hitPoint.x - this.dragStartPointerPos.x;
        const scale = this.rootGroup.scale.x || 1.0;
        const nextX = this.dragStartScreenX + localDelta / scale;
        this.apparatus.syncDistanceFromScreenX(nextX);
      } else {
        const nextX = this.dragStartScreenX + dxPx * 0.0008;
        this.apparatus.syncDistanceFromScreenX(nextX);
      }
      this.apparatus.updateOpticalPaths();
      this.apparatus.updateScreenTexture();
      this.callbacks.onScreenDistanceChange?.(
        this.apparatus.screenDistanceM,
        this.apparatus.getTelemetry()
      );
    }
  }

  /**
   * 鼠标/触控指针释放
   */
  public onPointerUp(_event: PointerEvent): void {
    this.dragMode = 'none';
  }
}
