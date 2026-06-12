# DeckBuilder

Web app that optimizes decking-plank layout: it snaps every seam to the
backing-board (joist) grid, packs cuts from your stock lengths (reusing offcuts,
accounting for saw kerf), and generates a visual deck plan with a pleasing,
user-selectable seam pattern.

See [DESIGN.md](DESIGN.md) for the full design (model, algorithm, math).

## The app — `DeckBuilder-<version>-win-x64.zip`

A standalone Windows desktop app (Electron). **Unzip** `release\DeckBuilder-*-win-x64.zip`
anywhere and run **`DeckBuilder.exe`** inside — its own window, **no console, no Node
install required**.

> **Why a zip and not a single .exe?** A single-file portable build self-extracts to
> `%TEMP%` and runs from there, which Windows Defender's ML heuristic false-flags as
> `Trojan:Win32/Wacatac.H!ml` (it isn't malware — it's the unsigned self-extractor
> pattern). The zipped folder build runs the genuine Electron binary directly and is
> not flagged. To ship a clean *single* .exe you need an Authenticode **code-signing
> certificate** (see below).

First launch may show SmartScreen ("Windows protected your PC") because the exe is
unsigned — click **More info → Run anyway**. Code signing removes this too.

### Build / rebuild

```bash
npm install        # first time only
npm run dist:win   # builds the UI, then packages release\DeckBuilder-<version>-win-x64.zip
```

`npm run dist:win` runs the Vite build and `electron-builder --win` (zip target).

### Code signing (optional, for clean distribution)

To eliminate both the Defender flag on a single-file build and the SmartScreen
warning, sign with an OV/EV code-signing certificate, then set in `package.json`
under `build.win`: `"signAndEditExecutable": true` and provide the cert via
`CSC_LINK` / `CSC_KEY_PASSWORD` env vars (electron-builder picks them up).

### Lightweight alternative — `DeckBuilder.cmd`

`DeckBuilder.cmd` (in the project root) launches the same app in a browser
"app window" without packaging. It needs Node available and leaves a small
background console while open. Handy during development; the `.exe` is the
real deliverable.

## Android app (Android 15)

A native Android wrapper via **Capacitor** (the same React UI in a WebView),
targeting **API 35 (Android 15)**, minSdk 23.

The built app is **`release\DeckBuilder.apk`** (debug-signed, ~4 MB).

On Android, **Save** (`.deck` and the plan PNG) writes the file and opens the
system **share sheet** (save to Files/Drive/email), via Capacitor Filesystem +
Share. Each deck has a 🔍 **View / zoom** button for a full-screen,
pinch-to-zoom plan with **PNG export**.

**Install on a device:** copy the APK to your phone, enable *Settings → Apps →
Special access → Install unknown apps* for your file manager, then tap the APK.
(Debug-signed APKs are for sideloading/testing, not the Play Store.)

### Rebuild the APK

Requires a one-time toolchain: **JDK 21** and the **Android SDK** (cmdline-tools,
platform-tools, `platforms;android-35`, `build-tools;35.0.0`). With
`JAVA_HOME` pointing at JDK 21 and `android/local.properties` pointing at the SDK:

```bash
npm run android:apk
# -> android\app\build\outputs\apk\debug\app-debug.apk
```

`npm run android:apk` builds the web app, copies it into the Android project
(`cap copy`), and runs `gradlew assembleDebug`. Open the project in Android
Studio (`npx cap open android`) for a release/Play-Store (signed AAB) build.

## Run it (dev)

Requires **Node 20+** (not installed on the build machine — install from
<https://nodejs.org> first).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
npm run typecheck
```

## How it works (pipeline)

1. **Grid** — joist positions from spacing/offset; rows across the width with the
   leftover split evenly between the first and last rows (balanced edges).
2. **Stage A — candidates** (`engine/candidates.ts`): per-row cut plans whose
   segments fit a stock plank and respect the min-piece rule.
3. **Stage B — stagger** (`engine/stagger.ts`): picks one candidate per row for
   the chosen mode (true random / random-with-rules / jittered brick / staggered
   / max scatter), enforcing min seam offset and avoiding alignment, staircases
   and periodicity. Seeded — **Reroll** changes the seed.
4. **Stage C — cut stock** (`engine/cutstock.ts`): first-fit-decreasing packing
   with kerf and offcut reuse across all decks.
5. **Stats** — kerf loss, scrap, leftover, waste %, cost.

## Structure

```
src/model/    types + defaults
src/engine/   rng · grid · candidates · stagger · cutstock · optimize  (pure, testable)
src/ui/       App (inputs) · DeckCanvas (SVG plan) · Results (BOM / cut list / stats)
```

## Status

MVP. Engine runs inline; Stage B is greedy+rules. Next: simulated annealing in a
Web Worker, persistence, and SVG/CSV/PDF export (see DESIGN.md §9).
