import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  /** Leading icon, rendered before the label. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

/** Token-styled button with variants, sizes and a built-in loading state. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? "ui-button--full" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 13 : 16} /> : icon}
      {children}
    </button>
  );
}
