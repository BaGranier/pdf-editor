import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type {
  FullConfig,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

const artifactKinds = {
  screenshot: "screenshots",
  trace: "traces",
  video: "videos",
} as const;

function safeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export default class ArtifactReporter implements Reporter {
  private outputRoot = path.resolve(process.cwd(), "test-results");

  onBegin(_config: FullConfig): void {
    this.outputRoot = path.resolve(process.cwd(), "test-results");
    Object.values(artifactKinds).forEach((directory) => {
      const artifactDirectory = path.join(this.outputRoot, directory);
      rmSync(artifactDirectory, { recursive: true, force: true });
      mkdirSync(artifactDirectory, { recursive: true });
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) {
      if (!attachment.path) {
        continue;
      }

      const kind = (
        attachment.name === "trace"
          ? "trace"
          : attachment.name === "video"
            ? "video"
            : attachment.contentType.startsWith("image/")
              ? "screenshot"
              : null
      ) as keyof typeof artifactKinds | null;

      if (!kind) {
        continue;
      }

      const projectName = test.parent.project()?.name ?? "unknown";
      const extension = path.extname(attachment.path);
      const fileName = safeName(
        `${projectName}-${test.titlePath().slice(1).join("-")}-retry-${result.retry}`,
      );
      copyFileSync(
        attachment.path,
        path.join(this.outputRoot, artifactKinds[kind], `${fileName}${extension}`),
      );
    }
  }
}
