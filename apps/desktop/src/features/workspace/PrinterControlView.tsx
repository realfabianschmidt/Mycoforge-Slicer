import { ExternalLink, RefreshCw, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface PrinterControlViewProps {
  url: string;
  error: string;
  onSettingsClick: () => void;
}

const EMBED_TIMEOUT_MS = 8000;

/** Embedded printer UI styled to match the on-printer touch panel. */
export function PrinterControlView({ url, error, onSettingsClick }: PrinterControlViewProps) {
  const [frameKey, setFrameKey] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "blocked">("loading");

  useEffect(() => {
    if (error) {
      setStatus("blocked");
      return;
    }
    setStatus("loading");
    const timeout = window.setTimeout(() => {
      setStatus((current) => (current === "loading" ? "blocked" : current));
    }, EMBED_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [url, frameKey, error]);

  function retry() {
    setFrameKey((current) => current + 1);
  }

  function openExternal() {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* External open is best-effort — Tauri may restrict it. */
    }
  }

  const statusTone = status === "ready" ? "live" : status === "loading" ? "warn" : "neg";
  const statusLabel =
    status === "ready" ? "Connected" : status === "loading" ? "Loading" : "Check UI";

  return (
    <section className="printer-control">
      <header className="printer-control__head">
        <div className="printer-control__head-l">
          <span className="panel-eyebrow">REMOTE</span>
          <span className="printer-control__title">Printer Control</span>
        </div>
        <div className="printer-control__head-r">
          <span className={`panel-status-pill ${statusTone}`}>
            <span className="dot" />
            {statusLabel}
            {url ? <span className="printer-control__url">{url}</span> : null}
          </span>
          <button
            type="button"
            className="btn--icon"
            aria-label="Open in browser"
            onClick={openExternal}
            disabled={!url}
          >
            <ExternalLink size={14} />
          </button>
          <button type="button" className="btn--icon" aria-label="Reload" onClick={retry}>
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="btn--icon"
            aria-label="Settings"
            onClick={onSettingsClick}
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      <div className="printer-control__frame-wrap">
        {!error && (
          <iframe
            key={`${url}-${frameKey}`}
            className="printer-control__frame"
            data-reload-id={frameKey}
            src={url}
            title="Printer Control"
            onLoad={() => setStatus("ready")}
            allow="fullscreen; clipboard-read; clipboard-write"
          />
        )}

        {(status === "loading" || status === "blocked" || error) && (
          <div className={`printer-control__overlay${status === "loading" ? "" : " is-error"}`}>
            <div className="panel-empty">
              <div className="panel-empty-title">
                {status === "loading" && !error
                  ? "Loading printer control"
                  : "Printer control unavailable"}
              </div>
              <div className="panel-empty-sub">
                {error ||
                  (status === "loading"
                    ? url
                    : "The printer UI may be offline or blocking embedded views.")}
              </div>
              <div className="printer-control__overlay-actions">
                <button type="button" className="t-btn sm" onClick={retry}>
                  Retry
                </button>
                <button type="button" className="t-btn sm" onClick={onSettingsClick}>
                  Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
