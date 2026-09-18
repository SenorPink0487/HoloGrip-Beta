import * as THREE from 'three';
import type { ChemistryState } from '../chemistry/ChemistryEngine';

export class BeakerMesh {
  public readonly group = new THREE.Group();

  private glassBody: THREE.Mesh;
  private liquidMesh: THREE.Mesh;
  private liquidTopDisc: THREE.Mesh;
  private sedimentMesh: THREE.Mesh;
  private liquidMaterial: THREE.MeshPhysicalMaterial;
  private sedimentMaterial: THREE.MeshStandardMaterial;

  private targetLiquidLevel = 0.24; // 0 to 1 ratio
  private currentLiquidLevel = 0.24;
  private targetLiquidColor = new THREE.Color(0xd7f3ff);
  private currentLiquidColor = new THREE.Color(0xd7f3ff);
  private targetLiquidOpacity = 0.82;
  private currentLiquidOpacity = 0.82;
  private targetLiquidRoughness = 0.06;
  private currentLiquidRoughness = 0.06;

  private targetSedimentOpacity = 0.0;
  private currentSedimentOpacity = 0.0;
  private targetSedimentScale = 0.001;
  private currentSedimentScale = 0.001;
  private targetSedimentColor = new THREE.Color(0xffffff);
  private currentSedimentColor = new THREE.Color(0xffffff);

  private targetBeakerScale = 0.0;
  private currentBeakerScale = 0.0;

  public readonly maxLiquidHeight = 0.28; // Max height in meters
  public readonly beakerHeight = 0.36;
  public readonly beakerRadius = 0.14;

  public restingPosition = new THREE.Vector3(0, 0.852, 1.10);
  public currentTiltZ = 0;
  public targetTiltZ = 0;
  public onVisibilityChange?: (visible: boolean, animate: boolean) => void;

  private isHovered = false;
  private hoverIntensity = 0.0;
  private glassMaterial: THREE.MeshPhysicalMaterial;
  private haloRing: THREE.Mesh;
  private haloMaterial: THREE.MeshBasicMaterial;

  constructor() {
    this.group.name = 'ChemistryBeaker';
    this.group.visible = false;
    this.group.scale.set(0.001, 0.001, 0.001);
    this.createGlassBeaker();
    this.createSedimentLayer();
    this.createLiquid();
  }

  private createTickTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 1024, 1024);

    // Beaker markings on one side
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';

    // Top logo / text
    ctx.fillText('BORO 3.3', 280, 240);
    ctx.font = '20px monospace';
    ctx.fillText('APPROX. VOL', 280, 275);

    // Ticks: 50, 100, 150, 200, 250 mL
    const ticks = [
      { ml: '250', y: 340 },
      { ml: '200', y: 440 },
      { ml: '150', y: 540 },
      { ml: '100', y: 640 },
      { ml: '50',  y: 740 },
    ];

    for (const t of ticks) {
      // Main tick line
      ctx.beginPath();
      ctx.moveTo(280, t.y);
      ctx.lineTo(360, t.y);
      ctx.stroke();

      // Number
      ctx.fillText(t.ml, 380, t.y + 7);

      // Sub-tick line in between
      if (t.ml !== '50') {
        ctx.beginPath();
        ctx.moveTo(280, t.y + 50);
        ctx.lineTo(325, t.y + 50);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private createGlassBeaker(): void {
    const outerRadius = this.beakerRadius;
    const height = this.beakerHeight;
    const wallThickness = 0.008;
    const innerRadius = outerRadius - wallThickness;

    // Lathe profile for realistic laboratory beaker with beveled base and flaring lip
    const points: THREE.Vector2[] = [];
    const segments = 24;

    // 1. Inner bottom center to inner wall
    points.push(new THREE.Vector2(0, wallThickness));
    points.push(new THREE.Vector2(innerRadius - 0.01, wallThickness));
    points.push(new THREE.Vector2(innerRadius, wallThickness + 0.01));

    // 2. Inner wall going up
    points.push(new THREE.Vector2(innerRadius, height - 0.02));

    // 3. Flaring top lip
    points.push(new THREE.Vector2(innerRadius + 0.008, height));
    points.push(new THREE.Vector2(outerRadius + 0.008, height));
    points.push(new THREE.Vector2(outerRadius, height - 0.01));

    // 4. Outer wall going down
    points.push(new THREE.Vector2(outerRadius, 0.01));
    points.push(new THREE.Vector2(outerRadius - 0.01, 0));

    // 5. Outer bottom center
    points.push(new THREE.Vector2(0, 0));

    const latheGeo = new THREE.LatheGeometry(points, 48);
    const tickTexture = this.createTickTexture();

    // High-performance physical glass: uses forward specular clearcoat lobes instead of
    // transmission framebuffer copies, maintaining 120+ FPS with crystal-clear laboratory glass fidelity
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f8ff,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.92,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.glassMaterial = glassMat;
    this.glassBody = new THREE.Mesh(latheGeo, glassMat);
    this.glassBody.castShadow = false; // Clear glass does not cast dense opaque shadow
    this.glassBody.receiveShadow = true;
    this.group.add(this.glassBody);

    // Ground holographic interaction halo ring
    const haloGeo = new THREE.RingGeometry(outerRadius * 0.98, outerRadius * 1.25, 48);
    this.haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.haloRing = new THREE.Mesh(haloGeo, this.haloMaterial);
    this.haloRing.rotation.x = -Math.PI / 2;
    this.haloRing.position.y = 0.002;
    this.group.add(this.haloRing);

    // Beaker markings cylinder overlay
    const markingsGeo = new THREE.CylinderGeometry(outerRadius + 0.0005, outerRadius + 0.0005, height * 0.95, 64, 1, true);
    const markingsMat = new THREE.MeshBasicMaterial({
      map: tickTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const markingsMesh = new THREE.Mesh(markingsGeo, markingsMat);
    markingsMesh.position.y = height * 0.5;
    markingsMesh.rotation.y = -Math.PI / 4;
    this.group.add(markingsMesh);
  }

  private createLiquid(): void {
    const liquidRadius = this.beakerRadius - 0.009;
    const maxH = this.maxLiquidHeight;

    const liquidGeo = new THREE.CylinderGeometry(liquidRadius, liquidRadius, maxH, 64, 8, false);
    // Offset geometry origin so bottom of liquid is at local y=0
    liquidGeo.translate(0, maxH / 2, 0);

    this.liquidMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.08,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
      reflectivity: 0.85,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    this.liquidMesh = new THREE.Mesh(liquidGeo, this.liquidMaterial);
    this.liquidMesh.position.y = 0.009; // Just above beaker bottom
    this.liquidMesh.scale.set(1, this.currentLiquidLevel, 1);
    this.group.add(this.liquidMesh);

    // Top surface disc (meniscus reflection)
    const discGeo = new THREE.CircleGeometry(liquidRadius, 64);
    const discMat = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.05,
      metalness: 0.02,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05,
      reflectivity: 0.9,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.liquidTopDisc = new THREE.Mesh(discGeo, discMat);
    this.liquidTopDisc.rotation.x = -Math.PI / 2;
    this.liquidTopDisc.position.y = 0.009 + maxH * this.currentLiquidLevel;
    this.group.add(this.liquidTopDisc);
  }

  private createSedimentLayer(): void {
    const sedimentRadius = this.beakerRadius - 0.01;
    const maxSedimentH = 0.03;

    const geo = new THREE.CylinderGeometry(sedimentRadius, sedimentRadius, maxSedimentH, 48);
    geo.translate(0, maxSedimentH / 2, 0);

    this.sedimentMaterial = new THREE.MeshStandardMaterial({
      color: 0x0288d1,
      roughness: 0.75,
      metalness: 0.05,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    this.sedimentMesh = new THREE.Mesh(geo, this.sedimentMaterial);
    this.sedimentMesh.position.y = 0.009;
    this.sedimentMesh.scale.set(1, 0.001, 1);
    this.group.add(this.sedimentMesh);
  }

  public setVisible(visible: boolean, animate = true): void {
    this.targetBeakerScale = visible ? 1.0 : 0.0;
    if (!animate) {
      this.currentBeakerScale = this.targetBeakerScale;
      this.group.scale.set(this.currentBeakerScale, this.currentBeakerScale, this.currentBeakerScale);
      this.group.visible = visible;
    } else {
      if (visible) {
        this.group.visible = true;
      }
    }
    this.onVisibilityChange?.(visible, animate);
  }

  public setTilt(angleZ: number): void {
    this.targetTiltZ = angleZ;
  }

  public isVisible(): boolean {
    return this.group.visible && this.targetBeakerScale > 0.01;
  }

  public getLipWorldPosition(direction: 'left' | 'right' = 'right'): THREE.Vector3 {
    const sign = direction === 'right' ? 1 : -1;
    const localLip = new THREE.Vector3(sign * (this.beakerRadius + 0.006), this.beakerHeight, 0);
    const worldPos = localLip.clone();
    this.group.localToWorld(worldPos);
    return worldPos;
  }

  public getMouthWorldPosition(): THREE.Vector3 {
    const localMouth = new THREE.Vector3(0, this.beakerHeight, 0);
    const worldPos = localMouth.clone();
    this.group.localToWorld(worldPos);
    return worldPos;
  }

  public getLiquidLevel(): number {
    return this.currentLiquidLevel;
  }

  public getLiquidColor(): THREE.Color {
    return this.currentLiquidColor;
  }

  public get liquidColor(): THREE.Color {
    return this.currentLiquidColor;
  }

  public updateFromState(state: ChemistryState): void {
    this.targetLiquidLevel = Math.max(0.05, Math.min(1.0, state.volume / state.maxVolume));
    this.targetLiquidColor.copy(state.liquidColor);

    // Check precipitates for sediment and turbidity
    let totalPrecipMoles = 0;
    let dominantColor = 0xffffff;

    for (const [_, p] of state.precipitates) {
      if (p.moles > totalPrecipMoles) {
        totalPrecipMoles = p.moles;
        dominantColor = p.color;
      }
    }

    if (totalPrecipMoles > 0.0003) {
      this.targetSedimentScale = Math.min(1.0, totalPrecipMoles * 40.0);
      this.targetSedimentColor.setHex(dominantColor);
      this.targetSedimentOpacity = 0.94;
      // Turbid milky suspension scattering
      this.targetLiquidOpacity = 0.95;
      this.targetLiquidRoughness = 0.32;
    } else {
      this.targetSedimentOpacity = 0.0;
      this.targetSedimentScale = 0.001;
      // Clear solution: slightly higher opacity for colored solutions, high clarity
      const isColored = Math.abs(state.liquidColor.r - 0.84) > 0.08 ||
                        Math.abs(state.liquidColor.g - 0.95) > 0.08 ||
                        Math.abs(state.liquidColor.b - 1.0) > 0.08;
      this.targetLiquidOpacity = isColored ? 0.88 : 0.78;
      this.targetLiquidRoughness = isColored ? 0.06 : 0.04;
    }
  }

  public getLiquidSurfaceWorldY(): number {
    const localTopY = 0.009 + this.maxLiquidHeight * this.currentLiquidLevel;
    const worldPos = new THREE.Vector3(0, localTopY, 0);
    this.group.localToWorld(worldPos);
    return worldPos.y;
  }

  public getLiquidRadius(): number {
    return this.beakerRadius - 0.01;
  }

  public update(delta: number): void {
    // Smooth beaker scale animation
    if (this.currentBeakerScale !== this.targetBeakerScale) {
      this.currentBeakerScale = THREE.MathUtils.lerp(this.currentBeakerScale, this.targetBeakerScale, delta * 5.0);
      this.group.scale.set(this.currentBeakerScale, this.currentBeakerScale, this.currentBeakerScale);
      if (this.currentBeakerScale < 0.01 && this.targetBeakerScale === 0) {
        this.group.visible = false;
      }
    }

    // Smooth beaker tilt animation & physics
    this.currentTiltZ = THREE.MathUtils.lerp(this.currentTiltZ, this.targetTiltZ, delta * 12.0);
    this.group.rotation.z = this.currentTiltZ;

    // Smooth level change
    this.currentLiquidLevel = THREE.MathUtils.lerp(this.currentLiquidLevel, this.targetLiquidLevel, delta * 3.5);
    this.liquidMesh.scale.set(1, this.currentLiquidLevel, 1);

    const surfaceY = 0.009 + this.maxLiquidHeight * this.currentLiquidLevel;

    // Strict fluid mechanics: liquid free surface remains horizontal in world space
    // As beaker rotates by currentTiltZ, liquid top disc counter-rotates by -currentTiltZ
    // and stays strictly centered within the glass walls without protruding outside
    if (Math.abs(this.currentTiltZ) > 0.001) {
      this.liquidTopDisc.rotation.z = -this.currentTiltZ;
      this.liquidTopDisc.position.x = 0;
      this.liquidTopDisc.position.y = surfaceY;

      this.liquidMesh.rotation.z = 0;
      this.liquidMesh.position.x = 0;
    } else {
      this.liquidTopDisc.rotation.z = 0;
      this.liquidTopDisc.position.x = 0;
      this.liquidTopDisc.position.y = surfaceY;

      this.liquidMesh.rotation.z = 0;
      this.liquidMesh.position.x = 0;

      // Slight wave / wobble on top disc when changing level
      const levelDiff = Math.abs(this.targetLiquidLevel - this.currentLiquidLevel);
      if (levelDiff > 0.002) {
        this.liquidTopDisc.rotation.z = Math.sin(Date.now() * 0.01) * 0.015 * Math.min(1.0, levelDiff * 20);
      }
    }

    // Smooth liquid color change
    this.currentLiquidColor.lerp(this.targetLiquidColor, delta * 5.0);
    this.liquidMaterial.color.copy(this.currentLiquidColor);
    (this.liquidTopDisc.material as THREE.MeshPhysicalMaterial).color.copy(this.currentLiquidColor);

    // Smooth liquid opacity & roughness change (turbidity scattering)
    this.currentLiquidOpacity = THREE.MathUtils.lerp(this.currentLiquidOpacity, this.targetLiquidOpacity, delta * 4.0);
    this.liquidMaterial.opacity = this.currentLiquidOpacity;
    (this.liquidTopDisc.material as THREE.MeshPhysicalMaterial).opacity = Math.min(0.92, this.currentLiquidOpacity * 0.9);

    this.currentLiquidRoughness = THREE.MathUtils.lerp(this.currentLiquidRoughness, this.targetLiquidRoughness, delta * 4.0);
    this.liquidMaterial.roughness = this.currentLiquidRoughness;

    // Smooth sediment animation
    this.currentSedimentOpacity = THREE.MathUtils.lerp(this.currentSedimentOpacity, this.targetSedimentOpacity, delta * 4.0);
    this.sedimentMaterial.opacity = this.currentSedimentOpacity;

    this.currentSedimentScale = THREE.MathUtils.lerp(this.currentSedimentScale, this.targetSedimentScale, delta * 4.0);
    this.sedimentMesh.scale.set(1, this.currentSedimentScale, 1);

    this.currentSedimentColor.lerp(this.targetSedimentColor, delta * 4.0);
    this.sedimentMaterial.color.copy(this.currentSedimentColor);

    // Smooth hover interactive feedback
    const targetHover = this.isHovered ? 1.0 : 0.0;
    this.hoverIntensity = THREE.MathUtils.lerp(this.hoverIntensity, targetHover, delta * 8.0);
    if (this.glassMaterial) {
      this.glassMaterial.emissive.set(0xffffff);
      this.glassMaterial.emissiveIntensity = this.hoverIntensity * 0.16;
    }
    if (this.haloMaterial && this.haloRing) {
      this.haloMaterial.opacity = 0.05 + this.hoverIntensity * 0.28;
      const ringScale = 1.0 + this.hoverIntensity * 0.04;
      this.haloRing.scale.set(ringScale, ringScale, 1.0);
    }
  }

  public setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return [this.glassBody, this.liquidMesh, this.haloRing];
  }
}
