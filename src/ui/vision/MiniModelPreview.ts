import * as THREE from 'three';
import type { PolyhedronModelDef } from '../../scene/math/GeometrySolver.ts';

/**
 * 嵌入在 AR 题目卡片中的轻量级 3D 几何预览视窗。
 * 遵循 Apple 极简科技美学，支持触摸与鼠标 360° 自由旋转。
 */
export class MiniModelPreview {
  public readonly domElement: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rootGroup: THREE.Group;
  private modelGroup: THREE.Group;
  private isDisposed = false;
  private isDragging = false;
  private previousPointerPosition = { x: 0, y: 0 };
  private autoRotate = true;
  private autoRotateTimer: number | null = null;
  private animFrameId: number | null = null;

  constructor(def: PolyhedronModelDef, width = 160, height = 140) {
    if (typeof document === 'undefined') {
      this.domElement = { className: 'math-ar-mini-preview', innerHTML: '', appendChild: () => {}, querySelector: () => null } as any;
      this.canvas = {} as any;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
      this.rootGroup = new THREE.Group();
      this.modelGroup = new THREE.Group();
      return;
    }

    this.domElement = document.createElement('div');
    this.domElement.className = 'math-ar-mini-preview';
    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'math-ar-mini-canvas';
    this.domElement.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
    this.camera.position.set(0, 0.8, 2.2);
    this.camera.lookAt(0, 0, 0);

    this.rootGroup = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.rootGroup.add(this.modelGroup);
    this.scene.add(this.rootGroup);

    // Apple 极简冷调光照系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xa5c8ff, 1.2);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    this.buildGeometry(def);
    this.initRenderer(width, height);
    this.bindInteractions();
    this.startLoop();
  }

  private initRenderer(width: number, height: number): void {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      this.renderer.setSize(width, height, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } catch {
      // 容错处理
    }
  }

  private buildGeometry(def: PolyhedronModelDef): void {
    // 1. 实体面 (半透明青白磨砂玻璃质感)
    const positions: number[] = [];
    for (const face of def.faces) {
      const idxs = face.vertexIndices;
      if (idxs.length < 3) continue;
      // 扇形三角剖分
      for (let i = 1; i < idxs.length - 1; i++) {
        const v0 = def.vertices[idxs[0]];
        const v1 = def.vertices[idxs[i]];
        const v2 = def.vertices[idxs[i + 1]];
        if (v0 && v1 && v2) {
          positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          // 双面渲染
          positions.push(v0.x, v0.y, v0.z, v2.x, v2.y, v2.z, v1.x, v1.y, v1.z);
        }
      }
    }

    if (positions.length > 0) {
      const faceGeom = new THREE.BufferGeometry();
      faceGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      faceGeom.computeVertexNormals();

      const faceMat = new THREE.MeshPhongMaterial({
        color: 0x38bdf8,
        specular: 0xffffff,
        shininess: 60,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const faceMesh = new THREE.Mesh(faceGeom, faceMat);
      this.modelGroup.add(faceMesh);
    }

    // 2. 棱线 (清晰锐利的纯白线框)
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
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 2 * 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.95,
      });
      const lines = new THREE.LineSegments(lineGeom, lineMat);
      this.modelGroup.add(lines);
    }

    // 3. 辅助作图虚线/辅助线 (微弱金黄色)
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
        auxGeom.setAttribute('position', new THREE.Float32BufferAttribute(auxPositions, 2 * 3));
        const auxMat = new THREE.LineDashedMaterial({
          color: 0xf59e0b,
          dashSize: 0.05,
          gapSize: 0.03,
          transparent: true,
          opacity: 0.85,
        });
        const auxLines = new THREE.LineSegments(auxGeom, auxMat);
        auxLines.computeLineDistances();
        this.modelGroup.add(auxLines);
      }
    }

    // 4. 顶点圆点 (微小的发光节点)
    const dotGeom = new THREE.SphereGeometry(0.024, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
    for (const v of def.vertices) {
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(v);
      this.modelGroup.add(dot);
    }

    // 初始轻微仰角透视
    this.rootGroup.rotation.x = 0.28;
    this.rootGroup.rotation.y = 0.45;
  }

  private bindInteractions(): void {
    const onStart = (clientX: number, clientY: number) => {
      this.isDragging = true;
      this.autoRotate = false;
      this.previousPointerPosition = { x: clientX, y: clientY };
      if (this.autoRotateTimer) window.clearTimeout(this.autoRotateTimer);
    };

    const onMove = (clientX: number, clientY: number) => {
      if (!this.isDragging) return;
      const deltaX = clientX - this.previousPointerPosition.x;
      const deltaY = clientY - this.previousPointerPosition.y;

      this.rootGroup.rotation.y += deltaX * 0.014;
      this.rootGroup.rotation.x = Math.max(-1.4, Math.min(1.4, this.rootGroup.rotation.x + deltaY * 0.014));

      this.previousPointerPosition = { x: clientX, y: clientY };
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      // 停止交互 3 秒后恢复轻缓自转
      this.autoRotateTimer = window.setTimeout(() => {
        this.autoRotate = true;
      }, 3000);
    };

    this.domElement.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onStart(e.clientX, e.clientY);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    });

    this.domElement.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        e.stopPropagation();
        onMove(e.clientX, e.clientY);
      }
    });

    const endHandler = (e: PointerEvent) => {
      onEnd();
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // 忽略
      }
    };
    this.domElement.addEventListener('pointerup', endHandler);
    this.domElement.addEventListener('pointercancel', endHandler);
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    const render = () => {
      if (this.isDisposed) return;
      if (this.autoRotate) {
        this.rootGroup.rotation.y += 0.007;
      }
      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
      this.animFrameId = requestAnimationFrame(render);
    };
    render();
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.autoRotateTimer && typeof window !== 'undefined') window.clearTimeout(this.autoRotateTimer);
    if (this.animFrameId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animFrameId);

    // 递归释放几何体与材质
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    this.renderer?.dispose();
    this.renderer = null;
    this.domElement.innerHTML = '';
  }
}
