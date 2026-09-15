import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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

export function ColorPicker({ label, value, onChange, onPickColor, eyedropperActive = false, disabled = false, compact = true }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });

  useEffect(() => {
    if (!isOpen) return;
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = 190;
    const height = 178;
    setPosition({
      top: Math.min(window.innerHeight - height - 8, Math.max(8, anchor.bottom + 6)),
      left: Math.min(window.innerWidth - width - 8, Math.max(8, anchor.right - width)),
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [isOpen]);

  const controls = (
    <>
      <div className="color-picker__presets" role="group" aria-label={`Couleurs ${label}`}>
        {ANNOTATION_COLORS.map((color) => (
          <button key={color} type="button" className="color-picker__swatch" aria-label={`Couleur ${color}`} aria-pressed={value.toLowerCase() === color} disabled={disabled} onClick={() => { onChange(color); setIsOpen(false); }} style={{ "--swatch-color": color } as CSSProperties}><span aria-hidden="true">{value.toLowerCase() === color ? "✓" : ""}</span></button>
        ))}
      </div>
      <div className="color-picker__actions">
        <label className="color-picker__custom">Personnalisée<input type="color" aria-label={`Couleur personnalisée ${label}`} disabled={disabled} value={value} onChange={(event) => { onChange(event.target.value); setIsOpen(false); }} /></label>
        {onPickColor ? <button type="button" className="shape-edit-toolbar__eyedropper" aria-label={`Pipette ${label}`} title="Prélever une couleur" aria-pressed={eyedropperActive} disabled={disabled} onClick={() => { onPickColor(); setIsOpen(false); }}>◉</button> : null}
      </div>
    </>
  );

  if (!compact) {
    return <section className="color-picker" aria-label={`${label} palette`}><span className="color-picker__label">{label}</span>{controls}</section>;
  }

  return (
    <div className="color-picker color-picker--compact">
      <button ref={triggerRef} type="button" className="color-picker__trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={isOpen} title={label} disabled={disabled} onClick={() => setIsOpen((current) => !current)} style={{ "--swatch-color": value } as CSSProperties}><span aria-hidden="true" /><span className="color-picker__chevron" aria-hidden="true">▾</span></button>
      {isOpen ? createPortal(
        <div ref={popoverRef} className="color-picker__popover" role="dialog" aria-label={`${label} palette`} style={position}>{controls}</div>,
        document.body,
      ) : null}
    </div>
  );
}
