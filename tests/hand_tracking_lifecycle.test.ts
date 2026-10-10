import assert from 'node:assert/strict';
import { HandGestureService } from '../src/vision/HandGestureService.ts';

const globals = globalThis as any;
const originalBitmap = globals.createImageBitmap;
const originalRaf = globals.requestAnimationFrame;
const originalCancelRaf = globals.cancelAnimationFrame;
globals.requestAnimationFrame = () => 1;
globals.cancelAnimationFrame = () => {};
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function harness() {
  const service = new HandGestureService();
  const state = service as any;
  const sent: any[] = [];
  const video = { readyState: 2, currentTime: 1, srcObject: null };
  const worker = { postMessage: (message: any) => sent.push(message), terminate() {}, onmessage: null as any };
  Object.assign(state, { videoElement: video, worker, isWorkerReady: true, status: 'running' });
  state.setupWorkerMessageHandlers();
  const reply = (request = sent.at(-1), type = 'DETECT_RESULT') => worker.onmessage({ data: {
    type, frameId: request.frameId, sessionId: request.sessionId,
    timestamp: request.timestamp, latencyMs: 1, landmarks: [], handedness: [], error: 'test error',
  } });
  return { service, state, video, sent, reply };
}

try {
  // Slow capture and inference must coalesce incoming frames to the latest
  // camera frame, without queueing bitmaps or waiting for UI listeners.
  {
    const { service, state, video, sent, reply } = harness();
    const captures: number[] = [];
    const pending: ((bitmap: any) => void)[] = [];
    globals.createImageBitmap = (source: typeof video) => {
      captures.push(source.currentTime);
      return new Promise(resolve => pending.push(resolve));
    };
    let received = 0;
    service.onFrame(() => {
      received++;
      assert.equal(captures.at(-1), 3, 'Latest capture must start before frame listeners');
    });

    state.processFrame();
    video.currentTime = 2;
    state.processFrame();
    assert.deepEqual(captures, [1], 'A slow capture must not create a bitmap backlog');
    pending.shift()!({ close() {} });
    await flush();
    video.currentTime = 3;
    state.processFrame();
    assert.equal(sent.length, 1, 'Only one inference may be in flight');
    state.inFlightFrame.startedAt -= 30;
    reply();
    assert.deepEqual(captures, [1, 3], 'Intermediate frames must be dropped');
    assert.equal(received, 1);
    assert(service.getTelemetry().latencyMs >= 30, 'Latency must include capture/transport, not just 1ms inference');
    pending.shift()!({ close() {} });
    await flush();
    reply();
    state.lastFrameSendTime = performance.now() - 1000;
    state.processFrame();
    state.processFrame();
    assert.deepEqual(captures, [1, 3], 'Neither watchdog nor video callback may replay the same frame');
    service.destroy();
  }

  // A playback clock advances even when no new camera pixels arrive. Decoded
  // frame counts must prevent inference loops driven by worker completions.
  {
    const { service, state, video, sent, reply } = harness();
    let decoded = 1;
    (video as any).getVideoPlaybackQuality = () => ({ totalVideoFrames: decoded });
    globals.createImageBitmap = async () => ({ close() {} });
    state.processFrame();
    await flush();
    for (let i = 0; i < 5; i++) {
      video.currentTime += 0.002;
      state.processFrame();
    }
    reply();
    await flush();
    assert.equal(sent.length, 1, 'An advancing playback clock must not trigger repeated inference of the same decoded frame');
    decoded++;
    state.processFrame();
    await flush();
    assert.equal(sent.length, 2, 'A newly decoded frame must be dispatched immediately');
    service.destroy();
  }

  // When decoded counts are unavailable, rVFC mediaTime supplies frame identity.
  {
    const { service, state, video, sent, reply } = harness();
    let onVideoFrame!: (now: number, metadata: any) => void;
    Object.assign(video, {
      requestVideoFrameCallback: (callback: typeof onVideoFrame) => { onVideoFrame = callback; return 1; },
      cancelVideoFrameCallback() {},
    });
    globals.createImageBitmap = async () => ({ close() {} });
    state.startLoop();
    onVideoFrame(0, { mediaTime: 1 });
    await flush();
    video.currentTime = 1.02;
    reply();
    await flush();
    state.processFrame();
    assert.equal(sent.length, 1, 'Completion and watchdog must use the last presented frame, not playback time');
    onVideoFrame(33, { mediaTime: 1.033 });
    await flush();
    assert.equal(sent.length, 2);
    service.destroy();
  }

  // Resume while a worker result is in transit must not unlock a second
  // concurrent request, emit a stale gesture, or accept a duplicate response.
  {
    const { service, state, video, sent, reply } = harness();
    globals.createImageBitmap = async () => ({ close() {} });
    let received = 0;
    service.onFrame(() => received++);
    state.processFrame();
    await flush();
    const old = sent[0];
    service.pause();
    service.resume();
    video.currentTime = 2;
    state.processFrame();
    await flush();
    assert.equal(sent.length, 1, 'Resume must retain the occupied worker slot');
    reply(old);
    await flush();
    assert.equal(received, 0, 'Old session results must not emit gestures');
    assert.equal(sent.length, 2, 'Resume must immediately capture the latest frame after draining the old result');
    reply(old);
    assert.equal(state.isWorkerBusy, true, 'Duplicate old results must not release the new request');
    reply(sent[1]);
    assert.equal(received, 1);
    service.destroy();
  }

  // Stop/start during asynchronous capture must close the old bitmap and
  // recover on the new stream without posting work from the stopped session.
  {
    const { service, state, sent } = harness();
    let resolveOld!: (bitmap: any) => void;
    let captures = 0;
    let closed = 0;
    globals.createImageBitmap = () => ++captures === 1
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve({ close() {} });
    state.processFrame();
    service.stop();
    Object.assign(state, {
      videoElement: { readyState: 2, currentTime: 5, srcObject: null },
      mediaStream: { getTracks: () => [] },
    });
    await service.start();
    state.processFrame();
    assert.equal(captures, 1);
    resolveOld({ close() { closed++; } });
    await flush();
    assert.equal(closed, 1, 'Canceled capture must close its bitmap');
    assert.equal(captures, 2, 'New stream must resume capture after old capture is canceled');
    assert.equal(sent.length, 1, 'Only the new session may post to the worker');
    assert.equal(sent[0].sessionId, state.sessionId);
    service.destroy();
  }

  // An inference error must release its request and process the latest frame.
  {
    const { service, state, video, sent, reply } = harness();
    globals.createImageBitmap = async () => ({ close() {} });
    state.processFrame();
    await flush();
    video.currentTime = 2;
    reply(sent[0], 'DETECT_ERROR');
    await flush();
    assert.equal(sent.length, 2);
    reply(sent[1]);
    assert.equal(state.isWorkerBusy, false);
    service.destroy();
  }
  console.log('Hand tracking lifecycle tests passed: latest frames, no replay, end-to-end timing, pause/resume, stop/start, error recovery.');
} finally {
  globals.createImageBitmap = originalBitmap;
  globals.requestAnimationFrame = originalRaf;
  globals.cancelAnimationFrame = originalCancelRaf;
}
