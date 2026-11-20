import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { normalizePdfRect } from "../editing/coordinates";
import type { LinkDestination, PdfRect } from "../editing/types";

export function safeWebUrl(value: string): string | null {
  const input = value.trim();
  if (input.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(input) || !/^https?:\/\/[^/?#]/i.test(input)) return null;
  try {
    const authority = /^https?:\/\/([^/?#]+)/i.exec(input)?.[1];
    if (!authority || /[@%\s]/.test(authority)) return null;
    const url = new URL(input);
    return url.hostname && !url.username && !url.password ? input : null;
  } catch {
    return null;
  }
}

export async function resolvePdfDestination(
  pdf: PDFDocumentProxy,
  destination: unknown,
): Promise<Extract<LinkDestination, { kind: "internal" }> | null> {
  try {
    const explicit = typeof destination === "string" ? await pdf.getDestination(destination) : destination;
    if (!Array.isArray(explicit) || explicit.length < 2) return null;
    const [page, mode, ...coordinates] = explicit;
    const pageIndex = Number.isInteger(page) ? page : await pdf.getPageIndex(page);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.numPages) return null;
    const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
    const result: Extract<LinkDestination, { kind: "internal" }> = { kind: "internal", pageIndex };
    if (mode?.name === "XYZ" || mode?.name === "FitR" || mode?.name === "FitV" || mode?.name === "FitBV") {
      result.x = coordinate(coordinates[0]);
    }
    if (mode?.name === "XYZ" || mode?.name === "FitH" || mode?.name === "FitBH" || mode?.name === "FitR") {
      result.y = coordinate(coordinates[mode.name === "XYZ" ? 1 : mode.name === "FitR" ? 3 : 0]);
    }
    return result;
  } catch {
    return null;
  }
}

export type SourcePdfLink = {
  id: string;
  rect: PdfRect;
  areas?: PdfRect[];
  destination: LinkDestination | null;
  sourceXref?: number;
  label?: string;
};

export async function readPageLinks(pdf: PDFDocumentProxy, page: PDFPageProxy): Promise<SourcePdfLink[]> {
  const annotations = await page.getAnnotations({ intent: "display" });
  return (await Promise.all(annotations.map(async (annotation): Promise<SourcePdfLink | null> => {
    if (annotation.subtype !== "Link" || !Array.isArray(annotation.rect) ||
        annotation.rect.length !== 4 || !annotation.rect.every(Number.isFinite)) return null;
    const [x0, y0, x1, y1] = annotation.rect;
    const rect = normalizePdfRect({ x0, y0, x1, y1 });
    if (rect.x0 === rect.x1 || rect.y0 === rect.y1) return null;
    const href = annotation.pdfLinkAction === "URI" && typeof annotation.url === "string" && typeof annotation.unsafeUrl === "string"
      ? safeWebUrl(annotation.unsafeUrl) : null;
    const destination = href ? { kind: "uri" as const, url: href }
      : annotation.pdfLinkAction === "GoTo" ? await resolvePdfDestination(pdf, annotation.dest) : null;
    const editable = destination?.kind === "uri" || (destination?.kind === "internal" &&
      Array.isArray(annotation.dest) && ["XYZ", "Fit"].includes(annotation.dest[1]?.name));
    const areas: PdfRect[] = [];
    const points: unknown = annotation.quadPoints;
    if (ArrayBuffer.isView(points) || Array.isArray(points)) {
      const coordinates = Array.from(points as ArrayLike<number>);
      for (let index = 0; index + 7 < coordinates.length; index += 8) {
        const quad = coordinates.slice(index, index + 8);
        if (!quad.every(Number.isFinite)) continue;
        const xs = quad.filter((_, index) => index % 2 === 0);
        const ys = quad.filter((_, index) => index % 2 !== 0);
        areas.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
      }
    }
    const xref = /^([1-9]\d*)R(?:0)?$/.exec(annotation.id);
    return {
      id: annotation.id,
      rect,
      destination,
      areas: areas.length ? areas : undefined,
      sourceXref: editable && annotation.pdfLinkEditable && xref ? Number(xref[1]) : undefined,
      label: typeof annotation.contentsObj?.str === "string" ? annotation.contentsObj.str : undefined,
    };
  }))).filter((link): link is SourcePdfLink => link !== null);
}

export function linkLabel(destination: LinkDestination | null): string {
  if (!destination) return "Lien PDF non pris en charge";
  return destination.kind === "uri" ? `Ouvrir ${destination.url} (lien externe)` : `Aller à la page source ${destination.pageIndex + 1}`;
}
