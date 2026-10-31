import assert from 'node:assert';
import { OpticalPhysics } from '../src/scene/optics/OpticalPhysics.ts';
import {
  DISPERSION_BENCH,
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
  assert.ok(flint.violet.hitU < flint.red.hitU, 'Violet deviates farther toward the prism base');
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
  assert.ok(telemetry.violetHitU < telemetry.redHitU);
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

  // 严密验证第二个实验器材已彻底移除（台面开阔纯净，仅保留灯箱、三棱镜台与白屏）
  const slitCarrier = bench.group.getObjectByName('SlitCarrier');
  assert.strictEqual(slitCarrier, undefined, 'SlitCarrier must be completely removed from the bench');

  const lampCarrier = bench.group.getObjectByName('LampCarrier');
  const prismMount = bench.group.getObjectByName('PrismMount');
  const screenCarrier = bench.group.getObjectByName('ScreenCarrier');
  assert.ok(lampCarrier, 'LampCarrier must exist');
  assert.ok(prismMount, 'PrismMount carrier must exist');
  assert.ok(screenCarrier, 'ScreenCarrier must exist');

  bench.dispose();
  console.log('✓ Bench telemetry and complete removal of second apparatus verified');
}

{
  const bench = new OpticalDispersionBenchMesh();
  const glass = bench.group.getObjectByName('DispersionPrism') as THREE.Mesh;
  const tray = bench.group.getObjectByName('PrismSupportTray')!;
  const incident = new THREE.Vector3(1, 0, 0);
  const origin = new THREE.Vector3(DISPERSION_BENCH.lampX + 0.076, DISPERSION_BENCH.beamY, 0);
  for (const material of ['quartz', 'crown', 'bariumFlint', 'flint', 'diamond'] as const) {
    bench.setMaterial(material);
    for (const angle of [42, 50, 58, 67.8, 82]) {
      bench.setIncidentAngle(angle);
      bench.group.updateMatrixWorld(true);
      const hits = new THREE.Raycaster(origin, incident).intersectObject(glass, false);
      assert.ok(hits.length > 0, 'Fixed horizontal source meets the real glass mesh');
      const normal = hits[0].face!.normal.clone().transformDirection(glass.matrixWorld);
      const measured = THREE.MathUtils.radToDeg(Math.acos(-incident.dot(normal)));
      assert.ok(Math.abs(measured - angle) < 1e-5, 'Readout equals the angle measured from the actual mesh normal');
      const projection = bench.getProjection();
      assert.ok(hits[0].point.distanceTo(projection.red.entry) < 1e-7, 'Tracer entrance agrees with mesh raycast');
      for (const ray of projection.rays) {
        const n = ray.refractiveIndex;
        for (let i = 0; i < ray.interfaces.length; i++) {
          const hit = ray.interfaces[i];
          const sinI = hit.incoming.clone().cross(hit.normal).length();
          const sinO = hit.outgoing.clone().cross(hit.normal).length();
          if (hit.tir) {
            assert.ok(n * sinI > 1, 'TIR occurs only beyond the critical angle');
            assert.ok(Math.abs(hit.incoming.dot(hit.normal) + hit.outgoing.dot(hit.normal)) < 1e-10,
              'Internal reflection reverses the normal component');
          } else {
            const [nIn, nOut] = i === 0 ? [1, n] : [n, 1];
            assert.ok(Math.abs(nIn * sinI - nOut * sinO) < 1e-10, 'Snell law holds at every transmission');
          }
          assert.ok(Math.abs(hit.point.y - DISPERSION_BENCH.beamY) < 1e-10, 'The complete ray remains horizontal');
        }
        if (ray.primaryExit) {
          const analytic = OpticalPhysics.tracePrismRay(ray.wavelengthNm, angle, 60, material);
          assert.ok(Math.abs(ray.deviationDeg - analytic.deviationAngleDeg) < 1e-8,
            'Vector trace agrees with the independent prism deviation formula');
        }
        if (ray.onScreen) {
          const normalDistance = ray.hit!.clone().sub(projection.screenCenter).dot(projection.screenNormal);
          assert.ok(Math.abs(normalDistance + DISPERSION_BENCH.screenFaceZ) < 1e-10,
            'Screen spots lie on the physical receiving face');
        }
      }
      const glassBounds = new THREE.Box3().setFromObject(glass);
      for (const name of ['PrismSupportPost', 'PrismBearing']) {
        const fixed = new THREE.Box3().setFromObject(bench.group.getObjectByName(name)!);
        assert.ok(!fixed.intersectsBox(glassBounds), 'Fixed bearings remain below the glass');
        assert.ok(!fixed.intersectsBox(new THREE.Box3().setFromObject(tray)), 'Bearings clear the rotating tray');
      }
    }
  }
  assert.ok(Math.abs(OpticalPhysics.getPrismRefractiveIndex(587.6, 'diamond') - 2.4175) < 0.0001,
    'Diamond uses its physical refractive index');
  bench.setMaterial('diamond');
  bench.setIncidentAngle(58);
  assert.ok(bench.getProjection().rays.every(ray => ray.tir && !ray.onScreen),
    'A 60-degree diamond prism does not invent direct transmission below its critical-angle constraint');
  bench.setMaterial('flint');
  bench.setIncidentAngle(58);
  for (const distance of [0.2, 0.38, 0.5]) {
    bench.setScreenDistance(distance);
    const projection = bench.getProjection();
    const fan = bench.group.getObjectByName('DispersionSpectrumFan') as THREE.Mesh;
    const positions = fan.geometry.getAttribute('position');
    let checked = 0;
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      if (point.distanceTo(projection.screenCenter) > 0.15) continue;
      assert.ok(Math.abs(point.sub(projection.screenCenter).dot(projection.screenNormal) + DISPERSION_BENCH.screenFaceZ) < 5e-8,
        'Both surfaces of the coloured fan end on the receiver');
      checked++;
    }
    assert.ok(checked > 0);
  }
  bench.setLampOn(false);
  assert.strictEqual(bench.group.getObjectByName('DispersionSpectrumFan')!.visible, false);
  assert.ok(bench.group.getObjectByName('DispersionBeams')!.children.every(mesh => !mesh.visible), 'Lamp off hides every light path');
  bench.dispose();
  console.log('✓ Mesh normals, Snell law, analytic deviation, TIR, diamond index, apparatus clearance and screen intersections');
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
  assert.strictEqual(rootPos.z, 0.72, 'Apparatus is closer to the operator edge');

  const bench = exp.getBench();
  const box = new THREE.Box3().setFromObject(bench.group);
  const stageY = 0.908;
  const footBottomWorldY = stageY + rootPos.y + box.min.y * scale;
  assert.ok(
    Math.abs(footBottomWorldY - HOLO_TABLE_TOP_Y) < 0.002,
    `Bench feet must rest flush on tabletop (got ${footBottomWorldY}, expected ${HOLO_TABLE_TOP_Y})`
  );

  let maxRadius = 0;
  // Check physical components individually: an overall XZ bounding box includes empty corners between the arms.
  for (const material of ['quartz', 'crown', 'bariumFlint', 'flint', 'diamond'] as const) {
    bench.setMaterial(material);
    for (const angle of [42, 50, 58, 67.8, 82]) {
      bench.setIncidentAngle(angle);
      bench.setScreenDistance(0.5);
      bench.group.updateWorldMatrix(true, true);
      const inverseBench = bench.group.matrixWorld.clone().invert();
      bench.group.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.geometry) return;
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox!;
        if (bounds.isEmpty()) return;
        const toBench = inverseBench.clone().multiply(mesh.matrixWorld);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(toBench);
          const radius = Math.hypot(rootPos.x + point.x * scale, rootPos.z + point.z * scale);
          maxRadius = Math.max(maxRadius, radius);
          assert.ok(radius < HOLO_TABLE_RADIUS - 0.10,
            `${mesh.name} stays on table at ${material}/${angle}° (r=${radius.toFixed(3)})`);
        }
      });
      const swivel = bench.group.getObjectByName('DispersionRailSwivel')!;
      const arm = bench.group.getObjectByName('DispersionReceivingArm')!;
      assert.ok(swivel.position.distanceTo(arm.position) < 1e-10, 'Receiving arm rotates around the common joint centre');
      const rail = bench.group.getObjectByName('DispersionReceivingRail')!;
      const carrier = bench.screenCarrier;
      const local = rail.worldToLocal(carrier.getWorldPosition(new THREE.Vector3()));
      assert.ok(Math.abs(local.z) < 1e-8, 'Screen carrier remains centred on its rail during all rotations');
    }
  }
  console.log(`  Closest apparatus clearance to table edge: ${(HOLO_TABLE_RADIUS - maxRadius).toFixed(3)} m`);
  exp.dispose(mockContext);
  console.log('✓ Optics dispersion apparatus strictly bounded within HoloTable radius');
}

console.log('\nAll dispersion tests passed.');
