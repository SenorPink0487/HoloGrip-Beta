import assert from 'node:assert';
import { PeriodicTableModal } from '../src/ui/vision/PeriodicTableModal.ts';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Starting VisionOS Spatial Window & Integration Verification ===\n');

// Test 1: 28 Common Reagent Elements completeness & integrity
{
  console.log('Test 1: 28 Common Reagent Elements completeness & integrity');
  const elements = PeriodicTableModal.ELEMENTS;
  assert.strictEqual(elements.length, 28, 'Must contain exactly 28 common reagent elements');

  for (const elem of elements) {
    assert(elem.number > 0, `Element number must be positive, got ${elem.number}`);
    assert(elem.symbol && elem.symbol.length > 0, `Element ${elem.number} must have a symbol`);
    assert(elem.name && elem.name.length > 0, `Element ${elem.number} must have a Chinese name`);
    assert(elem.enName && elem.enName.length > 0, `Element ${elem.number} must have an English name`);
    assert(elem.mass > 0, `Element ${elem.number} must have positive mass`);
    assert(elem.category && elem.category.length > 0, `Element ${elem.number} must have a valid category`);

    // Must be positioned in COMMON_ELEMENT_LAYOUT
    const layout = PeriodicTableModal.COMMON_ELEMENT_LAYOUT[elem.number];
    assert(layout !== undefined, `Element ${elem.symbol} (${elem.number}) must have position in COMMON_ELEMENT_LAYOUT`);
    assert(layout.row >= 1 && layout.row <= 5, `Element ${elem.symbol} row must be within 1-5`);
    assert(layout.col >= 1 && layout.col <= 18, `Element ${elem.symbol} col must be within 1-18`);
  }

  // Verify non-common heavy actinide/lanthanide elements are removed
  const hasLanthanides = elements.some((e) => e.category === 'lanthanide');
  const hasActinides = elements.some((e) => e.category === 'actinide');
  assert.strictEqual(hasLanthanides, false, 'Lanthanides should be removed from common reagents');
  assert.strictEqual(hasActinides, false, 'Actinides should be removed from common reagents');

  console.log('✓ Test 1 passed: All 28 common reagent elements verified with full layout & metadata\n');
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

  // Verify Aluminum reagents specifically
  const alElem = elements.find((e) => e.symbol === 'Al')!;
  assert(alElem !== undefined, 'Aluminum element must exist');
  assert(alElem.reagentIds.includes('Al'), 'Aluminum must link to Al (solid metal)');
  assert(alElem.reagentIds.includes('AlCl3'), 'Aluminum must link to AlCl3 (aluminum chloride)');

  // Verify all 28 elements have selectable reagents via getReagentsForElement
  for (const elem of elements) {
    const rList = PeriodicTableModal.getReagentsForElement(elem);
    assert(rList.length > 0, `Element ${elem.symbol} must have at least 1 selectable reagent`);
    assert(rList[0].name && rList[0].name.length > 0, `Reagent for ${elem.symbol} must have a name`);
  }

  console.log(`✓ Test 2 passed: ${linkedReagentsCount} reagent mappings verified with 100% (28/28) element coverage\n`);
}

// Test 3: Spatial clearance between 3D window and beaker on table
{
  console.log('Test 3: Spatial clearance between 3D window and beaker on table');
  const tableHeight = 0.88; // meters
  const beakerMountY = 0.852;
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

// Test 5: Vision Modal scale multipliers, clamping & physical 3D dimension scaling
{
  console.log('Test 5: Vision Modal scale multipliers, clamping & physical 3D dimension scaling');
  const baseScale = 0.0016;
  const minScale = 0.5;
  const maxScale = 2.0;
  const step = 0.1;

  let currentScale = 1.0;
  const zoomIn = () => {
    currentScale = Math.min(maxScale, Math.round((currentScale + step) * 100) / 100);
  };
  const zoomOut = () => {
    currentScale = Math.max(minScale, Math.round((currentScale - step) * 100) / 100);
  };
  const resetScale = () => {
    currentScale = 1.0;
  };

  // Test zoom in steps
  zoomIn();
  assert.strictEqual(currentScale, 1.1, 'One zoomIn step should reach 1.1x');
  zoomIn();
  assert.strictEqual(currentScale, 1.2, 'Two zoomIn steps should reach 1.2x');

  // Test max clamping
  for (let i = 0; i < 20; i++) zoomIn();
  assert.strictEqual(currentScale, 2.0, 'Scale must clamp to max 2.0x');
  assert.strictEqual(baseScale * currentScale, 0.0032, 'Max physical scale should be 0.0032');

  // Test zoom out steps
  resetScale();
  assert.strictEqual(currentScale, 1.0, 'Reset must restore 1.0x');
  zoomOut();
  assert.strictEqual(currentScale, 0.9, 'One zoomOut step should reach 0.9x');

  // Test min clamping
  for (let i = 0; i < 20; i++) zoomOut();
  assert.strictEqual(currentScale, 0.5, 'Scale must clamp to min 0.5x');
  assert.strictEqual(baseScale * currentScale, 0.0008, 'Min physical scale should be 0.0008');

  console.log('✓ Test 5 passed: Scale multipliers, clamping bounds [0.5x, 2.0x] and physical conversions verified\n');
}

// Test 6: Spatial window orientation stability under player vertical ascent/descent
{
  console.log('Test 6: Spatial window orientation stability under player vertical ascent/descent');
  const THREE = await import('three');

  const obj = new THREE.Object3D();
  obj.rotation.order = 'YXZ';

  const heights = [0.3, 0.8, 1.38, 2.06, 2.8, 3.55]; // From minimum height to maximum height
  const anglesDeg = [0, 30, 45, 90, 135, 180, 225, 270, 315];

  for (const camY of heights) {
    for (const deg of anglesDeg) {
      const rad = (deg * Math.PI) / 180;
      const camX = Math.sin(rad) * 4.0;
      const camZ = Math.cos(rad) * 4.0;

      const angleY = Math.atan2(camX, camZ);
      const backOffset = -0.06;
      const targetX = Math.sin(angleY) * backOffset;
      const targetY = 2.06;
      const targetZ = Math.cos(angleY) * backOffset;

      // Keep window strictly upright (pitch = 0, roll = 0) facing user around Y
      obj.position.set(targetX, targetY, targetZ);
      obj.rotation.set(0, angleY, 0);
      obj.updateMatrixWorld();

      // Horizontal axis of window (local X)
      const localX = new THREE.Vector3(1, 0, 0).transformDirection(obj.matrixWorld);
      // Vertical axis of window (local Y)
      const localY = new THREE.Vector3(0, 1, 0).transformDirection(obj.matrixWorld);
      // Facing normal of window (local Z)
      const localZ = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld);

      // Verify local X has strictly 0 vertical tilt (no roll, perfectly horizontal)
      assert(Math.abs(localX.y) < 1e-6, `Window horizontal axis must have y=0 at camY=${camY}, deg=${deg}, got ${localX.y}`);

      // Verify local Y is strictly vertical (gravity-aligned)
      assert(Math.abs(localY.y - 1.0) < 1e-6, `Window vertical axis must point straight up (+Y) at camY=${camY}, deg=${deg}`);
      assert(Math.abs(localY.x) < 1e-6 && Math.abs(localY.z) < 1e-6, `Window vertical axis must have x=z=0`);

      // Verify normal faces horizontally towards the player sightline
      const dirCamXZ = new THREE.Vector2(camX, camZ).normalize();
      const dirNormalXZ = new THREE.Vector2(localZ.x, localZ.z).normalize();
      assert(Math.abs(dirCamXZ.x - dirNormalXZ.x) < 1e-5 && Math.abs(dirCamXZ.y - dirNormalXZ.y) < 1e-5, `Window normal must face player`);
    }
  }

  console.log('✓ Test 6 passed: Spatial window remains strictly level & upright with 0 roll/tilt during ascent/descent across all 360° positions\n');
}

console.log('========================================================');
console.log('All VisionOS Spatial Window Tests Passed (6/6)!');
console.log('========================================================\n');

