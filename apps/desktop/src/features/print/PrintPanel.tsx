import { FileText, Settings } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CliLabel } from "../../lib/cli-labels";
import { basename } from "../../lib/format";

interface PrintPanelProps {
  configured: boolean;
  host: string;
  normalizedMoonrakerUrl: string;
  moonrakerError: string;
  normalizedControlUrl: string;
  outputPath: string;
  /** null = not tested yet. */
  printerOnline: boolean | null;
  isBusy: boolean;
  activeLabel: string | null;
  onOpenSettings: () => void;
  onTestConnection: () => void;
  readiness: PrinterReadiness | null;
}

interface PrinterReadiness {
  ok: boolean;
  ready: boolean;
  reasons: string[];
  klippy_state?: string | null;
  print_state?: string | null;
  is_paused?: boolean | null;
  virtual_sd_active?: boolean | null;
  piston_homed?: number | null;
  reservoir_ready?: number | null;
  material_primed?: number | null;
  reservoir_empty?: number | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function statusOf(online: boolean | null): { dot: string; label: string } {
  if (online === true) return { dot: "dot", label: "Online" };
  if (online === false) return { dot: "dot dot--neg", label: "Offline" };
  return { dot: "dot dot--warn", label: "Not tested" };
}

function readinessStatus(
  readiness: PrinterReadiness | null,
  online: boolean | null
): { dot: string; label: string } {
  if (readiness?.ready) return { dot: "dot", label: "Ready" };
  if (readiness && !readiness.ready) return { dot: "dot dot--neg", label: "Not ready" };
  return statusOf(online);
}

function flagLabel(value: number | boolean | null | undefined, readyLabel: string, waitLabel: string) {
  if (value === 1 || value === true) return readyLabel;
  if (value === 0 || value === false) return waitLabel;
  return "Unknown";
}

/** Step 04: printer connection and the G-code that will be sent. */
export function PrintPanel({
  configured,
  host,
  normalizedMoonrakerUrl,
  moonrakerError,
  normalizedControlUrl,
  outputPath,
  printerOnline,
  isBusy,
  activeLabel,
  onOpenSettings,
  onTestConnection,
  readiness
}: PrintPanelProps) {
  const status = readinessStatus(readiness, printerOnline);
  const firstReason = readiness?.reasons[0];

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">Print</div>
        <div className="panel-tag">04 / 04</div>
      </div>

      <div className="printer">
        <div className="printer-row">
          <div>
            <div className="printer-name">{configured ? host : "Printer not configured"}</div>
            <div className="printer-url">
              {configured ? `${hostOf(normalizedMoonrakerUrl)} · Moonraker` : moonrakerError}
            </div>
          </div>
          <div className="printer-bar">
            <span className={configured ? status.dot : "dot dot--warn"} />
            {configured ? status.label : "Setup needed"}
          </div>
        </div>

        <div className="printer-settings-preview printer-settings-preview--panel">
          <div>
            <span>Moonraker</span>
            <b>{normalizedMoonrakerUrl || "Not configured"}</b>
          </div>
          <div>
            <span>Control UI</span>
            <b>{normalizedControlUrl || "Not configured"}</b>
          </div>
        </div>

        <div className="divider" />
        <div className="slicer-setup-row">
          <Button
            variant="secondary"
            size="sm"
            icon={<Settings size={14} />}
            onClick={onOpenSettings}
          >
            Settings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={activeLabel === CliLabel.printReadiness}
            disabled={isBusy || !configured || Boolean(moonrakerError)}
            onClick={onTestConnection}
          >
            Check
          </Button>
        </div>
      </div>

      <div className="printer-settings-preview printer-settings-preview--panel">
        <div>
          <span>Klipper</span>
          <b>{readiness?.klippy_state ?? "Not checked"}</b>
        </div>
        <div>
          <span>Print state</span>
          <b>{readiness?.print_state ?? "Not checked"}</b>
        </div>
        <div>
          <span>Piston</span>
          <b>{flagLabel(readiness?.piston_homed, "Homed", "Needs home")}</b>
        </div>
        <div>
          <span>Reservoir</span>
          <b>
            {readiness?.reservoir_empty === 1
              ? "Empty"
              : flagLabel(readiness?.reservoir_ready, "Ready", "Not ready")}
          </b>
        </div>
        <div>
          <span>Material</span>
          <b>{flagLabel(readiness?.material_primed, "Primed", "Not primed")}</b>
        </div>
        {firstReason ? (
          <div>
            <span>Blocker</span>
            <b>{firstReason}</b>
          </div>
        ) : null}
      </div>

      <div className="field-row">
        <label>Destination</label>
        {outputPath ? (
          <div className="file-card">
            <span className="file-card-icon file-card-icon--pos">
              <FileText size={20} />
            </span>
            <span className="file-card-name">{basename(outputPath)}</span>
            <span className="file-card-meta">Processed G-code</span>
          </div>
        ) : (
          <div className="file-card">
            <span className="file-card-icon file-card-icon--muted">
              <FileText size={20} />
            </span>
            <span className="file-card-name" style={{ fontWeight: 400 }}>
              No G-code yet
            </span>
            <span className="file-card-meta">Slice a model first</span>
          </div>
        )}
      </div>
    </>
  );
}
