import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import type { FreehandEdit } from "../editing/types";
import { FreehandEditBlock } from "./FreehandEditLayer";

const viewport = {
  width: 400,
  height: 400,
  transform: [1, 0, 0, -1, 0, 400],
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
    render(<FreehandEditBlock edit={edit} viewport={viewport} selected={false} onSelect={vi.fn()} />);

    expect(screen.getByLabelText("Dessin libre page 1").querySelector("path")).toHaveAttribute(
      "stroke-opacity",
      "0.35",
    );
  });
});
