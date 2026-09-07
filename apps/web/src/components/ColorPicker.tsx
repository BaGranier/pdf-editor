import { useState, type CSSProperties } from "react";
import { ANNOTATION_COLORS } from "../editing/types";

type ColorPickerProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onPickColor?: () => void;
  eyedropperActive?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

export function ColorPicker({ label, value, onChange, onPickColor, eyedropperActive = false, disabled = false, compact = false }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const controls = <>
    <div className="color-picker__presets" role="group" aria-label={`Couleurs ${label}`}>
      {ANNOTATION_COLORS.map((color) => (
        <button key={color} type="button" className="color-picker__swatch" aria-label={`Couleur ${color}`} aria-pressed={value.toLowerCase() === color} disabled={disabled} onClick={() => { onChange(color); setIsOpen(false); }} style={{ "--swatch-color": color } as CSSProperties}><span aria-hidden="true">{value.toLowerCase() === color ? "✓" : ""}</span></button>
      ))}
    </div>
    <div className="color-picker__actions">
      <label className="color-picker__custom">Personnalisée<input type="color" aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>
      {onPickColor ? <button type="button" className="shape-edit-toolbar__eyedropper" aria-label={`Pipette ${label}`} title="Prélever une couleur" aria-pressed={eyedropperActive} disabled={disabled} onClick={onPickColor}>◉</button> : null}
    </div>
  </>;

  if (compact) {
    return (
      <div className="color-picker color-picker--compact">
        <button type="button" className="color-picker__trigger" aria-label={label} aria-expanded={isOpen} title={label} disabled={disabled} onClick={() => setIsOpen((current) => !current)} style={{ "--swatch-color": value } as CSSProperties}><span aria-hidden="true" /></button>
        {isOpen ? <div className="color-picker__popover">{controls}</div> : null}
      </div>
    );
  }

  return (
    <section className="color-picker" aria-label={`${label} palette`}>
      <span className="color-picker__label">{label}</span>
      {controls}
    </section>
  );
}
