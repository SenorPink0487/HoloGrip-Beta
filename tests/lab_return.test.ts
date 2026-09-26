import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { LAB_ENTRY_REST } from '../src/controls/labEntry.ts';
import {
  LAB_RETURN_BACK,
  LAB_RETURN_DURATION,
  LAB_RETURN_PITCH,
  advanceLabReturn,
  createLabReturnClock,
  labReturnEnd,
  returnChrome,
  returnCoverRadius,
  returnMask,
  returnStartRadius,
  sheetEase,
  type LabReturnBounds,
} from '../src/controls/labReturn.ts';

console.log('=== Laboratory return: sheet from the corner, camera lifts back ===\n');

const bounds: LabReturnBounds = {
  roomRadius: 7.6,
  tableRadius: 2.48,
  minHeight: 0.3,
  maxHeight: 3.55,
  minPitch: -Math.PI / 2,
  maxPitch: Math.PI / 2,
};

function lookOf(yaw: number, pitch: number): THREE.Vector3 {
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  camera.rotation.x = pitch;
  camera.rotation.y = yaw;
  camera.rotation.z = 0;
  camera.updateMatrixWorld(true);
  return camera.getWorldDirection(new THREE.Vector3());
}

const tableView = {
  x: LAB_ENTRY_REST.x,
  y: LAB_ENTRY_REST.y,
  z: LAB_ENTRY_REST.z,
  yaw: LAB_ENTRY_REST.yaw,
  pitch: LAB_ENTRY_REST.pitch,
  fov: 60,
};

{
  console.log('Test 1: Return steps backward and lifts the gaze, without a focus pull');
  assert(LAB_RETURN_BACK < 0.7, 'The step back stays shorter than the entry push');
  assert(LAB_RETURN_DURATION < 1.3, 'The return is a different, shorter beat');

  const end = labReturnEnd(tableView, bounds);
  assert.strictEqual(end.fov, tableView.fov, 'Field of view stays put');
  assert.strictEqual(end.yaw, tableView.yaw);
  assert(end.pitch > tableView.pitch, 'Pitch rises');
  assert(Math.abs(end.pitch - (tableView.pitch + LAB_RETURN_PITCH)) < 1e-9);

  const forward = lookOf(tableView.yaw, tableView.pitch);
  const travel = new THREE.Vector3(end.x - tableView.x, 0, end.z - tableView.z);
  const flatForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
  assert(travel.normalize().dot(flatForward) < -0.9, 'Horizontal travel is backward along the look');
  assert(end.y > tableView.y, 'The camera rises');
  assert(lookOf(end.yaw, end.pitch).y > forward.y, 'The gaze tilts upward');
  assert(end.z > tableView.z, 'From the table pose, stepping back increases Z');
  console.log('✓ Test 1 passed: return lifts and steps back\n');
}

{
  console.log('Test 2: The step stays inside the room and outside the table');
  const facingOut = { ...tableView, z: 7.35 };
  const outEnd = labReturnEnd(facingOut, bounds);
  assert(Math.hypot(outEnd.x, outEnd.z) <= bounds.roomRadius - 0.18 + 1e-6, 'Does not leave the room');
  assert(outEnd.z < facingOut.z + LAB_RETURN_BACK, 'The wall shortens the step');

  const backToTable = { ...tableView, z: 2.7, yaw: Math.PI };
  const tableEnd = labReturnEnd(backToTable, bounds);
  assert(Math.hypot(tableEnd.x, tableEnd.z) >= bounds.tableRadius + 0.08 - 1e-3, 'Does not enter the table');
  const away = lookOf(backToTable.yaw, backToTable.pitch);
  const stepped = new THREE.Vector3(tableEnd.x - backToTable.x, 0, tableEnd.z - backToTable.z);
  if (stepped.length() > 1e-4) {
    assert(stepped.normalize().dot(new THREE.Vector3(away.x, 0, away.z).normalize()) < -0.9);
  }
  console.log('✓ Test 2 passed: return travel is clamped\n');
}

{
  console.log('Test 3: The sheet opens from the button across the whole return');
  assert.strictEqual(sheetEase(0), 0);
  assert.strictEqual(sheetEase(1), 1);
  assert(sheetEase(0.25) < 0.2, 'A quarter of the way in, most of the lab is still uncovered');
  assert(Math.abs(sheetEase(0.5) - 0.5) < 1e-9, 'Halfway, the sheet has reached halfway to the far corner');
  assert.strictEqual(returnChrome(0), 0);
  assert.strictEqual(returnChrome(1), 1);
  assert(returnChrome(0.3) === 0, 'Tools wait until the paper has spread');
  assert.strictEqual(returnStartRadius(0, 1600), 28);
  assert.strictEqual(returnStartRadius(1, 1600), 1600);

  const cover = returnCoverRadius(1440, 900, 48, 38);
  assert(cover > Math.hypot(1440, 900), 'The sheet reaches past the far corner');
  const mask = returnMask(48, 38, 28);
  assert(mask.includes('circle at 48.0px 38.0px'), mask);
  assert(mask.startsWith('radial-gradient'), 'The reveal is a soft circle, not a glass blur');

  const clock = createLabReturnClock(tableView, bounds);
  let frame = advanceLabReturn(clock, 0);
  assert.strictEqual(frame.done, false);
  assert.strictEqual(frame.pose.fov, 60);
  assert.strictEqual(frame.pose.z, tableView.z);
  let steps = 0;
  while (!frame.done && steps < 400) {
    frame = advanceLabReturn(clock, 1 / 120);
    steps += 1;
  }
  assert.strictEqual(frame.done, true);
  assert.strictEqual(frame.pose.fov, 60);
  assert(Math.abs(frame.pose.z - labReturnEnd(tableView, bounds).z) < 1e-6);
  assert(steps * (1 / 120) < LAB_RETURN_DURATION + 1 / 60);
  console.log('✓ Test 3 passed: sheet timing and clock land on the lifted pose\n');
}

{
  console.log('Test 4: The corner button and the sheet are wired');
  const app = fs.readFileSync(path.resolve('src/whiteboard/WhiteboardApp.ts'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/whiteboard/whiteboard.css'), 'utf8');
  const engine = fs.readFileSync(path.resolve('src/core/Engine.ts'), 'utf8');
  assert(app.includes("this.returnBtn.id = 'lab-return-btn'"), 'Laboratory has a return button');
  assert(app.includes('beginLabReturn'), 'The button starts the return motion');
  assert(app.includes('返回'), 'The button is labeled 返回');
  assert(engine.includes('beginLabReturn'), 'The engine plays the return on its clock');
  assert(engine.includes('advanceLabReturn'), 'Return frames advance with the render loop');
  assert(css.includes('#whiteboard-app-root.lab-return'), 'The board itself unfurls');
  assert(css.includes('mask-image: var(--return-mask)'), 'The unfurl is a mask from the button');
  assert(css.includes('.lab-return-btn'), 'The button has a corner style');
  assert(!css.includes('backdrop-filter: blur(var(--glass-blur))') || css.includes('#whiteboard-app-root.lab-return'), 'Return does not reuse the entry glass blur on the sheet');
  console.log('✓ Test 4 passed: button, sheet, and camera return are connected\n');
}

console.log('========================================================');
console.log('All laboratory return tests passed (4/4)!');
console.log('========================================================\n');
