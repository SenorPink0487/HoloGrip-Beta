import assert from 'node:assert';
import { bindVisionSlider, isSliderActive } from '../src/ui/vision/sliderGestureHelper.ts';

console.log('=== Starting Universal Slider Gesture Adaptation Verification ===\n');

// Mock DOM elements and events for Node.js test environment
class MockDOMTokenList {
  private classes = new Set<string>();
  add(...names: string[]) { names.forEach((n) => this.classes.add(n)); }
  remove(...names: string[]) { names.forEach((n) => this.classes.delete(n)); }
  toggle(name: string, force?: boolean): boolean {
    if (force === true) { this.classes.add(name); return true; }
    if (force === false) { this.classes.delete(name); return false; }
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name);
    return true;
  }
  contains(name: string) { return this.classes.has(name); }
}

class MockSlider {
  id: string;
  min: string;
  max: string;
  step: string;
  value: string;
  classList = new MockDOMTokenList();
  style: Record<string, string> = {};
  listeners: Record<string, Function[]> = {};

  constructor(id: string, min = '0', max = '100', step = '1', value = '50') {
    this.id = id;
    this.min = min;
    this.max = max;
    this.step = step;
    this.value = value;
  }

  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    }
  }

  dispatchEvent(evt: { type: string; [key: string]: any }) {
    if (this.listeners[evt.type]) {
      this.listeners[evt.type].forEach((fn) => fn(evt));
    }
  }

  getBoundingClientRect() {
    return { left: 100, top: 200, width: 200, height: 44, right: 300, bottom: 244 };
  }

  setPointerCapture() {}
  releasePointerCapture() {}
}

// Test 1: Helper binding and options
console.log('Test 1: bindVisionSlider attaches pointer, touch and window listeners');
{
  const slider = new MockSlider('test-slider-1', '0', '100', '1', '25') as any;
  const activeSet = new Set<string>();
  let changedVal = -1;
  let scrubbedVal = -1;

  bindVisionSlider(slider, {
    activeSet,
    onChange: (val) => { changedVal = val; },
    onScrub: (val) => { scrubbedVal = val; },
  });

  assert.strictEqual(slider.style.touchAction, 'none', 'touchAction must be set to none');
  assert.ok(slider.listeners['pointerdown'], 'pointerdown listener attached');
  assert.ok(slider.listeners['touchstart'], 'touchstart listener attached');
  assert.ok(slider.listeners['input'], 'input listener attached');

  // Trigger pointerdown at 50% ratio (clientX = 200, width = 200, left = 100)
  slider.dispatchEvent({
    type: 'pointerdown',
    clientX: 200,
    clientY: 220,
    pointerId: 1,
    button: 0,
    preventDefault: () => {},
    stopPropagation: () => {},
  });

  assert.ok(activeSet.has('test-slider-1'), 'ActiveSet must contain slider ID on pointerdown');
  assert.ok(slider.classList.contains('is-pinching'), '.is-pinching class must be added for visionOS feedback');
  assert.strictEqual(slider.value, '50', 'Value should be updated to midpoint 50');
  assert.strictEqual(changedVal, 50, 'onChange fired with 50');
  assert.strictEqual(scrubbedVal, 50, 'onScrub fired with 50');

  // Verify telemetry protection during active pinch
  assert.strictEqual(isSliderActive(slider, activeSet), true, 'isSliderActive must return true during pinch');

  // Dispatch pointerup
  slider.dispatchEvent({
    type: 'pointerup',
    pointerId: 1,
    preventDefault: () => {},
  });

  assert.strictEqual(activeSet.has('test-slider-1'), false, 'ActiveSet must clear slider ID on pointerup');
  assert.strictEqual(slider.classList.contains('is-pinching'), false, '.is-pinching must be removed on pointerup');
  assert.strictEqual(isSliderActive(slider, activeSet), false, 'isSliderActive must return false when idle');
}
console.log('✓ Test 1 passed: bindVisionSlider pointer lifecycle verified');

// Test 2: Touch event compatibility (iPad touch screen)
console.log('Test 2: iPad touchstart / touchmove / touchend lifecycle');
{
  const slider = new MockSlider('test-slider-touch', '0', '10', '0.5', '2') as any;
  const activeSet = new Set<string>();
  let scrubCount = 0;

  bindVisionSlider(slider, {
    activeSet,
    onScrub: () => { scrubCount++; },
  });

  slider.dispatchEvent({
    type: 'touchstart',
    touches: [{ clientX: 150, clientY: 210 }],
    preventDefault: () => {},
    stopPropagation: () => {},
  });

  assert.ok(activeSet.has('test-slider-touch'), 'Touchstart locks telemetry');
  assert.ok(slider.classList.contains('is-pinching'), 'Touchstart enables .is-pinching thumb glow');
  assert.strictEqual(slider.value, '2.5', 'Touchstart at 25% computes 2.5');

  slider.dispatchEvent({
    type: 'touchend',
    touches: [],
    preventDefault: () => {},
  });

  assert.strictEqual(activeSet.has('test-slider-touch'), false, 'Touchend releases telemetry lock');
  assert.strictEqual(slider.classList.contains('is-pinching'), false, 'Touchend removes .is-pinching');
}
console.log('✓ Test 2 passed: iPad touchscreen gesture lifecycle verified');

// Test 3: Telemetry overwrite lock resilience under 60 FPS simulations
console.log('Test 3: Telemetry lock prevents 60 FPS simulation loop from overwriting active user drag');
{
  const slider = new MockSlider('slider-hall-b', '-2.00', '2.00', '0.02', '0.50') as any;
  const activeSet = new Set<string>();

  bindVisionSlider(slider, { activeSet });

  // Simulate active air pinch
  slider.dispatchEvent({
    type: 'pointerdown',
    clientX: 250, // 75% -> 1.00
    pointerId: 1,
    button: 0,
    preventDefault: () => {},
  });

  assert.strictEqual(slider.value, '1', 'User dragged to 1.00');

  // Background telemetry ticks at 60 FPS attempting to overwrite with external sensor data (e.g. 0.20)
  for (let frame = 0; frame < 60; frame++) {
    if (!isSliderActive(slider, activeSet)) {
      slider.value = '0.20';
    }
  }

  // Value must remain untouched at 1.00!
  assert.strictEqual(slider.value, '1', 'Telemetry loop successfully blocked from overwriting user pinch');

  // End pinch
  slider.dispatchEvent({ type: 'pointerup', pointerId: 1, preventDefault: () => {} });

  // After pinch finishes, telemetry is allowed to update
  if (!isSliderActive(slider, activeSet)) {
    slider.value = '0.20';
  }
  assert.strictEqual(slider.value, '0.20', 'Telemetry loop resumes after user pinch ends');
}
console.log('✓ Test 3 passed: 60 FPS telemetry overwrite resilience verified');

// Test 4: CSS hit-target & visionOS styling audit
console.log('Test 4: CSS hit-target & visionOS pinch styling audit');
import fs from 'node:fs';

{
  const indexHtml = fs.readFileSync('index.html', 'utf-8');
  const whiteboardCss = fs.readFileSync('src/whiteboard/whiteboard.css', 'utf-8');

  // Thermo mini slider hit target & styling
  assert.ok(indexHtml.includes('.thermo-mini-slider'), 'index.html contains .thermo-mini-slider definition');
  assert.ok(indexHtml.includes('height: 36px') || indexHtml.includes('min-height: 36px'), 'thermo slider enlarged hit target >= 36px');
  assert.ok(indexHtml.includes('.thermo-mini-slider.is-pinching') || indexHtml.includes('.is-pinching'), 'thermo slider has visionOS .is-pinching feedback');

  // Whiteboard slider hit target & styling
  assert.ok(whiteboardCss.includes('.slider-track-wrapper'), 'whiteboard.css contains .slider-track-wrapper');
  assert.ok(whiteboardCss.includes('touch-action: none'), 'whiteboard slider specifies touch-action: none');
  assert.ok(whiteboardCss.includes('.apple-range-slider.is-pinching'), 'whiteboard slider has .is-pinching thumb glow');
}
console.log('✓ Test 4 passed: CSS hit-target & visionOS pinch styling verified');

// Test 5: Codebase audit for all interactive sliders
console.log('Test 5: Audit all status cards for bindVisionSlider and isSliderActive protection');
{
  const cards = [
    { file: 'src/ui/vision/HallStatusCard.ts', sliders: ['slider-hall-b', 'slider-hall-i', 'slider-hall-d'] },
    { file: 'src/ui/vision/FieldStatusCard.ts', sliders: ['field-charge-slider'] },
    { file: 'src/ui/vision/ThermoStatusCard.ts', sliders: ['slider-temp', 'slider-vol'] },
    { file: 'src/ui/vision/CarnotStatusCard.ts', sliders: ['slider-temp-h', 'slider-temp-c'] },
    { file: 'src/ui/vision/ConductionStatusCard.ts', sliders: ['slider-cond-th', 'slider-cond-tc', 'slider-cond-probe'] },
    { file: 'src/ui/vision/PhaseStatusCard.ts', sliders: ['slider-phase-power'] },
  ];

  for (const card of cards) {
    const code = fs.readFileSync(card.file, 'utf-8');
    assert.ok(code.includes('bindVisionSlider'), `${card.file} must import/use bindVisionSlider`);
    assert.ok(code.includes('isSliderActive'), `${card.file} must protect active sliders with isSliderActive`);
    for (const s of card.sliders) {
      assert.ok(code.includes(s), `${card.file} must contain slider ID ${s}`);
    }
  }

  // Whiteboard ColorPicker
  const pickerCode = fs.readFileSync('src/whiteboard/AppleColorPicker.ts', 'utf-8');
  assert.ok(pickerCode.includes('bindVisionSlider'), 'AppleColorPicker must use bindVisionSlider');
  assert.ok(pickerCode.includes('popover-hue-slider'), 'AppleColorPicker must contain popover-hue-slider');
  assert.ok(pickerCode.includes('popover-light-slider'), 'AppleColorPicker must contain popover-light-slider');
}
console.log('✓ Test 5 passed: All interactive cards verified for unified gesture binding & protection');

console.log('\n========================================================');
console.log('All Universal Slider Gesture Adaptation Tests Passed (5/5)!');
console.log('========================================================\n');
