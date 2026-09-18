import { useLayoutEffect, useState } from "react";
import type { PdfSearchHit } from "../pdf/search";
import { resolveSearchHitRects, type SearchOverlayRect } from "../pdf/searchGeometry";

type ResolvedHit = { id: string; rects: SearchOverlayRect[] };

export function PdfSearchHighlights({
  hits,
  activeHitId,
  textLayer,
  surface,
  textLayerRevision,
}: {
  hits: PdfSearchHit[];
  activeHitId: string | null;
  textLayer: HTMLElement | null;
  surface: HTMLElement | null;
  textLayerRevision: number;
}) {
  const [resolvedHits, setResolvedHits] = useState<ResolvedHit[]>([]);

  useLayoutEffect(() => {
    if (!textLayer || !surface || textLayer.hidden) {
      setResolvedHits([]);
      return;
    }
    setResolvedHits(hits.map((hit) => ({ id: hit.id, rects: resolveSearchHitRects(hit, textLayer, surface) })));
  }, [hits, surface, textLayer, textLayerRevision]);

  return (
    <div className="pdf-search-highlights" aria-hidden="true">
      {resolvedHits.flatMap((hit) => hit.rects.map((rect, rectIndex) => (
        <span
          key={`${hit.id}:${rectIndex}`}
          className={hit.id === activeHitId ? "pdf-search-highlight is-active" : "pdf-search-highlight"}
          style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
        />
      )))}
    </div>
  );
}
