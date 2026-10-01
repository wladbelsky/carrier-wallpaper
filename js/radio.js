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
  uh1: ['STINGER', 'GUNFIGHTER', 'RED DOG'],
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
  cod: [
    ['COD run to the shore base: mail, parts and passengers.', 'Inbound with fresh mail and spare parts.'],
    ['pick up the replacement F135 engine module at the airfield, grid {G}.', 'Engine module aboard. Heading home.'],
    ['fly the inspection team over to the supply ship, bearing {B}.', 'Team delivered. Returning to Mother.'],
    ['medevac run to the hospital ship, bearing {B}.', 'Patient handed over. RTB.'],
    ['bring the spare radar module out from the shore base.', 'Got the parts. On our way back.'],
    ['pick up the VIP party at the island airstrip, grid {G}.', 'VIPs aboard. Coming home, smooth ride guaranteed.']
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
  cod: ['Copy, converting to airplane mode. En route.', 'Roger, nacelles forward, on our way.', 'Copy. Loadmaster, secure the ramp.', 'Understood. Mail call in about an hour.'],
  heli: ['Copy, nose down, en route.', 'Roger, heading out low and fast.', "Understood, we're on our way. Crew, strap in.", 'Copy. ETA about ten minutes.']
};
let lastMissionCopy = '';
function missionCopy(kind) {
  const pool = LINES.missionCopy.any.concat(LINES.missionCopy[kind.startsWith('heli') ? 'heli' : kind] || []);
  let line; do line = pick(pool); while (line === lastMissionCopy);
  return lastMissionCopy = line;
}
function makeMission(kind) {
  const [order, done] = pick(MISSIONS[kind]);
  const sectors = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Kilo', 'Sierra'];
  const bearing = bearingWords(rand(0, TAU));
  const fill = t => t.replace('{S}', pick(sectors)).replace('{B}', bearing).replace('{G}', `${randi(1, 9)}-${randi(1, 9)}`);
  return { order: fill(order), done: fill(done) };
}

/* ===== Stress: builds up over ~10 minutes of continuous combat music, eases off in silence ===== */
const STRESS = {
  level: 0,
  update(dt) { this.level = clamp(this.level + (AUD.armed ? dt / 600 : -dt / 180), 0, 1); },
  bump(v) { this.level = clamp(this.level + v, 0, 1); },
  get tier() { return this.level < 0.33 ? 'calm' : this.level < 0.66 ? 'tense' : 'panic'; },
  get label() { return ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL'][Math.min(3, Math.floor(this.level * 4))]; },
  /* pick from a tiered pool; higher tiers still mix in calmer lines now and then */
  pick(pool) {
    const t = this.tier;
    if (t === 'panic' && pool.panic && Math.random() < 0.7) return pick(pool.panic);
    if ((t === 'tense' || t === 'panic') && pool.tense && Math.random() < 0.7) return pick(pool.tense);
    return pick(pool.calm);
  }
};

/* ===== Routine flight-deck calls — calm versions + combat versions (used while music plays) ===== */
const OPS = {
  launchClear: {
    calm: ["{c}, you're cleared for launch.", '{c}, catapult is ready. Good luck.', '{c}, wind is on the nose. Cleared to go.'],
    combat: ['{c}, hot deck! Launch, launch, launch!', '{c}, bandits inbound — get airborne now!', "{c}, cat's ready, go! We need you up there!", '{c}, scramble! Scramble!'],
    panic: ["{c}, launch NOW! They're right on top of us!", "{c}, go, go, go! Deck's under fire!", "{c}, get off this deck before it's too late!"]
  },
  launchReady: {
    calm: ['Ready.', 'Roger, launching.', "Let's go.", 'Copy. Full power.'],
    combat: ['Going hot!', 'Copy, launching hot!', 'Master arm on. Go!', 'Roger, scrambling!'],
    panic: ['Launching! Get me out there!', 'Going, going!', 'Hang on, here we go!']
  },
  airborne: {
    calm: ['airborne.', 'is off the deck.', 'airborne, climbing to angels one-five.', 'wheels up.'],
    combat: ['airborne, weapons hot!', 'off the deck, heading for the fight!', 'airborne, looking for trade.', 'up and armed. Point me at them.'],
    panic: ['airborne! Engaging immediately!', "I'm up! Where do you need me?!", 'airborne — they are everywhere!']
  },
  awacsUp: {
    calm: ['airborne. Radar is up.', 'on station. Picture is clean.', 'airborne. I have eyes on the whole sector.'],
    combat: ['airborne. Radar is up — I count multiple hostiles.', 'on station. Picture is hot, bandits everywhere.'],
    panic: ['airborne! The scope is full of red!', 'on station — enemy numbers are off the charts!']
  },
  approach: {
    calm: ['commencing approach.', 'RTB, requesting landing.', 'low on fuel, coming home.'],
    combat: ['winchester, RTB to rearm.', 'bingo fuel, coming in hot.', 'out of missiles, requesting recovery.', 'need to rearm, coming in.'],
    panic: ["I'm hit, coming in! Clear the deck!", 'winchester and bingo, coming home under fire!', 'battle damage, I need that deck now!']
  },
  callBall: {
    calm: ['{c}, call the ball.'],
    combat: ['{c}, call the ball. Make it quick!', '{c}, call the ball, bandits on your six!'],
    panic: ['{c}, just get it down! Call the ball!', '{c}, ball! Now, now!']
  },
  trap: {
    calm: ['Three-wire. Nice trap.', 'Good pass. Welcome home.', 'Two-wire, fair pass.', 'Four-wire. Try harder next time.', 'OK pass, three-wire.'],
    combat: ['Trapped! Rearm and refuel, fast!', 'Good trap. Ordnance crews, move!', 'On deck. Get that bird turned around!'],
    panic: ['Trapped! Get it below, now!', 'On deck! Hurry, more bandits inbound!', 'Caught a wire! Clear the landing area!']
  },
  heliUp: {
    calm: ['lifting off.', 'airborne, heading out.', 'wheels up.'],
    combat: ['lifting off, staying low!', 'airborne, keep your heads down!', 'up and moving, watch the flak!'],
    panic: ['lifting off under fire!', 'airborne — that was close!']
  },
  heliCleared: {
    calm: ['{c}, cleared to land.'],
    combat: ['{c}, cleared to land, make it fast!', '{c}, deck is clear, get down quick!'],
    panic: ["{c}, land now, we're under attack!", '{c}, get down, get down!']
  },
  heliDown: {
    calm: ['on deck.', 'touchdown. Shutting down.', 'safe on deck.'],
    combat: ['on deck, rearm us quick!', 'down. Refuel and we go again.'],
    panic: ['down! That was too close!', 'on deck — we took some hits!']
  }
};
/* returns [text, hot]: hot lines keep their priority during combat */
function opsLine(key, c) {
  const pool = OPS[key], armed = AUD.armed;
  const tier = !armed ? 'calm' : (STRESS.tier === 'panic' && pool.panic ? 'panic' : pool.combat ? 'combat' : 'calm');
  return [pick(pool[tier]).replace(/\{c\}/g, c || ''), armed];
}

/* ===== Combat chatter by stress tier ===== */
const COMBAT = {
  start: {
    calm: ['All units, bandits inbound! Weapons free!', 'Multiple bogeys closing on the fleet. Engage!', 'Enemy aircraft approaching. All units, intercept!'],
    tense: ['Here they come again! All units, engage!', 'Another wave inbound! Weapons free!'],
    panic: ['They just keep coming! Every gun, open fire!', 'Massive enemy wave! Defend the carrier at all costs!']
  },
  end: ['Airspace is clear. Good work, everyone.', 'No more contacts on radar. Stand down.', 'Enemy has withdrawn. Nice work out there.'],
  fighter: {
    calm: ['Fox 2!', 'Fox 3!', 'Engaging.', 'Tally ho!', 'Covering you, lead.', 'Watch your six!', 'Two bandits low, rolling in.', 'Good hit! Good hit!'],
    tense: ['Bandits everywhere!', 'Two on my tail, need help!', 'Break right, break right!', "Missile! Missile! Defending!", "I'm taking fire!", 'Stay with me, wingman!'],
    panic: ["I can't shake him!", 'Mayday, mayday!', "There's too many of them!", 'Someone get this guy off me!', "I'm hit! I'm hit!", 'Hold the line, damn it!']
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
  heli: {
    calm: ['Rockets away!', 'Engaging surface targets.', 'Staying low, covering the fleet.'],
    tense: ['Flak everywhere, staying low!', 'Hellfire away!'],
    panic: ["We're getting shot to pieces out here!", 'Taking hits, still in the fight!']
  },
  splash: {
    calm: ['Splash one!', 'Target destroyed.', 'Good kill!', 'Bandit down.', 'Splash, splash!'],
    tense: ["Splash! Who's next?", "Got him! That's another one!", 'Bandit down! More inbound!'],
    panic: ["Splash! But there's more coming!", 'Got one! Still too many!', 'Down! Next one, quick!']
  },
  vampireDown: ['Vampire splashed!', 'Missile intercepted!', 'CIWS kill!', 'Got the vampire!'],
  shipHit: ["We've been hit! Damage control!", 'Missile impact! Fires on deck!', 'Hit, starboard side! Still fighting!'],
  newBandits: ['New contacts, bearing {B}, {N}! Identified as {T}.', 'Bogeys inbound from the {D}, {N}! Type: {T}.', '{T}, bearing {B}, closing fast!', '{T}s inbound from the {D}, {N}!'],
  vampires: ['Vampire, vampire! Bearing {B}!', 'Inbound anti-ship missiles, bearing {B}!', 'Missile launch detected! Vampires inbound!']
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
