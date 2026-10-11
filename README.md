# Shum App

English · [Русский](README.ru.md)

Shum for the computer: chats, contacts and people nearby over Bluetooth. Preview 0.1.0 for macOS 15 or later, Apple Silicon and Intel. Windows and Linux are in development.

The interface is React (`src`), the desktop shell is Tauri (`src-tauri`). Message logic lives in [Shum-Core](https://github.com/hiTechTeam/Shum-Core); the app only shows it.

## Install

Download `Shum-macOS.dmg` from [Releases](https://github.com/hiTechTeam/Shum-App/releases) and move Shum to Applications. The app is signed with a self-signed certificate and not notarized, so on first launch macOS warns that it cannot verify the developer: open System Settings → Privacy & Security and click Open Anyway.

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
sh scripts/package_macos.sh
```

## License

MIT
