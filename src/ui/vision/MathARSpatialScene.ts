import * as THREE from 'three';
import type { PolyhedronModelDef } from '../../scene/math/GeometrySolver.ts';

export interface ARSpatialItem {
  id: string;
  name: string;
  subtitle: string;
  dataUrl: string;
  modelDef: PolyhedronModelDef;
  screenAnchor: { x: number; y: number }; // 屏幕归一化位置 (0~1) 或像素
  worldPosition: THREE.Vector3;
  rotationY: number;
  rotationX: number;
  scale: number;
  group: THREE.Group;
  tagEl?: HTMLElement;
}

/**
 * 试卷全景 AR 空间渲染引擎。
 * 彻底抛弃丑陋的卡片方框，将 3D 多面体直接、真实地以全息透视形式“立”在试卷纸面上。
 */
export class MathARSpatialScene {
  public readonly domElement: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isDisposed = false;
  private animFrameId: number | null = null;

  private items: ARSpatialItem[] = [];
  private selectedId: string | null = null;

  // 交互状态
  private isDragging = false;
  private dragMode: 'rotate' | 'pan' = 'rotate';
  private activeItem: ARSpatialItem | null = null;
  private lastPointerPos = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2();
  private shadowTexture: THREE.CanvasTexture | null = null;
  private viewportWidth = 800;
  private viewportHeight = 600;

  private onSelectCallback?: (id: string) => void;
  private onDeleteCallback?: (id: string) => void;

  constructor(
    containerWidth: number,
    containerHeight: number,
    callbacks?: {
      onSelect?: (id: string) => void;
      onDelete?: (id: string) => void;
    }
  ) {
    this.viewportWidth = containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 800) || 800;
    this.viewportHeight = containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 600) || 600;
    this.onSelectCallback = callbacks?.onSelect;
    this.onDeleteCallback = callbacks?.onDelete;

    this.domElement = document.createElement('div');
    this.domElement.className = 'math-ar-spatial-root';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'math-ar-spatial-canvas';
    this.domElement.appendChild(this.canvas);

    this.scene = new THREE.Scene();

    // 经典 45° 俯视视锥，完美匹配手持相机俯拍试卷桌面的物理透视
    this.camera = new THREE.PerspectiveCamera(
      42,
      (containerWidth || 800) / (containerHeight || 600),
      0.1,
      50
    );
    this.camera.position.set(0, 2.6, 3.8);
    this.camera.lookAt(0, 0, 0);

    // Apple 纯净晶体照明系统 (高透冷白 + 边缘青蓝天光)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.4);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    fillLight.position.set(-3, 2, -2);
    this.scene.add(fillLight);

    this.initRenderer(containerWidth, containerHeight);
    this.createShadowTexture();
    this.bindPointerEvents();
    this.startLoop();
  }

  private initRenderer(width: number, height: number): void {
    if (typeof document === 'undefined') return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(width || window.innerWidth, height || window.innerHeight, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
    } catch {
      // 兼容环境
    }
  }

  /**
   * 动态生成物理接触阴影贴图 (模型立于试卷纸面时的柔和半透明暗影)。
   */
  private createShadowTexture(): void {
    if (typeof document === 'undefined') return;
    try {
      const size = 128;
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = size;
      shadowCanvas.height = size;
      const ctx = shadowCanvas.getContext?.('2d');
      if (!ctx || typeof ctx.createRadialGradient !== 'function') return;

      const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.46)');
      gradient.addColorStop(0.35, 'rgba(0, 0, 0, 0.22)');
      gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    } catch {
      // headless / mock 环境优雅降级
    }
  }

  public resize(width: number, height: number): void {
    if (!width || !height) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height, false);
  }

  /**
   * 将屏幕二维坐标映射为纸面世界空间坐标 (Y = 0 平面投影)。
   */
  private screenToGround(screenX: number, screenY: number): THREE.Vector3 {
    const w = this.viewportWidth;
    const h = this.viewportHeight;

    const x = (screenX / w) * 2 - 1;
    const y = -(screenY / h) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, target);
    if (hit) return target;

    // 保底：若射线无交点，则安放于相机视野正前方纸面上
    return new THREE.Vector3(x * 1.5, 0, -y * 1.2);
  }

  /**
   * 直接在试卷的题目位置上立起一座 3D 多面体 (无任何外部方形框！)。
   */
  public addModel(
    modelDef: PolyhedronModelDef,
    name: string,
    subtitle: string,
    dataUrl: string,
    screenPos?: { x: number; y: number }
  ): ARSpatialItem {
    const id = `ar-model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 计算放置在试卷上的物理坐标
    let groundPos: THREE.Vector3;
    if (screenPos && screenPos.x > 0 && screenPos.y > 0) {
      groundPos = this.screenToGround(screenPos.x, screenPos.y);
    } else {
      // 多题目错落排布在试卷中
      const count = this.items.length;
      const offsets = [
        new THREE.Vector3(-0.8, 0, -0.3),
        new THREE.Vector3(0.8, 0, 0.4),
        new THREE.Vector3(-0.9, 0, 0.6),
        new THREE.Vector3(0.9, 0, -0.5),
      ];
      groundPos = offsets[count % offsets.length].clone();
    }

    const group = new THREE.Group();
    group.position.copy(groundPos);
    group.userData = { id, name };

    // 1. 试卷纸面接触暗影 (Contact Shadow)
    if (this.shadowTexture) {
      const shadowGeom = new THREE.PlaneGeometry(1.6, 1.6);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = 0.002; // 微贴试卷纸面
      group.add(shadowMesh);
    }

    // 2. 构建 3D 多面体核心网格 (半透明科技晶体 + 高光外骨架)
    const modelSubGroup = this.buildPolyhedronMesh(modelDef);
    modelSubGroup.name = 'polyhedronMesh';
    group.add(modelSubGroup);

    // 生长入场动画：从纸面拔地而起
    group.scale.set(0.01, 0.01, 0.01);
    this.scene.add(group);

    const fallbackW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const fallbackH = typeof window !== 'undefined' ? window.innerHeight : 600;

    const item: ARSpatialItem = {
      id,
      name,
      subtitle,
      dataUrl,
      modelDef,
      screenAnchor: screenPos || { x: fallbackW / 2, y: fallbackH / 2 },
      worldPosition: groundPos,
      rotationY: 0,
      rotationX: 0,
      scale: 1,
      group,
    };

    this.items.push(item);
    this.selectModel(id);

    // 平滑弹性生长
    this.animateGrowth(group);

    return item;
  }

  private animateGrowth(group: THREE.Group): void {
    if (typeof requestAnimationFrame === 'undefined') {
      group.scale.set(1, 1, 1);
      return;
    }
    let progress = 0;
    const start = performance.now();
    const duration = 380;

    const step = () => {
      const now = performance.now();
      progress = Math.min(1, (now - start) / duration);
      // Apple Spring 减速外展曲线
      const t = progress;
      const factor = t < 0.7 ? (t / 0.7) * 1.08 : 1.08 - ((t - 0.7) / 0.3) * 0.08;

      group.scale.set(factor, factor, factor);

      if (progress < 1 && !this.isDisposed) {
        requestAnimationFrame(step);
      } else {
        group.scale.set(1, 1, 1);
      }
    };
    step();
  }

  /**
   * 构建高品质三维几何晶体网格。
   */
  private buildPolyhedronMesh(def: PolyhedronModelDef): THREE.Group {
    const group = new THREE.Group();

    // 抬升模型使多面体底面落在 Y = 0 纸面上
    let minY = Infinity;
    def.vertices.forEach((v) => {
      if (v.y < minY) minY = v.y;
    });
    const yOffset = minY !== Infinity ? -minY : 0.4;
    group.position.y = yOffset;

    // A. 实体面 (高通透磨砂晶体，透出试卷底纹)
    const positions: number[] = [];
    for (const face of def.faces) {
      const idxs = face.vertexIndices;
      if (idxs.length < 3) continue;
      for (let i = 1; i < idxs.length - 1; i++) {
        const v0 = def.vertices[idxs[0]];
        const v1 = def.vertices[idxs[i]];
        const v2 = def.vertices[idxs[i + 1]];
        if (v0 && v1 && v2) {
          positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          positions.push(v0.x, v0.y, v0.z, v2.x, v2.y, v2.z, v1.x, v1.y, v1.z);
        }
      }
    }

    if (positions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.computeVertexNormals();

      const mat = new THREE.MeshPhongMaterial({
        color: 0x38bdf8,
        specular: 0xffffff,
        shininess: 90,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const facesMesh = new THREE.Mesh(geom, mat);
      facesMesh.userData = { isInteractable: true };
      group.add(facesMesh);
    }

    // B. 清晰棱边线框 (纯白发光细线)
    const linePositions: number[] = [];
    for (const [i1, i2] of def.edges) {
      const v1 = def.vertices[i1];
      const v2 = def.vertices[i2];
      if (v1 && v2) {
        linePositions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      }
    }

    if (linePositions.length > 0) {
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1.8,
        transparent: true,
        opacity: 0.95,
      });
      const lines = new THREE.LineSegments(lineGeom, lineMat);
      group.add(lines);
    }

    // C. 辅助线 (金黄虚线)
    if (def.auxEdges && def.auxEdges.length > 0) {
      const vertexLabelMap = new Map<string, THREE.Vector3>();
      def.vertexLabels.forEach((label, idx) => {
        if (def.vertices[idx]) vertexLabelMap.set(label, def.vertices[idx]);
      });
      def.keyPoints?.forEach((kp) => {
        vertexLabelMap.set(kp.id, kp.position);
      });

      const auxPositions: number[] = [];
      for (const aux of def.auxEdges) {
        const p1 = vertexLabelMap.get(aux.a);
        const p2 = vertexLabelMap.get(aux.b);
        if (p1 && p2) {
          auxPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }
      if (auxPositions.length > 0) {
        const auxGeom = new THREE.BufferGeometry();
        auxGeom.setAttribute('position', new THREE.Float32BufferAttribute(auxPositions, 3));
        const auxMat = new THREE.LineDashedMaterial({
          color: 0xf59e0b,
          dashSize: 0.05,
          gapSize: 0.03,
          transparent: true,
          opacity: 0.9,
        });
        const auxLines = new THREE.LineSegments(auxGeom, auxMat);
        auxLines.computeLineDistances();
        group.add(auxLines);
      }
    }

    // D. 顶点晶珠 (发光圆点)
    const dotGeom = new THREE.SphereGeometry(0.026, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc });
    for (const v of def.vertices) {
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(v);
      group.add(dot);
    }

    return group;
  }

  /**
   * 创建悬浮在 3D 模型正上方的微型胶囊标牌 (轻量、纯粹、无方框)。
   */
  /**
   * 移除试卷上的某个 3D 模型。
   */
  public removeModel(id: string): void {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const item = this.items[idx];

    // 收缩动画退场
    let scale = 1;
    const shrink = () => {
      scale -= 0.14;
      if (scale > 0 && !this.isDisposed && typeof requestAnimationFrame !== 'undefined') {
        item.group.scale.set(scale, scale, scale);
        requestAnimationFrame(shrink);
      } else {
        this.scene.remove(item.group);
        this.disposeGroup(item.group);
      }
    };
    shrink();

    this.items.splice(idx, 1);

    if (this.selectedId === id) {
      this.selectedId = this.items.length > 0 ? this.items[this.items.length - 1].id : null;
      if (this.selectedId) {
        this.selectModel(this.selectedId);
      }
    }
  }

  public selectModel(id: string, notify = true): void {
    if (this.selectedId === id && !notify) return;
    const changed = this.selectedId !== id;
    this.selectedId = id;
    if (changed && notify) {
      this.onSelectCallback?.(id);
    }
  }

  public getItems(): ARSpatialItem[] {
    return this.items;
  }

  public getSelectedItem(): ARSpatialItem | null {
    return this.items.find((item) => item.id === this.selectedId) || null;
  }

  private bindPointerEvents(): void {
    const canvas = this.canvas;
    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    const onPointerDown = (clientX: number, clientY: number) => {
      const w = this.viewportWidth;
      const h = this.viewportHeight;
      this.mouseVec.x = (clientX / w) * 2 - 1;
      this.mouseVec.y = -(clientY / h) * 2 + 1;

      this.raycaster.setFromCamera(this.mouseVec, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);

      // 寻觅被点击的模型
      let hitItem: ARSpatialItem | null = null;
      for (const hit of intersects) {
        let parent: THREE.Object3D | null = hit.object;
        while (parent && parent !== this.scene) {
          if (parent.userData?.id) {
            hitItem = this.items.find((item) => item.id === parent?.userData.id) || null;
            break;
          }
          parent = parent.parent;
        }
        if (hitItem) break;
      }

      if (hitItem) {
        this.isDragging = true;
        this.activeItem = hitItem;
        this.dragMode = 'rotate';
        this.selectModel(hitItem.id);
        this.lastPointerPos = { x: clientX, y: clientY };
      }
    };

    const onPointerMove = (clientX: number, clientY: number) => {
      if (!this.isDragging || !this.activeItem) return;

      const deltaX = clientX - this.lastPointerPos.x;
      const deltaY = clientY - this.lastPointerPos.y;

      const meshSubGroup = this.activeItem.group.getObjectByName('polyhedronMesh');
      if (meshSubGroup) {
        // 单指/鼠标直接在试卷上 360° 旋转该立体模型
        meshSubGroup.rotation.y += deltaX * 0.016;
        meshSubGroup.rotation.x = Math.max(-1.2, Math.min(1.2, meshSubGroup.rotation.x + deltaY * 0.016));
      }

      this.lastPointerPos = { x: clientX, y: clientY };
    };

    const onPointerUp = () => {
      this.isDragging = false;
      this.activeItem = null;
    };

    canvas.addEventListener('pointerdown', (e) => {
      onPointerDown(e.clientX, e.clientY);
      canvas.setPointerCapture?.(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      onPointerMove(e.clientX, e.clientY);
    });

    const end = (e: PointerEvent) => {
      onPointerUp();
      try {
        canvas.releasePointerCapture?.(e.pointerId);
      } catch {}
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    const render = () => {
      if (this.isDisposed) return;

      // 慢速呼吸自转 (仅未拖拽的选定模型轻微漂浮旋转)
      for (const item of this.items) {
        if (!this.isDragging || this.activeItem?.id !== item.id) {
          const mesh = item.group.getObjectByName('polyhedronMesh');
          if (mesh) {
            mesh.rotation.y += 0.005;
          }
        }
      }

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animFrameId = requestAnimationFrame(render);
    };

    render();
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.animFrameId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
    }

    this.items.forEach((item) => {
      this.disposeGroup(item.group);
    });
    this.items = [];

    this.shadowTexture?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.domElement.innerHTML = '';
  }
}
