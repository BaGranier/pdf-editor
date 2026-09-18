import { describe, expect, it, vi } from "vitest";
import { searchPdfDocument, searchPdfPage } from "./search";

const pageWithText = (items: Array<{ str: string; transform?: number[]; width?: number; height?: number }>) => ({
  getTextContent: vi.fn().mockResolvedValue({
    items: items.map((item) => ({
      transform: [1, 0, 0, 12, 20, 60],
      width: 120,
      height: 12,
      ...item,
    })),
  }),
});

describe("PDF text search", () => {
  it("returns compact page-text offsets without retaining page geometry", async () => {
    const hits = await searchPdfPage(pageWithText([{ str: "Paris Montparnasse Montparnasse" }]), 3, "montparnasse");

    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ pageNumber: 3, start: 6, end: 18 });
    expect(hits[0].context).toContain("Montparnasse");
  });

  it("scans sequentially, reports partial results and is case-insensitive Unicode", async () => {
    const first = pageWithText([{ str: "Été à Paris" }]);
    const second = pageWithText([{ str: "PARIS le soir" }]);
    const progress = vi.fn();
    const document = {
      numPages: 2,
      getPage: vi.fn().mockImplementation((number: number) => Promise.resolve(number === 1 ? first : second)),
    };

    const hits = await searchPdfDocument(document, "paris", { onProgress: progress });

    expect(hits.map((hit) => hit.pageNumber)).toEqual([1, 2]);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ pagesScanned: 2, totalPages: 2, hits }));
    expect(document.getPage).toHaveBeenCalledTimes(2);
  });

  it("stops before scanning additional pages when cancelled", async () => {
    const controller = new AbortController();
    const first = pageWithText([{ str: "première" }]);
    const document = {
      numPages: 3,
      getPage: vi.fn().mockImplementation(async (number: number) => {
        if (number === 1) controller.abort();
        return first;
      }),
    };

    await expect(searchPdfDocument(document, "première", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(document.getPage).toHaveBeenCalledTimes(1);
  });
});
