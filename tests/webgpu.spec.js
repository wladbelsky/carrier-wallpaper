// The WebGPU backend (SwiftShader's WebGPU adapter, see playwright.config.js). Headless Chromium loses the device as soon
// as a WebGPU canvas is presented, so these tests never render to the canvas: frames go into a RenderTarget and are read
// back asynchronously (__t.sampleRT). Everything else runs on the WebGL 2 fallback (harness).
const { test, expect } = require('./support/harness');

test.use({ viewport: { width: 640, height: 360 } });

const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('WebGPU: boots on the WebGPU backend, warms up and renders day and night frames', async ({ wp }) => {
  await wp.boot({ gl: 'webgpu' });
  const info = await wp.run(() => ({ webgpu: GPU.webgpu, device: !!renderer.backend.device, adapter: !!navigator.gpu }));
  expect(info.adapter, 'navigator.gpu').toBe(true);
  expect(info.webgpu, 'WebGPURenderer chose the WebGPU backend').toBe(true);
  expect(info.device).toBe(true);
  await wp.sim(5);
  const day = await wp.run(async () => ({ sea: await __t.sampleRT(10, 10, 40, 40), center: await __t.sampleRT(300, 160, 40, 40), all: await __t.sampleRT(0, 0, 640, 360), p0: __t.pipelines() }));
  expect(day.sea[2], `sea is blue ${day.sea}`).toBeGreaterThan(day.sea[0]);
  expect(Math.max(...day.center.map((v, i) => Math.abs(v - day.sea[i]))), `carrier in the middle ${day.center} vs sea ${day.sea}`).toBeGreaterThan(15);
  await wp.run(() => { CFG.timeMode = 'fixed'; CFG.fixedHour = 0; updateEnvironment(); });
  await wp.sim(3);
  const night = await wp.run(async () => ({ all: await __t.sampleRT(0, 0, 640, 360), p: __t.pipelines(), lit: __t.lit() }));
  expect(lum(night.all)).toBeLessThan(lum(day.all) * 0.6);
  expect(night.lit, 'searchlights on').toBeGreaterThan(0);
  expect(night.p, 'nothing compiles at night').toBe(day.p0);
});

test('WebGPU: a fight with smoke, flashes and tracers renders and compiles nothing new', async ({ wp }) => {
  await wp.boot({ gl: 'webgpu' });
  await wp.run(async () => { await __t.sampleRT(0, 0, 8, 8); await __t.sampleRT(0, 0, 8, 8); });   // first frames: shadow pipelines
  const p0 = await wp.run(() => __t.pipelines());
  await wp.run(() => { __t.forceFight(); STRESS.level = 0.8; });
  let busy = 0;
  for (let t = 0; t < 40; t += 5) {
    await wp.sim(5);
    const r = await wp.run(async () => ({ c: await __t.sampleRT(0, 0, 640, 360), n: ENEMIES.length + MISSILES.length + AIRWAR.passes.length, dev: !!renderer.backend.device }));
    busy = Math.max(busy, r.n); expect(r.dev).toBe(true); expect(r.c.every(Number.isFinite)).toBe(true);
  }
  expect(busy, 'a fight happened').toBeGreaterThan(0);
  expect(await wp.run(() => __t.pipelines()), 'pipelines compiled in the fight').toBe(p0);
});
