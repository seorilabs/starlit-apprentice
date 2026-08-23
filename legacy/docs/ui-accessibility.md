# UI Accessibility

This document records the local UI accessibility gate for `starlit-apprentice`.

## Gate

Run:

```bash
pnpm check:ui-accessibility
```

The gate builds the production app, starts `vite preview`, and drives Chromium through mobile and desktop viewports.

## Coverage

- visible interactive controls have accessible names
- enabled mobile controls have at least a 44 x 44 CSS pixel target
- desktop controls have at least a 32 x 32 CSS pixel target
- visible text meets the local color contrast baseline
- visible images include an `alt` attribute
- keyboard `Tab` focus lands on an interactive element with a visible focus style
- sticky bottom action bars stay inside the viewport and their enabled controls are not occluded
- the app stylesheet defines explicit focus styles
- the app stylesheet defines `prefers-reduced-motion: reduce` handling
- the reduced-motion canvas remains visually stable and its render-loop stays paused under reduced-motion mode
- title, room, schedule, activity, result, shared-ending, and collection screens are checked

This gate is a local automated baseline. It does not replace target-device manual QA for native WebView chrome, platform font rendering, or subjective readability.
