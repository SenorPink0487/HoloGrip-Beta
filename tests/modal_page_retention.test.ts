import assert from 'node:assert';

// Mock DOM environment for Node.js
class MockDOMElement {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  public innerHTML: string = '';
  public attributes: Record<string, string> = {};
  public eventListeners: Record<string, ((e?: any) => void)[]> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public textContent: string = '';
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public disabled: boolean = false;
  public tabIndex: number = 0;
  private elementCache = new Map<string, MockDOMElement>();

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: (e?: any) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  dispatch(event: string, e?: any): void {
    if (this.eventListeners[event]) {
      for (const h of this.eventListeners[event]) {
        h(e);
      }
    }
  }

  blur(): void {}

  closest(selector: string): any {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      let cur: MockDOMElement | null = this;
      while (cur) {
        if (cur.classList.contains(cls)) return cur;
        cur = cur.parentElement;
      }
    }
    return null;
  }

  get classList() {
    return {
      add: (...clsList: string[]) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const cls of clsList) classes.add(cls);
        this.className = Array.from(classes).join(' ');
      },
      remove: (...clsList: string[]) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const cls of clsList) classes.delete(cls);
        this.className = Array.from(classes).join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !classes.has(cls);
        if (shouldAdd) classes.add(cls);
        else classes.delete(cls);
        this.className = Array.from(classes).join(' ');
        return shouldAdd;
      },
      contains: (cls: string) => {
        return this.className.split(/\s+/).includes(cls);
      },
    };
  }

  querySelector(selector: string): any {
    if (this.elementCache.has(selector)) {
      return this.elementCache.get(selector);
    }

    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      if (this.innerHTML.includes(`id="${id}"`)) {
        const el = new MockDOMElement('div');
        el.id = id;
        this.elementCache.set(selector, el);
        return el;
      }
    }

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
      if (this.innerHTML.includes(`class="`) && this.innerHTML.includes(cls)) {
        const el = new MockDOMElement('div');
        el.className = cls;
        this.elementCache.set(selector, el);
        return el;
      }
    }

    const dummy = new MockDOMElement('div');
    this.elementCache.set(selector, dummy);
    return dummy;
  }

  querySelectorAll(selector: string): any[] {
    const list: any[] = [];
    if (selector === 'input, textarea') {
      return [];
    }
    return list;
  }
}

const mockDoc = {
  createElement: (tag: string) => new MockDOMElement(tag),
  body: new MockDOMElement('body'),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
};

(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
};

import { VisionModal } from '../src/ui/vision/VisionModal.ts';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Starting Modal Page Retention Verification ===\n');

const engine = new ChemistryEngine();
let selectedExpId = '';

const visionModal = new VisionModal(engine, {
  onOpen: () => {},
  onClose: () => {},
  onSelectPhysicsExperiment: async (id: string) => {
    selectedExpId = id;
  },
});

// Test 1: In an optics experiment, modal is on Level 2 Optics. Closing and opening keeps Level 2 Optics.
{
  console.log('Test 1: Optics experiment Level 2 retention across close/open');
  visionModal.setCurrentExperimentId('optics-propagation');
  assert.strictEqual(visionModal.currentTab, 'physics');

  // Verify physics modal is on Level 2 'optics'
  const physicsModal = (visionModal as any).physicsModal;
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'optics');

  // User opens modal
  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'optics');

  // User closes modal from this page
  visionModal.close();
  assert.strictEqual(visionModal.visible, false);

  // User reopens modal (e.g. presses V or pinch gesture)
  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'physics', 'Must stay on physics tab');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2, 'Must remain on Level 2');
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'optics', 'Must remain on Optics page');

  console.log('✓ Test 1 passed: Optics Level 2 accurately preserved upon reopening\n');
}

// Test 2: User navigates back to Level 1 and closes. Opening restores Level 1.
{
  console.log('Test 2: Physics Level 1 retention across close/open');
  const physicsModal = (visionModal as any).physicsModal;
  physicsModal.showLevel1();
  assert.strictEqual(physicsModal.getCurrentLevel(), 1);

  // Close from Level 1
  visionModal.close();
  assert.strictEqual(visionModal.visible, false);

  // Reopen
  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 1, 'Must remain on Level 1');

  console.log('✓ Test 2 passed: Physics Level 1 accurately preserved upon reopening\n');
}

// Test 3: User navigates to disciplines tab and closes. Opening restores disciplines.
{
  console.log('Test 3: Disciplines tab retention across close/open');
  visionModal.switchTab('disciplines');
  assert.strictEqual(visionModal.currentTab, 'disciplines');

  visionModal.close();
  assert.strictEqual(visionModal.visible, false);

  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'disciplines', 'Must stay on disciplines tab');

  console.log('✓ Test 3 passed: Disciplines tab accurately preserved upon reopening\n');
}

// Test 4: User navigates to chemistry tab and closes. Opening restores chemistry.
{
  console.log('Test 4: Chemistry tab retention across close/open');
  visionModal.switchTab('chemistry');
  assert.strictEqual(visionModal.currentTab, 'chemistry');

  visionModal.close();
  assert.strictEqual(visionModal.visible, false);

  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'chemistry', 'Must stay on chemistry tab');

  console.log('✓ Test 4 passed: Chemistry tab accurately preserved upon reopening\n');
}

// Test 5: While in a thermo experiment, user navigates to Level 2 mechanics and closes.
// Reopening MUST NOT hijack back to thermo; it must remain on Level 2 mechanics!
{
  console.log('Test 5: No hijacking back to active experiment tab if user closed from another page');
  visionModal.setCurrentExperimentId('thermo-carnot');
  assert.strictEqual(visionModal.currentTab, 'thermo');

  // User navigates to physics -> mechanics
  const physicsModal = (visionModal as any).physicsModal;
  physicsModal.showLevel2('mechanics');
  visionModal.switchTab('physics');

  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'mechanics');

  // User closes modal from mechanics Level 2
  visionModal.close();
  assert.strictEqual(visionModal.visible, false);

  // User reopens modal without arguments
  visionModal.open();
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(visionModal.currentTab, 'physics', 'Must not hijack back to thermo; must stay on physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2, 'Must remain on Level 2');
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'mechanics', 'Must remain on Mechanics');

  console.log('✓ Test 5 passed: User navigation choice respected over background experiment type\n');
}

// Test 6: Switching experiment to optics updates activeTab and Level 2
{
  console.log('Test 6: Switching experiment sets appropriate default page');
  visionModal.setCurrentExperimentId('optics-interference');
  assert.strictEqual(visionModal.currentTab, 'physics');
  const physicsModal = (visionModal as any).physicsModal;
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'optics');

  visionModal.open();
  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'optics');

  console.log('✓ Test 6 passed: Switching experiment establishes correct initial page\n');
}

// Test 7: Switching experiment to mech-galileo opens physics mechanics menu without status card (like optics)
{
  console.log('Test 7: Galileo ideal experiment operates without status card, opening mechanics catalog');
  visionModal.setCurrentExperimentId('mech-galileo');
  assert.strictEqual(visionModal.currentTab, 'physics', 'Galileo tab must default to physics');
  const physicsModal = (visionModal as any).physicsModal;
  assert.strictEqual(physicsModal.getCurrentLevel(), 2, 'Must default to Level 2');
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'mechanics', 'Must default to Mechanics');

  // Open modal - must open successfully!
  visionModal.open();
  assert.strictEqual(visionModal.visible, true, 'Modal must open successfully when Galileo is active');
  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2);
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'mechanics');

  // Verify status card does not exist
  assert.strictEqual((visionModal as any).mechStatusCard, undefined, 'Mechanics status card must not exist in Galileo experiment');

  // Re-close and re-open
  visionModal.close();
  assert.strictEqual(visionModal.visible, false);
  visionModal.open();
  assert.strictEqual(visionModal.visible, true, 'Modal must reopen smoothly on demand');
  assert.strictEqual(visionModal.currentTab, 'physics');

  console.log('✓ Test 7 passed: Galileo experiment opens mechanics catalog without status card\n');
}

console.log('========================================================');
console.log('All Modal Page Retention Tests Passed (7/7)!');
console.log('========================================================\n');
