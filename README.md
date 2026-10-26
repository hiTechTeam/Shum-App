# Shum App

English · [Русский](README.ru.md)

Shum for the computer: chats, contacts and people nearby over Bluetooth. Preview 0.1.1 for macOS 15+ on Apple Silicon, Windows 10 and 11 (x64, ARM64). On Linux use [Shum CLI](https://github.com/hiTechTeam/Shum-CLI).

The interface is React (`src`), the desktop shell is Tauri (`src-tauri`). Message logic lives in [Shum-Core](https://github.com/hiTechTeam/Shum-Core); the app only shows it.

## Install

Download from [Releases](https://github.com/hiTechTeam/Shum-App/releases):

* **macOS:** `Shum-macOS.dmg`, move Shum to Applications. It is self-signed and not notarized: on first launch open System Settings → Privacy & Security and click Open Anyway.
* **Windows:** `Shum-Windows-x64-setup.exe` or `-arm64-setup.exe`. It is not signed: if Windows says it protected your PC, click More info → Run anyway. No administrator rights needed.

## Works with the CLI

The app and [Shum CLI](https://github.com/hiTechTeam/Shum-CLI) use the same profiles. A profile has one owner process on the computer: if the CLI service already runs it, the app joins it; otherwise the app opens it and the CLI joins the app.

## Build

Needs Node.js 20+ and Rust stable.

```sh
npm install
npm run tauri dev
```

The development build cannot use Bluetooth: macOS attributes it to the terminal. Test anything that opens a profile with the packaged app:

```sh
sh scripts/package_macos.sh    # DMG, Apple Silicon
sh scripts/package_windows.sh  # NSIS installers, cross-built with cargo-xwin
```

## License

MIT
