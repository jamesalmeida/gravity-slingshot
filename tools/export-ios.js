#!/usr/bin/env node
// Exports the sectors and a set of reference flights for the Swift app in ios/.
// The sectors are defined once, in src/sectors.js and src/sectors-generated.js. The app reads the
// JSON written here, and its tests replay the reference flights to prove the Swift physics matches
// src/physics.js exactly.
//
//   node tools/export-ios.js           write the files
//   node tools/export-ios.js --check   fail if the files are out of date (CI)
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'src', 'physics.js'));
const SECTORS = require(path.join(ROOT, 'src', 'sectors.js')).concat(require(path.join(ROOT, 'src', 'sectors-generated.js')));
const CORE = path.join(ROOT, 'ios', 'SlingshotCore');
const SECTORS_FILE = path.join(CORE, 'Sources', 'SlingshotCore', 'Resources', 'sectors.json');
const FLIGHTS_FILE = path.join(CORE, 'Tests', 'SlingshotCoreTests', 'Fixtures', 'flights.json');

// Doubles travel as their 64 bits in hex, so nothing is lost to decimal formatting or parsing.
const bits = (value) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
};

// One whole flight under the game's rules (the same loop as Physics.fly), keeping the end state.
function fly(sector, vx, vy) {
  const p = P.launchState(sector, vx, vy);
  const locked = new Array(sector.relays.length).fill(false);
  let lockedCount = 0;
  let frames = 0;
  for (;;) {
    for (let s = 0; s < P.SUBSTEPS; s++) {
      P.stepVerlet(p, sector.bodies);
      if (P.hitsBody(p.x, p.y, sector.bodies)) return { result: 'impact', frames, x: p.x, y: p.y };
      for (let i = 0; i < sector.relays.length; i++) {
        if (!locked[i] && P.touchesRelay(p.x, p.y, sector.relays[i])) {
          locked[i] = true;
          if (++lockedCount === sector.relays.length) return { result: 'complete', frames, x: p.x, y: p.y };
        }
      }
    }
    frames++;
    if (p.x < -P.FLIGHT_MARGIN || p.x > P.WORLD_W + P.FLIGHT_MARGIN ||
        p.y < -P.FLIGHT_MARGIN || p.y > P.WORLD_H + P.FLIGHT_MARGIN ||
        frames > P.MAX_FLIGHT_FRAMES) return { result: 'lost', frames, x: p.x, y: p.y };
  }
}

// The recorded solution plus four fixed-seed launches per sector.
//
// This file must come out identical on every machine, or the staleness check would fail in CI.
// The physics is safe: it uses only + - * / and square root, which every IEEE 754 machine
// computes identically. Sine and cosine are not: their last bit differs between JavaScript
// engines. So launch velocities never come straight from trigonometry. The random ones are
// built from arithmetic alone, and the solution's is snapped to a 1/1024 px/s grid, which
// absorbs a last-bit difference and is far finer than any sector's aiming tolerance.
function referenceFlights() {
  let seed = 20261119;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const snap = (v) => Math.round(v * 1024) / 1024;
  const flights = [];
  for (const sector of SECTORS) {
    const rad = (sector.solution.angle * Math.PI) / 180;
    const launches = [[snap(Math.cos(rad) * sector.solution.speed), snap(Math.sin(rad) * sector.solution.speed)]];
    while (launches.length < 5) {
      const vx = (rand() * 2 - 1) * P.MAX_SPEED;
      const vy = (rand() * 2 - 1) * P.MAX_SPEED;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed >= P.MIN_SPEED && speed <= P.MAX_SPEED) launches.push([vx, vy]);
    }
    for (const [vx, vy] of launches) {
      const f = fly(sector, vx, vy);
      const pred = P.predict(sector, vx, vy);
      flights.push({
        sector: sector.id, vx: bits(vx), vy: bits(vy),
        result: f.result, frames: f.frames, x: bits(f.x), y: bits(f.y),
        predictedPoints: pred.points.length, predictedRelays: pred.relayHits.length, predictedImpact: !!pred.impact
      });
    }
  }
  return flights;
}

const outputs = [
  [SECTORS_FILE, JSON.stringify(SECTORS) + '\n'],
  [FLIGHTS_FILE, JSON.stringify(referenceFlights()) + '\n']
];

if (process.argv.includes('--check')) {
  const stale = outputs.filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text);
  stale.forEach(([file]) => console.log(`STALE  ${path.relative(ROOT, file)}`));
  if (stale.length) {
    console.log('The iOS app would not match the web game. Run `npm run export:ios` and commit the result.');
    process.exit(1);
  }
  console.log(`iOS export is up to date: ${SECTORS.length} sectors, ${JSON.parse(outputs[1][1]).length} reference flights.`);
} else {
  outputs.forEach(([file, text]) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log(`wrote ${path.relative(ROOT, file)}`);
  });
}
