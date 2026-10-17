# One-shot helper image: downloads and transcodes the clip into /media.
# Used by deploy/docker/compose.yaml (service `media`); never published.
ARG PYTHON_IMAGE=python:3.14-alpine
FROM ${PYTHON_IMAGE}

ARG YTDLP_VERSION=2026.8.19
# ffmpeg transcodes; node is yt-dlp's JavaScript runtime for YouTube's player challenges.
# Alpine keeps one version per package and branch, so the base image digest pins them.
# hadolint ignore=DL3018
RUN apk add --no-cache ffmpeg nodejs \
 && pip install --no-cache-dir --root-user-action=ignore "yt-dlp[default]==${YTDLP_VERSION}" \
 && adduser -D -u 1000 fetch \
 && mkdir /media && chown fetch:fetch /media

COPY --chmod=0755 scripts/fetch-media.sh /usr/local/bin/fetch-media

USER 1000:1000
ENV OUT_DIR=/media YTDLP_JS_RUNTIMES=node
ENTRYPOINT ["fetch-media"]
