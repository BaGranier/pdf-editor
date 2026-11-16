import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import { PdfEditLayer } from "./PdfEditLayer";

const viewport = {
  viewBox: [0, 0, 400, 400], transform: [1, 0, 0, -1, 0, 400],
  convertToPdfPoint: (x: number, y: number) => [x, 400 - y],
  convertToViewportPoint: (x: number, y: number) => [x, 400 - y],
} as unknown as PageViewport;

describe("pending redaction", () => {
  it("offers move, resize and selection without changing the source", () => {
    const update = vi.fn();
    const select = vi.fn();
    render(<PdfEditLayer pageNumber={1} viewport={viewport} edits={[{ id: "r", type: "redaction", page: 1, rect: { x0: 30, y0: 260, x1: 210, y1: 310 } }]} images={{}} selectedEditId="r" activeTool="select" freehandStyle={{ color: "#000000", opacity: 1, strokeWidth: 1 }} pendingSignatureImage={null} onAddRedaction={vi.fn()} onAddText={vi.fn()} onAddShape={vi.fn()} onPlaceSignature={vi.fn()} onAddFreehand={vi.fn()} onStartComment={vi.fn()} onSelect={select} onUpdate={update} onDelete={vi.fn()} />);
    const zone = screen.getByLabelText("Biffage en attente page 1");
    expect(screen.getByText("En attente")).toBeVisible();
    fireEvent.mouseDown(zone, { button: 0, clientX: 30, clientY: 90 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 100 });
    expect(update).not.toHaveBeenCalled();
    fireEvent.mouseUp(window);
    expect(select).toHaveBeenCalledWith("r");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ type: "redaction", rect: { x0: 40, y0: 250, x1: 220, y1: 300 } }));
    expect(screen.getAllByRole("button", { name: /Redimensionner la forme/ })).toHaveLength(4);
  });
});
