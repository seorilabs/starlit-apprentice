# Public Release Pages Packet

This file is generated from app spec, store configs, store assets, and `qa/release-artifact-manifest.json`.

The generated HTML files are hostable static page candidates. They do not replace the manual requirement to confirm a public domain and final store-console URLs.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |

## Generated Files

| File | Purpose |
| --- | --- |
| `public-pages/index.html` | Marketing/product page candidate for App Store marketing URL |
| `public-pages/privacy-policy.html` | Privacy policy page candidate for Play/App Store privacy URL |
| `public-pages/support.html` | Support page candidate for App Store support URL |
| `public-pages/assets/icon-512.png` | Copied from `play-store/assets/icon-512.png` |
| `public-pages/assets/feature-graphic-1024x500.png` | Copied from `play-store/assets/feature-graphic-1024x500.png` |

## Suggested URL Mapping

| Store field | Suggested hosted path |
| --- | --- |
| Google Play `privacyPolicyUrl` | `https://<confirmed-domain>/starlit-apprentice/privacy-policy.html` |
| App Store `privacyPolicyUrl` | `https://<confirmed-domain>/starlit-apprentice/privacy-policy.html` |
| App Store `supportUrl` | `https://<confirmed-domain>/starlit-apprentice/support.html` |
| App Store `marketingUrl` | `https://<confirmed-domain>/starlit-apprentice/` |
| Native share ending URL base | `https://<confirmed-domain>/starlit-apprentice/` |

## Remaining Manual Fields

- Google Play: `privacyPolicyUrl` = 확정 필요
- App Store: `privacyPolicyUrl` = 확정 필요
- App Store: `supportUrl` = 확정 필요
- App Store: `marketingUrl` = 확정 필요

## Host And Submission Boundary

- Run `pnpm release:public-pages` before copying this directory to a public host.
- Do not paste placeholder URLs into store consoles. Replace `<confirmed-domain>` with the actual hosted domain only after it is reachable over HTTPS.
- Native share evidence must use a public HTTPS ending URL without username/password credentials; `capacitor://localhost`, `file://`, credentialed HTTPS URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast/special-purpose ranges, and preview-only URLs are not valid recipient handoff proof.
- App, runtime smoke, and store URL checks share the same public URL guard through `@starlit-apprentice/product-core`; username/password credentials, `example.com`, `example.org`, `example.net`, `.example`, `.local`, `.test`, `.invalid`, localhost, non-public/reserved IPv4, and IPv6 local/documentation/multicast/special-purpose hosts are rejected. The IPv4 guard preserves IANA globally reachable `192.0.0.9/32` and `192.0.0.10/32`, while rejecting the surrounding `192.0.0.0/24` and documentation `192.0.2.0/24` ranges. The IPv6 guard rejects release evidence URLs in special-purpose ranges such as `64:ff9b:1::/48`, `100::/64`, `100:0:0:1::/64`, `2001:2::/48`, `3fff::/20`, and `5f00::/16`.
- Do not mark the privacy/support/marketing URL gates complete while `play-store/google-play.config.json` or `app-store/app-store.config.json` still contains `확정 필요` for the corresponding fields.
- If final support contact wording changes, update `scripts/public-release-pages.mjs`, regenerate this packet, and rerun `pnpm check:public-pages`.
