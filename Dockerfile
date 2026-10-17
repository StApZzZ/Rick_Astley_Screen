# syntax=docker/dockerfile:1.20
#
# Rick Astley Screen: static build served by Angie on :8080 as an unprivileged user.
# The clip is NOT in the image (copyright): mount it at /usr/share/angie/html/media
# or point RICKROLL_MEDIA_URL at a CDN. Runtime settings: docker/entrypoint/rickroll-entrypoint.sh.

# Pinned by digest; Dependabot keeps tag and digest current.
ARG NODE_IMAGE=node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
# Angie "minimal": the core modules on Alpine, 19 packages.
ARG ANGIE_IMAGE=docker.angie.software/angie:1.12.4-minimal@sha256:91305b12951efced43afae0d872bc972655d5f7053721c94eff9d28e54b8ab9c

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
FROM ${ANGIE_IMAGE}
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Rick Astley Screen" \
      org.opencontainers.image.description="A harmless Rick Astley prank for colleagues who forget to lock their computer" \
      org.opencontainers.image.source="https://github.com/StApZzZ/Rick_Astley_Screen" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

# Security fixes published since the base image was built (the Trivy gate in
# release.yml blocks anything fixable that is still left), and no default site.
RUN apk upgrade --no-cache \
 && rm -f /etc/angie/http.d/*.conf /etc/angie/stream.d/*.conf /usr/share/angie/html/*

COPY docker/angie/angie.conf /etc/angie/angie.conf
COPY docker/angie/rickroll.conf /etc/angie/http.d/rickroll.conf
COPY docker/angie/rickroll-headers.conf /etc/angie/snippets/rickroll-headers.conf
COPY --chmod=0755 docker/entrypoint/rickroll-entrypoint.sh /usr/local/bin/rickroll-entrypoint
COPY --from=build /src/dist/ /usr/share/angie/html/

# The image's `angie` user (uid 100, gid 101).
USER 100:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/rickroll-entrypoint"]
CMD ["angie", "-g", "daemon off;"]
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
