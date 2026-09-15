import type { PdfCommentEdit, PdfCommentType, PdfRect } from "../editing/types";

type AnnotationPayload = {
  id: string;
  pageIndex: number;
  type: PdfCommentType;
  rect: PdfRect;
  content: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
};

/** Reads native PDF annotations without making imported notes part of the dirty edit history. */
export async function loadPdfComments(backendUrl: string, file: File): Promise<PdfCommentEdit[]> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  try {
    const response = await fetch(`${backendUrl}/pdf/annotations`, { method: "POST", body: formData });
    if (!response.ok || typeof response.json !== "function") return [];
    const body = await response.json() as { annotations?: AnnotationPayload[] };
    return (body.annotations ?? [])
    .filter((annotation) => annotation.content.trim().length > 0)
    .map((annotation) => ({
      id: annotation.id,
      type: "comment" as const,
      commentType: annotation.type,
      page: annotation.pageIndex + 1,
      rect: annotation.rect,
      content: annotation.content,
      author: annotation.author,
      createdAt: annotation.createdAt,
      modifiedAt: annotation.modifiedAt,
      source: "pdf" as const,
      }));
  } catch {
    return [];
  }
}
