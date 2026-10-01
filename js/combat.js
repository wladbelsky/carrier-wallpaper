'use strict';
/* ===== Enemies (bandits = fighters, vampires = anti-ship missiles) and beat-synced hits =====
   Weapons pick real targets; a projectile that reaches its target is resolved on the NEXT beat
   of the music (with a short fallback), so kills land on the rhythm.                          */
const ENEMIES = [], PENDING = [], SHIP_FIRES = [];
let banditTimer = 6, vampTimer = 14;
const SAY_CD = {};
function sayOnce(key, cd, fn) { if ((SAY_CD[key] || -99) > T) return; SAY_CD[key] = T + cd; fn(); }

function buildBandit() {                       // generic delta-wing fighter, dark camo
  const g = new THREE.Group(), C = M(0x58544a), R = M(0x8f2b22), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.2; g.add(b);
  taper(b, 1.35, 0.2, 0.22, C, 0, 0, 0, 0.85, 0.7);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(0.9, 0, 0); b.add(nose);
  taper(b, 0.36, 0.1, 0.13, CAN, 0.42, 0.13, 0, 0.6, 0.7, -0.04);
  const wing = [[0.3, 0.1], [-0.55, 0.78], [-0.66, 0.78], [-0.62, 0.1]];
  prism(b, wing, -0.02, 0.035, C); prism(b, mirrorZ(wing), -0.02, 0.035, C);
  taper(b, 0.42, 0.42, 0.03, C, -0.5, 0.28, 0, 0.45, 1, -0.14);
  box(b, 0.14, 0.08, 0.035, R, -0.62, 0.47, 0);
  for (const s of [-1, 1]) box(b, 0.12, 0.012, 0.25, R, -0.38, 0.0, s * 0.62);   // red wing bands
  const n = cyl(b, 0.09, 0.1, 0.12, 6, 0x222, -0.72, 0, 0); n.rotation.z = Math.PI / 2;
  const glow = glowSprite(g, -0.9, 0.2, 0, 0.8, 0xff9a50); glow.material.opacity = 0.7;
  mergeStatic(g, []);
  return g;
}
function buildVampire() {
  const g = new THREE.Group();
  const body = cyl(g, 0.07, 0.07, 0.8, 6, 0xd8d8d0, 0, 0, 0); body.rotation.z = Math.PI / 2;
  const tip = shade(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), M(0x9a9a92))); tip.rotation.z = -Math.PI / 2; tip.position.set(0.49, 0, 0); g.add(tip);
  for (let i = 0; i < 4; i++) { const f = box(g, 0.14, 0.02, 0.18, 0x9a9a92, -0.33, 0, 0); f.rotation.x = i * Math.PI / 2; }
  glowSprite(g, -0.48, 0, 0, 0.7, 0xffc080).material.opacity = 1;
  mergeStatic(g, []);
  return g;
}
/* Enemy models are built once; every enemy is a clone sharing geometry and materials, so spawning
   allocates no GPU buffers and removed enemies leave nothing behind. */
const ENEMY_MODELS = {};
function enemyMesh(kind) {
  const tpl = ENEMY_MODELS[kind] || (ENEMY_MODELS[kind] = kind === 'bandit' ? buildBandit() : buildVampire());
  return tpl.clone();
}

/* ---- spawning ---- */
function bearingWords(h) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
  const deg = Math.round(((90 + h / DEG) % 360 + 360) % 360 / 10) * 10 % 360;
  return String(deg).padStart(3, '0').split('').map(d => words[+d]).join('-');
}
function compassWord(h) { return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(((h / DEG) % 360 + 360) % 360 / 45) % 8]; }
function hq() { const aw = AIRCRAFT.find(a => a.isAwacs && a.airborne); return aw ? [aw.callsign, 'awacs'] : [RADIO_NAMES.carrier, 'ship']; }

function spawnBandits(n) {
  const h = rand(0, TAU), perp = new V3(-Math.sin(h), 0, Math.cos(h));
  const pass = new V3(rand(-22, 22), 0, rand(-22, 22)), alt = rand(17, 26), speed = rand(22, 28);
  for (let i = 0; i < n; i++) {
    const p = new V3(Math.cos(h) * 135, alt + rand(-1.5, 1.5), Math.sin(h) * 135).addScaledVector(perp, (i - (n - 1) / 2) * 6);
    p.addScaledVector(new V3(Math.cos(h), 0, Math.sin(h)), i * 5);
    const target = pass.clone().addScaledVector(perp, (i - (n - 1) / 2) * 6); target.y = p.y;
    const v = target.sub(p).normalize().multiplyScalar(speed);
    const mesh = enemyMesh('bandit'); mesh.scale.setScalar(1.25); scene.add(mesh);
    ENEMIES.push({ kind: 'bandit', mesh, p, v, hp: 2, age: 0, fired: false, smokeT: 0 });
  }
  const [who, role] = hq();
  RADIO.say(who, pick(COMBAT.newBandits).replace('{B}', bearingWords(h)).replace('{D}', compassWord(h)).replace('{N}', n === 1 ? 'a single bandit' : n === 2 ? 'two bandits' : n === 3 ? 'three bandits' : 'multiple bandits'), { role, cat: 'combat', prio: 2 });
}
function vampireTarget() {
  const s = pick(SHIPS), half = s.len * 0.35;
  return { ship: s, local: new V3(rand(-half, half), s === CARRIER ? 1.6 : 0.9, (Math.random() < 0.5 ? -1 : 1) * (s === CARRIER ? 3.3 : 1.1)) };
}
function spawnVampire(from) {
  const t = vampireTarget();
  const mesh = enemyMesh('vampire'); mesh.scale.setScalar(1.3); scene.add(mesh);
  const v = new V3(1, 0, 0);
  ENEMIES.push({ kind: 'vampire', mesh, p: from.clone(), v, hp: 1, age: 0, tgt: t, speed: rand(30, 36), smokeT: 0 });
}
function spawnVampireSalvo(n) {
  const h = rand(0, TAU);
  for (let i = 0; i < n; i++) spawnVampire(new V3(Math.cos(h) * 130 + rand(-6, 6), 1.4, Math.sin(h) * 130 + rand(-6, 6)));
  sayOnce('vamp', 6, () => { const sh = pick(SHIPS.slice(1)); RADIO.say(sh.radio, pick(COMBAT.vampires).replace('{B}', bearingWords(h)), { role: 'ship', cat: 'combat', prio: 3 }); });
}

/* ---- targeting helpers ---- */
const enemyAlive = e => e && !e.dead && !e.falling;
function nearestEnemy(pos, kinds, maxDist) {
  let best = null, bd = maxDist;
  for (const e of ENEMIES) if (enemyAlive(e) && kinds.includes(e.kind)) { const d = e.p.distanceTo(pos); if (d < bd) { bd = d; best = e; } }
  return best;
}
const _al = new V3();
function aimMountAt(m, target) {
  _al.copy(target); m.yawG.parent.worldToLocal(_al);
  const dx = _al.x - m.yawG.position.x, dy = _al.y - m.yawG.position.y - 0.3, dz = _al.z - m.yawG.position.z;
  m.tYaw = Math.atan2(-dz, dx);
  m.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), 0.02, m.kind === 'gun' ? 1.15 : 1.45);
}
function leadPoint(e, from, speed) { const tt = e.p.distanceTo(from) / speed; return e.p.clone().addScaledVector(e.v, tt); }

/* ---- hits, resolved on the beat ---- */
function queueHit(e, o) {
  const ready = T + (o.delay || 0);
  PENDING.push({ e, chance: o.chance, dmg: o.dmg || 1, src: o.src, missile: o.missile || null, readyAt: ready, deadline: ready + 0.7 });
}
function resolveHits(onBeat) {
  for (let i = PENDING.length - 1; i >= 0; i--) {
    const h = PENDING[i];
    if (T < h.readyAt || (!onBeat && T < h.deadline)) continue;
    PENDING.splice(i, 1);
    if (h.missile) h.missile.life = 0;
    if (!enemyAlive(h.e)) { if (h.missile) airburst(h.missile.p, 0.6); continue; }
    if (Math.random() < h.chance) damageEnemy(h.e, h.dmg, h.src);
    else airburst(h.e.p.clone().add(new V3(rand(-2.5, 2.5), rand(-1.5, 1.5), rand(-2.5, 2.5))), 0.7);
  }
}
function airburst(p, s) {
  FX.flash.spawn(p, { s0: 2.2 * s, s1: 3.8 * s, life: 0.15, a0: 1 });
  FX.smoke.spawn(p.clone(), { s0: 1.2 * s, s1: 3.6 * s, life: 2.4, a0: 0.6, color: 0x2e3034, v: new V3(-WAVE.flow * 0.6, 0.15, 0), drag: 0.6 });
}
function explosion(p, s) {
  FX.flash.spawn(p, { s0: 3.5 * s, s1: 6 * s, life: 0.22, a0: 1 });
  for (let i = 0; i < 5; i++) {
    const q = p.clone().add(new V3(rand(-1, 1), rand(-0.6, 0.8), rand(-1, 1)).multiplyScalar(s));
    FX.flash.spawn(q, { s0: 1.4 * s, s1: 3.2 * s, life: rand(0.35, 0.6), a0: 1, color: 0xff8a30 });
    FX.smoke.spawn(q.clone(), { s0: 1.4 * s, s1: 5 * s, life: rand(2.5, 4), a0: 0.75, color: 0x222222, v: new V3(rand(-1, 1) - WAVE.flow * 0.5, rand(0.3, 1), rand(-1, 1)), drag: 0.5 });
  }
  FX.lights.flash(p, 6, 0.35);
}
function sayKill(src, line) {
  if (!src) return;
  if (src instanceof Aircraft) src.say(line, { cat: 'combat', prio: 2 });
  else RADIO.say(src.radio || RADIO_NAMES.carrier, line, { role: 'ship', cat: 'combat', prio: 2 });
}
function damageEnemy(e, dmg, src) {
  FX.flash.spawn(e.p, { s0: 1.5, s1: 2.2, life: 0.1, a0: 1 });
  e.hp -= dmg;
  if (e.hp > 0) { e.smoking = true; return; }
  if (e.kind === 'bandit') {
    explosion(e.p, 1.3); e.falling = true; e.spin = rand(3, 6) * (Math.random() < 0.5 ? -1 : 1);
    sayKill(src, STRESS.pick(COMBAT.splash));
    if (CFG.shake) camShake = Math.min(1, camShake + 0.25);
  } else {
    explosion(e.p, 0.8); e.dead = true; scene.remove(e.mesh);
    if (Math.random() < 0.6) sayKill(src, pick(COMBAT.vampireDown));
  }
}
function shipImpact(e) {
  const s = e.tgt.ship, w = s.group.localToWorld(e.tgt.local.clone());
  explosion(w, 1.4);
  SHIP_FIRES.push({ ship: s, local: e.tgt.local.clone(), t: 14 });
  sayOnce('hit', 5, () => RADIO.say(s.radio || RADIO_NAMES.carrier, pick(COMBAT.shipHit), { role: 'ship', cat: 'combat', prio: 4 }));
  STRESS.bump(0.03);
  if (CFG.shake) camShake = 1;
}

/* ---- per-frame update ---- */
function updateCombat(dt) {
  const armed = AUD.armed && CFG.enemies && CFG.fire > 0;
  const st = STRESS.level;
  if (armed) {
    const alive = ENEMIES.filter(e => e.kind === 'bandit' && enemyAlive(e)).length;
    banditTimer -= dt;
    if (banditTimer <= 0) {
      banditTimer = rand(9, 16) * (1 - 0.55 * st);
      if (alive < 2 + st * 5) spawnBandits(randi(1, 2 + Math.round(st * 2)));
    }
    vampTimer -= dt;
    if (vampTimer <= 0) { vampTimer = rand(14, 24) * (1 - 0.4 * st); if (st > 0.1 || Math.random() < 0.5) spawnVampireSalvo(randi(1, 1 + Math.round(st * 2))); }
  } else {
    banditTimer = rand(1.5, 3); vampTimer = rand(10, 16);
    // when the music stops, inbound missiles are intercepted / self-destruct
    for (const e of ENEMIES) if (e.kind === 'vampire' && !e.dead) { explosion(e.p, 0.6); e.dead = true; scene.remove(e.mesh); }
  }
  if (armed) for (const m of ALL_CIWS) {
    if (m.burst > 0 || (m.cd || 0) > 0 || !m.track || m.track.kind !== 'vampire' || !enemyAlive(m.track)) continue;
    if (m.track.p.distanceTo(m.yawG.getWorldPosition(_al)) < 40) { m.burst = rand(0.35, 0.6); m.acc = 0; m.burstTarget = m.track; m.lastDitch = true; }
  }
  for (const e of ENEMIES) {
    if (e.dead) continue;
    e.age += dt;
    if (e.kind === 'bandit') {
      if (e.falling) {
        e.v.y -= 9 * dt; e.v.multiplyScalar(1 - 0.15 * dt); e.p.addScaledVector(e.v, dt);
        e.mesh.position.copy(e.p); e.mesh.rotateX(e.spin * dt);
        e.smokeT += dt; while (e.smokeT > 0.03) { e.smokeT -= 0.03; FX.smoke.spawn(e.p.clone(), { s0: 0.8, s1: 3, life: 2.5, a0: 0.7, color: 0x1e1e1e, v: new V3(-WAVE.flow, 0.4, 0) }); if (Math.random() < 0.5) FX.flash.spawn(e.p, { s0: 1, s1: 1.4, life: 0.08, a0: 0.9, color: 0xff7a20 }); }
        if (e.p.y < waveH(e.p.x, e.p.z)) { FX.splash.spawn(e.p, 1.8); explosion(e.p, 0.8); e.dead = true; scene.remove(e.mesh); }
        continue;
      }
      e.p.addScaledVector(e.v, dt);
      e.mesh.position.copy(e.p); orientFrom(e.mesh, _al.copy(e.v).normalize(), 0.15 * Math.sin(e.age));
      if (e.smoking) { e.smokeT += dt; while (e.smokeT > 0.06) { e.smokeT -= 0.06; FX.smoke.spawn(e.p.clone(), { s0: 0.5, s1: 2, life: 1.8, a0: 0.5, color: 0x333333, v: new V3(-WAVE.flow, 0.3, 0) }); } }
      // bandits loose anti-ship missiles on their run in
      const dc = Math.hypot(e.p.x, e.p.z);
      if (armed && !e.fired && dc < 85 && dc > 50) { e.fired = true; if (Math.random() < 0.25 + st * 0.25) { spawnVampire(e.p.clone()); sayOnce('vamp', 6, () => { const sh = pick(SHIPS.slice(1)); RADIO.say(sh.radio, pick(['Vampire launch! Bandit fired on us!', 'Missile off the rail, inbound!']), { role: 'ship', cat: 'combat', prio: 3 }); }); } }
      if (dc > 175 && e.age > 3) { e.dead = true; scene.remove(e.mesh); }
    } else {                                   // vampire: descend to sea-skimming height and run at a ship
      const tw = e.tgt.ship.group.localToWorld(e.tgt.local.clone());
      const to = tw.sub(e.p), d = to.length();
      const desired = to.normalize().multiplyScalar(e.speed);
      if (d > 20) desired.y = (1.4 - e.p.y) * 2;
      e.v.lerp(desired, Math.min(1, dt * 2)); e.p.addScaledVector(e.v, dt);
      e.mesh.position.copy(e.p); orientFrom(e.mesh, _al.copy(e.v).normalize(), 0);
      e.smokeT += dt; while (e.smokeT > 0.04) { e.smokeT -= 0.04; FX.smoke.spawn(e.p.clone(), { s0: 0.3, s1: 1.4, life: 1.4, a0: 0.45, smoke: true, v: new V3(-WAVE.flow, 0.2, 0) }); }
      if (d < 1.6) { shipImpact(e); e.dead = true; scene.remove(e.mesh); }
    }
  }
  for (let i = ENEMIES.length - 1; i >= 0; i--) if (ENEMIES[i].dead) ENEMIES.splice(i, 1);
  resolveHits(false);
  for (let i = SHIP_FIRES.length - 1; i >= 0; i--) {
    const f = SHIP_FIRES[i]; f.t -= dt;
    if (f.t <= 0) { SHIP_FIRES.splice(i, 1); continue; }
    const w = f.ship.group.localToWorld(f.local.clone());
    if (Math.random() < dt * 14) FX.smoke.spawn(w.clone(), { s0: 0.8, s1: 3.6, life: 3, a0: 0.6 * Math.min(1, f.t / 4), color: 0x262626, v: new V3(-WAVE.flow * 1.2, rand(0.8, 1.6), 0) });
    if (Math.random() < dt * 10) FX.flash.spawn(w, { s0: 0.9, s1: 1.4, life: 0.12, a0: 0.9 * Math.min(1, f.t / 4), color: 0xff7a20 });
  }
}
