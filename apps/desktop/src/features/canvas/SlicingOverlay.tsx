interface SlicingOverlayProps {
  /** Optional detail line — the latest CLI log entry. */
  detail?: string;
}

/** Full-canvas overlay shown while the slicer CLI runs. */
export function SlicingOverlay({ detail }: SlicingOverlayProps) {
  return (
    <div className="slicing" role="status" aria-live="polite">
      <div className="slicing-title">Slicing…</div>
      <div className="slicing-bar" />
      <div className="slicing-sub">{detail || "OrcaSlicer · paste profile"}</div>
    </div>
  );
}
