import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { apiPlugin } from "./src/server/api-plugin";

export default defineConfig(({ command, mode }) => {
  // If running the dev server or explicitly building the demo app
  const isDemo = mode === "demo" || command === "serve";

  if (isDemo) {
    return {
      plugins: [react(), apiPlugin()],
      server: {
        port: 5199,
        open: true,
      },
      build: {
        outDir: "dist-demo",
      },
    };
  }

  // Default: Build as a reusable library in ESM/UMD format
  return {
    plugins: [
      react(),
      dts({
        insertTypesEntry: true,
        include: ["src"],
        exclude: ["src/server", "src/workers"],
      }),
    ],
    build: {
      lib: {
        entry: "src/index.ts",
        name: "FremontKnowledgeGraphViewer",
        formats: ["es", "umd"],
        fileName: (format) => `index.${format === "es" ? "js" : "umd.cjs"}`,\\
        cssFileName: "style",
      },
      rollupOptions: {
        // Externalize peer dependencies
        external: ["react", "react-dom"],
        output: {
          globals: {
            react: "React",
            "react-dom": "ReactDOM",
          },
        },
      },
    },
  };
});
