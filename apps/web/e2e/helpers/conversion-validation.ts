import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversionTarget } from "../../src/conversion/conversion";

export type ConversionValidation = {
  valid: boolean;
  size: number;
  text?: string;
  paragraphCount?: number;
  imageCount?: number;
  tableCount?: number;
  sectionCount?: number;
  orientations?: string[];
  imageNonWhiteRatios?: number[];
  imageExtents?: Array<{
    widthPt: number;
    heightPt: number;
    pageWidthRatio: number;
    pageHeightRatio: number;
  }>;
  imageParagraphCount?: number;
  exactLineRuleImageParagraphs?: number;
  clippingDetected?: boolean;
  pageSeparators?: number;
  pageSections?: number;
  externalResourceCount?: number;
  embeddedImageCount?: number;
  archive?: boolean;
  names?: string[];
  images?: Array<{ width: number; height: number; colorspace: string | null }>;
};

const helperDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(helperDirectory, "../../../..");
const backendDirectory = path.join(projectRoot, "services/pdf-engine");
const validationScript = path.join(
  projectRoot,
  "scripts/validate-conversion-output.py",
);

export function validateConversion(
  artifactPath: string,
  targetFormat: ConversionTarget,
): ConversionValidation {
  const output = execFileSync(
    "uv",
    [
      "run",
      "--directory",
      backendDirectory,
      "python",
      validationScript,
      artifactPath,
      "--format",
      targetFormat,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        UV_CACHE_DIR: path.join(projectRoot, ".uv-cache"),
      },
    },
  );
  return JSON.parse(output) as ConversionValidation;
}
