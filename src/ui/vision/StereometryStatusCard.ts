import type { StereometryTelemetryData } from '../../experiments/catalog/math-stereometry/index.ts';
import type { HighSchoolModelType } from '../../scene/math/GeometrySolver.ts';
import type { InteractionMode } from '../../scene/math/StereometryInteractionManager.ts';
import { captureProblemPhoto } from './captureProblemPhoto.ts';

export interface StereometryStatusCardCallbacks {
  onModelChange?: (type: HighSchoolModelType) => void;
  onDimensionChange?: (dims: { a?: number; h?: number }) => void;
  onInteractionModeChange?: (mode: InteractionMode) => void;
  onResetView?: (view: 'iso' | 'front' | 'side' | 'top') => void;
  onClearSegments?: () => void;
  onToggleDashedLines?: (show: boolean) => void;
  onToggleCoordinateSystem?: (show: boolean) => void;
  onToggleEmbeddingBox?: (show: boolean) => void;
  onToggleCircumSphere?: (show: boolean) => void;
  onToggleInSphere?: (show: boolean) => void;
  onToggleClipping?: (enabled: boolean) => void;
  onExplodeDistanceChange?: (dist: number) => void;
  onUnfoldProgressChange?: (progress: number) => void;
  onToggleThreeViews?: (show: boolean) => void;
  onToggleMidpoints?: (show: boolean) => void;
  onToggleFaceCenters?: (show: boolean) => void;
  onToggleLabels?: (show: boolean) => void;
  onApplyPreset?: (preset: 'cube-hexagon' | 'cube-skew-60' | 'tetra-orthogonal' | 'corner-box' | 'cone-conic') => void;
  onRecognizeImage?: (dataUrl: string) => Promise<{ name: string; subtitle: string }>;
}

export class StereometryStatusCard {
  public element: HTMLElement;
  private callbacks: StereometryStatusCardCallbacks;
  private isVisible = false;

  // 缓存的 DOM 元素
  private scanBarEl: HTMLElement | null = null;
  private scanStatusEl: HTMLElement | null = null;
  private uploadBtn: HTMLButtonElement | null = null;
  private cameraBtn: HTMLButtonElement | null = null;
  private dropzoneEl: HTMLElement | null = null;
  private recognizing = false;

  constructor(callbacks: StereometryStatusCardCallbacks = {}) {
    this.callbacks = callbacks;
    this.createUI();
  }

  private createUI(): void {
    this.element = document.createElement('div');
    this.element.className = 'vision-math-status-card hud-interactive';

    this.element.innerHTML = `
      <div class="math-card-container apple-style">
        <!-- 1. Hero Action Buttons: Upload & Camera -->
        <div class="math-hero-actions" id="math-scan-bar">
          <button type="button" class="apple-hero-btn" id="btn-math-upload" title="上传立体几何题目图片">
            <svg class="apple-hero-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span class="apple-btn-label">上传题目</span>
          </button>
          <button type="button" class="apple-hero-btn" id="btn-math-camera" title="调用摄像头拍摄题目">
            <svg class="apple-hero-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span class="apple-btn-label">拍摄</span>
          </button>

          <input id="math-scan-file" type="file" accept="image/*" style="display:none;" />
          <input id="math-scan-camera" type="file" accept="image/*" capture="environment" style="display:none;" />
        </div>

        <!-- 2. 4 Built-in Models Grid (Clean, No Subtitles) -->
        <div class="math-deck-container">
          <div class="math-branches-deck">
            <!-- Cube -->
            <div class="math-branch-tile math-model-card active" data-model="cube" role="button" tabindex="0" title="正方体">
              <div class="math-tile-icon-box">
                <svg class="math-tile-svg" viewBox="0 0 44 44" width="50" height="50" fill="none" stroke="currentColor">
                  <path d="M22 6 L38 15 L22 24 L6 15 Z" fill="currentColor" fill-opacity="0.14" stroke-width="1.8" stroke-linejoin="round"/>
                  <path d="M6 15 L22 24 L22 39 L6 30 Z" fill="currentColor" fill-opacity="0.08" stroke-width="1.8" stroke-linejoin="round"/>
                  <path d="M38 15 L22 24 L22 39 L38 30 Z" fill="currentColor" fill-opacity="0.2" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
              </div>
              <h3 class="math-tile-name">正方体</h3>
            </div>

            <!-- Regular Tetrahedron -->
            <div class="math-branch-tile math-model-card" data-model="tetrahedron" role="button" tabindex="0" title="正四面体">
              <div class="math-tile-icon-box">
                <svg class="math-tile-svg" viewBox="0 0 44 44" width="50" height="50" fill="none" stroke="currentColor">
                  <polygon points="22,6 38,36 6,36" fill="currentColor" fill-opacity="0.12" stroke-width="1.8" stroke-linejoin="round"/>
                  <line x1="22" y1="6" x2="22" y2="36" stroke-width="1.8" stroke-linecap="round"/>
                  <line x1="22" y1="6" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
                  <line x1="6" y1="36" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
                  <line x1="38" y1="36" x2="25" y2="26" stroke-width="1.4" stroke-dasharray="3 2"/>
                </svg>
              </div>
              <h3 class="math-tile-name">正四面体</h3>
            </div>

            <!-- Square Pyramid -->
            <div class="math-branch-tile math-model-card" data-model="square-pyramid" role="button" tabindex="0" title="四棱锥">
              <div class="math-tile-icon-box">
                <svg class="math-tile-svg" viewBox="0 0 44 44" width="50" height="50" fill="none" stroke="currentColor">
                  <path d="M22 6 L6 30 L26 38 L38 26 Z" fill="currentColor" fill-opacity="0.12" stroke-width="1.8" stroke-linejoin="round"/>
                  <line x1="22" y1="6" x2="6" y2="30" stroke-width="1.8"/>
                  <line x1="22" y1="6" x2="26" y2="38" stroke-width="1.8"/>
                  <line x1="22" y1="6" x2="38" y2="26" stroke-width="1.8"/>
                  <line x1="6" y1="30" x2="26" y2="38" stroke-width="1.8"/>
                  <line x1="26" y1="38" x2="38" y2="26" stroke-width="1.8"/>
                  <line x1="6" y1="30" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
                  <line x1="38" y1="26" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
                  <line x1="22" y1="6" x2="18" y2="18" stroke-width="1.4" stroke-dasharray="3 2"/>
                </svg>
              </div>
              <h3 class="math-tile-name">四棱锥</h3>
            </div>

            <!-- Triangular Prism -->
            <div class="math-branch-tile math-model-card" data-model="triangular-prism" role="button" tabindex="0" title="三棱柱">
              <div class="math-tile-icon-box">
                <svg class="math-tile-svg" viewBox="0 0 44 44" width="50" height="50" fill="none" stroke="currentColor">
                  <polygon points="10,8 34,8 22,16" fill="currentColor" fill-opacity="0.16" stroke-width="1.8" stroke-linejoin="round"/>
                  <polygon points="10,26 34,26 22,34" fill="currentColor" fill-opacity="0.08" stroke-width="1.8" stroke-linejoin="round"/>
                  <line x1="10" y1="8" x2="10" y2="26" stroke-width="1.8"/>
                  <line x1="34" y1="8" x2="34" y2="26" stroke-width="1.8"/>
                  <line x1="22" y1="16" x2="22" y2="34" stroke-width="1.8"/>
                </svg>
              </div>
              <h3 class="math-tile-name">三棱柱</h3>
            </div>
          </div>
        </div>

        <!-- Hidden preservation elements for telemetry and status contract -->
        <div style="display: none;">
          <span id="math-scan-status"></span>
          <span id="math-euler-badge"></span>
          <span id="val-dim-a">0.58</span>
          <input type="range" id="slider-dim-a" value="0.58" />
          <span id="val-dim-h">0.58</span>
          <input type="range" id="slider-dim-h" value="0.58" />
        </div>
      </div>
    `;

    this.cacheDOMElements();
    this.bindEvents();
  }

  private cacheDOMElements(): void {
    this.scanBarEl = this.element.querySelector('#math-scan-bar');
    this.scanStatusEl = this.element.querySelector('#math-scan-status');
    this.uploadBtn = this.element.querySelector('#btn-math-upload') as HTMLButtonElement | null;
    this.cameraBtn = this.element.querySelector('#btn-math-camera') as HTMLButtonElement | null;
    this.dropzoneEl = this.uploadBtn;
  }

  private bindEvents(): void {
    // 1. 4 种模型的卡片选择切换
    this.element.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.math-model-card') as HTMLElement;
      if (!btn) return;
      const model = btn.getAttribute('data-model') as HighSchoolModelType;
      if (!model) return;

      this.element.querySelectorAll('.math-model-card').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      this.callbacks.onModelChange?.(model);
      this.callbacks.onClearSegments?.();
    });

    const fileInput = this.element.querySelector('#math-scan-file') as HTMLInputElement | null;
    const cameraInput = this.element.querySelector('#math-scan-camera') as HTMLInputElement | null;
    const takeFile = (input: HTMLInputElement | null) => {
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (!file) return;
      if (file.type && !file.type.startsWith('image/')) {
        this.setScanStatus('请上传图片');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') void this.handleImage(reader.result);
        else this.setScanStatus('解析失败');
      };
      reader.onerror = () => this.setScanStatus('解析失败');
      reader.readAsDataURL(file);
    };

    fileInput?.addEventListener('change', () => takeFile(fileInput));
    cameraInput?.addEventListener('change', () => takeFile(cameraInput));
    this.uploadBtn?.addEventListener('click', () => fileInput?.click());
    this.cameraBtn?.addEventListener('click', () => {
      void this.openCamera(cameraInput);
    });

    // 拖拽文件至卡片或上传按钮
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadBtn?.classList.add('is-dragover');
    });
    this.element.addEventListener('dragleave', (e) => {
      if (!this.element.contains(e.relatedTarget as Node)) {
        this.uploadBtn?.classList.remove('is-dragover');
      }
    });
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadBtn?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type && !file.type.startsWith('image/')) {
        this.setScanStatus('请上传图片');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') void this.handleImage(reader.result);
        else this.setScanStatus('解析失败');
      };
      reader.onerror = () => this.setScanStatus('解析失败');
      reader.readAsDataURL(file);
    });
  }

  private setScanStatus(text: string): void {
    if (this.scanStatusEl && this.scanStatusEl.textContent !== text) {
      this.scanStatusEl.textContent = text;
    }
    const labelEl = this.uploadBtn?.querySelector('.apple-btn-label');
    if (labelEl && text) {
      labelEl.textContent = text;
      if (text.startsWith('已构建') || text.includes('失败')) {
        setTimeout(() => {
          if (labelEl.textContent === text) {
            labelEl.textContent = '上传题目';
          }
        }, 2500);
      }
    }
  }

  private setScanBusy(busy: boolean): void {
    this.recognizing = busy;
    this.scanBarEl?.classList.toggle('is-busy', busy);
    this.uploadBtn?.classList.toggle('is-busy', busy);
    if (this.uploadBtn) this.uploadBtn.disabled = busy;
    if (this.cameraBtn) this.cameraBtn.disabled = busy;
    const labelEl = this.uploadBtn?.querySelector('.apple-btn-label');
    if (labelEl && busy) {
      labelEl.textContent = '正在识别…';
    }
  }

  private clearPresetSelection(): void {
    this.element.querySelectorAll('.math-model-card').forEach((card) => card.classList.remove('active'));
  }

  private async openCamera(fallback: HTMLInputElement | null): Promise<void> {
    if (this.recognizing) return;
    const shot = await captureProblemPhoto();
    if (shot.ok) {
      await this.handleImage(shot.dataUrl);
      return;
    }
    if (shot.reason === 'unavailable') fallback?.click();
  }

  private async handleImage(dataUrl: string): Promise<void> {
    if (this.recognizing) return;
    if (!this.callbacks.onRecognizeImage) {
      this.setScanStatus('识图服务未连接');
      return;
    }
    this.setScanBusy(true);
    this.setScanStatus('正在识别…');
    const started = performance.now();
    try {
      const result = await this.callbacks.onRecognizeImage(dataUrl);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      this.clearPresetSelection();
      this.setScanStatus(`已构建「${result.name}」· ${seconds} 秒`);
    } catch (error) {
      this.setScanStatus(error instanceof Error ? error.message : '识图失败');
    } finally {
      this.setScanBusy(false);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  /**
   * 将遥测状态同步至空间视窗卡片。
   * 保持当前高亮选中的模型卡片与底层模型同步。
   */
  public updateTelemetry(data: StereometryTelemetryData): void {
    if (!this.isVisible) return;

    if (data.modelId) {
      const activeCard = this.element.querySelector(`.math-model-card[data-model="${data.modelId}"]`);
      if (activeCard && !activeCard.classList.contains('active')) {
        this.element.querySelectorAll('.math-model-card').forEach((card) => card.classList.remove('active'));
        activeCard.classList.add('active');
      }
    }

    if (data.vertexCount !== undefined && data.edgeCount !== undefined && data.faceCount !== undefined) {
      const eulerEl = this.element.querySelector('#math-euler-badge');
      if (eulerEl) {
        eulerEl.textContent = `V: ${data.vertexCount} · E: ${data.edgeCount} · F: ${data.faceCount}`;
      }
    }
  }

  public dispose(): void {
    this.element.remove();
  }
}
