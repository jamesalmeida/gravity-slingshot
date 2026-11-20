// One Shot: state, input, HUD, flight loop and Canvas 2D rendering.
// Physics lives in physics.js, sector data in sectors.js and sectors-generated.js, sound in audio.js.
(() => {
  'use strict';

  const {
    WORLD_W, WORLD_H, FIXED_DT, SUBSTEPS, MAX_SPEED, MIN_SPEED, DRAG_GAIN, SPEED_TO_KMS,
    PROBE_RADIUS, MAX_FLIGHT_FRAMES, computeAccel, stepVerlet
  } = window.Physics;
  const SECTORS = window.SECTORS;
  const SoundEngine = window.SoundEngine;

  const PALETTE = {
    obsidian: '#070B14',
    navy: '#0E1729',
    white: '#F7FAFC',
    cyan: '#38BDF8',
    gold: '#F59E0B',
    indigo: '#6366F1',
    rose: '#F43F5E',
    emerald: '#10B981',
    fuchsia: '#E879F9' // repulsors: the only bodies that push
  };

  const STORAGE_KEY = 'voyager-slingshot.progress.v1';
  const ID_WIDTH = String(SECTORS.length).length;
  const fmtId = (id) => String(id).padStart(Math.max(2, ID_WIDTH), '0');

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });

  // =========================================================================
  // STATE & DOM REFERENCES
  // =========================================================================
  const canvas = document.getElementById('space-canvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    sectorCode: document.getElementById('sector-code'),
    sectorName: document.getElementById('sector-name'),
    sectorNav: document.getElementById('sector-nav'),
    btnSectorPrev: document.getElementById('btn-sector-prev'),
    btnSectorNext: document.getElementById('btn-sector-next'),
    btnSectorMap: document.getElementById('btn-sector-map'),
    sectorProgress: document.getElementById('sector-progress'),
    sectorMap: document.getElementById('sector-map'),
    sectorMapGroups: document.getElementById('sector-map-groups'),
    sectorMapReadout: document.getElementById('sector-map-readout'),
    btnSectorMapClose: document.getElementById('btn-sector-map-close'),
    launches: document.getElementById('tele-launches'),
    dv: document.getElementById('tele-dv'),
    azm: document.getElementById('tele-azm'),
    peap: document.getElementById('tele-peap'),
    relays: document.getElementById('tele-relays'),
    statusPill: document.getElementById('status-pill'),
    modal: document.getElementById('mission-modal'),
    modalKicker: document.getElementById('modal-kicker'),
    modalTitle: document.getElementById('modal-title'),
    modalLaunches: document.getElementById('modal-launches'),
    modalDv: document.getElementById('modal-dv'),
    modalPeak: document.getElementById('modal-peak'),
    btnReplay: document.getElementById('btn-replay'),
    btnNextSector: document.getElementById('btn-next-sector'),
    btnReset: document.getElementById('btn-reset'),
    btnWells: document.getElementById('btn-wells'),
    btnAudio: document.getElementById('btn-audio'),
    audioLabel: document.getElementById('audio-label'),
    audioWave: document.getElementById('audio-wave'),
    audioSlash: document.getElementById('audio-slash'),
    btnLaunch: document.getElementById('btn-launch'),
    btnLaunchLabel: document.getElementById('btn-launch-label')
  };

  const state = {
    sectorIndex: 0,
    completed: new Set(),
    launches: 0,
    showWells: true,
    phase: 'aim', // 'aim' | 'flight' | 'complete' | 'failed'
    hasInteracted: false,

    // Viewport mapping
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    scale: 1,
    offsetX: 0,
    offsetY: 0,

    // Pointer & Aiming
    pointerId: null,
    isDragging: false,
    dragOriginWorld: { x: 0, y: 0 },
    pointerWorld: { x: 0, y: 0 },
    pointerScreenNorm: { x: 0, y: 0 },
    aimVx: 0,
    aimVy: 0,
    hasAimVector: false,
    lastLaunchVec: null,
    ghostPath: null,

    // Prediction cache
    predicted: null,

    // Live Probe
    probe: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      speed: 0,
      launchSpeed: 0,
      peakSpeed: 0,
      frames: 0,
      trail: []
    },

    // Relays in current sector
    relays: [],

    // Visual FX (capped)
    rings: [],
    particles: [],
    callouts: [],
    stars: [],
    time: 0,
    statusTimer: 0
  };

  // =========================================================================
  // STARFIELD GENERATION (MULTI-LAYER PARALLAX)
  // =========================================================================
  function initStars() {
    state.stars = [];
    const count = 210;
    let seed = 133791;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    const tints = ['#F7FAFC', '#E0F2FE', '#FEF3C7', '#C7D2FE', '#BAE6FD'];
    for (let i = 0; i < count; i++) {
      const layer = i < 120 ? 0 : i < 180 ? 1 : 2;
      state.stars.push({
        u: rand(),
        v: rand(),
        r: layer === 0 ? 0.65 + rand() * 0.55 : layer === 1 ? 1.0 + rand() * 0.7 : 1.45 + rand() * 0.9,
        alpha: layer === 0 ? 0.22 + rand() * 0.3 : layer === 1 ? 0.35 + rand() * 0.35 : 0.55 + rand() * 0.4,
        depth: layer === 0 ? 5 : layer === 1 ? 12 : 22,
        phase: rand() * Math.PI * 2,
        twinkle: 0.6 + rand() * 1.4,
        color: tints[Math.floor(rand() * tints.length)]
      });
    }
  }

  // =========================================================================
  // COORDINATE TRANSFORMS
  // =========================================================================
  function updateViewport() {
    state.viewW = window.innerWidth;
    state.viewH = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(state.viewW * state.dpr);
    canvas.height = Math.floor(state.viewH * state.dpr);
    canvas.style.width = state.viewW + 'px';
    canvas.style.height = state.viewH + 'px';

    // Safe padding for top/bottom HUD bars
    const topPad = state.viewW < 640 ? 114 : 74;
    const botPad = state.viewW < 640 ? 74 : 62;
    const sidePad = state.viewW < 640 ? 10 : 24;

    const availW = Math.max(240, state.viewW - sidePad * 2);
    const availH = Math.max(200, state.viewH - topPad - botPad);

    state.scale = Math.min(availW / WORLD_W, availH / WORLD_H);
    state.offsetX = (state.viewW - WORLD_W * state.scale) * 0.5;
    state.offsetY = topPad + (availH - WORLD_H * state.scale) * 0.5;
  }

  function worldToScreen(wx, wy) {
    return {
      x: state.offsetX + wx * state.scale,
      y: state.offsetY + wy * state.scale
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.offsetX) / state.scale,
      y: (sy - state.offsetY) / state.scale
    };
  }

  // The live dotted predictor shares its integrator with the flight loop (see physics.js).
  function computePrediction(vx, vy) {
    return window.Physics.predict(SECTORS[state.sectorIndex], vx, vy);
  }

  // =========================================================================
  // SECTOR LOADING & MISSION FLOW
  // =========================================================================
  // Progress survives reloads. Storage can be missing or blocked, so every access is guarded.
  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return null;
      (saved.cleared || []).forEach((id) => {
        if (id >= 1 && id <= SECTORS.length) state.completed.add(id - 1);
      });
      return saved;
    } catch (err) {
      return null;
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cleared: [...state.completed].map((idx) => idx + 1).sort((x, y) => x - y),
        last: state.sectorIndex + 1
      }));
    } catch (err) {
      // Progress just won't persist.
    }
  }

  // The sector map: every sector as a cell, grouped by arc.
  function buildSectorNav() {
    ui.sectorMapGroups.innerHTML = '';
    let group = null;
    let arcName = null;
    SECTORS.forEach((sec, idx) => {
      if (sec.arc !== arcName) {
        arcName = sec.arc;
        const last = SECTORS.filter((o) => o.arc === arcName).length + idx;
        const section = document.createElement('div');
        section.className = 'sector-map-arc';
        const heading = document.createElement('div');
        heading.className = 'sector-map-arc-title';
        heading.innerHTML = `<span></span><span class="sector-map-arc-range">${fmtId(sec.id)}–${fmtId(last)}</span>`;
        heading.firstChild.textContent = arcName || 'SECTORS';
        group = document.createElement('div');
        group.className = 'sector-map-grid';
        section.appendChild(heading);
        section.appendChild(group);
        ui.sectorMapGroups.appendChild(section);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sector-btn';
      btn.textContent = fmtId(sec.id);
      btn.setAttribute('aria-label', `Sector ${sec.id}: ${sec.name}`);
      const describe = () => {
        ui.sectorMapReadout.textContent = `${fmtId(sec.id)} // ${sec.name}${state.completed.has(idx) ? ' // CLEARED' : ''}`;
      };
      btn.addEventListener('pointerenter', describe);
      btn.addEventListener('focus', describe);
      btn.addEventListener('click', () => {
        SoundEngine.playClick(560);
        closeSectorMap();
        loadSector(idx);
      });
      group.appendChild(btn);
    });
  }

  function updateSectorNavUI() {
    const buttons = ui.sectorMapGroups.querySelectorAll('.sector-btn');
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === state.sectorIndex);
      btn.classList.toggle('completed', state.completed.has(idx));
    });
    ui.sectorProgress.textContent = `${fmtId(state.completed.size)}/${SECTORS.length} CLEARED`;
  }

  function isSectorMapOpen() {
    return ui.sectorMap.classList.contains('open');
  }

  function openSectorMap() {
    const sec = SECTORS[state.sectorIndex];
    ui.sectorMap.classList.add('open');
    ui.btnSectorMap.setAttribute('aria-expanded', 'true');
    ui.sectorMapReadout.textContent = `${fmtId(sec.id)} // ${sec.name}`;
    const current = ui.sectorMapGroups.querySelectorAll('.sector-btn')[state.sectorIndex];
    if (current) {
      current.focus();
      current.scrollIntoView({ block: 'center' });
    }
  }

  function closeSectorMap() {
    if (!isSectorMapOpen()) return;
    ui.sectorMap.classList.remove('open');
    ui.btnSectorMap.setAttribute('aria-expanded', 'false');
    ui.btnSectorMap.blur();
    if (document.activeElement && ui.sectorMap.contains(document.activeElement)) document.activeElement.blur();
  }

  function setStatus(text, tone = 'info', duration = 3.2) {
    ui.statusPill.textContent = text;
    ui.statusPill.className = 'status-pill visible ' + tone;
    state.statusTimer = duration;
  }

  function loadSector(index, keepLaunches = false) {
    state.sectorIndex = (index + SECTORS.length) % SECTORS.length;
    const sector = SECTORS[state.sectorIndex];

    if (!keepLaunches) {
      state.launches = 0;
      state.lastLaunchVec = null;
      state.ghostPath = null;
    }

    state.phase = 'aim';
    state.isDragging = false;
    state.pointerId = null;
    state.hasAimVector = false;
    state.aimVx = 0;
    state.aimVy = 0;
    state.predicted = null;
    state.rings = [];
    state.particles = [];
    state.callouts = [];

    state.relays = sector.relays.map((r) => ({
      ...r,
      locked: false,
      lockTime: 0
    }));

    resetProbeToPad();

    ui.sectorCode.textContent = `SECTOR ${fmtId(sector.id)}/${fmtId(SECTORS.length)}`;
    ui.sectorName.textContent = sector.name;
    ui.modal.classList.remove('open');

    updateSectorNavUI();
    updateHUD();
    setStatus(sector.brief, 'info', 4.0);

    // Keep the address shareable and remember where the player left off.
    const hash = `#sector=${sector.id}${/debug/.test(location.hash) ? '&debug' : ''}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    saveProgress();
  }

  function resetProbeToPad() {
    const sector = SECTORS[state.sectorIndex];
    const [ax, ay] = computeAccel(sector.probe.x, sector.probe.y, sector.bodies);
    state.probe = {
      x: sector.probe.x,
      y: sector.probe.y,
      vx: 0,
      vy: 0,
      ax,
      ay,
      speed: 0,
      launchSpeed: 0,
      peakSpeed: 0,
      frames: 0,
      trail: [],
      path: []
    };
    state.relays.forEach((r) => {
      r.locked = false;
      r.lockTime = 0;
    });
    state.phase = 'aim';
    updateLaunchButton();
  }

  function launchProbe(vx, vy) {
    const speed = Math.hypot(vx, vy);
    if (speed < MIN_SPEED) {
      setStatus('DELTA-V BELOW MINIMUM INSERTION THRESHOLD', 'warn', 2.2);
      return;
    }
    const sector = SECTORS[state.sectorIndex];
    resetProbeToPad();

    state.launches++;
    state.phase = 'flight';
    state.lastLaunchVec = { vx, vy };
    state.aimVx = vx;
    state.aimVy = vy;
    state.hasAimVector = true;

    // Store ghost trajectory for iterative refinement
    const pred = computePrediction(vx, vy);
    state.ghostPath = pred.points;
    state.predicted = pred;

    state.probe.vx = vx;
    state.probe.vy = vy;
    state.probe.speed = speed;
    state.probe.launchSpeed = speed;
    state.probe.peakSpeed = speed;
    state.probe.trail = [{ x: sector.probe.x, y: sector.probe.y, speed }];
    state.probe.path = [{ x: sector.probe.x, y: sector.probe.y }];

    spawnRing(sector.probe.x, sector.probe.y, PALETTE.cyan, 14, 58, 0.55);
    SoundEngine.playLaunch(speed / MAX_SPEED);
    setStatus('PROBE LAUNCHED // BALLISTIC TELEMETRY ACTIVE', 'info', 2.4);
    updateHUD();
    updateLaunchButton();
  }

  // The ghost track starts as the predicted path. Once a flight ends it becomes the path the
  // probe really flew, which can run far past the predictor's range.
  function keepFlownPath() {
    const flown = state.probe.path;
    if (flown && state.ghostPath && flown.length > state.ghostPath.length) {
      state.ghostPath = flown.concat([{ x: state.probe.x, y: state.probe.y }]);
    }
  }

  function abortFlight() {
    if (state.phase === 'flight' || state.phase === 'failed') {
      SoundEngine.playClick(300, 0.05);
      keepFlownPath();
      resetProbeToPad();
      if (state.lastLaunchVec) {
        state.aimVx = state.lastLaunchVec.vx;
        state.aimVy = state.lastLaunchVec.vy;
        state.hasAimVector = true;
        state.predicted = computePrediction(state.aimVx, state.aimVy);
      }
      setStatus('FLIGHT ABORTED // RETURNED TO LAUNCHPAD', 'info', 2.0);
      updateHUD();
    }
  }

  function updateLaunchButton() {
    if (state.phase === 'flight') {
      ui.btnLaunch.classList.add('abort-mode');
      ui.btnLaunchLabel.textContent = 'ABORT';
    } else {
      ui.btnLaunch.classList.remove('abort-mode');
      ui.btnLaunchLabel.textContent = 'LAUNCH';
    }
  }

  function updateHUD() {
    ui.launches.textContent = String(state.launches).padStart(2, '0');

    const lockedCount = state.relays.filter((r) => r.locked).length;
    ui.relays.textContent = `${lockedCount}/${state.relays.length}`;

    if (state.phase === 'flight') {
      const kms = state.probe.speed * SPEED_TO_KMS;
      const deg = ((Math.atan2(state.probe.vy, state.probe.vx) * 180) / Math.PI + 360) % 360;
      ui.dv.textContent = `${kms.toFixed(2)} km/s`;
      ui.azm.textContent = `${deg.toFixed(1).padStart(5, '0')}°`;
    } else if (state.hasAimVector) {
      const spd = Math.hypot(state.aimVx, state.aimVy);
      const kms = spd * SPEED_TO_KMS;
      const deg = ((Math.atan2(state.aimVy, state.aimVx) * 180) / Math.PI + 360) % 360;
      ui.dv.textContent = `${kms.toFixed(2)} km/s`;
      ui.azm.textContent = `${deg.toFixed(1).padStart(5, '0')}°`;
    } else {
      ui.dv.textContent = '00.00 km/s';
      ui.azm.textContent = '000.0°';
    }

    if (state.predicted) {
      const pe = (state.predicted.periapsis * 0.42).toFixed(0);
      const ap = (state.predicted.apoapsis * 0.42).toFixed(0);
      ui.peap.textContent = `${pe} / ${ap} Mm`;
      ui.peap.className = state.predicted.impact ? 'tele-value rose' : 'tele-value gold';
    } else {
      ui.peap.textContent = '-- / --';
      ui.peap.className = 'tele-value gold';
    }
  }

  // =========================================================================
  // VISUAL FX HELPERS (CAPPED PARTICLE COUNTS FOR 60FPS)
  // =========================================================================
  function spawnRing(x, y, color, startR, endR, duration = 0.85) {
    if (state.rings.length > 24) state.rings.shift();
    state.rings.push({ x, y, color, startR, endR, age: 0, duration });
  }

  function spawnBurst(x, y, color, count = 18) {
    const cap = prefersReducedMotion ? Math.min(6, count) : count;
    for (let i = 0; i < cap; i++) {
      if (state.particles.length >= 160) state.particles.shift();
      const ang = (Math.PI * 2 * i) / cap + (Math.random() - 0.5) * 0.35;
      const spd = 45 + Math.random() * 145;
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: 1.6 + Math.random() * 2.1,
        age: 0,
        life: 0.45 + Math.random() * 0.45
      });
    }
  }

  function spawnCallout(x, y, text, color) {
    if (state.callouts.length > 10) state.callouts.shift();
    state.callouts.push({ x, y, text, color, age: 0, life: 1.5 });
  }

  // =========================================================================
  // POINTER & KEYBOARD INTERACTION
  // =========================================================================
  function setAimFromPullback(dx, dy) {
    let vx = dx * DRAG_GAIN;
    let vy = dy * DRAG_GAIN;
    const mag = Math.hypot(vx, vy);
    if (mag > MAX_SPEED) {
      vx = (vx / mag) * MAX_SPEED;
      vy = (vy / mag) * MAX_SPEED;
    }
    state.aimVx = vx;
    state.aimVy = vy;
    state.hasAimVector = mag >= MIN_SPEED * 0.5;
    state.predicted = state.hasAimVector ? computePrediction(vx, vy) : null;
    updateHUD();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (state.phase === 'complete') return;

    state.hasInteracted = true;

    // If probe is in flight or failed, tapping canvas aborts back to launchpad and starts aiming
    if (state.phase === 'flight' || state.phase === 'failed') {
      resetProbeToPad();
    }

    const wpt = screenToWorld(e.clientX, e.clientY);
    const sector = SECTORS[state.sectorIndex];
    const distToProbe = Math.hypot(wpt.x - sector.probe.x, wpt.y - sector.probe.y);

    state.isDragging = true;
    state.pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);

    // If clicking near probe, anchor at probe center; otherwise anchor at pointer down so touch never occludes probe
    if (distToProbe < 110) {
      state.dragOriginWorld = { x: sector.probe.x, y: sector.probe.y };
      state.pointerWorld = wpt;
      setAimFromPullback(state.dragOriginWorld.x - wpt.x, state.dragOriginWorld.y - wpt.y);
    } else {
      state.dragOriginWorld = { x: wpt.x, y: wpt.y };
      state.pointerWorld = wpt;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    state.pointerScreenNorm.x = (e.clientX / state.viewW - 0.5) * 2;
    state.pointerScreenNorm.y = (e.clientY / state.viewH - 0.5) * 2;

    if (!state.isDragging || e.pointerId !== state.pointerId) return;
    const wpt = screenToWorld(e.clientX, e.clientY);
    state.pointerWorld = wpt;
    const dx = state.dragOriginWorld.x - wpt.x;
    const dy = state.dragOriginWorld.y - wpt.y;
    setAimFromPullback(dx, dy);
  });

  function endDrag(e) {
    if (!state.isDragging || e.pointerId !== state.pointerId) return;
    state.isDragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    state.pointerId = null;

    const speed = Math.hypot(state.aimVx, state.aimVy);
    if (speed >= MIN_SPEED) {
      launchProbe(state.aimVx, state.aimVy);
    } else {
      state.hasAimVector = false;
      state.predicted = null;
      updateHUD();
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // HUD Button Listeners
  ui.btnReset.addEventListener('click', () => {
    SoundEngine.playClick(380);
    loadSector(state.sectorIndex, false);
  });

  ui.btnWells.addEventListener('click', () => {
    state.showWells = !state.showWells;
    ui.btnWells.classList.toggle('active-toggle', state.showWells);
    ui.btnWells.setAttribute('aria-pressed', String(state.showWells));
    SoundEngine.playClick(state.showWells ? 620 : 420);
  });

  ui.btnAudio.addEventListener('click', () => {
    const next = !SoundEngine.isEnabled();
    SoundEngine.setEnabled(next);
    ui.btnAudio.classList.toggle('active-toggle', next);
    ui.btnAudio.setAttribute('aria-pressed', String(next));
    ui.audioLabel.textContent = next ? 'AUDIO ON' : 'AUDIO OFF';
    ui.audioWave.setAttribute('opacity', next ? '1' : '0.25');
    ui.audioSlash.setAttribute('opacity', next ? '0' : '1');
  });

  ui.btnLaunch.addEventListener('click', () => {
    if (state.phase === 'flight') {
      abortFlight();
    } else if (state.hasAimVector && Math.hypot(state.aimVx, state.aimVy) >= MIN_SPEED) {
      launchProbe(state.aimVx, state.aimVy);
    } else if (state.lastLaunchVec) {
      launchProbe(state.lastLaunchVec.vx, state.lastLaunchVec.vy);
    } else {
      // Initialize a helpful starting aim vector along the sector's nominal heading if clicked before dragging
      const sec = SECTORS[state.sectorIndex];
      const rad = (sec.hintAngle * Math.PI) / 180;
      state.aimVx = Math.cos(rad) * sec.hintSpeed * 0.85;
      state.aimVy = Math.sin(rad) * sec.hintSpeed * 0.85;
      state.hasAimVector = true;
      state.predicted = computePrediction(state.aimVx, state.aimVy);
      updateHUD();
      setStatus('VECTOR LOADED // DRAG TO REFINE OR PRESS LAUNCH AGAIN', 'info', 2.8);
    }
  });

  ui.btnSectorPrev.addEventListener('click', () => {
    SoundEngine.playClick(520);
    loadSector(state.sectorIndex - 1, false);
  });
  ui.btnSectorNext.addEventListener('click', () => {
    SoundEngine.playClick(520);
    loadSector(state.sectorIndex + 1, false);
  });
  ui.btnSectorMap.addEventListener('click', () => {
    SoundEngine.playClick(520);
    if (isSectorMapOpen()) closeSectorMap(); else openSectorMap();
  });
  ui.btnSectorMapClose.addEventListener('click', () => {
    SoundEngine.playClick(420);
    closeSectorMap();
  });
  ui.sectorMap.addEventListener('pointerdown', (e) => {
    if (e.target === ui.sectorMap) closeSectorMap(); // click on the dimmed backdrop
  });

  ui.btnReplay.addEventListener('click', () => {
    SoundEngine.playClick(480);
    loadSector(state.sectorIndex, false);
  });

  ui.btnNextSector.addEventListener('click', () => {
    SoundEngine.playClick(640);
    loadSector(state.sectorIndex + 1, false);
  });

  // Keyboard precision controls
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape' && isSectorMapOpen()) {
      closeSectorMap();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      SoundEngine.playClick(520);
      if (isSectorMapOpen()) closeSectorMap(); else openSectorMap();
      return;
    }
    if (isSectorMapOpen()) return; // the map's own buttons take the keys while it is open
    if (e.key === '[' || e.key === ']') {
      SoundEngine.playClick(520);
      loadSector(state.sectorIndex + (e.key === ']' ? 1 : -1), false);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      SoundEngine.playClick(380);
      loadSector(state.sectorIndex, false);
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      ui.btnWells.click();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      if (state.phase === 'complete') {
        e.preventDefault();
        ui.btnNextSector.click();
        return;
      }
      if (document.activeElement === document.body || document.activeElement === canvas) {
        e.preventDefault();
        ui.btnLaunch.click();
      }
      return;
    }

    // Arrow fine-tuning for orbital vector
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      state.hasInteracted = true;
      if (state.phase === 'flight' || state.phase === 'failed') {
        resetProbeToPad();
      }
      if (!state.hasAimVector) {
        const sec = SECTORS[state.sectorIndex];
        const rad = (sec.hintAngle * Math.PI) / 180;
        state.aimVx = Math.cos(rad) * 240;
        state.aimVy = Math.sin(rad) * 240;
        state.hasAimVector = true;
      }
      let spd = Math.hypot(state.aimVx, state.aimVy);
      let ang = Math.atan2(state.aimVy, state.aimVx);
      const stepAng = (e.shiftKey ? 2.5 : 0.6) * (Math.PI / 180);
      const stepSpd = e.shiftKey ? 18 : 5;

      if (e.key === 'ArrowLeft') ang -= stepAng;
      if (e.key === 'ArrowRight') ang += stepAng;
      if (e.key === 'ArrowUp') spd = Math.min(MAX_SPEED, spd + stepSpd);
      if (e.key === 'ArrowDown') spd = Math.max(MIN_SPEED, spd - stepSpd);

      state.aimVx = Math.cos(ang) * spd;
      state.aimVy = Math.sin(ang) * spd;
      state.predicted = computePrediction(state.aimVx, state.aimVy);
      updateHUD();
    }
  });

  // =========================================================================
  // SIMULATION UPDATE LOOP (60FPS FIXED TIMESTEP)
  // =========================================================================
  function updateSimulation(dt) {
    state.time += dt;

    if (state.statusTimer > 0) {
      state.statusTimer -= dt;
      if (state.statusTimer <= 0) {
        ui.statusPill.classList.remove('visible');
      }
    }

    // Update visual rings
    for (let i = state.rings.length - 1; i >= 0; i--) {
      const r = state.rings[i];
      r.age += dt;
      if (r.age >= r.duration) state.rings.splice(i, 1);
    }

    // Update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.age >= p.life) state.particles.splice(i, 1);
    }

    // Update floating callouts
    for (let i = state.callouts.length - 1; i >= 0; i--) {
      const c = state.callouts[i];
      c.age += dt;
      c.y -= 16 * dt;
      if (c.age >= c.life) state.callouts.splice(i, 1);
    }

    if (state.phase !== 'flight') return;

    const sector = SECTORS[state.sectorIndex];
    const bodies = sector.bodies;
    const probe = state.probe;

    for (let s = 0; s < SUBSTEPS; s++) {
      stepVerlet(probe, bodies);

      // Check body collisions
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const dx = probe.x - b.x;
        const dy = probe.y - b.y;
        if (dx * dx + dy * dy < (b.r + PROBE_RADIUS) * (b.r + PROBE_RADIUS)) {
          state.phase = 'failed';
          keepFlownPath();
          spawnRing(probe.x, probe.y, PALETTE.rose, 8, 68, 0.75);
          spawnBurst(probe.x, probe.y, PALETTE.rose, 26);
          spawnCallout(probe.x, probe.y - 16, 'HULL IMPACT', PALETTE.rose);
          SoundEngine.playImpact();
          setStatus(`SIGNAL LOST // IMPACT WITH ${b.label}`, 'warn', 4.0);
          updateLaunchButton();
          return;
        }
      }

      // Check relay locks
      for (let i = 0; i < state.relays.length; i++) {
        const r = state.relays[i];
        if (!r.locked) {
          const dx = probe.x - r.x;
          const dy = probe.y - r.y;
          if (dx * dx + dy * dy < (r.r + 9) * (r.r + 9)) {
            r.locked = true;
            r.lockTime = state.time;
            const lockedNow = state.relays.filter((k) => k.locked).length;
            spawnRing(r.x, r.y, PALETTE.emerald, r.r * 0.6, r.r * 4.4, 0.9);
            spawnRing(r.x, r.y, PALETTE.white, r.r * 0.4, r.r * 2.5, 0.55);
            spawnBurst(r.x, r.y, PALETTE.emerald, 24);
            spawnCallout(r.x, r.y - r.r - 10, 'RELAY LOCKED', PALETTE.emerald);
            SoundEngine.playRelayLock(lockedNow - 1);
            setStatus(`RELAY LOCKED (${lockedNow}/${state.relays.length}) // SIGNAL CONFIRMED`, 'lock', 2.4);

            if (lockedNow === state.relays.length) {
              completeSector();
              return;
            }
          }
        }
      }
    }

    probe.frames++;
    probe.speed = Math.hypot(probe.vx, probe.vy);
    if (probe.speed > probe.peakSpeed) probe.peakSpeed = probe.speed;

    // Tapered plasma trail
    probe.trail.push({ x: probe.x, y: probe.y, speed: probe.speed });
    if (probe.trail.length > 92) probe.trail.shift();
    if (probe.frames % 2 === 0) probe.path.push({ x: probe.x, y: probe.y });

    // Oberth slingshot sparks when moving fast near a well
    if (!prefersReducedMotion && probe.speed > probe.launchSpeed * 1.25 && probe.frames % 3 === 0) {
      if (state.particles.length < 150) {
        state.particles.push({
          x: probe.x,
          y: probe.y,
          vx: -probe.vx * 0.12 + (Math.random() - 0.5) * 28,
          vy: -probe.vy * 0.12 + (Math.random() - 0.5) * 28,
          color: PALETTE.cyan,
          size: 1.5,
          age: 0,
          life: 0.35
        });
      }
    }

    // Deep space drift bounds
    if (
      probe.x < -160 ||
      probe.x > WORLD_W + 160 ||
      probe.y < -160 ||
      probe.y > WORLD_H + 160 ||
      probe.frames > MAX_FLIGHT_FRAMES
    ) {
      state.phase = 'failed';
      keepFlownPath();
      setStatus('SIGNAL LOST // PROBE DRIFTED BEYOND RELAY RANGE', 'warn', 3.5);
      updateLaunchButton();
      return;
    }

    updateHUD();
  }

  function completeSector() {
    state.phase = 'complete';
    state.completed.add(state.sectorIndex);
    saveProgress();
    updateSectorNavUI();
    updateHUD();
    updateLaunchButton();
    SoundEngine.playSectorComplete();

    const sec = SECTORS[state.sectorIndex];
    const isFinal = state.sectorIndex === SECTORS.length - 1;
    const allCleared = state.completed.size === SECTORS.length;

    ui.modalKicker.textContent = allCleared
      ? 'DEEP SPACE NETWORK ONLINE // ALL SECTORS LOCKED'
      : 'RELAY LOCKED // ORBITAL INSERTION CONFIRMED';
    ui.modalTitle.textContent = isFinal && allCleared
      ? 'GRAND TOUR COMPLETE'
      : `SECTOR ${fmtId(sec.id)} CLEARED`;
    ui.modalLaunches.textContent = String(state.launches).padStart(2, '0');
    ui.modalDv.textContent = `${(state.probe.launchSpeed * SPEED_TO_KMS).toFixed(2)} km/s`;
    ui.modalPeak.textContent = `${(state.probe.peakSpeed * SPEED_TO_KMS).toFixed(2)} km/s`;
    ui.btnNextSector.textContent = isFinal ? `SECTOR ${fmtId(1)} →` : 'NEXT SECTOR →';

    setTimeout(() => {
      if (state.phase === 'complete') {
        ui.modal.classList.add('open');
      }
    }, 520);
  }

  // =========================================================================
  // RENDERING PIPELINE (CANVAS 2D)
  // =========================================================================
  function render() {
    const w = state.viewW;
    const h = state.viewH;

    ctx.save();
    ctx.scale(state.dpr, state.dpr);

    // 1. Deep Space Obsidian + Starfield Navy radial depth
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.48, 30, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    bgGrad.addColorStop(0, '#0E1729');
    bgGrad.addColorStop(0.58, '#09101E');
    bgGrad.addColorStop(1, '#070B14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Parallax Starfield
    drawStars(w, h);

    // 3. Subtle Mission Control Coordinate Grid
    drawCoordinateGrid();

    // Enter World Space
    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);

    const sector = SECTORS[state.sectorIndex];

    // 4. Gravitational Potential Contour Wells
    if (state.showWells) {
      drawGravityWells(sector.bodies);
    }

    // 5. Last Attempt Ghost Path
    if (state.ghostPath && state.ghostPath.length > 1 && state.phase === 'aim') {
      drawGhostPath(state.ghostPath);
    }

    // 6. Live Symplectic Predictive Trajectory
    if (state.predicted && state.phase === 'aim') {
      drawPredictedTrajectory(state.predicted);
    } else if (!state.hasInteracted && state.phase === 'aim') {
      drawIdleOnboardingHint(sector);
    }

    // 7. Launchpad Orbital Ring
    drawLaunchpad(sector.probe);

    // 8. Relay Beacons
    for (let i = 0; i < state.relays.length; i++) {
      drawRelayBeacon(state.relays[i]);
    }

    // 9. Celestial Bodies (Stars, Ringed Gas Giants, Planets, Singularities)
    for (let i = 0; i < sector.bodies.length; i++) {
      drawCelestialBody(sector.bodies[i], sector.bodies);
    }

    // 10. Aiming Velocity Vector Arrow & Pullback Tether
    if (state.phase === 'aim' && state.hasAimVector) {
      drawAimVector(sector.probe);
    }

    // 11. Probe Plasma Tail & Spacecraft Silhouette
    if (state.phase === 'flight' || state.phase === 'complete') {
      drawProbeTrail(state.probe.trail);
    }
    if (state.phase !== 'failed') {
      drawProbe();
    }

    // 12. Expanding Telemetry Rings, Sparks, and Floating Callouts
    drawEffects();

    ctx.restore();
    ctx.restore();
  }

  function drawStars(w, h) {
    const px = prefersReducedMotion ? 0 : state.pointerScreenNorm.x;
    const py = prefersReducedMotion ? 0 : state.pointerScreenNorm.y;
    const t = state.time;

    for (let i = 0; i < state.stars.length; i++) {
      const s = state.stars[i];
      const sx = ((s.u * w - px * s.depth) % w + w) % w;
      const sy = ((s.v * h - py * s.depth) % h + h) % h;
      const twinkle = prefersReducedMotion ? 1 : 0.78 + 0.22 * Math.sin(t * s.twinkle + s.phase);
      ctx.globalAlpha = s.alpha * twinkle;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCoordinateGrid() {
    const step = 120 * state.scale;
    if (step < 24) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
    ctx.lineWidth = 1;

    for (let wx = 0; wx <= WORLD_W; wx += 120) {
      const sx = state.offsetX + wx * state.scale;
      ctx.beginPath();
      ctx.moveTo(sx, state.offsetY);
      ctx.lineTo(sx, state.offsetY + WORLD_H * state.scale);
      ctx.stroke();
    }
    for (let wy = 0; wy <= WORLD_H; wy += 120) {
      const sy = state.offsetY + wy * state.scale;
      ctx.beginPath();
      ctx.moveTo(state.offsetX, sy);
      ctx.lineTo(state.offsetX + WORLD_W * state.scale, sy);
      ctx.stroke();
    }

    // Corner calibration brackets
    const x0 = state.offsetX;
    const y0 = state.offsetY;
    const x1 = state.offsetX + WORLD_W * state.scale;
    const y1 = state.offsetY + WORLD_H * state.scale;
    const b = 14;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + b); ctx.lineTo(x0, y0); ctx.lineTo(x0 + b, y0);
    ctx.moveTo(x1 - b, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + b);
    ctx.moveTo(x0, y1 - b); ctx.lineTo(x0, y1); ctx.lineTo(x0 + b, y1);
    ctx.moveTo(x1 - b, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - b);
    ctx.stroke();
    ctx.restore();
  }

  function drawGravityWells(bodies) {
    const pulse = prefersReducedMotion ? 0 : Math.sin(state.time * 1.4) * 2.5;
    ctx.save();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const baseColor =
        b.type === 'star'
          ? '245, 158, 11'
          : b.type === 'hazard'
          ? '244, 63, 94'
          : b.type === 'planet'
          ? '56, 189, 248'
          : b.type === 'repulsor'
          ? '232, 121, 249'
          : '99, 102, 241';

      const maxR = Math.sqrt(Math.abs(b.mass)) * 19.5;
      const rings = 5;

      // Subtle potential field fill
      const wellGrad = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, maxR);
      wellGrad.addColorStop(0, `rgba(${baseColor}, 0.13)`);
      wellGrad.addColorStop(0.5, `rgba(${baseColor}, 0.045)`);
      wellGrad.addColorStop(1, `rgba(${baseColor}, 0)`);
      ctx.fillStyle = wellGrad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, maxR, 0, Math.PI * 2);
      ctx.fill();

      // Concentric gravitational potential contour rings
      for (let k = 1; k <= rings; k++) {
        const frac = k / rings;
        const r = b.r + (maxR - b.r) * (frac * frac * 0.55 + frac * 0.45) + pulse * frac;
        ctx.strokeStyle = `rgba(${baseColor}, ${(0.28 * (1 - frac * 0.72)).toFixed(3)})`;
        ctx.lineWidth = k === 1 ? 1.15 : 0.9;
        // A repulsor's field is a hill, not a well: every contour is broken.
        ctx.setLineDash(b.type === 'repulsor' ? [2, 5] : k % 2 === 0 ? [4, 6] : []);
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Micro gravity parameter label
      ctx.font = '600 9.5px Menlo, Consolas, monospace';
      ctx.fillStyle = `rgba(${baseColor}, 0.72)`;
      ctx.textAlign = 'center';
      ctx.fillText(`${b.label} · μ${b.mass < 0 ? '−' : ''}${(Math.abs(b.mass) / 100).toFixed(2)}`, b.x, b.y + b.r + 18);
    }
    ctx.restore();
  }

  function drawCelestialBody(b, allBodies) {
    ctx.save();

    // Optional back half of planetary rings
    if (b.ring) {
      drawPlanetaryRing(b, true);
    }

    if (b.type === 'star') {
      // Solar corona
      const shimmer = prefersReducedMotion ? 1 : 0.94 + 0.06 * Math.sin(state.time * 2.8 + b.x);
      const corona = ctx.createRadialGradient(b.x, b.y, b.r * 0.7, b.x, b.y, b.r * 2.6 * shimmer);
      corona.addColorStop(0, 'rgba(254, 243, 199, 0.92)');
      corona.addColorStop(0.28, 'rgba(245, 158, 11, 0.55)');
      corona.addColorStop(0.6, 'rgba(245, 158, 11, 0.14)');
      corona.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.6 * shimmer, 0, Math.PI * 2);
      ctx.fill();

      // Core disk
      const core = ctx.createRadialGradient(b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 0.1, b.x, b.y, b.r);
      core.addColorStop(0, '#FFFBEB');
      core.addColorStop(0.45, '#FCD34D');
      core.addColorStop(0.88, '#F59E0B');
      core.addColorStop(1, '#D97706');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.type === 'hazard') {
      // Singularity / Neutron star with danger rose photon ring
      const aura = ctx.createRadialGradient(b.x, b.y, b.r * 0.85, b.x, b.y, b.r * 2.5);
      aura.addColorStop(0, 'rgba(244, 63, 94, 0.65)');
      aura.addColorStop(0.42, 'rgba(244, 63, 94, 0.18)');
      aura.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Event horizon core
      ctx.fillStyle = '#05070D';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Razor photon ring
      ctx.strokeStyle = PALETTE.rose;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating accretion ticks
      const rot = prefersReducedMotion ? 0 : state.time * 1.3;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 7, rot, rot + Math.PI * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 7, rot + Math.PI, rot + Math.PI * 1.65);
      ctx.stroke();
    } else if (b.type === 'repulsor') {
      // Exotic-matter node: it pushes the probe away. Pale core, fuchsia halo, rings travelling outward.
      const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2.4);
      halo.addColorStop(0, 'rgba(232, 121, 249, 0.5)');
      halo.addColorStop(0.45, 'rgba(232, 121, 249, 0.14)');
      halo.addColorStop(1, 'rgba(232, 121, 249, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      for (let k = 0; k < 2; k++) {
        const phase = prefersReducedMotion ? 0.35 + k * 0.4 : (state.time * 0.55 + k * 0.5) % 1;
        ctx.strokeStyle = `rgba(232, 121, 249, ${((1 - phase) * 0.55).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + phase * b.r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      const core = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      core.addColorStop(0, '#FDF4FF');
      core.addColorStop(0.35, '#F5D0FE');
      core.addColorStop(0.8, '#C026D3');
      core.addColorStop(1, '#701A75');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = PALETTE.fuchsia;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();

      // Four outward chevrons: the direction of the push
      ctx.strokeStyle = 'rgba(253, 244, 255, 0.85)';
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) {
        const a = (Math.PI / 2) * k + Math.PI / 4;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const tip = b.r * 0.72;
        const back = b.r * 0.4;
        const wing = b.r * 0.24;
        ctx.beginPath();
        ctx.moveTo(b.x + cx * back - cy * wing, b.y + cy * back + cx * wing);
        ctx.lineTo(b.x + cx * tip, b.y + cy * tip);
        ctx.lineTo(b.x + cx * back + cy * wing, b.y + cy * back - cx * wing);
        ctx.stroke();
      }
    } else {
      // Gas giant (indigo) or ice planet (cyan-indigo)
      // Compute light direction from nearest star if present
      let lx = -0.5;
      let ly = -0.5;
      const star = allBodies.find((o) => o.type === 'star');
      if (star) {
        const dx = star.x - b.x;
        const dy = star.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        lx = dx / d;
        ly = dy / d;
      }

      const gx = b.x + lx * b.r * 0.45;
      const gy = b.y + ly * b.r * 0.45;
      const grad = ctx.createRadialGradient(gx, gy, b.r * 0.12, b.x, b.y, b.r * 1.08);
      if (b.type === 'planet') {
        grad.addColorStop(0, '#BAE6FD');
        grad.addColorStop(0.5, '#38BDF8');
        grad.addColorStop(0.85, '#1E3A8A');
        grad.addColorStop(1, '#0B1120');
      } else {
        grad.addColorStop(0, '#A5B4FC');
        grad.addColorStop(0.45, '#6366F1');
        grad.addColorStop(0.85, '#312E81');
        grad.addColorStop(1, '#0F172A');
      }

      // Subtle atmospheric glow
      ctx.shadowColor = b.type === 'planet' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(99, 102, 241, 0.4)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Subtle limb rim
      ctx.strokeStyle = b.type === 'planet' ? 'rgba(186, 230, 253, 0.38)' : 'rgba(165, 180, 252, 0.35)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Front half of planetary rings
    if (b.ring) {
      drawPlanetaryRing(b, false);
    }

    ctx.restore();
  }

  function drawPlanetaryRing(b, backHalf) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt || -0.28);
    const startA = backHalf ? Math.PI : 0;
    const endA = backHalf ? Math.PI * 2 : Math.PI;

    ctx.strokeStyle = 'rgba(165, 180, 252, 0.38)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r * 1.78, b.r * 0.44, 0, startA, endA);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r * 2.02, b.r * 0.5, 0, startA, endA);
    ctx.stroke();
    ctx.restore();
  }

  function drawLaunchpad(pad) {
    const t = state.time;
    const rot = prefersReducedMotion ? 0 : t * 0.35;
    ctx.save();
    ctx.translate(pad.x, pad.y);

    // Outer orbital launch ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.26)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 34, rot, rot + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner azimuth compass ticks
    ctx.strokeStyle = 'rgba(247, 250, 252, 0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const r0 = i % 3 === 0 ? 22 : 25;
      const r1 = 29;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }

    // Standby pulse when waiting for aim
    if (state.phase === 'aim' && !state.isDragging && !prefersReducedMotion) {
      const p = (t * 0.8) % 1;
      ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - p) * 0.45})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + p * 32, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Label
    ctx.font = '600 9px Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('LAUNCHPAD', 0, 48);

    ctx.restore();
  }

  function drawRelayBeacon(r) {
    const t = state.time;
    const rot = prefersReducedMotion ? 0 : t * (r.locked ? 0.4 : 1.1);
    ctx.save();
    ctx.translate(r.x, r.y);

    // Ambient emerald glow
    const glowR = r.locked ? r.r * 2.5 : r.r * 2.0;
    const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, glowR);
    grad.addColorStop(0, r.locked ? 'rgba(16, 185, 129, 0.55)' : 'rgba(16, 185, 129, 0.34)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Beacon pulse ping
    if (!r.locked && !prefersReducedMotion) {
      const ping = (t * 0.65 + r.x * 0.01) % 1;
      ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - ping) * 0.45})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, r.r * 0.7 + ping * r.r * 1.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer rotating bracket arcs
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeStyle = r.locked ? PALETTE.emerald : 'rgba(16, 185, 129, 0.85)';
    ctx.lineWidth = r.locked ? 2.1 : 1.5;
    for (let k = 0; k < 4; k++) {
      const a0 = (Math.PI * 0.5) * k + 0.28;
      const a1 = a0 + 0.96;
      ctx.beginPath();
      ctx.arc(0, 0, r.r, a0, a1);
      ctx.stroke();
    }
    ctx.restore();

    // Inner geometric transponder diamond
    ctx.save();
    ctx.rotate(Math.PI / 4);
    const s = r.locked ? 8.5 : 6.5;
    ctx.fillStyle = r.locked ? PALETTE.emerald : 'rgba(16, 185, 129, 0.22)';
    ctx.strokeStyle = r.locked ? PALETTE.white : PALETTE.emerald;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();

    // Center core dot
    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // Relay code label
    ctx.font = '600 9px Menlo, Consolas, monospace';
    ctx.fillStyle = r.locked ? PALETTE.emerald : 'rgba(16, 185, 129, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(r.locked ? 'LOCKED' : r.code, 0, r.r + 15);

    ctx.restore();
  }

  function drawGhostPath(pts) {
    ctx.save();
    ctx.strokeStyle = 'rgba(247, 250, 252, 0.14)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPredictedTrajectory(pred) {
    const pts = pred.points;
    if (pts.length < 2) return;

    ctx.save();

    // Draw smooth dotted symplectic trajectory with distance alpha taper
    const total = pts.length;
    for (let i = 1; i < total; i++) {
      const t = i / total;
      const alpha = Math.max(0.08, (1 - t * 0.84) * 0.92);
      const nearImpact = pred.impact && t > 0.82;
      ctx.fillStyle = nearImpact
        ? `rgba(244, 63, 94, ${alpha})`
        : pred.allRelaysPredicted
        ? `rgba(16, 185, 129, ${alpha})`
        : `rgba(56, 189, 248, ${alpha})`;

      const dotR = Math.max(1.2, 2.5 - t * 1.1);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle connecting hairline for crisp readability
    ctx.strokeStyle = pred.allRelaysPredicted
      ? 'rgba(16, 185, 129, 0.28)'
      : 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < total; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Predicted relay intersection markers
    for (let i = 0; i < pred.relayHits.length; i++) {
      const hit = pred.relayHits[i];
      ctx.strokeStyle = PALETTE.emerald;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, 29, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Predicted impact warning marker
    if (pred.impact) {
      const imp = pred.impact;
      ctx.strokeStyle = PALETTE.rose;
      ctx.lineWidth = 2;
      const sz = 6.5;
      ctx.beginPath();
      ctx.moveTo(imp.x - sz, imp.y - sz);
      ctx.lineTo(imp.x + sz, imp.y + sz);
      ctx.moveTo(imp.x + sz, imp.y - sz);
      ctx.lineTo(imp.x - sz, imp.y + sz);
      ctx.stroke();

      ctx.font = '700 9px Menlo, Consolas, monospace';
      ctx.fillStyle = PALETTE.rose;
      ctx.textAlign = 'left';
      ctx.fillText('IMPACT', imp.x + 10, imp.y + 3);
    }

    ctx.restore();
  }

  function drawIdleOnboardingHint(sector) {
    // Subtle animated pullback cue on Sector 01 before first interaction
    const p = sector.probe;
    const phase = prefersReducedMotion ? 0.5 : (Math.sin(state.time * 2.2) + 1) * 0.5;
    const rad = (sector.hintAngle * Math.PI) / 180;
    const pullDist = 36 + phase * 34;
    const bx = p.x - Math.cos(rad) * pullDist;
    const by = p.y - Math.sin(rad) * pullDist;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '600 10px Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(247, 250, 252, 0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG BACK TO AIM', p.x, p.y - 46);
    ctx.restore();
  }

  function drawAimVector(pad) {
    const vx = state.aimVx;
    const vy = state.aimVy;
    const spd = Math.hypot(vx, vy);
    if (spd < 8) return;

    const len = Math.min(165, spd * 0.32);
    const ang = Math.atan2(vy, vx);
    const ex = pad.x + Math.cos(ang) * len;
    const ey = pad.y + Math.sin(ang) * len;

    ctx.save();

    // Subtle pullback tension tether if actively dragging
    if (state.isDragging) {
      ctx.strokeStyle = 'rgba(247, 250, 252, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(state.dragOriginWorld.x, state.dragOriginWorld.y);
      ctx.lineTo(state.pointerWorld.x, state.pointerWorld.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.beginPath();
      ctx.arc(state.pointerWorld.x, state.pointerWorld.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp velocity vector arrow
    const vecColor = state.predicted && state.predicted.allRelaysPredicted ? PALETTE.emerald : PALETTE.cyan;
    ctx.strokeStyle = vecColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(pad.x, pad.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    const head = 10;
    ctx.fillStyle = vecColor;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.38) * head, ey - Math.sin(ang - 0.38) * head);
    ctx.lineTo(ex - Math.cos(ang + 0.38) * head, ey - Math.sin(ang + 0.38) * head);
    ctx.closePath();
    ctx.fill();

    // Inline Delta-V badge near arrow tip
    const kms = (spd * SPEED_TO_KMS).toFixed(2);
    const deg = ((ang * 180) / Math.PI + 360) % 360;
    ctx.font = '600 10px Menlo, Consolas, monospace';
    ctx.fillStyle = PALETTE.white;
    ctx.textAlign = 'left';
    ctx.fillText(`${kms} km/s · ${deg.toFixed(1)}°`, ex + 10, ey - 6);

    ctx.restore();
  }

  function drawProbeTrail(trail) {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      const t = i / trail.length;
      const boost = Math.min(1, Math.max(0, (p1.speed - state.probe.launchSpeed) / 180));

      // Outer luminous cyan plasma sheath
      ctx.strokeStyle = boost > 0.35
        ? `rgba(125, 211, 252, ${t * 0.72})`
        : `rgba(56, 189, 248, ${t * 0.62})`;
      ctx.lineWidth = 1.2 + t * 5.2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // White-hot inner core
      ctx.strokeStyle = `rgba(247, 250, 252, ${t * 0.85})`;
      ctx.lineWidth = 0.6 + t * 1.8;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProbe() {
    const p = state.probe;
    let ang = 0;
    if (state.phase === 'flight' || state.phase === 'complete') {
      ang = Math.atan2(p.vy, p.vx);
    } else if (state.hasAimVector) {
      ang = Math.atan2(state.aimVy, state.aimVx);
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    // Glow halo
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
    glow.addColorStop(0, 'rgba(247, 250, 252, 0.85)');
    glow.addColorStop(0.45, 'rgba(56, 189, 248, 0.42)');
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Sleek Voyager probe delta silhouette
    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.moveTo(8.5, 0);
    ctx.lineTo(-5.5, -5.2);
    ctx.lineTo(-3.2, 0);
    ctx.lineTo(-5.5, 5.2);
    ctx.closePath();
    ctx.fill();

    // Telemetry dish crossbar
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -6.5);
    ctx.lineTo(-2, 6.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawEffects() {
    ctx.save();

    // Expanding celebratory telemetry rings
    for (let i = 0; i < state.rings.length; i++) {
      const r = state.rings[i];
      const t = Math.min(1, r.age / r.duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const rad = r.startR + (r.endR - r.startR) * ease;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.2 * (1 - t * 0.65);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const t = Math.min(1, p.age / p.life);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }

    // Floating mission callouts
    ctx.font = '700 10.5px Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < state.callouts.length; i++) {
      const c = state.callouts[i];
      const t = Math.min(1, c.age / c.life);
      ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // =========================================================================
  // MAIN ANIMATION LOOP (ACCUMULATED FIXED TIMESTEP)
  // =========================================================================
  let lastTime = performance.now();
  let accumulator = 0;

  function loop(now) {
    const elapsed = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += elapsed;

    while (accumulator >= FIXED_DT) {
      updateSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    render();
    requestAnimationFrame(loop);
  }

  // =========================================================================
  // BOOTSTRAP
  // =========================================================================
  initStars();
  buildSectorNav();
  updateViewport();
  // `#sector=N` opens a sector directly; `#debug` exposes internals for browser tests.
  const sectorFromHash = () => {
    const id = Number((location.hash.match(/sector=(\d+)/) || [])[1]);
    return id >= 1 && id <= SECTORS.length ? id - 1 : -1;
  };
  const saved = loadProgress();
  const resume = saved && saved.last >= 1 && saved.last <= SECTORS.length ? saved.last - 1 : 0;
  loadSector(sectorFromHash() >= 0 ? sectorFromHash() : resume);
  window.addEventListener('hashchange', () => {
    const idx = sectorFromHash();
    if (idx >= 0 && idx !== state.sectorIndex) loadSector(idx);
  });
  if (/debug/.test(location.hash)) window.__vs = { state, SECTORS };

  window.addEventListener('resize', updateViewport);
  requestAnimationFrame(loop);
})();
