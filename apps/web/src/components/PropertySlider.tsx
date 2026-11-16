type PropertySliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  color: string;
  opacity?: number;
  signed?: boolean;
  previewThickness?: number;
  previewKind?: "line" | "shape";
  previewFillColor?: string | null;
  previewLabel: string;
  onChange: (value: number) => void;
  onCommit: () => void;
};

export function PropertySlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  color,
  opacity = 1,
  signed = false,
  previewThickness = value,
  previewKind = "line",
  previewFillColor,
  previewLabel,
  onChange,
  onCommit,
}: PropertySliderProps) {
  const displayValue = Number.isInteger(value) ? value : value.toFixed(1);
  const previewHeight = Math.min(20, Math.max(1, previewThickness));

  return (
    <div className="property-slider">
      <div className="property-slider__header">
        <span>{label}</span>
        <output>{signed && value >= 0 ? "+" : ""}{displayValue} {unit}</output>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={signed ? `${value >= 0 ? "+" : ""}${displayValue} ${unit}` : undefined}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <div className="property-slider__bounds" aria-hidden="true">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
      <div className="property-slider__preview" aria-label={previewLabel}>
        <span
          className={previewKind === "shape" ? "property-slider__preview-shape" : undefined}
          style={{
            height: previewKind === "shape" ? "1.45rem" : `${previewHeight}px`,
            backgroundColor: previewKind === "shape" ? previewFillColor ?? "transparent" : color,
            border: previewKind === "shape" ? `${Math.min(8, previewHeight)}px solid ${color}` : undefined,
            opacity,
          }}
        />
      </div>
    </div>
  );
}
