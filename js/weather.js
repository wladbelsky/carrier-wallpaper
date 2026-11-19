'use strict';
/* ===== Weather: sea state, overcast, rain, sea fog and storm =====
   Each weather kind is one flat parameter set (WEATHER_KINDS). WEATHER.cur chases the target over a
   few seconds, so switching kinds cross-fades instead of snapping:
     updateEnvironment() -> WEATHER.apply(k) bends the time-of-day palette (sun / hemi / fog / water);
     step()              -> WEATHER.update(dt) owns the rain pool, the storm lightning and the fog range.
   CFG.weather === 'off' means every parameter sits at neutral, i.e. the stock look. ===== */

const WEATHER_NAMES = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Fog', storm: 'Storm' };

/* sun / hemi = light multiplier, fogMix = how far the fog colour moves toward tint,
   fogK = fog range thickness (0 = stock), waterDark, wave = sea state, rain = drop count,
   wind = drift, flash = lightning */
function weatherParams(sun, hemi, tintHex, fogMix, fogK, waterDark, wave, rain, wind, flash) {
  const c = new THREE.Color(tintHex);
  return { sun, hemi, fogMix, fogK, waterDark, wave, rain, wind, flash, r: c.r, g: c.g, b: c.b };
}
const WEATHER_KINDS = {
  clear:    weatherParams(1.00, 1.00, 0x9fc0da, 0.00, 0.00, 0.00, 1.00,    0, 0.00, 0),
  overcast: weatherParams(0.44, 1.20, 0xa4aeb6, 0.68, 0.20, 0.46, 1.12,    0, 0.35, 0),
  rain:     weatherParams(0.36, 1.04, 0x8c969e, 0.72, 0.44, 0.40, 1.34,  820, 0.85, 0),
  fog:      weatherParams(0.30, 1.30, 0xb8c1c8, 0.86, 0.78, 0.10, 0.70,    0, 0.10, 0),
  storm:    weatherParams(0.24, 0.95, 0x6b767f, 0.82, 0.58, 0.52, 1.70, 1200, 1.40, 1)
};
const WEATHER_NEUTRAL = weatherParams(1, 1, 0x9fc0da, 0, 0, 0, 1, 0, 0, 0);
const WEATHER_AUTO_POOL = ['clear', 'clear', 'overcast', 'overcast', 'rain', 'rain', 'fog', 'storm'];

/* off-centre multiply: keeps 1 as "unchanged" so the intensity slider scales the distance from stock */
const wx = (v, I) => 1 + (v - 1) * I;

const _wtint = new THREE.Color(), _wwhite = new THREE.Color(0xffffff);

class Rain {
  constructor(scene, n) {
    this.n = n;
    const geo = new THREE.BoxGeometry(0.05, 1, 0.05);
    geo.translate(0, -0.5, 0);                              // pivot at the head, the streak hangs along -Y
    const mat = new THREE.MeshBasicMaterial({ color: 0xd6e2ee, transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.count = 0; this.mesh.visible = false;
    this.items = [];
    for (let i = 0; i < n; i++) this.items.push({ p: new V3(), speed: 60, len: 2, wk: 1, seeded: false });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._s = new V3(); this._d = new V3(); this._down = new V3(0, -1, 0);
    scene.add(this.mesh);
  }
  /* drops live in a box around the carrier so they stay in frame while the camera orbits */
  seed(it, anywhere) {
    it.p.set(CAM_TGT.x + rand(-165, 165), anywhere ? rand(0, 95) : rand(55, 95), CAM_TGT.z + rand(-165, 165));
    it.speed = rand(48, 80); it.len = rand(2.2, 5.2); it.wk = rand(0.7, 1.3); it.seeded = true;
  }
  update(dt, count, windX, windZ, tint) {
    if (count <= 0) { this.mesh.visible = false; return; }
    const n = Math.min(count, this.n);
    this.mesh.visible = true; this.mesh.count = n;
    this.mesh.material.color.copy(tint);
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      if (!it.seeded) this.seed(it, true);
      it.p.x += windX * it.wk * dt; it.p.z += windZ * it.wk * dt; it.p.y -= it.speed * dt;
      if (it.p.y < waveH(it.p.x, it.p.z) - 0.4) this.seed(it, false);
      this._d.set(windX * it.wk, -it.speed, windZ * it.wk).normalize();
      this._q.setFromUnitVectors(this._down, this._d);
      this._s.set(1, it.len, 1);
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const WEATHER = {
  kind: 'off',            // CFG.weather as received from Wallpaper Engine
  tgtName: 'clear',       // the kind we are blending towards
  cur: Object.assign({}, WEATHER_NEUTRAL),
  intensity: 1,           // CFG.weatherInt / 100, 0..2
  rain: null,
  flash: 0, flashT: 0, wasFlash: 0,
  autoT: 0,
  baseHemi: 1, baseSun: 1, baseFog: new THREE.Color(),

  init(scene) { if (!this.rain) this.rain = new Rain(scene, 1400); },

  setKind(k) {
    this.kind = k;
    if (k === 'auto') { this.pickAuto(true); return; }
    if (WEATHER_KINDS[k]) { this.tgtName = k; }
    else { this.tgtName = 'clear'; }
    this.tgt = this.kind === 'off' ? WEATHER_NEUTRAL : WEATHER_KINDS[this.tgtName];
  },
  pickAuto(first) {
    let k = this.tgtName;
    for (let i = 0; i < 8 && k === this.tgtName; i++) k = pick(WEATHER_AUTO_POOL);
    this.tgtName = k;
    this.tgt = WEATHER_KINDS[k];
    this.autoT = first ? rand(40, 90) : rand(105, 195);
  },

  /* effective values for the current blend (intensity applied, neutral when off) */
  get waveMul() { const I = clamp(this.intensity, 0, 2); return clamp(wx(this.cur.wave, I), 0.3, 2.5); },
  get sunMul() { const I = clamp(this.intensity, 0, 2); return I <= 0.001 ? 1 : clamp(wx(this.cur.sun, I), 0.05, 1.2); },   // direct sun left
  get fogK() { return clamp(this.cur.fogK * clamp(this.intensity, 0, 2), 0, 1); },
  get foamRate() { return this.cur.rain * 0.02 * clamp(this.intensity, 0, 2); },
  get tag() { return this.kind === 'off' ? '' : ' · ' + WEATHER_NAMES[this.tgtName]; },
  get active() { return this.kind !== 'off'; },
  /* still blending toward the target: updateEnvironment() runs more often meanwhile, so the palette fades smoothly */
  get settling() { for (const key in this.cur) if (Math.abs(this.tgt[key] - this.cur[key]) > (key === 'rain' ? 5 : 0.005)) return true; return false; },

  /* called from updateEnvironment(): bend the palette before it is pushed to the lights */
  apply(k, elev) {
    const I = clamp(this.intensity, 0, 2), p = this.cur;
    if (I <= 0.001) return;              // 'off' still applies: cur fades to WEATHER_NEUTRAL (an exact no-op) instead of snapping
    const day = smoothstep(-12, 8, elev);                 // fog at night must be dark, not white
    const night = 0.28 + 0.72 * day;
    _wtint.setRGB(p.r * night, p.g * night, p.b * night);
    const fm = clamp(p.fogMix * I, 0, 1), wd = clamp(p.waterDark * I, 0, 1);
    k.sun.lerp(_wtint, 0.50 * fm);
    k.si *= clamp(wx(p.sun, I), 0.05, 1.2);
    k.hs.lerp(_wtint, 0.65 * fm);
    k.hg.lerp(_wtint, 0.30 * fm);
    k.hi *= clamp(wx(p.hemi, I), 0.3, 2);
    k.fog.lerp(_wtint, fm);
    k.water.multiplyScalar(1 - 0.55 * wd).lerp(_wtint, 0.30 * fm);
    k.spec.multiplyScalar(1 - 0.70 * fm);
  },
  /* remember what the palette produced so the lightning can flash on top of it every frame */
  capture(hemiI, sunI, fogColor) {
    this.baseHemi = hemiI; this.baseSun = sunI; this.baseFog.copy(fogColor);
  },

  update(dt) {
    const I = clamp(this.intensity, 0, 2);
    if (this.kind === 'auto') { this.autoT -= dt; if (this.autoT <= 0) this.pickAuto(false); }
    // cross-fade the parameter set (about 2.5 s to settle)
    const a = 1 - Math.exp(-dt / 2.5);
    for (const key in this.cur) this.cur[key] += (this.tgt[key] - this.cur[key]) * a;

    // lightning: bright ambient double-flash inside the storm
    if (this.cur.flash * I > 0.5) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash = 1; this.flashT = rand(5, 15); }
    }
    this.flash = Math.max(0, this.flash - dt * 3.6);

    hemi.intensity = this.baseHemi * (1 + 3.2 * this.flash);
    sunLight.intensity = this.baseSun * (1 + 1.1 * this.flash);
    if (this.flash > 0 || this.wasFlash > 0) {
      _wtint.copy(this.baseFog).lerp(_wwhite, 0.78 * this.flash);
      scene.fog.color.copy(_wtint); renderer.setClearColor(_wtint);
    }
    this.wasFlash = this.flash;

    applyFogDist();
    if (this.rain) {
      _wtint.setRGB(0.42 + 0.42 * (1 - ENV.night), 0.48 + 0.40 * (1 - ENV.night), 0.55 + 0.38 * (1 - ENV.night));
      const wind = 6.5 * this.cur.wind * I;
      this.rain.update(dt, Math.round(this.cur.rain * I), wind, wind * 0.42, _wtint);
    }
  }
};
