import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PdfSearchBar } from "./PdfSearchBar";

describe("PdfSearchBar", () => {
  it("focuses the query and resolves Enter, Shift+Enter and Escape locally", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onClose = vi.fn();
    render(
      <PdfSearchBar
        query="Paris"
        resultIndex={1}
        resultCount={3}
        pagesScanned={4}
        totalPages={8}
        isSearching
        error={null}
        onQueryChange={vi.fn()}
        onNext={onNext}
        onPrevious={onPrevious}
        onClose={onClose}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Rechercher dans le document" });
    expect(input).toHaveFocus();
    expect(screen.getByLabelText("Résultats de recherche")).toHaveTextContent("2 / 3 · 4 / 8");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
