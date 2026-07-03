#!/usr/bin/env bash
# One-time audio asset prep for Soundscape 2.0.
# Re-encodes source recordings (repo root, untracked) to mono 112kbps MP3
# and generates a placeholder SFX chime until ElevenLabs assets land.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p src/audio/music src/audio/sfx

ffmpeg -y -i "Crystal Bowls at 432Hz.mp3"    -ac 1 -b:a 112k src/audio/music/bowls.mp3
ffmpeg -y -i "Endless Tidal Breath.mp3"      -ac 1 -b:a 112k src/audio/music/tides.mp3
ffmpeg -y -i "Forest Renewal Rain (1).mp3"   -ac 1 -b:a 112k src/audio/music/forest-rain.mp3

# Placeholder accent: soft 540 Hz (C#5 in the A=432 family) strike with long fade.
ffmpeg -y -f lavfi -i "sine=frequency=540:duration=1.5" \
  -af "afade=t=in:d=0.05,afade=t=out:st=0.5:d=1.0,volume=0.4" \
  -ac 1 -b:a 96k src/audio/sfx/chime.mp3

ls -lh src/audio/music src/audio/sfx
