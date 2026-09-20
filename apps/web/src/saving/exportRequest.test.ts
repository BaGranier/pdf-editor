import { describe, expect, it, vi } from "vitest";
import { executePdfExport, parsePdfExportWarnings } from "./exportRequest";

describe("executePdfExport", () => {
  it("normalizes a successful PDF response and its export metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-disposition": 'attachment; filename="resultat.pdf"',
        "x-pdf-output-status": "saved",
        "x-pdf-export-warnings": JSON.stringify([
          { type: "text_overflow", editId: "text-1", page: 1, rendering: "expanded" },
        ]),
      }),
      blob: vi.fn().mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" })),
    } as unknown as Response);

    const result = await executePdfExport({
      backendUrl: "http://backend.test",
      formData: new FormData(),
      fallbackFileName: "fallback.pdf",
      fetchImpl,
    });

    if (!result.ok) throw new Error(result.message);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://backend.test/pdf/export/organize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.downloadedName).toBe("resultat.pdf");
    expect(result.outputStatus).toBe("saved");
    expect(result.warnings).toHaveLength(1);
  });

  it("preserves a backend error detail", async () => {
    const result = await executePdfExport({
      backendUrl: "http://backend.test",
      formData: new FormData(),
      fallbackFileName: "fallback.pdf",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ detail: "Plan invalide" }),
      } as unknown as Response),
    });

    expect(result).toEqual({ ok: false, kind: "backend", message: "Plan invalide" });
  });

  it("turns a transport failure into the existing network diagnostic", async () => {
    const result = await executePdfExport({
      backendUrl: "http://backend.test",
      formData: new FormData(),
      fallbackFileName: "fallback.pdf",
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    });

    expect(result).toMatchObject({ ok: false, kind: "network" });
  });
});

describe("parsePdfExportWarnings", () => {
  it("ignores malformed warning payloads", () => {
    expect(parsePdfExportWarnings("not json")).toEqual([]);
    expect(parsePdfExportWarnings(JSON.stringify([{ type: "other" }]))).toEqual([]);
  });
});
