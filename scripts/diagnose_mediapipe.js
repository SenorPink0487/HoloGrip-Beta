import { spawn } from 'child_process';
import fs from 'fs';

const screenshotBase64 = fs.readFileSync('/Users/senor/.gemini/antigravity/brain/8930e95c-c0d5-44a3-a6ba-5536147448fb/.user_uploaded/media_1790655698899.png').toString('base64');
const dataUrl = `data:image/png;base64,${screenshotBase64}`;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9230',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'http://localhost:5173/benchmark.html'
]);

async function run() {
  let page = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:9230/json');
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
    send('Network.enable');
    send('Runtime.enable');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params.request.url;
        if (url.includes('wasm') || url.includes('task')) {
          console.log('[NETWORK REQUEST]', url);
        }
      }
      if (msg.result?.result?.value) {
        console.log('EVAL RESULT:', msg.result.result.value);
      }
    };

    setTimeout(() => {
      const testCode = `
        (async () => {
          const { FilesetResolver, HandLandmarker } = await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
          console.log('Resolving vision tasks...');
          const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm', true);
          return 'Vision resolved';
        })()
      `;
      send('Runtime.evaluate', { expression: testCode, awaitPromise: true, returnByValue: true });
    }, 1000);
  };
}

run().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
