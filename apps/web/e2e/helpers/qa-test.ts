import {
  expect,
  test as base,
  type Page,
  type TestInfo,
} from "@playwright/test";

export type QaErrorKind =
  | "console.error"
  | "pageerror"
  | "requestfailed"
  | "http-5xx";

export type QaError = {
  kind: QaErrorKind;
  message: string;
  url?: string;
};

export type QaMetric = {
  name: string;
  durationMs: number;
};

class QaObserver {
  readonly errors: QaError[] = [];
  readonly metrics: QaMetric[] = [];
  readonly accessibilityFindings: string[] = [];
  private readonly allowedErrors: RegExp[] = [
    /net::ERR_ABORTED/i,
    /NS_BINDING_ABORTED/i,
  ];

  allowError(pattern: RegExp): void {
    this.allowedErrors.push(pattern);
  }

  recordAccessibilityFinding(finding: string): void {
    this.accessibilityFindings.push(finding);
  }

  isAllowed(error: QaError): boolean {
    const serialized = `${error.kind} ${error.message} ${error.url ?? ""}`;
    return this.allowedErrors.some((pattern) => pattern.test(serialized));
  }

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      this.metrics.push({
        name,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    }
  }
}

type QaFixtures = {
  qa: QaObserver;
};

async function collectPageMetrics(page: Page, browserName: string) {
  return page.evaluate((currentBrowserName) => {
    const memory = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }
    ).memory;

    return {
      browserName: currentBrowserName,
      openedDocuments: document.querySelectorAll(".document-item").length,
      renderedPages: document.querySelectorAll(".pdf-page").length,
      organizedPages: document.querySelectorAll("[data-testid='organized-page']").length,
      jsHeap:
        currentBrowserName === "chromium" && memory
          ? {
              scope: "JavaScript heap de la page, pas la mémoire totale du navigateur",
              usedBytes: memory.usedJSHeapSize,
              totalBytes: memory.totalJSHeapSize,
              limitBytes: memory.jsHeapSizeLimit,
            }
          : {
              available: false,
              reason: "Mesure CDP comparable non disponible de manière fiable.",
            },
    };
  }, browserName);
}

async function attachDiagnostics(
  page: Page,
  testInfo: TestInfo,
  qa: QaObserver,
): Promise<void> {
  let pageMetrics: Awaited<ReturnType<typeof collectPageMetrics>> | null = null;
  try {
    pageMetrics = await collectPageMetrics(page, testInfo.project.name);
  } catch {
    // The page can already be closed when a navigation or browser startup failed.
  }

  await testInfo.attach("qa-diagnostics", {
    body: Buffer.from(
      JSON.stringify(
        {
          errors: qa.errors,
          allowedErrors: qa.errors.filter((error) => qa.isAllowed(error)),
          unexpectedErrors: qa.errors.filter((error) => !qa.isAllowed(error)),
          operationMetrics: qa.metrics,
          accessibilityFindings: qa.accessibilityFindings,
          pageMetrics,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
}

export const test = base.extend<QaFixtures>({
  qa: [
    async ({ page }, use, testInfo) => {
      const qa = new QaObserver();

      page.on("console", (message) => {
        if (message.type() === "error") {
          qa.errors.push({
            kind: "console.error",
            message: message.text(),
            url: message.location().url,
          });
        }
      });
      page.on("pageerror", (error) => {
        qa.errors.push({ kind: "pageerror", message: error.message });
      });
      page.on("requestfailed", (request) => {
        qa.errors.push({
          kind: "requestfailed",
          message: request.failure()?.errorText ?? "Échec réseau sans détail",
          url: request.url(),
        });
      });
      page.on("response", (response) => {
        if (response.status() >= 500) {
          qa.errors.push({
            kind: "http-5xx",
            message: `HTTP ${response.status()} ${response.statusText()}`,
            url: response.url(),
          });
        }
      });

      await use(qa);
      await attachDiagnostics(page, testInfo, qa);

      const unexpectedErrors = qa.errors.filter((error) => !qa.isAllowed(error));
      expect(
        unexpectedErrors,
        `Erreurs console, page ou réseau inattendues:\n${JSON.stringify(unexpectedErrors, null, 2)}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
