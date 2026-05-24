import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve the workspace library to its source so editing components
      // hot-reloads in the app without rebuilding the library.
      "gepa-viz": resolve(__dirname, "../react/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
