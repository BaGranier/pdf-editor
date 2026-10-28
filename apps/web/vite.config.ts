import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, writeFileSync } from "node:fs";

export default defineConfig({
  plugins: [react(), {
    name: "redistributed-module-evidence",
    generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap(output => output.type === "chunk"
        ? Object.entries(output.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id)
        : []);
      mkdirSync("build", { recursive: true });
      writeFileSync("build/frontend-modules.json", JSON.stringify({ modules, assets: Object.keys(bundle) }, null, 2));
    },
  }],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
