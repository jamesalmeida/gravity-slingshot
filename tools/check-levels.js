#!/usr/bin/env node
// Proves every sector can be cleared in one launch, using the game's exact flight rules.
// Sweeps launch azimuth and delta-V, flies each launch to the end, and reports how forgiving
// each sector is plus its most robust solution.
// Usage: node tools/check-levels.js [--sector N] [--fine]
'use strict';

const path = require('path');
const P = require(path.join(__dirname, '..', 'src', 'physics.js'));
const SECTORS = require(path.join(__dirname, '..', 'src', 'sectors.js'));

const args = process.argv.slice(2);
const only = args.includes('--sector') ? Number(args[args.indexOf('--sector') + 1]) : null;
const fine = args.includes('--fine');
const ANGLE_STEP = fine ? 0.25 : 0.5;
const SPEED_STEP = fine ? 3 : 6;

function staticProblems(sector) {
  const problems = [];
  const inside = (o, pad) => o.x - pad >= 0 && o.x + pad <= P.WORLD_W && o.y - pad >= 0 && o.y + pad <= P.WORLD_H;
  if (!inside(sector.probe, 20)) problems.push('launchpad is off the field');
  for (const b of sector.bodies) {
    if (Math.hypot(b.x - sector.probe.x, b.y - sector.probe.y) < b.r + 40) problems.push(`launchpad is inside ${b.label}`);
    if (!inside(b, b.r)) problems.push(`${b.label} is off the field`);
  }
  sector.relays.forEach((r) => {
    if (!inside(r, r.r)) problems.push(`${r.code} is off the field`);
    for (const b of sector.bodies) {
      if (Math.hypot(b.x - r.x, b.y - r.y) < b.r + r.r) problems.push(`${r.code} overlaps ${b.label}`);
    }
  });
  return problems;
}

let failed = false;

SECTORS.forEach((sector, idx) => {
  if (only !== null && only !== idx + 1) return;
  const problems = staticProblems(sector);
  const angles = [];
  for (let a = 0; a < 360; a += ANGLE_STEP) angles.push(a);
  const speeds = [];
  for (let s = P.MIN_SPEED; s <= P.MAX_SPEED; s += SPEED_STEP) speeds.push(s);

  const wins = new Set();
  angles.forEach((a, ai) => {
    const rad = (a * Math.PI) / 180;
    speeds.forEach((s, si) => {
      if (P.fly(sector, Math.cos(rad) * s, Math.sin(rad) * s) === 'complete') wins.add(ai * 10000 + si);
    });
  });

  // Most forgiving solution: the win whose ±2-step neighbourhood also wins most often.
  let best = null;
  for (const key of wins) {
    const ai = Math.floor(key / 10000);
    const si = key % 10000;
    let score = 0;
    for (let da = -2; da <= 2; da++) {
      for (let ds = -2; ds <= 2; ds++) {
        if (wins.has(((ai + da + angles.length) % angles.length) * 10000 + si + ds)) score++;
      }
    }
    if (!best || score > best.score) best = { angle: angles[ai], speed: speeds[si], score };
  }

  const total = angles.length * speeds.length;
  const ok = problems.length === 0 && wins.size > 0;
  if (!ok) failed = true;
  const label = `${String(sector.id).padStart(2, '0')} ${sector.name}`.padEnd(27);
  let line = `${ok ? 'PASS' : 'FAIL'}  ${label} ${String(wins.size).padStart(5)} winning launches (${((wins.size / total) * 100).toFixed(2)}%)`;
  if (best) {
    const az = (best.angle + 360) % 360;
    line += `  best: azimuth ${az.toFixed(1)}°, ${(best.speed * P.SPEED_TO_KMS).toFixed(2)} km/s (${best.score}/25 neighbours win)`;
  }
  console.log(line);
  problems.forEach((p) => console.log(`      - ${p}`));
});

process.exit(failed ? 1 : 0);
