import * as THREE from 'three';
import type { HandRuleEvaluation, Polarity } from '../../physics/em/handRulesSolver.ts';
import {
  AxialChargeFlow,
  brushedCopper,
  createChamferedHexNut,
  createConductorRodGeometry,
  createKnurledBand,
  terminalBrass,
} from './conductorRod.ts';

const UP = new THREE.Vector3(0, 1, 0);

function turned(profile: number[][], segments = 64): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function ring(radius: number, tube: number, material: THREE.Material, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/**
 * Suspended straight conductor for Ampere's right-hand rule.
 * A drawn copper bar with brass binding posts. Conventional current runs
 * in the front sight channel; the metal itself does not glow.
 */
export class FloatingConductorMesh {
  public readonly group = new THREE.Group();
  public readonly assembly = new THREE.Group();
  public readonly currentArrow = new THREE.Group();
  public readonly currentCarriers: THREE.InstancedMesh;
  public readonly currentTrails: THREE.InstancedMesh;
  public readonly currentFlowMaterial: THREE.ShaderMaterial;
  public readonly fieldGroup = new THREE.Group();
  public readonly fieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x249fbd, emissive: 0x087b9b, emissiveIntensity: 0.45,
    roughness: 0.22, metalness: 0.25, transparent: true, opacity: 0, depthWrite: false,
  });
  public readonly fieldArrowMaterial = new THREE.MeshStandardMaterial({
    color: 0x69e4f3, emissive: 0x1595b5, emissiveIntensity: 0.65,
    roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false,
  });
  public fieldRevealProgress = 0;
  public circulationSpeed = 0;

  private readonly charges: AxialChargeFlow;
  private readonly copper = brushedCopper();
  private readonly brass = terminalBrass();
  private readonly marker = new THREE.MeshStandardMaterial({
    color: 0xffc27a, emissive: 0xff8c2a, emissiveIntensity: 0.42, metalness: 0.55, roughness: 0.32,
  });
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xe7b185, transparent: true, opacity: 0.015, depthWrite: false,
  });
  private readonly hoverShell: THREE.Mesh;
  private readonly orbiters: Array<{ mesh: THREE.Mesh; radius: number; y: number; angle: number; rate: number }> = [];
  private readonly trails: THREE.Mesh[] = [];
  private readonly velocity = new THREE.Vector3();
  private readonly target = new THREE.Vector3(0, 0.30, 0);
  private readonly localPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private clock = 0;
  private hover = 0;
  private isHovered = false;
  private dragging = false;
  private orbitPhase = 0;

  constructor() {
    this.group.name = 'RightHandScrewApparatus';
    this.assembly.name = 'FloatingConductorAssembly';
    this.assembly.userData.conductorAction = 'conductor';
    this.assembly.position.copy(this.target);
    this.buildConductor();
    this.charges = new AxialChargeFlow({ travel: 0.20, axis: 'y', radial: 0.0145, speed: 0.32 });
    this.currentCarriers = this.charges.carriers;
    this.currentTrails = this.charges.trails;
    this.currentFlowMaterial = this.charges.flowMaterial;
    this.assembly.add(this.charges.group);
    this.buildField();
    this.hoverShell = new THREE.Mesh(
      turned([[0, -0.162], [0.020, -0.156], [0.020, 0.156], [0, 0.162]], 32),
      this.glowMaterial,
    );
    this.hoverShell.name = 'ConductorInteractionSheen';
    this.assembly.add(this.hoverShell, this.currentArrow, this.fieldGroup);
    this.fieldGroup.visible = false;
    this.group.add(this.assembly);
  }

  private buildConductor(): void {
    const shank = new THREE.Mesh(createConductorRodGeometry(0.256, 0.0132), this.copper);
    shank.name = 'ScrewCentralConductor';
    shank.castShadow = true;
    this.assembly.add(shank);

    const knurl = createKnurledBand(0.0136, 0.012);
    const nut = createChamferedHexNut(0.0164, 0.0064);
    for (const sign of [-1, 1] as const) {
      const cap = new THREE.Group();
      cap.name = sign > 0 ? 'ConductorUpperFerrule' : 'ConductorLowerFerrule';
      cap.userData.conductorAction = 'polarity';
      cap.position.y = sign * 0.116;
      if (sign < 0) cap.rotation.x = Math.PI;

      const flange = new THREE.Mesh(turned([
        [0, 0],
        [0.0192, 0],
        [0.0192, 0.0034],
        [0.0152, 0.0054],
        [0.0152, 0.0066],
        [0, 0.0066],
      ], 48), this.brass);
      flange.castShadow = true;

      const hex = new THREE.Mesh(nut, this.brass);
      hex.position.y = 0.0098;
      hex.castShadow = true;

      const grip = new THREE.Mesh(knurl, this.brass);
      grip.position.y = 0.0192;
      grip.castShadow = true;

      const dome = new THREE.Mesh(turned([
        [0, 0],
        [0.0124, 0],
        [0.0128, 0.0022],
        [0.0096, 0.0064],
        [0.0036, 0.0104],
        [0, 0.0128],
      ], 36), this.brass);
      dome.position.y = 0.0246;
      dome.castShadow = true;

      cap.add(flange, hex, grip, dome);
      this.assembly.add(cap);
    }

    const chevron = new THREE.Mesh(turned([
      [0, -0.036],
      [0.0012, -0.033],
      [0.0012, 0.012],
      [0.0046, 0.012],
      [0, 0.028],
    ], 16), this.marker);
    this.currentArrow.add(chevron);
    this.currentArrow.position.set(-0.028, 0, 0.008);
  }

  private buildField(): void {
    const arrowGeometry = turned([[0, -0.009], [0.0008, -0.008], [0.0008, 0.001], [0.0035, 0.001], [0, 0.01]], 16);
    const radii = [0.062, 0.105, 0.155];
    for (let layer = 0; layer < 3; layer++) {
      const y = (layer - 1) * 0.072;
      for (let i = 0; i < radii.length; i++) {
        const radius = radii[i];
        const rate = 0.105 / radius;
        this.fieldGroup.add(ring(radius, 0.00085, this.fieldMaterial, y));
        for (let j = 0; j < 2; j++) {
          const arrow = new THREE.Mesh(arrowGeometry, this.fieldArrowMaterial);
          this.orbiters.push({ mesh: arrow, radius, y, angle: j * Math.PI + layer * 0.6, rate });
          this.fieldGroup.add(arrow);
          const points = Array.from({ length: 33 }, (_, k) => {
            const a = -k / 32 * 0.82;
            return new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
          });
          const trailGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.001, 5, false);
          const count = trailGeometry.attributes.position.count;
          const colors = new Float32Array(count * 3);
          for (let n = 0; n < count; n++) {
            const brightness = (1 - Math.floor(n / 6) / 32) * 0.85 + 0.15;
            colors.set([brightness * 0.4, brightness * 0.88, brightness], n * 3);
          }
          trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          const trailMaterial = this.fieldArrowMaterial.clone();
          trailMaterial.vertexColors = true;
          const trail = new THREE.Mesh(trailGeometry, trailMaterial);
          trail.position.y = y;
          trail.rotation.y = j * Math.PI + layer * 0.6;
          this.trails.push(trail);
          this.fieldGroup.add(trail);
        }
      }
    }
  }

  public actionFor(object: THREE.Object3D): 'conductor' | 'polarity' | null {
    if (!this.group.visible) return null;
    let current: THREE.Object3D | null = object;
    let action: 'conductor' | 'polarity' | null = null;
    while (current && current !== this.group) {
      if (!current.visible) return null;
      action ??= current.userData.conductorAction ?? null;
      current = current.parent;
    }
    return current === this.group ? action : null;
  }

  public setHovered(hovered: boolean): void { this.isHovered = hovered; }
  public setDragging(dragging: boolean): void {
    this.dragging = dragging;
    if (!dragging) this.target.set(0, 0.30, 0);
  }
  public dragTo(point: THREE.Vector3): void {
    this.target.set(THREE.MathUtils.clamp(point.x, -0.10, 0.10), THREE.MathUtils.clamp(point.y, 0.26, 0.38), 0);
  }
  public reset(): void {
    this.dragging = false;
    this.isHovered = false;
    this.target.set(0, 0.30, 0);
    this.velocity.set(0, 0, 0);
    this.assembly.position.copy(this.target);
    this.assembly.rotation.set(0, 0, 0);
    this.fieldRevealProgress = 0;
    this.fieldMaterial.opacity = 0;
    this.fieldArrowMaterial.opacity = 0;
    this.circulationSpeed = 0;
    this.fieldGroup.visible = false;
  }

  public update(dt: number, polarity: Polarity, evaluation: HandRuleEvaluation): void {
    this.clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    this.hover += ((this.isHovered || this.dragging ? 1 : 0) - this.hover) * ease;
    this.glowMaterial.opacity = 0.012 + this.hover * 0.07;
    this.copper.emissiveIntensity = 0.04 + this.hover * 0.1;

    const frequency = this.dragging ? 20 : 7;
    const decay = Math.exp(-frequency * dt);
    this.localPoint.copy(this.target);
    if (!this.dragging) this.localPoint.y += Math.sin(this.clock * 1.35) * 0.002;
    for (const axis of ['x', 'y', 'z'] as const) {
      const error = this.assembly.position[axis] - this.localPoint[axis];
      const impulse = this.velocity[axis] + frequency * error;
      this.assembly.position[axis] = this.localPoint[axis] + (error + impulse * dt) * decay;
      this.velocity[axis] = (this.velocity[axis] - frequency * impulse * dt) * decay;
    }
    this.assembly.rotation.z += (THREE.MathUtils.clamp(-this.velocity.x * 0.22, -0.055, 0.055) - this.assembly.rotation.z) * ease;
    this.assembly.rotation.x += (THREE.MathUtils.clamp(this.velocity.y * 0.06, -0.018, 0.018) - this.assembly.rotation.x) * ease;

    this.currentArrow.rotation.z = polarity > 0 ? 0 : Math.PI;
    this.charges.update(dt, polarity);

    const reveal = evaluation.isMatched ? 1 : 0;
    this.fieldRevealProgress += (reveal - this.fieldRevealProgress) * (1 - Math.exp(-dt * 7));
    this.fieldMaterial.opacity += (reveal * 0.95 - this.fieldMaterial.opacity) * ease;
    this.fieldArrowMaterial.opacity = this.fieldMaterial.opacity;
    this.fieldGroup.visible = this.fieldMaterial.opacity > 0.005;
    const scale = THREE.MathUtils.lerp(0.18, 1, THREE.MathUtils.smoothstep(this.fieldRevealProgress, 0, 1));
    this.fieldGroup.scale.set(scale, 1, scale);
    this.circulationSpeed += (reveal * 0.9 * evaluation.screwCirculationSign - this.circulationSpeed) * (1 - Math.exp(-dt * 5));
    this.orbitPhase += this.circulationSpeed * dt;
    for (let i = 0; i < this.orbiters.length; i++) {
      const item = this.orbiters[i];
      const angle = item.angle + this.orbitPhase * item.rate;
      item.mesh.position.set(Math.sin(angle) * item.radius, item.y, Math.cos(angle) * item.radius);
      this.tangent.set(Math.cos(angle) * polarity, 0, -Math.sin(angle) * polarity);
      item.mesh.quaternion.setFromUnitVectors(UP, this.tangent);
      const trail = this.trails[i];
      trail.rotation.y = angle;
      trail.scale.x = polarity;
      (trail.material as THREE.MeshStandardMaterial).opacity = this.fieldMaterial.opacity * 0.72;
    }
  }
}
