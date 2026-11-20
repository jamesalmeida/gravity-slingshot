# Changelog

## Unreleased

### Added

- Gravity Slingshot, a one-shot orbital puzzle: drag back from the probe, watch the predicted orbit through every gravity well, and release to lock every relay in a sector.
- A velocity-Verlet gravity sim shared by the aim preview, the live flight and a headless solver, with soft-point-mass bodies, black holes and repulsors.
- Sectors 001–008, the handcrafted originals from Kepler Bend to Voyager Grand Tour, ported with the mission-control HUD, equipotential contour rings, plasma trail, telemetry effects and audio cues.
- Sectors 009–100, generated path-first by `tools/generate-sectors.js` and committed as data: nine arcs (single well, binaries, singularities, triple chains, repulsors, narrow beacons, blind transfers, crowded skies, grand tours) that each add an idea and a harder win-rate band.
- Decoy bodies from sector 061: a full-size body near the route that the winning path never flies by, kept only if the same route survives a small aim correction and every other body stays essential. Blind Transfers (071–080) have none.
- A sector map of all 100 sectors by arc, previous/next stepper, progress saved in local storage, and an address that follows the sector (`index.html#sector=42`).
- A ghost track that shows the path a failed flight really flew.
- Star ratings, hints, saved progress and a rotated portrait layout for phones.
- `tools/check-levels.js`: re-flies each sector's recorded solution in under a second for CI, with `--sweep` for the full launch-space measurement and `--report` for `docs/sectors.md`.
- `docs/level-design.md`, the generator's gates and the decoy rules, and `docs/sectors.md`, every sector's measured difficulty.

### Changed

- The campaign grew from the 8 originals to 100 sectors with a sector map, replacing the eight level buttons.
- The look and physics now follow the original Voyager Slingshot: HUD, palette, contours, trail and audio.

### Fixed

- Level checks reject decorative bodies: every body in a generated sector must be essential or a declared decoy that meets the decoy rules.
