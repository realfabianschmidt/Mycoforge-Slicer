import { Settings } from "lucide-react";
import type { WorkflowStep } from "../../hooks/use-workflow";
import { stepDescriptor } from "./steps";

export type StatusTone = "pos" | "warn" | "neg";

export interface SpineStatus {
  text: string;
  tone: StatusTone;
}

interface SpineProps {
  step: WorkflowStep;
  status: SpineStatus;
  onPrinterSettingsClick?: () => void;
}

function dotClass(tone: StatusTone): string {
  if (tone === "warn") return "dot dot--warn";
  if (tone === "neg") return "dot dot--neg";
  return "dot";
}

/** Top bar — brand, the active step, and the single global status. */
export function Spine({ step, status, onPrinterSettingsClick }: SpineProps) {
  const descriptor = stepDescriptor(step);

  return (
    <header className="spine">
      <div className="spine-mark">
        Mycoforge<span>Slicer</span>
      </div>
      <div className="spine-step">
        <div className="spine-step-id">— {descriptor.num}</div>
        <div className="spine-step-name">{descriptor.name}</div>
      </div>
      <div className="spine-meta">
        <div className="spine-meta-item">
          <span className={dotClass(status.tone)} />
          <b>{status.text}</b>
        </div>
        {onPrinterSettingsClick ? (
          <button
            type="button"
            className="spine-icon-button"
            aria-label="Printer settings"
            onClick={onPrinterSettingsClick}
          >
            <Settings size={15} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
