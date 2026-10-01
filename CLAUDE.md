# Carrier Strike Group — Wallpaper Engine web wallpaper

Isometric three.js scene (carrier, two destroyers, air wing, enemies) that reacts to system audio.
Runs 24/7 inside Wallpaper Engine (CEF/Chromium); also previewable in a normal browser.
User-facing docs: `README.md` (keep it in sync when behaviour or properties change).

## Stack & layout
- Plain JS, no build step, no npm. `'use strict'` classic scripts sharing **global** scope
  (no modules). three.js **r149** is vendored as `js/three.min.js` — never edit it.
- `index.html` loads scripts in dependency order (later files use globals of earlier ones):
  `core → flightpath → models → airframes → effects → radio → aircraft → combat → main → properties → settings`,
  then an inline script registers the WE audio listener (or starts the browser demo beat).
  `main.js` calls `init()` at its end, so anything `init()` needs must be defined before `main.js`.

| File | Contents |
|---|---|
| `js/core.js` | utils (`V3`, `rand`, `clamp`, `lerp`, `smoothstep`, `pick`…), `CFG` defaults, waves (JS + generated GLSL — keep in sync), sun position, sky palette, canvas textures `TEX` |
| `js/flightpath.js` | `FlightPath`: Dubins CSC curves (turn-radius-limited flight) + lines |
| `js/models.js` | mesh helpers (`M`, `box`, `cyl`, `taper`, `prism`…), `mergeStatic`, `disposeTree`, nav lights, searchlights, CIWS/gun mounts, `buildCarrier`, `buildDestroyer` |
| `js/airframes.js` | aircraft model builders → `{ group, setFold(f), tick(dt, st) }` |
| `js/effects.js` | `Tracers` (InstancedMesh), `SpriteFX` (flash/smoke pools), `Splashes`, `Foam` (points), `FlashLights` |
| `js/radio.js` | callsigns, `RADIO` subtitle queue, mission orders, `STRESS`, tiered lines `OPS` / `COMBAT` |
| `js/aircraft.js` | `Aircraft` → `FixedWing` / `Helicopter` state machines, deck resources `FD` / `DECK`, types, `Flyby` |
| `js/combat.js` | enemies: `ENEMY_TYPES` (Su-25/33/47/57 — model builders live in `airframes.js`; speed, altitude, hp, anti-ship missile chance, stress-based weight), vampires, beat-synced hit resolution, ship damage |
| `js/main.js` | WE property listener, scene init, audio analysis + `onBeat`, weapons, ships, missions, chatter, panel UI, main loop |
| `js/properties.js` | **generated** from `project.json` — do not edit by hand |
| `js/settings.js` | browser-only settings drawer, demo beat, audio-file player (returns early inside WE) |
| `tools/gen_properties.py` | regenerates `js/properties.js` |

## Rules / conventions
- **After changing any JS/CSS file, bump the cache-buster** `?v=N` on all `<script>`/`<link>` tags in
  `index.html` (WE's CEF caches aggressively). Current: `v=25`.
- **New WE property**: add it to `project.json`, read it in `applyUserProperties` (`main.js`) into `CFG`,
  then run `python tools/gen_properties.py`. Property `order` decides the browser-drawer group
  (0–9 camera/time, 10–19 audio/combat, 20–29 sea, 30–39 panel, 40–49 air wing, 50–59 hull number).
  `<key>count` sliders are picked up automatically for every key in `AIRCRAFT_TYPES`.
- **New aircraft type**: builder in `airframes.js`, subclass with static `spec` + `buildModel()` in
  `aircraft.js`, register in `AIRCRAFT_TYPES` and `FIXED_ORDER`/`HELI_ORDER`, callsign pool in `radio.js`,
  `<key>count` slider in `project.json`.
  Optional `spec` keys: `missions` (mission kinds to pick from, see `MISSIONS` in `radio.js`), `missionAway`,
  `missionDist`, `landAfterMission`, `blades` (rotor blade count, for the stop-index snap), `noseDown` (helicopter cruise pitch),
  `callsignGroup`.
  The CMV-22B tiltrotor is a `Helicopter` with `conv` (0 = VTOL, 1 = airplane mode) and `gearDown` getters read by its model.
- Match the existing style: dense one-liners, short comments, `const` scratch vectors at module level.
- Sim time is `T` (advances only in `step(dt)`); real time is `RT()` (audio arming, beat gaps).

## Performance & memory invariants (the wallpaper never restarts — leaks accumulate for days)
- **Never create geometry per spawn and drop it.** Enemies are clones of one template (`enemyMesh()`
  in `combat.js`), fly-by jets are pooled (`FLYBY_MODELS`), air-wing rebuilds call `disposeTree`.
  Anything removed from the scene for good must be disposed.
- `disposeTree` skips materials with `userData.shared` (everything from `M()` and `DECK_MARK_MATS`)
  and sprite geometry (three.js shares one geometry across all Sprites). New cached materials must set
  `userData.shared = true`.
- **Static meshes are merged per material** via `mergeStatic(root, dynamicNodes)` at the end of each
  builder (ships, airframes, enemies). Every node that moves, rotates or toggles `visible` at runtime
  (mount yaw/pitch groups, radars, lifts, JBDs, wing pivots, gear, rotors, blades, props, searchlight
  holders) **must be listed as dynamic**, or it gets baked into the static mesh. Code must not keep
  references to static meshes after the builder returns.
- `shade()` sets `castShadow`/`receiveShadow` per mesh; don't blanket-enable shadows with `traverse`
  (it made invisible rotor discs cast shadows).
- Shared scratch vectors (`_v`, `_p`, `_d`, `_al`…) must not be passed into a function that also
  writes them; give the callee its own scratch.
- Pools are ring buffers (`SpriteFX`, `Tracers`, `Foam`): spawn rates must not scale with FPS
  (use time accumulators, see missile glow in `updateFlybys`).
- `SpriteFX` (flash / smoke) is one instanced mesh per pool with its own billboard shader that
  reproduces `SpriteMaterial` (color × texture, opacity, scene fog). Normal-blended pools sort live
  particles back to front on the CPU each update (needs the camera: `FX.smoke.update(dt, tint, camera)`);
  the whole pool shares one `renderOrder`, so don't rely on interleaving with other transparent objects.
- Searchlight `SpotLight`s are hidden by day (`updateLights`): every visible light costs every lit
  fragment even at zero intensity.
- Main loop (`frame`): FPS limit keeps cadence via `frameDue`; simulation runs in ≤50 ms sub-steps
  (stalls capped at 0.25 s). `onBeat` does nothing while `paused`.

## Running & testing
- WE: "Open from File" → `project.json` (audio listener + properties come from WE).
- Browser preview: serve the folder, e.g. `python -m http.server 8765`, open `http://localhost:8765/`.
  The ⚙ SETTINGS drawer mirrors all WE properties (stored in `localStorage`); URL params `?hour=22`,
  `?zoom=150`, `?demo=1`, `?ts=N` (time scale).
- No test suite. Verify in the browser console — all globals are reachable:
  set `paused = true` and drive the sim with `step(0.05)` + `renderer.render(scene, camera)`;
  check `renderer.info.render.calls` (main-pass draw calls, shadow pass excluded) and
  `renderer.info.memory.geometries` (must plateau during long runs, e.g. spawning many `new Flyby()` /
  `spawnBandits(3)`); force combat with `Object.defineProperty(AUD, 'armed', { get: () => true })`
  and `onBeat('low', 2)`.
- Baseline after the 2026-10 optimisation pass: ~400 GL draw calls/frame (was ~950), geometries
  plateau ≈ 900 under sustained combat.
