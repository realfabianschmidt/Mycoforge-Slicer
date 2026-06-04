interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  /** Accessible label; when set the spinner is announced to screen readers. */
  label?: string;
}

/** Minimal token-styled loading indicator. */
export function Spinner({ size = 16, label }: SpinnerProps) {
  return (
    <span
      className="ui-spinner"
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
