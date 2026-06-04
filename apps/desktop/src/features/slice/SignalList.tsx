export interface SignalRow {
  id: string;
  /** Leading mono cell, e.g. a line reference. */
  lead: string;
  text: string;
  /** Optional trailing detail. */
  trailing?: string;
}

interface SignalListProps {
  title: string;
  tone?: "neutral" | "warn";
  rows: SignalRow[];
  emptyLabel: string;
}

/** Compact, capped events / warnings list. */
export function SignalList({ title, tone = "neutral", rows, emptyLabel }: SignalListProps) {
  return (
    <div className="list">
      <div className="list-head">
        <div className="list-head-title">
          <span className={tone === "warn" ? "dot dot--warn" : "dot"} />
          {title}
        </div>
        <div className="list-count">{rows.length}</div>
      </div>
      <div className="list-body">
        {rows.length === 0 && <div className="list-empty">{emptyLabel}</div>}
        {rows.map((row) => (
          <div key={row.id} className={tone === "warn" ? "list-row warn" : "list-row"}>
            <b>{row.lead}</b>
            <span>{row.text}</span>
            {row.trailing && <em>{row.trailing}</em>}
          </div>
        ))}
      </div>
    </div>
  );
}
