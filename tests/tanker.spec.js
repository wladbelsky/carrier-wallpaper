// MQ-25 refuelling passes: who joins, the basket / wing slots, how the pass ends (peace, combat, abort), the timer
const { test, expect } = require('./support/harness');

async function ready(wp) {
  await wp.boot();
  await wp.run(() => {
    CFG.auto = false; CFG.missions = 0; CFG.flyby = 0; buildAirWing(); TANKER.timer = 1e9; __t.reset();
    window.__said = []; const say = RADIO.say.bind(RADIO); RADIO.say = (who, text, o) => { __said.push(who + ': ' + text); return say(who, text, o); };
    window.__f = AIRCRAFT.filter(a => a.spec.key === 'mq25' || (a.spec.key === 'fa18' && /\s[1-4]$/.test(a.callsign) && flightOf(a) === CALLSIGNS.fa18[0]));
    __f.forEach(a => a.requestLaunch());
  });
  const up = await wp.until(() => __f.every(a => a.state === 'orbit'), 900);
  expect(up.done, JSON.stringify(await wp.states())).toBe(true);
  await wp.sim(35);   // the tanker needs airT > 20 (and receivers > 10 in peace, > 30 in combat)
}
/* step through the pass, checking the slot geometry; returns what was seen */
async function runPass(wp, limit) {
  const seen = { boarded: false, hose: false, basket: new Set(), badSlots: [] };
  for (let t = 0; t < limit; t += 1) {
    const r = await wp.sim(1);
    expect(r.violations).toEqual([]);
    const s = await wp.run(() => {
      const ev = TANKER.ev; if (!ev) return { done: true };
      const tk = ev.tanker, out = { done: false, boarded: !!ev.P, hose: tk.hoseOut === 1, basket: [], bad: [] };
      if (ev.P) ev.recv.forEach((a, i) => {
        if (a.slot === TANK_BASKET) out.basket.push(a.callsign);
        if (i === ev.cur && a.slot !== TANK_BASKET) out.bad.push(`${a.callsign} should be in the basket`);
        if (i < ev.cur && !(a.slot[1] < 0)) out.bad.push(`${a.callsign} (done) should be on the left wing`);
        if (i > ev.cur && !(a.slot[1] > 0)) out.bad.push(`${a.callsign} (to go) should be on the right wing`);
        // receivers hold their slot behind the tanker along the path
        if (tk.state === 'tank_pass' && !a.passDone && Math.abs(tk.ps - a.ps - a.slot[0]) > 2) out.bad.push(`${a.callsign} ${(tk.ps - a.ps).toFixed(1)} behind instead of ${a.slot[0]}`);
      });
      return out;
    });
    if (s.done) return Object.assign(seen, { done: true });
    seen.boarded = seen.boarded || s.boarded; seen.hose = seen.hose || s.hose;
    if (s.basket.length) seen.basket.add(s.basket.length);
    seen.badSlots.push(...s.bad);
  }
  return Object.assign(seen, { done: false });
}

test('peacetime pass: the flight joins the tanker, one jet in the basket, everyone back in orbit', async ({ wp }) => {
  await ready(wp);
  const st = await wp.run(() => ({ ok: TANKER.start(), recv: TANKER.ev && TANKER.ev.recv.map(a => a.callsign), states: __f.map(a => a.state) }));
  expect(st.ok).toBe(true);
  expect(st.recv.length).toBeGreaterThanOrEqual(1); expect(st.recv.length).toBeLessThanOrEqual(4);
  expect(st.states.every(s => s === 'tank_out')).toBe(true);
  const seen = await runPass(wp, 400);
  expect(seen.done, 'the event ends').toBe(true);
  expect(seen.boarded, 'the pass was flown').toBe(true);
  expect(seen.hose, 'hose out during the pass').toBe(true);
  expect([...seen.basket]).toEqual([1]);
  expect(seen.badSlots.slice(0, 5)).toEqual([]);
  const back = await wp.until(() => __f.every(a => a.state === 'orbit' && !a.tank), 300);
  expect(back.done, JSON.stringify(await wp.states())).toBe(true);
  const said = await wp.run(() => __said.join('\n'));
  expect(said.length, 'refuelling radio').toBeGreaterThan(0);
  expect(await wp.stuck()).toEqual([]);
});

test('combat pass: receivers wait off-screen in combat and return to the fight', async ({ wp }) => {
  await ready(wp);
  await wp.run(() => __t.forceFight());
  const idle = await wp.until(() => AIRWAR.idle(FixedWing).filter(a => a.spec.armed && a.airT > 30).length > 0, 200);
  expect(idle.done).toBe(true);
  const ok = await wp.run(() => { const ok = TANKER.start(); window.TANKER_RECV = ok ? TANKER.ev.recv.slice() : []; return ok; });
  expect(ok).toBe(true);
  expect(await wp.run(() => TANKER.ev.combat && TANKER.ev.recv.every(a => a.state === 'cbt_tank'))).toBe(true);
  const seen = await runPass(wp, 400);
  expect(seen.done).toBe(true);
  expect(seen.boarded).toBe(true);
  expect(seen.badSlots.slice(0, 5)).toEqual([]);
  // receivers are back in the fight at once; the tanker flies tank_back to its orbit (keeping a.tank until it is there)
  expect(await wp.run(() => TANKER_RECV.every(a => a.state.startsWith('cbt_') && a.state !== 'cbt_tank' && !a.tank))).toBe(true);
  const home = await wp.until(() => !AIRCRAFT.some(a => a.tank) && AIRCRAFT.find(a => a.spec.tanker).state === 'orbit', 300);
  expect(home.done, JSON.stringify(await wp.states())).toBe(true);
});

test('a pass that cannot assemble in 45 s is aborted and everyone goes back', async ({ wp }) => {
  await ready(wp);
  await wp.run(() => { TANKER.start(); });
  await wp.sim(1);
  await wp.run(() => { TANKER.ev.t = 50; });   // as if a receiver never got there
  await wp.sim(1);
  expect(await wp.run(() => TANKER.ev)).toBeNull();
  const back = await wp.until(() => __f.every(a => a.state === 'orbit' && !a.tank), 400);
  expect(back.violations).toEqual([]);
  expect(back.done, JSON.stringify(await wp.states())).toBe(true);
});

test('the peacetime timer launches the tanker and starts passes by itself', async ({ wp }) => {
  await wp.boot();
  await wp.run(() => { TANKER.timer = 120; });
  const r = await wp.until(() => [...__t.log.values()].some(l => l.includes('tank_pass')), 900);
  expect(r.violations).toEqual([]);
  expect(r.done, 'a refuelling pass within 15 min').toBe(true);
  const fin = await wp.until(() => !TANKER.ev && !AIRCRAFT.some(a => a.tank), 600);
  expect(fin.done).toBe(true);
  expect(await wp.stuck()).toEqual([]);
});
