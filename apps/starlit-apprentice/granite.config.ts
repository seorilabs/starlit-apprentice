import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "starlit-apprentice",
  brand: {
    displayName: "Star Apprentice",
    primaryColor: "#2a6f6c",
    icon: ""
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite",
      build: "pnpm build:web:apps-in-toss"
    }
  },
  webViewProps: {
    type: "game",
    allowsBackForwardNavigationGestures: false,
    bounces: false,
    mediaPlaybackRequiresUserAction: true,
    overScrollMode: "never",
    pullToRefreshEnabled: false
  },
  permissions: [],
  outdir: "ait-dist"
});
