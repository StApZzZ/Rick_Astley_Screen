# Rick Astley Screen as a page of an existing site

Two ways to put the prank under a path of a site you already run, for example
`https://intranet.example.com/rick/`. The build uses relative URLs only, so it
works under any prefix.

## A. Reverse proxy to the container

Run the container (`docker run -d -p 127.0.0.1:8080:8080 ghcr.io/stapzzz/rick-astley-screen`),
then route the path to it. Snippets: [Angie](angie.conf) (the same lines work in nginx)
and [Traefik](traefik.yaml).

- **The proxy strips the prefix** (Angie/nginx `proxy_pass http://127.0.0.1:8080/;` with
  the trailing slash, Traefik `stripPrefix`): nothing else to do.
- **The proxy keeps the prefix:** start the container with `RICKROLL_BASE_PATH=/rick/`.

The container sends its own security headers (CSP, COOP/COEP, nosniff, ...). If the
outer site adds a CSP of its own, the browser enforces both: make sure the outer one
allows `media-src` / `connect-src` for the video origin and `blob:`, or exclude the path.

## B. Copy the static files

No container at all: download `rick-astley-screen-dist.tar.gz` from the latest
[release](https://github.com/StApZzZ/Rick_Astley_Screen/releases) (or `npm ci && npm run build`),
unpack it into the site's web root as `rick/`, put the clip at
`rick/media/never-gonna-give-you-up.mp4`, and edit `rick/config.json` if you want
another default message or a CDN URL for the video.

Then add the headers the container would have sent; [angie-static.conf](angie-static.conf)
shows them for Angie (and nginx).
