import * as THREE from 'three';
import { OpticalBenchMesh, CarrierMount } from './OpticalBenchMesh';
import { FringeTextureGenerator, FringePatternType } from './FringeTextureGenerator';
import {
  LaserEmitterMesh,
  ScreenMesh,
  SlitHolderMesh,
  PolarizerDiskMesh,
  PrismStageMesh,
  LightVisualizer,
} from './OpticalComponents';
import { OpticsMath, ColorRGB } from './OpticsMath';
import type { ComputeBridge } from '../../core/platform/ComputeBridge';

export type OpticsExperimentId =
  | 'propagation'
  | 'interference'
  | 'diffraction'
  | 'polarization';

export interface OpticsState {
  experimentId: OpticsExperimentId;
  wavelengthNm: number;
  laserOn: boolean;

  // Propagation
  refractionElement: 'block' | 'prism';
  refractiveIndex: number;
  incidentAngleDeg: number;
  isTotalInternalReflection: boolean;
  criticalAngleDeg: number | null;

  // Interference
  slitDistanceMm: number; // d
  slitWidthMm: number; // a
  screenDistanceM: number; // L
  fringeSpacingMm: number; // Delta x
  missingOrder: { isMissingOrder: boolean; ratio: number };

  // Diffraction
  diffractionType: 'single_slit' | 'circular_aperture' | 'grating';
  diffractionSlitWidthMm: number;
  gratingDensityLinesPerMm: number;

  // Polarization
  polarizerAngleDeg: number;
  analyzerAngleDeg: number;
  polarizationIntensity: number; // 0..1
}

export type OpticsStateListener = (state: OpticsState) => void;

/**
 * OpticsExperimentManager
 * Core coordinator between 3D apparatus on HoloTable, mathematical physics solver,
 * multi-modal light rendering, and floating UI controls.
 */
export class OpticsExperimentManager {
  public readonly group = new THREE.Group();

  public bench: OpticalBenchMesh;
  public generator: FringeTextureGenerator;
  public visualizer: LightVisualizer;

  // Apparatus
  public laser: LaserEmitterMesh;
  public screen: ScreenMesh;
  public slitHolder: SlitHolderMesh;
  public polarizer1: PolarizerDiskMesh;
  public analyzer2: PolarizerDiskMesh;
  public prismStage: PrismStageMesh;

  // Carriers
  private carrierLaser: CarrierMount;
  private carrierMiddle1: CarrierMount;
  private carrierMiddle2: CarrierMount;
  private carrierScreen: CarrierMount;

  // State
  public state: OpticsState = {
    experimentId: 'interference',
    wavelengthNm: 632.8,
    laserOn: true,

    refractionElement: 'block',
    refractiveIndex: 1.52,
    incidentAngleDeg: 30,
    isTotalInternalReflection: false,
    criticalAngleDeg: 41.81,

    slitDistanceMm: 0.25,
    slitWidthMm: 0.04,
    screenDistanceM: 0.8,
    fringeSpacingMm: 2.02,
    missingOrder: { isMissingOrder: false, ratio: 6 },

    diffractionType: 'single_slit',
    diffractionSlitWidthMm: 0.08,
    gratingDensityLinesPerMm: 300,

    polarizerAngleDeg: 0,
    analyzerAngleDeg: 0,
    polarizationIntensity: 1.0,
  };

  private listeners = new Set<OpticsStateListener>();
  private timeSec = 0;

  constructor(private computeBridge?: ComputeBridge | null) {
    this.group.name = 'optics-experiment-system';
    this.initSystem();
  }

  private initSystem(): void {
    this.generator = new FringeTextureGenerator(this.computeBridge);
    this.visualizer = new LightVisualizer();
    this.bench = new OpticalBenchMesh();

    this.group.add(this.bench.group);
    this.group.add(this.visualizer.group);

    // Create 3D components
    this.laser = new LaserEmitterMesh();
    this.screen = new ScreenMesh(this.generator);
    this.slitHolder = new SlitHolderMesh();
    this.polarizer1 = new PolarizerDiskMesh(false);
    this.analyzer2 = new PolarizerDiskMesh(true);
    this.prismStage = new PrismStageMesh();

    // Create sliding carriers on the rail
    // Laser fixed near left end (-0.45m)
    this.carrierLaser = this.bench.createCarrier('laser', '激光管', -0.45, -0.48, -0.35);
    this.carrierLaser.group.add(this.laser.group);

    // Middle carrier 1 (for slit / polarizer 1 / prism)
    this.carrierMiddle1 = this.bench.createCarrier('mid1', '光学元件座 1', -0.15, -0.30, 0.10);

    // Middle carrier 2 (for analyzer 2)
    this.carrierMiddle2 = this.bench.createCarrier('mid2', '光学元件座 2', 0.10, -0.05, 0.30);

    // Screen carrier (near right end, movable from +0.05m to +0.48m)
    this.carrierScreen = this.bench.createCarrier('screen', '观察光屏', 0.40, 0.05, 0.48);
    this.carrierScreen.group.add(this.screen.group);

    // Load initial experiment
    this.setExperiment('interference');
  }

  public subscribe(fn: OpticsStateListener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }

  /**
   * Switch between the 4 classic optics teaching setups.
   */
  public setExperiment(id: OpticsExperimentId): void {
    this.state.experimentId = id;

    // Clear middle carriers
    this.carrierMiddle1.group.remove(this.slitHolder.group);
    this.carrierMiddle1.group.remove(this.prismStage.group);
    this.carrierMiddle1.group.remove(this.polarizer1.group);
    this.carrierMiddle2.group.remove(this.analyzer2.group);

    this.carrierMiddle1.group.visible = true;
    this.carrierMiddle2.group.visible = false;
    this.carrierScreen.group.visible = true;

    if (id === 'propagation') {
      this.carrierMiddle1.group.add(this.prismStage.group);
      this.bench.setCarrierPosition('mid1', 0.0);
      this.bench.setCarrierPosition('screen', 0.42);
      this.prismStage.setMode(this.state.refractionElement);
      this.updateRefractionPhysics();
    } else if (id === 'interference') {
      this.carrierMiddle1.group.add(this.slitHolder.group);
      this.slitHolder.updateLabel(`DOUBLE SLIT\nd=${this.state.slitDistanceMm}mm`);
      this.bench.setCarrierPosition('mid1', -0.15);
      this.bench.setCarrierPosition('screen', 0.40);
      this.updateInterferencePhysics();
    } else if (id === 'diffraction') {
      this.carrierMiddle1.group.add(this.slitHolder.group);
      this.updateDiffractionLabel();
      this.bench.setCarrierPosition('mid1', -0.15);
      this.bench.setCarrierPosition('screen', 0.40);
      this.updateDiffractionPhysics();
    } else if (id === 'polarization') {
      this.carrierMiddle1.group.add(this.polarizer1.group);
      this.carrierMiddle2.group.add(this.analyzer2.group);
      this.carrierMiddle2.group.visible = true;

      this.bench.setCarrierPosition('mid1', -0.18);
      this.bench.setCarrierPosition('mid2', 0.12);
      this.bench.setCarrierPosition('screen', 0.42);

      this.polarizer1.setAngleDeg(this.state.polarizerAngleDeg);
      this.analyzer2.setAngleDeg(this.state.analyzerAngleDeg);
      this.updatePolarizationPhysics();
    }

    this.renderCurrentState();
    this.notify();
  }

  // Parameter Setters
  public setWavelength(wlNm: number): void {
    this.state.wavelengthNm = Math.max(380, Math.min(780, wlNm));
    this.laser.updateWavelength(this.state.wavelengthNm, this.state.laserOn);
    this.recomputeActiveExperiment();
  }

  public setLaserPower(isOn: boolean): void {
    this.state.laserOn = isOn;
    this.laser.updateWavelength(this.state.wavelengthNm, isOn);
    this.renderCurrentState();
    this.notify();
  }

  public toggleLaserPower(): void {
    this.setLaserPower(!this.state.laserOn);
  }

  // --- 1. Propagation Controls ---
  public setRefractionElement(element: 'block' | 'prism'): void {
    this.state.refractionElement = element;
    this.prismStage.setMode(element);
    this.updateRefractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setRefractiveIndex(n: number): void {
    this.state.refractiveIndex = Math.max(1.0, Math.min(2.5, n));
    this.updateRefractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setIncidentAngleDeg(deg: number): void {
    this.state.incidentAngleDeg = Math.max(0, Math.min(85, deg));
    this.prismStage.setRotationAngleRad((deg * Math.PI) / 180);
    this.updateRefractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  // --- 2. Interference Controls ---
  public setSlitDistanceMm(dMm: number): void {
    this.state.slitDistanceMm = Math.max(0.08, Math.min(1.0, dMm));
    this.updateInterferencePhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setSlitWidthMm(aMm: number): void {
    this.state.slitWidthMm = Math.max(0.01, Math.min(0.2, aMm));
    this.updateInterferencePhysics();
    this.renderCurrentState();
    this.notify();
  }

  // --- 3. Diffraction Controls ---
  public setDiffractionType(type: 'single_slit' | 'circular_aperture' | 'grating'): void {
    this.state.diffractionType = type;
    this.updateDiffractionLabel();
    this.updateDiffractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setDiffractionSlitWidthMm(aMm: number): void {
    this.state.diffractionSlitWidthMm = Math.max(0.02, Math.min(0.4, aMm));
    this.updateDiffractionLabel();
    this.updateDiffractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setGratingDensity(linesPerMm: number): void {
    this.state.gratingDensityLinesPerMm = linesPerMm;
    this.updateDiffractionLabel();
    this.updateDiffractionPhysics();
    this.renderCurrentState();
    this.notify();
  }

  private updateDiffractionLabel(): void {
    if (this.state.diffractionType === 'single_slit') {
      this.slitHolder.updateLabel(`SINGLE SLIT\na=${this.state.diffractionSlitWidthMm}mm`);
    } else if (this.state.diffractionType === 'circular_aperture') {
      this.slitHolder.updateLabel(`AIRY PINHOLE\nD=${this.state.diffractionSlitWidthMm}mm`);
    } else {
      this.slitHolder.updateLabel(`GRATING\n${this.state.gratingDensityLinesPerMm} l/mm`);
    }
  }

  // --- 4. Polarization Controls ---
  public setPolarizerAngleDeg(deg: number): void {
    this.state.polarizerAngleDeg = (deg % 360 + 360) % 360;
    this.polarizer1.setAngleDeg(this.state.polarizerAngleDeg);
    this.updatePolarizationPhysics();
    this.renderCurrentState();
    this.notify();
  }

  public setAnalyzerAngleDeg(deg: number): void {
    this.state.analyzerAngleDeg = (deg % 360 + 360) % 360;
    this.analyzer2.setAngleDeg(this.state.analyzerAngleDeg);
    this.updatePolarizationPhysics();
    this.renderCurrentState();
    this.notify();
  }

  // --- Golden Teaching Presets ---
  public resetToGoldenPreset(): void {
    const id = this.state.experimentId;
    this.state.laserOn = true;
    this.laser.updateWavelength(this.state.wavelengthNm, true);

    if (id === 'propagation') {
      this.state.wavelengthNm = 632.8;
      this.state.refractionElement = 'block';
      this.state.refractiveIndex = 1.52;
      this.state.incidentAngleDeg = 30;
      this.prismStage.setMode('block');
      this.prismStage.setRotationAngleRad((30 * Math.PI) / 180);
      this.bench.setCarrierPosition('mid1', 0.0);
      this.bench.setCarrierPosition('screen', 0.42);
      this.updateRefractionPhysics();
    } else if (id === 'interference') {
      this.state.wavelengthNm = 632.8;
      this.state.slitDistanceMm = 0.25;
      this.state.slitWidthMm = 0.04;
      this.bench.setCarrierPosition('mid1', -0.15);
      this.bench.setCarrierPosition('screen', 0.40);
      this.updateInterferencePhysics();
    } else if (id === 'diffraction') {
      this.state.wavelengthNm = 632.8;
      this.state.diffractionType = 'single_slit';
      this.state.diffractionSlitWidthMm = 0.08;
      this.bench.setCarrierPosition('mid1', -0.15);
      this.bench.setCarrierPosition('screen', 0.40);
      this.updateDiffractionLabel();
      this.updateDiffractionPhysics();
    } else if (id === 'polarization') {
      this.state.wavelengthNm = 632.8;
      this.state.polarizerAngleDeg = 0;
      this.state.analyzerAngleDeg = 0;
      this.polarizer1.setAngleDeg(0);
      this.analyzer2.setAngleDeg(0);
      this.bench.setCarrierPosition('mid1', -0.18);
      this.bench.setCarrierPosition('mid2', 0.12);
      this.bench.setCarrierPosition('screen', 0.42);
      this.updatePolarizationPhysics();
    }

    this.renderCurrentState();
    this.notify();
  }

  // --- Physics Updates ---
  private updateRefractionPhysics(): void {
    const theta1Rad = (this.state.incidentAngleDeg * Math.PI) / 180;
    const n1 = 1.0;
    const n2 = this.state.refractiveIndex;

    const res = OpticsMath.calculateRefractionAngle(theta1Rad, n1, n2);
    this.state.isTotalInternalReflection = res.isTotalInternalReflection;
    this.state.criticalAngleDeg = res.criticalAngleRad ? (res.criticalAngleRad * 180) / Math.PI : null;
  }

  private updateInterferencePhysics(): void {
    const lambdaM = this.state.wavelengthNm * 1e-9;
    const dM = this.state.slitDistanceMm * 1e-3;
    const aM = this.state.slitWidthMm * 1e-3;

    // Physical distance on rail
    const L = Math.max(0.1, this.carrierScreen.currentX - this.carrierMiddle1.currentX);
    this.state.screenDistanceM = L;

    const deltaXM = OpticsMath.doubleSlitFringeSpacing(lambdaM, dM, L);
    this.state.fringeSpacingMm = deltaXM * 1e3;
    this.state.missingOrder = OpticsMath.checkMissingOrder(dM, aM);
  }

  private updateDiffractionPhysics(): void {
    const L = Math.max(0.1, this.carrierScreen.currentX - this.carrierMiddle1.currentX);
    this.state.screenDistanceM = L;
  }

  private updatePolarizationPhysics(): void {
    const rad1 = (this.state.polarizerAngleDeg * Math.PI) / 180;
    const rad2 = (this.state.analyzerAngleDeg * Math.PI) / 180;
    const theta = Math.abs(rad1 - rad2);
    this.state.polarizationIntensity = OpticsMath.malusIntensity(theta, 1.0);
  }

  private recomputeActiveExperiment(): void {
    const id = this.state.experimentId;
    if (id === 'propagation') this.updateRefractionPhysics();
    else if (id === 'interference') this.updateInterferencePhysics();
    else if (id === 'diffraction') this.updateDiffractionPhysics();
    else if (id === 'polarization') this.updatePolarizationPhysics();

    this.renderCurrentState();
    this.notify();
  }

  // --- Rendering to Screen & 3D Beams ---
  public renderCurrentState(): void {
    const { experimentId, wavelengthNm, laserOn } = this.state;
    const col = OpticsMath.wavelengthToRGB(wavelengthNm);
    const colorHex = col.hex;

    const laserWorld = new THREE.Vector3();
    this.laser.group.getWorldPosition(laserWorld);
    laserWorld.y += 0.06;
    laserWorld.x += 0.042; // aperture

    const screenWorld = new THREE.Vector3();
    this.screen.screenFaceMesh.getWorldPosition(screenWorld);

    if (!laserOn) {
      this.visualizer.hideBeamsFrom(0);
      this.visualizer.setWavefrontVisible(false);
      this.visualizer.setEFieldVisible(false);
      this.generator.render({
        type: 'polarization_spot',
        wavelengthNm,
        intensity: 0.0,
      });
      return;
    }

    if (experimentId === 'propagation') {
      this.visualizer.setWavefrontVisible(false);
      this.visualizer.setEFieldVisible(false);

      const stagePos = new THREE.Vector3();
      this.prismStage.group.getWorldPosition(stagePos);
      stagePos.y += 0.06;

      // Beam 1: Laser to stage
      this.visualizer.updateBeam(0, laserWorld, stagePos, 0.0025, colorHex);

      // Beam 2: Stage to screen
      this.visualizer.updateBeam(1, stagePos, screenWorld, 0.0025, colorHex);
      this.visualizer.hideBeamsFrom(2);

      this.generator.render({
        type: this.state.refractionElement === 'prism' ? 'dispersion_spectrum' : 'polarization_spot',
        wavelengthNm,
        intensity: 0.95,
      });
    } else if (experimentId === 'interference') {
      this.visualizer.setEFieldVisible(false);

      const slitPos = new THREE.Vector3();
      this.slitHolder.group.getWorldPosition(slitPos);
      slitPos.y += 0.06;

      // Beam: Laser to Slit
      this.visualizer.updateBeam(0, laserWorld, slitPos, 0.0025, colorHex);
      // Diffuse cone to screen
      this.visualizer.updateBeam(1, slitPos, screenWorld, 0.0035, colorHex);
      this.visualizer.hideBeamsFrom(2);

      // Phase ripples
      this.visualizer.updateWavefrontRipples(slitPos, screenWorld.x, colorHex, this.timeSec, true);

      // Screen fringes
      this.generator.render({
        type: 'double_slit',
        wavelengthNm,
        slitDistanceMm: this.state.slitDistanceMm,
        slitWidthMm: this.state.slitWidthMm,
        screenDistanceM: this.state.screenDistanceM,
        intensity: 1.0,
      });
    } else if (experimentId === 'diffraction') {
      this.visualizer.setEFieldVisible(false);

      const slitPos = new THREE.Vector3();
      this.slitHolder.group.getWorldPosition(slitPos);
      slitPos.y += 0.06;

      this.visualizer.updateBeam(0, laserWorld, slitPos, 0.0025, colorHex);
      this.visualizer.updateBeam(1, slitPos, screenWorld, 0.0035, colorHex);
      this.visualizer.hideBeamsFrom(2);

      this.visualizer.updateWavefrontRipples(slitPos, screenWorld.x, colorHex, this.timeSec, true);

      let patternType: FringePatternType = 'single_slit';
      if (this.state.diffractionType === 'circular_aperture') patternType = 'circular_aperture';
      else if (this.state.diffractionType === 'grating') patternType = 'grating';

      this.generator.render({
        type: patternType,
        wavelengthNm,
        slitWidthMm: this.state.diffractionSlitWidthMm,
        gratingDensityLinesPerMm: this.state.gratingDensityLinesPerMm,
        screenDistanceM: this.state.screenDistanceM,
        intensity: 1.0,
      });
    } else if (experimentId === 'polarization') {
      this.visualizer.setWavefrontVisible(false);

      const p1Pos = new THREE.Vector3();
      this.polarizer1.group.getWorldPosition(p1Pos);
      p1Pos.y += 0.06;

      const p2Pos = new THREE.Vector3();
      this.analyzer2.group.getWorldPosition(p2Pos);
      p2Pos.y += 0.06;

      // Beam 1: Laser -> Polarizer 1 (unpolarized)
      this.visualizer.updateBeam(0, laserWorld, p1Pos, 0.0025, colorHex);
      // Beam 2: Polarizer 1 -> Analyzer 2 (linearly polarized)
      this.visualizer.updateBeam(1, p1Pos, p2Pos, 0.0025, colorHex);
      // Beam 3: Analyzer 2 -> Screen (attenuated by Malus law)
      const outRadius = Math.max(0.0005, 0.0025 * Math.sqrt(this.state.polarizationIntensity));
      this.visualizer.updateBeam(2, p2Pos, screenWorld, outRadius, colorHex);
      this.visualizer.hideBeamsFrom(3);

      // 3D E-field sinusoidal ribbon
      this.visualizer.updatePolarizationEField(
        laserWorld,
        p1Pos,
        p2Pos,
        screenWorld,
        (this.state.polarizerAngleDeg * Math.PI) / 180,
        (this.state.analyzerAngleDeg * Math.PI) / 180,
        colorHex,
        this.timeSec
      );

      this.generator.render({
        type: 'polarization_spot',
        wavelengthNm,
        polarizerAngleDeg: this.state.polarizerAngleDeg,
        analyzerAngleDeg: this.state.analyzerAngleDeg,
        intensity: this.state.polarizationIntensity,
      });
    }
  }

  /**
   * Per-frame animation tick
   */
  public update(delta: number): void {
    this.timeSec += delta;
    if (this.state.laserOn && (this.state.experimentId === 'interference' || this.state.experimentId === 'diffraction' || this.state.experimentId === 'polarization')) {
      this.renderCurrentState();
    }
  }

  public setCarrierFromRaycast(carrierId: string, targetX: number): void {
    this.bench.setCarrierPosition(carrierId, targetX);
    this.recomputeActiveExperiment();
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    this.bench.dispose();
    this.generator.dispose();
    this.visualizer.dispose();
    this.slitHolder.dispose();
    this.polarizer1.dispose();
    this.analyzer2.dispose();
  }
}
