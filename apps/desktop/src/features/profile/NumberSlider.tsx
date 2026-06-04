interface NumberSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** Labelled range control with the design's custom rail / fill / thumb. */
export function NumberSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange
}: NumberSliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="field-row">
      <label>{label}</label>
      <div className="num-slider">
        <div className="range">
          <div className="range-rail" />
          <div className="range-fill" style={{ width: `${pct}%` }} />
          <div className="range-thumb" style={{ left: `${pct}%` }} />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </div>
        <div className="val">
          {value}
          {unit && <u>{unit}</u>}
        </div>
      </div>
    </div>
  );
}
