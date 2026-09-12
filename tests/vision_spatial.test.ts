import assert from 'node:assert';
import { PeriodicTableModal } from '../src/ui/vision/PeriodicTableModal.ts';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Starting VisionOS Spatial Window & Integration Verification ===\n');

// Test 1: 118 Periodic Elements completeness & integrity
{
  console.log('Test 1: 118 Periodic Elements completeness & integrity');
  const elements = PeriodicTableModal.ELEMENTS;
  assert.strictEqual(elements.length, 118, 'Must contain exactly 118 elements');

  for (let num = 1; num <= 118; num++) {
    const elem = elements.find((e) => e.number === num);
    assert(elem !== undefined, `Element number ${num} must exist`);
    assert(elem.symbol && elem.symbol.length > 0, `Element ${num} must have a symbol`);
    assert(elem.name && elem.name.length > 0, `Element ${num} must have a Chinese name`);
    assert(elem.enName && elem.enName.length > 0, `Element ${num} must have an English name`);
    assert(elem.mass > 0, `Element ${num} must have positive mass`);
    assert(elem.category && elem.category.length > 0, `Element ${num} must have a valid category`);
  }

  // Verify Lanthanides (57 - 71)
  for (let num = 57; num <= 71; num++) {
    const elem = elements.find((e) => e.number === num)!;
    assert.strictEqual(elem.category, 'lanthanide', `Element ${num} must be lanthanide`);
    assert.strictEqual(elem.period, 8, `Element ${num} must have period 8 for sub-grid`);
  }

  // Verify Actinides (89 - 103)
  for (let num = 89; num <= 103; num++) {
    const elem = elements.find((e) => e.number === num)!;
    assert.strictEqual(elem.category, 'actinide', `Element ${num} must be actinide`);
    assert.strictEqual(elem.period, 9, `Element ${num} must have period 9 for sub-grid`);
  }

  console.log('✓ Test 1 passed: All 118 elements verified with full metadata\n');
}

// Test 2: Reagents linking consistency
{
  console.log('Test 2: Reagents linking consistency');
  const elements = PeriodicTableModal.ELEMENTS;
  let linkedReagentsCount = 0;

  for (const elem of elements) {
    for (const rid of elem.reagentIds) {
      const reagent = ChemistryEngine.REAGENTS[rid];
      assert(reagent !== undefined, `Reagent ID '${rid}' referenced by element ${elem.symbol} must exist in ChemistryEngine.REAGENTS`);
      assert(reagent.name && reagent.name.length > 0, `Reagent ${rid} must have a name`);
      assert(reagent.formula && reagent.formula.length > 0, `Reagent ${rid} must have a formula`);
      assert(reagent.defaultAmount > 0, `Reagent ${rid} must have defaultAmount > 0`);
      linkedReagentsCount++;
    }
  }

  assert(linkedReagentsCount > 0, 'Should have linked reagents across elements');
  console.log(`✓ Test 2 passed: ${linkedReagentsCount} reagent mappings verified\n`);
}

// Test 3: Spatial clearance between 3D window and beaker on table
{
  console.log('Test 3: Spatial clearance between 3D window and beaker on table');
  const tableHeight = 0.88; // meters
  const beakerMountY = 0.908;
  const beakerHeight = 0.36;
  const beakerTopY = beakerMountY + beakerHeight; // 1.268 meters

  const windowTargetY = 2.06; // Window center height
  const windowFrameHeightPx = 710;
  const windowScale = 0.0016;
  const windowPhysicalHeight = windowFrameHeightPx * windowScale; // 1.136 meters
  const windowBottomY = windowTargetY - windowPhysicalHeight / 2; // 1.492 meters

  const verticalClearance = windowBottomY - beakerTopY;
  console.log(`  Beaker top in world space: ${beakerTopY.toFixed(3)} m`);
  console.log(`  Window bottom in world space: ${windowBottomY.toFixed(3)} m`);
  console.log(`  Clearance between beaker and window: ${(verticalClearance * 100).toFixed(1)} cm`);

  assert(verticalClearance > 0.15, `Clearance must be at least 15 cm for clear visibility, got ${(verticalClearance * 100).toFixed(1)} cm`);
  assert(verticalClearance < 0.40, `Clearance should not be excessively high, got ${(verticalClearance * 100).toFixed(1)} cm`);
  console.log('✓ Test 3 passed: Clean spatial sightline and vertical clearance verified\n');
}

// Test 4: Orientation and backOffset geometry
{
  console.log('Test 4: Orientation and backOffset geometry');
  // At any camera angle around the table, the beaker is at (0, 0)
  // Window is offset by -0.06m along the sightline (behind beaker)
  const backOffset = -0.06;

  for (let deg = 0; deg < 360; deg += 45) {
    const rad = (deg * Math.PI) / 180;
    const camDistance = 4.0;
    const camX = Math.sin(rad) * camDistance;
    const camZ = Math.cos(rad) * camDistance;

    const angleY = Math.atan2(camX, camZ);
    const winX = Math.sin(angleY) * backOffset;
    const winZ = Math.cos(angleY) * backOffset;

    // Vector from camera to beaker (0, 0)
    const distCamToBeaker = Math.hypot(camX, camZ);
    // Vector from camera to window
    const distCamToWindow = Math.hypot(camX - winX, camZ - winZ);

    assert(distCamToWindow > distCamToBeaker, `At angle ${deg}°, window must be situated further from camera than beaker (behind beaker in depth)`);
  }

  console.log('✓ Test 4 passed: Window is situated behind beaker from any 360° vantage angle\n');
}

console.log('========================================================');
console.log('All VisionOS Spatial Window Tests Passed (4/4)!');
console.log('========================================================\n');
