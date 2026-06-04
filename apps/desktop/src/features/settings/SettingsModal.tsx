import { CheckCircle2, Download, Search, Wifi, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Field } from "../../components/ui/Field";
import { Spinner } from "../../components/ui/Spinner";
import { ACCENT_PRESETS, type AccentId } from "../../lib/appearance";
import { CliLabel } from "../../lib/cli-labels";
import type { PrinterDraft, PrinterSettingsResult } from "../../lib/printer-settings";
import { BED_MESH_MODES, type BedMeshMode, type SlicerResolution } from "../../lib/settings";

export type SettingsTab = "printer" | "slicer" | "appearance";

export interface PrinterDiscoveryCandidate {
  host: string;
  label: string;
  moonrakerUrl: string;
  controlUrl: string;
  moonrakerOk: boolean;
  controlOk: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  defaultTab?: SettingsTab;
  onClose: () => void;

  // Printer
  draft: PrinterDraft;
  draftResult: PrinterSettingsResult;
  candidates: PrinterDiscoveryCandidate[];
  discoveryMessage: string;
  isBusy: boolean;
  activeLabel: string | null;
  savedHost: string;
  printerOnline: boolean | null;
  onDraftChange: (patch: Partial<PrinterDraft>) => void;
  onSearch: () => void;
  onTest: () => void;
  onUseCandidate: (candidate: PrinterDiscoveryCandidate) => void;
  onSavePrinter: () => void;

  // Slicer
  slicerResolution?: SlicerResolution;
  customPath: string;
  onCustomPathChange: (path: string) => void;
  onInstallOrca: () => void;
  onSetCustom: () => void;
  onTestSlicer: () => void;
  bedMeshMode: BedMeshMode;
  onBedMeshModeChange: (mode: BedMeshMode) => void;

  // Appearance
  accent: AccentId;
  onAccentChange: (id: AccentId) => void;

  appVersion?: string;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Unified settings dialog — Printer connection, Slicer setup, Appearance. */
export function SettingsModal(props: SettingsModalProps) {
  const { open, defaultTab = "printer", onClose, isBusy } = props;
  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus();
    };
  }, [open, isBusy, onClose]);

  if (!open) return null;

  const statusLabel = (() => {
    if (!props.draftResult.configured && !props.savedHost) return "Printer not configured";
    if (props.printerOnline === false) return `${props.savedHost} · offline`;
    if (props.printerOnline === true) return `${props.savedHost} · connected`;
    return props.savedHost || props.draftResult.host || "Printer";
  })();
  const statusTone =
    props.printerOnline === false ? "warn" : props.printerOnline === true ? "live" : "";

  return createPortal(
    <div className="ui-modal-scrim" onMouseDown={() => !isBusy && onClose()}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-modal__head">
          <div className="settings-modal__head-text">
            <span className="panel-eyebrow">SETTINGS</span>
            <h2 id={titleId} className="settings-modal__title">
              System
            </h2>
          </div>
          <button
            type="button"
            className="btn--icon"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>

        <div className="settings-modal__tabs-row">
          <div className="mf-tabs" role="tablist">
            <TabButton id="printer" current={tab} onSelect={setTab}>
              Printer
            </TabButton>
            <TabButton id="slicer" current={tab} onSelect={setTab}>
              Slicer
            </TabButton>
            <TabButton id="appearance" current={tab} onSelect={setTab}>
              Appearance
            </TabButton>
          </div>
        </div>

        <div className="settings-modal__body">
          {tab === "printer" && <PrinterTab {...props} />}
          {tab === "slicer" && <SlicerTab {...props} />}
          {tab === "appearance" && <AppearanceTab {...props} />}
        </div>

        <footer className="settings-modal__foot">
          <span
            className={`panel-status-pill${statusTone ? ` ${statusTone}` : ""} settings-modal__foot-status`}
          >
            <span className="dot" />
            {statusLabel}
          </span>
          <span className="settings-modal__foot-spacer" />
          <button type="button" className="t-btn" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          {tab === "printer" && (
            <button
              type="button"
              className="t-btn fill"
              onClick={props.onSavePrinter}
              disabled={isBusy || !props.draftResult.configured}
            >
              Save
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

function TabButton({
  id,
  current,
  onSelect,
  children
}: {
  id: SettingsTab;
  current: SettingsTab;
  onSelect: (id: SettingsTab) => void;
  children: ReactNode;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`mf-tab${active ? " on" : ""}`}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}

function PrinterTab(props: SettingsModalProps) {
  const {
    draft,
    draftResult,
    candidates,
    discoveryMessage,
    isBusy,
    activeLabel,
    onDraftChange,
    onSearch,
    onTest,
    onUseCandidate
  } = props;

  const canSearch =
    !isBusy && !draftResult.moonrakerPortError && !draftResult.controlPortError;
  const canTest = draftResult.configured && !isBusy;

  return (
    <>
      <section className="surface settings-section" aria-labelledby="set-conn">
        <div className="settings-section__head">
          <span id="set-conn" className="h-eyebrow">
            Connection
          </span>
        </div>

        <Field label="Host / IP" error={draftResult.hostError}>
          <input
            value={draft.hostInput}
            placeholder="192.168.178.61"
            onChange={(event) => onDraftChange({ hostInput: event.target.value })}
          />
        </Field>

        <div className="settings-grid-2">
          <Field label="Moonraker port" error={draftResult.moonrakerPortError}>
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.moonrakerPort}
              onChange={(event) => onDraftChange({ moonrakerPort: event.target.value })}
            />
          </Field>
          <Field label="Control port" error={draftResult.controlPortError}>
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.controlPort}
              onChange={(event) => onDraftChange({ controlPort: event.target.value })}
            />
          </Field>
        </div>

        <div className="settings-row">
          <button
            type="button"
            className="t-btn"
            onClick={onSearch}
            disabled={!canSearch}
          >
            {activeLabel === CliLabel.discoverPrinters ? (
              <Spinner size={13} />
            ) : (
              <Search size={14} />
            )}
            Search
          </button>
          <button
            type="button"
            className="t-btn"
            onClick={onTest}
            disabled={!canTest}
          >
            {activeLabel === CliLabel.testConnection ? (
              <Spinner size={13} />
            ) : (
              <Wifi size={14} />
            )}
            Test
          </button>
        </div>

        <div className="settings-preview">
          <span>Moonraker</span>
          <b>{draftResult.moonrakerUrl || "Not configured"}</b>
          <span>Control UI</span>
          <b>{draftResult.controlUrl || "Not configured"}</b>
        </div>
      </section>

      <section className="surface settings-section" aria-labelledby="set-disc">
        <div className="settings-section__head">
          <span id="set-disc" className="h-eyebrow">
            Discovered
          </span>
          <span className="settings-section__count">{candidates.length}</span>
        </div>

        {candidates.length > 0 ? (
          <div className="settings-row" style={{ flexDirection: "column" }}>
            {candidates.map((candidate) => (
              <div className="settings-candidate" key={candidate.host}>
                <div>
                  <div className="settings-candidate__name">
                    {candidate.label || candidate.host}
                  </div>
                  <div className="settings-candidate__meta">
                    {candidate.host} · Moonraker {candidate.moonrakerOk ? "OK" : "FAIL"} · UI{" "}
                    {candidate.controlOk ? "OK" : "Unchecked"}
                  </div>
                </div>
                <button
                  type="button"
                  className="t-btn sm"
                  onClick={() => onUseCandidate(candidate)}
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-candidates-empty">
            {discoveryMessage || "No search run yet"}
          </div>
        )}
      </section>
    </>
  );
}

function SlicerTab(props: SettingsModalProps) {
  const {
    slicerResolution,
    customPath,
    isBusy,
    activeLabel,
    onCustomPathChange,
    onInstallOrca,
    onSetCustom,
    onTestSlicer
  } = props;

  const state = slicerResolution?.state ?? "unknown";
  const headline =
    state === "installed"
      ? `OrcaSlicer ${slicerResolution?.version ?? ""}`.trim()
      : state === "custom"
        ? "Custom slicer"
        : "No slicer configured";

  return (
    <>
      <section className="surface settings-section" aria-labelledby="set-slicer-status">
        <div className="settings-section__head">
          <span id="set-slicer-status" className="h-eyebrow">
            Resolved slicer
          </span>
        </div>

        <div className="settings-kv">
          <span className="h-eyebrow">State</span>
          <span className="settings-kv__value">{headline}</span>
          <span className="h-eyebrow">Path</span>
          <span className="settings-kv__value settings-kv__value--muted">
            {slicerResolution?.path ?? "Install OrcaSlicer or point to your own binary."}
          </span>
        </div>

        <div className="settings-row">
          <button
            type="button"
            className="t-btn"
            onClick={onInstallOrca}
            disabled={isBusy}
          >
            {activeLabel === CliLabel.installOrca ? (
              <Spinner size={13} />
            ) : (
              <Download size={14} />
            )}
            Install Orca
          </button>
          <button
            type="button"
            className="t-btn"
            onClick={onTestSlicer}
            disabled={isBusy}
          >
            {activeLabel === CliLabel.resolveSlicer ? (
              <Spinner size={13} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Test
          </button>
        </div>
      </section>

      <section className="surface settings-section" aria-labelledby="set-slicer-custom">
        <div className="settings-section__head">
          <span id="set-slicer-custom" className="h-eyebrow">
            Custom binary
          </span>
        </div>

        <Field label="Custom slicer path">
          <input
            value={customPath}
            placeholder="H:\\Tools\\OrcaSlicer\\OrcaSlicer.exe"
            aria-label="Custom slicer path"
            onChange={(event) => onCustomPathChange(event.target.value)}
          />
        </Field>

        <button
          type="button"
          className="t-btn fill"
          onClick={onSetCustom}
          disabled={isBusy || !customPath}
        >
          {activeLabel === CliLabel.setCustomSlicer ? <Spinner size={13} /> : null}
          Use custom slicer
        </button>
      </section>

      <BedMeshSection
        bedMeshMode={props.bedMeshMode}
        onBedMeshModeChange={props.onBedMeshModeChange}
      />
    </>
  );
}

const BED_MESH_LABELS: Record<BedMeshMode, string> = {
  always: "Always calibrate",
  load: "Reuse saved mesh",
  skip: "Skip mesh"
};

const BED_MESH_DESCRIPTIONS: Record<BedMeshMode, string> = {
  always:
    "Run BED_MESH_CALIBRATE ADAPTIVE=1 before every print. Safest default; adds a probing pause to each start.",
  load:
    "Reuse the saved 'default' mesh if it exists, otherwise calibrate fresh. Run BED_MESH_PROFILE SAVE=default + SAVE_CONFIG once on the printer first.",
  skip:
    "Clear any active mesh and start without Z compensation. Fastest start — only use on a known-flat bed."
};

function BedMeshSection({
  bedMeshMode,
  onBedMeshModeChange
}: {
  bedMeshMode: BedMeshMode;
  onBedMeshModeChange: (mode: BedMeshMode) => void;
}) {
  return (
    <section className="surface settings-section" aria-labelledby="set-bed-mesh">
      <div className="settings-section__head">
        <span id="set-bed-mesh" className="h-eyebrow">
          Bed mesh before print
        </span>
      </div>
      <div className="settings-row" role="radiogroup" aria-labelledby="set-bed-mesh">
        {BED_MESH_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={bedMeshMode === mode}
            className={`t-btn sm${bedMeshMode === mode ? " on" : ""}`}
            onClick={() => onBedMeshModeChange(mode)}
          >
            {BED_MESH_LABELS[mode]}
          </button>
        ))}
      </div>
      <p className="settings-about" style={{ fontSize: 12 }}>
        {BED_MESH_DESCRIPTIONS[bedMeshMode]}
      </p>
    </section>
  );
}

function AppearanceTab(props: SettingsModalProps) {
  const { accent, onAccentChange, appVersion } = props;

  return (
    <>
      <section className="surface settings-section" aria-labelledby="set-accent">
        <div className="settings-section__head">
          <span id="set-accent" className="h-eyebrow">
            Accent color
          </span>
        </div>

        <div className="accent-swatch-grid">
          {ACCENT_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`accent-swatch${accent === preset.id ? " on" : ""}`}
              onClick={() => onAccentChange(preset.id)}
              aria-pressed={accent === preset.id}
              aria-label={preset.label}
              title={preset.label}
            >
              <span
                className="accent-swatch-dot"
                style={{ background: preset.hex }}
              />
              <span className="accent-swatch-label">{preset.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface settings-section" aria-labelledby="set-about">
        <div className="settings-section__head">
          <span id="set-about" className="h-eyebrow">
            About
          </span>
        </div>
        <div className="settings-about">
          <strong>Mycoforge Slicer{appVersion ? ` v${appVersion}` : ""}</strong>
          <br />
          Tauri desktop shell sharing the Mycoforge printer design language.
        </div>
      </section>
    </>
  );
}
