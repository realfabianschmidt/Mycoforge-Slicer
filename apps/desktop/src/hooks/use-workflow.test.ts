import { describe, expect, it } from "vitest";
import { initialWorkflowState, workflowReducer, type WorkflowState } from "./use-workflow";

describe("workflowReducer", () => {
  it("starts on source with nothing completed", () => {
    expect(initialWorkflowState).toEqual({ step: "source", completed: [] });
  });

  it("next advances and marks the left step complete", () => {
    const afterFirst = workflowReducer(initialWorkflowState, { type: "next" });
    expect(afterFirst.step).toBe("profile");
    expect(afterFirst.completed).toEqual(["source"]);

    const afterSecond = workflowReducer(afterFirst, { type: "next" });
    expect(afterSecond.step).toBe("slice");
    expect(afterSecond.completed).toEqual(["source", "profile"]);
  });

  it("next clamps at the last step", () => {
    let state = initialWorkflowState;
    for (let i = 0; i < 10; i++) state = workflowReducer(state, { type: "next" });
    expect(state.step).toBe("print");
  });

  it("back walks toward source and clamps there", () => {
    const onSlice = { step: "slice" as const, completed: [] };
    expect(workflowReducer(onSlice, { type: "back" }).step).toBe("profile");
    expect(workflowReducer(initialWorkflowState, { type: "back" }).step).toBe("source");
  });

  it("goTo jumps directly and is a no-op for the current step", () => {
    expect(workflowReducer(initialWorkflowState, { type: "goTo", step: "print" }).step).toBe(
      "print"
    );
    const same = workflowReducer(initialWorkflowState, { type: "goTo", step: "source" });
    expect(same).toBe(initialWorkflowState);
  });

  it("complete merges, dedupes and keeps step order", () => {
    const state = workflowReducer(
      { step: "slice", completed: ["source"] },
      { type: "complete", steps: ["slice", "profile", "source"] }
    );
    expect(state.completed).toEqual(["source", "profile", "slice"]);
  });

  it("invalidateFrom clears stale downstream completions", () => {
    const sliced: WorkflowState = {
      step: "profile",
      completed: ["source", "profile", "slice"]
    };

    expect(workflowReducer(sliced, { type: "invalidateFrom", step: "profile" })).toEqual({
      step: "profile",
      completed: ["source"]
    });

    expect(workflowReducer(sliced, { type: "invalidateFrom", step: "source" })).toEqual({
      step: "profile",
      completed: []
    });
  });

  it("reset returns to the initial state", () => {
    const dirty = { step: "print" as const, completed: ["source", "profile", "slice"] as const };
    expect(workflowReducer(dirty, { type: "reset" })).toEqual(initialWorkflowState);
  });
});
