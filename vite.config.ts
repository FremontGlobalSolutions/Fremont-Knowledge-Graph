import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiPlugin } from "./src/server/api-plugin";

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    port: 5199,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "force-graph-2d": ["react-force-graph-2d"],
          // three.js and 3D graph are lazy-loaded via dynamic import,
          // so they land in their own async chunk automatically.
        },
      },
    },
  },
});
