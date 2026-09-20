import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { SlitApertureMesh, type SlitType } from '../../../scene/optics/SlitApertureMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalDiffractionStepResponse } from '../../../workers/workerMessages.ts';

export default class OpticsDiffractionExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private slitFixture: SlitApertureMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  private diffractionType: SlitType = 'grating';
  private wavelength = 532.0;
  private slitWidth = 0.05;
  private gratingLinesPerMm = 300;

  private workerBuffer: Float32Array = new Float32Array(512);
  private isWorkerBusy = false;
  private hasWorkerResult = false;

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    const laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    laserSaddle.position.z = -0.52;

    const slitSaddle = this.rail.createCarrierSaddle('SlitSaddle');
    slitSaddle.position.z = -0.05;

    const screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    screenSaddle.position.z = 0.48;

    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    this.slitFixture = this.track(new SlitApertureMesh(this.diffractionType));
    slitSaddle.add(this.slitFixture.group);
    this.addDisposable(() => this.slitFixture.dispose());

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
    this.beamSystem.updateStraightBeam(startPos, endPos);

    this.dispatchWorkerDiffraction(context);

    const isGrating = this.diffractionType === 'grating';

    if (isGrating) {
      this.detectorScreen.renderFringesPattern({
        mode: 'grating',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
        screenDistanceM: 0.53,
      });
    } else if (this.hasWorkerResult) {
      this.detectorScreen.renderFringesFromBuffer(this.workerBuffer, this.wavelength, 1.0);
    } else {
      this.detectorScreen.renderFringesPattern({
        mode: 'single_slit',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
        screenDistanceM: 0.53,
      });
    }

    this.detectorScreen.updateMeter({
      intensityRatio: 0.86,
      wavelengthNm: this.wavelength,
    });
  }

  private async dispatchWorkerDiffraction(context: ExperimentContext): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDiffraction === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDiffraction({
          intensityBuffer: this.workerBuffer,
          wavelengthNm: this.wavelength,
          slitWidthMm: this.slitWidth,
          slitDistanceMm: 0.25,
          screenDistanceM: 0.53,
          screenSpanMm: 80.0,
          slitCount: this.diffractionType === 'grating' ? 8 : 1,
          gratingLinesPerMm: this.gratingLinesPerMm,
        });
        if (resp && resp.intensityBuffer) {
          this.workerBuffer = resp.intensityBuffer;
          this.hasWorkerResult = true;
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalDiffractionStepResponse>(
          {
            action: 'OPTICAL_DIFFRACTION_STEP',
            intensityBuffer: this.workerBuffer,
            wavelengthNm: this.wavelength,
            slitWidthMm: this.slitWidth,
            slitDistanceMm: 0.25,
            screenDistanceM: 0.53,
            screenSpanMm: 80.0,
            slitCount: this.diffractionType === 'grating' ? 8 : 1,
            gratingLinesPerMm: this.gratingLinesPerMm,
          },
          [this.workerBuffer.buffer]
        );
        if (resp && resp.intensityBuffer) {
          this.workerBuffer = resp.intensityBuffer;
          this.hasWorkerResult = true;
        }
      }
    } catch {
      // Worker silent fallback
    } finally {
      this.isWorkerBusy = false;
    }
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (id === 'diffractionType') {
      this.diffractionType = value;
      this.slitFixture.setParameters({
        type: this.diffractionType,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
      });
    } else if (id === 'wavelength') {
      this.wavelength = Number(value);
      this.laser.updateWavelength(this.wavelength);
      this.beamSystem.updateWavelength(this.wavelength);
    } else if (id === 'slitWidth') {
      this.slitWidth = Number(value);
      this.slitFixture.setParameters({ slitWidthMm: this.slitWidth });
    } else if (id === 'gratingDensity') {
      this.gratingLinesPerMm = Number(value);
      this.slitFixture.setParameters({ gratingLinesPerMm: this.gratingLinesPerMm });
    }
  }
}
