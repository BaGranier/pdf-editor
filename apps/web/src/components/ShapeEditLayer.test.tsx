import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import type { ShapeEdit } from "../editing/types";
import { ShapeEditBlock } from "./ShapeEditLayer";

const viewport = {
  viewBox: [0, 0, 600, 800],
  transform: [1, 0, 0, -1, 0, 800],
  convertToPdfPoint: (x: number, y: number) => [x, 800 - y],
  convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
} as unknown as PageViewport;

const rectangle: ShapeEdit = {
  id: "shape-1",
  type: "shape",
  shapeType: "rectangle",
  page: 1,
  rect: { x0: 100, y0: 500, x1: 260, y1: 620 },
  style: {
    strokeColor: "#123456",
    strokeWidth: 3,
    fillColor: "#abcdef",
  },
};

describe("ShapeEditBlock", () => {
  it("defaults legacy shapes to full opacity and applies an explicit opacity to SVG primitives", () => {
    const { container, rerender } = render(
      <ShapeEditBlock edit={rectangle} viewport={viewport} selected={false} onSelect={vi.fn()} onMove={vi.fn()} />,
    );
    expect(container.querySelector("rect")).toHaveStyle({ opacity: "1" });

    rerender(
      <ShapeEditBlock
        edit={{ ...rectangle, style: { ...rectangle.style, opacity: 0.35 } }}
        viewport={viewport}
        selected={false}
        onSelect={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    expect(container.querySelector("rect")).toHaveStyle({ opacity: "0.35" });

    rerender(
      <ShapeEditBlock
        edit={{ ...rectangle, style: { ...rectangle.style, opacity: 0 } }}
        viewport={viewport}
        selected={false}
        onSelect={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    expect(container.querySelector("rect")).toHaveStyle({ opacity: "0" });
  });

  it.each(["rectangle", "ellipse", "line"] as const)(
    "renders and selects a %s",
    (shapeType) => {
      const onSelect = vi.fn();
      const { container } = render(
        <ShapeEditBlock
          edit={{ ...rectangle, shapeType }}
          viewport={viewport}
          selected
          onSelect={onSelect}
          onMove={vi.fn()}
        />,
      );

      const elementName = shapeType === "rectangle" ? "rect" : shapeType;
      expect(container.querySelector(elementName)).toBeTruthy();
      fireEvent.click(screen.getByLabelText(`${shapeType === "rectangle" ? "Rectangle" : shapeType === "ellipse" ? "Ellipse" : "Ligne"} page 1`));
      expect(onSelect).toHaveBeenCalled();
      expect(screen.getAllByRole("button", { name: /Redimensionner la forme/ })).toHaveLength(4);
    },
  );

  it("moves and resizes through the shared PDF coordinate helpers", () => {
    const onMove = vi.fn();
    render(
      <ShapeEditBlock
        edit={rectangle}
        viewport={viewport}
        selected
        onSelect={vi.fn()}
        onMove={onMove}
      />,
    );
    const block = screen.getByLabelText("Rectangle page 1");
    fireEvent.mouseDown(block, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 30, clientY: 40 });
    fireEvent.mouseUp(window);
    expect(onMove).toHaveBeenLastCalledWith({
      x0: 120,
      y0: 470,
      x1: 280,
      y1: 590,
    });

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Redimensionner la forme depuis se" }),
      { button: 0, clientX: 10, clientY: 10 },
    );
    fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });
    fireEvent.mouseUp(window);
    expect(onMove).toHaveBeenLastCalledWith({
      x0: 100,
      y0: 480,
      x1: 300,
      y1: 620,
    });
  });
});
