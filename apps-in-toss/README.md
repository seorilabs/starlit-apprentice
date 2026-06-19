# AppsInToss Notes

- Target appName: `starlit-apprentice`
- Initial route: `/`
- Ending route candidate: `/ending`
- Build source: `apps/starlit-apprentice/dist`
- Release config: `apps-in-toss/apps-in-toss.config.json`
- Release readiness: `docs/apps-in-toss-release.md`
- Static WebView candidate archive: `apps-in-toss/build/starlit-apprentice-webview-candidate.zip`
- Uploadable AppsInToss bundle: `apps-in-toss/build/starlit-apprentice.ait`
- Production ads are excluded from the MVP. Keep ad IDs out of client source until the market integration step.
- `pnpm build:apps-in-toss:candidate` builds both the deterministic static ZIP evidence and the AppsInToss SDK/CLI `.ait` bundle. Console upload and Toss-app QR testing remain manual.

Open items:

- Upload `apps-in-toss/build/starlit-apprentice.ait` to AppsInToss Console or through `ait deploy`.
- Complete QR/Toss-app testing at least once before review request.
- Confirm game category and exposure fields in the AppsInToss console.
- Prepare game rating evidence before release: open-market self-rating data or Game Rating and Administration Committee certificate.
- App feature registration is not treated as required for this repo because AppsInToss docs require it for non-game apps, while this app is classified as a game.
- Registration image candidates are generated under `apps/starlit-apprentice/public`; re-capture after human QA if the UI changes.

Commands:

```bash
pnpm build:apps-in-toss:ait
pnpm build:apps-in-toss:candidate
pnpm check:apps-in-toss
```
