import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { PolarizerMesh } from '../../../scene/optics/PolarizerMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalPolarizationStepResponse } from '../../../workers/workerMessages.ts';

export default class OpticsPolarizationExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private polarizer1: PolarizerMesh;
  private analyzer2: PolarizerMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  private wavelength = 632.8;
  private pol1Angle = 0.0;
  private pol2Angle = 0.0;
  private quarterWavePlate = false;
  private show3DWave = true;

  // Multi-Core Worker Buffers
  private workerPositions: Float32Array = new Float32Array(122 * 3);
  private workerColors: Float32Array = new Float32Array(122 * 3);
  private isWorkerBusy = false;
  private lastMalusIntensity = 1.0;

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    const laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    laserSaddle.position.z = -0.52;

    const pol1Saddle = this.rail.createCarrierSaddle('Polarizer1Saddle');
    pol1Saddle.position.z = -0.18;

    const pol2Saddle = this.rail.createCarrierSaddle('Analyzer2Saddle');
    pol2Saddle.position.z = 0.16;

    const screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    screenSaddle.position.z = 0.48;

    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    this.polarizer1 = this.track(new PolarizerMesh('POLARIZER P1', this.pol1Angle));
    pol1Saddle.add(this.polarizer1.group);
    this.addDisposable(() => this.polarizer1.dispose());

    this.analyzer2 = this.track(new PolarizerMesh('ANALYZER P2', this.pol2Angle));
    pol2Saddle.add(this.analyzer2.group);
    this.addDisposable(() => this.analyzer2.dispose());

    this.detectorScreen = this.track(new DetectorScreenMesh());
    screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    const startPos = new THREE.Vector3(0, 0.186, -0.40);
    const endPos = new THREE.Vector3(0, 0.186, 0.474);

    this.beamSystem.setIntensity(this.lastMalusIntensity);
    this.beamSystem.updateStraightBeam(startPos, endPos);

    // Mandatory Multi-Core Worker physics offload
    this.dispatchWorkerPolarization(context, elapsed);

    if (!this.show3DWave) {
      this.beamSystem.clearWaveVectors();
    }

    this.detectorScreen.renderFringesPattern({
      mode: 'polarization',
      wavelengthNm: this.wavelength,
      intensity: this.lastMalusIntensity,
      polarizerAngle: this.pol1Angle,
      analyzerAngle: this.pol2Angle,
    });

    this.detectorScreen.updateMeter({
      intensityRatio: this.lastMalusIntensity,
      wavelengthNm: this.wavelength,
    });
  }

  private async dispatchWorkerPolarization(context: ExperimentContext, elapsed: number): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalPolarization === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalPolarization({
          positions: this.workerPositions,
          colors: this.workerColors,
          polarizerAngleDeg: this.pol1Angle,
          analyzerAngleDeg: this.pol2Angle,
          hasQuarterWavePlate: this.quarterWavePlate,
          wavelengthNm: this.wavelength,
          startZ: -0.40,
          endZ: 0.474,
          polarizerZ: -0.18,
          analyzerZ: 0.16,
          numSamples: 60,
          time: elapsed,
        });
        if (resp) {
          this.workerPositions = resp.positions;
          this.workerColors = resp.colors;
          this.lastMalusIntensity = resp.malusIntensity;
          if (this.show3DWave) {
            this.beamSystem.applyPolarizationWaveBuffer(this.workerPositions, this.workerColors);
          }
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalPolarizationStepResponse>(
          {
            action: 'OPTICAL_POLARIZATION_STEP',
            positions: this.workerPositions,
            colors: this.workerColors,
            polarizerAngleDeg: this.pol1Angle,
            analyzerAngleDeg: this.pol2Angle,
            hasQuarterWavePlate: this.quarterWavePlate,
            wavelengthNm: this.wavelength,
            startZ: -0.40,
            endZ: 0.474,
            polarizerZ: -0.18,
            analyzerZ: 0.16,
            numSamples: 60,
            time: elapsed,
          },
          [this.workerPositions.buffer, this.workerColors.buffer]
        );
        if (resp) {
          this.workerPositions = resp.positions;
          this.workerColors = resp.colors;
          this.lastMalusIntensity = resp.malusIntensity;
          if (this.show3DWave) {
            this.beamSystem.applyPolarizationWaveBuffer(this.workerPositions, this.workerColors);
          }
        }
      } else {
        // Test fallback when workerPool is empty
        this.lastMalusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
      }
    } catch {
      // Fallback silently if worker thread is terminating
    } finally {
      this.isWorkerBusy = false;
    }
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (id === 'polarizerAngle') {
      this.pol1Angle = Number(value);
      this.polarizer1.setAngleDeg(this.pol1Angle);
    } else if (id === 'analyzerAngle') {
      this.pol2Angle = Number(value);
      this.analyzer2.setAngleDeg(this.pol2Angle);
    } else if (id === 'quarterWavePlate') {
      this.quarterWavePlate = Boolean(value);
      this.analyzer2.toggleQuarterWavePlate(this.quarterWavePlate);
    } else if (id === 'wavelength') {
      this.wavelength = Number(value);
      this.laser.updateWavelength(this.wavelength);
      this.beamSystem.updateWavelength(this.wavelength);
    } else if (id === 'show3DWave') {
      this.show3DWave = Boolean(value);
    }
  }
}
