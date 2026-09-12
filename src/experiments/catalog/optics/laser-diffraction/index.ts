import * as THREE from 'three';
import { BaseExperiment } from '../../../base/BaseExperiment.ts';
import type { ExperimentMetadata, ExperimentContext } from '../../../../core/types.ts';
import { metadata } from './meta.ts';

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;

uniform vec3 uLaserColor;
uniform float uWavelength;
uniform float uApertureRadius;
uniform float uLaserPower;

void main() {
  vec2 uv = vUv - vec2(0.5);
  float dist = length(uv);

  // Airy disk intensity formula: I(x) = (2 * J1(x) / x)^2 ~ (sinc/Bessel approximation)
  float scaleFactor = (uApertureRadius / uWavelength) * 48.0;
  float xVal = dist * scaleFactor * 3.141592653589793;

  float intensity = 0.0;
  if (xVal < 1e-4) {
    intensity = 1.0;
  } else {
    // Bessel J1 first-order polynomial approximation for concentric diffraction rings
    float j1Approx = (sin(xVal) - xVal * cos(xVal)) / (xVal * xVal);
    float val = (2.0 * j1Approx) / xVal;
    intensity = val * val * uLaserPower;
  }

  intensity = clamp(intensity, 0.0, 1.0);
  gl_FragColor = vec4(uLaserColor * intensity, intensity * 0.95);
}
`;

export default class LaserDiffractionExperiment extends BaseExperiment {
  public readonly metadata: ExperimentMetadata = metadata;

  private screenMesh: THREE.Mesh;
  private screenMaterial: THREE.ShaderMaterial;
  private laserBeam: THREE.Mesh;
  private apertureRing: THREE.Mesh;

  public init(context: ExperimentContext): void {
    const wl = context.getParameter<number>('wavelength') ?? 532;
    const rAperture = context.getParameter<number>('apertureRadius') ?? 45;
    const power = context.getParameter<number>('laserPower') ?? 1.0;
    const [r, g, b] = this.wavelengthToRGB(wl);

    // 1. Aperture ring in space
    const ringGeo = this.track(new THREE.TorusGeometry(0.18, 0.015, 16, 48));
    const ringMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.9,
        roughness: 0.2,
      })
    );
    this.apertureRing = this.track(new THREE.Mesh(ringGeo, ringMat));
    this.apertureRing.position.set(-0.45, 0, 0);
    this.apertureRing.rotation.y = Math.PI / 2;
    this.rootGroup.add(this.apertureRing);

    // 2. Incident Laser Beam
    const beamGeo = this.track(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 32));
    const beamMat = this.track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      })
    );
    this.laserBeam = this.track(new THREE.Mesh(beamGeo, beamMat));
    this.laserBeam.rotation.z = Math.PI / 2;
    this.laserBeam.position.set(-0.75, 0, 0);
    this.rootGroup.add(this.laserBeam);

    // 3. Observation screen with real-time GPU Fragment Shader Airy disk diffraction pattern
    // Completely offloaded to GPU: 0% CPU main-thread overhead
    this.screenMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uLaserColor: { value: new THREE.Color(r / 255, g / 255, b / 255) },
          uWavelength: { value: wl },
          uApertureRadius: { value: rAperture },
          uLaserPower: { value: power },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );

    const screenGeo = this.track(new THREE.PlaneGeometry(0.85, 0.85));
    this.screenMesh = this.track(new THREE.Mesh(screenGeo, this.screenMaterial));
    this.screenMesh.position.set(0.35, 0, 0);
    this.screenMesh.rotation.y = -Math.PI / 2;
    this.rootGroup.add(this.screenMesh);
  }

  private wavelengthToRGB(nm: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) {
      r = -(nm - 440) / (440 - 380);
      b = 1.0;
    } else if (nm >= 440 && nm < 490) {
      g = (nm - 440) / (490 - 440);
      b = 1.0;
    } else if (nm >= 490 && nm < 510) {
      g = 1.0;
      b = -(nm - 510) / (510 - 490);
    } else if (nm >= 510 && nm < 580) {
      r = (nm - 510) / (580 - 510);
      g = 1.0;
    } else if (nm >= 580 && nm < 645) {
      r = 1.0;
      g = -(nm - 645) / (645 - 580);
    } else if (nm >= 645 && nm <= 780) {
      r = 1.0;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  public update(delta: number, elapsed: number, context: ExperimentContext): void {
    this.rootGroup.rotation.y = elapsed * 0.1;
  }

  public onParameterChange(id: string, value: any, context: ExperimentContext): void {
    if (!this.screenMaterial) return;

    if (id === 'wavelength') {
      const wl = Number(value);
      this.screenMaterial.uniforms.uWavelength.value = wl;
      const [r, g, b] = this.wavelengthToRGB(wl);
      this.screenMaterial.uniforms.uLaserColor.value.setRGB(r / 255, g / 255, b / 255);

      if (this.laserBeam) {
        (this.laserBeam.material as THREE.MeshBasicMaterial).color.setRGB(r / 255, g / 255, b / 255);
      }
    } else if (id === 'apertureRadius') {
      this.screenMaterial.uniforms.uApertureRadius.value = Number(value);
    } else if (id === 'laserPower') {
      this.screenMaterial.uniforms.uLaserPower.value = Number(value);
    }
  }
}
