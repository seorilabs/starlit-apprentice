# Bundle Budget

This document records the runtime bundle budget for `starlit-apprentice`.

## Gate

Run:

```bash
pnpm check:bundle-budget
```

The gate builds the Vite app and checks the production `apps/starlit-apprentice/dist` output.

## Runtime Asset Boundary

Registration images remain in `apps/starlit-apprentice/public` as source assets for AppsInToss registration checks, but Vite is configured with `publicDir: false` so those registration-only files are not copied into the shipped runtime web bundle.

Runtime dist must not include:

- `starlit-apprentice-icon-600.png`
- `starlit-apprentice-thumbnail-1932x828.png`
- `screenshots/`
- sourcemaps
- external network asset references from `index.html`

## Budgets

| Budget | Limit |
| --- | ---: |
| Total raw dist | 240 KB |
| Total gzip dist | 80 KB |
| JavaScript raw | 170 KB |
| JavaScript gzip | 60 KB |
| CSS raw | 80 KB |
| CSS gzip | 16 KB |
| `index.html` raw | 4 KB |

Warnings appear above 90% of a budget. Exceeding any budget is an automated release blocker.

The current renderer uses the browser Canvas API without a third-party game engine. The 2026-06-18 production build snapshot is approximately 93 KB raw / 25 KB gzip JavaScript, so this budget is intended to catch accidental heavy runtime engine reintroduction while leaving room for normal UI/content growth.
