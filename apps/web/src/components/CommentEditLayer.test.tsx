import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentEditMarker } from "./CommentEditLayer";

const viewport = { width: 400, height: 500, transform: [1, 0, 0, -1, 0, 500], convertToViewportPoint: (x: number, y: number) => [x, 500 - y] } as never;

describe("CommentEditMarker", () => {
  it("highlights each local selection box and leaves imported appearances to the PDF", () => {
    const rect = { x0: 20, y0: 30, x1: 38, y1: 40 };
    const edit = { id: "anchored", type: "comment" as const, commentType: "text" as const, page: 1, rect, rects: [rect, { ...rect, y0: 44, y1: 54 }], content: "Note" };
    const props = { viewport, onSelect: vi.fn(), selected: false };
    const view = render(<CommentEditMarker {...props} edit={{ ...edit, source: "local" }} />);
    const highlights = view.container.querySelectorAll(".pdf-comment-highlight");
    expect(highlights).toHaveLength(2);
    expect(highlights[1]).toHaveStyle({ left: "20px", top: "446px", width: "18px", height: "10px" });
    view.rerender(<CommentEditMarker {...props} edit={{ ...edit, source: "pdf" }} />);
    expect(view.container.querySelectorAll(".pdf-comment-highlight")).toHaveLength(0);
  });

  it("keeps hidden PDF appearances hidden until explicitly selected", () => {
    const props = { viewport, onSelect: vi.fn(), edit: { id: "hidden", type: "comment" as const, commentType: "text" as const, page: 1, rect: { x0: 20, y0: 30, x1: 38, y1: 48 }, content: "Métadonnées conservées", source: "pdf" as const, appearanceHidden: true } };
    const view = render(<CommentEditMarker {...props} selected={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    view.rerender(<CommentEditMarker {...props} selected />);
    expect(screen.getByRole("button")).toBeVisible();
  });
  it("exposes the imported comment content and selects without bubbling", () => {
    const onSelect = vi.fn();
    render(<CommentEditMarker viewport={viewport} selected={false} onSelect={onSelect} edit={{ id: "comment-1", type: "comment", commentType: "text", page: 1, rect: { x0: 20, y0: 30, x1: 38, y1: 48 }, content: "À vérifier", source: "pdf" }} />);
    fireEvent.click(screen.getByRole("button", { name: /commentaire page 1: à vérifier/i }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
