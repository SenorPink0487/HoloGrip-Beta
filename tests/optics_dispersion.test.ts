import assert from 'node:assert';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import {
  OpticalDispersionBenchMesh,
  projectDispersionFan,
} from '../src/scene/optics/OpticalDispersionBenchMesh.ts';
import { metadata } from '../src/experiments/catalog/optics-dispersion/meta.ts';
import OpticsDispersionExperiment from '../src/experiments/catalog/optics-dispersion/index.ts';
import { HOLO_TABLE_RADIUS, HOLO_TABLE_TOP_Y } from '../src/scene/HoloTable.ts';
import * as THREE from 'three';
import { PhysicsDisciplineModal } from '../src/ui/vision/PhysicsDisciplineModal.ts';

const createMockElement = (): any => {
  const el: any = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      globalAlpha: 1,
      fillRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
    }),
  };
  return el;
};

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => createMockElement(),
    body: createMockElement(),
    pointerLockElement: null,
  };
}

console.log('=== 光的色散 ===\n');

{
  const flint = projectDispersionFan(58, 'flint', 0.38);
  const crown = projectDispersionFan(49.3, 'crown', 0.38);
  assert.ok(flint.violet.hitY > flint.red.hitY, 'Violet lands above red');
  assert.ok(flint.red.onScreen && flint.violet.onScreen, 'Default flint spectrum stays on the screen');
  assert.ok(flint.spectrumSpanM > crown.spectrumSpanM, 'Flint spreads farther than crown glass');
  assert.ok(Math.abs(flint.analysis.angularDispersionDeg - OpticalPhysics.calculatePrismSpectrum(58, 60, 'flint').angularDispersionDeg) < 1e-9);

  const near = projectDispersionFan(58, 'flint', 0.24);
  const far = projectDispersionFan(58, 'flint', 0.48);
  assert.ok(far.spectrumSpanM > near.spectrumSpanM, 'A farther screen widens the spectrum');

  const cutoff = projectDispersionFan(50, 'flint', 0.38);
  assert.strictEqual(cutoff.violet.tir, true, 'Violet end cuts off by total internal reflection');
  assert.strictEqual(cutoff.red.tir, false, 'Red still refracts at the same angle');
  console.log('✓ Spectrum order, material width, screen distance and TIR');
}

{
  const bench = new OpticalDispersionBenchMesh();
  const telemetry = bench.getTelemetry();
  assert.strictEqual(telemetry.lampOn, true);
  assert.strictEqual(telemetry.material, 'flint');
  assert.ok(telemetry.violetOnScreen && telemetry.redOnScreen);
  assert.ok(telemetry.violetHitY > telemetry.redHitY);
  assert.ok(telemetry.angularDispersionDeg > 5);

  bench.setScreenDistance(0.48);
  const wider = bench.getTelemetry().spectrumSpanM;
  bench.setScreenDistance(0.24);
  assert.ok(wider > bench.getTelemetry().spectrumSpanM);

  bench.setMaterial('quartz');
  assert.ok(bench.getTelemetry().angularDispersionDeg < telemetry.angularDispersionDeg);

  bench.setIncidentAngle(50);
  bench.setMaterial('flint');
  assert.strictEqual(bench.getTelemetry().hasPartialTIR, true);

  bench.setLampOn(false);
  assert.strictEqual(bench.getTelemetry().lampOn, false);
  bench.dispose();
  console.log('✓ Bench telemetry follows the prism solver');
}

{
  assert.strictEqual(metadata.id, 'optics-dispersion');
  assert.strictEqual(metadata.name, '光的色散');
  const entry = PhysicsDisciplineModal.OPTICS_EXPERIMENTS.find((item) => item.id === 'optics-dispersion');
  assert.ok(entry, '光的色散 is listed in the optics section');
  assert.strictEqual(entry?.name, '光的色散');
  console.log('✓ Catalog and discipline modal include 光的色散');
}

{
  // Test tabletop containment & flush placement
  const exp = new OpticsDispersionExperiment();
  const mockContext: any = { setParameter: () => {} };
  exp.init(mockContext);

  const scale = exp.targetScale;
  const rootPos = exp.rootGroup.position;
  assert.strictEqual(scale, 1.80, 'Bench scale must be 1.80 to fit within HoloTable');
  assert.strictEqual(rootPos.z, 1.05, 'Bench must be positioned at Z=1.05');

  const bench = exp.getBench();
  const box = new THREE.Box3().setFromObject(bench.group);
  const stageY = 0.908;
  const footBottomWorldY = stageY + rootPos.y + box.min.y * scale;
  assert.ok(
    Math.abs(footBottomWorldY - HOLO_TABLE_TOP_Y) < 0.002,
    `Bench feet must rest flush on tabletop (got ${footBottomWorldY}, expected ${HOLO_TABLE_TOP_Y})`
  );

  for (const dist of [0.2, 0.38, 0.5]) {
    bench.setScreenDistance(dist);
    const currentBox = new THREE.Box3().setFromObject(bench.group);
    const corners = [
      [currentBox.min.x, currentBox.min.z],
      [currentBox.min.x, currentBox.max.z],
      [currentBox.max.x, currentBox.min.z],
      [currentBox.max.x, currentBox.max.z],
    ];
    for (const [cx, cz] of corners) {
      const wx = cx * scale;
      const wz = rootPos.z + cz * scale;
      const r = Math.hypot(wx, wz);
      assert.ok(
        r < HOLO_TABLE_RADIUS - 0.1,
        `All apparatus components must remain comfortably within HoloTable (r=${r.toFixed(3)} < ${HOLO_TABLE_RADIUS - 0.1})`
      );
    }
  }
  exp.dispose(mockContext);
  console.log('✓ Optics dispersion apparatus strictly bounded within HoloTable radius');
}

console.log('\nAll dispersion tests passed.');
