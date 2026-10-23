export class Crosshair {
  private element: HTMLElement;
  private ringEl: HTMLElement;
  private tooltipEl: HTMLElement;

  private isHovered = false;
  private isVisible = true;
  private readonly touchMode: boolean;

  constructor(parent: HTMLElement = document.body, touchMode = false) {
    this.touchMode = touchMode;
    this.createElements(parent);
  }

  private createElements(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.id = 'vision-crosshair';
    this.element.innerHTML = `
      <div class="crosshair-ring"></div>
      <div class="crosshair-tooltip"></div>
    `;

    this.ringEl = this.element.querySelector('.crosshair-ring') as HTMLElement;
    this.tooltipEl = this.element.querySelector('.crosshair-tooltip') as HTMLElement;

    // Apply before mounting so the reticle never flashes on iPad at startup.
    this.setVisible(!this.touchMode);
    parent.appendChild(this.element);
  }

  public setHovered(hovered: boolean, label = '✦ 点击开启 VisionOS 实验视窗'): void {
    if (this.touchMode) return;
    if (this.isHovered === hovered && (!hovered || this.tooltipEl.textContent === label)) return;
    this.isHovered = hovered;

    if (hovered && label && label.trim().length > 0) {
      this.element.classList.add('hovered');
      this.tooltipEl.textContent = label;
      this.tooltipEl.classList.add('visible');
    } else {
      this.element.classList.remove('hovered');
      this.tooltipEl.classList.remove('visible');
    }
  }

  public setVisible(visible: boolean): void {
    visible = visible && !this.touchMode;
    if (this.isVisible === visible) return;
    this.isVisible = visible;

    if (!this.element) return;
    if (visible) {
      this.element.classList.remove('hidden');
    } else {
      this.element.classList.add('hidden');
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

