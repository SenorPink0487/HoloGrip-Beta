import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { MassSpecBenchMesh, type IonVisual } from '../../../scene/em/MassSpecBenchMesh.ts';
import { MassSpecInteractionManager } from '../../../scene/em/MassSpecInteractionManager.ts';
import {
  CARTRIDGES,
  JAW_BYPASS,
  MASS_STAGE,
  analyzerFluxWb,
  arcThetaMax,
  beamField,
  massSpecCaption,
  middleIon,
  plateVoltageForIon,
  selectorDeflectionSign,
  solveSpectrum,
  trajectoryPoint,
  type IonHit,
} from '../../../physics/em/massSpec.ts';
import type { MassSpecTelemetry } from '../../../ui/vision/MassSpecStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

const ION_SLOTS = 4;

export default class EmMassSpecExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 2.4;
  public override hideCenterEmitter = true;

  private bench!: MassSpecBenchMesh;
  private interaction!: MassSpecInteractionManager;

  private sampleId = 'hydrogen';
  private accelVoltage = 2000;
  private analyzerBz = -0.15;
  private readonly selectorBz = -0.05;
  private readonly gapM = 0.015;
  private jawOpening = 1;
  private plateVoltage = 0;
  private probeX = 0.2;
  private phases = [0, 0.25, 0.5, 0.75];
  private hits: IonHit[] = [];
  private readonly ionVisuals: IonVisual[] = Array.from({ length: ION_SLOTS }, () => ({
    visible: false, x: 0, y: 0, color: 0xffffff, opacity: 1, spotVisible: false, spotY: 0, magVisible: false, magX: 0.42,
  }));
  private cached!: MassSpecTelemetry;

  public init(_context: ExperimentContext): void {
    this.rootGroup.position.set(0, 0.10, 1.55);
    this.bench = new MassSpecBenchMesh();
    this.rootGroup.add(this.bench.group);
    this.addDisposable(() => this.bench.dispose());
    this.interaction = new MassSpecInteractionManager({
      bench: this.bench,
      onCycleSample: () => this.cycleSample(),
      onJaw: (opening) => this.setJaw(opening),
      onAnalyzerDrag: (delta) => this.addAnalyzer(delta),
      onFlipAnalyzer: () => this.flipAnalyzer(),
      onAccelDrag: (delta) => this.addAccel(delta),
      onPlateDrag: (delta) => this.addPlate(delta),
      onProbeX: (x) => this.setProbeX(x),
    });
    this.plateVoltage = this.tunedPlate();
    this.recompute();
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interaction?.getHoverTarget(raycaster) ?? null;
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interaction?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interaction?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interaction?.onPointerUp(event, context);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < this.hits.length; i++) {
      const period = 1.45 * Math.sqrt(Math.max(1, this.hits[i].ion.massU));
      this.phases[i] = (this.phases[i] + dt / period) % 1;
    }
    this.layoutIons();
    this.syncBench();
  }

  public setSample(id: string): void {
    if (!CARTRIDGES.some((item) => item.id === id)) return;
    this.sampleId = id;
    this.plateVoltage = this.tunedPlate();
    this.recompute();
  }

  public cycleSample(): void {
    const index = CARTRIDGES.findIndex((item) => item.id === this.sampleId);
    this.setSample(CARTRIDGES[(index + 1) % CARTRIDGES.length].id);
  }

  public setAccel(voltage: number): void {
    this.accelVoltage = THREE.MathUtils.clamp(voltage, 200, 5000);
    this.recompute();
  }

  public addAccel(delta: number): void {
    this.setAccel(this.accelVoltage + delta);
  }

  public setAnalyzerMagnitude(tesla: number): void {
    const sign = this.analyzerBz <= 0 ? -1 : 1;
    this.analyzerBz = sign * THREE.MathUtils.clamp(Math.abs(tesla), 0.05, 0.5);
    this.recompute();
  }

  public addAnalyzer(delta: number): void {
    this.setAnalyzerMagnitude(Math.abs(this.analyzerBz) + delta);
  }

  public flipAnalyzer(): void {
    this.analyzerBz = -this.analyzerBz;
    this.recompute();
  }

  public setJaw(opening: number): void {
    this.jawOpening = THREE.MathUtils.clamp(opening, 0.02, 1);
    this.recompute();
  }

  public setPlate(voltage: number): void {
    this.plateVoltage = THREE.MathUtils.clamp(voltage, 0, 900);
    this.recompute();
  }

  public addPlate(delta: number): void {
    this.setPlate(this.plateVoltage + delta);
  }

  public setProbeX(x: number): void {
    this.probeX = THREE.MathUtils.clamp(x, -0.46, 0.46);
    this.publish();
    this.syncBench();
  }

  public resetGolden(): void {
    this.sampleId = 'hydrogen';
    this.accelVoltage = 2000;
    this.analyzerBz = -0.15;
    this.jawOpening = 1;
    this.probeX = 0.2;
    this.plateVoltage = this.tunedPlate();
    this.phases = [0, 0.25, 0.5, 0.75];
    this.recompute();
  }

  public getTelemetry(): MassSpecTelemetry {
    if (!this.cached) this.recompute();
    return this.cached;
  }

  public override onParameterChange(id: string, value: unknown): void {
    if (id === 'accelVoltage') this.setAccel(Number(value));
    else if (id === 'analyzerField') this.setAnalyzerMagnitude(Number(value));
    else if (id === 'jaw') this.setJaw(Number(value));
    else if (id === 'plateVoltage') this.setPlate(Number(value));
    else if (id === 'sample') this.setSample(String(value));
  }

  private cartridge() {
    return CARTRIDGES.find((item) => item.id === this.sampleId) ?? CARTRIDGES[0];
  }

  private tunedPlate(): number {
    return plateVoltageForIon(middleIon(this.cartridge()), this.accelVoltage, this.gapM, this.selectorBz);
  }

  private recompute(): void {
    this.hits = solveSpectrum(this.cartridge(), {
      accelVoltage: this.accelVoltage,
      analyzerBz: this.analyzerBz,
      selectorBz: this.selectorBz,
      plateVoltage: this.plateVoltage,
      gapM: this.gapM,
      jawOpening: this.jawOpening,
    });
    this.layoutIons();
    this.publish();
    this.syncBench();
  }

  private layoutIons(): void {
    const active = this.hits.filter((hit) => hit.transmission > 0.08 && Number.isFinite(hit.radiusM));
    const radii = active.map((hit) => hit.radiusM);
    const center = radii.length ? radii.reduce((sum, value) => sum + value, 0) / radii.length : 0;
    const span = radii.length ? Math.max(...radii) - Math.min(...radii) : 0;
    const windowM = Math.max(0.008, span * 0.7);
    for (let i = 0; i < ION_SLOTS; i++) {
      const visual = this.ionVisuals[i];
      const hit = this.hits[i];
      if (!hit) {
        visual.visible = false;
        visual.spotVisible = false;
        visual.magVisible = false;
        continue;
      }
      const travel = this.phases[i] ?? 0;
      const blocked = hit.transmission < 0.2 && this.jawOpening < JAW_BYPASS;
      if (blocked) {
        visual.x = MASS_STAGE.sourceX + 0.06 + (MASS_STAGE.slitX - MASS_STAGE.sourceX) * travel;
        const deflect = (1 - hit.transmission) * 0.06 * selectorDeflectionSign(hit.speed, hit.passSpeed);
        visual.y = MASS_STAGE.entranceY + deflect * Math.sin(travel * Math.PI);
      } else {
        const theta = travel * arcThetaMax(hit.radiusM, MASS_STAGE.plateReach);
        const point = trajectoryPoint(hit.radiusM, theta, hit.side);
        visual.x = MASS_STAGE.entranceX + point.x;
        visual.y = MASS_STAGE.entranceY + point.y;
      }
      visual.visible = true;
      visual.color = hit.ion.color;
      visual.opacity = 0.3 + 0.7 * hit.transmission;
      const clamped = THREE.MathUtils.clamp(hit.hitY, -MASS_STAGE.plateReach, MASS_STAGE.plateReach);
      visual.spotY = MASS_STAGE.entranceY + (Number.isFinite(clamped) ? clamped : 0);
      visual.spotVisible = hit.transmission > 0.08 && Number.isFinite(hit.hitY);
      visual.magVisible = visual.spotVisible;
      const offset = Number.isFinite(hit.radiusM) ? (hit.radiusM - center) / windowM : 0;
      visual.magX = 0.42 + THREE.MathUtils.clamp(offset, -1, 1) * 0.07;
    }
  }

  private publish(): void {
    const probe = beamField(this.probeX, { selectorBz: this.selectorBz, analyzerBz: this.analyzerBz });
    this.cached = {
      sampleId: this.sampleId,
      sampleName: this.cartridge().name,
      accelVoltage: this.accelVoltage,
      analyzerBz: this.analyzerBz,
      plateVoltage: this.plateVoltage,
      jawOpening: this.jawOpening,
      probeTesla: probe.tesla,
      probeRegion: probe.region,
      fluxWb: analyzerFluxWb(this.analyzerBz),
      caption: massSpecCaption(this.hits, this.jawOpening),
      hits: this.hits,
    };
  }

  private syncBench(): void {
    this.bench?.sync({
      jawOpening: this.jawOpening,
      accelVoltage: this.accelVoltage,
      plateVoltage: this.plateVoltage,
      analyzerBz: this.analyzerBz,
      probeX: this.probeX,
      ions: this.ionVisuals,
    });
  }
}
