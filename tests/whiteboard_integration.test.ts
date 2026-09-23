/** Requires the local MySQL test database and a built account-server binary.
 * Uses only a dedicated *_test database, starts/stops its own service on port 18081.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { BoardState } from '../src/whiteboard/collaboration.ts';
const database = process.env.WHITEBOARD_TEST_DATABASE_URL || 'mysql://root:virtuallab@127.0.0.1:3306/virtuallab_whiteboard_test';
assert(new URL(database).pathname.endsWith('_test'), 'Integration tests require a dedicated *_test database');
const base = 'http://127.0.0.1:18081';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let server: ReturnType<typeof spawn>;
let serverLogs = '';
async function start() {
  const binary = existsSync('server/target/debug/server') ? 'server/target/debug/server' : (existsSync('server/target/debug/account-server') ? 'server/target/debug/account-server' : 'account-server/target/debug/account-server');
  server = spawn(binary, [], { env: { ...process.env, DATABASE_URL: database, JWT_SECRET: 'whiteboard-test-only-secret-32-characters-long', BIND: '127.0.0.1:18081', RUST_LOG: 'warn' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', b => { serverLogs += b; }); server.stderr?.on('data', b => { serverLogs += b; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(serverLogs);
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw Error(`Service startup timed out: ${serverLogs}`);
}
async function stop() {
  if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
}
async function api(path: string, token?: string, body?: any) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value)); return value;
}
const sockets: Peer[] = [];
class Peer {
  ws: WebSocket; messages: any[] = []; state = new BoardState(); bytes = 0;
  arrivals = new Map<string, number>();
  constructor(ticket: string) {
    this.ws = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/whiteboard/ws?ticket=' + ticket);
    sockets.push(this);
    this.ws.onmessage = event => {
      this.bytes += Buffer.byteLength(String(event.data));
      const message = JSON.parse(String(event.data));
      if (message.opId) this.arrivals.set(message.opId, performance.now());
      this.messages.push(message);
      if (message.type === 'snapshot') this.state.snapshot(message);
      else if ('revision' in message && message.type !== 'snapshot_updated') assert(this.state.apply(message), 'Ordered live events');
    };
  }
  async wait(predicate: (m: any) => boolean, after = 0) {
    for (let i = 0; i < 300; i++) {
      const found = this.messages.slice(after).find(predicate); if (found) return found;
      await sleep(10);
    }
    throw Error('Timed out waiting for event; last messages: ' + JSON.stringify(this.messages.slice(-3)));
  }
  send(value: any) { this.ws.send(JSON.stringify(value)); }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>(resolve => this.ws.addEventListener('close', () => resolve(), { once: true }));
    this.ws.close(); await closed;
  }
}
async function peer(token: string) { const { ticket } = await api('/api/v1/whiteboard/ticket', token); const p = new Peer(ticket); await p.wait(m => m.type === 'snapshot'); return p; }
const ink = (id: string, x = 10) => ({ id, tool: 'pen', color: '#000000', width: 4, opacity: 1, points: [{ x, y: 20, pressure: 0.5 }] });
const command = (type: string, rest: any = {}) => ({ type, opId: crypto.randomUUID(), pageId: 'page-1', epoch: 0, ...rest });
let result: any;
try {
  await start();
  const suffix = crypto.randomUUID();
  const register = async (body: any) => {
    const r = await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'Whiteboard-test-123!', ...body }) });
    const v = await r.json(); assert(r.ok, JSON.stringify(v)); return v;
  };
  const teacher = await register({ role: 'teacher', email: `t-${suffix}@test.example`, className: '协作验证班' });
  const student = await register({ role: 'student', email: `s-${suffix}@test.example`, inviteCode: teacher.user.class.inviteCode });
  const outsider = await register({ role: 'teacher', email: `o-${suffix}@test.example`, className: '隔离班' });
  const denied = await fetch(`${base}/api/v1/whiteboard/ticket`, { method: 'POST' }); assert.equal(denied.status, 401);
  const t = await peer(teacher.accessToken), s = await peer(student.accessToken), other = await peer(outsider.accessToken);
  const startStroke = command('stroke_start', { stroke: ink('live') }); t.send(startStroke);
  await s.wait(m => m.opId === startStroke.opId);
  const points = command('stroke_points', { strokeId: 'live', offset: 1, points: [{ x: 40, y: 50, pressure: 0.5 }] });
  t.send(points); await s.wait(m => m.opId === points.opId);
  assert.equal(s.state.active[0].stroke.points.length, 2); assert.equal(s.state.pages[0].strokes.length, 0);
  const late = await peer(student.accessToken); assert.equal(late.state.active[0].stroke.points.length, 2, 'Late join includes in-progress strokes');
  const full = { ...ink('live'), points: [...ink('live').points, ...points.points] };
  const resumed = await peer(teacher.accessToken);
  const resume = command('stroke_start', { stroke: full }); resumed.send(resume);
  await s.wait(m => m.opId === resume.opId);
  assert.equal(s.state.active.filter(x => x.stroke.id === 'live').length, 1, 'Resume replaces a stale connection preview');
  const nextPoint = { x: 50, y: 60, pressure: .5 };
  const resumePoints = command('stroke_points', { strokeId: 'live', offset: 2, points: [nextPoint] }); resumed.send(resumePoints);
  await s.wait(m => m.opId === resumePoints.opId);
  full.points.push(nextPoint);
  assert.equal(s.state.active[0].stroke.points.length, 3, 'An unfinished stroke continues streaming after reconnect');
  const commit = command('stroke_commit', { stroke: full }); t.send(commit); await s.wait(m => m.opId === commit.opId);
  assert.equal(s.state.pages[0].strokes.length, 1);
  t.send(commit); await t.wait(m => m.type === 'ack' && m.opId === commit.opId);
  assert.equal(s.state.pages[0].strokes.length, 1);
  assert.equal(other.state.pages[0].strokes.length, 0); assert.equal(other.state.active.length, 0);
  const studentInk = command('stroke_commit', { stroke: ink('student') }); s.send(studentInk); await t.wait(m => m.opId === studentInk.opId);
  const undo = command('undo'); t.send(undo); await s.wait(m => m.opId === undo.opId);
  assert.equal(s.state.pages[0].strokes.find(x => x.id === 'live')?.visible, false);
  assert.equal(s.state.pages[0].strokes.find(x => x.id === 'student')?.visible, true);
  const redo = command('redo'); t.send(redo); await s.wait(m => m.opId === redo.opId);
  assert.equal(s.state.pages[0].strokes.find(x => x.id === 'live')?.visible, true);
  t.send(command('stroke_start', { stroke: ink('interrupted') })); await s.wait(m => m.type === 'stroke_start' && m.stroke.id === 'interrupted');
  const clear = command('canvas_clear'); s.send(clear); await t.wait(m => m.opId === clear.opId);
  const stale = command('stroke_commit', { stroke: ink('interrupted') }); t.send(stale);
  await t.wait(m => m.type === 'error' && m.opId === stale.opId);
  assert(s.state.pages[0].strokes.every(x => !x.visible)); assert.equal(s.state.active.length, 0);
  const add = command('page_add', { pageId: 'second' }); t.send(add); await s.wait(m => m.opId === add.opId);
  const del = command('page_delete', { pageId: 'second' }); s.send(del); await t.wait(m => m.opId === del.opId);
  assert.equal(t.state.pages.length, 1);
  const persist = command('stroke_commit', { epoch: 1, stroke: ink('persisted') }); t.send(persist); await s.wait(m => m.opId === persist.opId);
  // Replay repairs missed events using the room generation/revision.
  const marker = t.messages.length;
  t.send({ type: 'sync', generation: t.state.generation, since: t.state.revision - 1 });
  await t.wait(m => m.opId === persist.opId, marker);
  for (const p of [...sockets]) await p.close();
  await stop(); await start();
  const restored = await peer(teacher.accessToken);
  assert(restored.state.pages[0].strokes.some(x => x.id === 'persisted' && x.visible));
  restored.send(persist); await restored.wait(m => m.type === 'ack' && m.opId === persist.opId);
  assert.equal(restored.state.pages[0].strokes.filter(x => x.id === 'persisted').length, 1, 'Durable deduplication after restart');
  // 50 authenticated sockets, one then ten simultaneous writers. Loopback transport timings.
  const peers = [restored];
  for (let i = 1; i < 50; i++) peers.push(await peer(i % 2 ? student.accessToken : teacher.accessToken));
  const runs: any[] = [];
  for (const writers of [1, 10]) {
    const ids = Array.from({ length: writers }, (_, i) => `perf-${writers}-${i}`);
    const allPoints = ids.map((id, i) => ink(id, 10 + i).points);
    for (let i = 0; i < writers; i++) peers[i].send(command('stroke_start', { epoch: 1, stroke: ink(ids[i], 10 + i) }));
    await peers[49].wait(m => m.type === 'stroke_start' && m.stroke.id === ids.at(-1));
    const sentAt = new Map<string, number>(); const bytesBefore = peers.reduce((n, p) => n + p.bytes, 0);
    let upstreamBytes = 0;
    for (let step = 1; step <= 60; step++) {
      for (let i = 0; i < writers; i++) {
        const next = { x: 10 + step, y: 20 + i, pressure: 0.5 }; allPoints[i].push(next);
        const c = command('stroke_points', { epoch: 1, strokeId: ids[i], offset: step, points: [next] });
        sentAt.set(c.opId, performance.now()); upstreamBytes += Buffer.byteLength(JSON.stringify(c)); peers[i].send(c);
      }
      await sleep(16);
    }
    for (const id of sentAt.keys()) await peers[49].wait(m => m.opId === id);
    const latency = peers.flatMap(p => [...sentAt].map(([id, time]) => p.arrivals.get(id)! - time)).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    assert.equal(latency.length, writers * 60 * 50, 'All 50 sockets received every streamed batch');
    runs.push({ connections: 50, writers, batches: sentAt.size, p50Ms: +latency[Math.floor(latency.length * .5)].toFixed(2), p95Ms: +latency[Math.floor(latency.length * .95)].toFixed(2), upstreamBytes, broadcastBytes: peers.reduce((n, p) => n + p.bytes, 0) - bytesBefore });
    for (let i = 0; i < writers; i++) peers[i].send(command('stroke_commit', { epoch: 1, stroke: { ...ink(ids[i]), points: allPoints[i] } }));
    await peers[49].wait(m => m.type === 'stroke_commit' && m.stroke.id === ids.at(-1));
  }
  result = { passed: true, tests: ['live-before-commit', 'late-join-active', 'class-isolation', 'authentication', 'duplicate-commit', 'personal-undo-redo', 'clear-during-draw', 'page-add-delete', 'incremental-replay', 'restart-persistence', 'resume-mid-stroke', 'durable-retry', '50-connections'], transport: 'localhost; includes socket handling, excludes display rendering and WAN', runs };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.allSettled(sockets.map(p => p.close()));
  await stop();
}
