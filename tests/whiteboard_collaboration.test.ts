import assert from 'node:assert/strict';
import { BoardState, StrokeStream, type BoardCommand } from '../src/whiteboard/collaboration.ts';

const state = new BoardState();
const empty = { type: 'snapshot' as const, revision: 0, generation: 'g', pages: [{ id: 'page-1', epoch: 0, strokes: [] }], active: [] };
state.snapshot(empty);
const stroke = { id: 'ink', tool: 'pen' as const, color: '#000', width: 4, opacity: 1, points: [{ x: 10, y: 20 }] };
assert(state.apply({ type: 'stroke_start', revision: 1, pageId: 'page-1', epoch: 0, stroke }));
assert(state.apply({ type: 'stroke_points', revision: 2, pageId: 'page-1', epoch: 0, strokeId: 'ink', offset: 1, points: [{ x: 20, y: 30 }] }));
assert.equal(state.active[0].stroke.points.length, 2);
assert.equal(state.pages[0].strokes.length, 0, 'Remote ink is visible while still uncommitted');
assert(!state.apply({ type: 'canvas_clear', revision: 4, pageId: 'page-1', epoch: 1 }), 'Missing revision requests repair');
assert(state.apply({ type: 'stroke_commit', revision: 3, pageId: 'page-1', epoch: 0, stroke: { ...stroke, author: 'u', visible: true } }));
assert(state.apply({ type: 'stroke_commit', revision: 3, pageId: 'page-1', epoch: 0, stroke: { ...stroke, author: 'u', visible: true } }));
assert.equal(state.pages[0].strokes.length, 1, 'Duplicate delivery does not duplicate ink');
assert(state.apply({ type: 'canvas_clear', revision: 4, pageId: 'page-1', epoch: 1 }));
assert.equal(state.pages[0].strokes[0].visible, false);
assert.equal(state.active.length, 0);

const sent: BoardCommand[] = [];
const stream = new StrokeStream(c => sent.push(c));
stream.push('page-1', 0, 'ink', 1, Array.from({ length: 300 }, (_, x) => ({ x, y: 1 })));
await new Promise(r => setTimeout(r, 25));
assert.equal(sent.length, 2);
assert.equal((sent[1] as any).offset, 257);
stream.push('page-1', 0, 'ink', 301, [{ x: 1, y: 2 }]);
stream.flush();
assert.equal(sent.length, 3, 'Final points flush synchronously before commit');
stream.push('page-1', 0, 'ink', 302, [{ x: 1, y: 2 }]);
stream.cancel();
await new Promise(r => setTimeout(r, 25));
assert.equal(sent.length, 3, 'Clear cancels unsent points');

// Exercise the actual connection lifecycle without a network or browser dependency.
const listeners = new Map<string, Function>();
(globalThis as any).window = { location: { href: 'http://localhost:5173/' }, addEventListener: (name: string, f: Function) => listeners.set(name, f), removeEventListener: (name: string) => listeners.delete(name) };
(globalThis as any).document = { createElement: () => ({ setAttribute() {}, dataset: {}, remove() {}, textContent: '' }) };
(globalThis as any).requestAnimationFrame = (f: Function) => setTimeout(f, 0);
(globalThis as any).cancelAnimationFrame = clearTimeout;
const storage = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
(globalThis as any).fetch = async () => new Response(JSON.stringify({ ticket: 'ticket' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 1; bufferedAmount = 0; sent: any[] = [];
  onmessage?: Function; onclose?: Function; onerror?: Function;
  constructor(_url: string) { Socket.all.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(value: any) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
(globalThis as any).WebSocket = Socket;
const { replaceSession } = await import('../src/account/session.ts');
const { WhiteboardConnection } = await import('../src/whiteboard/WhiteboardConnection.ts');
const user = { id: 'teacher', email: 't@test.example', role: 'teacher' as const, displayName: null, class: { id: 'class-a', name: 'A' } };
replaceSession(user);
let submit: (command: BoardCommand) => boolean;
let rendered = 0;
const canvas = { configureCollaboration: (send: typeof submit) => { submit = send; }, renderCollaboration: () => rendered++, selectPage: () => false, connectionLost() {}, resumeStream() {} };
const connection = new WhiteboardConnection(canvas as any, { appendChild() {} } as any);
await new Promise(r => setTimeout(r, 10));
const first = Socket.all.at(-1)!;
first.receive(empty);
const commit: BoardCommand = { type: 'stroke_commit', opId: 'stable-op', pageId: 'page-1', epoch: 0, stroke };
assert(submit!(commit));
assert.equal(first.sent.at(-1).opId, 'stable-op');
assert(storage.size > 0, 'Unacknowledged operation is retained');
first.close();
listeners.get('online')!();
await new Promise(r => setTimeout(r, 10));
const second = Socket.all.at(-1)!;
assert.notEqual(second, first);
second.receive(empty);
assert.equal(second.sent.at(-1).opId, 'stable-op', 'Reconnect retries the same operation ID');
second.receive({ type: 'ack', opId: 'stable-op' });
assert.equal(storage.size, 0);
replaceSession({ ...user, class: { id: 'class-b', name: 'B' } });
const count = rendered;
second.receive({ ...empty, revision: 999 });
assert.equal(rendered, count, 'Late events from a previous class are ignored');
connection.dispose();
replaceSession(null);
console.log('✓ Collaboration streaming, replay, retry persistence and class isolation passed');
