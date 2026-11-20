import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";
import { addPdfLinkProvenance } from "./scripts/pdfLinkWorker.mjs";

const workerImport = "pdfjs-dist/build/pdf.worker.mjs";
const developmentPath = "/@pdf-studio/pdf-link-worker.mjs";

export function pdfLinkWorker(): Plugin {
  let developmentUrl: string | undefined;
  let source: string | undefined;
  const getSource = () => source ??= addPdfLinkProvenance(
    readFileSync(createRequire(import.meta.url).resolve(workerImport), "utf8"),
  );

  return {
    name: "pdf-link-action-provenance",
    enforce: "pre",
    configureServer(server) {
      developmentUrl = server.config.base.replace(/\/$/, "") + developmentPath;
      server.middlewares.use(developmentUrl, (_request, response) => {
        response.setHeader("Content-Type", "text/javascript");
        response.end(getSource());
      });
    },
    load(id) {
      if (!id.endsWith(`/${workerImport}?url`)) return;
      if (developmentUrl) return `export default ${JSON.stringify(developmentUrl)}`;
      const asset = this.emitFile({ type: "asset", name: "pdf.worker.mjs", source: getSource() });
      return `export default import.meta.ROLLUP_FILE_URL_${asset}`;
    },
  };
}
