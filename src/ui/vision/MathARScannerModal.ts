import * as THREE from 'three';
import { GeometrySolver, type PolyhedronModelDef } from '../../scene/math/GeometrySolver.ts';
import { buildRecognizedModel, type RecognizedFigure } from '../../scene/math/figureModel.ts';
import { recognizeStereometryImage } from '../../scene/math/recognizeFigure.ts';
import { MathARSpatialScene, type ARSpatialItem } from './MathARSpatialScene.ts';

export interface ARModelItem {
  id: string;
  name: string;
  subtitle: string;
  dataUrl: string;
  thumbUrl?: string;
  modelDef: PolyhedronModelDef;
  anchor: { x: number; y: number };
}

export interface MathARScannerModalOptions {
  onSyncModel?: (def: PolyhedronModelDef) => void;
  onRecognizeImage?: (dataUrl: string) => Promise<{ name: string; subtitle: string }>;
  onClose?: () => void;
}

/**
 * 苹果设计风格的沉浸式数学 AR 题目扫描工作台。
 * 真实叠加于试卷纸面之上 (无任何方形外壳！)，支持连续拍照多题、手势 360° 旋转、单题删除与 Apple 质感。
 */
export class MathARScannerModal {
  public readonly element: HTMLElement;
  private readonly options: MathARScannerModalOptions;
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasLayerEl: HTMLCanvasElement | null = null;
  private arOverlayEl: HTMLElement | null = null;
  private modelTrayEl: HTMLElement | null = null;
  private modelTrayListEl: HTMLElement | null = null;
  private shutterBtn: HTMLButtonElement | null = null;
  private doneBtn: HTMLButtonElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private scanLaserEl: HTMLElement | null = null;
  private gridToggleBtn: HTMLButtonElement | null = null;
  private torchToggleBtn: HTMLButtonElement | null = null;
  private albumInputEl: HTMLInputElement | null = null;

  private spatialScene: MathARSpatialScene | null = null;
  private models: ARModelItem[] = [];
  private selectedModelId: string | null = null;
  private isAnalyzing = false;
  private isGridVisible = true;
  private isTorchOn = false;

  constructor(options: MathARScannerModalOptions = {}) {
    this.options = options;
    if (typeof document === 'undefined') {
      this.element = { querySelector: () => null, appendChild: () => {}, remove: () => {}, classList: { add: () => {} } } as any;
      return;
    }

    this.element = document.createElement('div');
    this.element.className = 'math-ar-scanner-modal';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', '数学题目 AR 扫描仪');

    this.buildUI();
    this.initSpatialScene();
    this.bindEvents();
    this.startCamera();
  }

  private buildUI(): void {
    this.element.innerHTML = `
      <!-- 1. 顶部 Apple 悬浮毛玻璃导航栏 -->
      <header class="math-ar-nav-bar">
        <div class="math-ar-nav-left">
          <button type="button" class="math-ar-glass-btn" id="math-ar-torch-btn" title="手电筒补光">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6c0 2-2 4-2 7v5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5c0-3-2-5-2-7a6 6 0 1 1 12 0z"/>
              <line x1="12" y1="12" x2="12" y2="12"/>
            </svg>
          </button>
          <button type="button" class="math-ar-glass-btn active" id="math-ar-grid-btn" title="题目对齐网格">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
        </div>

        <div class="math-ar-nav-right">
          <button type="button" class="math-ar-done-capsule" id="math-ar-done-btn">
            <span class="math-ar-done-label">关闭</span>
          </button>
        </div>
      </header>

      <!-- 2. 取景视窗与真实 AR 纸面空间 -->
      <main class="math-ar-viewport" id="math-ar-viewport">
        <!-- 实时相机视频 -->
        <video class="math-ar-camera-feed" id="math-ar-video" autoplay playsinline muted></video>

        <!-- 离线/模拟视卷底图画布 (相机受限时的保底呈现) -->
        <canvas class="math-ar-sim-canvas" id="math-ar-sim-canvas" style="display:none;"></canvas>

        <!-- 试卷对齐辅助网格 -->
        <div class="math-ar-grid-overlay" id="math-ar-grid"></div>

        <!-- 核心识别扫描视框 -->
        <div class="math-ar-finder-frame" id="math-ar-finder">
          <div class="math-ar-corner corner-tl"></div>
          <div class="math-ar-corner corner-tr"></div>
          <div class="math-ar-corner corner-bl"></div>
          <div class="math-ar-corner corner-br"></div>
          <div class="math-ar-scan-laser" id="math-ar-laser"></div>
          <div class="math-ar-finder-hint">将题目放置于取景框内拍照</div>
        </div>

        <!-- AR 全景空间渲染层 (全透明 Three.js 场景，3D 几何直接立在纸面上！) -->
        <div class="math-ar-overlay-layer" id="math-ar-overlay"></div>

        <!-- 快门曝光闪烁效果 -->
        <div class="math-ar-shutter-flash" id="math-ar-flash"></div>
      </main>

      <!-- 3. 底部 Apple 抽屉式已生成模型轮播托盘 -->
      <section class="math-ar-model-tray hidden" id="math-ar-model-tray">
        <div class="math-ar-tray-header">
          <span class="math-ar-tray-title">3D 模型</span>
          <span class="math-ar-tray-badge" id="math-ar-tray-count">0 个</span>
        </div>
        <div class="math-ar-tray-carousel" id="math-ar-tray-list"></div>
      </section>

      <!-- 4. 底部相机操作控制底栏 -->
      <footer class="math-ar-bottom-bar">
        <!-- 左侧：相册导入题目 -->
        <div class="math-ar-action-slot left">
          <button type="button" class="math-ar-album-btn" id="math-ar-album-btn" title="从相册选取题目">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span class="math-ar-slot-label">相册</span>
          </button>
          <input type="file" id="math-ar-album-input" accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp" style="display:none;" />
        </div>

        <!-- 中间：Apple 经典同心圆快门按钮 -->
        <div class="math-ar-action-slot center">
          <button type="button" class="math-ar-shutter-btn" id="math-ar-shutter" aria-label="拍照并生成 AR 模型">
            <span class="math-ar-shutter-outer"></span>
            <span class="math-ar-shutter-inner"></span>
          </button>
        </div>

        <!-- 右侧：展开/收起模型托盘快捷键 -->
        <div class="math-ar-action-slot right">
          <button type="button" class="math-ar-toggle-tray-btn" id="math-ar-toggle-tray" title="查看所有已生成模型">
            <div class="math-ar-tray-icon-box">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <span class="math-ar-tray-counter-bubble hidden" id="math-ar-counter-bubble">0</span>
            </div>
            <span class="math-ar-slot-label">模型</span>
          </button>
        </div>
      </footer>
    `;

    // 缓存元素
    this.videoEl = this.element.querySelector('#math-ar-video');
    this.canvasLayerEl = this.element.querySelector('#math-ar-sim-canvas');
    this.arOverlayEl = this.element.querySelector('#math-ar-overlay');
    this.modelTrayEl = this.element.querySelector('#math-ar-model-tray');
    this.modelTrayListEl = this.element.querySelector('#math-ar-tray-list');
    this.shutterBtn = this.element.querySelector('#math-ar-shutter');
    this.doneBtn = this.element.querySelector('#math-ar-done-btn');
    this.statusTextEl = this.element.querySelector('#math-ar-status-text');
    this.scanLaserEl = this.element.querySelector('#math-ar-laser');
    this.gridToggleBtn = this.element.querySelector('#math-ar-grid-btn');
    this.torchToggleBtn = this.element.querySelector('#math-ar-torch-btn');
    this.albumInputEl = this.element.querySelector('#math-ar-album-input');
    if (this.albumInputEl) {
      this.albumInputEl.setAttribute('accept', 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp');
    }
  }

  /** 初始化全景透明 AR 空间渲染引擎。 */
  private initSpatialScene(): void {
    if (!this.arOverlayEl || typeof document === 'undefined') return;

    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;

    this.spatialScene = new MathARSpatialScene(w, h, {
      onSelect: (id) => {
        this.selectModel(id);
      },
      onDelete: (id) => {
        this.removeModel(id);
      },
    });

    this.arOverlayEl.appendChild(this.spatialScene.domElement);

    const onResize = () => {
      this.spatialScene?.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
  }

  private bindEvents(): void {
    // 1. 关闭 / 完成
    this.doneBtn?.addEventListener('click', () => this.close());

    // 2. 快门拍照
    this.shutterBtn?.addEventListener('click', () => {
      void this.captureAndRecognize();
    });

    // 3. 网格开关
    this.gridToggleBtn?.addEventListener('click', () => {
      this.isGridVisible = !this.isGridVisible;
      const gridEl = this.element.querySelector('#math-ar-grid');
      gridEl?.classList.toggle('hidden', !this.isGridVisible);
      this.gridToggleBtn?.classList.toggle('active', this.isGridVisible);
    });

    // 4. 手电筒补光开关
    this.torchToggleBtn?.addEventListener('click', () => {
      void this.toggleTorch();
    });

    // 5. 自定义相册导入 (秒开 + 异步多级位图降采样)
    this.element.querySelector('#math-ar-album-btn')?.addEventListener('click', () => {
      this.setStatus('正在打开相册…', 1500);
      this.albumInputEl?.click();
    });

    this.albumInputEl?.addEventListener('cancel', () => {
      this.setStatus('已取消相册选择');
    });

    this.albumInputEl?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      this.setStatus('正在优化并载入相册试卷…');
      this.shutterBtn?.classList.add('is-busy');

      try {
        const { displayDataUrl, thumbDataUrl } = await this.optimizeImageFile(file);

        // 将相册试卷投射到取景底纸上，立体几何模型直接立于该题目之上
        this.displayPaperBackdrop(displayDataUrl);

        // 处理几何识别与 3D 模型生成 (传入轻量微缩图，避免巨量内存占用)
        await this.processImageData(displayDataUrl, '相册试卷题目', thumbDataUrl);
      } catch (err) {
        this.setStatus(err instanceof Error ? err.message : '相册图片载入失败');
      } finally {
        this.shutterBtn?.classList.remove('is-busy');
        (e.target as HTMLInputElement).value = '';
      }
    });

    // 6. 底部托盘展开/收起
    this.element.querySelector('#math-ar-toggle-tray')?.addEventListener('click', () => {
      if (this.models.length === 0) {
        this.setStatus('试卷上暂无 3D 模型，请对准题目拍照', 2000);
        return;
      }
      this.modelTrayEl?.classList.toggle('hidden');
    });

    // 7. ESC 快捷键退出
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.body?.contains(this.element)) {
        this.close();
      }
    };
    window.addEventListener('keydown', onKey);
  }

  private async startCamera(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.startSimulatedExamPaper();
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      });

      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play().catch(() => {});
      }
      this.setStatus('实时相机已就绪，对准题目点击快门');
    } catch {
      this.startSimulatedExamPaper();
    }
  }

  /**
   * 启动高保真仿真试卷取景器 (无摄像头或测试环境下的优雅保底呈现)。
   */
  private startSimulatedExamPaper(): void {
    if (!this.canvasLayerEl) return;
    this.canvasLayerEl.style.display = 'block';
    if (this.videoEl) this.videoEl.style.display = 'none';

    const canvas = this.canvasLayerEl;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderExamPaper = () => {
      canvas.width = window.innerWidth || 1024;
      canvas.height = window.innerHeight || 768;

      // 试卷冷灰质感背景
      ctx.fillStyle = '#1c1c1f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制试卷几何习题线稿与手稿模拟
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 44;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '500 15px -apple-system, sans-serif';
      ctx.fillText('【立体几何题 1】在四棱锥 P-ABCD 中，底面 ABCD 为正方形，PA ⊥ 底面 ABCD…', 80, 160);
      ctx.fillText('【立体几何题 2】已知正方体 ABCD-A1B1C1D1 棱长为 2，求平面 A1BD 与截面多边形…', 80, canvas.height - 220);
    };

    renderExamPaper();
    window.addEventListener('resize', renderExamPaper);
    this.setStatus('试卷取景就绪，点击快门将 3D 模型立于纸上');
  }

  private async toggleTorch(): Promise<void> {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return;

    try {
      this.isTorchOn = !this.isTorchOn;
      const capabilities = (track.getCapabilities?.() as any) || {};
      if (capabilities.torch) {
        await (track as any).applyConstraints({
          advanced: [{ torch: this.isTorchOn }],
        });
        this.torchToggleBtn?.classList.toggle('active', this.isTorchOn);
      } else {
        this.setStatus('当前摄像头硬件不支持补光灯', 1800);
      }
    } catch {
      this.setStatus('补光灯切换失败', 1500);
    }
  }

  /**
   * 恢复实时相机视窗（从相册底图切回）。
   */
  private resumeLiveCamera(): void {
    if (this.canvasLayerEl) {
      this.canvasLayerEl.style.display = 'none';
    }
    if (this.videoEl) {
      this.videoEl.style.display = 'block';
      void this.videoEl.play().catch(() => {});
    }
  }

  /**
   * 将相册导入的试卷照片投射到背景画布上，使 3D 几何真正直接立在相册试卷之上。
   */
  private displayPaperBackdrop(imageDataUrl: string): void {
    if (!this.canvasLayerEl) return;
    this.canvasLayerEl.style.display = 'block';
    if (this.videoEl) {
      this.videoEl.style.display = 'none';
      try {
        this.videoEl.pause();
      } catch {}
    }

    const img = new Image();
    img.onload = () => {
      const canvas = this.canvasLayerEl;
      if (!canvas) return;
      canvas.width = window.innerWidth || 1024;
      canvas.height = window.innerHeight || 768;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#0f0f12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;

      ctx.drawImage(img, dx, dy, dw, dh);
    };
    img.src = imageDataUrl;
  }

  /**
   * 采用后台异步位图解码与双规格压缩管线，彻底消灭相册大图（几千万像素）的主线程阻塞与内存暴涨。
   */
  private async optimizeImageFile(file: File): Promise<{ displayDataUrl: string; thumbDataUrl: string }> {
    if (typeof document === 'undefined') {
      return {
        displayDataUrl: 'data:image/jpeg;base64,mock',
        thumbDataUrl: 'data:image/jpeg;base64,mock',
      };
    }

    let imgSource: CanvasImageSource | null = null;
    let srcWidth = 0;
    let srcHeight = 0;

    // 1. 优先使用 createImageBitmap 在后台独立线程完成高效解码，避免主线程掉帧
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        imgSource = bitmap;
        srcWidth = bitmap.width;
        srcHeight = bitmap.height;
      } catch {
        imgSource = null;
      }
    }

    // 2. 降级方案：使用 Blob URL 与 Image 对象异步加载
    if (!imgSource) {
      try {
        const isBlob = typeof Blob !== 'undefined' && file instanceof Blob;
        const ImageConstructor = typeof window !== 'undefined' && (window as any).Image ? (window as any).Image : (typeof Image !== 'undefined' ? Image : null);
        if (ImageConstructor && (isBlob || (file && (file as any).type))) {
          const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && isBlob ? URL.createObjectURL(file) : '';
          const img = new ImageConstructor();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('无法解析该相册图片'));
            if (url) {
              img.src = url;
            } else if (typeof FileReader !== 'undefined' && isBlob) {
              const reader = new FileReader();
              reader.onload = () => {
                img.src = reader.result as string;
              };
              reader.readAsDataURL(file);
            } else {
              resolve();
            }
          });
          if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
          imgSource = img;
          srcWidth = img.naturalWidth || img.width || 1280;
          srcHeight = img.naturalHeight || img.height || 720;
        }
      } catch {
        imgSource = null;
      }
    }

    srcWidth = srcWidth || 1280;
    srcHeight = srcHeight || 720;

    // 3. 产出高清展示底图 (最长边限制 1600px，压缩至 ~200KB，极致清晰且绝不占显存)
    const maxEdge = 1600;
    const dispScale = Math.min(1, maxEdge / Math.max(srcWidth, srcHeight, 1));
    const dispW = Math.max(1, Math.round(srcWidth * dispScale));
    const dispH = Math.max(1, Math.round(srcHeight * dispScale));

    const dispCanvas = document.createElement('canvas');
    dispCanvas.width = dispW;
    dispCanvas.height = dispH;
    const dispCtx = dispCanvas.getContext('2d');
    if (dispCtx && imgSource) {
      dispCtx.drawImage(imgSource, 0, 0, dispW, dispH);
    }
    const displayDataUrl = dispCanvas.toDataURL ? dispCanvas.toDataURL('image/jpeg', 0.82) : 'data:image/jpeg;base64,mock';

    // 4. 产出底部托盘专用轻量微缩图 (128x128，仅 ~4KB，杜绝底栏频繁重绘卡顿)
    const thumbSize = 128;
    const thumbScale = Math.min(1, thumbSize / Math.max(srcWidth, srcHeight, 1));
    const thumbW = Math.max(1, Math.round(srcWidth * thumbScale));
    const thumbH = Math.max(1, Math.round(srcHeight * thumbScale));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx && imgSource) {
      thumbCtx.drawImage(imgSource, 0, 0, thumbW, thumbH);
    }
    const thumbDataUrl = thumbCanvas.toDataURL ? thumbCanvas.toDataURL('image/jpeg', 0.7) : displayDataUrl;

    // 5. 及时释放 ImageBitmap 句柄
    if (imgSource && 'close' in imgSource && typeof (imgSource as any).close === 'function') {
      (imgSource as any).close();
    }

    return { displayDataUrl, thumbDataUrl };
  }

  /**
   * 快门拍照与截帧。
   */
  private async captureAndRecognize(): Promise<void> {
    if (this.isAnalyzing) return;

    // 若此前显示的是相册底纸，点击快门自动切回实时摄像头
    this.resumeLiveCamera();

    // 快门微闪
    const flashEl = this.element.querySelector('#math-ar-flash');
    if (flashEl) {
      flashEl.classList.remove('animate');
      void (flashEl as HTMLElement).offsetWidth;
      flashEl.classList.add('animate');
    }

    let dataUrl = '';
    if (this.videoEl && this.videoEl.videoWidth > 0) {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = this.videoEl.videoWidth;
      captureCanvas.height = this.videoEl.videoHeight;
      const ctx = captureCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(this.videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
        dataUrl = captureCanvas.toDataURL('image/jpeg', 0.86);
      }
    } else if (this.canvasLayerEl) {
      dataUrl = this.canvasLayerEl.toDataURL('image/jpeg', 0.86);
    }

    if (!dataUrl) {
      this.setStatus('未能成功采集合格画面，请重试');
      return;
    }

    await this.processImageData(dataUrl, `题目 ${this.models.length + 1}`);
  }

  /**
   * 识别图像并在试卷上直接安放真实 3D 多面体。
   */
  private async processImageData(dataUrl: string, defaultName: string, thumbUrl?: string): Promise<void> {
    this.isAnalyzing = true;
    this.shutterBtn?.classList.add('is-busy');
    this.scanLaserEl?.classList.add('active');
    this.setStatus('正在解析题目并构建立体几何…');

    try {
      let modelDef: PolyhedronModelDef | null = null;
      let title = defaultName;
      let subtitle = '高考数学立体几何';

      try {
        if (this.options.onRecognizeImage) {
          const res = await this.options.onRecognizeImage(dataUrl);
          title = res.name || title;
          subtitle = res.subtitle || subtitle;
        } else {
          const figure = await recognizeStereometryImage(dataUrl);
          title = figure.name || title;
          subtitle = figure.subtitle || subtitle;
          modelDef = buildRecognizedModel(figure);
        }
      } catch {
        const fallbackCatalog: { type: any; name: string; subtitle: string }[] = [
          { type: 'square-pyramid', name: '正四棱锥', subtitle: '经典截面与线面角' },
          { type: 'cube', name: '正方体模型', subtitle: '外接球与二面角' },
          { type: 'tetrahedron', name: '正四面体', subtitle: '对棱垂直与嵌入长方体' },
          { type: 'triangular-prism', name: '直三棱柱', subtitle: '斜截面与体积分割' },
          { type: 'corner-pyramid', name: '墙角模型三棱锥', subtitle: '三条侧棱两两垂直' },
        ];
        const selected = fallbackCatalog[this.models.length % fallbackCatalog.length];
        modelDef = GeometrySolver.createModel(selected.type);
        title = selected.name;
        subtitle = selected.subtitle;
      }

      if (!modelDef) {
        modelDef = GeometrySolver.createModel('square-pyramid');
      }

      // 获取取景框中心或试卷对应屏幕位置
      const finderEl = this.element.querySelector('#math-ar-finder');
      const rect = finderEl?.getBoundingClientRect();
      const screenX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const screenY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

      // 真正将 3D 模型直接安放立于试卷纸面！
      const arItem = this.spatialScene?.addModel(modelDef, title, subtitle, dataUrl, {
        x: screenX,
        y: screenY,
      });

      const modelItem: ARModelItem = {
        id: arItem?.id || `ar-${Date.now()}`,
        name: title,
        subtitle,
        dataUrl,
        thumbUrl: thumbUrl || dataUrl,
        modelDef,
        anchor: { x: screenX, y: screenY },
      };

      this.models.push(modelItem);
      this.selectedModelId = modelItem.id;
      this.options.onSyncModel?.(modelDef);
      this.updateTray();

      this.setStatus(`「${title}」已立于试卷上 · 可在纸面上直接拖拽 360° 旋转`, 3500);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '题目识别失败，请对准后重试');
    } finally {
      this.isAnalyzing = false;
      this.shutterBtn?.classList.remove('is-busy');
      this.scanLaserEl?.classList.remove('active');
    }
  }

  /**
   * 删除某个已经生成的 3D 模型 (退出前可随时删掉)。
   */
  public removeModel(id: string): void {
    const idx = this.models.findIndex((m) => m.id === id);
    if (idx === -1) return;

    const item = this.models[idx];

    // 从 3D 纸面空间中彻底移除并执行收缩淡出
    this.spatialScene?.removeModel(id);

    this.models.splice(idx, 1);

    if (this.selectedModelId === id) {
      this.selectedModelId = this.models.length > 0 ? this.models[this.models.length - 1].id : null;
      if (this.selectedModelId) {
        const next = this.models.find((m) => m.id === this.selectedModelId);
        if (next) this.options.onSyncModel?.(next.modelDef);
      }
    }

    this.updateTray();
    this.setStatus(`已从纸面删除「${item.name}」· 剩余 ${this.models.length} 个模型`, 2200);
  }

  /**
   * 聚焦选中某个 3D 模型。
   */
  public selectModel(id: string): void {
    const isNew = this.selectedModelId !== id;
    this.selectedModelId = id;
    this.spatialScene?.selectModel(id, false);

    const target = this.models.find((m) => m.id === id);
    if (target && isNew) {
      this.options.onSyncModel?.(target.modelDef);
    }

    this.modelTrayListEl?.querySelectorAll('.math-ar-tray-card').forEach((card) => {
      card.classList.toggle('active', card.getAttribute('data-id') === id);
    });
  }

  /**
   * 刷新底部已生成模型抽屉托盘与计数角标。
   */
  private updateTray(): void {
    const count = this.models.length;

    const doneLabel = this.doneBtn?.querySelector('.math-ar-done-label');
    if (doneLabel) {
      doneLabel.textContent = count > 0 ? `完成 (${count})` : '关闭';
    }

    const bubbleEl = this.element.querySelector('#math-ar-counter-bubble');
    if (bubbleEl) {
      bubbleEl.textContent = String(count);
      bubbleEl.classList.toggle('hidden', count === 0);
    }

    const trayCountEl = this.element.querySelector('#math-ar-tray-count');
    if (trayCountEl) {
      trayCountEl.textContent = `${count} 个`;
    }

    if (count === 0) {
      this.modelTrayEl?.classList.add('hidden');
      return;
    }

    if (this.modelTrayListEl) {
      this.modelTrayListEl.innerHTML = '';
      this.models.forEach((m, idx) => {
        const trayCard = document.createElement('div');
        trayCard.className = `math-ar-tray-card ${m.id === this.selectedModelId ? 'active' : ''}`;
        trayCard.setAttribute('data-id', m.id);

        const displayName = this.formatModelName(m.name);
        const displaySub = this.simplifyModelDescription(m.name, m.subtitle);

        trayCard.innerHTML = `
          <div class="math-ar-tray-thumb">
            <img src="${m.thumbUrl || m.dataUrl}" alt="题目" class="math-ar-thumb-img" />
            <span class="math-ar-thumb-index">${idx + 1}</span>
          </div>
          <div class="math-ar-tray-meta">
            <span class="math-ar-tray-name">${displayName}</span>
            ${displaySub ? `<span class="math-ar-tray-sub">${displaySub}</span>` : ''}
          </div>
          <button type="button" class="math-ar-tray-delete-btn" title="删除该模型">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        `;

        trayCard.addEventListener('click', () => {
          this.selectModel(m.id);
        });

        trayCard.querySelector('.math-ar-tray-delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeModel(m.id);
        });

        this.modelTrayListEl?.appendChild(trayCard);
      });

      this.modelTrayEl?.classList.remove('hidden');
    }
  }

  /**
   * 格式化并优雅展示模型名称 (如 "四面体ABCD" -> "四面体 ABCD")
   */
  private formatModelName(name: string): string {
    if (!name) return '立体几何';
    return name.replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2').trim();
  }

  /**
   * 简化模型卡片的文字描述，保持 Apple 简约低调风格，去除冗长公式与截断文本。
   */
  private simplifyModelDescription(name: string, subtitle?: string): string {
    if (!subtitle) return '';

    // 1. 若包含长数学公式/条件表达式 (如 AD⊥平面ABC、AC=2 等)，提炼精简核心属性
    if (/[⊥=∠△∥\+\-\*\/]/.test(subtitle)) {
      if (/⊥|垂直/.test(subtitle)) return '线面垂直';
      if (/截面/.test(subtitle)) return '截面分析';
      if (/外接球|内切球|球/.test(subtitle)) return '外接球模型';
      if (/二面角|线面角|角/.test(subtitle)) return '空间夹角';
      if (/平行/.test(subtitle)) return '线面平行';
      if (/棱长|体积|面积/.test(subtitle)) return '度量几何';
      return '几何分析';
    }

    // 2. 去除冗长尾缀词，保持 4~8 个汉字以内的极简描述
    let clean = subtitle
      .replace(/^(已知|在|对于)/, '')
      .replace(/与嵌入长方体|与线面角|与二面角|与体积分割|两两垂直/g, '')
      .replace(/模型$/, '')
      .trim();

    // 如果与名称高度重复（例如 name="正四面体", subtitle="正四面体"），返回精简说明
    if (clean === name) {
      return '标准模型';
    }

    if (clean.length > 8) {
      clean = clean.slice(0, 8);
    }

    return clean || '3D 几何';
  }

  private setStatus(text: string, duration?: number): void {
    if (this.statusTextEl) {
      this.statusTextEl.textContent = text;
    }
    if (duration) {
      setTimeout(() => {
        if (this.statusTextEl && this.statusTextEl.textContent === text) {
          const defaultHint =
            this.models.length > 0
              ? `试卷上已立起 ${this.models.length} 个 3D 模型，可继续拍摄下一题`
              : '对准试卷上的立体几何题目';
          this.statusTextEl.textContent = defaultHint;
        }
      }, duration);
    }
  }

  /**
   * 退出并关闭工作台，同步最终模型并安全清理硬件资源。
   */
  public close(): void {
    if (this.selectedModelId) {
      const active = this.models.find((m) => m.id === this.selectedModelId);
      if (active) this.options.onSyncModel?.(active.modelDef);
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.spatialScene?.dispose();
    this.spatialScene = null;

    this.element.classList.add('is-closing');
    setTimeout(() => {
      this.element.remove();
      this.options.onClose?.();
    }, 280);
  }
}
