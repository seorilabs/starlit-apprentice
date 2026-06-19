# Third-Party Notices

This document records third-party packages that are part of the shipped `starlit-apprentice` runtime or native store shell.

## Shipped Packages

| Package | Version | License | Usage | Source |
| --- | --- | --- | --- | --- |
| `@capacitor/core` | `7.6.5` | MIT | Capacitor runtime bridge used by the bundled-web native shell. | https://capacitorjs.com |
| `@capacitor/android` | `7.6.5` | MIT | Android Capacitor native shell used for Google Play packaging. | https://capacitorjs.com |
| `@capacitor/ios` | `7.6.5` | MIT | iOS Capacitor native shell used for App Store packaging. | https://capacitorjs.com |

## AppsInToss SDK Runtime

`@apps-in-toss/web-framework` `2.9.1` is used to generate the AppsInToss `.ait` bundle. Its installed package license metadata is absent and the package includes a `GPL-3.0` license file, so production submission should keep this notice and review the SDK/runtime license posture before upload.

| Package | Version | License evidence | Usage |
| --- | --- | --- | --- |
| `@apps-in-toss/web-framework` | `2.9.1` | package license metadata is absent; installed `LICENSE` file is `GPL-3.0` text | AppsInToss WebView SDK/CLI used to generate the submitted .ait bundle. |

## Internal Packages

- `@starlit-apprentice/product-core` is a workspace-internal package and is not a third-party dependency.
- The pixel stage uses the browser Canvas API and does not bundle a third-party game engine.

## Build-Time Tooling

Build and test tools such as Vite, TypeScript, Vitest, Playwright, and `@capacitor/cli` are not listed as shipped runtime notices because they are not distributed inside the player-facing game client. `@apps-in-toss/web-framework` is listed separately because it is the official packaging/runtime source for the submitted `.ait` bundle. If another build-time package becomes part of a submitted runtime bundle, this document and `pnpm check:third-party-notices` must be updated together.

## Policy Boundary

- No production ad SDK, analytics SDK, billing SDK, Firebase SDK, or tracking SDK is included in the MVP runtime.
- All currently shipped third-party packages use MIT license metadata in the installed package manifests.
- The checker fails if a new production dependency is added without explicit notice coverage.

## Verification

```bash
pnpm check:third-party-notices
```
