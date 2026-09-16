import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FontSelector } from "./FontSelector";

describe("FontSelector", () => {
  it("explains local TTF/OTF import and closes the help without mutating text", () => {
    const onChange = vi.fn();
    const onLibraryChange = vi.fn();
    render(
      <FontSelector
        style={{ fontFamily: "Helvetica", fontRef: "pdf-standard:helvetica:400:normal", fontSize: 12, color: "#000000", bold: false }}
        onChange={onChange}
        onLibraryChange={onLibraryChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment ajouter une police personnalisée" }));
    expect(screen.getByRole("dialog", { name: "Ajouter une police personnalisée" })).toHaveTextContent(".ttf");
    expect(screen.getByRole("dialog")).toHaveTextContent(".otf");
    expect(screen.getByRole("dialog")).toHaveTextContent("bibliothèque locale");
    expect(screen.getByRole("dialog")).toHaveTextContent("droits nécessaires");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Ajouter une police personnalisée" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(onLibraryChange).not.toHaveBeenCalled();
  });
});
