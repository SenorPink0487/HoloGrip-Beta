import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { PolarizerMesh } from '../../../scene/optics/PolarizerMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { OpticsInteractionManager } from '../../../scene/optics/OpticsInteractionManager.ts';
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

  private laserSaddle: THREE.Group;
  private pol1Saddle: THREE.Group;
  private pol2Saddle: THREE.Group;
  private screenSaddle: THREE.Group;
  private interactionManager: OpticsInteractionManager;

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
  private lastPolStateHash = '';

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    this.laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    this.laserSaddle.position.z = -0.52;

    this.pol1Saddle = this.rail.createCarrierSaddle('Polarizer1Saddle');
    this.pol1Saddle.position.z = -0.18;

    this.pol2Saddle = this.rail.createCarrierSaddle('Analyzer2Saddle');
    this.pol2Saddle.position.z = 0.16;

    this.screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    this.screenSaddle.position.z = 0.48;

    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    this.laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    this.polarizer1 = this.track(new PolarizerMesh('POLARIZER P1', this.pol1Angle));
    this.pol1Saddle.add(this.polarizer1.group);
    this.addDisposable(() => this.polarizer1.dispose());

    this.analyzer2 = this.track(new PolarizerMesh('ANALYZER P2', this.pol2Angle));
    this.pol2Saddle.add(this.analyzer2.group);
    this.addDisposable(() => this.analyzer2.dispose());

    this.detectorScreen = this.track(new DetectorScreenMesh());
    this.screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());

    this.interactionManager = new OpticsInteractionManager({
      rootGroup: this.rootGroup,
      rail: this.rail,
      laser: this.laser,
      laserSaddle: this.laserSaddle,
      polarizer1: this.polarizer1,
      pol1Saddle: this.pol1Saddle,
      analyzer2: this.analyzer2,
      pol2Saddle: this.pol2Saddle,
      detectorScreen: this.detectorScreen,
      screenSaddle: this.screenSaddle,
      beamSystem: this.beamSystem,

      onLaserChange: (_isOn, wavelengthNm) => {
        this.wavelength = wavelengthNm;
        this.laser.updateWavelength(this.wavelength);
        this.beamSystem.updateWavelength(this.wavelength);
        context.setParameter('wavelength', this.wavelength);
      },
      onPolarizerChange: (id, angleDeg, hasWavePlate) => {
        if (id === 'p1') {
          this.pol1Angle = angleDeg;
          context.setParameter('polarizerAngle', angleDeg);
        } else {
          this.pol2Angle = angleDeg;
          context.setParameter('analyzerAngle', angleDeg);
          if (hasWavePlate !== undefined) {
            this.quarterWavePlate = hasWavePlate;
            context.setParameter('quarterWavePlate', hasWavePlate);
          }
        }
      },
    });
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    const startPos = new THREE.Vector3(0, 0.186, this.laserSaddle.position.z + 0.123);
    const endPos = new THREE.Vector3(0, 0.186, this.screenSaddle.position.z - 0.006);
    const screenDistM = Math.max(0.08, this.screenSaddle.position.z - this.pol2Saddle.position.z);

    if (!this.laser.isOn) {
      this.lastPolStateHash = '';
      this.beamSystem.setIntensity(0);
      this.beamSystem.clearWaveVectors();
      this.detectorScreen.renderFringesPattern({
        mode: 'polarization',
        wavelengthNm: this.wavelength,
        intensity: 0,
        polarizerAngle: this.pol1Angle,
        analyzerAngle: this.pol2Angle,
        screenDistanceM: screenDistM,
      });
      this.detectorScreen.updateMeter({
        intensityRatio: 0,
        wavelengthNm: this.wavelength,
      });
      return;
    }

    const p1Pos = new THREE.Vector3(0, 0.186, this.pol1Saddle.position.z);
    const p2Pos = new THREE.Vector3(0, 0.186, this.pol2Saddle.position.z);

    this.beamSystem.setIntensity(1.0);
    // Multi-stage polarization: Laser -> P1 (1.0), P1 -> P2 (1.0), P2 -> Screen (Malus Law)
    this.beamSystem.updateSegmentedBeam([
      { start: startPos, end: p1Pos, intensity: 1.0 },
      { start: p1Pos, end: p2Pos, intensity: 1.0 },
      { start: p2Pos, end: endPos, intensity: this.lastMalusIntensity },
    ]);

    // Multi-Core Worker physics offload (continuous when 3D wave is animated, state-hashed when wave is static)
    const polHash = `${this.pol1Angle.toFixed(1)}_${this.pol2Angle.toFixed(1)}_${this.quarterWavePlate}_${this.wavelength}`;
    if (this.show3DWave || polHash !== this.lastPolStateHash) {
      this.lastPolStateHash = polHash;
      this.dispatchWorkerPolarization(context, elapsed);
    }

    if (!this.show3DWave) {
      this.beamSystem.clearWaveVectors();
    }

    this.detectorScreen.renderFringesPattern({
      mode: 'polarization',
      wavelengthNm: this.wavelength,
      intensity: this.lastMalusIntensity,
      polarizerAngle: this.pol1Angle,
      analyzerAngle: this.pol2Angle,
      screenDistanceM: screenDistM,
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
      const startZ = this.laserSaddle.position.z + 0.123;
      const endZ = this.screenSaddle.position.z - 0.006;
      const polarizerZ = this.pol1Saddle.position.z;
      const analyzerZ = this.pol2Saddle.position.z;

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalPolarization === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalPolarization({
          positions: this.workerPositions,
          colors: this.workerColors,
          polarizerAngleDeg: this.pol1Angle,
          analyzerAngleDeg: this.pol2Angle,
          hasQuarterWavePlate: this.quarterWavePlate,
          wavelengthNm: this.wavelength,
          startZ,
          endZ,
          polarizerZ,
          analyzerZ,
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
            startZ,
            endZ,
            polarizerZ,
            analyzerZ,
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
