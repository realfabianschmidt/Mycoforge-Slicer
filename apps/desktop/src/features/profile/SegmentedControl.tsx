export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional small caption above the label. */
  sub?: string;
}

interface SegmentedControlProps<T extends string> {
  label?: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  /** Centre the label (used for short single-word options). */
  centered?: boolean;
}

/** Pill-to-technical segmented picker. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
  centered = false
}: SegmentedControlProps<T>) {
  const seg = (
    <div className={columns === 3 ? "seg seg--triple" : "seg"}>
      {options.map((option) => {
        const classes = [
          "seg-item",
          centered ? "seg-item--center" : "",
          option.value === value ? "on" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={option.value}
            type="button"
            className={classes}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.sub && <small>{option.sub}</small>}
            {option.label}
          </button>
        );
      })}
    </div>
  );

  if (!label) return seg;
  return (
    <div className="field-row">
      <label>{label}</label>
      {seg}
    </div>
  );
}
