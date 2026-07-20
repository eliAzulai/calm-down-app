#!/usr/bin/env bash
# Task 16: generate the real ElevenLabs SFX one-shots that replace the
# synthetic chime placeholder from prepare-audio.sh.
#
# Requires: ELEVENLABS_API_KEY in env, with the "sound_generation" permission
# enabled on the key (elevenlabs.io -> API Keys -> edit -> Sound Effects).
# Output convention matches the existing SFX asset: mono 96kbps MP3, <= 3 s,
# soft attack (40 ms fade-in), clean tail (0.3 s fade-out), peaks ~ -8 dBFS.
#
# After running: extend SFX_SOUNDS in src/app.js, add the new files to ASSETS
# in src/sw.js, and bump CACHE_NAME (assets are cache-first; an unbumped
# version never reaches already-installed clients).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ELEVENLABS_API_KEY:?export ELEVENLABS_API_KEY first (needs sound_generation permission)}"

RAW=$(mktemp -d)
trap 'rm -rf "$RAW"' EXIT
mkdir -p src/audio/sfx

# id | seconds | prompt  (calm, soft-attack accents for the dev-gated SFX layer)
SPECS=$(cat <<'EOF'
chime|2.5|A single soft gentle wind chime note, warm and round tone, very soft attack, long natural decay, calming and peaceful, no harshness
drop|1.5|A single soft water drop falling into a still pool, gentle round low plip, peaceful, quiet
bird|2.5|A distant soft songbird call, one short gentle phrase, far away, peaceful quiet forest, soothing
bowl|3.0|A low singing bowl swell, deep warm resonance, very soft slow attack, gentle bloom and long fade, meditative and calming
breeze|2.5|A soft gentle breeze rustling through leaves, brief, quiet, smooth and calming, no wind noise harshness
EOF
)

while IFS='|' read -r id dur prompt; do
  [ -z "$id" ] && continue
  echo "-- generating: $id (${dur}s)"
  code=$(curl -s -o "$RAW/$id.mp3" -w "%{http_code}" -X POST \
    "https://api.elevenlabs.io/v1/sound-generation" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
    -d "{\"text\": \"$prompt\", \"duration_seconds\": $dur, \"prompt_influence\": 0.4}")
  if [ "$code" != "200" ]; then
    echo "   FAILED (HTTP $code): $(head -c 160 "$RAW/$id.mp3")" >&2
    exit 1
  fi

  # Peak-normalize to ~ -8 dBFS so the set sits evenly under the sfx bus gain.
  peak=$(ffmpeg -i "$RAW/$id.mp3" -af volumedetect -f null - 2>&1 \
    | awk -F': ' '/max_volume/ {print $2}' | tr -d ' dB')
  gain=$(awk -v p="$peak" 'BEGIN { printf "%.1f", -8 - p }')
  echo "   peak ${peak} dB -> gain ${gain} dB"

  # Cap 3 s, enforce soft attack + clean tail, mono 96k (matches prepare-audio.sh).
  ffmpeg -y -v error -i "$RAW/$id.mp3" \
    -af "atrim=0:3,volume=${gain}dB,afade=t=in:d=0.04,areverse,afade=t=in:d=0.3,areverse" \
    -ac 1 -b:a 96k "src/audio/sfx/$id.mp3"
done <<< "$SPECS"

echo
ls -lh src/audio/sfx/
for f in src/audio/sfx/*.mp3; do
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" \
    | xargs printf "%s: %ss\n" "$f"
done
