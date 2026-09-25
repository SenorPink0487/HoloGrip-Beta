import { newBoardId } from './id.ts';
import { StrokeStream, type BoardCommand, type BoardEvent, type BoardState, type ActiveStroke } from './collaboration.ts';
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

  private sendCommand: ((command: BoardCommand) => boolean) | null = null;
  private collaboration = false;
  private sharedReady = false;
  private epochs = new Map<string, number>();
  private remoteActive: ActiveStroke[] = [];
  private pointerId: number | null = null;
  private drawingPage = '';
  private drawingEpoch = 0;
  private frame = 0;
  private strokeStream = new StrokeStream(command => { this.sendCommand?.(command); });
  private personalPages: WhiteboardPage[] | null = null;
  private viewScale = 1;
  private viewX = 0;
  private viewY = 0;
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
    this.canvas.style.touchAction = 'none';

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

    // Limit pixel ratio to 1.5 on high-DPI displays to eliminate fillrate starvation
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);

    this.viewScale = Math.min(this.canvas.width / 1920, this.canvas.height / 1080);
    this.viewX = (this.canvas.width - 1920 * this.viewScale) / 2;
    this.viewY = (this.canvas.height - 1080 * this.viewScale) / 2;
    this.redrawCurrentPage();
  }

  private setupEvents(): void {
    window.addEventListener('resize', () => this.resize());

    // Pointer events support mouse, touch, and Apple Pencil / Stylus
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
    this.canvas.addEventListener('lostpointercapture', this.onPointerUp.bind(this));
  }

  private getCanvasPoint(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1920, ((e.clientX - rect.left) * this.dpr - this.viewX) / this.viewScale)),
      y: Math.max(0, Math.min(1080, ((e.clientY - rect.top) * this.dpr - this.viewY) / this.viewScale)),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.isDrawing || (e.button !== 0 && e.pointerType === 'mouse') || (this.collaboration && !this.sharedReady)) return;
    if (this.currentStroke) { this.finishStroke(); if (this.currentStroke) return; }
    e.preventDefault?.();
    this.isDrawing = true;
    this.pointerId = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* Headless / lost pointer */ }
    this.drawingPage = this.getCurrentPage().id;
    this.drawingEpoch = this.epochs.get(this.drawingPage) || 0;
    this.currentStroke = {
      id: newBoardId(), tool: this.currentTool, color: this.currentColor,
      width: this.currentWidth, opacity: 1, points: [this.getCanvasPoint(e)],
    };
    if (this.collaboration) this.command({ type: 'stroke_start', stroke: structuredClone(this.currentStroke) });
    this.redrawCurrentPage();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDrawing || !this.currentStroke || e.pointerId !== this.pointerId) return;
    const coalesced = e.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [e];
    const offset = this.currentStroke.points.length;
    const points = events.map(ev => this.getCanvasPoint(ev)).slice(0, 16_000 - offset);
    if (points.length) {
      this.currentStroke.points.push(...points);
      if (this.collaboration) this.strokeStream.push(this.drawingPage, this.drawingEpoch, this.currentStroke.id, offset, points);
      this.requestRedraw();
    }
    if (this.currentStroke.points.length >= 16_000) this.finishStroke();
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    if (e.type !== 'pointercancel' && e.type !== 'lostpointercapture') this.onPointerMove(e);
    this.finishStroke();
  }

  private finishStroke(): void {
    if (!this.currentStroke) return;
    this.strokeStream.flush();
    if (this.collaboration) {
      if (!this.command({ type: 'stroke_commit', stroke: structuredClone(this.currentStroke) })) {
        // Keep the local stroke visible if the bounded retry queue is full.
        this.isDrawing = false;
        return;
      }
    } else {
      const page = this.pages.find(p => p.id === this.drawingPage);
      if (page) {
        page.undoStack.push([...page.strokes]); page.redoStack = [];
        page.strokes.push(this.currentStroke);
      }
    }
    this.cancelDrawing();
    this.requestRedraw();
  }

  private cancelDrawing(): void {
    this.strokeStream.cancel();
    const pointer = this.pointerId;
    this.pointerId = null; this.isDrawing = false; this.currentStroke = null;
    if (pointer !== null) try { this.canvas.releasePointerCapture(pointer); } catch { /* Already released */ }
  }

  private command(event: BoardEvent, pageId = this.drawingPage || this.getCurrentPage().id): boolean {
    return this.sendCommand?.({ ...event, opId: newBoardId(), pageId, epoch: this.epochs.get(pageId) || 0 }) ?? false;
  }

  private requestRedraw(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.redrawCurrentPage(); });
  }

  public redrawCurrentPage(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.viewX, this.viewY);
    const page = this.getCurrentPage();
    if (!page) return;
    for (const stroke of page.strokes) this.drawStroke(stroke);
    for (const active of this.remoteActive) {
      if (active.pageId === page.id && active.stroke.id !== this.currentStroke?.id && !page.strokes.some(s => s.id === active.stroke.id)) this.drawStroke(active.stroke);
    }
    if (this.currentStroke && this.drawingPage === page.id) this.drawStroke(this.currentStroke);
  }

  public configureCollaboration(send: ((command: BoardCommand) => boolean) | null): void {
    this.cancelDrawing();
    if (send && !this.collaboration) this.personalPages = this.pages;
    this.sendCommand = send; this.collaboration = !!send; this.sharedReady = false;
    this.epochs.clear(); this.remoteActive = [];
    if (send) this.pages = [{ id: 'page-1', strokes: [], undoStack: [], redoStack: [], createdAt: Date.now() }];
    else { this.pages = this.personalPages || [{ id: 'page-1', strokes: [], undoStack: [], redoStack: [], createdAt: Date.now() }]; this.personalPages = null; }
    this.currentPageIndex = 0; this.redrawCurrentPage(); this.notifyPageChange();
  }

  public connectionLost(): void { this.strokeStream.cancel(); }

  public resumeStream(): void {
    if (this.currentStroke && this.isDrawing) {
      this.strokeStream.cancel();
      this.command({ type: 'stroke_start', stroke: structuredClone(this.currentStroke) }, this.drawingPage);
    }
  }

  public renderCollaboration(state: BoardState, pending: BoardCommand[]): void {
    if (!this.collaboration || !state.pages.length) return;
    const currentId = this.getCurrentPage()?.id;
    const previousCount = this.pages.length;
    const previousIndex = this.currentPageIndex;
    if (this.currentStroke && !state.pages.some(p => p.id === this.drawingPage && p.epoch === this.drawingEpoch)) this.cancelDrawing();
    this.epochs = new Map(state.pages.map(p => [p.id, p.epoch]));
    this.pages = state.pages.map(p => ({ id: p.id, strokes: p.strokes.filter(s => s.visible), undoStack: [], redoStack: [], createdAt: 0 }));
    for (const command of pending) {
      const page = this.pages.find(p => p.id === command.pageId);
      if (command.type === 'stroke_commit' && page && this.epochs.get(page.id) === command.epoch && !page.strokes.some(s => s.id === command.stroke.id)) page.strokes.push(command.stroke);
    }
    this.remoteActive = state.active;
    const index = this.pages.findIndex(p => p.id === currentId);
    this.currentPageIndex = index < 0 ? Math.min(this.currentPageIndex, this.pages.length - 1) : index;
    this.sharedReady = true;
    this.redrawCurrentPage();
    if (previousCount !== this.pages.length || previousIndex !== this.currentPageIndex || currentId !== this.getCurrentPage().id) this.notifyPageChange();
  }

  public selectPage(id: string): boolean {
    const index = this.pages.findIndex(p => p.id === id);
    if (index < 0) return false;
    if (this.currentPageIndex !== index) this.finishStroke();
    this.currentPageIndex = index; this.redrawCurrentPage(); this.notifyPageChange(); return true;
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
      this.ctx.arc(p.x, p.y, stroke.width * (stroke.tool === 'eraser' ? 3 : 1) / 2, 0, Math.PI * 2);
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
      this.finishStroke();
      this.currentPageIndex++;
      this.redrawCurrentPage();
      this.notifyPageChange();
      return true;
    }
    return false;
  }

  public prevPage(): boolean {
    if (this.currentPageIndex > 0) {
      this.finishStroke();
      this.currentPageIndex--;
      this.redrawCurrentPage();
      this.notifyPageChange();
      return true;
    }
    return false;
  }

  public addPage(): number {
    this.finishStroke();
    if (this.collaboration) {
      if (this.sharedReady) this.command({ type: 'page_add' }, newBoardId());
      return this.currentPageIndex;
    }
    const newPage: WhiteboardPage = {
      id: newBoardId(),
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
    this.finishStroke();
    if (this.collaboration) {
      if (!this.sharedReady) return false;
      if (this.pages.length === 1) { this.clearCurrentPage(); return false; }
      return this.command({ type: 'page_delete' }, this.getCurrentPage().id);
    }
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
    this.cancelDrawing();
    if (this.collaboration) {
      if (this.sharedReady) this.command({ type: 'canvas_clear' }, this.getCurrentPage().id);
      return;
    }
    const page = this.getCurrentPage();
    if (page.strokes.length > 0) {
      page.undoStack.push([...page.strokes]);
      page.redoStack = [];
      page.strokes = [];
      this.redrawCurrentPage();
    }
  }

  public undo(): boolean {
    this.finishStroke();
    if (this.collaboration) return this.sharedReady && this.command({ type: 'undo' }, this.getCurrentPage().id);
    const page = this.getCurrentPage();
    if (page.undoStack.length === 0) return false;

    const previousState = page.undoStack.pop()!;
    page.redoStack.push([...page.strokes]);
    page.strokes = previousState;
    this.redrawCurrentPage();
    return true;
  }

  public redo(): boolean {
    this.finishStroke();
    if (this.collaboration) return this.sharedReady && this.command({ type: 'redo' }, this.getCurrentPage().id);
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
