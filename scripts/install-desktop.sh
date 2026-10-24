#!/usr/bin/env bash
# Installiert das IRON-VAULT-AppImage für den aktuellen Benutzer (kein root nötig):
#   - Programm nach ~/Applications/IRON_VAULT.AppImage
#   - Startmenü-Eintrag und Symbol (KDE, GNOME, XFCE …)
#
# Aufruf:  bash install-desktop.sh [PFAD/ZUM/IRON_VAULT-….AppImage]
#          bash install-desktop.sh --remove     (wieder entfernen)
set -euo pipefail

APP_DIR="$HOME/Applications"
TARGET="$APP_DIR/IRON_VAULT.AppImage"
DESKTOP="$HOME/.local/share/applications/iron-vault.desktop"
ICON="$HOME/.local/share/icons/hicolor/512x512/apps/iron-vault.png"

refresh() {
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
}

if [[ "${1:-}" == "--remove" ]]; then
  rm -f "$TARGET" "$DESKTOP" "$ICON"
  refresh
  echo "IRON VAULT entfernt."
  exit 0
fi

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  # Neuestes AppImage neben dem Skript oder in release/
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SRC="$(ls -t "$here"/IRON_VAULT-*.AppImage "$here"/../release/IRON_VAULT-*.AppImage 2>/dev/null | head -n1 || true)"
fi
[[ -f "$SRC" ]] || { echo "AppImage nicht gefunden. Aufruf: bash install-desktop.sh PFAD/IRON_VAULT-….AppImage" >&2; exit 1; }

# AppImages brauchen FUSE 2 (unter CachyOS/Arch: sudo pacman -S fuse2)
if ! ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then
  echo "Hinweis: libfuse2 fehlt – bitte einmal 'sudo pacman -S fuse2' ausführen." >&2
fi

mkdir -p "$APP_DIR" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
cp -f "$SRC" "$TARGET"
chmod +x "$TARGET"

# Symbol aus dem AppImage holen
tmp="$(mktemp -d)"
( cd "$tmp" && "$TARGET" --appimage-extract 'usr/share/icons/hicolor/*/apps/*.png' >/dev/null 2>&1 || true )
found="$(ls -S "$tmp"/squashfs-root/usr/share/icons/hicolor/*/apps/*.png 2>/dev/null | head -n1 || true)"
[[ -n "$found" ]] && cp -f "$found" "$ICON"
rm -rf "$tmp"

cat > "$DESKTOP" <<DESK
[Desktop Entry]
Type=Application
Name=IRON VAULT
Comment=Pilotenkanzel des Mechs IV-04
Exec="$TARGET" %U
Icon=iron-vault
Terminal=false
Categories=Game;Simulation;
StartupWMClass=iron-vault
DESK
refresh
echo "Installiert: $TARGET"
echo "Startmenü: IRON VAULT (Spiele)"
