import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrintPreviewDialog } from "./PrintPreviewDialog";

describe("print preview", () => {
  it("shows immediate preparation feedback then exposes a printable preview and explicit fallback", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:print-preview");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onCancel = vi.fn();
    const onPrint = vi.fn();
    const onOpenPdf = vi.fn(() => true);
    const { rerender } = render(
      <PrintPreviewDialog documentName="contrat.pdf" pdfBlob={null} stage="preparing" onCancel={onCancel} onPrint={onPrint} onOpenPdf={onOpenPdf} />,
    );
    expect(screen.getAllByText("Préparation de l’impression…")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();

    rerender(
      <PrintPreviewDialog documentName="contrat.pdf" pdfBlob={new Blob(["pdf"])} stage="ready" onCancel={onCancel} onPrint={onPrint} onOpenPdf={onOpenPdf} />,
    );
    expect(screen.getByTitle("Aperçu du PDF à imprimer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le PDF à imprimer" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onPrint).toHaveBeenCalledOnce();
    expect(onOpenPdf).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });
});
