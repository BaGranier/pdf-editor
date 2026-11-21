import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { pdfLinkWorker } from "./pdfLinkWorker";

const fontNoticePath = new URL("../../docs/architecture/NOTICE.md", import.meta.url);
const fontNoticeAsset = "fonts/NOTICE.md";

export default defineConfig({
  plugins: [react(), pdfLinkWorker(), {
    name: "font-attribution-notice",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?", 1)[0] !== `/${fontNoticeAsset}` ||
            (request.method !== "GET" && request.method !== "HEAD")) return next();
        response.setHeader("Content-Type", "text/markdown; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : readFileSync(fontNoticePath));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: fontNoticeAsset, source: readFileSync(fontNoticePath) });
    },
  }, {
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
