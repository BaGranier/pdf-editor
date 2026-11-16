import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTextStamp } from "../editing/stamps";
import { RedactionSearchPanel } from "./RedactionSearchPanel";
import { StampStyleControls } from "./StampStyleControls";
import { WatermarkComposer } from "./WatermarkComposer";

const stamp = createTextStamp(1, { x0: 0, y0: 0, x1: 220, y1: 90 }, "REÇU", false);
describe("distinct marking controls", () => {
  it("links palette by default, allows no background and preserves legacy opt-in", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<StampStyleControls edit={stamp} onUpdate={onUpdate} onFinish={vi.fn()} />);
    expect(screen.getByLabelText("Lier texte, bordure et fond")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Aucun fond"));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ fillOpacity: 0 }));
    fireEvent.click(screen.getByLabelText("Lier texte, bordure et fond"));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ linkedColors: false }));
    rerender(<StampStyleControls edit={{ ...stamp, layoutVersion: undefined }} onUpdate={onUpdate} onFinish={vi.fn()} />);
    expect(screen.queryByLabelText("Mode de taille du tampon")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Adopter le style harmonisé/ }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ layoutVersion: 2, fontSizeMode: "fit" }));
  });
  it("does not create zones from query input or selecting a search occurrence", () => {
    const onCreate = vi.fn(), onQuery = vi.fn();
    render(<RedactionSearchPanel search={{ isOpen: true, query: "SECRET", hits: [{ id: "hit", pageNumber: 1, context: "SECRET", start: 0, end: 6 }], activeHitIndex: 0, pagesScanned: 1, totalPages: 1, status: "complete", error: null }} currentPage={1} onQuery={onQuery} onOptions={vi.fn()} onNavigate={vi.fn()} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Terme à biffer"), { target: { value: "OTHER" } });
    fireEvent.click(screen.getByLabelText("Sélectionner l’occurrence 1 page 1"));
    expect(onQuery).toHaveBeenCalledWith("OTHER");
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Compteur des occurrences")).toHaveTextContent("1 occurrences · 1 sélectionnées");
    fireEvent.click(screen.getByRole("button", { name: "Biffer toutes les occurrences sélectionnées" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
  it("separates watermark preview from application and supports Escape cancellation", () => {
    const onPreview = vi.fn().mockResolvedValue(undefined), onApply = vi.fn(), onCancel = vi.fn();
    render(<WatermarkComposer onPreview={onPreview} onApply={onApply} onClear={vi.fn()} onCancel={onCancel} previewReady={false} />);
    expect(screen.getByRole("button", { name: "Appliquer le filigrane" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pages du filigrane"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("button", { name: "Prévisualiser le filigrane" }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ scope: "all", opacity: 0.25, rotation: -45 }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Texte du filigrane"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Créer un filigrane"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
