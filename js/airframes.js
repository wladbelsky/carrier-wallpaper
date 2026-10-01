'use strict';
/* ===== Airframe models =====
   Every builder returns { group, setFold(f), tick(dt, st) }.
   Axes: +X nose, +Y up, +Z starboard; wheels touch y = 0; 1 unit ≈ 10 m.  */
const CANOPY = () => M(0x1a2838, { shininess: 90, specular: 0x88aacc });
function mirrorZ(pts) { return pts.map(p => [p[0], -p[1]]); }
function glowSprite(g, x, y, z, s, color) {
  const m = new THREE.SpriteMaterial({ map: TEX.flash, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0, color: color || 0xffaa66 });
  const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(s, s, 1); g.add(sp); return sp;
}
function gear(g, pts, h) { const gg = new THREE.Group(); g.add(gg); for (const [x, z] of pts) { box(gg, 0.035, h, 0.035, 0x222, x, h / 2, z); box(gg, 0.08, 0.06, 0.03, 0x1a1a1a, x, 0.03, z); } return gg; }

/* ---------- F/A-18 Hornet ---------- */
function buildFA18(color, big) {
  const g = new THREE.Group(), C = M(color || 0x8d959d), C2 = M(0x7b848c), D = M(0x3a4047), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.2; g.add(b);
  taper(b, 0.6, 0.16, 0.18, C, 0.55, 0.02, 0, 0.8, 0.7);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.36, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(1.03, 0.02, 0); b.add(nose);
  taper(b, 0.95, 0.2, 0.34, C, -0.2, 0, 0, 0.92, 0.72);
  taper(b, 0.38, 0.1, 0.13, CAN, 0.55, 0.13, 0, 0.6, 0.7, -0.04);
  for (const s of [-1, 1]) box(b, 0.36, 0.12, 0.1, D, 0.12, -0.06, s * 0.2);
  prism(b, [[0.78, 0.07], [0.12, 0.26], [0.12, 0.08]], 0.0, 0.025, C); prism(b, mirrorZ([[0.78, 0.07], [0.12, 0.26], [0.12, 0.08]]), 0.0, 0.025, C);
  const inner = [[0.14, 0.17], [-0.2, 0.42], [-0.44, 0.42], [-0.44, 0.17]];
  prism(b, inner, -0.02, 0.035, C); prism(b, mirrorZ(inner), -0.02, 0.035, C);
  const pivots = [];
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0, -0.02, s * 0.42); b.add(pv);
    const outer = [[-0.2, 0], [-0.38, 0.22], [-0.48, 0.22], [-0.44, 0]];
    prism(pv, s > 0 ? outer : mirrorZ(outer), 0, 0.03, C);
    const mi = cyl(pv, 0.022, 0.022, 0.38, 5, 0xe0e0e0, -0.36, 0.02, s * 0.23); mi.rotation.z = Math.PI / 2;
    pivots.push({ pv, s });
  }
  const stab = [[-0.52, 0.13], [-0.72, 0.36], [-0.84, 0.36], [-0.8, 0.13]];
  prism(b, stab, -0.01, 0.025, C); prism(b, mirrorZ(stab), -0.01, 0.025, C);
  for (const s of [-1, 1]) { const f = taper(b, 0.36, 0.34, 0.03, C2, -0.5, 0.22, s * 0.13, 0.5, 1, -0.1); f.rotation.x = s * 0.35; }
  for (const s of [-1, 1]) { const t = cyl(b, 0.055, 0.055, 0.38, 6, 0xb0b4b8, 0.0, -0.12, s * 0.3); t.rotation.z = Math.PI / 2; }
  for (const s of [-1, 1]) { const n = cyl(b, 0.08, 0.09, 0.12, 6, 0x222, -0.74, 0, s * 0.07); n.rotation.z = Math.PI / 2; }
  const gr = big ? null : gear(g, [[0.7, 0], [-0.25, 0.2], [-0.25, -0.2]], 0.2);
  const glow = glowSprite(g, -0.9, 0.2, 0, 0.7);
  mergeStatic(g, [...pivots.map(p => p.pv), gr]);
  return {
    group: g,
    setFold(f) { for (const p of pivots) p.pv.rotation.x = -p.s * f * 1.7; },
    tick(dt, st) { if (gr) gr.visible = st.gearDown !== false; glow.material.opacity += ((st.glow || 0) - glow.material.opacity) * Math.min(1, dt * 6); const sc = 0.5 + glow.material.opacity * 0.6; glow.scale.set(sc, sc, 1); }
  };
}

/* ---------- F-14 (Super) Tomcat — variable-sweep wings ---------- */
function buildF14(color, big) {
  const g = new THREE.Group(), C = M(color || 0x9aa1a8), C2 = M(0x858d95), D = M(0x3a4047), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.22; g.add(b);
  taper(b, 0.72, 0.17, 0.2, C, 0.62, 0.04, 0, 0.8, 0.7);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.42, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(1.18, 0.04, 0); b.add(nose);
  taper(b, 0.42, 0.11, 0.15, CAN, 0.66, 0.16, 0, 0.6, 0.72, -0.05);
  prism(b, [[0.35, 0.3], [-0.85, 0.36], [-0.85, -0.36], [0.35, -0.3]], -0.04, 0.07, C);          // "pancake"
  const glove = [[0.62, 0.12], [0.12, 0.37], [0.02, 0.37], [0.02, 0.12]];
  prism(b, glove, -0.01, 0.04, C); prism(b, mirrorZ(glove), -0.01, 0.04, C);
  for (const s of [-1, 1]) {
    taper(b, 1.05, 0.15, 0.17, C, -0.25, -0.03, s * 0.22, 0.95, 0.9);
    box(b, 0.18, 0.15, 0.17, D, 0.32, -0.03, s * 0.22);
    const n = cyl(b, 0.08, 0.085, 0.12, 6, 0x222, -0.82, -0.03, s * 0.22); n.rotation.z = Math.PI / 2;
    const f = taper(b, 0.38, 0.4, 0.03, C2, -0.6, 0.24, s * 0.22, 0.5, 1, -0.12); f.rotation.x = s * 0.1;
  }
  const stab = [[-0.55, 0.3], [-0.75, 0.6], [-0.9, 0.6], [-0.87, 0.3]];
  prism(b, stab, -0.02, 0.025, C); prism(b, mirrorZ(stab), -0.02, 0.025, C);
  for (const s of [-1, 1]) { const m = cyl(b, 0.03, 0.03, 0.4, 5, 0xe8e8e8, 0.1, -0.1, s * 0.08); m.rotation.z = Math.PI / 2; }
  const pivots = [];
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0.06, 0.0, s * 0.36); b.add(pv);
    const w = [[0.07, 0], [-0.12, 0], [-0.4, 0.95], [-0.29, 0.95]];
    prism(pv, s > 0 ? w : mirrorZ(w), 0, 0.03, C);
    pivots.push({ pv, s });
  }
  const gr = big ? null : gear(g, [[0.8, 0], [-0.15, 0.3], [-0.15, -0.3]], 0.22);
  const glow = glowSprite(g, -1.0, 0.19, 0, 0.8);
  mergeStatic(g, [...pivots.map(p => p.pv), gr]);
  let sweep = 20, fold = 0;
  return {
    group: g,
    setFold(f) { fold = f; },
    tick(dt, st) {
      if (gr) gr.visible = st.gearDown !== false;
      const flight = st.sweepTarget != null ? st.sweepTarget : 20;
      const target = lerp(flight, 75, fold);                 // parked: 75° oversweep
      sweep += clamp(target - sweep, -25 * dt, 25 * dt);
      for (const p of pivots) p.pv.rotation.y = -p.s * (sweep - 20) * DEG;
      glow.material.opacity += ((st.glow || 0) - glow.material.opacity) * Math.min(1, dt * 6);
      const sc = 0.55 + glow.material.opacity * 0.7; glow.scale.set(sc, sc, 1);
    }
  };
}

/* ---------- F-35C Lightning II — stealth, outer wing panels fold up ---------- */
function buildF35(color, big) {
  const g = new THREE.Group(), C = M(color || 0x737b83), C2 = M(0x646c74), D = M(0x33383d), CAN = M(0x3a3320, { shininess: 90, specular: 0xccaa55 });
  const b = new THREE.Group(); b.position.y = 0.2; g.add(b);
  taper(b, 0.5, 0.15, 0.2, C, 0.52, 0.03, 0, 0.75, 0.55);                                   // chined forebody
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 4), C)); nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2); nose.position.set(0.92, 0.03, 0); b.add(nose);
  taper(b, 0.9, 0.22, 0.44, C, -0.15, 0.01, 0, 0.9, 0.8);                                    // wide body, single engine
  taper(b, 0.34, 0.1, 0.13, CAN, 0.48, 0.14, 0, 0.6, 0.7, -0.04);
  for (const s of [-1, 1]) taper(b, 0.2, 0.12, 0.07, D, 0.24, 0.0, s * 0.21, 0.7, 1, 0.04);   // DSI intakes
  const inner = [[0.22, 0.2], [-0.24, 0.5], [-0.47, 0.5], [-0.46, 0.2]];
  prism(b, inner, -0.01, 0.03, C); prism(b, mirrorZ(inner), -0.01, 0.03, C);
  const pivots = [];
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0, -0.01, s * 0.5); b.add(pv);
    const outer = [[-0.24, 0], [-0.36, 0.17], [-0.49, 0.17], [-0.47, 0]];
    prism(pv, s > 0 ? outer : mirrorZ(outer), 0, 0.03, C);
    pivots.push({ pv, s });
  }
  const stab = [[-0.52, 0.15], [-0.67, 0.38], [-0.8, 0.38], [-0.77, 0.15]];
  prism(b, stab, 0.0, 0.025, C); prism(b, mirrorZ(stab), 0.0, 0.025, C);
  for (const s of [-1, 1]) { const f = taper(b, 0.3, 0.3, 0.03, C2, -0.56, 0.24, s * 0.15, 0.5, 1, -0.1); f.rotation.x = s * 0.4; }
  const n = cyl(b, 0.09, 0.1, 0.14, 8, 0x3a3a3a, -0.68, 0.01, 0); n.rotation.z = Math.PI / 2;
  const gr = big ? null : gear(g, [[0.6, 0], [-0.22, 0.22], [-0.22, -0.22]], 0.2);
  const glow = glowSprite(g, -0.82, 0.21, 0, 0.75);
  mergeStatic(g, [...pivots.map(p => p.pv), gr]);
  return {
    group: g,
    setFold(f) { for (const p of pivots) p.pv.rotation.x = -p.s * f * 1.75; },
    tick(dt, st) { if (gr) gr.visible = st.gearDown !== false; glow.material.opacity += ((st.glow || 0) - glow.material.opacity) * Math.min(1, dt * 6); const sc = 0.5 + glow.material.opacity * 0.6; glow.scale.set(sc, sc, 1); }
  };
}

/* ---------- Enemy fighters (static models; red fin tips mark hostiles) ---------- */
function enemyGlows(g, x, y, zs, s) { for (const z of zs) glowSprite(g, x, y, z, s, 0xff9a50).material.opacity = 0.7; }
/* Su-25 Frogfoot — subsonic attack jet: straight shoulder wing, twin engine pods, wingtip airbrake pods */
function buildSu25() {
  const g = new THREE.Group(), C = M(0x6b6a52), C2 = M(0x55553f), D = M(0x2c2a26), R = M(0x8f2b22), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.2; g.add(b);
  taper(b, 1.2, 0.17, 0.16, C, 0.05, 0.03, 0, 0.85, 0.75);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(0.79, 0.03, 0); b.add(nose);
  taper(b, 0.3, 0.1, 0.12, CAN, 0.42, 0.14, 0, 0.6, 0.7, -0.03);
  const wing = [[0.18, 0.1], [0.04, 0.72], [-0.12, 0.72], [-0.2, 0.1]];
  prism(b, wing, 0.06, 0.03, C); prism(b, mirrorZ(wing), 0.06, 0.03, C);
  for (const s of [-1, 1]) {
    taper(b, 0.72, 0.15, 0.13, C2, -0.12, 0.0, s * 0.15, 0.95, 0.9);                      // engine nacelle
    const nz = cyl(b, 0.055, 0.06, 0.08, 6, 0x222, -0.5, 0.0, s * 0.15); nz.rotation.z = Math.PI / 2;
    box(b, 0.2, 0.04, 0.04, D, -0.04, 0.07, s * 0.73);                                      // wingtip airbrake pod
    for (const z of [0.36, 0.55]) { const bomb = cyl(b, 0.025, 0.025, 0.22, 5, 0x55554a, 0.0, 0.0, s * z); bomb.rotation.z = Math.PI / 2; }
  }
  taper(b, 0.32, 0.36, 0.03, C, -0.56, 0.25, 0, 0.5, 1, -0.12);
  box(b, 0.12, 0.07, 0.035, R, -0.66, 0.42, 0);
  const stab = [[-0.5, 0.06], [-0.66, 0.34], [-0.76, 0.34], [-0.74, 0.06]];
  prism(b, stab, 0.12, 0.025, C); prism(b, mirrorZ(stab), 0.12, 0.025, C);
  enemyGlows(g, -0.58, 0.2, [-0.15, 0.15], 0.55);
  mergeStatic(g, []); return g;
}
/* Su-33 Flanker-D — naval Flanker: long nose, canards, widely spaced engines, twin fins, tail sting */
function buildSu33() {
  const g = new THREE.Group(), C = M(0x5f6c7a), C2 = M(0x4a5663), D = M(0x2c2f33), R = M(0x8f2b22), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.22; g.add(b);
  taper(b, 0.72, 0.15, 0.16, C, 0.62, 0.06, 0, 0.75, 0.7);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(1.15, 0.06, 0); b.add(nose);
  taper(b, 0.3, 0.1, 0.12, CAN, 0.66, 0.18, 0, 0.6, 0.7, -0.04);
  prism(b, [[0.4, 0.15], [-0.95, 0.3], [-0.95, -0.3], [0.4, -0.15]], -0.02, 0.1, C);        // lifting body
  const wing = [[0.45, 0.14], [-0.12, 0.4], [-0.45, 0.8], [-0.6, 0.8], [-0.62, 0.28]];
  prism(b, wing, 0.03, 0.03, C); prism(b, mirrorZ(wing), 0.03, 0.03, C);
  const can = [[0.4, 0.14], [0.24, 0.33], [0.15, 0.33], [0.17, 0.14]];
  prism(b, can, 0.06, 0.02, C); prism(b, mirrorZ(can), 0.06, 0.02, C);
  for (const s of [-1, 1]) {
    taper(b, 0.95, 0.15, 0.16, C2, -0.42, -0.07, s * 0.2, 0.95, 0.9);
    box(b, 0.16, 0.12, 0.14, D, 0.12, -0.08, s * 0.2);                                     // intake
    const nz = cyl(b, 0.07, 0.075, 0.1, 6, 0x222, -0.94, -0.07, s * 0.2); nz.rotation.z = Math.PI / 2;
    taper(b, 0.38, 0.42, 0.03, C, -0.68, 0.3, s * 0.3, 0.5, 1, -0.14);
    box(b, 0.1, 0.06, 0.035, R, -0.85, 0.49, s * 0.3);
  }
  const stab = [[-0.7, 0.28], [-0.9, 0.6], [-1.02, 0.6], [-1.0, 0.28]];
  prism(b, stab, -0.03, 0.025, C); prism(b, mirrorZ(stab), -0.03, 0.025, C);
  const sting = cyl(b, 0.04, 0.05, 0.25, 6, C2, -1.05, 0.0, 0); sting.rotation.z = Math.PI / 2;
  enemyGlows(g, -1.02, 0.15, [-0.2, 0.2], 0.6);
  mergeStatic(g, []); return g;
}
/* Su-47 Berkut — forward-swept wings, canards, tail booms, dark finish */
function buildSu47() {
  const g = new THREE.Group(), C = M(0x34383d), C2 = M(0x26292d), D = M(0x1c1d20), R = M(0x8f2b22), CAN = CANOPY();
  const b = new THREE.Group(); b.position.y = 0.22; g.add(b);
  taper(b, 0.75, 0.15, 0.16, C, 0.65, 0.06, 0, 0.75, 0.7);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 6), C)); nose.rotation.z = -Math.PI / 2; nose.position.set(1.2, 0.06, 0); b.add(nose);
  taper(b, 0.3, 0.1, 0.12, CAN, 0.7, 0.18, 0, 0.6, 0.7, -0.04);
  prism(b, [[0.45, 0.15], [-0.95, 0.27], [-0.95, -0.27], [0.45, -0.15]], -0.02, 0.1, C);
  const wing = [[0.05, 0.2], [0.14, 0.84], [-0.02, 0.86], [-0.62, 0.24]];                   // forward sweep
  prism(b, wing, 0.03, 0.03, C); prism(b, mirrorZ(wing), 0.03, 0.03, C);
  const can = [[0.55, 0.13], [0.38, 0.36], [0.28, 0.36], [0.31, 0.13]];
  prism(b, can, 0.06, 0.02, C); prism(b, mirrorZ(can), 0.06, 0.02, C);
  for (const s of [-1, 1]) {
    taper(b, 0.95, 0.15, 0.15, C2, -0.42, -0.07, s * 0.19, 0.95, 0.9);
    box(b, 0.16, 0.12, 0.13, D, 0.14, -0.08, s * 0.19);
    const nz = cyl(b, 0.065, 0.07, 0.1, 6, 0x111, -0.94, -0.07, s * 0.19); nz.rotation.z = Math.PI / 2;
    const f = taper(b, 0.34, 0.38, 0.03, C, -0.66, 0.29, s * 0.3, 0.5, 1, -0.12); f.rotation.x = s * 0.12;
    box(b, 0.1, 0.06, 0.035, R, -0.8, 0.46, s * 0.33);
    const boom = cyl(b, 0.03, 0.04, 0.3, 5, C2, -1.0, 0.0, s * 0.3); boom.rotation.z = Math.PI / 2;  // tail boom
  }
  const stab = [[-0.82, 0.3], [-0.96, 0.52], [-1.06, 0.52], [-1.04, 0.3]];
  prism(b, stab, 0.0, 0.025, C); prism(b, mirrorZ(stab), 0.0, 0.025, C);
  enemyGlows(g, -1.0, 0.15, [-0.19, 0.19], 0.6);
  mergeStatic(g, []); return g;
}
/* Su-57 Felon — stealth: flat lifting body, LEVCONs, wide-spaced engines, all-moving canted fins */
function buildSu57() {
  const g = new THREE.Group(), C = M(0x7a838c), C2 = M(0x545b62), D = M(0x2c2f33), R = M(0x8f2b22), CAN = M(0x3a3320, { shininess: 90, specular: 0xccaa55 });
  const b = new THREE.Group(); b.position.y = 0.2; g.add(b);
  taper(b, 0.55, 0.14, 0.2, C, 0.8, 0.04, 0, 0.7, 0.55);
  const nose = shade(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), C)); nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2); nose.position.set(1.2, 0.04, 0); b.add(nose);
  taper(b, 0.32, 0.1, 0.13, CAN, 0.78, 0.16, 0, 0.6, 0.7, -0.04);
  prism(b, [[0.6, 0.1], [0.2, 0.3], [-0.86, 0.36], [-0.86, -0.36], [0.2, -0.3], [0.6, -0.1]], -0.02, 0.1, C);
  const levcon = [[0.55, 0.12], [0.36, 0.31], [0.28, 0.31], [0.3, 0.12]];
  prism(b, levcon, 0.03, 0.02, C); prism(b, mirrorZ(levcon), 0.03, 0.02, C);
  const wing = [[0.2, 0.3], [-0.38, 0.76], [-0.56, 0.76], [-0.6, 0.3]];
  prism(b, wing, 0.03, 0.03, C); prism(b, mirrorZ(wing), 0.03, 0.03, C);
  for (const s of [-1, 1]) {
    taper(b, 0.9, 0.14, 0.17, C2, -0.42, -0.07, s * 0.24, 0.95, 0.9);
    taper(b, 0.18, 0.12, 0.12, D, 0.14, -0.08, s * 0.24, 0.8, 1, 0.03);
    const nz = cyl(b, 0.065, 0.07, 0.1, 8, 0x222, -0.92, -0.07, s * 0.24); nz.rotation.z = Math.PI / 2;
    const f = taper(b, 0.32, 0.32, 0.03, C2, -0.62, 0.24, s * 0.27, 0.5, 1, -0.12); f.rotation.x = s * 0.45;
    box(b, 0.09, 0.05, 0.035, R, -0.75, 0.37, s * 0.36);
  }
  const stab = [[-0.62, 0.36], [-0.82, 0.6], [-0.95, 0.6], [-0.9, 0.36]];
  prism(b, stab, 0.0, 0.025, C); prism(b, mirrorZ(stab), 0.0, 0.025, C);
  enemyGlows(g, -1.0, 0.13, [-0.24, 0.24], 0.6);
  mergeStatic(g, []); return g;
}

/* ---------- E-2D Hawkeye (AWACS) — Sto-Wing fold ---------- */
function buildE2D(color) {
  const g = new THREE.Group(), C = M(color || 0xc2c6ca), C2 = M(0xa9aeb3), D = M(0x33383d), CAN = CANOPY();
  taper(g, 1.3, 0.25, 0.27, C, 0.05, 0.3, 0, 0.9, 0.8);
  taper(g, 0.36, 0.22, 0.24, C, 0.86, 0.28, 0, 0.6, 0.7, -0.06);
  taper(g, 0.24, 0.08, 0.24, CAN, 0.83, 0.41, 0, 0.6, 0.85, -0.03);
  taper(g, 0.55, 0.18, 0.2, C, -0.83, 0.36, 0, 0.8, 0.6, 0.06);
  prism(g, [[0.19, -0.62], [0.19, 0.62], [-0.08, 0.62], [-0.08, -0.62]], 0.44, 0.04, C);   // wing centre section
  const props = [];
  for (const s of [-1, 1]) {
    taper(g, 0.72, 0.14, 0.14, C2, 0.12, 0.38, s * 0.4, 0.9, 0.9);
    const sp = shade(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), D)); sp.rotation.z = -Math.PI / 2; sp.position.set(0.53, 0.38, s * 0.4); g.add(sp);
    const pr = new THREE.Group(); pr.position.set(0.5, 0.38, s * 0.4); g.add(pr);
    for (let i = 0; i < 4; i++) { const bl = new THREE.Group(); bl.rotation.x = i * Math.PI / 4; pr.add(bl); box(bl, 0.02, 0.4, 0.04, D, 0, 0, 0).castShadow = false; }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: 0x2a2f34, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.y = Math.PI / 2; pr.add(disc);
    props.push({ pr, disc });
  }
  const pivots = [], qId = new THREE.Quaternion();
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0.05, 0.44, s * 0.62); g.add(pv);
    const w = [[0.14, 0], [-0.08, 0], [-0.04, 0.62], [0.08, 0.62]];
    prism(pv, s > 0 ? w : mirrorZ(w), 0, 0.035, C);
    const qz = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), 1.45);     // twist chord upright (leading edge up)
    const qy = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), -s * 1.6); // swing aft
    pivots.push({ pv, qf: qy.multiply(qz) });
  }
  // rotodome
  strut(g, new V3(-0.05, 0.42, 0.05), new V3(-0.2, 0.78, 0.05), 0.02, C2); strut(g, new V3(-0.35, 0.42, -0.05), new V3(-0.22, 0.78, -0.05), 0.02, C2);
  const dome = new THREE.Group(); dome.position.set(-0.2, 0.82, 0); g.add(dome);
  cyl(dome, 0.37, 0.37, 0.07, 18, 0xe8eaec, 0, 0, 0); box(dome, 0.5, 0.075, 0.04, 0x44484d, 0, 0, 0);
  box(g, 0.2, 0.03, 0.95, C, -0.92, 0.46, 0);
  for (const z of [-0.47, -0.17, 0.17, 0.47]) taper(g, 0.22, 0.32, 0.03, C2, -0.94, 0.62, z, 0.6, 1, -0.05);
  const gr = gear(g, [[0.7, 0], [0.1, 0.4], [0.1, -0.4]], 0.2);
  mergeStatic(g, [...props.flatMap(p => [p.pr, ...p.pr.children.filter(c => c.isGroup)]), ...pivots.map(p => p.pv), dome, gr]);
  let ang = 0, spin = 0;
  return {
    group: g,
    setFold(f) { const k = smoothstep(0, 1, f); for (const p of pivots) p.pv.quaternion.copy(qId).slerp(p.qf, k); },
    tick(dt, st) {
      gr.visible = st.gearDown !== false;
      spin += ((st.engineOn ? 1 : 0) - spin) * Math.min(1, dt * 0.8);
      ang += spin * 40 * dt;
      for (const p of props) { p.pr.rotation.x = ang; p.pr.children.forEach(c => { if (c.isGroup) c.visible = spin < 0.7 || Math.random() < 0.5; }); p.disc.material.opacity = 0.25 * smoothstep(0.4, 1, spin); }
      if (st.airborne) dome.rotation.y += dt * 0.6;
    }
  };
}

/* ---------- Helicopter helpers ---------- */
function heliRotor(g, x, y, n, len, chord, color) {
  const rotor = new THREE.Group(); rotor.position.set(x, y, 0); g.add(rotor);
  cyl(rotor, 0.07, 0.07, 0.06, 6, color, 0, 0, 0);
  const blades = [];
  for (let i = 0; i < n; i++) {
    const h = new THREE.Group(); h.rotation.y = i * TAU / n; rotor.add(h);
    box(h, len, 0.02, chord, color, len / 2 + 0.05, 0, 0).castShadow = false;
    // folded: all blades swing back over the tail in a tight fan
    const fy = Math.PI + (i - (n - 1) / 2) * 0.09;
    blades.push({ h, base: i * TAU / n, fold: fy });
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(len + 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x2a2f34, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; rotor.add(disc);
  return { rotor, blades, disc, n };
}
function tailRotor(g, x, y, z, r, color) {
  const t = new THREE.Group(); t.position.set(x, y, z); g.add(t);
  box(t, 0.03, r * 2, 0.02, color, 0, 0, 0); box(t, r * 2, 0.03, 0.02, color, 0, 0, 0);
  return t;
}
function heliModel(g, R, T, searchPos) {
  mergeStatic(g, [R.rotor, ...R.blades.map(b => b.h), T]);
  let fold = 1, spin = 0;
  return {
    group: g, searchPos,
    setFold(f) { fold = f; },
    tick(dt, st) {
      spin = st.rotor || 0;
      if (fold > 0.001) {
        R.rotor.rotation.y = 0;
        for (const b of R.blades) b.h.rotation.y = lerp(b.base, b.fold, smoothstep(0, 1, fold));
      } else {
        R.rotor.rotation.y = st.rotorAng || 0;
        for (const b of R.blades) { b.h.rotation.y = b.base; b.h.visible = spin < 0.85 || Math.random() < 0.5; }
      }
      if (T) T.rotation.z = (st.rotorAng || 0) * 1.7;
      R.disc.material.opacity = 0.28 * smoothstep(0.4, 1, spin);
    }
  };
}

/* ---------- MH-60R Seahawk (utility / ASW) — real proportions: 15.3 m fuselage, 16.4 m rotor ---------- */
function buildMH60(color) {
  const g = new THREE.Group(), C = M(color || 0x6f7880), C2 = M(0x626b73), D = M(0x33383d), CAN = CANOPY();
  // fuselage: boxy cabin, cockpit with sloped windscreen, short drooping nose
  taper(g, 0.46, 0.2, 0.24, C, 0.03, 0.14, 0, 1.0, 0.85);                             // cabin
  taper(g, 0.22, 0.2, 0.235, C, 0.37, 0.14, 0, 0.55, 0.8, -0.05);                     // cockpit
  taper(g, 0.14, 0.11, 0.2, C, 0.53, 0.095, 0, 0.6, 0.8, -0.03);                      // nose
  taper(g, 0.12, 0.1, 0.24, CAN, 0.43, 0.2, 0, 0.4, 0.8, -0.035);                     // windscreen
  for (const s of [-1, 1]) {
    box(g, 0.15, 0.065, 0.006, CAN, 0.36, 0.175, s * 0.119);                          // cockpit side windows
    box(g, 0.06, 0.05, 0.006, CAN, 0.17, 0.18, s * 0.121);                            // cabin window
  }
  box(g, 0.17, 0.14, 0.006, D, 0.04, 0.12, 0.122);                                     // sliding cabin door (starboard)
  // engine deck: fairing, twin engines side by side, exhausts angled outboard, rotor mast
  taper(g, 0.5, 0.07, 0.19, C, -0.01, 0.275, 0, 0.85, 0.75);
  for (const s of [-1, 1]) {
    const e = cyl(g, 0.045, 0.045, 0.28, 8, C2, -0.05, 0.285, s * 0.1); e.rotation.z = Math.PI / 2;
    const i = cyl(g, 0.038, 0.038, 0.02, 8, D, 0.095, 0.285, s * 0.1); i.rotation.z = Math.PI / 2;
    const x = box(g, 0.08, 0.04, 0.05, D, -0.21, 0.29, s * 0.13); x.rotation.y = s * 0.5;
  }
  cyl(g, 0.025, 0.035, 0.07, 6, D, 0.0, 0.345, 0);
  // tail cone: deep at the cabin, slim at the pylon, bottom sweeping up (a taper turned to point aft)
  const tc = taper(g, 0.17, 0.64, 0.16, C, -0.49, 0.145, 0, 0.35, 0.38, 0.05); tc.rotation.z = Math.PI / 2;
  taper(g, 0.17, 0.32, 0.045, C, -0.86, 0.36, 0, 0.55, 0.8, -0.06);                   // swept tail pylon
  box(g, 0.06, 0.04, 0.05, D, -0.9, 0.48, 0);                                          // tail gearbox
  const stab = [[-0.8, 0.0], [-0.82, 0.22], [-0.92, 0.22], [-0.92, 0.0]];
  prism(g, stab, 0.22, 0.015, C); prism(g, mirrorZ(stab), 0.22, 0.015, C);           // stabilator at the pylon base
  // landing gear: two main wheels under the cockpit, tail wheel aft of the cabin
  for (const s of [-1, 1]) {
    const st = box(g, 0.025, 0.09, 0.025, D, 0.33, 0.07, s * 0.145); st.rotation.x = s * 0.35;
    const w = cyl(g, 0.035, 0.035, 0.03, 8, 0x1a1a1a, 0.33, 0.035, s * 0.165); w.rotation.x = Math.PI / 2;
  }
  box(g, 0.025, 0.06, 0.025, D, -0.42, 0.06, 0);
  const tw = cyl(g, 0.03, 0.03, 0.025, 8, 0x1a1a1a, -0.43, 0.03, 0); tw.rotation.x = Math.PI / 2;
  // MH-60R kit: chin FLIR ball, belly radome, weapon pylons (Mk 54 torpedo port, Hellfire rack starboard)
  const fl =shade(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), D)); fl.position.set(0.52, 0.045, 0); g.add(fl);
  const rd = shade(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 5, 0, TAU, 0, Math.PI / 2), M(0xd8d8d0))); rd.rotation.x = Math.PI; rd.position.set(-0.02, 0.05, 0); g.add(rd);
  for (const s of [-1, 1]) box(g, 0.1, 0.015, 0.09, C, -0.1, 0.2, s * 0.16);
  const tp = cyl(g, 0.018, 0.018, 0.22, 6, 0x9a9a92, -0.1, 0.172, -0.2); tp.rotation.z = Math.PI / 2;
  box(g, 0.14, 0.04, 0.05, D, -0.1, 0.175, 0.2);
  const R = heliRotor(g, 0.0, 0.38, 4, 0.77, 0.055, 0x2d3237);
  const th = new THREE.Group(); th.position.set(-0.9, 0.43, 0.04); th.rotation.x = -0.35; g.add(th);   // tail rotor: starboard, canted 20°
  const T = tailRotor(th, 0, 0, 0, 0.167, 0x2d3237);
  navLights(g, [[0.1, 0.2, -0.13, 0xff2a1a], [0.1, 0.2, 0.13, 0x22ff66], [-0.96, 0.3, 0, 0xffffff]], null, 0.8);
  navLights(g, [[0, 0.03, 0, 0xff2020], [0, 0.33, 0, 0xff3030]], { period: 1.0, duty: 0.18, phase: Math.random() }, 1.0);
  return heliModel(g, R, T, new V3(0.5, 0.08, 0));
}

/* ---------- CH-53 Sea Stallion (heavy transport) ---------- */
function buildCH53(color) {
  const g = new THREE.Group(), C = M(color || 0x6a705f), D = M(0x33383d), CAN = CANOPY();
  taper(g, 1.5, 0.52, 0.52, C, 0, 0.44, 0, 0.95, 0.88);
  taper(g, 0.48, 0.44, 0.5, C, 0.98, 0.4, 0, 0.6, 0.8, -0.09);
  taper(g, 0.24, 0.18, 0.46, CAN, 1.0, 0.56, 0, 0.6, 0.9, -0.04);
  for (const s of [-1, 1]) {
    taper(g, 0.8, 0.2, 0.22, C, -0.05, 0.22, s * 0.36, 0.9, 0.8);
    const e = cyl(g, 0.085, 0.09, 0.55, 7, D, 0.12, 0.8, s * 0.22); e.rotation.z = Math.PI / 2;
    box(g, 0.1, 0.12, 0.14, D, -0.15, 0.08, s * 0.36);
  }
  taper(g, 0.9, 0.2, 0.36, D, 0.02, 0.78, 0, 0.8, 0.8);
  taper(g, 0.5, 0.42, 0.48, C, -0.98, 0.5, 0, 0.9, 0.75, 0.06);
  taper(g, 0.8, 0.22, 0.18, C, -1.55, 0.64, 0, 1, 0.6);
  const p = taper(g, 0.3, 0.62, 0.07, C, -2.0, 0.94, 0, 0.6, 1, -0.1); p.rotation.x = -0.3;
  box(g, 0.18, 0.03, 0.46, C, -2.02, 1.12, 0.22);
  box(g, 0.12, 0.12, 0.1, D, 0.75, 0.08, 0);
  const R = heliRotor(g, 0.05, 0.98, 7, 1.15, 0.08, 0x2d3237);
  const T = tailRotor(g, -2.05, 1.08, -0.1, 0.34, 0x2d3237);
  navLights(g, [[0.2, 0.55, -0.48, 0xff2a1a], [0.2, 0.55, 0.48, 0x22ff66], [-2.05, 0.7, 0, 0xffffff]], null, 0.9);
  navLights(g, [[0, 0.16, 0, 0xff2020], [0.05, 0.92, 0, 0xff3030]], { period: 1.1, duty: 0.18, phase: Math.random() }, 1.1);
  return heliModel(g, R, T, new V3(1.1, 0.2, 0));
}

/* ---------- AH-1Z Viper (attack) ---------- */
function buildAH1(color) {
  const g = new THREE.Group(), C = M(color || 0x5c6352), D = M(0x33383d), CAN = CANOPY();
  taper(g, 1.0, 0.36, 0.3, C, 0, 0.38, 0, 0.9, 0.7);
  taper(g, 0.46, 0.26, 0.24, C, 0.72, 0.32, 0, 0.5, 0.7, -0.05);
  taper(g, 0.3, 0.14, 0.2, CAN, 0.62, 0.5, 0, 0.7, 0.8);
  taper(g, 0.3, 0.17, 0.2, CAN, 0.27, 0.56, 0, 0.7, 0.8);
  taper(g, 0.62, 0.16, 0.32, D, -0.08, 0.62, 0, 0.8, 0.8);
  const tur = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), D)); tur.position.set(0.86, 0.2, 0); g.add(tur);
  const gun = cyl(g, 0.015, 0.015, 0.25, 4, 0x222, 0.98, 0.18, 0); gun.rotation.z = Math.PI / 2;
  box(g, 0.24, 0.03, 0.86, C, 0.02, 0.36, 0);
  for (const s of [-1, 1]) {
    const pod = cyl(g, 0.055, 0.055, 0.3, 7, D, 0.02, 0.29, s * 0.3); pod.rotation.z = Math.PI / 2;
    for (let i = 0; i < 2; i++) { const m = cyl(g, 0.022, 0.022, 0.3, 5, 0xd8d8d0, 0.03, 0.3 - i * 0.05, s * 0.42); m.rotation.z = Math.PI / 2; }
  }
  taper(g, 1.0, 0.14, 0.12, C, -0.95, 0.44, 0, 1, 0.6);
  taper(g, 0.22, 0.38, 0.04, C, -1.45, 0.62, 0, 0.6, 1, -0.06);
  box(g, 0.12, 0.02, 0.36, C, -1.2, 0.44, 0);
  for (const s of [-1, 1]) { box(g, 1.0, 0.03, 0.04, D, 0.05, 0.02, s * 0.22); box(g, 0.03, 0.2, 0.03, D, 0.3, 0.12, s * 0.2); box(g, 0.03, 0.2, 0.03, D, -0.2, 0.12, s * 0.2); }
  const R = heliRotor(g, 0.02, 0.78, 4, 0.7, 0.06, 0x2d3237);
  const T = tailRotor(g, -1.47, 0.68, 0.05, 0.15, 0x2d3237);
  navLights(g, [[0.0, 0.36, -0.44, 0xff2a1a], [0.0, 0.36, 0.44, 0x22ff66], [-1.52, 0.55, 0, 0xffffff]], null, 0.8);
  navLights(g, [[0, 0.7, 0, 0xff3030]], { period: 0.9, duty: 0.18, phase: Math.random() }, 1.0);
  return heliModel(g, R, T, new V3(0.9, 0.15, 0));
}
