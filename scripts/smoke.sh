#!/bin/sh
# Smoke test of a running Rick Astley Screen: endpoints, security headers, ranges.
#   scripts/smoke.sh http://localhost:8080/ [media path, default media/never-gonna-give-you-up.mp4]
#   SMOKE_CURL_OPTS=-k scripts/smoke.sh https://localhost:8443/    (self-signed proxy in front)
set -eu
BASE=${1:?usage: smoke.sh <base-url> [media-path]}
MEDIA=${2:-media/never-gonna-give-you-up.mp4}
case "$BASE" in */) ;; *) BASE="$BASE/" ;; esac
fail=0
ok() { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fail=1; }

# shellcheck disable=SC2086 # SMOKE_CURL_OPTS is a list of curl flags
curl() { command curl ${SMOKE_CURL_OPTS:-} "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { # <url> <header-name>
  curl -s -D - -o /dev/null "$1" | tr -d '\r' | awk -v h="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" \
    'BEGIN{FS=": "} tolower($1)==h {sub(/^[^:]*: /,""); print; exit}'
}

echo "smoke: $BASE"
check() { # <description> <command...>: ok if the command succeeds
  d=$1; shift
  if "$@"; then ok "$d"; else bad "$d"; fi
}
check "GET / -> 200" [ "$(code "${BASE}")" = 200 ]
check "/healthz -> ok" [ "$(curl -s "${BASE}healthz")" = ok ]
has_config() { curl -s "${BASE}config.json" | grep -q '"defaultMessage"'; }
check "config.json has defaultMessage" has_config
check "POST -> 405" [ "$(code -X POST "${BASE}")" = 405 ]
check "dotfiles -> 404" [ "$(code "${BASE}.env")" = 404 ]

csp=$(header "$BASE" content-security-policy)
for d in "default-src 'none'" "script-src 'self'" "frame-ancestors 'none'" "require-trusted-types-for 'script'"; do
  case "$csp" in *"$d"*) ok "CSP has $d" ;; *) bad "CSP lacks $d" ;; esac
done
case "$csp" in *unsafe-inline* | *unsafe-eval*) bad "CSP allows unsafe-*" ;; esac
for h in x-content-type-options:nosniff x-frame-options:DENY referrer-policy:no-referrer \
  cross-origin-opener-policy:same-origin cross-origin-embedder-policy:require-corp; do
  name=${h%%:*}; want=${h#*:}
  check "$name: $want" [ "$(header "$BASE" "$name")" = "$want" ]
done
case "$(header "$BASE" server)" in *[0-9]*) bad "Server header leaks a version" ;; *) ok "no server version" ;; esac

asset=$(curl -s "$BASE" | sed -n 's/.*src="\.\/\(assets\/[^"]*\.js\)".*/\1/p' | head -n 1)
if [ -n "$asset" ]; then
  case "$(header "$BASE$asset" cache-control)" in *immutable*) ok "assets are immutable" ;; *) bad "assets not immutable" ;; esac
else
  bad "no JS asset referenced from index.html"
fi

if [ "$(code -r 0-99 "$BASE$MEDIA")" = 206 ]; then ok "media range -> 206"; else
  printf '  skip media range (%s not served here)\n' "$MEDIA"
fi

if [ "$fail" != 0 ]; then
  echo "smoke: FAILED"
  exit 1
fi
echo "smoke: all good"
