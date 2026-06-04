import { useCallback, useState } from "react";
import { Box } from "lucide-react";
import type { ModelTransform } from "../../lib/api";
import type { BedVolume } from "../../lib/bed-volume";
import { basename } from "../../lib/format";
import { isStlPath } from "../../lib/model";
import { Dropzone } from "./Dropzone";
import { GCodeView } from "./GCodeView";
import { LayerScrubber } from "./LayerScrubber";
import { ModelLayoutView } from "./ModelLayoutView";
import { boundsSummary, type ModelBounds } from "./scene";
import { SlicingOverlay } from "./SlicingOverlay";
import type { PlacementTool } from "../../lib/model";

interface SlicerCanvasProps {
  inputPath: string;
  gcode: string;
  lineWidthMm: number;
  layerHeightMm: number;
  isSlicing: boolean;
  slicingDetail?: string;
  transform: ModelTransform;
  placementTool: PlacementTool;
  modelBounds: ModelBounds | null;
  volume: BedVolume;
  onTransformPreview: (transform: ModelTransform) => void;
  onTransformCommit: (transform: ModelTransform, previous?: ModelTransform) => void;
  onBoundsChange: (bounds: ModelBounds | null) => void;
  onBrowse: () => void;
}

/** Dominant centre stage — morphs through dropzone / model / G-code / slicing. */
export function SlicerCanvas({
  inputPath,
  gcode,
  lineWidthMm,
  layerHeightMm,
  isSlicing,
  slicingDetail,
  transform,
  placementTool,
  modelBounds,
  volume,
  onTransformPreview,
  onTransformCommit,
  onBoundsChange,
  onBrowse
}: SlicerCanvasProps) {
  const [layer, setLayer] = useState(1);
  const [layerCount, setLayerCount] = useState(1);

  const handleReady = useCallback((count: number) => {
    setLayerCount(count);
    setLayer(count);
  }, []);

  const hasFile = Boolean(inputPath);
  const sliced = Boolean(gcode);
  const showModel = hasFile && !sliced && isStlPath(inputPath);
  const showUnsupported = hasFile && !sliced && !isStlPath(inputPath);

  return (
    <main className="canvas">
      <div className="canvas-grid" />

      {!hasFile && <Dropzone onBrowse={onBrowse} />}
      {showModel && (
        <ModelLayoutView
          modelPath={inputPath}
          transform={transform}
          tool={placementTool}
          volume={volume}
          onTransformPreview={onTransformPreview}
          onTransformCommit={onTransformCommit}
          onBoundsChange={onBoundsChange}
        />
      )}
      {showUnsupported && (
        <div className="canvas-note">3MF model loaded — continue through the steps to slice it.</div>
      )}
      {sliced && (
        <GCodeView
          gcode={gcode}
          lineWidthMm={lineWidthMm}
          layer={layer}
          volume={volume}
          onReady={handleReady}
        />
      )}

      {hasFile && (
        <div className="canvas-hud canvas-hud--tl">
          <div className="hud-tag">
            <Box size={14} />
            <b>{basename(inputPath)}</b>
          </div>
          {sliced && (
            <div className="hud-tag hud-tag--accent">
              <b>{layerCount} layers</b>
            </div>
          )}
          {showModel && modelBounds && (
            <div className={`hud-tag ${modelBounds.valid ? "" : "hud-tag--warn"}`}>
              <b>{modelBounds.valid ? boundsSummary(modelBounds) : "Out of bed"}</b>
            </div>
          )}
        </div>
      )}

      {sliced && (
        <div className="canvas-hud canvas-hud--bl">
          <div className="hud-legend">
            <span className="hud-legend-item">
              <span className="hud-legend-swatch" />
              Extrusion
            </span>
            <span className="hud-legend-item">
              <span className="hud-legend-swatch hud-legend-swatch--travel" />
              Travel
            </span>
            <span className="hud-legend-item">
              <span className="hud-legend-dot" />
              Retract
            </span>
            <span className="hud-legend-item">
              <span className="hud-legend-dot hud-legend-dot--prime" />
              Prime
            </span>
          </div>
        </div>
      )}

      {sliced && !isSlicing && (
        <LayerScrubber
          layer={layer}
          layerCount={layerCount}
          layerHeightMm={layerHeightMm}
          onChange={setLayer}
        />
      )}

      {isSlicing && <SlicingOverlay detail={slicingDetail} />}
    </main>
  );
}
