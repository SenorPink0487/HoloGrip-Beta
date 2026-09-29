import { spawn } from 'child_process';
import fs from 'fs';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9227',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'http://localhost:5173/benchmark.html'
]);

async function run() {
  let pages = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:9227/json');
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

    // 使用不同配置运行自定义基准测试
    const testCode = `
      (async () => {
        const results = [];
        // 在 Worker 中测试
        async function runWorkerTest(name, config) {
          const workerCode = \`
            import { FilesetResolver, HandLandmarker } from '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
            let handLandmarker;
            let canvas;
            self.onmessage = async (e) => {
              const { type } = e.data;
              if (type === 'INIT') {
                const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm', true);
                canvas = new OffscreenCanvas(config.width || 320, config.height || 240);
                const opts = {
                  baseOptions: {
                    modelAssetPath: '/models/hand_landmarker.task',
                    delegate: config.delegate,
                  },
                  runningMode: 'VIDEO',
                  numHands: config.numHands || 2,
                  minHandDetectionConfidence: 0.5,
                  minHandPresenceConfidence: 0.5,
                  minTrackingConfidence: 0.5,
                };
                if (config.delegate === 'GPU') {
                  opts.canvas = canvas;
                }
                handLandmarker = await HandLandmarker.createFromOptions(vision, opts);
                self.postMessage({ type: 'READY' });
              } else if (type === 'DETECT') {
                const t0 = performance.now();
                const res = handLandmarker.detectForVideo(e.data.bitmap, e.data.timestamp);
                const dt = performance.now() - t0;
                e.data.bitmap.close();
                self.postMessage({ type: 'DONE', dt, handsFound: res.landmarks?.length || 0 });
              }
            };
          \`;

          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });

          await new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
              if (e.data.type === 'READY') resolve();
            };
            worker.onerror = reject;
            worker.postMessage({ type: 'INIT' });
          });

          // 创建包含手部测试区域的图像
          const testCanvas = document.createElement('canvas');
          testCanvas.width = config.width || 320;
          testCanvas.height = config.height || 240;
          const ctx = testCanvas.getContext('2d');
          ctx.fillStyle = '#ffdbac';
          ctx.fillRect(50, 50, 100, 120);

          // 预热
          for (let i = 0; i < 3; i++) {
            const bmp = await createImageBitmap(testCanvas);
            await new Promise(res => {
              worker.onmessage = () => res();
              worker.postMessage({ type: 'DETECT', bitmap: bmp, timestamp: performance.now() }, [bmp]);
            });
          }

          // 测量 20 帧处理耗时
          const times = [];
          let handsDetected = 0;
          for (let i = 0; i < 20; i++) {
            const bmp = await createImageBitmap(testCanvas);
            const r = await new Promise(res => {
              worker.onmessage = (e) => res(e.data);
              worker.postMessage({ type: 'DETECT', bitmap: bmp, timestamp: performance.now() }, [bmp]);
            });
            times.push(r.dt);
            handsDetected = r.handsFound;
          }
          worker.terminate();

          times.sort((a,b) => a-b);
          const avg = times.reduce((a,b)=>a+b, 0) / times.length;
          return {
            name,
            avg: Number(avg.toFixed(2)),
            p50: Number(times[Math.floor(times.length*0.5)].toFixed(2)),
            min: Number(times[0].toFixed(2)),
            max: Number(times[times.length-1].toFixed(2)),
            fps: Number((1000 / avg).toFixed(1)),
            handsDetected,
          };
        }

        const suite = [
          { name: 'GPU delegate, numHands=2, 320x240', config: { delegate: 'GPU', numHands: 2, width: 320, height: 240 } },
          { name: 'CPU delegate, numHands=2, 320x240', config: { delegate: 'CPU', numHands: 2, width: 320, height: 240 } },
          { name: 'GPU delegate, numHands=1, 320x240', config: { delegate: 'GPU', numHands: 1, width: 320, height: 240 } },
          { name: 'CPU delegate, numHands=1, 320x240', config: { delegate: 'CPU', numHands: 1, width: 320, height: 240 } },
          { name: 'GPU delegate, numHands=2, 256x256', config: { delegate: 'GPU', numHands: 2, width: 256, height: 256 } },
          { name: 'CPU delegate, numHands=2, 256x256', config: { delegate: 'CPU', numHands: 2, width: 256, height: 256 } },
        ];

        for (const item of suite) {
          try {
            const res = await runWorkerTest(item.name, item.config);
            results.push(res);
          } catch (err) {
            results.push({ name: item.name, error: err.message });
          }
        }

        return results;
      })()
    `;

    send('Runtime.evaluate', { expression: testCode, awaitPromise: true, returnByValue: true });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.result?.result?.value) {
        console.log('RESULTS:\n', JSON.stringify(msg.result.result.value, null, 2));
        ws.close();
        chrome.kill();
        process.exit(0);
      } else if (msg.result?.exceptionDetails) {
        console.error('EXCEPTION:', msg.result.exceptionDetails);
        ws.close();
        chrome.kill();
        process.exit(1);
      }
    };
  };
}

run().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
