import * as THREE from 'three';
import type { HandRuleEvaluation, Polarity } from '../../physics/em/handRulesSolver.ts';

export type ConductorAction = 'conductor' | 'polarity';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

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
 * A contactless teaching model. One suspended conductor, no support post or
 * ornamental front-facing hoops. The circular B lines lie normal to its axis.
 * All moving parts share the same rigid transform, including the field.
 */
export class FloatingConductorMesh {
  public readonly group = new THREE.Group();
  public readonly assembly = new THREE.Group();
  public readonly currentArrow = new THREE.Group();
  public readonly currentCarriers: THREE.InstancedMesh;
  public readonly currentTrails: THREE.InstancedMesh;
  public readonly currentFlowMaterial = new THREE.ShaderMaterial({
    uniforms: { phase: { value: 0 }, direction: { value: 1 } },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float lane;
      varying vec2 flowUv;
      varying float flowLane;
      void main() {
        flowUv = uv;
        flowLane = lane;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float phase;
      uniform float direction;
      varying vec2 flowUv;
      varying float flowLane;
      void main() {
        float distanceBehind = fract((phase + flowLane * 0.137 - flowUv.y) * direction * 3.0);
        float packet = exp(-distanceBehind * 12.0);
        float edge = smoothstep(0.0, 0.22, flowUv.x) * smoothstep(0.0, 0.22, 1.0 - flowUv.x);
        float ends = smoothstep(0.0, 0.05, flowUv.y) * smoothstep(0.0, 0.05, 1.0 - flowUv.y);
        vec3 amber = vec3(1.0, 0.44, 0.055);
        vec3 hotCore = vec3(1.0, 0.94, 0.70);
        gl_FragColor = vec4(mix(amber, hotCore, packet), edge * ends * (0.18 + packet * 0.82));
        #include <colorspace_fragment>
      }
    `,
  });
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

  private readonly copper = new THREE.MeshPhysicalMaterial({
    color: 0xc86438,
    metalness: 0.88,
    roughness: 0.22,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
    anisotropy: 0.4,
    anisotropyRotation: Math.PI / 2,
    emissive: 0x361508,
    emissiveIntensity: 0.16,
  });
  private readonly amber = new THREE.MeshStandardMaterial({
    color: 0xffe5ac, emissive: 0xffb94f, emissiveIntensity: 0.9, metalness: 0.25, roughness: 0.23,
  });
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x7de2ec, transparent: true, opacity: 0.04, depthWrite: false,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
  });
  private readonly hoverShell: THREE.Mesh;
  private readonly orbiters: Array<{ mesh: THREE.Mesh; radius: number; y: number; angle: number; rate: number }> = [];
  private readonly trails: THREE.Mesh[] = [];
  private readonly velocity = new THREE.Vector3();
  private readonly target = new THREE.Vector3(0, 0.30, 0);
  private readonly localPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly carrierTransform = new THREE.Object3D();
  private readonly carrierFade = new THREE.Color();
  private clock = 0;
  private phase = 0;
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
    this.currentCarriers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.0022, 16, 14),
      new THREE.MeshBasicMaterial({ color: 0xffefb8, toneMapped: false }),
      18,
    );
    this.currentCarriers.name = 'AxialCurrentCarriers';
    this.currentTrails = new THREE.InstancedMesh(
      turned([[0, -0.036], [0.0003, -0.033], [0.001, -0.020], [0.0017, -0.005], [0.0018, 0], [0, 0]], 12),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, toneMapped: false,
        vertexShader: `
          varying vec2 trailUv;
          varying float fade;
          void main() {
            trailUv = uv;
            fade = instanceColor.r;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 trailUv;
          varying float fade;
          void main() {
            float tip = pow(trailUv.y, 2.0);
            gl_FragColor = vec4(mix(vec3(1.0, 0.40, 0.035), vec3(1.0, 0.94, 0.72), tip), tip * fade * 0.85);
            #include <colorspace_fragment>
          }
        `,
      }),
      18,
    );
    this.currentTrails.name = 'AxialCurrentTrails';
    this.currentCarriers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.currentTrails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.currentCarriers.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.16);
    this.currentTrails.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.16);
    this.updateCurrent(0, 1);
    this.currentTrails.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.assembly.add(this.currentCarriers, this.currentTrails);
    this.buildField();
    this.hoverShell = new THREE.Mesh(
      turned([[0, -0.154], [0.0145, -0.150], [0.016, -0.138], [0.016, 0.138], [0.0145, 0.150], [0, 0.154]], 48),
      this.glowMaterial,
    );
    this.hoverShell.name = 'ConductorInteractionSheen';
    // A generous hit volume, with a subtle surface sheen instead of an outline widget.
    this.assembly.add(this.hoverShell, this.currentArrow, this.fieldGroup);
    this.fieldGroup.visible = false;
    this.group.add(this.assembly);
  }

  private buildConductor(): void {
    const body = new THREE.Mesh(
      turned([
        [0, -0.138], [0.0125, -0.138],
        [0.0125, 0.138], [0, 0.138],
      ], 80),
      this.copper,
    );
    body.name = 'ScrewCentralConductor';
    body.castShadow = true;
    this.assembly.add(body);

    const ferruleGeo = turned([
      [0, 0],
      [0.0125, 0],
      [0.0125, 0.009],
      [0.0121, 0.0105],
      [0.0105, 0.012],
      [0, 0.012],
    ], 80);

    for (const sign of [-1, 1]) {
      const cap = new THREE.Mesh(ferruleGeo, this.copper);
      cap.name = sign > 0 ? 'ConductorUpperFerrule' : 'ConductorLowerFerrule';
      cap.userData.conductorAction = 'polarity';
      cap.position.y = sign * 0.138;
      if (sign < 0) cap.rotation.x = Math.PI;
      cap.castShadow = true;
      this.assembly.add(cap);
    }

    // Curved ribbons sit flush with the conductor. Six axial channels share
    // one draw call and a travelling pulse shader, without belt-like hoops.
    const positions: number[] = [];
    const uvs: number[] = [];
    const lanes: number[] = [];
    const indices: number[] = [];
    for (let lane = 0; lane < 6; lane++) {
      const start = positions.length / 3;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col <= 4; col++) {
          const a = lane / 6 * TAU + (col / 4 - 0.5) * 0.16;
          positions.push(Math.sin(a) * 0.01275, (row - 0.5) * 0.248, Math.cos(a) * 0.01275);
          uvs.push(col / 4, row);
          lanes.push(lane);
        }
      }
      for (let col = 0; col < 4; col++) {
        const i = start + col;
        indices.push(i, i + 1, i + 5, i + 1, i + 6, i + 5);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('lane', new THREE.Float32BufferAttribute(lanes, 1));
    geometry.setIndex(indices);
    const channels = new THREE.Mesh(geometry, this.currentFlowMaterial);
    channels.name = 'InlaidCurrentFlow';
    this.assembly.add(channels);

    // The current effect is visualized purely through continuous flowing charge packets,
    // surface energy ribbons, and dynamic luminous comet trails (no arrows).
    this.currentArrow.position.set(-0.032, 0, 0.016);
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
          // Each directional arrow leaves a short, tapered ribbon, not a solid hoop.
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

  public actionFor(object: THREE.Object3D): ConductorAction | null {
    if (!this.group.visible) return null;
    let current: THREE.Object3D | null = object;
    let action: ConductorAction | null = null;
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

  private updateCurrent(dt: number, polarity: Polarity): void {
    // Markers represent conventional current. Integrating signed phase keeps
    // their positions continuous when I reverses; the axial trails turn with I.
    this.phase = THREE.MathUtils.euclideanModulo(this.phase + dt * 0.32 * polarity, 1);
    this.currentFlowMaterial.uniforms.phase.value = this.phase;
    this.currentFlowMaterial.uniforms.direction.value = polarity;
    for (let lane = 0; lane < 6; lane++) {
      const angle = lane / 6 * TAU;
      for (let packet = 0; packet < 3; packet++) {
        const index = lane * 3 + packet;
        const phase = (this.phase + lane * 0.137 + packet / 3) % 1;
        const fade = THREE.MathUtils.smoothstep(phase, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(phase, 0.94, 1));
        this.carrierTransform.position.set(Math.sin(angle) * 0.0165, (phase - 0.5) * 0.248, Math.cos(angle) * 0.0165);
        this.carrierTransform.rotation.set(0, 0, polarity > 0 ? 0 : Math.PI);
        this.carrierTransform.scale.set(fade, fade, fade);
        this.carrierTransform.updateMatrix();
        this.currentCarriers.setMatrixAt(index, this.carrierTransform.matrix);
        this.carrierTransform.scale.set(1, fade, 1);
        this.carrierTransform.updateMatrix();
        this.currentTrails.setMatrixAt(index, this.carrierTransform.matrix);
        this.carrierFade.setRGB(fade, fade, fade);
        this.currentTrails.setColorAt(index, this.carrierFade);
      }
    }
    this.currentCarriers.instanceMatrix.needsUpdate = true;
    this.currentTrails.instanceMatrix.needsUpdate = true;
    this.currentTrails.instanceColor!.needsUpdate = true;
  }

  public update(dt: number, polarity: Polarity, evaluation: HandRuleEvaluation): void {
    this.clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    this.hover += ((this.isHovered || this.dragging ? 1 : 0) - this.hover) * ease;
    this.glowMaterial.opacity = 0.025 + this.hover * 0.16;

    // Analytically integrate a critically damped spring; stable even at low FPS.
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
    this.updateCurrent(dt, polarity);

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
