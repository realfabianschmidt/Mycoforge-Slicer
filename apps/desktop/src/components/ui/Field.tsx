import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

interface FieldProps {
  label: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Error message; switches the control to the invalid state. */
  error?: string;
  /** A single form control (input/select). Its aria-* wiring is handled here. */
  children: ReactNode;
}

/**
 * Label + control wrapper. Wires aria-describedby / aria-invalid onto the
 * control so hints and errors are announced to assistive technology.
 */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = errorId ?? hintId;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined
      })
    : children;

  return (
    <label className="ui-field">
      <span>{label}</span>
      {control}
      {hint && !error && (
        <span id={hintId} className="ui-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="ui-field__error">
          {error}
        </span>
      )}
    </label>
  );
}
