import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the browser-local practice build from /pact/.
  // Cloudflare and local server builds retain the root path.
  base: mode === "preview" ? "/pact/" : "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 700 },
}));
