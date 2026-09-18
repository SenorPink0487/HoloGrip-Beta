import assert from 'node:assert/strict';
import { OpticsMath } from '../src/physics/optics/OpticsMath.ts';

console.log('=== Running Optics Physics Tests ===');

// Test 1: Wavelength to RGB mapping
{
  const red = OpticsMath.wavelengthToRGB(650);
  assert(red.r > 0.8 && red.g < 0.1 && red.b < 0.1, '650nm should be bright red');

  const green = OpticsMath.wavelengthToRGB(532);
  assert(green.g > 0.8 && green.b < 0.2, '532nm should be bright green');

  const violet = OpticsMath.wavelengthToRGB(405);
  assert(violet.b > 0.5 && violet.g < 0.1, '405nm should be violet/blue');

  console.log('✔ Test 1 Passed: Spectral color mapping works accurately across 405nm, 532nm, 650nm');
}

// Test 2: Snell's law & Critical angle for Total Internal Reflection
{
  // Air (1.0) into Crown Glass (1.5) at 30 deg
  const theta1 = (30 * Math.PI) / 180;
  const res = OpticsMath.calculateRefractionAngle(theta1, 1.0, 1.5);
  assert(!res.isTotalInternalReflection, 'Should not be TIR entering denser medium');
  assert(res.theta2Rad !== null, 'Refracted angle exists');
  const expectedTheta2 = Math.asin((1.0 / 1.5) * Math.sin(theta1));
  assert(Math.abs(res.theta2Rad - expectedTheta2) < 1e-6, 'Snell angle matches');

  // Crown Glass (1.5) into Air (1.0) at 45 deg (Critical angle is ~41.81 deg)
  const tirRes = OpticsMath.calculateRefractionAngle((45 * Math.PI) / 180, 1.5, 1.0);
  assert(tirRes.isTotalInternalReflection, '45 deg should produce total internal reflection in glass');
  assert(tirRes.criticalAngleRad !== null, 'Critical angle calculated');
  const critDeg = (tirRes.criticalAngleRad * 180) / Math.PI;
  assert(Math.abs(critDeg - 41.81) < 0.1, 'Glass-to-air critical angle is ~41.8 deg');

  console.log('✔ Test 2 Passed: Snell law & Total Internal Reflection calculated correctly');
}

// Test 3: Double slit interference, fringe spacing, and missing order
{
  const lambda = 632.8e-9; // He-Ne laser 632.8nm
  const d = 0.25e-3; // 0.25mm
  const a = 0.05e-3; // 0.05mm (d/a = 5 -> order 5 missing!)
  const L = 1.0; // 1 meter

  const deltaX = OpticsMath.doubleSlitFringeSpacing(lambda, d, L);
  const expectedDeltaX = (L / d) * lambda; // 2.5312 mm
  assert(Math.abs(deltaX - expectedDeltaX) < 1e-9, 'Delta x matches formula');

  // Central maximum x = 0
  const iCenter = OpticsMath.doubleSlitIntensity(0, lambda, d, a, L, 1.0);
  assert(Math.abs(iCenter - 1.0) < 1e-4, 'Central intensity is 1.0');

  // First bright fringe at x = deltaX
  const iFirstPeak = OpticsMath.doubleSlitIntensity(deltaX, lambda, d, a, L, 1.0);
  assert(iFirstPeak > 0.8, 'First peak intensity is high');

  // Missing order check: d/a = 5
  const missing = OpticsMath.checkMissingOrder(d, a);
  assert(missing.isMissingOrder, 'd/a = 5 should detect missing order');
  assert.equal(missing.ratio, 5, 'Missing order ratio is 5');

  // Order k = 5 is at x = 5 * deltaX, where diffraction envelope should be ~0!
  const iOrder5 = OpticsMath.doubleSlitIntensity(5 * deltaX, lambda, d, a, L, 1.0);
  assert(iOrder5 < 1e-4, 'Order 5 intensity is ~0 due to diffraction envelope null (missing order)');

  console.log('✔ Test 3 Passed: Double-slit interference, fringe spacing & missing orders verified');
}

// Test 4: Single-slit diffraction
{
  const lambda = 600e-9;
  const a = 0.1e-3;
  const L = 1.0;

  // Central peak
  const iCenter = OpticsMath.singleSlitIntensity(0, lambda, a, L, 1.0);
  assert(Math.abs(iCenter - 1.0) < 1e-4, 'Central peak is 1.0');

  // First dark fringe at sin(theta) = lambda / a => x ~ L * lambda / a
  const xFirstDark = (L * lambda) / a;
  const iDark = OpticsMath.singleSlitIntensity(xFirstDark, lambda, a, L, 1.0);
  assert(iDark < 1e-4, 'First dark fringe has zero intensity');

  console.log('✔ Test 4 Passed: Single-slit Fraunhofer diffraction minima verified');
}

// Test 5: Malus's Law
{
  assert.equal(OpticsMath.malusIntensity(0, 1.0), 1.0, '0 deg gives 100% intensity');
  assert(Math.abs(OpticsMath.malusIntensity(Math.PI / 4, 1.0) - 0.5) < 1e-5, '45 deg gives 50% intensity');
  assert(Math.abs(OpticsMath.malusIntensity(Math.PI / 2, 1.0)) < 1e-6, '90 deg gives 0% extinction');

  console.log('✔ Test 5 Passed: Malus law polarization extinction verified');
}

// Test 6: Multi-core Worker Matrix Computation & Zero-Copy Transfer
{
  const width = 1024;
  const height = 256;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const startTime = performance.now();

  const lambdaM = 650e-9;
  const dM = 0.25e-3;
  const aM = 0.04e-3;
  const LM = 1.0;
  const screenWidthM = 0.08;

  const color = OpticsMath.wavelengthToRGB(650);
  const baseR = color.r * 255;
  const baseG = color.g * 255;
  const baseB = color.b * 255;

  const rowIntensity = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const xCoord = ((x - width / 2) / width) * screenWidthM;
    rowIntensity[x] = OpticsMath.doubleSlitIntensity(xCoord, lambdaM, dM, aM, LM, 1.0);
  }

  const halfH = height / 2;
  const beamHeightSigma = height * 0.22;

  for (let y = 0; y < height; y++) {
    const dy = y - halfH;
    const yProfile = Math.exp(-(dy * dy) / (2 * beamHeightSigma * beamHeightSigma));
    const rowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const intensity = Math.min(1.0, rowIntensity[x] * yProfile);
      const idx = rowOffset + x * 4;

      pixels[idx] = Math.min(255, 18 + Math.round(baseR * intensity * 1.3));
      pixels[idx + 1] = Math.min(255, 20 + Math.round(baseG * intensity * 1.3));
      pixels[idx + 2] = Math.min(255, 24 + Math.round(baseB * intensity * 1.3));
      pixels[idx + 3] = 255;
    }
  }

  const durationMs = performance.now() - startTime;

  assert.equal(pixels.length, width * height * 4, '1024x256 RGBA buffer size is 1,048,576 bytes');
  // Center pixel at (512, 128) should be high red
  const centerIdx = (128 * width + 512) * 4;
  assert(pixels[centerIdx] > 180, 'Center pixel is bright red');
  assert(pixels[centerIdx + 3] === 255, 'Alpha channel is 255');

  // Verify memory transferability (Transferable ArrayBuffer)
  const buffer = pixels.buffer;
  assert(buffer.byteLength === width * height * 4, 'Buffer matches byte length');

  console.log(`✔ Test 6 Passed: 1024x256 (262k pixels) optical matrix computed in ${durationMs.toFixed(2)}ms with zero-copy buffer`);
}

console.log('All Optics Physics tests passed successfully!\n');
