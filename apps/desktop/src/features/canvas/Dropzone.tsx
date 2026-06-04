import { UploadCloud } from "lucide-react";

interface DropzoneProps {
  onBrowse: () => void;
}

/** Empty-canvas call to action. Files can also be dropped anywhere (global). */
export function Dropzone({ onBrowse }: DropzoneProps) {
  return (
    <button type="button" className="dropzone" onClick={onBrowse}>
      <span className="dropzone-icon">
        <UploadCloud size={26} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s2)" }}>
        <span className="dropzone-title">Drop a model to start</span>
        <span className="dropzone-sub">STL · 3MF · G-code · or browse</span>
      </span>
    </button>
  );
}
