import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { RotaryStageMesh } from '../../../scene/optics/RotaryStageMesh.ts';
import { PrismMesh, type PrismGeometryType } from '../../../scene/optics/PrismMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalDispersionStepResponse, WorkerDispersionRayData } from '../../../workers/workerMessages.ts';

export default class OpticsPropagationExperiment extends BaseExperiment {
  public readonly metadata = metadata;
  public override targetScale = 1.95;
  public override hideCenterEmitter = true;

  private rail: OpticalBenchRail;
  private laser: LaserEmitterMesh;
  private rotaryStage: RotaryStageMesh;
  private prism: PrismMesh;
  private detectorScreen: DetectorScreenMesh;
  private beamSystem: OpticalBeamSystem;

  private wavelength = 532.0;
  private prismAngle = 0.0;
  private prismType: PrismGeometryType = 'equilateral';
  private refractiveIndex = 1.54;
  private multiSpectrum = true;

  // Multi-Core Worker State
  private isWorkerBusy = false;
  private workerRays: WorkerDispersionRayData[] = [];

  public init(context: ExperimentContext): void {
    // Rest rubber pads firmly on table surface (Y=0.063), shifted forward to user workbench (Z=0.96), across the table
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    // 1. Rail & Saddles
    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    const laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    laserSaddle.position.z = -0.52;

    const prismSaddle = this.rail.createCarrierSaddle('PrismSaddle');
    prismSaddle.position.z = -0.05;

    const screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    screenSaddle.position.z = 0.48;

    // 2. Laser Emitter
    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    // 3. Rotary Stage & Prism
    this.rotaryStage = this.track(new RotaryStageMesh());
    prismSaddle.add(this.rotaryStage.group);
    this.addDisposable(() => this.rotaryStage.dispose());

    this.prism = this.track(new PrismMesh(this.prismType, this.refractiveIndex));
    this.rotaryStage.rotorGroup.add(this.prism.group);
    this.addDisposable(() => this.prism.dispose());

    // 4. Observation Screen & Radiometer
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
    const prismPos = new THREE.Vector3(0, 0.186, -0.05);

    if (this.multiSpectrum && this.prismType === 'equilateral') {
      // Mandatory Multi-Core Worker ray-tracing offload
      this.dispatchWorkerDispersion(context);

      this.detectorScreen.renderFringesPattern({
        mode: 'spectrum',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        screenDistanceM: 0.5,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: 0.96,
        wavelengthNm: this.wavelength,
      });
    } else {
      this.beamSystem.clearDispersionRays();

      // Single monochromatic ray refraction
      const inDir = new THREE.Vector3(0, 0, 1);
      const faceNormal = new THREE.Vector3(-Math.sin(THREE.MathUtils.degToRad(this.prismAngle)), 0, Math.cos(THREE.MathUtils.degToRad(this.prismAngle)));
      const res = OpticalPhysics.refractRay(inDir, faceNormal, 1.0, this.refractiveIndex);

      const endPos = prismPos.clone().add(res.outDirection.clone().multiplyScalar(0.53));
      this.beamSystem.updateStraightBeam(startPos, endPos);

      this.detectorScreen.renderFringesPattern({
        mode: 'spot',
        wavelengthNm: this.wavelength,
        intensity: res.totalInternalReflection ? 0.05 : 1.0,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: res.totalInternalReflection ? 0.05 : 0.95,
        wavelengthNm: this.wavelength,
      });
    }
  }

  private async dispatchWorkerDispersion(context: ExperimentContext): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDispersion === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDispersion({
          apexPos: [0, 0.186, -0.05],
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.refractiveIndex,
          incomingPos: [0, 0.186, -0.40],
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalDispersionStepResponse>({
          action: 'OPTICAL_DISPERSION_STEP',
          apexPos: [0, 0.186, -0.05],
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.refractiveIndex,
          incomingPos: [0, 0.186, -0.40],
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
        }
      } else {
        // Fallback when workerPool is empty (e.g., node test)
        const rays = OpticalPhysics.calculatePrismDispersionRays(
          new THREE.Vector3(0, 0.186, -0.05),
          THREE.MathUtils.degToRad(this.prismAngle),
          this.refractiveIndex,
          new THREE.Vector3(0, 0.186, -0.40)
        );
        this.beamSystem.updateDispersionRays(rays);
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
    } else if (id === 'prismAngle') {
      this.prismAngle = Number(value);
      this.rotaryStage.setRotationAngleDeg(this.prismAngle);
    } else if (id === 'prismType') {
      this.prismType = value;
      this.prism.setType(this.prismType);
    } else if (id === 'refractiveIndex') {
      this.refractiveIndex = Number(value);
      this.prism.setRefractiveIndex(this.refractiveIndex);
    } else if (id === 'multiSpectrum') {
      this.multiSpectrum = Boolean(value);
    }
  }
}
