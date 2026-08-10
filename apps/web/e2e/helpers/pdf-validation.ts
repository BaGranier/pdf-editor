import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ValidatedPdf = {
  valid: boolean;
  pageCount: number;
  imageCount: number;
  text: string;
  pages: Array<{
    width: number;
    height: number;
    rotation: number;
  }>;
};

const helperDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(helperDirectory, "../../../..");
const backendDirectory = path.join(projectRoot, "services/pdf-engine");
const validationScript = path.join(projectRoot, "scripts/validate-qa-pdf.py");

export function validatePdf(pdfPath: string, expectedPages: number): ValidatedPdf {
  const output = execFileSync(
    "uv",
    [
      "run",
      "--directory",
      backendDirectory,
      "python",
      validationScript,
      pdfPath,
      "--expected-pages",
      String(expectedPages),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        UV_CACHE_DIR: path.join(projectRoot, ".uv-cache"),
      },
    },
  );
  return JSON.parse(output) as ValidatedPdf;
}
