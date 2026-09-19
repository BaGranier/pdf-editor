import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenPdfDocument } from "../pdf/documentLifecycle";
import type { PdfSearchHit } from "../pdf/search";
import { searchPdfDocument } from "../pdf/search";
import { usePdfSearch } from "./usePdfSearch";

vi.mock("../pdf/search", async () => {
  const actual = await vi.importActual<typeof import("../pdf/search")>("../pdf/search");
  return {
    ...actual,
    searchPdfDocument: vi.fn(),
  };
});

const document = {
  id: "document-1",
  pageCount: 3,
  pdfDocument: {},
} as OpenPdfDocument;

const searchPdfDocumentMock = vi.mocked(searchPdfDocument);
type WorkspaceMode = "read" | "organize";

function hit(pageNumber: number): PdfSearchHit {
  return {
    id: `hit-${pageNumber}`,
    pageNumber,
    start: 0,
    end: 4,
    context: "Test",
  };
}

describe("usePdfSearch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("only opens in reading mode and cancels a pending scan when closed", async () => {
    vi.useFakeTimers();
    let abortSignal: AbortSignal | undefined;
    searchPdfDocumentMock.mockImplementation(async (_document, _query, options) => {
      abortSignal = options?.signal;
      return [hit(1)];
    });
    const onNavigateToPage = vi.fn();
    const { result, rerender } = renderHook(
      ({ workspaceMode }) => usePdfSearch({
        activeDocument: document,
        activeOrganizationPlan: null,
        workspaceMode,
        onNavigateToPage,
      }),
      { initialProps: { workspaceMode: "organize" as WorkspaceMode } },
    );

    act(() => result.current.openPdfSearch());
    expect(result.current.activeSearch.isOpen).toBe(false);

    rerender({ workspaceMode: "read" });
    act(() => {
      result.current.openPdfSearch();
      result.current.updatePdfSearchQuery("test");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(searchPdfDocumentMock).toHaveBeenCalledOnce();
    expect(result.current.activeSearch.hits).toEqual([hit(1)]);

    act(() => result.current.closePdfSearch());
    expect(result.current.activeSearch.isOpen).toBe(false);
    expect(abortSignal?.aborted).toBe(true);
  });

  it("navigates search hits through the active organization plan", async () => {
    vi.useFakeTimers();
    searchPdfDocumentMock.mockResolvedValue([hit(2)]);
    const onNavigateToPage = vi.fn();
    const { result } = renderHook(() => usePdfSearch({
      activeDocument: document,
      activeOrganizationPlan: {
        sourceDocumentId: document.id,
        pages: [
          {
            id: "page-2",
            sourceDocumentId: document.id,
            sourceDocumentName: "test.pdf",
            sourcePageIndex: 1,
            displayPageNumber: 1,
            rotation: 0,
          },
        ],
      },
      workspaceMode: "read",
      onNavigateToPage,
    }));

    act(() => {
      result.current.openPdfSearch();
      result.current.updatePdfSearchQuery("test");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    expect(result.current.activeSearch.hits).toEqual([hit(2)]);

    act(() => result.current.navigatePdfSearch(1));
    expect(onNavigateToPage).toHaveBeenCalledWith(1);
  });
});
