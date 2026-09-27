import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { RotaryStageMesh } from '../../../scene/optics/RotaryStageMesh.ts';
import { PrismMesh, type PrismGeometryType } from '../../../scene/optics/PrismMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticalPhysics } from '../../../scene/optics/OpticalPhysics.ts';
import { OpticsInteractionManager } from '../../../scene/optics/OpticsInteractionManager.ts';
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

  private laserSaddle: THREE.Group;
  private prismSaddle: THREE.Group;
  private screenSaddle: THREE.Group;
  private interactionManager: OpticsInteractionManager;

  private wavelength = 532.0;
  private prismAngle = 0.0;
  private prismType: PrismGeometryType = 'equilateral';
  private refractiveIndex = 1.54;
  private multiSpectrum = true;

  // Multi-Core Worker State
  private isWorkerBusy = false;
  private workerRays: WorkerDispersionRayData[] = [];
  private lastDispersionStateHash = '';

  // Cached scratch vectors for per-frame beam rendering
  private readonly startPos = new THREE.Vector3();
  private readonly prismPos = new THREE.Vector3();
  private readonly endPos = new THREE.Vector3();
  private readonly inDir = new THREE.Vector3(0, 0, 1);
  private readonly faceNormal = new THREE.Vector3();

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

    this.prismSaddle = this.rail.createCarrierSaddle('PrismSaddle');
    this.prismSaddle.position.z = -0.05;

    this.screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    this.screenSaddle.position.z = 0.48;

    // 2. Laser Emitter
    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    this.laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    // 3. Rotary Stage & Prism
    this.rotaryStage = this.track(new RotaryStageMesh());
    this.prismSaddle.add(this.rotaryStage.group);
    this.addDisposable(() => this.rotaryStage.dispose());

    this.prism = this.track(new PrismMesh(this.prismType, this.refractiveIndex));
    this.rotaryStage.rotorGroup.add(this.prism.group);
    this.addDisposable(() => this.prism.dispose());

    // 4. Observation Screen & Radiometer
    this.detectorScreen = this.track(new DetectorScreenMesh());
    this.screenSaddle.add(this.detectorScreen.group);
    this.addDisposable(() => this.detectorScreen.dispose());

    // 5. Beams
    this.beamSystem = this.track(new OpticalBeamSystem(this.wavelength));
    this.rootGroup.add(this.beamSystem.group);
    this.addDisposable(() => this.beamSystem.dispose());

    if (this.multiSpectrum && this.prismType === 'equilateral') {
      this.beamSystem.setWhiteLight(true);
    }

    this.interactionManager = new OpticsInteractionManager({
      rootGroup: this.rootGroup,
      rail: this.rail,
      laser: this.laser,
      laserSaddle: this.laserSaddle,
      rotaryStage: this.rotaryStage,
      prism: this.prism,
      prismSaddle: this.prismSaddle,
      detectorScreen: this.detectorScreen,
      screenSaddle: this.screenSaddle,
      beamSystem: this.beamSystem,

      onLaserChange: (_isOn, wavelengthNm) => {
        this.wavelength = wavelengthNm;
        this.laser.updateWavelength(this.wavelength);
        this.beamSystem.updateWavelength(this.wavelength);
        context.setParameter('wavelength', this.wavelength);
      },
      onPrismChange: (angleDeg, type) => {
        this.prismAngle = angleDeg;
        context.setParameter('prismAngle', this.prismAngle);
        if (type) {
          this.prismType = type;
          context.setParameter('prismType', type);
        }
      },
    });
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    this.startPos.set(0, 0.186, this.laserSaddle.position.z + 0.123);
    this.prismPos.set(0, 0.186, this.prismSaddle.position.z);
    const screenDistM = Math.max(0.08, this.screenSaddle.position.z - this.prismSaddle.position.z);
    const screenZ = this.screenSaddle.position.z - 0.006;

    if (!this.laser.isOn) {
      this.beamSystem.setIntensity(0);
      this.beamSystem.clearDispersionRays();
      this.lastDispersionStateHash = '';
      this.detectorScreen.renderFringesPattern({
        mode: this.multiSpectrum && this.prismType === 'equilateral' ? 'spectrum' : 'spot',
        wavelengthNm: this.wavelength,
        intensity: 0,
        screenDistanceM: screenDistM,
      });
      this.detectorScreen.updateMeter({
        intensityRatio: 0,
        wavelengthNm: this.wavelength,
      });
      return;
    }

    this.beamSystem.setIntensity(1.0);

    if (this.multiSpectrum && this.prismType === 'equilateral') {
      if (!this.beamSystem.isWhiteLight) {
        this.beamSystem.setWhiteLight(true);
      }

      const stateHash = `${this.laser.isOn}_${this.wavelength}_${this.prismAngle.toFixed(2)}_${this.refractiveIndex.toFixed(3)}_${this.laserSaddle.position.z.toFixed(4)}_${this.prismSaddle.position.z.toFixed(4)}_${screenZ.toFixed(4)}`;
      const hasWorker = Boolean(
        context.computeBridge || (context.workerPool && context.workerPool.size > 0)
      );
      if (hasWorker) {
        if (!this.isWorkerBusy) {
          this.dispatchWorkerDispersion(context, screenZ);
        }
      } else {
        if (stateHash !== this.lastDispersionStateHash) {
          this.lastDispersionStateHash = stateHash;
          const incomingPos = new THREE.Vector3(0, 0.186, this.laserSaddle.position.z + 0.123);
          const apexPos = new THREE.Vector3(0, 0.186, this.prismSaddle.position.z);
          const rays = OpticalPhysics.calculatePrismDispersionRays(
            apexPos,
            THREE.MathUtils.degToRad(this.prismAngle),
            this.refractiveIndex,
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
        intensityRatio: 0.96,
        wavelengthNm: this.wavelength,
      });
    } else {
      if (this.beamSystem.isWhiteLight) {
        this.beamSystem.setWhiteLight(false);
      }
      this.beamSystem.clearDispersionRays();
      this.lastDispersionStateHash = '';

      // Single monochromatic ray refraction & TIR reflection
      const rad = THREE.MathUtils.degToRad(this.prismAngle);
      this.faceNormal.set(-Math.sin(rad), 0, Math.cos(rad));
      const res = OpticalPhysics.refractRay(this.inDir, this.faceNormal, 1.0, this.refractiveIndex);

      this.endPos.copy(this.prismPos).addScaledVector(res.outDirection, screenDistM);
      this.beamSystem.updateSegmentedBeam([
        { start: this.startPos, end: this.prismPos, intensity: 1.0 },
        { start: this.prismPos, end: this.endPos, intensity: 1.0 },
      ]);

      this.detectorScreen.renderFringesPattern({
        mode: 'spot',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
      });

      this.detectorScreen.updateMeter({
        intensityRatio: res.totalInternalReflection ? 1.0 : 0.95,
        wavelengthNm: this.wavelength,
      });
    }
  }

  private async dispatchWorkerDispersion(context: ExperimentContext, screenZ = 0.48): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      const incomingPos: [number, number, number] = [0, 0.186, this.laserSaddle.position.z + 0.123];
      const apexPos: [number, number, number] = [0, 0.186, this.prismSaddle.position.z];

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDispersion === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDispersion({
          apexPos,
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.refractiveIndex,
          incomingPos,
          screenZ,
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
        }
      } else if (context.workerPool && context.workerPool.size > 0) {
        const resp = await context.workerPool.execute<OpticalDispersionStepResponse>({
          action: 'OPTICAL_DISPERSION_STEP',
          apexPos,
          prismRotationY: THREE.MathUtils.degToRad(this.prismAngle),
          baseIndex: this.refractiveIndex,
          incomingPos,
          screenZ,
        });
        if (resp && resp.rays) {
          this.workerRays = resp.rays;
          this.beamSystem.updateDispersionRaysFromWorker(this.workerRays);
        }
      } else {
        // Fallback when workerPool is empty (e.g., node test)
        const rays = OpticalPhysics.calculatePrismDispersionRays(
          new THREE.Vector3(apexPos[0], apexPos[1], apexPos[2]),
          THREE.MathUtils.degToRad(this.prismAngle),
          this.refractiveIndex,
          new THREE.Vector3(incomingPos[0], incomingPos[1], incomingPos[2]),
          screenZ
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
