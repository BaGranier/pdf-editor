import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import type { TextMarkupEdit } from "../editing/types";
import { TextMarkupLayer } from "./TextMarkupLayer";

const viewport = { width: 400, height: 500, convertToViewportPoint: (x: number, y: number) => [x, 500 - y] } as unknown as PageViewport;
const edit: TextMarkupEdit = { id: "markup", type: "text_markup", kind: "highlight", page: 1, color: "#eab308", rect: { x0: 10, y0: 10, x1: 80, y1: 60 }, rects: [{ x0: 10, y0: 40, x1: 80, y1: 60 }, { x0: 10, y0: 10, x1: 70, y1: 30 }] };

describe("TextMarkupLayer", () => {
  it("renders one highlight primitive per selected text line", () => {
    const { container } = render(<TextMarkupLayer edit={edit} viewport={viewport} />);
    expect(container.querySelectorAll("rect")).toHaveLength(2);
    expect(container.querySelector(".pdf-text-markup")).toHaveAttribute("aria-label", "highlight page 1");
  });

  it.each(["underline", "strikeout"] as const)("renders one %s segment per selected text line", (kind) => {
    const { container } = render(<TextMarkupLayer edit={{ ...edit, kind }} viewport={viewport} />);
    expect(container.querySelectorAll("line")).toHaveLength(2);
  });
});
