#!/bin/sh
# Cross-build the Windows installers (NSIS) for x64 and ARM64 on macOS, the
# same way Shum CLI's Windows builds are made.
# Needs: cargo-xwin, Homebrew llvm and lld (clang-cl, lld-link), cmake, nasm, makensis.
# Output: packages/windows/Shum-Windows-x64-setup.exe and Shum-Windows-arm64-setup.exe,
# each with the .sig of its signed update.
set -eu
cd "$(dirname "$0")/.."
. scripts/updater_key.sh
export PATH="/opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$HOME/.cargo/bin:$PATH"
# makensis aborts (std::bad_alloc) when no locale is set.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' src-tauri/tauri.conf.json)
out=packages/windows
rm -rf "$out"
mkdir -p "$out"
for pair in x64:x86_64-pc-windows-msvc arm64:aarch64-pc-windows-msvc; do
    arch=${pair%%:*}
    target=${pair#*:}
    # ring assembles its ARM64 code with clang, which does not take the
    # clang-cl flags cargo-xwin passes by default.
    if [ "$arch" = arm64 ]; then export XWIN_CROSS_COMPILER=clang; else unset XWIN_CROSS_COMPILER; fi
    npm run tauri build -- --runner cargo-xwin --target "$target" --bundles nsis
    # Older versions may still lie next to it: copy this version only.
    cp src-tauri/target/"$target"/release/bundle/nsis/Shum_"$version"_*-setup.exe "$out/Shum-Windows-$arch-setup.exe"
    cp src-tauri/target/"$target"/release/bundle/nsis/Shum_"$version"_*-setup.exe.sig "$out/Shum-Windows-$arch-setup.exe.sig"
done
(cd "$out" && shasum -a 256 Shum-Windows-*-setup.exe > SHA256SUMS && ls -l)
