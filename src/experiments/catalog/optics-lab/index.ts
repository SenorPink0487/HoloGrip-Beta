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
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalDiffractionStepResponse } from '../../../workers/workerMessages.ts';

export default class OpticsLabExperiment extends BaseExperiment {
  public readonly metadata = metadata;

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

  // Multi-core Worker Buffer
  private workerIntensityBuffer: Float32Array<any> = new Float32Array(512);
  private isWorkerBusy = false;

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface and orient apparatus across the table
    this.rootGroup.position.set(0, 0.063, 0);
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

    // Apply initial mode configuration
    this.applyMode(this.currentMode, context);
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    // Optical axis is at y = 0.186
    const startPos = new THREE.Vector3(0, 0.186, -0.40);
    const endPos = new THREE.Vector3(0, 0.186, 0.474);

    if (this.currentMode === 'propagation') {
      // Calculate continuous rainbow dispersion rays through prism
      const prismWorldPos = new THREE.Vector3(0, 0.186, -0.02);
      const rays = OpticalPhysics.calculatePrismDispersionRays(
        prismWorldPos,
        THREE.MathUtils.degToRad(this.prismAngle),
        this.prism.refractiveIndex,
        startPos
      );
      this.beamSystem.updateDispersionRays(rays);

      this.detectorScreen.renderFringesPattern({
        mode: 'spectrum',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        screenDistanceM: 0.5,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: 0.94,
        wavelengthNm: this.wavelength,
      });
    } else if (this.currentMode === 'interference') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.updateStraightBeam(startPos, endPos);

      // Render 3D spatial cylindrical wavefront ripples
      if (this.show3DWave) {
        this.beamSystem.updateDoubleSlitWavefronts(-0.02, this.slitDistance, elapsed);
      } else {
        this.beamSystem.clearWavefronts();
      }

      // Compute physical fringe spacing: Delta x = lambda * L / d
      const screenDistM = 0.5;
      const fringeSpacingM = OpticalPhysics.calculateDoubleSlitFringeSpacing(
        this.wavelength,
        this.slitDistance,
        screenDistM
      );

      this.detectorScreen.renderFringesPattern({
        mode: 'double_slit',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitDistanceMm: this.slitDistance,
        slitWidthMm: this.slitWidth,
        screenDistanceM: screenDistM,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: 0.88,
        wavelengthNm: this.wavelength,
        fringeSpacingMm: fringeSpacingM * 1000,
      });
    } else if (this.currentMode === 'diffraction') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWavefronts();
      this.beamSystem.updateStraightBeam(startPos, endPos);

      // Async multi-core worker computing for high-density diffraction field
      this.dispatchWorkerDiffraction(context);

      const screenDistM = 0.5;
      const isGrating = this.slitFixture.slitType === 'grating';

      this.detectorScreen.renderFringesPattern({
        mode: isGrating ? 'grating' : 'single_slit',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
        screenDistanceM: screenDistM,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: 0.82,
        wavelengthNm: this.wavelength,
      });
    } else if (this.currentMode === 'polarization') {
      this.beamSystem.clearDispersionRays();
      this.beamSystem.clearWavefronts();

      // Malus's Law calculation: I = I_0 * cos^2(theta2 - theta1)
      const malusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
      this.beamSystem.setIntensity(malusIntensity);
      this.beamSystem.updateStraightBeam(startPos, endPos);

      // 3D vector wave train animation
      if (this.show3DWave) {
        this.beamSystem.updatePolarizationWave({
          startZ: -0.40,
          endZ: 0.474,
          polarizerZ: -0.22,
          polarizerAngleDeg: this.pol1Angle,
          analyzerZ: 0.18,
          analyzerAngleDeg: this.pol2Angle,
          hasQuarterWavePlate: this.analyzer2.hasWavePlate,
          time: elapsed,
        });
      } else {
        this.beamSystem.clearWaveVectors();
      }

      this.detectorScreen.renderFringesPattern({
        mode: 'polarization',
        wavelengthNm: this.wavelength,
        intensity: malusIntensity,
        polarizerAngle: this.pol1Angle,
        analyzerAngle: this.pol2Angle,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: malusIntensity,
        wavelengthNm: this.wavelength,
      });
    }
  }

  /**
   * Offload diffraction field computation to WorkerPool
   */
  private async dispatchWorkerDiffraction(context: ExperimentContext): Promise<void> {
    if (this.isWorkerBusy || !context.workerPool || context.workerPool.size === 0) return;
    this.isWorkerBusy = true;

    try {
      const resp = await context.workerPool.execute<OpticalDiffractionStepResponse>(
        {
          action: 'OPTICAL_DIFFRACTION_STEP',
          intensityBuffer: this.workerIntensityBuffer,
          wavelengthNm: this.wavelength,
          slitWidthMm: this.slitWidth,
          slitDistanceMm: this.slitDistance,
          screenDistanceM: 0.5,
          screenSpanMm: 80.0,
          slitCount: this.slitFixture.slitType === 'grating' ? 8 : (this.slitFixture.slitType === 'double' ? 2 : 1),
          gratingLinesPerMm: this.gratingLinesPerMm,
        },
        [this.workerIntensityBuffer.buffer]
      );
      this.workerIntensityBuffer = resp.intensityBuffer;
    } catch {
      // Fallback silently if worker thread is terminating
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

    if (!isProp) {
      this.beamSystem.clearDispersionRays();
    }
    if (!isPol) {
      this.beamSystem.clearWaveVectors();
      this.beamSystem.setIntensity(1.0);
    }
    if (!isInter) {
      this.beamSystem.clearWavefronts();
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

  public onPointerDown(event: PointerEvent, hit: THREE.Intersection | null, context: ExperimentContext): boolean {
    if (!hit) return false;

    let obj: THREE.Object3D | null = hit.object;
    let clickedLaser = false;
    let clickedPrism = false;
    let clickedPol1 = false;
    let clickedPol2 = false;
    let clickedSlits = false;

    while (obj && obj !== this.rootGroup) {
      if (obj === this.laser.group) { clickedLaser = true; break; }
      if (obj === this.rotaryStage.group || obj === this.prism.group) { clickedPrism = true; break; }
      if (obj === this.polarizer1.group) { clickedPol1 = true; break; }
      if (obj === this.analyzer2.group) { clickedPol2 = true; break; }
      if (obj === this.slitFixture.group) { clickedSlits = true; break; }
      obj = obj.parent;
    }

    if (clickedLaser) {
      // Cycle laser wavelengths: Red (632.8) -> Green (532) -> Violet (405)
      const wlList = [632.8, 532.0, 405.0];
      const curIdx = wlList.indexOf(this.wavelength);
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % wlList.length : 0;
      this.wavelength = wlList[nextIdx];
      this.laser.updateWavelength(this.wavelength);
      this.beamSystem.updateWavelength(this.wavelength);
      context.setParameter('wavelength', this.wavelength);
      return true;
    }

    if (clickedPol1) {
      this.pol1Angle = (this.pol1Angle + 15) % 360;
      this.polarizer1.setAngleDeg(this.pol1Angle);
      context.setParameter('polarizerAngle', this.pol1Angle);
      return true;
    }

    if (clickedPol2) {
      this.pol2Angle = (this.pol2Angle + 15) % 360;
      this.analyzer2.setAngleDeg(this.pol2Angle);
      context.setParameter('analyzerAngle', this.pol2Angle);
      return true;
    }

    if (clickedPrism) {
      this.prismAngle = (this.prismAngle + 5) > 30 ? -30 : this.prismAngle + 5;
      this.rotaryStage.setRotationAngleDeg(this.prismAngle);
      context.setParameter('prismAngle', this.prismAngle);
      return true;
    }

    if (clickedSlits) {
      this.slitDistance = this.slitDistance >= 0.45 ? 0.15 : Math.round((this.slitDistance + 0.1) * 100) / 100;
      this.slitFixture.setParameters({ slitDistanceMm: this.slitDistance });
      context.setParameter('slitDistance', this.slitDistance);
      return true;
    }

    return false;
  }
}
