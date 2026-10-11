# Shum App

Desktop client of Shum for macOS, Windows and Linux. The same React interface
will later run in the browser.

The interface is in `src`, the desktop shell (Tauri) in `src-tauri`. Message
logic lives in Shum-Core (`shum-session`); the app only shows it.

Current stage: chats, contacts and profile on a real profile, shared with the CLI service.

## Run

```bash
npm install
npm run tauri dev
```

Needs Node.js 20+ and Rust stable.
