#!/usr/bin/env node
// Proves every sector can be cleared in one launch, using the game's exact flight rules.
//
//   node tools/check-levels.js             fast: re-fly each sector's recorded solution (about a second)
//   node tools/check-levels.js --sweep     slow: fly every launch on the azimuth x delta-V grid and
//                                          report how forgiving each sector is (about a minute)
//   --sector N        only sector N
//   --report FILE     with --sweep: also write the results as a Markdown table
'use strict';

const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('./lib/analyze.js');

const P = A.P;
const ROOT = path.join(__dirname, '..');
const HANDCRAFTED = require(path.join(ROOT, 'src', 'sectors.js'));
const GENERATED = require(path.join(ROOT, 'src', 'sectors-generated.js'));
const SECTORS = HANDCRAFTED.concat(GENERATED);

function measure(sector) {
  const sw = A.sweep(sector);
  let tol = null;
  if (sector.solution) tol = A.tolerance(sector, sector.solution.angle, sector.solution.speed);
  const flown = sector.solution ? A.launch(sector, sector.solution.angle, sector.solution.speed) : null;
  return {
    id: sector.id,
    wins: sw.wins,
    winPct: sw.winPct,
    visibleShare: sw.visibleShare,
    minTurn: sw.minTurn,
    best: sw.best,
    angTol: tol ? tol.angTol : 0,
    spdTol: tol ? tol.spdTol : 0,
    turn: flown ? flown.turn : 0,
    frames: flown ? flown.frames : 0
  };
}

if (!isMainThread) {
  parentPort.on('message', (idx) => parentPort.postMessage(measure(SECTORS[idx])));
  return;
}

const args = process.argv.slice(2);
const only = args.includes('--sector') ? Number(args[args.indexOf('--sector') + 1]) : null;
const reportFile = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
const pad3 = (id) => String(id).padStart(3, '0');

// Faults that need no sweep: layout, numbering, and the recorded solution.
function quickProblems(sector, idx) {
  const problems = A.staticProblems(sector);
  if (sector.id !== idx + 1) problems.push(`id is ${sector.id}, expected ${idx + 1}`);
  if (SECTORS.findIndex((o) => o.name === sector.name) !== idx) problems.push(`name "${sector.name}" is used twice`);
  if (!sector.arc) problems.push('no arc');
  if (!sector.solution) {
    problems.push('no recorded solution');
    return problems;
  }
  const { angle, speed } = sector.solution;
  const rad = angle * A.DEG;
  // Physics.fly is what mirrors the browser's flight loop; the analyser must agree with it.
  if (P.fly(sector, Math.cos(rad) * speed, Math.sin(rad) * speed) !== 'complete') {
    problems.push(`recorded solution (azimuth ${angle}°, ${speed} px/s) does not clear the sector`);
  } else if (!A.wins(sector, angle, speed)) {
    problems.push('tools/lib/analyze.js disagrees with src/physics.js about the recorded solution');
  } else if (idx >= HANDCRAFTED.length) {
    // Generated sectors must also forgive a small aiming error (the handcrafted eight predate this rule).
    const nudges = [[0.3, 0], [-0.3, 0], [0, 3], [0, -3]];
    if (!nudges.every(([da, ds]) => A.wins(sector, angle + da, speed + ds))) {
      problems.push('recorded solution is knife-edge: a 0.3° or 3 px/s nudge loses');
    }
    // Every body is either essential (the solution fails without it) or a declared decoy
    // (the route never flies by it, and survives its removal with a small aim correction).
    sector.bodies.forEach((b, i) => {
      const without = { ...sector, bodies: sector.bodies.filter((_, j) => j !== i) };
      if (!b.decoy) {
        if (A.wins(without, angle, speed)) problems.push(`${b.label} does nothing: the solution wins without it`);
        return;
      }
      const clear = A.clearance(sector, angle, speed, b);
      if (clear < 55) problems.push(`decoy ${b.label} is flown by: the route is using it`);
      if (clear > 220) problems.push(`decoy ${b.label} is nowhere near the route`);
      if (!A.nearestWin(without, angle, speed)) problems.push(`decoy ${b.label} is needed: the route does not survive without it`);
      if (!(b.mass >= 105)) problems.push(`decoy ${b.label} is too light to look like part of the route`);
      if (Math.min(...sector.relays.map((r) => Math.hypot(r.x - b.x, r.y - b.y))) > 305) problems.push(`decoy ${b.label} is not near any relay`);
    });
  }
  return problems;
}

async function sweepAll(indices) {
  const results = new Map();
  const queue = indices.slice();
  const jobs = Math.max(1, Math.min(queue.length, os.cpus().length - 1));
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const worker = new Worker(__filename);
    const feed = () => {
      if (!queue.length) { worker.terminate().then(resolve); return; }
      worker.postMessage(queue.shift());
    };
    worker.on('message', (m) => { results.set(m.id, m); feed(); });
    worker.on('error', reject);
    feed();
  })));
  return results;
}

function writeReport(file, rows) {
  const lines = [
    '# Sector table',
    '',
    'Measured by `npm run check:sweep`, which flies every launch on a 0.5° × 6 px/s grid (57,600 launches per sector). Regenerate with `npm run docs:sectors`.',
    '',
    '- **Win %**: share of all launches that clear the sector. Lower is harder.',
    '- **Seen**: share of those wins the on-screen predictor shows to the end (it looks 310 frames ahead).',
    '- **Forgives**: aiming error the recorded solution tolerates, as an unbroken range of azimuth and of launch speed.',
    '- **Turn**: how far the recorded solution\'s heading turns before the last relay.',
    '- **Decoy**: the body that is not part of the route, in sectors that have one (061 onwards). Spoiler.',
    '- **Difficulty**: `-log10(win share × (0.35 + 0.65 × seen))`. One point is ten times harder.',
    ''
  ];
  let arc = null;
  rows.forEach(({ sector, m }) => {
    if (sector.arc !== arc) {
      arc = sector.arc;
      lines.push(`## ${arc}`, '', '| # | Name | Bodies | Decoy | Relays | Win % | Seen | Forgives | Turn | Difficulty |', '|---|---|---|---|---|---|---|---|---|---|');
    }
    lines.push(
      `| ${pad3(sector.id)} | ${sector.name} | ${sector.bodies.length} | ${(sector.bodies.find((b) => b.decoy) || { label: '–' }).label} | ${sector.relays.length} | ${m.winPct.toFixed(2)} | ` +
      `${Math.round(m.visibleShare * 100)}% | ${m.angTol.toFixed(1)}° / ${(m.spdTol * P.SPEED_TO_KMS).toFixed(2)} km/s | ` +
      `${Math.round(m.turn)}° | ${A.difficulty(m.winPct, m.visibleShare).toFixed(2)} |`
    );
    const next = SECTORS[sector.id];
    if (!next || next.arc !== arc) lines.push('');
  });
  fs.writeFileSync(path.resolve(file), lines.join('\n'));
}

async function main() {
  const indices = SECTORS.map((_, i) => i).filter((i) => only === null || only === i + 1);
  let failed = 0;

  const quick = new Map();
  indices.forEach((i) => {
    const problems = quickProblems(SECTORS[i], i);
    quick.set(i, problems);
  });

  if (!args.includes('--sweep')) {
    indices.forEach((i) => {
      const problems = quick.get(i);
      if (!problems.length) return;
      failed++;
      console.log(`FAIL  ${pad3(SECTORS[i].id)} ${SECTORS[i].name}`);
      problems.forEach((p) => console.log(`      - ${p}`));
    });
    console.log(`${indices.length - failed}/${indices.length} sectors pass: layout is sound and the recorded solution clears each one.`);
    process.exit(failed ? 1 : 0);
  }

  const measured = await sweepAll(indices);
  const rows = [];
  indices.forEach((i) => {
    const sector = SECTORS[i];
    const m = measured.get(sector.id);
    const problems = quick.get(i).slice();
    if (!m.wins) problems.push('no launch on the grid clears the sector');
    if (problems.length) failed++;
    let line = `${problems.length ? 'FAIL' : 'PASS'}  ${pad3(sector.id)} ${sector.name.padEnd(28)} ${String(m.wins).padStart(5)} winning launches (${m.winPct.toFixed(2)}%)`;
    if (m.best) {
      line += `  best: azimuth ${m.best.angle.toFixed(1)}°, ${(m.best.speed * P.SPEED_TO_KMS).toFixed(2)} km/s (${m.best.score}/25 neighbours win)`;
    }
    console.log(line);
    problems.forEach((p) => console.log(`      - ${p}`));
    rows.push({ sector, m });
  });
  if (reportFile) writeReport(reportFile, rows);
  console.log(`${indices.length - failed}/${indices.length} sectors pass.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
