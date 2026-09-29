import * as THREE from 'three';
import type { ChemistryState } from '../chemistry/ChemistryEngine';
import {
  buildTiltedLiquidGeometry,
  lipContactLocal,
  lipInsetLocal,
  solveLiquidPlane,
  type LiquidPlane,
} from '../chemistry/pourKinematics.ts';

export class BeakerMesh {
  public readonly group = new THREE.Group();

  private glassBody: THREE.Mesh;
  private liquidMesh: THREE.Mesh;
  private liquidTopDisc: THREE.Mesh;
  private sedimentMesh: THREE.Mesh;
  private liquidMaterial: THREE.MeshPhysicalMaterial;
  private sedimentMaterial: THREE.MeshStandardMaterial;

  private targetLiquidLevel = 0.24; // 0 至 1 之间的液面比例
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

  public readonly maxLiquidHeight = 0.28; // 最大液体高度（米）
  public readonly beakerHeight = 0.36;
  public readonly beakerRadius = 0.14;
  public readonly liquidRadius = this.beakerRadius - 0.009;
  public readonly liquidBottomY = 0.009;
  /** 外扩杯嘴外边缘，与车削轮廓一致。 */
  public readonly glassLipRadius = this.beakerRadius + 0.008;
  /** 水线达到杯口边缘时向外扩散的最大范围。 */
  public readonly liquidRimRadius = this.beakerRadius - 0.004;

  public restingPosition = new THREE.Vector3(0, 0.852, 1.10);
  public currentTiltZ = 0;
  public targetTiltZ = 0;
  public onVisibilityChange?: (visible: boolean, animate: boolean) => void;

  private isHovered = false;
  private hoverIntensity = 0.0;
  private glassMaterial: THREE.MeshPhysicalMaterial;
  private haloRing: THREE.Mesh;
  private haloMaterial: THREE.MeshBasicMaterial;
  private surfaceDisturbance = 0;
  private heatPulse = 0;
  private surfacePhase = 0;
  private liquidPlane!: LiquidPlane;
  private liquidGeo: THREE.BufferGeometry | null = null;
  private builtTilt = Number.NaN;
  private builtLevel = Number.NaN;

  /** 气泡沸腾、倾倒或沉淀产生的自由液面扰动，范围为 0–1。 */
  public disturbSurface(amount: number): void {
    this.surfaceDisturbance = Math.min(1, Math.max(this.surfaceDisturbance, amount));
  }

  /** 放热反应进行时加热玻璃杯壁，范围为 0–1。 */
  public pulseHeat(amount: number): void {
    this.heatPulse = Math.min(1, Math.max(this.heatPulse, amount));
  }

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

    // 烧杯单侧刻度线
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';

    // 顶部标识与文本
    ctx.fillText('BORO 3.3', 280, 240);
    ctx.font = '20px monospace';
    ctx.fillText('APPROX. VOL', 280, 275);

    // 刻度刻线：50, 100, 150, 200, 250 mL
    const ticks = [
      { ml: '250', y: 340 },
      { ml: '200', y: 440 },
      { ml: '150', y: 540 },
      { ml: '100', y: 640 },
      { ml: '50',  y: 740 },
    ];

    for (const t of ticks) {
      // 主刻度线
      ctx.beginPath();
      ctx.moveTo(280, t.y);
      ctx.lineTo(360, t.y);
      ctx.stroke();

      // 刻度数值
      ctx.fillText(t.ml, 380, t.y + 7);

      // 中间次级刻度线
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

    // 真实实验室烧杯车削轮廓（带倒角底部与外扩杯嘴）
    const points: THREE.Vector2[] = [];
    const segments = 24;

    // 1. 杯底内中心至杯内壁
    points.push(new THREE.Vector2(0, wallThickness));
    points.push(new THREE.Vector2(innerRadius - 0.01, wallThickness));
    points.push(new THREE.Vector2(innerRadius, wallThickness + 0.01));

    // 2. 杯内壁竖直向上
    points.push(new THREE.Vector2(innerRadius, height - 0.02));

    // 3. 外扩杯嘴
    points.push(new THREE.Vector2(innerRadius + 0.008, height));
    points.push(new THREE.Vector2(outerRadius + 0.008, height));
    points.push(new THREE.Vector2(outerRadius, height - 0.01));

    // 4. 杯外壁竖直向下
    points.push(new THREE.Vector2(outerRadius, 0.01));
    points.push(new THREE.Vector2(outerRadius - 0.01, 0));

    // 5. 杯底外中心
    points.push(new THREE.Vector2(0, 0));

    const latheGeo = new THREE.LatheGeometry(points, 48);
    const tickTexture = this.createTickTexture();

    // 高性能物理玻璃材质：采用前向镜面清漆层替代透射帧缓冲区复制，保持 120+ FPS 高帧率与清透质感
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f8ff,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.92,
      transparent: true,
      opacity: 0.28,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    this.glassMaterial = glassMat;
    this.glassBody = new THREE.Mesh(latheGeo, glassMat);
    this.glassBody.castShadow = false; // 透明玻璃不产生浓重不透明阴影
    this.glassBody.receiveShadow = true;
    this.glassBody.renderOrder = 5;
    this.group.add(this.glassBody);

    // 地面全息交互光环
    const haloGeo = new THREE.RingGeometry(outerRadius * 0.98, outerRadius * 1.25, 48);
    this.haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.haloRing = new THREE.Mesh(haloGeo, this.haloMaterial);
    this.haloRing.rotation.x = -Math.PI / 2;
    this.haloRing.position.y = 0.002;
    this.haloRing.renderOrder = 1;
    this.group.add(this.haloRing);

    // 烧杯刻度圆柱贴花层
    const markingsGeo = new THREE.CylinderGeometry(outerRadius + 0.0005, outerRadius + 0.0005, height * 0.95, 64, 1, true);
    const markingsMat = new THREE.MeshBasicMaterial({
      map: tickTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const markingsMesh = new THREE.Mesh(markingsGeo, markingsMat);
    markingsMesh.position.y = height * 0.5;
    markingsMesh.rotation.y = -Math.PI / 4;
    markingsMesh.renderOrder = 6;
    this.group.add(markingsMesh);
  }

  private createLiquid(): void {
    const liquidRadius = this.liquidRadius;

    this.liquidMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.06,
      metalness: 0.02,
      reflectivity: 0.85,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    this.liquidGeo = new THREE.BufferGeometry();
    this.liquidMesh = new THREE.Mesh(this.liquidGeo, this.liquidMaterial);
    this.liquidMesh.renderOrder = 3;
    this.liquidMesh.frustumCulled = false;
    this.group.add(this.liquidMesh);
    this.refreshLiquidBody(true);

    // 顶部液面圆盘（烧杯竖直放置时的弯月面反射）
    const discGeo = new THREE.CircleGeometry(liquidRadius, 64);
    const discMat = new THREE.MeshPhysicalMaterial({
      color: 0xd7f3ff,
      roughness: 0.04,
      metalness: 0.02,
      reflectivity: 0.9,
      transparent: true,
      opacity: 0.72,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.liquidTopDisc = new THREE.Mesh(discGeo, discMat);
    this.liquidTopDisc.rotation.x = -Math.PI / 2;
    this.liquidTopDisc.position.y = this.liquidBottomY + this.maxLiquidHeight * this.currentLiquidLevel;
    this.liquidTopDisc.renderOrder = 4;
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
    this.sedimentMesh.renderOrder = 2;
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
    return this.group.visible && (this.targetBeakerScale > 0.001 || this.currentBeakerScale > 0.001);
  }

  public isInteractive(): boolean {
    return this.group.visible && this.targetBeakerScale > 0.01;
  }

  public getLipWorldPosition(direction: 'left' | 'right' = 'right'): THREE.Vector3 {
    const sign = direction === 'right' ? 1 : -1;
    const localLip = new THREE.Vector3(sign * (this.beakerRadius + 0.006), this.beakerHeight, 0);
    const worldPos = localLip.clone();
    this.group.localToWorld(worldPos);
    return worldPos;
  }

  /** 外扩杯嘴外沿，即液体流出的脱离点。 */
  public glassLipLocal(direction: 'left' | 'right'): THREE.Vector3 {
    const sign = direction === 'right' ? 1 : -1;
    return new THREE.Vector3(sign * this.glassLipRadius, this.beakerHeight, 0);
  }

  public getGlassLipWorld(direction: 'left' | 'right'): THREE.Vector3 {
    return this.group.localToWorld(this.glassLipLocal(direction));
  }

  /** 移动烧杯使指定杯嘴对齐 worldLip。保持现有旋转，使杯体以杯嘴为轴旋转。 */
  public placeLipAt(worldLip: THREE.Vector3, direction: 'left' | 'right'): void {
    this.group.updateWorldMatrix(true, false);
    const current = this.group.localToWorld(this.glassLipLocal(direction));
    const delta = worldLip.clone().sub(current);
    if (delta.lengthSq() < 1e-14) return;
    const parent = this.group.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const invParent = new THREE.Quaternion();
      parent.getWorldQuaternion(invParent).invert();
      delta.applyQuaternion(invParent);
    }
    this.group.position.add(delta);
  }

  public isSpilling(): boolean {
    return this.liquidPlane?.spilling ?? false;
  }

  public getPourOverflow(): number {
    return this.liquidPlane?.overflow ?? 0;
  }

  /** 延伸至外杯嘴的自由液面点列：水体内部点、杯壁接触点、玻璃杯嘴。 */
  public getPourApproachWorld(): THREE.Vector3[] {
    const plane = this.liquidPlane;
    const sign = plane.xLip >= 0 ? 1 : -1;
    const locals = [
      lipInsetLocal(plane),
      lipContactLocal(plane, this.liquidRimRadius),
      { x: sign * this.glassLipRadius, y: this.beakerHeight, z: 0 },
    ];
    const world = locals.map((p) => this.group.localToWorld(new THREE.Vector3(p.x, p.y, p.z)));
    world[0].y += 0.0022;
    world[1].y += 0.0016;
    return world;
  }

  public getPourOutwardWorld(): THREE.Vector3 {
    const sign = (this.liquidPlane?.xLip ?? 1) >= 0 ? 1 : -1;
    const outward = new THREE.Vector3(sign, 0, 0);
    const q = new THREE.Quaternion();
    this.group.getWorldQuaternion(q);
    return outward.applyQuaternion(q).normalize();
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

    // 检查沉淀物以计算沉淀层与浊度
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
      // 浑浊乳状悬浊液漫射散射
      this.targetLiquidOpacity = 0.95;
      this.targetLiquidRoughness = 0.32;
    } else {
      this.targetSedimentOpacity = 0.0;
      this.targetSedimentScale = 0.001;
      // 澄清溶液：有色溶液透明度略低，整体保持高透明度
      const isColored = Math.abs(state.liquidColor.r - 0.84) > 0.08 ||
                        Math.abs(state.liquidColor.g - 0.95) > 0.08 ||
                        Math.abs(state.liquidColor.b - 1.0) > 0.08;
      this.targetLiquidOpacity = isColored ? 0.88 : 0.78;
      this.targetLiquidRoughness = isColored ? 0.06 : 0.04;
    }
  }

  public getLiquidSurfaceWorldY(): number {
    const localTopY = this.liquidPlane
      ? this.liquidPlane.yAtZero
      : this.liquidBottomY + this.maxLiquidHeight * this.currentLiquidLevel;
    return this.group.localToWorld(new THREE.Vector3(0, localTopY, 0)).y;
  }

  public getLiquidRadius(): number {
    return this.beakerRadius - 0.01;
  }

  /** 重建液体网格，使其自由表面保持水平并与较低杯嘴贴合。 */
  private refreshLiquidBody(force: boolean): void {
    const tiltChanged = Math.abs(this.currentTiltZ - this.builtTilt) > 1e-4;
    const levelChanged = Math.abs(this.currentLiquidLevel - this.builtLevel) > 1e-4;
    if (!force && !tiltChanged && !levelChanged && this.liquidPlane) return;

    const fillHeight = this.maxLiquidHeight * this.currentLiquidLevel;
    this.liquidPlane = solveLiquidPlane(
      this.currentTiltZ,
      fillHeight,
      this.liquidRadius,
      this.liquidBottomY,
      this.beakerHeight,
    );
    this.builtTilt = this.currentTiltZ;
    this.builtLevel = this.currentLiquidLevel;
    if (!this.liquidGeo || !this.liquidMesh) return;

    const built = buildTiltedLiquidGeometry(this.liquidPlane, 64, this.liquidRimRadius);
    const pos = this.liquidGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const idx = this.liquidGeo.getIndex();
    const reusable =
      !!pos &&
      !!idx &&
      pos.array.length === built.positions.length &&
      idx.array.length === built.indices.length &&
      pos.array.constructor === built.positions.constructor &&
      idx.array.constructor === built.indices.constructor;

    if (reusable && pos && idx) {
      (pos.array as Float32Array).set(built.positions);
      pos.needsUpdate = true;
      (idx.array as Uint32Array).set(built.indices);
      idx.needsUpdate = true;
    } else {
      this.liquidGeo.dispose();
      this.liquidGeo = new THREE.BufferGeometry();
      this.liquidGeo.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
      this.liquidGeo.setIndex(new THREE.BufferAttribute(built.indices, 1));
      this.liquidMesh.geometry = this.liquidGeo;
    }

    this.liquidMesh.position.set(0, 0, 0);
    this.liquidMesh.scale.set(1, 1, 1);
    this.liquidMesh.visible = built.indices.length > 0;
    if (built.indices.length > 0) {
      this.liquidGeo.computeVertexNormals();
      this.liquidGeo.computeBoundingSphere();
    }
  }

  public update(delta: number): void {
    // 1. 烧杯平滑缩放动画
    if (this.currentBeakerScale !== this.targetBeakerScale) {
      this.currentBeakerScale = THREE.MathUtils.lerp(this.currentBeakerScale, this.targetBeakerScale, delta * 5.0);
      if (Math.abs(this.currentBeakerScale - this.targetBeakerScale) < 0.001) {
        this.currentBeakerScale = this.targetBeakerScale;
      }
      this.group.scale.set(this.currentBeakerScale, this.currentBeakerScale, this.currentBeakerScale);
      if (this.currentBeakerScale < 0.01 && this.targetBeakerScale === 0) {
        this.currentBeakerScale = 0;
        this.group.scale.set(0, 0, 0);
        this.group.visible = false;
      }
    }

    // 2. 烧杯平滑倾斜动画，速度平缓以展示水线沿杯壁上升的过程
    const tiltDiff = Math.abs(this.currentTiltZ - this.targetTiltZ);
    if (tiltDiff > 1e-4) {
      const blend = 1 - Math.exp(-Math.max(0, delta) * 4.2);
      this.currentTiltZ = THREE.MathUtils.lerp(this.currentTiltZ, this.targetTiltZ, Math.min(1, blend));
      if (Math.abs(this.currentTiltZ - this.targetTiltZ) < 1e-4) {
        this.currentTiltZ = this.targetTiltZ;
      }
      this.group.rotation.z = this.currentTiltZ;
    }

    // 3. 平滑液位变化动画，液体网格按水平自由液面重建
    const levelDiff = Math.abs(this.currentLiquidLevel - this.targetLiquidLevel);
    if (levelDiff > 1e-4) {
      this.currentLiquidLevel = THREE.MathUtils.lerp(this.currentLiquidLevel, this.targetLiquidLevel, delta * 3.5);
      if (Math.abs(this.currentLiquidLevel - this.targetLiquidLevel) < 1e-4) {
        this.currentLiquidLevel = this.targetLiquidLevel;
      }
    }

    this.refreshLiquidBody(false);

    const surfaceY = this.liquidBottomY + this.maxLiquidHeight * this.currentLiquidLevel;
    const tilting = Math.abs(this.currentTiltZ) > 0.02;
    this.liquidTopDisc.visible = !tilting;
    if (!tilting) {
      if (this.liquidTopDisc.position.y !== surfaceY || this.liquidTopDisc.rotation.z !== 0) {
        this.liquidTopDisc.position.y = surfaceY;
        this.liquidTopDisc.rotation.z = 0;
      }
      if (levelDiff > 0.005) {
        this.liquidTopDisc.rotation.z = Math.sin(Date.now() * 0.01) * 0.015 * Math.min(1.0, levelDiff * 20);
      }
    }

    // 气泡包和冲击扰动弯月液面，在填充晃动之后计算以保证气泡效果占优
    this.surfacePhase += delta;
    if (this.surfaceDisturbance > 0.001 && Math.abs(this.currentTiltZ) <= 0.001) {
      const wobble = Math.sin(this.surfacePhase * 28) * 0.022 * this.surfaceDisturbance;
      this.liquidTopDisc.rotation.z = wobble;
      this.liquidTopDisc.position.y = surfaceY + Math.sin(this.surfacePhase * 17) * 0.0032 * this.surfaceDisturbance;
    }
    this.surfaceDisturbance = Math.max(0, this.surfaceDisturbance - delta * 0.7);
    this.heatPulse = Math.max(0, this.heatPulse - delta * 0.45);

    // 4. 液体平滑颜色过渡
    if (this.currentLiquidColor.getHex() !== this.targetLiquidColor.getHex()) {
      this.currentLiquidColor.lerp(this.targetLiquidColor, delta * 5.0);
      if (this.currentLiquidColor.getHex() === this.targetLiquidColor.getHex()) {
        this.currentLiquidColor.copy(this.targetLiquidColor);
      }
      this.liquidMaterial.color.copy(this.currentLiquidColor);
      (this.liquidTopDisc.material as THREE.MeshPhysicalMaterial).color.copy(this.currentLiquidColor);
    }

    // 5. 液体不透明度与粗糙度平滑过渡（浊度散射）
    if (Math.abs(this.currentLiquidOpacity - this.targetLiquidOpacity) > 1e-3) {
      this.currentLiquidOpacity = THREE.MathUtils.lerp(this.currentLiquidOpacity, this.targetLiquidOpacity, delta * 4.0);
      if (Math.abs(this.currentLiquidOpacity - this.targetLiquidOpacity) < 1e-3) {
        this.currentLiquidOpacity = this.targetLiquidOpacity;
      }
      this.liquidMaterial.opacity = this.currentLiquidOpacity;
      (this.liquidTopDisc.material as THREE.MeshPhysicalMaterial).opacity = Math.min(0.92, this.currentLiquidOpacity * 0.9);
    }

    if (Math.abs(this.currentLiquidRoughness - this.targetLiquidRoughness) > 1e-3) {
      this.currentLiquidRoughness = THREE.MathUtils.lerp(this.currentLiquidRoughness, this.targetLiquidRoughness, delta * 4.0);
      if (Math.abs(this.currentLiquidRoughness - this.targetLiquidRoughness) < 1e-3) {
        this.currentLiquidRoughness = this.targetLiquidRoughness;
      }
      this.liquidMaterial.roughness = this.currentLiquidRoughness;
    }

    // 6. 沉淀物平滑动画
    if (Math.abs(this.currentSedimentOpacity - this.targetSedimentOpacity) > 1e-3) {
      this.currentSedimentOpacity = THREE.MathUtils.lerp(this.currentSedimentOpacity, this.targetSedimentOpacity, delta * 4.0);
      if (Math.abs(this.currentSedimentOpacity - this.targetSedimentOpacity) < 1e-3) {
        this.currentSedimentOpacity = this.targetSedimentOpacity;
      }
      this.sedimentMaterial.opacity = this.currentSedimentOpacity;
    }

    if (Math.abs(this.currentSedimentScale - this.targetSedimentScale) > 1e-4) {
      this.currentSedimentScale = THREE.MathUtils.lerp(this.currentSedimentScale, this.targetSedimentScale, delta * 4.0);
      if (Math.abs(this.currentSedimentScale - this.targetSedimentScale) < 1e-4) {
        this.currentSedimentScale = this.targetSedimentScale;
      }
      this.sedimentMesh.scale.set(1, this.currentSedimentScale, 1);
    }

    if (this.currentSedimentColor.getHex() !== this.targetSedimentColor.getHex()) {
      this.currentSedimentColor.lerp(this.targetSedimentColor, delta * 4.0);
      if (this.currentSedimentColor.getHex() === this.targetSedimentColor.getHex()) {
        this.currentSedimentColor.copy(this.targetSedimentColor);
      }
      this.sedimentMaterial.color.copy(this.currentSedimentColor);
    }

    // 7. 平滑悬停交互反馈
    const targetHover = this.isHovered ? 1.0 : 0.0;
    if (Math.abs(this.hoverIntensity - targetHover) > 1e-3) {
      this.hoverIntensity = THREE.MathUtils.lerp(this.hoverIntensity, targetHover, delta * 8.0);
      if (Math.abs(this.hoverIntensity - targetHover) < 1e-3) {
        this.hoverIntensity = targetHover;
      }
      if (this.glassMaterial) {
        this.glassMaterial.emissiveIntensity = this.hoverIntensity * 0.16;
      }
      if (this.haloMaterial && this.haloRing) {
        this.haloMaterial.opacity = 0.05 + this.hoverIntensity * 0.28;
        const ringScale = 1.0 + this.hoverIntensity * 0.04;
        this.haloRing.scale.set(ringScale, ringScale, 1.0);
      }
    }

    // 放热反应直接体现在玻璃杯壁上；烧杯冷却后恢复悬停辉光
    const hoverEmissive = this.hoverIntensity * 0.16;
    if (this.heatPulse > 0.02) {
      this.glassMaterial.emissive.setHex(0xff7043);
      this.glassMaterial.emissiveIntensity = hoverEmissive * 0.35 + this.heatPulse * 0.7;
      this.liquidMaterial.emissive.setHex(0xff8a65);
      this.liquidMaterial.emissiveIntensity = this.heatPulse * 0.28;
    } else if (this.heatPulse <= 0.02 && (this.glassMaterial.emissiveIntensity > hoverEmissive + 0.001 || this.liquidMaterial.emissiveIntensity > 0)) {
      this.glassMaterial.emissive.setHex(0xffffff);
      this.glassMaterial.emissiveIntensity = hoverEmissive;
      this.liquidMaterial.emissive.setHex(0x000000);
      this.liquidMaterial.emissiveIntensity = 0;
    }
  }

  public setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    return [this.glassBody, this.liquidMesh, this.haloRing];
  }
}
