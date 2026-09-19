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
  uiLocked = false,
  pdfLocked = false,
  onChange,
  onFinish,
}: {
  fields: PdfFormField[];
  edits: PdfFormEdit[];
  viewport: PageViewport;
  /** Ephemeral application-only lock: intentionally not part of PdfEdit history. */
  uiLocked?: boolean;
  /** A pending PDF ReadOnly mutation, persisted only on save/export. */
  pdfLocked?: boolean;
  onChange: (field: PdfFormField, value: string | string[]) => void;
  onFinish: (field: PdfFormField) => void;
}) {
  return (
    <div className="pdf-form-layer" aria-label="Champs de formulaire PDF">
      {fields.map((field) => {
        const value = formValue(field, edits);
        const readOnly = field.readOnly || uiLocked || pdfLocked;
        // PDF.js retains native appearances for original ReadOnly widgets in
        // the canvas. Keep a semantic, non-interactive hit target only; the
        // canvas remains the single visual owner of the value.
        const usesNativeReadOnlyAppearance = field.readOnly;
        const common = {
          className: usesNativeReadOnlyAppearance
            ? "pdf-form-field pdf-form-field--native-readonly"
            : "pdf-form-field",
          style: pdfRectToViewportStyle(viewport, field.rect),
          "data-form-field": field.name,
          "data-form-rendering": usesNativeReadOnlyAppearance ? "canvas" : "interactive",
        };
        const label = `${field.name}${field.required ? " (requis)" : ""}`;
        if (field.fieldType === "text") {
          const props = {
            value: String(value),
            readOnly,
            required: field.required,
            tabIndex: usesNativeReadOnlyAppearance ? -1 : undefined,
            "aria-label": label,
            "aria-readonly": readOnly || undefined,
            onChange: usesNativeReadOnlyAppearance
              ? undefined
              : (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field, event.target.value),
            onBlur: usesNativeReadOnlyAppearance ? undefined : () => onFinish(field),
          };
          return field.multiline ? <textarea key={field.id} {...common} {...props} /> : <input key={field.id} {...common} {...props} />;
        }
        if (field.fieldType === "checkbox") {
          const checked = String(value) !== "Off" && String(value) !== "";
          return <input key={field.id} {...common} type="checkbox" checked={checked} disabled={readOnly} aria-label={label} aria-readonly={readOnly || undefined} onChange={(event) => onChange(field, event.target.checked ? (field.buttonValue ?? "Yes") : "Off")} onBlur={() => onFinish(field)} />;
        }
        if (field.fieldType === "radio") {
          const optionLabel = field.buttonValue ? `${label}: ${field.buttonValue}` : label;
          return <input key={field.id} {...common} type="radio" name={`pdf-form-${field.pageIndex}-${field.name}`} checked={String(value) === field.buttonValue} disabled={readOnly} aria-label={optionLabel} aria-readonly={readOnly || undefined} onChange={() => onChange(field, field.buttonValue ?? "Off")} onBlur={() => onFinish(field)} />;
        }
        if (field.fieldType === "combo" || field.fieldType === "list") {
          const multiple = field.fieldType === "list" && Array.isArray(value);
          return <select key={field.id} {...common} multiple={multiple} value={value} disabled={readOnly} required={field.required} aria-label={label} aria-readonly={readOnly || undefined} onChange={(event) => onChange(field, multiple ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value)} onBlur={() => onFinish(field)}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
        }
        return <div key={field.id} {...common} className="pdf-form-field pdf-form-field--unsupported" role="note">Champ PDF non pris en charge : {field.name}</div>;
      })}
    </div>
  );
}
