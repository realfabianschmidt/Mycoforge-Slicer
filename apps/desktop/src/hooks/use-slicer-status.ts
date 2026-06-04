import { useCallback, useEffect, useState } from "react";
import { CliLabel } from "../lib/cli-labels";
import type { SlicerResolution } from "../lib/settings";
import type { RunCliJson } from "./use-cli-runner";

interface SlicerStatusPayload {
  ok?: boolean;
  resolution?: SlicerResolution;
}

/**
 * Owns slicer resolution state and the custom-path input. Resolves the slicer
 * once on mount and exposes the install / test / set-custom actions.
 */
export function useSlicerStatus(runCliJson: RunCliJson) {
  const [resolution, setResolution] = useState<SlicerResolution | undefined>();
  const [customPath, setCustomPath] = useState("");

  const refresh = useCallback(async () => {
    const payload = await runCliJson<SlicerStatusPayload>(CliLabel.slicerStatus, [
      "slicer",
      "status"
    ]);
    if (payload?.resolution) setResolution(payload.resolution);
  }, [runCliJson]);

  const installOrca = useCallback(async () => {
    const payload = await runCliJson<SlicerStatusPayload>(CliLabel.installOrca, [
      "slicer",
      "install-orca",
      "--version",
      "latest"
    ]);
    if (payload?.ok) await refresh();
  }, [runCliJson, refresh]);

  const setCustomSlicer = useCallback(async () => {
    if (!customPath) return;
    const payload = await runCliJson<SlicerStatusPayload>(CliLabel.setCustomSlicer, [
      "slicer",
      "set-custom",
      "--path",
      customPath
    ]);
    if (payload?.resolution) setResolution(payload.resolution);
  }, [runCliJson, customPath]);

  const testSlicer = useCallback(async () => {
    const payload = await runCliJson<SlicerStatusPayload>(CliLabel.resolveSlicer, [
      "slicer",
      "resolve"
    ]);
    if (payload?.resolution) setResolution(payload.resolution);
  }, [runCliJson]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    resolution,
    customPath,
    setCustomPath,
    refresh,
    installOrca,
    setCustomSlicer,
    testSlicer
  };
}
