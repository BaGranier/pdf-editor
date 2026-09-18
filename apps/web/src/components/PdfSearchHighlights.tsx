import type { CSSProperties } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { PdfSearchHit } from "../pdf/search";

function rectStyle(viewport: PageViewport, rect: PdfSearchHit["rects"][number]): CSSProperties {
  const [firstX, firstY] = viewport.convertToViewportPoint(rect.x0, rect.y0);
  const [secondX, secondY] = viewport.convertToViewportPoint(rect.x1, rect.y1);
  return {
    left: `${Math.min(firstX, secondX)}px`,
    top: `${Math.min(firstY, secondY)}px`,
    width: `${Math.max(1, Math.abs(secondX - firstX))}px`,
    height: `${Math.max(1, Math.abs(secondY - firstY))}px`,
  };
}

export function PdfSearchHighlights({
  hits,
  activeHitId,
  viewport,
}: {
  hits: PdfSearchHit[];
  activeHitId: string | null;
  viewport: PageViewport;
}) {
  return (
    <div className="pdf-search-highlights" aria-hidden="true">
      {hits.flatMap((hit) => hit.rects.map((rect, rectIndex) => (
        <span
          key={`${hit.id}:${rectIndex}`}
          className={hit.id === activeHitId ? "pdf-search-highlight is-active" : "pdf-search-highlight"}
          style={rectStyle(viewport, rect)}
        />
      )))}
    </div>
  );
}
