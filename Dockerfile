# syntax=docker/dockerfile:1.20
#
# Rick Astley Screen: static build served by unprivileged nginx on :8080.
# The clip is NOT in the image (copyright): mount it at /usr/share/nginx/html/media
# or point RICKROLL_MEDIA_URL at a CDN. Runtime settings: docker/entrypoint/40-rickroll-config.sh.

# Pinned by digest; Dependabot keeps tag and digest current.
ARG NODE_IMAGE=node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine3.24@sha256:782bb89768cc87b7f95c18b95baa1af250e5d451f26794f59363540161147c01

# --- build: platform-independent output, so it always runs natively ----------------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /src
ENV CI=true npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
COPY package.json package-lock.json ./
# No install scripts: nothing in the toolchain needs them.
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- runtime ------------------------------------------------------------------------
FROM ${NGINX_IMAGE}
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Rick Astley Screen" \
      org.opencontainers.image.description="A harmless Rick Astley prank for colleagues who forget to lock their computer" \
      org.opencontainers.image.source="https://github.com/StApZzZ/Rick_Astley_Screen" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

# Security fixes published since the base image was built (the Trivy gate in
# release.yml blocks anything fixable that is still left).
USER 0
RUN apk upgrade --no-cache

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/rickroll-headers.conf /etc/nginx/snippets/rickroll-headers.conf
COPY --chmod=0755 docker/entrypoint/40-rickroll-config.sh /docker-entrypoint.d/40-rickroll-config.sh
COPY --from=build /src/dist/ /usr/share/nginx/html/

USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
