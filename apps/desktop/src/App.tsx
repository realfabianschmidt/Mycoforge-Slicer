import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "./app/AppShell";
import { Modal } from "./components/ui/Modal";
import { useToast } from "./components/ui/Toast";
import { SlicerCanvas } from "./features/canvas/SlicerCanvas";
import { PrintPanel } from "./features/print/PrintPanel";
import { ProfilePanel } from "./features/profile/ProfilePanel";
import {
  SettingsModal,
  type PrinterDiscoveryCandidate,
  type SettingsTab
} from "./features/settings/SettingsModal";
import { ActionBar } from "./features/shell/ActionBar";
import { Spine, type SpineStatus } from "./features/shell/Spine";
import { WorkflowRail, type SlicerChip } from "./features/shell/WorkflowRail";
import { SlicePanel } from "./features/slice/SlicePanel";
import { SourcePanel } from "./features/source/SourcePanel";
import {
  DEFAULT_WORKSPACE_MODE,
  WorkspaceStage,
  type WorkspaceMode
} from "./features/workspace/WorkspaceStage";
import { useCliRunner } from "./hooks/use-cli-runner";
import { useFileDrop } from "./hooks/use-file-drop";
import { useMaterials } from "./hooks/use-materials";
import { useRecents } from "./hooks/use-recents";
import { useSlicerStatus } from "./hooks/use-slicer-status";
import { useWorkflow, type WorkflowStep } from "./hooks/use-workflow";
import { pickJobFile, prepareTransformedStl, readTextFile, type ModelTransform } from "./lib/api";
import { useAccent } from "./lib/appearance";
import {
  createBedVolume,
  formatBedVolume,
  useBedVolume,
  type AxisEnvelope,
  type BedVolume,
  type BedVolumeSource,
  type GeometryEnvelope
} from "./lib/bed-volume";
import { CliLabel } from "./lib/cli-labels";
import { analyzeGCode } from "./lib/gcode-analysis";
import { DEFAULT_TRANSFORM, isGcodePath, isStlPath, sameTransform, type PlacementTool } from "./lib/model";
import { usePrinterSettings } from "./lib/printer-settings";
import {
  buildProcessGcodeArgs,
  buildSliceProcessArgs,
  transformForSlicerGeometry
} from "./lib/slice-command";
import {
  defaultMinExtrusionPathMm,
  defaultSliceSettings,
  outputPathFor,
  type BedMeshMode,
  type MaterialProfile,
  type SliceSettingsState
} from "./lib/settings";
import {
  EMPTY_TRANSFORM_HISTORY,
  commitTransform as commitTransformHistory,
  redoTransform,
  undoTransform,
  type TransformHistory
} from "./lib/transform-history";
import type { ModelBounds } from "./features/canvas/scene";

type PendingAction = "send" | "print" | null;

interface NozzleQueryPayload {
  ok: boolean;
  nozzle_diameter?: number;
  error?: string;
}

interface PrinterDiscoveryPayload {
  ok: boolean;
  candidates?: PrinterDiscoveryCandidate[];
  error?: string;
}

interface BedVolumeQueryPayload {
  ok: boolean;
  bed_size_x_mm?: number;
  bed_size_y_mm?: number;
  bed_height_z_mm?: number;
  min_x_mm?: number;
  max_x_mm?: number;
  min_y_mm?: number;
  max_y_mm?: number;
  min_z_mm?: number;
  max_z_mm?: number;
  print_envelope?: CliEnvelope;
  move_envelope?: CliEnvelope;
  kinematics?: string;
  source?: string;
  error?: string;
}

interface CliAxisEnvelope {
  min_mm?: number;
  max_mm?: number;
}

interface CliEnvelope {
  x?: CliAxisEnvelope;
  y?: CliAxisEnvelope;
  z?: CliAxisEnvelope;
}

interface PrinterReadinessPayload {
  ok: boolean;
  ready: boolean;
  reasons: string[];
  klippy_state?: string | null;
  print_state?: string | null;
  idle_state?: string | null;
  is_paused?: boolean | null;
  virtual_sd_active?: boolean | null;
  piston_homed?: number | null;
  reservoir_ready?: number | null;
  material_primed?: number | null;
  reservoir_empty?: number | null;
  sync_mode?: string | null;
  start_print_state?: string | null;
  error?: string;
}

function portOf(url: string): string {
  try {
    return new URL(url).port;
  } catch {
    return "";
  }
}

function App() {
  const [inputPath, setInputPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [settings, setSettings] = useState<SliceSettingsState>(defaultSliceSettings);
  const [previewGCode, setPreviewGCode] = useState("");
  const [modelTransform, setModelTransform] = useState<ModelTransform>(DEFAULT_TRANSFORM);
  const modelTransformRef = useRef<ModelTransform>(DEFAULT_TRANSFORM);
  const [transformHistory, setTransformHistory] =
    useState<TransformHistory>(EMPTY_TRANSFORM_HISTORY);
  const [placementTool, setPlacementTool] = useState<PlacementTool>("move");
  const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null);
  const [sliceInvalidationReason, setSliceInvalidationReason] = useState("");
  const [printerOnline, setPrinterOnline] = useState<boolean | null>(null);
  const [printerReadiness, setPrinterReadiness] = useState<PrinterReadinessPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("printer");
  const [printerCandidates, setPrinterCandidates] = useState<PrinterDiscoveryCandidate[]>([]);
  const [printerDiscoveryMessage, setPrinterDiscoveryMessage] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(DEFAULT_WORKSPACE_MODE);

  const toast = useToast();
  const workflow = useWorkflow();
  const { recents, remember } = useRecents();
  const printer = usePrinterSettings();
  const { accent, setAccent } = useAccent();
  const bedVolume = useBedVolume();

  // Surface every CLI outcome as a toast (errors always; successes except the
  // silent on-mount slicer probe).
  const onResult = useCallback(
    (label: string, ok: boolean, detail?: string) => {
      if (!ok) {
        toast.error(detail ? `${label} failed: ${detail}` : `${label} failed.`);
      } else if (label !== CliLabel.slicerStatus) {
        toast.success(`${label} completed.`);
      }
    },
    [toast]
  );

  const { isBusy, activeLabel, logs, appendLog, runCli, runCliJson } = useCliRunner({ onResult });
  const slicer = useSlicerStatus(runCliJson);

  useEffect(() => {
    modelTransformRef.current = modelTransform;
  }, [modelTransform]);

  const invalidateSlice = useCallback(
    (reason: string, fromStep: WorkflowStep) => {
      const hadSlicedState = Boolean(previewGCode) || workflow.completed.includes("slice");
      setPreviewGCode("");
      setPrinterReadiness(null);
      workflow.invalidateFrom(fromStep);
      if (hadSlicedState && !sliceInvalidationReason) {
        setSliceInvalidationReason(reason);
        appendLog(`Slice invalidated: ${reason}`);
      }
    },
    [appendLog, previewGCode, sliceInvalidationReason, workflow]
  );

  const applyMaterialDefaults = useCallback(
    (material: MaterialProfile) => {
      const nextSettings = {
        ...settings,
        lineWidthMm: material.line_width_mm,
        layerHeightMm: material.layer_height_mm,
        printSpeedMmS: material.print_speed_mm_s,
        travelSpeedMmS: material.travel_speed_mm_s,
        minExtrusionPathMm: defaultMinExtrusionPathMm(material.line_width_mm)
      };
      if (!sameSliceSettings(settings, nextSettings)) {
        invalidateSlice("Material profile changed.", "profile");
      }
      setSettings(nextSettings);
    },
    [invalidateSlice, settings]
  );

  const handleSettingsChange = useCallback(
    (nextSettings: SliceSettingsState) => {
      if (!sameSliceSettings(settings, nextSettings)) {
        invalidateSlice("Slice settings changed.", "profile");
      }
      setSettings(nextSettings);
    },
    [invalidateSlice, settings]
  );

  // Bed-mesh strategy is a header-only setting — no geometry invalidation.
  const handleBedMeshModeChange = useCallback((mode: BedMeshMode) => {
    setSettings((current) =>
      current.bedMeshMode === mode ? current : { ...current, bedMeshMode: mode }
    );
  }, []);

  const materials = useMaterials({ onError: appendLog, onMaterialApplied: applyMaterialDefaults });

  const handleJobFileSelected = useCallback(
    (path: string) => {
      setInputPath(path);
      setPreviewGCode("");
      setModelTransform(DEFAULT_TRANSFORM);
      setTransformHistory(EMPTY_TRANSFORM_HISTORY);
      setPlacementTool("move");
      setModelBounds(null);
      setPrinterReadiness(null);
      setSliceInvalidationReason("");
      workflow.reset();
      remember(path);
      appendLog(`Job file selected: ${path}`);
    },
    [appendLog, remember, workflow]
  );

  useFileDrop(handleJobFileSelected, appendLog);

  useEffect(() => {
    setOutputPath(outputPathFor(inputPath));
  }, [inputPath]);

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stats = useMemo(
    () => (previewGCode ? analyzeGCode(previewGCode, settings.lineWidthMm) : null),
    [previewGCode, settings.lineWidthMm]
  );
  const moonrakerError = Boolean(printer.moonrakerError);
  const isSlicing = activeLabel === CliLabel.slice || activeLabel === CliLabel.processGcode;
  const hasFile = Boolean(inputPath);
  const hasGcode = Boolean(previewGCode);
  const sliceNeedsReslice = Boolean(sliceInvalidationReason);
  const showGCodePreview = workflow.step === "slice" || workflow.step === "print";
  const canvasGCode = showGCodePreview ? previewGCode : "";
  const isGcodeInput = isGcodePath(inputPath);
  const canSliceModel = !isStlPath(inputPath) || (modelBounds?.valid ?? false);
  const canDeliver = hasGcode && printer.configured && !moonrakerError;
  const canStartPrint = canDeliver && printerReadiness?.ready === true;
  const deliverFile = outputPath || inputPath;

  const status: SpineStatus = (() => {
    if (isSlicing) return { text: "Slicing", tone: "warn" };
    if (workflow.step === "print") {
      if (!printer.configured) return { text: "Printer needed", tone: "warn" };
      if (moonrakerError) return { text: "URL needed", tone: "warn" };
      if (printerReadiness?.ready) return { text: "Ready to print", tone: "pos" };
      if (printerReadiness && !printerReadiness.ready) return { text: "Not ready", tone: "neg" };
      if (printerOnline === true) return { text: "Connected", tone: "pos" };
      if (printerOnline === false) return { text: "Offline", tone: "neg" };
      return { text: "Ready", tone: "pos" };
    }
    if (sliceNeedsReslice) return { text: "Re-slice needed", tone: "warn" };
    if (hasGcode) return { text: "Sliced", tone: "pos" };
    return { text: "Ready", tone: "pos" };
  })();

  const stepMeta: Record<WorkflowStep, string> = {
    source: inputPath ? inputPath.split(/[\\/]/).pop() ?? inputPath : "No file loaded",
    profile: `${materials.selectedMaterial?.name ?? "â€”"} Â· ${settings.lineWidthMm}Â·${settings.layerHeightMm}Â·${settings.printSpeedMmS}`,
    slice: isSlicing
      ? "Slicingâ€¦"
      : sliceNeedsReslice
        ? "Re-slice required"
        : stats
          ? `${stats.layerCount} layers`
          : "Awaiting slice",
    print: printer.configured
      ? printerReadiness?.ready
        ? "Ready to print"
        : (printerReadiness?.reasons[0] ?? printer.moonrakerUrl.replace(/^https?:\/\//i, ""))
      : "Printer not configured"
  };

  const slicerChip: SlicerChip = (() => {
    const state = slicer.resolution?.state ?? "unknown";
    if (state === "installed") {
      return { label: `Orca ${slicer.resolution?.version ?? ""}`.trim(), tone: "pos" };
    }
    if (state === "custom") return { label: "Custom slicer", tone: "pos" };
    return { label: "Not configured", tone: "warn" };
  })();

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleBrowseJobFile() {
    try {
      const path = await pickJobFile();
      if (!path) return;
      handleJobFileSelected(path);
    } catch (error) {
      appendLog(`Job file picker failed: ${String(error)}`);
      toast.error("Could not open the file picker.");
    }
  }

  async function loadPreview(path: string) {
    try {
      const gcode = await readTextFile(path);
      setPreviewGCode(gcode);
      setSliceInvalidationReason("");
      setPrinterReadiness(null);
      appendLog(`Preview loaded: ${path}`);
    } catch (error) {
      appendLog(`Preview load failed: ${String(error)}`);
      toast.warning("G-code ran, but the preview could not be loaded.");
    }
  }

  /** Runs the slice (STL/3MF) or process (G-code) job for the loaded file. */
  async function runSliceJob() {
    const selectedMaterial = materials.selectedMaterial;
    if (!inputPath || !outputPath || !selectedMaterial) {
      toast.warning("Pick a job file before slicing.");
      return;
    }

    if (isGcodeInput) {
      const ok = await runCli(
        CliLabel.processGcode,
        buildProcessGcodeArgs({
          inputPath,
          outputPath,
          materialProfilePath: selectedMaterial.profile_path,
          settings
        })
      );
      if (ok) {
        await loadPreview(outputPath);
        workflow.complete("source", "profile", "slice");
      }
      return;
    }

    if (isStlPath(inputPath) && !modelBounds) {
      toast.warning("Wait until the model preview has measured the object bounds.");
      return;
    }
    if (isStlPath(inputPath) && modelBounds && !modelBounds.valid) {
      toast.warning("The arranged STL is outside the printable volume.");
      return;
    }

    let modelPathForSlice = inputPath;
    let layoutTransform: ModelTransform | undefined;
    if (isStlPath(inputPath)) {
      try {
        modelPathForSlice = await prepareTransformedStl(
          inputPath,
          transformForSlicerGeometry(modelTransform, bedVolume.volume)
        );
        layoutTransform = modelTransform;
        appendLog(`Layout STL prepared: ${modelPathForSlice}`);
      } catch (error) {
        appendLog(`Layout STL preparation failed: ${String(error)}`);
        toast.error("Could not prepare the arranged STL for slicing.");
        return;
      }
    }

    const args = buildSliceProcessArgs({
      modelPath: modelPathForSlice,
      outputPath,
      materialProfilePath: selectedMaterial.profile_path,
      settings,
      layoutTransform,
      bedVolume: bedVolume.volume,
      moonrakerUrl: printer.configured ? printer.moonrakerUrl : undefined
    });

    const ok = await runCli(CliLabel.slice, args);
    if (ok) {
      await loadPreview(outputPath);
      workflow.complete("source", "profile", "slice");
    }
  }

  const handleTransformPreview = useCallback((next: ModelTransform) => {
    setModelTransform(next);
  }, []);

  const handleTransformCommit = useCallback((next: ModelTransform, previous?: ModelTransform) => {
    const base = previous ?? modelTransformRef.current;
    setModelTransform(next);
    modelTransformRef.current = next;
    setTransformHistory((history) => commitTransformHistory(history, base, next));
    if (!sameTransform(base, next)) {
      invalidateSlice("Source layout changed.", "source");
    }
  }, [invalidateSlice]);

  const handleUndoTransform = useCallback(() => {
    const result = undoTransform(transformHistory, modelTransformRef.current);
    if (!result) return;
    setTransformHistory(result.history);
    setModelTransform(result.transform);
    modelTransformRef.current = result.transform;
    invalidateSlice("Source layout changed.", "source");
  }, [invalidateSlice, transformHistory]);

  const handleRedoTransform = useCallback(() => {
    const result = redoTransform(transformHistory, modelTransformRef.current);
    if (!result) return;
    setTransformHistory(result.history);
    setModelTransform(result.transform);
    modelTransformRef.current = result.transform;
    invalidateSlice("Source layout changed.", "source");
  }, [invalidateSlice, transformHistory]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndoTransform();
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        handleRedoTransform();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRedoTransform, handleUndoTransform]);

  /** Profile-step CTA: advance into the Slice step, then run the job. */
  async function handleSlice() {
    if (workflow.step === "profile") workflow.next();
    await runSliceJob();
  }

  function openSettings(tab: SettingsTab = "printer") {
    if (tab === "printer") printer.resetDraft();
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  function handleSavePrinterSettings() {
    const result = printer.save();
    if (!result.configured) {
      toast.warning(result.error);
      return;
    }
    setPrinterOnline(null);
    setPrinterReadiness(null);
    setSettingsOpen(false);
    toast.success(`Printer set to ${result.host}.`);
    void handleFetchBedVolume({ silent: true, url: result.moonrakerUrl });
  }

  async function handleFetchBedVolume(
    options: { silent?: boolean; url?: string } = {}
  ): Promise<BedVolume | null> {
    const moonrakerUrl = options.url ?? printer.moonrakerUrl;
    if (!moonrakerUrl) return null;
    const payload = await runCliJson<BedVolumeQueryPayload>(CliLabel.bedVolumeQuery, [
      "bed-volume-query",
      "--moonraker",
      moonrakerUrl
    ]);
    if (
      !payload?.ok ||
      typeof payload.bed_size_x_mm !== "number" ||
      typeof payload.bed_size_y_mm !== "number" ||
      typeof payload.bed_height_z_mm !== "number"
    ) {
      if (!options.silent) {
        toast.error(payload?.error ?? "Could not read printer bed volume.");
      }
      return null;
    }
    let next: BedVolume;
    try {
      next = bedVolumeFromPayload(payload);
    } catch (error) {
      if (!options.silent) {
        toast.error(String(error));
      }
      return null;
    }
    bedVolume.setVolume(next);
    if (!options.silent) {
      toast.success(
        `Printer geometry synced: ${formatBedVolume(next)}` +
          (payload.kinematics ? ` (${payload.kinematics})` : "")
      );
    }
    return next;
  }

  async function handleDiscoverPrinters() {
    setPrinterDiscoveryMessage("Searching local subnet...");
    setPrinterCandidates([]);
    const args = [
      "discover-printers",
      "--moonraker-port",
      printer.draft.moonrakerPort,
      "--control-port",
      printer.draft.controlPort
    ];
    const fallbackHost = printer.draftResult.host || printer.host;
    if (fallbackHost) {
      args.push("--fallback-host", fallbackHost);
    }
    const payload = await runCliJson<PrinterDiscoveryPayload>(CliLabel.discoverPrinters, args);
    if (!payload?.ok) {
      setPrinterDiscoveryMessage(payload?.error ?? "Printer discovery failed.");
      return;
    }
    const candidates = payload.candidates ?? [];
    setPrinterCandidates(candidates);
    setPrinterDiscoveryMessage(candidates.length ? "" : "No printer found.");
  }

  async function handleTestPrinterDraft() {
    const draft = printer.draftResult;
    if (!draft.configured) {
      toast.warning(draft.error);
      return;
    }
    const ok = await runCli(CliLabel.testConnection, [
      "test-connection",
      "--moonraker",
      draft.moonrakerUrl
    ]);
    if (ok) {
      toast.success(`Printer reachable at ${draft.moonrakerUrl}.`);
    } else {
      toast.error("Printer test failed.");
    }
  }

  function handleUsePrinterCandidate(candidate: PrinterDiscoveryCandidate) {
    printer.setDraft({
      hostInput: candidate.host,
      moonrakerPort: portOf(candidate.moonrakerUrl) || printer.draft.moonrakerPort,
      controlPort: portOf(candidate.controlUrl) || printer.draft.controlPort
    });
  }

  async function confirmSend() {
    if (!deliverFile) return;
    if (!printer.configured) {
      toast.warning(printer.moonrakerError);
      setPendingAction(null);
      openSettings("printer");
      return;
    }
    await runCli(CliLabel.send, ["upload", deliverFile, "--moonraker", printer.moonrakerUrl]);
    setPendingAction(null);
  }

  async function confirmPrint() {
    if (!deliverFile) return;
    if (!printer.configured) {
      toast.warning(printer.moonrakerError);
      setPendingAction(null);
      openSettings("printer");
      return;
    }
    const readiness = printerReadiness?.ready ? printerReadiness : await refreshPrintReadiness();
    if (!readiness?.ready) {
      toast.warning(`Printer not ready: ${readinessReason(readiness)}`);
      return;
    }
    await runCli(CliLabel.print, ["print", deliverFile, "--moonraker", printer.moonrakerUrl]);
    setPendingAction(null);
  }

  async function refreshPrintReadiness(): Promise<PrinterReadinessPayload | null> {
    if (!printer.configured) {
      toast.warning(printer.moonrakerError);
      openSettings("printer");
      return null;
    }
    if (printer.moonrakerError) {
      toast.warning(printer.moonrakerError);
      return null;
    }
    const payload = await runCliJson<PrinterReadinessPayload>(CliLabel.printReadiness, [
      "print-readiness",
      "--moonraker",
      printer.moonrakerUrl,
      "--json"
    ]);
    setPrinterOnline(payload?.ok ?? false);
    setPrinterReadiness(payload);
    if (payload?.ok) {
      void handleFetchBedVolume({ silent: true });
    }
    return payload;
  }

  async function handleTestConnection() {
    await refreshPrintReadiness();
  }

  async function handleFetchPrinterNozzle() {
    if (!printer.configured) {
      toast.warning(printer.moonrakerError);
      openSettings("printer");
      return;
    }
    if (printer.moonrakerError) {
      toast.warning(printer.moonrakerError);
      return;
    }
    const payload = await runCliJson<NozzleQueryPayload>(CliLabel.nozzleQuery, [
      "nozzle-query",
      "--moonraker",
      printer.moonrakerUrl
    ]);
    if (!payload?.ok || typeof payload.nozzle_diameter !== "number") {
      toast.error(payload?.error ?? "Could not read printer nozzle.");
      return;
    }
    handleSettingsChange({
      ...settings,
      lineWidthMm: payload.nozzle_diameter,
      minExtrusionPathMm: defaultMinExtrusionPathMm(payload.nozzle_diameter)
    });
    toast.success(`Line width set to ${payload.nozzle_diameter} mm.`);
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let panel: ReactNode;
  if (workflow.step === "source") {
    panel = (
      <SourcePanel
        inputPath={inputPath}
        recents={recents}
        transform={modelTransform}
        placementTool={placementTool}
        modelBounds={modelBounds}
        volume={bedVolume.volume}
        canUndoTransform={transformHistory.past.length > 0}
        canRedoTransform={transformHistory.future.length > 0}
        onBrowse={handleBrowseJobFile}
        onSelectRecent={handleJobFileSelected}
        onPlacementToolChange={setPlacementTool}
        onTransformCommit={handleTransformCommit}
        onUndoTransform={handleUndoTransform}
        onRedoTransform={handleRedoTransform}
      />
    );
  } else if (workflow.step === "profile") {
    panel = (
      <ProfilePanel
        materials={materials.materials}
        selectedMaterialId={materials.selectedMaterialId}
        onSelectMaterial={materials.selectMaterial}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        moonrakerError={printer.moonrakerError}
        isFetchingNozzle={activeLabel === CliLabel.nozzleQuery}
        onFetchPrinterNozzle={handleFetchPrinterNozzle}
      />
    );
  } else if (workflow.step === "slice") {
    panel = (
      <SlicePanel
        isBusy={isSlicing}
        gcode={previewGCode}
        stats={stats}
        logs={logs}
        invalidationReason={sliceInvalidationReason}
      />
    );
  } else {
    panel = (
      <PrintPanel
        configured={printer.configured}
        host={printer.host}
        normalizedMoonrakerUrl={printer.moonrakerUrl}
        moonrakerError={printer.moonrakerError}
        normalizedControlUrl={printer.controlUrl}
        outputPath={outputPath}
        printerOnline={printerOnline}
        isBusy={isBusy}
        activeLabel={activeLabel}
        onOpenSettings={() => openSettings("printer")}
        onTestConnection={handleTestConnection}
        readiness={printerReadiness}
      />
    );
  }

  return (
    <>
      <AppShell
        mode={workspaceMode}
        spine={
          <Spine
            step={workflow.step}
            status={status}
            onPrinterSettingsClick={() => openSettings("printer")}
          />
        }
        rail={
          <WorkflowRail
            step={workflow.step}
            completed={workflow.completed}
            stepMeta={stepMeta}
            onStepSelect={workflow.goTo}
            slicer={slicerChip}
            onSlicerClick={() => openSettings("slicer")}
          />
        }
        canvas={
          <WorkspaceStage
            mode={workspaceMode}
            controlUrl={printer.controlUrl}
            controlError={printer.controlError}
            onModeChange={setWorkspaceMode}
            onPrinterSettingsClick={() => openSettings("printer")}
          >
            <SlicerCanvas
              inputPath={inputPath}
              gcode={canvasGCode}
              lineWidthMm={settings.lineWidthMm}
              layerHeightMm={settings.layerHeightMm}
              isSlicing={isSlicing}
              slicingDetail={logs[logs.length - 1]}
              transform={modelTransform}
              placementTool={placementTool}
              modelBounds={modelBounds}
              volume={bedVolume.volume}
              onTransformPreview={handleTransformPreview}
              onTransformCommit={handleTransformCommit}
              onBoundsChange={setModelBounds}
              onBrowse={handleBrowseJobFile}
            />
          </WorkspaceStage>
        }
        panel={panel}
        action={
          <ActionBar
            step={workflow.step}
            stepIndex={workflow.stepIndex}
            completed={workflow.completed}
            isBusy={isBusy}
            isSlicing={isSlicing}
            hasFile={hasFile}
            hasGcode={hasGcode}
            needsReslice={sliceNeedsReslice}
            isGcodeInput={isGcodeInput}
            canDeliver={canDeliver}
            canStartPrint={canStartPrint}
            canSlice={canSliceModel}
            onAdvance={workflow.next}
            onBack={workflow.back}
            onSlice={handleSlice}
            onReslice={runSliceJob}
            onSend={() => setPendingAction("send")}
            onStartPrint={() => setPendingAction("print")}
          />
        }
      />

      <Modal
        open={pendingAction === "send"}
        title="Send to printer"
        onClose={() => setPendingAction(null)}
        onConfirm={confirmSend}
        confirmLabel="Send"
        loading={isBusy}
      >
        Upload <strong>{deliverFile}</strong> to{" "}
        <strong>{printer.moonrakerUrl || "Printer not configured"}</strong>?
      </Modal>

      <Modal
        open={pendingAction === "print"}
        title="Start print"
        onClose={() => setPendingAction(null)}
        onConfirm={confirmPrint}
        confirmLabel="Print now"
        confirmVariant="danger"
        confirmDisabled={!canStartPrint}
        loading={isBusy}
      >
        This uploads <strong>{deliverFile}</strong> and starts the print on{" "}
        <strong>{printer.moonrakerUrl || "Printer not configured"}</strong> immediately.
        {printerReadiness?.ready ? null : (
          <div className="printer-settings-preview printer-settings-preview--panel">
            <div>
              <span>Status</span>
              <b>{readinessReason(printerReadiness)}</b>
            </div>
          </div>
        )}
      </Modal>

      <SettingsModal
        open={settingsOpen}
        defaultTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        draft={printer.draft}
        draftResult={printer.draftResult}
        candidates={printerCandidates}
        discoveryMessage={printerDiscoveryMessage}
        isBusy={isBusy}
        activeLabel={activeLabel}
        savedHost={printer.host}
        printerOnline={printerOnline}
        onDraftChange={printer.setDraft}
        onSearch={handleDiscoverPrinters}
        onTest={handleTestPrinterDraft}
        onUseCandidate={handleUsePrinterCandidate}
        onSavePrinter={handleSavePrinterSettings}
        slicerResolution={slicer.resolution}
        customPath={slicer.customPath}
        onCustomPathChange={slicer.setCustomPath}
        onInstallOrca={slicer.installOrca}
        onSetCustom={slicer.setCustomSlicer}
        onTestSlicer={slicer.testSlicer}
        bedMeshMode={settings.bedMeshMode}
        onBedMeshModeChange={handleBedMeshModeChange}
        accent={accent}
        onAccentChange={setAccent}
      />
    </>
  );
}

function readinessReason(readiness: PrinterReadinessPayload | null): string {
  if (!readiness) return "readiness has not been checked";
  return readiness.reasons[0] ?? readiness.error ?? "readiness check failed";
}

function bedVolumeFromPayload(payload: BedVolumeQueryPayload): BedVolume {
  const printEnvelope =
    envelopeFromCli(payload.print_envelope) ??
    envelopeFromBounds(
      payload.min_x_mm,
      payload.max_x_mm,
      payload.min_y_mm,
      payload.max_y_mm,
      payload.min_z_mm,
      payload.max_z_mm
    ) ??
    envelopeFromBounds(
      0,
      payload.bed_size_x_mm,
      0,
      payload.bed_size_y_mm,
      0,
      payload.bed_height_z_mm
    );

  if (!printEnvelope) {
    throw new Error("Printer geometry payload is missing a printable envelope.");
  }

  return createBedVolume({
    printEnvelope,
    moveEnvelope: envelopeFromCli(payload.move_envelope) ?? undefined,
    kinematics: payload.kinematics,
    source: bedVolumeSource(payload.source)
  });
}

function envelopeFromCli(value: CliEnvelope | undefined): GeometryEnvelope | null {
  if (!value) return null;
  const x = axisFromCli(value.x);
  const y = axisFromCli(value.y);
  const z = axisFromCli(value.z);
  if (!x || !y || !z) return null;
  return { x, y, z };
}

function axisFromCli(value: CliAxisEnvelope | undefined): AxisEnvelope | null {
  if (!value) return null;
  return axisFromBounds(value.min_mm, value.max_mm);
}

function envelopeFromBounds(
  minX: number | undefined,
  maxX: number | undefined,
  minY: number | undefined,
  maxY: number | undefined,
  minZ: number | undefined,
  maxZ: number | undefined
): GeometryEnvelope | null {
  const x = axisFromBounds(minX, maxX);
  const y = axisFromBounds(minY, maxY);
  const z = axisFromBounds(minZ, maxZ);
  if (!x || !y || !z) return null;
  return { x, y, z };
}

function axisFromBounds(min: number | undefined, max: number | undefined): AxisEnvelope | null {
  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return null;
  }
  return { minMm: min, maxMm: max };
}

function bedVolumeSource(value: string | undefined): BedVolumeSource {
  if (
    value === "myco_geometry" ||
    value === "toolhead" ||
    value === "configfile" ||
    value === "printer" ||
    value === "manual"
  ) {
    return value;
  }
  return "printer";
}

function sameSliceSettings(left: SliceSettingsState, right: SliceSettingsState): boolean {
  return (
    left.lineWidthMm === right.lineWidthMm &&
    left.layerHeightMm === right.layerHeightMm &&
    left.printSpeedMmS === right.printSpeedMmS &&
    left.vaseMode === right.vaseMode &&
    left.smoothVase === right.smoothVase &&
    left.filterShortExtrusions === right.filterShortExtrusions &&
    left.minExtrusionPathMm === right.minExtrusionPathMm &&
    left.travelSpeedMmS === right.travelSpeedMmS &&
    left.wallLoops === right.wallLoops &&
    left.topShellLayers === right.topShellLayers &&
    left.bottomShellLayers === right.bottomShellLayers &&
    left.infillDensityPercent === right.infillDensityPercent &&
    left.retractionStrength === right.retractionStrength &&
    left.slicerBinary === right.slicerBinary &&
    left.slicerProfile === right.slicerProfile
  );
}

export default App;
