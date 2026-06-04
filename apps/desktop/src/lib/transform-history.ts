import type { ModelTransform } from "./api";
import { sameTransform } from "./model";

export interface TransformHistory {
  past: ModelTransform[];
  future: ModelTransform[];
}

export interface TransformHistoryResult {
  history: TransformHistory;
  transform: ModelTransform;
}

export const EMPTY_TRANSFORM_HISTORY: TransformHistory = {
  past: [],
  future: []
};

export function commitTransform(
  history: TransformHistory,
  previous: ModelTransform,
  next: ModelTransform
): TransformHistory {
  if (sameTransform(previous, next)) return history;
  return {
    past: [...history.past, previous],
    future: []
  };
}

export function undoTransform(
  history: TransformHistory,
  present: ModelTransform
): TransformHistoryResult | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    transform: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [present, ...history.future]
    }
  };
}

export function redoTransform(
  history: TransformHistory,
  present: ModelTransform
): TransformHistoryResult | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    transform: next,
    history: {
      past: [...history.past, present],
      future: history.future.slice(1)
    }
  };
}
