import type { GCodeStats } from "../../lib/gcode-analysis";

/** Post-slice metric grid built from analyzed G-code. */
export function StatGrid({ stats }: { stats: GCodeStats }) {
  return (
    <div className="stats">
      <div className="stat stat--accent">
        <div className="stat-label">Layers</div>
        <div className="stat-value">{stats.layerCount}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Extrusion</div>
        <div className="stat-value">{stats.extrusionMoves}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Travel</div>
        <div className="stat-value">{stats.travelMoves}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Retract</div>
        <div className="stat-value">{stats.retracts}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Prime</div>
        <div className="stat-value">{stats.primes}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Feedrate</div>
        <div className="stat-value">
          {stats.minFeedrate ?? "—"}
          <u> / </u>
          {stats.maxFeedrate ?? "—"}
        </div>
      </div>
    </div>
  );
}
