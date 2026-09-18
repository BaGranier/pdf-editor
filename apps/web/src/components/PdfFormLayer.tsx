import type { PageViewport } from "pdfjs-dist";
import type { ChangeEvent } from "react";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { PdfFormEdit } from "../editing/types";
import type { PdfFormField } from "../pdf/forms";

function formValue(field: PdfFormField, edits: PdfFormEdit[]): string | string[] {
  return edits.find((edit) => edit.fieldName === field.name)?.value ?? field.value;
}

export function PdfFormLayer({
  fields,
  edits,
  viewport,
  onChange,
  onFinish,
}: {
  fields: PdfFormField[];
  edits: PdfFormEdit[];
  viewport: PageViewport;
  onChange: (field: PdfFormField, value: string | string[]) => void;
  onFinish: (field: PdfFormField) => void;
}) {
  return (
    <div className="pdf-form-layer" aria-label="Champs de formulaire PDF">
      {fields.map((field) => {
        const value = formValue(field, edits);
        const common = {
          className: "pdf-form-field",
          style: pdfRectToViewportStyle(viewport, field.rect),
          "data-form-field": field.name,
        };
        const label = `${field.name}${field.required ? " (requis)" : ""}`;
        if (field.fieldType === "text") {
          const props = { value: String(value), readOnly: field.readOnly, required: field.required, "aria-label": label, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field, event.target.value), onBlur: () => onFinish(field) };
          return field.multiline ? <textarea key={field.id} {...common} {...props} /> : <input key={field.id} {...common} {...props} />;
        }
        if (field.fieldType === "checkbox") {
          const checked = String(value) !== "Off" && String(value) !== "";
          return <input key={field.id} {...common} type="checkbox" checked={checked} disabled={field.readOnly} aria-label={label} onChange={(event) => onChange(field, event.target.checked ? (field.buttonValue ?? "Yes") : "Off")} onBlur={() => onFinish(field)} />;
        }
        if (field.fieldType === "radio") {
          const optionLabel = field.buttonValue ? `${label}: ${field.buttonValue}` : label;
          return <input key={field.id} {...common} type="radio" name={`pdf-form-${field.pageIndex}-${field.name}`} checked={String(value) === field.buttonValue} disabled={field.readOnly} aria-label={optionLabel} onChange={() => onChange(field, field.buttonValue ?? "Off")} onBlur={() => onFinish(field)} />;
        }
        if (field.fieldType === "combo" || field.fieldType === "list") {
          const multiple = field.fieldType === "list" && Array.isArray(value);
          return <select key={field.id} {...common} multiple={multiple} value={value} disabled={field.readOnly} required={field.required} aria-label={label} onChange={(event) => onChange(field, multiple ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value)} onBlur={() => onFinish(field)}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
        }
        return <div key={field.id} {...common} className="pdf-form-field pdf-form-field--unsupported" role="note">Champ PDF non pris en charge : {field.name}</div>;
      })}
    </div>
  );
}
