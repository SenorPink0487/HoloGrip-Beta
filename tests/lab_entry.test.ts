import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  LAB_ENTRY_DOLLY_DISTANCE,
  LAB_ENTRY_DURATION,
  LAB_ENTRY_FOV_OPEN,
  LAB_ENTRY_REST,
  advanceLabEntry,
  createLabEntryClock,
  glassLook,
  glassMask,
  labEntryPose,
  smootherstep,
} from '../src/controls/labEntry.ts';

console.log('=== Laboratory entry dolly & frosted-glass dissolve ===\n');

function oracleForward(): THREE.Vector3 {
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  camera.rotation.x = LAB_ENTRY_REST.pitch;
  camera.rotation.y = LAB_ENTRY_REST.yaw;
  camera.rotation.z = 0;
  camera.updateMatrixWorld(true);
  return camera.getWorldDirection(new THREE.Vector3());
}

{
  console.log('Test 1: Dolly rides the camera look axis onto the table pose');
  assert(LAB_ENTRY_DOLLY_DISTANCE >= 0.75 && LAB_ENTRY_DOLLY_DISTANCE <= 1.35, 'Push stays a short dolly');
  assert(LAB_ENTRY_DURATION >= 1.15 && LAB_ENTRY_DURATION <= 1.7, 'Dissolve has time to read without locking the view');
  assert(LAB_ENTRY_FOV_OPEN >= 2 && LAB_ENTRY_FOV_OPEN <= 6, 'Focus pull stays subtle');

  const forward = oracleForward();
  assert(forward.z < -0.9, 'Entry camera looks toward -Z, at the table');

  const start = labEntryPose(0, 60);
  const end = labEntryPose(1, 60);
  assert.strictEqual(end.x, LAB_ENTRY_REST.x);
  assert.strictEqual(end.y, LAB_ENTRY_REST.y);
  assert.strictEqual(end.z, LAB_ENTRY_REST.z);
  assert.strictEqual(end.yaw, LAB_ENTRY_REST.yaw);
  assert.strictEqual(end.pitch, LAB_ENTRY_REST.pitch);
  assert.strictEqual(end.fov, 60);
  assert(end.z > 2, 'Rest pose stands in front of the table');
  assert(start.z > end.z, 'Dolly starts farther from the table');

  const offset = new THREE.Vector3(start.x - end.x, start.y - end.y, start.z - end.z);
  const expected = forward.clone().multiplyScalar(-LAB_ENTRY_DOLLY_DISTANCE);
  assert(offset.distanceTo(expected) < 1e-6, 'Start pose is behind the look direction');
  assert(Math.abs(offset.length() - LAB_ENTRY_DOLLY_DISTANCE) < 1e-6);

  let previous = start;
  for (let step = 1; step <= 16; step += 1) {
    const pose = labEntryPose(step / 16, 60);
    const travel = new THREE.Vector3(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z);
    const along = travel.normalize().dot(forward);
    assert(along > 0.999, `Step ${step} left the look axis (${along})`);
    assert(pose.fov <= previous.fov + 1e-9, 'Field of view only tightens');
    assert.strictEqual(pose.yaw, LAB_ENTRY_REST.yaw);
    assert.strictEqual(pose.pitch, LAB_ENTRY_REST.pitch);
    previous = pose;
  }
  console.log('✓ Test 1 passed: camera pushes along its look direction and settles on the table\n');
}

{
  console.log('Test 2: Smootherstep settles, and the clock lands exactly on the rest pose');
  assert.strictEqual(smootherstep(0), 0);
  assert.strictEqual(smootherstep(0.5), 0.5);
  assert.strictEqual(smootherstep(1), 1);
  const slope = (a: number, b: number) => (smootherstep(b) - smootherstep(a)) / (b - a);
  assert(slope(0, 1e-3) < 0.02, 'Push starts from rest');
  assert(slope(1 - 1e-3, 1) < 0.02, 'Push ends at rest');
  assert(slope(0.49, 0.51) > 1, 'The middle of the push is the fastest part');

  const clock = createLabEntryClock(60);
  let frame = advanceLabEntry(clock, 0);
  assert.strictEqual(frame.done, false);
  assert.strictEqual(frame.linear, 0);
  assert.strictEqual(frame.pose.fov, 60 + LAB_ENTRY_FOV_OPEN);
  let steps = 0;
  while (!frame.done && steps < 500) {
    frame = advanceLabEntry(clock, 1 / 120);
    steps += 1;
  }
  assert.strictEqual(frame.done, true);
  assert.strictEqual(frame.u, 1);
  assert.strictEqual(frame.pose.fov, 60);
  assert.strictEqual(frame.pose.x, LAB_ENTRY_REST.x);
  assert.strictEqual(frame.pose.y, LAB_ENTRY_REST.y);
  assert.strictEqual(frame.pose.z, LAB_ENTRY_REST.z);
  assert(steps * (1 / 120) < LAB_ENTRY_DURATION + 1 / 60, 'Clock finishes with the duration, not early');
  console.log('✓ Test 2 passed: entry clock eases in and lands on the exact table pose\n');
}

{
  console.log('Test 3: Board turns to frosted glass, then the center opens');
  const closed = glassLook(0);
  assert.strictEqual(closed.fill, 1);
  assert.strictEqual(closed.blur, 0);
  assert.strictEqual(closed.ink, 1);
  assert.strictEqual(closed.chrome, 1);
  assert.strictEqual(closed.aperture, 0);
  assert.strictEqual(closed.sheen, 0);
  assert.strictEqual(closed.dots, 1);
  assert.strictEqual(glassMask(0), 'none');

  const frosted = glassLook(0.2);
  assert(frosted.fill > 0.45 && frosted.fill < 0.75, `Frost should still read as a surface (${frosted.fill})`);
  assert(frosted.blur > 8, `Frost should be ground glass, not a flat fade (${frosted.blur})`);
  assert.strictEqual(frosted.dots, 0, 'Paper texture is gone once the surface is glass');
  assert(frosted.aperture < 0.05, 'The opening waits until the glass has formed');

  const opening = glassLook(0.55);
  assert(opening.aperture > 0.45, 'Gaze opens through the middle of the board');
  assert(opening.ink < 0.05, 'Ink is gone before the lab is sharp');
  assert.strictEqual(opening.chrome, 0);

  const clear = glassLook(1);
  assert.strictEqual(clear.fill, 0);
  assert.strictEqual(clear.blur, 0);
  assert.strictEqual(clear.ink, 0);
  assert.strictEqual(clear.chrome, 0);
  assert.strictEqual(clear.aperture, 1);
  assert(glassMask(1).includes('radial-gradient'), 'Open aperture is a radial hole');
  assert(glassMask(1).includes('50% 52%'), 'Hole stays on the table, just below screen center');

  let previous = glassLook(0);
  for (let step = 1; step <= 40; step += 1) {
    const look = glassLook(step / 40);
    assert(look.fill <= previous.fill + 1e-6, 'Glass only gets clearer');
    assert(look.ink <= previous.ink + 1e-6, 'Ink only fades');
    assert(look.chrome <= previous.chrome + 1e-6, 'Tools only leave');
    assert(look.aperture >= previous.aperture - 1e-6, 'The opening only grows');
    previous = look;
  }
  console.log('✓ Test 3 passed: dissolve is frosted glass with a center opening\n');
}

{
  console.log('Test 4: Entry is wired through the render loop and the board layer');
  const engine = fs.readFileSync(path.resolve('src/core/Engine.ts'), 'utf8');
  const app = fs.readFileSync(path.resolve('src/whiteboard/WhiteboardApp.ts'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/whiteboard/whiteboard.css'), 'utf8');
  assert(engine.includes('if (this.labEntryActive) return;'), 'Clicks must not hit the lab while the dolly is running');
  assert(engine.includes('advanceLabEntry'), 'The dolly advances on the engine clock');
  assert(engine.includes('this.tickLabEntry(delta)'), 'The pose is applied from the render loop');
  assert(app.includes('beginLabEntry'), 'Entering the lab starts the dolly');
  assert(app.includes("this.engine.setViewMode('laboratory')"), 'Laboratory view mode is still applied');
  assert(app.includes("this.engine.setViewMode('whiteboard')"), 'Whiteboard view mode is still applied');
  assert(css.includes('visibility: hidden;'), 'Finished laboratory view still drops the board from the compositor');
  assert(css.includes('#whiteboard-app-root.lab-entry .whiteboard-canvas-layer'), 'The board itself carries the glass');
  assert(css.includes('backdrop-filter: blur(var(--glass-blur))'), 'The glass blurs the lab behind the board');
  assert(css.includes('mask-image: var(--glass-mask)'), 'The center opening is a mask, so the lab there stays sharp');
  console.log('✓ Test 4 passed: dolly, glass, and compositor hide are connected\n');
}

console.log('========================================================');
console.log('All laboratory entry transition tests passed (4/4)!');
console.log('========================================================\n');
