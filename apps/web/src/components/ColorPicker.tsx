import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { floatingPortalTarget, useFloatingPosition } from "../hooks/useFloatingPosition";
import { usePopoverDismiss } from "../hooks/usePopoverDismiss";
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

  const panelId = useId();
  const expanded = isOpen && !disabled && compact;
  useEffect(() => {
    if (isOpen && !expanded) setIsOpen(false);
  }, [expanded, isOpen]);
  useFloatingPosition(expanded, triggerRef, popoverRef, "bottom-end", setIsOpen);
  usePopoverDismiss(expanded, triggerRef, popoverRef, setIsOpen);
  useLayoutEffect(() => {
    if (expanded) popoverRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [expanded]);

  const controls = (
    <>
      <div className="color-picker__presets" role="group" aria-label={`Couleurs ${label}`}>
        {ANNOTATION_COLORS.map((color) => (
          <button key={color} type="button" className="color-picker__swatch" aria-label={`Couleur ${color}`} aria-pressed={value.toLowerCase() === color} disabled={disabled} onClick={() => { onChange(color); setIsOpen(false); triggerRef.current?.focus(); }} style={{ "--swatch-color": color } as CSSProperties}><span aria-hidden="true">{value.toLowerCase() === color ? "✓" : ""}</span></button>
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
      <button ref={triggerRef} type="button" className="color-picker__trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? panelId : undefined} title={label} disabled={disabled} onClick={() => setIsOpen((current) => !current)} style={{ "--swatch-color": value } as CSSProperties}><span aria-hidden="true" /><span className="color-picker__chevron" aria-hidden="true">▾</span></button>
      {expanded ? createPortal(
        <div ref={popoverRef} id={panelId} className="floating-surface color-picker__popover" role="dialog" aria-label={`${label} palette`}>{controls}</div>,
        floatingPortalTarget(triggerRef.current),
      ) : null}
    </div>
  );
}
