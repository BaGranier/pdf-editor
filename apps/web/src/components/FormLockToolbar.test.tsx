import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormLockToolbar } from "./FormLockToolbar";

describe("FormLockToolbar", () => {
  it("uses one accessible lock control and lets the popover select the UI-only mode", () => {
    const onSetUiLocked = vi.fn();
    const onRequestPdfLock = vi.fn();
    const onUnlockPdf = vi.fn();
    const { rerender } = render(
      <FormLockToolbar uiLocked={false} pdfLocked={false} onSetUiLocked={onSetUiLocked} onRequestPdfLock={onRequestPdfLock} onUnlockPdf={onUnlockPdf} />,
    );
    const control = screen.getByRole("button", { name: "Formulaire modifiable" });
    expect(control).toHaveAttribute("data-lock-icon", "open");
    fireEvent.click(control);
    expect(screen.getByRole("dialog", { name: "Mode d’édition du formulaire" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /Verrouiller/ }));
    expect(onSetUiLocked).toHaveBeenCalledWith(true);

    rerender(<FormLockToolbar uiLocked pdfLocked onSetUiLocked={onSetUiLocked} onRequestPdfLock={onRequestPdfLock} onUnlockPdf={onUnlockPdf} />);
    const lockedControl = screen.getByRole("button", { name: "Formulaire verrouillé dans le PDF" });
    expect(lockedControl).toHaveAttribute("data-lock-icon", "closed");
    fireEvent.click(lockedControl);
    expect(screen.getByRole("radio", { name: /Autoriser l’édition/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^Verrouiller/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller le PDF" }));
    expect(onUnlockPdf).toHaveBeenCalledOnce();
  });

  it("closes the explanatory popover with Escape", () => {
    render(<FormLockToolbar uiLocked={false} pdfLocked={false} onSetUiLocked={vi.fn()} onRequestPdfLock={vi.fn()} onUnlockPdf={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Formulaire modifiable" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Mode d’édition du formulaire" })).not.toBeInTheDocument();
  });
});
