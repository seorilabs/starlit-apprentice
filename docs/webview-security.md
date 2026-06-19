# WebView Security

This document records the WebView security boundary for `starlit-apprentice`.

## Content Security Policy

`apps/starlit-apprentice/index.html` must include:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self' blob:
```

## Policy Boundary

- Scripts must load only from the bundled app origin.
- Runtime network connections are limited to `self`; app source still must not use `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, or `EventSource`.
- `object`, `frame`, `media`, and form submission surfaces are disabled.
- `style-src 'unsafe-inline'` is intentionally allowed because the game uses dynamic progress widths and runtime canvas sizing styles.
- Images may load from bundled assets, `data:`, and `blob:` URLs for imported SVG/data-URL assets and canvas-generated output.
- Capacitor must keep `webDir: "dist"` and must not configure `server.url`.

## Verification

```bash
pnpm check:webview-security
```

`pnpm check:webview-security` builds the app, checks source and production `dist/index.html`, scans app source for remote-link/network primitives, and validates the Capacitor local-bundle boundary.
