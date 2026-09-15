#!/usr/bin/env bash
# Render the dashboard and capture the screenshots used for design comparison.
#
#   scripts/ui-shots.sh [outdir]
#
# Produces, at a real 432px phone width:
#   ours-full.png        whole page, 1x
#   ours-top.png         app bar → first envelope, 2x
#   ours-breakdown.png   an expanded breakdown table, 2x
#
# Put RiseUp screenshots next to these and compare region by region — see
# docs/ui-comparison.md.

set -euo pipefail

OUT="${1:-./ui-shots}"
WIDTH=432
mkdir -p "$OUT"

CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary." >&2
  exit 1
fi

npx tsx scripts/preview-dashboard.tsx "$OUT/ours.html" >/dev/null
npx tsx scripts/preview-dashboard.tsx "$OUT/ours-expanded.html" expanded >/dev/null

# The page is rendered inside a fixed-width iframe because headless Chrome's
# --window-size does not reliably set the layout viewport; the iframe does.
frame() {
  local src="$1" height="$2" offset="$3" out="$4"
  cat > "$OUT/.frame.html" <<EOF
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
.win{width:${WIDTH}px;height:${height}px;overflow:hidden;position:relative}
iframe{width:${WIDTH}px;height:6000px;border:0;position:absolute;top:-${offset}px;left:0}</style>
</head><body><div class="win"><iframe src="$src"></iframe></div></body></html>
EOF
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor="$5" --virtual-time-budget=4000 \
    --window-size="$WIDTH,$height" --screenshot="$OUT/$out" \
    "file://$(cd "$OUT" && pwd)/.frame.html" 2>/dev/null
}

frame ours.html 3600 0 ours-full.png 1
frame ours.html 900 0 ours-top.png 2
frame ours-expanded.html 900 760 ours-breakdown.png 2
rm -f "$OUT/.frame.html"

echo "Wrote $OUT/ours-full.png, $OUT/ours-top.png, $OUT/ours-breakdown.png"
