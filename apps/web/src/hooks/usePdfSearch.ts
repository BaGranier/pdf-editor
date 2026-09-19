import { useCallback, useEffect, useRef, useState } from "react";
import type { OrganizePagePlan } from "../organize/pagePlan";
import type { OpenPdfDocument } from "../pdf/documentLifecycle";
import { searchPdfDocument, type PdfSearchHit } from "../pdf/search";

export type DocumentSearchState = {
  isOpen: boolean;
  query: string;
  hits: PdfSearchHit[];
  activeHitIndex: number;
  pagesScanned: number;
  totalPages: number;
  status: "idle" | "searching" | "complete" | "error";
  error: string | null;
};

const EMPTY_SEARCH_STATE: DocumentSearchState = {
  isOpen: false,
  query: "",
  hits: [],
  activeHitIndex: 0,
  pagesScanned: 0,
  totalPages: 0,
  status: "idle",
  error: null,
};

type UsePdfSearchOptions = {
  activeDocument: OpenPdfDocument | null;
  activeOrganizationPlan: OrganizePagePlan | null;
  workspaceMode: "read" | "organize";
  onNavigateToPage: (pageNumber: number) => void;
};

/**
 * Keeps document-scoped search state and its cancellable PDF.js scan outside
 * the workspace shell. The caller remains responsible for viewer navigation.
 */
export function usePdfSearch({
  activeDocument,
  activeOrganizationPlan,
  workspaceMode,
  onNavigateToPage,
}: UsePdfSearchOptions) {
  const [searchByDocument, setSearchByDocument] = useState<Record<string, DocumentSearchState>>({});
  const searchGenerationRef = useRef(0);
  const activeSearch = activeDocument
    ? searchByDocument[activeDocument.id] ?? EMPTY_SEARCH_STATE
    : EMPTY_SEARCH_STATE;
  const activeSearchDocumentId = activeDocument?.id ?? null;
  const activeSearchPdfDocument = activeDocument?.pdfDocument ?? null;
  const activeSearchPageCount = activeDocument?.pageCount ?? 0;

  useEffect(() => {
    if (!activeSearchDocumentId || !activeSearchPdfDocument || !activeSearch.isOpen || !activeSearch.query.trim()) {
      return;
    }

    const documentId = activeSearchDocumentId;
    const pdfDocument = activeSearchPdfDocument;
    const pageCount = activeSearchPageCount;
    const query = activeSearch.query;
    const controller = new AbortController();
    const generation = ++searchGenerationRef.current;
    const timer = window.setTimeout(() => {
      setSearchByDocument((current) => ({
        ...current,
        [documentId]: {
          ...(current[documentId] ?? EMPTY_SEARCH_STATE),
          status: "searching",
          hits: [],
          activeHitIndex: 0,
          pagesScanned: 0,
          totalPages: pageCount,
          error: null,
        },
      }));
      void searchPdfDocument(pdfDocument, query, {
        signal: controller.signal,
        onProgress: ({ pagesScanned, totalPages, hits }) => {
          if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
          setSearchByDocument((current) => {
            const state = current[documentId];
            if (!state || state.query !== query || !state.isOpen) return current;
            return {
              ...current,
              [documentId]: {
                ...state,
                hits,
                pagesScanned,
                totalPages,
                activeHitIndex: Math.min(state.activeHitIndex, Math.max(0, hits.length - 1)),
              },
            };
          });
        },
      }).then((hits) => {
        if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
        setSearchByDocument((current) => {
          const state = current[documentId];
          if (!state || state.query !== query || !state.isOpen) return current;
          return {
            ...current,
            [documentId]: {
              ...state,
              hits,
              pagesScanned: pageCount,
              totalPages: pageCount,
              status: "complete",
            },
          };
        });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
        setSearchByDocument((current) => ({
          ...current,
          [documentId]: {
            ...(current[documentId] ?? EMPTY_SEARCH_STATE),
            status: "error",
            error: error instanceof Error ? error.message : "Recherche impossible.",
          },
        }));
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeSearchDocumentId, activeSearchPageCount, activeSearchPdfDocument, activeSearch.isOpen, activeSearch.query]);

  const openPdfSearch = useCallback(() => {
    if (!activeDocument || workspaceMode !== "read") return;
    setSearchByDocument((current) => ({
      ...current,
      [activeDocument.id]: {
        ...(current[activeDocument.id] ?? EMPTY_SEARCH_STATE),
        isOpen: true,
        error: null,
      },
    }));
  }, [activeDocument, workspaceMode]);

  const closePdfSearch = useCallback(() => {
    if (!activeDocument) return;
    searchGenerationRef.current += 1;
    setSearchByDocument((current) => ({
      ...current,
      [activeDocument.id]: EMPTY_SEARCH_STATE,
    }));
  }, [activeDocument]);

  const updatePdfSearchQuery = useCallback((query: string) => {
    if (!activeDocument) return;
    setSearchByDocument((current) => ({
      ...current,
      [activeDocument.id]: {
        ...(current[activeDocument.id] ?? EMPTY_SEARCH_STATE),
        isOpen: true,
        query,
        hits: [],
        activeHitIndex: 0,
        pagesScanned: 0,
        totalPages: activeDocument.pageCount,
        status: query.trim() ? "searching" : "idle",
        error: null,
      },
    }));
  }, [activeDocument]);

  const navigatePdfSearch = useCallback((direction: 1 | -1) => {
    if (!activeDocument || activeSearch.hits.length === 0) return;
    const nextIndex = (activeSearch.activeHitIndex + direction + activeSearch.hits.length) % activeSearch.hits.length;
    const hit = activeSearch.hits[nextIndex];
    const displayPageNumber = activeOrganizationPlan?.pages.findIndex(
      (page) => page.sourceDocumentId === activeDocument.id && page.sourcePageIndex === hit.pageNumber - 1,
    );
    setSearchByDocument((current) => ({
      ...current,
      [activeDocument.id]: {
        ...(current[activeDocument.id] ?? EMPTY_SEARCH_STATE),
        activeHitIndex: nextIndex,
      },
    }));
    if (displayPageNumber !== undefined && displayPageNumber >= 0) {
      onNavigateToPage(displayPageNumber + 1);
    }
  }, [activeDocument, activeOrganizationPlan, activeSearch.activeHitIndex, activeSearch.hits, onNavigateToPage]);

  const forgetPdfSearchDocument = useCallback((documentId: string) => {
    searchGenerationRef.current += 1;
    setSearchByDocument((current) => {
      const remaining = { ...current };
      delete remaining[documentId];
      return remaining;
    });
  }, []);

  return {
    activeSearch,
    openPdfSearch,
    closePdfSearch,
    updatePdfSearchQuery,
    navigatePdfSearch,
    forgetPdfSearchDocument,
  };
}
