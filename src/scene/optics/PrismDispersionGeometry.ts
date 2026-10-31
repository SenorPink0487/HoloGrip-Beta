import * as THREE from 'three';
import { OpticalPhysics, type PrismMaterialType, type PrismSpectrumAnalysis } from './OpticalPhysics.ts';

export const DISPERSION_BENCH = {
  beamY: 0.2, prismX: 0.02, lampX: -0.46,
  defaultIncidentDeg: 58, prismSide: 0.088, prismDepth: 0.080,
  screenHeight: 0.19, screenWidth: 0.18, screenCenterY: 0.2,
  screenFaceZ: 0.0012, beamHalfDepth: 0.006,
  minScreenDistanceM: 0.2, maxScreenDistanceM: 0.5, defaultScreenDistanceM: 0.38,
  minIncidentDeg: 42, maxIncidentDeg: 82,
};

export interface PrismInterfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  incoming: THREE.Vector3;
  outgoing: THREE.Vector3;
  face: number;
  tir: boolean;
}

export interface GeometricPrismRay {
  vertices: THREE.Vector3[];
  entry: THREE.Vector3;
  interfaces: PrismInterfaceHit[];
  exit: THREE.Vector3 | null;
  direction: THREE.Vector3 | null;
  incidentAngleDeg: number;
  primaryExit: boolean;
  tir: boolean;
}

export interface DispersionRayHit extends GeometricPrismRay {
  wavelengthNm: number; name: string; hex: number; css: string;
  deviationDeg: number; refractiveIndex: number;
  hitY: number; hitU: number; hit: THREE.Vector3 | null; onScreen: boolean;
}
export interface DispersionProjection {
  analysis: PrismSpectrumAnalysis;
  rays: DispersionRayHit[];
  red: DispersionRayHit; violet: DispersionRayHit;
  spectrumSpanM: number;
  screenCenter: THREE.Vector3;
  screenNormal: THREE.Vector3;
  screenTangent: THREE.Vector3;
}

// Upright prism: its optical cross section is in XZ, its extrusion is vertical.
// The turntable axis passes through the entrance-face midpoint, keeping the incident beam fixed.
export function prismRotationY(incidentAngleDeg: number): number {
  return THREE.MathUtils.degToRad(30 - incidentAngleDeg);
}
export function prismCenterOffset(): THREE.Vector3 {
  return new THREE.Vector3(DISPERSION_BENCH.prismSide / 4, 0, DISPERSION_BENCH.prismSide / (4 * Math.sqrt(3)));
}
export function prismWorldVertices(incidentAngleDeg: number): THREE.Vector3[] {
  const a = DISPERSION_BENCH.prismSide;
  const offset = prismCenterOffset();
  return [new THREE.Vector3(0, 0, -a / Math.sqrt(3)),
    new THREE.Vector3(a / 2, 0, a / (2 * Math.sqrt(3))),
    new THREE.Vector3(-a / 2, 0, a / (2 * Math.sqrt(3)))].map(p =>
      p.add(offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), prismRotationY(incidentAngleDeg))
        .add(new THREE.Vector3(DISPERSION_BENCH.prismX, DISPERSION_BENCH.beamY, 0)));
}
function crossXZ(a: THREE.Vector3, b: THREE.Vector3): number { return a.x * b.z - a.z * b.x; }
function nextFace(origin: THREE.Vector3, direction: THREE.Vector3, vertices: THREE.Vector3[]) {
  let nearest: { point: THREE.Vector3; normal: THREE.Vector3; face: number; distance: number } | null = null;
  for (let face = 0; face < 3; face++) {
    const a = vertices[face], edge = vertices[(face + 1) % 3].clone().sub(a);
    const den = crossXZ(direction, edge);
    if (Math.abs(den) < 1e-10) continue;
    const delta = a.clone().sub(origin);
    const distance = crossXZ(delta, edge) / den;
    const fraction = crossXZ(delta, direction) / den;
    if (distance < 1e-7 || fraction < -1e-8 || fraction > 1 + 1e-8) continue;
    if (!nearest || distance < nearest.distance) nearest = {
      point: origin.clone().addScaledVector(direction, distance),
      normal: new THREE.Vector3(edge.z, 0, -edge.x).normalize(), face, distance,
    };
  }
  return nearest;
}
export function refractPrismDirection(direction: THREE.Vector3, opposingNormal: THREE.Vector3, eta: number): THREE.Vector3 | null {
  const cosI = -direction.dot(opposingNormal);
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < -1e-12) return null;
  return direction.clone().multiplyScalar(eta)
    .addScaledVector(opposingNormal, eta * cosI - Math.sqrt(Math.max(0, k))).normalize();
}
export function tracePrismGeometry(incidentAngleDeg: number, material: PrismMaterialType, wavelengthNm: number): GeometricPrismRay {
  const vertices = prismWorldVertices(incidentAngleDeg);
  const origin = new THREE.Vector3(DISPERSION_BENCH.lampX + 0.076, DISPERSION_BENCH.beamY, 0);
  const incident = new THREE.Vector3(1, 0, 0);
  const first = nextFace(origin, incident, vertices);
  if (!first) throw new Error('Incident beam misses the prism');
  const n = OpticalPhysics.getPrismRefractiveIndex(wavelengthNm, material);
  let direction = refractPrismDirection(incident, first.normal, 1 / n)!;
  const interfaces: PrismInterfaceHit[] = [{ ...first, incoming: incident, outgoing: direction.clone(), tir: false }];
  const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-incident.dot(first.normal), -1, 1)));
  let point = first.point;
  let exit: THREE.Vector3 | null = null, escaped: THREE.Vector3 | null = null;
  for (let bounce = 0; bounce < 8; bounce++) {
    const hit = nextFace(point, direction, vertices);
    if (!hit) break;
    const outgoing = refractPrismDirection(direction, hit.normal.clone().negate(), n);
    const reflected = direction.clone().reflect(hit.normal).normalize();
    interfaces.push({ ...hit, incoming: direction.clone(), outgoing: (outgoing ?? reflected).clone(), tir: !outgoing });
    if (outgoing) { exit = hit.point; escaped = outgoing; break; }
    point = hit.point;
    direction = reflected;
  }
  return { vertices, entry: first.point, interfaces, exit, direction: escaped, incidentAngleDeg: angle,
    primaryExit: interfaces.length === 2 && interfaces[1].face === 0 && !interfaces[1].tir,
    tir: interfaces[1]?.tir ?? false };
}

export function projectDispersionFan(incidentAngleDeg: number, material: PrismMaterialType, screenDistanceM: number): DispersionProjection {
  const incident = THREE.MathUtils.clamp(incidentAngleDeg, DISPERSION_BENCH.minIncidentDeg, DISPERSION_BENCH.maxIncidentDeg);
  const yellow = tracePrismGeometry(incident, material, 587.6);
  const analysis = OpticalPhysics.calculatePrismSpectrum(yellow.incidentAngleDeg, 60, material);
  const traces = analysis.bands.map(b => tracePrismGeometry(incident, material, b.wavelengthNm));
  // A physically articulated receiving arm follows a directly transmitted reference ray.
  // If the complete spectrum is internally reflected, the arm stays in its standard position.
  const reference = yellow.primaryExit ? yellow : traces.find(t => t.primaryExit) ?? tracePrismGeometry(58, 'flint', 587.6);
  const screenNormal = reference.direction!.clone();
  const screenTangent = new THREE.Vector3(screenNormal.z, 0, -screenNormal.x);
  const screenCenter = reference.exit!.clone().addScaledVector(screenNormal, screenDistanceM);
  const surface = screenCenter.clone().addScaledVector(screenNormal, -DISPERSION_BENCH.screenFaceZ);
  const rays = analysis.bands.map((band, i): DispersionRayHit => {
    const trace = traces[i];
    const den = trace.direction?.dot(screenNormal) ?? 0;
    const distance = trace.exit && den > 1e-8 ? surface.clone().sub(trace.exit).dot(screenNormal) / den : -1;
    const hit = distance > 0 ? trace.exit!.clone().addScaledVector(trace.direction!, distance) : null;
    const hitU = hit ? hit.clone().sub(screenCenter).dot(screenTangent) : NaN;
    const onScreen = !!hit && trace.primaryExit && Math.abs(hitU) <= DISPERSION_BENCH.screenWidth * 0.5;
    return { ...trace, wavelengthNm: band.wavelengthNm, name: band.name, hex: band.hex, css: band.css,
      deviationDeg: trace.primaryExit ? THREE.MathUtils.radToDeg(Math.atan2(trace.direction!.z, trace.direction!.x)) : NaN,
      refractiveIndex: band.refractiveIndex, hitY: hit?.y ?? NaN, hitU, hit, onScreen };
  });
  const red = rays[0], violet = rays[rays.length - 1];
  return { analysis, rays, red, violet, screenCenter, screenNormal, screenTangent,
    spectrumSpanM: red.onScreen && violet.onScreen ? Math.abs(violet.hitU - red.hitU) : 0 };
}
