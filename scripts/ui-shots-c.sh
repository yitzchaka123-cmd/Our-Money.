#!/usr/bin/env bash
# Shoot the wallets / accounts / settings / drawer / loading previews at phone
# widths, the same way scripts/ui-shots.sh shoots the dashboard: each page in
# a fixed-width iframe, since headless Chrome's window size does not set the
# layout viewport.
#
#   scripts/ui-shots-c.sh [outdir]      → <outdir>/<screen>-<width>.png

set -euo pipefail

OUT="${1:-./.shots}"
HEIGHT="${HEIGHT:-844}"
mkdir -p "$OUT"

CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary." >&2
  exit 1
fi

npx tsx scripts/preview-c.tsx "$OUT" >/dev/null
ABS="$(cd "$OUT" && pwd)"

for page in "$ABS"/*.html; do
  name="$(basename "$page" .html)"
  case "$name" in .frame*) continue ;; esac
  # Full pages are shot tall enough to see every section; sheets at phone height.
  case "$name" in accounts|settings) h=$((HEIGHT * 2)) ;; *) h=$HEIGHT ;; esac
  for width in 390 360; do
    cat > "$ABS/.frame.html" <<EOF
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
.win{width:${width}px;height:${h}px;overflow:hidden;position:relative}
iframe{width:${width}px;height:${h}px;border:0;position:absolute;top:0;left:0}</style>
</head><body><div class="win"><iframe src="file://$page"></iframe></div></body></html>
EOF
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --force-device-scale-factor=2 --virtual-time-budget=3000 \
      --window-size="$width,$((h + 120))" --screenshot="$ABS/$name-$width.png" \
      "file://$ABS/.frame.html" 2>/dev/null
  done
done
rm -f "$ABS/.frame.html"
ls "$ABS"/*.png
