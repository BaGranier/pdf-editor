import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import { getDocumentEditingState, pdfEditsReducer } from "../editing/state";
import type { PdfLinkEdit } from "../editing/types";
import { readPageLinks, resolvePdfDestination, safeWebUrl } from "../pdf/links";
import { followWebLink, LinkInspector, PdfLinks, PdfOutline } from "./PdfLinks";

const rect = { x0: 4, y0: 6, x1: 34, y1: 16 };
const native = [4, 6, 34, 16];
const destination = [{ num: 8, gen: 0 }, { name: "XYZ" }, 22, 145, null];
const getAnnotations = vi.fn(async () => [
  { id: "15R", subtype: "Link", rect: native, pdfLinkAction: "URI", pdfLinkEditable: true, url: "https://example.test/", unsafeUrl: "https://example.test/" },
  { id: "16R", subtype: "Link", rect: [40, 6, 70, 16], pdfLinkAction: "GoTo", dest: "chapter" },
  { id: "17R", subtype: "Link", rect: native, pdfLinkAction: "Launch", url: "https://example.test/", unsafeUrl: "https://example.test/" },
  { id: "18R", subtype: "Link", rect: native, pdfLinkAction: "JavaScript", url: "https://example.test/", unsafeUrl: "https://example.test/" },
]);
const page = { getAnnotations } as unknown as PDFPageProxy;
const pdf = {
  numPages: 4,
  getPage: vi.fn(async () => page),
  getPageIndex: vi.fn(async () => 2),
  getDestination: vi.fn(async (name: string) => name === "chapter" ? destination : null),
  getOutline: vi.fn(async () => [{ title: "Chapitre", pdfLinkAction: "GoTo", dest: destination, items: [
    { title: "Sous-section", pdfLinkAction: "GoTo", dest: "chapter", items: [] },
  ] }]),
} as unknown as PDFDocumentProxy;

function viewport(quarterTurn = false) {
  return {
    transform: quarterTurn ? [0, 2, 2, 0, 0, 0] : [1, 0, 0, -1, 0, 200],
    convertToViewportPoint: (x: number, y: number) => quarterTurn ? [y * 2, x * 2] : [x, 200 - y],
  } as unknown as PageViewport;
}

describe("PDF hyperlinks", () => {
  it("uses source action types and resolves direct, named and broken destinations", async () => {
    const links = await readPageLinks(pdf, page);
    expect(links.map(({ destination }) => destination?.kind)).toEqual(["uri", "internal", undefined, undefined]);
    expect(links.map(({ sourceXref }) => sourceXref)).toEqual([15, undefined, undefined, undefined]);
    expect(await resolvePdfDestination(pdf, destination)).toEqual({ kind: "internal", pageIndex: 2, x: 22, y: 145 });
    expect(await resolvePdfDestination(pdf, "chapter")).toEqual(await resolvePdfDestination(pdf, destination));
    expect(await resolvePdfDestination(pdf, "missing")).toBeNull();
    expect(await resolvePdfDestination(pdf, [7, { name: "Fit" }])).toBeNull();
  });

  it("opens only valid absolute web URLs with an isolated tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///x", "mailto:qa@example.test", "https://", "https:///example.test", "https://user:password@example.test", "https://example.test:99999"]) {
        expect(safeWebUrl(value)).toBeNull();
        followWebLink(value, vi.fn());
      }
      expect(open).not.toHaveBeenCalled();
      followWebLink("http://example.test/?q=1", vi.fn());
      expect(open).toHaveBeenCalledWith("http://example.test/?q=1", "_blank", "noopener,noreferrer");
    } finally {
      open.mockRestore();
    }
  });

  it("projects link rectangles at the current zoom and rotation, and edits without navigation", async () => {
    const follow = vi.fn();
    const edit = vi.fn();
    const props = { pdf, pageNumber: 1, edits: [], onFollow: follow, onEdit: edit, disabled: false };
    const { rerender } = render(<PdfLinks {...props} viewport={viewport()} tool="select" />);
    const link = await screen.findByRole("link", { name: /example.test/ });
    expect(link).toHaveStyle({ left: "4px", top: "184px", width: "30px" });
    fireEvent.click(link);
    expect(follow).toHaveBeenCalledTimes(1);

    rerender(<PdfLinks {...props} viewport={viewport(true)} tool="link" />);
    const editButton = screen.getByRole("button", { name: /Modifier le lien.*example.test/ });
    expect(editButton).toHaveStyle({ left: "32px", top: "8px", width: "60px", transform: "matrix(0, 1, -1, 0, 0, 0)" });
    fireEvent.click(editButton);
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: "pdf-link-1-15", rect, sourceXref: 15 }));
    expect(follow).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: /Édition indisponible/ })).toHaveLength(3);
    rerender(<PdfLinks {...props} viewport={viewport(true)} tool="freehand" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("expands nested signets and resolves their destination", async () => {
    const follow = vi.fn();
    render(<PdfOutline pdf={pdf} onFollow={follow} />);
    const outline = (await screen.findByText("Signets")).closest("details")!;
    fireEvent.click(within(outline).getByText("Signets"));
    fireEvent.click(within(outline).getByRole("button", { name: "Développer : Chapitre" }));
    fireEvent.click(within(outline).getByRole("button", { name: "Sous-section" }));
    await vi.waitFor(() => expect(follow).toHaveBeenCalledWith({ kind: "internal", pageIndex: 2, x: 22, y: 145 }));
  });

  it("validates the inspector and integrates create, update and delete in existing history", () => {
    const id = "doc";
    const draft: PdfLinkEdit = { id: "link", type: "link", page: 1, rect, destination: null };
    const save = vi.fn();
    render(<LinkInspector edit={draft} pageCount={4} onSave={save} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("URL web"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le lien" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Type de lien"), { target: { value: "internal" } });
    fireEvent.change(screen.getByLabelText("Page source cible"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le lien" }));
    const created = save.mock.calls[0][0] as PdfLinkEdit;
    expect(created.destination).toEqual({ kind: "internal", pageIndex: 3 });

    const initial = {};
    expect(getDocumentEditingState(initial, id).isDirty).toBe(false);
    const createdState = pdfEditsReducer(initial, { type: "add", documentId: id, edit: created });
    expect(getDocumentEditingState(createdState, id).isDirty).toBe(true);
    const updated = { ...created, label: "Section suivante" };
    const updatedState = pdfEditsReducer(createdState, { type: "replace", documentId: id, edit: updated });
    const deleted = pdfEditsReducer(updatedState, { type: "delete", documentId: id, editId: draft.id });
    expect(getDocumentEditingState(deleted, id).edits).toEqual([]);
    const undone = pdfEditsReducer(deleted, { type: "undo", documentId: id });
    expect(getDocumentEditingState(undone, id).edits).toEqual([updated]);
    const redone = pdfEditsReducer(undone, { type: "redo", documentId: id });
    expect(getDocumentEditingState(redone, id).edits).toEqual([]);
  });
});
