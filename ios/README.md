# One Shot: Gravity Puzzles for iOS

A native Swift version of the game for iPhone, iPad and iPhone Duo. It is a rewrite, not a wrapped web page: SwiftUI for the interface and a SwiftUI `Canvas` for the playfield. Its only dependency is the shared GSV kit.

The web game in the repo root is unchanged. Both versions play the same 100 sectors with the same physics.

## Open and run

Open `OneShot.xcodeproj` in Xcode, pick a simulator or device, and run. Needs iOS 26 or later.

## GSV conventions

This app follows the GSV iOS conventions in `/Users/james/dev/AGENTS.md` and [agent-playbooks `ios/`](https://github.com/jamesalmeida/agent-playbooks). All of these are set in `project.yml`:

| Setting | Value |
|---|---|
| Bundle ID | `com.gsv.oneshot` |
| Team | `WZRRA4NFBY`, automatic signing |
| Version | Marketing `1.0`; build `YYYY.MM.DD.N` (now `2026.11.19.1`). Bump the build before every archive and never let Xcode manage it |
| Deployment target | iOS 26.0, as the shared kit requires |
| Shared kit | [gsv-ios-kit](https://github.com/jamesalmeida/gsv-ios-kit) by git tag (`exactVersion`), product `GSVAbout` |
| Orientations | All four, on iPhone and iPad |

Settings (bottom of the sector map) ends with the kit's Build section: version, build number and release notes. The notes are read from `OneShot/Resources/RELEASE-NOTES.md`; add an entry headed `## <build> — <date>` for each build.

Not set up yet, from the day-one checklist: the App ID is not registered, there is no App Store Connect app, and there is no `scripts/archive-testflight.sh` or `docs/TESTFLIGHT-RELEASE.md`.

## How it is laid out

| Path | What it holds |
|---|---|
| `SlingshotCore/` | A Swift package with no UI: the physics, the sector model and the sector data |
| `SlingshotCore/Sources/SlingshotCore/Physics.swift` | The integrator and predictor, ported line for line from `src/physics.js` |
| `SlingshotCore/Sources/SlingshotCore/Resources/sectors.json` | All 100 sectors, exported from the web game. Not edited by hand |
| `SlingshotCore/Tests/` | Tests that replay flights computed by the JavaScript |
| `OneShot/Game/GameModel.swift` | Game state and rules: aiming, launching, the 60 Hz flight loop, effects |
| `OneShot/Render/SpaceRenderer.swift` | Draws each frame, in the same order and colours as the web game |
| `OneShot/Render/FieldLayout.swift` | Chooses where the playfield goes for the current window size |
| `OneShot/UI/` | The HUD, sector map, "sector cleared" card and Settings |
| `OneShot/Audio/SoundEngine.swift` | Procedural sound, the same oscillator cues as the web game |
| `project.yml` | The XcodeGen description the Xcode project is generated from |

## One set of sectors, two games

The sectors are defined once, in `src/sectors.js` and `src/sectors-generated.js`. The app reads a JSON copy:

```sh
npm run export:ios   # rewrite sectors.json and the reference flights after changing any sector
npm run check        # also fails if the export is out of date
```

## Same physics, proven

`npm run export:ios` also flies 500 launches in JavaScript (five per sector) and records how each ends. The Swift tests replay them and require the same outcome, the same frame, and the same end position to the last bit:

```sh
npm run test:ios     # swift test, runs on the Mac in about a second, no simulator needed
```

So a launch that clears a sector in the browser clears it on the phone. CI runs these tests on every push.

## Screen shapes

The app never checks which device it is on. For any window size, `FieldLayout` tries four arrangements and keeps the one that gives the biggest playfield:

- **Bars**: HUD above and below the field. Chosen on iPad and on an open iPhone Duo.
- **Rails**: a thin strip on top and a column of controls each side. Chosen on a phone held sideways.
- Either of those with the **field turned a quarter turn**, so its long side runs up the screen. Chosen on a phone or iPad held upright.

It is recalculated whenever the window changes, so rotating, resizing a split view, or opening and closing an iPhone Duo all re-flow the game in place.

## What differs from the web game

- **Trim buttons.** Four buttons nudge the aim by 0.6° or 0.16 km/s, the same steps as the web game's arrow keys. Hold to repeat. A finger is less precise than a mouse, and the later sectors need this.
- **Haptics** on launch, relay lock, impact and sector cleared.
- **Saved progress** is kept in the app (UserDefaults), separate from the browser's.
- **Hardware keyboard** on iPad: arrows trim (Shift for bigger steps), Space or Return launches, R resets, G toggles wells, M opens the map, `[` and `]` change sector.
- Small text and thin lines have a minimum size so they stay readable when the field is small.

## Regenerating the Xcode project

After adding, moving or removing source files:

```sh
cd ios && xcodegen
```

The generated project is committed so the app opens without XcodeGen installed.
