import type { ReactNode } from "react";
import { PrinterControlView } from "./PrinterControlView";
import {
  DEFAULT_WORKSPACE_MODE,
  WorkspaceSwitcher,
  type WorkspaceMode
} from "./WorkspaceSwitcher";

interface WorkspaceStageProps {
  mode: WorkspaceMode;
  controlUrl: string;
  controlError: string;
  onModeChange: (mode: WorkspaceMode) => void;
  onPrinterSettingsClick: () => void;
  children: ReactNode;
}

export { DEFAULT_WORKSPACE_MODE };
export type { WorkspaceMode };

export function WorkspaceStage({
  mode,
  controlUrl,
  controlError,
  onModeChange,
  onPrinterSettingsClick,
  children
}: WorkspaceStageProps) {
  return (
    <section
      className={`workspace ${mode === "printer" ? "workspace--printer" : ""}`}
      aria-label="Workspace"
    >
      {mode === "slicer" ? (
        children
      ) : (
        <PrinterControlView
          url={controlUrl}
          error={controlError}
          onSettingsClick={onPrinterSettingsClick}
        />
      )}
      <WorkspaceSwitcher mode={mode} onModeChange={onModeChange} />
    </section>
  );
}
