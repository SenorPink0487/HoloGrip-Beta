export interface WhiteboardDockCallbacks {
  onEnterLab: () => void;
  onReturnWhiteboard: () => void;
  onOpenAccount: () => void;
}

export type DockViewMode = 'whiteboard' | 'laboratory';

export class WhiteboardDock {
  public element: HTMLDivElement;
  private labBtn: HTMLButtonElement;
  private accountBtn: HTMLButtonElement;
  private currentMode: DockViewMode = 'whiteboard';
  private callbacks: WhiteboardDockCallbacks;

  constructor(parent: HTMLElement, callbacks: WhiteboardDockCallbacks) {
    this.callbacks = callbacks;
    this.initUI(parent);
  }

  private initUI(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = 'apple-dock-container';
    this.element.id = 'whiteboard-bottom-dock';

    // 1. 进入 3D 实验室按钮（纯图标设计）
    this.labBtn = document.createElement('button');
    this.labBtn.className = 'apple-dock-icon-btn btn-lab-enter';
    this.labBtn.id = 'dock-btn-lab-toggle';
    this.updateLabButtonContent();

    this.labBtn.addEventListener('click', () => {
      if (this.currentMode === 'whiteboard') {
        this.callbacks.onEnterLab();
      } else {
        this.callbacks.onReturnWhiteboard();
      }
    });

    // 细分隔线
    const divider = document.createElement('div');
    divider.className = 'apple-dock-divider';

    // 2. 打开账户面板按钮（纯图标设计）
    this.accountBtn = document.createElement('button');
    this.accountBtn.className = 'apple-dock-icon-btn btn-account';
    this.accountBtn.id = 'dock-btn-account-open';
    this.accountBtn.title = '账户中心';
    this.accountBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4"/>
        <path d="M6 20v-1a6 6 0 0 1 12 0v1"/>
      </svg>
    `;

    this.accountBtn.addEventListener('click', () => {
      this.callbacks.onOpenAccount();
    });

    this.element.appendChild(this.labBtn);
    this.element.appendChild(divider);
    this.element.appendChild(this.accountBtn);

    parent.appendChild(this.element);
  }

  private updateLabButtonContent(): void {
    if (this.currentMode === 'whiteboard') {
      this.element.classList.remove('in-lab-environment');
      this.labBtn.classList.remove('in-lab-mode');
      this.labBtn.title = '进入实验室';
      this.labBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2v7.31L4.62 18.24A2 2 0 0 0 6.36 21h11.28a2 2 0 0 0 1.74-2.76L14 9.31V2"/>
          <line x1="8.5" y1="2" x2="15.5" y2="2"/>
          <line x1="7" y1="14" x2="17" y2="14"/>
        </svg>
      `;
    } else {
      this.element.classList.add('in-lab-environment');
      this.labBtn.classList.add('in-lab-mode');
      this.labBtn.title = '返回白板';
      this.labBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4"/>
          <path d="M8 12h8"/>
          <path d="M12 8v8"/>
        </svg>
      `;
    }
  }

  public setMode(mode: DockViewMode): void {
    this.currentMode = mode;
    this.updateLabButtonContent();
    if (mode === 'laboratory') {
      this.element.style.display = 'none';
    } else {
      this.element.style.display = '';
    }
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  public getMode(): DockViewMode {
    return this.currentMode;
  }
}
