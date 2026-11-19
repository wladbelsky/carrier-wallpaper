// Unit tests of pure helpers, run inside the page (the wallpaper's code is plain global scripts)
const { test, expect } = require('./support/harness');

test.beforeEach(async ({ wp }) => { await wp.boot(); });

test('FlightPath: Dubins curves start and end where asked, never turn tighter than R, and sample continuously', async ({ wp }) => {
  const bad = await wp.run(() => {
    const out = [];
    for (let k = 0; k < 300; k++) {
      const R = rand(4, 30), p0 = new V3(rand(-80, 80), rand(5, 25), rand(-80, 80)), p1 = new V3(rand(-80, 80), rand(5, 25), rand(-80, 80));
      const h0 = rand(0, TAU), h1 = rand(0, TAU);
      const P = new FlightPath().addDubins(p0, h0, p1, h1, R);
      const a = P.sample(0), z = P.sample(P.length);
      const ang = (d, h) => Math.abs(Math.atan2(Math.sin(Math.atan2(d.z, d.x) - h), Math.cos(Math.atan2(d.z, d.x) - h)));
      if (a.pos.distanceTo(p0) > 1e-3 || Math.hypot(z.pos.x - p1.x, z.pos.z - p1.z) > 0.05) out.push(`endpoints off (k=${k})`);
      if (ang(a.dir, h0) > 1e-3 || ang(z.dir, h1) > 0.01) out.push(`headings off (k=${k})`);
      // walk the path: steps of ds move about ds (continuity) and the heading changes by at most ds / R (turn radius)
      const n = 400, ds = P.length / n; let prev = P.sample(0, { pos: new V3(), dir: new V3() });
      prev = { pos: prev.pos.clone(), dir: prev.dir.clone() };
      for (let i = 1; i <= n; i++) {
        const s = P.sample(i * ds);
        const step = Math.hypot(s.pos.x - prev.pos.x, s.pos.z - prev.pos.z);
        if (step > ds * 1.01 + 1e-6) { out.push(`jump of ${step.toFixed(3)} > ${ds.toFixed(3)} (k=${k})`); break; }
        const dh = Math.abs(Math.atan2(prev.dir.x * s.dir.z - prev.dir.z * s.dir.x, prev.dir.x * s.dir.x + prev.dir.z * s.dir.z));
        if (dh > ds / R * 1.05 + 1e-6) { out.push(`turn tighter than R (k=${k})`); break; }
        prev = { pos: s.pos.clone(), dir: s.dir.clone() };
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('FlightPath: lines and chained pieces add up', async ({ wp }) => {
  const r = await wp.run(() => {
    const P = new FlightPath().addLine(new V3(0, 10, 0), new V3(30, 10, 0)).addDubins(new V3(30, 10, 0), 0, new V3(30, 10, 60), Math.PI, 12).addLine(new V3(30, 10, 60), new V3(0, 10, 60));
    const mid = P.sample(15);
    return { len: P.length, first: P.pieces[0].len, mid: [mid.pos.x, mid.pos.z], end: P.sample(P.length).pos.toArray(), over: P.sample(P.length + 50).pos.toArray() };
  });
  expect(r.first).toBeCloseTo(30, 6);
  expect(r.mid[0]).toBeCloseTo(15, 6); expect(r.mid[1]).toBeCloseTo(0, 6);
  expect(r.end[0]).toBeCloseTo(0, 3); expect(r.end[2]).toBeCloseTo(60, 3);
  expect(r.over.every(Number.isFinite)).toBe(true);
});

test('radio: placeholders, tiers, peace lines and no repeats in a row', async ({ wp }) => {
  const r = await wp.run(() => {
    const out = {};
    out.fill = [fillLine('{C}, bearing {B}', { C: 'JOKER 1', B: 'one-two-zero' }), fillLine('{X} stays', { C: 'a' }), fillLine('no vars')];
    const pool = { peace: ['P1', 'P2'], calm: ['C1', 'C2'], panic: ['X1', 'X2'] };
    AUD.combat = false; STRESS.level = 0.9;
    out.peace = new Set(Array.from({ length: 40 }, () => radioLine(pool)));
    AUD.combat = true; STRESS.level = 0.9;
    out.panic = new Set(Array.from({ length: 200 }, () => radioLine(pool)));
    STRESS.level = 0.5;   // tense: missing → falls back to calm
    out.tense = new Set(Array.from({ length: 40 }, () => radioLine(pool)));
    STRESS.level = 0.1;
    out.calm = new Set(Array.from({ length: 40 }, () => radioLine(pool)));
    AUD.combat = false;
    const list = ['a', 'b', 'c'], seq = Array.from({ length: 200 }, () => radioLine(list));   // no repeats per list object
    out.repeats = seq.filter((x, i) => i && x === seq[i - 1]).length;
    out.single = radioLine(['only']);
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v instanceof Set ? [...v].sort() : v]));
  });
  expect(r.fill).toEqual(['JOKER 1, bearing one-two-zero', '{X} stays', 'no vars']);
  expect(r.peace).toEqual(['P1', 'P2']);
  expect(r.panic).toEqual(['C1', 'C2', 'X1', 'X2']);   // the calmer tier mixed in (MIX_CALMER), never peace
  expect(r.tense).toEqual(['C1', 'C2']);
  expect(r.calm).toEqual(['C1', 'C2']);
  expect(r.repeats).toBe(0);
  expect(r.single).toBe('only');
});

test('threat tiers follow STRESS.level', async ({ wp }) => {
  const r = await wp.run(() => [0, 0.32, 0.34, 0.65, 0.67, 1].map(l => { STRESS.level = l; return [STRESS.tier, STRESS.label]; }));
  expect(r.map(x => x[0])).toEqual(['calm', 'calm', 'tense', 'tense', 'panic', 'panic']);
  expect(r[0][1]).toBe('LOW'); expect(r[5][1]).toBe('CRITICAL');
});

test('bearings and compass words', async ({ wp }) => {
  const r = await wp.run(() => {
    const words = [], comp = [];
    for (let i = 0; i < 360; i += 7) { words.push(bearingWords(i * DEG)); comp.push(compassWord(i * DEG)); }
    return { words, comp, b0: bearingWords(-Math.PI / 2), c0: compassWord(0), c90: compassWord(Math.PI / 2) };
  });
  for (const w of r.words) expect(w).toMatch(/^(zero|one|two|three|four|five|six|seven|eight|niner)(-(zero|one|two|three|four|five|six|seven|eight|niner)){2}$/);
  for (const c of r.comp) expect(['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']).toContain(c);
  expect(r.b0).toBe('zero-zero-zero');
  expect(r.c0).toBe('east'); expect(r.c90).toBe('south');
});

test('mission texts: every order / done pair fills all its placeholders', async ({ wp }) => {
  const left = await wp.run(() => {
    const keys = [];
    (function walk(o, p) {
      if (Array.isArray(o) && Array.isArray(o[0])) { keys.push(p.join('.')); return; }
      for (const k in o) walk(o[k], [...p, k]);
    })(MISSIONS, []);
    const out = [];
    for (const k of keys) for (let i = 0; i < 30; i++) {
      const { order, done } = makeMission(k, { V: 'a container feeder', T: 'Su-33 Flanker' });
      for (const s of [order, done]) if (/\{\w+\}/.test(s)) out.push(`${k}: ${s}`);
    }
    return { keys, out: [...new Set(out)] };
  });
  expect(left.keys.length).toBeGreaterThan(5);
  expect(left.out).toEqual([]);
});

test('callsigns: flights of 4 / 2 / 1, the pool wraps with a suffix, csNum and flightOf', async ({ wp }) => {
  const r = await wp.run(() => ({
    fa18: callsignsFor('fa18', 5), e2d: callsignsFor('e2d', 2), mh60: callsignsFor('mh60', 3),
    wrap: callsignsFor('fa18', CALLSIGNS.fa18.length * 4 + 1).pop(), pool: CALLSIGNS.fa18[0],
    num: [csNum({ callsign: 'JOKER 3' }), csNum({ callsign: 'SKYEYE' })], flight: [flightOf({ callsign: 'JOKER 3' }), flightOf({ callsign: 'SEA GOBLIN 2' })]
  }));
  const J = r.pool;
  expect(r.fa18).toEqual([`${J} 1`, `${J} 2`, `${J} 3`, `${J} 4`, expect.stringMatching(/ 1$/)]);
  expect(r.fa18[4].startsWith(J)).toBe(false);
  expect(r.e2d.every(c => !/\d$/.test(c))).toBe(true);
  expect(r.mh60[0].replace(/ \d$/, '')).toBe(r.mh60[1].replace(/ \d$/, ''));
  expect(r.mh60[2].replace(/ \d$/, '')).not.toBe(r.mh60[0].replace(/ \d$/, ''));
  expect(r.wrap).toBe(`${J}-2 1`);
  expect(r.num).toEqual([3, 0]);
  expect(r.flight).toEqual(['JOKER', 'SEA GOBLIN']);
});

test('pickMission respects allow-lists and eligibility', async ({ wp }) => {
  const r = await wp.run(() => {
    const picks = {};
    for (const key of Object.keys(AIRCRAFT_TYPES)) {
      const a = AIRCRAFT.find(x => x.spec.key === key && x.host === CARRIER); if (!a) continue;
      const s = new Set(); for (let i = 0; i < 300; i++) { const M = pickMission(a); s.add(M ? M.key : null); }
      picks[key] = [...s].sort();
    }
    return { picks, types: Object.keys(MISSION_TYPES).sort() };
  });
  expect(r.types).toEqual(expect.arrayContaining(['patrol', 'cod', 'sling', 'ship', 'pilot']));
  expect(r.picks.cmv22).toEqual(['cod']);
  for (const k of ['fa18', 'f14', 'f35', 'e2d', 'ah1']) for (const bad of ['cod', 'sling', 'ship', 'pilot']) expect(r.picks[k], `${k} never gets ${bad}`).not.toContain(bad);
  expect(r.picks.mh60).toEqual(expect.arrayContaining(['patrol', 'ship', 'pilot', 'sling']));
  expect(r.picks.ch53).toContain('sling');
  for (const bad of ['ship', 'pilot', 'cod']) expect(r.picks.ch53).not.toContain(bad);
});

test('sun position and sky palette: day above the horizon, night below', async ({ wp }) => {
  const r = await wp.run(() => {
    const d = h => new Date(Date.UTC(2026, 5, 21, h));
    const noon = sunPosition(d(12), CFG.lat, 0), night = sunPosition(d(0), CFG.lat, 0), winter = sunPosition(new Date(Date.UTC(2026, 11, 21, 12)), CFG.lat, 0);
    const day = skyAt(noon.elev), dark = skyAt(night.elev), lum = c => c.r + c.g + c.b;
    return { noon: noon.elev, night: night.elev, winter: winter.elev, dayLum: lum(day.fog), nightLum: lum(dark.fog), si: [day.si, dark.si] };
  });
  expect(r.noon).toBeGreaterThan(60); expect(r.noon).toBeLessThan(75);
  expect(r.night).toBeLessThan(-10);
  expect(r.winter).toBeLessThan(r.noon - 30);
  expect(r.dayLum).toBeGreaterThan(r.nightLum);
  expect(r.si[0]).toBeGreaterThan(r.si[1]);
});

/* Evaluates the TSL graph of waveNodes() (core.js) on the CPU: constants, uniforms, swizzles, + − × ÷, sin / cos / negate /
   normalize and vecN() joins are all it uses. p = uniform vec2 (x, z), ph = uniform vec4 (WAVE.phase), amp = uniform. */
const evalWaves = () => {
  window.__evalNode = function ev(n) {
    const v = x => (typeof x === 'number' ? [x] : x.isVector2 ? [x.x, x.y] : x.isVector3 ? [x.x, x.y, x.z] : x.isVector4 ? [x.x, x.y, x.z, x.w] : x.isColor ? [x.r, x.g, x.b] : [Number(x)]);
    const zip = (a, b, f) => { const k = Math.max(a.length, b.length); return Array.from({ length: k }, (_, i) => f(a[a.length === 1 ? 0 : i], b[b.length === 1 ? 0 : i])); };
    if (n.isConstNode || n.isUniformNode) return v(n.value);
    if (n.isSplitNode) { const s = ev(n.node); return [...n.components].map(c => s['xyzw'.indexOf(c)]); }
    if (n.isOperatorNode) {
      const f = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b }[n.op];
      if (!f) throw new Error('operator ' + n.op);
      return zip(ev(n.aNode), ev(n.bNode), f);
    }
    if (n.isMathNode) {
      const a = ev(n.aNode);
      if (n.method === 'normalize') { const l = Math.hypot(...a); return a.map(x => x / l); }
      const f = { sin: Math.sin, cos: Math.cos, negate: x => -x }[n.method];
      if (!f) throw new Error('math ' + n.method);
      return a.map(f);
    }
    if (Array.isArray(n.nodes)) return n.nodes.flatMap(ev);                                        // JoinNode (vecN)
    if (n.isConvertNode || n.isVarNode || n.isContextNode) return ev(n.node);
    throw new Error('node type ' + n.type + ' / ' + n.constructor.name);
  };
};

test('waves: the TSL height (waveNodes) matches the JS wave function, its normal is the gradient', async ({ wp }) => {
  await wp.run(evalWaves);
  const r = await wp.run(() => {
    WAVE.amp = 1.3; for (let i = 0; i < 37; i++) waveAdvance(0.1);
    const { uniform } = THREE.TSL, p = uniform(new THREE.Vector2()), ph = uniform(new THREE.Vector4(...WAVE.phase)), amp = uniform(WAVE.amp);
    const w = waveNodes(p, ph, amp), d = 1e-4;
    let eh = 0, en = 0;
    for (let k = 0; k < 200; k++) {
      const x = rand(-150, 150), z = rand(-150, 150); p.value.set(x, z);
      eh = Math.max(eh, Math.abs(__evalNode(w.h)[0] - waveH(x, z)));
      const gx = (waveH(x + d, z) - waveH(x - d, z)) / (2 * d), gz = (waveH(x, z + d) - waveH(x, z - d)) / (2 * d);
      const l = Math.hypot(gx, 1, gz), want = [-gx / l, 1 / l, -gz / l], got = __evalNode(w.normal);
      en = Math.max(en, ...got.map((g, i) => Math.abs(g - want[i])));
    }
    return { eh, en, len: __evalNode(w.normal).length };
  });
  expect(r.len).toBe(3);
  expect(r.eh).toBeLessThan(1e-9);
  expect(r.en).toBeLessThan(1e-5);
});

test('waves: the water material moves its vertices with waveNodes and the shared phase / amplitude uniforms', async ({ wp }) => {
  const r = await wp.run(() => ({ node: !!water.material.isNodeMaterial, pos: !!water.material.positionNode, ph: waterUniforms.uPh.isUniformNode, amp: waterUniforms.uAmp.isUniformNode,
    phOk: (() => { step(0.05); return [0, 1, 2, 3].every(i => Math.abs(waterUniforms.uPh.value.getComponent(i) - WAVE.phase[i]) < 1e-9) && waterUniforms.uAmp.value === WAVE.amp; })() }));
  expect(r).toEqual({ node: true, pos: true, ph: true, amp: true, phOk: true });
});

test('models: every builder runs, mergeStatic keeps dynamic nodes, disposeTree spares shared materials', async ({ wp }) => {
  const r = await wp.run(() => {
    const out = { built: [], fail: [] };
    const air = { buildFA18, buildF14, buildF35, buildE2D, buildMQ25, buildMH60, buildCH53, buildAH1, buildCMV22, buildSu25, buildSu33, buildSu47, buildSu57 };
    for (const [n, f] of Object.entries(air)) {
      try {
        const m = f(), grp = m.group || m; if (!grp.isObject3D) throw new Error('no group');   // enemy builders return the group itself
        if (m.setFold) { m.setFold(1); m.setFold(0); }
        if (m.tick) m.tick(0.05, { rotor: 1, fold: 0, gear: 1, glow: 0, v: 10 });
        let meshes = 0; grp.traverse(o => { if (o.isMesh) meshes++; });
        out.built.push([n, meshes]); disposeTree(grp);
      } catch (e) { out.fail.push(n + ': ' + e.message); }
    }
    for (const [n, f] of Object.entries({ buildFeeder, buildTrawler, buildCorvette, buildDestroyerTemplate, buildBoat, buildVampire, wreck: () => buildWreck(buildF14) })) {
      try { const g = f(); const grp = g.group || g; if (!grp.isObject3D) throw new Error('no group'); out.built.push([n, 1]); disposeTree(grp); }
      catch (e) { out.fail.push(n + ': ' + e.message); }
    }
    // the live carrier: radars / lifts / CIWS mounts are still separate, movable nodes inside its group
    const inTree = o => { let p = o; while (p && p !== CARRIER.group) p = p.parent; return !!p; };
    out.dyn = [...CARRIER.radars, ...CARRIER.lifts.map(L => L.grp), ...CARRIER.ciws.map(c => c.yawG)].every(inTree);
    let carrierMeshes = 0; CARRIER.group.traverse(o => { if (o.isMesh) carrierMeshes++; }); out.carrierMeshes = carrierMeshes;
    // mergeStatic on a hand-made group
    const root = new THREE.Group(), dyn = new THREE.Group(); root.add(dyn);
    for (let i = 0; i < 3; i++) box(root, 1, 1, 1, 0x123456, i * 2, 0, 0);
    box(dyn, 1, 1, 1, 0x123456, 0, 2, 0); box(dyn, 1, 1, 1, 0x123456, 0, 4, 0);
    mergeStatic(root, [dyn]);
    out.merge = { rootMeshes: root.children.filter(c => c.isMesh).length, dynKept: dyn.parent === root, dynMeshes: dyn.children.filter(c => c.isMesh).length };
    // disposeTree: shared (cached) materials survive, own materials and geometries are disposed
    const g2 = new THREE.Group(), shared = M(0x654321), own = new THREE.MeshBasicMaterial(), geo = new THREE.BoxGeometry();
    g2.add(new THREE.Mesh(geo, shared), new THREE.Mesh(new THREE.BoxGeometry(), own));
    const disposed = []; shared.addEventListener('dispose', () => disposed.push('shared')); own.addEventListener('dispose', () => disposed.push('own')); geo.addEventListener('dispose', () => disposed.push('geo'));
    disposeTree(g2); out.disposed = disposed.sort();
    return out;
  });
  expect(r.fail).toEqual([]);
  expect(r.built.length).toBe(20);
  expect(r.dyn).toBe(true);
  expect(r.carrierMeshes).toBeLessThan(400);
  expect(r.merge).toEqual({ rootMeshes: 1, dynKept: true, dynMeshes: 1 });
  expect(r.disposed).toEqual(['geo', 'own']);
});
