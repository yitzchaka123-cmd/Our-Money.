#!/usr/bin/env bash
# Rasterise public/icons/icon.svg into the PNG sizes phones ask for.
#
#   scripts/make-icons.sh
#
# Uses headless Chromium, like scripts/ui-shots.sh. The maskable variant keeps
# the glyph inside the 80% safe zone Android crops to, on a full-bleed square.

set -euo pipefail

CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary." >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")/../public/icons" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() {
  local size="$1" out="$2" mode="$3"
  local inner
  if [ "$mode" = maskable ]; then
    # Full-bleed background, glyph scaled into the safe zone.
    inner="<div style=\"width:${size}px;height:${size}px;background:#12b76a;display:grid;place-items:center\"><img src=\"file://$DIR/icon.svg\" style=\"width:$((size * 70 / 100))px;height:$((size * 70 / 100))px\"></div>"
  else
    inner="<img src=\"file://$DIR/icon.svg\" style=\"width:${size}px;height:${size}px;display:block\">"
  fi
  cat > "$TMP/i.html" <<HTML
<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>$inner</body></html>
HTML
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor=1 --window-size="$size,$((size + 200))" --screenshot="$TMP/raw.png" "file://$TMP/i.html" 2>/dev/null
  # The window is taller than the icon because headless Chrome's viewport is
  # shorter than its window; crop back to the exact square.
  python3 -c "from PIL import Image; Image.open('$TMP/raw.png').crop((0, 0, $size, $size)).save('$DIR/$out')"
}

render 192 icon-192.png plain
render 512 icon-512.png plain
render 512 icon-maskable-512.png maskable
render 180 apple-touch-icon.png maskable
echo "Wrote icons to $DIR"
