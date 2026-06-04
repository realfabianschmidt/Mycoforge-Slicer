import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastKind = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const AUTO_DISMISS_MS = 5000;

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle
};

/** Wrap the app once; exposes useToast() to descendants. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      notify,
      success: (message) => notify("success", message),
      error: (message) => notify("error", message),
      info: (message) => notify("info", message),
      warning: (message) => notify("warning", message)
    }),
    [notify]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Read the toast API. Must be called within <ToastProvider>. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="ui-toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            className={`ui-toast ui-toast--${toast.kind}`}
            role="status"
            aria-live="polite"
          >
            <Icon size={18} className={`ui-toast__icon ui-toast__icon--${toast.kind}`} />
            <span className="ui-toast__message">{toast.message}</span>
            <button
              type="button"
              className="ui-toast__close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
