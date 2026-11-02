import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDemonstrationDOM } from './helpers/demonstrationDom.ts';
import { DemonstrationPlayer } from '../src/experiments/demonstrations/DemonstrationPlayer.ts';
import { PHYSICS_DEMONSTRATION_IDS } from '../src/experiments/demonstrations/physicsDemonstrations.ts';
import type { ExperimentContext, IExperiment } from '../src/core/types.ts';
installDemonstrationDOM();

// State-machine invariants: captions cannot overtake physical completion.
{
  let ready = false, actions = 0;
  const player = new DemonstrationPlayer();
  player.load({ steps: [{ duration: 1, caption: '观察', enter: () => actions++, complete: () => ready }, { duration: 1, caption: '结论' }] });
  player.play(); player.beforeFrame(1); player.afterFrame();
  assert.equal(player.caption, '观察');
  player.pause(); player.beforeFrame(10); player.afterFrame();
  assert.equal(actions, 1); assert.equal(player.state, 'paused');
  player.play(); ready = true; player.beforeFrame(.1); player.afterFrame(); player.beforeFrame(.1);
  assert.equal(player.caption, '结论');
  player.pause(); player.takeOver(); assert.equal(player.state, 'manual'); assert.equal(player.caption, '');
  player.play(); assert.equal(player.state, 'manual', 'Edited physics requires a fresh run');
  player.load(null); assert.equal(player.available, false);
}

assert.equal(PHYSICS_DEMONSTRATION_IDS.length, 20);
for (const id of PHYSICS_DEMONSTRATION_IDS) {
  const { default: Experiment } = await import(`../src/experiments/catalog/${id}/index.ts`);
  const experiment: IExperiment = new Experiment();
  const parameters = new Map(experiment.metadata.parameters.map(p => [p.id, p.defaultValue]));
  const context = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } },
    stage: {}, parameters: {}, getParameter: (key: string) => parameters.get(key),
    setParameter: (key: string, value: unknown) => {
      const definition = experiment.metadata.parameters.find(parameter => parameter.id === key);
      if (definition?.type === 'select') assert(definition.options?.some(option => option.value === value), `${id}: valid ${key}=${value}`);
      if (definition?.type === 'range' && typeof value === 'number') {
        assert(Number.isFinite(value) && value >= (definition.min ?? -Infinity) - 1e-6 && value <= (definition.max ?? Infinity) + 1e-6, `${id}: ${key}=${value} inside instrument range`);
      }
      parameters.set(key, value);
    },
  } as unknown as ExperimentContext;
  await experiment.init(context);
  const demo = experiment.createDemonstration?.(context);
  assert(demo, `${id} has a demonstration`);
  const duration = demo.steps.reduce((sum, step) => sum + step.duration, 0);
  assert(duration >= 28 && duration <= 35, `${id} duration: ${duration}`);
  assert(demo.steps.every(step => step.caption && step.caption.split('\n').length <= 2));
  const player = new DemonstrationPlayer(); player.load(demo); player.play();
  let elapsed = 0;
  for (let frame = 0; frame < 2100 && player.state === 'playing'; frame++) {
    const delta = 1 / 60;
    player.beforeFrame(delta);
    const speed = player.simulationSpeed;
    for (let i = 0; i < Math.ceil(speed); i++) {
      const dt = delta * speed / Math.ceil(speed); elapsed += dt;
      experiment.update(dt, elapsed, context);
    }
    player.afterFrame();
  }
  assert.equal(player.state, 'completed', `${id}: state=${player.state}, caption=${player.caption}`);
  // Read rendered geometry as well as solver state; NaNs must never reach the GPU.
  experiment.rootGroup.traverse(object => {
    const mesh = object as THREE.Mesh;
    const position = mesh.geometry?.getAttribute('position');
    if (position) assert(Array.from(position.array).every(Number.isFinite), `${id}: finite ${object.name} geometry`);
  });
  experiment.dispose(context);
  console.log(`✓ ${id}: ${duration}s, real physics & apparatus completed`);
}
console.log('✓ All 20 physics demonstrations passed');
