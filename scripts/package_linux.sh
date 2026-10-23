#!/bin/sh
# Linux packages (.deb and AppImage) for x64 and ARM64, built in Docker.
# x64 runs under emulation on Apple Silicon and takes longer.
# Output: packages/linux/, with the .sig of each signed AppImage update.
set -eu
cd "$(dirname "$0")/.."
. scripts/updater_key.sh
out=$(pwd)/packages/linux
rm -rf "$out"
mkdir -p "$out"
for arch in arm64 amd64; do
    # The builder image is made once; rebuilding it needs Docker Hub and
    # nodejs.org, which are not always reachable. SHUM_REBUILD_IMAGE=1 forces it.
    if [ "${SHUM_REBUILD_IMAGE-0}" = 1 ] || ! docker image inspect "shum-app-builder:$arch" >/dev/null 2>&1; then
        docker build --platform "linux/$arch" -t "shum-app-builder:$arch" scripts/linux
    fi
    # The sources are copied in: node_modules and build output stay per system.
    # COPYFILE_DISABLE keeps macOS metadata files (._*) out of the copy.
    COPYFILE_DISABLE=1 tar --no-xattrs --exclude=./node_modules --exclude=./src-tauri/target --exclude=./packages \
        --exclude=./dist --exclude=./.git -cf - . |
    docker run --rm -i --platform "linux/$arch" \
        -v "shum-app-cargo-$arch:/root/.cargo/registry" \
        -v "shum-app-target-$arch:/work/src-tauri/target" \
        -v "$out:/out" \
        -e RUSTUP_TOOLCHAIN=stable \
        -e TAURI_SIGNING_PRIVATE_KEY -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
        -e SHUM_UNPACK_APPIMAGE_TOOLS="$([ "$arch" = amd64 ] && echo 1 || echo 0)" \
        "shum-app-builder:$arch" sh -euc 'mkdir -p /work && tar -xf - -C /work && sh /work/scripts/linux/build-in-container.sh'
done
(cd "$out" && shasum -a 256 *.deb *.AppImage > SHA256SUMS && ls -l)
