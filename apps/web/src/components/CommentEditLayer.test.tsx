import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentEditMarker } from "./CommentEditLayer";

const viewport = { width: 400, height: 500, transform: [1, 0, 0, 1, 0, 0], convertToViewportPoint: (x: number, y: number) => [x, y] } as never;

describe("CommentEditMarker", () => {
  it("exposes the imported comment content and selects without bubbling", () => {
    const onSelect = vi.fn();
    render(<CommentEditMarker viewport={viewport} selected={false} onSelect={onSelect} edit={{ id: "comment-1", type: "comment", commentType: "text", page: 1, rect: { x0: 20, y0: 30, x1: 38, y1: 48 }, content: "À vérifier", source: "pdf" }} />);
    fireEvent.click(screen.getByRole("button", { name: /commentaire page 1: à vérifier/i }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
