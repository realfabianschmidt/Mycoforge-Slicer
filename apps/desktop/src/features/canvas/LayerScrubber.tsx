interface LayerScrubberProps {
  layer: number;
  layerCount: number;
  layerHeightMm: number;
  onChange: (layer: number) => void;
}

/** Glass layer scrubber pinned to the bottom of the canvas. */
export function LayerScrubber({ layer, layerCount, layerHeightMm, onChange }: LayerScrubberProps) {
  const max = Math.max(layerCount, 1);
  const pct = max > 1 ? ((layer - 1) / (max - 1)) * 100 : 0;
  const z = (layer * layerHeightMm).toFixed(1);

  return (
    <div className="scrubber">
      <div className="scrubber-label">
        Layer
        <b>
          {String(layer).padStart(2, "0")} / {max}
        </b>
      </div>
      <div className="scrubber-track">
        <div className="scrubber-rail" />
        <div className="scrubber-fill" style={{ width: `${pct}%` }} />
        <div className="scrubber-thumb" style={{ left: `${pct}%` }} />
        <input
          type="range"
          min={1}
          max={max}
          value={layer}
          aria-label="Preview layer"
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="scrubber-z">
        Z <b>{z} mm</b>
      </div>
    </div>
  );
}
