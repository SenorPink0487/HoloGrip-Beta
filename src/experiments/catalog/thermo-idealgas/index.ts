import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { ThermoBenchPlate } from '../../../scene/thermo/ThermoBenchPlate.ts';
import { ThermostatHeaterMesh } from '../../../scene/thermo/ThermostatHeaterMesh.ts';
import { PistonCylinderMesh } from '../../../scene/thermo/PistonCylinderMesh.ts';
import { PressureGaugeMesh } from '../../../scene/thermo/PressureGaugeMesh.ts';
import { MolecularGasSystem } from '../../../scene/thermo/MolecularGasSystem.ts';
import { ThermoInteractionManager } from '../../../scene/thermo/ThermoInteractionManager.ts';
import type { ThermoTelemetryData } from '../../../ui/vision/ThermoStatusCard.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class ThermoIdealGasExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D Scene Components
  private benchPlate: ThermoBenchPlate;
  private heater: ThermostatHeaterMesh;
  private cylinder: PistonCylinderMesh;
  private pressureGauge: PressureGaugeMesh;
  private molecularGas: MolecularGasSystem;
  private interactionManager: ThermoInteractionManager;

  // Connecting Pipe Line Mesh
  private connectPipe: THREE.Mesh;

  // Thermodynamic State Variables
  private temperature = 300;     // Kelvin
  private volume = 2.5;          // Liters
  private moles = 0.10;          // mol
  private gasType = 'nitrogen';
  private molarMassKg = 0.028;   // kg/mol
  private showParticles = true;
  private pressureKpa = 99.77;   // kPa

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96)
    this.rootGroup.position.set(0, 0.063, 0.96);

    // 1. High-precision optical base plate
    this.benchPlate = this.track(new ThermoBenchPlate());
    this.rootGroup.add(this.benchPlate.group);
    this.addDisposable(() => this.benchPlate.dispose());

    // 2. Thermostatic Electric Heater Base (placed at x = -0.16, z = 0.02)
    this.heater = this.track(new ThermostatHeaterMesh());
    this.heater.group.position.set(-0.16, 0.024, 0.02);
    this.rootGroup.add(this.heater.group);
    this.addDisposable(() => this.heater.dispose());

    // 3. Quartz Glass Cylinder & Movable Piston (mounted on top of heater plate, y = 0.024 + 0.062)
    this.cylinder = this.track(new PistonCylinderMesh());
    this.cylinder.group.position.set(-0.16, 0.086, 0.02);
    this.rootGroup.add(this.cylinder.group);
    this.addDisposable(() => this.cylinder.dispose());

    // 4. Bourdon-Tube Analog Pressure Gauge (placed to the left, x = -0.34, z = 0.02)
    this.pressureGauge = this.track(new PressureGaugeMesh());
    this.pressureGauge.group.position.set(-0.34, 0.024, 0.02);
    this.rootGroup.add(this.pressureGauge.group);
    this.addDisposable(() => this.pressureGauge.dispose());

    // 5. Connecting Brass Pressure Line (from cylinder base to gauge stem)
    const pipeGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.10, 16);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      metalness: 0.92,
      roughness: 0.25,
    });
    this.track(pipeGeo);
    this.track(pipeMat);
    this.connectPipe = new THREE.Mesh(pipeGeo, pipeMat);
    this.connectPipe.rotation.z = Math.PI * 0.5;
    this.connectPipe.position.set(-0.25, 0.054, 0.02);
    this.connectPipe.castShadow = true;
    this.rootGroup.add(this.connectPipe);

    // 6. Microscopic Molecular Kinetics System (inside cylinder)
    this.molecularGas = this.track(new MolecularGasSystem());
    this.molecularGas.group.position.copy(this.cylinder.group.position);
    this.rootGroup.add(this.molecularGas.group);
    this.addDisposable(() => this.molecularGas.dispose());

    // 7. 3D Interaction Manager
    this.interactionManager = new ThermoInteractionManager({
      piston: this.cylinder,
      heater: this.heater,
      onVolumeChange: (newVol) => {
        this.volume = newVol;
        this.cylinder.setPistonVolume(this.volume);
        this.recalculatePressure();
        context.setParameter('volume', parseFloat(this.volume.toFixed(2)));
      },
      onTemperatureChange: (newTemp) => {
        this.temperature = newTemp;
        this.heater.setTemperature(this.temperature);
        this.recalculatePressure();
        context.setParameter('temperature', Math.round(this.temperature));
      },
    });

    // Sync initial state
    this.updateMolarMass();
    this.cylinder.setPistonVolume(this.volume);
    this.heater.setTemperature(this.temperature);
    this.recalculatePressure();
  }

  private updateMolarMass(): void {
    switch (this.gasType) {
      case 'helium':
        this.molarMassKg = 0.004;
        break;
      case 'co2':
        this.molarMassKg = 0.044;
        break;
      case 'argon':
        this.molarMassKg = 0.040;
        break;
      case 'nitrogen':
      default:
        this.molarMassKg = 0.028;
        break;
    }
    this.molecularGas.updateThermodynamicState(
      this.temperature,
      this.molarMassKg,
      this.cylinder.getPistonHeight()
    );
  }

  private recalculatePressure(): void {
    // Ideal Gas Law: P = nRT / V (kPa)
    // with R = 8.314 J/(mol*K), V in Liters
    this.pressureKpa = (this.moles * 8.314 * this.temperature) / this.volume;
    this.pressureGauge.setPressure(this.pressureKpa);
    this.molecularGas.updateThermodynamicState(
      this.temperature,
      this.molarMassKg,
      this.cylinder.getPistonHeight()
    );
  }

  public getThermodynamicTelemetry(): ThermoTelemetryData {
    const vRms = Math.sqrt((3 * 8.314 * this.temperature) / this.molarMassKg);
    const vMp = Math.sqrt((2 * 8.314 * this.temperature) / this.molarMassKg);
    const vMean = Math.sqrt((8 * 8.314 * this.temperature) / (Math.PI * this.molarMassKg));
    const hist = this.molecularGas.getHistogramData(20);

    return {
      temperature: this.temperature,
      volume: this.volume,
      pressure: this.pressureKpa,
      moles: this.moles,
      molarMassKg: this.molarMassKg,
      vRms,
      vMp,
      vMean,
      speedBins: hist.bins,
      maxSpeed: hist.maxSpeed,
    };
  }

  public override onParameterChange(id: string, value: any, _context: ExperimentContext): void {
    switch (id) {
      case 'temperature':
        this.temperature = Number(value);
        this.heater.setTemperature(this.temperature);
        this.interactionManager.setStartTemp(this.temperature);
        this.recalculatePressure();
        break;
      case 'volume':
        this.volume = Number(value);
        this.cylinder.setPistonVolume(this.volume);
        this.recalculatePressure();
        break;
      case 'moles':
        this.moles = Number(value);
        this.recalculatePressure();
        break;
      case 'gasType':
        this.gasType = String(value);
        this.updateMolarMass();
        this.recalculatePressure();
        break;
      case 'showParticles':
        this.showParticles = Boolean(value);
        this.molecularGas.group.visible = this.showParticles;
        break;
    }
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean | void {
    return this.interactionManager.onPointerDown(event, hit, context);
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager.onPointerUp(event, context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster): { id: string; label: string; cursor?: string } | null {
    return this.interactionManager.getHoverTarget(raycaster);
  }

  public update(delta: number, _elapsed: number, _context: ExperimentContext): void {
    // High-performance molecular kinetics update
    if (this.showParticles) {
      this.molecularGas.update(delta, this.cylinder.getPistonHeight());
    }
  }
}
