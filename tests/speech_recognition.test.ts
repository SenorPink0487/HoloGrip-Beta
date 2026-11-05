import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { bindMixtureQuery } from '../src/ui/vision/mixtureQuery.ts';
import { createSpeechRecognition, type SpeechRecognitionLike, type SpeechResult } from '../src/voice/speechRecognition.ts';

class Element extends EventTarget {
  value = '';
  disabled = false;
  textContent = '';
  focused = false;
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, enabled: boolean) => enabled ? this.classes.add(name) : this.classes.delete(name),
  };
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  click() { this.dispatchEvent(new Event('click')); }
}

class BrowserRecognition implements SpeechRecognitionLike {
  static instances: BrowserRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = true;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  started = false;
  aborted = false;
  constructor() { BrowserRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.aborted = true; }
  abort() { this.aborted = true; }
  result(parts: Array<[string, boolean]>, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: parts.map(([transcript, isFinal]): SpeechResult => ({ isFinal, 0: { transcript } })) });
  }
}

const safariUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

function harness(t: TestContext, host: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries({
    window: { isSecureContext: true, webkitSpeechRecognition: BrowserRecognition, ...host },
    navigator: { userAgent: safariUA, maxTouchPoints: 5 },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  BrowserRecognition.instances = [];
  const queries: string[] = [];
  let pours = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    queries.push(JSON.parse(options?.body as string).query);
    return new Response(JSON.stringify({ mixture: {
      name: '可乐', volumeMl: 80,
      components: [
        { name: '蔗糖', formula: 'C12H22O11', kind: 'inert', moles: 0.02 },
        { name: '咖啡因', formula: 'C8H10N4O2', kind: 'inert', moles: 0.0004 },
      ],
    } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const input = new Element();
  const voice = new Element();
  const analyze = new Element();
  const status = new Element();
  const elements: Record<string, Element> = { input, voice, analyze, status };
  const binding = bindMixtureQuery({ querySelector: (key: string) => elements[key] } as unknown as ParentNode,
    { input: 'input', voice: 'voice', analyze: 'analyze', status: 'status' },
    { getEngine: () => ({ pourAnalyzedMixture: () => { pours++; return { id: 'mixture_analysis' }; } }) as any });
  t.after(() => binding.destroy());
  return { input, voice, analyze, status, queries, get pours() { return pours; }, binding,
    get recognition() { return BrowserRecognition.instances.at(-1)!; } };
}

function nativeIPC() {
  const calls: Array<{ command: string; args: any; resolve: (value: any) => void; reject: (error: unknown) => void }> = [];
  return { calls, bridge: {
    invoke: (command: string, args: any) => new Promise((resolve, reject) => {
      calls.push({ command, args, resolve, reject });
      if (command.endsWith('|stopSpeech')) resolve(undefined);
    }),
  } };
}

test('iPad Safari starts synchronously in the tap and submits cumulative final results once', async (t) => {
  const h = harness(t);
  h.voice.click();
  assert.equal(h.recognition.started, true, 'Safari user activation must survive');
  assert.equal(h.recognition.lang, 'zh-CN');
  h.recognition.result([['无糖', true], ['可乐', false]], 1);
  assert.equal(h.input.value, '无糖可乐');
  assert.equal(h.queries.length, 0, 'An earlier final segment must not submit a later interim segment');
  h.recognition.result([['无糖', true], ['可乐', true]], 1);
  h.recognition.onend?.();
  await setImmediate();
  assert.deepEqual(h.queries, ['无糖可乐']);
  assert.equal(h.pours, 1);
  assert.equal(h.voice.classes.has('listening'), false);
});

test('WebKit ending with only an interim result still submits the recognized text', async (t) => {
  const h = harness(t);
  h.voice.click();
  h.recognition.result([['可乐', false]]);
  h.recognition.onend?.();
  await setImmediate();
  assert.deepEqual(h.queries, ['可乐']);
  assert.equal(h.pours, 1);
});

test('empty speech preserves typed input and does not submit it', (t) => {
  const h = harness(t);
  h.input.value = '食醋';
  h.voice.click();
  h.recognition.result([['  ', true]]);
  h.recognition.onend?.();
  assert.equal(h.input.value, '食醋');
  assert.equal(h.queries.length, 0);
  assert.match(h.status.textContent, /没有听到/);
});

test('permission rejection gives a specific error and allows another attempt', (t) => {
  const h = harness(t);
  h.voice.click();
  h.recognition.onerror?.({ error: 'not-allowed' });
  h.recognition.onend?.();
  assert.match(h.status.textContent, /权限/);
  assert.equal(h.voice.classes.has('listening'), false);
  h.voice.click();
  assert.equal(BrowserRecognition.instances.length, 2);
  assert.equal(h.recognition.started, true);
});

test('cancelled session callbacks cannot overwrite or stop a new session', async (t) => {
  const h = harness(t);
  h.voice.click();
  const old = h.recognition;
  h.voice.click();
  assert.equal(old.aborted, true);
  h.voice.click();
  old.result([['错误内容', true]]);
  old.onerror?.({ error: 'network' });
  old.onend?.();
  assert.equal(h.input.value, '');
  assert.equal(h.voice.classes.has('listening'), true);
  assert.equal(h.queries.length, 0);
  h.recognition.result([['可乐', true]]);
  await setImmediate();
  assert.deepEqual(h.queries, ['可乐']);
});

test('destroy aborts recognition and ignores later results', (t) => {
  const h = harness(t);
  h.voice.click();
  h.binding.destroy();
  h.recognition.result([['可乐', true]]);
  h.recognition.onend?.();
  assert.equal(h.recognition.aborted, true);
  assert.equal(h.queries.length, 0);
});

test('HTTP reports the secure connection requirement without starting capture', (t) => {
  const h = harness(t, { isSecureContext: false });
  h.voice.click();
  assert.equal(BrowserRecognition.instances.length, 0);
  assert.match(h.status.textContent, /HTTPS/);
  assert.equal(h.voice.classes.has('listening'), false);
});

test('unsupported browsers focus the input for keyboard dictation', (t) => {
  const h = harness(t, { webkitSpeechRecognition: undefined });
  h.voice.click();
  assert.equal(h.input.focused, true);
  assert.match(h.status.textContent, /键盘.*听写/);
});

test('synchronous start and constructor failures are recoverable', (t) => {
  const h = harness(t, { webkitSpeechRecognition: class extends BrowserRecognition {
    start() { throw new DOMException('Denied', 'NotAllowedError'); }
  } });
  h.voice.click();
  assert.match(h.status.textContent, /权限/);
  assert.equal(h.voice.classes.has('listening'), false);
  (window as any).webkitSpeechRecognition = class { constructor() { throw new Error('Unavailable'); } };
  assert.doesNotThrow(() => h.voice.click());
  assert.match(h.status.textContent, /暂不可用/);
});

test('iPadOS desktop user agent uses native speech even when WebKit exposes a broken API', async (t) => {
  const ipc = nativeIPC();
  const h = harness(t, { __TAURI_INTERNALS__: ipc.bridge, isSecureContext: false });
  h.voice.click();
  assert.equal(BrowserRecognition.instances.length, 0);
  assert.equal(ipc.calls[0].command, 'plugin:apple-vision|startSpeech');
  assert.equal(ipc.calls[0].args.lang, 'zh-CN');
  ipc.calls[0].resolve({ transcript: '可乐' });
  await setImmediate();
  assert.deepEqual(h.queries, ['可乐']);
  assert.equal(h.pours, 1);
  assert.equal(h.voice.classes.has('listening'), false);
});

test('native cancel is scoped to its session and late completion cannot submit', async (t) => {
  const ipc = nativeIPC();
  const h = harness(t, { __TAURI_INTERNALS__: ipc.bridge });
  h.voice.click();
  const first = ipc.calls[0];
  h.voice.click();
  assert.equal(ipc.calls[1].command, 'plugin:apple-vision|stopSpeech');
  assert.equal(ipc.calls[1].args.sessionId, first.args.sessionId);
  h.voice.click();
  assert.notEqual(ipc.calls[2].args.sessionId, first.args.sessionId);
  first.resolve({ transcript: '旧内容' });
  await setImmediate();
  assert.equal(h.queries.length, 0);
  assert.equal(h.voice.classes.has('listening'), true);
  ipc.calls[2].resolve({ transcript: '可乐' });
  await setImmediate();
  assert.deepEqual(h.queries, ['可乐']);
});

test('native denial preserves the error and recovers on retry', async (t) => {
  const ipc = nativeIPC();
  const h = harness(t, { __TAURI_INTERNALS__: ipc.bridge });
  h.voice.click();
  ipc.calls[0].reject({ code: 'not-allowed', message: 'Denied' });
  await setImmediate();
  assert.match(h.status.textContent, /权限/);
  assert.equal(h.voice.classes.has('listening'), false);
  h.voice.click();
  const start = ipc.calls.findLast((call) => call.command.endsWith('|startSpeech'))!;
  start.resolve({ transcript: '可乐' });
  await setImmediate();
  assert.equal(h.pours, 1);
});

test('macOS native desktop keeps the browser backend', (t) => {
  harness(t, { __TAURI_INTERNALS__: nativeIPC().bridge });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: safariUA, maxTouchPoints: 0 } });
  assert.ok(createSpeechRecognition() instanceof BrowserRecognition);
});
