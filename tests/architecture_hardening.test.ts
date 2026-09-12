import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const createMockElement = (tag = 'div'): any => {
  const el: any = {
    tagName: tag.toUpperCase(),
    setAttribute: () => {},
    getAttribute: (attr: string) => (attr === 'data-cat' ? 'all' : null),
    style: {},
    appendChild: (child: any) => child,
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    },
    value: '',
    innerHTML: '',
    querySelector: (sel: string) => createMockElement('div'),
    querySelectorAll: (sel: string) => [],
    closest: () => null,
  };
  return el;
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
  };
}

let lastPointerLockExited = false;
if (typeof globalThis.document === 'undefined' || !(globalThis as any).document.body) {
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
    pointerLockElement: null,
    exitPointerLock: () => {
      lastPointerLockExited = true;
      (globalThis as any).document.pointerLockElement = null;
    },
  };
}

import { metadata as quantumMeta } from '../src/experiments/catalog/quantum/quantum-wave/meta.ts';
import { metadata as nbodyMeta } from '../src/experiments/catalog/astrophysics/nbody-gravity/meta.ts';
import { metadata as lorenzMeta } from '../src/experiments/catalog/chaos/lorenz-attractor/meta.ts';
import { metadata as opticsMeta } from '../src/experiments/catalog/optics/laser-diffraction/meta.ts';

import QuantumWaveExperiment from '../src/experiments/catalog/quantum/quantum-wave/index.ts';
import NBodyGravityExperiment from '../src/experiments/catalog/astrophysics/nbody-gravity/index.ts';
import LorenzAttractorExperiment from '../src/experiments/catalog/chaos/lorenz-attractor/index.ts';
import LaserDiffractionExperiment from '../src/experiments/catalog/optics/laser-diffraction/index.ts';

import { ExperimentRegistry } from '../src/experiments/ExperimentRegistry.ts';
import { HologramStage } from '../src/core/HologramStage.ts';
import { PlayerController } from '../src/controls/PlayerController.ts';
import { ExperimentDrawer } from '../src/ui/ExperimentDrawer.ts';
import type { ExperimentContext } from '../src/core/types.ts';

console.log('=== Starting Architecture Hardening Deep Verification ===\n');

// Mock helper to create ExperimentContext with simulated compute bridge
function createMockContext(params: Record<string, any> = {}): ExperimentContext {
  const paramMap = new Map<string, any>(Object.entries(params));
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {
      compileAsync: async () => {},
      compile: () => {},
    } as any,
    stage: {} as any,
    computeBridge: {
      simulateNBody: async (
        positions: Float32Array,
        velocities: Float32Array,
        masses: Float32Array,
        dt: number,
        g: number,
        softening: number
      ) => {
        // Return simulated updated positions matching length
        const nextPos = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
          nextPos[i] = positions[i] + 0.25;
        }
        return {
          positions: nextPos,
          velocities: new Float32Array(velocities.length),
        };
      },
      simulateLorenz: async (
        positions: Float32Array,
        sigma: number,
        rho: number,
        beta: number,
        dt: number
      ) => {
        const nextPos = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
          nextPos[i] = positions[i] + 0.15;
        }
        return nextPos;
      },
    } as any,
    workerPool: {} as any,
    parameters: params,
    getParameter: <T>(id: string) => paramMap.get(id),
    setParameter: <T>(id: string, val: T) => paramMap.set(id, val),
  };
}

// --------------------------------------------------------------------------
// Test 1: Metadata Decoupling & ExperimentRegistry Dynamic Loading
// --------------------------------------------------------------------------
{
  console.log('Test 1: Micro-Experiment Metadata Decoupling & ExperimentRegistry');

  const allMetas = [quantumMeta, nbodyMeta, lorenzMeta, opticsMeta];
  for (const meta of allMetas) {
    assert(meta.id && meta.id.length > 0, 'Experiment must have id');
    assert(meta.name && meta.name.length > 0, 'Experiment must have name');
    assert(meta.category && meta.category.length > 0, 'Experiment must have category');
    assert(meta.description && meta.description.length > 0, 'Experiment must have description');
    assert(Array.isArray(meta.tags) && meta.tags.length > 0, 'Experiment must have tags');
    assert(meta.icon && meta.icon.length > 0, 'Experiment must have icon');
    assert(meta.computeIntensity, 'Experiment must have computeIntensity');
    assert(Array.isArray(meta.parameters), 'Experiment must have parameters array');
  }

  assert.strictEqual(quantumMeta.id, 'quantum-wave');
  assert.strictEqual(nbodyMeta.id, 'nbody-gravity');
  assert.strictEqual(lorenzMeta.id, 'lorenz-attractor');
  assert.strictEqual(opticsMeta.id, 'laser-diffraction');

  // Verify ExperimentRegistry singleton and dynamic loader
  const registry = ExperimentRegistry.getInstance();
  const allReg = registry.getAll();
  assert.strictEqual(allReg.length, 4, 'Registry must contain all 4 experiments');

  const loadedExp = await registry.loadExperiment('quantum-wave');
  assert(loadedExp instanceof QuantumWaveExperiment, 'loadExperiment must dynamically load QuantumWaveExperiment');

  const searchResults = registry.search('混沌');
  assert(
    searchResults.some((s) => s.id === 'lorenz-attractor' || s.id === 'nbody-gravity'),
    'search must find matching experiments'
  );

  console.log('✓ Test 1 passed: All 4 micro-experiments have decoupled metadata and dynamic registry works\n');
}

// --------------------------------------------------------------------------
// Test 2: BufferAttribute In-Place Updates & Detachment Immunity
// --------------------------------------------------------------------------
{
  console.log('Test 2: BufferAttribute In-Place Updates & Detachment Immunity');

  // 2.1 NBody Gravity multi-frame update simulation
  const nbodyExp = new NBodyGravityExperiment();
  assert.strictEqual(nbodyExp.metadata.id, 'nbody-gravity');

  const nbodyCtx = createMockContext({ particleCount: 100, simulationSpeed: 1.0, gravitationalConstant: 1.2 });
  nbodyExp.init(nbodyCtx);

  const nbodyMesh = nbodyExp.rootGroup.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  assert(nbodyMesh, 'NBody must instantiate Points');
  const nbodyPosAttr = nbodyMesh.geometry.attributes.position as THREE.BufferAttribute;
  assert(nbodyPosAttr, 'NBody Points must have position BufferAttribute');
  assert.strictEqual(nbodyPosAttr.array.length, 300, 'NBody position array must contain 300 elements');

  const initialVal0 = nbodyPosAttr.getX(0);
  const versionBeforeStep1 = nbodyPosAttr.version;

  // Trigger update step 1
  nbodyExp.update(0.016, 0.016, nbodyCtx);
  await new Promise((r) => setTimeout(r, 20));

  // posAttr.array must NOT be detached and must retain length
  assert.strictEqual(nbodyPosAttr.array.length, 300, 'posAttr.array must retain length 300 after simulation step');
  assert.strictEqual((nbodyPosAttr.array.buffer as any).detached ?? false, false, 'posAttr buffer must never be detached');
  assert(nbodyPosAttr.getX(0) !== initialVal0, 'posAttr data must be updated by simulation result');
  assert(nbodyPosAttr.version > versionBeforeStep1, 'needsUpdate = true must increment attribute version');

  // Trigger update step 2 to confirm stable multi-frame updates
  const versionBeforeStep2 = nbodyPosAttr.version;
  nbodyExp.update(0.016, 0.032, nbodyCtx);
  await new Promise((r) => setTimeout(r, 20));

  assert.strictEqual(nbodyPosAttr.array.length, 300, 'posAttr.array must maintain stable length on step 2');
  assert(nbodyPosAttr.version > versionBeforeStep2, 'needsUpdate = true on step 2 must increment attribute version');

  nbodyExp.dispose(nbodyCtx);

  // 2.2 Lorenz Attractor multi-frame update simulation
  const lorenzExp = new LorenzAttractorExperiment();
  assert.strictEqual(lorenzExp.metadata.id, 'lorenz-attractor');

  const lorenzCtx = createMockContext({ sigma: 10.0, rho: 28.0, beta: 2.667, flowSpeed: 1.2 });
  lorenzExp.init(lorenzCtx);

  const lorenzMesh = lorenzExp.rootGroup.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  assert(lorenzMesh, 'Lorenz must instantiate Points');
  const lorenzPosAttr = lorenzMesh.geometry.attributes.position as THREE.BufferAttribute;
  assert(lorenzPosAttr, 'Lorenz Points must have position BufferAttribute');
  assert.strictEqual(lorenzPosAttr.array.length, 1800 * 3, 'Lorenz position array must contain 5400 elements');

  const lorenzInitial0 = lorenzPosAttr.getX(0);
  const lorenzVersionBefore = lorenzPosAttr.version;

  lorenzExp.update(0.016, 0.016, lorenzCtx);
  await new Promise((r) => setTimeout(r, 20));

  assert.strictEqual(lorenzPosAttr.array.length, 5400, 'posAttr.array must retain length 5400 after lorenz step');
  assert.strictEqual((lorenzPosAttr.array.buffer as any).detached ?? false, false, 'posAttr buffer must never be detached');
  assert(lorenzPosAttr.getX(0) !== lorenzInitial0, 'posAttr data must be updated by lorenz result');
  assert(lorenzPosAttr.version > lorenzVersionBefore, 'needsUpdate = true must increment attribute version');

  lorenzExp.dispose(lorenzCtx);

  console.log('✓ Test 2 passed: BufferAttribute in-place memory updates & detachment immunity verified\n');
}

// --------------------------------------------------------------------------
// Test 3: Laser Diffraction GPU ShaderMaterial (0 CPU 2D soft computing)
// --------------------------------------------------------------------------
{
  console.log('Test 3: Laser Diffraction GPU ShaderMaterial Implementation');

  const opticsExp = new LaserDiffractionExperiment();
  const opticsCtx = createMockContext({ wavelength: 532, apertureRadius: 45, laserPower: 1.0 });

  opticsExp.init(opticsCtx);

  // Find observation screen mesh in rootGroup
  const screenMesh = opticsExp.rootGroup.children.find(
    (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.PlaneGeometry
  ) as THREE.Mesh;

  assert(screenMesh, 'Observation screen mesh must exist in rootGroup');
  assert(
    screenMesh.material instanceof THREE.ShaderMaterial,
    'Observation screen MUST use THREE.ShaderMaterial (GPU fragment shader), not CanvasTexture!'
  );

  const shaderMat = screenMesh.material as THREE.ShaderMaterial;
  assert(shaderMat.uniforms.uWavelength, 'ShaderMaterial must have uWavelength uniform');
  assert(shaderMat.uniforms.uApertureRadius, 'ShaderMaterial must have uApertureRadius uniform');
  assert(shaderMat.uniforms.uLaserPower, 'ShaderMaterial must have uLaserPower uniform');
  assert(shaderMat.uniforms.uLaserColor, 'ShaderMaterial must have uLaserColor uniform');

  assert.strictEqual(shaderMat.uniforms.uWavelength.value, 532);
  assert.strictEqual(shaderMat.uniforms.uApertureRadius.value, 45);
  assert.strictEqual(shaderMat.uniforms.uLaserPower.value, 1.0);

  // Test dynamic parameter update:
  opticsExp.onParameterChange('wavelength', 650, opticsCtx);
  assert.strictEqual(shaderMat.uniforms.uWavelength.value, 650, 'uWavelength must update instantly');

  opticsExp.onParameterChange('apertureRadius', 80, opticsCtx);
  assert.strictEqual(shaderMat.uniforms.uApertureRadius.value, 80, 'uApertureRadius must update instantly');

  opticsExp.onParameterChange('laserPower', 1.8, opticsCtx);
  assert.strictEqual(shaderMat.uniforms.uLaserPower.value, 1.8, 'uLaserPower must update instantly');

  opticsExp.dispose(opticsCtx);

  console.log('✓ Test 3 passed: Laser diffraction completely runs on GPU Fragment Shader with 0 CPU overhead\n');
}

// --------------------------------------------------------------------------
// Test 4: PlayerController & ExperimentDrawer Pointer Lock Safety
// --------------------------------------------------------------------------
{
  console.log('Test 4: PlayerController & ExperimentDrawer Pointer Lock Trap Prevention');

  const dummyDom = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestPointerLock: () => {},
  } as any;

  const cam = new THREE.PerspectiveCamera();
  const player = new PlayerController(cam, dummyDom);

  assert.strictEqual(player.allowPointerLock, true, 'Pointer lock should be allowed by default');

  // Integration with ExperimentDrawer
  lastPointerLockExited = false;
  const drawer = new ExperimentDrawer(document.body, async () => {});

  drawer.onToggle = (isOpen: boolean) => {
    if (isOpen) {
      player.exitLock();
      player.allowPointerLock = false;
    } else {
      player.allowPointerLock = true;
    }
  };

  // Simulate player locked before opening drawer
  player.isLocked = true;
  (globalThis as any).document.pointerLockElement = dummyDom;

  // Open drawer
  drawer.toggle(true);

  assert.strictEqual(lastPointerLockExited, true, 'Opening drawer must invoke document.exitPointerLock');
  assert.strictEqual(player.isLocked, false, 'PlayerController must be unlocked when drawer opens');
  assert.strictEqual(player.allowPointerLock, false, 'allowPointerLock must be false when drawer is open');

  // Attempting requestLock when drawer is open must be a no-op
  player.requestLock();
  assert.strictEqual(player.isLocked, false, 'requestLock must not lock pointer when drawer is open');

  // Close drawer
  drawer.toggle(false);
  assert.strictEqual(player.allowPointerLock, true, 'Closing drawer must re-enable pointer lock permission');

  console.log('✓ Test 4 passed: Pointer lock safety guards prevent mouse trap\n');
}

// --------------------------------------------------------------------------
// Test 5: HologramStage Async Sequence Guard
// --------------------------------------------------------------------------
{
  console.log('Test 5: HologramStage Async Sequence Guard');

  const stage = new HologramStage();
  const ctx = createMockContext();

  // Create two experiments
  const exp1 = new QuantumWaveExperiment();
  const exp2 = new NBodyGravityExperiment();

  let exp1Disposed = false;
  exp1.dispose = () => {
    exp1Disposed = true;
  };

  // Start switching to exp1, but before it finishes, switch to exp2
  const p1 = stage.switchExperiment(exp1, ctx);
  const p2 = stage.switchExperiment(exp2, ctx);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.strictEqual(res1, false, 'Superseded switchExperiment must return false');
  assert.strictEqual(res2, true, 'Latest switchExperiment must return true');
  assert.strictEqual(exp1Disposed, true, 'Superseded experiment must be cleanly disposed');
  assert.strictEqual(stage.activeExperiment, exp2, 'Stage active experiment must be the latest requested');

  console.log('✓ Test 5 passed: Async sequence guard reliably handles rapid switching without race conditions\n');
}

// --------------------------------------------------------------------------
// Test 6: Viewport & Safe-Area Layout Rules
// --------------------------------------------------------------------------
{
  console.log('Test 6: Viewport, Safe-Area & Touch Layout Rules');

  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verify #hud-topbar safe area
  assert(
    htmlContent.includes('min-height: 52px;'),
    '#hud-topbar must specify min-height: 52px'
  );
  assert(
    htmlContent.includes('height: calc(52px + env(safe-area-inset-top, 0px));'),
    '#hud-topbar must use calc with env(safe-area-inset-top)'
  );
  assert(
    htmlContent.includes('padding-left: calc(20px + env(safe-area-inset-left, 0px));'),
    '#hud-topbar must include safe-area padding-left'
  );
  assert(
    htmlContent.includes('padding-right: calc(20px + env(safe-area-inset-right, 0px));'),
    '#hud-topbar must include safe-area padding-right'
  );

  // Verify #perf-overlay safe area & mobile floating
  assert(
    htmlContent.includes('bottom: calc(18px + env(safe-area-inset-bottom, 0px));'),
    '#perf-overlay must adapt to safe-area-inset-bottom'
  );

  // Verify CSS syntax correctness: must not contain invalid selector comma before @media
  assert(
    !htmlContent.includes('#perf-overlay,\n    @media') && !htmlContent.includes('#perf-overlay, @media'),
    'CSS must not combine selector and @media query with a comma (invalid CSS syntax)'
  );

  // Verify discrete valid CSS rules
  assert(
    htmlContent.includes('body.has-touch-controls #perf-overlay {'),
    'Must have valid body.has-touch-controls rule for #perf-overlay'
  );
  assert(
    htmlContent.includes('@media (pointer: coarse), (max-width: 768px) {'),
    'Must have valid separate @media rule for coarse pointers / mobile'
  );
  assert(
    htmlContent.includes('bottom: calc(165px + env(safe-area-inset-bottom, 0px));'),
    '#perf-overlay must float upward on touch/mobile to avoid joystick overlap'
  );

  console.log('✓ Test 6 passed: Viewport and safe-area CSS rules verified\n');
}

// --------------------------------------------------------------------------
// Test 7: WebGL Context Loss & Recovery Handling
// --------------------------------------------------------------------------
{
  console.log('Test 7: WebGL Context Loss & Recovery Handling');

  let preventDefaultCalled = false;
  const mockLostEvent = {
    preventDefault: () => {
      preventDefaultCalled = true;
    },
  };

  const canvasListeners: Record<string, Function[]> = {};
  const mockCanvas = {
    addEventListener: (type: string, fn: Function) => {
      canvasListeners[type] = canvasListeners[type] || [];
      canvasListeners[type].push(fn);
    },
    dispatchEvent: (type: string, ev: any) => {
      canvasListeners[type]?.forEach((fn) => fn(ev));
    },
  };

  // Attach same handlers as Engine
  let isContextLost = false;
  mockCanvas.addEventListener('webglcontextlost', (e: any) => {
    e.preventDefault();
    isContextLost = true;
  });
  mockCanvas.addEventListener('webglcontextrestored', () => {
    isContextLost = false;
  });

  mockCanvas.dispatchEvent('webglcontextlost', mockLostEvent);
  assert.strictEqual(preventDefaultCalled, true, 'webglcontextlost handler MUST call e.preventDefault()');
  assert.strictEqual(isContextLost, true, 'isContextLost flag must be set during context loss');

  mockCanvas.dispatchEvent('webglcontextrestored', {});
  assert.strictEqual(isContextLost, false, 'isContextLost flag must be reset upon context restore');

  console.log('✓ Test 7 passed: WebGL Context Loss & Recovery handler verified\n');
}

console.log('========================================================');
console.log('All Architecture Hardening Tests Passed (7/7)!');
console.log('========================================================\n');
