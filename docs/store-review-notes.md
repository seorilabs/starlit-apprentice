# Store Review Notes

## Review Position

`starlit-apprentice` is not a remote website wrapper. The Canvas/Vite output is bundled inside the Capacitor Android/iOS app package and runs as the game client.

## MVP Limits

- No remote JavaScript update path.
- No untrusted WebView content.
- No login, payment, server save, sensitive data collection, or production ad SDK.
- Local progress and ending collection are stored on-device only.

## Reviewer Flow

1. Launch the app.
2. Tap `새로 시작`.
3. Select four weekly actions for the month.
4. Advance through 12 months.
5. Confirm the ending card and ending collection.

## Policy Notes

- Apple risk to avoid: app must not feel like a repackaged website and must not download executable game code after review.
- Google Play risk to avoid: app must provide sufficient interactive content and must not expose unsafe JavaScript bridges to untrusted content.
- AppsInToss game release risk to avoid: game rating classification evidence must match the submitted game build.
- Rating questionnaire evidence: `qa/rating-content-inventory.md` is generated from product-core content and store configs, and should be used as repo-local input evidence for AppsInToss game rating, Google Play content/Korea rating, and App Store age rating console flows.
- Public URL evidence: `qa/public-release-pages.md` maps the hostable `public-pages/` privacy, support, and marketing pages to store URL fields; final HTTPS URLs remain manual gates.
- WebView security position: CSP keeps scripts and runtime connections self-only, blocks frame/object/form surfaces, and the Capacitor shell uses bundled `dist` without `server.url`.
- Native bundle position: Android/iOS public bundles must match the latest Vite `dist` by file hash after `pnpm cap:sync`; only Capacitor `cordova.js` shims may exist as extra public files.

## WebView Security

- Security evidence is documented in `docs/webview-security.md`.
- Run `pnpm check:webview-security` before store handoff so source and production `dist/index.html` keep the same CSP and local-bundle boundary.

## Native Bundle Sync

- Native bundle evidence is documented in `docs/native-bundle-sync.md`.
- Run `pnpm cap:sync` and `pnpm check:native-bundle-sync` before store handoff so Android/iOS packaged WebView assets cannot lag behind the current web build.

## Third-Party Notices

- Shipped runtime/native shell third-party packages are documented in `docs/third-party-notices.md`.
- Run `pnpm check:third-party-notices` before store handoff so Capacitor license metadata and dependency coverage stay current.
