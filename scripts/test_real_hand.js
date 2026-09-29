import { spawn } from 'child_process';
import fs from 'fs';

// Read screenshot and extract a base64 Data URL
const screenshotBase64 = fs.readFileSync('/Users/senor/.gemini/antigravity/brain/8930e95c-c0d5-44a3-a6ba-5536147448fb/.user_uploaded/media_1790655698899.png').toString('base64');
const dataUrl = `data:image/png;base64,${screenshotBase64}`;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9228',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'http://localhost:5173/benchmark.html'
]);

async function run() {
  let pages = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:9228/json');
      pages = await res.json();
      if (pages.length) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const page = pages.find(p => p.url.includes('benchmark.html')) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = () => {
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));
    send('Runtime.enable');

    // Load image and test worker with real hand image!
    const testCode = `
      (async () => {
        const img = new Image();
        img.src = "${dataUrl}";
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        // Crop the camera preview area from screenshot (roughly x: 770 to 1010, y: 150 to 300)
        // In the screenshot: 1024x559, preview modal is at right side
        const handCanvas = document.createElement('canvas');
        handCanvas.width = 320;
        handCanvas.height = 240;
        const ctx = handCanvas.getContext('2d');
        // The camera view in screenshot is at top-right
        ctx.drawImage(img, 775, 145, 230, 160, 0, 0, 320, 240);

        async function testWorker(delegateName, numHands = 2, w = 320, h = 240) {
          const worker = new Worker('/src/workers/handTracking.worker.ts', { type: 'module' });
          await new Promise((res, rej) => {
            worker.onmessage = (e) => {
              if (e.data.type === 'INIT_SUCCESS') res(e.data);
              else if (e.data.type === 'INIT_ERROR') rej(new Error(e.data.error));
            };
            worker.onerror = rej;
            worker.postMessage({
              type: 'INIT',
              wasmBasePath: '/mediapipe/wasm',
              modelAssetPath: '/models/hand_landmarker.task',
              numHands,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
              delegate: delegateName,
            });
          });

          // Draw to sized canvas
          const sizedCanvas = document.createElement('canvas');
          sizedCanvas.width = w;
          sizedCanvas.height = h;
          const sCtx = sizedCanvas.getContext('2d');
          sCtx.drawImage(handCanvas, 0, 0, w, h);

          // Warmup 2 frames
          for (let i = 0; i < 2; i++) {
            const bmp = await createImageBitmap(sizedCanvas);
            await new Promise(r => {
              worker.onmessage = () => r();
              worker.postMessage({ type: 'DETECT', imageBitmap: bmp, timestamp: 1000 + i * 33 }, [bmp]);
            });
          }

          // Measure 10 frames
          const times = [];
          let detectedCount = 0;
          for (let i = 0; i < 10; i++) {
            const bmp = await createImageBitmap(sizedCanvas);
            const res = await new Promise((r, rej) => {
              worker.onmessage = (e) => {
                if (e.data.type === 'DETECT_RESULT') r(e.data);
                else rej(new Error(e.data.error || 'error'));
              };
              worker.postMessage({ type: 'DETECT', imageBitmap: bmp, timestamp: 2000 + i * 33 }, [bmp]);
            });
            times.push(res.latencyMs);
            detectedCount = res.landmarks?.length || 0;
          }
          worker.terminate();

          times.sort((a,b) => a-b);
          const avg = times.reduce((a,b)=>a+b, 0) / times.length;
          return {
            delegate: delegateName,
            numHands,
            resolution: \`\${w}x\${h}\`,
            avgMs: Number(avg.toFixed(1)),
            minMs: Number(times[0].toFixed(1)),
            maxMs: Number(times[times.length-1].toFixed(1)),
            fps: Number((1000 / avg).toFixed(1)),
            detectedHands: detectedCount,
          };
        }

        const tests = [
          await testWorker('GPU', 2, 320, 240),
          await testWorker('GPU', 2, 256, 192),
          await testWorker('GPU', 2, 192, 144),
          await testWorker('GPU', 1, 256, 192),
          await testWorker('CPU', 2, 320, 240),
          await testWorker('CPU', 2, 256, 192),
        ];

        return tests;
      })()
    `;

    send('Runtime.evaluate', { expression: testCode, awaitPromise: true, returnByValue: true });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.result?.result?.value) {
        console.log('REAL HAND BENCHMARK RESULTS:\n', JSON.stringify(msg.result.result.value, null, 2));
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
