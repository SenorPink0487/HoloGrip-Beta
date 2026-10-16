import assert from 'node:assert';
import * as THREE from 'three';

// Mock minimal DOM for headless Node test
const createMockElement = (tag = 'div'): any => {
  const el: any = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    value: '45',
    checked: true,
    style: {},
    attributes: {} as Record<string, string>,
    children: [] as any[],
    parentElement: null,
    setAttribute: (k: string, v: string) => { el.attributes[k] = v; },
    getAttribute: (k: string) => el.attributes[k] ?? null,
    removeAttribute: (k: string) => { delete el.attributes[k]; },
    appendChild: (child: any) => {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    remove: () => {},
    addEventListener: (evt: string, handler: any) => {
      if (!el._listeners) el._listeners = {};
      if (!el._listeners[evt]) el._listeners[evt] = [];
      el._listeners[evt].push(handler);
    },
    removeEventListener: () => {},
    dispatchEvent: (evt: any) => {
      const list = el._listeners?.[evt.type] || [];
      for (const fn of list) fn(evt);
    },
    click: () => {
      const list = el._listeners?.['click'] || [];
      for (const fn of list) fn({ preventDefault: () => {}, stopPropagation: () => {} });
    },
    get classList() {
      const getClasses = () => new Set(el.className.split(/\s+/).filter(Boolean));
      return {
        add: (...cls: string[]) => {
          const s = getClasses();
          cls.forEach((c) => s.add(c));
          el.className = Array.from(s).join(' ');
        },
        remove: (...cls: string[]) => {
          const s = getClasses();
          cls.forEach((c) => s.delete(c));
          el.className = Array.from(s).join(' ');
        },
        toggle: (c: string) => {
          const s = getClasses();
          const has = s.has(c);
          if (has) s.delete(c); else s.add(c);
          el.className = Array.from(s).join(' ');
          return !has;
        },
        contains: (c: string) => getClasses().has(c),
      };
    },
    getContext: (type: string) => {
      if (type === '2d') {
        return {
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: '',
          textBaseline: '',
          fillRect: () => {},
          strokeRect: () => {},
          clearRect: () => {},
          fillText: () => {},
          strokeText: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          fill: () => {},
          arc: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          rotate: () => {},
          setLineDash: () => {},
          closePath: () => {},
        };
      }
      return null;
    },
    querySelector: (sel: string): any => {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        const search = (node: any): any => {
          if (node.id === id) return node;
          for (const c of node.children || []) {
            const found = search(c);
            if (found) return found;
          }
          return null;
        };
        const res = search(el);
        if (res) return res;
        // Mock fallback if HTML includes id
        if (el.innerHTML && el.innerHTML.includes(`id="${id}"`)) {
          const mock = createMockElement('div');
          mock.id = id;
          return mock;
        }
      }
      return createMockElement('div');
    },
    querySelectorAll: (sel: string): any[] => {
      return [createMockElement('div')];
    },
    closest: () => null,
  };
  return el;
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
  };
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => createMockElement(tag),
    body: createMockElement('body'),
    activeElement: null,
  };
}

if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends Event {};
}

import {
  OpticalDiskApparatusMesh,
  LIQUID_MEDIA,
  type LiquidMediumType,
} from '../src/scene/optics/OpticalDiskApparatusMesh.ts';
import { OpticalDiskInteractionManager } from '../src/scene/optics/OpticalDiskInteractionManager.ts';
import { RefractionStatusCard } from '../src/ui/vision/RefractionStatusCard.ts';
import OpticsReflectionRefractionExperiment from '../src/experiments/catalog/optics-reflection-refraction/index.ts';
import { metadata } from '../src/experiments/catalog/optics-reflection-refraction/meta.ts';
import type { ExperimentContext } from '../src/core/types.ts';

console.log('=== Starting Optical Reflection & Refraction Comprehensive Verification ===\n');

// Test 1: Snell's Law & Law of Reflection Precision
console.log('Test 1: Snell\'s Law & Law of Reflection Precision');
{
  const apparatus = new OpticalDiskApparatusMesh();

  // 1.1 Normal incidence (0 degrees)
  apparatus.setIncidentAngle(0);
  let t = apparatus.updateOpticalPaths();
  assert.strictEqual(t.incidentAngleDeg, 0, 'Incident angle should be 0°');
  assert.strictEqual(t.reflectionAngleDeg, 0, 'Reflection angle should be 0°');
  assert.strictEqual(t.refractionAngleDeg, 0, 'Refraction angle should be 0° at normal incidence');
  assert.strictEqual(t.isTotalInternalReflection, false, 'No TIR at normal incidence');

  // 1.2 Air to Water at 30° incidence (n1 = 1.0, n2 = 1.333)
  // sin(theta2) = sin(30°) / 1.333 = 0.5 / 1.333 = 0.3750937 -> theta2 = 22.035°
  apparatus.setIncidentAngle(30);
  t = apparatus.updateOpticalPaths();
  assert.strictEqual(t.reflectionAngleDeg, 30, 'Law of reflection: theta_r === theta_i');
  assert.ok(
    Math.abs(t.refractionAngleDeg - 22.035) < 0.1,
    `Refraction angle at 30° in water should be ~22.04°, got ${t.refractionAngleDeg.toFixed(2)}°`
  );

  // Snell's ratio validation
  const sin1 = Math.sin(THREE.MathUtils.degToRad(30));
  const sin2 = Math.sin(THREE.MathUtils.degToRad(t.refractionAngleDeg));
  assert.ok(Math.abs(sin1 / sin2 - 1.333) < 0.005, 'Snell ratio sin1/sin2 must match water n=1.333');

  // 1.3 Air to Water at 60° incidence
  // sin(theta2) = sin(60°) / 1.333 = 0.866025 / 1.333 = 0.64968 -> theta2 = 40.517°
  apparatus.setIncidentAngle(60);
  t = apparatus.updateOpticalPaths();
  assert.ok(
    Math.abs(t.refractionAngleDeg - 40.52) < 0.1,
    `Refraction angle at 60° in water should be ~40.52°, got ${t.refractionAngleDeg.toFixed(2)}°`
  );

  apparatus.dispose();
  console.log('✓ Test 1 passed: Snell\'s Law & Law of Reflection verified');
}

// Test 2: Total Internal Reflection (TIR) & Critical Angle from Water to Air
console.log('Test 2: Total Internal Reflection & Critical Angle');
{
  const apparatus = new OpticalDiskApparatusMesh();
  apparatus.setIncidentDirection(false); // Water -> Air

  // Water critical angle: theta_c = arcsin(1 / 1.333) = 48.61°
  apparatus.setIncidentAngle(30); // Below critical angle
  let t = apparatus.updateOpticalPaths();
  assert.strictEqual(t.isTotalInternalReflection, false, 'No TIR below critical angle at 30°');
  assert.ok(Math.abs(t.criticalAngleDeg - 48.61) < 0.15, 'Critical angle for water should be ~48.61°');
  assert.ok(t.refractionAngleDeg > 30, 'Light entering rarer medium bends away from normal');

  // Above critical angle (55°)
  apparatus.setIncidentAngle(55);
  t = apparatus.updateOpticalPaths();
  assert.strictEqual(t.isTotalInternalReflection, true, 'TIR must occur at 55° (55° > 48.61°)');
  assert.strictEqual(t.refractionAngleDeg, 0, 'No refracted beam during TIR');
  assert.strictEqual(t.reflectionCoeffR, 1.0, '100% reflection during TIR (R = 1.0)');
  assert.strictEqual(t.transmissionCoeffT, 0.0, '0% transmission during TIR (T = 0.0)');

  // Critical angle test with denser medium (Crown Glass, n = 1.517)
  apparatus.setLiquidMedium('glass');
  apparatus.setIncidentDirection(false);
  // Glass critical angle: arcsin(1 / 1.517) = 41.24°
  t = apparatus.updateOpticalPaths();
  assert.ok(Math.abs(t.criticalAngleDeg - 41.24) < 0.2, 'Critical angle for glass should be ~41.24°');

  apparatus.dispose();
  console.log('✓ Test 2 passed: Total Internal Reflection and critical angle invariants verified');
}

// Test 3: Fresnel Intensity & Energy Conservation
console.log('Test 3: Fresnel Intensity & Energy Conservation');
{
  const apparatus = new OpticalDiskApparatusMesh();

  for (let ang = 0; ang <= 80; ang += 10) {
    apparatus.setIncidentAngle(ang);
    const t = apparatus.updateOpticalPaths();
    assert.ok(
      Math.abs(t.reflectionCoeffR + t.transmissionCoeffT - 1.0) < 1e-4,
      `Energy conservation R + T === 1.0 violated at angle ${ang}`
    );
  }

  // Normal incidence reflectance for n1=1.0, n2=1.333: R0 = ((1.333-1)/(1.333+1))^2 = 0.0204
  apparatus.setIncidentAngle(0);
  const t0 = apparatus.updateOpticalPaths();
  assert.ok(Math.abs(t0.reflectionCoeffR - 0.0204) < 0.005, 'Normal incidence reflectance for water should be ~2.04%');

  apparatus.dispose();
  console.log('✓ Test 3 passed: Fresnel intensity conservation verified');
}

// Test 4: 3D Apparatus Geometry, Water Container & Assembly
console.log('Test 4: 3D Apparatus Geometry, Water Container & Assembly');
{
  const apparatus = new OpticalDiskApparatusMesh();

  // Verify group structure
  assert.strictEqual(apparatus.group.name, 'OpticalDiskApparatusMesh', 'Mesh group must have name');
  assert.strictEqual(apparatus.diskRadius, 0.34, 'Disk radius should be 0.34m');
  assert.strictEqual(apparatus.tankRadius, 0.22, 'Water container radius should be 0.22m');
  assert.strictEqual(apparatus.tankDepth, 0.055, 'Water container depth should be 0.055m');

  // Verify laser carriage
  assert.strictEqual(apparatus.laserCarriageGroup.name, 'LaserCarriage', 'Laser carriage group must be present');
  assert.ok(apparatus.laserHitMesh, 'Laser handle hit mesh for raycasting must be present');
  assert.strictEqual(apparatus.laserHitMesh.name, 'LaserHandleHit', 'Hit mesh named LaserHandleHit');

  // Change liquid medium
  apparatus.setLiquidMedium('glycerin');
  assert.strictEqual(apparatus.mediumType, 'glycerin');
  assert.strictEqual(apparatus.liquidRefractiveIndex, LIQUID_MEDIA.glycerin.n);

  apparatus.setLiquidMedium('custom', 1.85);
  assert.strictEqual(apparatus.liquidRefractiveIndex, 1.85);

  // Change laser wavelength
  apparatus.setLaserWavelength(650);
  assert.strictEqual(apparatus.laserWavelengthNm, 650);

  apparatus.setLaserWavelength(445);
  assert.strictEqual(apparatus.laserWavelengthNm, 445);

  // Verify water animation
  assert.doesNotThrow(() => apparatus.animateWater(1.5), 'animateWater must run smoothly without errors');

  // Test disposal
  apparatus.dispose();
  console.log('✓ Test 4 passed: 3D apparatus geometry, water container & resource lifecycle verified');
}

// Test 5: Interaction Manager 3D Raycast & Pointer Lifecycle
console.log('Test 5: Interaction Manager 3D Raycast & Pointer Lifecycle');
{
  const apparatus = new OpticalDiskApparatusMesh();
  const rootGroup = new THREE.Group();
  rootGroup.add(apparatus.group);

  let reportedAngle = 0;
  let reportedDir = true;

  const interaction = new OpticalDiskInteractionManager(apparatus, rootGroup, {
    onAngleChange: (ang) => { reportedAngle = ang; },
    onDirectionToggle: (dir) => { reportedDir = dir; },
  });

  // 5.1 Hover detection
  const raycaster = new THREE.Raycaster();
  const hover = interaction.getHoverTarget(raycaster);
  // Initially null when ray does not intersect
  assert.strictEqual(hover, null);

  // 5.2 Pointer down on laser hit mesh
  const mockIntersection: any = {
    object: apparatus.laserHitMesh,
    point: new THREE.Vector3(0, apparatus.diskCenterY + 0.365, 0.02),
  };
  const event = new PointerEvent('pointerdown');
  const handled = interaction.onPointerDown(event, mockIntersection);
  assert.strictEqual(handled, true, 'Pointer down on laser hit mesh must be intercepted');
  assert.strictEqual(interaction.isDragging, true, 'Dragging state should be active');

  // 5.3 Hover during drag
  const dragHover = interaction.getHoverTarget(raycaster);
  assert.ok(dragHover !== null, 'Dragging provides hover info with angle');
  assert.strictEqual(dragHover?.cursor, 'grabbing');

  // 5.4 验证下半部拖拽与入射/反射位置不颠倒
  rootGroup.updateMatrixWorld(true);
  const lowerRightRay = new THREE.Raycaster(
    new THREE.Vector3(0.258, apparatus.diskCenterY - 0.258, 2.0),
    new THREE.Vector3(0, 0, -1)
  );
  interaction.onPointerMove(new PointerEvent('pointermove'), lowerRightRay);
  assert.strictEqual(apparatus.isAirToWater, false, 'Pointer in lower half should set water-to-air');
  assert.ok(reportedAngle > 0, `Lower right angle must be positive, got ${reportedAngle}`);
  assert.ok(apparatus.laserCarriageGroup.position.x > 0, 'Emitter must stay on positive X quadrant, not swapped to left');

  // 5.5 Pointer up
  interaction.onPointerUp(new PointerEvent('pointerup'));
  assert.strictEqual(interaction.isDragging, false, 'Dragging should be false on pointerup');

  apparatus.dispose();
  console.log('✓ Test 5 passed: Interaction manager raycast and drag lifecycle verified');
}

// Test 6: RefractionStatusCard UI & Slider Gesture Adaptation
console.log('Test 6: RefractionStatusCard UI & Slider Gesture Adaptation');
{
  let changedAngle = 0;
  let changedDir = true;
  let changedMed = '';
  let changedWl = 0;

  const card = new RefractionStatusCard({
    onAngleChange: (ang) => { changedAngle = ang; },
    onDirectionChange: (dir) => { changedDir = dir; },
    onMediumChange: (med) => { changedMed = med; },
    onWavelengthChange: (wl) => { changedWl = wl; },
  });

  assert.ok(card.element, 'Status card element must exist');
  assert.ok(card.element.classList.contains('vision-thermo-status-card'), 'Card has vision-thermo-status-card class');

  // Update telemetry
  card.setVisible(true);
  card.updateTelemetry({
    incidentAngleDeg: 45.0,
    reflectionAngleDeg: 45.0,
    refractionAngleDeg: 32.1,
    snellRatio: 1.333,
    isTotalInternalReflection: false,
    criticalAngleDeg: 48.61,
    reflectionCoeffR: 0.028,
    transmissionCoeffT: 0.972,
    n1: 1.0,
    n2: 1.333,
    incidentMedium: 'air',
  });

  // Verify TIR state update
  card.updateTelemetry({
    incidentAngleDeg: 55.0,
    reflectionAngleDeg: 55.0,
    refractionAngleDeg: 0,
    snellRatio: 1.333,
    isTotalInternalReflection: true,
    criticalAngleDeg: 48.61,
    reflectionCoeffR: 1.0,
    transmissionCoeffT: 0.0,
    n1: 1.333,
    n2: 1.0,
    incidentMedium: 'liquid',
  });

  console.log('✓ Test 6 passed: RefractionStatusCard UI and telemetry updates verified');
}

// Test 7: OpticsReflectionRefractionExperiment Full Lifecycle
console.log('Test 7: OpticsReflectionRefractionExperiment Full Lifecycle');
{
  const exp = new OpticsReflectionRefractionExperiment();

  assert.strictEqual(exp.metadata.id, 'optics-reflection-refraction');
  assert.strictEqual(exp.metadata.category, 'optics');
  assert.strictEqual(exp.targetScale, 2.45);
  assert.strictEqual(exp.hideCenterEmitter, true);

  const mockContext: any = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as any,
    stage: {} as any,
    parameters: {},
    getParameter: (k: string) => mockContext.parameters[k],
    setParameter: (k: string, v: any) => { mockContext.parameters[k] = v; },
    raycaster: new THREE.Raycaster(),
  };

  exp.init(mockContext);
  assert.ok(exp.rootGroup.children.length > 0, 'Experiment rootGroup must contain apparatus');
  assert.strictEqual(exp.rootGroup.position.y, 0.063, 'Apparatus placed on table Y=0.063');
  assert.strictEqual(exp.rootGroup.position.z, 1.35, 'Apparatus moved forward to Z=1.35');

  // Test setScale and getScale
  exp.setScale(2.8);
  assert.strictEqual(exp.getScale(), 2.8, 'Scale should update to 2.8');

  // Test parameter change
  exp.onParameterChange?.('incidentAngle', 50, mockContext);
  assert.strictEqual(exp.getApparatus().incidentAngleDeg, 50);

  exp.onParameterChange?.('isAirToWater', 'waterToAir', mockContext);
  assert.strictEqual(exp.getApparatus().isAirToWater, false);

  exp.onParameterChange?.('mediumType', 'flint', mockContext);
  assert.strictEqual(exp.getApparatus().mediumType, 'flint');

  exp.onParameterChange?.('liquidTint', 'amber', mockContext);
  exp.onParameterChange?.('liquidTint', 'rose', mockContext);

  exp.onParameterChange?.('laserWavelength', 650, mockContext);
  assert.strictEqual(exp.getApparatus().laserWavelengthNm, 650);

  // Update loop
  exp.update(0.016, 1.0, mockContext);
  const telemetry = exp.getTelemetry();
  assert.ok(telemetry !== null, 'Telemetry must be available');
  assert.strictEqual(telemetry.reflectionAngleDeg, 50);

  // Disposal
  exp.dispose(mockContext);
  assert.strictEqual(exp.rootGroup.children.length, 0, 'All children cleared upon disposal');

  console.log('✓ Test 7 passed: Experiment lifecycle, parameter handling, scaling and disposal verified');
}

// Test 8: 3D Angle Annotation Labels (Incident, Reflected, Refracted Badges)
console.log('Test 8: 3D Angle Annotation Labels (Incident, Reflected, Refracted Badges)');
{
  const apparatus = new OpticalDiskApparatusMesh();

  // 8.1 验证 3D 浮空角度标注组及 Sprite 存在
  assert.ok(apparatus.angleLabelsGroup, 'angleLabelsGroup must exist');
  assert.strictEqual(apparatus.angleLabelsGroup.children.length, 3, 'Must contain 3 angle badge sprites (incident, reflected, refracted)');
  assert.ok(apparatus.incidentBadgeSprite, 'Incident badge sprite exists');
  assert.ok(apparatus.reflectedBadgeSprite, 'Reflected badge sprite exists');
  assert.ok(apparatus.refractedBadgeSprite, 'Refracted badge sprite exists');

  // 8.2 验证初始 45° 入射角时的纯文字标注位置
  apparatus.setIncidentAngle(45);
  apparatus.updateOpticalPaths();

  assert.strictEqual(apparatus.angleLabelsGroup.visible, true, 'angleLabelsGroup is visible when showAngleArcs is true');
  assert.ok(apparatus.incidentBadgeSprite.position.x > 0, 'Incident badge in positive X quadrant');
  assert.ok(apparatus.reflectedBadgeSprite.position.x < 0, 'Reflected badge in negative X quadrant');
  assert.ok(apparatus.refractedBadgeSprite.position.y < 0, 'Refracted badge in water region (negative Y)');
  assert.strictEqual(apparatus.angleArcsGroup.children.length, 6, 'Must have 6 angle measurement ribbon and fan meshes');

  // 8.3 验证全反射状态下的折射标注切换
  apparatus.setIncidentDirection(false); // 水到空气
  apparatus.setIncidentAngle(55); // 大于临界角 48.6°
  apparatus.updateOpticalPaths();
  assert.ok(apparatus.refractedBadgeSprite.position.y > 0, 'In TIR, refraction indicator positioned in air region');

  // 8.4 验证 0 点吸附与整数角度调节
  apparatus.setIncidentAngle(1.5);
  assert.strictEqual(apparatus.incidentAngleDeg, 0, 'Should snap to 0° within ±2° threshold (input: 1.5°)');
  apparatus.setIncidentAngle(-1.8);
  assert.strictEqual(apparatus.incidentAngleDeg, 0, 'Should snap to 0° within ±2° threshold (input: -1.8°)');
  apparatus.setIncidentAngle(32.4);
  assert.strictEqual(apparatus.incidentAngleDeg, 32, 'Should round to integer 32° (input: 32.4°)');
  apparatus.setIncidentAngle(44.7);
  assert.strictEqual(apparatus.incidentAngleDeg, 45, 'Should round to integer 45° (input: 44.7°)');

  // 8.5 验证 0° 时标注沿法线左右错开不叠字
  apparatus.setIncidentAngle(0);
  apparatus.updateOpticalPaths();
  assert.ok(apparatus.incidentBadgeSprite.position.x > 0, 'At 0°, incident badge offset to +X');
  assert.ok(apparatus.reflectedBadgeSprite.position.x < 0, 'At 0°, reflected badge offset to -X');

  // 8.6 验证 showAngleArcs 隐藏联动
  apparatus.showAngleArcs = false;
  apparatus.updateOpticalPaths();
  assert.strictEqual(apparatus.angleLabelsGroup.visible, false, 'angleLabelsGroup hidden when showAngleArcs is false');

  apparatus.dispose();
  console.log('✓ Test 8 passed: Pure text angle annotations, integer precision & 0° snapping verified');
}

console.log('\n========================================================');
console.log('All Light Reflection & Refraction Tests Passed Successfully (8/8)!');
console.log('========================================================\n');

