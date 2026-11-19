#!/usr/bin/env node
// Generates sectors 009-100 into src/sectors-generated.js. `npm run generate` then rebuilds docs/sectors.md.
// Method (see docs/level-design.md): place bodies, fly a random launch, drop relays on the path
// it actually flew, then keep the sector only if it survives the quality gates below.
// The same seed always makes the same sectors.
// Usage: node tools/generate-sectors.js [--seed N] [--jobs N] [--pool N] [--dry]
'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('./lib/analyze.js');

const P = A.P;
const W = P.WORLD_W;
const H = P.WORLD_H;
const ROOT = path.join(__dirname, '..');
const FIRST_ID = 9; // sectors 1-8 are the handcrafted originals in src/sectors.js

// ---------------------------------------------------------------------------------------------
// The campaign. Each arc adds one idea and a harder win-rate band than the arc before it.
//   kinds     body line-ups to choose from (the first body must attract)
//   relays    how many relays (chosen per sector)
//   relayR    relay radius; the originals use 24
//   turns     ranges for how far the intended path turns by its last relay (one is chosen per sector,
//             so every arc mixes gentle bends, hairpins and loops)
//   frames    when the intended path reaches its last relay (the predictor shows 310 frames)
//   tol       least aiming error the intended launch must forgive: [degrees, px/s]
//   winTurn   every winning launch must turn at least this much (no straight shots)
//   decoys    the arc may add one decoy to a sector: a body the route never swings by (see addDecoy)
//   band      share of all launches that win, first sector of the arc -> last
// ---------------------------------------------------------------------------------------------
const ARCS = [
  {
    name: 'SINGLE WELL', count: 12, note: 'One body. Learn how speed trades against bend.',
    kinds: [['star'], ['giant'], ['planet']],
    relays: [1, 2, 2], relayR: 24, turns: [[55, 110], [110, 190], [190, 340]], frames: [70, 290], tol: [2.5, 30], winTurn: 22,
    band: [1.6, 0.4], flips: 'v'
  },
  {
    name: 'BINARY SYSTEMS', count: 10, note: 'Two wells pulling against each other.',
    kinds: [['star', 'star'], ['star', 'giant'], ['giant', 'planet'], ['star', 'planet'], ['giant', 'giant']],
    relays: [2], relayR: 24, turns: [[70, 140], [140, 260], [260, 460]], frames: [90, 295], tol: [2, 24], winTurn: 35,
    band: [1.0, 0.28], flips: 'v'
  },
  {
    name: 'EVENT HORIZONS', count: 10, note: 'Small, heavy singularities: sharp turns, thin margins.',
    kinds: [['star', 'hazard'], ['giant', 'hazard'], ['planet', 'hazard'], ['star', 'giant', 'hazard'], ['giant', 'planet', 'hazard']],
    relays: [2], relayR: 24, turns: [[80, 150], [150, 280], [280, 480]], frames: [90, 300], tol: [1.75, 20], winTurn: 40,
    needs: 'hazard', band: [0.8, 0.2], flips: 'vh'
  },
  {
    name: 'TRIPLE CHAINS', count: 10, note: 'Three wells, three relays, one arc.',
    kinds: [['star', 'giant', 'planet'], ['star', 'giant', 'giant'], ['giant', 'star', 'star'], ['star', 'planet', 'planet']],
    relays: [3], relayR: 24, turns: [[90, 170], [170, 320], [320, 520]], frames: [110, 300], tol: [1.5, 18], winTurn: 45,
    band: [0.55, 0.14], flips: 'vh'
  },
  {
    name: 'REPULSOR FIELDS', count: 10, note: 'New body: repulsors push the probe away.',
    kinds: [['star', 'repulsor'], ['giant', 'repulsor'], ['planet', 'repulsor'], ['star', 'giant', 'repulsor'], ['giant', 'repulsor', 'repulsor']],
    relays: [2], relayR: 24, turns: [[60, 130], [130, 240], [240, 420]], frames: [90, 300], tol: [1.75, 20], winTurn: 35,
    needs: 'repulsor', band: [0.7, 0.16], flips: 'vh'
  },
  {
    name: 'NARROW BEACONS', count: 10, note: 'Relays shrink to 70% of their usual radius.',
    kinds: [['star', 'giant'], ['star', 'planet', 'giant'], ['giant', 'hazard'], ['star', 'giant', 'hazard'], ['star', 'repulsor', 'planet']],
    relays: [2, 3], relayR: 17, turns: [[80, 150], [150, 300], [300, 460]], frames: [100, 300], tol: [1.25, 14], winTurn: 40,
    decoys: true, band: [0.36, 0.09], flips: 'vh'
  },
  {
    name: 'BLIND TRANSFERS', count: 10, note: 'The last relay lies past the end of the predictor.',
    kinds: [['star', 'giant'], ['star', 'star'], ['giant', 'planet', 'star'], ['star', 'hazard'], ['giant', 'repulsor', 'star']],
    relays: [2], relayR: 24, turns: [[120, 900]], frames: [345, 640], tol: [1.5, 16], winTurn: 60,
    blind: true, band: [0.5, 0.1], flips: 'vh'
  },
  {
    name: 'CROWDED SKIES', count: 10, note: 'Four and five bodies, and not all of them are part of the route.',
    kinds: [['star', 'giant', 'planet', 'hazard'], ['star', 'giant', 'repulsor', 'planet'], ['giant', 'star', 'hazard', 'repulsor'],
      ['star', 'giant', 'planet', 'planet', 'hazard'], ['star', 'planet', 'giant', 'repulsor', 'hazard']],
    relays: [3], relayR: 22, turns: [[100, 180], [180, 340], [340, 600]], frames: [120, 420], tol: [1.25, 12], winTurn: 45,
    crowded: true, decoys: true, band: [0.26, 0.07], flips: 'vh'
  },
  {
    name: 'GRAND TOURS', count: 10, note: 'Everything at once: many bodies, small relays, long flights.',
    kinds: [['star', 'giant', 'planet', 'hazard'], ['star', 'giant', 'giant', 'repulsor'], ['giant', 'star', 'planet', 'hazard', 'repulsor'],
      ['star', 'star', 'giant', 'planet', 'hazard']],
    relays: [3, 4, 4], relayR: 19, turns: [[140, 260], [260, 900]], frames: [160, 620], tol: [1, 10], winTurn: 60,
    crowded: true, decoys: true, band: [0.14, 0.035], flips: 'vh'
  }
];

const BODY = {
  star: { r: [34, 46], mass: [115, 150] },
  giant: { r: [32, 46], mass: [110, 175] },
  planet: { r: [26, 34], mass: [85, 125] },
  hazard: { r: [22, 26], mass: [130, 160] },
  repulsor: { r: [20, 24], mass: [-70, -30] }
};

// ---------------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(seed, a, b) {
  let h = (seed ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (a + 0x7F4A7C15), 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ (h >>> 13) ^ (b + 0x165667B1), 0xC2B2AE35) >>> 0;
  return mulberry32(h ^ (h >>> 16));
}

const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const snap = (v, step = 5) => Math.round(v / step) * step;
const norm360 = (a) => ((a % 360) + 360) % 360;

// The game prints each body's name and mass just below it. Nothing else may sit on that text.
const labelBox = (b) => ({ x: b.x, y: b.y + b.r + 15, hw: 66, hh: 9 });
function circleHitsBox(cx, cy, r, box) {
  const dx = Math.max(Math.abs(cx - box.x) - box.hw, 0);
  const dy = Math.max(Math.abs(cy - box.y) - box.hh, 0);
  return dx * dx + dy * dy < r * r;
}
function labelsClash(a, b) {
  const la = labelBox(a);
  const lb = labelBox(b);
  return (Math.abs(la.x - lb.x) < la.hw + lb.hw && Math.abs(la.y - lb.y) < la.hh + lb.hh) ||
    circleHitsBox(a.x, a.y, a.r + 4, lb) || circleHitsBox(b.x, b.y, b.r + 4, la);
}

// ---------------------------------------------------------------------------------------------
// Step 1: bodies
// ---------------------------------------------------------------------------------------------
function placeBodies(rng, kinds, probe, spec) {
  const shrink = spec.crowded ? 0.86 : 1;
  const gap = spec.crowded ? 105 : 135;
  const bodies = [];
  for (const type of kinds) {
    const k = BODY[type];
    const r = Math.round(between(rng, k.r[0], k.r[1]) * shrink);
    const mass = snap(between(rng, k.mass[0], k.mass[1]) * (type === 'repulsor' ? 1 : shrink + (1 - shrink) * 0.5));
    let placed = null;
    for (let t = 0; t < 120 && !placed; t++) {
      let x = snap(between(rng, 320, 1050));
      let y = snap(between(rng, 115, 605));
      // Designed-looking layouts: sometimes line a body up with an earlier one.
      if (bodies.length && rng() < 0.3) {
        const ref = pick(rng, bodies);
        if (rng() < 0.5) x = ref.x; else y = ref.y;
      }
      if (Math.hypot(x - probe.x, y - probe.y) < r + 190) continue;
      if (bodies.some((o) => Math.hypot(x - o.x, y - o.y) < r + o.r + gap)) continue;
      if (bodies.some((o) => labelsClash({ x, y, r }, o))) continue;
      placed = { x, y, r, mass, type };
    }
    if (!placed) return null;
    if (type === 'giant' && rng() < 0.45) {
      placed.ring = true;
      placed.tilt = Math.round(between(rng, 0.2, 0.34) * (rng() < 0.5 ? -1 : 1) * 100) / 100;
    }
    bodies.push(placed);
  }
  return bodies;
}

// ---------------------------------------------------------------------------------------------
// Step 2: relays on the path a launch actually flew
// ---------------------------------------------------------------------------------------------
function placeRelays(rng, spec, turn, base, rec, result, count) {
  const R = spec.relayR;
  let end = rec.length / 3 - (result === 'impact' ? 12 : 0);
  // The intended path must stay on screen until its last relay.
  for (let f = 0; f < end; f++) {
    const x = rec[f * 3];
    const y = rec[f * 3 + 1];
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) { end = f; break; }
  }
  const ok = (f) => {
    const x = rec[f * 3];
    const y = rec[f * 3 + 1];
    if (x < 70 || x > W - 70 || y < 62 || y > H - 72) return false;
    if (Math.hypot(x - base.probe.x, y - base.probe.y) < 185) return false;
    return base.bodies.every((b) => Math.hypot(x - b.x, y - b.y) >= b.r + R + 18 && !circleHitsBox(x, y, R + 3, labelBox(b)));
  };
  const turnAt = (f) => rec[f * 3 + 2];

  const last = [];
  for (let f = spec.frames[0]; f < Math.min(spec.frames[1], end); f++) {
    if (ok(f) && turnAt(f) >= turn[0] && turnAt(f) <= turn[1]) last.push(f);
  }
  if (!last.length) return null;

  const segTurn = count >= 3 ? 18 : 25; // each relay must sit past a bend from the one before
  for (let attempt = 0; attempt < 30; attempt++) {
    const frames = [pick(rng, last)];
    let good = true;
    while (frames.length < count && good) {
      const next = frames[0];
      const options = [];
      for (let f = 22; f <= next - 26; f++) {
        if (!ok(f) || turnAt(next) - turnAt(f) < segTurn) continue;
        const x = rec[f * 3];
        const y = rec[f * 3 + 1];
        if (frames.some((g) => Math.hypot(x - rec[g * 3], y - rec[g * 3 + 1]) < 2 * R + 95)) continue;
        options.push(f);
      }
      if (!options.length) good = false;
      else frames.unshift(pick(rng, options));
    }
    if (!good) continue;
    return frames.map((f, i) => ({
      x: Math.round(rec[f * 3]),
      y: Math.round(rec[f * 3 + 1]),
      r: R,
      code: `RLY-${String(i + 1).padStart(2, '0')}`
    }));
  }
  return null;
}

// Mirror a sector so launchpads are not always on the left.
function flip(sector, angle, horizontal, vertical) {
  const fx = (x) => (horizontal ? W - x : x);
  const fy = (y) => (vertical ? H - y : y);
  const out = {
    probe: { x: fx(sector.probe.x), y: fy(sector.probe.y) },
    bodies: sector.bodies.map((b) => {
      const n = { ...b, x: fx(b.x), y: fy(b.y) };
      if (b.ring && horizontal !== vertical) n.tilt = -b.tilt;
      return n;
    }),
    relays: sector.relays.map((r) => ({ ...r, x: fx(r.x), y: fy(r.y) }))
  };
  let a = angle;
  if (vertical) a = -a;
  if (horizontal) a = 180 - a;
  return { sector: out, angle: a };
}

// Gates on the route the recorded launch flies: not too long, and on screen throughout.
function routeOk(spec, flown, path) {
  if (flown.result !== 'complete' || flown.frames > spec.frames[1] + 25) return false;
  for (let i = 0; i < path.length; i += 3) {
    if (path[i] < -40 || path[i] > W + 40 || path[i + 1] < -20 || path[i + 1] > H + 20) return false;
  }
  return true;
}

// Bodies the launch does not need: it still wins with the body taken away.
function spareBodies(sector, angle, speed) {
  const spare = [];
  for (let i = 0; i < sector.bodies.length; i++) {
    if (sector.bodies[i].decoy) continue;
    const without = { ...sector, bodies: sector.bodies.filter((_, j) => j !== i) };
    if (A.wins(without, angle, speed)) spare.push(i);
  }
  return spare;
}

// Re-centre a winning launch in its win window, check it forgives enough, and round it.
function settle(sector, spec, angle0, speed0) {
  let angle = angle0;
  let speed = speed0;
  let tol = A.tolerance(sector, angle, speed);
  for (let i = 0; i < 2 && tol; i++) {
    angle = tol.midAngle;
    speed = tol.midSpeed;
    tol = A.tolerance(sector, angle, speed);
  }
  if (!tol || tol.angTol < spec.tol[0] || tol.spdTol < spec.tol[1]) return null;
  angle = Math.round(norm360(angle) * 10) / 10;
  speed = Math.round(speed);
  if (![[0, 0], [0.3, 0], [-0.3, 0], [0, 3], [0, -3]].every(([da, ds]) => A.wins(sector, angle + da, speed + ds))) return null;
  return { angle, speed, tol };
}

// A decoy is a body to steer clear of, not one to slingshot around. It is added to a sector that
// already works, and it must be a fair obstacle rather than an annoyance:
//   - it looks like the real bodies: an attractor just as heavy
//   - it is near the route (within DECOY_REACH px of it, and of a relay), so it is worth noticing
//   - the route never flies by it: it stays DECOY_CLEAR px off the surface
//   - it is not needed: the route was found without it, and with it in place the winning launch
//     has moved by no more than a small aim correction (A.NEAR_ANGLE degrees, A.NEAR_SPEED px/s)
//   - it costs little: the solution keeps at least 60% of the aiming margin it had before
const DECOY_CLEAR = 55;
const DECOY_REACH = 220;
function addDecoy(rng, spec, sector, solved) {
  const shrink = spec.crowded ? 0.86 : 1;
  const gap = spec.crowded ? 95 : 120;
  const R = spec.relayR;
  const before = A.launch(sector, solved.angle, solved.speed);

  for (let t = 0; t < 60; t++) {
    const type = pick(rng, ['star', 'giant', 'giant', 'hazard']);
    const k = BODY[type];
    const r = Math.round(between(rng, k.r[0], k.r[1]) * shrink);
    const mass = Math.max(105, snap(between(rng, k.mass[0], k.mass[1]) * (shrink + (1 - shrink) * 0.5)));
    // Somewhere within reach of a relay.
    const relay = pick(rng, sector.relays);
    const dir = rng() * Math.PI * 2;
    const dist = between(rng, r + R + 60, 300);
    const x = snap(relay.x + Math.cos(dir) * dist);
    const y = snap(relay.y + Math.sin(dir) * dist);
    const body = { x, y, r, mass, type };
    if (x < r + 45 || x > W - r - 45 || y < r + 45 || y > H - r - 60) continue;
    if (Math.hypot(x - sector.probe.x, y - sector.probe.y) < r + 190) continue;
    if (sector.bodies.some((o) => Math.hypot(x - o.x, y - o.y) < r + o.r + gap || labelsClash(body, o))) continue;
    if (sector.relays.some((q) => Math.hypot(x - q.x, y - q.y) < r + R + 18 || circleHitsBox(q.x, q.y, R + 3, labelBox(body)))) continue;
    if (A.clearance(sector, solved.angle, solved.speed, body) < DECOY_CLEAR + 15) continue;

    if (type === 'giant' && rng() < 0.45) {
      body.ring = true;
      body.tilt = Math.round(between(rng, 0.2, 0.34) * (rng() < 0.5 ? -1 : 1) * 100) / 100;
    }
    body.decoy = true;
    const withDecoy = { ...sector, bodies: [...sector.bodies, body] };

    // The same route must survive: a win near the old launch, still forgiving, still the same shape.
    const near = A.nearestWin(withDecoy, solved.angle, solved.speed);
    if (!near) continue;
    const next = settle(withDecoy, spec, near.angle, near.speed);
    if (!next) continue;
    let turned = Math.abs(next.angle - solved.angle);
    if (turned > 180) turned = 360 - turned;
    if (turned > A.NEAR_ANGLE || Math.abs(next.speed - solved.speed) > A.NEAR_SPEED) continue;
    const path = [];
    const flown = A.launch(withDecoy, next.angle, next.speed, path);
    if (!routeOk(spec, flown, path)) continue;
    if (Math.abs(flown.frames - before.frames) > before.frames * 0.25 || Math.abs(flown.turn - before.turn) > before.turn * 0.3) continue;
    const clear = A.clearance(withDecoy, next.angle, next.speed, body);
    if (clear < DECOY_CLEAR || clear > DECOY_REACH) continue;
    if (next.tol.angTol < solved.tol.angTol * 0.6 || next.tol.spdTol < solved.tol.spdTol * 0.6) continue;
    // Everything else must still be essential.
    if (spareBodies(withDecoy, next.angle, next.speed).length) continue;
    return { sector: withDecoy, solved: next };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Steps 3-5: one attempt at a sector, with every quality gate
// ---------------------------------------------------------------------------------------------
function attempt(spec, rng, stats) {
  const kinds = pick(rng, spec.kinds);
  const count = pick(rng, spec.relays);
  const turnClass = Math.floor(rng() * spec.turns.length);
  const probe = { x: snap(between(rng, 110, 250)), y: snap(between(rng, 150, 570)) };
  const bodies = placeBodies(rng, kinds, probe, spec);
  if (!bodies) return null;
  const base = { probe, bodies, relays: [] };
  const flipH = spec.flips.includes('h') && rng() < 0.4;
  const flipV = spec.flips.includes('v') && rng() < 0.5;

  for (let t = 0; t < 36; t++) {
    const angle0 = between(rng, -100, 100);
    const speed0 = between(rng, 165, 505);
    const rec = [];
    const flown = A.launch(base, angle0, speed0, rec);
    const relays = placeRelays(rng, spec, spec.turns[turnClass], base, rec, flown.result, count);
    if (!relays) continue;
    stats.placed++;

    const flipped = flip({ probe, bodies, relays }, angle0, flipH, flipV);

    // Gate: the launch must forgive aiming error. It is re-centred in its win window first.
    let sector = flipped.sector;
    let solved = settle(sector, spec, flipped.angle, speed0);
    if (!solved) continue;
    stats.tolerant++;

    // Gate: re-centring must not have slid the launch onto a different, much longer route
    // or off the screen.
    const path = [];
    if (!routeOk(spec, A.launch(sector, solved.angle, solved.speed, path), path)) continue;

    // Gate: every body earns its place. Taking any one away must break the solution.
    if (spareBodies(sector, solved.angle, solved.speed).length) continue;
    stats.essential++;

    // In the decoy arcs, most sectors then get one body to steer clear of.
    if (spec.decoys && rng() < 0.75) {
      const decoyed = addDecoy(rng, spec, sector, solved);
      if (decoyed) {
        sector = decoyed.sector;
        solved = decoyed.solved;
        stats.decoyed++;
      }
    }
    const { angle, speed, tol } = solved;

    // Gate: the whole launch space. No near-straight winners, and for blind sectors the
    // predictor must not be able to confirm a win.
    // A coarse pass throws out most failures at a sixteenth of the cost of the full sweep.
    const rough = A.sweep(sector, A.ANGLE_STEP * 4, A.SPEED_STEP * 4);
    if (rough.wins && (rough.minTurn < spec.winTurn || (spec.blind && rough.visibleShare > 0.02))) continue;
    const sw = A.sweep(sector);
    if (sw.minTurn < spec.winTurn) continue;
    if (spec.blind && sw.visibleShare > 0.02) continue;

    const flownFinal = A.launch(sector, angle, speed);
    const decoy = sector.bodies.findIndex((b) => b.decoy);
    return {
      sector,
      solution: { angle, speed },
      turnClass,
      decoy,
      stats: {
        winPct: sw.winPct,
        visibleShare: sw.visibleShare,
        minTurn: sw.minTurn,
        angTol: tol.angTol,
        spdTol: tol.spdTol,
        turn: flownFinal.turn,
        frames: flownFinal.frames,
        difficulty: A.difficulty(sw.winPct, sw.visibleShare)
      }
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Worker: runs a batch of attempts for one arc
// ---------------------------------------------------------------------------------------------
if (!isMainThread) {
  parentPort.on('message', ({ arc, from, to }) => {
    const out = [];
    const stats = { placed: 0, tolerant: 0, essential: 0, decoyed: 0 };
    for (let i = from; i < to; i++) {
      const cand = attempt(ARCS[arc], rngFor(workerData.seed, arc, i), stats);
      if (cand) out.push({ ...cand, attempt: i });
    }
    parentPort.postMessage({ arc, from, out, stats });
  });
  return;
}

// ---------------------------------------------------------------------------------------------
// Names, labels and briefs
// ---------------------------------------------------------------------------------------------
const LABELS = {
  star: ['VEGA', 'ALTAIR', 'RIGEL', 'DENEB', 'SIRIUS', 'ANTARES', 'PROCYON', 'CAPELLA', 'ARCTURUS', 'SPICA', 'MIRA', 'ALGOL', 'POLARIS', 'REGULUS', 'BELLATRIX', 'ALDEBARAN', 'CANOPUS', 'ACHERNAR', 'FOMALHAUT', 'TAU-CETI', 'WOLF-359', 'ROSS-128', 'GLIESE', 'KEPLER', 'TRAPPIST', 'LUYTEN', 'BARNARD', 'SOL', 'HELIOS', 'ALPHA'],
  giant: ['JOVE', 'KRONOS', 'TITAN', 'ORION', 'ATLAS', 'HYPERION', 'OCEANUS', 'THEIA', 'RHEA', 'TETHYS', 'ZEUS', 'ODIN', 'THOR', 'BOREAS', 'TYPHON', 'URANOS', 'BRONTES', 'GAIA', 'AETHER', 'EREBUS'],
  planet: ['VESTA', 'CERES', 'PALLAS', 'TRITON', 'NEREID', 'EUROPA', 'CALLISTO', 'IO', 'MIMAS', 'DIONE', 'ARIEL', 'OBERON', 'CHARON', 'ERIS', 'SEDNA', 'MAKEMAKE', 'HAUMEA', 'ENCELADUS', 'PHOEBE', 'JANUS'],
  hazard: ['PSR', 'CYG', 'SGR', 'MAG', 'XRB', 'GRO', 'LMC', 'VELA'],
  repulsor: ['NULL', 'VOID', 'ANTI', 'RIFT', 'ECHO', 'FLUX']
};
const SUFFIX = ['A', 'B', 'C', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'IX', 'PRIME', 'MINOR', 'MAJOR', 'N', 'S'];
const CODE = ['X1', 'X3', 'X7', 'X9', 'J17', 'J04', 'B19', 'K2', 'K5', 'Q8', 'Z3', 'D6'];

const PEOPLE = ['TYCHO', 'HALLEY', 'CASSINI', 'HERSCHEL', 'OORT', 'LAPLACE', 'EULER', 'NEWTON', 'GALILEO', 'HUBBLE', 'SAGAN', 'DRAKE', 'HOHMANN', 'LOVELL', 'KRANZ', 'HAMILTON', 'JOHNSON', 'VAUGHAN', 'JACKSON', 'MELVILL', 'HADFIELD', 'PEAKE', 'ARMSTRONG', 'GAGARIN', 'TERESHKOVA', 'JEMISON', 'CHANDRA', 'HAWKING', 'PENROSE', 'NOETHER', 'LEAVITT', 'CANNON', 'PAYNE', 'RUBIN', 'HYPATIA', 'BRAHE', 'COPERNICUS', 'HUYGENS', 'GAUSS', 'POINCARE', 'KOVALEVSKAYA', 'GODDARD', 'KOROLEV', 'TSIEN', 'ALDRIN', 'COLLINS', 'SHEPARD', 'GLENN', 'LEONOV', 'CERNAN', 'CONRAD', 'SCHMITT', 'MESSIER', 'BESSEL', 'LISSAJOUS', 'MOLNIYA', 'TUNDRA', 'CLARKE', 'VERNE', 'KELDYSH', 'FERMI', 'DYSON', 'BURNELL', 'SOMERVILLE', 'MITCHELL', 'BANNEKER', 'ARYABHATA', 'AL-SUFI', 'SHEN-KUO', 'ZHANG-HENG', 'OLBERS', 'ENCKE', 'BIELA', 'APOLLONIUS', 'HIPPARCHUS', 'PTOLEMY', 'KHAYYAM', 'ULUGH-BEG', 'MARIUS', 'HEVELIUS', 'FLAMSTEED', 'BRADLEY', 'STRUVE', 'LE VERRIER', 'LOWELL', 'TOMBAUGH', 'OPIK', 'BOK', 'BAADE', 'ZWICKY', 'SHAPLEY', 'HOYLE', 'GAMOW', 'LEMAITRE', 'SCHWARZSCHILD', 'KERR', 'THORNE', 'WHEELER'];
const MANEUVER = {
  gentle: ['BEND', 'DEFLECTION', 'SWINGBY', 'ARC', 'ASSIST', 'TRANSFER'],
  hairpin: ['HAIRPIN', 'WHIP', 'CRESCENT', 'HOOK', 'SWITCHBACK', 'REVERSAL'],
  loop: ['LOOP', 'SPIRAL', 'CAROUSEL', 'PIROUETTE', 'CORKSCREW', 'ROSETTE'],
  back: ['BOOMERANG', 'REBOUND', 'RETURN', 'RECALL'],
  hazard: ['SKIM', 'GRAZE', 'HORIZON', 'PLUNGE', 'KNIFE-EDGE'],
  repulsor: ['RICOCHET', 'DEFLECTOR', 'BANK SHOT', 'MIRROR', 'BUMPER', 'CAROM'],
  chain: ['CHAIN', 'CASCADE', 'LADDER', 'RELAY RUN', 'SLALOM', 'TRAVERSE'],
  narrow: ['NEEDLE', 'KEYHOLE', 'PINHOLE', 'THREAD', 'APERTURE'],
  blind: ['LONG HAUL', 'DRIFT', 'ODYSSEY', 'DARK LEG', 'DEAD RECKONING', 'FAR SIDE'],
  tour: ['GRAND TOUR', 'ALIGNMENT', 'PILGRIMAGE', 'CIRCUIT', 'EXPEDITION', 'CROSSING']
};

function describe(cand, spec, rng) {
  const { sector, solution, stats } = cand;
  // Order the bodies by when the winning path passes closest to each.
  const rec = [];
  A.launch({ ...sector, relays: [] }, solution.angle, solution.speed, rec);
  const upTo = Math.min(stats.frames + 1, rec.length / 3);
  const passes = sector.bodies.map((b) => {
    let best = Infinity;
    let at = 0;
    for (let f = 0; f < upTo; f++) {
      const d = Math.hypot(rec[f * 3] - b.x, rec[f * 3 + 1] - b.y) - b.r;
      if (d < best) { best = d; at = f; }
    }
    return { b, at, clear: best };
  }).filter((p) => sector.bodies.indexOf(p.b) !== cand.decoy).sort((p, q) => p.at - q.at);

  const lastRelay = sector.relays[sector.relays.length - 1];
  const cameBack = stats.turn >= 150 && Math.hypot(lastRelay.x - sector.probe.x, lastRelay.y - sector.probe.y) < 420;
  const repulsor = passes.find((p) => p.b.type === 'repulsor');
  const hazard = passes.find((p) => p.b.type === 'hazard');

  let kind;
  if (spec.blind) kind = 'blind';
  else if (spec.name === 'GRAND TOURS') kind = 'tour';
  else if (spec.relayR < 20) kind = 'narrow';
  else if (repulsor && spec.needs === 'repulsor') kind = 'repulsor';
  else if (hazard && spec.needs === 'hazard') kind = 'hazard';
  else if (cameBack) kind = 'back';
  else if (stats.turn >= 300) kind = 'loop';
  else if (sector.bodies.length >= 3) kind = 'chain';
  else if (stats.turn >= 130) kind = 'hairpin';
  else kind = 'gentle';

  const n = sector.relays.length;
  const relayWords = n === 1 ? 'THE RELAY' : n === 2 ? 'BOTH RELAYS' : `ALL ${n} RELAYS`;
  const deg = `${Math.round(stats.turn / 5) * 5}°`;
  const names = passes.map((p) => p.b.label);
  let brief;
  if (kind === 'blind') {
    brief = `THE PREDICTOR STOPS SHORT: FLY, READ THE GHOST TRACK, REFINE`;
  } else if (kind === 'repulsor') {
    brief = `BANK OFF REPULSOR ${repulsor.b.label} TO LOCK ${relayWords}`;
  } else if (kind === 'hazard') {
    brief = `SKIM SINGULARITY ${hazard.b.label} FOR A ${deg} TURN ONTO ${relayWords}`;
  } else if (kind === 'narrow') {
    // Briefs in the decoy arcs never list the route body by body: that would give the decoy away.
    brief = `NARROW BEACONS: ${deg} OF TURN TO LOCK ${relayWords}, NO MARGIN`;
  } else if (spec.decoys) {
    brief = `IN PAST ${names[0]}, OUT BY ${names[names.length - 1]}: ${deg} OF TURN, ${n} RELAYS`;
  } else if (sector.bodies.length === 1) {
    brief = stats.turn >= 300
      ? `FLY A FULL LOOP AROUND ${names[0]} TO LOCK ${relayWords}`
      : `SWING ${deg} AROUND ${names[0]} TO LOCK ${relayWords}`;
  } else if (sector.bodies.length === 2) {
    brief = `BEND PAST ${names[0]}, THEN WHIP AROUND ${names[1]} FOR ${relayWords}`;
  } else if (sector.bodies.length === 3) {
    brief = `CHAIN ${names.join(' > ')} TO LOCK ${relayWords}`;
  } else {
    brief = `IN PAST ${names[0]}, OUT BY ${names[names.length - 1]}: ${deg} OF TURN, ${n} RELAYS`;
  }
  if (brief.length > 66) brief = `${deg} OF TURN IN ONE ARC TO LOCK ${relayWords}`;
  return { kind, brief };
}

function labelBodies(sector, rng, used) {
  sector.bodies.forEach((b) => {
    let label;
    for (let t = 0; t < 200; t++) {
      const stem = pick(rng, LABELS[b.type]);
      label = b.type === 'hazard' || b.type === 'repulsor' ? `${stem}-${pick(rng, CODE)}` : `${stem}-${pick(rng, SUFFIX)}`;
      if (!used.has(label)) break;
    }
    used.add(label);
    b.label = label;
  });
}

// ---------------------------------------------------------------------------------------------
// Main: build a pool per arc, pick sectors along each arc's difficulty band, write the files
// ---------------------------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const num = (flag, fallback) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : fallback);
  return {
    seed: num('--seed', 2026),
    jobs: num('--jobs', Math.max(1, os.cpus().length - 2)),
    pool: num('--pool', 40),
    dry: args.includes('--dry')
  };
}

async function buildPools(opts) {
  const BATCH = 4;
  const arcs = ARCS.map(() => ({ batches: new Map(), next: 0, pool: null, stats: { placed: 0, tolerant: 0, essential: 0, decoyed: 0, attempts: 0 } }));
  const workers = Array.from({ length: opts.jobs }, () => new Worker(__filename, { workerData: { seed: opts.seed } }));

  const settle = (arcIdx) => {
    const arc = arcs[arcIdx];
    const pool = [];
    for (let b = 0; arc.batches.has(b) && arc.batches.get(b) !== null; b++) {
      pool.push(...arc.batches.get(b));
      if (pool.length >= opts.pool) { arc.pool = pool.slice(0, opts.pool); return; }
    }
  };
  const nextJob = () => {
    // Give the next batch to the unfinished arc with the fewest batches handed out.
    let chosen = -1;
    arcs.forEach((arc, i) => {
      if (!arc.pool && arc.next < 4000 && (chosen < 0 || arc.next < arcs[chosen].next)) chosen = i;
    });
    if (chosen < 0) return null;
    const arc = arcs[chosen];
    const batch = arc.next++;
    arc.batches.set(batch, null);
    return { arc: chosen, from: batch * BATCH, to: (batch + 1) * BATCH };
  };

  await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      const job = nextJob();
      if (!job) { worker.terminate().then(resolve); return; }
      worker.postMessage(job);
    };
    worker.on('message', ({ arc, from, out, stats }) => {
      const state = arcs[arc];
      state.batches.set(from / BATCH, out);
      state.stats.attempts += BATCH;
      for (const k of ['placed', 'tolerant', 'essential', 'decoyed']) state.stats[k] += stats[k];
      if (!state.pool) {
        settle(arc);
        if (state.pool) process.stderr.write(`  pool ready: ${ARCS[arc].name}\n`);
      }
      feed();
    });
    worker.on('error', reject);
    feed();
  })));

  return arcs.map((arc, i) => {
    if (!arc.pool) settle(i);
    const pool = arc.pool || [...arc.batches.values()].filter(Boolean).flat();
    return { pool, stats: arc.stats };
  });
}

// Walk the arc's win-rate band from easy to hard, taking the closest unused candidate each time.
function selectArc(spec, pool) {
  const chosen = [];
  const free = pool.slice();
  for (let k = 0; k < spec.count; k++) {
    const t = spec.count === 1 ? 0 : k / (spec.count - 1);
    const target = Math.log10(spec.band[0]) + (Math.log10(spec.band[1]) - Math.log10(spec.band[0])) * t;
    if (!free.length) break;
    const gaps = free.map((c) => Math.abs(Math.log10(c.stats.winPct) - target));
    const bestGap = Math.min(...gaps);
    // Among near-equal fits, take the path shape (gentle / hairpin / loop) used least so far, and
    // in the decoy arcs keep sectors with and without a decoy in balance.
    let best = -1;
    free.forEach((c, i) => {
      if (gaps[i] > bestGap + (spec.decoys ? 0.12 : 0.07)) return;
      const used = chosen.filter((o) => o.turnClass === c.turnClass).length +
        (spec.decoys ? 3 * chosen.filter((o) => (o.decoy >= 0) === (c.decoy >= 0)).length : 0);
      if (best < 0 || used < free[best].used || (used === free[best].used && gaps[i] < gaps[best])) {
        c.used = used;
        best = i;
      }
    });
    chosen.push(free.splice(best, 1)[0]);
  }
  return chosen.sort((a, b) => a.stats.difficulty - b.stats.difficulty);
}

function hintFor(cand, t, rng) {
  // The LAUNCH button and arrow keys start from this vector: a nudge that gets vaguer as sectors get harder.
  const off = (8 + 22 * t) * (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.6);
  let a = cand.solution.angle + off;
  if (a > 180) a -= 360;
  return {
    hintAngle: Math.round(a),
    hintSpeed: Math.max(200, Math.min(560, snap((cand.solution.speed * (0.9 + rng() * 0.25)) / 0.85)))
  };
}

function formatSector(s) {
  const body = (b) => {
    const extra = (b.ring ? `, ring: true, tilt: ${b.tilt}` : '') + (b.decoy ? ', decoy: true' : '');
    return `        { x: ${b.x}, y: ${b.y}, r: ${b.r}, mass: ${b.mass}, type: '${b.type}'${extra}, label: '${b.label}' }`;
  };
  const relay = (r) => `        { x: ${r.x}, y: ${r.y}, r: ${r.r}, code: '${r.code}' }`;
  return [
    '    {',
    `      id: ${s.id},`,
    `      name: '${s.name}',`,
    `      arc: '${s.arc}',`,
    `      brief: '${s.brief}',`,
    `      probe: { x: ${s.probe.x}, y: ${s.probe.y} },`,
    `      hintAngle: ${s.hintAngle},`,
    `      hintSpeed: ${s.hintSpeed},`,
    `      solution: { angle: ${s.solution.angle}, speed: ${s.solution.speed} },`,
    '      bodies: [',
    s.bodies.map(body).join(',\n'),
    '      ],',
    '      relays: [',
    s.relays.map(relay).join(',\n'),
    '      ]',
    '    }'
  ].join('\n');
}

async function main() {
  const opts = parseArgs();
  const started = Date.now();
  process.stderr.write(`Generating with seed ${opts.seed}, ${opts.jobs} workers, pool ${opts.pool} per arc\n`);
  const pools = await buildPools(opts);

  const sectors = [];
  const rows = [];
  const usedLabels = new Set();
  // Every sector is named "<astronomer or pioneer> <manoeuvre>". Each person is used once, and
  // within a kind of manoeuvre the words rotate so neighbours do not share one.
  const nameRng = rngFor(opts.seed, 999, 0);
  const people = PEOPLE.slice();
  for (let i = people.length - 1; i > 0; i--) {
    const j = Math.floor(nameRng() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }
  const wordUse = new Map();
  let id = FIRST_ID;
  let short = false;

  ARCS.forEach((spec, arcIdx) => {
    const { pool, stats } = pools[arcIdx];
    const pcts = pool.map((c) => c.stats.winPct).sort((a, b) => b - a);
    process.stderr.write(
      `${spec.name.padEnd(16)} pool ${String(pool.length).padStart(3)} from ${stats.attempts} attempts ` +
      `(placed ${stats.placed}, tolerant ${stats.tolerant}, essential ${stats.essential}, with decoy ${pool.filter((c) => c.decoy >= 0).length})  win% ` +
      `${pcts.length ? `${pcts[0].toFixed(2)} .. ${pcts[Math.floor(pcts.length / 2)].toFixed(2)} .. ${pcts[pcts.length - 1].toFixed(3)}` : '-'}\n`
    );
    const chosen = selectArc(spec, pool);
    if (chosen.length < spec.count) short = true;
    chosen.forEach((cand, k) => {
      const rng = rngFor(opts.seed, 1000 + arcIdx, cand.attempt);
      labelBodies(cand.sector, rng, usedLabels);
      const d = describe(cand, spec, rng);
      const words = MANEUVER[d.kind];
      const least = Math.min(...words.map((w) => wordUse.get(w) || 0));
      const word = pick(rng, words.filter((w) => (wordUse.get(w) || 0) === least));
      wordUse.set(word, least + 1);
      const name = `${people.pop()} ${word}`;
      const t = (id - FIRST_ID) / 91;
      const sector = {
        id, name, arc: spec.name, brief: d.brief,
        probe: cand.sector.probe,
        ...hintFor(cand, t, rng),
        solution: cand.solution,
        bodies: cand.sector.bodies,
        relays: cand.sector.relays
      };
      sectors.push(sector);
      rows.push({ sector, stats: cand.stats, decoy: cand.decoy });
      id++;
    });
  });

  if (short) {
    process.stderr.write('Some arcs came up short. Loosen their gates or raise --pool.\n');
    if (!opts.dry) process.exit(1);
  }

  const header = [
    '// GENERATED by tools/generate-sectors.js. Do not edit by hand: change the generator and run',
    `// \`npm run generate\` (seed ${opts.seed}). Sectors ${FIRST_ID}-${id - 1} continue the handcrafted eight in sectors.js.`,
    '// How these are made and judged: docs/level-design.md. Per-sector numbers: docs/sectors.md.',
    '(function (root) {',
    "  'use strict';",
    '',
    '  const GENERATED = ['
  ].join('\n');
  const footer = [
    '  ];',
    '',
    "  if (typeof module !== 'undefined' && module.exports) module.exports = GENERATED;",
    '  else root.SECTORS.push(...GENERATED);',
    "})(typeof self !== 'undefined' ? self : this);",
    ''
  ].join('\n');
  const js = `${header}\n${sectors.map(formatSector).join(',\n')}\n${footer}`;

  if (!opts.dry) {
    fs.writeFileSync(path.join(ROOT, 'src', 'sectors-generated.js'), js);
  }
  rows.forEach((r) => {
    const s = r.stats;
    process.stderr.write(
      `${String(r.sector.id).padStart(3, '0')} ${r.sector.name.padEnd(28)} ${r.sector.bodies.length}b${r.decoy >= 0 ? '*' : ' '}${r.sector.relays.length}r ` +
      `win ${s.winPct.toFixed(3).padStart(6)}%  vis ${s.visibleShare.toFixed(2)}  tol ${s.angTol.toFixed(2)}°/${s.spdTol.toFixed(0)}  ` +
      `turn ${String(Math.round(s.turn)).padStart(3)}°  frames ${String(s.frames).padStart(3)}  D ${s.difficulty.toFixed(2)}\n`
    );
  });
  process.stderr.write(`${sectors.length} sectors in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
