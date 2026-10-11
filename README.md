# Shum App

English · [Русский](README.ru.md)

Shum for the computer: chats, contacts and people nearby over Bluetooth. Preview 0.1.0 for macOS 15+ (Apple Silicon and Intel), Windows 10 and 11 (x64, ARM64) and Linux (x64, ARM64).

The interface is React (`src`), the desktop shell is Tauri (`src-tauri`). Message logic lives in [Shum-Core](https://github.com/hiTechTeam/Shum-Core); the app only shows it.

## Install

Download from [Releases](https://github.com/hiTechTeam/Shum-App/releases):

* **macOS:** `Shum-macOS.dmg`, move Shum to Applications. It is self-signed and not notarized: on first launch open System Settings → Privacy & Security and click Open Anyway.
* **Windows:** `Shum-Windows-x64-setup.exe` or `-arm64-setup.exe`. It is not signed: if Windows says it protected your PC, click More info → Run anyway. No administrator rights needed.
* **Linux:** `sudo apt install ./Shum-Linux-x64.deb` on Debian and Ubuntu, or `chmod +x Shum-Linux-x64.AppImage` and run it anywhere. ARM64 files are next to them.

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
sh scripts/package_macos.sh    # DMG, universal
sh scripts/package_windows.sh  # NSIS installers, cross-built with cargo-xwin
sh scripts/package_linux.sh    # .deb and AppImage in Docker
```

## License

MIT
