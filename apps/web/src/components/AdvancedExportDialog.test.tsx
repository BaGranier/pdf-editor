import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdvancedExportDialog } from "./AdvancedExportDialog";

const opening = "Mot de passe d’ouverture";
const confirmOpening = "Confirmer le mot de passe d’ouverture";

describe("AdvancedExportDialog security", () => {
  it("rejects mismatched passwords and restrictions without an owner", async () => {
    const onExport = vi.fn().mockResolvedValue(true);
    render(<AdvancedExportDialog busy={false} onCancel={vi.fn()} onExport={onExport} />);
    fireEvent.change(screen.getByLabelText(opening), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("confirmations");
    expect(onExport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(confirmOpening), { target: { value: "test" } });
    fireEvent.click(screen.getByLabelText("Autoriser les modifications"));
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("propriétaire distinct");
    expect(onExport).not.toHaveBeenCalled();
  });

  it("passes options once and clears secrets after an unsuccessful attempt", async () => {
    const onExport = vi.fn().mockResolvedValue(false);
    render(<AdvancedExportDialog busy={false} onCancel={vi.fn()} onExport={onExport} />);
    fireEvent.change(screen.getByLabelText(opening), { target: { value: "temporary" } });
    fireEvent.change(screen.getByLabelText(confirmOpening), { target: { value: "temporary" } });
    fireEvent.change(screen.getByLabelText("Profil de compression"), { target: { value: "small" } });
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    await waitFor(() => expect(screen.getByLabelText(opening)).toHaveValue(""));
    expect(screen.getByLabelText(confirmOpening)).toHaveValue("");
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ quality: "small", openPassword: "temporary", flattenAnnotations: false }));
    expect(screen.getByRole("alert")).toHaveTextContent("Export non enregistré");
  });

  it("keeps keyboard focus in the dialog and handles Escape", () => {
    const onCancel = vi.fn();
    render(<AdvancedExportDialog busy={false} onCancel={onCancel} onExport={vi.fn()} />);
    const first = screen.getByLabelText("Profil de compression");
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Exporter" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
