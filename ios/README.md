# Voyager Slingshot for iOS

A native Swift version of the game for iPhone, iPad and iPhone Duo. It is a rewrite, not a wrapped web page: SwiftUI for the interface, a SwiftUI `Canvas` for the playfield, and no third-party dependencies.

The web game in the repo root is unchanged. Both versions play the same 100 sectors with the same physics.

## Open and run

Open `VoyagerSlingshot.xcodeproj` in Xcode, pick a simulator, and run. Needs Xcode with the iOS 17 SDK or later.

To run on your own device, select the VoyagerSlingshot target, open Signing & Capabilities, and choose your team. The bundle identifier is `com.jamesalmeida.voyagerslingshot`.

## How it is laid out

| Path | What it holds |
|---|---|
| `SlingshotCore/` | A Swift package with no UI: the physics, the sector model and the sector data |
| `SlingshotCore/Sources/SlingshotCore/Physics.swift` | The integrator and predictor, ported line for line from `src/physics.js` |
| `SlingshotCore/Sources/SlingshotCore/Resources/sectors.json` | All 100 sectors, exported from the web game. Not edited by hand |
| `SlingshotCore/Tests/` | Tests that replay flights computed by the JavaScript |
| `VoyagerSlingshot/Game/GameModel.swift` | Game state and rules: aiming, launching, the 60 Hz flight loop, effects |
| `VoyagerSlingshot/Render/SpaceRenderer.swift` | Draws each frame, in the same order and colours as the web game |
| `VoyagerSlingshot/Render/FieldLayout.swift` | Chooses where the playfield goes for the current window size |
| `VoyagerSlingshot/UI/` | The HUD, sector map and "sector cleared" card |
| `VoyagerSlingshot/Audio/SoundEngine.swift` | Procedural sound, the same oscillator cues as the web game |
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
