import assert from 'node:assert';

// Mock DOM environment for Node
class MockElement {
  tagName: string;
  id = '';
  className = '';
  innerHTML = '';
  textContent = '';
  style: Record<string, any> = { display: '' };
  attributes: Record<string, string> = {};
  eventListeners: Record<string, ((e?: any) => void)[]> = {};
  private elementCache = new Map<string, MockElement>();

  constructor(tagName = 'div') {
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(event: string, callback: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  dispatchEvent(event: { type: string }): boolean {
    const list = this.eventListeners[event.type];
    if (list) {
      for (const cb of list) {
        cb(event);
      }
      return true;
    }
    return false;
  }

  private tabsCache: MockElement[] | null = null;

  private getOrCreateTabs(): MockElement[] {
    if (!this.tabsCache) {
      const modes = ['right-hand-screw', 'right-hand-rule'];
      this.tabsCache = modes.map(mode => {
        const el = new MockElement('button');
        el.className = 'hr-apple-seg-btn hr-mode-tab';
        el.setAttribute('data-mode', mode);
        return el;
      });
    }
    return this.tabsCache;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.includes('data-mode="right-hand-rule"')) {
      return this.getOrCreateTabs()[1];
    }
    if (selector.includes('data-mode="right-hand-screw"')) {
      return this.getOrCreateTabs()[0];
    }
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector)!;
    }
    const el = new MockElement(selector.startsWith('#canvas') ? 'canvas' : 'div');
    if (selector.startsWith('#')) {
      el.id = selector.slice(1);
    }
    el.className = selector.replace(/^[.#]/, '');
    this.elementCache.set(selector, el);
    return el;
  }

  querySelectorAll(selector: string): MockElement[] {
    if (selector.includes('data-mode') || selector.includes('.hr-mode-tab')) {
      return this.getOrCreateTabs();
    }
    return [];
  }

  appendChild(child: any): any {
    return child;
  }

  classList = {
    add: (cls: string) => {
      if (!this.className.includes(cls)) this.className = `${this.className} ${cls}`.trim();
    },
    remove: (cls: string) => {
      this.className = this.className.split(' ').filter(c => c !== cls).join(' ').trim();
    },
    toggle: (cls: string, force?: boolean) => {
      const has = this.className.includes(cls);
      const shouldHave = force !== undefined ? force : !has;
      if (shouldHave) this.classList.add(cls);
      else this.classList.remove(cls);
      return shouldHave;
    },
    contains: (cls: string) => this.className.includes(cls),
  };
}

(globalThis as any).document = {
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (_id: string) => null,
  head: {
    appendChild: () => {},
  },
};

const { HandRulesStatusCard } = await import('../src/ui/vision/HandRulesStatusCard.ts');

console.log('=== Starting HandRulesStatusCard Apple VisionOS UI Verification ===\n');

// Test 1: Instantiation & DOM Structure
console.log('Test 1: Instantiation & Apple VisionOS Layout');
let selectedMode: string | null = null;
let gestureToggled = false;
let currentReversed = false;
let fieldReversed = false;
let motionReversed = false;
let experimentReset = false;

const card = new HandRulesStatusCard({
  onSelectMode: (m) => { selectedMode = m; },
  onToggleGesture: () => { gestureToggled = true; },
  onReverseCurrent: () => { currentReversed = true; },
  onReverseField: () => { fieldReversed = true; },
  onReverseMotion: () => { motionReversed = true; },
  onReset: () => { experimentReset = true; },
});

assert(card.element !== null, 'Card element must exist');
assert(card.element.classList.contains('vision-hand-rules-card'), 'Card element must have vision-hand-rules-card class');
assert(card.element.classList.contains('hud-interactive'), 'Card element must have hud-interactive class');
console.log('✓ Test 1 passed: HandRulesStatusCard instantiated with VisionOS layout\n');

// Test 2: Mode switching via segmented buttons
console.log('Test 2: Apple Segmented Control Tab Navigation');
const tabs = card.element.querySelectorAll('.hr-mode-tab');
assert.strictEqual(tabs.length, 2, 'Must contain 2 mode tabs');

const rightHandTab = card.element.querySelector('.hr-mode-tab[data-mode="right-hand-rule"]') as any;
assert(rightHandTab !== null, 'Right hand rule tab must exist');
rightHandTab.click();
assert.strictEqual(selectedMode, 'right-hand-rule', 'Clicking tab must trigger onSelectMode callback');
console.log('✓ Test 2 passed: Apple Segmented Control tab switching verified\n');

// Test 3: Telemetry updates across modes
console.log('Test 3: Telemetry Synchronization & Dynamic Content');

// 1. Right-hand screw telemetry
card.updateFromTelemetry({
  mode: 'right-hand-screw',
  currentPolarity: 1,
  fieldPolarity: 1,
  motionPolarity: 1,
  gestureEnabled: true,
  requiredHand: 'right',
  detectedHand: 'right',
  status: 'matched',
  alignmentScore: 0.96,
  isMatched: true,
  statusLabel: '右手螺旋定则匹配成功：环绕磁场 B 已点亮',
});

const formulaBadge = card.element.querySelector('#hr-formula-badge');
assert(formulaBadge?.textContent?.includes('安培定则'), 'Formula badge must reflect right hand screw rule');

const chiralBadge = card.element.querySelector('#hr-required-hand-badge');
assert.strictEqual(chiralBadge?.textContent, '伸出右手', 'Must require right hand');
assert(chiralBadge?.classList.contains('is-right'), 'Must have is-right class');

const scoreEl = card.element.querySelector('#hr-score-val');
assert.strictEqual(scoreEl?.textContent, '96%', 'Score must display 96%');

const statusBadge = card.element.querySelector('#hr-status-badge');
assert.strictEqual(statusBadge?.textContent, '定则吻合', 'Status badge must display 定则吻合');
assert(statusBadge?.classList.contains('matched'), 'Status badge must have matched class');

// 2. Right-hand rule wrong hand telemetry (required right, detected left)
card.updateFromTelemetry({
  mode: 'right-hand-rule',
  currentPolarity: 1,
  fieldPolarity: 1,
  motionPolarity: 1,
  gestureEnabled: true,
  requiredHand: 'right',
  detectedHand: 'left',
  status: 'wrong-hand',
  alignmentScore: 0.35,
  isMatched: false,
  statusLabel: '当前为左手，请换用右手',
});

assert(formulaBadge?.textContent?.includes('右手定则'), 'Formula badge must reflect right hand rule');
assert.strictEqual(chiralBadge?.textContent, '伸出右手', 'Must require right hand');
assert(chiralBadge?.classList.contains('is-right'), 'Must have is-right class');
assert.strictEqual(statusBadge?.textContent, '请换手', 'Status badge must display 请换手');
assert(statusBadge?.classList.contains('wrong-hand'), 'Status badge must have wrong-hand class');

// 3. Right-hand rule idle telemetry
card.updateFromTelemetry({
  mode: 'right-hand-rule',
  currentPolarity: 1,
  fieldPolarity: 1,
  motionPolarity: -1,
  gestureEnabled: false,
  requiredHand: 'right',
  detectedHand: null,
  status: 'idle',
  alignmentScore: 0,
  isMatched: false,
  statusLabel: '待机状态',
});

assert(formulaBadge?.textContent?.includes('右手定则'), 'Formula badge must reflect right hand rule');
assert.strictEqual(chiralBadge?.textContent, '伸出右手', 'Must require right hand');
assert.strictEqual(statusBadge?.textContent, '待机', 'Status badge must display 待机');
console.log('✓ Test 3 passed: Telemetry updates across modes verified\n');

// Test 4: Direction buttons & action toolbar
console.log('Test 4: Direction Inversion & Action Buttons');
const btnRevField = card.element.querySelector('#btn-hr-rev-field') as any;
assert(btnRevField !== null, 'Reverse field button must exist');
btnRevField.click();
assert.strictEqual(fieldReversed, true, 'Clicking reverse field must call onReverseField');

const btnRevMotion = card.element.querySelector('#btn-hr-rev-motion') as any;
assert(btnRevMotion !== null, 'Reverse motion button must exist');
btnRevMotion.click();
assert.strictEqual(motionReversed, true, 'Clicking reverse motion must call onReverseMotion');

const btnReset = card.element.querySelector('#btn-hand-rules-reset') as any;
assert(btnReset !== null, 'Reset button must exist');
btnReset.click();
assert.strictEqual(experimentReset, true, 'Clicking reset button must call onReset');

const btnGesture = card.element.querySelector('#btn-hand-rules-toggle-gesture') as any;
assert(btnGesture !== null, 'Gesture toggle button must exist');
btnGesture.click();
assert.strictEqual(gestureToggled, true, 'Clicking gesture button must call onToggleGesture');
console.log('✓ Test 4 passed: Action buttons and direction inversion verified\n');

// Test 5: Visibility Lifecycle
console.log('Test 5: Visibility Lifecycle');
card.setVisible(false);
assert.strictEqual(card.element.style.display, 'none', 'Element display must be none when hidden');
card.setVisible(true);
assert.strictEqual(card.element.style.display, 'flex', 'Element display must be flex when visible');
console.log('✓ Test 5 passed: Visibility lifecycle verified\n');

console.log('========================================================');
console.log('All HandRulesStatusCard Tests Passed (5/5)!');
console.log('========================================================\n');
