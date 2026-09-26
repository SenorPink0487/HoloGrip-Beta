import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { SlitApertureMesh } from '../../../scene/optics/SlitApertureMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { OpticsInteractionManager } from '../../../scene/optics/OpticsInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalDiffractionStepResponse } from '../../../workers/workerMessages.ts';

const _START_POS = new THREE.Vector3();
const _SLIT_POS = new THREE.Vector3();

export default class OpticsInterferenceExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private slitFixture: SlitApertureMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  private laserSaddle: THREE.Group;
  private slitSaddle: THREE.Group;
  private screenSaddle: THREE.Group;
  private interactionManager: OpticsInteractionManager;

  private wavelength = 632.8;
  private slitDistance = 0.25;
  private slitWidth = 0.04;
  private showWavefronts = true;

  // Multi-Core Worker Buffer
  private workerIntensityBuffer: Float32Array = new Float32Array(512);
  private isWorkerBusy = false;
  private hasWorkerResult = false;
  private lastStateHash = '';

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    // 1. Rail & Saddles
    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    this.laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    this.laserSaddle.position.z = -0.52;

    this.slitSaddle = this.rail.createCarrierSaddle('SlitSaddle');
    this.slitSaddle.position.z = -0.05;

    this.screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    this.screenSaddle.position.z = 0.48;

    // 2. Laser Emitter
    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    this.laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    // 3. Double Slit Fixture
    this.slitFixture = this.track(new SlitApertureMesh('double'));
    this.slitSaddle.add(this.slitFixture.group);
    this.addDisposable(() => this.slitFixture.dispose());

    // 4. Observation Screen & Meter
    this.detectorScreen = this.track(new DetectorScreenMesh());
    this.screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    // 5. Beams
    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());

    // 6. Interaction Manager
    this.interactionManager = new OpticsInteractionManager({
      rootGroup: this.rootGroup,
      rail: this.rail,
      laser: this.laser,
      laserSaddle: this.laserSaddle,
      slitFixture: this.slitFixture,
      slitSaddle: this.slitSaddle,
      detectorScreen: this.detectorScreen,
      screenSaddle: this.screenSaddle,
      beamSystem: this.beamSystem,

      onLaserChange: (_isOn, wavelengthNm) => {
        this.wavelength = wavelengthNm;
        this.laser.updateWavelength(this.wavelength);
        this.beamSystem.updateWavelength(this.wavelength);
        context.setParameter('wavelength', this.wavelength);
      },
      onSlitChange: (_slitType, distanceMm, widthMm) => {
        this.slitDistance = distanceMm;
        this.slitWidth = widthMm;
        context.setParameter('slitDistance', this.slitDistance);
        context.setParameter('slitWidth', this.slitWidth);
      },
    });
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    _START_POS.set(0, 0.186, this.laserSaddle.position.z + 0.123);
    _SLIT_POS.set(0, 0.186, this.slitSaddle.position.z - 0.008);
    const screenDistM = Math.max(0.08, this.screenSaddle.position.z - this.slitSaddle.position.z);

    if (!this.laser.isOn) {
      this.lastStateHash = '';
      this.beamSystem.setIntensity(0);
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.detectorScreen.renderFringesPattern({
        mode: 'double_slit',
        wavelengthNm: this.wavelength,
        intensity: 0,
        slitDistanceMm: this.slitDistance,
        slitWidthMm: this.slitWidth,
        screenDistanceM: screenDistM,
      });
      this.detectorScreen.updateMeter({
        intensityRatio: 0,
        wavelengthNm: this.wavelength,
        fringeSpacingMm: 0,
      });
      return;
    }

    this.beamSystem.setIntensity(1.0);
    // 1. Incoming laser beam terminates at the double slit plate (does not penetrate)
    this.beamSystem.updateSegmentedBeam([{ start: _START_POS, end: _SLIT_POS, intensity: 1.0 }]);

    // 2. Coherent interference wave ripples & spreading diffracted light from slits to screen
    if (this.showWavefronts) {
      this.beamSystem.updateDoubleSlitWavefronts(
        this.slitSaddle.position.z,
        this.slitDistance,
        elapsed,
        this.screenSaddle.position.z
      );
      this.beamSystem.updateDiffractionFan(
        this.slitSaddle.position.z,
        this.screenSaddle.position.z,
        0.045
      );
    } else {
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
    }

    const fringeSpacingM = OpticalPhysics.calculateDoubleSlitFringeSpacing(
      this.wavelength,
      this.slitDistance,
      screenDistM
    );

    // Multi-Core Worker physics computation with state hash dirty checking
    const stateHash = `${this.wavelength}_${this.slitDistance.toFixed(3)}_${this.slitWidth.toFixed(3)}_${screenDistM.toFixed(3)}`;
    if (stateHash !== this.lastStateHash) {
      this.lastStateHash = stateHash;
      this.dispatchWorkerComputation(context, screenDistM);
    }

    if (this.hasWorkerResult) {
      this.detectorScreen.renderFringesFromBuffer(this.workerIntensityBuffer, this.wavelength, 1.0);
    } else {
      this.detectorScreen.renderFringesPattern({
        mode: 'double_slit',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitDistanceMm: this.slitDistance,
        slitWidthMm: this.slitWidth,
        screenDistanceM: screenDistM,
      });
    }

    this.detectorScreen.updateMeter({
      intensityRatio: 0.92,
      wavelengthNm: this.wavelength,
      fringeSpacingMm: fringeSpacingM * 1000,
    });
  }

  private async dispatchWorkerComputation(context: ExperimentContext, screenDistM: number): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDiffraction === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDiffraction({
          intensityBuffer: this.workerIntensityBuffer,
          wavelengthNm: this.wavelength,
          slitWidthMm: this.slitWidth,
          slitDistanceMm: this.slitDistance,
          screenDistanceM: screenDistM,
          screenSpanMm: 80.0,
          slitCount: 2,
        });
        if (resp && resp.intensityBuffer) {
          this.workerIntensityBuffer = resp.intensityBuffer;
          this.hasWorkerResult = true;
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalDiffractionStepResponse>(
          {
            action: 'OPTICAL_DIFFRACTION_STEP',
            intensityBuffer: this.workerIntensityBuffer,
            wavelengthNm: this.wavelength,
            slitWidthMm: this.slitWidth,
            slitDistanceMm: this.slitDistance,
            screenDistanceM: screenDistM,
            screenSpanMm: 80.0,
            slitCount: 2,
          },
          [this.workerIntensityBuffer.buffer]
        );
        if (resp && resp.intensityBuffer) {
          this.workerIntensityBuffer = resp.intensityBuffer;
          this.hasWorkerResult = true;
        }
      }
    } catch {
      // Fallback silently if worker thread is terminating
    } finally {
      this.isWorkerBusy = false;
    }
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (id === 'wavelength') {
      this.wavelength = Number(value);
      this.laser.updateWavelength(this.wavelength);
      this.beamSystem.updateWavelength(this.wavelength);
    } else if (id === 'slitDistance') {
      this.slitDistance = Number(value);
      this.slitFixture.setParameters({ slitDistanceMm: this.slitDistance });
    } else if (id === 'slitWidth') {
      this.slitWidth = Number(value);
      this.slitFixture.setParameters({ slitWidthMm: this.slitWidth });
    } else if (id === 'showWavefronts') {
      this.showWavefronts = Boolean(value);
    }
  }

  public override onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    return this.interactionManager?.onPointerDown(event, hit, context) ?? false;
  }

  public override onPointerMove(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): void {
    this.interactionManager?.onPointerMove(event, hit, context);
  }

  public override onPointerUp(event: PointerEvent, context: ExperimentContext): void {
    this.interactionManager?.onPointerUp(event, context);
  }

  public override getHoverTarget(raycaster: THREE.Raycaster) {
    return this.interactionManager?.getHoverTarget(raycaster) ?? null;
  }
}
