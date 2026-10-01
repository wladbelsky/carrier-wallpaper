CARRIER STRIKE GROUP — web wallpaper for Wallpaper Engine
=========================================================

INSTALL
1) Copy the CarrierWallpaper folder into
   ...\Steam\steamapps\common\wallpaper_engine\projects\myprojects\
   Or: Wallpaper Engine -> "Open Wallpaper" -> "Open from File" -> project.json.
2) Audio reaction needs audio recording enabled in WE settings (default).
3) Panel buttons need mouse input enabled in WE. The mouse never moves the camera.

AIR WING (counts are set in the wallpaper properties)
  F/A-18 Hornet ........ outer wing panels fold up
  F-14 Super Tomcat .... variable sweep in flight, 75° oversweep when parked
  E-2D Hawkeye (AWACS) . Sto-Wing: wings twist and fold back along the fuselage
  MH-60 Seahawk / CH-53 Sea Stallion / AH-1Z Viper ... rotor blades fold aft when parked
  + one MH-60 on each destroyer (optional)
Three jets and one helicopter park on deck, everything else lives in the hangar and uses
the deck-edge elevators. Jets fly turn-radius-limited paths (Dubins curves), so launches,
orbits and approaches use wide, realistic turns. Landing gear retracts in flight.

RADIO SUBTITLES
Ace Combat style lines at the top of the screen: catapult clearances, "call the ball",
trap calls, helicopter departures/landings, and combat chatter while music is playing.
Callsigns come from Ace Combat 04 / 5 / Zero / 7 / 8 (Wardog, Razgriz, Mage, Spare, Strider,
Mobius, Galm, Crow, Indigo, Wizard; AWACS SkyEye, Thunderhead, Eagle Eye, Long Caster,
Bandog, Sky Keeper, Dealer; carrier KESTREL). Jets are grouped 4 per callsign, helicopters 2.

MISSIONS
While there is no music, flights periodically leave the screen on missions (CAP, intercepts,
escorts, SAR, medevac, sonar searches…) with their own radio orders, then return to the orbit.
Whole flights go together (wingmen in trail); several flights can be away at once, one flight
always stays on station. A flight is never sent while any of its aircraft is still launching;
partial flights only go when no flight is complete.
"Missions off-screen" property controls how often (0 = off). Destroyer helicopters have their
own callsigns (SEAHORSE, PETREL).

HEAVY MUSIC
Hits are detected both by loudness jumps and by spectral flux (rises in individual frequency
bins), so riffs and drums are caught even in dense, compressed mixes like metal/rock.
A "heaviness" meter (auto-gained loudness density) drives extra effects:
  - CIWS fire short bursts on detected hits (slightly longer when the mix is heavy); each mount
    rests 0.5–1 s after a burst, new bursts start at most every 0.4 s, max 2 mounts at once
  - destroyer guns throw AA shells that burst in the sky (flak) on riffs/snares
  - vertical SM-2 launches from the destroyers' VLS and RAM salvos from the carrier on big hits
  - subtle camera shake on heavy kicks ("Camera shake on heavy hits" property)

ENEMIES & HITS
During combat, enemy fighters (bandits) make passes over the fleet and anti-ship missiles
(vampires) skim in toward the ships. Guns track bandits (AA mode), CIWS lock on vampires first,
fighters / VLS / RAM fire homing missiles. A projectile that reaches its target scores on the
NEXT beat of the music: explosion, shot-down bandits trail smoke and fall into the sea.
Missiles that leak through hit the ships (explosion + fire and smoke for a while).
Property "Enemy aircraft & missiles in combat" turns this off.

STRESS / THREAT
Stress builds over ~10 minutes of continuous music (falls off in silence) and is shown as
THREAT in the panel. It changes the radio tone (calm -> tense -> panic), radio frequency,
enemy wave size and spawn rate.

RADIO PRIORITY
During combat, combat calls (contacts, kills, vampires, damage) go first; routine deck calls
switch to combat versions ("hot deck, launch, launch!") or are dropped if they get stale.

NOTIFICATION SAFEGUARD
Sound has to play continuously for 5 seconds before the fleet opens fire, so short
notification sounds never trigger it (the panel shows "SOUND… Ns" while arming).
During those 5 seconds the radio reports unidentified radar contacts; if the sound stops
early, a "false alarm, stand down" call follows, otherwise combat begins.

DECK PARKING
Seven jet parking spots: forward of the island, starboard aft and on the angled-deck sponson
(clear of the landing area). After landing a jet takes a free deck spot; it is struck below
by elevator only when the deck is full or, now and then, for "maintenance".

HULL NUMBERS
Carrier and destroyer hull numbers are text properties (deck, island and bow numbers).

ADDING A NEW AIRCRAFT TYPE (for developers)
js/airframes.js  — write a builder returning { group, setFold(f), tick(dt, st) }
js/aircraft.js   — subclass FixedWing or Helicopter with a static spec + buildModel(),
                   add it to AIRCRAFT_TYPES / FIXED_ORDER or HELI_ORDER
js/radio.js      — add a callsign pool under the same key
project.json     — add "<key>count" slider (read automatically in main.js list)

BROWSER PREVIEW
Open index.html in a browser. The "⚙ SETTINGS" button (top-left, browser only) shows every
Wallpaper Engine property, a demo beat (off by default; tempo, loudness, silent gaps) and
"Play an audio file": pick any audio file, the wallpaper reacts to it exactly like to WE audio.
Settings are saved in localStorage (the audio file itself is not); "Reset all to defaults" clears it.
URL params still work and override stored values: ?hour=22, ?zoom=150, ?demo=1.
If you add a property to project.json, run  python tools/gen_properties.py  to refresh js/properties.js.
