import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { SlitApertureMesh } from '../../../scene/optics/SlitApertureMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';

export default class OpticsInterferenceExperiment extends BaseExperiment {
  public readonly metadata = metadata;

  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private slitFixture: SlitApertureMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  private wavelength = 632.8;
  private slitDistance = 0.25;
  private slitWidth = 0.04;
  private showWavefronts = true;

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface and orient apparatus across the table
    this.rootGroup.position.set(0, 0.063, 0);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    // 1. Rail & Saddles
    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    const laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    laserSaddle.position.z = -0.52;

    const slitSaddle = this.rail.createCarrierSaddle('SlitSaddle');
    slitSaddle.position.z = -0.05;

    const screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    screenSaddle.position.z = 0.48;

    // 2. Laser Emitter
    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    // 3. Double Slit Fixture
    this.slitFixture = this.track(new SlitApertureMesh('double'));
    slitSaddle.add(this.slitFixture.group);
    this.addDisposable(() => this.slitFixture.dispose());

    // 4. Observation Screen & Meter
    this.detectorScreen = this.track(new DetectorScreenMesh());
    screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    // 5. Beams
    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    const startPos = new THREE.Vector3(0, 0.186, -0.40);
    const endPos = new THREE.Vector3(0, 0.186, 0.474);
    this.beamSystem.updateStraightBeam(startPos, endPos);

    if (this.showWavefronts) {
      this.beamSystem.updateDoubleSlitWavefronts(-0.05, this.slitDistance, elapsed);
    } else {
      this.beamSystem.clearWavefronts();
    }

    const screenDistM = 0.53;
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
      intensityRatio: 0.92,
      wavelengthNm: this.wavelength,
      fringeSpacingMm: fringeSpacingM * 1000,
    });
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
}
