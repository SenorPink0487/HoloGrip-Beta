import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { HallBenchMesh } from '../../../scene/em/HallBenchMesh.ts';
import { HallInteractionManager } from '../../../scene/em/HallInteractionManager.ts';
import type { CarrierType } from '../../../scene/em/HallCarrierParticleSystem.ts';
import type { HallTelemetryData } from '../../../ui/vision/HallStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export interface HallMaterialProfile {
  name: string;
  carrierType: CarrierType;
  carrierConcentration: number; // m^-3
  carrierCharge: number;        // C
  mobilityCm2Vs: number;        // cm^2 / (V·s)
}

export const MATERIAL_PROFILES: Record<string, HallMaterialProfile> = {
  'n-gaas': {
    name: 'n型砷化镓晶片 (n-GaAs)',
    carrierType: 'electron',
    carrierConcentration: 1.25e21,
    carrierCharge: -1.602176634e-19,
    mobilityCm2Vs: 8500,
  },
  'p-silicon': {
    name: 'p型单晶硅片 (p-Si)',
    carrierType: 'hole',
    carrierConcentration: 2.50e21,
    carrierCharge: 1.602176634e-19,
    mobilityCm2Vs: 450,
  },
  'copper': {
    name: '高纯金属紫铜薄膜 (Copper)',
    carrierType: 'metal',
    carrierConcentration: 8.49e28,
    carrierCharge: -1.602176634e-19,
    mobilityCm2Vs: 43,
  },
};

export default class EmHallExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 3.8;
  public override hideCenterEmitter = true;

  // 3D Assemblies
  private bench: HallBenchMesh;
  private interactionManager: HallInteractionManager;

  // Core Physical Variables
  private magFieldTesla = 0.5; // T
  private currentMa = 10.0;     // mA
  private waferThicknessMm = 0.5; // mm (0.0005 m)
  private readonly waferWidthMm = 4.0; // mm (0.004 m)
  private readonly waferLengthMm = 8.0; // mm (0.008 m)

  // Material & Carrier State
  private materialKey = 'n-gaas';
  private materialName = 'n型砷化镓晶片 (n-GaAs)';
  private carrierType: CarrierType = 'electron';
  private carrierConcentration = 1.25e21; // m^-3
  private carrierCharge = -1.602176634e-19; // C
  private mobilityCm2Vs = 8500; // cm^2 / (V·s)

  // Visual toggles
  private showVectors = true;
  private showParticles = true;

  // Telemetry listener for UI binding
  private telemetryCallback: ((data: HallTelemetryData) => void) | null = null;

  constructor() {
    super();
  }

  public init(_context: ExperimentContext): void {
    // Position experiment prominently in front workbench interaction zone
    this.rootGroup.position.set(0, 0.16, 1.60);

    // 1. High-precision 3D Hall Bench
    this.bench = this.track(new HallBenchMesh());
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    // 2. Interaction Manager for 3D direct click / hover feedback
    this.interactionManager = new HallInteractionManager({
      bench: this.bench,
      onCycleMaterial: () => this.cycleMaterial(),
      onToggleFieldPolarity: () => this.toggleFieldPolarity(),
      onToggleCurrentPolarity: () => this.toggleCurrentPolarity(),
    });

    this.applyMaterial(this.materialKey);
    this.recomputePhysicsAndSync();
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit, context) ?? false;
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    this.bench.update(delta);
  }

  // ================= Physics Solver & Calculations =================
  private recomputePhysicsAndSync(): void {
    const q = this.carrierCharge;
    const n = this.carrierConcentration;
    const dMeters = this.waferThicknessMm * 1e-3;
    const wMeters = this.waferWidthMm * 1e-3;
    const currentAmps = this.currentMa * 1e-3;
    const bTesla = this.magFieldTesla;

    // 1. Hall Coefficient R_H = 1 / (n * q)  [m^3 / C]
    const rh = 1.0 / (n * q);

    // 2. Hall Voltage V_H = R_H * (I * B) / d  [Volts]
    // Converted to millivolts
    const vhVolts = rh * (currentAmps * bTesla) / dMeters;
    const vhMv = vhVolts * 1000.0;

    // 3. Hall Sensitivity K_H = |R_H| / d  [V / (A·T) or mV / (mA·T)]
    const kh = Math.abs(rh) / dMeters;

    // 4. Hall Transverse Electric Field E_H = V_H / w  [V / m]
    const eh = vhVolts / wMeters;

    // 5. Drift Velocity v_d = I / (n * q * w * d)  [m / s]
    const vd = currentAmps / (n * Math.abs(q) * wMeters * dMeters);

    // 6. Lorentz Force F_L = q * v_d * B  [N]
    const fl = Math.abs(q) * vd * Math.abs(bTesla);

    // 7. Conductivity sigma = n * |q| * mu  [S / m]
    const muM2Vs = this.mobilityCm2Vs * 1e-4;
    const conductivity = n * Math.abs(q) * muM2Vs;

    // Update 3D Bench, Top Parameter HUD & OLED display
    this.bench.updateTelemetry(
      this.magFieldTesla,
      this.currentMa,
      vhMv,
      this.materialName,
      this.carrierType,
      this.carrierConcentration,
      this.waferThicknessMm
    );

    // Broadcast to UI Telemetry Card if connected
    const telemetry: HallTelemetryData = {
      magFieldTesla: this.magFieldTesla,
      currentMa: this.currentMa,
      waferThicknessMm: this.waferThicknessMm,
      waferWidthMm: this.waferWidthMm,
      waferLengthMm: this.waferLengthMm,
      materialKey: this.materialKey,
      materialName: this.materialName,
      carrierType: this.carrierType,
      carrierConcentration: this.carrierConcentration,
      carrierCharge: this.carrierCharge,
      mobilityCm2Vs: this.mobilityCm2Vs,
      conductivitySm: conductivity,
      hallCoefficientRh: rh,
      hallSensitivityKh: kh,
      hallVoltageMv: vhMv,
      hallElectricFieldVm: eh,
      driftVelocityMs: vd,
      lorentzForceN: fl,
      showVectors: this.showVectors,
      showParticles: this.showParticles,
    };

    this.telemetryCallback?.(telemetry);
  }

  // ================= Public API & Parameter Setters =================
  public setMagField(bTesla: number): void {
    this.magFieldTesla = bTesla;
    this.recomputePhysicsAndSync();
  }

  public toggleFieldPolarity(): void {
    this.magFieldTesla = -this.magFieldTesla;
    this.recomputePhysicsAndSync();
  }

  public setCurrent(currentMa: number): void {
    this.currentMa = currentMa;
    this.recomputePhysicsAndSync();
  }

  public toggleCurrentPolarity(): void {
    this.currentMa = -this.currentMa;
    this.recomputePhysicsAndSync();
  }

  public setThickness(thicknessMm: number): void {
    this.waferThicknessMm = Math.max(0.05, thicknessMm);
    this.recomputePhysicsAndSync();
  }

  public setCarrierConcentration(n: number): void {
    this.carrierConcentration = Math.max(1e18, n);
    this.materialKey = 'custom';
    this.materialName = '自定义科研参数 (Custom)';
    this.recomputePhysicsAndSync();
  }

  public toggleCarrierCharge(): void {
    this.carrierCharge = -this.carrierCharge;
    this.carrierType = this.carrierCharge < 0 ? 'electron' : 'hole';
    this.bench.particleSystem.setCarrierType(this.carrierType);
    this.materialKey = 'custom';
    this.materialName = '自定义科研参数 (Custom)';
    this.recomputePhysicsAndSync();
  }

  public setMobility(muCm2Vs: number): void {
    this.mobilityCm2Vs = Math.max(10, muCm2Vs);
    this.materialKey = 'custom';
    this.materialName = '自定义科研参数 (Custom)';
    this.recomputePhysicsAndSync();
  }

  public applyMaterial(materialKey: string): void {
    this.materialKey = materialKey;
    const profile = MATERIAL_PROFILES[materialKey];
    if (profile) {
      this.materialName = profile.name;
      this.carrierType = profile.carrierType;
      this.carrierConcentration = profile.carrierConcentration;
      this.carrierCharge = profile.carrierCharge;
      this.mobilityCm2Vs = profile.mobilityCm2Vs;
    } else {
      this.materialKey = 'custom';
      this.materialName = '自定义科研参数 (Custom)';
    }

    this.bench.setWaferAppearance(materialKey);
    this.bench.particleSystem.setCarrierType(this.carrierType);
    this.recomputePhysicsAndSync();
  }

  public cycleMaterial(): void {
    const keys = ['n-gaas', 'p-silicon', 'copper'];
    const idx = keys.indexOf(this.materialKey);
    const nextKey = keys[(idx + 1) % keys.length];
    this.applyMaterial(nextKey);
  }

  public setToggles(showVectors: boolean, showParticles: boolean): void {
    this.showVectors = showVectors;
    this.showParticles = showParticles;
    this.bench.setToggles(showVectors, showParticles);
    this.recomputePhysicsAndSync();
  }

  public onTelemetry(callback: (data: HallTelemetryData) => void): void {
    this.telemetryCallback = callback;
    this.recomputePhysicsAndSync();
  }

  public getTelemetryData(): HallTelemetryData {
    const q = this.carrierCharge;
    const n = this.carrierConcentration;
    const dMeters = this.waferThicknessMm * 1e-3;
    const wMeters = this.waferWidthMm * 1e-3;
    const currentAmps = this.currentMa * 1e-3;
    const bTesla = this.magFieldTesla;

    const rh = 1.0 / (n * q);
    const vhMv = (rh * (currentAmps * bTesla) / dMeters) * 1000.0;
    const kh = Math.abs(rh) / dMeters;
    const eh = (vhMv * 1e-3) / wMeters;
    const vd = currentAmps / (n * Math.abs(q) * wMeters * dMeters);
    const fl = Math.abs(q) * vd * Math.abs(bTesla);
    const muM2Vs = this.mobilityCm2Vs * 1e-4;
    const conductivity = n * Math.abs(q) * muM2Vs;

    return {
      magFieldTesla: this.magFieldTesla,
      currentMa: this.currentMa,
      waferThicknessMm: this.waferThicknessMm,
      waferWidthMm: this.waferWidthMm,
      waferLengthMm: this.waferLengthMm,
      materialKey: this.materialKey,
      materialName: this.materialName,
      carrierType: this.carrierType,
      carrierConcentration: this.carrierConcentration,
      carrierCharge: this.carrierCharge,
      mobilityCm2Vs: this.mobilityCm2Vs,
      conductivitySm: conductivity,
      hallCoefficientRh: rh,
      hallSensitivityKh: kh,
      hallVoltageMv: vhMv,
      hallElectricFieldVm: eh,
      driftVelocityMs: vd,
      lorentzForceN: fl,
      showVectors: this.showVectors,
      showParticles: this.showParticles,
    };
  }

  public override dispose(context: ExperimentContext): void {
    this.telemetryCallback = null;
    super.dispose(context);
  }
}
