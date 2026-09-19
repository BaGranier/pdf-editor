import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormLockToolbar } from "./FormLockToolbar";

describe("FormLockToolbar", () => {
  it("distinguishes the ephemeral UI lock from the persisted PDF lock", () => {
    const onToggleUiLock = vi.fn();
    const onRequestPdfLock = vi.fn();
    const onUnlockPdf = vi.fn();
    const { rerender } = render(
      <FormLockToolbar uiLocked={false} pdfLocked={false} onToggleUiLock={onToggleUiLock} onRequestPdfLock={onRequestPdfLock} onUnlockPdf={onUnlockPdf} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verrouiller l’édition" }));
    fireEvent.click(screen.getByRole("button", { name: "Verrouiller le formulaire" }));
    expect(onToggleUiLock).toHaveBeenCalledOnce();
    expect(onRequestPdfLock).toHaveBeenCalledOnce();

    rerender(<FormLockToolbar uiLocked pdfLocked onToggleUiLock={onToggleUiLock} onRequestPdfLock={onRequestPdfLock} onUnlockPdf={onUnlockPdf} />);
    expect(screen.getByRole("status")).toHaveTextContent("Formulaire verrouillé");
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller le formulaire" }));
    expect(onUnlockPdf).toHaveBeenCalledOnce();
  });
});
