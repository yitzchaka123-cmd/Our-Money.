#!/usr/bin/env bash
# Screenshots of the wallet card and its sheets at phone widths.
#
#   scripts/wallet-shots.sh <outdir> [mode ...]
#
# Writes <outdir>/wallet-<mode>-<width>.png for widths 390 and 360.

set -euo pipefail

OUT="${1:-.shots}"
shift || true
MODES=("$@")
[ ${#MODES[@]} -eq 0 ] && MODES=(card)
mkdir -p "$OUT"

CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary." >&2
  exit 1
fi

HEIGHT="${HEIGHT:-1300}"
for mode in "${MODES[@]}"; do
  npx tsx scripts/preview-wallet.tsx "$OUT/wallet-$mode.html" "$mode" >/dev/null
  for width in 390 360; do
    cat > "$OUT/.frame.html" <<EOF
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
.win{width:${width}px;height:${HEIGHT}px;overflow:hidden;position:relative}
iframe{width:${width}px;height:${HEIGHT}px;border:0;position:absolute;top:0;left:0}</style>
</head><body><div class="win"><iframe src="wallet-$mode.html"></iframe></div></body></html>
EOF
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --force-device-scale-factor=1 --virtual-time-budget=3000 \
      --window-size="$width,$HEIGHT" --screenshot="$OUT/wallet-$mode-$width.png" \
      "file://$(cd "$OUT" && pwd)/.frame.html" 2>/dev/null
  done
done
rm -f "$OUT/.frame.html"
echo "Wrote $OUT/wallet-*.png"
