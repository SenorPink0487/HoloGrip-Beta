import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController } from '../src/controls/PlayerController.ts';
import { TouchController } from '../src/controls/TouchController.ts';

class EventSurface {
  listeners = new Map<string, Function[]>();
  addEventListener(name: string, listener: Function) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string, event: any = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}
class MockElement extends EventSurface {
  id = '';
  innerHTML = '';
  style: any = {};
  parentElement: MockElement | null = null;
  children = new Map<string, MockElement>();
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach(n => this.classes.add(n)),
    remove: (...names: string[]) => names.forEach(n => this.classes.delete(n)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, value: boolean) => value ? this.classes.add(name) : this.classes.delete(name),
  };
  tagName: string;
  constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); }
  setAttribute() {}
  getAttribute() { return null; }
  appendChild(child: MockElement) { child.parentElement = this; }
  querySelector(selector: string): MockElement {
    if (!this.children.has(selector)) {
      const child = new MockElement();
      child.id = selector.slice(1);
      child.parentElement = this;
      this.children.set(selector, child);
    }
    return this.children.get(selector)!;
  }
  closest(selector: string): MockElement | null {
    for (let node: MockElement | null = this; node; node = node.parentElement) {
      if (selector.split(',').some(s => s.trim() === node!.tagName.toLowerCase() ||
        (node!.id && s.trim() === `#${node!.id}`))) return node;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 20, top: 600, width: 140, height: 140 }; }
}
const win: any = new EventSurface();
Object.assign(win, { innerWidth: 1024, innerHeight: 768, ontouchstart: null });
const doc: any = new EventSurface();
Object.assign(doc, { body: new MockElement('body'), head: new MockElement('head'),
  activeElement: null, hidden: false, pointerLockElement: null,
  createElement: (tag: string) => new MockElement(tag), getElementById: () => null });
(globalThis as any).window = win;
(globalThis as any).document = doc;
(globalThis as any).Element = MockElement;
const canvas = new MockElement('canvas');
const player = new PlayerController(new THREE.PerspectiveCamera(), canvas as any);
const controller: any = new TouchController(player);
const engine: any = { currentExperimentId: 'optics-reflection-refraction', isExperimentInteracting: false,
  visionModal: { visible: false }, hud: { drawer: { open: false } },
  isFreeCursorExperiment: (id: string | null) => Boolean(id) };
win.__ENGINE__ = engine;
const finger = (identifier: number, clientX = 600, clientY = 250) => ({ identifier, clientX, clientY });
const event = (changed: any[], touches = changed, target = canvas) => ({
  target, changedTouches: changed, touches, cancelable: true, prevented: false,
  preventDefault() { this.prevented = true; }, stopPropagation() {},
});
const start = (id = 1) => win.emit('touchstart', event([finger(id)]));
const end = (id = 1) => win.emit('touchend', event([finger(id)], []));

// An active experiment does not own a finger that started on the background.
const yaw = player.yaw;
const pitch = player.pitch;
start();
const jitter = event([finger(1, 607, 253)]);
win.emit('touchmove', jitter);
assert.equal(player.yaw, yaw, 'Tap jitter must not rotate the camera');
assert.equal(jitter.prevented, false, 'Tap jitter must not suppress a click');
win.emit('touchmove', event([finger(1, 625, 265)]));
assert(player.yaw < yaw, 'First movement past tap slop turns horizontally with an experiment loaded');
assert(player.pitch < pitch, 'Vertical fingertip movement changes the view pitch');
const firstYaw = player.yaw;
win.emit('touchmove', event([finger(1, 660, 280)]));
assert(player.yaw < firstYaw, 'Subsequent movement continues rotating');
end();
const releasedYaw = player.yaw;
win.emit('touchmove', event([finger(1, 700, 300)]));
assert.equal(player.yaw, releasedYaw, 'A released look gesture cannot keep rotating');

// A second finger grabbing an instrument cancels a previously started look.
start();
engine.isExperimentInteracting = true;
player.enabled = false;
win.emit('touchmove', event([finger(1, 650)]));
engine.isExperimentInteracting = false;
player.enabled = true;
win.emit('touchmove', event([finger(1, 700)]));
assert.equal(player.yaw, releasedYaw, 'Instrument ownership must not resume a stale camera drag');
end();

for (const blocked of ['instrument', 'modal', 'drawer', 'entry', 'whiteboard', 'handTracking', 'stereometry']) {
  engine.isExperimentInteracting = blocked === 'instrument';
  engine.visionModal.visible = blocked === 'modal';
  engine.hud.drawer.open = blocked === 'drawer';
  engine.labEntryActive = blocked === 'entry';
  engine.isWhiteboardMode = blocked === 'whiteboard';
  controller.isHandTrackingActive = blocked === 'handTracking';
  engine.currentExperimentId = blocked === 'stereometry' ? 'math-stereometry' : 'optics-reflection-refraction';
  start();
  win.emit('touchmove', event([finger(1, 650)]));
  assert.equal(player.yaw, releasedYaw, `${blocked} owns input instead of the camera`);
  end();
}
controller.isHandTrackingActive = false;
engine.currentExperimentId = 'optics-reflection-refraction';

// Menus and two-finger model gestures cannot initiate camera rotation.
const button = new MockElement('button');
win.emit('touchstart', event([finger(1)], undefined, button));
win.emit('touchmove', event([finger(1, 650)]));
assert.equal(player.yaw, releasedYaw);
win.emit('touchstart', event([finger(1), finger(2, 700)]));
win.emit('touchmove', event([finger(1, 650)], [finger(1, 650), finger(2, 700)]));
assert.equal(player.yaw, releasedYaw, 'A two-finger pinch cannot turn the camera');
end();

// Joystick navigation and a separate look finger remain usable together.
const joystickFinger = finger(10, 90, 630);
controller.joystickBase.emit('touchstart', event([joystickFinger], [joystickFinger], controller.joystickBase));
assert.equal(player.keys.forward, true);
win.emit('touchstart', event([finger(11)], [joystickFinger, finger(11)]));
win.emit('touchmove', event([finger(11, 640)], [joystickFinger, finger(11, 640)]));
assert(player.yaw < releasedYaw, 'Joystick touch is excluded from the look finger count');
win.emit('touchend', event([joystickFinger, finger(11)], []));
assert.equal(player.keys.forward, false);

for (const interruption of ['blur', 'visibilitychange']) {
  start();
  const before = player.yaw;
  if (interruption === 'blur') win.emit('blur');
  else { doc.hidden = true; doc.emit('visibilitychange'); doc.hidden = false; }
  win.emit('touchmove', event([finger(1, 700)]));
  assert.equal(player.yaw, before, `${interruption} cancels a look without a resume jump`);
  end();
}

console.log('✓ Touch camera: loaded experiment, yaw/pitch, jitter, instrument arbitration, UI, pinch, joystick and interruptions');
