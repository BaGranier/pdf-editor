import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import {
  TextEditBlock,
  textAreaHasOverflow,
} from "./TextEditLayer";
import type { AddTextEdit } from "../editing/types";

const viewport = {
  transform: [1, 0, 0, -1, 0, 1000],
  convertToViewportPoint: (x: number, y: number) => [x, 1000 - y],
} as unknown as PageViewport;

const baseEdit: AddTextEdit = {
  id: "text-overflow",
  type: "add_text",
  page: 1,
  rect: { x0: 20, y0: 900, x1: 240, y1: 972 },
  text: "Texte court",
  style: {
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#000000",
    bold: false,
  },
};

function renderedTextHeight(textarea: HTMLTextAreaElement): number {
  const block = textarea.closest<HTMLElement>(".pdf-text-edit");
  const width = Number.parseFloat(block?.style.width ?? "0");
  const fontSize = Number.parseFloat(textarea.style.fontSize || "12");
  const boldFactor = textarea.style.fontWeight === "700" ? 1.08 : 1;
  const familyFactor = textarea.style.fontFamily.includes("Courier") ? 1.12 : 1;
  const charactersPerLine = Math.max(
    1,
    Math.floor(width / (fontSize * 0.6 * boldFactor * familyFactor)),
  );
  const lineCount = textarea.value
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0,
    );
  return Math.ceil(lineCount * fontSize * 1.2);
}

describe("TextEditBlock overflow", () => {
  beforeEach(() => {
    vi.spyOn(HTMLTextAreaElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLTextAreaElement) {
        return Math.floor(
          Number.parseFloat(
            this.closest<HTMLElement>(".pdf-text-edit")?.style.height ?? "0",
          ),
        );
      },
    );
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLTextAreaElement) {
        return renderedTextHeight(this);
      },
    );
    vi.spyOn(HTMLTextAreaElement.prototype, "clientWidth", "get").mockImplementation(
      function clientWidth(this: HTMLTextAreaElement) {
        return Math.floor(
          Number.parseFloat(
            this.closest<HTMLElement>(".pdf-text-edit")?.style.width ?? "0",
          ),
        );
      },
    );
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollWidth", "get").mockImplementation(
      function scrollWidth(this: HTMLTextAreaElement) {
        return this.clientWidth;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a one CSS pixel tolerance on both axes", () => {
    const textarea = document.createElement("textarea");
    Object.defineProperties(textarea, {
      clientHeight: { configurable: true, value: 20 },
      scrollHeight: { configurable: true, value: 21 },
      clientWidth: { configurable: true, value: 40 },
      scrollWidth: { configurable: true, value: 41 },
    });
    expect(textAreaHasOverflow(textarea)).toBe(false);

    Object.defineProperty(textarea, "scrollWidth", { value: 42 });
    expect(textAreaHasOverflow(textarea)).toBe(true);
  });

  it("recalculates after text, rectangle, font, family and bold changes", async () => {
    const props = {
      viewport,
      selected: true,
      onSelect: vi.fn(),
      onChangeText: vi.fn(),
      onMove: vi.fn(),
    };
    const { rerender } = render(<TextEditBlock edit={baseEdit} {...props} />);
    const block = screen.getByLabelText("Texte ajouté page 1").closest(".pdf-text-edit");
    expect(block).toHaveAttribute("data-text-overflow", "false");

    const longText = "Un texte très long ".repeat(20);
    fireEvent.change(screen.getByLabelText("Texte ajouté page 1"), {
      target: { value: longText },
    });
    await waitFor(() => expect(block).toHaveAttribute("data-text-overflow", "true"));
    expect(block).toHaveClass("has-overflow", "is-selected");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Le texte dépasse de cette zone",
    );
    fireEvent.blur(screen.getByLabelText("Texte ajouté page 1"));

    rerender(
      <TextEditBlock
        edit={{
          ...baseEdit,
          text: longText,
          rect: { ...baseEdit.rect, y0: 200 },
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(block).toHaveAttribute("data-text-overflow", "false"));

    const styledText = "Texte dimensionné pour changer selon le style";
    rerender(
      <TextEditBlock
        edit={{
          ...baseEdit,
          text: styledText,
          rect: { x0: 20, y0: 900, x1: 120, y1: 925 },
          style: { ...baseEdit.style, fontSize: 6 },
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(block).toHaveAttribute("data-text-overflow", "false"));

    rerender(
      <TextEditBlock
        edit={{
          ...baseEdit,
          text: styledText,
          rect: { x0: 20, y0: 900, x1: 120, y1: 925 },
          style: {
            ...baseEdit.style,
            fontFamily: "Courier",
            fontSize: 12,
            bold: true,
          },
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(block).toHaveAttribute("data-text-overflow", "true"));
  });
});
