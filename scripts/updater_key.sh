# Sourced by the packaging scripts: Tauri signs the update files with Shum's
# update key, which stays outside the repository. Installed apps accept only
# updates signed with it, so the key must be kept and backed up.
key=${SHUM_UPDATER_KEY:-$HOME/.tauri/shum-updater.key}
if [ ! -f "$key" ]; then
    echo "Shum update key not found: $key (set SHUM_UPDATER_KEY)" >&2
    exit 1
fi
TAURI_SIGNING_PRIVATE_KEY=$(cat "$key")
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
export TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
