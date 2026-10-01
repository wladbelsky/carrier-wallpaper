'use strict';
/* ===== Radio chatter subtitles (Ace Combat style) ===== */
const CALLSIGNS = {
  // Squadron names from Ace Combat 04 / 5 / Zero / 7 / 8 — groups of 4 for jets, 2 for helicopters
  fa18: ['WARDOG', 'RAZGRIZ', 'MAGE', 'SPARE', 'STRIDER'],
  f14: ['MOBIUS', 'GALM', 'CROW', 'INDIGO', 'WIZARD'],
  f35: ['GARUDA', 'SCARFACE', 'ANTARES', 'OGRE', 'SABER'],
  e2d: ['SKYEYE', 'THUNDERHEAD', 'EAGLE EYE', 'LONG CASTER', 'BANDOG', 'SKY KEEPER', 'DEALER'],
  mh60: ['SEA GOBLIN', 'OSPREY', 'HALO'],
  ch53: ['ATLAS', 'HERCULES', 'TITAN'],
  ah1: ['VIPER', 'COBRA', 'SWEEPER'],
  cmv22: ['SUNHAWK', 'GREYHOUND', 'PELICAN'],
  flyby: ['YELLOW', 'SOL', 'GRABACR', 'OFNIR', 'SCHNEE', 'GELB'],
  ddheli: ['SEAHORSE', 'PETREL']      // one per destroyer, each with its own callsign
};
const RADIO_NAMES = { carrier: 'KESTREL', lso: 'PADDLES', escorts: ['BUCCANEER', 'CUTLASS'] };
const ROLE_COLOR = { pilot: '#8fd3ff', awacs: '#9dffb0', ship: '#ffd27a', heli: '#b8e0ff', ace: '#ff9a7a' };

const RADIO = {
  q: [], cur: null, t: 0, gap: 0,
  say(who, text, o) {
    o = o || {};
    if (!CFG.subtitles) return;
    const prio = o.prio != null ? o.prio : 1;
    if (this.q.length >= 8) {                     // drop the least important pending line
      const tmp = { prio, cat: o.cat || 'ops', hot: !!o.hot };
      let wi = -1, wp = 1e9; this.q.forEach((m, i) => { const e = this.eff(m); if (e < wp) { wp = e; wi = i; } });
      if (wp > this.eff(tmp)) return; this.q.splice(wi, 1);
    }
    this.q.push({ who, text, prio, cat: o.cat || 'ops', hot: !!o.hot, role: o.role || 'pilot', at: T + (o.delay || 0), born: T });
  },
  /* During combat, combat traffic outranks routine flight-deck traffic. */
  eff(m) {
    const armed = AUD.armed;
    if (m.cat === 'combat') return armed ? 10 + m.prio : m.prio;
    if (m.cat === 'ops') return armed ? (m.hot ? 5 + m.prio : m.prio - 5) : 5 + m.prio;
    return 5 + m.prio;
  },
  update(dt) {
    const box = this.box || (this.box = document.getElementById('subs')); if (!box) return;
    if (!CFG.subtitles) {                         // switched off: drop the backlog instead of playing it out
      if (this.cur || this.q.length) { this.q.length = 0; this.cur = null; box.classList.remove('on'); }
      return;
    }
    if (this.cur) {
      this.t += dt;
      // urgent calls (prio >= 3: contacts, combat start, vampires, hits) cut a less important line;
      // with a backlog waiting, the current line is shortened
      let waiting = false, urgent = false;
      for (const m of this.q) if (m.at <= T) { waiting = true; if (m.prio >= 3 && this.eff(m) > this.eff(this.cur)) urgent = true; }
      const end = urgent ? 0.4 : waiting ? Math.max(1.4, this.cur.dur * 0.7) : this.cur.dur;
      if (this.t > end) { box.classList.remove('on'); this.cur = null; this.gap = urgent ? 0.05 : 0.2; }
      return;
    }
    if (this.gap > 0) { this.gap -= dt; return; }
    // stale lines are dropped: combat calls after 4 s, routine calls during combat after 5 s
    this.q = this.q.filter(m => !((m.cat === 'combat' && m.prio < 3 && T - m.born > 4) || (AUD.armed && m.cat === 'ops' && !m.hot && T - m.born > 5) || (m.prio <= 0 && T - m.born > 6)));
    let i = -1, best = -1e9;
    this.q.forEach((m, k) => { if (m.at <= T) { const e = this.eff(m); if (e > best) { best = e; i = k; } } });
    if (i < 0) return;
    const m = this.q.splice(i, 1)[0];
    m.dur = clamp(1.0 + m.text.length * 0.042, 1.6, 4.6); this.cur = m; this.t = 0;
    box.querySelector('.who').textContent = m.who;
    box.querySelector('.who').style.color = ROLE_COLOR[m.role] || ROLE_COLOR.pilot;
    box.querySelector('.txt').textContent = `« ${m.text} »`;
    box.classList.add('on');
  }
};

/* Untiered radio lines (tiered pools are in OPS and COMBAT below) */
const LINES = {};

/* ---- mission orders (only when there is no music) ---- */
const MISSIONS = {
  fighter: [
    ['proceed to sector {S} and set up a combat air patrol.', 'CAP complete, returning to station.'],
    ['unidentified contacts bearing {B}. Intercept and identify.', 'Contacts identified — civilian airliner. Returning.'],
    ['escort the tanker to the northern corridor.', 'Tanker escorted. Coming home.'],
    ['strike package: coastal radar site, grid {G}. Weapons free.', 'Radar site destroyed. RTB.'],
    ['recon run over the island chain, grid {G}.', 'Recon photos in the can. Returning.'],
    ['cover the supply convoy heading {B}.', 'Convoy is safe. Heading home.'],
    ['a bogey was reported near the oil platform, sector {S}. Check it out.', 'Nothing but seagulls out there. RTB.'],
    ['patrol the border line along bearing {B}. Don\'t cross it.', 'Border patrol complete. Returning to the fleet.']
  ],
  awacs: [
    ['relocate on bearing {B} to extend radar coverage.', 'Coverage extended. Back on station.'],
    ['move to sector {S} and relay comms for the strike group.', 'Relay complete. Returning to orbit.']
  ],
  heli_transport: [
    ['resupply run to the frigate at grid {G}.', 'Cargo delivered. Heading back.'],
    ['pilot down at grid {G}. Search and rescue, go!', 'Pilot recovered, alive and well. RTB.'],
    ['ferry personnel to the island outpost.', 'Passengers dropped off. Returning.'],
    ['medevac from the supply ship, bearing {B}.', 'Casualty aboard. Coming home.'],
    ['possible submarine in sector {S}. Start a sonar search.', 'Sector clear, no contacts. RTB.'],
    ['sling-load the spare parts to the destroyer group, grid {G}.', 'Load delivered. Returning.']
  ],
  heli_attack: [
    ['small boats spotted near the coast, sector {S}. Go take a look.', 'Just fishermen. Returning.'],
    ['escort the transports to the landing zone.', 'Transports delivered safely. Coming home.'],
    ['sweep the coastline, grid {G}.', 'Coastline is clear. RTB.'],
    ['a patrol boat is shadowing the fleet, bearing {B}. Shoo it away.', 'Patrol boat turned back. Returning.']
  ],
  cod: [   // CMV-22B: long carrier-onboard-delivery runs that end with a landing on the carrier
    ['COD run to the shore base: mail, parts and passengers.', 'Inbound from the beach with {P} passengers and {W} pounds of mail and parts.'],
    ['pick up the replacement F135 engine module at the airfield, grid {G}.', 'Engine module in the back, strapped down. Heading home.'],
    ['fly the inspection team over to the supply ship, bearing {B}.', 'Team delivered. Returning to Mother.'],
    ['medevac run to the hospital ship, bearing {B}.', 'Patient handed over. RTB.'],
    ['bring the spare radar module out from the shore base.', 'Got the parts. On our way back.'],
    ['pick up the VIP party at the island airstrip, grid {G}.', 'VIPs aboard. Coming home, smooth ride guaranteed.'],
    ['fresh produce is waiting at the logistics hub, grid {G}. Go get it.', 'Inbound with {W} pounds of groceries. Tell the galley.'],
    ['ferry {P} replacement aircrew out from the naval air station.', 'New aircrew aboard. Coming home.'],
    ['rush the ordnance techs and missile spares to the destroyer group, bearing {B}.', 'Techs and spares delivered. Returning.'],
    ['long-range logistics run to the forward base, grid {G}.', 'Inbound with {W} pounds of cargo for the air wing.'],
    ['collect the mail at the amphibious group, bearing {B}.', 'Mail bags aboard. Morale is inbound.'],
    ['the tanker at grid {G} has parts for our catapult. Go pick them up.', 'Catapult parts aboard. Deck crew, stand by.']
  ]
};
/* replies to a mission order: common lines plus a few per kind; never the same line twice in a row */
LINES.missionCopy = {
  any: ['Copy, en route.', 'Roger that, on our way.', 'Copy. Heading out now.', 'Understood.', 'Wilco.', "Copy that. We're on it.",
    'Roger. Leaving the pattern.', 'Acknowledged. Moving out.', 'Copy, will report on arrival.', 'On our way. Keep the coffee warm.',
    'Roger, breaking off now.', 'Affirmative, heading out.', 'Copy all. En route.', "Understood. We'll take it from here."],
  fighter: ['Copy, going to burner. On our way.', 'Roger, climbing to angels two-five.', 'Copy. Weapons check complete, heading out.',
    "Flight, on me. Let's go.", 'Copy, fence in. Vectoring now.', 'Roger. Tanker on the way back, right?'],
  awacs: ['Copy, repositioning now.', 'Roger, moving the orbit. Picture stays live.', 'Understood, relocating. Keep the chatter down.'],
  cod: ['Copy, converting to airplane mode. En route.', 'Roger, nacelles forward, on our way.', 'Copy. Loadmaster, secure the ramp.', 'Understood. Mail call in about an hour.',
    'Roger. Long haul, crew, get comfortable.', "Copy. We'll bring back the good coffee this time."],
  heli: ['Copy, nose down, en route.', 'Roger, heading out low and fast.', "Understood, we're on our way. Crew, strap in.", 'Copy. ETA about ten minutes.']
};
let lastMissionCopy = '';
function missionCopy(kind) {
  const pool = LINES.missionCopy.any.concat(LINES.missionCopy[kind.startsWith('heli') ? 'heli' : kind] || []);
  let line; do line = radioLine(pool); while (line === lastMissionCopy);
  return lastMissionCopy = line;
}
function makeMission(kind) {
  const [order, done] = pick(MISSIONS[kind]);
  const sectors = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Kilo', 'Sierra'];
  const bearing = bearingWords(rand(0, TAU));
  const vars = { S: pick(sectors), B: bearing, G: `${randi(1, 9)}-${randi(1, 9)}`, P: randi(4, 24), W: (randi(4, 24) * 500).toLocaleString('en-US') };
  return { order: fillLine(order, vars), done: fillLine(done, vars) };
}

/* ===== Stress: builds up over ~10 minutes of continuous combat music, eases off in silence ===== */
const STRESS = {
  level: 0,
  update(dt) { this.level = clamp(this.level + (AUD.fighting ? dt / 600 : -dt / 180), 0, 1); },
  bump(v) { this.level = clamp(this.level + v, 0, 1); },
  get tierIndex() { const i = THREAT_TIERS.findIndex(t => this.level < t.upTo); return i < 0 ? THREAT_TIERS.length - 1 : i; },
  get tier() { return THREAT_TIERS[this.tierIndex].key; },
  get label() { return ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL'][Math.min(3, Math.floor(this.level * 4))]; }
};

/* ===== Radio line pools and threat tiers =====
   THREAT_TIERS maps STRESS.level to a tier, calmest first — add a tier by adding an entry (and lines under its key).
   A line pool is either
     - an array: the same lines at any time, or
     - an object keyed by tier ({ calm, tense, panic, … }) plus an optional `peace` (outside combat).
   Keys may be left out: a missing tier falls back to the next calmer one (and from there to any tier present).
   radioLine(pool, vars):
     - outside combat: `peace` if the pool has it, otherwise the current tier;
     - in combat: the current tier, but MIX_CALMER of the time one tier calmer (variety, repeatable down the tiers);
     - fills {name} placeholders from vars ({c}, {C}, {T}, {B}, {D}, {N}, …); unknown ones are left untouched.   */
const THREAT_TIERS = [
  { key: 'calm', upTo: 0.33 },
  { key: 'tense', upTo: 0.66 },
  { key: 'panic', upTo: Infinity }
];
const MIX_CALMER = 0.3;
const fillLine = (t, vars) => vars ? t.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m) : t;
function radioLine(pool, vars) {
  let list = Array.isArray(pool) ? pool : !AUD.armed && pool.peace;
  if (!list) {
    let i = STRESS.tierIndex;
    while (i > 0 && (!pool[THREAT_TIERS[i].key] || Math.random() < MIX_CALMER)) i--;
    list = pool[THREAT_TIERS[i].key] || THREAT_TIERS.map(t => pool[t.key]).find(Boolean) || pool.peace;
  }
  return fillLine(pick(list), vars);
}

/* ===== Routine flight-deck calls — peace versions + combat versions by tier (used while music plays) ===== */
const OPS = {
  launchClear: {
    peace: ["{c}, you're cleared for launch.", '{c}, catapult is ready. Good luck.', '{c}, wind is on the nose. Cleared to go.'],
    calm: ['{c}, hot deck! Launch, launch, launch!', '{c}, bandits inbound — get airborne now!', "{c}, cat's ready, go! We need you up there!", '{c}, scramble! Scramble!'],
    panic: ["{c}, launch NOW! They're right on top of us!", "{c}, go, go, go! Deck's under fire!", "{c}, get off this deck before it's too late!"]
  },
  launchReady: {
    peace: ['Ready.', 'Roger, launching.', "Let's go.", 'Copy. Full power.'],
    calm: ['Going hot!', 'Copy, launching hot!', 'Master arm on. Go!', 'Roger, scrambling!'],
    panic: ['Launching! Get me out there!', 'Going, going!', 'Hang on, here we go!']
  },
  airborne: {
    peace: ['airborne.', 'is off the deck.', 'airborne, climbing to angels one-five.', 'wheels up.'],
    calm: ['airborne, weapons hot!', 'off the deck, heading for the fight!', 'airborne, looking for trade.', 'up and armed. Point me at them.'],
    panic: ['airborne! Engaging immediately!', "I'm up! Where do you need me?!", 'airborne — they are everywhere!']
  },
  awacsUp: {
    peace: ['airborne. Radar is up.', 'on station. Picture is clean.', 'airborne. I have eyes on the whole sector.'],
    calm: ['airborne. Radar is up — I count multiple hostiles.', 'on station. Picture is hot, bandits everywhere.'],
    panic: ['airborne! The scope is full of red!', 'on station — enemy numbers are off the charts!']
  },
  approach: {
    peace: ['commencing approach.', 'RTB, requesting landing.', 'low on fuel, coming home.'],
    calm: ['winchester, RTB to rearm.', 'bingo fuel, coming in hot.', 'out of missiles, requesting recovery.', 'need to rearm, coming in.'],
    panic: ["I'm hit, coming in! Clear the deck!", 'winchester and bingo, coming home under fire!', 'battle damage, I need that deck now!']
  },
  callBall: {
    peace: ['{c}, call the ball.'],
    calm: ['{c}, call the ball. Make it quick!', '{c}, call the ball, bandits on your six!'],
    panic: ['{c}, just get it down! Call the ball!', '{c}, ball! Now, now!']
  },
  trap: {
    peace: ['Three-wire. Nice trap.', 'Good pass. Welcome home.', 'Two-wire, fair pass.', 'Four-wire. Try harder next time.', 'OK pass, three-wire.'],
    calm: ['Trapped! Rearm and refuel, fast!', 'Good trap. Ordnance crews, move!', 'On deck. Get that bird turned around!'],
    panic: ['Trapped! Get it below, now!', 'On deck! Hurry, more bandits inbound!', 'Caught a wire! Clear the landing area!']
  },
  heliUp: {
    peace: ['lifting off.', 'airborne, heading out.', 'wheels up.'],
    calm: ['lifting off, staying low!', 'airborne, keep your heads down!', 'up and moving, watch the flak!'],
    panic: ['lifting off under fire!', 'airborne — that was close!']
  },
  heliCleared: {
    peace: ['{c}, cleared to land.'],
    calm: ['{c}, cleared to land, make it fast!', '{c}, deck is clear, get down quick!'],
    panic: ["{c}, land now, we're under attack!", '{c}, get down, get down!']
  },
  heliDown: {
    peace: ['on deck.', 'touchdown. Shutting down.', 'safe on deck.'],
    calm: ['on deck, rearm us quick!', 'down. Refuel and we go again.'],
    panic: ['down! That was too close!', 'on deck — we took some hits!']
  }
};
/* returns [text, hot]: hot lines keep their priority during combat */
function opsLine(key, c) { return [radioLine(OPS[key], { c: c || '' }), AUD.armed]; }

/* ===== Combat chatter by stress tier ===== */
const COMBAT = {
  start: {
    calm: ['All units, bandits inbound! Weapons free!', 'Multiple bogeys closing on the fleet. Engage!', 'Enemy aircraft approaching. All units, intercept!'],
    tense: ['Here they come again! All units, engage!', 'Another wave inbound! Weapons free!'],
    panic: ['They just keep coming! Every gun, open fire!', 'Massive enemy wave! Defend the carrier at all costs!']
  },
  end: ['Airspace is clear. Good work, everyone.', 'No more contacts on radar. Stand down.', 'Enemy has withdrawn. Nice work out there.'],
  // the music stopped: hold DISARM_DELAY s, then `end` — or `resume` if it starts again
  lull: {
    calm: ['No more contacts on the scope. Stand by.', "Scope's clearing. Hold your fire, stay sharp.", "Last bandit's off the scope. Holding."],
    tense: ["Contacts fading... Don't relax yet.", 'Scope is quiet. Too quiet. Stay alert.'],
    panic: ["They've pulled back... Is that all of them?", 'No contacts... Everybody hold, they could be regrouping.']
  },
  resume: {
    calm: ['New contacts! Here they come again!', 'Scratch that, more bandits inbound. Weapons free!'],
    tense: ["They're back! All units, re-engage!", 'Contacts reappearing! Weapons free!'],
    panic: ["It was a feint! They're coming back in force!", 'More of them! Back to your guns!']
  },
  awacs: {
    calm: ['Enemy fighters inbound, bearing two-seven-zero.', 'Good kill. Next group is closing fast.', 'Keep the enemy away from the fleet!', 'Enemy formation breaking up. Keep the pressure on.'],
    tense: ['Multiple enemy flights inbound, all units weapons free!', 'Enemy strength increasing! Hold your ground!', 'Vampires launched, ships, stand by!'],
    panic: ['Enemy forces overwhelming! Hold the line!', 'All units, defend the carrier at all costs!', "I've never seen this many contacts!"]
  },
  ship: {
    calm: ['CIWS engaging!', 'Shells away!', 'Air contact inbound, guns tracking.', 'Splash! Target down.'],
    tense: ['Vampires inbound, brace!', 'CIWS reloading, cover us!', 'Taking fire, returning fire!'],
    panic: ['We are taking heavy fire!', 'Damage control parties to the flight deck!', 'Fires on deck three!', "We can't take much more of this!"]
  },
  splash: {
    calm: ['Splash one!', 'Target destroyed.', 'Good kill!', 'Bandit down.', 'Splash, splash!'],
    tense: ["Splash! Who's next?", "Got him! That's another one!", 'Bandit down! More inbound!'],
    panic: ["Splash! But there's more coming!", 'Got one! Still too many!', 'Down! Next one, quick!']
  },
  vampireDown: ['Vampire splashed!', 'Missile intercepted!', 'CIWS kill!', 'Got the vampire!'],
  shipHit: ["We've been hit! Damage control!", 'Missile impact! Fires on deck!', 'Hit, starboard side! Still fighting!'],
  newBandits: ['New contacts, bearing {B}, {N}! Identified as {T}.', 'Bogeys inbound from the {D}, {N}! Type: {T}.', '{T}, bearing {B}, closing fast!', '{T}s inbound from the {D}, {N}!'],
  vampires: ['Vampire, vampire! Bearing {B}!', 'Inbound anti-ship missiles, bearing {B}!', 'Missile launch detected! Vampires inbound!'],
  vampLaunch: ['Vampire launch! Bandit fired on us!', 'Missile off the rail, inbound!'],
  vls: ['Birds away!', 'Standard missile away!', 'Launching SM-2!'],
  flybyIn: { calm: ['Engaging!', 'Beginning attack run.', 'Rolling in, cover me.'], tense: ['Coming in hot!', 'Rolling in, hold on, fleet!'], panic: ['Coming in hot! Hang on down there!'] }
};

/* ---- air combat passes (js/airwar.js): each line matches what is on screen at that moment ----
   {T} enemy type, {C} callsign, {B} bearing, {D} compass direction */
const AIRWAR_LINES = {
  engage: {
    calm: ['Breaking off to intercept!', 'Flight, follow me in. Weapons free!', "Leaving the orbit. Let's go hunting."],
    tense: ['Engaging! Stay on my wing.', 'Pushing out to intercept, buster!', 'More of them coming. Flight, with me!'],
    panic: ['Everyone with me, now! Engage!', "No time, they're on top of the fleet! Engaging!", 'Break off and fight! Go, go!']
  },
  rtb: {
    calm: ['Bandits cleared. Rejoining the orbit.', "Fight's over. Heading back to station.", 'Returning to the orbit. Good hunting, everyone.'],
    tense: ['Winchester on missiles. Coming back to station.', 'That was close. Rejoining the orbit.'],
    panic: ['We made it. Barely. Returning to station.', 'Low on everything. Heading back to the orbit.', 'Is it really over? Rejoining.']
  },
  chaseIntro: {
    calm: ["{T} at my twelve, I'm on him!", 'Tally one {T}, engaging!', 'Got him in my sights!', "On his six. He's not getting away."],
    tense: ['{T} dead ahead, going for the kill!', "I'm on his tail! Stay with me!", "He's trying to shake me. No chance!"],
    panic: ["I'm on him, I'm on him!", 'Got one in front of me! Going for it!']
  },
  chaseEscape: {
    calm: ["He's bugging out. Let him go.", 'Lost him. He ran for it.'],
    tense: ["Missed him! He's out of range.", 'He slipped away. Damn it!'],
    panic: ["He got away! He'll be back!", "Can't chase him, too many others!"]
  },
  chasedIntro: {
    calm: ['{T} on my six! Shaking him off.', 'Bandit on my tail, defending.', "He's behind me, breaking left!"],
    tense: ["Bandit on my six! Can't shake him!", 'Break right, break right!', "He's all over me!", "I'm taking fire!"],
    panic: ["I can't shake him!", 'Someone get this guy off me!', "He's right behind me! Help!"]
  },
  saveIntro: {
    calm: ["Hang on, {C}, I'm on him!", 'Moving in, {C}! Keep him busy!'],
    tense: ["I've got him, {C}! Break left!", '{C}, hold on, coming in hot!'],
    panic: ["{C}, hold on! I'm coming!", 'Hang in there, {C}! Almost on him!']
  },
  sixWarning: {
    calm: ['{C}, bandit on your six.', '{C}, check six.'],
    tense: ['{C}, check six! Check six!', "{C}, you've got one on your tail!"],
    panic: ['{C}, BREAK! Bandit on your six!', "{C}, he's right behind you! Break now!"]
  },
  thanks: {
    calm: ['Thanks, I owe you one!', "Good shooting! I'm clear."],
    tense: ["He's off me. Thanks!", 'Close one. Thanks for the save.'],
    panic: ['Thank God! I thought I was done!', 'You saved my life out there!']
  },
  sweep: {
    calm: ['Sweeping through. Eyes open.', 'Passing over the fleet, no tally.'],
    tense: ['Low and fast over the ships, looking for leakers.', 'Sweeping the sector, stay sharp.'],
    panic: ["Sweeping again, there's got to be more!", 'Keep looking! They could be anywhere!']
  },
  fox: {
    calm: ['Fox 2!', 'Fox 3!', 'Missile away!'],
    tense: ['Fox 2, Fox 2!', 'Fox 3! Another one away!'],
    panic: ['Fox 2! Just go down!', 'Missile away! Come on, hit!']
  },
  guns: {
    calm: ['Guns!', 'Guns, guns, guns!'],
    tense: ['Hosing him down!', 'Guns! Eat this!'],
    panic: ["Guns! I'm out of missiles!", 'Shooting everything I have!']
  },
  flares: {
    calm: ['Flares, defending.', 'Popping flares.'],
    tense: ['Missile lock! Countermeasures!', 'Defending, popping flares!'],
    panic: ["Flares, flares! He's got me locked!", 'Missile on me! Dumping everything!']
  },
  heliOut: {
    calm: ['Moving out to hunt surface contacts, bearing {B}.', "Going low. We'll take the boats."],
    tense: ['Heading out, hunting small boats to the {D}.', "Rolling out to cover the fleet's flank."],
    panic: ['Boats all over the {D}! Moving out!', 'Going low and fast, bearing {B}. Wish us luck!']
  },
  heliAway: {
    calm: ['Engaging small boats to the {D}, rockets away!', 'Hellfire hit, target destroyed. {D} sector clear.'],
    tense: ['Two boats burning to the {D}. Looking for more.', 'Gun run on a patrol craft, {D} of the fleet.'],
    panic: ['Taking fire from the boats to the {D}, still in the fight!', "There's dozens of boats to the {D}! Rockets away!"]
  },
  boatContact: {
    calm: ["Surface contacts, fast attack craft bearing {B}. Gunships, they're yours.", 'Patrol boats inbound, bearing {B}.'],
    tense: ['Small boats closing from the {D}! Gunships, engage!', 'More boats, bearing {B}! Gunships, intercept!'],
    panic: ['Boat swarm from the {D}! Stop them before they reach the ships!', 'Fast attack craft everywhere, bearing {B}!']
  },
  boatsIntro: {
    calm: ['Tally the boats. Engaging.', "Boats at twelve o'clock, going hot."],
    tense: ['Small boats below, rolling in!', 'Fast attack craft, I see them! Rockets!'],
    panic: ['Boats right under us! Firing!', "They're heading for the ships! Engaging!"]
  },
  boatFire: {
    calm: ['Taking fire from the boats.', 'Small arms from the boats, jinking.'],
    tense: ["Tracers! They're shooting at us!", "Boat's got a gun on us, jinking!"],
    panic: ["We're taking hits from the boats!", 'Heavy fire from below! Hang on!']
  },
  boatKill: {
    calm: ['Boat destroyed.', 'Scratch one boat.'],
    tense: ['Target burning!', "Good hit, boat's going down!"],
    panic: ["Boat's down! Next one!", 'Got one! More boats coming!']
  },
  cover: {
    calm: ['Covering the fleet, eyes open.', 'Watching for vampires over the fleet.'],
    tense: ['Low pass over the ships, hunting leakers.', 'Staying close to the fleet, weapons hot.'],
    panic: ['Staying over the ships! Nothing gets through!', 'Covering the carrier, whatever it takes!']
  },
  sidewinder: {
    calm: ['Sidewinder away!', 'Taking the shot, Fox 2.'],
    tense: ['Fox 2! Sidewinder away!', 'Fox 2 from the helo!'],
    panic: ['Sidewinder away! Get off our fleet!', 'Fox 2! Take that!']
  },
  vampGun: {
    calm: ['Gun on the vampire.', 'Firing on the vampire.'],
    tense: ['Gun on the vampire!', 'Shooting at the missile!'],
    panic: ['Vampire! Shoot it down, shoot it down!', 'Gun on the missile! Come on!']
  },
  hellfire: { calm: ['Hellfire away.'], tense: ['Hellfire away!', 'Hellfire, rifle!'], panic: ['Hellfire away! Sink it!'] },
  rockets: { calm: ['Rockets away.', 'Firing rockets.'], tense: ['Rockets away!', 'Rippling rockets!'], panic: ['Rockets! Everything we have!'] }
};

/* ---- the 5-second check before combat ---- */
LINES.unknownContacts = [
  'Unidentified contacts on radar, bearing {B}. All stations, stand by.',
  'Radar contact, unknown origin, bearing {B}. Attempting to identify.',
  'Bogeys on the scope, bearing {B}. No IFF response. Stand by.',
  'Unknown aircraft closing from bearing {B}. Identify yourselves!',
  'Multiple unknown contacts, bearing {B}. Stand by for confirmation.'
];
LINES.falseAlarm = [
  'Contacts lost. False alarm — stand down.',
  'Disregard, false alarm. Just a flock of birds.',
  'Contact faded off the scope. False alarm, resume normal operations.',
  'Contacts identified as a friendly airliner. Stand down.',
  'Radar glitch. False alarm, everyone relax.'
];
