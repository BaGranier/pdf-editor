import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FreehandEdit } from "../editing/types";
import { FreehandEditToolbar, getFreehandOpacity } from "./FreehandEditToolbar";

const freehand: FreehandEdit = {
  id: "freehand-1",
  type: "freehand",
  page: 1,
  rect: { x0: 10, y0: 10, x1: 60, y1: 60 },
  points: [{ x: 10, y: 10 }, { x: 60, y: 60 }],
  style: { color: "#2563eb", strokeWidth: 3, opacity: 1 },
};

describe("FreehandEditToolbar", () => {
  it("edits normalized opacity with an immediate combined preview", () => {
    const onUpdate = vi.fn();
    const onFinishUpdate = vi.fn();
    render(
      <FreehandEditToolbar
        edit={freehand}
        onUpdate={onUpdate}
        onFinishUpdate={onFinishUpdate}
        onDelete={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Opacité du dessin" });
    expect(screen.getAllByText("100 %")).not.toHaveLength(0);
    expect(
      screen.getByLabelText("Aperçu du dessin à 100 % d’opacité").firstElementChild,
    ).toHaveStyle({ height: "3px", opacity: "1" });
    fireEvent.change(slider, { target: { value: "50" } });
    fireEvent.pointerUp(slider);

    expect(onUpdate).toHaveBeenCalledWith(
      { style: { ...freehand.style, opacity: 0.5 } },
      "opacity",
    );
    expect(onFinishUpdate).toHaveBeenCalledWith("opacity");
  });

  it("treats persisted freehands without opacity as fully opaque", () => {
    expect(getFreehandOpacity({})).toBe(1);
    expect(getFreehandOpacity({ opacity: 0.35 })).toBe(0.35);
  });
});
