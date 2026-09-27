import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { RotaryStageMesh } from '../../../scene/optics/RotaryStageMesh.ts';
import { PrismMesh } from '../../../scene/optics/PrismMesh.ts';
import { SlitApertureMesh, type SlitType } from '../../../scene/optics/SlitApertureMesh.ts';
import { PolarizerMesh } from '../../../scene/optics/PolarizerMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { OpticsInteractionManager } from '../../../scene/optics/OpticsInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type {
  OpticalDiffractionStepResponse,
  OpticalPolarizationStepResponse,
  OpticalDispersionStepResponse,
  WorkerDispersionRayData,
} from '../../../workers/workerMessages.ts';

const _START_POS = new THREE.Vector3();
const _END_POS = new THREE.Vector3();
const _CENTER_POS = new THREE.Vector3();
const _P1_POS = new THREE.Vector3();
const _P2_POS = new THREE.Vector3();

export default class OpticsLabExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  // 3D Optical Hardware Components
  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private rotaryStage: RotaryStageMesh;
  private prism: PrismMesh;
  private slitFixture: SlitApertureMesh;
  private polarizer1: PolarizerMesh;
  private analyzer2: PolarizerMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  // Saddles
  private laserSaddle: THREE.Group;
  private centerSaddle: THREE.Group;
  private pol1Saddle: THREE.Group;
  private pol2Saddle: THREE.Group;
  private screenSaddle: THREE.Group;
  private interactionManager: OpticsInteractionManager;

  // Experiment State
  private currentMode: 'interference' | 'propagation' | 'diffraction' | 'polarization' = 'interference';
  private wavelength = 632.8;
  private slitDistance = 0.25;
  private slitWidth = 0.04;
  private gratingLinesPerMm = 300;
  private prismAngle = 0.0;
  private pol1Angle = 0.0;
  private pol2Angle = 0.0;
  private show3DWave = true;

  // Multi-core Worker State
  private workerIntensityBuffer: Float32Array = new Float32Array(512);
  private displayBuffer: Float32Array = new Float32Array(512);
  private isWorkerBusy = false;
  private hasWorkerResult = false;

  private workerPositions: Float32Array = new Float32Array(122 * 3);
  private workerColors: Float32Array = new Float32Array(122 * 3);
  private isWorkerPolBusy = false;
  private hasReceivedWorkerPolResult = false;
  private lastMalusIntensity = 1.0;

  private isWorkerDispBusy = false;
  private workerRays: WorkerDispersionRayData[] = [];
  private lastDispersionStateHash = '';
  private lastDiffractionStateHash = '';
  private lastPolStateHash = '';

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    // 1. Precision Optical Rail
    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    // 2. Sliding Carrier Saddles
    this.laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    this.laserSaddle.position.z = -0.52;

    this.pol1Saddle = this.rail.createCarrierSaddle('Polarizer1Saddle');
    this.pol1Saddle.position.z = -0.22;

    this.centerSaddle = this.rail.createCarrierSaddle('CenterSaddle');
    this.centerSaddle.position.z = -0.02;

    this.pol2Saddle = this.rail.createCarrierSaddle('Analyzer2Saddle');
    this.pol2Saddle.position.z = 0.18;

    this.screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    this.screenSaddle.position.z = 0.48;

    // 3. Laser Emitter
    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    this.laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    // 4. Rotary Stage + Prism
    this.rotaryStage = this.track(new RotaryStageMesh());
    this.centerSaddle.add(this.rotaryStage.group);
    this.addDisposable(() => this.rotaryStage.dispose());

    this.prism = this.track(new PrismMesh('equilateral', 1.54));
    this.rotaryStage.rotorGroup.add(this.prism.group);
    this.addDisposable(() => this.prism.dispose());

    // 5. Slit & Grating Aperture Fixture
    this.slitFixture = this.track(new SlitApertureMesh('double'));
    this.centerSaddle.add(this.slitFixture.group);
    this.addDisposable(() => this.slitFixture.dispose());

    // 6. Polarizer P1 and Analyzer P2
    this.polarizer1 = this.track(new PolarizerMesh('POLARIZER P1', this.pol1Angle));
    this.pol1Saddle.add(this.polarizer1.group);
    this.addDisposable(() => this.polarizer1.dispose());

    this.analyzer2 = this.track(new PolarizerMesh('ANALYZER P2', this.pol2Angle));
    this.pol2Saddle.add(this.analyzer2.group);
    this.addDisposable(() => this.analyzer2.dispose());

    // 7. Detector Screen & Digital Radiometer
    this.detectorScreen = this.track(new DetectorScreenMesh());
    this.screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    // 8. Optical Beam & Wave System
    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());

    // 9. Optics Interaction Manager (Saddles, Rotors, Micrometer, Power & Calibration)
    this.interactionManager = new OpticsInteractionManager({
      rootGroup: this.rootGroup,
      rail: this.rail,
      laser: this.laser,
      laserSaddle: this.laserSaddle,
      slitFixture: this.slitFixture,
      slitSaddle: this.centerSaddle,
      rotaryStage: this.rotaryStage,
      prism: this.prism,
      prismSaddle: this.centerSaddle,
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
      onPolarizerChange: (id, angleDeg) => {
        if (id === 'p1') {
          this.pol1Angle = angleDeg;
          context.setParameter('polarizerAngle', this.pol1Angle);
        } else {
          this.pol2Angle = angleDeg;
          context.setParameter('analyzerAngle', this.pol2Angle);
        }
      },
      onPrismChange: (angleDeg) => {
        this.prismAngle = angleDeg;
        context.setParameter('prismAngle', this.prismAngle);
      },
      onSlitChange: (slitType, distanceMm, widthMm, gratingDensity) => {
        this.slitDistance = distanceMm;
        this.slitWidth = widthMm;
        this.gratingLinesPerMm = gratingDensity;
        context.setParameter('slitDistance', this.slitDistance);
        context.setParameter('slitWidth', this.slitWidth);
        context.setParameter('gratingDensity', this.gratingLinesPerMm);
      },
    });

    // Apply initial mode configuration
    this.applyMode(this.currentMode, context);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    // Optical axis is at y = 0.186, dynamically tracked across carrier saddles
    _START_POS.set(0, 0.186, this.laserSaddle.position.z + 0.123);
    _END_POS.set(0, 0.186, this.screenSaddle.position.z - 0.006);
    _CENTER_POS.set(0, 0.186, this.centerSaddle.position.z - 0.008);
    const screenDistM = Math.max(0.08, this.screenSaddle.position.z - this.centerSaddle.position.z);

    // If laser power switch is OFF, extinguish beam and detector radiometer
    if (!this.laser.isOn) {
      this.lastDispersionStateHash = '';
      this.lastDiffractionStateHash = '';
      this.lastPolStateHash = '';
      this.beamSystem.setIntensity(0);
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.beamSystem.clearGratingOrders();
      this.beamSystem.clearWaveVectors();
      this.detectorScreen.renderFringesPattern({
        mode: this.currentMode === 'polarization' ? 'polarization' : (this.currentMode === 'propagation' ? 'spectrum' : (this.slitFixture.slitType === 'grating' ? 'grating' : 'double_slit')),
        wavelengthNm: this.wavelength,
        intensity: 0,
        screenDistanceM: screenDistM,
        slitDistanceMm: this.slitDistance,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
      });
      this.detectorScreen.updateMeter({
        intensityRatio: 0,
        wavelengthNm: this.wavelength,
        fringeSpacingMm: 0,
      });
      return;
    }

    if (this.currentMode === 'propagation') {
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.beamSystem.clearGratingOrders();
      this.beamSystem.clearWaveVectors();

      // Multi-Core Worker prism dispersion offload with dirty state check
      const screenZ = this.screenSaddle.position.z - 0.006;
      const dispHash = `${this.centerSaddle.position.z.toFixed(4)}_${this.laserSaddle.position.z.toFixed(4)}_${this.prismAngle.toFixed(2)}_${this.prism.refractiveIndex.toFixed(4)}_${screenZ.toFixed(4)}`;
      const hasWorker = Boolean(
        context.computeBridge || (context.workerPool && context.workerPool.size > 0)
      );
      if (hasWorker) {
        if (!this.isWorkerDispBusy) {
          this.dispatchWorkerDispersion(context);
        }
      } else {
        if (dispHash !== this.lastDispersionStateHash) {
          this.lastDispersionStateHash = dispHash;
          const incomingPos = new THREE.Vector3(0, 0.186, this.laserSaddle.position.z + 0.123);
          const apexPos = new THREE.Vector3(0, 0.186, this.centerSaddle.position.z);
          const rays = OpticalPhysics.calculatePrismDispersionRays(
            apexPos,
            THREE.MathUtils.degToRad(this.prismAngle),
            this.prism.refractiveIndex,
            incomingPos,
            screenZ
          );
          this.beamSystem.updateDispersionRays(rays);
        }
      }

      this.detectorScreen.renderFringesPattern({
        mode: 'spectrum',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        screenDistanceM: screenDistM,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: 0.94,
        wavelengthNm: this.wavelength,
      });
    } else if (this.currentMode === 'interference') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWaveVectors();
      this.beamSystem.clearGratingOrders();
      this.beamSystem.setIntensity(1.0);

      // 1. Incoming beam stops at the slit plate
      this.beamSystem.updateSegmentedBeam([{ start: _START_POS, end: _CENTER_POS, intensity: 1.0 }]);

      // 2. Render 3D spatial coherent wavefront ripples expanding towards screen in +Z
      if (this.show3DWave) {
        this.beamSystem.updateDoubleSlitWavefronts(
          this.centerSaddle.position.z,
          this.slitDistance,
          elapsed,
          this.screenSaddle.position.z
        );
        this.beamSystem.updateDiffractionFan(
          this.centerSaddle.position.z,
          this.screenSaddle.position.z,
          0.045
        );
      } else {
        this.beamSystem.clearWavefronts();
        this.beamSystem.clearDiffractionFan();
      }

      // Compute physical fringe spacing: Delta x = lambda * L / d
      const fringeSpacingM = OpticalPhysics.calculateDoubleSlitFringeSpacing(
        this.wavelength,
        this.slitDistance,
        screenDistM
      );

      // Multi-Core Worker physics computation
      const diffHash = `inter_${this.wavelength}_${this.slitDistance.toFixed(3)}_${this.slitWidth.toFixed(3)}_${screenDistM.toFixed(3)}`;
      const hasWorker = Boolean(
        context.computeBridge || (context.workerPool && context.workerPool.size > 0)
      );
      if (hasWorker) {
        if (!this.isWorkerBusy) {
          this.dispatchWorkerComputation(context, 2, screenDistM);
        }
      } else {
        if (diffHash !== this.lastDiffractionStateHash) {
          this.lastDiffractionStateHash = diffHash;
        }
        this.detectorScreen.renderFringesPattern({
          mode: 'double_slit',
          wavelengthNm: this.wavelength,
          intensity: 1.0,
          slitDistanceMm: this.slitDistance,
          slitWidthMm: this.slitWidth,
          screenDistanceM: screenDistM,
        });
      }

      if (this.hasWorkerResult) {
        this.detectorScreen.renderFringesFromBuffer(this.displayBuffer, this.wavelength, 1.0);
      } else if (hasWorker) {
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
        intensityRatio: 0.88,
        wavelengthNm: this.wavelength,
        fringeSpacingMm: fringeSpacingM * 1000,
      });
    } else if (this.currentMode === 'diffraction') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWaveVectors();
      this.beamSystem.setIntensity(1.0);

      // 1. Incoming beam stops at aperture
      this.beamSystem.updateSegmentedBeam([{ start: _START_POS, end: _CENTER_POS, intensity: 1.0 }]);

      const isGrating = this.slitFixture.slitType === 'grating';
      const slitCount = isGrating ? 8 : (this.slitFixture.slitType === 'double' ? 2 : 1);

      if (isGrating) {
        this.beamSystem.clearWavefronts();
        this.beamSystem.clearDiffractionFan();
        this.beamSystem.updateGratingOrders(
          this.centerSaddle.position.z,
          this.screenSaddle.position.z,
          this.gratingLinesPerMm
        );
      } else {
        this.beamSystem.clearGratingOrders();
        this.beamSystem.updateSingleSlitWavefronts(
          this.centerSaddle.position.z,
          this.slitWidth,
          elapsed,
          this.screenSaddle.position.z
        );
        this.beamSystem.updateDiffractionFan(
          this.centerSaddle.position.z,
          this.screenSaddle.position.z,
          0.038
        );
      }

      // Multi-Core Worker physics computation
      const diffHash = `diff_${this.wavelength}_${this.slitDistance.toFixed(3)}_${this.slitWidth.toFixed(3)}_${screenDistM.toFixed(3)}_${slitCount}_${this.gratingLinesPerMm}`;
      const hasWorker = Boolean(
        context.computeBridge || (context.workerPool && context.workerPool.size > 0)
      );
      if (hasWorker) {
        if (!this.isWorkerBusy) {
          this.dispatchWorkerComputation(context, slitCount, screenDistM);
        }
      } else {
        if (diffHash !== this.lastDiffractionStateHash) {
          this.lastDiffractionStateHash = diffHash;
        }
        if (!isGrating) {
          this.detectorScreen.renderFringesPattern({
            mode: 'single_slit',
            wavelengthNm: this.wavelength,
            intensity: 1.0,
            slitWidthMm: this.slitWidth,
            gratingLinesPerMm: this.gratingLinesPerMm,
            screenDistanceM: screenDistM,
          });
        }
      }

      if (isGrating) {
        this.detectorScreen.renderFringesPattern({
          mode: 'grating',
          wavelengthNm: this.wavelength,
          intensity: 1.0,
          slitWidthMm: this.slitWidth,
          gratingLinesPerMm: this.gratingLinesPerMm,
          screenDistanceM: screenDistM,
        });
      } else if (this.hasWorkerResult) {
        this.detectorScreen.renderFringesFromBuffer(this.displayBuffer, this.wavelength, 1.0);
      } else if (hasWorker) {
        this.detectorScreen.renderFringesPattern({
          mode: 'single_slit',
          wavelengthNm: this.wavelength,
          intensity: 1.0,
          slitWidthMm: this.slitWidth,
          gratingLinesPerMm: this.gratingLinesPerMm,
          screenDistanceM: screenDistM,
        });
      }

      this.detectorScreen.updateMeter({
        intensityRatio: 0.82,
        wavelengthNm: this.wavelength,
      });
    } else if (this.currentMode === 'polarization') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.beamSystem.clearGratingOrders();

      _P1_POS.set(0, 0.186, this.pol1Saddle.position.z);
      _P2_POS.set(0, 0.186, this.pol2Saddle.position.z);

      this.beamSystem.setIntensity(1.0);
      // Segmented beam: Laser -> P1 (1.0), P1 -> P2 (1.0), P2 -> Screen (Malus)
      this.beamSystem.updateSegmentedBeam([
        { start: _START_POS, end: _P1_POS, intensity: 1.0 },
        { start: _P1_POS, end: _P2_POS, intensity: 1.0 },
        { start: _P2_POS, end: _END_POS, intensity: this.lastMalusIntensity },
      ]);

      // Multi-Core Worker polarization physics offload
      const polHash = `${this.pol1Angle.toFixed(1)}_${this.pol2Angle.toFixed(1)}_${this.analyzer2.hasWavePlate}_${this.wavelength}`;
      const polStateChanged = polHash !== this.lastPolStateHash;
      if (polStateChanged) {
        this.lastPolStateHash = polHash;
      }

      const hasWorker = Boolean(
        context.computeBridge || (context.workerPool && context.workerPool.size > 0)
      );

      // Continuous 3D electric field vector wave offloaded to multi-core worker
      if (this.show3DWave) {
        if (hasWorker) {
          if (!this.isWorkerPolBusy) {
            this.dispatchWorkerPolarization(context, elapsed);
          }
          if (!this.hasReceivedWorkerPolResult) {
            this.beamSystem.updatePolarizationWave({
              startZ: _START_POS.z,
              endZ: _END_POS.z,
              polarizerZ: _P1_POS.z,
              polarizerAngleDeg: this.pol1Angle,
              analyzerZ: _P2_POS.z,
              analyzerAngleDeg: this.pol2Angle,
              hasQuarterWavePlate: this.analyzer2.hasWavePlate,
              time: elapsed,
            });
          }
        } else {
          if (polStateChanged) {
            this.lastMalusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
          }
          this.beamSystem.updatePolarizationWave({
            startZ: _START_POS.z,
            endZ: _END_POS.z,
            polarizerZ: _P1_POS.z,
            polarizerAngleDeg: this.pol1Angle,
            analyzerZ: _P2_POS.z,
            analyzerAngleDeg: this.pol2Angle,
            hasQuarterWavePlate: this.analyzer2.hasWavePlate,
            time: elapsed,
          });
        }
      } else {
        this.beamSystem.clearWaveVectors();
        if (polStateChanged) {
          if (hasWorker && !this.isWorkerPolBusy) {
            this.dispatchWorkerPolarization(context, elapsed);
          } else if (!hasWorker) {
            this.lastMalusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
          }
        }
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
  }

  /**
   * Mandatory offload of prism dispersion ray tracing to Multi-Core WorkerPool via ComputeBridge
   */
  private async dispatchWorkerDispersion(context: ExperimentContext): Promise<void> {
    if (this.isWorkerDispBusy) return;
    this.isWorkerDispBusy = true;

    try {
      const incomingPos: [number, number, number] = [0, 0.186, this.laserSaddle.position.z + 0.123];
      const apexPos: [number, number, number] = [0, 0.186, this.centerSaddle.position.z];
      const screenZ = this.screenSaddle.position.z - 0.006;

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDispersion === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDispersion({
          apexPos,
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.prism.refractiveIndex,
          incomingPos,
          screenZ,
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          if (this.currentMode === 'propagation') {
            this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
          }
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalDispersionStepResponse>({
          action: 'OPTICAL_DISPERSION_STEP',
          apexPos,
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.prism.refractiveIndex,
          incomingPos,
          screenZ,
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          if (this.currentMode === 'propagation') {
            this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
          }
        }
      } else {
        // Node / unit test fallback
        const prismWorldPos = new THREE.Vector3(apexPos[0], apexPos[1], apexPos[2]);
        const rays = OpticalPhysics.calculatePrismDispersionRays(
          prismWorldPos,
          THREE.MathUtils.degToRad(this.prismAngle),
          this.prism.refractiveIndex,
          new THREE.Vector3(incomingPos[0], incomingPos[1], incomingPos[2]),
          screenZ
        );
        this.beamSystem.updateDispersionRays(rays);
      }
    } catch {
      // Fallback silently if worker thread is terminating
    } finally {
      this.isWorkerDispBusy = false;
    }
  }

  /**
   * Mandatory offload of polarization physics to Multi-Core WorkerPool via ComputeBridge
   */
  private async dispatchWorkerPolarization(context: ExperimentContext, elapsed: number): Promise<void> {
    if (this.isWorkerPolBusy) return;
    this.isWorkerPolBusy = true;

    try {
      const startZ = this.laserSaddle.position.z + 0.123;
      const endZ = this.screenSaddle.position.z - 0.006;
      const polZ = this.pol1Saddle.position.z;
      const anaZ = this.pol2Saddle.position.z;

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalPolarization === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalPolarization({
          positions: this.workerPositions,
          colors: this.workerColors,
          polarizerAngleDeg: this.pol1Angle,
          analyzerAngleDeg: this.pol2Angle,
          hasQuarterWavePlate: this.analyzer2.hasWavePlate,
          wavelengthNm: this.wavelength,
          startZ,
          endZ,
          polarizerZ: polZ,
          analyzerZ: anaZ,
          numSamples: 60,
          time: elapsed,
        });
        if (resp) {
          this.hasReceivedWorkerPolResult = true;
          this.workerPositions = resp.positions;
          this.workerColors = resp.colors;
          if (typeof resp.malusIntensity === 'number' && !isNaN(resp.malusIntensity)) {
            this.lastMalusIntensity = resp.malusIntensity;
          }
          if (this.currentMode === 'polarization' && this.show3DWave) {
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
            hasQuarterWavePlate: this.analyzer2.hasWavePlate,
            wavelengthNm: this.wavelength,
            startZ,
            endZ,
            polarizerZ: polZ,
            analyzerZ: anaZ,
            numSamples: 60,
            time: elapsed,
          },
          [this.workerPositions.buffer, this.workerColors.buffer]
        );
        if (resp) {
          this.hasReceivedWorkerPolResult = true;
          this.workerPositions = resp.positions;
          this.workerColors = resp.colors;
          if (typeof resp.malusIntensity === 'number' && !isNaN(resp.malusIntensity)) {
            this.lastMalusIntensity = resp.malusIntensity;
          }
          if (this.currentMode === 'polarization' && this.show3DWave) {
            this.beamSystem.applyPolarizationWaveBuffer(this.workerPositions, this.workerColors);
          }
        }
      } else {
        // Node / unit test fallback
        this.lastMalusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
      }
    } catch {
      if (!this.workerPositions || this.workerPositions.byteLength === 0) {
        this.workerPositions = new Float32Array(122 * 3);
      }
      if (!this.workerColors || this.workerColors.byteLength === 0) {
        this.workerColors = new Float32Array(122 * 3);
      }
    } finally {
      this.isWorkerPolBusy = false;
    }
  }

  /**
   * Mandatory offload of interference/diffraction physics to Multi-Core WorkerPool via ComputeBridge
   */
  private async dispatchWorkerComputation(context: ExperimentContext, slitCount: number, screenDistM: number): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (!this.workerIntensityBuffer || this.workerIntensityBuffer.byteLength === 0) {
        this.workerIntensityBuffer = new Float32Array(512);
      }

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDiffraction === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDiffraction({
          intensityBuffer: this.workerIntensityBuffer,
          wavelengthNm: this.wavelength,
          slitWidthMm: this.slitWidth,
          slitDistanceMm: this.slitDistance,
          screenDistanceM: screenDistM,
          screenSpanMm: 80.0,
          slitCount,
          gratingLinesPerMm: this.gratingLinesPerMm,
        });
        if (resp && resp.intensityBuffer) {
          this.workerIntensityBuffer = resp.intensityBuffer;
          this.displayBuffer.set(this.workerIntensityBuffer);
          if (this.currentMode === 'interference' || this.currentMode === 'diffraction') {
            this.hasWorkerResult = true;
          }
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
            slitCount,
            gratingLinesPerMm: this.gratingLinesPerMm,
          },
          [this.workerIntensityBuffer.buffer]
        );
        if (resp && resp.intensityBuffer) {
          this.workerIntensityBuffer = resp.intensityBuffer;
          this.displayBuffer.set(this.workerIntensityBuffer);
          if (this.currentMode === 'interference' || this.currentMode === 'diffraction') {
            this.hasWorkerResult = true;
          }
        }
      }
    } catch {
      if (!this.workerIntensityBuffer || this.workerIntensityBuffer.byteLength === 0) {
        this.workerIntensityBuffer = new Float32Array(512);
      }
    } finally {
      this.isWorkerBusy = false;
    }
  }

  private applyMode(mode: 'interference' | 'propagation' | 'diffraction' | 'polarization', context: ExperimentContext): void {
    this.currentMode = mode;

    const isProp = mode === 'propagation';
    const isInter = mode === 'interference';
    const isDiff = mode === 'diffraction';
    const isPol = mode === 'polarization';

    // Toggle component visibility
    this.rotaryStage.group.visible = isProp;
    this.slitFixture.group.visible = isInter || isDiff;
    this.centerSaddle.visible = isProp || isInter || isDiff;
    this.polarizer1.group.visible = isPol;
    this.analyzer2.group.visible = isPol;
    this.pol1Saddle.visible = isPol;
    this.pol2Saddle.visible = isPol;

    if (isInter) {
      this.slitFixture.setParameters({
        type: 'double',
        slitWidthMm: this.slitWidth,
        slitDistanceMm: this.slitDistance,
      });
    } else if (isDiff) {
      this.slitFixture.setParameters({
        type: this.gratingLinesPerMm > 0 ? 'grating' : 'single',
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
      });
    }

    this.beamSystem.setWhiteLight(isProp);

    if (!isProp) {
      this.beamSystem.clearDispersionRays();
      this.lastDispersionStateHash = '';
      this.workerRays = [];
    }
    if (!isPol) {
      this.beamSystem.clearWaveVectors();
      this.beamSystem.setIntensity(1.0);
      this.lastPolStateHash = '';
      this.hasReceivedWorkerPolResult = false;
    }
    if (!isInter && !isDiff) {
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.beamSystem.clearGratingOrders();
      this.lastDiffractionStateHash = '';
      this.hasWorkerResult = false;
    } else if (isInter) {
      this.beamSystem.clearGratingOrders();
      this.lastDiffractionStateHash = '';
      this.hasWorkerResult = false;
    } else if (isDiff) {
      const isGrating = this.gratingLinesPerMm > 0;
      if (isGrating) {
        this.beamSystem.clearWavefronts();
        this.beamSystem.clearDiffractionFan();
      } else {
        this.beamSystem.clearGratingOrders();
      }
      this.lastDiffractionStateHash = '';
      this.hasWorkerResult = false;
    }
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (id === 'mode') {
      this.applyMode(value, context);
    } else if (id === 'wavelength') {
      this.wavelength = Number(value);
      this.laser.updateWavelength(this.wavelength);
      this.beamSystem.updateWavelength(this.wavelength);
    } else if (id === 'slitDistance') {
      this.slitDistance = Number(value);
      this.slitFixture.setParameters({ slitDistanceMm: this.slitDistance });
    } else if (id === 'slitWidth') {
      this.slitWidth = Number(value);
      this.slitFixture.setParameters({ slitWidthMm: this.slitWidth });
    } else if (id === 'gratingDensity') {
      this.gratingLinesPerMm = Number(value);
      this.slitFixture.setParameters({ gratingLinesPerMm: this.gratingLinesPerMm });
    } else if (id === 'prismAngle') {
      this.prismAngle = Number(value);
      this.rotaryStage.setRotationAngleDeg(this.prismAngle);
    } else if (id === 'polarizerAngle') {
      this.pol1Angle = Number(value);
      this.polarizer1.setAngleDeg(this.pol1Angle);
    } else if (id === 'analyzerAngle') {
      this.pol2Angle = Number(value);
      this.analyzer2.setAngleDeg(this.pol2Angle);
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
