import * as THREE from 'three';
import type {
  BondKind,
  ElementVisualSpec,
  MolecularStructureDef,
} from '../../chemistry/molecularStructures.ts';
import {
  getElementSpec,
  resolveMolecularStructure,
} from '../../chemistry/molecularStructures.ts';

export interface ActiveCompoundInfo {
  id: string;
  formula: string;
  name: string;
  color?: string;
}

/**
 * 全息分子三维空间展示台 (Molecule Hologram Spatial Stage)
 *
 * 在空间视窗 (CSS3D) 正前方悬浮呈现高精细度、化学结构严谨的 3D 分子/晶体模型。
 * 具备航天级工业机械倒角、精密连接卡套、多重共价键轨道、液态铬/黄铜配位支架及纯三维全息方位刻度环。
 * 支持单指/鼠标自由旋转操控、惯性阻尼滑行、滚轮平滑缩放、双击姿态复位。
 * 遵循严格零 DOM 弹窗/浮层铁律与防脏黑材质规范。
 */
export class MoleculeHologramStage {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private internalCamera: THREE.PerspectiveCamera;

  // 场景层级
  private rootGroup: THREE.Group;
  private moleculeGroup: THREE.Group;
  private reticleGroup: THREE.Group;
  private orbitalGroup: THREE.Group;

  // 当前化合物状态
  private activeCompound: ActiveCompoundInfo | null = null;
  private activeStructure: MolecularStructureDef | null = null;
  private isShown = false;
  private targetScale = 0;
  private currentScale = 0;
  private baseRadius = 0.135;
  private fitScale = 0.080;

  // 空间卡片对焦与平滑迁移
  private currentLocalPos = new THREE.Vector3(0, -0.20, 0);
  private targetLocalPos = new THREE.Vector3(0, -0.20, 0);
  private scalePulse = 1.0;
  private targetScalePulse = 1.0;

  // 交互控制
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private totalDragDistance = 0;
  private angularVelocityX = 0;
  private angularVelocityY = 0;
  private userZoom = 1.0;
  private targetUserZoom = 1.0;
  private isHovered = false;

  // 纹理与材质缓存
  private badgeTextureCache = new Map<string, THREE.CanvasTexture>();
  private materialsToDispose: THREE.Material[] = [];
  private geometriesToDispose: THREE.BufferGeometry[] = [];
  private texturesToDispose: THREE.Texture[] = [];

  // 事件监听器引用以供销毁
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onDblClickBound: (e: MouseEvent) => void;
  private onClickCaptureBound: (e: MouseEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. 创建位于 CSS3D 之上的高透前景 WebGL Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'molecule-hologram-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '55'; // 高于 CSS3DContainer (z-index: 50)，低于 Touch/HUD (900+)
    this.canvas.style.visibility = 'hidden';
    this.container.appendChild(this.canvas);

    // 2. 初始化高规格透明 WebGLRenderer（测试环境兼容防护）
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    } catch {
      this.renderer = null;
    }

    // 3. 构建场景体系
    this.scene = new THREE.Scene();
    this.internalCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);

    // 高品质影棚与全息补光系统（拒绝暗黑 hemisphere，确保金属光泽晶莹）
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 6, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.85);
    fillLight.position.set(-4, -2, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x67e8f9, 0.95);
    rimLight.position.set(0, 5, -5);
    this.scene.add(rimLight);

    // 空间节点挂载树
    this.rootGroup = new THREE.Group();
    this.moleculeGroup = new THREE.Group();
    this.reticleGroup = new THREE.Group();
    this.orbitalGroup = new THREE.Group();

    this.rootGroup.add(this.reticleGroup);
    this.rootGroup.add(this.orbitalGroup);
    this.rootGroup.add(this.moleculeGroup);
    this.scene.add(this.rootGroup);

    // 4. 绑定交互事件
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onWheelBound = this.onWheel.bind(this);
    this.onDblClickBound = this.onDblClick.bind(this);
    this.onClickCaptureBound = this.onClickCapture.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.onPointerDownBound, { capture: true });
      window.addEventListener('pointermove', this.onPointerMoveBound, { capture: true });
      window.addEventListener('pointerup', this.onPointerUpBound, { capture: true });
      window.addEventListener('wheel', this.onWheelBound, { capture: true, passive: false });
      window.addEventListener('dblclick', this.onDblClickBound, { capture: true });
      window.addEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    // 初始化尺寸
    this.resize(
      container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800),
      container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600)
    );
  }

  // ==========================================
  // 公共接口
  // ==========================================

  public showCompound(comp: ActiveCompoundInfo): void {
    const wasHidden = !this.isShown || this.currentScale < 0.05;
    if (this.activeCompound?.id === comp.id && this.isShown) {
      return;
    }

    this.activeCompound = comp;
    this.activeStructure = resolveMolecularStructure(comp.formula, comp.name);
    this.isShown = true;
    this.targetScale = 1.0;
    this.userZoom = 1.0;
    this.targetUserZoom = 1.0;
    this.angularVelocityX = 0;
    this.angularVelocityY = 0;
    this.scalePulse = 0.22;
    this.targetScalePulse = 1.0;

    // 重构三维几何实体
    this.rebuildModel();

    if (wasHidden) {
      // 刚打开/刚选化合物时，直接精准定位在全息展台正中间前方，避免从远处慢速漂移
      const initY = -0.20;
      this.currentLocalPos.set(0, initY, 0);
      this.targetLocalPos.set(0, initY, 0);
    }

    if (this.canvas) {
      this.canvas.style.visibility = 'visible';
    }
  }

  /**
   * 测算当前化合物对应 UI 卡片在空间视窗中的中心归一化坐标 (-1 到 +1)
   */
  private getSelectedCardOffsets(): { normX: number; normY: number } {
    if (typeof document === 'undefined') return { normX: 0, normY: 0.38 };

    let cardEl: HTMLElement | null = null;

    if (this.activeCompound?.id) {
      cardEl = document.querySelector(
        `.apple-solute-card[data-component-id="${this.activeCompound.id}"]`
      ) as HTMLElement | null;
    }

    if (!cardEl && this.activeCompound?.formula) {
      cardEl = document.querySelector(
        `.apple-solute-card[data-component-id="comp_${this.activeCompound.formula}"], .apple-solute-card[data-component-id="${this.activeCompound.formula}"]`
      ) as HTMLElement | null;
    }

    if (!cardEl) {
      cardEl = document.querySelector('.apple-solute-card.is-selected') as HTMLElement | null;
    }

    if (!cardEl) {
      cardEl = document.querySelector('.legend-chip.is-selected') as HTMLElement | null;
    }

    if (!cardEl) return { normX: 0, normY: 0.38 };

    const frameEl = (
      cardEl.closest('.vision-window-frame') ||
      cardEl.closest('.vision-spatial-modal') ||
      document.querySelector('.vision-window-frame') ||
      document.querySelector('.vision-spatial-modal')
    ) as HTMLElement | null;

    if (!frameEl) return { normX: 0, normY: 0.38 };

    const cardRect = cardEl.getBoundingClientRect();
    const frameRect = frameEl.getBoundingClientRect();

    // 在测试环境 MockDOM 或未挂载时使用安全默认值
    if (
      frameRect.width <= 0 ||
      frameRect.height <= 0 ||
      (cardRect.width === frameRect.width && cardRect.height === frameRect.height)
    ) {
      return { normX: 0, normY: 0.38 };
    }

    const cardCenterX = cardRect.left + cardRect.width * 0.5;
    const cardCenterY = cardRect.top + cardRect.height * 0.5;
    const frameCenterX = frameRect.left + frameRect.width * 0.5;
    const frameCenterY = frameRect.top + frameRect.height * 0.5;

    const normX = (cardCenterX - frameCenterX) / (frameRect.width * 0.5);
    const normY = (cardCenterY - frameCenterY) / (frameRect.height * 0.5);

    return {
      normX: THREE.MathUtils.clamp(normX, -0.92, 0.92),
      normY: THREE.MathUtils.clamp(normY, -0.92, 0.92),
    };
  }

  public getSelectedCardHorizontalOffset(): number {
    return this.getSelectedCardOffsets().normX;
  }

  public hide(): void {
    if (!this.isShown) return;
    this.isShown = false;
    this.targetScale = 0;
    this.activeCompound = null;
    this.activeStructure = null;
    if (this.isHovered) {
      this.isHovered = false;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
      }
    }
  }

  public isVisible(): boolean {
    return this.isShown && this.currentScale > 0.01;
  }

  public getActiveCompound(): ActiveCompoundInfo | null {
    return this.activeCompound;
  }

  public getActiveStructure(): MolecularStructureDef | null {
    return this.activeStructure;
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    if (this.renderer) {
      this.renderer.setSize(width, height, false);
    }
    this.internalCamera.aspect = width / height;
    this.internalCamera.updateProjectionMatrix();
  }

  // ==========================================
  // 逐帧更新与渲染
  // ==========================================

  public update(
    delta: number,
    elapsed: number,
    camera: THREE.PerspectiveCamera,
    spatialWindowObject: THREE.Object3D | null,
    windowScale: number,
    allowVisible: boolean
  ): void {
    if (!allowVisible && this.isShown) {
      this.hide();
    }

    // 缩放缓动与弹性进出场
    const scaleSpeed = 1 - Math.exp(-Math.max(0, delta) * 14.0);
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, this.targetScale, scaleSpeed);

    // 用户缩放滚轮平滑插值
    const zoomSpeed = 1 - Math.exp(-Math.max(0, delta) * 16.0);
    this.userZoom = THREE.MathUtils.lerp(this.userZoom, this.targetUserZoom, zoomSpeed);

    if (this.currentScale <= 0.005) {
      if (this.canvas && this.canvas.style.visibility !== 'hidden') {
        this.canvas.style.visibility = 'hidden';
      }
      return;
    }

    if (this.canvas && this.canvas.style.visibility !== 'visible') {
      this.canvas.style.visibility = 'visible';
    }

    // 空间相对定位计算：固定出现在视窗正前方水平正中间 (+Z 方向，Y 轴位于下半部全息展示区)
    const targetShiftX = 0;
    const targetShiftY = -0.20 * windowScale;
    this.targetLocalPos.set(targetShiftX, targetShiftY, 0);

    // 平滑插值当前局部位置 (丝滑空间漂移跃迁)
    const driftSpeed = 1 - Math.exp(-Math.max(0, delta) * 10.0);
    this.currentLocalPos.lerp(this.targetLocalPos, driftSpeed);

    // 量子凝聚缩放脉冲
    const pulseSpeed = 1 - Math.exp(-Math.max(0, delta) * 12.0);
    this.scalePulse = THREE.MathUtils.lerp(this.scalePulse, this.targetScalePulse, pulseSpeed);

    if (spatialWindowObject) {
      const winPos = spatialWindowObject.position;
      const winQuat = spatialWindowObject.quaternion;

      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(winQuat).normalize();
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(winQuat).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(winQuat).normalize();

      const distToCam = camera.position.distanceTo(winPos);
      // 保持适宜的离窗距离，贴合在视窗前景，既有立体感又完全不阻挡上方卡片
      const forwardDist = Math.min(0.20 * windowScale, Math.max(0.12, distToCam * 0.15));

      const targetPos = winPos.clone()
        .addScaledVector(forward, forwardDist)
        .addScaledVector(right, this.currentLocalPos.x)
        .addScaledVector(up, this.currentLocalPos.y);

      // 柔顺跟踪空间视窗
      const posLerp = 1 - Math.exp(-Math.max(0, delta) * 16.0);
      this.rootGroup.position.lerp(targetPos, posLerp);
      this.rootGroup.quaternion.slerp(winQuat, posLerp);
    }

    // 自主微动态呼吸与微缓惯性旋转
    if (!this.isDragging) {
      // 缓慢自然转台回旋
      this.moleculeGroup.rotation.y += delta * 0.28;

      // 惯性滑行阻尼衰减
      this.moleculeGroup.rotation.x += this.angularVelocityX * delta;
      this.moleculeGroup.rotation.y += this.angularVelocityY * delta;
      const decay = Math.exp(-delta * 6.0);
      this.angularVelocityX *= decay;
      this.angularVelocityY *= decay;
    }

    // 微浮动呼吸漂移 (Breathing float)
    const floatY = Math.sin(elapsed * 2.2) * 0.004 * windowScale;
    this.moleculeGroup.position.y = floatY;

    // 应用综合缩放（归一化标准基准 * 进出场动画 * 视窗基础倍率 * 用户自定义缩放 * 量子凝聚脉冲）
    const effectiveScale = this.fitScale * this.currentScale * windowScale * this.userZoom * this.scalePulse;
    this.moleculeGroup.scale.set(effectiveScale, effectiveScale, effectiveScale);

    // 水合离子量子轨道旋转
    if (this.orbitalGroup && this.orbitalGroup.children.length > 0) {
      this.orbitalGroup.rotation.y += delta * 0.7;
      this.orbitalGroup.rotation.z += delta * 0.4;
      this.orbitalGroup.scale.set(effectiveScale, effectiveScale, effectiveScale);
    }

    // 渲染输出
    if (this.renderer) {
      // 同步摄像机参数
      this.internalCamera.position.copy(camera.position);
      this.internalCamera.quaternion.copy(camera.quaternion);
      this.internalCamera.fov = camera.fov;
      this.internalCamera.aspect = camera.aspect;
      this.internalCamera.near = camera.near;
      this.internalCamera.far = camera.far;
      this.internalCamera.updateProjectionMatrix();

      this.renderer.render(this.scene, this.internalCamera);
    }
  }

  // ==========================================
  // 高精细度 3D 几何与材质构建 (严禁粗糙拼接)
  // ==========================================

  private rebuildModel(): void {
    this.clearModel();

    if (!this.activeStructure) return;

    const def = this.activeStructure;
    const atomCount = def.atoms.length;

    // 1. 构建原子实体 (经典真实 CPK 哑光/微光球体，无怪异反光贴图与荧光假白)
    const atomRadiusMap = new Map<number, number>();

    def.atoms.forEach((atom, idx) => {
      const spec = getElementSpec(atom.element);
      // 真实标准球棍比例 (~1:3 到 1:4)
      const atomWorldRadius = spec.radius * 0.58;
      atomRadiusMap.set(idx, atomWorldRadius);

      const atomMeshGroup = new THREE.Group();
      atomMeshGroup.position.set(atom.position[0], atom.position[1], atom.position[2]);

      // 经典标准 CPK 纯正物理质感 (细腻哑光树脂球，无反光假白，无荧光灯泡)
      const coreGeo = new THREE.SphereGeometry(atomWorldRadius, 32, 24);
      this.geometriesToDispose.push(coreGeo);

      const coreMat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.32,
        metalness: 0.10,
        emissive: spec.emissive,
        emissiveIntensity: 0.06,
      });
      this.materialsToDispose.push(coreMat);

      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { isAtom: true, atomIdx: idx, element: atom.element };
      atomMeshGroup.add(coreMesh);

      this.moleculeGroup.add(atomMeshGroup);
    });

    // 2. 构建化学键与晶格支架
    def.bonds.forEach((bond) => {
      if (!def.atoms[bond.a] || !def.atoms[bond.b]) return;
      const a = def.atoms[bond.a];
      const b = def.atoms[bond.b];
      const p1 = new THREE.Vector3(...a.position);
      const p2 = new THREE.Vector3(...b.position);

      const specA = getElementSpec(a.element);
      const specB = getElementSpec(b.element);

      const bondMesh = this.createCraftedBond(p1, p2, bond.kind, specA, specB);
      this.moleculeGroup.add(bondMesh);
    });

    // 3. 晶胞空间外框 (Unit Cell Box，适用于岩盐与金属晶胞)
    if (def.unitCellBox) {
      const boxMesh = this.createUnitCellLattice(def.unitCellBox);
      this.moleculeGroup.add(boxMesh);
    }

    // 4. 水合离子量子轨道环 (适用于游离单原子或原子团离子)
    if (def.orbitalRings && def.orbitalRings > 0) {
      this.createOrbitalShells(def.orbitalRings);
    }

    // 5. 归一化居中与尺寸限制
    this.normalizeModelSize();
  }

  /**
   * 经典科研标准球棍模型：纯正典雅的匀质灰银合金键杆，无怪异双色水管与杂乱管套
   */
  private createCraftedBond(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    kind: BondKind,
    _specA: ElementVisualSpec,
    _specB: ElementVisualSpec
  ): THREE.Group {
    const bondGroup = new THREE.Group();
    const dir = p2.clone().sub(p1);
    const len = dir.length();
    if (len < 1e-4) return bondGroup;

    // 旋转到两原子连线轴向
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    bondGroup.position.copy(mid);

    const up = new THREE.Vector3(0, 1, 0);
    const axis = dir.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, axis);
    bondGroup.quaternion.copy(quat);

    // 标准分子球棍键体材质：高级匀质航天银灰微缎面
    const bondMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.30,
      roughness: 0.32,
    });
    this.materialsToDispose.push(bondMat);

    if (kind === 'double') {
      // 标准双键：两条紧凑并行的精密银灰直柱
      const shaftDist = 0.082;
      const radius = 0.052;

      [-shaftDist, shaftDist].forEach((xOff) => {
        const geo = new THREE.CylinderGeometry(radius, radius, len, 20);
        this.geometriesToDispose.push(geo);
        const mesh = new THREE.Mesh(geo, bondMat);
        mesh.position.x = xOff;
        bondGroup.add(mesh);
      });
    } else if (kind === 'triple') {
      // 标准三键：呈正三角形排列的三根紧凑精密直柱
      const rBundle = 0.072;
      const radius = 0.042;
      for (let i = 0; i < 3; i++) {
        const theta = (i * Math.PI * 2) / 3;
        const x = Math.cos(theta) * rBundle;
        const z = Math.sin(theta) * rBundle;

        const geo = new THREE.CylinderGeometry(radius, radius, len, 18);
        this.geometriesToDispose.push(geo);
        const mesh = new THREE.Mesh(geo, bondMat);
        mesh.position.set(x, 0, z);
        bondGroup.add(mesh);
      }
    } else if (kind === 'ionic') {
      // 离子晶格配位架：浅青微晶离子支柱
      const shaftRadius = 0.055;
      const ionicMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        metalness: 0.20,
        roughness: 0.30,
        transparent: true,
        opacity: 0.72,
      });
      this.materialsToDispose.push(ionicMat);

      const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, len, 16);
      this.geometriesToDispose.push(shaftGeo);
      bondGroup.add(new THREE.Mesh(shaftGeo, ionicMat));
    } else {
      // 标准单键 / 金属键：整洁平滑的经典灰银圆柱直杆
      const radius = 0.075;
      const geo = new THREE.CylinderGeometry(radius, radius, len, 24);
      this.geometriesToDispose.push(geo);
      const mesh = new THREE.Mesh(geo, bondMat);
      bondGroup.add(mesh);
    }

    return bondGroup;
  }

  /**
   * 绘制高清透微光元素微标 Sprite
   */
  private createElementBadge(symbol: string, spec: ElementVisualSpec): THREE.Sprite {
    let texture = this.badgeTextureCache.get(symbol);
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 256, 256);

        // 柔和半透微底盘 (告别突兀生硬的纯黑圆块)
        ctx.beginPath();
        ctx.arc(128, 128, 96, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.fill();

        // 精致发光外轮廓
        ctx.lineWidth = 5;
        const hexColor = `#${spec.emissive.toString(16).padStart(6, '0')}`;
        ctx.strokeStyle = hexColor;
        ctx.shadowColor = hexColor;
        ctx.shadowBlur = 12;
        ctx.stroke();

        // 字体渲染：精致发光无衬线
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 114px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, 128, 134);
      }
      texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.badgeTextureCache.set(symbol, texture);
      this.texturesToDispose.push(texture);
    }

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    this.materialsToDispose.push(spriteMat);
    return new THREE.Sprite(spriteMat);
  }

  /**
   * 构建晶胞三维边界指示网格
   */
  private createUnitCellLattice(dims: [number, number, number]): THREE.Group {
    const group = new THREE.Group();
    const [dx, dy, dz] = dims;

    const boxGeo = new THREE.BoxGeometry(dx, dy, dz);
    this.geometriesToDispose.push(boxGeo);

    const edges = new THREE.EdgesGeometry(boxGeo);
    this.geometriesToDispose.push(edges);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    this.materialsToDispose.push(lineMat);

    const wireframe = new THREE.LineSegments(edges, lineMat);
    group.add(wireframe);

    return group;
  }

  /**
   * 构建量子化电子壳层环（针对单原子/离子）
   */
  private createOrbitalShells(count: number): void {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materialsToDispose.push(ringMat);

    for (let i = 0; i < count; i++) {
      const r = 0.28 + i * 0.14;
      const ringGeo = new THREE.RingGeometry(r - 0.006, r + 0.006, 48);
      this.geometriesToDispose.push(ringGeo);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = (i * Math.PI) / 3;
      ringMesh.rotation.y = (i * Math.PI) / 4;
      this.orbitalGroup.add(ringMesh);
    }
  }

  /**
   * 自动居中与统一标准展台尺寸控制 (彻底消除分子间极端尺寸反差，确保每个分子清晰可见、大小匀称舒适)
   */
  private normalizeModelSize(): void {
    const box = new THREE.Box3().setFromObject(this.moleculeGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    this.moleculeGroup.position.sub(center);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    // 统一百分比展示尺寸：所有分子在留白展台中均保持清晰可见的标准尺寸 (~0.27 米展台直径)
    // 告别小分子过度微缩或大分子霸屏，使每一个选中的化学物质都拥有舒适大方的观赏视界 (无极端大小区分)
    const targetShowcaseRadius = 0.135;
    const maxR = Math.max(0.70, sphere.radius);
    this.fitScale = targetShowcaseRadius / maxR;
    this.moleculeGroup.scale.set(this.fitScale, this.fitScale, this.fitScale);
  }

  /**
   * 彻底清空当前分子三维网格及相关显存
   */
  private clearModel(): void {
    // 递归从 Group 移除
    const clearGroup = (grp: THREE.Group) => {
      while (grp.children.length > 0) {
        const obj = grp.children[0];
        grp.remove(obj);
      }
    };

    clearGroup(this.moleculeGroup);
    clearGroup(this.reticleGroup);
    clearGroup(this.orbitalGroup);

    this.moleculeGroup.position.set(0, 0, 0);
    this.moleculeGroup.rotation.set(0, 0, 0);
    this.moleculeGroup.quaternion.identity();

    // 释放资源
    this.geometriesToDispose.forEach((g) => g.dispose());
    this.geometriesToDispose = [];

    this.materialsToDispose.forEach((m) => m.dispose());
    this.materialsToDispose = [];
  }

  // ==========================================
  // 三维射线检测与直接操作交互 (零 DOM 浮层)
  // ==========================================

  private raycastMolecule(clientX: number, clientY: number): boolean {
    if (!this.isVisible() || !this.renderer) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.internalCamera);

    const hits = raycaster.intersectObjects(this.moleculeGroup.children, true);
    return hits.length > 0;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.isVisible()) return;

    if (this.raycastMolecule(e.clientX, e.clientY)) {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.totalDragDistance = 0;
      this.angularVelocityX = 0;
      this.angularVelocityY = 0;

      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'grabbing';
      }

      e.stopPropagation();
      e.preventDefault();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isVisible()) return;

    if (this.isDragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.totalDragDistance += Math.hypot(dx, dy);

      const rotSpeed = 0.009;
      this.moleculeGroup.rotation.y += dx * rotSpeed;
      this.moleculeGroup.rotation.x += dy * rotSpeed;

      // 记录角速度以供释放后惯性滑动
      this.angularVelocityY = dx * rotSpeed * 35;
      this.angularVelocityX = dy * rotSpeed * 35;

      e.stopPropagation();
      e.preventDefault();
    } else {
      const hit = this.raycastMolecule(e.clientX, e.clientY);
      if (hit !== this.isHovered) {
        this.isHovered = hit;
        if (typeof document !== 'undefined') {
          document.body.style.cursor = hit ? 'grab' : '';
        }
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = this.isHovered ? 'grab' : '';
      }
      e.stopPropagation();
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isVisible()) return;

    if (this.raycastMolecule(e.clientX, e.clientY)) {
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.targetUserZoom = THREE.MathUtils.clamp(this.targetUserZoom * factor, 0.55, 2.4);
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private onDblClick(e: MouseEvent): void {
    if (!this.isVisible()) return;

    if (this.raycastMolecule(e.clientX, e.clientY)) {
      // 双击复位姿态与缩放
      this.moleculeGroup.rotation.set(0, 0, 0);
      this.moleculeGroup.quaternion.identity();
      this.targetUserZoom = 1.0;
      this.userZoom = 1.0;
      this.angularVelocityX = 0;
      this.angularVelocityY = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private onClickCapture(e: MouseEvent): void {
    // 若刚刚发生了拖拽旋转，拦截后续触发的幽灵点击事件，防止误触底层视窗
    if (this.totalDragDistance > 5) {
      e.stopPropagation();
      e.preventDefault();
      this.totalDragDistance = 0;
    }
  }

  // ==========================================
  // 资源销毁
  // ==========================================

  public dispose(): void {
    this.hide();
    this.clearModel();

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onPointerDownBound, { capture: true });
      window.removeEventListener('pointermove', this.onPointerMoveBound, { capture: true });
      window.removeEventListener('pointerup', this.onPointerUpBound, { capture: true });
      window.removeEventListener('wheel', this.onWheelBound, { capture: true });
      window.removeEventListener('dblclick', this.onDblClickBound, { capture: true });
      window.removeEventListener('click', this.onClickCaptureBound, { capture: true });
    }

    this.texturesToDispose.forEach((t) => t.dispose());
    this.texturesToDispose = [];
    this.badgeTextureCache.clear();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
