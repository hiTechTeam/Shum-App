#!/bin/sh
# Cross-build the Windows installers (NSIS) for x64 and ARM64 on macOS, the
# same way Shum CLI's Windows builds are made.
# Needs: cargo-xwin, Homebrew llvm and lld (clang-cl, lld-link), cmake, nasm, makensis.
# Output: packages/windows/Shum-Windows-x64-setup.exe and Shum-Windows-arm64-setup.exe
set -eu
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$HOME/.cargo/bin:$PATH"
# makensis aborts (std::bad_alloc) when no locale is set.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
out=packages/windows
rm -rf "$out"
mkdir -p "$out"
for pair in x64:x86_64-pc-windows-msvc arm64:aarch64-pc-windows-msvc; do
    arch=${pair%%:*}
    target=${pair#*:}
    npm run tauri build -- --runner cargo-xwin --target "$target" --bundles nsis
    cp src-tauri/target/"$target"/release/bundle/nsis/*-setup.exe "$out/Shum-Windows-$arch-setup.exe"
done
(cd "$out" && shasum -a 256 Shum-Windows-*-setup.exe > SHA256SUMS && ls -l)
