import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import { StampEditBlock } from "./StampEditBlock";
import { createWatermark, DEFAULT_WATERMARK } from "../editing/watermarks";

const edit = createWatermark(1, { x0: 0, y0: 0, x1: 595, y1: 842 }, { ...DEFAULT_WATERMARK, mode: "tiled", text: "Test" }, "group");
function viewport(scale: number, rotated = false) {
  return {
    transform: rotated ? [0, scale, scale, 0, 0, 0] : [scale, 0, 0, -scale, 0, 842 * scale],
    viewBox: [0, 0, 595, 842],
    convertToPdfPoint: (x: number, y: number) => rotated ? [y / scale, x / scale] : [x / scale, 842 - y / scale],
    convertToViewportPoint: (x: number, y: number) => rotated ? [y * scale, x * scale] : [x * scale, (842 - y) * scale],
  } as unknown as PageViewport;
}
describe("tiled watermark overlay", () => {
  it("anchors SVG coordinates across zoom and page rotation with one selectable frame", () => {
    const props = { edit, selected: true, onSelect: vi.fn(), onMove: vi.fn() };
    const { container, rerender } = render(<StampEditBlock {...props} viewport={viewport(1)} />);
    const coordinates = () => [...container.querySelectorAll("text")].map((node) => [node.getAttribute("x"), node.getAttribute("y")]);
    const original = coordinates();
    for (const scale of [0.5, 1, 1.5, 2]) {
      rerender(<StampEditBlock {...props} viewport={viewport(scale)} />);
      expect(coordinates()).toEqual(original);
      expect(container.querySelector(".pdf-stamp-content")).toHaveAttribute("viewBox", "0 0 595 842");
    }
    rerender(<StampEditBlock {...props} viewport={viewport(1, true)} />);
    expect(coordinates()).toEqual(original);
    expect(container.querySelector(".pdf-stamp-content")).toHaveAttribute("viewBox", "0 0 842 595");
    expect(container.querySelector(".pdf-stamp-content > g")).toHaveAttribute("transform", "matrix(0 1 -1 0 842 0)");
    expect(screen.queryByRole("button", { name: /Redimensionner/ })).toBeNull();
    expect(container.querySelector(".pdf-stamp-content")).toHaveStyle({ overflow: "hidden" });
  });
  it("keeps page bounds fixed while dragging, committing one logical translation", () => {
    const move = vi.fn();
    const { container } = render(<StampEditBlock edit={edit} viewport={viewport(1)} selected onSelect={vi.fn()} onMove={move} />);
    const frame = screen.getByLabelText("Filigrane page 1");
    const style = frame.getAttribute("style");
    fireEvent.mouseDown(frame, { button: 0, clientX: 50, clientY: 80 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
    expect(move).not.toHaveBeenCalled(); expect(frame.getAttribute("style")).toBe(style);
    expect(container.querySelector(".pdf-stamp-content > g > g")).toHaveAttribute("transform", "translate(30 20)");
    fireEvent.mouseUp(window);
    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ x0: 30, y0: -20, x1: 625, y1: 822 });
    expect(container.querySelector(".pdf-stamp-content > g > g")).toHaveAttribute("transform", "translate(0 0)");
  });
});
