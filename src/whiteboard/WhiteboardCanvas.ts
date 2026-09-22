import type { Point, Stroke, WhiteboardPage, WhiteboardTool, WhiteboardTheme, WhiteboardOptions } from './types';

export class WhiteboardCanvas {
  public element: HTMLDivElement;
  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private pages: WhiteboardPage[] = [];
  private currentPageIndex = 0;

  private currentTool: WhiteboardTool = 'pen';
  private currentColor = '#1c1c1e';
  private currentWidth = 4;
  private currentTheme: WhiteboardTheme = 'plain';

  private isDrawing = false;
  private currentStroke: Stroke | null = null;
  private currentPoints: Point[] = [];

  private dpr = 1;
  private callbacks: WhiteboardOptions;

  constructor(parent: HTMLElement, options: WhiteboardOptions = {}) {
    this.callbacks = options;
    if (options.initialTheme) this.currentTheme = options.initialTheme;
    if (options.defaultColor) this.currentColor = options.defaultColor;
    if (options.defaultWidth) this.currentWidth = options.defaultWidth;

    this.initDOM(parent);
    this.initPages();
    this.setupEvents();
    this.resize();
  }

  private initDOM(parent: HTMLElement): void {
    this.element = document.createElement('div');
    this.element.className = `whiteboard-canvas-layer theme-${this.currentTheme}`;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // Ultra-low latency Apple pencil style rendering
    })!;

    this.element.appendChild(this.canvas);
    parent.appendChild(this.element);
  }

  private initPages(): void {
    const firstPage: WhiteboardPage = {
      id: 'page-1',
      strokes: [],
      undoStack: [],
      redoStack: [],
      createdAt: Date.now(),
    };
    this.pages.push(firstPage);
    this.currentPageIndex = 0;
  }

  public resize(): void {
    const rect = this.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Crisp on high-DPI Retina
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);

    this.redrawCurrentPage();
  }

  private setupEvents(): void {
    window.addEventListener('resize', () => this.resize());

    // Pointer events support mouse, touch, and Apple Pencil / Stylus
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointerleave', this.onPointerUp.bind(this));
  }

  private getCanvasPoint(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * this.dpr,
      y: (e.clientY - rect.top) * this.dpr,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.isDrawing = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if capture fails
    }

    const point = this.getCanvasPoint(e);
    this.currentPoints = [point];

    const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentStroke = {
      id: strokeId,
      tool: this.currentTool,
      color: this.currentColor,
      width: this.currentWidth * this.dpr,
      opacity: 1,
      points: [point],
    };

    // Draw initial dot
    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.currentTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = this.currentWidth * 3 * this.dpr;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.currentWidth * this.dpr;
    }

    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, (this.currentStroke.width || 2) / 2, 0, Math.PI * 2);
    if (this.currentTool === 'eraser') {
      this.ctx.fill();
    } else {
      this.ctx.fillStyle = this.currentColor;
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDrawing || !this.currentStroke) return;

    const events = typeof (e as any).getCoalescedEvents === 'function' ? (e as any).getCoalescedEvents() : [e];

    for (const ev of events) {
      const point = this.getCanvasPoint(ev);
      this.currentPoints.push(point);
      this.currentStroke.points.push(point);

      if (this.currentPoints.length < 3) {
        continue;
      }

      // Quadratic Bézier curve smoothing between midpoints
      const len = this.currentPoints.length;
      const p0 = this.currentPoints[len - 3];
      const p1 = this.currentPoints[len - 2];
      const p2 = this.currentPoints[len - 1];

      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      if (this.currentTool === 'eraser') {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.lineWidth = this.currentWidth * 3.5 * this.dpr;
      } else {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentWidth * this.dpr;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(mid1.x, mid1.y);
      this.ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }


  private onPointerUp(e: PointerEvent): void {
    if (!this.isDrawing || !this.currentStroke) return;

    this.isDrawing = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (this.currentStroke.points.length > 0) {
      const page = this.getCurrentPage();
      // Push snapshot to undo stack
      page.undoStack.push([...page.strokes]);
      page.redoStack = []; // Clear redo stack on new action
      page.strokes.push(this.currentStroke);
    }

    this.currentStroke = null;
    this.currentPoints = [];
  }

  public redrawCurrentPage(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const page = this.getCurrentPage();
    if (!page) return;

    for (const stroke of page.strokes) {
      this.drawStroke(stroke);
    }
  }

  private drawStroke(stroke: Stroke): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = stroke.width * 3;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
      this.ctx.fillStyle = stroke.color;
      this.ctx.lineWidth = stroke.width;
    }

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const p1 = stroke.points[i];
      const p2 = stroke.points[i + 1];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      this.ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
    }

    // Connect last segment
    const last = stroke.points[stroke.points.length - 1];
    this.ctx.lineTo(last.x, last.y);
    this.ctx.stroke();

    this.ctx.restore();
  }

  // ==========================================
  // Multi-Page Pagination API
  // ==========================================
  public getCurrentPage(): WhiteboardPage {
    return this.pages[this.currentPageIndex];
  }

  public getCurrentPageIndex(): number {
    return this.currentPageIndex;
  }

  public getTotalPages(): number {
    return this.pages.length;
  }

  public nextPage(): boolean {
    if (this.currentPageIndex < this.pages.length - 1) {
      this.currentPageIndex++;
      this.redrawCurrentPage();
      this.notifyPageChange();
      return true;
    }
    return false;
  }

  public prevPage(): boolean {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.redrawCurrentPage();
      this.notifyPageChange();
      return true;
    }
    return false;
  }

  public addPage(): number {
    const newPage: WhiteboardPage = {
      id: `page-${this.pages.length + 1}`,
      strokes: [],
      undoStack: [],
      redoStack: [],
      createdAt: Date.now(),
    };
    this.pages.push(newPage);
    this.currentPageIndex = this.pages.length - 1;
    this.redrawCurrentPage();
    this.notifyPageChange();
    return this.currentPageIndex;
  }

  public deleteCurrentPage(): boolean {
    if (this.pages.length <= 1) {
      this.clearCurrentPage();
      return false;
    }
    this.pages.splice(this.currentPageIndex, 1);
    if (this.currentPageIndex >= this.pages.length) {
      this.currentPageIndex = this.pages.length - 1;
    }
    this.redrawCurrentPage();
    this.notifyPageChange();
    return true;
  }

  public clearCurrentPage(): void {
    const page = this.getCurrentPage();
    if (page.strokes.length > 0) {
      page.undoStack.push([...page.strokes]);
      page.redoStack = [];
      page.strokes = [];
      this.redrawCurrentPage();
    }
  }

  public undo(): boolean {
    const page = this.getCurrentPage();
    if (page.undoStack.length === 0) return false;

    const previousState = page.undoStack.pop()!;
    page.redoStack.push([...page.strokes]);
    page.strokes = previousState;
    this.redrawCurrentPage();
    return true;
  }

  public redo(): boolean {
    const page = this.getCurrentPage();
    if (page.redoStack.length === 0) return false;

    const nextState = page.redoStack.pop()!;
    page.undoStack.push([...page.strokes]);
    page.strokes = nextState;
    this.redrawCurrentPage();
    return true;
  }

  private notifyPageChange(): void {
    this.callbacks.onPageChange?.(this.currentPageIndex + 1, this.pages.length);
  }

  // ==========================================
  // Tool & Appearance Configuration
  // ==========================================
  public setTool(tool: WhiteboardTool): void {
    this.currentTool = tool;
    this.callbacks.onToolChange?.(tool);
  }

  public getTool(): WhiteboardTool {
    return this.currentTool;
  }

  public setColor(color: string): void {
    this.currentColor = color;
    this.callbacks.onColorChange?.(color);
  }

  public getColor(): string {
    return this.currentColor;
  }

  public setWidth(width: number): void {
    this.currentWidth = width;
    this.callbacks.onWidthChange?.(width);
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public setTheme(theme: WhiteboardTheme): void {
    this.currentTheme = theme;
    this.element.className = `whiteboard-canvas-layer theme-${theme}`;
    // If switching to dark or chalkboard, adjust default dark pen if needed
    if ((theme === 'chalkboard' || theme === 'dark') && (this.currentColor === '#1c1c1e' || this.currentColor === '#000000')) {
      this.setColor('#ffffff');
    } else if (theme === 'plain' && this.currentColor === '#ffffff') {
      this.setColor('#1c1c1e');
    }
  }

  public getTheme(): WhiteboardTheme {
    return this.currentTheme;
  }

  // ==========================================
  // Export High-Res Image Handout
  // ==========================================
  public exportToImage(): string {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.canvas.width;
    exportCanvas.height = this.canvas.height;
    const expCtx = exportCanvas.getContext('2d')!;

    // Fill background color according to theme
    let bgColor = '#fbfbfd';
    if (this.currentTheme === 'chalkboard') bgColor = '#173826';
    else if (this.currentTheme === 'dark') bgColor = '#111216';
    else if (this.currentTheme === 'grid') bgColor = '#f6f7fa';

    expCtx.fillStyle = bgColor;
    expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // If grid theme, draw subtle grid lines
    if (this.currentTheme === 'grid') {
      expCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      expCtx.lineWidth = 1;
      const step = 24 * this.dpr;
      for (let x = 0; x < exportCanvas.width; x += step) {
        expCtx.beginPath();
        expCtx.moveTo(x, 0);
        expCtx.lineTo(x, exportCanvas.height);
        expCtx.stroke();
      }
      for (let y = 0; y < exportCanvas.height; y += step) {
        expCtx.beginPath();
        expCtx.moveTo(0, y);
        expCtx.lineTo(exportCanvas.width, y);
        expCtx.stroke();
      }
    }

    // Draw strokes
    expCtx.drawImage(this.canvas, 0, 0);

    return exportCanvas.toDataURL('image/png');
  }

  public downloadCurrentPage(fileName?: string): void {
    const dataUrl = this.exportToImage();
    const name = fileName || `全息教辅讲义_第${this.currentPageIndex + 1}页_${Date.now()}.png`;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
