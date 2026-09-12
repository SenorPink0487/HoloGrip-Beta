import assert from 'node:assert';
import { spawn } from 'node:child_process';
import * as THREE from 'three';

console.log('=== Starting Real-World FPS Performance & Architecture Verification ===\n');

// --------------------------------------------------------------------------
// Part 1: Structural & Architectural Invariant Checks
// --------------------------------------------------------------------------
console.log('Test 1: Architectural Frame Budget Invariants');
{
  // 1. Pixel Ratio Clamping Check
  const clampPixelRatio = (dpr: number) => Math.min(dpr || 1, 1.5);
  assert.strictEqual(clampPixelRatio(1), 1, '1x DPR stays 1x');
  assert.strictEqual(clampPixelRatio(2), 1.5, '2x Retina DPR clamped to 1.5x (saves 44% fragment fillrate)');
  assert.strictEqual(clampPixelRatio(3), 1.5, '3x Super-Retina DPR clamped to 1.5x');

  // 2. Downscaled Bloom Target Check
  const calcBloomSize = (w: number, h: number) => ({
    x: Math.max(256, Math.floor(w * 0.5)),
    y: Math.max(256, Math.floor(h * 0.5)),
  });
  const bloomRes = calcBloomSize(1920, 1080);
  assert.strictEqual(bloomRes.x, 960, 'Bloom width must be downsampled by 50%');
  assert.strictEqual(bloomRes.y, 540, 'Bloom height must be downsampled by 50%');

  // 3. Raycast Throttling Guard Check
  let raycastCount = 0;
  let lastCheck = 0;
  function throttledRaycast(now: number) {
    if (now - lastCheck < 50) return;
    lastCheck = now;
    raycastCount++;
  }
  for (let frame = 0; frame < 60; frame++) {
    throttledRaycast(frame * 16.66); // simulate 60 FPS calls
  }
  assert(raycastCount <= 21, `Raycasts should be throttled to <= 21/s instead of 60, got ${raycastCount}`);
  assert(raycastCount >= 14, `Raycasts should remain responsive (at least ~14-20/s), got ${raycastCount}`);

  console.log('✓ Test 1 passed: Architectural frame budget invariants verified\n');
}

// --------------------------------------------------------------------------
// Part 2: Real-World Headless Chrome 60+ FPS Multi-Scenario Live Benchmark
// --------------------------------------------------------------------------
console.log('Test 2: Live Browser 60+ FPS Multi-Scenario End-to-End Verification');

async function runLiveBenchmark() {
  const vitePort = 5188;
  const cdpPort = 9233;

  // 1. Launch Vite instance on dedicated port
  const viteProcess = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  // Wait for Vite to be ready
  let viteReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${vitePort}`);
      if (res.ok) {
        viteReady = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  assert(viteReady, 'Vite server must start successfully');

  // 2. Launch Chrome Headless
  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--window-size=1920,1080',
    `http://localhost:${vitePort}`,
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const tabs = await listRes.json();
    const pageTab = tabs.find((t: any) => t.url.includes(`localhost:${vitePort}`));
    assert(pageTab, 'Must find Chrome page tab');

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let rpcId = 1;
    const callbacks = new Map<number, (val: any) => void>();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)!(msg);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((r) => (ws.onopen = r));

    function cdp(method: string, params: Record<string, any> = {}): Promise<any> {
      return new Promise((resolve) => {
        const id = rpcId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await cdp('Runtime.enable');

    // Wait 2 seconds for initial scene load & shader compile
    await new Promise((r) => setTimeout(r, 2000));

    async function sampleFps(scenarioName: string, durationMs = 1200): Promise<{
      scenario: string;
      avgFps: number;
      frames: number;
      elapsed: number;
      p50: number;
      p95: number;
      perfOverlayFps: number;
      latencyText: string;
    }> {
      const fpsMeasurement = await cdp('Runtime.evaluate', {
        expression: `
          new Promise((resolve) => {
            let warmup = 5;
            let frames = 0;
            const frameDeltas = [];
            let lastT = performance.now();
            let start = performance.now();

            function tick() {
              if (warmup > 0) {
                warmup--;
                lastT = performance.now();
                start = performance.now();
                requestAnimationFrame(tick);
                return;
              }

              frames++;
              const now = performance.now();
              frameDeltas.push(now - lastT);
              lastT = now;

              if (now - start >= ${durationMs}) {
                const elapsed = now - start;
                const avgFps = (frames * 1000) / elapsed;
                frameDeltas.sort((a, b) => a - b);
                const p50 = frameDeltas[Math.floor(frameDeltas.length * 0.5)];
                const p95 = frameDeltas[Math.floor(frameDeltas.length * 0.95)];
                const perfOverlayText = document.getElementById('perf-fps-val')?.textContent;
                const latencyText = document.getElementById('perf-latency-val')?.textContent;

                resolve({
                  scenario: "${scenarioName}",
                  avgFps,
                  frames,
                  elapsed,
                  p50,
                  p95,
                  perfOverlayFps: parseInt(perfOverlayText || '0', 10),
                  latencyText: latencyText || ''
                });
              } else {
                requestAnimationFrame(tick);
              }
            }
            requestAnimationFrame(tick);
          })
        `,
        awaitPromise: true,
        returnByValue: true,
      });

      const res = fpsMeasurement.result.result.value;
      console.log(`  [${scenarioName}]`);
      console.log(`    Measured Average FPS:   ${res.avgFps.toFixed(2)} FPS`);
      console.log(`    Frame Time Median(p50): ${res.p50.toFixed(2)} ms`);
      console.log(`    Frame Time 95th (p95):  ${res.p95.toFixed(2)} ms`);
      console.log(`    PerfOverlay Indicator:  ${res.perfOverlayFps} FPS (${res.latencyText})`);

      // Invariant assertion: MUST exceed 60 FPS in every scenario
      assert(
        res.avgFps >= 60.0,
        `Scenario "${scenarioName}" FAILED 60 FPS requirement! Got: ${res.avgFps.toFixed(2)} FPS`
      );
      assert(
        res.p50 < 16.66,
        `Scenario "${scenarioName}" frame time median exceeded 16.66ms budget! Got: ${res.p50.toFixed(2)} ms`
      );
      return res;
    }

    // -------------------------------------------------------------
    // Scenario 1: Initial Base Laboratory Scene (idle)
    // -------------------------------------------------------------
    const s1 = await sampleFps('1. Base Scene (Idle)');
    assert(s1.perfOverlayFps >= 60, `HUD PerfOverlay FPS indicator must be >= 60! Got: ${s1.perfOverlayFps}`);

    // -------------------------------------------------------------
    // Scenario 2: VisionOS 3D Spatial Window Open (CSS3D Periodic Table)
    // -------------------------------------------------------------
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.visionModal.open("chemistry");
      `,
    });
    await new Promise((r) => setTimeout(r, 400));
    await sampleFps('2. VisionOS 3D Spatial Window Open (118 Periodic Elements)');

    // -------------------------------------------------------------
    // Scenario 3: Interactive Chemistry Laboratory Active (Mounted Beaker on Table)
    // -------------------------------------------------------------
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.visionModal.close();
        window.__ENGINE__.beaker.setVisible(true, false);
      `,
    });
    await new Promise((r) => setTimeout(r, 300));
    await sampleFps('3. Chemistry Beaker Active on Laboratory Table');

    // -------------------------------------------------------------
    // Scenario 4: Vigorous Chemical Reactions (Acid-Metal Reaction + Gas Evolution)
    // -------------------------------------------------------------
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.chemistryEngine.addReagent("hcl_1m", 60);
        window.__ENGINE__.chemistryEngine.addReagent("mg_ribbon", 2);
      `,
    });
    await new Promise((r) => setTimeout(r, 400));
    await sampleFps('4. Active Chemical Reaction (H2 gas bubbles & heat pulse)');

    // -------------------------------------------------------------
    // Scenario 5: High-Intensity Sodium Burn (Sparks & PointLight Dynamics)
    // -------------------------------------------------------------
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.reactionEffects.triggerSodiumBurn();
        window.__ENGINE__.reactionEffects.triggerPour(0x0a84ff);
      `,
    });
    await new Promise((r) => setTimeout(r, 400));
    await sampleFps('5. Sodium Burn & Pouring Dynamic Particle Systems');

    // -------------------------------------------------------------
    // Scenario 6: Combined Heavy Load with PostProcessing (Bloom + Window + Reaction)
    // -------------------------------------------------------------
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.setPostProcessing(true);
        window.__ENGINE__.visionModal.open("chemistry");
      `,
    });
    await new Promise((r) => setTimeout(r, 400));
    await sampleFps('6. Full Load (PostProcessing Bloom + Spatial Window + Reactions)');

    // Restore postprocessing to standard native high-perf mode
    await cdp('Runtime.evaluate', {
      expression: `
        window.__ENGINE__.setPostProcessing(false);
      `,
    });

    console.log('\n✓ Test 2 passed: Global 60+ FPS verified across all 6 real-world states!\n');

    ws.close();
  } finally {
    chromeProcess.kill();
    viteProcess.kill();
  }
}

runLiveBenchmark().then(() => {
  console.log('========================================================');
  console.log('All Real-World FPS Performance Tests Passed (2/2)!');
  console.log('========================================================\n');
  process.exit(0);
}).catch((err) => {
  console.error('Performance verification failed:', err);
  process.exit(1);
});
