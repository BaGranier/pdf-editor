import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

describe("ColorPicker", () => {
  it("opens shared presets from its compact trigger and applies a selected color", () => {
    const onChange = vi.fn();
    render(<ColorPicker compact label="Couleur de l'annotation" value="#eab308" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Couleur de l'annotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Couleur #dc2626" }));
    expect(onChange).toHaveBeenCalledWith("#dc2626");
    expect(screen.queryByRole("button", { name: "Couleur #dc2626" })).not.toBeInTheDocument();
  });

  it("closes on Escape and outside click while retaining custom colors", () => {
    const onChange = vi.fn();
    render(<><ColorPicker label="Couleur du dessin" value="#2563eb" onChange={onChange} /><button type="button">Hors palette</button></>);
    const trigger = screen.getByRole("button", { name: "Couleur du dessin" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Couleur du dessin palette" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Couleur du dessin palette" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hors palette" }));
    expect(screen.queryByRole("dialog", { name: "Couleur du dessin palette" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Couleur personnalisée Couleur du dessin"), { target: { value: "#c026d3" } });
    expect(onChange).toHaveBeenCalledWith("#c026d3");
  });
});
