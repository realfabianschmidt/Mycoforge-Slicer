import { useCallback, useMemo, useReducer } from "react";

/** The four workflow steps, in order. */
export const WORKFLOW_STEPS = ["source", "profile", "slice", "print"] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export interface WorkflowState {
  step: WorkflowStep;
  completed: WorkflowStep[];
}

export type WorkflowAction =
  | { type: "goTo"; step: WorkflowStep }
  | { type: "next" }
  | { type: "back" }
  | { type: "complete"; steps: WorkflowStep[] }
  | { type: "invalidateFrom"; step: WorkflowStep }
  | { type: "reset" };

export const initialWorkflowState: WorkflowState = { step: "source", completed: [] };

function withCompleted(completed: WorkflowStep[], add: WorkflowStep[]): WorkflowStep[] {
  const merged = new Set([...completed, ...add]);
  return WORKFLOW_STEPS.filter((step) => merged.has(step));
}

/** Pure reducer — unit-tested in use-workflow.test.ts. */
export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "goTo":
      return state.step === action.step ? state : { ...state, step: action.step };
    case "next": {
      const index = WORKFLOW_STEPS.indexOf(state.step);
      const nextStep = WORKFLOW_STEPS[Math.min(index + 1, WORKFLOW_STEPS.length - 1)];
      return {
        step: nextStep,
        completed: withCompleted(state.completed, [state.step])
      };
    }
    case "back": {
      const index = WORKFLOW_STEPS.indexOf(state.step);
      return { ...state, step: WORKFLOW_STEPS[Math.max(index - 1, 0)] };
    }
    case "complete":
      return { ...state, completed: withCompleted(state.completed, action.steps) };
    case "invalidateFrom": {
      const index = WORKFLOW_STEPS.indexOf(action.step);
      return {
        ...state,
        completed: state.completed.filter((step) => WORKFLOW_STEPS.indexOf(step) < index)
      };
    }
    case "reset":
      return initialWorkflowState;
    default:
      return state;
  }
}

/** Step-state machine for the slicer wizard. */
export function useWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState);

  // Memoize action creators so callers can put `workflow` in dep arrays
  // without re-running on every render.
  const goTo = useCallback((step: WorkflowStep) => dispatch({ type: "goTo", step }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const complete = useCallback(
    (...steps: WorkflowStep[]) => dispatch({ type: "complete", steps }),
    []
  );
  const invalidateFrom = useCallback(
    (step: WorkflowStep) => dispatch({ type: "invalidateFrom", step }),
    []
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return useMemo(
    () => ({
      step: state.step,
      completed: state.completed,
      stepIndex: WORKFLOW_STEPS.indexOf(state.step),
      isFirst: state.step === WORKFLOW_STEPS[0],
      isLast: state.step === WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1],
      goTo,
      next,
      back,
      complete,
      invalidateFrom,
      reset
    }),
    [state.step, state.completed, goTo, next, back, complete, invalidateFrom, reset]
  );
}
