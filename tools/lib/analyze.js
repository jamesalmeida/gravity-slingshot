// Flight analysis shared by the sector generator and the checker.
// Everything here flies launches with the game's own integrator (src/physics.js), so a launch
// that wins here wins in the browser.
'use strict';

const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'src', 'physics.js'));

const DEG = Math.PI / 180;
const ANGLE_STEP = 0.5; // sweep grid, degrees
const SPEED_STEP = 6;   // sweep grid, px/s

// One whole flight under the game's rules (same order of checks as Physics.fly), also measuring
// how far the heading turned. `rec`, if given, collects x, y, cumulative turn (degrees) per frame.
function flight(sector, vx, vy, rec) {
  const bodies = sector.bodies;
  const relays = sector.relays;
  const p = P.launchState(sector, vx, vy);
  const locked = new Array(relays.length).fill(false);
  let lockedCount = 0;
  let frames = 0;
  let turn = 0;
  let heading = Math.atan2(vy, vx);

  for (;;) {
    for (let s = 0; s < P.SUBSTEPS; s++) {
      P.stepVerlet(p, bodies);
      if (P.hitsBody(p.x, p.y, bodies)) return { result: 'impact', frames, turn };
      for (let i = 0; i < relays.length; i++) {
        if (!locked[i] && P.touchesRelay(p.x, p.y, relays[i])) {
          locked[i] = true;
          if (++lockedCount === relays.length) return { result: 'complete', frames, turn };
        }
      }
    }
    frames++;
    const h = Math.atan2(p.vy, p.vx);
    let d = h - heading;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    turn += Math.abs(d) / DEG;
    heading = h;
    if (rec) rec.push(p.x, p.y, turn);
    if (p.x < -P.FLIGHT_MARGIN || p.x > P.WORLD_W + P.FLIGHT_MARGIN ||
        p.y < -P.FLIGHT_MARGIN || p.y > P.WORLD_H + P.FLIGHT_MARGIN ||
        frames > P.MAX_FLIGHT_FRAMES) return { result: 'lost', frames, turn };
  }
}

// Launch by screen azimuth (0 = right, 90 = down) and speed in px/s.
function launch(sector, angle, speed, rec) {
  return flight(sector, Math.cos(angle * DEG) * speed, Math.sin(angle * DEG) * speed, rec);
}

function wins(sector, angle, speed) {
  return speed >= P.MIN_SPEED && speed <= P.MAX_SPEED && launch(sector, angle, speed).result === 'complete';
}

// Every launch on the azimuth x delta-V grid. Reports the share that clear the sector, the
// straightest winning launch, the share of wins the on-screen predictor can confirm, and the
// most forgiving launch (the win whose 5 x 5 neighbourhood wins most often).
function sweep(sector, angleStep = ANGLE_STEP, speedStep = SPEED_STEP) {
  const angles = [];
  for (let a = 0; a < 360; a += angleStep) angles.push(a);
  const speeds = [];
  for (let s = P.MIN_SPEED; s <= P.MAX_SPEED; s += speedStep) speeds.push(s);

  const won = new Set();
  let minTurn = Infinity;
  let visible = 0;
  angles.forEach((a, ai) => {
    const cos = Math.cos(a * DEG);
    const sin = Math.sin(a * DEG);
    speeds.forEach((s, si) => {
      const f = flight(sector, cos * s, sin * s);
      if (f.result !== 'complete') return;
      won.add(ai * 10000 + si);
      if (f.turn < minTurn) minTurn = f.turn;
      if (f.frames < P.PREDICT_FRAMES) visible++;
    });
  });

  let best = null;
  for (const key of won) {
    const ai = Math.floor(key / 10000);
    const si = key % 10000;
    let score = 0;
    for (let da = -2; da <= 2; da++) {
      for (let ds = -2; ds <= 2; ds++) {
        if (won.has(((ai + da + angles.length) % angles.length) * 10000 + si + ds)) score++;
      }
    }
    if (!best || score > best.score) best = { angle: angles[ai], speed: speeds[si], score };
  }

  const total = angles.length * speeds.length;
  return {
    total,
    wins: won.size,
    winPct: (won.size / total) * 100,
    minTurn: won.size ? minTurn : null,
    visibleShare: won.size ? visible / won.size : 0,
    best
  };
}

// How much aiming error a launch forgives: the unbroken run of winning azimuths through it (at
// its speed) and of winning speeds through it (at its azimuth), plus the middle of each run.
function tolerance(sector, angle, speed) {
  if (!wins(sector, angle, speed)) return null;
  const A = 0.125;
  const S = 1.5;
  let aLo = 0;
  let aHi = 0;
  while (aLo > -64 && wins(sector, angle + (aLo - 1) * A, speed)) aLo--;
  while (aHi < 64 && wins(sector, angle + (aHi + 1) * A, speed)) aHi++;
  let sLo = 0;
  let sHi = 0;
  while (sLo > -60 && wins(sector, angle, speed + (sLo - 1) * S)) sLo--;
  while (sHi < 60 && wins(sector, angle, speed + (sHi + 1) * S)) sHi++;
  return {
    angTol: (aHi - aLo) * A,
    spdTol: (sHi - sLo) * S,
    midAngle: angle + ((aLo + aHi) / 2) * A,
    midSpeed: speed + ((sLo + sHi) / 2) * S
  };
}

// Layout faults that make a sector unreadable or unfair regardless of physics.
function staticProblems(sector) {
  const problems = [];
  const inside = (o, pad) => o.x - pad >= 0 && o.x + pad <= P.WORLD_W && o.y - pad >= 0 && o.y + pad <= P.WORLD_H;
  if (!inside(sector.probe, 20)) problems.push('launchpad is off the field');
  if (!(sector.bodies[0].mass > 0)) problems.push('first body must attract (it anchors the Pe / Ap readout)');
  sector.bodies.forEach((b, i) => {
    if (Math.hypot(b.x - sector.probe.x, b.y - sector.probe.y) < b.r + 40) problems.push(`launchpad is inside ${b.label}`);
    if (!inside(b, b.r)) problems.push(`${b.label} is off the field`);
    for (let j = 0; j < i; j++) {
      const o = sector.bodies[j];
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r + 20) problems.push(`${b.label} crowds ${o.label}`);
    }
  });
  sector.relays.forEach((r, i) => {
    if (!inside(r, r.r)) problems.push(`${r.code} is off the field`);
    for (const b of sector.bodies) {
      if (Math.hypot(b.x - r.x, b.y - r.y) < b.r + r.r) problems.push(`${r.code} overlaps ${b.label}`);
    }
    for (let j = 0; j < i; j++) {
      const o = sector.relays[j];
      if (Math.hypot(r.x - o.x, r.y - o.y) < r.r + o.r) problems.push(`${r.code} overlaps ${o.code}`);
    }
  });
  return problems;
}

// One number for ordering sectors: orders of magnitude of launch space you must search, with a
// penalty when the predictor cannot show the winning path to its end.
function difficulty(winPct, visibleShare) {
  return -Math.log10((winPct / 100) * (0.35 + 0.65 * visibleShare));
}

module.exports = { P, DEG, ANGLE_STEP, SPEED_STEP, flight, launch, wins, sweep, tolerance, staticProblems, difficulty };
