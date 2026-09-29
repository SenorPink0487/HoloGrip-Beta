import { bindVisionSlider } from '../ui/vision/sliderGestureHelper.ts';

export interface ColorPickerCallbacks {
  onChange: (color: string) => void;
  onClose?: () => void;
}

export class AppleColorPicker {
  public element: HTMLDivElement;
  private isOpen = false;
  private currentColor = '#0071e3';
  private hue = 210;
  private saturation = 100;
  private lightness = 45;

  private previewDot: HTMLDivElement;
  private hexLabel: HTMLSpanElement;
  private hueSlider: HTMLInputElement;
  private lightSlider: HTMLInputElement;
  private swatchButtons: HTMLButtonElement[] = [];
  private callbacks: ColorPickerCallbacks;

  private readonly SWATCHES = [
    '#1c1c1e', '#48484a', '#8e8e93', '#d1d1d6', '#ffffff', '#ff3b30',
    '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#0071e3',
    '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#85583b', '#64d2ff'
  ];

  constructor(parent: HTMLElement = document.body, callbacks: ColorPickerCallbacks) {
    this.callbacks = callbacks;
    this.initUI(parent);
    this.bindEvents();
  }

  private initUI(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = 'apple-color-popover';
    this.element.id = 'apple-custom-color-popover';

    this.element.innerHTML = `
      <!-- Header -->
      <div class="color-popover-header">
        <div class="color-popover-title-row">
          <span class="color-popover-title">调色板</span>
          <div class="color-preview-chip">
            <div class="color-preview-dot" id="popover-color-preview"></div>
            <span class="color-hex-text" id="popover-hex-text">#0071E3</span>
          </div>
        </div>
        <button class="color-popover-close-btn" id="popover-close-btn" title="关闭">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Apple Preset Swatches (18 colors) -->
      <div class="color-swatch-grid" id="popover-swatch-grid"></div>

      <!-- Hue Rainbow Slider -->
      <div class="slider-control-group">
        <label class="slider-label">色相 (Hue)</label>
        <div class="slider-track-wrapper hue-wrapper">
          <input type="range" class="apple-range-slider hue-slider" id="popover-hue-slider" min="0" max="360" value="210" />
        </div>
      </div>

      <!-- Brightness / Lightness Slider -->
      <div class="slider-control-group">
        <label class="slider-label">明暗 (Lightness)</label>
        <div class="slider-track-wrapper light-wrapper">
          <input type="range" class="apple-range-slider light-slider" id="popover-light-slider" min="10" max="90" value="45" />
        </div>
      </div>
    `;

    // 填充色块预设按钮
    const swatchGrid = this.element.querySelector('#popover-swatch-grid') as HTMLElement;
    this.SWATCHES.forEach((hex) => {
      const btn = document.createElement('button');
      btn.className = 'popover-swatch-btn';
      btn.style.backgroundColor = hex;
      btn.dataset.color = hex;
      btn.title = hex;
      this.swatchButtons.push(btn);
      swatchGrid.appendChild(btn);
    });

    this.previewDot = this.element.querySelector('#popover-color-preview') as HTMLDivElement;
    this.hexLabel = this.element.querySelector('#popover-hex-text') as HTMLSpanElement;
    this.hueSlider = this.element.querySelector('#popover-hue-slider') as HTMLInputElement;
    this.lightSlider = this.element.querySelector('#popover-light-slider') as HTMLInputElement;

    parent.appendChild(this.element);
  }

  private bindEvents(): void {
    // 色块预设按钮事件
    this.swatchButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (color) {
          this.setColor(color, true);
        }
      });
    });

    // 色相滑块
    bindVisionSlider(this.hueSlider, (val) => {
      this.hue = val;
      this.updateColorFromHSL();
    });

    // 亮度滑块
    bindVisionSlider(this.lightSlider, (val) => {
      this.lightness = val;
      this.updateColorFromHSL();
    });

    // 关闭按钮
    this.element.querySelector('#popover-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // 点击外部区域自动关闭
    document.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      const target = e.target as HTMLElement;
      if (!this.element.contains(target) && !target.closest('.custom-color-dot-wrapper')) {
        this.close();
      }
    });

    // ESC 键关闭
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  private updateColorFromHSL(): void {
    const hex = this.hslToHex(this.hue, this.saturation, this.lightness);
    this.setColor(hex, true);
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  public setColor(hex: string, notify = false): void {
    this.currentColor = hex;
    this.previewDot.style.backgroundColor = hex;
    this.hexLabel.textContent = hex.toUpperCase();

    // 更新当前激活色块的外环指示器
    this.swatchButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.color?.toLowerCase() === hex.toLowerCase());
    });

    // 更新亮度滑块背景渐变色
    const pureHueColor = this.hslToHex(this.hue, 100, 50);
    this.lightSlider.style.setProperty('--current-hue', pureHueColor);

    if (notify) {
      this.callbacks.onChange(hex);
    }
  }

  public open(currentColor?: string): void {
    if (currentColor) {
      this.setColor(currentColor, false);
    }
    this.isOpen = true;
    this.element.classList.add('open');
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove('open');
    this.callbacks.onClose?.();
  }

  public toggle(currentColor?: string): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(currentColor);
    }
  }

  public get visible(): boolean {
    return this.isOpen;
  }
}
