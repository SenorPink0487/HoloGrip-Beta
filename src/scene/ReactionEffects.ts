import * as THREE from 'three';
import type { ChemistryState } from '../chemistry/ChemistryEngine';
import type { BeakerMesh } from './BeakerMesh';

type GasKind = 'H2' | 'CO2' | 'O2';

interface GasLook {
  minR: number;
  maxR: number;
  minSpeed: number;
  maxSpeed: number;
  wobble: number;
  packetMin: number;
  packetMax: number;
  interval: number;
  foam: number;
  foamLife: number;
  mist: number;
  tint: number;
  mistColor: number;
}

/** Per-gas motion. Radii are metres inside a 14 cm beaker. */
const GAS_LOOK: Record<GasKind, GasLook> = {
  H2: {
    minR: 0.006,
    maxR: 0.009,
    minSpeed: 0.16,
    maxSpeed: 0.28,
    wobble: 0.02,
    packetMin: 8,
    packetMax: 12,
    interval: 0.2,
    foam: 0.18,
    foamLife: 0.45,
    mist: 0.75,
    tint: 0xf4fbff,
    mistColor: 0xe3f2fd,
  },
  CO2: {
    minR: 0.012,
    maxR: 0.02,
    minSpeed: 0.055,
    maxSpeed: 0.11,
    wobble: 0.03,
    packetMin: 4,
    packetMax: 7,
    interval: 0.36,
    foam: 0.78,
    foamLife: 0.95,
    mist: 0.3,
    tint: 0xffffff,
    mistColor: 0xf5f5f5,
  },
  O2: {
    minR: 0.0085,
    maxR: 0.014,
    minSpeed: 0.09,
    maxSpeed: 0.17,
    wobble: 0.024,
    packetMin: 6,
    packetMax: 9,
    interval: 0.28,
    foam: 0.42,
    foamLife: 0.6,
    mist: 0.42,
    tint: 0xe7f8ff,
    mistColor: 0xe1f5fe,
  },
};

function createSoftDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64);
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ReactionEffects {
  public readonly group = new THREE.Group();

  // Pouring stream
  private pourStream: THREE.Mesh;
  private pourStreamMat: THREE.MeshBasicMaterial;
  private pourSplashParticles: THREE.Points;
  private pourSplashPositions: Float32Array;
  private pourSplashVelocities: Float32Array;
  private pourSplashLifespans: Float32Array;
  private isPouring = false;
  private hasActiveSplash = false;
  private pourTimer = 0;
  private pourColor = new THREE.Color(0xffffff);

  // Gas: instanced spheres released as nucleation packets
  private bubbleMesh: THREE.InstancedMesh;
  private bubbleMat: THREE.MeshPhysicalMaterial;
  private readonly maxBubbles = 84;
  private bubbleX: Float32Array;
  private bubbleY: Float32Array;
  private bubbleZ: Float32Array;
  private bubbleRadius: Float32Array;
  private bubbleSpeed: Float32Array;
  private bubblePhase: Float32Array;
  private bubbleLife: Float32Array;
  private bubbleMode: Uint8Array;
  private packetTimer = 0;
  private gasWasActive = false;
  private latchedGas: GasKind | null = null;
  private siteCursor = 0;
  private readonly siteAngles = [0.45, 2.55, 4.55];
  private popKick = 0;
  private readonly scratch = new THREE.Object3D();

  // Vapor leaving the mouth, and rings where bubbles burst
  private mistParticles: THREE.Points;
  private mistPositions: Float32Array;
  private mistSpeeds: Float32Array;
  private mistLife: Float32Array;
  private mistMat: THREE.PointsMaterial;
  private readonly maxMist = 48;
  private ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; maxLife: number }[] = [];
  private ripplesActive = false;

  // Precipitating flakes + a soft cloud
  private precipParticles: THREE.Points;
  private precipPositions: Float32Array;
  private precipSpeeds: Float32Array;
  private precipPhases: Float32Array;
  private precipMat: THREE.PointsMaterial;
  private isPrecipitating = false;
  private precipTimer = 0;
  private readonly maxPrecipFlakes = 120;
  private precipCloud: THREE.Mesh;
  private precipCloudMat: THREE.MeshBasicMaterial;
  private precipCloudLife = 0;

  // Solution color flash
  private colorBloom: THREE.Mesh;
  private colorBloomMat: THREE.MeshBasicMaterial;
  private colorBloomLife = 0;
  private readonly colorBloomDuration = 0.7;
  private watchedColor = new THREE.Color(0xd7f3ff);
  private colorWatchReady = false;

  // Sodium burn effect
  private sodiumBall: THREE.Mesh;
  private sodiumLight: THREE.PointLight;
  private sodiumSparkParticles: THREE.Points;
  private sodiumSparkPositions: Float32Array;
  private sodiumSparkVelocities: Float32Array;
  private sodiumSparkLifespans: Float32Array;
  private isSodiumBurning = false;
  private hasActiveSparks = false;
  private sodiumTimer = 0;
  private sodiumAngle = 0;
  private readonly maxSodiumSparks = 70;

  // Exotherm glow light + rising heat wisps
  private heatGlowLight: THREE.PointLight;
  private heatWisps: THREE.Points;
  private heatWispPositions: Float32Array;
  private heatWispSpeeds: Float32Array;
  private heatWispLife: Float32Array;
  private heatWispMat: THREE.PointsMaterial;
  private readonly maxHeatWisps = 28;

  private computeBridge: any = null;
  private softDisc: THREE.CanvasTexture;

  private beaker: BeakerMesh;

  constructor(beaker: BeakerMesh) {
    this.beaker = beaker;
    this.group.name = 'ReactionEffects';
    this.softDisc = createSoftDiscTexture();

    this.initPourEffect();
    this.initGasBubbles();
    this.initMistAndRipples();
    this.initPrecipitateFlakes();
    this.initColorBloom();
    this.initSodiumBurnEffect();
    this.initHeatGlow();
  }

  public setComputeBridge(bridge: any): void {
    this.computeBridge = bridge;
  }

  private initPourEffect(): void {
    const streamGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.35, 16);
    this.pourStreamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.pourStream = new THREE.Mesh(streamGeo, this.pourStreamMat);
    this.pourStream.position.set(0.02, 0.32, 0.02);
    this.pourStream.visible = false;
    this.pourStream.renderOrder = 6;
    this.group.add(this.pourStream);

    const splashCount = 35;
    const splashGeo = new THREE.BufferGeometry();
    this.pourSplashPositions = new Float32Array(splashCount * 3);
    this.pourSplashVelocities = new Float32Array(splashCount * 3);
    this.pourSplashLifespans = new Float32Array(splashCount);

    for (let i = 0; i < splashCount; i++) {
      this.pourSplashLifespans[i] = -1;
    }

    splashGeo.setAttribute('position', new THREE.BufferAttribute(this.pourSplashPositions, 3));
    const splashMat = new THREE.PointsMaterial({
      color: 0xffffff,
      map: this.softDisc,
      size: 0.012,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pourSplashParticles = new THREE.Points(splashGeo, splashMat);
    this.pourSplashParticles.frustumCulled = false;
    this.pourSplashParticles.visible = false;
    this.pourSplashParticles.renderOrder = 7;
    this.group.add(this.pourSplashParticles);
  }

  private initGasBubbles(): void {
    const count = this.maxBubbles;
    this.bubbleX = new Float32Array(count);
    this.bubbleY = new Float32Array(count);
    this.bubbleZ = new Float32Array(count);
    this.bubbleRadius = new Float32Array(count);
    this.bubbleSpeed = new Float32Array(count);
    this.bubblePhase = new Float32Array(count);
    this.bubbleLife = new Float32Array(count);
    this.bubbleMode = new Uint8Array(count);

    const geo = new THREE.SphereGeometry(1, 12, 8);
    this.bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7fcff,
      roughness: 0.08,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      emissive: 0xc5eef8,
      emissiveIntensity: 0.18,
    });
    this.bubbleMesh = new THREE.InstancedMesh(geo, this.bubbleMat, count);
    this.bubbleMesh.frustumCulled = false;
    this.bubbleMesh.renderOrder = 4;
    this.bubbleMesh.visible = false;
    this.hideAllBubbles();
    this.group.add(this.bubbleMesh);
  }

  private hideAllBubbles(): void {
    for (let i = 0; i < this.maxBubbles; i++) {
      this.bubbleMode[i] = 0;
      this.scratch.position.set(0, -2, 0);
      this.scratch.scale.set(0, 0, 0);
      this.scratch.updateMatrix();
      this.bubbleMesh.setMatrixAt(i, this.scratch.matrix);
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  private initMistAndRipples(): void {
    const count = this.maxMist;
    const geo = new THREE.BufferGeometry();
    this.mistPositions = new Float32Array(count * 3);
    this.mistSpeeds = new Float32Array(count);
    this.mistLife = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.mistLife[i] = -1;
      this.mistPositions[i * 3 + 1] = -5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.mistPositions, 3));
    this.mistMat = new THREE.PointsMaterial({
      color: 0xe3f2fd,
      map: this.softDisc,
      size: 0.02,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mistParticles = new THREE.Points(geo, this.mistMat);
    this.mistParticles.frustumCulled = false;
    this.mistParticles.visible = false;
    this.mistParticles.renderOrder = 7;
    this.group.add(this.mistParticles);

    const ringGeo = new THREE.RingGeometry(0.82, 1, 28);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf4fbff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.ripples.push({ mesh, mat, life: 0, maxLife: 0.45 });
    }
  }

  private initPrecipitateFlakes(): void {
    const count = this.maxPrecipFlakes;
    const geo = new THREE.BufferGeometry();
    this.precipPositions = new Float32Array(count * 3);
    this.precipSpeeds = new Float32Array(count);
    this.precipPhases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.resetPrecipFlake(i, true);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.precipPositions, 3));
    this.precipMat = new THREE.PointsMaterial({
      color: 0x0288d1,
      map: this.softDisc,
      size: 0.022,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.precipParticles = new THREE.Points(geo, this.precipMat);
    this.precipParticles.frustumCulled = false;
    this.precipParticles.visible = false;
    this.precipParticles.renderOrder = 4;
    this.group.add(this.precipParticles);

    const cloudGeo = new THREE.SphereGeometry(0.05, 16, 12);
    this.precipCloudMat = new THREE.MeshBasicMaterial({
      color: 0x0288d1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.precipCloud = new THREE.Mesh(cloudGeo, this.precipCloudMat);
    this.precipCloud.frustumCulled = false;
    this.precipCloud.visible = false;
    this.precipCloud.renderOrder = 4;
    this.group.add(this.precipCloud);
  }

  private resetPrecipFlake(i: number, randomY = false): void {
    const rMax = this.beaker.getLiquidRadius() * 0.88;
    const r = Math.sqrt(Math.random()) * rMax;
    const angle = Math.random() * Math.PI * 2;
    const liquidH = Math.max(0.04, this.beaker.maxLiquidHeight * this.beaker.getLiquidLevel());

    this.precipPositions[i * 3] = Math.cos(angle) * r;
    this.precipPositions[i * 3 + 1] = randomY ? 0.02 + Math.random() * (liquidH - 0.02) : liquidH - 0.01;
    this.precipPositions[i * 3 + 2] = Math.sin(angle) * r;
    this.precipSpeeds[i] = 0.02 + Math.random() * 0.045;
    this.precipPhases[i] = Math.random() * Math.PI * 2;
  }

  private initColorBloom(): void {
    const radius = this.beaker.getLiquidRadius() * 0.92;
    const geo = new THREE.CylinderGeometry(radius, radius, this.beaker.maxLiquidHeight, 28, 1, true);
    geo.translate(0, this.beaker.maxLiquidHeight / 2, 0);
    this.colorBloomMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.colorBloom = new THREE.Mesh(geo, this.colorBloomMat);
    this.colorBloom.position.y = 0.009;
    this.colorBloom.frustumCulled = false;
    this.colorBloom.visible = false;
    this.colorBloom.renderOrder = 4;
    this.group.add(this.colorBloom);
  }

  private initSodiumBurnEffect(): void {
    const ballGeo = new THREE.SphereGeometry(0.014, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.95,
      roughness: 0.2,
      emissive: 0xffaa00,
      emissiveIntensity: 0.8,
    });
    this.sodiumBall = new THREE.Mesh(ballGeo, ballMat);
    this.sodiumBall.visible = false;
    this.sodiumBall.renderOrder = 4;
    this.group.add(this.sodiumBall);

    this.sodiumLight = new THREE.PointLight(0xff9100, 0, 1.8, 2.0);
    this.sodiumLight.visible = false;
    this.group.add(this.sodiumLight);

    const count = this.maxSodiumSparks;
    const geo = new THREE.BufferGeometry();
    this.sodiumSparkPositions = new Float32Array(count * 3);
    this.sodiumSparkVelocities = new Float32Array(count * 3);
    this.sodiumSparkLifespans = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.sodiumSparkLifespans[i] = -1;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.sodiumSparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffea00,
      map: this.softDisc,
      size: 0.015,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sodiumSparkParticles = new THREE.Points(geo, sparkMat);
    this.sodiumSparkParticles.frustumCulled = false;
    this.sodiumSparkParticles.visible = false;
    this.sodiumSparkParticles.renderOrder = 6;
    this.group.add(this.sodiumSparkParticles);
  }

  private initHeatGlow(): void {
    this.heatGlowLight = new THREE.PointLight(0xff7043, 0, 2.0, 2.0);
    this.heatGlowLight.position.set(0, 0.1, 0);
    this.heatGlowLight.visible = false;
    this.group.add(this.heatGlowLight);

    const count = this.maxHeatWisps;
    const geo = new THREE.BufferGeometry();
    this.heatWispPositions = new Float32Array(count * 3);
    this.heatWispSpeeds = new Float32Array(count);
    this.heatWispLife = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.heatWispLife[i] = -1;
      this.heatWispPositions[i * 3 + 1] = -5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.heatWispPositions, 3));
    this.heatWispMat = new THREE.PointsMaterial({
      color: 0xffab91,
      map: this.softDisc,
      size: 0.018,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.heatWisps = new THREE.Points(geo, this.heatWispMat);
    this.heatWisps.frustumCulled = false;
    this.heatWisps.visible = false;
    this.heatWisps.renderOrder = 7;
    this.group.add(this.heatWisps);
  }

  public triggerPour(hexColor: number): void {
    this.isPouring = true;
    this.hasActiveSplash = true;
    this.pourTimer = 1.1;
    this.pourColor.setHex(hexColor);
    this.pourStreamMat.color.copy(this.pourColor);
    this.pourStreamMat.opacity = 0.85;
    this.beaker.disturbSurface(0.45);
  }

  public triggerPrecipitation(hexColor: number): void {
    this.isPrecipitating = true;
    this.precipTimer = 3.5;
    this.precipMat.color.setHex(hexColor);
    this.precipMat.opacity = 0.9;
    this.precipMat.size = hexColor === 0xffffff || hexColor === 0xf5f5f5 ? 0.012 : 0.026;
    this.precipCloudMat.color.setHex(hexColor);
    this.precipCloudLife = 2.3;
    this.precipCloud.visible = true;

    for (let i = 0; i < this.maxPrecipFlakes; i++) {
      this.resetPrecipFlake(i, true);
    }
    this.beaker.disturbSurface(0.28);
  }

  public triggerSodiumBurn(): void {
    this.isSodiumBurning = true;
    this.hasActiveSparks = true;
    this.sodiumTimer = 4.5;
    this.sodiumBall.visible = true;
    this.sodiumLight.visible = true;
    this.sodiumLight.intensity = 1.8;
  }

  public triggerHeatPulse(intensity = 1.0): void {
    this.heatGlowLight.visible = true;
    this.heatGlowLight.intensity = Math.min(2.5, intensity * 2.0);
  }

  private triggerColorBloom(color: THREE.Color): void {
    this.colorBloomMat.color.copy(color);
    this.colorBloomLife = this.colorBloomDuration;
    this.colorBloom.visible = true;
  }

  public reset(): void {
    this.isPouring = false;
    this.hasActiveSplash = false;
    this.pourTimer = 0;
    if (this.pourStreamMat) this.pourStreamMat.opacity = 0;
    if (this.pourStream) this.pourStream.visible = false;
    if (this.pourSplashParticles) this.pourSplashParticles.visible = false;

    this.isPrecipitating = false;
    this.precipTimer = 0;
    if (this.precipMat) this.precipMat.opacity = 0;
    if (this.precipParticles) this.precipParticles.visible = false;
    this.precipCloudLife = 0;
    if (this.precipCloud) this.precipCloud.visible = false;
    if (this.precipCloudMat) this.precipCloudMat.opacity = 0;

    this.isSodiumBurning = false;
    this.hasActiveSparks = false;
    this.sodiumTimer = 0;
    if (this.sodiumBall) this.sodiumBall.visible = false;
    if (this.sodiumLight) {
      this.sodiumLight.intensity = 0;
      this.sodiumLight.visible = false;
    }
    if (this.sodiumSparkParticles) this.sodiumSparkParticles.visible = false;

    if (this.bubbleMesh) {
      this.hideAllBubbles();
      this.bubbleMesh.visible = false;
    }
    this.packetTimer = 0;
    this.gasWasActive = false;
    this.latchedGas = null;
    this.popKick = 0;
    this.siteCursor = 0;

    if (this.mistLife) {
      for (let i = 0; i < this.mistLife.length; i++) {
        this.mistLife[i] = -1;
        this.mistPositions[i * 3 + 1] = -5;
      }
    }
    if (this.mistMat) this.mistMat.opacity = 0;
    if (this.mistParticles) this.mistParticles.visible = false;

    for (const ripple of this.ripples) {
      ripple.life = 0;
      ripple.mat.opacity = 0;
      ripple.mesh.visible = false;
    }
    this.ripplesActive = false;

    this.colorBloomLife = 0;
    this.colorWatchReady = false;
    if (this.colorBloom) this.colorBloom.visible = false;
    if (this.colorBloomMat) this.colorBloomMat.opacity = 0;

    if (this.heatGlowLight) {
      this.heatGlowLight.intensity = 0;
      this.heatGlowLight.visible = false;
    }
    if (this.heatWispLife) {
      for (let i = 0; i < this.heatWispLife.length; i++) {
        this.heatWispLife[i] = -1;
        this.heatWispPositions[i * 3 + 1] = -5;
      }
    }
    if (this.heatWispMat) this.heatWispMat.opacity = 0;
    if (this.heatWisps) this.heatWisps.visible = false;

    if (this.pourSplashLifespans) {
      for (let i = 0; i < this.pourSplashLifespans.length; i++) {
        this.pourSplashLifespans[i] = -1;
      }
    }
    if (this.sodiumSparkLifespans) {
      for (let i = 0; i < this.sodiumSparkLifespans.length; i++) {
        this.sodiumSparkLifespans[i] = -1;
      }
    }
  }

  public update(delta: number, state: ChemistryState): void {
    const liquidSurfaceLocalY = 0.009 + this.beaker.maxLiquidHeight * this.beaker.getLiquidLevel();
    const gasRate = this.resolveGasRate(state);
    if (state.gasType) this.latchedGas = state.gasType;

    for (const eff of state.activeEffects) {
      if (eff.type === 'pour' && !this.isPouring) {
        this.triggerPour(eff.color || 0xffffff);
      } else if (eff.type === 'precipitate' && !this.isPrecipitating) {
        this.triggerPrecipitation(eff.color || 0x0288d1);
      } else if (eff.type === 'sodium_burn' && !this.isSodiumBurning) {
        this.triggerSodiumBurn();
      } else if (eff.type === 'exotherm') {
        this.triggerHeatPulse(eff.intensity || 1.0);
      }
    }

    if (this.isPouring) {
      this.pourTimer -= delta;
      if (this.pourTimer <= 0) {
        this.isPouring = false;
        this.pourStreamMat.opacity = 0;
        this.pourStream.visible = false;
      } else {
        this.pourStreamMat.opacity = Math.min(0.85, this.pourTimer * 2.5);
        this.pourStream.visible = true;
        const topY = 0.42;
        const bottomY = liquidSurfaceLocalY;
        const streamH = Math.max(0.05, topY - bottomY);
        this.pourStream.scale.set(1, streamH / 0.35, 1);
        this.pourStream.position.set(0.015, bottomY + streamH / 2, 0.015);
      }
    } else {
      this.pourStream.visible = false;
    }

    if (this.isPrecipitating) {
      this.precipTimer -= delta;
      if (this.precipTimer <= 0) {
        this.isPrecipitating = false;
        this.precipMat.opacity = 0;
        this.precipParticles.visible = false;
      } else {
        this.precipMat.opacity = Math.min(0.9, this.precipTimer * 0.45);
        this.precipParticles.visible = true;
      }
    } else {
      this.precipParticles.visible = this.precipMat.opacity > 0.01;
    }

    if (this.isSodiumBurning) {
      this.sodiumTimer -= delta;
      if (this.sodiumTimer <= 0) {
        this.isSodiumBurning = false;
        this.sodiumBall.visible = false;
        this.sodiumLight.intensity = 0;
        this.sodiumLight.visible = false;
      }
    }

    this.simulateGas(delta, liquidSurfaceLocalY, gasRate);
    this.simulateColorBloom(delta, state);
    this.simulatePrecipCloud(delta, liquidSurfaceLocalY);
    this.simulateHeatWisps(delta, liquidSurfaceLocalY);
    this.updateParticlesSync(delta, liquidSurfaceLocalY);

    if (this.heatGlowLight.intensity > 0) {
      this.beaker.pulseHeat(Math.min(1, this.heatGlowLight.intensity / 2.2));
      this.heatGlowLight.intensity = Math.max(0, this.heatGlowLight.intensity - delta * 1.5);
      if (this.heatGlowLight.intensity <= 0.01) {
        this.heatGlowLight.intensity = 0;
        this.heatGlowLight.visible = false;
      }
    }

    const kick = Math.min(1, gasRate * 0.72 + this.popKick);
    if (kick > 0.03) this.beaker.disturbSurface(kick);
    this.popKick = Math.max(0, this.popKick - delta * 2.4);
  }

  private resolveGasRate(state: ChemistryState): number {
    let gasRate = state.activeGasRate;
    for (const eff of state.activeEffects) {
      if (eff.type === 'gas') gasRate = Math.max(gasRate, eff.intensity ?? 0.7);
    }
    return gasRate;
  }

  private simulateGas(delta: number, surfaceY: number, gasRate: number): void {
    const bubbling = gasRate > 0.05 || this.bubbleMesh.visible || this.mistParticles.visible || this.ripplesActive;
    if (!bubbling) return;

    const gas = this.latchedGas ?? 'H2';
    const look = GAS_LOOK[gas];
    if (gasRate > 0.05) {
      this.bubbleMat.color.setHex(look.tint);
      this.mistMat.color.setHex(look.mistColor);
      if (!this.gasWasActive) this.packetTimer = 0;
      this.gasWasActive = true;
      this.packetTimer -= delta;
      if (this.packetTimer <= 0) {
        this.spawnPacket(look, gas, surfaceY);
        this.packetTimer = look.interval / (0.45 + gasRate * 1.4);
      }
    } else {
      this.gasWasActive = false;
    }

    const liquidR = this.beaker.getLiquidRadius();
    let anyBubble = false;
    for (let i = 0; i < this.maxBubbles; i++) {
      const mode = this.bubbleMode[i];
      if (mode === 1) {
        anyBubble = true;
        this.bubblePhase[i] += delta * (4.2 + this.bubbleSpeed[i] * 6);
        this.bubbleY[i] += this.bubbleSpeed[i] * delta * (0.75 + gasRate * 1.15);
        this.bubbleX[i] += Math.sin(this.bubblePhase[i]) * look.wobble * delta;
        this.bubbleZ[i] += Math.cos(this.bubblePhase[i] * 0.85) * look.wobble * delta;
        const radial = Math.hypot(this.bubbleX[i], this.bubbleZ[i]);
        const limit = liquidR * 0.9;
        if (radial > limit) {
          this.bubbleX[i] *= limit / radial;
          this.bubbleZ[i] *= limit / radial;
        }
        if (this.bubbleY[i] >= surfaceY - 0.002) {
          this.popKick = Math.min(1, this.popKick + 0.16);
          this.spawnRipple(this.bubbleX[i], this.bubbleZ[i], surfaceY);
          this.spawnMist(this.bubbleX[i], this.bubbleZ[i], surfaceY);
          if (Math.random() < look.foam) {
            this.bubbleMode[i] = 2;
            this.bubbleY[i] = surfaceY + 0.001;
            this.bubbleLife[i] = 0.28 + Math.random() * look.foamLife;
          } else {
            this.bubbleMode[i] = 0;
          }
        }
      } else if (this.bubbleMode[i] === 2) {
        anyBubble = true;
        this.bubbleLife[i] -= delta;
        this.bubblePhase[i] += delta * 6;
        this.bubbleY[i] = surfaceY + Math.sin(this.bubblePhase[i]) * 0.0012;
        this.bubbleX[i] += Math.sin(this.bubblePhase[i]) * delta * 0.01;
        this.bubbleZ[i] += Math.cos(this.bubblePhase[i]) * delta * 0.01;
        const foamR = Math.hypot(this.bubbleX[i], this.bubbleZ[i]);
        const foamLimit = liquidR * 0.88;
        if (foamR > foamLimit) {
          this.bubbleX[i] *= foamLimit / foamR;
          this.bubbleZ[i] *= foamLimit / foamR;
        }
        if (this.bubbleLife[i] <= 0) this.bubbleMode[i] = 0;
      }

      if (this.bubbleMode[i] === 0) {
        this.scratch.position.set(0, -2, 0);
        this.scratch.scale.set(0, 0, 0);
      } else if (this.bubbleMode[i] === 2) {
        const fade = Math.min(1, this.bubbleLife[i] * 4);
        const s = this.bubbleRadius[i] * (1.12 + Math.sin(this.bubblePhase[i]) * 0.06) * fade;
        this.scratch.position.set(this.bubbleX[i], this.bubbleY[i], this.bubbleZ[i]);
        this.scratch.scale.set(s * 1.35, s * 0.48, s * 1.35);
      } else {
        const climb = surfaceY > 0.02 ? Math.min(1, Math.max(0, this.bubbleY[i] / surfaceY)) : 0;
        const s = this.bubbleRadius[i] * (1 + climb * 0.18);
        this.scratch.position.set(this.bubbleX[i], this.bubbleY[i], this.bubbleZ[i]);
        this.scratch.scale.set(s, s, s);
      }
      this.scratch.updateMatrix();
      this.bubbleMesh.setMatrixAt(i, this.scratch.matrix);
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
    this.bubbleMesh.visible = anyBubble;

    this.stepMist(delta, surfaceY, gasRate, look);
    this.stepRipples(delta, surfaceY);
  }

  private spawnPacket(look: GasLook, gas: GasKind, surfaceY: number): void {
    const count = look.packetMin + Math.floor(Math.random() * (look.packetMax - look.packetMin + 1));
    const liquidR = this.beaker.getLiquidRadius();
    let cx: number;
    let cz: number;
    let baseY: number;
    if (gas === 'H2') {
      const site = this.siteCursor;
      this.siteCursor = (this.siteCursor + 1) % this.siteAngles.length;
      const angle = this.siteAngles[site];
      const radius = liquidR * 0.32;
      cx = Math.cos(angle) * radius;
      cz = Math.sin(angle) * radius;
      baseY = 0.012;
    } else if (gas === 'O2') {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * liquidR * 0.45;
      cx = Math.cos(angle) * radius;
      cz = Math.sin(angle) * radius;
      baseY = 0.016 + Math.random() * Math.max(0.01, surfaceY * 0.35);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * liquidR * 0.72;
      cx = Math.cos(angle) * radius;
      cz = Math.sin(angle) * radius;
      baseY = 0.014 + Math.random() * Math.max(0.02, surfaceY * 0.62);
    }
    baseY = Math.min(baseY, Math.max(0.012, surfaceY - 0.02));

    let spawned = 0;
    for (let i = 0; i < this.maxBubbles && spawned < count; i++) {
      if (this.bubbleMode[i] !== 0) continue;
      const jitterA = Math.random() * Math.PI * 2;
      const jitterR = Math.random() * 0.012;
      this.bubbleX[i] = cx + Math.cos(jitterA) * jitterR;
      this.bubbleZ[i] = cz + Math.sin(jitterA) * jitterR;
      this.bubbleY[i] = Math.min(surfaceY - 0.012, baseY + spawned * 0.0016);
      const t = Math.random();
      this.bubbleRadius[i] = look.minR + t * (look.maxR - look.minR);
      this.bubbleSpeed[i] = look.minSpeed + Math.random() * (look.maxSpeed - look.minSpeed);
      this.bubblePhase[i] = Math.random() * Math.PI * 2;
      this.bubbleLife[i] = 0;
      this.bubbleMode[i] = 1;
      spawned++;
    }
  }

  private spawnRipple(x: number, z: number, surfaceY: number): void {
    for (const ripple of this.ripples) {
      if (ripple.life > 0) continue;
      ripple.life = 0.48;
      ripple.maxLife = 0.48;
      ripple.mesh.visible = true;
      ripple.mesh.position.set(x, surfaceY + 0.0025, z);
      ripple.mesh.scale.set(0.01, 0.01, 0.01);
      ripple.mat.opacity = 0.75;
      this.ripplesActive = true;
      return;
    }
  }

  private stepRipples(delta: number, surfaceY: number): void {
    let any = false;
    for (const ripple of this.ripples) {
      if (ripple.life <= 0) continue;
      ripple.life -= delta;
      const t = 1 - Math.max(0, ripple.life) / ripple.maxLife;
      const scale = 0.012 + t * 0.075;
      ripple.mesh.scale.set(scale, scale, scale);
      ripple.mesh.position.y = surfaceY + 0.0025;
      ripple.mat.opacity = (1 - t) * 0.7;
      ripple.mesh.visible = ripple.life > 0;
      if (ripple.life > 0) any = true;
    }
    this.ripplesActive = any;
  }

  private spawnMist(x: number, z: number, surfaceY: number): void {
    for (let i = 0; i < this.maxMist; i++) {
      if (this.mistLife[i] > 0) continue;
      this.mistLife[i] = 0.7 + Math.random() * 0.6;
      this.mistPositions[i * 3] = x + (Math.random() - 0.5) * 0.01;
      this.mistPositions[i * 3 + 1] = surfaceY + 0.004;
      this.mistPositions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.01;
      this.mistSpeeds[i] = 0.06 + Math.random() * 0.1;
      return;
    }
  }

  private stepMist(delta: number, surfaceY: number, gasRate: number, look: GasLook): void {
    if (gasRate > 0.18) {
      const extras = gasRate > 0.6 ? 2 : 1;
      for (let n = 0; n < extras; n++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * this.beaker.getLiquidRadius() * 0.7;
        this.spawnMist(Math.cos(angle) * radius, Math.sin(angle) * radius, surfaceY);
      }
    }

    const mouthY = this.beaker.beakerHeight + 0.06;
    let any = false;
    const pos = this.mistPositions;
    for (let i = 0; i < this.maxMist; i++) {
      if (this.mistLife[i] <= 0) {
        pos[i * 3 + 1] = -5;
        continue;
      }
      any = true;
      this.mistLife[i] -= delta;
      pos[i * 3 + 1] += this.mistSpeeds[i] * delta * (1 + gasRate);
      pos[i * 3] += Math.sin(this.mistLife[i] * 9) * delta * 0.012;
      pos[i * 3 + 2] += Math.cos(this.mistLife[i] * 8) * delta * 0.012;
      if (pos[i * 3 + 1] > mouthY || this.mistLife[i] <= 0) {
        this.mistLife[i] = -1;
        pos[i * 3 + 1] = -5;
      }
    }
    this.mistParticles.visible = any;
    this.mistMat.opacity = any ? Math.min(0.55, (0.15 + gasRate) * look.mist) : 0;
    this.mistParticles.geometry.attributes.position.needsUpdate = true;
  }

  private simulateColorBloom(delta: number, state: ChemistryState): void {
    if (!this.colorWatchReady) {
      this.watchedColor.copy(state.liquidColor);
      this.colorWatchReady = true;
    } else {
      const shift =
        Math.abs(state.liquidColor.r - this.watchedColor.r) +
        Math.abs(state.liquidColor.g - this.watchedColor.g) +
        Math.abs(state.liquidColor.b - this.watchedColor.b);
      if (shift > 0.16) this.triggerColorBloom(state.liquidColor);
      this.watchedColor.copy(state.liquidColor);
    }

    if (this.colorBloomLife <= 0) return;
    this.colorBloomLife -= delta;
    const level = Math.max(0.05, this.beaker.getLiquidLevel());
    this.colorBloom.scale.set(1, level, 1);
    this.colorBloomMat.opacity = Math.max(0, this.colorBloomLife / this.colorBloomDuration) * 0.34;
    this.colorBloom.visible = this.colorBloomMat.opacity > 0.02;
    if (this.colorBloomLife <= 0) {
      this.colorBloomLife = 0;
      this.colorBloom.visible = false;
    }
  }

  private simulatePrecipCloud(delta: number, surfaceY: number): void {
    if (this.precipCloudLife <= 0) return;
    this.precipCloudLife -= delta;
    const t = 1 - Math.max(0, this.precipCloudLife) / 2.3;
    const mid = 0.02 + Math.max(0.02, surfaceY - 0.02) * 0.45;
    this.precipCloud.position.set(0, mid, 0);
    const scale = 0.35 + Math.min(1, t) * 1.5;
    this.precipCloud.scale.setScalar(scale);
    const fadeIn = Math.min(1, t * 8);
    const fadeOut = Math.max(0, 1 - t);
    this.precipCloudMat.opacity = fadeIn * fadeOut * 0.45;
    this.precipCloud.visible = this.precipCloudMat.opacity > 0.02;
    if (this.precipCloudLife <= 0) {
      this.precipCloudLife = 0;
      this.precipCloud.visible = false;
    }
  }

  private simulateHeatWisps(delta: number, surfaceY: number): void {
    const hot = this.heatGlowLight.intensity > 0.08;
    if (!hot && !this.heatWisps.visible) return;
    if (hot) {
      const births = this.heatGlowLight.intensity > 1 ? 3 : 1;
      for (let n = 0; n < births; n++) {
        for (let i = 0; i < this.maxHeatWisps; i++) {
          if (this.heatWispLife[i] > 0) continue;
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * this.beaker.getLiquidRadius() * 0.75;
          this.heatWispLife[i] = 0.45 + Math.random() * 0.45;
          this.heatWispSpeeds[i] = 0.05 + Math.random() * 0.07;
          this.heatWispPositions[i * 3] = Math.cos(angle) * radius;
          this.heatWispPositions[i * 3 + 1] = surfaceY + 0.002;
          this.heatWispPositions[i * 3 + 2] = Math.sin(angle) * radius;
          break;
        }
      }
    }

    let any = false;
    const ceiling = this.beaker.beakerHeight + 0.02;
    for (let i = 0; i < this.maxHeatWisps; i++) {
      if (this.heatWispLife[i] <= 0) {
        this.heatWispPositions[i * 3 + 1] = -5;
        continue;
      }
      any = true;
      this.heatWispLife[i] -= delta;
      this.heatWispPositions[i * 3 + 1] += this.heatWispSpeeds[i] * delta;
      this.heatWispPositions[i * 3] += Math.sin(this.heatWispLife[i] * 10) * delta * 0.01;
      if (this.heatWispPositions[i * 3 + 1] > ceiling || this.heatWispLife[i] <= 0) {
        this.heatWispLife[i] = -1;
        this.heatWispPositions[i * 3 + 1] = -5;
      }
    }
    this.heatWisps.visible = any;
    this.heatWispMat.opacity = any ? Math.min(0.7, this.heatGlowLight.intensity * 0.4 + 0.12) : 0;
    this.heatWisps.geometry.attributes.position.needsUpdate = true;
  }

  private updateParticlesSync(delta: number, liquidSurfaceLocalY: number): void {
    if (!this.isPouring && !this.hasActiveSplash && !this.isPrecipitating && !this.isSodiumBurning && !this.hasActiveSparks && !this.precipParticles.visible) {
      return;
    }

    if (this.isPouring) {
      this.hasActiveSplash = true;
      const splashPos = (this.pourSplashParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.pourSplashLifespans.length; i++) {
        if (this.pourSplashLifespans[i] <= 0 && Math.random() < 0.4) {
          this.pourSplashLifespans[i] = 0.3 + Math.random() * 0.2;
          splashPos[i * 3] = 0.015 + (Math.random() - 0.5) * 0.015;
          splashPos[i * 3 + 1] = liquidSurfaceLocalY + 0.002;
          splashPos[i * 3 + 2] = 0.015 + (Math.random() - 0.5) * 0.015;

          const angle = Math.random() * Math.PI * 2;
          const spd = 0.06 + Math.random() * 0.08;
          this.pourSplashVelocities[i * 3] = Math.cos(angle) * spd;
          this.pourSplashVelocities[i * 3 + 1] = 0.08 + Math.random() * 0.08;
          this.pourSplashVelocities[i * 3 + 2] = Math.sin(angle) * spd;
        }
      }
    }

    if (this.hasActiveSplash) {
      const splashPos = (this.pourSplashParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      let anyActiveSplash = false;
      for (let i = 0; i < this.pourSplashLifespans.length; i++) {
        if (this.pourSplashLifespans[i] > 0) {
          anyActiveSplash = true;
          this.pourSplashLifespans[i] -= delta;
          splashPos[i * 3] += this.pourSplashVelocities[i * 3] * delta;
          splashPos[i * 3 + 1] += this.pourSplashVelocities[i * 3 + 1] * delta;
          this.pourSplashVelocities[i * 3 + 1] -= 9.8 * 0.05 * delta;
          splashPos[i * 3 + 2] += this.pourSplashVelocities[i * 3 + 2] * delta;
        } else {
          splashPos[i * 3 + 1] = -10;
        }
      }
      this.hasActiveSplash = anyActiveSplash;
      this.pourSplashParticles.visible = anyActiveSplash;
      this.pourSplashParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.isPrecipitating || this.precipParticles.visible) {
      const pPos = (this.precipParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.maxPrecipFlakes; i++) {
        this.precipPhases[i] += delta * (1.6 + this.precipSpeeds[i] * 18);
        pPos[i * 3 + 1] -= this.precipSpeeds[i] * delta;
        pPos[i * 3] += Math.sin(this.precipPhases[i]) * 0.014 * delta;
        pPos[i * 3 + 2] += Math.cos(this.precipPhases[i] * 0.8) * 0.014 * delta;

        if (pPos[i * 3 + 1] <= 0.012) {
          if (this.precipTimer > 0.45) this.resetPrecipFlake(i, false);
          else pPos[i * 3 + 1] = 0.011;
        }
      }
      this.precipParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.isSodiumBurning) {
      this.hasActiveSparks = true;
      this.sodiumAngle += delta * 6.5;
      const orbitR = this.beaker.getLiquidRadius() * 0.65;
      const ballX = Math.cos(this.sodiumAngle) * orbitR;
      const ballZ = Math.sin(this.sodiumAngle * 1.3) * orbitR;
      const ballY = liquidSurfaceLocalY + 0.006;

      this.sodiumBall.position.set(ballX, ballY, ballZ);
      this.sodiumLight.position.set(ballX, ballY + 0.02, ballZ);
      this.sodiumLight.intensity = 1.4 + Math.sin(this.sodiumAngle * 3) * 0.6;

      const sparkPos = (this.sodiumSparkParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.sodiumSparkLifespans.length; i++) {
        if (this.sodiumSparkLifespans[i] <= 0 && Math.random() < 0.6) {
          this.sodiumSparkLifespans[i] = 0.25 + Math.random() * 0.25;
          sparkPos[i * 3] = ballX;
          sparkPos[i * 3 + 1] = ballY;
          sparkPos[i * 3 + 2] = ballZ;

          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 0.5;
          const spd = 0.15 + Math.random() * 0.25;

          this.sodiumSparkVelocities[i * 3] = Math.sin(phi) * Math.cos(theta) * spd;
          this.sodiumSparkVelocities[i * 3 + 1] = Math.cos(phi) * spd;
          this.sodiumSparkVelocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
        }
      }
    }

    if (this.hasActiveSparks) {
      const sPos = (this.sodiumSparkParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      let anyActiveSparks = false;
      for (let i = 0; i < this.sodiumSparkLifespans.length; i++) {
        if (this.sodiumSparkLifespans[i] > 0) {
          anyActiveSparks = true;
          this.sodiumSparkLifespans[i] -= delta;
          sPos[i * 3] += this.sodiumSparkVelocities[i * 3] * delta;
          sPos[i * 3 + 1] += this.sodiumSparkVelocities[i * 3 + 1] * delta;
          this.sodiumSparkVelocities[i * 3 + 1] -= 9.8 * 0.08 * delta;
          sPos[i * 3 + 2] += this.sodiumSparkVelocities[i * 3 + 2] * delta;
        } else {
          sPos[i * 3 + 1] = -10;
        }
      }
      this.hasActiveSparks = anyActiveSparks || this.isSodiumBurning;
      this.sodiumSparkParticles.visible = anyActiveSparks || this.isSodiumBurning;
      this.sodiumSparkParticles.geometry.attributes.position.needsUpdate = true;
    }
  }
}
