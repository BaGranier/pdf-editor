import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertySlider } from "./PropertySlider";

describe("PropertySlider", () => {
  it("shows the numeric value and a color-aware visual preview", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <PropertySlider
        label="Épaisseur du contour"
        value={6}
        min={1}
        max={20}
        step={1}
        unit="pt"
        color="#2563eb"
        previewLabel="Aperçu du contour 6 pt"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Épaisseur du contour" });
    expect(screen.getByText("6 pt")).toBeInTheDocument();
    expect(screen.getByLabelText("Aperçu du contour 6 pt").firstElementChild).toHaveStyle({
      backgroundColor: "#2563eb",
      height: "6px",
    });

    fireEvent.change(slider, { target: { value: "9" } });
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledWith(9);
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
