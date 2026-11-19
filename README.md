# Gravity Slingshot

A one-shot orbital puzzle in the browser. Pull back on the probe, let go, and bend its path around planets, stars, black holes and repulsors to light every beacon in a single launch.

No build step and no dependencies: plain HTML, CSS and JavaScript on a `<canvas>`.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
npm start            # python3 -m http.server 8000, then open http://localhost:8000
```

Jump straight to a level with `index.html#level=7`.

### Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Aim and launch | Drag back from the probe (or from anywhere), release to fire | |
| Fine-tune aim | | ← → turn 0.25° (Shift: 2°), ↑ ↓ speed ±2 (Shift: ±15) |
| Launch / abort | Launch button, or tap the field mid-flight | Space |
| Reset level | Reset | R |
| Spacetime grid | Grid | G |
| Hint (after 3 launches) | Hint | H |
| Sound | Sound | M |

The dotted line previews the first couple of seconds of flight, and the amber dashes show your previous attempt. Clearing a level in one launch earns three stars, two or three launches earn two, and anything more earns one. Using the hint caps the level at one star. Progress is saved in `localStorage`.

On tall phone screens the field turns a quarter-turn so it fills the screen: you launch upward from the bottom.

## Bodies

| Kind | Behaviour |
|---|---|
| Rock, gas giant | Ordinary gravity wells; crash if you touch them |
| Star | A heavier well with a bright halo |
| Black hole | Tiny radius, huge mass: great for tight slingshots |
| Repulsor | Negative mass that pushes the probe away, like a bumper |

## How it works

- `src/physics.js`: point-mass gravity, softened by a small constant, integrated with velocity Verlet at 60 Hz × 8 substeps. The same deterministic `simulate()` drives the aim preview, the live flight and the level checker, so what you see predicted is exactly what flies.
- `src/levels.js`: ten levels. Each stores a known one-launch `hint`.
- `src/game.js`: input, rendering (warped spacetime grid, trails, effects), HUD and progress.
- `src/audio.js`: a small WebAudio synth, off until you turn it on.
- `tools/check-levels.js`: brute-forces every launch angle and speed for each level, proves it can be cleared in one shot, confirms the stored hint still works, and reports how forgiving each level is.

```sh
npm run check        # 0.5° × 6-speed sweep, about 30 s
npm run check:fine   # 0.25° × 3-speed sweep
```

CI runs `npm run check` on every push, so a change to physics constants or level data that breaks a level fails the build.

### Making levels

Most layouts were generated path-first: place the bodies, fire random launches, keep flights that curve a lot and stay on screen, drop beacons along those paths, then keep only layouts where nearby shots (±1°, ±12 speed) also win, so a person can actually find the solution. Then run `npm run check` to confirm.

## Credits

Inspired by the "gravity slingshot puzzle" study in [miaai-lab/Gemini-4-Neon-100-HTML-Files](https://github.com/miaai-lab/Gemini-4-Neon-100-HTML-Files). This is an independent implementation: the code, levels and visuals are original, and nothing was copied from that page.
