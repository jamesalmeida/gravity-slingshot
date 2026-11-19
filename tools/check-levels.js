#!/usr/bin/env node
// Proves every level can be cleared in one launch, and reports how forgiving it is.
// Sweeps launch angle and speed, simulates each full flight, and checks the stored hint.
// Usage: node tools/check-levels.js [--level N] [--fine]
'use strict';

const path = require('path');
const Physics = require(path.join(__dirname, '..', 'src', 'physics.js'));
const LEVELS = require(path.join(__dirname, '..', 'src', 'levels.js'));

const args = process.argv.slice(2);
const only = args.includes('--level') ? Number(args[args.indexOf('--level') + 1]) : null;
const fine = args.includes('--fine');
const ANGLE_STEP = fine ? 0.25 : 0.5;
const SPEED_STEP = fine ? 3 : 6;

function launchVec(angleDeg, speed) {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a) * speed, Math.sin(a) * speed];
}

function staticProblems(level) {
  const problems = [];
  const { w, h } = Physics.WORLD;
  const inside = (o, pad) => o.x - pad >= 0 && o.x + pad <= w && o.y - pad >= 0 && o.y + pad <= h;
  if (!inside(level.start, 20)) problems.push('start is off the field');
  for (const b of level.bodies) {
    const d = Math.hypot(b.x - level.start.x, b.y - level.start.y);
    if (d < b.r + 60) problems.push(`start is too close to ${b.label}`);
    if (!inside(b, b.r)) problems.push(`${b.label} is off the field`);
  }
  level.beacons.forEach((c, i) => {
    if (!inside(c, c.r)) problems.push(`beacon ${i + 1} is off the field`);
    for (const b of level.bodies) {
      if (Math.hypot(b.x - c.x, b.y - c.y) < b.r + c.r + 12) problems.push(`beacon ${i + 1} overlaps ${b.label}`);
    }
  });
  return problems;
}

let failed = false;

LEVELS.forEach((level, idx) => {
  if (only !== null && only !== idx + 1) return;
  const problems = staticProblems(level);
  let total = 0;
  let wins = 0;
  const winSet = new Set();
  const angles = [];
  for (let a = 0; a < 360; a += ANGLE_STEP) angles.push(a);
  const speeds = [];
  for (let s = Physics.MIN_SPEED; s <= Physics.MAX_SPEED; s += SPEED_STEP) speeds.push(s);

  angles.forEach((a, ai) => {
    speeds.forEach((s, si) => {
      total++;
      const [vx, vy] = launchVec(a, s);
      if (Physics.simulate(level, vx, vy).result === 'clear') {
        wins++;
        winSet.add(ai * 10000 + si);
      }
    });
  });

  // The most forgiving shot: the win whose neighbours (±2 steps each way) also win most often.
  let best = null;
  for (const key of winSet) {
    const ai = Math.floor(key / 10000);
    const si = key % 10000;
    let score = 0;
    for (let da = -2; da <= 2; da++) {
      for (let ds = -2; ds <= 2; ds++) {
        const na = (ai + da + angles.length) % angles.length;
        if (winSet.has(na * 10000 + si + ds)) score++;
      }
    }
    if (!best || score > best.score) best = { angle: angles[ai], speed: speeds[si], score };
  }

  let hintOk = null;
  if (level.hint) {
    const [vx, vy] = launchVec(level.hint.angle, level.hint.speed);
    hintOk = Physics.simulate(level, vx, vy).result === 'clear';
  }

  const pct = ((wins / total) * 100).toFixed(2);
  const ok = problems.length === 0 && wins > 0 && hintOk !== false;
  if (!ok) failed = true;
  const label = `${String(idx + 1).padStart(2, '0')} ${level.name}`.padEnd(24);
  let line = `${ok ? 'PASS' : 'FAIL'}  ${label} ${String(wins).padStart(5)} winning shots (${pct}%)`;
  if (best) line += `  best: angle ${best.angle}°, speed ${best.speed} (${best.score}/25 neighbours win)`;
  if (hintOk === false) line += '  HINT DOES NOT CLEAR';
  if (!level.hint) line += '  (no hint stored)';
  console.log(line);
  problems.forEach((p) => console.log(`      - ${p}`));
});

process.exit(failed ? 1 : 0);
