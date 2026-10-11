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
cd packages/web
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Shum Web from Shum-App $app, Shum-Core $core"
git push -q -f https://github.com/r66cha/Shum-Web.git gh-pages
rm -rf .git
echo "Published Shum-App $app with Shum-Core $core"
