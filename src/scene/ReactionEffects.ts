import * as THREE from 'three';
import type { ChemistryState } from '../chemistry/ChemistryEngine';
import type { BeakerMesh } from './BeakerMesh';

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
  private pourTimer = 0;
  private pourColor = new THREE.Color(0xffffff);

  // Gas bubble particles
  private bubbleParticles: THREE.Points;
  private bubblePositions: Float32Array;
  private bubbleVelocities: Float32Array;
  private bubblePhases: Float32Array;
  private bubbleMat: THREE.PointsMaterial;
  private readonly maxBubbles = 90;

  // Precipitating flakes
  private precipParticles: THREE.Points;
  private precipPositions: Float32Array;
  private precipSpeeds: Float32Array;
  private precipMat: THREE.PointsMaterial;
  private isPrecipitating = false;
  private precipTimer = 0;
  private readonly maxPrecipFlakes = 120;

  // Sodium burn effect
  private sodiumBall: THREE.Mesh;
  private sodiumLight: THREE.PointLight;
  private sodiumSparkParticles: THREE.Points;
  private sodiumSparkPositions: Float32Array;
  private sodiumSparkVelocities: Float32Array;
  private sodiumSparkLifespans: Float32Array;
  private isSodiumBurning = false;
  private sodiumTimer = 0;
  private sodiumAngle = 0;
  private readonly maxSodiumSparks = 70;

  // Exotherm glow light
  private heatGlowLight: THREE.PointLight;

  private computeBridge: any = null;
  private isWorkerBusy = false;

  constructor(private beaker: BeakerMesh) {
    this.group.name = 'ReactionEffects';

    this.initPourEffect();
    this.initGasBubbles();
    this.initPrecipitateFlakes();
    this.initSodiumBurnEffect();
    this.initHeatGlow();
  }

  public setComputeBridge(bridge: any): void {
    this.computeBridge = bridge;
  }

  private initPourEffect(): void {
    // Slender falling liquid cylinder
    const streamGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.35, 16);
    this.pourStreamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.pourStream = new THREE.Mesh(streamGeo, this.pourStreamMat);
    this.pourStream.position.set(0.02, 0.32, 0.02);
    this.group.add(this.pourStream);

    // Splash particles
    const splashCount = 35;
    const splashGeo = new THREE.BufferGeometry();
    this.pourSplashPositions = new Float32Array(splashCount * 3);
    this.pourSplashVelocities = new Float32Array(splashCount * 3);
    this.pourSplashLifespans = new Float32Array(splashCount);

    for (let i = 0; i < splashCount; i++) {
      this.pourSplashLifespans[i] = -1; // Inactive
    }

    splashGeo.setAttribute('position', new THREE.BufferAttribute(this.pourSplashPositions, 3));
    const splashMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.012,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pourSplashParticles = new THREE.Points(splashGeo, splashMat);
    this.group.add(this.pourSplashParticles);
  }

  private initGasBubbles(): void {
    const count = this.maxBubbles;
    const geo = new THREE.BufferGeometry();
    this.bubblePositions = new Float32Array(count * 3);
    this.bubbleVelocities = new Float32Array(count);
    this.bubblePhases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.resetBubble(i, true);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.bubblePositions, 3));
    this.bubbleMat = new THREE.PointsMaterial({
      color: 0xdff9fb,
      size: 0.014,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bubbleParticles = new THREE.Points(geo, this.bubbleMat);
    this.group.add(this.bubbleParticles);
  }

  private resetBubble(i: number, randomY = false): void {
    const rMax = this.beaker.getLiquidRadius() * 0.85;
    const r = Math.sqrt(Math.random()) * rMax;
    const angle = Math.random() * Math.PI * 2;

    this.bubblePositions[i * 3] = Math.cos(angle) * r;
    this.bubblePositions[i * 3 + 1] = randomY
      ? 0.01 + Math.random() * (this.beaker.maxLiquidHeight * 0.5)
      : 0.012; // Start from beaker bottom
    this.bubblePositions[i * 3 + 2] = Math.sin(angle) * r;

    this.bubbleVelocities[i] = 0.08 + Math.random() * 0.14;
    this.bubblePhases[i] = Math.random() * Math.PI * 2;
  }

  private initPrecipitateFlakes(): void {
    const count = this.maxPrecipFlakes;
    const geo = new THREE.BufferGeometry();
    this.precipPositions = new Float32Array(count * 3);
    this.precipSpeeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.resetPrecipFlake(i, true);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.precipPositions, 3));
    this.precipMat = new THREE.PointsMaterial({
      color: 0x0288d1,
      size: 0.016,
      transparent: true,
      opacity: 0.0,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    this.precipParticles = new THREE.Points(geo, this.precipMat);
    this.group.add(this.precipParticles);
  }

  private resetPrecipFlake(i: number, randomY = false): void {
    const rMax = this.beaker.getLiquidRadius() * 0.88;
    const r = Math.sqrt(Math.random()) * rMax;
    const angle = Math.random() * Math.PI * 2;

    const liquidH = Math.max(0.04, this.beaker.maxLiquidHeight * (this.beaker['targetLiquidLevel'] || 0.3));

    this.precipPositions[i * 3] = Math.cos(angle) * r;
    this.precipPositions[i * 3 + 1] = randomY
      ? 0.02 + Math.random() * (liquidH - 0.02)
      : liquidH - 0.015;
    this.precipPositions[i * 3 + 2] = Math.sin(angle) * r;

    this.precipSpeeds[i] = 0.025 + Math.random() * 0.035;
  }

  private initSodiumBurnEffect(): void {
    // Metallic sodium sphere floating on surface
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
    this.group.add(this.sodiumBall);

    // Warm golden glow light
    this.sodiumLight = new THREE.PointLight(0xff9100, 0, 1.8, 2.0);
    this.group.add(this.sodiumLight);

    // Golden sparks
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
      size: 0.015,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sodiumSparkParticles = new THREE.Points(geo, sparkMat);
    this.group.add(this.sodiumSparkParticles);
  }

  private initHeatGlow(): void {
    this.heatGlowLight = new THREE.PointLight(0xff7043, 0, 2.0, 2.0);
    this.heatGlowLight.position.set(0, 0.1, 0);
    this.group.add(this.heatGlowLight);
  }

  public triggerPour(hexColor: number): void {
    this.isPouring = true;
    this.pourTimer = 1.1;
    this.pourColor.setHex(hexColor);
    this.pourStreamMat.color.copy(this.pourColor);
    this.pourStreamMat.opacity = 0.85;
  }

  public triggerPrecipitation(hexColor: number): void {
    this.isPrecipitating = true;
    this.precipTimer = 3.5;
    this.precipMat.color.setHex(hexColor);
    this.precipMat.opacity = 0.85;

    for (let i = 0; i < this.maxPrecipFlakes; i++) {
      this.resetPrecipFlake(i, true);
    }
  }

  public triggerSodiumBurn(): void {
    this.isSodiumBurning = true;
    this.sodiumTimer = 4.5;
    this.sodiumBall.visible = true;
    this.sodiumLight.intensity = 1.8;
  }

  public triggerHeatPulse(intensity = 1.0): void {
    this.heatGlowLight.intensity = Math.min(2.5, intensity * 2.0);
  }

  public reset(): void {
    this.isPouring = false;
    this.pourTimer = 0;
    if (this.pourStreamMat) this.pourStreamMat.opacity = 0;

    this.isPrecipitating = false;
    this.precipTimer = 0;
    if (this.precipMat) this.precipMat.opacity = 0;

    this.isSodiumBurning = false;
    this.sodiumTimer = 0;
    if (this.sodiumBall) this.sodiumBall.visible = false;
    if (this.sodiumLight) this.sodiumLight.intensity = 0;

    if (this.bubbleMat) this.bubbleMat.opacity = 0;
    if (this.heatGlowLight) this.heatGlowLight.intensity = 0;

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
    const liquidSurfaceLocalY = 0.009 + this.beaker.maxLiquidHeight * (this.beaker['currentLiquidLevel'] || 0.24);

    // 1. Process active effects from state
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

    // 2. Animate Pour Stream
    if (this.isPouring) {
      this.pourTimer -= delta;
      if (this.pourTimer <= 0) {
        this.isPouring = false;
        this.pourStreamMat.opacity = 0;
      } else {
        this.pourStreamMat.opacity = Math.min(0.85, this.pourTimer * 2.5);
        // Connect stream top to bottom
        const topY = 0.42;
        const bottomY = liquidSurfaceLocalY;
        const streamH = Math.max(0.05, topY - bottomY);
        this.pourStream.scale.set(1, streamH / 0.35, 1);
        this.pourStream.position.set(0.015, bottomY + streamH / 2, 0.015);
      }
    }

    // Material opacities and timer counters
    const gasRate = state.activeGasRate;
    if (gasRate > 0.05) {
      this.bubbleMat.opacity = THREE.MathUtils.lerp(this.bubbleMat.opacity, Math.min(0.85, gasRate * 0.9), delta * 4);
    } else {
      this.bubbleMat.opacity = THREE.MathUtils.lerp(this.bubbleMat.opacity, 0.0, delta * 3);
    }

    if (this.isPrecipitating) {
      this.precipTimer -= delta;
      if (this.precipTimer <= 0) {
        this.isPrecipitating = false;
        this.precipMat.opacity = 0;
      } else {
        this.precipMat.opacity = Math.min(0.85, this.precipTimer * 0.4);
      }
    }

    if (this.isSodiumBurning) {
      this.sodiumTimer -= delta;
      if (this.sodiumTimer <= 0) {
        this.isSodiumBurning = false;
        this.sodiumBall.visible = false;
        this.sodiumLight.intensity = 0;
      }
    }

    // Dispatch particle physics to Multi-Core Web Worker
    if (this.computeBridge && !this.isWorkerBusy) {
      this.isWorkerBusy = true;
      this.computeBridge
        .simulateParticles({
          bubblePositions: this.bubblePositions,
          bubbleVelocities: this.bubbleVelocities,
          bubblePhases: this.bubblePhases,
          gasRate,
          precipPositions: this.precipPositions,
          precipSpeeds: this.precipSpeeds,
          isPrecipitating: this.isPrecipitating,
          splashPositions: this.pourSplashPositions,
          splashVelocities: this.pourSplashVelocities,
          splashLifespans: this.pourSplashLifespans,
          isPouring: this.isPouring,
          sodiumSparkPositions: this.sodiumSparkPositions,
          sodiumSparkVelocities: this.sodiumSparkVelocities,
          sodiumSparkLifespans: this.sodiumSparkLifespans,
          isSodiumBurning: this.isSodiumBurning,
          sodiumAngle: this.sodiumAngle,
          liquidSurfaceLocalY,
          liquidRadius: this.beaker.getLiquidRadius(),
          maxLiquidHeight: this.beaker.maxLiquidHeight,
          dt: delta,
        })
        .then((res: any) => {
          this.bubblePositions = res.bubblePositions;
          this.bubbleVelocities = res.bubbleVelocities;
          this.bubblePhases = res.bubblePhases;
          (this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute).copyArray(res.bubblePositions);
          this.bubbleParticles.geometry.attributes.position.needsUpdate = true;

          this.precipPositions = res.precipPositions;
          this.precipSpeeds = res.precipSpeeds;
          (this.precipParticles.geometry.attributes.position as THREE.BufferAttribute).copyArray(res.precipPositions);
          this.precipParticles.geometry.attributes.position.needsUpdate = true;

          this.pourSplashPositions = res.splashPositions;
          this.pourSplashVelocities = res.splashVelocities;
          this.pourSplashLifespans = res.splashLifespans;
          (this.pourSplashParticles.geometry.attributes.position as THREE.BufferAttribute).copyArray(res.splashPositions);
          this.pourSplashParticles.geometry.attributes.position.needsUpdate = true;

          this.sodiumSparkPositions = res.sodiumSparkPositions;
          this.sodiumSparkVelocities = res.sodiumSparkVelocities;
          this.sodiumSparkLifespans = res.sodiumSparkLifespans;
          (this.sodiumSparkParticles.geometry.attributes.position as THREE.BufferAttribute).copyArray(res.sodiumSparkPositions);
          this.sodiumSparkParticles.geometry.attributes.position.needsUpdate = true;

          if (this.isSodiumBurning && res.sodiumBallPos) {
            this.sodiumBall.position.set(res.sodiumBallPos[0], res.sodiumBallPos[1], res.sodiumBallPos[2]);
            this.sodiumLight.position.set(res.sodiumBallPos[0], res.sodiumBallPos[1] + 0.02, res.sodiumBallPos[2]);
            this.sodiumLight.intensity = 1.4 + Math.sin(Date.now() * 0.03) * 0.6;
            this.sodiumAngle = res.sodiumAngle;
          }
        })
        .catch((err: any) => {
          console.warn('[ReactionEffects] Worker particle sim error:', err);
        })
        .finally(() => {
          this.isWorkerBusy = false;
        });
    } else if (!this.computeBridge) {
      // Local sync fallback for test environments without worker pool
      this.updateParticlesSync(delta, liquidSurfaceLocalY, gasRate);
    }

    // Heat Glow decay
    if (this.heatGlowLight.intensity > 0) {
      this.heatGlowLight.intensity = Math.max(0, this.heatGlowLight.intensity - delta * 1.5);
    }
  }

  private updateParticlesSync(delta: number, liquidSurfaceLocalY: number, gasRate: number): void {
    if (this.isPouring) {
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
    if (anyActiveSplash) {
      this.pourSplashParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (gasRate > 0.05) {
      const bPos = (this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.maxBubbles; i++) {
        bPos[i * 3 + 1] += this.bubbleVelocities[i] * delta * (0.8 + gasRate * 0.8);
        this.bubblePhases[i] += delta * 5.0;
        bPos[i * 3] += Math.sin(this.bubblePhases[i]) * 0.0008;
        bPos[i * 3 + 2] += Math.cos(this.bubblePhases[i]) * 0.0008;

        if (bPos[i * 3 + 1] >= liquidSurfaceLocalY) {
          this.resetBubble(i);
        }
      }
      this.bubbleParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.isPrecipitating) {
      const pPos = (this.precipParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.maxPrecipFlakes; i++) {
        pPos[i * 3 + 1] -= this.precipSpeeds[i] * delta;
        pPos[i * 3] += (Math.random() - 0.5) * 0.0012;
        pPos[i * 3 + 2] += (Math.random() - 0.5) * 0.0012;

        if (pPos[i * 3 + 1] <= 0.012) {
          pPos[i * 3 + 1] = 0.011;
        }
      }
      this.precipParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.isSodiumBurning) {
      this.sodiumAngle += delta * 6.5;
      const orbitR = this.beaker.getLiquidRadius() * 0.65;
      const ballX = Math.cos(this.sodiumAngle) * orbitR;
      const ballZ = Math.sin(this.sodiumAngle * 1.3) * orbitR;
      const ballY = liquidSurfaceLocalY + 0.006;

      this.sodiumBall.position.set(ballX, ballY, ballZ);
      this.sodiumLight.position.set(ballX, ballY + 0.02, ballZ);
      this.sodiumLight.intensity = 1.4 + Math.sin(Date.now() * 0.03) * 0.6;

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
    if (anyActiveSparks) {
      this.sodiumSparkParticles.geometry.attributes.position.needsUpdate = true;
    }
  }
}
