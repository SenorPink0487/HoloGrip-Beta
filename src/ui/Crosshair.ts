export class Crosshair {
  private element: HTMLElement;
  private ringEl: HTMLElement;
  private tooltipEl: HTMLElement;

  private isHovered = false;
  private isVisible = true;

  constructor(parent: HTMLElement = document.body) {
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

    parent.appendChild(this.element);
  }

  public setHovered(hovered: boolean, label = '✦ 点击开启 VisionOS 实验视窗'): void {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;

    if (hovered) {
      this.element.classList.add('hovered');
      this.tooltipEl.textContent = label;
      this.tooltipEl.classList.add('visible');
    } else {
      this.element.classList.remove('hovered');
      this.tooltipEl.classList.remove('visible');
    }
  }

  public setVisible(visible: boolean): void {
    if (this.isVisible === visible) return;
    this.isVisible = visible;

    if (visible) {
      this.element.classList.remove('hidden');
    } else {
      this.element.classList.add('hidden');
    }
  }

  public destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
