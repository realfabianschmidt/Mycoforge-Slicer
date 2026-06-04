import { Box, Crosshair, Redo2, RotateCw, Undo2, Upload } from "lucide-react";
import { Button } from "../../components/ui/Button";
import type { ModelTransform } from "../../lib/api";
import { formatBedVolume, type BedVolume } from "../../lib/bed-volume";
import { basename, dirname, fileExtension, formatRelativeTime } from "../../lib/format";
import {
  clampBed,
  clampScale,
  clampZ,
  DEFAULT_TRANSFORM,
  formatTransformInput,
  isStlPath,
  normalizeDegrees,
  normalizeTransform,
  type PlacementTool
} from "../../lib/model";
import type { RecentFile } from "../../hooks/use-recents";
import { boundsSummary, type ModelBounds } from "../canvas/scene";

interface SourcePanelProps {
  inputPath: string;
  recents: RecentFile[];
  transform: ModelTransform;
  placementTool: PlacementTool;
  modelBounds: ModelBounds | null;
  volume: BedVolume;
  canUndoTransform: boolean;
  canRedoTransform: boolean;
  onBrowse: () => void;
  onSelectRecent: (path: string) => void;
  onPlacementToolChange: (tool: PlacementTool) => void;
  onTransformCommit: (transform: ModelTransform, previous?: ModelTransform) => void;
  onUndoTransform: () => void;
  onRedoTransform: () => void;
}

/** Step 01: choose the model and place it on the build plate. */
export function SourcePanel({
  inputPath,
  recents,
  transform,
  placementTool,
  modelBounds,
  volume,
  canUndoTransform,
  canRedoTransform,
  onBrowse,
  onSelectRecent,
  onPlacementToolChange,
  onTransformCommit,
  onUndoTransform,
  onRedoTransform
}: SourcePanelProps) {
  const extension = fileExtension(inputPath).replace(".", "").toUpperCase();
  const commit = (next: ModelTransform) =>
    onTransformCommit(normalizeTransform(next, volume), transform);

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">Source</div>
        <div className="panel-tag">01 / 04</div>
      </div>

      {inputPath ? (
        <div className="file-card">
          <span className="file-card-icon">
            <Box size={20} />
          </span>
          <span className="file-card-name">{basename(inputPath)}</span>
          <span className="file-card-meta">{extension || "Model"} file</span>
        </div>
      ) : (
        <button type="button" className="file-card file-card--button" onClick={onBrowse}>
          <span className="file-card-icon file-card-icon--muted">
            <Upload size={20} />
          </span>
          <span className="file-card-name" style={{ fontWeight: 400 }}>
            Drop STL, 3MF or G-code
          </span>
          <span className="file-card-meta">or browse for a file</span>
        </button>
      )}

      {recents.length > 0 && (
        <div className="field-row">
          <label>Recent</label>
          <div className="recent">
            {recents.map((recent) => (
              <button
                key={recent.path}
                type="button"
                className="recent-row"
                onClick={() => onSelectRecent(recent.path)}
              >
                <span className="recent-name">{recent.name}</span>
                <span className="recent-time">{formatRelativeTime(recent.ts)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isStlPath(inputPath) && (
        <>
          <div className="divider" />
          <div className="field-row">
            <label>Placement</label>
            <div className="placement-tools" aria-label="Placement tool">
              {(["move", "rotate", "scale"] as PlacementTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={`seg-item seg-item--center ${placementTool === tool ? "on" : ""}`}
                  onClick={() => onPlacementToolChange(tool)}
                >
                  {tool}
                </button>
              ))}
            </div>

            <div className="placement-controls">
              <Button
                variant="secondary"
                size="sm"
                icon={<Crosshair size={13} />}
                onClick={() => commit({ ...transform, translateXMm: 0, translateYMm: 0 })}
              >
                Center
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCw size={13} />}
                onClick={() =>
                  commit({
                    ...transform,
                    rotateZDeg: normalizeDegrees(transform.rotateZDeg + 90)
                  })
                }
              >
                90 deg
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  commit({
                    ...transform,
                    translateZMm: 0,
                    rotateXDeg: 0,
                    rotateYDeg: 0
                  })
                }
              >
                Lay flat
              </Button>
            </div>

            <div className="placement-controls">
              <Button
                variant="ghost"
                size="sm"
                icon={<Undo2 size={13} />}
                disabled={!canUndoTransform}
                onClick={onUndoTransform}
              >
                Undo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Redo2 size={13} />}
                disabled={!canRedoTransform}
                onClick={onRedoTransform}
              >
                Redo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => commit(DEFAULT_TRANSFORM)}>
                Reset
              </Button>
            </div>

            <div className="placement-grid">
              <label>
                <span>X mm</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.translateXMm)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      translateXMm: clampBed(Number(event.target.value) || 0, volume.sizeXMm)
                    })
                  }
                />
              </label>
              <label>
                <span>Y mm</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.translateYMm)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      translateYMm: clampBed(Number(event.target.value) || 0, volume.sizeYMm)
                    })
                  }
                />
              </label>
              <label>
                <span>Z mm</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.translateZMm)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      translateZMm: clampZ(Number(event.target.value) || 0, volume.heightZMm)
                    })
                  }
                />
              </label>
              <label>
                <span>Rot X</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.rotateXDeg)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      rotateXDeg: normalizeDegrees(Number(event.target.value) || 0)
                    })
                  }
                />
              </label>
              <label>
                <span>Rot Y</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.rotateYDeg)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      rotateYDeg: normalizeDegrees(Number(event.target.value) || 0)
                    })
                  }
                />
              </label>
              <label>
                <span>Rot Z</span>
                <input
                  type="number"
                  value={formatTransformInput(transform.rotateZDeg)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      rotateZDeg: normalizeDegrees(Number(event.target.value) || 0)
                    })
                  }
                />
              </label>
              <label>
                <span>Scale</span>
                <input
                  type="number"
                  step="0.05"
                  value={formatTransformInput(transform.scale)}
                  onChange={(event) =>
                    commit({
                      ...transform,
                      scale: clampScale(Number(event.target.value) || 1)
                    })
                  }
                />
              </label>
            </div>

            {modelBounds && (
              <div className={`placement-status ${modelBounds.valid ? "" : "placement-status--warn"}`}>
                {modelBounds.valid
                  ? `Object bounds: ${boundsSummary(modelBounds)}`
                  : `Object is outside the printable ${formatBedVolume(volume)} volume. Slicing is blocked.`}
              </div>
            )}
          </div>
        </>
      )}

      {inputPath && (
        <div className="meta-row push-bottom">
          <span>File path</span>
          <b
            style={{
              maxWidth: "60%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {dirname(inputPath) || inputPath}
          </b>
        </div>
      )}
    </>
  );
}
