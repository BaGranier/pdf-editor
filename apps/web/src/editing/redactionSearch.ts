import type { PdfSearchHit } from "../pdf/search";
import type { PdfEdit, PdfRect, RedactionEdit } from "./types";

export async function prepareSearchRedactions(file: File, backendUrl: string, hits: PdfSearchHit[], existing: PdfEdit[], signal?: AbortSignal): Promise<RedactionEdit[]> {
  if (!hits.length || hits.length > 2000 || hits.some((hit) => !hit.proof)) throw new Error("Occurrences sans preuve géométrique. Relancez Rechercher et biffer.");
  const form = new FormData();
  form.append("file", file);
  form.append("selections", JSON.stringify({ matches: hits.map((hit) => ({ id: hit.id, page: hit.pageNumber, proof: hit.proof })) }));
  const response = await fetch(`${backendUrl}/pdf/redaction/resolve`, { method: "POST", body: form, signal });
  const body = await response.json() as { detail?: unknown; matches?: Array<{ id: string; page: number; rects: PdfRect[] }> };
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Géométrie de recherche non vérifiable. Aucune zone créée.");
  const expected = new Map(hits.map((hit) => [hit.id, hit.pageNumber]));
  if (!body.matches || body.matches.length !== expected.size || new Set(body.matches.map((hit) => hit.id)).size !== expected.size) throw new Error("Réponse géométrique incomplète ; aucune zone créée.");
  const edits: RedactionEdit[] = [];
  const covered = existing.filter((edit) => edit.type === "redaction");
  for (const hit of body.matches) {
    if (expected.get(hit.id) !== hit.page || !hit.rects.length) throw new Error("Occurrence géométrique incohérente.");
    for (const rect of hit.rects) {
      if (!Object.values(rect).every(Number.isFinite) || rect.x1 <= rect.x0 || rect.y1 <= rect.y0) throw new Error("Rectangle de recherche invalide.");
      if ([...covered, ...edits].some((edit) => edit.page === hit.page && edit.rect.x0 <= rect.x0 + 0.01 && edit.rect.y0 <= rect.y0 + 0.01 && edit.rect.x1 >= rect.x1 - 0.01 && edit.rect.y1 >= rect.y1 - 0.01)) continue;
      edits.push({ id: `redaction-${crypto.randomUUID()}`, type: "redaction", page: hit.page, rect });
    }
  }
  if (covered.length + edits.length > 2000) throw new Error("Plus de 2 000 zones : affinez la sélection.");
  return edits;
}
