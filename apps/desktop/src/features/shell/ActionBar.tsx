import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, FileCode2, Play } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import { WORKFLOW_STEPS, type WorkflowStep } from "../../hooks/use-workflow";

interface ActionBarProps {
  step: WorkflowStep;
  stepIndex: number;
  completed: WorkflowStep[];
  isBusy: boolean;
  /** A slice / process job is specifically running. */
  isSlicing: boolean;
  hasFile: boolean;
  hasGcode: boolean;
  needsReslice: boolean;
  /** The loaded file is already G-code (process, not slice). */
  isGcodeInput: boolean;
  /** A G-code file plus a valid printer URL are available. */
  canDeliver: boolean;
  canStartPrint: boolean;
  canSlice: boolean;
  onAdvance: () => void;
  onBack: () => void;
  onSlice: () => void;
  onReslice: () => void;
  onSend: () => void;
  onStartPrint: () => void;
}

interface PrimaryAction {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}

interface SecondaryAction {
  label: string;
  onClick: () => void;
}

/** Bottom bar — back, progress, and the single step-adaptive primary CTA. */
export function ActionBar({
  step,
  stepIndex,
  completed,
  isBusy,
  isSlicing,
  hasFile,
  hasGcode,
  needsReslice,
  isGcodeInput,
  canDeliver,
  canStartPrint,
  canSlice,
  onAdvance,
  onBack,
  onSlice,
  onReslice,
  onSend,
  onStartPrint
}: ActionBarProps) {
  const sliceLabel = needsReslice ? "Re-slice" : isGcodeInput ? "Process G-code" : "Slice";
  const sliceIcon = isGcodeInput ? <FileCode2 size={16} /> : <Play size={16} />;

  let primary: PrimaryAction;
  let secondary: SecondaryAction | undefined;

  if (step === "source") {
    primary = {
      label: "Continue",
      icon: <ArrowRight size={16} />,
      disabled: !hasFile,
      onClick: onAdvance
    };
  } else if (step === "profile") {
    primary = {
      label: sliceLabel,
      icon: sliceIcon,
      disabled: !hasFile || isBusy || !canSlice,
      onClick: onSlice
    };
  } else if (step === "slice") {
    if (isSlicing) {
      primary = { label: "Slicing…", icon: <Spinner size={15} />, disabled: true, onClick: noop };
    } else if (hasGcode && !needsReslice) {
      primary = {
        label: "Continue to Print",
        icon: <ArrowRight size={16} />,
        disabled: false,
        onClick: onAdvance
      };
      secondary = { label: "Re-slice", onClick: onReslice };
    } else {
      primary = { label: sliceLabel, icon: sliceIcon, disabled: !hasFile || !canSlice, onClick: onSlice };
    }
  } else {
    primary = {
      label: "Start Print",
      icon: <Play size={16} />,
      disabled: !canStartPrint || isBusy,
      onClick: onStartPrint
    };
    secondary = { label: "Send only", onClick: canDeliver ? onSend : noop };
  }

  return (
    <footer className="action">
      {step !== "source" && (
        <button type="button" className="action-back" onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </button>
      )}

      <div className="action-progress">
        {WORKFLOW_STEPS.map((id, index) => (
          <span
            key={id}
            className={index === stepIndex ? "on" : completed.includes(id) ? "done" : ""}
          />
        ))}
        <span className="action-progress-count">
          {String(stepIndex + 1).padStart(2, "0")} / 04
        </span>
      </div>

      <div className="action-spacer" />

      {secondary && (
        <button type="button" className="action-back" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      )}

      <button
        type="button"
        className="action-cta"
        disabled={primary.disabled}
        onClick={primary.onClick}
      >
        <span>{primary.label}</span>
        {primary.icon}
      </button>
    </footer>
  );
}

function noop() {
  /* slicing in progress — the CTA is inert */
}
