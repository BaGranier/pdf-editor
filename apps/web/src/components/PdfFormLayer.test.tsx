import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PdfFormLayer } from "./PdfFormLayer";

const viewport = {
  transform: [1, 0, 0, -1, 0, 800],
  convertToViewportPoint: (x: number, y: number) => [x, y],
} as never;

const fields = [
  { id: "name", pageIndex: 0, name: "person.name", fieldType: "text" as const, value: "Jean", rect: { x0: 10, y0: 10, x1: 200, y1: 30 }, readOnly: false, required: true, multiline: false, editable: false, options: [], buttonValue: null },
  { id: "newsletter", pageIndex: 0, name: "options.newsletter", fieldType: "checkbox" as const, value: "Off", rect: { x0: 10, y0: 40, x1: 30, y1: 60 }, readOnly: false, required: false, multiline: false, editable: false, options: [], buttonValue: "Yes" },
  { id: "readonly", pageIndex: 0, name: "document.reference", fieldType: "text" as const, value: "FORM-1", rect: { x0: 10, y0: 70, x1: 200, y1: 90 }, readOnly: true, required: false, multiline: false, editable: false, options: [], buttonValue: null },
];

describe("PDF AcroForm layer", () => {
  it("renders editable, required and readonly fields and emits lightweight values", () => {
    const onChange = vi.fn();
    const onFinish = vi.fn();
    render(<PdfFormLayer fields={fields} edits={[]} viewport={viewport} onChange={onChange} onFinish={onFinish} />);
    const name = screen.getByRole("textbox", { name: "person.name (requis)" });
    fireEvent.change(name, { target: { value: "Alice" } });
    fireEvent.blur(name);
    expect(onChange).toHaveBeenCalledWith(fields[0], "Alice");
    expect(onFinish).toHaveBeenCalledWith(fields[0]);
    expect(screen.getByRole("checkbox", { name: "options.newsletter" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "document.reference" })).toHaveAttribute("readonly");
  });
});
