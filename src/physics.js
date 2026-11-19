// Gravity Slingshot physics: point-mass gravity with velocity-Verlet integration.
// Shared by the game (browser global `Physics`) and the level checker (Node `require`).
(function (root) {
  'use strict';

  const WORLD = { w: 1200, h: 720 };
  const G = 90000;          // gravitational constant in world units
  const SOFTENING = 20;     // added to r^2 so forces stay finite near a centre
  const DT = 1 / 60;        // one simulation frame
  const SUBSTEPS = 8;       // integration steps per frame
  const H = DT / SUBSTEPS;
  const PROBE_R = 5;
  const BEACON_SLOP = 8;    // extra pickup radius on top of the beacon's own
  const MAX_FRAMES = 1200;  // 20 s of flight before the probe gives up
  const OUT_MARGIN = 180;   // how far off-screen before the probe is lost

  const MIN_SPEED = 40;
  const MAX_SPEED = 420;

  // Repulsors have negative mass, so the same formula pushes instead of pulls.
  function accel(x, y, bodies) {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dx = b.x - x;
      const dy = b.y - y;
      const r2 = dx * dx + dy * dy + SOFTENING;
      const inv = 1 / Math.sqrt(r2);
      const f = G * b.mass * inv * inv * inv;
      ax += dx * f;
      ay += dy * f;
    }
    return [ax, ay];
  }

  function createProbe(x, y, vx, vy, bodies) {
    const [ax, ay] = accel(x, y, bodies);
    return { x, y, vx, vy, ax, ay };
  }

  function step(p, bodies) {
    p.x += p.vx * H + 0.5 * p.ax * H * H;
    p.y += p.vy * H + 0.5 * p.ay * H * H;
    const [ax, ay] = accel(p.x, p.y, bodies);
    p.vx += 0.5 * (p.ax + ax) * H;
    p.vy += 0.5 * (p.ay + ay) * H;
    p.ax = ax;
    p.ay = ay;
  }

  function hitBody(p, bodies) {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const rr = b.r + PROBE_R;
      if (dx * dx + dy * dy < rr * rr) return b;
    }
    return null;
  }

  function touchesBeacon(p, beacon) {
    const dx = p.x - beacon.x;
    const dy = p.y - beacon.y;
    const rr = beacon.r + BEACON_SLOP;
    return dx * dx + dy * dy < rr * rr;
  }

  function outOfBounds(p) {
    return p.x < -OUT_MARGIN || p.x > WORLD.w + OUT_MARGIN ||
      p.y < -OUT_MARGIN || p.y > WORLD.h + OUT_MARGIN;
  }

  // Runs one whole flight. Used for the aim preview (with a frame cap) and the level checker.
  // Returns { points, collected: [beacon indices in pickup order], result, frames }.
  // result is 'clear' | 'crash' | 'lost' | 'timeout' | 'preview'.
  function simulate(level, vx, vy, opts) {
    const maxFrames = (opts && opts.maxFrames) || MAX_FRAMES;
    const recordEvery = (opts && opts.recordEvery) || 0;
    const bodies = level.bodies;
    const p = createProbe(level.start.x, level.start.y, vx, vy, bodies);
    const got = new Array(level.beacons.length).fill(false);
    const collected = [];
    const points = recordEvery ? [{ x: p.x, y: p.y }] : null;
    let result = maxFrames < MAX_FRAMES ? 'preview' : 'timeout';
    let crashedInto = null;
    let frame = 0;

    outer:
    for (; frame < maxFrames; frame++) {
      for (let s = 0; s < SUBSTEPS; s++) {
        step(p, bodies);
        const b = hitBody(p, bodies);
        if (b) { result = 'crash'; crashedInto = b; break outer; }
        for (let i = 0; i < got.length; i++) {
          if (!got[i] && touchesBeacon(p, level.beacons[i])) {
            got[i] = true;
            collected.push(i);
            if (collected.length === got.length) { result = 'clear'; break outer; }
          }
        }
      }
      if (points && frame % recordEvery === 0) points.push({ x: p.x, y: p.y });
      if (outOfBounds(p)) { result = 'lost'; break; }
    }
    if (points) points.push({ x: p.x, y: p.y });
    return { points, collected, result, crashedInto, frames: frame, end: { x: p.x, y: p.y } };
  }

  const api = {
    WORLD, G, SOFTENING, DT, SUBSTEPS, PROBE_R, BEACON_SLOP, MAX_FRAMES, MIN_SPEED, MAX_SPEED,
    accel, createProbe, step, hitBody, touchesBeacon, outOfBounds, simulate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof self !== 'undefined' ? self : this);
