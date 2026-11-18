// Weather (js/weather.js) and the threat progression modes (STRESS in js/radio.js)
const { test, expect } = require('./support/harness');

test.beforeEach(async ({ wp }) => { await wp.boot(); });

const KINDS = ['clear', 'overcast', 'rain', 'fog', 'storm'];

test('every weather kind runs clean: fog pulled in, rain only where it rains, lightning only in the storm', async ({ wp }) => {
  for (const k of KINDS) {
    await wp.run((k) => { CFG.weather = k; WEATHER.setKind(k); }, k);
    expect((await wp.sim(15)).violations, k).toEqual([]);
    const s = await wp.run(() => ({ rain: WEATHER.rain.mesh.visible ? WEATHER.rain.mesh.count : 0, far: scene.fog.far, tag: WEATHER.tag }));
    expect(s.tag, k).toContain(WEATHER_NAMES_OF(k));
    if (k === 'rain' || k === 'storm') expect(s.rain, k).toBeGreaterThan(500); else expect(s.rain, k).toBeLessThan(20);   // the previous kind's rain fades out (2.5 s time constant)
    if (k === 'clear') expect(s.far, k).toBeCloseTo(160 + 260, 0); else expect(s.far, k).toBeLessThan(160 + 260 - 20);
    const fl = await wp.until(() => WEATHER.flash > 0.5, 20);         // a strike every 5–15 s in the storm
    expect(fl.violations, k).toEqual([]);
    expect(fl.done, `lightning in ${k}`).toBe(k === 'storm');
  }
});
function WEATHER_NAMES_OF(k) { return { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Fog', storm: 'Storm' }[k]; }

test('weather off or at 0 % intensity is exactly the stock look, and switching it off fades out', async ({ wp }) => {
  const r = await wp.run(() => {
    const snap = () => { updateEnvironment(); WEATHER.update(0);
      return [hemi.intensity, sunLight.intensity, scene.fog.near, scene.fog.far, '#' + scene.fog.color.getHexString(), '#' + water.material.color.getHexString(), WEATHER.waveMul]; };
    WEATHER.setKind('off'); WEATHER.cur = Object.assign({}, WEATHER_NEUTRAL); WEATHER.intensity = 1;
    const stock = snap();
    WEATHER.setKind('storm'); WEATHER.cur = Object.assign({}, WEATHER_KINDS.storm); WEATHER.intensity = 0; WEATHER.flash = 0;
    const zero = snap();
    WEATHER.intensity = 1; const storm = snap();
    WEATHER.setKind('off'); const justOff = snap();       // no snap back: still storm-like until the blend runs
    return { stock, zero, storm, justOff };
  });
  expect(r.zero).toEqual(r.stock);
  expect(r.storm).not.toEqual(r.stock);
  expect(r.justOff[3], 'switching off fades instead of snapping').toBeLessThan(r.stock[3] - 50);
  await wp.run(() => { CFG.weather = 'off'; });
  await wp.sim(20);
  const after = await wp.run(() => ({ far: scene.fog.far, rain: WEATHER.rain.mesh.visible, settling: WEATHER.settling }));
  expect(after.far).toBeCloseTo(r.stock[3], 0);
  expect(after.rain).toBe(false);
  expect(after.settling).toBe(false);
});

test('switching weather kinds leaks no geometry', async ({ wp }) => {
  await wp.sim(5);
  const rainGeo = await wp.run(() => WEATHER.rain.mesh.geometry.uuid);
  for (let i = 0; i < 3; i++) for (const k of ['storm', 'fog', 'rain', 'off']) {
    await wp.run((k) => { CFG.weather = k; WEATHER.setKind(k); }, k);
    expect((await wp.sim(4)).violations).toEqual([]);
  }
  const late = await wp.run(() => __t.geometries());
  expect(late.leaked).toBe(0);
  expect(await wp.run(() => WEATHER.rain.mesh.geometry.uuid), 'one rain pool, reused').toBe(rainGeo);
});

test('subtitles get a darker backdrop over pale fog, the stock one over the clear sea', async ({ wp }) => {
  const bg = async (k) => { await wp.run((k) => { CFG.weather = k; WEATHER.setKind(k); }, k); await wp.sim(20);
    return wp.run(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--subs-bg') || '0.32')); };
  expect(await bg('off')).toBeCloseTo(0.32, 2);
  expect(await bg('fog')).toBeGreaterThan(0.5);
});

test('threat: the scripted mode walks all five stages, each stage speaks its own tier where intended', async ({ wp }) => {
  const r = await wp.run(() => {
    __t.forceFight(); CFG.threatMode = 'script'; CFG.threatRamp = 100; STRESS.level = 0; STRESS.stage = 0; STRESS.stageT = 0;
    const seen = [], end = {};
    for (let i = 0; i < 2 * 300; i++) {
      const before = STRESS.label; STRESS.update(0.5);
      if (seen[seen.length - 1] !== before) seen.push(before);
      if (STRESS.label !== before) end[before] = STRESS.tier;     // the tier reached at the end of the stage
    }
    return { seen, end };
  });
  expect(r.seen.slice(0, 6)).toEqual(['CALM', 'PROBE', 'ENGAGE', 'SURGE', 'BREAK', 'CALM']);
  expect(r.end).toEqual({ CALM: 'calm', PROBE: 'tense', ENGAGE: 'tense', SURGE: 'panic', BREAK: 'calm' });
});

test('threat: escalation speed scales the ramp, 0 freezes it in both modes', async ({ wp }) => {
  const r = await wp.run(() => {
    __t.forceFight(); CFG.threatMode = 'ramp';
    const rise = (ramp) => { CFG.threatRamp = ramp; STRESS.level = 0.2; for (let i = 0; i < 60; i++) STRESS.update(1); return STRESS.level - 0.2; };
    const out = { stock: rise(100), fast: rise(300), frozen: rise(0) };
    CFG.threatMode = 'script'; CFG.threatRamp = 0; STRESS.level = 0.5; for (let i = 0; i < 60; i++) STRESS.update(1); out.frozenScript = STRESS.level;
    CFG.threatMode = 'ramp'; CFG.threatRamp = 100;
    return out;
  });
  expect(r.stock).toBeCloseTo(60 / 600, 5);
  expect(r.fast).toBeCloseTo(3 * 60 / 600, 5);
  expect(r.frozen).toBe(0);
  expect(r.frozenScript).toBe(0.5);
});
