#!/usr/bin/env bash
# Screenshot the daily brief and the insight cards at phone widths.
#
#   scripts/brief-shots.sh [outdir]
#
# For each of 390×844 and 360×780: the top of the dashboard (carousel and
# blob), the brief's intro card, a charge with an insight, a cash entry, the
# end card, and an insight's popup. Compare with RiseUp's frames side by side.

set -euo pipefail

OUT="${1:-./.shots}"
mkdir -p "$OUT"

CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary." >&2
  exit 1
fi

MODES="top intro item cash end popup"
for mode in $MODES; do
  npx tsx scripts/preview-brief.tsx "$OUT/brief-$mode.html" "$mode" >/dev/null
done

# A fixed-size iframe is the layout viewport (headless --window-size is not),
# and it must be as tall as the phone so fixed layers sit where they would.
shoot() {
  local src="$1" width="$2" height="$3" out="$4"
  cat > "$OUT/.frame.html" <<EOF
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
iframe{width:${width}px;height:${height}px;border:0;display:block}</style>
</head><body><iframe src="$src"></iframe></body></html>
EOF
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=2 --virtual-time-budget=4000 \
    --window-size="$width,$((height + 200))" --screenshot="$OUT/$out" \
    "file://$(cd "$OUT" && pwd)/.frame.html" 2>/dev/null
  # Headless Chrome's viewport is shorter than its window; shoot tall, keep the phone.
  python3 -c "import sys; from PIL import Image; p=sys.argv[1]; Image.open(p).crop((0, 0, $width * 2, $height * 2)).save(p)" "$OUT/$out"
}

for size in 390x844 360x780; do
  w="${size%x*}"
  h="${size#*x}"
  for mode in $MODES; do
    shoot "brief-$mode.html" "$w" "$h" "brief-$mode-$w.png"
  done
done
rm -f "$OUT/.frame.html"
echo "Wrote $(ls "$OUT"/brief-*.png | wc -l) screenshots to $OUT"
