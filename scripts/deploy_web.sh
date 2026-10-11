#!/bin/sh
# Publishes the browser version, Shum Web, to https://app.getshum.tech:
# builds Shum-Core for the browser and the interface, then pushes the result
# to the gh-pages branch of r66cha/Shum-Web, which GitHub Pages serves.
# The hiTechTeam organization cannot run Pages, so the site lives in the
# personal account like the main site.
set -eu
cd "$(dirname "$0")/.."
sh ../Shum-Core/scripts/build-web.sh src/web/core
npx tsc --noEmit
npx vite build --outDir packages/web --emptyOutDir
echo app.getshum.tech > packages/web/CNAME
touch packages/web/.nojekyll
core=$(git -C ../Shum-Core rev-parse --short HEAD)
app=$(git rev-parse --short HEAD)
cat > packages/web/README.md <<NOTE
# Shum Web

The browser version of Shum, served at https://app.getshum.tech.

This repository holds only the built files that GitHub Pages serves. The
source is the React interface of the desktop app,
[hiTechTeam/Shum-App](https://github.com/hiTechTeam/Shum-App) (\`src/\`, with the
browser parts in \`src/web/\`), and Shum-Core compiled to WebAssembly from
[hiTechTeam/Shum-Core](https://github.com/hiTechTeam/Shum-Core) (\`crates/shum-web\`).

Built from Shum-App $app and Shum-Core $core by \`npm run web:deploy\`.

## Русский

Браузерная версия Shum: https://app.getshum.tech.

Здесь лежат только собранные файлы, которые раздаёт GitHub Pages. Исходники —
интерфейс на React из [hiTechTeam/Shum-App](https://github.com/hiTechTeam/Shum-App)
и Shum-Core из [hiTechTeam/Shum-Core](https://github.com/hiTechTeam/Shum-Core).

Собрано из Shum-App $app и Shum-Core $core.
NOTE
cd packages/web
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Shum Web from Shum-App $app, Shum-Core $core"
git push -q -f https://github.com/r66cha/Shum-Web.git gh-pages
rm -rf .git
echo "Published Shum-App $app with Shum-Core $core"
