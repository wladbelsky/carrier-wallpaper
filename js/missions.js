'use strict';
/* ===== Missions beyond the screen edge (only while there is no music) =====
   A Mission is one dispatched flight. legs(role) lists the steps (Leg subclasses) each aircraft flies; the lead and
   the wingmen may fly different legs. dispatchFlight (main.js) only picks the flight, pickMission() picks the type.
   New mission type: subclass Mission (or one of the types below), override what differs — legs(role), eligible(),
   weight, optIn, textKey(), dist / away — and registerMission() it; its texts go into MISSIONS (radio.js).
   New step: subclass Leg with a static `state`, implement enter() / update(), and registerLeg() it (panel status). */

/* ---- legs: one step of a mission for one aircraft ----
   c = the aircraft's mission context { m: Mission, slot, role: 'lead' | 'wing', far, legs, i, crate, L }.
   update() returns true when the step is finished; the next leg's enter() follows on the same frame. */
class Leg {
  static state = '';
  enter(a, c) { a.state = this.constructor.state; a.t = 0; }
  update(a, c, dt) { return true; }
}
function registerLeg(L, label, cls) { STATUS[L.state] = [label, cls]; return L; }

/* fly from the orbit (or a hover) to this aircraft's point beyond the screen edge; wingmen follow the lead in trail */
class Depart extends Leg {
  static state = 'mission_out';
  enter(a, c) { super.enter(a, c); this.wait = c.slot * 1.6; this.flying = false; }
  update(a, c, dt) {
    if (!this.flying) {
      if ((c.role === 'wing' && !c.m.leadOut) || (this.wait -= dt) > 0) { a.orbitStep(dt); return false; }
      const v0 = Math.min(a.v || a.orbit.v, a.orbit.v);                 // from a hover it speeds up from slow flight
      a.fly(new FlightPath().addDubins(a.mesh.position, headingOf(a.fwd), c.far, c.m.heading, a.spec.turnR), v0, a.orbit.v * 1.15);
      this.flying = true; if (c.role === 'lead') c.m.leadOut = true;
    }
    if (!a.followPath(dt)) return false;
    a.mesh.visible = false; return true;
  }
}
/* off-screen; a load carried out is delivered here. The lead reports the job done when it turns back. */
class Away extends Leg {
  static state = 'mission';
  enter(a, c) { super.enter(a, c); a.mesh.visible = false; if (c.crate) { CARGO.release(c.crate); c.crate = null; } }
  update(a, c, dt) {
    if (a.t <= c.m.away + c.slot * 1.6) return false;
    if (c.role === 'lead' && c.m.done) a.say(c.m.done, { prio: 1 });
    return true;
  }
}
/* back to a (new) orbit: from the far point, or from wherever the aircraft is (e.g. a hover over the deck) */
class Return extends Leg {
  static state = 'mission_back';
  enter(a, c) {
    super.enter(a, c);
    const hidden = !a.mesh.visible, from = a.mesh.position.clone(), h = hidden ? c.m.heading + Math.PI : headingOf(a.fwd), P = new FlightPath();
    a.pickOrbit(true); a.pathToOrbit(P, from, h, 0.5);
    a.fly(P, hidden ? a.orbit.v * 1.15 : 1.5, a.orbit.v);
    a.fwd.set(Math.cos(h), 0, Math.sin(h)); a.mesh.visible = true;
  }
  update(a, c, dt) { return a.followPath(dt); }
}
registerLeg(Depart, 'MISSION ▶', 'air'); registerLeg(Away, 'ON MISSION', 'air'); registerLeg(Return, 'RTB', 'air');

/* ---- mission types ---- */
const MISSION_TYPES = {};
function registerMission(M) { MISSION_TYPES[M.key] = M; return M; }
/* spec.missions (optional) is an allow-list of mission keys; otherwise every eligible type that isn't optIn */
function pickMission(lead) {
  const allow = lead.spec.missions;
  const cands = Object.values(MISSION_TYPES).filter(M => (allow ? allow.includes(M.key) : !M.optIn) && M.eligible(lead)).map(M => ({ M, w: M.weight }));
  return cands.length ? wpick(cands).M : null;
}

/* generic off-screen job (CAP, intercepts, escorts, SAR, medevac…): out, away, back to the orbit */
class Mission {
  static key = 'patrol'; static weight = 1;
  static optIn = false;                       // only for aircraft that list it in spec.missions
  static eligible(lead) { return true; }
  constructor(flight, size) {
    this.flight = flight; this.size = size; this.lead = flight[0]; this.heli = this.lead instanceof Helicopter;
    this.heading = rand(0, TAU); this.dist = this.heli ? 120 : 175; this.away = rand(50, 110); this.leadOut = false;
  }
  textKey() { const a = this.lead; return a.isAwacs ? 'awacs' : this.heli ? (a.spec.armed ? 'heli_attack' : 'heli_transport') : 'fighter'; }
  copyKey() { return this.textKey(); }        // acknowledgement pool (LINES.missionCopy)
  legs(role) { return [Depart, Away, Return]; }
  start() {
    const { order, done } = makeMission(this.textKey()); this.done = done;
    const h = this.heading, perp = new V3(-Math.sin(h), 0, Math.cos(h)), n = this.flight.length;
    this.flight.forEach((a, slot) => {
      const far = new V3(Math.cos(h) * this.dist, a.orbit.alt, Math.sin(h) * this.dist).addScaledVector(perp, (slot - (n - 1) / 2) * 6);
      const role = slot ? 'wing' : 'lead', c = a.mission = { m: this, slot, role, far, legs: this.legs(role).map(L => new L()), i: 0 };
      c.legs[0].enter(a, c);
    });
    // the whole flight is addressed through its lead; part of a flight by each aircraft (WARDOG 3, WARDOG 4)
    const lead = this.lead, awacs = AIRCRAFT.find(a => a.isAwacs && a.airborne && a !== lead);
    const who = n === this.size ? lead.callsign : this.flight.map(a => a.callsign).join(', ');
    RADIO.say(awacs ? awacs.callsign : RADIO_NAMES.carrier, `${who}, ${order}`, { role: awacs ? 'awacs' : 'ship', prio: 1 });
    lead.say(missionCopy(this.copyKey()), { prio: 1, delay: 0.3 });
  }
  update(a, dt) {
    const c = a.mission;
    if (!c.legs[c.i].update(a, c, dt)) return;
    if (++c.i < c.legs.length) c.legs[c.i].enter(a, c); else this.finish(a);
  }
  finish(a) { a.mission = null; a.state = 'orbit'; a.airT = 0; }
}
registerMission(Mission);

/* CMV-22B carrier-onboard-delivery run: farther, longer, and it lands on the carrier when it comes back */
class CodMission extends Mission {
  static key = 'cod'; static optIn = true;
  constructor(flight, size) { super(flight, size); this.dist = 160; this.away = rand(100, 160); }
  textKey() { return 'cod'; }
  finish(a) { super.finish(a); a.landReq = true; }
}
registerMission(CodMission);

/* ===== Sling loads: a container on a line under a transport helicopter, handed over on elevator one ===== */
const SLING_HOVER = 5, SLING_HOOK = 2.35;     // hover / hook-up heights above the deck (crate bottom on the platform)
const CARGO = {
  items: [], LINE: 1.6, APEX: 0.75,           // sling line length; bridle apex above the crate bottom
  lift(host) { return host.lifts[0]; },       // elevator one: forward of the island, clear of the helicopter pad
  /* the lift is reserved with L.busy = token, so aircraft using it simply wait */
  reserve(host, token) { const L = this.lift(host); if (L.busy && L.busy !== token) return null; L.busy = token; return L; },
  build() {
    const g = new THREE.Group(), C = M(0x9a5b2e), C2 = M(0x7e4a26), D = M(0x2e3236);
    box(g, 0.72, 0.29, 0.29, C, 0, 0.155, 0);                                          // 20 ft container
    for (const y of [0.015, 0.3]) box(g, 0.74, 0.03, 0.31, D, 0, y, 0);                // frame
    for (const x of [-0.22, 0, 0.22]) box(g, 0.02, 0.27, 0.3, C2, x, 0.155, 0);        // corrugation ribs
    for (const x of [-0.33, 0.33]) for (const z of [-0.13, 0.13]) strut(g, new V3(x, 0.31, z), new V3(0, this.APEX, 0), 0.008, D);   // bridle
    mergeStatic(g, []);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), M(0x1e1e1e)); line.castShadow = true;
    g.visible = line.visible = false; scene.add(g); scene.add(line);
    return { g, line, mode: 'off', a: null, host: null, L: null, token: null, down: false };
  },
  take() { const it = this.items.find(i => i.mode === 'off') || (this.items.push(this.build()), this.items[this.items.length - 1]); it.g.visible = true; return it; },
  release(it) { it.mode = 'off'; it.a = it.host = it.L = it.token = null; it.g.visible = it.line.visible = false; },
  reset() { for (const it of this.items) this.release(it); },
  /* on the elevator platform; down = it goes into the hangar (delivered): then the lift comes back up and is freed */
  onLift(it, host, L, token, down) { Object.assign(it, { mode: 'lift', host, L, token, down }); it.line.visible = false; this.place(it); },
  hang(it, a) { it.mode = 'heli'; it.a = a; },
  place(it) {
    const cg = it.host.group; it.g.position.set(it.L.x, it.L.y, it.L.z); cg.localToWorld(it.g.position); it.g.quaternion.copy(cg.quaternion);
  },
  update(dt) {
    for (const it of this.items) {
      if (it.mode === 'lift') {
        this.place(it);
        if (it.down && it.L.y <= it.L.bottom + 1e-3) { const L = it.L; if (L.busy === it.token) L.busy = null; L.target = L.top; this.release(it); }
      } else if (it.mode === 'heli') {
        const a = it.a, hook = _cgH.copy(a.mesh.position); hook.y += 0.05;
        // the crate trails its hanging point a little: a gentle swing when the helicopter moves
        _cgT.copy(hook); _cgT.y -= this.LINE + this.APEX;
        it.g.position.lerp(_cgT, Math.min(1, dt * 4));
        orientFrom(it.g, a.fwd, 0);
        const apex = _cgT.copy(it.g.position); apex.y += this.APEX;
        const d = _cgD.subVectors(hook, apex), len = d.length();
        it.line.position.copy(apex).addScaledVector(d, 0.5); it.line.quaternion.setFromUnitVectors(WUP, d.divideScalar(len || 1)); it.line.scale.set(1, len, 1);
        it.g.visible = it.line.visible = a.mesh.visible;
      }
    }
  }
};
const _cgH = new V3(), _cgT = new V3(), _cgD = new V3();

/* lift side of a pickup: reserve elevator one, send it down, put the container on it, bring it up; true = load is up */
function slingPickupLift(a, c) {
  if (!c.L) { c.L = CARGO.reserve(a.host, c); if (!c.L) return false; c.L.target = c.L.bottom; }
  const L = c.L;
  if (!c.crate && L.y <= L.bottom + 1e-3) { c.crate = CARGO.take(); CARGO.onLift(c.crate, a.host, L, c, false); L.target = L.top; }
  return !!c.crate && L.y >= L.top - 1e-3;
}
/* hover over elevator one with a descend / climb phase; ph 0 waits, ph 1 goes down to the hook height, ph 2 back up */
class SlingHover extends Leg {
  enter(a, c) { super.enter(a, c); this.ph = 0; this.k = 0; a.hostFwd(a.fwd); }
  hover(a, dt) {
    const L = CARGO.lift(a.host), s = smoothstep(0, 1, this.k);
    const h = this.ph === 0 ? SLING_HOVER : this.ph === 1 ? lerp(SLING_HOVER, SLING_HOOK, s) : lerp(SLING_HOOK, SLING_HOVER, s);
    a.deckPose(L.x, L.z, 0, h + Math.sin(a.t * 2) * 0.05);
  }
  /* advance the descend (3 s) / climb (2 s) phases: 'down' at the hook height, 'up' when back at the hover */
  step(dt) {
    if (this.ph === 1) { this.k += dt / 3; if (this.k >= 1) return 'down'; }
    else if (this.ph === 2) { this.k += dt / 2; if (this.k >= 1) return 'up'; }
    return null;
  }
}
/* pickup: fly to a hover over elevator one while the container comes up from the hangar */
class SlingTo extends Leg {
  static state = 'sling_to';
  enter(a, c) {
    super.enter(a, c);
    const L = CARGO.lift(a.host), P0 = a.hostToWorld(L.x, a.host.deckY + SLING_HOVER, L.z);
    a.fly(new FlightPath().addDubins(a.mesh.position, headingOf(a.fwd), P0, headingOf(a.hostFwd(new V3())), a.spec.turnR), a.orbit.v, 0.7);
  }
  update(a, c, dt) { slingPickupLift(a, c); return a.followPath(dt); }
}
/* pickup: wait for the container, go down, hook it, climb away (the lift is freed) */
class SlingHook extends SlingHover {
  static state = 'sling_hook';
  update(a, c, dt) {
    if (this.ph === 0 && slingPickupLift(a, c)) {
      this.ph = 1; this.k = 0;
      RADIO.say(a.host.radio || RADIO_NAMES.carrier, radioLine(LINES.sling.liftReady, { c: a.callsign }), { role: 'ship', prio: 1 });
    }
    const e = this.step(dt);
    if (e === 'down') { CARGO.hang(c.crate, a); if (c.L.busy === c) c.L.busy = null; c.L = null; this.ph = 2; this.k = 0; a.say(radioLine(LINES.sling.hooked), { prio: 1 }); }
    if (e === 'up') return true;
    this.hover(a, dt); return false;
  }
}
/* delivery: back from the job with the container slung, to a hover over elevator one */
class SlingInbound extends Leg {
  static state = 'mission_back';
  enter(a, c) {
    super.enter(a, c);
    const back = c.m.heading + Math.PI, L = CARGO.lift(a.host), P0 = a.hostToWorld(L.x, a.host.deckY + SLING_HOVER, L.z);
    a.fwd.set(Math.cos(back), 0, Math.sin(back)); a.mesh.visible = true;
    a.fly(new FlightPath().addDubins(a.mesh.position, back, P0, headingOf(a.hostFwd(new V3())), a.spec.turnR), a.orbit.v * 1.15, 0.7);
    c.crate = CARGO.take(); CARGO.hang(c.crate, a);
    c.crate.g.position.copy(a.mesh.position); c.crate.g.position.y -= CARGO.LINE + CARGO.APEX - 0.05;
  }
  update(a, c, dt) { return a.followPath(dt); }
}
/* delivery: wait for elevator one at the top, lower the container onto it, release, climb; the lift takes it below */
class SlingDrop extends SlingHover {
  static state = 'sling_drop';
  update(a, c, dt) {
    if (this.ph === 0) {
      if (!c.L) c.L = CARGO.reserve(a.host, c);
      if (c.L) {
        c.L.target = c.L.top;
        if (c.L.y >= c.L.top - 1e-3) { this.ph = 1; this.k = 0; RADIO.say(a.host.radio || RADIO_NAMES.carrier, radioLine(LINES.sling.dropClear, { c: a.callsign }), { role: 'ship', prio: 1 }); }
      }
    }
    const e = this.step(dt);
    if (e === 'down') {
      CARGO.onLift(c.crate, a.host, c.L, c, true); c.L.target = c.L.bottom; c.crate = null; c.L = null;
      this.ph = 2; this.k = 0; a.say(radioLine(LINES.sling.released), { prio: 1 });
    }
    if (e === 'up') return true;
    this.hover(a, dt); return false;
  }
}
registerLeg(SlingTo, 'SLING ▶', 'busy'); registerLeg(SlingHook, 'HOOK-UP', 'busy'); registerLeg(SlingDrop, 'SLING DROP', 'busy');

/* transport helicopters (not the CMV-22B — its cargo is internal): 50/50 take a load out from elevator one or bring one
   back to it. The wingman flies a plain out / away / back in trail. */
class SlingMission extends Mission {
  static key = 'sling'; static weight = 0.25;
  static eligible(a) { return a instanceof Helicopter && !a.spec.armed && !!(a.host.lifts && a.host.lifts.length); }
  constructor(flight, size) { super(flight, size); this.dir = Math.random() < 0.5 ? 'out' : 'in'; }
  textKey() { return 'sling.' + this.dir; }
  copyKey() { return 'heli_transport'; }
  legs(role) {
    if (role !== 'lead') return super.legs(role);
    return this.dir === 'out' ? [SlingTo, SlingHook, Depart, Away, Return] : [Depart, Away, SlingInbound, SlingDrop, Return];
  }
}
registerMission(SlingMission);
