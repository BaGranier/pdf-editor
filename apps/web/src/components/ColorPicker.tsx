import type { CSSProperties } from "react";
import { ANNOTATION_COLORS } from "../editing/types";

type ColorPickerProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onPickColor?: () => void;
  eyedropperActive?: boolean;
  disabled?: boolean;
};

export function ColorPicker({ label, value, onChange, onPickColor, eyedropperActive = false, disabled = false }: ColorPickerProps) {
  return (
    <section className="color-picker" aria-label={label}>
      <span className="color-picker__label">{label}</span>
      <div className="color-picker__presets" role="group" aria-label={`Couleurs ${label}`}>
        {ANNOTATION_COLORS.map((color) => (
          <button key={color} type="button" className="color-picker__swatch" aria-label={`Couleur ${color}`} aria-pressed={value.toLowerCase() === color} disabled={disabled} onClick={() => onChange(color)} style={{ "--swatch-color": color } as CSSProperties}><span aria-hidden="true">{value.toLowerCase() === color ? "✓" : ""}</span></button>
        ))}
      </div>
      <div className="color-picker__actions">
        <label className="color-picker__custom">Personnalisée<input type="color" aria-label={`Couleur personnalisée ${label}`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>
        {onPickColor ? <button type="button" className="shape-edit-toolbar__eyedropper" aria-label={`Pipette ${label}`} title="Prélever une couleur" aria-pressed={eyedropperActive} disabled={disabled} onClick={onPickColor}>◉</button> : null}
      </div>
    </section>
  );
}
