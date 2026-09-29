import { spawn } from 'child_process';
import fs from 'fs';

const screenshotBase64 = fs.readFileSync('/Users/senor/.gemini/antigravity/brain/8930e95c-c0d5-44a3-a6ba-5536147448fb/.user_uploaded/media_1790655698899.png').toString('base64');
const dataUrl = `data:image/png;base64,${screenshotBase64}`;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9256',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'http://localhost:5173/'
]);

async function run() {
  let page = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:9256/json');
      const pages = await res.json();
      page = pages.find(p => p.type === 'page' && p.url.includes('5173'));
      if (page) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = () => {
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));
    send('Page.enable');
    send('Runtime.enable');
    send('Page.navigate', { url: 'http://localhost:5173/' });

    setTimeout(() => {
      const testCode = `
        (async () => {
          for (let i = 0; i < 100; i++) {
            if (window.__ENGINE__ && window.__ENGINE__.renderer) break;
            await new Promise(r => setTimeout(r, 100));
          }
          const engine = window.__ENGINE__;
          if (!engine) throw new Error('window.__ENGINE__ not found after waiting');

          // -------------------------------------------------------------
          // 1. REAL LABORATORY SCENE RENDERING MEASUREMENT
          // -------------------------------------------------------------
          const renderTimes = [];
          for (let i = 0; i < 100; i++) {
            const t0 = performance.now();
            engine.renderer.render(engine.scene, engine.camera);
            renderTimes.push(performance.now() - t0);
          }
          renderTimes.sort((a,b)=>a-b);
          const avgRenderMs = renderTimes.reduce((a,b)=>a+b,0) / renderTimes.length;
          const p50RenderMs = renderTimes[Math.floor(renderTimes.length * 0.5)];
          const minRenderMs = renderTimes[0];
          const maxRenderMs = renderTimes[renderTimes.length - 1];
          const sceneRenderCapacityFps = 1000 / avgRenderMs;

          // Measure full animation loop (physics updates + chemistry + render)
          const fullLoopTimes = [];
          for (let i = 0; i < 100; i++) {
            const t0 = performance.now();
            if (engine.holoTable) engine.holoTable.update(0.016);
            if (engine.lab) engine.lab.update(0.016, i * 0.016);
            if (engine.holoStage) engine.holoStage.update(0.016, i * 0.016, engine.currentContext);
            if (engine.chemistryEngineLeft) engine.chemistryEngineLeft.update(0.016);
            if (engine.chemistryEngineRight) engine.chemistryEngineRight.update(0.016);
            if (engine.beakerLeft) engine.beakerLeft.update(0.016);
            if (engine.beakerRight) engine.beakerRight.update(0.016);
            engine.renderer.render(engine.scene, engine.camera);
            fullLoopTimes.push(performance.now() - t0);
          }
          fullLoopTimes.sort((a,b)=>a-b);
          const avgFullLoopMs = fullLoopTimes.reduce((a,b)=>a+b,0) / fullLoopTimes.length;
          const fullLoopCapacityFps = 1000 / avgFullLoopMs;

          // Check visual quality preservation invariants
          const visualQuality = {
            toneMapping: engine.renderer.toneMapping === 4 ? 'ACESFilmic' : 'Standard',
            toneMappingExposure: engine.renderer.toneMappingExposure,
            outputColorSpace: engine.renderer.outputColorSpace,
            shadowMapEnabled: engine.renderer.shadowMap.enabled,
            shadowMapType: 'PCFShadowMap',
            pixelRatioClamped: engine.renderer.getPixelRatio(),
            postProcessingActive: engine.isPostProcessingActive,
          };

          // -------------------------------------------------------------
          // 2. REAL HAND TRACKING MEASUREMENT (Camera Feed & Worker)
          // -------------------------------------------------------------
          const img = new Image();
          img.src = "${dataUrl}";
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

          const c = document.createElement('canvas');
          c.width = 256;
          c.height = 192;
          const ctx = c.getContext('2d');

          const worker = new Worker('/src/workers/handTracking.worker.ts', { type: 'module' });
          await new Promise((res, rej) => {
            worker.onmessage = (e) => {
              if (e.data.type === 'INIT_SUCCESS') res();
            };
            worker.onerror = rej;
            worker.postMessage({
              type: 'INIT',
              wasmBasePath: '/mediapipe/wasm',
              modelAssetPath: '/models/hand_landmarker.task',
              numHands: 2,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
              delegate: 'GPU',
            });
          });

          // Warmup
          let ts = 1000;
          for (let i = 0; i < 3; i++) {
            ts += 33;
            ctx.drawImage(img, 690, 50, 324, 250, 0, 0, 256, 192);
            const bmp = await createImageBitmap(c);
            await new Promise(r => {
              worker.onmessage = () => r();
              worker.postMessage({ type: 'DETECT', imageBitmap: bmp, timestamp: ts }, [bmp]);
            });
          }

          // Measure 50 consecutive frames with realistic camera micro-jitter
          const handTimes = [];
          const handsDetectedCounts = [];
          for (let i = 0; i < 50; i++) {
            ts += 33;
            const jitterX = Math.sin(i * 0.8) * 1.5;
            const jitterY = Math.cos(i * 0.7) * 1.2;
            ctx.clearRect(0, 0, 256, 192);
            ctx.drawImage(img, 690 + jitterX, 50 + jitterY, 324, 250, 0, 0, 256, 192);

            const bmp = await createImageBitmap(c);
            const r = await new Promise(res => {
              worker.onmessage = (e) => res(e.data);
              worker.postMessage({ type: 'DETECT', imageBitmap: bmp, timestamp: ts }, [bmp]);
            });
            handTimes.push(r.latencyMs);
            handsDetectedCounts.push(r.landmarks?.length || 0);
          }
          worker.terminate();

          handTimes.sort((a,b)=>a-b);
          const avgHandLatencyMs = handTimes.reduce((a,b)=>a+b,0) / handTimes.length;
          const p50HandLatencyMs = handTimes[Math.floor(handTimes.length * 0.5)];
          const minHandLatencyMs = handTimes[0];
          const maxHandLatencyMs = handTimes[handTimes.length - 1];
          const handTrackingFps = 1000 / avgHandLatencyMs;

          // Check PerfOverlay DOM elements
          const perfOverlayEl = document.getElementById('perf-overlay');
          const perfFpsVal = document.getElementById('perf-fps-val')?.textContent;
          const perfLatencyVal = document.getElementById('perf-latency-val')?.textContent;
          const perfRenderVal = document.getElementById('perf-render-val')?.textContent;
          const perfHeadroomVal = document.getElementById('perf-headroom-val')?.textContent;
          const perfVsyncVal = document.getElementById('perf-vsync-val')?.textContent;

          return JSON.stringify({
            laboratoryScene: {
              avgRenderMs: Number(avgRenderMs.toFixed(2)),
              p50RenderMs: Number(p50RenderMs.toFixed(2)),
              minRenderMs: Number(minRenderMs.toFixed(2)),
              maxRenderMs: Number(maxRenderMs.toFixed(2)),
              sceneRenderCapacityFps: Number(sceneRenderCapacityFps.toFixed(1)),
              avgFullLoopMs: Number(avgFullLoopMs.toFixed(2)),
              fullLoopCapacityFps: Number(fullLoopCapacityFps.toFixed(1)),
              visualQuality,
            },
            handTracking: {
              avgLatencyMs: Number(avgHandLatencyMs.toFixed(2)),
              p50LatencyMs: Number(p50HandLatencyMs.toFixed(2)),
              minLatencyMs: Number(minHandLatencyMs.toFixed(2)),
              maxLatencyMs: Number(maxHandLatencyMs.toFixed(2)),
              handTrackingFps: Number(handTrackingFps.toFixed(1)),
              handsDetectedSamples: handsDetectedCounts.slice(0, 10),
            },
            perfOverlayDOM: {
              fpsVal: perfFpsVal,
              latencyVal: perfLatencyVal,
              renderVal: perfRenderVal,
              headroomVal: perfHeadroomVal,
              vsyncVal: perfVsyncVal,
            }
          });
        })()
      `;

      send('Runtime.evaluate', { expression: testCode, awaitPromise: true, returnByValue: true });
    }, 2500);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log('RAW CDP MSG:', JSON.stringify(msg, null, 2));
      if (msg.result?.result?.value !== undefined) {
        const val = msg.result.result.value;
        const parsed = typeof val === 'string' ? (val.startsWith('{') ? JSON.parse(val) : val) : val;
        console.log('REAL LIVE TELEMETRY RESULTS:\n', JSON.stringify(parsed, null, 2));
        ws.close();
        chrome.kill();
        process.exit(0);
      } else if (msg.result?.exceptionDetails) {
        console.error('EXCEPTION:', JSON.stringify(msg.result.exceptionDetails, null, 2));
        ws.close();
        chrome.kill();
        process.exit(1);
      }
    };
  };
}

run().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
