import { describe, expect, it, vi } from "vitest";
import { loadPdfComments } from "./comments";

describe("loadPdfComments", () => {
  it("maps native PDF annotations to readable source comments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ annotations: [{ id: "42", pageIndex: 1, type: "highlight", rect: { x0: 10, y0: 20, x1: 30, y1: 40 }, content: "À revoir", author: "QA" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const comments = await loadPdfComments("http://engine", new File(["pdf"], "source.pdf", { type: "application/pdf" }));
    expect(fetchMock).toHaveBeenCalledWith("http://engine/pdf/annotations", expect.objectContaining({ method: "POST" }));
    expect(comments).toEqual([expect.objectContaining({ type: "comment", commentType: "highlight", page: 2, source: "pdf", content: "À revoir" })]);
  });

  it("silently leaves a document usable when annotation extraction fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(loadPdfComments("http://engine", new File(["pdf"], "source.pdf"))).resolves.toEqual([]);
  });
});
