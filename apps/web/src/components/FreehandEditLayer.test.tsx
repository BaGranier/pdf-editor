import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import type { FreehandEdit } from "../editing/types";
import { FreehandEditBlock } from "./FreehandEditLayer";

const viewport = {
  width: 400,
  height: 400,
  viewBox: [0, 0, 400, 400],
  transform: [1, 0, 0, -1, 0, 400],
  convertToPdfPoint: (x: number, y: number) => [x, 400 - y],
  convertToViewportPoint: (x: number, y: number) => [x, 400 - y],
} as unknown as PageViewport;

const edit: FreehandEdit = {
  id: "freehand-1",
  type: "freehand",
  page: 1,
  rect: { x0: 10, y0: 10, x1: 100, y1: 100 },
  points: [{ x: 10, y: 10 }, { x: 100, y: 100 }],
  style: { color: "#dc2626", strokeWidth: 6, opacity: 0.35 },
};

describe("FreehandEditBlock", () => {
  it("renders normalized opacity directly on the vector stroke", () => {
    render(<FreehandEditBlock edit={edit} viewport={viewport} selected={false} onSelect={vi.fn()} onMove={vi.fn()} />);

    expect(screen.getByLabelText("Dessin libre page 1").querySelector("path")).toHaveAttribute(
      "stroke-opacity",
      "0.35",
    );
  });

  it("selects and commits one translated trace only after a real drag", () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    render(<FreehandEditBlock edit={edit} viewport={viewport} selected onSelect={onSelect} onMove={onMove} />);
    const svg = screen.getByLabelText("Dessin libre page 1");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, toJSON: () => ({}) });
    const hitArea = svg.querySelectorAll("path")[1]!;

    fireEvent.mouseDown(hitArea, { button: 0, clientX: 10, clientY: 390 });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 390 });
    expect(onSelect).toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.mouseDown(hitArea, { button: 0, clientX: 10, clientY: 390 });
    fireEvent.mouseMove(window, { clientX: 15, clientY: 383 });
    fireEvent.mouseUp(window, { clientX: 15, clientY: 383 });
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 15, y: 17 }, { x: 105, y: 107 }],
    }));
  });
});
