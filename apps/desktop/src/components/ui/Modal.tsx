import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, type ButtonVariant } from "./Button";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** When provided, a confirm button is rendered. */
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
  /** Marks the confirm action as in-flight and locks the dialog. */
  loading?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog: portalled, focus-trapped, Esc-dismissable. */
export function Modal({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  confirmDisabled = false,
  loading = false,
  children
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus();
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-modal-scrim" onMouseDown={() => !loading && onClose()}>
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="ui-modal__title">
          {title}
        </h2>
        <div className="ui-modal__body">{children}</div>
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {onConfirm && (
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              loading={loading}
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
