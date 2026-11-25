import { useEffect, useMemo, useRef, useState } from "react";
import { loadRedactionIndex, type IndexedPage } from "../editing/redactionIndex";
import type { PdfEdit } from "../editing/types";

type PageMap = Map<number, IndexedPage>;
type Progress = { file: File; pages: PageMap; complete: boolean; error: string | null };

export function useRedactionIndex(url: string, file: File | null, total: number, enabled: boolean, edits: PdfEdit[], fontRevision: number) {
  const cache = useRef(new WeakMap<File, PageMap>());
  const [base, setBase] = useState<Progress | null>(null);
  // Changes to zones, watermark, or other non-text edits do not re-render text or redo OCR.
  const editKey = JSON.stringify(edits.filter((edit) =>
    (edit.type === "add_text" && edit.text) || edit.type === "native_text"));
  const [overlay, setOverlay] = useState<{ file: File; editKey: string; revision: number; pages: PageMap; error?: string } | null>(null);
  useEffect(() => {
    if (!file || !enabled) return;
    const cached = cache.current.get(file);
    if (cached) {
      setBase({ file, pages: cached, complete: true, error: null });
      return;
    }
    const controller = new AbortController();
    const pages: PageMap = new Map();
    let updateTimer: number | undefined;
    const publish = () => {
      updateTimer = undefined;
      setBase({ file, pages: new Map(pages), complete: false, error: null });
    };
    publish();
    void loadRedactionIndex(url, file, (page) => {
      pages.set(page.page, page);
      updateTimer ??= window.setTimeout(publish, 75);
    }, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      if (pages.size !== total) throw new Error("Index de texte incomplet.");
      window.clearTimeout(updateTimer);
      cache.current.set(file, pages);
      setBase({ file, pages, complete: true, error: null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(updateTimer);
      setBase({ file, pages, complete: false, error: error instanceof Error ? error.message : "Indexation impossible." });
    });
    return () => { controller.abort(); window.clearTimeout(updateTimer); };
  }, [file, enabled, url, total]);

  useEffect(() => {
    if (!file || !enabled || editKey === "[]") return;
    const controller = new AbortController();
    const edits = JSON.parse(editKey) as PdfEdit[];
    const pages: PageMap = new Map();
    const timer = window.setTimeout(() => {
      void loadRedactionIndex(url, file, (page) => pages.set(page.page, page), controller.signal, edits)
        .then(() => {
          if (pages.size !== new Set(edits.map((edit) => edit.page)).size) throw new Error("Index du texte modifié incomplet.");
          if (!controller.signal.aborted) setOverlay({ file, editKey, pages, revision: fontRevision });
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) setOverlay({ file, editKey, pages, revision: fontRevision, error: error instanceof Error ? error.message : "Indexation du texte modifié impossible." });
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editKey, enabled, file, fontRevision, url]);

  return useMemo(() => {
    const current = base?.file === file ? base : null;
    const edited = overlay?.file === file && overlay.editKey === editKey && overlay.revision === fontRevision ? overlay : null;
    const pages = new Map(current?.pages);
    if (edited && !edited.error) {
      for (const [number, page] of edited.pages) {
        const original = pages.get(number);
        if (original) pages.set(number, { ...original, native: page.native });
      }
    }
    // Until edited geometry is ready, withhold those pages from direct selection.
    if (editKey !== "[]" && (!edited || edited.error)) {
      for (const edit of JSON.parse(editKey) as PdfEdit[]) pages.delete(edit.page);
    }
    return {
      pages, scanned: current?.pages.size ?? 0,
      complete: Boolean(current?.complete && (editKey === "[]" || (edited && !edited.error))),
      error: current?.error ?? edited?.error ?? null,
    };
  }, [base, editKey, file, fontRevision, overlay]);
}
