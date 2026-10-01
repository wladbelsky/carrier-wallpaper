# Carrier Strike Group — web wallpaper for Wallpaper Engine

Isometric carrier strike group: a carrier, two escorting destroyers and a configurable air wing that
react to the music playing on your PC. Guns, CIWS and aircraft fire to the beat, Ace Combat style radio
subtitles run at the top of the screen, and the time of day follows your PC clock.

![preview](preview.jpg)

## Install

1. Copy the `CarrierWallpaper` folder into
   `...\Steam\steamapps\common\wallpaper_engine\projects\myprojects\`,
   or in Wallpaper Engine choose **Open Wallpaper → Open from File** and pick `project.json`.
2. Audio reaction needs audio recording enabled in the WE settings (it is on by default).
3. Panel buttons need mouse input enabled in WE. The mouse never moves the camera.

## Air wing

Aircraft counts are set in the wallpaper properties.

| Aircraft | Parked on deck |
|---|---|
| F/A-18 Hornet | outer wing panels fold up |
| F-14 Super Tomcat | variable sweep in flight, 75° oversweep when parked |
| E-2D Hawkeye (AWACS) | Sto-Wing: wings twist and fold back along the fuselage |
| MH-60 Seahawk / CH-53 Sea Stallion / AH-1Z Viper | rotor blades fold aft |

Each destroyer can also carry one MH-60 (optional).

- Three jets and one helicopter park on deck. Everything else lives in the hangar and uses the deck-edge elevators.
- Jets fly turn-radius-limited paths (Dubins curves), so launches, orbits and approaches use wide, realistic turns.
- Landing gear retracts in flight.

## Radio subtitles

Ace Combat style lines appear at the top of the screen: catapult clearances, "call the ball", trap calls,
helicopter departures and landings, and combat chatter while music is playing.

- Callsigns come from Ace Combat 04 / 5 / Zero / 7 / 8:
  - **Squadrons:** Wardog, Razgriz, Mage, Spare, Strider, Mobius, Galm, Crow, Indigo, Wizard.
  - **AWACS:** SkyEye, Thunderhead, Eagle Eye, Long Caster, Bandog, Sky Keeper, Dealer.
  - **Carrier:** KESTREL.
- Jets are grouped 4 per callsign, helicopters 2.

## Missions

While there is no music, flights periodically leave the screen on missions (CAP, intercepts, escorts,
SAR, medevac, sonar searches…). Each mission has its own radio orders, and the flight returns to the orbit afterwards.

- Whole flights go together, with wingmen in trail.
- Several flights can be away at once, but one flight always stays on station.
- A flight is never sent while any of its aircraft is still launching.
- Partial flights only go when no flight is complete.
- The **Missions off-screen** property controls how often this happens (0 = off).
- Destroyer helicopters have their own callsigns: SEAHORSE and PETREL.

## Heavy music

Hits are detected both by loudness jumps and by spectral flux (rises in individual frequency bins), so
riffs and drums are caught even in dense, compressed mixes like metal and rock.

A "heaviness" meter (auto-gained loudness density) drives extra effects:

- **CIWS:** short bursts on detected hits, slightly longer when the mix is heavy.
  - Each mount rests 0.5–1 s after a burst.
  - New bursts start at most every 0.4 s, with at most 2 mounts firing at once.
- **Flak:** destroyer guns throw AA shells that burst in the sky on riffs and snares.
- **Missiles:** on big hits, the destroyers launch SM-2s vertically from their VLS cells and the carrier fires RAM salvos.
- **Camera shake** on heavy kicks — subtle, controlled by the **Camera shake on heavy hits** property.

## Enemies & hits

During combat, enemy fighters (bandits) make passes over the fleet, and anti-ship missiles (vampires)
skim in toward the ships.

- **Targeting:**
  - Guns track bandits (AA mode).
  - CIWS lock on vampires first.
  - Fighters, VLS and RAM fire homing missiles.
- **Hits:** a projectile that reaches its target scores on the **next beat** of the music. The target explodes, and shot-down bandits trail smoke and fall into the sea.
- **Ship damage:** missiles that leak through hit the ships, causing an explosion and a fire with smoke for a while.
- The **Enemy aircraft & missiles in combat** property turns all of this off.

## Stress / threat

Stress builds over ~10 minutes of continuous music and falls off in silence. The panel shows it as **THREAT**.

It changes:
- the radio tone (calm → tense → panic);
- the radio frequency;
- enemy wave size and spawn rate.

## Radio priority

During combat, combat calls go first (contacts, kills, vampires, damage). Routine deck calls switch to their
combat versions ("hot deck, launch, launch!") or are dropped if they get stale.

## Notification safeguard

Sound has to play continuously for 5 seconds before the fleet opens fire, so short notification sounds
never trigger it. The panel shows `SOUND… Ns` while arming.

During those 5 seconds the radio reports unidentified radar contacts. If the sound stops early,
a "false alarm, stand down" call follows; otherwise combat begins.

## Deck parking

There are seven jet parking spots:
- forward of the island;
- starboard aft;
- on the angled-deck sponson, clear of the landing area.

After landing, a jet takes a free deck spot. It is struck below by elevator only when the deck is full, or
now and then for "maintenance".

## Hull numbers

Carrier and destroyer hull numbers are text properties (deck, island and bow numbers).

## Adding a new aircraft type (for developers)

| File | What to do |
|---|---|
| `js/airframes.js` | write a builder returning `{ group, setFold(f), tick(dt, st) }`; call `mergeStatic(g, [...moving parts])` before returning |
| `js/aircraft.js` | subclass `FixedWing` or `Helicopter` with a static `spec` + `buildModel()`, add it to `AIRCRAFT_TYPES` and `FIXED_ORDER` / `HELI_ORDER` |
| `js/radio.js` | add a callsign pool under the same key |
| `project.json` | add a `<key>count` slider (read automatically in `main.js`), then run `python tools/gen_properties.py` |

After changing any JS/CSS file, bump the `?v=N` cache-buster in `index.html`.
More developer notes are in [`CLAUDE.md`](CLAUDE.md).

## Browser preview

Serve the folder and open it in a browser, for example:

```bash
python -m http.server 8765
```

then open `http://localhost:8765/`.

The **⚙ SETTINGS** button (top-left, browser only) shows:
- every Wallpaper Engine property;
- a demo beat — off by default, with tempo, loudness and silent gaps;
- **Play an audio file** — pick any audio file, and the wallpaper reacts to it exactly like it does to WE audio.

Settings are saved in `localStorage`; the audio file itself is not. **Reset all to defaults** clears them.

URL parameters still work and override stored values: `?hour=22`, `?zoom=150`, `?demo=1`.

If you add a property to `project.json`, run `python tools/gen_properties.py` to refresh `js/properties.js`.
