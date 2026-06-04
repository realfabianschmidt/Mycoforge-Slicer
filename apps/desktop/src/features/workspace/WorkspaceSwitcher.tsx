export type WorkspaceMode = "slicer" | "printer";

interface WorkspaceSwitcherProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "slicer";

export function WorkspaceSwitcher({ mode, onModeChange }: WorkspaceSwitcherProps) {
  return (
    <div className="workspace-switcher" aria-label="Workspace">
      <button
        type="button"
        className={mode === "slicer" ? "on" : ""}
        aria-pressed={mode === "slicer"}
        onClick={() => onModeChange("slicer")}
      >
        Slicer
      </button>
      <button
        type="button"
        className={mode === "printer" ? "on" : ""}
        aria-pressed={mode === "printer"}
        onClick={() => onModeChange("printer")}
      >
        Printer
      </button>
    </div>
  );
}
