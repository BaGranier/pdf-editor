type PropertySliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  color: string;
  opacity?: number;
  previewThickness?: number;
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
  previewThickness = value,
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
        <output>{displayValue} {unit}</output>
      </div>
      <input
        type="range"
        aria-label={label}
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
          style={{
            height: `${previewHeight}px`,
            backgroundColor: color,
            opacity,
          }}
        />
      </div>
    </div>
  );
}
