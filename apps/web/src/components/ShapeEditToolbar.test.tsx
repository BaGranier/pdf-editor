import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShapeEdit } from "../editing/types";
import { ShapeEditToolbar } from "./ShapeEditToolbar";

const rectangle: ShapeEdit = {
  id: "shape-1",
  type: "shape",
  shapeType: "rectangle",
  page: 1,
  rect: { x0: 10, y0: 10, x1: 100, y1: 80 },
  style: { strokeColor: "#2563eb", strokeWidth: 4, fillColor: "#dbeafe" },
};

describe("ShapeEditToolbar", () => {
  it("uses the shared slider for shape opacity and keeps legacy shapes opaque", () => {
    const onUpdate = vi.fn();
    const onFinishUpdate = vi.fn();
    render(
      <ShapeEditToolbar
        edit={rectangle}
        eyedropperTarget={null}
        onUpdate={onUpdate}
        onFinishUpdate={onFinishUpdate}
        onPickColor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Opacité de la forme" });
    expect(slider).toHaveValue("100");
    expect(screen.getByLabelText("Aperçu de la forme à 100 % d’opacité").firstElementChild).toHaveStyle({
      backgroundColor: "#dbeafe",
      opacity: "1",
    });
    expect(screen.getByLabelText("Aperçu de la forme à 100 % d’opacité").firstElementChild).toHaveClass(
      "property-slider__preview-shape",
    );

    fireEvent.change(slider, { target: { value: "35" } });
    fireEvent.pointerUp(slider);
    expect(onUpdate).toHaveBeenCalledWith(
      { style: { ...rectangle.style, opacity: 0.35 } },
      "opacity",
    );
    expect(onFinishUpdate).toHaveBeenCalledWith("opacity");
  });

  it("keeps fill controls absent for lines while exposing opacity", () => {
    render(
      <ShapeEditToolbar
        edit={{ ...rectangle, shapeType: "line", style: { ...rectangle.style, fillColor: null, opacity: 0.5 } }}
        eyedropperTarget={null}
        onUpdate={vi.fn()}
        onFinishUpdate={vi.fn()}
        onPickColor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("slider", { name: "Opacité de la forme" })).toHaveValue("50");
    expect(screen.queryByLabelText("Remplissage transparent")).not.toBeInTheDocument();
  });
});
