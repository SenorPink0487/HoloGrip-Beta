import * as THREE from 'three';
import type { HandRuleEvaluation, Polarity } from '../../physics/em/handRulesSolver.ts';
import { AxialChargeFlow, terminalBrass } from './conductorRod.ts';
import { paintTexture } from './labKit.ts';

const UP = new THREE.Vector3(0, 1, 0);

function turned(profile: number[][], segments = 64): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function ring(radius: number, tube: number, material: THREE.Material, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 96), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/**
 * 车削成型的高精细航天级喷砂银铝导电直导线几何体（严禁无倒角简单圆柱体拼接）
 * 全长 0.38m，半径 0.0092m，两端具有精密切削机械倒角与定位环槽
 */
export function createPrecisionRodGeometry(length = 0.38, radius = 0.0092): THREE.BufferGeometry {
  const half = length * 0.5;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, -half),
    new THREE.Vector2(radius * 0.88, -half),
    new THREE.Vector2(radius, -half + 0.0014),
    new THREE.Vector2(radius, -half + 0.018),
    new THREE.Vector2(radius * 0.985, -half + 0.020),
    new THREE.Vector2(radius * 0.985, -half + 0.024),
    new THREE.Vector2(radius, -half + 0.026),
    new THREE.Vector2(radius, half - 0.026),
    new THREE.Vector2(radius * 0.985, half - 0.024),
    new THREE.Vector2(radius * 0.985, half - 0.020),
    new THREE.Vector2(radius, half - 0.018),
    new THREE.Vector2(radius, half - 0.0014),
    new THREE.Vector2(radius * 0.88, half),
    new THREE.Vector2(0, half),
  ];
  const geo = new THREE.LatheGeometry(profile, 48);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 生成正对操作者的清晰红底白边 "电流 I" 激光蚀刻与 HUD 铭牌纹理
 */
function createCurrentLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.5;

    // 白色高对比度衬底微光描边，确保在任何 3D 背景及视角下均清晰无眩光
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 12;
      ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('电流', 36, cy);
      ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('I', 246, cy - 3);
    }

    // 鲜红饱和主题色
    ctx.fillStyle = '#dc2626';
    ctx.font = '900 88px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('电流', 36, cy);

    ctx.font = 'italic 900 112px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('I', 246, cy - 3);
  });
}

/**
 * 生成湛蓝环绕 "磁场方向 B" 铭牌与指引线纹理
 */
function createFieldLabelTexture(): THREE.CanvasTexture {
  return paintTexture(512, 256, (ctx: any, w, h) => {
    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, w, h);
    if (typeof ctx.fillText !== 'function') return;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cy = h * 0.42;

    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 10;
      ctx.font = '900 78px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.strokeText('磁场方向', 24, cy);
      ctx.font = 'italic 900 102px "Times New Roman", STSong, Georgia, serif';
      ctx.strokeText('B', 354, cy - 3);
    }

    ctx.fillStyle = '#0284c7';
    ctx.font = '900 78px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('磁场方向', 24, cy);

    ctx.font = 'italic 900 102px "Times New Roman", STSong, Georgia, serif';
    ctx.fillText('B', 354, cy - 3);

    // 指向同心圆磁感线的引导标线
    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(28, cy + 54);
      if (typeof ctx.lineTo === 'function') {
        ctx.lineTo(135, cy + 54);
        ctx.lineTo(24, cy + 112);
      }
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 6;
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }
  });
}

/**
 * 通电直导线安培右手螺旋法则 3D 实验总成
 * 严格按照教材规范真实构建恒定高亮银铝直导线、红箭电流指示与同心圆磁感线（无任何右侧遮挡悬浮卡片）
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
    color: 0x0284c7,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.22,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  public readonly fieldArrowMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.72,
    roughness: 0.18,
    metalness: 0.25,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  public fieldRevealProgress = 0;
  public circulationSpeed = 0;

  // 航天级阳极氧化喷砂银铝与精密黄铜材质（全视角恒定亮银白金属质感，彻底消除变暗变黑与视角色偏）
  private readonly rodMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.28,
    roughness: 0.22,
    emissive: 0xa0aec0,
    emissiveIntensity: 0.22,
  });
  private readonly brass = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.35,
    roughness: 0.25,
    emissive: 0xb45309,
    emissiveIntensity: 0.16,
  });
  private readonly currentArrowMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.75,
    metalness: 0.15,
    roughness: 0.22,
  });

  private readonly charges: AxialChargeFlow;
  private readonly hoverShell: THREE.Mesh;
  private readonly orbiters: Array<{ mesh: THREE.Mesh; radius: number; y: number; angle: number; rate: number }> = [];
  private readonly trails: THREE.Mesh[] = [];
  private readonly velocity = new THREE.Vector3();
  private readonly target = new THREE.Vector3(0, 0.30, 0);
  private readonly localPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();

  // 3D HUD 标识
  private currentLabelMesh!: THREE.Mesh;
  private fieldLabelMesh!: THREE.Mesh;

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

    // 导体内电荷流动模拟通道（沿直导线 Y 轴）
    this.charges = new AxialChargeFlow({ travel: 0.32, axis: 'y', radial: 0.0098, speed: 0.32 });
    // 隐藏暗色单侧观察镜片，杜绝视角旋转时正面暗、侧背面亮的色偏
    this.charges.bed.visible = false;
    this.currentCarriers = this.charges.carriers;
    this.currentTrails = this.charges.trails;
    this.currentFlowMaterial = this.charges.flowMaterial;
    this.assembly.add(this.charges.group);

    this.buildField();

    // 交互拾取包络（设为不可见以避免遮挡导体棒自然表面光影）
    this.hoverShell = new THREE.Mesh(
      turned([[0, -0.19], [0.018, -0.185], [0.018, 0.185], [0, 0.19]], 32),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hoverShell.name = 'ConductorInteractionSheen';

    this.assembly.add(this.hoverShell, this.currentArrow, this.fieldGroup);
    this.fieldGroup.visible = false;
    this.group.add(this.assembly);
  }

  /**
   * 构建全视角恒亮银白直导线、端部黄铜端子与正前方红箭电流指示系统
   */
  private buildConductor(): void {
    const rodRadius = 0.0092;
    const rodLength = 0.38;
    const half = rodLength * 0.5;

    // 1. 恒定高质感喷砂银铝中央导电金属长棒（任何视角下均呈现纯净银白金属光泽）
    const shankGeo = createPrecisionRodGeometry(rodLength, rodRadius);
    const shank = new THREE.Mesh(shankGeo, this.rodMaterial);
    shank.name = 'ScrewCentralConductor';
    shank.castShadow = true;
    shank.receiveShadow = true;
    this.assembly.add(shank);

    // 2. 两端车削精密黄铜接线端子环（保留 polarity 点击极性反转交互）
    for (const sign of [-1, 1] as const) {
      const cap = new THREE.Group();
      cap.name = sign > 0 ? 'ConductorUpperFerrule' : 'ConductorLowerFerrule';
      cap.userData.conductorAction = 'polarity';
      cap.position.y = sign * (half - 0.006);
      if (sign < 0) cap.rotation.x = Math.PI;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 1.05, rodRadius * 1.05, 0.010, 32),
        this.brass
      );
      collar.castShadow = true;

      const endCap = new THREE.Mesh(
        new THREE.CylinderGeometry(rodRadius * 0.88, rodRadius * 1.02, 0.004, 32),
        this.rodMaterial
      );
      endCap.position.y = 0.007;
      endCap.castShadow = true;

      cap.add(collar, endCap);
      this.assembly.add(cap);
    }

    // 3. 沿导体棒正前方的清晰红箭与 "电流 I" 标识系统
    this.currentArrow.name = 'CurrentDirectionSculpt';

    // 鲜红直导线箭头主体（沿导线表面贴合排列）
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0020, 0.0020, 0.026, 16),
      this.currentArrowMat
    );
    shaft.position.set(0, 0.115, rodRadius + 0.0016);
    shaft.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.0055, 0.016, 20),
      this.currentArrowMat
    );
    head.position.set(0, 0.136, rodRadius + 0.0016);
    head.castShadow = true;

    this.currentArrow.add(shaft, head);

    // 3D "电流 I" 标识看板
    const labelTex = createCurrentLabelTexture();
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.currentLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.029), labelMat);
    this.currentLabelMesh.position.set(0.038, 0.125, rodRadius + 0.0022);
    this.currentArrow.add(this.currentLabelMesh);
  }

  /**
   * 构建以导线为圆心的 4 层精密同心圆磁感线与 "磁场方向 B" 指示
   */
  private buildField(): void {
    const arrowGeometry = turned(
      [[0, -0.007], [0.0008, -0.006], [0.0008, 0.001], [0.0038, 0.001], [0, 0.009]],
      16
    );

    // 4 层水平同心圆磁感线（位于握拳弯曲四指平齐水平面上）
    const radii = [0.046, 0.082, 0.120, 0.165];
    const ringY = -0.055;

    for (let i = 0; i < radii.length; i++) {
      const radius = radii[i];
      const rate = 0.105 / radius;

      // 同心圆圆环
      this.fieldGroup.add(ring(radius, 0.00095, this.fieldMaterial, ringY));

      const numArrows = i === 0 ? 2 : i === 1 ? 3 : 4;
      for (let j = 0; j < numArrows; j++) {
        const arrow = new THREE.Mesh(arrowGeometry, this.fieldArrowMaterial);
        const baseAngle = (j * Math.PI * 2) / numArrows + i * 0.45;
        this.orbiters.push({ mesh: arrow, radius, y: ringY, angle: baseAngle, rate });
        this.fieldGroup.add(arrow);

        // 环绕动态发光流光弧段
        const arcLen = 0.65;
        const points = Array.from({ length: 24 }, (_, k) => {
          const a = (-k / 23) * arcLen;
          return new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
        });
        const trailGeometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          24,
          0.00085,
          4,
          false
        );
        const count = trailGeometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let n = 0; n < count; n++) {
          const brightness = (1 - Math.floor(n / 4) / 24) * 0.85 + 0.15;
          colors.set([brightness * 0.05, brightness * 0.55, brightness * 0.95], n * 3);
        }
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const trailMaterial = this.fieldArrowMaterial.clone();
        trailMaterial.vertexColors = true;
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.y = ringY;
        trail.rotation.y = baseAngle;
        this.trails.push(trail);
        this.fieldGroup.add(trail);
      }
    }

    // "磁场方向 B" 3D 标识看板与引导线
    const bLabelTex = createFieldLabelTexture();
    const bLabelMat = new THREE.MeshBasicMaterial({
      map: bLabelTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.fieldLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.039), bLabelMat);
    this.fieldLabelMesh.position.set(0.138, ringY - 0.012, 0.082);
    this.fieldGroup.add(this.fieldLabelMesh);
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

  public setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  public setDragging(dragging: boolean): void {
    this.dragging = dragging;
    if (!dragging) this.target.set(0, 0.30, 0);
  }

  public dragTo(point: THREE.Vector3): void {
    this.target.set(
      THREE.MathUtils.clamp(point.x, -0.10, 0.10),
      THREE.MathUtils.clamp(point.y, 0.26, 0.38),
      0
    );
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
    if (this.fieldLabelMesh) {
      (this.fieldLabelMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.circulationSpeed = 0;
    this.fieldGroup.visible = false;
  }

  public update(dt: number, polarity: Polarity, evaluation: HandRuleEvaluation): void {
    this.clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    this.hover += ((this.isHovered || this.dragging ? 1 : 0) - this.hover) * ease;
    this.rodMaterial.emissiveIntensity = 0.22 + this.hover * 0.08;

    // 自由悬浮微动弹簧物理响应
    const frequency = this.dragging ? 20 : 7;
    const decay = Math.exp(-frequency * dt);
    this.localPoint.copy(this.target);
    if (!this.dragging) {
      this.localPoint.y += Math.sin(this.clock * 1.35) * 0.002;
    }

    for (const axis of ['x', 'y', 'z'] as const) {
      const error = this.assembly.position[axis] - this.localPoint[axis];
      const impulse = this.velocity[axis] + frequency * error;
      this.assembly.position[axis] = this.localPoint[axis] + (error + impulse * dt) * decay;
      this.velocity[axis] = (this.velocity[axis] - frequency * impulse * dt) * decay;
    }

    this.assembly.rotation.z +=
      (THREE.MathUtils.clamp(-this.velocity.x * 0.22, -0.055, 0.055) - this.assembly.rotation.z) * ease;
    this.assembly.rotation.x +=
      (THREE.MathUtils.clamp(this.velocity.y * 0.06, -0.018, 0.018) - this.assembly.rotation.x) * ease;

    // 电流方向指示箭头（+1 向上，-1 向下）
    this.currentArrow.rotation.z = polarity > 0 ? 0 : Math.PI;
    // 保持 "电流 I" 文本始终端正朝向操作者视线，绝不上下颠倒
    if (this.currentLabelMesh) {
      this.currentLabelMesh.rotation.z = -this.currentArrow.rotation.z;
    }

    // 更新直导线轴向流载流子
    this.charges.update(dt, polarity);

    // 手势匹配成功时优雅渐显同心圆磁感线与 "磁场方向 B" 铭牌
    const reveal = evaluation.isMatched ? 1 : 0;
    if (evaluation.status === 'wrong-hand') {
      // 换成左手后立即撤销显示，避免上一帧右手的渐隐残留看起来仍在触发。
      this.fieldRevealProgress = 0;
      this.fieldMaterial.opacity = 0;
    }
    this.fieldRevealProgress += (reveal - this.fieldRevealProgress) * (1 - Math.exp(-dt * 7));
    this.fieldMaterial.opacity += (reveal * 0.95 - this.fieldMaterial.opacity) * ease;
    this.fieldArrowMaterial.opacity = this.fieldMaterial.opacity;
    if (this.fieldLabelMesh) {
      (this.fieldLabelMesh.material as THREE.MeshBasicMaterial).opacity = this.fieldMaterial.opacity;
    }
    this.fieldGroup.visible = this.fieldMaterial.opacity > 0.005;

    const scale = THREE.MathUtils.lerp(
      0.18,
      1,
      THREE.MathUtils.smoothstep(this.fieldRevealProgress, 0, 1)
    );
    this.fieldGroup.scale.set(scale, 1, scale);

    // 磁场环绕流动旋转速度：俯视逆时针为正 (+1)，顺时针为负 (-1)
    this.circulationSpeed +=
      (reveal * 0.9 * evaluation.screwCirculationSign - this.circulationSpeed) *
      (1 - Math.exp(-dt * 5));
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

  public dispose(): void {
    this.fieldMaterial.dispose();
    this.fieldArrowMaterial.dispose();
    this.rodMaterial.dispose();
    this.brass.dispose();
    this.currentArrowMat.dispose();
  }
}
