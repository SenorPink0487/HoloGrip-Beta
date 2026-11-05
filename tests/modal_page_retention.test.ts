import assert from 'node:assert';

// Mock DOM environment for Node.js
class MockDOMElement {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  private html: string = '';
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

  get innerHTML(): string {
    return this.html;
  }

  set innerHTML(value: string) {
    this.html = value;
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.elementCache.clear();
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
      for (const h of [...this.eventListeners[event]]) {
        h(e);
      }
    }
  }

  contains(element: MockDOMElement | null): boolean {
    for (let node = element; node; node = node.parentElement) if (node === this) return true;
    return false;
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
        el.parentElement = this;
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
        el.parentElement = this;
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

const documentListeners = new Map<string, ((event: any) => void)[]>();
const windowListeners = new Map<string, ((event: any) => void)[]>();
const listen = (store: Map<string, ((event: any) => void)[]>, type: string, callback: (event: any) => void) => {
  store.set(type, [...(store.get(type) ?? []), callback]);
};
let hitElement: MockDOMElement | null = null;
const mockDoc = {
  createElement: (tag: string) => new MockDOMElement(tag),
  body: new MockDOMElement('body'),
  documentElement: new MockDOMElement('html'),
  hidden: false,
  addEventListener: (type: string, callback: (event: any) => void) => listen(documentListeners, type, callback),
  removeEventListener: () => {},
  querySelector: () => null,
  elementFromPoint: () => hitElement,
};

(globalThis as any).Element = MockDOMElement;
(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  addEventListener: (type: string, callback: (event: any) => void) => listen(windowListeners, type, callback),
  removeEventListener: () => {},
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
};

import { VisionModal } from '../src/ui/vision/VisionModal.ts';
import { PeriodicTableModal } from '../src/ui/vision/PeriodicTableModal.ts';
import { ChemistryEngine } from '../src/chemistry/ChemistryEngine.ts';

console.log('=== Starting Modal Page Retention Verification ===\n');

const engine = new ChemistryEngine();
let selectedExpId = '';
let chemistrySelections = 0;

const visionModal = new VisionModal(engine, {
  onOpen: () => {},
  onClose: () => {},
  onSelectChemistry: () => { chemistrySelections++; },
  onSelectPhysicsExperiment: async (id: string) => {
    selectedExpId = id;
  },
});

// Test 1: In an optics experiment, modal is on Level 2 Optics. Closing and opening keeps Level 2 Optics.
{
  console.log('Test 1: Optics experiment Level 2 retention across close/open');
  visionModal.setCurrentExperimentId('optics-reflection-refraction');
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

// Test 5: While in a math experiment, user navigates to Level 2 mechanics and closes.
// Reopening MUST NOT hijack back to math; it must remain on Level 2 mechanics!
{
  console.log('Test 5: No hijacking back to active experiment tab if user closed from another page');
  visionModal.setCurrentExperimentId('math-stereometry');
  assert.strictEqual(visionModal.currentTab, 'math');

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
  assert.strictEqual(visionModal.currentTab, 'physics', 'Must not hijack back to math; must stay on physics');
  assert.strictEqual(physicsModal.getCurrentLevel(), 2, 'Must remain on Level 2');
  assert.strictEqual(physicsModal.getCurrentDiscipline(), 'mechanics', 'Must remain on Mechanics');

  console.log('✓ Test 5 passed: User navigation choice respected over background experiment type\n');
}

// Test 6: Switching experiment to optics updates activeTab and Level 2
{
  console.log('Test 6: Switching experiment sets appropriate default page');
  visionModal.setCurrentExperimentId('optics-reflection-refraction');
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

// Help must preserve the mounted controls and never select a background experiment.
{
  visionModal.setCurrentExperimentId('em-hall');
  visionModal.open();
  const modal = visionModal as any;
  const mountedControls = [...modal.bodyContainer.children];
  const selectedBeforeHelp = selectedExpId;
  visionModal.setTutorialEnabled(true);
  assert.strictEqual(visionModal.currentTab, 'tutorial');
  assert.strictEqual(visionModal.visible, true);
  assert.strictEqual(modal.tutorialPanel.selectedId, 'em-hall');
  assert.strictEqual(modal.bodyContainer.style.display, 'none');
  modal.tutorialPanel.selectGuide('optics-double-slit');
  assert.strictEqual(selectedExpId, selectedBeforeHelp, 'Browsing help must not load experiments');
  assert.strictEqual(modal.currentExperimentId, 'em-hall');
  visionModal.close();
  visionModal.open();
  assert.strictEqual(modal.tutorialPanel.selectedId, 'optics-double-slit', 'Reopening help preserves the guide');
  visionModal.setTutorialEnabled(false);
  assert.strictEqual(visionModal.currentTab, 'em');
  assert.strictEqual(modal.bodyContainer.style.display, '');
  assert.deepStrictEqual(modal.bodyContainer.children, mountedControls, 'Help must preserve mounted controls');
  assert.strictEqual(visionModal.hallCard.element.classList.contains('hidden'), false, 'Controls must become visible after reopening help');
  console.log('✓ Test 8 passed: Contextual help preserves experiment, controls and navigation\n');
}

{
  visionModal.switchTab('chemistry');
  const selectionsBeforeHelp = chemistrySelections;
  visionModal.setCurrentExperimentId('chemistry');
  visionModal.setTutorialEnabled(true);
  assert.strictEqual((visionModal as any).tutorialPanel.selectedId, 'chemistry');
  visionModal.setTutorialEnabled(false);
  assert.strictEqual(chemistrySelections, selectionsBeforeHelp, 'Exiting help must not reinitialize chemistry');
  assert.strictEqual(visionModal.currentTab, 'chemistry');
  // Explicit navigation takes precedence over the help mode.
  visionModal.setTutorialEnabled(true);
  visionModal.open('disciplines');
  assert.strictEqual(visionModal.isTutorialEnabled, false);
  assert.strictEqual(visionModal.currentTab, 'disciplines');
  visionModal.close();
  visionModal.setCurrentExperimentId('mech-free-fall');
  visionModal.setTutorialEnabled(true);
  assert.strictEqual(visionModal.visible, true, 'Help opens even when the spatial window is closed');
  assert.strictEqual((visionModal as any).tutorialPanel.page, 'physics', 'Help retains the currently viewed card directory');
  assert.strictEqual((visionModal as any).tutorialPanel.directory.getCurrentDiscipline(), 'mechanics');
  visionModal.setTutorialEnabled(false);
  visionModal.close();
  console.log('✓ Test 9 passed: Chemistry state, explicit navigation and closed-window help work\n');
}

{
  const modal = visionModal as any;
  let animations = 0;
  let cancellations = 0;
  const text = new MockDOMElement('p');
  (text as any).animate = (frames: any[]) => {
    assert.ok(frames.every(frame => !frame.transform.includes('scale')), 'Text transitions must not scale');
    animations++;
    return { cancel: () => { cancellations++; } };
  };
  const windowElement = modal.element;
  const frame = modal.element.querySelector('.vision-window-frame');
  const frameStyle = { ...frame.style };
  const windowScale = visionModal.scale;
  frame.animate = () => assert.fail('The holographic frame must never animate during tutorial switches');
  modal.bodyContainer.animate = () => assert.fail('The whole content area must not animate');
  modal.tutorialPanel.element.animate = () => assert.fail('The whole tutorial area must not animate');
  modal.bodyContainer.querySelectorAll = () => [text];
  modal.tutorialPanel.element.querySelectorAll = () => [text];
  (window as any).matchMedia = () => ({ matches: true });
  visionModal.setTutorialEnabled(true);
  visionModal.setTutorialEnabled(false);
  assert.strictEqual(animations, 0, 'Reduced motion must skip tutorial animations');
  (window as any).matchMedia = () => ({ matches: false });
  visionModal.setTutorialEnabled(true);
  visionModal.setTutorialEnabled(false);
  assert.strictEqual(animations, 2, 'Each mode change animates text only');
  assert.strictEqual(cancellations, 1, 'Rapid toggles cancel the previous text animation');
  assert.strictEqual(modal.element, windowElement, 'Both modes use the same holographic window');
  assert.deepStrictEqual(frame.style, frameStyle, 'Switches preserve window dimensions and transform');
  assert.strictEqual(visionModal.scale, windowScale, 'Switches preserve window scale');
  visionModal.close();
  assert.strictEqual(cancellations, 2, 'Closing cancels pending text animations');
  console.log('✓ Test 10 passed: Text-only transitions preserve the same window, dimensions and scale\n');
}

// The screenshot case: a math experiment remains mounted while browsing mechanics.
{
  visionModal.setCurrentExperimentId('math-stereometry');
  const modal = visionModal as any;
  modal.physicsModal.showLevel2('mechanics');
  visionModal.open('physics');
  const selectedBefore = selectedExpId;
  visionModal.setTutorialEnabled(true);
  const panel = modal.tutorialPanel;
  assert.strictEqual(panel.page, 'physics');
  assert.strictEqual(panel.directory.getCurrentLevel(), 2);
  assert.strictEqual(panel.directory.getCurrentDiscipline(), 'mechanics');
  const deck = panel.directory.element.querySelector('.optics-exp-deck');
  deck.scrollTop = 84;
  await panel.directory.callbacks.onSelectExperiment('mech-free-fall');
  assert.strictEqual(panel.page, 'guide', 'The existing experiment card opens its introduction');
  assert.strictEqual(panel.selectedId, 'mech-free-fall');
  assert.strictEqual(selectedExpId, selectedBefore, 'Reading the introduction must not load another apparatus');
  assert.strictEqual(modal.currentExperimentId, 'math-stereometry');
  for (const heading of ['实验目的', '实验原理', '操作步骤', '现象与结论', '实验条件']) {
    assert.ok(panel.detail.innerHTML.includes(heading), `Missing lesson section: ${heading}`);
  }
  assert.ok(panel.detail.innerHTML.includes('h = ½gt²'));
  assert.ok(!panel.element.innerHTML.includes('tutorial-sidebar'), 'Lessons must not contain a sidebar');
  modal.btnBack.dispatch('click');
  assert.strictEqual(panel.page, 'physics');
  assert.strictEqual(panel.directory.getCurrentDiscipline(), 'mechanics');
  assert.strictEqual(deck.scrollTop, 84, 'Returning preserves the directory scroll position');
  modal.btnBack.dispatch('click');
  assert.strictEqual(panel.directory.getCurrentLevel(), 1);
  modal.btnBack.dispatch('click');
  assert.strictEqual(panel.page, 'subjects');
  panel.subjects.callbacks.onSelectChemistry();
  assert.strictEqual(panel.selectedId, 'chemistry');
  panel.goBack();
  assert.strictEqual(panel.page, 'subjects');
  visionModal.setTutorialEnabled(false);
  assert.strictEqual(visionModal.currentTab, 'physics');
  assert.strictEqual(modal.physicsModal.getCurrentDiscipline(), 'mechanics');
  visionModal.close();
  console.log('✓ Test 11 passed: Card → introduction → original catalog; background experiment preserved\n');
}

// Outside short presses must follow exactly the same navigation as the existing back button.
{
  const physics = (visionModal as any).physicsModal;
  const background = new MockDOMElement('canvas');
  const container = new MockDOMElement(); container.id = 'webgl-container'; container.appendChild(background);
  const button = new MockDOMElement('button');
  const preview = new MockDOMElement('canvas');
  const inside = visionModal.element.querySelector('#vision-body-content') as unknown as MockDOMElement;
  let clock = 1000;
  const dispatch = (type: string, overrides: Record<string, any> = {}) => {
    const event = { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100,
      timeStamp: clock, target: background, ...overrides };
    for (const callback of documentListeners.get(type) ?? []) callback(event);
  };
  const press = (duration = 100, target: MockDOMElement = background) => {
    hitElement = target; dispatch('pointerdown', { target }); clock += duration;
    dispatch('pointerup', { target }); clock += 100;
  };
  const showList = () => {
    visionModal.open('physics'); physics.showLevel2('em');
    visionModal.setGestureNavigationEnabled(true); hitElement = background;
  };
  showList(); press();
  assert.strictEqual(physics.getCurrentLevel(), 1, 'One outside short press pops just one physics level');
  assert.strictEqual(visionModal.currentTab, 'physics');
  dispatch('click'); dispatch('click');
  assert.strictEqual(visionModal.currentTab, 'physics', 'Synthetic follow-up clicks cannot pop a second page');
  press(); assert.strictEqual(visionModal.currentTab, 'disciplines');
  press(); assert.strictEqual(visionModal.currentTab, 'disciplines', 'The root menu has no previous page');
  assert.strictEqual(visionModal.visible, true, 'Outside back does not close the menu');

  for (const tab of ['em', 'mechanics', 'thermo', 'beaker', 'chemistry'] as const) {
    visionModal.open(tab);
    (visionModal.element.querySelector('#btn-window-back') as any).dispatch('click');
    const expected = [visionModal.currentTab, physics.getCurrentLevel(), physics.getCurrentDiscipline()];
    visionModal.open(tab); press();
    assert.deepStrictEqual([visionModal.currentTab, physics.getCurrentLevel(), physics.getCurrentDiscipline()], expected,
      `${tab}: outside back and the header button must perform the same navigation`);
  }
  showList(); visionModal.setGestureNavigationEnabled(false); press();
  assert.strictEqual(physics.getCurrentLevel(), 2, 'Ordinary mouse mode must not enable the shortcut');
  showList(); press(250);
  assert.strictEqual(physics.getCurrentLevel(), 2, 'Long presses must not navigate');
  showList(); press(100, inside);
  assert.strictEqual(physics.getCurrentLevel(), 2, 'Blank areas inside the menu must not navigate');
  for (const target of [button, preview]) {
    showList(); press(100, target);
    assert.strictEqual(physics.getCurrentLevel(), 2, 'Buttons and the camera preview are not outside blank space');
  }
  showList(); dispatch('pointerdown'); clock += 20; dispatch('pointermove', { clientX: 140 });
  clock += 20; dispatch('pointermove'); clock += 20; dispatch('pointerup');
  assert.strictEqual(physics.getCurrentLevel(), 2, 'Dragging out and back cannot become a short press');
  showList(); dispatch('pointerdown'); hitElement = inside; clock += 100; dispatch('pointerup');
  assert.strictEqual(physics.getCurrentLevel(), 2, 'A captured canvas pointer ending inside the menu cannot navigate');
  showList(); dispatch('pointerdown'); hitElement = null; clock += 100; dispatch('pointerup');
  assert.strictEqual(physics.getCurrentLevel(), 2, 'Releasing outside the viewport cannot navigate');
  showList(); dispatch('pointerdown', { target: inside }); clock += 100; dispatch('pointerup');
  assert.strictEqual(physics.getCurrentLevel(), 2, 'A press starting inside the menu cannot become an outside press');

  for (const cancel of [
    () => dispatch('pointercancel'),
    () => dispatch('pointerdown', { pointerId: 2, isPrimary: false }),
    () => visionModal.cancelOutsideBackPress(),
    () => visionModal.setGestureNavigationEnabled(false),
    () => visionModal.setScale(1, false),
    () => { for (const callback of windowListeners.get('blur') ?? []) callback({}); },
    () => { mockDoc.hidden = true; for (const callback of documentListeners.get('visibilitychange') ?? []) callback({}); mockDoc.hidden = false; },
    () => { visionModal.close(); visionModal.open(); },
  ]) {
    showList(); dispatch('pointerdown'); clock += 50; cancel(); clock += 50; dispatch('pointerup');
    assert.strictEqual(physics.getCurrentLevel(), 2, 'Cancellation, scaling, mode changes and loss of focus must not navigate');
  }
  console.log('✓ Test 12 passed: Outside-menu gesture back, shared hierarchy, single-step navigation, drag, UI hits, cancellation and mode gating');
}

// Reagent navigation must retain the selected beaker and add to its engine.
{
  const left = new ChemistryEngine();
  const right = new ChemistryEngine();
  const modal = new VisionModal(left, { onOpen: () => {}, onClose: () => {} });
  modal.setEngines(left, right);
  assert.strictEqual(modal.activeBeakerId, 'left', 'The initial target remains the left beaker');
  const status = modal.experimentStatusCard;
  const periodic = modal.periodicTable;
  periodic.showToast = () => {};

  for (const beakerId of ['right', 'left'] as const) {
    const target = beakerId === 'right' ? right : left;
    const other = beakerId === 'right' ? left : right;
    modal.open('beaker');
    (status.element.querySelector(`#btn-select-beaker-${beakerId}`) as any).dispatch('click');

    for (const entry of ['#btn-empty-select-reagent', '#btn-to-periodic']) {
      const root = entry === '#btn-empty-select-reagent'
        ? status.element.querySelector('#solutes-cards-container')!
        : status.element;
      (root.querySelector(entry) as any).dispatch('click');
      assert.strictEqual(modal.currentTab, 'chemistry');
      assert.strictEqual(modal.activeBeakerId, beakerId, `${entry} must preserve the selected beaker`);
      assert.strictEqual(periodic.activeBeakerId, beakerId);
      assert.strictEqual(periodic.getActiveEngine(), target);
      assert.strictEqual(periodic.element.querySelector(`#btn-periodic-beaker-${beakerId}`)!.classList.contains('active'), true);

      modal.close();
      modal.open();
      assert.strictEqual(periodic.getActiveEngine(), target, 'Reopening must retain the reagent target');
      const volumeBefore = target.state.volume;
      const otherVolumeBefore = other.state.volume;
      periodic.openElementPopover(PeriodicTableModal.ELEMENTS[0]);
      const card = periodic.element.querySelector('#element-popover-card')!;
      (card.querySelector('.popover-reagent-row[data-reagent-id="HCl"]') as any).dispatch('click', { stopPropagation: () => {} });
      assert.strictEqual(target.state.volume, volumeBefore + ChemistryEngine.REAGENTS.HCl.defaultAmount);
      assert.strictEqual(other.state.volume, otherVolumeBefore, 'Reagent must leave the other beaker unchanged');
      (periodic.element.querySelector('#btn-periodic-view-analysis') as any).dispatch('click');
      assert.strictEqual(modal.currentTab, 'beaker');
      assert.strictEqual(status.currentActiveBeakerId, beakerId);
    }
  }
  modal.close();
  console.log('✓ Test 13 passed: Both reagent entry points, reopen, injection and analysis preserve the selected beaker');
}

console.log('========================================================');
console.log('All Modal Page Retention Tests Passed (13/13)!');
console.log('========================================================\n');
