import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "./model";
import {
  EMPTY_TRANSFORM_HISTORY,
  commitTransform,
  redoTransform,
  undoTransform
} from "./transform-history";

describe("transform history", () => {
  it("undoes and redoes committed model transforms", () => {
    const rotated = { ...DEFAULT_TRANSFORM, rotateZDeg: 90 };
    const moved = { ...rotated, translateXMm: 20 };

    const first = commitTransform(EMPTY_TRANSFORM_HISTORY, DEFAULT_TRANSFORM, rotated);
    const second = commitTransform(first, rotated, moved);

    const undo = undoTransform(second, moved);
    expect(undo?.transform).toEqual(rotated);

    const redo = redoTransform(undo!.history, rotated);
    expect(redo?.transform).toEqual(moved);
  });

  it("does not store no-op commits", () => {
    const history = commitTransform(EMPTY_TRANSFORM_HISTORY, DEFAULT_TRANSFORM, DEFAULT_TRANSFORM);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(0);
  });
});
