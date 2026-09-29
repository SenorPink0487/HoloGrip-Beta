import { spawn } from 'child_process';

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9226',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  'about:blank'
]);

async function run() {
  let pages = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:9226/json');
      pages = await res.json();
      if (pages.length) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  ws.onopen = () => {
    let id = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));
    send('Runtime.enable');
    const code = `
      (async () => {
        const workerCode = [
          'self.onmessage = () => {',
          '  const hasWGL = typeof WebGLRenderingContext !== "undefined";',
          '  const hasWGL2 = typeof WebGL2RenderingContext !== "undefined";',
          '  const canvas = new OffscreenCanvas(320, 240);',
          '  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");',
          '  const debugInfo = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;',
          '  const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "unknown";',
          '  const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "unknown";',
          '  self.postMessage({ hasWGL, hasWGL2, renderer, vendor, glType: gl ? gl.constructor.name : null });',
          '};'
        ].join('\\n');
        const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(workerBlob));
        return new Promise((resolve) => {
          worker.onmessage = (e) => resolve(e.data);
          worker.postMessage('go');
        });
      })()
    `;
    send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.result?.result?.value) {
        console.log('Worker WebGL Info:', JSON.stringify(msg.result.result.value, null, 2));
        ws.close();
        chrome.kill();
        process.exit(0);
      }
    };
  };
}
run().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
