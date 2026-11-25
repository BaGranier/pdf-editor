import { TextSelectionActions } from "./TextSelectionActions";
import { useLocale } from "../viewer/locale";
import { useMemo, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { PdfRect, RedactionEdit } from "../editing/types";
import { coveringRect, glyphRect, indexedLines, selectedGlyphRects, type IndexedPage } from "../editing/redactionIndex";
import { pdfRectToViewportStyle } from "../editing/coordinates";

export function IndexedTextSelection({ page, zones, viewport, onRedact, onComment }: {
  page: IndexedPage;
  zones: RedactionEdit[];
  viewport: PageViewport;
  onRedact: (rects: PdfRect[]) => void;
  onComment: (rects: PdfRect[]) => void;
}) {
  const { t } = useLocale();
  const layer = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const dragStart = useRef<number | null>(null);
  const data = useMemo(() => {
    const lines = indexedLines(page, zones);
    const glyphs = lines.flatMap((line, lineIndex) => line.map((glyph) => ({ glyph, box: glyphRect(glyph), lineIndex })));
    return { glyphs };
  }, [page, zones]);

  function hit(x: number, y: number, nearest: boolean) {
    const bounds = layer.current!.getBoundingClientRect();
    const [px, py] = viewport.convertToPdfPoint((x - bounds.left) * viewport.width / bounds.width, (y - bounds.top) * viewport.height / bounds.height);
    let found = -1, distance = Infinity;
    for (const [index, { box, glyph }] of data.glyphs.entries()) {
      if (!glyph[0].trim()) continue;
      const dx = Math.max(box.x0 - px, px - box.x1, 0);
      const dy = Math.max(box.y0 - py, py - box.y1, 0);
      if (!nearest && (dx > 2 || dy > 2)) continue;
      const score = dx * dx + dy * dy + Math.hypot(px - (box.x0 + box.x1) / 2, py - (box.y0 + box.y1) / 2) * 0.001;
      if (score < distance) { found = index; distance = score; }
    }
    return found;
  }

  const rects = useMemo(() => {
    if (!selection) return [];
    const lines = new Map<number, typeof data.glyphs[number]["glyph"][]>();
    for (const { glyph, lineIndex } of data.glyphs.slice(Math.min(selection.start, selection.end), Math.max(selection.start, selection.end) + 1)) {
      const line = lines.get(lineIndex) ?? [];
      line.push(glyph);
      lines.set(lineIndex, line);
    }
    return [...lines.values()].flatMap(selectedGlyphRects);
  }, [data, selection]);
  const anchor = rects.length ? pdfRectToViewportStyle(viewport, coveringRect(rects)) : null;

  return <div ref={layer} className="indexed-text-selection" aria-label={t("Sélection du texte à biffer")}
    onPointerDown={(event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      event.stopPropagation();
      const index = hit(event.clientX, event.clientY, false);
      setSelection(index < 0 ? null : { start: index, end: index });
      if (index < 0) return;
      dragStart.current = index;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (dragStart.current === null) return;
      const end = hit(event.clientX, event.clientY, true);
      if (end >= 0) setSelection({ start: dragStart.current, end });
    }}
    onPointerUp={() => { dragStart.current = null; }}
    onPointerCancel={() => { dragStart.current = null; setSelection(null); }}
    onDoubleClick={(event) => {
      const index = hit(event.clientX, event.clientY, false);
      if (index < 0) return;
      const glyphs = data.glyphs;
      const isWord = (i: number) => glyphs[i]?.lineIndex === glyphs[index].lineIndex && /[\p{L}\p{N}\p{M}]/u.test(glyphs[i].glyph[0]);
      let start = index, end = index;
      while (isWord(start - 1)) start--;
      while (isWord(end + 1)) end++;
      setSelection({ start, end });
    }}>
    {rects.map((rect, index) => <span key={index} style={pdfRectToViewportStyle(viewport, rect)} />)}
    {anchor ? <div className="indexed-text-selection__actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSelection(null); } }}
      style={{ left: Math.max(0, Math.min(anchor.left, viewport.width - 78)), top: Math.max(0, anchor.top - 32) }}>
      <TextSelectionActions canComment={rects.length <= 500}
        onRedact={() => { onRedact(rects); setSelection(null); }}
        onComment={() => { onComment(rects); setSelection(null); }} />
    </div> : null}
  </div>;
}
