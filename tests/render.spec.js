// Rendering invariants (WebGPURenderer on its WebGL 2 backend through SwiftShader; one WebGPU smoke test): GL health, draw-call budget, what is on screen, day / night,
// shadows and their coverage, GPU memory that plateaus. No golden screenshots: checks are relative / structural.
const { test, expect } = require('./support/harness');

test.use({ viewport: { width: 640, height: 360 } });

const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('a day frame renders without GL errors, within the draw-call budget, with the fleet on screen', async ({ wp }) => {
  await wp.boot();
  await wp.sim(5);
  const r = await wp.run(() => {
    __t.render();
    const err = __t.glError();
    return {
      err, calls: __t.drawCalls(), tris: renderer.info.render.triangles, programs: __t.programs(), webgpu: GPU.webgpu,
      center: __t.sample(300, 160, 40, 40), sea: __t.sample(10, 10, 40, 40), seaB: __t.sample(590, 310, 40, 40),
      lost: __t.lost(), lightsOn: ENV.lightsOn, spots: __t.lit()
    };
  });
  expect(r.webgpu, 'the suite runs on the WebGL 2 fallback').toBe(false);
  expect(r.lost).toBe(false);
  expect(r.err, 'gl.getError()').toBe(0);
  expect(r.calls, 'draw calls, main + shadow pass (baseline ~450)').toBeLessThan(700);
  expect(r.calls).toBeGreaterThan(50);
  expect(r.tris).toBeGreaterThan(10000);
  expect(r.programs, 'warmed up front: ~14 programs × 6 searchlight counts').toBeLessThan(120);
  // the sea is blue in both corners; the middle (the carrier) is not sea
  for (const c of [r.sea, r.seaB]) expect(c[2], `sea is blue ${c}`).toBeGreaterThan(c[0]);
  const d = Math.max(...r.center.map((v, i) => Math.abs(v - r.sea[i])));
  expect(d, `carrier in the middle ${r.center} vs sea ${r.sea}`).toBeGreaterThan(15);
  expect(r.lightsOn).toBe(0);
  expect(r.spots, 'searchlights dark by day').toBe(0);
});

test('night is darker than day, with nav lights and searchlights on', async ({ wp }) => {
  await wp.boot();
  await wp.sim(3);
  const day = await wp.run(() => __t.sample(0, 0, 640, 360));
  await wp.boot({ query: '?hour=0' });
  await wp.sim(3);
  const night = await wp.run(() => ({ c: __t.sample(0, 0, 640, 360), on: ENV.lightsOn, nav: NAV_MATS.some(m => m.opacity > 0.5), spots: __t.lit() }));
  expect(lum(night.c)).toBeLessThan(lum(day) * 0.6);
  expect(night.on).toBeGreaterThan(0.9);
  expect(night.nav).toBe(true);
  expect(night.spots).toBeGreaterThan(0);
});

test('shadows darken the sea around the ships, and the shadow camera covers the whole screen', async ({ wp }) => {
  await wp.boot();
  await wp.sim(3);
  const r = await wp.run(() => {
    const on = __t.sample(160, 90, 320, 180);
    // the visible sea's corners lie inside the fitted shadow camera (light space)
    const sc = sunLight.shadow.camera, inside = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([x, y]) => {
      const p = AIRWAR.groundAt(x, y, 0).applyMatrix4(sc.matrixWorldInverse);
      return p.x >= sc.left && p.x <= sc.right && p.y >= sc.bottom && p.y <= sc.top;
    });
    __t.props({ shadows: false }); renderer.shadowMap.needsUpdate = true;
    const off = __t.sample(160, 90, 320, 180);
    return { on, off, inside };
  });
  expect(r.inside).toBe(true);
  expect(lum(r.on), `with shadows ${r.on} vs without ${r.off}`).toBeLessThan(lum(r.off) - 0.3);
});

test('zoom and camera rotation keep the shadow camera fitted', async ({ wp }) => {
  await wp.boot({ query: '?zoom=50' });
  await wp.run(() => { CFG.camRotate = true; CFG.camSpeed = 15; });
  for (let i = 0; i < 6; i++) {
    await wp.sim(4);
    const inside = await wp.run(() => {
      __t.render();
      const sc = sunLight.shadow.camera;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([x, y]) => {
        const p = AIRWAR.groundAt(x, y, 0).applyMatrix4(sc.matrixWorldInverse);
        return p.x >= sc.left - 1e-3 && p.x <= sc.right + 1e-3 && p.y >= sc.bottom - 1e-3 && p.y <= sc.top + 1e-3;
      });
    });
    expect(inside).toBe(true);
  }
});

test('GPU memory plateaus over a long fight with fly-bys, missiles and smoke', async ({ wp }) => {
  await wp.boot();
  await wp.run(() => { CFG.flyby = 10; __t.forceFight(); STRESS.level = 0.8; });
  const mem = [];
  for (let i = 0; i < 20; i++) {
    const r = await wp.sim(30);
    expect(r.violations).toEqual([]);
    mem.push(await wp.run(() => Object.assign(__t.geometries(), { t: renderer.info.memory.textures, p: __t.programs(), calls: __t.drawCalls(), err: __t.glError() })));
  }
  for (const m of mem) {
    expect(m.err).toBe(0); expect(m.calls).toBeLessThan(900);
    expect(m.leaked, `geometries dropped without dispose: ${m.leakedTypes}`).toBe(0);
  }
  const early = mem[6], late = mem[mem.length - 1];
  expect(late.t, 'textures').toBeLessThanOrEqual(early.t + 2);
  expect(late.p, 'shader programs').toBeLessThanOrEqual(early.p + 2);
  expect(late.reach, `reachable geometries ${mem.map(m => m.reach).join(' ')}`).toBeLessThan(early.reach * 1.1 + 20);
});

test('three.js r187 WebGPURenderer keeps the r149 look: no colour management, intensities × π', async ({ wp }) => {
  await wp.boot();
  const r = await wp.run(() => ({ rev: THREE.REVISION, gpu: !!renderer.isWebGPURenderer, cm: THREE.ColorManagement.enabled, out: renderer.outputColorSpace,
    hex: new THREE.Color(0x808080).r, hemi: hemi.intensity / skyAt(ENV.elev).hi, sun: sunLight.intensity / skyAt(ENV.elev).si }));
  expect(r.rev).toBe('187');
  expect(r.gpu).toBe(true);
  expect(r.cm, 'hex colours used as they are').toBe(false);
  expect(r.out).toBe('srgb-linear');
  expect(r.hex).toBeCloseTo(128 / 255, 6);
  expect(r.hemi).toBeCloseTo(Math.PI, 5);
  expect(r.sun).toBeCloseTo(Math.PI, 5);
});

test('shaders are compiled up front: nothing compiles at night, in a fight, in a storm or when helicopters come and go', async ({ wp }) => {
  await wp.boot();
  // render pipelines created (each one a compile); the first frame adds only the shadow-map depth pipelines
  const P = () => wp.run(() => { __t.render(); return __t.pipelines(); });
  await P(); const p0 = await P();
  await wp.run(() => { CFG.timeMode = 'fixed'; CFG.fixedHour = 0; updateEnvironment(); });
  await wp.sim(3);
  expect(await wp.run(() => __t.lit()), 'searchlights on').toBeGreaterThan(0);
  expect(await P(), 'night').toBe(p0);
  let busy = 0;
  for (let t = 0; t < 60; t += 5) { await wp.sim(5, { audio: true }); await P(); busy = Math.max(busy, await wp.run(() => ENEMIES.length + MISSILES.length + AIRWAR.passes.length)); }
  expect(busy, 'a fight happened').toBeGreaterThan(0);
  expect(await P(), 'first fight').toBe(p0);
  await wp.run(() => { CFG.weather = 'storm'; WEATHER.setKind('storm'); });
  await wp.sim(5);
  expect(await P(), 'storm').toBe(p0);
  await wp.run(() => __t.fightOff());
  for (let t = 0; t < 120; t += 10) { await wp.sim(10); await P(); }   // helicopters with searchlights launch and land
  expect(await P(), 'helicopters coming and going').toBe(p0);
});
