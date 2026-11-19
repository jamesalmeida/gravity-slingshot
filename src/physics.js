// Velocity-Verlet symplectic integrator and trajectory prediction.
// Shared by the game (browser global `Physics`) and the level checker (Node `require`).
(function (root) {
  'use strict';

  const WORLD_W = 1200;
  const WORLD_H = 720;
  const G = 85000;
  const SOFT = 16;
  const FIXED_DT = 1 / 60;
  const SUBSTEPS = 6;
  const SUB_DT = FIXED_DT / SUBSTEPS;
  const MAX_SPEED = 520;
  const MIN_SPEED = 45;
  const DRAG_GAIN = 2.65;
  const SPEED_TO_KMS = 0.032; // maps 520 px/s -> 16.64 km/s
  const PROBE_RADIUS = 5;
  const RELAY_SLOP = 9;       // extra lock radius on top of the relay's own
  const PREDICT_FRAMES = 310;
  const MAX_FLIGHT_FRAMES = 960;
  const PREDICT_MARGIN = 140; // prediction stops this far off-screen
  const FLIGHT_MARGIN = 160;  // live flight is lost this far off-screen

  function computeAccel(x, y, bodies) {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dx = b.x - x;
      const dy = b.y - y;
      const r2 = dx * dx + dy * dy + SOFT;
      const invR = 1 / Math.sqrt(r2);
      const f = G * b.mass * invR * invR * invR;
      ax += dx * f;
      ay += dy * f;
    }
    return [ax, ay];
  }

  function stepVerlet(p, bodies) {
    p.x += p.vx * SUB_DT + 0.5 * p.ax * SUB_DT * SUB_DT;
    p.y += p.vy * SUB_DT + 0.5 * p.ay * SUB_DT * SUB_DT;
    const [ax2, ay2] = computeAccel(p.x, p.y, bodies);
    p.vx += 0.5 * (p.ax + ax2) * SUB_DT;
    p.vy += 0.5 * (p.ay + ay2) * SUB_DT;
    p.ax = ax2;
    p.ay = ay2;
  }

  function hitsBody(x, y, bodies) {
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < (b.r + PROBE_RADIUS) * (b.r + PROBE_RADIUS)) return b;
    }
    return null;
  }

  function touchesRelay(x, y, r) {
    const dx = x - r.x;
    const dy = y - r.y;
    return dx * dx + dy * dy < (r.r + RELAY_SLOP) * (r.r + RELAY_SLOP);
  }

  function launchState(sector, vx, vy) {
    const [ax, ay] = computeAccel(sector.probe.x, sector.probe.y, sector.bodies);
    return { x: sector.probe.x, y: sector.probe.y, vx, vy, ax, ay };
  }

  // The dotted predictor: PREDICT_FRAMES frames ahead, a point every other frame.
  function predict(sector, vx, vy) {
    const bodies = sector.bodies;
    const relays = sector.relays;
    const sim = launchState(sector, vx, vy);

    const points = [{ x: sim.x, y: sim.y }];
    const relayHits = [];
    const hitFlags = new Array(relays.length).fill(false);
    let impact = null;

    // Primary body for the Pe / Ap readout
    const primary = bodies[0];
    let minDist = Infinity;
    let maxDist = 0;

    for (let f = 0; f < PREDICT_FRAMES; f++) {
      for (let s = 0; s < SUBSTEPS; s++) {
        stepVerlet(sim, bodies);

        const pdist = Math.hypot(sim.x - primary.x, sim.y - primary.y);
        if (pdist < minDist) minDist = pdist;
        if (pdist > maxDist) maxDist = pdist;

        const b = hitsBody(sim.x, sim.y, bodies);
        if (b) {
          impact = { x: sim.x, y: sim.y, body: b };
          break;
        }

        for (let i = 0; i < relays.length; i++) {
          if (!hitFlags[i] && touchesRelay(sim.x, sim.y, relays[i])) {
            hitFlags[i] = true;
            relayHits.push({ index: i, x: relays[i].x, y: relays[i].y, frame: f });
          }
        }
      }

      if (f % 2 === 0 || impact) points.push({ x: sim.x, y: sim.y });
      if (impact) break;
      if (sim.x < -PREDICT_MARGIN || sim.x > WORLD_W + PREDICT_MARGIN ||
          sim.y < -PREDICT_MARGIN || sim.y > WORLD_H + PREDICT_MARGIN) break;
    }

    return {
      points,
      impact,
      relayHits,
      allRelaysPredicted: relayHits.length === relays.length,
      periapsis: Math.max(0, minDist - primary.r),
      apoapsis: Math.max(0, maxDist - primary.r)
    };
  }

  // A whole live flight with the game's exact rules, without rendering.
  // Used by the level checker. Returns 'complete' | 'impact' | 'lost'.
  function fly(sector, vx, vy) {
    const bodies = sector.bodies;
    const relays = sector.relays;
    const p = launchState(sector, vx, vy);
    const locked = new Array(relays.length).fill(false);
    let lockedCount = 0;
    let frames = 0;

    for (;;) {
      for (let s = 0; s < SUBSTEPS; s++) {
        stepVerlet(p, bodies);
        if (hitsBody(p.x, p.y, bodies)) return 'impact';
        for (let i = 0; i < relays.length; i++) {
          if (!locked[i] && touchesRelay(p.x, p.y, relays[i])) {
            locked[i] = true;
            if (++lockedCount === relays.length) return 'complete';
          }
        }
      }
      frames++;
      if (p.x < -FLIGHT_MARGIN || p.x > WORLD_W + FLIGHT_MARGIN ||
          p.y < -FLIGHT_MARGIN || p.y > WORLD_H + FLIGHT_MARGIN ||
          frames > MAX_FLIGHT_FRAMES) return 'lost';
    }
  }

  const api = {
    WORLD_W, WORLD_H, G, SOFT, FIXED_DT, SUBSTEPS, SUB_DT, MAX_SPEED, MIN_SPEED, DRAG_GAIN,
    SPEED_TO_KMS, PROBE_RADIUS, RELAY_SLOP, PREDICT_FRAMES, MAX_FLIGHT_FRAMES, FLIGHT_MARGIN,
    computeAccel, stepVerlet, hitsBody, touchesRelay, launchState, predict, fly
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof self !== 'undefined' ? self : this);
