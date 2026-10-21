import assert from 'node:assert';
import * as THREE from 'three';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import { OpticalPolarizationApparatusMesh } from '../src/scene/optics/OpticalPolarizationApparatusMesh.ts';
import { OpticalPolarizationInteractionManager } from '../src/scene/optics/OpticalPolarizationInteractionManager.ts';
import OpticsPolarizationExperiment from '../src/experiments/catalog/optics-polarization/index.ts';
import { metadata } from '../src/experiments/catalog/optics-polarization/meta.ts';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

// Minimal DOM mock for Node.js test environment
const createMockElement = (tag = 'div'): any => {
  let context2d: any = null;
  const el: any = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    attributes: {} as Record<string, string>,
    children: [] as any[],
    style: {},
    setAttribute: (k: string, v: string) => { el.attributes[k] = v; },
    getAttribute: (k: string) => el.attributes[k] ?? null,
    appendChild: (child: any) => { el.children.push(child); return child; },
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: (type: string) => {
      if (type === '2d') {
        if (!context2d) {
          context2d = {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: '',
            textBaseline: '',
            shadowColor: '',
            shadowBlur: 0,
            save: () => {},
            restore: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            clearRect: () => {},
            fillText: () => {},
            strokeText: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            arc: () => {},
            setLineDash: () => {},
            createImageData: (w: number, h: number) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(w * h * 4),
            }),
            putImageData: () => {},
            createLinearGradient: () => ({
              addColorStop: () => {},
            }),
          };
        }
        return context2d;
      }
      return null;
    },
  };
  return el;
};

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
  };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {
    public clientX = 0;
    public clientY = 0;
    public movementX = 0;
    public movementY = 0;
    constructor(type: string, init?: any) {
      super(type);
      if (init) {
        if (init.clientX !== undefined) this.clientX = init.clientX;
        if (init.clientY !== undefined) this.clientY = init.clientY;
        if (init.movementX !== undefined) this.movementX = init.movementX;
        if (init.movementY !== undefined) this.movementY = init.movementY;
      }
    }
  };
}

console.log('=== Starting Light Polarization, Jones 3D Helical Waves, Calcite Birefringence & Photoelastic Stress Tests ===\n');

// -------------------------------------------------------------
// Test 1: Analytical Malus's Law (I = I0 cos^2(Δθ)) & Extinction / Maximum Invariants
// -------------------------------------------------------------
{
  console.log("Test 1: Analytical Malus's Law & Orthogonal Extinction");
  const i0 = OpticalPhysics.calculateMalusLawIntensity(15.0, 15.0, 1.0);
  const i30 = OpticalPhysics.calculateMalusLawIntensity(15.0, 45.0, 1.0);
  const i45 = OpticalPhysics.calculateMalusLawIntensity(15.0, 60.0, 1.0);
  const i60 = OpticalPhysics.calculateMalusLawIntensity(15.0, 75.0, 1.0);
  const i90 = OpticalPhysics.calculateMalusLawIntensity(15.0, 105.0, 1.0);

  assert(Math.abs(i0 - 1.0) < 1e-6, `At Δθ=0°, transmitted intensity must be 1.0, got ${i0}`);
  assert(Math.abs(i30 - 0.75) < 1e-6, `At Δθ=30°, transmitted intensity must be cos²(30°)=0.75, got ${i30}`);
  assert(Math.abs(i45 - 0.50) < 1e-6, `At Δθ=45°, transmitted intensity must be cos²(45°)=0.50, got ${i45}`);
  assert(Math.abs(i60 - 0.25) < 1e-6, `At Δθ=60°, transmitted intensity must be cos²(60°)=0.25, got ${i60}`);
  assert(Math.abs(i90 - 0.0) < 1e-6, `At Δθ=90°, orthogonal crossed polarizers must yield complete extinction 0.0, got ${i90}`);

  const freeState90 = OpticalPhysics.analyzePolarizationState(0.0, 90.0, 'malus_free');
  assert.strictEqual(freeState90.isExtinction, true, 'must flag isExtinction at Δθ=90°');
  assert.strictEqual(freeState90.polarizationState, 'linear');

  console.log('✓ Test 1 passed: Malus Law cos²(Δθ) and crossed extinction validated\n');
}

// -------------------------------------------------------------
// Test 2: Quarter-Wave Plate (λ/4) 3D Circular Polarization & Isotropic Analyzer Transmission
// -------------------------------------------------------------
{
  console.log('Test 2: Quarter-Wave Plate (λ/4) Circular Polarization & Half-Wave Plate (λ/2) Optical Rotation');
  // When Polarizer θ_P = 0° and λ/4 fast axis θ_WP = 45°:
  // Output is Circularly Polarized Light (ellipticity b/a = 1.0), and rotating Analyzer P2 through ANY angle yields constant I = 0.5!
  for (const analyzerDeg of [0, 22.5, 45, 67.5, 90, 135, 180]) {
    const qwpState = OpticalPhysics.analyzePolarizationState(
      0.0,
      analyzerDeg,
      'quarter_waveplate',
      45.0
    );
    assert(
      Math.abs(qwpState.ellipticityRatio - 1.0) < 1e-4,
      `At 45° fast axis, λ/4 waveplate must produce circular polarization (e=1.0), got ${qwpState.ellipticityRatio}`
    );
    assert(
      qwpState.polarizationState === 'circular_right' || qwpState.polarizationState === 'circular_left',
      `Must classify as circular polarization, got ${qwpState.polarizationState}`
    );
    assert(
      Math.abs(qwpState.transmittedIntensity - 0.5) < 1e-4,
      `Circularly polarized light must transmit constant 0.5 intensity at θ_A=${analyzerDeg}°, got ${qwpState.transmittedIntensity}`
    );
  }

  // Half-Wave Plate (λ/2) rotates linear polarization plane from θ_P to 2*θ_WP - θ_P:
  // If θ_P = 0° and θ_WP = 30°, output linear polarization is at 60°, so extinction is at θ_A = 60° + 90° = 150°!
  const hwpMax = OpticalPhysics.analyzePolarizationState(0.0, 60.0, 'half_waveplate', 30.0);
  const hwpExt = OpticalPhysics.analyzePolarizationState(0.0, 150.0, 'half_waveplate', 30.0);
  assert(Math.abs(hwpMax.ellipticityRatio) < 1e-4, 'λ/2 waveplate output must remain linearly polarized (e=0)');
  assert(Math.abs(hwpMax.transmittedIntensity - 1.0) < 1e-4, 'λ/2 rotated plane at 60° must have maximum transmission at θ_A=60°');
  assert(Math.abs(hwpExt.transmittedIntensity - 0.0) < 1e-4, 'λ/2 rotated plane at 60° must extinguish at θ_A=150°');

  console.log('✓ Test 2 passed: λ/4 circular polarization isotropy & λ/2 polarization plane rotation validated\n');
}

// -------------------------------------------------------------
// Test 3: Iceland Spar Calcite Birefringence (o-Ray & e-Ray Complementary Splitting) & Brewster's Law
// -------------------------------------------------------------
{
  console.log("Test 3: Iceland Spar Calcite Birefringence (o-Ray ⊥ e-Ray) & Brewster's Angle Law");
  // With θ_P = 0° and crystal axis θ_WP = 45°, incident beam splits 50/50 into o-ray and e-ray
  // At θ_A = 45° (aligned with e-ray), e-ray is 0.5 and o-ray is extinguished (0.0);
  // At θ_A = 135° (aligned with o-ray), o-ray is 0.5 and e-ray is extinguished (0.0)!
  const calcAt45 = OpticalPhysics.analyzePolarizationState(0.0, 45.0, 'calcite_birefringence', 45.0);
  const calcAt135 = OpticalPhysics.analyzePolarizationState(0.0, 135.0, 'calcite_birefringence', 45.0);

  assert(Math.abs(calcAt45.calciteERayTransmitted - 0.5) < 1e-5, 'At θ_A=45°, e-ray transmits 0.5');
  assert(Math.abs(calcAt45.calciteORayTransmitted - 0.0) < 1e-5, 'At θ_A=45°, o-ray is completely extinguished');
  assert(Math.abs(calcAt135.calciteORayTransmitted - 0.5) < 1e-5, 'At θ_A=135°, o-ray transmits 0.5');
  assert(Math.abs(calcAt135.calciteERayTransmitted - 0.0) < 1e-5, 'At θ_A=135°, e-ray is completely extinguished');

  // Brewster's Angle for BK7 glass (n = 1.5168): θ_B = arctan(1.5168) ≈ 56.60°
  const brewsterAngle = THREE.MathUtils.radToDeg(Math.atan(1.5168));
  const brewsterRes = OpticalPhysics.calculateBrewsterReflection(brewsterAngle, 1.5168);
  assert(brewsterRes.reflectanceP < 1e-7, `At Brewster angle, p-wave reflectance R_p must be 0, got ${brewsterRes.reflectanceP}`);
  assert(brewsterRes.reflectanceS > 0.14, `At Brewster angle, s-wave reflectance R_s must be ~15%, got ${brewsterRes.reflectanceS}`);
  assert(Math.abs(brewsterRes.degreeOfPolarization - 1.0) < 1e-6, 'Reflected light at Brewster angle must be 100% s-polarized');

  console.log(`  BK7 Brewster Angle θ_B = ${brewsterRes.brewsterAngleDeg.toFixed(2)}°, R_s = ${(brewsterRes.reflectanceS * 100).toFixed(1)}%, R_p = 0%`);
  console.log("✓ Test 3 passed: Calcite double refraction & Brewster's angle complete s-polarization validated\n");
}

// -------------------------------------------------------------
// Test 4: 3D OpticalPolarizationApparatusMesh Craftsmanship & Bespoke Assemblies
// -------------------------------------------------------------
{
  console.log('Test 4: 3D OpticalPolarizationApparatusMesh Craftsmanship & Bespoke Assemblies');
  const apparatus = new OpticalPolarizationApparatusMesh();

  assert.ok(apparatus.group, 'Root apparatus group must exist');
  assert.ok(apparatus.railGroup, 'Ellipsometer monoblock bed & rail group must exist');
  assert.ok(apparatus.emitterGroup, 'Unpolarized light emitter assembly must exist');
  assert.ok(apparatus.brewsterGroup && apparatus.brewsterGlassMesh, 'Brewster angle dielectric glass stack assembly must exist');
  assert.ok(apparatus.polarizerStageGroup && apparatus.polarizerRotorGroup, '360° hollow-spindle polarizer P1 assembly must exist');
  assert.ok(apparatus.sampleStageGroup && apparatus.sampleTurretWheel, '5-station central sample turret stage must exist');
  assert.ok(apparatus.waveplateMountGroup && apparatus.waveplateCrystalMesh, 'Rotatable quartz waveplate mount must exist');
  assert.ok(apparatus.calciteCrystalGroup && apparatus.calciteCrystalMesh, 'Beveled rhombohedral Iceland spar calcite crystal must exist');
  assert.ok(apparatus.photoelasticFrameGroup && apparatus.stressSpecimenMesh && apparatus.stressLoadScrewKnob, 'Photoelastic compression load frame & arch specimen must exist');
  assert.ok(apparatus.analyzerStageGroup && apparatus.analyzerRotorGroup, '360° hollow-spindle analyzer P2 assembly must exist');
  assert.ok(apparatus.screenCarrierGroup && apparatus.screenMesh, 'Panoramic sapphire observation screen must exist');
  assert.ok(apparatus.photodiodeGroup && apparatus.photodiodeBarMeshes.length === 12, 'Integrating sphere photodiode sensor with 12 LED bar segments must exist');

  // Verify 4-zone 3D volumetric electromagnetic wave & helical wave groups
  assert.strictEqual(apparatus.unpolarizedRibbons.length, 6, 'Zone 1 must render 6 multi-azimuthal unpolarized starburst wave ribbons');
  assert.ok(apparatus.polarizedRibbonMesh && apparatus.polarizedVectorsMesh, 'Zone 2 must render linearly polarized 3D wave ribbon & E-vector comb');
  assert.ok(apparatus.modulatedRibbonMesh && apparatus.polarizationStateLocusLine, 'Zone 3 must render 3D helical/linear wave ribbon & polarization ellipse locus ring');
  assert.ok(apparatus.calciteOWaveRibbonMesh && apparatus.calciteEWaveRibbonMesh, 'Zone 3 must include spatially separated o-ray and e-ray wave ribbons');
  assert.ok(apparatus.transmittedRibbonMesh && apparatus.rejectedOrthogonalBeamMesh, 'Zone 4 must render post-analyzer transmitted wave & rejected orthogonal beam');

  // Verify mechanical detail on micrometers, turret, wide non-clipping label canvas, and Brewster arm retraction
  assert(apparatus.polarizerMicrometerKnob.children.length >= 18, 'Polarizer micrometer thumbwheel must have 18 knurled ridges & collar');
  assert(apparatus.sampleTurretWheel.children.length >= 17, 'Sample turret wheel must have 16 fluted brass grooves & chrome cap');
  assert.strictEqual(apparatus.valueLabelCanvas.width, 2048, 'Value label canvas must be 2048px wide to prevent left/right text clipping');
  assert.strictEqual(apparatus.brewsterPivotArm.visible, false, 'Brewster C-arm & glass plate must be cleanly hidden when retracted');

  apparatus.dispose();
  console.log('✓ Test 4 passed: Bespoke 3D polarization, birefringence & photoelastic apparatus verified\n');
}

// -------------------------------------------------------------
// Test 5: 3D Direct Manipulation, Turret Indexing, Quick Extinction Presets & Hover Halo Lifecycle
// -------------------------------------------------------------
{
  console.log('Test 5: 3D Direct Manipulation, Turret Indexing, Extinction Presets & Hover Halo Lifecycle');
  const apparatus = new OpticalPolarizationApparatusMesh();
  const rootGroup = new THREE.Group();
  rootGroup.add(apparatus.group);
  rootGroup.updateMatrixWorld(true);

  let modeChanged: string | null = null;
  let brewsterToggled: boolean | null = null;

  const mgr = new OpticalPolarizationInteractionManager(apparatus, rootGroup, {
    onSampleModeChange: (m) => { modeChanged = m; },
    onBrewsterToggle: (en) => { brewsterToggled = en; },
  });

  // 1. Pre-contact hover over analyzer micrometer shows 3D hover halo cue
  const raycaster = new THREE.Raycaster();
  const knobWorldPos = new THREE.Vector3();
  apparatus.analyzerMicrometerKnob.getWorldPosition(knobWorldPos);
  raycaster.ray.origin.set(knobWorldPos.x, knobWorldPos.y, knobWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const preHover = mgr.getHoverTarget(raycaster);
  assert.ok(preHover && preHover.label.length > 0, 'Pre-contact hover prompt must be non-empty');
  assert.strictEqual(apparatus.analyzerHoverCue.visible, true, '3D hover halo must be visible before first contact');

  // 2. Drag analyzer micrometer knob -> halo permanently disappears
  const hitKnob = { object: apparatus.analyzerMicrometerKnob, point: knobWorldPos } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown', { clientX: 500, clientY: 500 }), hitKnob);
  assert.strictEqual(apparatus.analyzerHoverCue.visible, false, '3D hover halo must vanish upon interaction');
  mgr.onPointerMove(new PointerEvent('pointermove', { clientX: 560, clientY: 500 }), raycaster);
  mgr.onPointerUp(new PointerEvent('pointerup'));

  const postHover = mgr.getHoverTarget(raycaster);
  assert.strictEqual(postHover?.label, '', 'Hover prompt must remain empty after interaction');

  // 3. Click 90° Crossed Extinction hardware button on Analyzer P2 -> immediate extinction!
  const hitCrossed = { object: apparatus.presetCrossedBtnMesh, point: apparatus.presetCrossedBtnMesh.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitCrossed);
  assert.strictEqual(apparatus.getTelemetry().isExtinction, true, 'Clicking 90° crossed button must set orthogonal extinction');

  // 4. Click 5-station sample turret wheel -> switches from malus_free to quarter_waveplate
  const hitTurret = { object: apparatus.sampleTurretWheel, point: apparatus.sampleTurretWheel.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitTurret);
  assert.strictEqual(modeChanged, 'quarter_waveplate', 'Turret cycled to quarter_waveplate');
  assert(
    Math.abs(apparatus.getTelemetry().transmittedIntensity - 0.5) < 1e-4,
    'Inserting λ/4 waveplate at 45° between crossed polarizers restores 50% circular polarization transmission!'
  );

  // 5. Click Brewster plate toggle knob -> swings Brewster plate into beam
  const hitBrewster = { object: apparatus.brewsterToggleKnob, point: apparatus.brewsterToggleKnob.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitBrewster);
  assert.strictEqual(brewsterToggled, true, 'Brewster plate swung into optical path');
  assert.strictEqual(apparatus.brewsterReflectedRibbonMesh.visible, true, 'Reflected s-polarized wave ribbon must be visible');

  apparatus.dispose();
  console.log('✓ Test 5 passed: 3D direct manipulation, turret cycling, extinction presets & Brewster arm verified\n');
}

// -------------------------------------------------------------
// Test 6: Full Experiment Lifecycle, Minimalist Invariants & 60+ FPS Benchmark
// -------------------------------------------------------------
{
  console.log('Test 6: Full Experiment Lifecycle, Minimalist Invariants & 60+ FPS Benchmark');
  const exp = new OpticsPolarizationExperiment();
  const mockContext = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100),
    setParameter: (k: string, v: any) => {
      exp.onParameterChange(k, v, mockContext);
    },
  } as any;

  exp.init(mockContext);
  const apparatus = exp.getApparatus();
  assert.ok(apparatus, 'Apparatus must be initialized');

  // 1. Strict Zero Floating Popups & Banners Invariant
  assert.strictEqual(exp.rootGroup.children.length, 1, 'Only native 3D apparatus is added to rootGroup');
  assert.strictEqual((exp as any).statusCard, undefined, 'No DOM status cards permitted');
  assert.strictEqual((exp as any).guidanceBanner, undefined, 'No DOM guidance banners permitted');

  // 2. Minimalist Observation Screen Invariant (Zero text / numbers drawn on screen canvas across all 5 modes)
  let screenTextCalls = 0;
  const screenCtx = (apparatus as any).screenCanvas.getContext('2d');
  screenCtx.fillText = () => { screenTextCalls++; };
  screenCtx.strokeText = () => { screenTextCalls++; };

  for (const mode of OpticalPolarizationApparatusMesh.SAMPLE_MODES) {
    exp.onParameterChange('sampleMode', mode, mockContext);
  }
  assert.strictEqual(screenTextCalls, 0, 'Observation screen must render pure optical patterns & curves with zero text');

  // 3. Pure Large Deep-Colored Value Text Invariant (Zero background rect / border rect)
  let labelRectCalls = 0;
  let lastLabelText = '';
  const labelCtx = (apparatus as any).valueLabelCanvas.getContext('2d');
  labelCtx.fillRect = () => { labelRectCalls++; };
  labelCtx.strokeRect = () => { labelRectCalls++; };
  labelCtx.fillText = (txt: string) => { lastLabelText = txt; };

  exp.onParameterChange('sampleMode', 'calcite_birefringence', mockContext);
  assert.strictEqual(labelRectCalls, 0, '3D value label must NOT draw any background or border rect');
  assert.ok(lastLabelText.includes('冰洲石双折射'), `3D value label must reflect updated sample mode: ${lastLabelText}`);

  // 4. 60+ FPS Performance Benchmark (< 0.05ms per frame)
  exp.onParameterChange('sampleMode', 'quarter_waveplate', mockContext);
  const iterations = 1000;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }
  const avgStepMs = (performance.now() - t0) / iterations;
  console.log(`  Average 3D helical wave simulation step time: ${avgStepMs.toFixed(5)} ms`);
  assert(avgStepMs < 0.08, `Step time ${avgStepMs}ms must be ultra-fast for locked 60+ FPS`);

  // 5. Metadata & PhysicsDisciplineModal registration verification
  assert.strictEqual(metadata.id, 'optics-polarization');
  assert.strictEqual(metadata.name, '光的偏振');
  const modalEntry = PhysicsDisciplineModal.OPTICS_EXPERIMENTS.find((e) => e.id === 'optics-polarization');
  assert.ok(modalEntry, 'optics-polarization must be registered in PhysicsDisciplineModal.OPTICS_EXPERIMENTS');
  assert.strictEqual(modalEntry.name, '光的偏振');

  exp.dispose(mockContext);
  console.log('✓ Test 6 passed: Lifecycle, minimalist invariants, modal registration & 60+ FPS verified\n');
}

console.log('========================================================');
console.log('All Light Polarization & Birefringence Tests Passed (6/6)!');
console.log('========================================================\n');
