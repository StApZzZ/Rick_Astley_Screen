# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting**
(Security → Report a vulnerability) rather than a public issue. You will get an
answer within a week.

## What is in scope

- the page itself (XSS through the message, the URL fragment or `config.json`,
  CSP bypasses);
- the container image (`ghcr.io/stapzzz/rick-astley-screen`): its Angie
  configuration, the start-up script that renders the config from environment
  variables;
- the supply chain: the CI workflows, signing and provenance.

## How releases are verified

Every image on `main` and every version tag is built once, scanned (Trivy, OWASP
ZAP baseline and full scan against the very digest), and only then signed with
Sigstore keyless signing and given a SLSA build provenance attestation. To verify:

```sh
cosign verify ghcr.io/stapzzz/rick-astley-screen:main \
  --certificate-identity https://github.com/StApZzZ/Rick_Astley_Screen/.github/workflows/release.yml@refs/heads/main \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

gh attestation verify oci://ghcr.io/stapzzz/rick-astley-screen:main --repo StApZzZ/Rick_Astley_Screen
```

## By design

- The page stores nothing and sends nothing anywhere: no cookies, no analytics, no
  requests besides its own files and the video.
- It cannot lock or take over a computer. Fullscreen is the browser's ordinary
  fullscreen (Esc leaves it), and the Keyboard Lock API is not used.
