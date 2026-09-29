import { spawn } from 'child_process';
import fs from 'fs';

const screenshotBase64 = fs.readFileSync('/Users/senor/.gemini/antigravity/brain/8930e95c-c0d5-44a3-a6ba-5536147448fb/.user_uploaded/media_1790655698899.png').toString('base64');
const dataUrl = `data:image/png;base64,${screenshotBase64}`;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9229',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'http://localhost:5173/benchmark.html'
]);

async function run() {
  let page = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:9229/json');
      const pages = await res.json();
      page = pages && (pages.find(p => p.url.includes('benchmark.html')) || pages[0]);
      if (page) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = () => {
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));
    send('Runtime.enable');

    const testCode = `
      (async () => {
        const img = new Image();
        img.src = "${dataUrl}";
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        const testCanvas = document.createElement('canvas');
        testCanvas.width = 320;
        testCanvas.height = 240;
        const ctx = testCanvas.getContext('2d');
        ctx.drawImage(img, 775, 145, 230, 160, 0, 0, 320, 240);

        // 测试主线程 MediaPipe
        const { FilesetResolver, HandLandmarker } = await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm', true);

        async function testMainThread(delegateName) {
          const landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate: delegateName,
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          // 预热
          for (let i = 0; i < 2; i++) {
            landmarker.detectForVideo(testCanvas, 1000 + i * 33);
          }

          const times = [];
          for (let i = 0; i < 10; i++) {
            const t0 = performance.now();
            const res = landmarker.detectForVideo(testCanvas, 2000 + i * 33);
            const dt = performance.now() - t0;
            times.push(dt);
          }
          landmarker.close();

          times.sort((a,b)=>a-b);
          const avg = times.reduce((a,b)=>a+b,0) / times.length;
          return {
            mode: 'MainThread',
            delegate: delegateName,
            avgMs: Number(avg.toFixed(1)),
            minMs: Number(times[0].toFixed(1)),
            maxMs: Number(times[times.length-1].toFixed(1)),
            fps: Number((1000 / avg).toFixed(1)),
          };
        }

        const resGpu = await testMainThread('GPU');
        const resCpu = await testMainThread('CPU');

        return [resGpu, resCpu];
      })()
    `;

    send('Runtime.evaluate', { expression: testCode, awaitPromise: true, returnByValue: true });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.result?.result?.value) {
        console.log('MAIN THREAD BENCHMARK RESULTS:\n', JSON.stringify(msg.result.result.value, null, 2));
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
