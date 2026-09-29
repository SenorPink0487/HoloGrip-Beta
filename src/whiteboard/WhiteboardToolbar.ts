import type { WhiteboardCanvas } from './WhiteboardCanvas.ts';
import type { WhiteboardTool } from './types.ts';
import { AppleColorPicker } from './AppleColorPicker.ts';
import { isTextInputActive } from '../core/focus.ts';

export class WhiteboardToolbar {
  public element: HTMLDivElement;
  private canvas: WhiteboardCanvas;
  public colorPicker: AppleColorPicker;

  private activeColor = '#1c1c1e';
  private activeWidth = 4;
  private activeTool: WhiteboardTool = 'pen';

  private pageIndicatorEl: HTMLSpanElement;
  private prevPageBtn: HTMLButtonElement;
  private nextPageBtn: HTMLButtonElement;
  private colorButtons: HTMLButtonElement[] = [];
  private thicknessButtons: HTMLButtonElement[] = [];
  private penBtn: HTMLButtonElement;
  private eraserBtn: HTMLButtonElement;

  private readonly PRESET_COLORS = [
    { label: '深空黑', value: '#1c1c1e' },
    { label: '经典蓝', value: '#0071e3' },
    { label: '标注红', value: '#ff3b30' },
    { label: '公式绿', value: '#34c759' },
    { label: '重点橙', value: '#ff9500' },
  ];

  private readonly PRESET_WIDTHS = [
    { label: '极细 (2px)', value: 2, dotSize: 4 },
    { label: '标准 (4px)', value: 4, dotSize: 7 },
    { label: '粗线 (8px)', value: 8, dotSize: 10 },
    { label: '马克笔 (14px)', value: 14, dotSize: 14 },
  ];

  constructor(canvas: WhiteboardCanvas, parent: HTMLElement) {
    this.canvas = canvas;
    this.activeColor = canvas.getColor();
    this.activeWidth = canvas.getWidth();
    this.activeTool = canvas.getTool();

    this.colorPicker = new AppleColorPicker(document.body, {
      onChange: (color) => {
        this.selectColor(color);
      },
    });

    this.initUI(parent);
    this.bindEvents();
    this.updatePaginationUI();
  }

  private initUI(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = 'whiteboard-left-sidebar';
    this.element.id = 'whiteboard-left-toolbar';

    // 1. 工具分段控制器（画笔与橡皮擦并排）
    const toolRow = document.createElement('div');
    toolRow.className = 'tool-segmented-row';

    this.penBtn = document.createElement('button');
    this.penBtn.className = `tool-segment-btn ${this.activeTool === 'pen' ? 'active' : ''}`;
    this.penBtn.title = '画笔 (P)';
    this.penBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
      </svg>
    `;

    this.eraserBtn = document.createElement('button');
    this.eraserBtn.className = `tool-segment-btn ${this.activeTool === 'eraser' ? 'active' : ''}`;
    this.eraserBtn.title = '橡皮擦 (E)';
    this.eraserBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
        <path d="M22 21H7"/>
        <path d="m5 11 9 9"/>
      </svg>
    `;

    toolRow.appendChild(this.penBtn);
    toolRow.appendChild(this.eraserBtn);

    // 分隔线
    const div1 = document.createElement('div');
    div1.className = 'whiteboard-sidebar-divider';

    // 2. 紧凑双列调色板
    const colorGrid = document.createElement('div');
    colorGrid.className = 'palette-grid';

    this.PRESET_COLORS.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `color-dot-btn ${this.activeColor === item.value ? 'active' : ''}`;
      btn.style.backgroundColor = item.value;
      btn.style.setProperty('--active-color', item.value);
      btn.title = item.label;
      btn.dataset.color = item.value;
      this.colorButtons.push(btn);
      colorGrid.appendChild(btn);
    });

    // 自定义仿 Apple 取色器触发按钮（非原生 input）
    const customPickerBtn = document.createElement('button');
    customPickerBtn.className = 'custom-color-dot-wrapper';
    customPickerBtn.title = '更多自定义颜色 (调色板)';
    customPickerBtn.innerHTML = `<div class="custom-color-dot-bg"></div>`;
    customPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.colorPicker.toggle(this.activeColor);
    });
    colorGrid.appendChild(customPickerBtn);

    // 分隔线
    const div2 = document.createElement('div');
    div2.className = 'whiteboard-sidebar-divider';

    // 3. 水平笔画粗细调节器
    const thicknessRow = document.createElement('div');
    thicknessRow.className = 'thickness-row';

    this.PRESET_WIDTHS.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `thickness-seg-btn ${this.activeWidth === item.value ? 'active' : ''}`;
      btn.title = item.label;
      btn.dataset.width = item.value.toString();

      const dot = document.createElement('div');
      dot.className = 'thickness-dot';
      dot.style.width = `${item.dotSize}px`;
      dot.style.height = `${item.dotSize}px`;

      btn.appendChild(dot);
      this.thicknessButtons.push(btn);
      thicknessRow.appendChild(btn);
    });

    // 分隔线
    const div3 = document.createElement('div');
    div3.className = 'whiteboard-sidebar-divider';

    // 4. 紧凑分页控制栏：[ ‹ ] 1/1 [ › ]
    const paginationRow = document.createElement('div');
    paginationRow.className = 'pagination-stepper-row';

    this.prevPageBtn = document.createElement('button');
    this.prevPageBtn.className = 'page-arrow-btn';
    this.prevPageBtn.title = '上一页 (←)';
    this.prevPageBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    `;

    this.pageIndicatorEl = document.createElement('span');
    this.pageIndicatorEl.className = 'page-counter-label';
    this.pageIndicatorEl.innerHTML = `<span class="page-counter-current">1</span>/1`;

    this.nextPageBtn = document.createElement('button');
    this.nextPageBtn.className = 'page-arrow-btn';
    this.nextPageBtn.title = '下一页 (→)';
    this.nextPageBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;

    paginationRow.appendChild(this.prevPageBtn);
    paginationRow.appendChild(this.pageIndicatorEl);
    paginationRow.appendChild(this.nextPageBtn);

    // 5. 迷你操作快捷栏：[ + 新建 ] [ ↺ 撤销 ] [ 清屏 ]
    const subActionsRow = document.createElement('div');
    subActionsRow.className = 'sub-actions-row';

    const addBtn = document.createElement('button');
    addBtn.className = 'mini-action-btn';
    addBtn.title = '新建页面';
    addBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    `;
    addBtn.addEventListener('click', () => {
      this.canvas.addPage();
      this.updatePaginationUI();
    });

    const undoBtn = document.createElement('button');
    undoBtn.className = 'mini-action-btn';
    undoBtn.title = '撤销 (Ctrl+Z)';
    undoBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7v6h6"/>
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
      </svg>
    `;
    undoBtn.addEventListener('click', () => {
      this.canvas.undo();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'mini-action-btn';
    clearBtn.title = '清屏';
    clearBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    `;
    clearBtn.addEventListener('click', () => {
      this.canvas.clearCurrentPage();
    });

    subActionsRow.appendChild(addBtn);
    subActionsRow.appendChild(undoBtn);
    subActionsRow.appendChild(clearBtn);

    // 组装左侧工具栏
    this.element.appendChild(toolRow);
    this.element.appendChild(div1);
    this.element.appendChild(colorGrid);
    this.element.appendChild(div2);
    this.element.appendChild(thicknessRow);
    this.element.appendChild(div3);
    this.element.appendChild(paginationRow);
    this.element.appendChild(subActionsRow);

    parent.appendChild(this.element);

  }


  private bindEvents(): void {
    // 工具切换按钮事件绑定
    this.penBtn.addEventListener('click', () => {
      this.selectTool('pen');
    });

    this.eraserBtn.addEventListener('click', () => {
      this.selectTool('eraser');
    });

    // 预设颜色按钮事件绑定
    this.colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (color) {
          this.selectColor(color);
        }
      });
    });

    // 预设粗细按钮事件绑定
    this.thicknessButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const width = Number(btn.dataset.width);
        if (width) {
          this.selectWidth(width);
        }
      });
    });

    // 分页按钮事件绑定
    this.prevPageBtn.addEventListener('click', () => {
      this.canvas.prevPage();
      this.updatePaginationUI();
    });

    this.nextPageBtn.addEventListener('click', () => {
      this.canvas.nextPage();
      this.updatePaginationUI();
    });

    // 键盘快捷键监听
    window.addEventListener('keydown', (e) => {
      if (this.element.closest('.hidden-view')) return;
      if (isTextInputActive()) return;

      if (e.key === 'p' || e.key === 'P') {
        this.selectTool('pen');
      } else if (e.key === 'e' || e.key === 'E') {
        this.selectTool('eraser');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          this.canvas.redo();
        } else {
          this.canvas.undo();
        }
      }
    });
  }

  public selectTool(tool: WhiteboardTool): void {
    this.activeTool = tool;
    this.canvas.setTool(tool);

    this.penBtn.classList.toggle('active', tool === 'pen');
    this.eraserBtn.classList.toggle('active', tool === 'eraser');
  }

  public selectColor(color: string): void {
    this.activeColor = color;
    this.canvas.setColor(color);
    if (this.activeTool !== 'pen') {
      this.selectTool('pen');
    }

    this.colorButtons.forEach((btn) => {
      const match = btn.dataset.color === color;
      btn.classList.toggle('active', match);
      if (match) {
        btn.style.setProperty('--active-color', color);
      }
    });
  }

  public selectWidth(width: number): void {
    this.activeWidth = width;
    this.canvas.setWidth(width);

    this.thicknessButtons.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.width) === width);
    });
  }

  public updatePaginationUI(): void {
    const cur = this.canvas.getCurrentPageIndex() + 1;
    const total = this.canvas.getTotalPages();

    this.pageIndicatorEl.innerHTML = `<span class="page-counter-current">${cur}</span>/${total}`;
    this.prevPageBtn.disabled = cur <= 1;
    this.nextPageBtn.disabled = cur >= total;
  }
}
