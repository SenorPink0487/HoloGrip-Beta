import * as THREE from 'three';
import { BaseExperiment } from '../../base/BaseExperiment.ts';
import { OpticalBenchRail } from '../../../scene/optics/OpticalBenchRail.ts';
import { LaserEmitterMesh } from '../../../scene/optics/LaserEmitterMesh.ts';
import { SlitApertureMesh, type SlitType } from '../../../scene/optics/SlitApertureMesh.ts';
import { DetectorScreenMesh } from '../../../scene/optics/DetectorScreenMesh.ts';
import { OpticalBeamSystem } from '../../../scene/optics/OpticalBeamSystem.ts';
import { OpticsInteractionManager } from '../../../scene/optics/OpticsInteractionManager.ts';
import { metadata } from './meta.ts';
import type { ExperimentContext } from '../../../core/types.ts';
import type { OpticalDiffractionStepResponse } from '../../../workers/workerMessages.ts';

const _START_POS = new THREE.Vector3();
const _SLIT_POS = new THREE.Vector3();

export default class OpticsDiffractionExperiment extends BaseExperiment {
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

  private diffractionType: SlitType = 'grating';
  private wavelength = 532.0;
  private slitWidth = 0.05;
  private gratingLinesPerMm = 300;

  private workerBuffer: Float32Array = new Float32Array(512);
  private displayBuffer: Float32Array = new Float32Array(512);
  private isWorkerBusy = false;
  private hasWorkerResult = false;
  private lastStateHash = '';

  public init(context: ExperimentContext): void {
    // 橡胶防震脚垫平稳贴合桌面 (Y=0.063)，沿桌面横向向前平移至交互工作区 (Z=0.96)
    this.rootGroup.position.set(0, 0.063, 0.96);
    this.rootGroup.rotation.y = Math.PI * 0.5;

    this.rail = this.track(new OpticalBenchRail());
    this.rootGroup.add(this.rail.group);
    this.addDisposable(() => this.rail.dispose());

    this.laserSaddle = this.rail.createCarrierSaddle('LaserSaddle');
    this.laserSaddle.position.z = -0.52;

    this.slitSaddle = this.rail.createCarrierSaddle('SlitSaddle');
    this.slitSaddle.position.z = -0.05;

    this.screenSaddle = this.rail.createCarrierSaddle('ScreenSaddle');
    this.screenSaddle.position.z = 0.48;

    this.laser = this.track(new LaserEmitterMesh(this.wavelength));
    this.laserSaddle.add(this.laser.group);
    this.addDisposable(() => this.laser.dispose());

    this.slitFixture = this.track(new SlitApertureMesh(this.diffractionType));
    this.slitSaddle.add(this.slitFixture.group);
    this.addDisposable(() => this.slitFixture.dispose());

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
      onSlitChange: (slitType, _dist, widthMm, density) => {
        const mappedType: SlitType = slitType === 'single' ? 'single' : 'grating';
        this.diffractionType = mappedType;
        this.slitWidth = widthMm;
        this.gratingLinesPerMm = density;
        this.slitFixture.setParameters({
          type: mappedType,
          slitWidthMm: widthMm,
          gratingLinesPerMm: density,
        });
        context.setParameter('diffractionType', mappedType);
        context.setParameter('slitWidth', widthMm);
        context.setParameter('gratingDensity', String(density));
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
      this.beamSystem.clearGratingOrders();
      this.detectorScreen.renderFringesPattern({
        mode: this.diffractionType === 'grating' ? 'grating' : 'single_slit',
        wavelengthNm: this.wavelength,
        intensity: 0,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
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
    // 1. 入射光束终止于光阑夹具前方
    this.beamSystem.updateSegmentedBeam([{ start: _START_POS, end: _SLIT_POS, intensity: 1.0 }]);

    const isGrating = this.diffractionType === 'grating';
    if (isGrating) {
      this.beamSystem.clearWavefronts();
      this.beamSystem.clearDiffractionFan();
      this.beamSystem.updateGratingOrders(
        this.slitSaddle.position.z,
        this.screenSaddle.position.z,
        this.gratingLinesPerMm
      );
    } else {
      this.beamSystem.clearGratingOrders();
      this.beamSystem.updateSingleSlitWavefronts(
        this.slitSaddle.position.z,
        this.slitWidth,
        elapsed,
        this.screenSaddle.position.z
      );
      this.beamSystem.updateDiffractionFan(
        this.slitSaddle.position.z,
        this.screenSaddle.position.z,
        0.038,
        1.0,
        'single_slit',
        undefined,
        this.slitWidth
      );
    }

    // 多核 Worker 物理计算
    const stateHash = `${this.diffractionType}_${this.wavelength}_${this.slitWidth.toFixed(3)}_${this.gratingLinesPerMm}_${screenDistM.toFixed(3)}`;
    const hasWorker = Boolean(
      context.computeBridge || (context.workerPool && context.workerPool.size > 0)
    );
    if (hasWorker) {
      if (!this.isWorkerBusy) {
        this.dispatchWorkerDiffraction(context, screenDistM);
      }
    } else {
      if (stateHash !== this.lastStateHash) {
        this.lastStateHash = stateHash;
      }
      this.detectorScreen.renderFringesPattern({
        mode: isGrating ? 'grating' : 'single_slit',
        wavelengthNm: this.wavelength,
        intensity: 1.0,
        slitWidthMm: this.slitWidth,
        gratingLinesPerMm: this.gratingLinesPerMm,
        screenDistanceM: screenDistM,
      });
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
      intensityRatio: 0.86,
      wavelengthNm: this.wavelength,
    });
  }

  private async dispatchWorkerDiffraction(context: ExperimentContext, screenDistM: number): Promise<void> {
    if (this.isWorkerBusy) return;
    this.isWorkerBusy = true;

    try {
      if (!this.workerBuffer || this.workerBuffer.byteLength === 0) {
        this.workerBuffer = new Float32Array(512);
      }

      if (context.computeBridge && typeof (context.computeBridge as any).simulateOpticalDiffraction === 'function') {
        const resp = await (context.computeBridge as any).simulateOpticalDiffraction({
          intensityBuffer: this.workerBuffer,
          wavelengthNm: this.wavelength,
          slitWidthMm: this.slitWidth,
          slitDistanceMm: 0.25,
          screenDistanceM: screenDistM,
          screenSpanMm: 80.0,
          slitCount: this.diffractionType === 'grating' ? 8 : 1,
          gratingLinesPerMm: this.gratingLinesPerMm,
        });
        if (resp && resp.intensityBuffer) {
          this.workerBuffer = resp.intensityBuffer;
          this.displayBuffer.set(this.workerBuffer);
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
            screenDistanceM: screenDistM,
            screenSpanMm: 80.0,
            slitCount: this.diffractionType === 'grating' ? 8 : 1,
            gratingLinesPerMm: this.gratingLinesPerMm,
          },
          [this.workerBuffer.buffer]
        );
        if (resp && resp.intensityBuffer) {
          this.workerBuffer = resp.intensityBuffer;
          this.displayBuffer.set(this.workerBuffer);
          this.hasWorkerResult = true;
        }
      }
    } catch {
      if (!this.workerBuffer || this.workerBuffer.byteLength === 0) {
        this.workerBuffer = new Float32Array(512);
      }
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
