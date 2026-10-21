import assert from 'node:assert';
import * as THREE from 'three';
import {
  OpticalPhysics,
  PRISM_MATERIALS,
} from '../src/scene/optics/OpticalPhysics.ts';
import {
  OpticalDispersionApparatusMesh,
} from '../src/scene/optics/OpticalDispersionApparatusMesh.ts';
import { OpticalDispersionInteractionManager } from '../src/scene/optics/OpticalDispersionInteractionManager.ts';
import OpticsDispersionExperiment from '../src/experiments/catalog/optics-dispersion/index.ts';
import { metadata } from '../src/experiments/catalog/optics-dispersion/meta.ts';
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

console.log('=== Starting Light Dispersion & Newton Prism Recombination Analytical & 3D Tests ===\n');

// -------------------------------------------------------------
// Test 1: Analytical Cauchy Dispersion Equation & Wavelength Monotonicity
// -------------------------------------------------------------
{
  console.log('Test 1: Analytical Cauchy Dispersion Equation & Wavelength Monotonicity');
  const wavelengths = [700, 650, 589.3, 532, 486.1, 435.8, 400];

  for (const matKey of Object.keys(PRISM_MATERIALS) as (keyof typeof PRISM_MATERIALS)[]) {
    let prevN = 0;
    for (const wl of wavelengths) {
      const n = OpticalPhysics.getPrismRefractiveIndex(wl, matKey);
      assert(n > 1.4, `Refractive index for ${matKey} at ${wl}nm must exceed 1.4, got ${n}`);
      if (prevN > 0) {
        assert(
          n > prevN,
          `Normal dispersion violated for ${matKey}: n(${wl}nm)=${n} must exceed previous longer wavelength n=${prevN}`
        );
      }
      prevN = n;
    }
  }

  // Verify material index ordering at 587.6nm: Diamond > Flint > BariumFlint > Crown > Quartz
  const nDiamond = OpticalPhysics.getPrismRefractiveIndex(587.6, 'diamond');
  const nFlint = OpticalPhysics.getPrismRefractiveIndex(587.6, 'flint');
  const nBarium = OpticalPhysics.getPrismRefractiveIndex(587.6, 'bariumFlint');
  const nCrown = OpticalPhysics.getPrismRefractiveIndex(587.6, 'crown');
  const nQuartz = OpticalPhysics.getPrismRefractiveIndex(587.6, 'quartz');

  assert(
    nDiamond > nFlint && nFlint > nBarium && nBarium > nCrown && nCrown > nQuartz,
    'Material refractive index hierarchy must follow Diamond > Flint > BariumFlint > Crown > Quartz'
  );

  console.log(`  ZF7 Flint n(670nm)=${OpticalPhysics.getPrismRefractiveIndex(670, 'flint').toFixed(4)} -> n(405nm)=${OpticalPhysics.getPrismRefractiveIndex(405, 'flint').toFixed(4)}`);
  console.log('✓ Test 1 passed: Cauchy dispersion law & wavelength monotonicity validated\n');
}

// -------------------------------------------------------------
// Test 2: Analytical Prism Double Refraction & Minimum Deviation Law
// -------------------------------------------------------------
{
  console.log('Test 2: Analytical Prism Double Refraction & Minimum Deviation Law');
  const alphaDeg = 60.0;
  const wlNm = 587.6;
  const traceRef = OpticalPhysics.tracePrismRay(wlNm, 50.0, alphaDeg, 'crown');
  const n = traceRef.refractiveIndex;

  // At minimum deviation incident angle theta_1,min = arcsin(n * sin(alpha/2)):
  // theta_2 must equal theta_3 = alpha / 2 = 30°, and theta_4 must equal theta_1,min!
  const minIncDeg = traceRef.minimumDeviationIncidentAngleDeg;
  const traceAtMin = OpticalPhysics.tracePrismRay(wlNm, minIncDeg, alphaDeg, 'crown');

  assert(Math.abs(traceAtMin.refractionAngle1Deg - 30.0) < 1e-4, 'At minimum deviation, theta_2 must equal alpha/2 (30°)');
  assert(Math.abs(traceAtMin.internalIncidentAngle2Deg - 30.0) < 1e-4, 'At minimum deviation, theta_3 must equal alpha/2 (30°)');
  assert(Math.abs(traceAtMin.emergenceAngleDeg - minIncDeg) < 1e-4, 'At minimum deviation, emergence angle theta_4 must equal incident angle theta_1');
  assert(Math.abs(traceAtMin.deviationAngleDeg - traceRef.minimumDeviationAngleDeg) < 1e-4, 'Deviation angle at symmetric path must equal minimumDeviationAngleDeg');

  // Verify Snell spectrometer formula: n = sin((delta_min + alpha)/2) / sin(alpha/2)
  const deltaMinRad = THREE.MathUtils.degToRad(traceAtMin.deviationAngleDeg);
  const alphaRad = THREE.MathUtils.degToRad(alphaDeg);
  const reconstructedN = Math.sin((deltaMinRad + alphaRad) * 0.5) / Math.sin(alphaRad * 0.5);
  assert(Math.abs(reconstructedN - n) < 1e-5, `Reconstructed n=${reconstructedN} must match exact Cauchy n=${n}`);

  // Any angle away from minIncDeg must produce a strictly larger deviation angle delta > delta_min
  const traceLower = OpticalPhysics.tracePrismRay(wlNm, minIncDeg - 8.0, alphaDeg, 'crown');
  const traceHigher = OpticalPhysics.tracePrismRay(wlNm, minIncDeg + 12.0, alphaDeg, 'crown');
  assert(traceLower.deviationAngleDeg > traceAtMin.deviationAngleDeg, 'Deviation below minIncDeg must exceed delta_min');
  assert(traceHigher.deviationAngleDeg > traceAtMin.deviationAngleDeg, 'Deviation above minIncDeg must exceed delta_min');

  console.log(`  BK7 Crown (α=60°): θ₁,min = ${minIncDeg.toFixed(2)}°, δ_min = ${traceAtMin.deviationAngleDeg.toFixed(2)}°`);
  console.log('✓ Test 2 passed: Double-interface prism refraction & minimum deviation law validated\n');
}

// -------------------------------------------------------------
// Test 3: Seven-Color Spectrum Dispersion Ordering & Violet-End TIR Cutoff
// -------------------------------------------------------------
{
  console.log('Test 3: Seven-Color Spectrum Dispersion Ordering & Violet-End TIR Cutoff');
  const specFlint = OpticalPhysics.calculatePrismSpectrum(55.0, 60.0, 'flint');
  const specCrown = OpticalPhysics.calculatePrismSpectrum(55.0, 60.0, 'crown');

  assert.strictEqual(specFlint.bands.length, 7, 'Must compute all 7 classic spectral bands (Red to Violet)');
  assert.strictEqual(specFlint.hasFullTIR, false, 'At 55° incidence in flint glass, spectrum refracts out');

  // Verify strict deviation angle ordering: delta(Red) < delta(Orange) < ... < delta(Violet)
  for (let i = 1; i < specFlint.bands.length; i++) {
    assert(
      specFlint.bands[i].deviationAngleDeg > specFlint.bands[i - 1].deviationAngleDeg,
      `Shorter wavelength ${specFlint.bands[i].name} must have larger deviation angle than ${specFlint.bands[i - 1].name}`
    );
  }

  // Dense Flint glass must exhibit significantly wider angular dispersion than Crown glass
  assert(
    specFlint.angularDispersionDeg > specCrown.angularDispersionDeg * 2.0,
    `Dense Flint dispersion (${specFlint.angularDispersionDeg.toFixed(2)}°) must be >2x Crown glass (${specCrown.angularDispersionDeg.toFixed(2)}°)`
  );

  // Verify Violet-End Partial Total Internal Reflection Cutoff at shallow incident angle in Flint glass
  // At 46.5° incidence on α=60° ZF7 flint prism: red refracts out, while violet hits TIR!
  const specPartialTIR = OpticalPhysics.calculatePrismSpectrum(46.5, 60.0, 'flint');
  assert.strictEqual(specPartialTIR.redRay.isTotalInternalReflection, false, 'Red ray still refracts out at 46.5°');
  assert.strictEqual(specPartialTIR.violetRay.isTotalInternalReflection, true, 'Violet ray undergoes TIR first at 46.5°');
  assert.strictEqual(specPartialTIR.hasPartialTIR, true, 'Must detect partial violet-end TIR cutoff');

  console.log(`  ZF7 Flint Δδ = ${specFlint.angularDispersionDeg.toFixed(2)}° vs BK7 Crown Δδ = ${specCrown.angularDispersionDeg.toFixed(2)}°`);
  console.log('✓ Test 3 passed: 7-color dispersion ordering & violet-end critical TIR cutoff validated\n');
}

// -------------------------------------------------------------
// Test 4: 3D OpticalDispersionApparatusMesh Assembly & Craftsmanship Invariants
// -------------------------------------------------------------
{
  console.log('Test 4: 3D OpticalDispersionApparatusMesh Assembly & Craftsmanship Invariants');
  const apparatus = new OpticalDispersionApparatusMesh();

  assert.ok(apparatus.group, 'Root apparatus group must exist');
  assert.ok(apparatus.railGroup, 'Spectrometer monoblock bed & rail group must exist');
  assert.ok(apparatus.goniometerDialGroup, '360° goniometer protractor dial group must exist');
  assert.ok(apparatus.collimatorArmGroup, 'Pivoting polychromatic collimator arm must exist');
  assert.ok(apparatus.prismStageGroup, 'Central prism turntable stage must exist');
  assert.ok(apparatus.prismCrystalMesh, 'Beveled optical crystal prism mesh must exist');
  assert.ok(apparatus.prismMicrometerKnob, 'Micrometer incident-angle knob must exist');
  assert.ok(apparatus.materialTurretWheel, '5-stage optical material turret wheel must exist');
  assert.ok(apparatus.recombinationGroup && apparatus.recombinationPrismMesh, 'Newton second inverted recombination prism assembly must exist');
  assert.ok(apparatus.screenCarrierGroup && apparatus.screenMesh, 'Panoramic spectral screen assembly must exist');
  assert.ok(apparatus.redEdgeCaliperMesh && apparatus.violetEdgeCaliperMesh, 'Dual red/violet vernier wavelength caliper pointers must exist');
  assert.ok(apparatus.internalRainbowRibbonMesh && apparatus.externalRainbowRibbonMesh, '32-band continuous internal & external rainbow ribbons must exist');
  assert.ok(apparatus.principalRaysGroup && apparatus.principalRaysGroup.children.length >= 14, '7 principal rays + internal rays + spots must be populated');

  // Verify high-detail mechanical sub-features on knobs
  assert(apparatus.prismMicrometerKnob.children.length >= 16, 'Micrometer knob must have rich knurled mechanical ridges & collars');
  assert(apparatus.materialTurretWheel.children.length >= 16, 'Material turret wheel must have 5 optical gem inserts & 10 knurled notches');

  apparatus.dispose();
  console.log('✓ Test 4 passed: Bespoke 3D spectrometer & prism dispersion apparatus verified\n');
}

// -------------------------------------------------------------
// Test 5: 3D Direct Manipulation, Raycast Hover & Newton Recombination Toggle
// -------------------------------------------------------------
{
  console.log('Test 5: 3D Direct Manipulation, Raycast Hover & Newton Recombination Toggle');
  const apparatus = new OpticalDispersionApparatusMesh();
  const rootGroup = new THREE.Group();
  rootGroup.add(apparatus.group);
  rootGroup.updateMatrixWorld(true);

  let materialChanged: string | null = null;
  let recombToggled: boolean | null = null;
  let sourceChanged: string | null = null;
  let powerChanged: boolean | null = null;

  const mgr = new OpticalDispersionInteractionManager(apparatus, rootGroup, {
    onPrismMaterialChange: (m) => { materialChanged = m; },
    onRecombinationToggle: (en) => { recombToggled = en; },
    onSourceModeChange: (mode) => { sourceChanged = mode; },
    onLaserPowerToggle: (on) => { powerChanged = on; },
  });

  // 1. Pre-contact hover over micrometer knob shows 3D hover halo cue
  const raycaster = new THREE.Raycaster();
  const knobWorldPos = new THREE.Vector3();
  apparatus.prismMicrometerKnob.getWorldPosition(knobWorldPos);
  raycaster.ray.origin.set(knobWorldPos.x, knobWorldPos.y, knobWorldPos.z + 0.5);
  raycaster.ray.direction.set(0, 0, -1);

  const preHover = mgr.getHoverTarget(raycaster);
  assert.ok(preHover && preHover.label.length > 0, 'Pre-contact hover prompt must be non-empty');
  assert.strictEqual(apparatus.micrometerHoverCue.visible, true, '3D hover halo must be visible before first contact');

  // 2. Drag micrometer knob to adjust incident angle -> halo permanently disappears
  const hitKnob = { object: apparatus.prismMicrometerKnob, point: knobWorldPos } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown', { clientX: 400, clientY: 400 }), hitKnob);
  assert.strictEqual(apparatus.micrometerHoverCue.visible, false, '3D hover halo must vanish upon interaction');
  mgr.onPointerMove(new PointerEvent('pointermove', { clientX: 450, clientY: 400 }), raycaster);
  assert(apparatus.incidentAngleDeg > 58.0, 'Dragging micrometer right must increase incident angle');
  mgr.onPointerUp(new PointerEvent('pointerup'));

  const postHover = mgr.getHoverTarget(raycaster);
  assert.strictEqual(postHover?.label, '', 'Hover prompt must remain empty after interaction');

  // 3. Click 5-stage prism material turret wheel
  const hitTurret = { object: apparatus.materialTurretWheel, point: apparatus.materialTurretWheel.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitTurret);
  assert.strictEqual(materialChanged, 'quartz', 'Cycled from flint (index 2) to quartz (index 3)');

  // 4. Click Newton's second inverted recombination prism arm to swing into beam
  const hitRecomb = { object: apparatus.recombinationPrismMesh, point: apparatus.recombinationPrismMesh.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitRecomb);
  assert.strictEqual(recombToggled, true, 'Newton recombination prism swung into optical path');
  assert.strictEqual(apparatus.enableRecombinationPrism, true);
  assert(apparatus.recombinedBeamGroup.children.length > 0, 'Recombined white light beam meshes must be generated');

  // 5. Click Mercury-Helium atomic spectral lines button
  const hitSpecBtn = { object: apparatus.spectralLinesBtnMesh, point: apparatus.spectralLinesBtnMesh.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitSpecBtn);
  assert.strictEqual(sourceChanged, 'spectral_lines');

  // 6. Click power switch
  const hitPower = { object: apparatus.laserSwitchMesh, point: apparatus.laserSwitchMesh.position } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown'), hitPower);
  assert.strictEqual(powerChanged, false);

  apparatus.dispose();
  console.log('✓ Test 5 passed: 3D direct manipulation, hover halo lifecycle & Newton recombination verified\n');
}

// -------------------------------------------------------------
// Test 6: Full Experiment Lifecycle, Parameters, Minimalist Screen & 60+ FPS Benchmark
// -------------------------------------------------------------
{
  console.log('Test 6: Full Experiment Lifecycle, Minimalist Invariants & 60+ FPS Benchmark');
  const exp = new OpticsDispersionExperiment();
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

  // 2. Minimalist Observation Screen Invariant (Zero text / numbers drawn on screen canvas)
  let screenTextCalls = 0;
  const screenCtx = (apparatus as any).screenCanvas.getContext('2d');
  screenCtx.fillText = () => { screenTextCalls++; };
  screenCtx.strokeText = () => { screenTextCalls++; };

  exp.onParameterChange('sourceMode', 'white', mockContext);
  exp.onParameterChange('sourceMode', 'spectral_lines', mockContext);
  exp.onParameterChange('sourceMode', 'monochromatic', mockContext);
  exp.onParameterChange('enableRecombinationPrism', true, mockContext);
  assert.strictEqual(screenTextCalls, 0, 'Spectral observation screen must render pure light patterns with zero text');

  // 3. Pure Large Deep-Colored Prism Value Text Invariant (Zero background rect / border rect)
  let labelRectCalls = 0;
  let lastLabelText = '';
  const labelCtx = (apparatus as any).prismValueCanvas.getContext('2d');
  labelCtx.fillRect = () => { labelRectCalls++; };
  labelCtx.strokeRect = () => { labelRectCalls++; };
  labelCtx.fillText = (txt: string) => { lastLabelText = txt; };

  exp.onParameterChange('prismMaterial', 'diamond', mockContext);
  assert.strictEqual(labelRectCalls, 0, '3D value label must NOT draw any background or border rect');
  assert.ok(lastLabelText.includes('光学金刚石'), `3D value label must reflect updated prism material: ${lastLabelText}`);

  // 4. 60+ FPS Performance Benchmark (< 0.05ms per frame)
  const iterations = 1000;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    exp.update(0.016, i * 0.016, mockContext);
  }
  const avgStepMs = (performance.now() - t0) / iterations;
  console.log(`  Average simulation step time: ${avgStepMs.toFixed(5)} ms`);
  assert(avgStepMs < 0.05, `Step time ${avgStepMs}ms must be under 0.05ms for locked 60+ FPS`);

  // 5. Metadata & PhysicsDisciplineModal registration verification
  assert.strictEqual(metadata.id, 'optics-dispersion');
  assert.strictEqual(metadata.name, '光的色散');
  const modalEntry = PhysicsDisciplineModal.OPTICS_EXPERIMENTS.find((e) => e.id === 'optics-dispersion');
  assert.ok(modalEntry, 'optics-dispersion must be registered in PhysicsDisciplineModal.OPTICS_EXPERIMENTS');
  assert.strictEqual(modalEntry.name, '光的色散');

  exp.dispose(mockContext);
  console.log('✓ Test 6 passed: Lifecycle, minimalist invariants, modal registration & 60+ FPS verified\n');
}

// -------------------------------------------------------------
// Test 7: Button & Knob Rotation Ergonomics & Anti-Reverse Invariants
// -------------------------------------------------------------
{
  console.log('Test 7: Button & Knob Rotation Ergonomics & Anti-Reverse Invariants');
  const rootGroup = new THREE.Group();
  const apparatus = new OpticalDispersionApparatusMesh();
  rootGroup.add(apparatus.group);

  let angleUpdated = 0;
  let materialUpdated: any = null;
  const mgr = new OpticalDispersionInteractionManager(apparatus, rootGroup, {
    onIncidentAngleChange: (a) => { angleUpdated = a; },
    onPrismMaterialChange: (m) => { materialUpdated = m; },
  });

  // 1. Turret Wheel Continuous Forward Rotation Invariant
  // Initial active material: flint (index 2), angle = 2 * (2pi/5)
  assert.strictEqual(apparatus.activeMaterialIndex, 2);
  const initialAngle = apparatus.targetTurretAngle;

  apparatus.cycleNextPrismMaterial(); // index 3 (quartz)
  assert.strictEqual(apparatus.activeMaterialIndex, 3);
  assert(apparatus.targetTurretAngle > initialAngle, 'Turret advances forward');

  apparatus.cycleNextPrismMaterial(); // index 4 (diamond)
  assert.strictEqual(apparatus.activeMaterialIndex, 4);
  const diamondAngle = apparatus.targetTurretAngle;

  apparatus.cycleNextPrismMaterial(); // index 0 (crown) - wrap around
  assert.strictEqual(apparatus.activeMaterialIndex, 0);
  assert(apparatus.targetTurretAngle > diamondAngle, 'Wrap around must advance forward and NOT spin backwards');

  // 2. Specific Gem Selection
  apparatus.setPrismMaterialIndex(1); // bariumFlint
  assert.strictEqual(apparatus.prismMaterial, 'bariumFlint');

  // 3. Recombination Toggle Knob Rotation Animation
  assert.strictEqual(apparatus.recombinationToggleKnob.rotation.z, 0);
  apparatus.toggleRecombinationPrism();
  // Simulate damping animation frames
  for (let i = 0; i < 30; i++) {
    apparatus.update(0.016);
  }
  assert(apparatus.recombinationToggleKnob.rotation.z > 1.0, 'Recombination toggle knob must visibly rotate 90° upon toggle');

  // 4. Micrometer Knob Rotation and Axial Feed
  apparatus.setIncidentAngle(70.0);
  assert(apparatus.prismMicrometerKnob.rotation.z > 0, 'Micrometer knob must rotate with incident angle');
  assert(apparatus.prismMicrometerKnob.position.z > 0.016, 'Micrometer knob must feed axially forward with angle');

  // 5. Collimator Ray Plane Intersection Dragging
  const p1 = apparatus.getIncidentPointP1();
  const hitArm = { object: apparatus.collimatorArmGroup, point: new THREE.Vector3(p1.x - 0.2, p1.y, 0) } as any;
  mgr.onPointerDown(new PointerEvent('pointerdown', { clientX: 200, clientY: 400 }), hitArm);

  const raycaster = new THREE.Raycaster();
  // Ray pointing at 20° from P1 (which maps to incident angle θ₁ = 20° + 30° = 50°)
  const targetX = p1.x - Math.cos(THREE.MathUtils.degToRad(20)) * 0.2;
  const targetY = p1.y - Math.sin(THREE.MathUtils.degToRad(20)) * 0.2;
  raycaster.ray.origin.set(targetX, targetY, 1.0);
  raycaster.ray.direction.set(0, 0, -1);

  mgr.onPointerMove(new PointerEvent('pointermove', { clientX: 220, clientY: 380 }), raycaster);
  assert.strictEqual(Math.round(angleUpdated), 50, 'Collimator rotation must follow ray plane intersection to 50°');
  mgr.onPointerUp(new PointerEvent('pointerup'));

  // 6. Collimator Console Push Button Tactile Depression
  apparatus.setSourceMode('white');
  assert.strictEqual(apparatus.whiteLightBtnMesh.position.z, 0.0035, 'Active button must depress to 0.0035');
  apparatus.setSourceMode('spectral_lines');
  assert.strictEqual(apparatus.whiteLightBtnMesh.position.z, 0.006, 'Inactive button must return to 0.006');
  assert.strictEqual(apparatus.spectralLinesBtnMesh.position.z, 0.0035, 'Active button must depress to 0.0035');

  apparatus.dispose();
  console.log('✓ Test 7 passed: Button & knob rotation ergonomics and tactile feedback verified\n');
}

console.log('========================================================');
console.log('All Light Dispersion & Prism Recombination Tests Passed (7/7)!');
console.log('========================================================\n');
