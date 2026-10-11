#!/bin/sh
# Installs a built .deb into a clean Ubuntu container and checks that every
# shared library of the app resolves. Usage (inside the container): check-deb.sh <file.deb>
set -eu
apt-get update -qq >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$1" >/dev/null
binary=$(dpkg -L "$(dpkg-deb -f "$1" Package)" | grep -m1 '/usr/bin/')
echo "installed: $binary"
missing=$(ldd "$binary" | grep "not found" || true)
if [ -n "$missing" ]; then echo "$missing"; exit 1; fi
echo "all libraries found"
ls /usr/share/applications | grep -i shum
