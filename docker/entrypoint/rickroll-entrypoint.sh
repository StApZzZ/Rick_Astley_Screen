#!/bin/sh
# Container entrypoint: renders the deployment-specific pieces from environment
# variables into /tmp/rickroll, then execs the command (Angie by default).
#
#   RICKROLL_DEFAULT_MESSAGE    text shown when the prankster just presses OK
#   RICKROLL_MEDIA_URL          video URL: a path relative to the page or an absolute http(s) URL
#   RICKROLL_MEDIA_TYPE         its MIME type                         (video/mp4)
#   RICKROLL_MEDIA_ORIGINS      extra origins for the CSP media-src/connect-src, space-separated
#                               (the origin of an absolute RICKROLL_MEDIA_URL is added by itself)
#   RICKROLL_ARM_DELAY_MS       stillness before the trap arms         (1500)
#   RICKROLL_MOVE_THRESHOLD_PX  pointer travel that springs it         (12)
#   RICKROLL_LOOP               loop the video                         (true)
#   RICKROLL_LOCK_HINT          show the "lock your computer" hint     (true)
#   RICKROLL_PREFETCH           download the whole clip up front       (true)
#   RICKROLL_BASE_PATH          serve under this prefix when the proxy does not strip it (/)
#
# A malformed value stops the container: better a failed rollout than a page
# whose CSP silently blocks the video.
set -eu

OUT=/tmp/rickroll
mkdir -p "$OUT"

die() {
  echo "rickroll-entrypoint: $*" >&2
  exit 1
}

# JSON string body: control characters become spaces, \ and " are escaped.
json_str() {
  printf '%s' "$1" | tr '\000-\037\177' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

uint() { # <name> <value> <max>
  case "$2" in '' | *[!0-9]*) die "$1 must be a non-negative integer, got '$2'" ;; esac
  if [ "${#2}" -gt 6 ] || [ "$2" -gt "$3" ]; then die "$1 must be <= $3, got '$2'"; fi
  printf '%s' "$2"
}

boolean() { # <name> <value>
  case "$2" in true | false) printf '%s' "$2" ;; *) die "$1 must be true or false, got '$2'" ;; esac
}

origin_ok() {
  printf '%s' "$1" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
}

message=${RICKROLL_DEFAULT_MESSAGE:-Надо блокировать комп, лови Рикролл 🐸}
media_url=${RICKROLL_MEDIA_URL:-media/never-gonna-give-you-up.mp4}
media_type=${RICKROLL_MEDIA_TYPE:-video/mp4}
arm_delay=$(uint RICKROLL_ARM_DELAY_MS "${RICKROLL_ARM_DELAY_MS:-1500}" 60000)
threshold=$(uint RICKROLL_MOVE_THRESHOLD_PX "${RICKROLL_MOVE_THRESHOLD_PX:-12}" 500)
loop=$(boolean RICKROLL_LOOP "${RICKROLL_LOOP:-true}")
lock_hint=$(boolean RICKROLL_LOCK_HINT "${RICKROLL_LOCK_HINT:-true}")
prefetch=$(boolean RICKROLL_PREFETCH "${RICKROLL_PREFETCH:-true}")
base_path=${RICKROLL_BASE_PATH:-/}

# The URL goes into JSON and its origin into a header: allow URL characters only.
printf '%s' "$media_url" | grep -Eq "^[A-Za-z0-9._~:/?#@!\$&()*+,;=%-]+\$" \
  || die "RICKROLL_MEDIA_URL has characters outside the URL set: '$media_url'"
case "$media_url" in
  //*) die "RICKROLL_MEDIA_URL must not be protocol-relative" ;;
  http://* | https://*) ;;
  *:*) die "RICKROLL_MEDIA_URL: only http(s) URLs or relative paths" ;;
esac
printf '%s' "$media_type" | grep -Eq '^(video|audio)/[a-z0-9.+-]+$' \
  || die "RICKROLL_MEDIA_TYPE must look like video/mp4, got '$media_type'"

origins=""
case "$media_url" in
  http://* | https://*)
    o=$(printf '%s' "$media_url" | sed -E 's#^(https?://[^/?#]+).*#\1#')
    origin_ok "$o" || die "cannot derive an origin from RICKROLL_MEDIA_URL: '$o'"
    origins=$o
    ;;
esac
for o in ${RICKROLL_MEDIA_ORIGINS:-}; do
  origin_ok "$o" || die "RICKROLL_MEDIA_ORIGINS: '$o' is not an origin (scheme://host[:port])"
  origins="$origins $o"
done
origins=$(printf '%s' "$origins" | sed -e 's/^ *//')

cat > "$OUT/config.json" <<EOF
{
  "defaultMessage": "$(json_str "$message")",
  "media": [{ "src": "$(json_str "$media_url")", "type": "$media_type" }],
  "armDelayMs": $arm_delay,
  "moveThresholdPx": $threshold,
  "loop": $loop,
  "lockHint": $lock_hint,
  "prefetch": $prefetch
}
EOF

media_src="'self' blob:${origins:+ $origins}"
connect_src="'self'${origins:+ $origins}"
csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src $media_src; connect-src $connect_src; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'"
printf 'add_header Content-Security-Policy "%s" always;\n' "$csp" > "$OUT/csp.conf"

case "$base_path" in
  /) printf '# served at the root\n' > "$OUT/base-path.conf" ;;
  /*/)
    printf '%s' "$base_path" | grep -Eq '^(/[A-Za-z0-9._~-]+)+/$' \
      || die "RICKROLL_BASE_PATH must look like /some/path/, got '$base_path'"
    bare=${base_path%/}
    cat > "$OUT/base-path.conf" <<EOF
location = $bare {
    return 301 $base_path;
}
rewrite ^$bare/(.*)\$ /\$1 last;
EOF
    ;;
  *) die "RICKROLL_BASE_PATH must start and end with /, got '$base_path'" ;;
esac

echo "rickroll-entrypoint: media ${media_url} (${media_type}); base path ${base_path}; extra origins: ${origins:-none}"

exec "$@"
