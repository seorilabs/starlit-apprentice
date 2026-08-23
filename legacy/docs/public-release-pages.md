# Public Release Pages

This document describes the static page bundle used for store privacy, support, and marketing URL preparation.

## Generated Files

Run:

```bash
pnpm release:public-pages
pnpm check:public-pages
```

The generator writes:

| File | Purpose |
| --- | --- |
| `public-pages/index.html` | Static marketing/product page candidate |
| `public-pages/privacy-policy.html` | Static privacy policy candidate |
| `public-pages/support.html` | Static support page candidate |
| `public-pages/assets/icon-512.png` | Copied app icon asset |
| `public-pages/assets/feature-graphic-1024x500.png` | Copied feature graphic asset |
| `qa/public-release-pages.md` | Store URL handoff packet and unresolved field list |

`pnpm check:public-pages` fails if any generated HTML, copied page asset, or handoff packet is stale.

## Store URL Mapping

Use the hosted pages only after a real HTTPS domain is confirmed.

| Store field | Hosted path pattern |
| --- | --- |
| Google Play `privacyPolicyUrl` | `https://<confirmed-domain>/starlit-apprentice/privacy-policy.html` |
| App Store `privacyPolicyUrl` | `https://<confirmed-domain>/starlit-apprentice/privacy-policy.html` |
| App Store `supportUrl` | `https://<confirmed-domain>/starlit-apprentice/support.html` |
| App Store `marketingUrl` | `https://<confirmed-domain>/starlit-apprentice/` |
| Native share ending URL base | `https://<confirmed-domain>/starlit-apprentice/` |

## Manual Boundary

- The public release pages are hostable source files, not proof that the URLs are live.
- Do not paste placeholder URLs into Play Console or App Store Connect.
- Do not use credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast/special-purpose ranges, `.local`, `.test`, `.invalid`, or placeholder domains such as `example.com` for store public URLs.
- `pnpm check:store-config` rejects resolved privacy/support/marketing/contact website URLs unless they are public HTTPS URLs.
- Native share evidence must use a public HTTPS ending URL without username/password credentials; `capacitor://localhost`, `file://`, credentialed HTTPS URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast/special-purpose ranges, and preview-only URLs are not valid recipient handoff proof.
- Native share ending URLs must be canonical `?ending=<code>` links only. Existing query parameters and hash fragments from the base URL or current page must not be carried into recipient links.
- Native share ending URL generation must use a known `@starlit-apprentice/product-core` ending code; unknown ending codes must not produce public recipient links.
- App, runtime smoke, and store URL checks share the same public URL guard through `@starlit-apprentice/product-core`; username/password credentials, `example.com`, `example.org`, `example.net`, `.example`, `.local`, `.test`, `.invalid`, localhost, non-public/reserved IPv4, and IPv6 local/documentation/multicast/special-purpose hosts are rejected. The IPv4 guard preserves IANA globally reachable `192.0.0.9/32` and `192.0.0.10/32`, while rejecting the surrounding `192.0.0.0/24` and documentation `192.0.2.0/24` ranges. The IPv6 guard rejects release evidence URLs in special-purpose ranges such as `64:ff9b:1::/48`, `100::/64`, `100:0:0:1::/64`, `2001:2::/48`, `3fff::/20`, and `5f00::/16`.
- Do not mark privacy/support/marketing URL gates complete while the store configs still contain `확정 필요`.
- The support email is `cs@seorilabs.com`; the support page still cannot be used as a final store URL until it is hosted on a confirmed public HTTPS domain.
- If final support wording changes, update `scripts/public-release-pages.mjs`, regenerate the files, and run `pnpm check:public-pages`.

## Privacy Position

The privacy page mirrors `docs/privacy-and-data-safety.md`:

- no user data collected or shared
- local progress and ending collection stored on-device only
- no login, payment, server save, production ad SDK, analytics SDK, Firebase SDK, or tracking SDK
- no remote WebView app URL for store builds

The privacy policy URL remains a manual console gate until the generated page is hosted on the confirmed public domain and the store config is updated.
