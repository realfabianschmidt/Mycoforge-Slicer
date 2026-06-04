import { useCallback, useRef, useState } from "react";
import { runMycoforge } from "../lib/api";

interface CliRunnerOptions {
  /** Called after every CLI run with the command label and its success flag. */
  onResult?: (label: string, ok: boolean, detail?: string) => void;
}

/**
 * Owns the Python CLI bridge: busy state, the rolling log buffer and the two
 * run helpers. `onResult` lets callers react to outcomes (e.g. fire a toast).
 */
export function useCliRunner({ onResult }: CliRunnerOptions = {}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  // Keep the latest callback without re-creating the run helpers.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [...current, message]);
  }, []);

  const runCli = useCallback(
    async (label: string, args: string[]): Promise<boolean> => {
      setIsBusy(true);
      setActiveLabel(label);
      appendLog(`> mycoforge ${args.join(" ")}`);
      try {
        const result = await runMycoforge(args);
        if (result.stdout.trim()) appendLog(result.stdout.trim());
        if (result.stderr.trim()) appendLog(result.stderr.trim());
        const detail = result.success ? undefined : extractCliError(result.stdout, result.stderr);
        if (detail) appendLog(`${label} error: ${detail}`);
        appendLog(`${label}: ${result.success ? "ok" : `failed with ${result.status}`}`);
        onResultRef.current?.(label, result.success, detail);
        return result.success;
      } catch (error) {
        const detail = String(error);
        appendLog(`${label}: ${detail}`);
        onResultRef.current?.(label, false, detail);
        return false;
      } finally {
        setIsBusy(false);
        setActiveLabel(null);
      }
    },
    [appendLog]
  );

  const runCliJson = useCallback(
    async <T,>(label: string, args: string[]): Promise<T | null> => {
      setIsBusy(true);
      setActiveLabel(label);
      appendLog(`> mycoforge ${args.join(" ")}`);
      try {
        const result = await runMycoforge(args);
        if (result.stdout.trim()) appendLog(result.stdout.trim());
        if (result.stderr.trim()) appendLog(result.stderr.trim());
        const detail = result.success ? undefined : extractCliError(result.stdout, result.stderr);
        if (detail) appendLog(`${label} error: ${detail}`);
        appendLog(`${label}: ${result.success ? "ok" : `failed with ${result.status}`}`);
        onResultRef.current?.(label, result.success, detail);
        if (!result.stdout.trim()) return null;
        return JSON.parse(result.stdout) as T;
      } catch (error) {
        const detail = String(error);
        appendLog(`${label}: ${detail}`);
        onResultRef.current?.(label, false, detail);
        return null;
      } finally {
        setIsBusy(false);
        setActiveLabel(null);
      }
    },
    [appendLog]
  );

  return { isBusy, activeLabel, logs, appendLog, runCli, runCliJson };
}

/** Signature of the JSON runner — handy for hooks that consume it. */
export type RunCliJson = ReturnType<typeof useCliRunner>["runCliJson"];

export function extractCliError(stdout: string, stderr: string): string {
  const parsed = parseLastJsonObject(stdout);
  const fromJson = parsed ? summarizeJsonError(parsed) : "";
  const stderrLine = firstMeaningfulLine(stderr);
  return [fromJson, stderrLine].filter(Boolean).join(" | ");
}

function summarizeJsonError(value: unknown): string {
  if (!isRecord(value)) return "";
  const parts: string[] = [];
  const stage = stringValue(value.stage);
  const error = stringValue(value.error);
  if (stage) parts.push(`stage=${stage}`);
  if (error) parts.push(error);
  const reasons = arrayStrings(value.reasons);
  if (reasons.length) parts.push(reasons.join("; "));

  const slice = value.slice;
  if (isRecord(slice)) {
    const sliceError = stringValue(slice.error);
    const sliceStderr = firstMeaningfulLine(stringValue(slice.stderr));
    const sliceStdout = firstMeaningfulLine(stringValue(slice.stdout));
    if (sliceError) parts.push(sliceError);
    if (sliceStderr) parts.push(sliceStderr);
    if (sliceStdout) parts.push(sliceStdout);
  }

  const readiness = value.readiness;
  if (isRecord(readiness)) {
    const readinessReasons = arrayStrings(readiness.reasons);
    if (readinessReasons.length) parts.push(readinessReasons.join("; "));
  }

  return unique(parts).join(": ");
}

function parseLastJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.lastIndexOf("{");
  if (start < 0) return null;
  for (let index = start; index >= 0; index = trimmed.lastIndexOf("{", index - 1)) {
    try {
      return JSON.parse(trimmed.slice(index));
    } catch {
      // Continue scanning in case logs preceded the final JSON payload.
    }
  }
  return null;
}

function firstMeaningfulLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}
