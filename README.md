# Voyager Slingshot // Deep Space Relay

A minimalist orbital mechanics puzzle. Drag back from the probe to stretch a launch vector, watch the live predicted orbit curve through every gravity well, then release to slingshot the probe into the emerald relay beacons across 8 handcrafted star systems.

**Play:** https://jamesalmeida.github.io/gravity-slingshot/

No build step and no dependencies: plain HTML, CSS and JavaScript on a high-DPI Canvas 2D.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
npm start            # python3 -m http.server 8000, then open http://localhost:8000
```

Open a sector directly with `index.html#sector=5`.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Aim | Drag back from the probe (or from anywhere on touch) | ← → rotate azimuth 0.6° (Shift: 2.5°), ↑ ↓ delta-V (Shift: bigger steps) |
| Launch / abort | Release the drag, or the Launch button | Space / Enter |
| Reset sector | Reset Sector | R |
| Gravity wells overlay | Show Gravity Wells | G |
| Jump to sector | 01–08 in the top bar | 1–8 |

The HUD shows launches, delta-V in km/s, launch azimuth, predicted periapsis and apoapsis around the sector's primary body, and relays locked. The dotted predictor turns emerald when the launch will lock every relay and rose when it ends in an impact. The faint dashed line is your previous attempt.

## Sectors

| # | Name | Brief |
|---|---|---|
| 01 | Kepler Bend | Gravity assist around Sol-A to lock the deep relay |
| 02 | Oberth Slingshot | Dive into the gas giant's well to whip across two relays |
| 03 | Lagrange Corridor | Thread the L1 saddle between twin stars |
| 04 | Figure-Eight Transfer | Cross the binary saddle for a free-return S-curve |
| 05 | Roche Limit | Skim past the singularity using the outer gas giant |
| 06 | Triple Resonance | Chain three gravity wells in one continuous arc |
| 07 | Binary Rebound | A 180° binary boomerang return transfer |
| 08 | Voyager Grand Tour | Four-body alignment across the outer system |

## How it works

| File | What it holds |
|---|---|
| `src/physics.js` | Softened point-mass gravity, a velocity-Verlet symplectic integrator (60 Hz × 6 substeps), the 310-frame trajectory predictor, and a headless full-flight function |
| `src/sectors.js` | The 8 star systems: bodies, relays and launchpads |
| `src/game.js` | State, pointer and keyboard input, HUD, the live flight loop and all Canvas rendering (starfield parallax, equipotential contour rings, plasma trail, telemetry rings) |
| `src/audio.js` | Procedural WebAudio cues, off until you turn audio on |
| `src/style.css` | Mission-control HUD styling |
| `tools/check-levels.js` | Solver that proves each sector can be cleared in one launch |

The predictor, the live flight and the solver all step the same integrator, so the predicted path is exactly what flies.

```sh
npm run check        # sweep azimuth (0.5°) × delta-V for every sector, about 30 s
npm run check:fine   # finer sweep
```

For each sector the solver reports how many launches clear it, plus the most forgiving one. CI runs it on every push, so a physics or level change that makes a sector impossible fails the build.

## Credits

Reverse-engineered from the AI-generated "031 gravity slingshot puzzle" study in [miaai-lab/Gemini-4-Neon-100-HTML-Files](https://github.com/miaai-lab/Gemini-4-Neon-100-HTML-Files) ([original page](https://miaai-lab.github.io/Gemini-4-Neon-100-HTML-Files/031-gravity-slingshot-puzzle.html)). The single-file original is split here into modules, with a solver and CI added.
