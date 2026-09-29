import { newBoardId } from './id.ts';
import type { Point, Stroke } from './types.ts';

export interface SharedStroke extends Stroke { author: string; visible: boolean }
export interface SharedPage { id: string; epoch: number; strokes: SharedStroke[] }
export interface ActiveStroke { pageId: string; epoch: number; stroke: Stroke }
export type BoardEvent =
  | { type: 'stroke_start'; stroke: Stroke }
  | { type: 'stroke_points'; strokeId: string; offset: number; points: Point[] }
  | { type: 'stroke_commit'; stroke: Stroke }
  | { type: 'canvas_clear' | 'page_add' | 'page_delete' | 'undo' | 'redo' };
export type BoardCommand = BoardEvent & { opId: string; pageId: string; epoch: number };
export interface BoardSnapshot {
  type: 'snapshot'; revision: number; generation: string;
  pages: SharedPage[]; active: ActiveStroke[];
}
export type BoardChange = {
  revision: number; opId?: string; pageId: string; epoch: number;
} & (
  | { type: 'stroke_start'; stroke: Stroke }
  | { type: 'stroke_points'; strokeId: string; offset: number; points: Point[] }
  | { type: 'stroke_commit'; stroke: SharedStroke }
  | { type: 'canvas_clear' | 'page_delete' }
  | { type: 'page_add'; page: SharedPage }
  | { type: 'strokes_visibility'; ids: string[]; visible: boolean }
  | { type: 'strokes_cancelled'; ids: string[] }
);
export type BoardMessage = BoardSnapshot | BoardChange
  | { type: 'snapshot_updated'; revision: number }
  | { type: 'ack'; opId: string }
  | { type: 'error'; opId: string; retry?: boolean; message: string };

export function durable(event: BoardEvent): boolean {
  return event.type !== 'stroke_start' && event.type !== 'stroke_points';
}

/** 权威画板状态，独立于 Canvas 与 Socket，保证重放确定性。 */
export class BoardState {
  revision = 0;
  generation = '';
  pages: SharedPage[] = [];
  active: ActiveStroke[] = [];
  snapshot(snapshot: BoardSnapshot): void {
    this.revision = snapshot.revision;
    this.generation = snapshot.generation;
    this.pages = structuredClone(snapshot.pages);
    this.active = structuredClone(snapshot.active);
  }
  apply(event: BoardChange): boolean {
    if (event.revision <= this.revision) return true;
    if (event.revision !== this.revision + 1) return false;
    const page = this.pages.find(p => p.id === event.pageId);
    switch (event.type) {
      case 'stroke_start':
        if (!page || page.epoch !== event.epoch) return false;
        this.active = this.active.filter(s => s.stroke.id !== event.stroke.id);
        this.active.push({ pageId: event.pageId, epoch: event.epoch, stroke: structuredClone(event.stroke) });
        break;
      case 'stroke_points': {
        const active = this.active.find(s => s.pageId === event.pageId && s.stroke.id === event.strokeId);
        if (!active || active.stroke.points.length !== event.offset) return false;
        active.stroke.points.push(...event.points);
        break;
      }
      case 'stroke_commit':
        if (!page) return false;
        this.active = this.active.filter(s => s.stroke.id !== event.stroke.id);
        if (!page.strokes.some(s => s.id === event.stroke.id)) page.strokes.push(structuredClone(event.stroke));
        break;
      case 'canvas_clear':
        if (!page) return false;
        page.epoch = event.epoch;
        for (const s of page.strokes) s.visible = false;
        this.active = this.active.filter(s => s.pageId !== event.pageId);
        break;
      case 'page_add': this.pages.push(structuredClone(event.page)); break;
      case 'page_delete':
        this.pages = this.pages.filter(p => p.id !== event.pageId);
        this.active = this.active.filter(s => s.pageId !== event.pageId);
        break;
      case 'strokes_visibility':
        if (!page) return false;
        for (const s of page.strokes) if (event.ids.includes(s.id)) s.visible = event.visible;
        break;
      case 'strokes_cancelled': this.active = this.active.filter(s => !event.ids.includes(s.stroke.id)); break;
    }
    this.revision = event.revision;
    return true;
  }
}

/** 仅批量发送新增点数据；提笔时在提交完整可靠笔画前执行清空刷新。 */
export class StrokeStream {
  private pending: BoardCommand & { type: 'stroke_points' } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private send: (event: BoardCommand) => void;
  constructor(send: (event: BoardCommand) => void) { this.send = send; }
  push(pageId: string, epoch: number, strokeId: string, offset: number, points: Point[]): void {
    if (this.pending && (this.pending.strokeId !== strokeId || this.pending.pageId !== pageId || this.pending.epoch !== epoch)) this.flush();
    this.pending ??= { type: 'stroke_points', opId: newBoardId(), pageId, epoch, strokeId, offset, points: [] };
    this.pending.points.push(...points);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 16);
  }
  flush(): void {
    clearTimeout(this.timer); this.timer = undefined;
    const pending = this.pending; this.pending = null;
    if (pending) for (let i = 0; i < pending.points.length; i += 256) {
      this.send({ ...pending, opId: newBoardId(), offset: pending.offset + i, points: pending.points.slice(i, i + 256) });
    }
  }
  cancel(): void { clearTimeout(this.timer); this.timer = undefined; this.pending = null; }
}
