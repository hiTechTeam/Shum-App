#!/bin/sh
# Universal Shum.app and DMG for macOS 15+, Apple Silicon and Intel, signed
# with the same self-signed "Shum CLI Signing" certificate as the CLI.
# Output: src-tauri/target/universal-apple-darwin/release/bundle/dmg/
set -eu
cd "$(dirname "$0")/.."
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
tools=$(mktemp -d)
trap 'rm -rf "$tools"' EXIT
# Shum-Core's Bluetooth helper is Swift; give swiftc the architecture Cargo
# builds for ($TARGET reaches the build script and its children).
cat > "$tools/xcrun" <<'WRAP'
#!/bin/sh
case "${1-}" in
swiftc)
    shift
    case "${TARGET-}" in
    x86_64-*) arch=x86_64 ;;
    *) arch=arm64 ;;
    esac
    exec /usr/bin/xcrun swiftc -target "$arch-apple-macosx15.0" "$@"
    ;;
*) exec /usr/bin/xcrun "$@" ;;
esac
WRAP
chmod 755 "$tools/xcrun"
export PATH="$tools:$PATH"
export MACOSX_DEPLOYMENT_TARGET=15.0
export SDKROOT="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
export CFLAGS_aarch64_apple_darwin=-mmacosx-version-min=15.0
export CFLAGS_x86_64_apple_darwin=-mmacosx-version-min=15.0
# CI skips the Finder window layout, which would ask to control Finder.
CI=true npm run tauri build -- --target universal-apple-darwin --bundles app,dmg
ls -l src-tauri/target/universal-apple-darwin/release/bundle/dmg/
