import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PdfPasswordDialog } from "./PdfPasswordDialog";
it("masks and clears the secret when submitted", () => {
  const answer = vi.fn();
  render(<PdfPasswordDialog error="" onAnswer={answer} />);
  const input = screen.getByLabelText("Mot de passe") as HTMLInputElement;
  expect(input.type).toBe("password");
  fireEvent.change(input, { target: { value: "synthetic" } });
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
  expect(answer).toHaveBeenCalledWith("synthetic");
  expect(input.value).toBe("");
});
it("shows retry feedback and allows cancellation", () => {
  const answer = vi.fn();
  render(<PdfPasswordDialog error="Mot de passe incorrect." onAnswer={answer} />);
  expect(screen.getByRole("alert")).toHaveTextContent("incorrect");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(answer).toHaveBeenCalledWith(null);
});
