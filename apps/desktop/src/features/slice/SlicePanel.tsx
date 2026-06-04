import { Layers } from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import type { GCodeStats } from "../../lib/gcode-analysis";
import { LogStream } from "./LogStream";
import { SignalList, type SignalRow } from "./SignalList";
import { StatGrid } from "./StatGrid";

interface SlicePanelProps {
  isBusy: boolean;
  gcode: string;
  stats: GCodeStats | null;
  logs: string[];
  invalidationReason?: string;
}

function eventRows(stats: GCodeStats): SignalRow[] {
  return stats.events.slice(0, 8).map((event) => ({
    id: `${event.type}-${event.line}`,
    lead: `L${event.line}`,
    text: event.type,
    trailing: `Z ${event.z}`
  }));
}

function warningRows(stats: GCodeStats): SignalRow[] {
  return stats.warnings.slice(0, 6).map((warning) => ({
    id: `${warning.line}-${warning.message}`,
    lead: `L${warning.line}`,
    text: warning.message
  }));
}

/** Step 03 — slicing progress, then the post-slice report. */
export function SlicePanel({
  isBusy,
  gcode,
  stats,
  logs,
  invalidationReason = ""
}: SlicePanelProps) {
  const title = isBusy
    ? "Slicing..."
    : gcode
      ? "Slice complete"
      : invalidationReason
        ? "Re-slice required"
        : "Slice";

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">{title}</div>
        <div className="panel-tag">03 / 04</div>
      </div>

      {isBusy && (
        <>
          <div className="row">
            <Spinner size={18} />
            <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--size-small)" }}>
              OrcaSlicer · paste profile
            </span>
          </div>
          <LogStream logs={logs} />
        </>
      )}

      {!isBusy && gcode && stats && (
        <>
          <StatGrid stats={stats} />
          <SignalList
            title="Events"
            rows={eventRows(stats)}
            emptyLabel="No retract or prime events"
          />
          <SignalList
            title="Warnings"
            tone="warn"
            rows={warningRows(stats)}
            emptyLabel="No warnings"
          />
        </>
      )}

      {!isBusy && !gcode && (
        <div className="panel-empty">
          <div className="panel-empty-icon">
            <Layers size={22} />
          </div>
          <div className="panel-empty-title">
            {invalidationReason ? "Slice is out of date" : "Ready to slice"}
          </div>
          <div className="panel-empty-sub">
            {invalidationReason || "Start with the action below"}
          </div>
        </div>
      )}
    </>
  );
}
