<p align="center">
  <img src="docs/screenshots/icon.png" width="96" alt="Shum">
</p>

<h1 align="center">Shum for the computer and the browser</h1>

<p align="center">
  Chats, contacts and people nearby over Bluetooth, on macOS, Windows and in the browser.<br>
  The same profile as on iPhone and in the terminal.
</p>

<p align="center">
  <a href="https://github.com/hiTechTeam/Shum-App/releases/latest"><img src="https://img.shields.io/github/v/release/hiTechTeam/Shum-App?label=release&color=2f9e4a" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/macOS-15%2B%20Apple%20Silicon-111111?logo=apple" alt="macOS 15+">
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-111111?logo=windows" alt="Windows 10 and 11">
  <a href="https://app.getshum.tech"><img src="https://img.shields.io/badge/web-app.getshum.tech-111111" alt="Shum Web"></a>
</p>

<p align="center">
  English · <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/screenshots/desktop.jpg" width="100%" alt="Shum on macOS">
</p>

## Install

The badge above shows the current release. Download it from [Releases](https://github.com/hiTechTeam/Shum-App/releases/latest):

| System | File |
| :--- | :--- |
| macOS 15+, Apple Silicon | `Shum-macOS.dmg` |
| Windows 10 and 11, x64 | `Shum-Windows-x64-setup.exe` |
| Windows 10 and 11, ARM64 | `Shum-Windows-arm64-setup.exe` |
| Linux | [Shum CLI](https://github.com/hiTechTeam/Shum-CLI) or [Shum Web](https://app.getshum.tech) |

* **macOS:** move Shum to Applications. It is self-signed and not notarized: on first launch open System Settings → Privacy & Security and click Open Anyway.
* **Windows:** the installer is not signed. If Windows says it protected your PC, click More info → Run anyway. No administrator rights needed.

Installed apps update themselves to the next release.

## Shum Web

<p align="center">
  <img src="docs/screenshots/web.jpg" width="100%" alt="Shum Web in the browser">
</p>

[app.getshum.tech](https://app.getshum.tech) is the same interface in the browser, with nothing to install. It talks through Nostr relays; Bluetooth needs the app or the phone.

## Works with the CLI

The app and [Shum CLI](https://github.com/hiTechTeam/Shum-CLI) use the same profiles. A profile has one owner process on the computer: if the CLI service already runs it, the app joins it; otherwise the app opens it and the CLI joins the app.

## Build

The interface is React (`src`), the desktop shell is Tauri (`src-tauri`). Message logic lives in [Shum-Core](https://github.com/hiTechTeam/Shum-Core); the app only shows it. Needs Node.js 20+ and Rust stable.

```sh
npm install
npm run tauri dev
```

The development build cannot use Bluetooth: macOS attributes it to the terminal. Test anything that opens a profile with the packaged app:

```sh
sh scripts/package_macos.sh    # DMG, Apple Silicon
sh scripts/package_windows.sh  # NSIS installers, cross-built with cargo-xwin
npm run web:deploy             # Shum Web to app.getshum.tech
```

## More

[getshum.tech](https://getshum.tech) · [iPhone](https://github.com/hiTechTeam/Shum-iOS) · [CLI](https://github.com/hiTechTeam/Shum-CLI) · [Rust core](https://github.com/hiTechTeam/Shum-Core) · [Protocol](https://github.com/hiTechTeam/Shum-Protocol) · [Issues](https://github.com/hiTechTeam/Shum-App/issues)

## License

MIT
