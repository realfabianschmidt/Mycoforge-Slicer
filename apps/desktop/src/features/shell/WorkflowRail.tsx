import type { WorkflowStep } from "../../hooks/use-workflow";
import type { StatusTone } from "./Spine";
import { STEP_DESCRIPTORS } from "./steps";

export interface SlicerChip {
  label: string;
  tone: StatusTone;
}

interface WorkflowRailProps {
  step: WorkflowStep;
  completed: WorkflowStep[];
  /** One-line summary per step, rendered as the step's meta. */
  stepMeta: Record<WorkflowStep, string>;
  onStepSelect: (step: WorkflowStep) => void;
  slicer: SlicerChip;
  onSlicerClick: () => void;
}

function chipDot(tone: StatusTone): string {
  if (tone === "warn") return "dot dot--warn";
  if (tone === "neg") return "dot dot--neg";
  return "dot";
}

/** Left rail — the four workflow steps plus the slicer-status chip. */
export function WorkflowRail({
  step,
  completed,
  stepMeta,
  onStepSelect,
  slicer,
  onSlicerClick
}: WorkflowRailProps) {
  return (
    <aside className="rail">
      <div className="rail-head">— Workflow</div>

      {STEP_DESCRIPTORS.map((descriptor) => {
        const isActive = descriptor.id === step;
        const isDone = completed.includes(descriptor.id);
        const isPending = !isActive && !isDone;
        const classes = [
          "step",
          isActive && "active",
          isDone && "done",
          isPending && "pending"
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={descriptor.id}
            type="button"
            className={classes}
            disabled={isPending}
            aria-current={isActive ? "step" : undefined}
            onClick={() => onStepSelect(descriptor.id)}
          >
            <span className="step-icon">{descriptor.icon}</span>
            <span>
              <span className="step-num">{descriptor.num}</span>
              <span className="step-name" style={{ marginLeft: 8 }}>
                {descriptor.name}
              </span>
            </span>
            <span className="step-meta">{stepMeta[descriptor.id]}</span>
          </button>
        );
      })}

      <div className="rail-foot">
        <button type="button" className="rail-slicer" onClick={onSlicerClick}>
          <span className="rail-slicer-label">Slicer</span>
          <span className="rail-slicer-value">
            <span className={chipDot(slicer.tone)} />
            {slicer.label}
          </span>
        </button>
      </div>
    </aside>
  );
}
