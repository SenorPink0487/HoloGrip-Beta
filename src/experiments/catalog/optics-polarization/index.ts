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

export default class OpticsPolarizationExperiment extends BaseExperiment {
  public readonly metadata = metadata;

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

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface and orient apparatus across the table
    this.rootGroup.position.set(0, 0.063, 0);
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

    const malusIntensity = OpticalPhysics.calculateMalusIntensity(this.pol1Angle, this.pol2Angle, 1.0);
    this.beamSystem.setIntensity(malusIntensity);
    this.beamSystem.updateStraightBeam(startPos, endPos);

    if (this.show3DWave) {
      this.beamSystem.updatePolarizationWave({
        startZ: -0.40,
        endZ: 0.474,
        polarizerZ: -0.18,
        polarizerAngleDeg: this.pol1Angle,
        analyzerZ: 0.16,
        analyzerAngleDeg: this.pol2Angle,
        hasQuarterWavePlate: this.quarterWavePlate,
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
