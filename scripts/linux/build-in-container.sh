#!/bin/sh
# Runs inside the shum-app-builder container: builds the .deb and AppImage
# from /work and copies them to /out. Arguments: Tauri bundle list.
set -eu
cd /work
cache=/root/.cache/tauri
mkdir -p "$cache"
# Under x64 emulation on Apple Silicon an AppImage cannot read itself, so the
# AppImage plugin is unpacked beforehand and called through a small wrapper.
if [ "${SHUM_UNPACK_APPIMAGE_TOOLS-0}" = 1 ]; then
    plugin=linuxdeploy-plugin-appimage
    curl -fsSL -o "$cache/$plugin.AppImage" \
        "https://github.com/linuxdeploy/$plugin/releases/download/continuous/$plugin-x86_64.AppImage"
    # The squashfs image follows the ELF runtime; the marker also occurs in
    # the runtime's code, so try each occurrence until one unpacks.
    for offset in $(LC_ALL=C grep -aob hsqs "$cache/$plugin.AppImage" | cut -d: -f1); do
        unsquashfs -q -f -o "$offset" -d "/opt/$plugin" "$cache/$plugin.AppImage" >/dev/null 2>&1 && break
    done
    test -x "/opt/$plugin/AppRun"
    printf '#!/bin/sh\nexec /opt/%s/AppRun "$@"\n' "$plugin" > "$cache/$plugin.AppImage"
    chmod +x "$cache/$plugin.AppImage"
fi
npm ci --no-audit --no-fund
APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true npm run tauri build -- --bundles "${1:-deb,appimage}"
for kind in deb appimage; do
    for file in src-tauri/target/release/bundle/$kind/*; do
        case "$file" in *.deb|*.AppImage) cp "$file" /out/ ;; esac
    done
done
