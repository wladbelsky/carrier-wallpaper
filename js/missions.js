'use strict';
/* ===== Missions beyond the screen edge (only while there is no music) =====
   A Mission is one dispatched flight. legs(role) lists the steps (Leg subclasses) each aircraft flies; the lead and
   the wingmen may fly different legs. dispatchFlight (main.js) only picks the flight, pickMission() picks the type.
   New mission type: subclass Mission (or one of the types below), override what differs — legs(role), eligible(),
   weight, optIn, textKey(), dist / away — and registerMission() it; its texts go into MISSIONS (radio.js).
   New step: subclass Leg with a static `state`, implement enter() / update(), and registerLeg() it (panel status).
   Objects living in the world for a mission (containers, ships, ropes) registerMissionWorld() an { update, reset }. */

/* ---- mission-world objects (containers, ships, ropes …): updated every step, reset when the air wing is rebuilt ---- */
const MISSION_WORLD = [];
function registerMissionWorld(o) { MISSION_WORLD.push(o); return o; }
function missionWorldUpdate(dt) { for (const o of MISSION_WORLD) if (o.update) o.update(dt); }
function missionWorldReset() { for (const o of MISSION_WORLD) if (o.reset) o.reset(); }

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
    a.fly(P, hidden ? a.orbit.v * 1.15 : clamp(a.v || 0, 1.5, a.orbit.v), a.orbit.v);   // from a hover / drift: carry on from its speed
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
  textVars() { return null; }                 // extra placeholders for the order / done texts ({V} …)
  legs(role) { return [Depart, Away, Return]; }
  start() {
    const { order, done } = makeMission(this.textKey(), this.textVars()); this.done = done;
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
registerMissionWorld(CARGO);

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

/* ===== Ship missions (MH-60): rescue the crew of a damaged ship / inspect an intact one, ahead of the fleet =====
   The ship drifts past the fleet (the sea flows by) with the helicopter hovering over it, a rope down to its deck;
   the scene leaves the screen behind the carrier and the helicopters come back from the rear. */
const VESSEL_KINDS = {
  feeder: { name: 'a container feeder', build: buildFeeder, len: 12, deckY: 0.93, spot: [4.7, 0], fire: [0.5, 1.7, 0] },
  trawler: { name: 'a fishing trawler', build: buildTrawler, len: 3.6, deckY: 0.51, spot: [-1.1, 0], fire: [0.65, 1.25, 0] },
  corvette: { name: 'a foreign corvette', build: buildCorvette, len: 9, deckY: 0.78, spot: [-3.6, 0], fire: [0.3, 1.7, 0] }
};
const VESSEL_MODELS = {};                     // one template per kind; every vessel is a clone (shared geometry)
let _figGeo = null, _ropeGeo = null;
const figGeo = () => _figGeo || (_figGeo = new THREE.BoxGeometry(0.06, 0.13, 0.06).translate(0, 0.065, 0));
const ropeGeo = () => _ropeGeo || (_ropeGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 4));
const FIG_RESCUE = 0xff7a1a, FIG_TEAM = 0x2f3a2a;
const _vs1 = new V3(), _vs2 = new V3(), _vs3 = new V3(), _vs4 = new V3();

const VESSELS = {
  list: [],
  spawn(damaged) {
    const kind = pick(Object.keys(VESSEL_KINDS)), K = VESSEL_KINDS[kind];
    const g = (VESSEL_MODELS[kind] || (VESSEL_MODELS[kind] = K.build())).clone(); g.rotation.order = 'YXZ'; scene.add(g);
    // a lane beside the fleet, outside the escorts: the side with fewer vessels, behind the last one in it
    const n = s => this.list.filter(v => Math.sign(v.p.z) === s).length, side = n(1) === n(-1) ? pick([-1, 1]) : n(1) < n(-1) ? 1 : -1;
    const x = Math.max(rand(85, 100), ...this.list.filter(v => Math.sign(v.p.z) === side).map(v => v.p.x + v.K.len / 2 + 22));
    const v = { kind, K, g, damaged, p: new V3(x, 0, side * rand(30, 38)), vx: -1.2, yaw: damaged ? rand(0, TAU) : Math.PI,
      own: damaged ? 0 : 1, t: rand(0, 9), fxT: 0, wakeT: 0, crew: [], active: true };
    if (damaged) for (let i = 0; i < 3; i++) this.figure(v, FIG_RESCUE, i);   // survivors waiting on deck
    this.place(v, 0); this.list.push(v); return v;
  },
  /* a crew figure standing on the deck around the rope spot */
  figure(v, color, i) {
    const f = new THREE.Mesh(figGeo(), M(color)); f.castShadow = true;
    f.position.set(v.K.spot[0] + [-0.3, 0.25, -0.05][i % 3], v.K.deckY, v.K.spot[1] + [0.22, 0.15, -0.25][i % 3]);
    v.g.add(f); v.crew.push(f); return f;
  },
  world(v, x, y, z, out) { return out.set(x, y, z).applyQuaternion(v.g.quaternion).add(v.g.position); },
  fwd(v, out) { return out.set(1, 0, 0).applyQuaternion(v.g.quaternion).setY(0).normalize(); },
  place(v, dt) {
    // dead in the water it just drifts with the sea; under way it also steams past on an opposite course.
    // Never slower than 1.2, so the scene always leaves the screen (even with the fleet stopped).
    v.vx = -Math.max(1.2, WAVE.flow + v.own); v.p.x += v.vx * dt; v.t += dt;
    const roll = v.damaged ? 0.15 + 0.03 * Math.sin(v.t * 0.7) : 0.03 * Math.sin(v.t * 0.9);
    v.g.position.set(v.p.x, waveH(v.p.x, v.p.z) * 0.6 - (v.damaged ? 0.02 * v.K.len : 0), v.p.z);   // a damaged ship sits lower
    v.g.rotation.set(roll, v.yaw, (v.damaged ? -0.04 : 0) + 0.02 * Math.sin(v.t * 0.6));
    v.g.updateMatrixWorld();
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i], K = v.K;
      this.place(v, dt);
      if (v.damaged) {                         // fire and smoke from the burning ship
        v.fxT += dt;
        while (v.fxT > 0.12) {
          v.fxT -= 0.12;
          const p = this.world(v, K.fire[0] + rand(-0.3, 0.3), K.fire[1], K.fire[2] + rand(-0.2, 0.2), new V3());
          FX.smoke.spawn(p, { s0: 0.9, s1: 3.8, life: 3.5, a0: 0.55, color: 0x1e1e1e, v: new V3(rand(-0.8, -0.3), rand(0.7, 1.1), rand(-0.2, 0.2)), drag: 0.3 });
          if (Math.random() < 0.6) FX.flash.spawn(p, { s0: 0.7, s1: 1.1, life: 0.18, a0: 0.9, color: 0xff7a20 });
        }
      } else {                                  // wake off the stern while under way
        v.wakeT += dt;
        while (v.wakeT > 1 / 25) {
          v.wakeT -= 1 / 25;
          const s = this.world(v, -K.len / 2, 0, rand(-0.25, 0.25), _vs1), f = this.fwd(v, _vs2);
          FX.foam.emit(s.x, s.z, -f.x * 0.6 + rand(-0.3, 0.3), -f.z * 0.6 + rand(-0.3, 0.3), rand(2, 4));
        }
      }
      // gone once its mission is over and it is off-screen behind the fleet (or simply far behind)
      if ((!v.active && v.p.x < -50 && !AIRWAR.onScreen(v.p, 0.15)) || v.p.x < -200) { scene.remove(v.g); this.list.splice(i, 1); }
    }
  },
  reset() { for (const v of this.list) v.active = false; }   // a rebuilt air wing: they just sail off
};

/* hoist cable / fast rope from a hovering helicopter to a deck, with one figure riding it */
const ROPES = {
  items: [],
  take(color) {
    let it = this.items.find(i => !i.on);
    if (!it) {
      it = { line: new THREE.Mesh(ropeGeo(), M(0x1e1e1e)), fig: new THREE.Mesh(figGeo(), M(FIG_RESCUE)), on: false };
      it.line.castShadow = true; scene.add(it.line); scene.add(it.fig); this.items.push(it);
    }
    it.on = true; it.line.visible = false; it.fig.visible = false; it.fig.material = M(color); return it;
  },
  release(it) { it.on = false; it.line.visible = it.fig.visible = false; },
  reset() { for (const it of this.items) this.release(it); },
  /* top = hook under the helicopter, bottom = deck point; u = figure position along it (0 deck … 1 hook), null = no figure */
  set(it, top, bottom, u) {
    const d = _vs3.subVectors(top, bottom), len = d.length();
    it.line.position.copy(bottom).addScaledVector(d, 0.5); it.line.quaternion.setFromUnitVectors(WUP, d.divideScalar(len || 1)); it.line.scale.set(1, len, 1);
    it.line.visible = true;
    it.fig.visible = u != null;
    if (u != null) { it.fig.position.copy(bottom).addScaledVector(d, len * u - 0.13 * u); it.fig.quaternion.identity(); }
  }
};
registerMissionWorld(VESSELS); registerMissionWorld(ROPES);

const SHIP_HOVER = 3.2;                       // hover height above the vessel's deck
/* the scene has drifted off-screen behind the fleet (or it took too long) */
const shipSceneOver = (a, c) => (c.m.vessel.p.x < -40 && !AIRWAR.onScreen(c.m.vessel.p, 0.12) && !AIRWAR.onScreen(a.mesh.position, 0.12)) || a.t > 150;
/* where each helicopter goes: the lead over the rope spot, wingmen out to the side (overwatch) */
function shipStation(c, out) {
  const v = c.m.vessel, K = v.K;
  return c.role === 'lead' ? VESSELS.world(v, K.spot[0], K.deckY + SHIP_HOVER, K.spot[1] + 0.25, out) : out.set(v.p.x, 8, v.p.z + (v.p.z > 0 ? -7 : 7));
}
/* fly out ahead to meet the vessel where it will be on arrival */
class ToVessel extends Leg {
  static state = 'ship_out';
  enter(a, c) {
    super.enter(a, c);
    const v = c.m.vessel, p0 = a.mesh.position, st = shipStation(c, new V3());
    const sp = a.orbit.v * 1.15, tt = Math.hypot(st.x - p0.x, st.z - p0.z) / (sp + Math.abs(v.vx));
    st.x += v.vx * tt;
    const hEnd = c.role === 'lead' ? headingOf(VESSELS.fwd(v, _vs1)) : Math.PI;
    a.fly(new FlightPath().addDubins(p0, headingOf(a.fwd), st, hEnd, a.spec.turnR), a.orbit.v, Math.abs(v.vx) + 0.5);
  }
  update(a, c, dt) { return a.followPath(dt); }
}
/* lead: hover over the deck and work the rope — survivors up the hoist (rescue) or the team down the fast rope (inspect) */
class OnScene extends Leg {
  static state = 'ship_hover';
  enter(a, c) {
    super.enter(a, c);
    const rescue = c.m.dir === 'rescue';
    this.rope = ROPES.take(rescue ? FIG_RESCUE : FIG_TEAM); this.arrived = false; this.ct = 0; this.ride = null; this.team = 0; this.hoisted = 0;
    a.say(radioLine(LINES.ship.onScene[c.m.dir]), { prio: 1 });
  }
  update(a, c, dt) {
    const v = c.m.vessel, K = v.K, st = shipStation(c, _vs1);
    a.mesh.position.x += v.vx * dt; a.mesh.position.lerp(st, Math.min(1, dt * 3));   // drift with the ship, close in on the station
    a.fwd.lerp(VESSELS.fwd(v, _vs2), Math.min(1, dt * 1.2)).setY(0).normalize(); orientFrom(a.mesh, a.fwd, 0); a.v = Math.abs(v.vx);
    if (!this.arrived && a.mesh.position.distanceTo(st) < 0.6) this.arrived = true;
    if (this.arrived) {
      const top = _vs2.copy(a.mesh.position); top.y += 0.05;
      const deck = VESSELS.world(v, K.spot[0], K.deckY, K.spot[1] + 0.25, _vs4);
      this.ct += dt;
      if (c.m.dir === 'rescue') {                // one survivor at a time up the hoist cable
        if (this.ride == null && v.crew.length && this.ct > 1.5) { v.g.remove(v.crew.pop()); this.ride = 0; }
        if (this.ride != null) {
          this.ride += dt / 3.5;
          if (this.ride >= 1) { this.ride = null; this.ct = 0; if (++this.hoisted === 1) a.say(radioLine(LINES.ship.hoist), { prio: 0 }); }
        }
        ROPES.set(this.rope, top, deck, this.ride);
      } else {                                   // the boarding team slides down one by one and stays on deck
        if (this.ride == null && this.team < 3 && this.ct > 1.2) this.ride = 1;
        if (this.ride != null) {
          this.ride -= dt / 1.5;
          if (this.ride <= 0) { this.ride = null; this.ct = 0; VESSELS.figure(v, FIG_TEAM, this.team++); }
        }
        ROPES.set(this.rope, top, deck, this.ride);
      }
    }
    if (!shipSceneOver(a, c)) return false;
    ROPES.release(this.rope); v.active = false;
    if (c.m.done) a.say(c.m.done, { prio: 1 });
    return true;
  }
}
/* wingman: circle the ship and keep an eye on it */
class Overwatch extends Leg {
  static state = 'ship_watch';
  enter(a, c) { super.enter(a, c); const v = c.m.vessel; this.ang = Math.atan2(a.mesh.position.z - v.p.z, a.mesh.position.x - v.p.x); }
  update(a, c, dt) {
    const v = c.m.vessel, R = 7, sp = 6;
    this.ang += sp / R * dt;
    const tgt = _vs1.set(v.p.x + R * Math.cos(this.ang), 8, v.p.z + R * Math.sin(this.ang));
    a.mesh.position.x += v.vx * dt; a.mesh.position.lerp(tgt, Math.min(1, dt * 2));
    a.v = sp; a.orientFlight(_vs2.set(-Math.sin(this.ang) * sp + v.vx, 0, Math.cos(this.ang) * sp), a.bankFor(sp, R), dt);
    return shipSceneOver(a, c) || (!v.active && !AIRWAR.onScreen(a.mesh.position, 0.12));
  }
}
registerLeg(ToVessel, 'MISSION ▶', 'air'); registerLeg(OnScene, 'ON SCENE', 'busy'); registerLeg(Overwatch, 'OVERWATCH', 'air');

/* MH-60s only: 50/50 a damaged ship (rescue the crew) or an intact one (board and inspect); 3 kinds of ship */
class ShipMission extends Mission {
  static key = 'ship'; static weight = 0.35;
  static eligible(a) { return a.spec.key === 'mh60'; }
  constructor(flight, size) { super(flight, size); this.dir = Math.random() < 0.5 ? 'rescue' : 'inspect'; this.vessel = VESSELS.spawn(this.dir === 'rescue'); }
  textKey() { return 'ship.' + this.dir; }
  textVars() { return { V: this.vessel.K.name }; }
  copyKey() { return 'heli_transport'; }
  legs(role) { return role === 'lead' ? [ToVessel, OnScene, Return] : [ToVessel, Overwatch, Return]; }
}
registerMission(ShipMission);
