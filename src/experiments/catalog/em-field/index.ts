import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { FieldBenchMesh } from '../../../scene/em/FieldBenchMesh.ts';
import { FieldInteractionManager } from '../../../scene/em/FieldInteractionManager.ts';
import {
  DEFAULT_CHARGE_ELEVATION,
  electricDipoleMoment,
  evaluateTestCharge,
  FIELD_PRESETS,
  totalPotentialEnergy,
  traceFieldLines,
  type ElectrostaticTelemetry,
  type FieldLine,
  type PointCharge,
  type TestChargeState,
} from '../../../physics/em/electrostatic.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class EmFieldExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: FieldBenchMesh;
  private interaction!: FieldInteractionManager;
  private isDisposed = false;

  private charges: PointCharge[] = [];
  private selectedChargeId: string | null = null;

  // Test Charge (Probe q0)
  private testChargePos = { x: 0.0, y: 0.16, z: DEFAULT_CHARGE_ELEVATION };
  private testChargeState: TestChargeState | null = null;

  private showLines = true;
  private showFlow = false;
  private lineDensity = 16;

  private fieldLines: FieldLine[] = [];
  private cachedTelemetry!: ElectrostaticTelemetry;
  private needsSync = true;
  private chargeCounter = 1;

  public init(_context: ExperimentContext): void {
    // Elevate experiment root into the air above HoloTable (HologramStage Y=0.908, HoloTable top Y=0.990)
    // At rootGroup Y=0.56, the charges float ~48cm suspended in mid-air in front of the camera
    this.rootGroup.position.set(0, 0.56, 1.00);
    this.bench = new FieldBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());

    this.interaction = new FieldInteractionManager({
      bench: this.bench,
      onSelectCharge: (id) => this.selectCharge(id),
      onDeselect: () => this.selectCharge(null),
      onMoveCharge: (id, x, y) => this.moveCharge(id, x, y),
      onMoveTestCharge: (x, y) => this.moveTestCharge(x, y),
      onAddChargeAt: (x, y, q) => this.addCharge(q, x, y),
    });

    this.loadPreset('dipole');
  }

  public override dispose(context: ExperimentContext): void {
    this.isDisposed = true;
    super.dispose(context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interaction?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext,
  ): boolean {
    return this.interaction?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(
    event: PointerEvent,
    hit: THREE.Intersection | null,
    context: ExperimentContext,
  ): void {
    this.interaction?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interaction?.onPointerUp(event, context);
  }

  public update(_delta: number, elapsed: number, _context: ExperimentContext): void {
    if (this.isDisposed) return;

    if (this.needsSync) {
      this.recompute();
      this.needsSync = false;
    }

    this.bench.update(elapsed);
  }

  public loadPreset(key: string): void {
    const preset = FIELD_PRESETS[key] || FIELD_PRESETS.dipole;
    this.charges = preset.charges.map((c) => ({ ...c }));
    this.selectedChargeId = this.charges.length > 0 ? this.charges[0].id : null;
    this.chargeCounter = this.charges.length + 1;
    this.needsSync = true;
  }

  public addCharge(q: number, x?: number, y?: number, z?: number): void {
    const id = `q${this.chargeCounter++}`;
    const newX = x ?? (Math.random() * 0.4 - 0.2);
    const newY = y ?? (Math.random() * 0.24 - 0.04);
    const newZ = z ?? DEFAULT_CHARGE_ELEVATION;
    this.charges.push({ id, x: newX, y: newY, z: newZ, q });
    this.selectedChargeId = id;
    this.needsSync = true;
  }

  public removeCharge(id?: string): void {
    const targetId = id ?? this.selectedChargeId;
    if (!targetId) return;
    this.charges = this.charges.filter((c) => c.id !== targetId);
    if (this.selectedChargeId === targetId) {
      this.selectedChargeId = this.charges.length > 0 ? this.charges[0].id : null;
    }
    this.needsSync = true;
  }

  public clearCharges(): void {
    this.charges = [];
    this.selectedChargeId = null;
    this.needsSync = true;
  }

  public selectCharge(id: string | null): void {
    this.selectedChargeId = id;
    this.syncVisualsOnly();
  }

  public setSelectedChargeMagnitude(q: number): void {
    if (!this.selectedChargeId) return;
    const c = this.charges.find((ch) => ch.id === this.selectedChargeId);
    if (c) {
      c.q = q;
      this.needsSync = true;
    }
  }

  public moveCharge(id: string, x: number, y: number): void {
    const c = this.charges.find((ch) => ch.id === id);
    if (c) {
      c.x = x;
      c.y = y;
      this.needsSync = true;
    }
  }

  public moveTestCharge(x: number, y: number): void {
    this.testChargePos.x = x;
    this.testChargePos.y = y;
    this.needsSync = true;
  }

  public resetTestCharge(): void {
    this.testChargePos.x = 0.0;
    this.testChargePos.y = 0.16;
    this.testChargePos.z = DEFAULT_CHARGE_ELEVATION;
    this.needsSync = true;
  }

  public setToggles(lines: boolean, flow = false): void {
    this.showLines = lines;
    this.showFlow = flow;
    this.syncVisualsOnly();
  }

  public setDensity(density: number): void {
    this.lineDensity = Math.max(8, Math.min(32, density));
    this.needsSync = true;
  }

  public resetGolden(): void {
    this.showLines = true;
    this.showFlow = false;
    this.lineDensity = 16;
    this.resetTestCharge();
    this.loadPreset('dipole');
  }

  public getTelemetry(): ElectrostaticTelemetry {
    if (this.needsSync || !this.cachedTelemetry) {
      this.recompute();
      this.needsSync = false;
    }
    return this.cachedTelemetry;
  }

  public getTelemetryData(): ElectrostaticTelemetry {
    return this.getTelemetry();
  }

  private recompute(): void {
    // 1. Calculate physical field lines using RK4 across expanded stage
    // HoloTable top is at local Y ≈ -0.526, so minY: -0.50 allows field lines to expand and arch naturally without penetrating table
    this.fieldLines = traceFieldLines(this.charges, {
      linesPerUnitCharge: this.lineDensity,
      bounds: 0.85,
      minY: -0.50,
      maxSteps: 400,
    });

    // 2. Evaluate test charge probe metrics
    this.testChargeState = evaluateTestCharge(this.testChargePos, this.charges);

    // 3. Update telemetry metrics
    this.updateTelemetryMetrics();

    // 4. Update bench 3D visuals
    this.syncVisualsOnly();
  }

  private updateTelemetryMetrics(): void {
    let totalQ = 0;
    for (const c of this.charges) totalQ += c.q;

    const dipole = electricDipoleMoment(this.charges);
    const u = totalPotentialEnergy(this.charges);
    const selectedCharge = this.charges.find((c) => c.id === this.selectedChargeId);

    this.cachedTelemetry = {
      chargeCount: this.charges.length,
      totalChargeMicroC: totalQ,
      dipoleMomentMagnitude: dipole.magnitude,
      dipoleMomentVector: dipole.vector,
      potentialEnergyJoules: u,
      fieldLineCount: this.fieldLines.length,
      selectedChargeId: this.selectedChargeId,
      selectedChargeValue: selectedCharge ? selectedCharge.q : 0,
      testCharge: this.testChargeState,
    };
  }

  private syncVisualsOnly(): void {
    if (!this.bench) return;

    this.bench.sync({
      charges: this.charges,
      lines: this.fieldLines,
      telemetry: this.cachedTelemetry,
      selectedChargeId: this.selectedChargeId,
      showLines: this.showLines,
      showFlow: this.showFlow,
      testCharge: this.testChargeState,
    });
  }
}
