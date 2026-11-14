import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // two pages: the game at /, the ontario universities guide at /universities
    rollupOptions: { input: { main: "index.html", universities: "universities/index.html" } },
    // flags stay separate files, fetched one at a time when a card shows them,
    // instead of ~200 of them riding along in the main bundle as data URIs
    assetsInlineLimit: (file) => (/flag-icons[\\/]/.test(file) ? false : undefined),
  },
  test: { environment: "node" },
});
