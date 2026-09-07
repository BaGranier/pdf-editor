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
});
