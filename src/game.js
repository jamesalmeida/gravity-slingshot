// Gravity Slingshot: aiming, flight, rendering, HUD and progress.
(function () {
  'use strict';

  const P = window.Physics;
  const LEVELS = window.LEVELS;
  const Sound = window.Sound;
  const W = P.WORLD.w;
  const H = P.WORLD.h;

  const DRAG_GAIN = 2.4;          // screen px of pull -> launch speed (full power is ~175 px of pull)
  const GRAB_RADIUS = 90;         // pointer-downs this close to the probe anchor on the probe
  const PREVIEW_FRAMES = 150;     // default aim preview: 2.5 s of flight
  const TRAIL_LEN = 160;
  const HINT_AFTER = 3;           // launches before the hint unlocks
  const STORE_KEY = 'gravity-slingshot:v1';

  const COLORS = {
    ink: '#0a0c18',
    paper: '#ecebf5',
    mint: '#7ee0c3',
    amber: '#f2a65a',
    coral: '#ff6b6b',
    violet: '#b48cff',
    grid: 'rgba(140, 150, 220, 0.16)'
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  const ui = {
    topbar: document.querySelector('.topbar'),
    bottombar: document.querySelector('.bottombar'),
    levelButton: $('level-button'),
    levelNumber: $('level-number'),
    levelName: $('level-name'),
    launches: $('ro-launches'),
    speed: $('ro-speed'),
    heading: $('ro-heading'),
    beacons: $('ro-beacons'),
    status: $('status'),
    brief: $('brief'),
    reset: $('btn-reset'),
    grid: $('btn-grid'),
    hint: $('btn-hint'),
    sound: $('btn-sound'),
    launch: $('btn-launch'),
    menu: $('level-menu'),
    menuGrid: $('level-grid'),
    closeMenu: $('btn-close-menu'),
    win: $('win-card'),
    winKicker: $('win-kicker'),
    winTitle: $('win-title'),
    winStars: $('win-stars'),
    winLaunches: $('win-launches'),
    winSpeed: $('win-speed'),
    winPeak: $('win-peak'),
    replay: $('btn-replay'),
    next: $('btn-next')
  };

  // ---------------------------------------------------------------------------
  // Progress (best stars per level). Storage can be unavailable; the game still works.
  // ---------------------------------------------------------------------------
  const progress = (() => {
    let data = { stars: {} };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) data = Object.assign(data, JSON.parse(raw));
    } catch (e) { /* private mode or blocked storage */ }
    return {
      stars: (i) => data.stars[i] || 0,
      record(i, n) {
        if (n <= (data.stars[i] || 0)) return;
        data.stars[i] = n;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      },
      unlocked(i) {
        if (i === 0) return true;
        return (data.stars[i] || 0) > 0 || (data.stars[i - 1] || 0) > 0;
      },
      firstUncleared() {
        for (let i = 0; i < LEVELS.length; i++) if (!data.stars[i]) return i;
        return 0;
      }
    };
  })();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  // On tall screens the field is turned a quarter-turn anticlockwise so it fills the
  // screen: the launch side (world left) sits at the bottom and you fire upward.
  const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0, rotated: false };

  const state = {
    index: 0,
    level: null,
    phase: 'aim',            // aim | flight | wreck | done
    launches: 0,
    hintUsed: false,
    showHint: false,
    showGrid: true,
    aim: null,               // { vx, vy }
    preview: null,           // simulate() result for the current aim
    ghost: null,             // full path of the previous flight
    drag: null,              // { id, ox, oy, px, py }
    probe: null,
    trail: [],
    collected: [],
    flightPoints: [],
    launchSpeed: 0,
    peakSpeed: 0,
    frames: 0,
    acc: 0,
    time: 0,
    wreckTimer: 0,
    fx: { rings: [], sparks: [], labels: [] },
    gridLines: [],
    stars: []
  };

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------
  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    const narrow = view.w < 720;
    // Fit the field between the real header and footer, whatever they wrapped to.
    const top = ui.topbar.getBoundingClientRect().bottom + 4;
    const bottom = view.h - ui.bottombar.getBoundingClientRect().top + 4;
    const side = narrow ? 8 : 20;
    const availW = Math.max(200, view.w - side * 2);
    const availH = Math.max(160, view.h - top - bottom);
    const flat = Math.min(availW / W, availH / H);
    const turned = Math.min(availW / H, availH / W);
    view.rotated = turned > flat * 1.15;
    view.scale = view.rotated ? turned : flat;
    const fieldW = (view.rotated ? H : W) * view.scale;
    const fieldH = (view.rotated ? W : H) * view.scale;
    view.ox = (view.w - fieldW) / 2;
    view.oy = top + (availH - fieldH) / 2;
    makeStars();
  }

  // Pull is measured in world units; scale the gain so a pull feels the same on any screen size.
  function dragGain() {
    return DRAG_GAIN * Math.min(1, view.scale);
  }

  function toWorld(clientX, clientY) {
    const sx = (clientX - view.ox) / view.scale;
    const sy = (clientY - view.oy) / view.scale;
    return view.rotated ? { x: W - sy, y: sx } : { x: sx, y: sy };
  }

  function worldTransform() {
    const k = view.dpr * view.scale;
    if (view.rotated) {
      ctx.setTransform(0, -k, k, 0, view.dpr * view.ox, view.dpr * view.oy + k * W);
    } else {
      ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
    }
  }

  // World-space offset that points down the screen by d, whichever way the field is turned.
  function screenDown(d) {
    return view.rotated ? [-d, 0] : [0, d];
  }

  // World-space line width that stays at least `px` screen pixels wide when zoomed out.
  function thin(px) {
    return px / Math.min(1, view.scale);
  }

  // World-space font size that renders at least `px` screen pixels tall.
  function textPx(px) {
    return Math.round(px / Math.min(1, view.scale));
  }

  // Text drawn in world space, kept upright on screen.
  function uprightText(text, x, y) {
    ctx.save();
    ctx.translate(x, y);
    if (view.rotated) ctx.rotate(Math.PI / 2);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function makeStars() {
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = Math.round((view.w * view.h) / 5200);
    state.stars = [];
    for (let i = 0; i < n; i++) {
      state.stars.push({
        x: rnd() * view.w,
        y: rnd() * view.h,
        r: rnd() < 0.1 ? 1.4 : 0.5 + rnd() * 0.6,
        a: 0.25 + rnd() * 0.6,
        tw: rnd() * Math.PI * 2
      });
    }
  }

  // Spacetime grid: straight lines bent toward attractors and away from repulsors.
  function buildGrid(level) {
    const STEP = 40;
    const SAMPLE = 8;
    const warp = (x, y) => {
      let dx = 0;
      let dy = 0;
      for (const b of level.bodies) {
        const ex = b.x - x;
        const ey = b.y - y;
        const d = Math.hypot(ex, ey) || 1;
        const k = b.mass > 0 ? 34 : 70;
        let m = (k * b.mass * d) / (d * d + 3600);
        if (b.mass > 0) m = Math.min(m, Math.max(0, d - b.r * 0.35));
        dx += (ex / d) * m;
        dy += (ey / d) * m;
      }
      // Pin the grid to the field's border so the frame stays a clean rectangle.
      const edge = Math.min(1, Math.min(x, W - x, y, H - y) / 90);
      return [x + dx * edge, y + dy * edge];
    };
    const lines = [];
    for (let gx = 0; gx <= W; gx += STEP) {
      const line = [];
      for (let y = 0; y <= H; y += SAMPLE) line.push(warp(gx, y));
      lines.push(line);
    }
    for (let gy = 0; gy <= H; gy += STEP) {
      const line = [];
      for (let x = 0; x <= W; x += SAMPLE) line.push(warp(x, gy));
      lines.push(line);
    }
    state.gridLines = lines;
  }

  // ---------------------------------------------------------------------------
  // Level flow
  // ---------------------------------------------------------------------------
  function loadLevel(i) {
    state.index = (i + LEVELS.length) % LEVELS.length;
    state.level = LEVELS[state.index];
    state.launches = 0;
    state.hintUsed = false;
    state.showHint = false;
    state.aim = null;
    state.preview = null;
    state.ghost = null;
    state.drag = null;
    state.fx = { rings: [], sparks: [], labels: [] };
    buildGrid(state.level);
    toPad();
    hideCard(ui.win);
    ui.levelNumber.textContent = String(state.index + 1);
    ui.levelName.textContent = state.level.name;
    ui.brief.textContent = state.level.brief;
    document.title = `${state.level.name} · Gravity Slingshot`;
    flash(`Level ${state.index + 1}: ${state.level.name}`);
    updateHud();
  }

  function toPad() {
    const L = state.level;
    state.phase = 'aim';
    state.probe = P.createProbe(L.start.x, L.start.y, 0, 0, L.bodies);
    state.collected = new Array(L.beacons.length).fill(false);
    state.trail = [];
    state.flightPoints = [];
    state.frames = 0;
    state.acc = 0;
    state.peakSpeed = 0;
    if (state.aim) refreshPreview();
    updateHud();
  }

  function setAim(vx, vy) {
    const s = Math.hypot(vx, vy);
    if (s > P.MAX_SPEED) {
      vx = (vx / s) * P.MAX_SPEED;
      vy = (vy / s) * P.MAX_SPEED;
    }
    state.aim = { vx, vy };
    refreshPreview();
    updateHud();
  }

  function refreshPreview() {
    if (!state.aim) { state.preview = null; return; }
    const frames = state.level.preview || PREVIEW_FRAMES;
    state.preview = P.simulate(state.level, state.aim.vx, state.aim.vy, { maxFrames: frames, recordEvery: 2 });
  }

  function aimSpeed() {
    return state.aim ? Math.hypot(state.aim.vx, state.aim.vy) : 0;
  }

  function launch() {
    if (state.phase !== 'aim' || !state.aim) return;
    const speed = aimSpeed();
    if (speed < P.MIN_SPEED) {
      flash('Pull back further for more speed', 'bad');
      return;
    }
    toPad();
    const L = state.level;
    state.probe = P.createProbe(L.start.x, L.start.y, state.aim.vx, state.aim.vy, L.bodies);
    state.phase = 'flight';
    state.launches++;
    state.launchSpeed = speed;
    state.peakSpeed = speed;
    state.flightPoints = [{ x: L.start.x, y: L.start.y }];
    ring(L.start.x, L.start.y, COLORS.mint, 10, 50, 0.5);
    Sound.launch(speed / P.MAX_SPEED);
    if (state.launches >= HINT_AFTER && L.hint) ui.hint.disabled = false;
    updateHud();
  }

  function abort() {
    if (state.phase !== 'flight' && state.phase !== 'wreck') return;
    keepGhost();
    toPad();
  }

  function keepGhost() {
    if (state.flightPoints.length > 1) state.ghost = state.flightPoints.slice();
  }

  function endFlight(kind, detail) {
    keepGhost();
    state.phase = 'wreck';
    state.wreckTimer = kind === 'crash' ? 1.0 : 0.6;
    const p = state.probe;
    if (kind === 'crash') {
      ring(p.x, p.y, COLORS.coral, 6, 60, 0.7);
      sparks(p.x, p.y, COLORS.coral, 24);
      flash(`Crashed into ${detail}`, 'bad');
      Sound.crash();
    } else {
      flash(kind === 'lost' ? 'Lost in deep space' : 'Out of fuel for the cameras: flight timed out', 'bad');
      Sound.lost();
    }
    updateHud();
  }

  function starsFor(launches) {
    if (state.hintUsed) return 1;
    if (launches <= 1) return 3;
    if (launches <= 3) return 2;
    return 1;
  }

  function win() {
    state.phase = 'done';
    keepGhost();
    const n = starsFor(state.launches);
    progress.record(state.index, n);
    Sound.win();
    const last = state.index === LEVELS.length - 1;
    ui.winKicker.textContent = last ? 'Final level cleared' : 'Level cleared';
    ui.winTitle.textContent = state.level.name;
    ui.winStars.innerHTML = '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;
    ui.winStars.setAttribute('aria-label', `${n} of 3 stars`);
    ui.winLaunches.textContent = String(state.launches);
    ui.winSpeed.textContent = Math.round(state.launchSpeed);
    ui.winPeak.textContent = Math.round(state.peakSpeed);
    ui.next.textContent = last ? 'Back to level 1' : 'Next level';
    setTimeout(() => { if (state.phase === 'done') showCard(ui.win, ui.next); }, 650);
    updateHud();
  }

  // ---------------------------------------------------------------------------
  // Simulation tick
  // ---------------------------------------------------------------------------
  function tickFlight() {
    const L = state.level;
    const p = state.probe;
    for (let s = 0; s < P.SUBSTEPS; s++) {
      P.step(p, L.bodies);
      const hit = P.hitBody(p, L.bodies);
      if (hit) { endFlight('crash', hit.label); return; }
      for (let i = 0; i < L.beacons.length; i++) {
        if (!state.collected[i] && P.touchesBeacon(p, L.beacons[i])) {
          state.collected[i] = true;
          const got = state.collected.filter(Boolean).length;
          const b = L.beacons[i];
          ring(b.x, b.y, COLORS.mint, b.r, b.r * 4, 0.8);
          sparks(b.x, b.y, COLORS.mint, 18);
          const [ux, uy] = screenDown(-(b.r + 12));
          label(b.x + ux, b.y + uy, `${got}/${L.beacons.length}`, COLORS.mint);
          Sound.beacon(got - 1);
          if (got === L.beacons.length) { win(); return; }
        }
      }
    }
    state.frames++;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > state.peakSpeed) state.peakSpeed = speed;
    state.trail.push({ x: p.x, y: p.y, s: speed });
    if (state.trail.length > TRAIL_LEN) state.trail.shift();
    if (state.frames % 2 === 0) state.flightPoints.push({ x: p.x, y: p.y });
    if (P.outOfBounds(p)) { endFlight('lost'); return; }
    if (state.frames >= P.MAX_FRAMES) { endFlight('timeout'); return; }
  }

  function update(dt) {
    state.time += dt;
    const fx = state.fx;
    fx.rings = fx.rings.filter((r) => (r.t += dt) < r.life);
    fx.sparks = fx.sparks.filter((s) => {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.95;
      s.vy *= 0.95;
      return s.t < s.life;
    });
    fx.labels = fx.labels.filter((l) => {
      l.t += dt;
      const [dx, dy] = screenDown(-18 * dt);
      l.x += dx;
      l.y += dy;
      return l.t < l.life;
    });

    if (state.phase === 'flight') {
      state.acc += dt;
      let guard = 0;
      while (state.acc >= P.DT && state.phase === 'flight' && guard++ < 5) {
        tickFlight();
        state.acc -= P.DT;
      }
      if (guard >= 5) state.acc = 0;
      updateHud();
    } else if (state.phase === 'wreck') {
      state.wreckTimer -= dt;
      if (state.wreckTimer <= 0) toPad();
    }
  }

  // ---------------------------------------------------------------------------
  // FX helpers
  // ---------------------------------------------------------------------------
  function ring(x, y, color, r0, r1, life) {
    state.fx.rings.push({ x, y, color, r0, r1, life, t: 0 });
  }
  function sparks(x, y, color, n) {
    if (reducedMotion.matches) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 160;
      state.fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0, life: 0.5 + Math.random() * 0.4 });
    }
  }
  function label(x, y, text, color) {
    state.fx.labels.push({ x, y, text, color, t: 0, life: 1.1 });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function draw() {
    const { dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    drawStars();

    worldTransform();
    drawFrame();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 16);
    ctx.clip();
    if (state.showGrid) drawGrid();
    drawGhost();
    if (state.phase === 'aim') drawPreview();
    drawBeacons();
    state.level.bodies.forEach(drawBody);
    drawPad();
    if (state.phase === 'aim') {
      drawHint();
      drawAim();
    }
    drawTrail();
    if (state.phase === 'flight') drawProbe();
    drawFx();
    ctx.restore();
  }

  function drawStars() {
    const still = reducedMotion.matches;
    for (const s of state.stars) {
      const a = still ? s.a : s.a * (0.75 + 0.25 * Math.sin(state.time * 1.3 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawFrame() {
    ctx.strokeStyle = 'rgba(236, 235, 245, 0.08)';
    ctx.lineWidth = 1.5 / view.scale;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 16);
    ctx.stroke();
  }

  function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1 / view.scale;
    ctx.beginPath();
    for (const line of state.gridLines) {
      ctx.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
    }
    ctx.stroke();
  }

  function drawPath(points, color, width, dash, fade) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.setLineDash(dash || []);
    if (!fade) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    } else {
      // Fade out along the path in chunks.
      const chunks = 12;
      const per = Math.ceil(points.length / chunks);
      for (let c = 0; c < chunks; c++) {
        const a = c * per;
        const b = Math.min(points.length - 1, a + per);
        if (b <= a) break;
        ctx.globalAlpha = 1 - c / chunks;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[a].x, points[a].y);
        for (let i = a + 1; i <= b; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGhost() {
    drawPath(state.ghost, 'rgba(242, 166, 90, 0.28)', thin(1.5), [3, 6]);
  }

  function drawPreview() {
    const pr = state.preview;
    if (!pr) return;
    drawPath(pr.points, COLORS.mint, thin(2), [2, 7], true);
    if (pr.result === 'crash') {
      const e = pr.end;
      ctx.strokeStyle = COLORS.coral;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x - 6, e.y - 6); ctx.lineTo(e.x + 6, e.y + 6);
      ctx.moveTo(e.x + 6, e.y - 6); ctx.lineTo(e.x - 6, e.y + 6);
      ctx.stroke();
    }
  }

  function drawBeacons() {
    const L = state.level;
    const t = reducedMotion.matches ? 0 : state.time;
    const preHit = new Set(state.phase === 'aim' && state.preview ? state.preview.collected : []);
    L.beacons.forEach((b, i) => {
      const got = state.collected[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      // soft glow
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r * 2.4);
      g.addColorStop(0, got ? 'rgba(126, 224, 195, 0.35)' : 'rgba(126, 224, 195, 0.14)');
      g.addColorStop(1, 'rgba(126, 224, 195, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      // pickup zone
      ctx.strokeStyle = 'rgba(126, 224, 195, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, b.r + P.BEACON_SLOP, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // diamond
      ctx.rotate(Math.PI / 4 + t * 0.6);
      const s = b.r * 0.62 * (got ? 1 : 1 + 0.06 * Math.sin(t * 3 + i));
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.mint;
      ctx.fillStyle = got ? COLORS.mint : 'rgba(10, 12, 24, 0.7)';
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (preHit.has(i) && !got) {
        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  function drawBody(b) {
    const t = reducedMotion.matches ? 0 : state.time;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.kind === 'star') {
      const halo = ctx.createRadialGradient(0, 0, b.r * 0.6, 0, 0, b.r * 2.6);
      halo.addColorStop(0, 'rgba(255, 210, 140, 0.45)');
      halo.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 2.6, 0, Math.PI * 2); ctx.fill();
      const core = ctx.createRadialGradient(-b.r * 0.2, -b.r * 0.2, 0, 0, 0, b.r);
      core.addColorStop(0, '#fff6df');
      core.addColorStop(0.6, '#ffd28c');
      core.addColorStop(1, '#f29b4a');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    } else if (b.kind === 'hole') {
      ctx.rotate(t * 0.8);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 0 ? 'rgba(242, 166, 90, 0.9)' : `rgba(180, 140, 255, ${0.5 - k * 0.15})`;
        ctx.lineWidth = 3 - k;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r * (1.7 + k * 0.5), b.r * (0.55 + k * 0.18), 0.3, 0, Math.PI * 1.6);
        ctx.stroke();
      }
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(242, 166, 90, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (b.kind === 'repulsor') {
      const period = 1.6;
      for (let k = 0; k < 3; k++) {
        const ph = ((t / period + k / 3) % 1);
        ctx.strokeStyle = `rgba(255, 120, 220, ${0.45 * (1 - ph)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, b.r * (1 + ph * 1.8), 0, Math.PI * 2); ctx.stroke();
      }
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
      core.addColorStop(0, '#ffd1f3');
      core.addColorStop(0.5, '#e05cc4');
      core.addColorStop(1, '#6a2a8a');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    } else {
      const gas = b.kind === 'gas';
      if (gas && b.ring) {
        ctx.save();
        ctx.rotate(b.ring);
        ctx.strokeStyle = 'rgba(236, 210, 170, 0.35)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(0, 0, b.r * 1.75, b.r * 0.42, 0, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      const body = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, b.r * 0.1, 0, 0, b.r);
      if (gas) {
        body.addColorStop(0, '#f6d7a7');
        body.addColorStop(1, '#a8603a');
      } else {
        body.addColorStop(0, '#9fd8e0');
        body.addColorStop(1, '#2c4f6b');
      }
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      if (gas) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(120, 60, 30, 0.22)';
        for (let k = -2; k <= 2; k++) ctx.fillRect(-b.r, k * b.r * 0.36 - b.r * 0.07, b.r * 2, b.r * 0.14);
        ctx.restore();
        if (b.ring) {
          ctx.save();
          ctx.rotate(b.ring);
          ctx.strokeStyle = 'rgba(236, 210, 170, 0.5)';
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.ellipse(0, 0, b.r * 1.75, b.r * 0.42, 0, 0, Math.PI); ctx.stroke();
          ctx.restore();
        }
      }
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(236, 235, 245, 0.45)';
    ctx.font = `600 ${textPx(11)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    const below = b.kind === 'hole' ? b.r + 22 : b.r + 16;
    const [lx, ly] = screenDown(below);
    uprightText(b.label, b.x + lx, b.y + ly);
  }

  function drawPad() {
    const s = state.level.start;
    ctx.strokeStyle = 'rgba(126, 224, 195, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (state.phase !== 'flight') {
      ctx.fillStyle = COLORS.paper;
      ctx.beginPath(); ctx.arc(s.x, s.y, P.PROBE_R, 0, Math.PI * 2); ctx.fill();
    }
  }

  function arrow(x, y, vx, vy, color, width, dashed) {
    const len = Math.hypot(vx, vy) * 0.22;
    if (len < 2) return;
    const a = Math.atan2(vy, vx);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 8, ey + Math.sin(a) * 8);
    ctx.lineTo(ex + Math.cos(a + 2.5) * 8, ey + Math.sin(a + 2.5) * 8);
    ctx.lineTo(ex + Math.cos(a - 2.5) * 8, ey + Math.sin(a - 2.5) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAim() {
    const s = state.level.start;
    const d = state.drag;
    if (d) {
      // the slingshot band
      ctx.strokeStyle = 'rgba(242, 166, 90, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.ox, d.oy); ctx.lineTo(d.px, d.py); ctx.stroke();
      ctx.fillStyle = COLORS.amber;
      ctx.beginPath(); ctx.arc(d.px, d.py, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (!state.aim) return;
    arrow(s.x, s.y, state.aim.vx, state.aim.vy, COLORS.amber, thin(2.5), false);
    // power arc around the pad
    const frac = aimSpeed() / P.MAX_SPEED;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 24, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  function drawHint() {
    const h = state.level.hint;
    if (!state.showHint || !h) return;
    const a = (h.angle * Math.PI) / 180;
    const s = state.level.start;
    arrow(s.x, s.y, Math.cos(a) * h.speed, Math.sin(a) * h.speed, 'rgba(180, 140, 255, 0.85)', 2, true);
  }

  function drawTrail() {
    const tr = state.trail;
    if (tr.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const k = i / tr.length;
      const hot = Math.min(1, tr[i].s / P.MAX_SPEED);
      ctx.strokeStyle = `rgba(${Math.round(126 + 116 * hot)}, ${Math.round(224 - 58 * hot)}, ${Math.round(195 - 105 * hot)}, ${k * 0.9})`;
      ctx.lineWidth = 0.5 + k * 3;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
      ctx.lineTo(tr[i].x, tr[i].y);
      ctx.stroke();
    }
  }

  function drawProbe() {
    const p = state.probe;
    const a = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    ctx.fillStyle = COLORS.paper;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFx() {
    for (const r of state.fx.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
    }
    for (const s of state.fx.sparks) {
      ctx.globalAlpha = 1 - s.t / s.life;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.font = `700 ${textPx(13)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const l of state.fx.labels) {
      ctx.globalAlpha = 1 - l.t / l.life;
      ctx.fillStyle = l.color;
      uprightText(l.text, l.x, l.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  let flashTimer = 0;
  function flash(text, tone) {
    ui.status.textContent = text;
    ui.status.className = `status show${tone ? ' ' + tone : ''}`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => ui.status.classList.remove('show'), 2600);
  }

  function updateHud() {
    const L = state.level;
    ui.launches.textContent = String(state.launches);
    let vx = 0;
    let vy = 0;
    if (state.phase === 'flight') { vx = state.probe.vx; vy = state.probe.vy; }
    else if (state.aim) { vx = state.aim.vx; vy = state.aim.vy; }
    ui.speed.textContent = String(Math.round(Math.hypot(vx, vy)));
    const heading = (((Math.atan2(-vy, vx) * 180) / Math.PI) + 360) % 360;
    ui.heading.textContent = `${heading.toFixed(1)}°`;
    ui.beacons.textContent = `${state.collected.filter(Boolean).length}/${L.beacons.length}`;
    const flying = state.phase === 'flight' || state.phase === 'wreck';
    ui.launch.textContent = flying ? 'Abort' : 'Launch';
    ui.launch.classList.toggle('abort', flying);
    ui.launch.disabled = state.phase === 'done' || (!flying && !state.aim);
    if (state.launches < HINT_AFTER || !L.hint) ui.hint.disabled = true;
  }

  function buildMenu() {
    ui.menuGrid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-tile' + (i === state.index ? ' current' : '');
      const n = progress.stars(i);
      btn.disabled = !progress.unlocked(i);
      btn.innerHTML = `<small>Level ${i + 1}</small>${L.name}<br><span class="tile-stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
      btn.setAttribute('aria-label', `Level ${i + 1}, ${L.name}, ${n} of 3 stars${btn.disabled ? ', locked' : ''}`);
      btn.addEventListener('click', () => {
        hideCard(ui.menu);
        loadLevel(i);
      });
      li.appendChild(btn);
      ui.menuGrid.appendChild(li);
    });
  }

  let lastFocus = null;
  function showCard(el, focusEl) {
    lastFocus = document.activeElement;
    el.hidden = false;
    (focusEl || el.querySelector('button')).focus();
  }
  function hideCard(el) {
    if (el.hidden) return;
    el.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (state.phase === 'done') return;
    if (state.phase === 'flight' || state.phase === 'wreck') abort();
    const w = toWorld(e.clientX, e.clientY);
    const s = state.level.start;
    const near = Math.hypot(w.x - s.x, w.y - s.y) < GRAB_RADIUS;
    // Anchoring away from the probe means a finger never covers it.
    state.drag = { id: e.pointerId, ox: near ? s.x : w.x, oy: near ? s.y : w.y, px: w.x, py: w.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    if (near) setAim((s.x - w.x) * dragGain(), (s.y - w.y) * dragGain());
  });

  canvas.addEventListener('pointermove', (e) => {
    const d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    const w = toWorld(e.clientX, e.clientY);
    d.px = w.x;
    d.py = w.y;
    d.moved = true;
    setAim((d.ox - w.x) * dragGain(), (d.oy - w.y) * dragGain());
  });

  function endDrag(e) {
    const d = state.drag;
    if (!d || e.pointerId !== d.id) return;
    state.drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.type === 'pointercancel') return;
    if (aimSpeed() >= P.MIN_SPEED) launch();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function nudge(dAngleDeg, dSpeed) {
    if (state.phase === 'done') return;
    if (state.phase !== 'aim') abort();
    let speed = aimSpeed();
    let angle = state.aim ? Math.atan2(state.aim.vy, state.aim.vx) : 0;
    if (!state.aim) speed = 200;
    angle -= (dAngleDeg * Math.PI) / 180; // screen y points down, so subtract for counter-clockwise
    speed = Math.max(P.MIN_SPEED, Math.min(P.MAX_SPEED, speed + dSpeed));
    setAim(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  function toggleGrid() {
    state.showGrid = !state.showGrid;
    ui.grid.setAttribute('aria-pressed', String(state.showGrid));
  }
  function toggleSound() {
    Sound.setEnabled(!Sound.enabled);
    ui.sound.setAttribute('aria-pressed', String(Sound.enabled));
    ui.sound.textContent = Sound.enabled ? 'Sound on' : 'Sound off';
    Sound.tick();
  }
  function useHint() {
    if (ui.hint.disabled) return;
    state.showHint = !state.showHint;
    if (state.showHint) {
      state.hintUsed = true;
      flash('Hint shown: match the violet arrow (caps this level at one star)');
    }
  }
  function launchOrAbort() {
    if (state.phase === 'flight' || state.phase === 'wreck') abort();
    else launch();
  }
  function nextLevel() {
    hideCard(ui.win);
    loadLevel(state.index + 1);
  }

  ui.reset.addEventListener('click', () => loadLevel(state.index));
  ui.grid.addEventListener('click', toggleGrid);
  ui.sound.addEventListener('click', toggleSound);
  ui.hint.addEventListener('click', useHint);
  ui.launch.addEventListener('click', launchOrAbort);
  ui.replay.addEventListener('click', () => loadLevel(state.index));
  ui.next.addEventListener('click', nextLevel);
  ui.levelButton.addEventListener('click', () => { buildMenu(); showCard(ui.menu, ui.menuGrid.querySelector('.current')); });
  ui.closeMenu.addEventListener('click', () => hideCard(ui.menu));
  ui.menu.addEventListener('click', (e) => { if (e.target === ui.menu) hideCard(ui.menu); });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!ui.menu.hidden || !ui.win.hidden) {
      if (e.key === 'Escape') { hideCard(ui.menu); hideCard(ui.win); }
      if (!ui.win.hidden && (e.key === 'n' || e.key === 'N')) nextLevel();
      return;
    }
    const big = e.shiftKey;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': nudge(big ? 2 : 0.25, 0); break;
      case 'ArrowRight': nudge(big ? -2 : -0.25, 0); break;
      case 'ArrowUp': nudge(0, big ? 15 : 2); break;
      case 'ArrowDown': nudge(0, big ? -15 : -2); break;
      case ' ':
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') { handled = false; break; }
        launchOrAbort();
        break;
      case 'r': case 'R': loadLevel(state.index); break;
      case 'g': case 'G': toggleGrid(); break;
      case 'h': case 'H': useHint(); break;
      case 'm': case 'M': toggleSound(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  window.addEventListener('resize', resize);
  // The header and footer change height as the brief and buttons wrap; refit the field when they do.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(ui.topbar);
    ro.observe(ui.bottombar);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  // `#debug` exposes internals for automated browser tests.
  if (/debug/.test(location.hash)) window.__gs = { view, state, toWorld };
  const fromHash = Number((location.hash.match(/level=(\d+)/) || [])[1]);
  loadLevel(fromHash >= 1 && fromHash <= LEVELS.length ? fromHash - 1 : progress.firstUncleared());
  requestAnimationFrame(frame);
})();
