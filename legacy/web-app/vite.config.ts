import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      "@starlit-apprentice/product-core": fileURLToPath(
        new URL("../../packages/product-core/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5317,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    sourcemap: false,
    target: "es2022",
    chunkSizeWarningLimit: 1400
  }
});
