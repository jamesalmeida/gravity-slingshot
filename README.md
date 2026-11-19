# Voyager Slingshot // Deep Space Relay

A minimalist orbital mechanics puzzle. Drag back from the probe to stretch a launch vector, watch the live predicted orbit curve through every gravity well, then release to slingshot the probe into the emerald relay beacons across 100 star systems: the 8 handcrafted originals, then 92 more in nine arcs that each add an idea and get harder.

**Play:** https://jamesalmeida.github.io/gravity-slingshot/

No build step and no dependencies: plain HTML, CSS and JavaScript on a high-DPI Canvas 2D.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
npm start            # python3 -m http.server 8000, then open http://localhost:8000
```

Open a sector directly with `index.html#sector=42`. The address follows the sector you are on, and the game remembers which sectors you have cleared and where you left off (in the browser's local storage).

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Aim | Drag back from the probe (or from anywhere on touch) | ← → rotate azimuth 0.6° (Shift: 2.5°), ↑ ↓ delta-V (Shift: bigger steps) |
| Launch / abort | Release the drag, or the Launch button | Space / Enter |
| Reset sector | Reset Sector | R |
| Gravity wells overlay | Show Gravity Wells | G |
| Previous / next sector | ‹ › in the top bar | [ / ] |
| Sector map (all 100, by arc) | The CLEARED counter in the top bar | M (Esc closes) |

The HUD shows launches, delta-V in km/s, launch azimuth, predicted periapsis and apoapsis around the sector's primary body, and relays locked. The dotted predictor turns emerald when the launch will lock every relay and rose when it ends in an impact. The faint dashed line is your previous attempt: the predicted path at first, then the path the probe really flew once that flight ends.

## Sectors

| Sectors | Arc | What it adds |
|---|---|---|
| 001–008 | The Original Eight | The handcrafted originals, from Kepler Bend to Voyager Grand Tour |
| 009–020 | Single Well | One body: how speed trades against bend |
| 021–030 | Binary Systems | Two wells pulling against each other |
| 031–040 | Event Horizons | Small, heavy singularities: sharp turns, thin margins |
| 041–050 | Triple Chains | Three wells, three relays, one arc |
| 051–060 | Repulsor Fields | A new body that pushes the probe away |
| 061–070 | Narrow Beacons | Relays at 70% of their usual radius |
| 071–080 | Blind Transfers | The last relay lies past the end of the predictor |
| 081–090 | Crowded Skies | Four and five bodies |
| 091–100 | Grand Tours | Everything at once |

Every sector's measured difficulty is in [docs/sectors.md](docs/sectors.md). How the generated sectors are made and judged is in [docs/level-design.md](docs/level-design.md).

## How it works

| File | What it holds |
|---|---|
| `src/physics.js` | Softened point-mass gravity, a velocity-Verlet symplectic integrator (60 Hz × 6 substeps), the 310-frame trajectory predictor, and a headless full-flight function |
| `src/sectors.js` | The 8 handcrafted star systems: bodies, relays and launchpads |
| `src/sectors-generated.js` | Sectors 009–100, written by the generator. Not edited by hand |
| `src/game.js` | State, pointer and keyboard input, HUD, the live flight loop and all Canvas rendering (starfield parallax, equipotential contour rings, plasma trail, telemetry rings) |
| `src/audio.js` | Procedural WebAudio cues, off until you turn audio on |
| `src/style.css` | Mission-control HUD styling |
| `tools/generate-sectors.js` | Seeded generator for sectors 009–100 |
| `tools/check-levels.js` | Solver that proves each sector can be cleared in one launch |
| `tools/lib/analyze.js` | Flight analysis shared by the two tools: sweeps, aiming tolerance, difficulty |

The predictor, the live flight and the solver all step the same integrator, so the predicted path is exactly what flies.

```sh
npm run check        # re-fly every sector's recorded solution, about a second
npm run check:sweep  # fly every launch (0.5° × 6 px/s grid) for all 100 sectors, about a minute
npm run generate     # rebuild sectors 009–100 and docs/sectors.md, several minutes
```

Each sector records one launch known to clear it. CI re-flies all 100 on every push, so a physics or level change that breaks a sector fails the build. The sweep reports how many launches clear each sector, plus the most forgiving one.

## Credits

Reverse-engineered from the AI-generated "031 gravity slingshot puzzle" study in [miaai-lab/Gemini-4-Neon-100-HTML-Files](https://github.com/miaai-lab/Gemini-4-Neon-100-HTML-Files) ([original page](https://miaai-lab.github.io/Gemini-4-Neon-100-HTML-Files/031-gravity-slingshot-puzzle.html)). The single-file original is split here into modules, with a solver and CI added. Sectors 009–100, the repulsor body, the sector map and saved progress are additions.
