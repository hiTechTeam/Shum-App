#!/usr/bin/env python3
"""Writes latest.json, which installed desktop apps read to update themselves.

Usage: python3 scripts/updater_manifest.py packages/release-<version>

The release folder holds the files under their published names, each signed
update with its .sig next to it:
  Shum-macOS.app.tar.gz                           (Apple Silicon)
  Shum-Windows-x64-setup.exe, Shum-Windows-arm64-setup.exe
latest.json goes into the same folder and is uploaded with the release; the
apps fetch it from the latest release on GitHub.
"""
import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLATFORMS = {
    "darwin-aarch64": "Shum-macOS.app.tar.gz",
    "windows-x86_64": "Shum-Windows-x64-setup.exe",
    "windows-aarch64": "Shum-Windows-arm64-setup.exe",
}


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    version = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text())["version"]
    base = f"https://github.com/hiTechTeam/Shum-App/releases/download/v{version}"
    notes = folder / "notes.md"
    platforms = {}
    for platform, name in PLATFORMS.items():
        signature = folder / f"{name}.sig"
        if not (folder / name).is_file() or not signature.is_file():
            sys.exit(f"missing {name} or its .sig in {folder}")
        platforms[platform] = {"signature": signature.read_text().strip(), "url": f"{base}/{name}"}
    manifest = {
        "version": version,
        "notes": notes.read_text().split("\n|", 1)[0].strip() if notes.is_file() else f"Shum {version}",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    (folder / "latest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"latest.json for Shum {version}: {', '.join(platforms)}")


if __name__ == "__main__":
    main()
