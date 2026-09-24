import { apiBase, createWhiteboardTicket } from '../account/api.ts';
import { getUser, subscribe } from '../account/session.ts';
import { BoardState, durable, type BoardCommand, type BoardMessage } from './collaboration.ts';
import type { WhiteboardCanvas } from './WhiteboardCanvas.ts';

/** One connection per signed-in user/class, with bounded, session-persistent retries. */
export class WhiteboardConnection {
  private canvas: WhiteboardCanvas;
  private status: HTMLElement;
  private state = new BoardState();
  private socket: WebSocket | null = null;
  private identity = '';
  private pending: BoardCommand[] = [];
  private ready = false;
  private synced = false;
  private disposed = false;
  private generation = 0;
  private attempts = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private paintFrame = 0;
  private unsubscribe: () => void;
  private pageToSelect?: string;
  private warning = '';

  constructor(canvas: WhiteboardCanvas, parent: HTMLElement) {
    this.canvas = canvas;
    this.status = document.createElement('div');
    this.status.className = 'whiteboard-sync-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    if (this.status.style) this.status.style.display = 'none';
    parent.appendChild(this.status);
    this.unsubscribe = subscribe(() => this.sessionChanged());
    window.addEventListener('online', this.onOnline);
    this.sessionChanged();
  }
  private onOnline = (): void => { if (this.identity && !this.ready) this.restart(); };
  private sessionChanged(): void {
    const user = getUser();
    const identity = user?.class ? `${user.id}:${user.class.id}` : '';
    if (identity === this.identity) {
      if (!identity) {
        this.status.textContent = '';
        if (this.status.style) this.status.style.display = 'none';
      }
      return;
    }
    this.stop();
    this.identity = identity;
    this.state = new BoardState(); this.synced = false; this.pending = []; this.warning = '';
    this.canvas.configureCollaboration(identity ? command => this.submit(command) : null);
    if (!identity) {
      this.status.textContent = '';
      if (this.status.style) this.status.style.display = 'none';
      return;
    }
    if (this.status.style) this.status.style.display = '';
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.storageKey()) || '[]');
      if (Array.isArray(saved) && saved.length <= 100) this.pending = saved.filter(c => c && typeof c.opId === 'string' && typeof c.pageId === 'string' && durable(c));
    } catch { /* Storage is optional; retries still work for this open app. */ }
    this.attempts = 0;
    void this.connect(this.generation);
  }
  private storageKey(): string { return `whiteboard-pending:${this.identity}`; }
  private savePending(): void {
    try {
      if (this.pending.length) sessionStorage.setItem(this.storageKey(), JSON.stringify(this.pending));
      else sessionStorage.removeItem(this.storageKey());
    } catch { this.warning = '暂存空间不足，请保持页面打开直到同步完成'; }
  }
  private setStatus(text?: string): void {
    if (!this.identity && !text) {
      this.status.textContent = '';
      if (this.status.style) this.status.style.display = 'none';
      return;
    }
    if (this.status.style) this.status.style.display = '';
    this.status.textContent = text || this.warning || (this.ready
      ? this.pending.length ? `班级白板 · ${this.pending.length} 项正在保存` : '班级白板 · 已同步'
      : this.synced ? '班级白板 · 正在重连，笔迹暂存本机' : '班级白板 · 连接中');
    this.status.dataset.state = this.ready ? 'connected' : 'connecting';
  }
  private async connect(generation: number): Promise<void> {
    this.setStatus();
    try {
      const { ticket } = await createWhiteboardTicket();
      if (this.disposed || generation !== this.generation || !this.identity) return;
      const url = new URL(`${apiBase()}/api/v1/whiteboard/ws`, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('ticket', ticket);
      const socket = new WebSocket(url);
      this.socket = socket;
      this.connectTimer = setTimeout(() => { if (this.socket === socket && !this.ready) socket.close(); }, 12_000);
      socket.onmessage = e => {
        if (this.socket !== socket || generation !== this.generation) return;
        try { this.receive(JSON.parse(e.data) as BoardMessage); }
        catch { socket.close(); }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket !== socket || generation !== this.generation) return;
        this.socket = null; this.ready = false;
        clearTimeout(this.connectTimer); clearTimeout(this.ackTimer);
        this.canvas.connectionLost();
        this.setStatus(); this.scheduleReconnect(generation);
      };
    } catch {
      if (generation === this.generation && this.identity) {
        this.setStatus('班级白板 · 连接失败，正在重试'); this.scheduleReconnect(generation);
      }
    }
  }
  private scheduleReconnect(generation: number): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(generation), Math.min(15_000, 500 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 300);
  }
  private restart(): void {
    this.stop();
    this.attempts = 0;
    void this.connect(this.generation);
  }
  private stop(): void {
    this.generation++; this.ready = false;
    clearTimeout(this.retryTimer); clearTimeout(this.connectTimer); clearTimeout(this.ackTimer);
    cancelAnimationFrame(this.paintFrame); this.paintFrame = 0;
    const socket = this.socket; this.socket = null; socket?.close();
  }
  private receive(message: BoardMessage): void {
    if (message.type === 'snapshot') {
      this.state.snapshot(message);
      this.ready = true; this.synced = true; this.attempts = 0;
      clearTimeout(this.connectTimer);
      // Keep IDs until ack. Resending a previously saved clear is safe on the server.
      for (const command of this.pending) this.write(command);
      this.render(); this.canvas.resumeStream(); this.watchAcks(); this.setStatus(); return;
    }
    if (message.type === 'snapshot_updated') {
      if (message.revision > this.state.revision) this.sync();
      return;
    }
    if (message.type === 'error') {
      this.warning = message.message;
      if (!message.retry) this.ack(message.opId);
      else this.socket?.close();
      this.render(); this.setStatus(); return;
    }
    if (message.type === 'ack') { this.ack(message.opId); this.render(); this.setStatus(); return; }
    if (!this.state.apply(message)) { this.sync(); return; }
    if (message.opId) this.ack(message.opId);
    // Invalidate local drawing immediately, before another pointer event can send stale points.
    if (message.type === 'canvas_clear' || message.type === 'page_delete') this.render();
    else this.scheduleRender();
    this.setStatus();
  }
  private sync(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'sync', since: this.state.revision, generation: this.state.generation }));
  }
  private ack(opId: string): void {
    const oldLength = this.pending.length;
    this.pending = this.pending.filter(c => c.opId !== opId);
    if (oldLength !== this.pending.length) { this.savePending(); this.watchAcks(); }
  }
  private watchAcks(): void {
    clearTimeout(this.ackTimer);
    if (this.ready && this.pending.length) this.ackTimer = setTimeout(() => this.socket?.close(), 15_000);
  }
  private write(command: BoardCommand): boolean {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > 512 * 1024) { this.socket.close(); return false; }
    this.socket.send(JSON.stringify(command)); return true;
  }
  private submit(command: BoardCommand): boolean {
    if (!this.synced) return false;
    if (durable(command)) {
      if (this.pending.length >= 100 || JSON.stringify([...this.pending, command]).length > 2_000_000) {
        this.setStatus('本机待同步内容已满，请等待连接恢复'); return false;
      }
      this.warning = '';
      this.pending.push(structuredClone(command)); this.savePending();
      if (command.type === 'page_add') this.pageToSelect = command.pageId;
    }
    this.write(command);
    this.scheduleRender(); this.watchAcks(); this.setStatus();
    return true;
  }
  private scheduleRender(): void {
    if (!this.paintFrame) this.paintFrame = requestAnimationFrame(() => { this.paintFrame = 0; this.render(); });
  }
  private render(): void {
    this.canvas.renderCollaboration(this.state, this.pending);
    if (this.pageToSelect && this.canvas.selectPage(this.pageToSelect)) this.pageToSelect = undefined;
  }
  dispose(): void {
    this.disposed = true; this.stop(); this.unsubscribe();
    window.removeEventListener('online', this.onOnline); this.status.remove();
  }
}
