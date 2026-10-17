#!/bin/sh
# Download "Never Gonna Give You Up" and transcode it for the web:
# 720p H.264 High + AAC, +faststart (playback starts before the download ends), ~25 MB.
#
#   scripts/fetch-media.sh [URL] [OUT_DIR]
#
# Needs yt-dlp (with a JS runtime for YouTube: deno or node) and ffmpeg on PATH,
# or run it in a container: docker compose -f deploy/docker/compose.yaml run --rm media
# The clip is copyrighted: keep it out of git and out of public images.
set -eu

URL=${1:-${MEDIA_SOURCE_URL:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}}
OUT_DIR=${2:-${OUT_DIR:-media}}
NAME=${MEDIA_NAME:-never-gonna-give-you-up.mp4}
OUT="$OUT_DIR/$NAME"

if [ -s "$OUT" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "fetch-media: $OUT already exists (FORCE=1 to redo)"
  exit 0
fi

for bin in yt-dlp ffmpeg; do
  command -v "$bin" >/dev/null 2>&1 || { echo "fetch-media: $bin is not on PATH" >&2; exit 1; }
done

mkdir -p "$OUT_DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

yt-dlp --no-playlist --no-progress \
  ${YTDLP_JS_RUNTIMES:+--js-runtimes "$YTDLP_JS_RUNTIMES"} \
  -f 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b' \
  --merge-output-format mp4 -o "$TMP/source.%(ext)s" "$URL"

SRC=$(find "$TMP" -maxdepth 1 -name 'source.*' | head -n 1)
[ -n "$SRC" ] || { echo "fetch-media: download produced no file" >&2; exit 1; }

# Light denoise: the 1987 film grain is what costs the bits.
ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
  -map 0:v:0 -map 0:a:0 \
  -vf "hqdn3d=1.5:1.5:6:6,scale=-2:720:flags=lanczos" \
  -c:v libx264 -preset slow -crf 27 -maxrate 850k -bufsize 1700k \
  -profile:v high -level 4.0 -pix_fmt yuv420p -g 50 \
  -c:a aac -b:a 128k -ac 2 \
  -map_metadata -1 -movflags +faststart \
  "$TMP/$NAME"

mv "$TMP/$NAME" "$OUT"
chmod 0644 "$OUT"
echo "fetch-media: $OUT ($(wc -c < "$OUT") bytes)"
if command -v sha256sum >/dev/null 2>&1; then sha256sum "$OUT"; fi
