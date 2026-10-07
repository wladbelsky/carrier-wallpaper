'use strict';
/* ===== Aerial refuelling passes (MQ-25 tanker) =====
   Now and then an airborne tanker and a fighter flight leave the screen and then cross it together: the tanker leads
   with its hose out, one receiver in the basket, the others waiting on its right wing; they take turns. Afterwards the
   flight's time in the air is reset and it goes back to its orbit (in combat: back to the fight, cbt_wait); the tanker
   returns to its orbit.
   States: tank_out (flying off-screen) → tank_wait (hidden until everyone is there) → tank_pass → tank_back (to the orbit).
   In combat the receivers are already off-screen (cbt_wait): they wait hidden in cbt_tank (still in combat) and fly the
   pass in it. FixedWing.updateState hands an aircraft with a.tank = <event> to TANKER.fly.                           */
Object.assign(STATUS, { tank_out: ['TANKER ▶', 'air'], tank_wait: ['TANKING', 'air'], tank_pass: ['REFUELING', 'air'], tank_back: ['RETURN', 'air'], cbt_tank: ['REFUELING', 'air'] });
// slots as [gap behind the tanker along the path, side offset (+ = right), height]: the basket hangs off the left-wing pod;
// receivers still waiting hold on the right wing, the ones done move out to the left (no crossing paths on a swap)
const TANK_BASKET = [3.2, -0.53, -0.24];
const tankWing = (k, side) => [1.5 + 0.7 * k, side * (2.9 + 2.4 * k), 0.1 + 0.1 * k];

const TANKER = registerMissionWorld({
  ev: null, timer: rand(40, 80),
  reset() { this.ev = null; this.timer = rand(40, 80); },
  update(dt) {
    if (this.ev) { this.tick(this.ev, dt); return; }
    if ((this.timer -= dt) > 0) return;
    const combat = combatOn();
    if (combat && !AUD.fighting) { this.timer = 5; return; }      // holding after the music stopped: nothing new
    this.timer = this.start() ? (combat ? rand(35, 70) : rand(60, 120)) : rand(8, 15);   // nobody ready: look again soon
  },

  /* a tanker on station and a flight that has been up a while (in combat: fighters waiting off-screen) */
  start() {
    const combat = combatOn();
    const tankers = AIRCRAFT.filter(a => a.spec.tanker && a.state === 'orbit' && !a.landReq && !a.retiring && !a.tank && a.airT > 20);
    if (!tankers.length) return false;
    const flights = [];
    if (combat) {
      const g = new Map();
      for (const a of AIRWAR.idle(FixedWing)) if (a.spec.armed && !a.retiring && a.airT > 30) (g.get(flightOf(a)) || g.set(flightOf(a), []).get(flightOf(a))).push(a);
      flights.push(...g.values());
    } else for (const all of flightGroups().values()) {
      if (!all[0].spec.armed || !(all[0] instanceof FixedWing) || !all.every(settled)) continue;
      const up = all.filter(a => !isDown(a));
      if (up.length && up.every(a => a.state === 'orbit' && !a.landReq && !a.retiring && a.airT >= 30)) flights.push(up);
    }
    if (!flights.length) return false;
    const recv = wpick(flights.map(l => ({ l, w: 1 + Math.min(...l.map(a => a.airT)) / 60 }))).l.sort((a, b) => csNum(a) - csNum(b)).slice(0, 4);
    const ev = this.ev = { tanker: pick(tankers), recv, combat, t: 0, P: null, cur: 0, intro: false, outro: false };
    for (const a of [ev.tanker, ...recv]) { a.tank = ev; a.passDone = false; a.cbtDelay = null; }
    this.out(ev.tanker);
    for (const a of recv) if (combat) { a.state = 'cbt_tank'; a.t = 0; a.mesh.visible = false; } else this.out(a);
    return true;
  },
  out(a) {
    const far = AIRWAR.offscreenFrom(a.mesh.position, a.orbit.alt);
    a.fly(new FlightPath().addDubins(a.mesh.position, headingOf(a.fwd), far.p, far.h, a.spec.turnR), a.v || a.orbit.v, a.spec.speed * 1.2);
    a.state = 'tank_out'; a.t = 0;
  },
  /* everyone is off-screen: one pass edge to edge, the tanker leading */
  board(ev) {
    const n = ev.recv.length, lead = 12 + n * 2.5, P = ev.P = AIRWAR.screenPass(rand(14, 18), 34, lead);
    ev.v = ev.tanker.spec.speed * 0.85; ev.s0 = lead + 10; ev.s1 = P.length - 12;   // the stretch on screen
    const put = (a, ps, state) => {
      a.fly(P, ev.v, ev.v); a.ps = ps; a.state = state; a.t = 0; a.mesh.visible = true; a.bank = 0;
      a.fwd.copy(P.sample(ps).dir).setY(0).normalize();
    };
    put(ev.tanker, lead, 'tank_pass');
    for (const a of ev.recv) { const s = this.slot(ev, a); a.slot = s.slice(); put(a, lead - s[0], ev.combat ? 'cbt_tank' : 'tank_pass'); a.pathOff = s[1]; a.pathDy = s[2]; }
  },
  slot(ev, a) { const i = ev.recv.indexOf(a); return i === ev.cur ? TANK_BASKET : i > ev.cur ? tankWing(i - ev.cur - 1, 1) : tankWing(ev.cur - 1 - i, -1); },

  /* per aircraft, from FixedWing.updateState */
  fly(a, dt) {
    const ev = a.tank;
    switch (a.state) {
      case 'tank_out': a.glow = 0.4; if (a.followPath(dt)) { a.state = 'tank_wait'; a.t = 0; a.mesh.visible = false; } break;
      case 'tank_wait': break;
      case 'cbt_tank': if (ev.P && !a.passDone) this.passStep(a, ev, dt); break;
      case 'tank_pass': this.passStep(a, ev, dt); break;
      case 'tank_back': a.glow = 0.3; if (a.followPath(dt)) { a.state = 'orbit'; a.t = 0; a.tank = null; } break;
      default: a.tank = null;
    }
  },
  passStep(a, ev, dt) {
    const tk = ev.tanker;
    a.glow = 0.45;
    if (a === tk) ev.tkN = ev.n;                             // the tanker has moved this step
    else {
      // receivers: ease into their slot — dropping back first and then across, or across first and then forward
      // (clear of the tanker's wing); their own speed plus a capped correction keeps the gap behind the tanker
      const s = this.slot(ev, a), back = s[0] > a.slot[0], fast = Math.min(1, dt * 2.6), slow = Math.min(1, dt * 0.9);
      a.slot[0] += (s[0] - a.slot[0]) * (back ? fast : slow);
      for (let i = 1; i < 3; i++) a.slot[i] += (s[i] - a.slot[i]) * (back ? slow : fast);
      a.pathOff = a.slot[1]; a.pathDy = a.slot[2];
      // target: the gap behind where the tanker is after this step (it may update before or after us)
      if (tk.tank === ev && tk.state === 'tank_pass') a.ps += clamp(tk.ps + (ev.tkN === ev.n ? 0 : ev.v * dt) - a.slot[0] - ev.v * dt - a.ps, -2.5 * dt, 2.5 * dt);
    }
    if (a.followPath(dt)) this.finish(a, ev);
  },
  finish(a, ev) {
    a.passDone = true; a.pathOff = a.pathDy = 0;
    if (a === ev.tanker) { this.back(a); return; }
    a.airT = 0;                                              // topped off: a full sortie ahead again
    if (a.state === 'cbt_tank' && combatOn()) { a.state = 'cbt_wait'; a.t = 0; a.mesh.visible = false; a.tank = null; }
    else this.back(a);
  },
  back(a) {                                                  // from beyond the edge back to an orbit (like cbt_rtb)
    const from = a.mesh.position.clone(), P = new FlightPath();
    a.pickOrbit(true); a.pathToOrbit(P, from, Math.atan2(-from.z, -from.x), 0.5);
    a.fly(P, a.spec.speed * 1.1, a.orbit.v); a.fwd.set(-from.x, 0, -from.z).normalize();
    a.mesh.visible = true; a.state = 'tank_back'; a.t = 0;
  },
  /* someone never got there: everyone goes back */
  abort(ev) {
    for (const a of [ev.tanker, ...ev.recv]) {
      if (a.tank !== ev) continue;
      a.passDone = true;
      if (a.state === 'cbt_tank' && combatOn()) { a.state = 'cbt_wait'; a.t = 0; a.tank = null; }
      else if (a.state === 'tank_out' || a.state === 'tank_wait' || a.state === 'cbt_tank') this.back(a);
    }
    this.ev = null;
  },

  /* the event: start the pass once everyone waits off-screen, swap receivers, radio */
  tick(ev, dt) {                                             // after all aircraft have moved this step
    ev.t += dt; ev.n = (ev.n || 0) + 1;
    const all = [ev.tanker, ...ev.recv];
    if (!ev.P) {
      if (all.every(a => a.state === 'tank_wait' || a.state === 'cbt_tank')) this.board(ev);
      else if (ev.t > 45) this.abort(ev);
      return;
    }
    const tk = ev.tanker, n = ev.recv.length, u = (tk.ps - ev.s0) / Math.max(1, ev.s1 - ev.s0);
    const o = ev.combat ? { cat: 'combat', prio: 1 } : { prio: 1 }, F = flightOf(ev.recv[0]), A = tk.callsign;
    const said = (a, pool, vars, delay) => a.say(radioLine(pool, Object.assign({ F, A, C: a.callsign }, vars)), Object.assign({ delay: delay || 0 }, o));
    if (!ev.intro && tk.state === 'tank_pass' && AIRWAR.onScreen(tk.mesh.position, -0.1)) {
      ev.intro = true; said(tk, TANKER_LINES.join); said(ev.recv[ev.cur], TANKER_LINES.contact, null, 2.5);
    }
    if (ev.cur < n - 1 && u > (ev.cur + 1) / n) {           // next receiver into the basket
      const prev = ev.recv[ev.cur++], next = ev.recv[ev.cur];
      if (ev.intro && !ev.outro) { said(prev, TANKER_LINES.full); said(tk, TANKER_LINES.next, { C: next.callsign }, 1.2); said(next, TANKER_LINES.contact, null, 3.5); }
    }
    if (ev.intro && !ev.outro && tk.state === 'tank_pass' && !AIRWAR.onScreen(tk.mesh.position, 0.05)) {
      ev.outro = true; said(tk, TANKER_LINES.done, null, 0.5); if (Math.random() < 0.5) said(ev.recv[0], TANKER_LINES.thanks, null, 2);
    }
    if (all.every(a => a.tank !== ev || a.passDone)) this.ev = null;
  }
});
