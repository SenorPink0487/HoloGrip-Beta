import * as THREE from 'three';

/**
 * Drawn copper bar. Chamfered ends, a turned tenon for the terminal,
 * and a shallow retainer groove on the shank. Revolved, not a bare cylinder.
 */
export function createConductorRodGeometry(length: number, radius: number): THREE.BufferGeometry {
  const half = length / 2;
  const tenon = Math.min(0.012, length * 0.06);
  const groove = half - tenon - 0.02;
  const r = radius;
  const profile = [
    [0, -half],
    [r * 0.58, -half],
    [r * 0.58, -half + 0.0016],
    [r * 0.82, -half + 0.0045],
    [r * 0.82, -half + tenon],
    [r, -half + tenon + 0.0035],
    [r, -groove],
    [r * 0.93, -groove + 0.0016],
    [r * 0.93, -groove + 0.0042],
    [r, -groove + 0.0058],
    [r, groove - 0.0058],
    [r * 0.93, groove - 0.0042],
    [r * 0.93, groove - 0.0016],
    [r, groove],
    [r, half - tenon - 0.0035],
    [r * 0.82, half - tenon],
    [r * 0.82, half - 0.0045],
    [r * 0.58, half - 0.0016],
    [r * 0.58, half],
    [0, half],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 72);
  geo.computeVertexNormals();
  return geo;
}

/** Straight ground shaft for the rails the conductor actually rides on. */
export function createGuideShaftGeometry(length: number, radius: number): THREE.BufferGeometry {
  const half = length / 2;
  const crown = Math.min(radius * 1.35, 0.006);
  const profile = [
    [0, -half],
    [radius * 0.2, -half],
    [radius, -half + crown],
    [radius, half - crown],
    [radius * 0.2, half],
    [0, half],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 40);
  geo.computeVertexNormals();
  return geo;
}

/** Short brass band that clamps the bar onto a rail. */
export function createContactCollar(rodRadius: number, length = 0.016): THREE.BufferGeometry {
  const half = length / 2;
  const r = rodRadius;
  const profile = [
    [r * 0.98, -half],
    [r * 1.32, -half + 0.0015],
    [r * 1.32, -0.0024],
    [r * 1.16, -0.0009],
    [r * 1.16, 0.0009],
    [r * 1.32, 0.0024],
    [r * 1.32, half - 0.0015],
    [r * 0.98, half],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 40);
  geo.computeVertexNormals();
  return geo;
}

/** Diamond-knurled grip, with the flat end faces left alone. */
export function createKnurledBand(radius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 48, 12, false);
  const pos = geo.attributes.position;
  const half = height / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rad = Math.hypot(x, z);
    if (rad < radius * 0.82 || half - Math.abs(y) < 0.0006) continue;
    const theta = Math.atan2(x, z);
    const along = y / height;
    const diamonds = Math.sin(theta * 18 + along * 42) * Math.sin(theta * 18 - along * 42);
    const edge = Math.min(1, (half - Math.abs(y)) / (height * 0.18));
    const scale = 1 + diamonds * 0.038 * edge;
    pos.setX(i, (x / rad) * radius * scale);
    pos.setZ(i, (z / rad) * radius * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Chamfered hex nut. The six flats are the nut; the rims are pulled in. */
export function createChamferedHexNut(radius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 6, 2, false);
  const pos = geo.attributes.position;
  const half = height / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.abs(y) / half;
    if (t < 0.45) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) < radius * 0.25) continue;
    const k = 1 - (t - 0.45) * 0.42;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export function brushedCopper(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe0a36c,
    metalness: 0.76,
    roughness: 0.36,
    clearcoat: 0.22,
    clearcoatRoughness: 0.3,
    emissive: 0x6b3418,
    emissiveIntensity: 0.1,
  });
}

export function terminalBrass(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc4cbd4, // 银灰钛金端子五金，杜绝亮黄
    metalness: 0.94,
    roughness: 0.28,
  });
}

export interface AxialChargeOptions {
  /** Full end-to-end travel of one charge, centered on the rod. */
  travel: number;
  axis: 'y' | 'z';
  /** Distance from the rod axis to the moving charges. */
  radial: number;
  lanes?: number;
  packets?: number;
  /**
   * Phase rate. With travel <= 0.3, one 16ms reversal step stays under 2mm,
   * so packets reverse without teleporting.
   */
  speed?: number;
}

/**
 * Conventional current inside a narrow sight channel on a conductor.
 * Packets move strictly along the rod axis; the channel faces the operator
 * (+Z for a vertical bar, +Y for a bar running in depth).
 */
export class AxialChargeFlow {
  public readonly group = new THREE.Group();
  public readonly carriers: THREE.InstancedMesh;
  public readonly trails: THREE.InstancedMesh;
  public readonly flowMaterial: THREE.ShaderMaterial;
  public readonly bed: THREE.Mesh;

  private phase = 0;
  private readonly axis: 'y' | 'z';
  private readonly travel: number;
  private readonly radial: number;
  private readonly lanes: number;
  private readonly packets: number;
  private readonly speed: number;
  private readonly carrier = new THREE.Object3D();
  private readonly fadeColor = new THREE.Color();
  private readonly laneOffset: number[];

  constructor(options: AxialChargeOptions) {
    this.axis = options.axis;
    this.travel = options.travel;
    this.radial = options.radial;
    this.lanes = options.lanes ?? 3;
    this.packets = options.packets ?? 4;
    this.speed = options.speed ?? 0.32;
    this.laneOffset = [-0.00155, 0, 0.00155].slice(0, this.lanes);
    this.group.name = 'ConductorSightChannel';

    const arcRadius = Math.max(0.001, this.radial - 0.00105);
    const arc = new THREE.CylinderGeometry(arcRadius, arcRadius, this.travel * 1.04, 16, 1, true, -0.22, 0.44);
    const bedMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x10243a,
      metalness: 0.18,
      roughness: 0.16,
      transparent: true,
      opacity: 0.34,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.bed = new THREE.Mesh(arc, bedMaterial);
    this.bed.name = 'SightGlass';

    const ribbonGeo = new THREE.CylinderGeometry(this.radial - 0.00045, this.radial - 0.00045, this.travel, 12, 1, true, -0.16, 0.32);
    const lanes = new Float32Array(ribbonGeo.attributes.position.count);
    ribbonGeo.setAttribute('lane', new THREE.BufferAttribute(lanes, 1));
    this.flowMaterial = new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, direction: { value: 1 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
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
          float packet = exp(-distanceBehind * 14.0);
          float edge = smoothstep(0.0, 0.18, flowUv.x) * smoothstep(0.0, 0.18, 1.0 - flowUv.x);
          float ends = smoothstep(0.0, 0.04, flowUv.y) * smoothstep(0.0, 0.04, 1.0 - flowUv.y);
          vec3 amber = vec3(1.0, 0.58, 0.18);
          vec3 hotCore = vec3(1.0, 0.95, 0.78);
          gl_FragColor = vec4(mix(amber, hotCore, packet), edge * ends * packet);
          #include <colorspace_fragment>
        }
      `,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, this.flowMaterial);
    ribbon.name = 'InlaidCurrentFlow';
    ribbon.renderOrder = 2;
    if (this.axis === 'z') {
      this.bed.rotation.x = -Math.PI / 2;
      ribbon.rotation.x = -Math.PI / 2;
    }

    const count = this.lanes * this.packets;
    this.carriers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.0027, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }),
      count,
    );
    this.carriers.name = 'AxialCurrentCarriers';
    this.carriers.frustumCulled = false;
    this.trails = new THREE.InstancedMesh(
      new THREE.LatheGeometry([
        new THREE.Vector2(0, -0.042),
        new THREE.Vector2(0.0004, -0.036),
        new THREE.Vector2(0.0012, -0.016),
        new THREE.Vector2(0.0018, -0.004),
        new THREE.Vector2(0.0019, 0),
        new THREE.Vector2(0, 0),
      ], 10),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
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
            gl_FragColor = vec4(mix(vec3(1.0, 0.46, 0.08), vec3(1.0, 0.95, 0.78), tip), tip * fade * 0.9);
            #include <colorspace_fragment>
          }
        `,
      }),
      count,
    );
    this.trails.name = 'AxialCurrentTrails';
    this.trails.frustumCulled = false;
    this.carriers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.bed, ribbon, this.carriers, this.trails);
    this.update(0, 1);
    this.trails.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  /** Moving glints only. The sight glass stays, so the bar still reads as a conductor. */
  public setFlowVisible(visible: boolean): void {
    this.carriers.visible = visible;
    this.trails.visible = visible;
    const ribbon = this.group.getObjectByName('InlaidCurrentFlow');
    if (ribbon) ribbon.visible = visible;
  }

  public update(dt: number, direction: number): void {
    const sign = direction >= 0 ? 1 : -1;
    this.phase = THREE.MathUtils.euclideanModulo(this.phase + dt * this.speed * sign, 1);
    this.flowMaterial.uniforms.phase.value = this.phase;
    this.flowMaterial.uniforms.direction.value = sign;
    for (let lane = 0; lane < this.lanes; lane++) {
      const across = this.laneOffset[lane] ?? 0;
      for (let packet = 0; packet < this.packets; packet++) {
        const index = lane * this.packets + packet;
        const phase = (this.phase + lane * 0.17 + packet / this.packets) % 1;
        const along = (phase - 0.5) * this.travel;
        const fade = THREE.MathUtils.smoothstep(phase, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(phase, 0.94, 1));
        if (this.axis === 'y') this.carrier.position.set(across, along, this.radial);
        else this.carrier.position.set(across, this.radial, along);
        if (this.axis === 'y') this.carrier.rotation.set(0, 0, sign > 0 ? 0 : Math.PI);
        else this.carrier.rotation.set(sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0);
        this.carrier.scale.setScalar(Math.max(fade, 0.0001));
        this.carrier.updateMatrix();
        this.carriers.setMatrixAt(index, this.carrier.matrix);
        this.carrier.scale.set(1, Math.max(fade, 0.0001), 1);
        this.carrier.updateMatrix();
        this.trails.setMatrixAt(index, this.carrier.matrix);
        this.fadeColor.setRGB(fade, fade, fade);
        this.trails.setColorAt(index, this.fadeColor);
      }
    }
    this.carriers.instanceMatrix.needsUpdate = true;
    this.trails.instanceMatrix.needsUpdate = true;
    if (this.trails.instanceColor) this.trails.instanceColor.needsUpdate = true;
  }
}
