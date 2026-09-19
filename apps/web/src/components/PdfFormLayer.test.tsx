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
  { id: "plan-standard", pageIndex: 0, name: "plan.level", fieldType: "radio" as const, value: "standard", rect: { x0: 40, y0: 40, x1: 60, y1: 60 }, readOnly: false, required: false, multiline: false, editable: false, options: [], buttonValue: "standard" },
  { id: "plan-pro", pageIndex: 0, name: "plan.level", fieldType: "radio" as const, value: "standard", rect: { x0: 70, y0: 40, x1: 90, y1: 60 }, readOnly: false, required: false, multiline: false, editable: false, options: [], buttonValue: "pro" },
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
    fireEvent.click(screen.getByRole("radio", { name: "plan.level: pro" }));
    expect(onChange).toHaveBeenCalledWith(fields[3], "pro");
    const reference = screen.getByRole("textbox", { name: "document.reference" });
    expect(reference).toHaveAttribute("readonly");
    expect(reference).toHaveAttribute("data-form-rendering", "canvas");
    expect(screen.getByRole("textbox", { name: "person.name (requis)" })).toHaveAttribute("data-form-rendering", "interactive");
    fireEvent.change(reference, { target: { value: "Ne pas modifier" } });
    expect(onChange).not.toHaveBeenCalledWith(fields[4], "Ne pas modifier");
  });

  it("keeps values visible while a local or pending PDF lock prevents changes", () => {
    const onChange = vi.fn();
    render(<PdfFormLayer fields={fields} edits={[]} viewport={viewport} uiLocked onChange={onChange} onFinish={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "person.name (requis)" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "document.reference" })).toHaveAttribute("data-form-rendering", "canvas");
    expect(screen.getByRole("checkbox", { name: "options.newsletter" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "person.name (requis)" })).toHaveValue("Jean");
    render(<PdfFormLayer fields={fields} edits={[]} viewport={viewport} pdfLocked onChange={onChange} onFinish={vi.fn()} />);
    expect(screen.getAllByRole("radio", { name: "plan.level: pro" })[0]).toBeDisabled();
  });
});
