import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTextStamp } from "../editing/stamps";
import { RedactionSearchPanel } from "./RedactionSearchPanel";
import { StampStyleControls } from "./StampStyleControls";
import type { IndexedPage } from "../editing/redactionIndex";
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
  it("does not create zones from query input or selecting a search occurrence", async () => {
    const onCreate = vi.fn().mockReturnValue(1);
    const native = [[["S", [30, 260, 40, 270]], ["E", [40, 260, 50, 270]], ["C", [50, 260, 60, 270]], ["R", [60, 260, 70, 270]], ["E", [70, 260, 80, 270]], ["T", [80, 260, 90, 270]]]] as IndexedPage["native"];
    const index = { pages: new Map([[1, { page: 1, native, ocr: [], issue: null }]]), scanned: 1, complete: true, error: null };
    render(<RedactionSearchPanel index={index} total={1} sourcePages={[1]} zones={[]} currentPage={1} onNavigate={vi.fn()} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Terme à biffer"), { target: { value: "SECRET" } });
    fireEvent.click(await screen.findByLabelText("Sélectionner l’occurrence 1 page 1"));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Compteur des occurrences")).toHaveTextContent("1 occurrences · 1 sélectionnées");
    fireEvent.click(screen.getByRole("button", { name: "Biffer toutes les occurrences sélectionnées" }));
    expect(onCreate).toHaveBeenCalledOnce();
    await screen.findByText("1 nouvelles zones de biffage créées.");
  });
  it("separates watermark preview from application and supports Escape cancellation", async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined), onApply = vi.fn(), onCancel = vi.fn();
    render(<WatermarkComposer onPreview={onPreview} onApply={onApply} onClear={vi.fn()} onCancel={onCancel} previewReady={false} currentPage={2} />);
    expect(screen.getByRole("button", { name: "Valider le filigrane" })).toBeDisabled();
    expect(screen.getByLabelText("Pages du filigrane")).toHaveValue("all");
    await waitFor(() => expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ scope: "all", opacity: 0.25, rotation: -45 }), undefined));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Texte du filigrane"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Créer un filigrane"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
